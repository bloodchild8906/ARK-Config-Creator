/* =========================================================================
   ARK Config Creator — Electron main process.
   Creates the window, owns the local database, and exposes auth + per-user
   state over IPC. `--smoke` boots headless-ish, prints SMOKE-OK once the
   renderer finished loading, then quits (used by automated builds).
   ========================================================================= */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('./db');

const IS_SMOKE = process.argv.includes('--smoke');
const STEAMCMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const ASA_DEDICATED_APP_ID = '2430930';
const ASA_CONFIG_PARTS = ['ShooterGame', 'Saved', 'Config', 'WindowsServer'];
const localServerJobs = new Set();
const localServerConsoleSubscribers = new Set();
let localServerServiceStart = null;
let localServerConsoleRequest = null;
let localServerConsoleResponse = null;
let appQuitting = false;

function localServerPaths(installDir) {
  return {
    root: installDir,
    exe: path.join(installDir, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe'),
    configDir: path.join(installDir, ...ASA_CONFIG_PARTS),
    startScript: path.join(installDir, 'StartServer.bat'),
  };
}

function normaliseInstallDir(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Choose a server installation folder first.');
  const dir = path.resolve(value.trim());
  // Never allow an install to target an entire drive. SteamCMD would otherwise
  // scatter its files at the root of the disk, and a later cleanup would be
  // dangerously broad.
  if (dir === path.parse(dir).root) throw new Error('Choose a folder inside a drive, not the drive itself.');
  return dir;
}

async function fileExists(file) {
  try { await fsp.access(file); return true; } catch (e) { return false; }
}

async function inspectLocalServer(value) {
  const installDir = normaliseInstallDir(value);
  const paths = localServerPaths(installDir);
  return {
    installDir,
    exists: await fileExists(installDir),
    installed: await fileExists(paths.exe),
    hasConfig: await fileExists(path.join(paths.configDir, 'GameUserSettings.ini'))
      || await fileExists(path.join(paths.configDir, 'Game.ini')),
    serverExe: paths.exe,
    configDir: paths.configDir,
    startScript: paths.startScript,
  };
}

function sendLocalServerProgress(sender, message) {
  if (!sender.isDestroyed()) sender.send('local-server:progress', String(message));
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'ARK Config Creator' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error('SteamCMD download redirected too many times.'));
        return resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error('SteamCMD download failed (HTTP ' + response.statusCode + ').'));
      }
      const partial = destination + '.part';
      const output = fs.createWriteStream(partial);
      response.pipe(output);
      output.on('error', async (error) => {
        response.destroy();
        await fsp.unlink(partial).catch(() => {});
        reject(error);
      });
      output.on('finish', () => {
        output.close(async (error) => {
          if (error) return reject(error);
          try {
            await fsp.rename(partial, destination);
            resolve();
          } catch (renameError) { reject(renameError); }
        });
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error('SteamCMD download timed out.')));
    request.on('error', reject);
  });
}

function psLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function extractZip(zipFile, destination) {
  // The packaged app targets Windows, where PowerShell's Expand-Archive is
  // available. Pass the paths as quoted literals rather than interpolating a
  // shell command from user input.
  const command = "Expand-Archive -LiteralPath '" + psLiteral(zipFile)
    + "' -DestinationPath '" + psLiteral(destination) + "' -Force";
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
    let details = '';
    child.stdout.on('data', (chunk) => { details += chunk; });
    child.stderr.on('data', (chunk) => { details += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error('Could not unpack SteamCMD: ' + details.trim())));
  });
}

function runSteamCmd(executable, installDir, onLine) {
  return new Promise((resolve, reject) => {
    const args = [
      '+force_install_dir', installDir,
      '+login', 'anonymous',
      '+app_update', ASA_DEDICATED_APP_ID, 'validate',
      '+quit',
    ];
    const child = spawn(executable, args, { cwd: path.dirname(executable), windowsHide: true });
    let carry = '';
    let tail = '';
    const report = (chunk) => {
      carry += chunk.toString();
      const lines = carry.split(/\r?\n/);
      carry = lines.pop();
      for (const line of lines) {
        const clean = line.trim();
        if (clean) {
          tail = (tail + '\n' + clean).slice(-2400);
          onLine(clean);
        }
      }
    };
    child.stdout.on('data', report);
    child.stderr.on('data', report);
    child.on('error', reject);
    child.on('close', (code) => {
      if (carry.trim()) onLine(carry.trim());
      if (code === 0) resolve();
      else reject(new Error('SteamCMD stopped with exit code ' + code + (tail ? '.\n' + tail : '.')));
    });
  });
}

