/* =========================================================================
   ARK Config Creator — preload bridge.
   Exposes a minimal, promise-based API to the renderer. Its presence is how
   the web code knows it is running inside the desktop app.
   ========================================================================= */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arkcc', {
  register: (username, password) => ipcRenderer.invoke('auth:register', { username, password }),
  login: (username, password, remember) => ipcRenderer.invoke('auth:login', { username, password, remember }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  session: () => ipcRenderer.invoke('auth:session'),
  loadState: (userId) => ipcRenderer.invoke('state:load', userId),
  saveState: (userId, json) => ipcRenderer.invoke('state:save', { userId, json }),
  // synchronous flush for beforeunload — the last edit must never be lost
  saveStateNow: (userId, json) => ipcRenderer.sendSync('state:save-sync', { userId, json }),
  version: () => ipcRenderer.invoke('app:version'),
  installAppUpdate: () => ipcRenderer.invoke('app:install-update'),
  chooseLocalServerDirectory: () => ipcRenderer.invoke('local-server:choose-directory'),
  inspectLocalServer: (installDir) => ipcRenderer.invoke('local-server:inspect', installDir),
  installLocalServer: (installDir) => ipcRenderer.invoke('local-server:install', installDir),
  writeLocalServerFiles: (payload) => ipcRenderer.invoke('local-server:write-files', payload),
  createLocalServer: (payload) => ipcRenderer.invoke('local-server:create', payload),
  openLocalServerFolder: (installDir) => ipcRenderer.invoke('local-server:open-folder', installDir),
  startManagedLocalServer: (payload) => ipcRenderer.invoke('local-server:managed-start', payload),
  localServerConsoleStatus: () => ipcRenderer.invoke('local-server:console-status'),
  subscribeLocalServerConsole: () => ipcRenderer.send('local-server:console-subscribe'),
  unsubscribeLocalServerConsole: () => ipcRenderer.send('local-server:console-unsubscribe'),
  sendLocalServerConsole: (command) => ipcRenderer.invoke('local-server:console-send', command),
  onLocalServerProgress: (listener) => {
    const wrapped = (event, message) => listener(message);
    ipcRenderer.on('local-server:progress', wrapped);
    return () => ipcRenderer.removeListener('local-server:progress', wrapped);
  },
  onLocalServerConsole: (listener) => {
    const wrapped = (event, message) => listener(message);
    ipcRenderer.on('local-server:console', wrapped);
    return () => ipcRenderer.removeListener('local-server:console', wrapped);
  },
});
