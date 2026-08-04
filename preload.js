/* =========================================================================
   ARK Config Creator — preload bridge.
   Exposes a minimal, promise-based API to the renderer. Its presence is how
   the web code knows it is running inside the desktop app.
   ========================================================================= */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* The window runs with `sandbox: true`, where a preload script may only
   require Electron's own built-ins — `require('./constants')` is unavailable
   here. main.js therefore passes the channel map in as a startup argument, so
   both ends of every channel still originate from constants.js and the names
   cannot drift apart. This prefix is the single string the two files agree on
   by hand; it must match PRELOAD_CHANNELS_ARGUMENT in main.js. */
const CHANNELS_ARGUMENT = '--arkcc-ipc-channels=';

function loadChannels() {
  const encoded = process.argv.find((argument) => argument.startsWith(CHANNELS_ARGUMENT));
  if (!encoded) throw new Error('The preload bridge was started without its IPC channel map.');
  return JSON.parse(encoded.slice(CHANNELS_ARGUMENT.length));
}

const IPC_CHANNELS = loadChannels();

contextBridge.exposeInMainWorld('arkcc', {
  register: (username, password) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_REGISTER, { username, password }),
  login: (username, password, remember) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, { username, password, remember }),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  session: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SESSION),
  loadState: (userId) => ipcRenderer.invoke(IPC_CHANNELS.STATE_LOAD, userId),
  saveState: (userId, json) => ipcRenderer.invoke(IPC_CHANNELS.STATE_SAVE, { userId, json }),
  // synchronous flush for beforeunload — the last edit must never be lost
  saveStateNow: (userId, json) => ipcRenderer.sendSync(IPC_CHANNELS.STATE_SAVE_SYNC, { userId, json }),
  version: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  installAppUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INSTALL_UPDATE),
  chooseLocalServerDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_CHOOSE_DIRECTORY),
  inspectLocalServer: (installDir) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_INSPECT, installDir),
  installLocalServer: (installDir) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_INSTALL, installDir),
  writeLocalServerFiles: (payload) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_WRITE_FILES, payload),
  createLocalServer: (payload) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_CREATE, payload),
  openLocalServerFolder: (installDir) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_OPEN_FOLDER, installDir),
  startManagedLocalServer: (payload) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_MANAGED_START, payload),
  stopManagedLocalServer: () => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_MANAGED_STOP),
  localServerConsoleStatus: () => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_STATUS),
  subscribeLocalServerConsole: () => ipcRenderer.send(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_SUBSCRIBE),
  unsubscribeLocalServerConsole: () => ipcRenderer.send(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_UNSUBSCRIBE),
  sendLocalServerConsole: (command) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_SEND, command),
  // delivers { phase, text, percent } — see sendLocalServerProgress in main.js
  onLocalServerProgress: (listener) => {
    const wrapped = (event, message) => listener(message);
    ipcRenderer.on(IPC_CHANNELS.LOCAL_SERVER_PROGRESS, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LOCAL_SERVER_PROGRESS, wrapped);
  },
  onLocalServerConsole: (listener) => {
    const wrapped = (event, message) => listener(message);
    ipcRenderer.on(IPC_CHANNELS.LOCAL_SERVER_CONSOLE, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LOCAL_SERVER_CONSOLE, wrapped);
  },
});
