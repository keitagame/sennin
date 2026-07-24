'use strict';

/**
 * window.api を、実行環境(Electron / ブラウザ・Discordアクティビティ)によらず
 * 同一インターフェースで使えるようにするブリッジ。
 * Discordアクティビティ内ではユーザー識別のため window.SEN2CH_UID を利用する
 * (discord-bootstrap.js が認証後にセットする)。
 */
(function () {
  function uidParam() {
    const uid = window.SEN2CH_UID;
    return uid ? `uid=${encodeURIComponent(uid)}` : '';
  }
  function withUid(url) {
    const q = uidParam();
    if (!q) return url;
    return url + (url.includes('?') ? '&' : '?') + q;
  }
  async function http(method, url, body) {
    const res = await fetch(withUid(url), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify({ ...body, uid: window.SEN2CH_UID }) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  if (window.electronAPI) {
    window.api = window.electronAPI;
    window.api.mode = 'electron';
  } else {
    window.api = {
      getState: () => http('GET', '/api/state'),
      fetchBbsMenu: (url) => http('GET', `/api/bbsmenu?url=${encodeURIComponent(url)}`).then((r) => r.categories),
      fetchSubject: (boardUrl) => http('GET', `/api/subject?boardUrl=${encodeURIComponent(boardUrl)}`),
      fetchDat: (boardUrl, threadId, knownBytes) =>
        http(
          'GET',
          `/api/dat?boardUrl=${encodeURIComponent(boardUrl)}&threadId=${encodeURIComponent(threadId)}&knownBytes=${knownBytes || 0}`
        ),
      addBoard: (name, url) => http('POST', '/api/boards', { name, url }),
      removeBoard: (url) => http('DELETE', '/api/boards', { url }),
      addBbsmenu: (name, url) => http('POST', '/api/bbsmenus', { name, url }),
      removeBbsmenu: (url) => http('DELETE', '/api/bbsmenus', { url }),
      addFavorite: (fav) => http('POST', '/api/favorites', fav),
      removeFavorite: (boardUrl, threadId) => http('DELETE', '/api/favorites', { boardUrl, threadId }),
      pushHistory: (entry) => http('POST', '/api/history', entry),
      clearHistory: () => http('DELETE', '/api/history'),
      setNg: (list) => http('POST', '/api/ng', list),
      setSettings: (patch) => http('POST', '/api/settings', patch),
      isElectron: false,
    };
    window.api.mode = 'web';
  }
})();
