'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lamp', {
  init: () => ipcRenderer.invoke('lamp:init'),
  token: (force) => ipcRenderer.invoke('lamp:token', !!force),
  state: (s) => ipcRenderer.send('lamp:state', s),
  setting: (k, v) => ipcRenderer.send('lamp:setting', k, v),
  reload: () => ipcRenderer.send('lamp:reload'),
  action: (a) => ipcRenderer.send('lamp:action', a),
  openExternal: (u) => ipcRenderer.send('lamp:open-external', u),
  onCommand: (cb) => ipcRenderer.on('lamp:cmd', (_e, c, a) => cb(c, a))
});