async function ensureSteamCmd(sender) {
  const steamDir = path.join(app.getPath('userData'), 'steamcmd');
  const executable = path.join(steamDir, 'steamcmd.exe');
  if (await fileExists(executable)) return executable;
  await fsp.mkdir(steamDir, { recursive: true });
  const zipFile = path.join(steamDir, 'steamcmd.zip');
  await fsp.unlink(zipFile).catch(() => {});
  sendLocalServerProgress(sender, 'Downloading SteamCMD from Valve…');
  await downloadFile(STEAMCMD_URL, zipFile);
  sendLocalServerProgress(sender, 'Preparing SteamCMD…');
  await extractZip(zipFile, steamDir);
  await fsp.unlink(zipFile).catch(() => {});
  if (!await fileExists(executable)) throw new Error('SteamCMD was unpacked, but steamcmd.exe was not found.');
  return executable;
}

async function writeTextWithBackup(target, content) {
  try { await fsp.copyFile(target, target + '.bak'); } catch (e) { /* a new file has no backup */ }
  const temporary = target + '.arkcc-writing';
  await fsp.writeFile(temporary, content, 'utf8');
  await fsp.rename(temporary, target);
}

function compareVersions(left, right) {
  const parse = (value) => String(value).split('-')[0].split('.').map((part) => parseInt(part, 10) || 0);
  const a = parse(left), b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  }
  return 0;
}

