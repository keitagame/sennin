# Sen2ch(専ブラ)

Node.js / Electron 製の 2ch/5ch互換掲示板ビューア(専用ブラウザ)です。
**書き込み機能はありません(閲覧専用)。** Open2ch・5ch・その他の2ch互換(`subject.txt` / `dat` 形式)掲示板に対応します。
同じコードベースで **Discordアクティビティ** としても起動できます。

## 主な機能

- BBSMENU(板一覧ページ)の登録・カテゴリツリー表示
- 板の直接URL登録
- スレッド一覧(`subject.txt`)取得・勢い順/新着順/レス数順ソート
- スレ本文(`dat`)表示、差分取得(Rangeリクエストによる追加レスのみ取得)
- `>>アンカー` クリックジャンプ・ホバープレビュー
- 本文中のURL自動リンク化・画像URLのサムネイル表示
- お気に入りスレッド・閲覧履歴
- NGワード / NG名前 / NG ID フィルタ
- ダーク(墨)/ライト(紙)テーマ
- 自動更新(ポーリング間隔を設定可能)
- Electronデスクトップアプリ / ブラウザ / Discordアクティビティの3モードで同一UIを共有

**書き込み(レス投稿・スレ立て)機能は意図的に実装していません。**

## セットアップ

```bash
npm install
```

## 使い方 ① Electronデスクトップアプリとして起動

```bash
npm start
```

板・お気に入り・履歴・設定などのデータは `userData/data/sen2ch-data.json` に保存されます
(通信は全てElectronのメインプロセス経由で行われ、レンダラーはNode/ファイルシステムに直接アクセスしません)。

## 使い方 ② ブラウザ(ローカルWeb)として起動

```bash
npm run server
# http://localhost:3210 にアクセス
```

データは `data/guest/sen2ch-data.json` に保存されます。

## 使い方 ③ Discordアクティビティとして起動

Discord上で動かすには、上記サーバーをインターネットからアクセス可能な場所にホストし、
Discord Developer Portal でアクティビティ設定を行う必要があります。

1. https://discord.com/developers/applications でアプリケーションを新規作成し、
   **Client ID** を控える。
2. 「OAuth2」→「General」で **Client Secret** を発行する。
3. プロジェクト直下に `.env` を作成し、`.env.example` を参考に以下を設定する。

   ```
   DISCORD_CLIENT_ID=xxxxxxxxxxxx
   DISCORD_CLIENT_SECRET=xxxxxxxxxxxx
   PORT=3210
   ```

4. サーバーを起動し、リバースプロキシ(nginx等)や `ngrok` / `cloudflared` などで
   HTTPSの公開URLを用意する。
5. Developer Portal の「Activities」→「Settings」で Activities を有効化。
6. 「URL Mappings」で ルートパス `/` に手順4のURL(ホスト名のみ)を割り当てる。
7. 「OAuth2」の Redirect URI にアクティビティ用のURLを追加する(Discordの指示に従う)。
8. Discordクライアントのボイスチャンネル等からアクティビティを起動すると、
   `public/discord-bootstrap.js` が自動的に Embedded App SDK を読み込み、
   OAuth2認可 → `/api/discord/token` でのトークン交換 → Rich Presence設定、
   を行います。

### Discord上での既知の制限

- Discordアクティビティはiframe内で厳格なCSP/プロキシ制御下に置かれるため、
  事前にURL Mappingsへ登録していない外部ドメインの画像は、サムネイルが
  表示されないことがあります(リンク自体はクリックで外部ブラウザから開けます)。
- スコープは `identify` のみ要求しており、書き込み系機能は一切ないため
  追加の権限は不要です。
- ユーザーごとのお気に入り/履歴/NG設定は、認証で得たDiscordユーザーIDを
  キーにサーバー側の `data/<uid>/` に保存されます(未認証時は `guest` 共有)。

## ディレクトリ構成

```
src/core/          通信・パース処理(Electron/サーバー共通)
  boardClient.js    subject.txt / dat / bbsmenu のHTTP取得・SJISデコード
  parser.js         フォーマット解析(通信を行わない純粋関数群)
  store.js          お気に入り/履歴/NG/設定のJSON永続化
  defaultBoards.js  初期登録するBBSMENUのプリセット
src/electron/       Electron本体(main/preload)
src/server/         Express製サーバー(Web/Discordアクティビティ用REST API)
public/             共有フロントエンド(素のHTML/CSS/JS、ビルド不要)
```

## 板・BBSMENUの登録について

初期状態では Open2ch と 5ch の BBSMENU が登録済みです(サイドバーの「板」タブから
カテゴリをクリックすると読み込みます)。個別の板を直接追加したい場合は
「+ 板を追加」から板のトップURL(例: `https://example.5ch.net/liveXXX/`)を入力してください。
2ch互換であれば Open2ch 以外の独自ホスト板にも対応します。

## 実装メモ

- `dat` の文字コードはShift_JIS想定でデコードしつつ、UTF-8で運用している
  互換掲示板にも対応できるよう簡易判定でフォールバックします。
- 「勢い」はレス数を経過時間で正規化した近似値であり、各専ブラの厳密な算出式とは
  多少異なる場合があります。
- 差分取得は `Range: bytes=<既知バイト数>-` を利用し、`416` 応答時は追加レス無しと
  判断します。

## ライセンス

MIT
