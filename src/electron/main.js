'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const boardClient = require('../core/boardClient');
const { createStore } = require('../core/store');
const { normalizeBoardUrl, boardIdFromUrl } = require('../core/parser');

let store;
let mainWindow;

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

  // 外部リンク(スレ内の画像URLなど)はOSの既定ブラウザで開く
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
