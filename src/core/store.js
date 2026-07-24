'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_BBSMENUS, DEFAULT_BOARDS } = require('./defaultBoards');

const DEFAULT_STATE = {
  bbsmenus: DEFAULT_BBSMENUS,
  boards: DEFAULT_BOARDS, // { name, url }
  favorites: [], // { boardUrl, boardName, threadId, title, addedAt }
  history: [], // { boardUrl, boardName, threadId, title, viewedAt }
  ngWords: [], // string[] (本文に含まれていたら非表示)
  ngNames: [], // string[] (名前欄が一致したら非表示)
  ngIds: [], // string[] (ID: が一致したら非表示)
  settings: {
    theme: 'dark', // 'dark' | 'light'
    fontScale: 1,
    autoUpdateSec: 0, // 0=自動更新オフ
  },
};

/**
 * シンプルなJSONファイルストア。
 * @param {string} dataDir 永続化ファイルを置くディレクトリ
 */
function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'sen2ch-data.json');

  let state = loadInitial();

  function loadInitial() {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_STATE), ...parsed };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function persist() {
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
  }

  function get() {
    return state;
  }

  function update(mutator) {
    mutator(state);
    persist();
    return state;
  }

  return {
    get,
    update,

    // --- boards ---
    addBoard(name, url) {
      return update((s) => {
        if (!s.boards.some((b) => b.url === url)) {
          s.boards.push({ name, url });
        }
      });
    },
    removeBoard(url) {
      return update((s) => {
        s.boards = s.boards.filter((b) => b.url !== url);
      });
    },
    addBbsmenu(name, url) {
      return update((s) => {
        if (!s.bbsmenus.some((m) => m.url === url)) {
          s.bbsmenus.push({ name, url });
        }
      });
    },
    removeBbsmenu(url) {
      return update((s) => {
        s.bbsmenus = s.bbsmenus.filter((m) => m.url !== url);
      });
    },

    // --- favorites ---
    addFavorite(fav) {
      return update((s) => {
        const key = fav.boardUrl + '::' + fav.threadId;
        if (!s.favorites.some((f) => f.boardUrl + '::' + f.threadId === key)) {
          s.favorites.unshift({ ...fav, addedAt: Date.now() });
        }
      });
    },
    removeFavorite(boardUrl, threadId) {
      return update((s) => {
        s.favorites = s.favorites.filter(
          (f) => !(f.boardUrl === boardUrl && f.threadId === threadId)
        );
      });
    },

    // --- history ---
    pushHistory(entry) {
      return update((s) => {
        s.history = s.history.filter(
          (h) => !(h.boardUrl === entry.boardUrl && h.threadId === entry.threadId)
        );
        s.history.unshift({ ...entry, viewedAt: Date.now() });
        s.history = s.history.slice(0, 200);
      });
    },
    clearHistory() {
      return update((s) => {
        s.history = [];
      });
    },

    // --- NG ---
    setNg(list) {
      return update((s) => {
        if (list.ngWords) s.ngWords = list.ngWords;
        if (list.ngNames) s.ngNames = list.ngNames;
        if (list.ngIds) s.ngIds = list.ngIds;
      });
    },

    // --- settings ---
    setSettings(patch) {
      return update((s) => {
        s.settings = { ...s.settings, ...patch };
      });
    },
  };
}

module.exports = { createStore, DEFAULT_STATE };
