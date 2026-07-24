/**
 * Discordアクティビティとして起動された場合のみ、Embedded App SDKを読み込んで
 * 認証・Rich Presence連携を行う。通常のElectron/ブラウザ実行時は何もしない。
 *
 * 前提: Discord Developer Portal で
 *   - Activities > Settings を有効化
 *   - URL Mappings で ルート("/") をこのアプリのサーバーURLに割り当て
 *   - OAuth2 の Redirect URI 等は Discord のガイドに従う
 * している必要があります。詳細はREADME参照。
 */
(async function () {
  // Discordのiframe内(discordsays.com経由)かどうかを緩く判定する
  const insideDiscord =
    window.location.ancestorOrigins?.length > 0 &&
    /discordsays\.com$/i.test(window.location.hostname);

  if (!insideDiscord) return;

  let config;
  try {
    config = await fetch('/api/config').then((r) => r.json());
  } catch {
    return; // サーバーAPIが無い(=Electron単体等)ので何もしない
  }
  if (!config.discordEnabled) {
    console.warn('[Sen2ch] Discordアクティビティ用のCLIENT_ID/SECRETが未設定です (.env を確認してください)');
    return;
  }

  try {
    const { DiscordSDK } = await import('https://esm.sh/@discord/embedded-app-sdk');
    const discordSdk = new DiscordSDK(config.discordClientId);
    await discordSdk.ready();

    // 1. 認可コードを取得(identify スコープのみ。書き込み機能が無いため最小権限)
    const { code } = await discordSdk.commands.authorize({
      client_id: config.discordClientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });

    // 2. サーバー側でトークン交換(CLIENT_SECRETはクライアントに渡さない)
    const tokenRes = await fetch('/api/discord/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error('アクセストークンの取得に失敗しました');

    // 3. Discordクライアントへ認証情報を渡す
    const auth = await discordSdk.commands.authenticate({ access_token });
    window.SEN2CH_UID = auth?.user?.id || null;

    // Rich Presence: 現在閲覧中のスレッドを表示する
    window.sen2chSetDiscordActivity = function (details, stateText) {
      discordSdk.commands.setActivity({
        activity: {
          type: 0,
          details: `閲覧中: ${details}`.slice(0, 128),
          state: (stateText || '専ブラで掲示板を閲覧中').slice(0, 128),
        },
      }).catch(() => {});
    };

    console.info('[Sen2ch] Discordアクティビティとして起動しました。uid =', window.SEN2CH_UID);
  } catch (err) {
    console.error('[Sen2ch] Discord SDK 初期化に失敗しました', err);
  }
})();