async function launchInstallerUpdate(webContents) {
  if (process.platform !== 'win32') throw new Error('In-place updates are currently available on Windows only.');
  const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(webContents), {
    title: 'Select a newer ARK Config Creator installer',
    defaultPath: app.getPath('downloads'),
    buttonLabel: 'Install update',
    filters: [{ name: 'ARK Config Creator setup', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
  const installer = selected.filePaths[0];
  const match = /^ARK-Config-Creator-Setup-(\d+\.\d+\.\d+(?:-[\w.-]+)?)\.exe$/i.exec(path.basename(installer));
  if (!match) throw new Error('Select an ARK Config Creator setup file named ARK-Config-Creator-Setup-x.y.z.exe.');
  if (compareVersions(match[1], app.getVersion()) <= 0) {
    throw new Error('Select a newer installer than version ' + app.getVersion() + '.');
  }
  await new Promise((resolve, reject) => {
    const child = spawn(installer, [], { detached: true, windowsHide: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  // Return the IPC response first, then close cleanly so the installer can
  // replace the app in-place without asking the user to uninstall it.
  setTimeout(() => app.quit(), 350);
  return { started: true, version: match[1] };
}

async function installLocalDedicatedServer(sender, value) {
  if (process.platform !== 'win32') throw new Error('Local dedicated-server setup is currently available on Windows only.');
  const dir = normaliseInstallDir(value);
  if (localServerJobs.has(dir)) throw new Error('An install or update is already running for this folder.');
  localServerJobs.add(dir);
  try {
    await fsp.mkdir(dir, { recursive: true });
    const steamCmd = await ensureSteamCmd(sender);
    sendLocalServerProgress(sender, 'Installing or validating the ARK: Survival Ascended dedicated server…');
    await runSteamCmd(steamCmd, dir, (line) => sendLocalServerProgress(sender, line));
    const status = await inspectLocalServer(dir);
    if (!status.installed) throw new Error('SteamCMD finished but ArkAscendedServer.exe was not found in the selected folder.');
    sendLocalServerProgress(sender, 'Dedicated-server files are ready.');
    return status;
  } finally {
    localServerJobs.delete(dir);
  }
}

async function deployLocalServerFiles(payload) {
  const installDir = normaliseInstallDir(payload && payload.installDir);
  const files = payload && payload.files;
  if (!files || typeof files.gameUserSettings !== 'string' || typeof files.gameIni !== 'string' || typeof files.startScript !== 'string') {
    throw new Error('The generated server files were invalid.');
  }
  if ([files.gameUserSettings, files.gameIni, files.startScript].some((file) => file.length > 5 * 1024 * 1024)) {
    throw new Error('A generated server file is unexpectedly large.');
  }
  const paths = localServerPaths(installDir);
  await fsp.mkdir(paths.configDir, { recursive: true });
  await writeTextWithBackup(path.join(paths.configDir, 'GameUserSettings.ini'), files.gameUserSettings);
  await writeTextWithBackup(path.join(paths.configDir, 'Game.ini'), files.gameIni);
  await writeTextWithBackup(paths.startScript, files.startScript);
  return { ...paths };
}

function localServerServiceDir() {
  return path.join(app.getPath('userData'), 'arkcc-data', 'local-server-service');
}

async function localServerServiceDescriptor() {
  try {
    const descriptor = JSON.parse(await fsp.readFile(path.join(localServerServiceDir(), 'service.json'), 'utf8'));
    if (!Number.isInteger(descriptor.port) || descriptor.port < 1 || descriptor.port > 65535 || typeof descriptor.token !== 'string') return null;
    return descriptor;
  } catch (e) { return null; }
}

function serviceRequest(descriptor, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request({
      host: '127.0.0.1', port: descriptor.port, path: requestPath, method,
      headers: {
        'X-Arkcc-Token': descriptor.token,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        let parsed;
        try { parsed = text ? JSON.parse(text) : {}; } catch (e) { return reject(new Error('Local server service returned invalid data.')); }
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(parsed.error || ('Local server service returned HTTP ' + response.statusCode + '.')));
        resolve(parsed);
      });
    });
    request.setTimeout(3000, () => request.destroy(new Error('Could not reach the local server service.')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function existingLocalServerServiceStatus() {
  const descriptor = await localServerServiceDescriptor();
  if (!descriptor) return { running: false };
  try { return await serviceRequest(descriptor, 'GET', '/status'); }
  catch (e) { return { running: false }; }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureLocalServerService() {
  if (localServerServiceStart) return localServerServiceStart;
  localServerServiceStart = (async () => {
    const existing = await localServerServiceDescriptor();
    if (existing) {
      try { await serviceRequest(existing, 'GET', '/health'); return existing; } catch (e) { /* stale descriptor — replace it */ }
    }
    const directory = localServerServiceDir();
    await fsp.mkdir(directory, { recursive: true });
    await fsp.unlink(path.join(directory, 'service.json')).catch(() => {});
    const token = crypto.randomBytes(32).toString('hex');
    const service = spawn(process.execPath, [path.join(__dirname, 'server-service.js'), '--state-dir', directory, '--token', token], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    service.unref();
    for (let attempt = 0; attempt < 50; attempt++) {
      await wait(100);
      const descriptor = await localServerServiceDescriptor();
      if (!descriptor) continue;
      try {
        await serviceRequest(descriptor, 'GET', '/health');
        return descriptor;
      } catch (e) { /* still starting */ }
    }
    throw new Error('The local server service did not start.');
  })();
  try { return await localServerServiceStart; }
  finally { localServerServiceStart = null; }
}

function broadcastLocalServerConsole(message) {
  for (const sender of [...localServerConsoleSubscribers]) {
    if (sender.isDestroyed()) {
      localServerConsoleSubscribers.delete(sender);
      continue;
    }
    sender.send('local-server:console', message);
  }
}

function closeLocalServerConsoleStream() {
  localServerConsoleRequest?.destroy();
  localServerConsoleResponse?.destroy();
  localServerConsoleRequest = null;
  localServerConsoleResponse = null;
}

async function openLocalServerConsoleStream() {
  if (localServerConsoleRequest || !localServerConsoleSubscribers.size) return;
  const descriptor = await ensureLocalServerService();
  const request = http.request({
    host: '127.0.0.1', port: descriptor.port, path: '/events', method: 'GET',
    headers: { 'X-Arkcc-Token': descriptor.token, Accept: 'text/event-stream' },
  });
  localServerConsoleRequest = request;
  request.setTimeout(0);
  request.on('error', () => { if (localServerConsoleRequest === request) closeLocalServerConsoleStream(); });
  request.on('response', (response) => {
    localServerConsoleResponse = response;
    response.setEncoding('utf8');
    let buffer = '';
    response.on('data', (chunk) => {
      buffer += chunk;
      const records = buffer.split(/\n\n/);
      buffer = records.pop();
      for (const record of records) {
        const line = record.split(/\r?\n/).find((entry) => entry.startsWith('data: '));
        if (!line) continue;
        try { broadcastLocalServerConsole(JSON.parse(line.slice(6))); } catch (e) { /* ignore malformed live output */ }
      }
    });
    response.on('close', () => {
      if (localServerConsoleResponse === response) closeLocalServerConsoleStream();
      if (!appQuitting && localServerConsoleSubscribers.size) setTimeout(() => openLocalServerConsoleStream().catch(() => {}), 500);
    });
  });
  request.end();
}

/* window size/position survive restarts */
function savedBounds() {
  try { return JSON.parse(db.getAppSetting('windowBounds') || 'null'); } catch (e) { return null; }
}

function createWindow() {
  const bounds = savedBounds() || {};
  const win = new BrowserWindow({
    width: bounds.width || 1440,
    height: bounds.height || 920,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    show: !IS_SMOKE,
    autoHideMenuBar: true,
    backgroundColor: '#090d14',
    icon: path.join(__dirname, 'badge.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');

  // links (CurseForge, docs, wikis) open in the user's real browser — never in
  // a new Electron window, and the app window itself never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.on('close', () => {
    try { db.setAppSetting('windowBounds', JSON.stringify(win.getNormalBounds())); } catch (e) { /* best effort */ }
  });

  if (IS_SMOKE) {
    let renderErrors = 0;
    win.webContents.on('console-message', (e, level, message) => {
      if (level >= 3) { renderErrors++; console.error('[renderer]', message); }
    });
    win.webContents.on('did-finish-load', async () => {
      // exercise the real flow: register -> boot, then logout -> confirm the
      // login inputs are usable again -> log back in (regression guard for the
      // "inputs dead after logout" bug).
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const el = (id) => document.getElementById(id);
          // register
          el('authToggle').click();
          el('authUser').value = 'SmokeTester';
          el('authPass').value = 'smoke-pass';
          el('authSubmit').click();
          await wait(700);
          // fresh accounts get the first-run wizard — it must be present, then skippable
          const wizardShown = !!el('dlgWizard') && el('dlgWizard').open;
          el('wizSkip')?.click();
          await wait(200);
          const registered = wizardShown && !el('dlgWizard') && !el('authOverlay')
            && document.querySelectorAll('.navitem').length > 15 && !!el('btnLogout');
          // The local server installer is a desktop-only surface. Render it
          // during smoke without choosing a folder or downloading anything.
          el('sidebar').querySelector('[data-cat="setup"]')?.click();
          await wait(100);
          const localSetupVisible = !!document.querySelector('.local-setup-intro')
            && !!document.querySelector('.local-setup-create .primary')
            && document.body.textContent.includes('Run an ARK: Survival Ascended server on this PC');
          const progressDialog = showLocalCreationProgressModal();
          const localProgressModalVisible = !!progressDialog?.open
            && !!document.getElementById('localServerCreationProgressLog')
            && document.getElementById('localServerCreationProgressPercent')?.textContent === '2% complete';
          progressDialog?.close(); progressDialog?.remove();
          if (localCreationDialog === progressDialog) localCreationDialog = null;
          const localConsoleServiceReady = (await window.arkcc.localServerConsoleStatus()).running === false;
          // logout in place (skip the confirm() dialog by calling doLogout directly)
          await doLogout();
          await wait(300);
          const u = el('authUser');
          const rect = u.getBoundingClientRect();
          const covered = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2) !== u;
          u.focus();
          u.value = 'SmokeTester'; u.dispatchEvent(new Event('input', { bubbles: true }));
          const inputsUsable = !covered && !u.disabled && document.activeElement === u && u.value === 'SmokeTester';
          // log back in
          el('authPass').value = 'smoke-pass';
          el('authSubmit').click();
          await wait(700);
          const reentered = !el('authOverlay') && !!el('btnLogout')
            && document.querySelectorAll('.hbtns .btn').length === 7;   // no double-init
          return { registered, localSetupVisible, localProgressModalVisible, localConsoleServiceReady, inputsUsable, reentered };
        })()`);
        const ok = !renderErrors && result.registered && result.localSetupVisible && result.localProgressModalVisible && result.localConsoleServiceReady && result.inputsUsable && result.reentered;
        console.log(ok ? 'SMOKE-OK' : 'SMOKE-FAIL: ' + JSON.stringify({ renderErrors, ...result }));
        app.exit(ok ? 0 : 1);
      } catch (err) {
        console.log('SMOKE-FAIL: ' + err.message);
        app.exit(1);
      }
    });
  }
  return win;
}

/* Single instance — focus the existing window instead of opening twice.
   A --smoke run is exempt: it uses a throwaway database and must be able to
   verify a build even while the user has the app open (setup.ps1 runs it). */
const gotLock = IS_SMOKE ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    // smoke runs use a throwaway database so real accounts are never touched
    if (IS_SMOKE) app.setPath('userData', path.join(require('os').tmpdir(), 'arkcc-smoke-' + Date.now()));
    db.init(path.join(app.getPath('userData'), 'arkcc-data'));
    // the menu bar stays hidden (autoHideMenuBar) but registering it gives the
    // standard accelerators: zoom in/out/reset, reload, quit
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'View', submenu: [
        { role: 'reload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'quit' },
      ] },
    ]));
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  appQuitting = true;
  localServerConsoleSubscribers.clear();
  closeLocalServerConsoleStream();
  db.close();
});

/* ---------------- IPC: auth + per-user state ---------------- */
function registerIpc() {
  ipcMain.handle('auth:register', (e, { username, password }) => db.registerUser(username, password));
  ipcMain.handle('auth:login', (e, { username, password, remember }) => db.login(username, password, remember));
  ipcMain.handle('auth:logout', () => db.logout());
  ipcMain.handle('auth:session', () => db.currentSession());
  ipcMain.handle('state:load', (e, userId) => db.loadUserState(userId));
  ipcMain.handle('state:save', (e, { userId, json }) => db.saveUserState(userId, json));
  // synchronous variant so the renderer can flush the last unsaved change
  // during beforeunload, where async IPC would be cut off mid-flight
  ipcMain.on('state:save-sync', (e, { userId, json }) => {
    e.returnValue = db.saveUserState(userId, json);
  });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:install-update', (event) => launchInstallerUpdate(event.sender));

  /* ---------------- local dedicated-server setup ----------------
     Renderer code never receives Node access. These narrow IPC handlers keep
     the native work here and only write the three known server files under a
     user-selected install folder. */
  ipcMain.handle('local-server:choose-directory', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose an ARK: Survival Ascended server folder',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, ...(await inspectLocalServer(result.filePaths[0])) };
  });

  ipcMain.handle('local-server:inspect', (event, installDir) => inspectLocalServer(installDir));

  ipcMain.handle('local-server:install', (event, installDir) => installLocalDedicatedServer(event.sender, installDir));

  ipcMain.handle('local-server:write-files', (event, payload) => deployLocalServerFiles(payload));

  // The first-time path is deliberately one operation: download/update the
  // server, deploy the currently generated files, then start the persistent
  // console service. Users never have to install or configure the helper
  // separately after choosing a folder.
  ipcMain.handle('local-server:create', async (event, payload) => {
    const status = await installLocalDedicatedServer(event.sender, payload && payload.installDir);
    sendLocalServerProgress(event.sender, 'Deploying the generated configuration and start script…');
    await deployLocalServerFiles(payload);
    sendLocalServerProgress(event.sender, 'Installing and starting the persistent local console service…');
    const service = await ensureLocalServerService();
    const serviceStatus = await serviceRequest(service, 'POST', '/start', {
      installDir: payload && payload.installDir,
      launch: payload && payload.launch,
    });
    sendLocalServerProgress(event.sender, 'Local server created, configured, and running.');
    return { status, service: serviceStatus };
  });

  ipcMain.handle('local-server:open-folder', async (event, installDir) => {
    const dir = normaliseInstallDir(installDir);
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
  });

  /* The detached helper owns the server and its pipes, so the game keeps
     running across app restarts. We only open its SSE stream while at least
     one renderer consumes the console; it drops output at every other time. */
  ipcMain.handle('local-server:managed-start', async (event, payload) => {
    const service = await ensureLocalServerService();
    return serviceRequest(service, 'POST', '/start', {
      installDir: payload && payload.installDir,
      launch: payload && payload.launch,
    });
  });
  ipcMain.handle('local-server:console-status', () => existingLocalServerServiceStatus());
  ipcMain.on('local-server:console-subscribe', (event) => {
    if (IS_SMOKE) return; // UI smoke renders the page but never starts a detached helper
    localServerConsoleSubscribers.add(event.sender);
    event.sender.once('destroyed', () => {
      localServerConsoleSubscribers.delete(event.sender);
      if (!localServerConsoleSubscribers.size) closeLocalServerConsoleStream();
    });
    openLocalServerConsoleStream().catch((error) => {
      if (!event.sender.isDestroyed()) event.sender.send('local-server:console', { type: 'system', text: 'Could not connect to the local server service: ' + error.message });
    });
  });
  ipcMain.on('local-server:console-unsubscribe', (event) => {
    localServerConsoleSubscribers.delete(event.sender);
    if (!localServerConsoleSubscribers.size) closeLocalServerConsoleStream();
  });
  ipcMain.handle('local-server:console-send', async (event, command) => {
    const service = await ensureLocalServerService();
    return serviceRequest(service, 'POST', '/console', { command });
  });
}
