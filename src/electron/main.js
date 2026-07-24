'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc'); // ★追加

const boardClient = require('../core/boardClient');
const { createStore } = require('../core/store');
const { normalizeBoardUrl, boardIdFromUrl } = require('../core/parser');

let store;
let mainWindow;

// --- Discord RPC の設定ここから ---
// ※ 5ちゃんねるブラウザ向けに仮のIDを入れています（あなたのアプリ名に合わせて変更可能）
const clientId = '1530091585545703474'; 
DiscordRPC.register(clientId);
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
let rpcReady = false;
let appStartTime = new Date(); // アプリ起動時からの経過時間を出す用

rpc.on('ready', () => {
  rpcReady = true;
  console.log('Discord RPC connected!');
  // 起動時の初期ステータス
  updateActivity('板一覧を閲覧中', '');
});

// 安全にステータスを更新する関数
function updateActivity(details, state) {
  if (!rpcReady) return;
  
  rpc.setActivity({
    details: details,              // 1行目（例: 「ニュー速VIP」を閲覧中）
    state: state || undefined,     // 2行目（例: スレッド: 雑談スレ）※空文字なら非表示
    startTimestamp: appStartTime,  // 経過時間を表示
    largeImageKey: 'app_icon',     // Discord Developer Portalで登録した画像キー名
    largeImageText: 'sen2ch',      // 画像ホバー時のテキスト
    instance: false,
  }).catch(err => console.error('Discord RPC Update Error:', err));
}

// アプリ起動時にDiscordに接続
rpc.login({ clientId }).catch(err => {
  console.error('Discord RPC Login Failed (Discordが起動していない可能性があります):', err);
});
// --- Discord RPC の設定ここまで ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#15140f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'public', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  store = createStore(path.join(app.getPath('userData'), 'data'));
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc() {
  // ★追加: フロントエンド（画面）からDiscordステータスを書き換えるためのハンドラー
  ipcMain.on('sen2ch:updateDiscordActivity', (_e, { details, state }) => {
    updateActivity(details, state);
  });

  ipcMain.handle('sen2ch:getState', () => store.get());

  ipcMain.handle('sen2ch:fetchBbsMenu', async (_e, url) => {
    return boardClient.fetchBbsMenu(url);
  });

  ipcMain.handle('sen2ch:fetchSubject', async (_e, boardUrl) => {
    const threads = await boardClient.fetchSubject(boardUrl);
    return { boardId: boardIdFromUrl(boardUrl), threads };
  });

  ipcMain.handle('sen2ch:fetchDat', async (_e, { boardUrl, threadId, knownBytes }) => {
    return boardClient.fetchDat(boardUrl, threadId, { knownBytes });
  });

  ipcMain.handle('sen2ch:addBoard', (_e, { name, url }) => store.addBoard(name, normalizeBoardUrl(url)));
  ipcMain.handle('sen2ch:removeBoard', (_e, url) => store.removeBoard(url));
  ipcMain.handle('sen2ch:addBbsmenu', (_e, { name, url }) => store.addBbsmenu(name, url));
  ipcMain.handle('sen2ch:removeBbsmenu', (_e, url) => store.removeBbsmenu(url));

  ipcMain.handle('sen2ch:addFavorite', (_e, fav) => store.addFavorite(fav));
  ipcMain.handle('sen2ch:removeFavorite', (_e, { boardUrl, threadId }) =>
    store.removeFavorite(boardUrl, threadId)
  );

  ipcMain.handle('sen2ch:pushHistory', (_e, entry) => store.pushHistory(entry));
  ipcMain.handle('sen2ch:clearHistory', () => store.clearHistory());

  ipcMain.handle('sen2ch:setNg', (_e, list) => store.setNg(list));
  ipcMain.handle('sen2ch:setSettings', (_e, patch) => store.setSettings(patch));
}
