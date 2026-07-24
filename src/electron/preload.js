'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getState: () => ipcRenderer.invoke('sen2ch:getState'),
  fetchBbsMenu: (url) => ipcRenderer.invoke('sen2ch:fetchBbsMenu', url),
  fetchSubject: (boardUrl) => ipcRenderer.invoke('sen2ch:fetchSubject', boardUrl),
  fetchDat: (boardUrl, threadId, knownBytes) =>
    ipcRenderer.invoke('sen2ch:fetchDat', { boardUrl, threadId, knownBytes }),

  addBoard: (name, url) => ipcRenderer.invoke('sen2ch:addBoard', { name, url }),
  removeBoard: (url) => ipcRenderer.invoke('sen2ch:removeBoard', url),
  addBbsmenu: (name, url) => ipcRenderer.invoke('sen2ch:addBbsmenu', { name, url }),
  removeBbsmenu: (url) => ipcRenderer.invoke('sen2ch:removeBbsmenu', url),

  addFavorite: (fav) => ipcRenderer.invoke('sen2ch:addFavorite', fav),
  removeFavorite: (boardUrl, threadId) =>
    ipcRenderer.invoke('sen2ch:removeFavorite', { boardUrl, threadId }),

  pushHistory: (entry) => ipcRenderer.invoke('sen2ch:pushHistory', entry),
  clearHistory: () => ipcRenderer.invoke('sen2ch:clearHistory'),

  setNg: (list) => ipcRenderer.invoke('sen2ch:setNg', list),
  setSettings: (patch) => ipcRenderer.invoke('sen2ch:setSettings', patch),
  updateDiscordActivity: (details, state) => ipcRenderer.send('sen2ch:updateDiscordActivity', { details, state }),
  isElectron: true,
});
