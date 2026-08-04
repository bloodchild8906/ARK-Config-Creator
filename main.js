/* =========================================================================
   ARK Config Creator — Electron main process.
   Creates the window, owns the local database, and exposes auth + per-user
   state over IPC. `--smoke` boots headless-ish, prints SMOKE-OK once the
   renderer finished loading, then quits (used by automated builds).
   ========================================================================= */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, session, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('./db');
const { serverPaths, normaliseInstallDir, fileExists } = require('./server-paths');
const {
  IPC_CHANNELS, ASA_SERVER, SERVICE_API, SETUP_PHASES, APP_TIMEOUTS, APP_LIMITS,
} = require('./constants');

const IS_SMOKE = process.argv.includes('--smoke');

/* A sandboxed preload may only require Electron's own built-ins, so it cannot
   `require('./constants')`. The channel map therefore travels to it as a
   startup argument: both ends of every channel still come from constants.js
   and can never drift apart. This prefix is the one string the two files must
   agree on by hand. */
const PRELOAD_CHANNELS_ARGUMENT = '--arkcc-ipc-channels=';

/* Suffix of a download still in flight. The file is renamed into place only
   after the stream finished, so an interrupted download can never masquerade
   as a complete steamcmd.zip. */
const DOWNLOAD_PART_SUFFIX = '.part';

const HTTP_USER_AGENT = 'ARK Config Creator';

/* SteamCMD reports its own download percentage as `progress: 42.5`. It is
   parsed here rather than in the renderer so the wire protocol carries a
   number instead of prose the UI has to reverse-engineer. */
const STEAMCMD_PROGRESS_PATTERN = /progress:\s*([\d.]+)%?/i;

const localServerJobs = new Set();
const localServerConsoleSubscribers = new Set();
let localServerServiceStart = null;
let localServerConsoleRequest = null;
let localServerConsoleResponse = null;
let appQuitting = false;

/* -------------------------------------------------------------------------
   Errors

   Anything thrown out of an IPC handler reaches the renderer as text, so the
   message is part of the UI. `AppError` marks the failures we phrased on
   purpose and carries a machine-readable `code`, which keeps callers from
   having to match on wording to know what happened.
   ------------------------------------------------------------------------- */
class AppError extends Error {
  /**
   * @param {string} message Shown to the user as-is.
   * @param {string} code Stable identifier for programmatic handling.
   */
  constructor(message, code) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

async function inspectLocalServer(value) {
  const installDir = normaliseInstallDir(value);
  const paths = serverPaths(installDir);
  return {
    installDir,
    exists: await fileExists(installDir),
    installed: await fileExists(paths.exe),
    hasConfig: await fileExists(path.join(paths.configDir, ASA_SERVER.FILES.GAME_USER_SETTINGS))
      || await fileExists(path.join(paths.configDir, ASA_SERVER.FILES.GAME)),
    serverExe: paths.exe,
    configDir: paths.configDir,
    startScript: paths.startScript,
  };
}

/**
 * Push one local-server setup event to the renderer.
 *
 * The renderer used to regex-match the *wording* of these lines to drive its
 * progress bar, so rewording a log message broke the bar silently. The wire
 * shape is structured instead: `text` is for humans, `phase`/`percent` are for
 * the bar, and either may be null.
 *
 * @param {Electron.WebContents} sender
 * @param {string} text Human-readable line; always shown in the log pane.
 * @param {string|null} [phase] One of SETUP_PHASES when a named phase begins.
 * @param {number|null} [percent] SteamCMD's own 0-100 download percentage.
 */
function sendLocalServerProgress(sender, text, phase = null, percent = null) {
  if (sender.isDestroyed()) return;
  sender.send(IPC_CHANNELS.LOCAL_SERVER_PROGRESS, { phase, text: String(text), percent });
}

/**
 * @param {string} line One trimmed line of SteamCMD output.
 * @returns {number|null} The reported percentage, or null when the line is not
 *   a progress report.
 */
function steamCmdPercent(line) {
  const match = STEAMCMD_PROGRESS_PATTERN.exec(line);
  if (!match) return null;
  const percent = Number(match[1]);
  if (!Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, percent));
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve();
    };
    const request = https.get(url, { headers: { 'User-Agent': HTTP_USER_AGENT } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= APP_LIMITS.MAX_DOWNLOAD_REDIRECTS) {
          return finish(new AppError('SteamCMD download redirected too many times.', 'steamcmd-download-failed'));
        }
        return resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return finish(new AppError('SteamCMD download failed (HTTP ' + response.statusCode + ').', 'steamcmd-download-failed'));
      }
      const partial = destination + DOWNLOAD_PART_SUFFIX;
      const output = fs.createWriteStream(partial);
      // Both halves of the pipe can fail. Only the write stream used to be
      // watched, so a connection dropped mid-body left this promise pending
      // for ever and a stray .part file on disk.
      const abort = (error) => {
        if (settled) return;
        response.destroy();
        output.destroy();
        fsp.unlink(partial).catch(() => {}).then(() => finish(error));
      };
      response.on('error', abort);
      output.on('error', abort);
      output.on('finish', () => {
        if (settled) return;
        output.close(async (error) => {
          if (error) return abort(error);
          try {
            await fsp.rename(partial, destination);
            finish();
          } catch (renameError) { abort(renameError); }
        });
      });
      response.pipe(output);
    });
    request.setTimeout(APP_TIMEOUTS.STEAMCMD_DOWNLOAD_MS, () => {
      request.destroy(new AppError('SteamCMD download timed out.', 'steamcmd-download-timeout'));
    });
    request.on('error', finish);
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
    child.on('close', (code) => code === 0
      ? resolve()
      : reject(new AppError('Could not unpack SteamCMD: ' + details.trim(), 'steamcmd-unpack-failed')));
  });
}

function runSteamCmd(executable, installDir, onLine) {
  return new Promise((resolve, reject) => {
    const args = [
      '+force_install_dir', installDir,
      '+login', 'anonymous',
      '+app_update', ASA_SERVER.DEDICATED_APP_ID, 'validate',
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
          tail = (tail + '\n' + clean).slice(-APP_LIMITS.MAX_STEAMCMD_TAIL_CHARS);
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
      else reject(new AppError('SteamCMD stopped with exit code ' + code + (tail ? '.\n' + tail : '.'), 'steamcmd-failed'));
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
  sendLocalServerProgress(sender, 'Downloading SteamCMD from Valve…', SETUP_PHASES.STEAMCMD_DOWNLOAD);
  await downloadFile(ASA_SERVER.STEAMCMD_URL, zipFile);
  sendLocalServerProgress(sender, 'Preparing SteamCMD…', SETUP_PHASES.STEAMCMD_PREPARE);
  await extractZip(zipFile, steamDir);
  await fsp.unlink(zipFile).catch(() => {});
  if (!await fileExists(executable)) {
    throw new AppError('SteamCMD was unpacked, but steamcmd.exe was not found.', 'steamcmd-missing');
  }
  return executable;
}

/**
 * Replace a config file, keeping the previous version alongside it.
 *
 * The UI promises "existing copies are backed up as .bak first", so only a
 * genuinely absent original (ENOENT) may be ignored here; every other backup
 * failure aborts the write instead of quietly overwriting the user's file.
 */
async function writeTextWithBackup(target, content) {
  try {
    await fsp.copyFile(target, target + ASA_SERVER.BACKUP_SUFFIX);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new AppError('Could not back up ' + path.basename(target) + ' before replacing it: '
        + (error.message || error.code) + '. Nothing was changed.', 'backup-failed');
    }
  }
  const temporary = target + ASA_SERVER.WRITE_TEMP_SUFFIX;
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

/**
 * Reads an executable's Authenticode signature via PowerShell.
 *
 * @param {string} file
 * @returns {Promise<{ status: string, subject: string }>} `status` is
 *   PowerShell's `SignatureStatus` (`Valid`, `NotSigned`, `HashMismatch`, …),
 *   or `Unknown` when the check itself could not run.
 */
function authenticodeSignature(file) {
  const command = "$s = Get-AuthenticodeSignature -LiteralPath '" + psLiteral(file) + "';"
    + " Write-Output $s.Status; Write-Output $s.SignerCertificate.Subject";
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    // A failure to run the check must never be reported as "signed" — it falls
    // through to Unknown, which the caller treats as unverified.
    child.on('error', () => resolve({ status: 'Unknown', subject: '' }));
    child.on('close', () => {
      const [status = '', subject = ''] = output.split(/\r?\n/).map((line) => line.trim());
      resolve({ status: status || 'Unknown', subject });
    });
  });
}

/**
 * Decides whether a chosen installer may be executed.
 *
 * The update flow runs a `.exe` the user picked off disk, so a file merely
 * *named* `ARK-Config-Creator-Setup-9.9.9.exe` sitting in Downloads used to be
 * launched with no further checks.
 *
 * Releases are not code-signed today, so demanding a valid signature outright
 * would break every legitimate update. Instead the running app is used as the
 * trust anchor:
 *
 *   • If this build is signed, the installer must carry a valid signature from
 *     the same publisher. Anything else is refused.
 *   • If this build is unsigned there is nothing to compare against, so the
 *     user is asked to confirm in a dialog naming the exact file.
 *
 * @returns {Promise<boolean>} false when the user declined.
 */
async function confirmInstallerIsTrusted(parentWindow, installer) {
  const [running, candidate] = await Promise.all([
    authenticodeSignature(process.execPath),
    authenticodeSignature(installer),
  ]);

  if (running.status === 'Valid') {
    if (candidate.status !== 'Valid') {
      throw new AppError(
        'That installer is not digitally signed (' + candidate.status + '), but this copy of '
        + 'ARK Config Creator is. Download the installer again from the official releases page.',
        'installer-unsigned');
    }
    if (candidate.subject !== running.subject) {
      throw new AppError(
        'That installer is signed by a different publisher than this copy of ARK Config Creator. '
        + 'Download the installer again from the official releases page.',
        'installer-publisher-mismatch');
    }
    return true;
  }

  const { response } = await dialog.showMessageBox(parentWindow, {
    type: 'warning',
    title: 'Run this installer?',
    message: 'ARK Config Creator is about to run an installer it cannot verify.',
    detail: 'This build is not code-signed, so the publisher of the selected file cannot be checked.\n\n'
      + installer + '\n\nOnly continue if you downloaded this file yourself from the official releases page.',
    buttons: ['Cancel', 'Run installer'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

async function launchInstallerUpdate(webContents) {
  if (process.platform !== 'win32') {
    throw new AppError('In-place updates are currently available on Windows only.', 'unsupported-platform');
  }
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
  if (!match) {
    throw new AppError('Select an ARK Config Creator setup file named ARK-Config-Creator-Setup-x.y.z.exe.', 'installer-name');
  }
  if (compareVersions(match[1], app.getVersion()) <= 0) {
    throw new AppError('Select a newer installer than version ' + app.getVersion() + '.', 'installer-not-newer');
  }
  const trusted = await confirmInstallerIsTrusted(BrowserWindow.fromWebContents(webContents), installer);
  if (!trusted) return { canceled: true };
  await new Promise((resolve, reject) => {
    const child = spawn(installer, [], { detached: true, windowsHide: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  // Return the IPC response first, then close cleanly so the installer can
  // replace the app in-place without asking the user to uninstall it.
  setTimeout(() => app.quit(), APP_TIMEOUTS.QUIT_AFTER_INSTALLER_MS);
  return { started: true, version: match[1] };
}

async function installLocalDedicatedServer(sender, value) {
  if (process.platform !== 'win32') {
    throw new AppError('Local dedicated-server setup is currently available on Windows only.', 'unsupported-platform');
  }
  const dir = normaliseInstallDir(value);
  if (localServerJobs.has(dir)) {
    throw new AppError('An install or update is already running for this folder.', 'install-in-progress');
  }
  localServerJobs.add(dir);
  try {
    await fsp.mkdir(dir, { recursive: true });
    const steamCmd = await ensureSteamCmd(sender);
    sendLocalServerProgress(sender, 'Installing or validating the ARK: Survival Ascended dedicated server…', SETUP_PHASES.INSTALLING);
    await runSteamCmd(steamCmd, dir, (line) => sendLocalServerProgress(sender, line, null, steamCmdPercent(line)));
    const status = await inspectLocalServer(dir);
    if (!status.installed) {
      throw new AppError('SteamCMD finished but ArkAscendedServer.exe was not found in the selected folder.', 'server-exe-missing');
    }
    sendLocalServerProgress(sender, 'Dedicated-server files are ready.', SETUP_PHASES.INSTALLED);
    return status;
  } finally {
    localServerJobs.delete(dir);
  }
}

async function deployLocalServerFiles(payload) {
  const installDir = normaliseInstallDir(payload && payload.installDir);
  const files = payload && payload.files;
  if (!files || typeof files.gameUserSettings !== 'string' || typeof files.gameIni !== 'string' || typeof files.startScript !== 'string') {
    throw new AppError('The generated server files were invalid.', 'invalid-payload');
  }
  if ([files.gameUserSettings, files.gameIni, files.startScript].some((file) => file.length > APP_LIMITS.MAX_CONFIG_FILE_BYTES)) {
    throw new AppError('A generated server file is unexpectedly large.', 'file-too-large');
  }
  const paths = serverPaths(installDir);
  await fsp.mkdir(paths.configDir, { recursive: true });
  await writeTextWithBackup(path.join(paths.configDir, ASA_SERVER.FILES.GAME_USER_SETTINGS), files.gameUserSettings);
  await writeTextWithBackup(path.join(paths.configDir, ASA_SERVER.FILES.GAME), files.gameIni);
  await writeTextWithBackup(paths.startScript, files.startScript);
  return { ...paths };
}

/* ---------------- loopback client for the detached helper ---------------- */
function localServerServiceDir() {
  return path.join(app.getPath('userData'), 'arkcc-data', 'local-server-service');
}

async function localServerServiceDescriptor() {
  try {
    const descriptor = JSON.parse(await fsp.readFile(path.join(localServerServiceDir(), SERVICE_API.DESCRIPTOR_FILE), 'utf8'));
    if (!Number.isInteger(descriptor.port) || descriptor.port < 1 || descriptor.port > 65535 || typeof descriptor.token !== 'string') return null;
    return descriptor;
  } catch (e) { return null; }
}

function serviceRequest(descriptor, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request({
      host: SERVICE_API.HOST, port: descriptor.port, path: requestPath, method,
      headers: {
        [SERVICE_API.TOKEN_HEADER]: descriptor.token,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        let parsed;
        try { parsed = text ? JSON.parse(text) : {}; } catch (e) { return reject(new AppError('Local server service returned invalid data.', 'service-bad-response')); }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new AppError(parsed.error || ('Local server service returned HTTP ' + response.statusCode + '.'), 'service-error'));
        }
        resolve(parsed);
      });
    });
    request.setTimeout(APP_TIMEOUTS.SERVICE_REQUEST_MS, () => {
      request.destroy(new AppError('Could not reach the local server service.', 'service-unreachable'));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

/**
 * Status of an already-running helper, without ever starting one.
 *
 * A failure here is normal (nothing is running yet), so it stays a value rather
 * than an exception — but the reason travels with it so the renderer can say
 * *why* instead of showing a bare "stopped".
 *
 * @returns {Promise<{running: boolean, reason?: string}>}
 */
async function existingLocalServerServiceStatus() {
  const descriptor = await localServerServiceDescriptor();
  if (!descriptor) return { running: false, reason: 'The local server service is not running.' };
  try { return await serviceRequest(descriptor, 'GET', SERVICE_API.ROUTES.STATUS); }
  catch (error) { return { running: false, reason: error.message || 'The local server service could not be reached.' }; }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureLocalServerService() {
  if (localServerServiceStart) return localServerServiceStart;
  localServerServiceStart = (async () => {
    const existing = await localServerServiceDescriptor();
    if (existing) {
      try { await serviceRequest(existing, 'GET', SERVICE_API.ROUTES.HEALTH); return existing; } catch (e) { /* stale descriptor — replace it */ }
    }
    const directory = localServerServiceDir();
    await fsp.mkdir(directory, { recursive: true });
    await fsp.unlink(path.join(directory, SERVICE_API.DESCRIPTOR_FILE)).catch(() => {});
    const token = crypto.randomBytes(32).toString('hex');
    const service = spawn(process.execPath, [path.join(__dirname, 'server-service.js'), '--state-dir', directory, '--token', token], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    service.unref();
    for (let attempt = 0; attempt < APP_TIMEOUTS.SERVICE_START_ATTEMPTS; attempt++) {
      await wait(APP_TIMEOUTS.SERVICE_START_POLL_MS);
      const descriptor = await localServerServiceDescriptor();
      if (!descriptor) continue;
      try {
        await serviceRequest(descriptor, 'GET', SERVICE_API.ROUTES.HEALTH);
        return descriptor;
      } catch (e) { /* still starting */ }
    }
    throw new AppError('The local server service did not start.', 'service-start-failed');
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
    sender.send(IPC_CHANNELS.LOCAL_SERVER_CONSOLE, message);
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
    host: SERVICE_API.HOST, port: descriptor.port, path: SERVICE_API.ROUTES.EVENTS, method: 'GET',
    headers: { [SERVICE_API.TOKEN_HEADER]: descriptor.token, Accept: 'text/event-stream' },
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
      if (!appQuitting && localServerConsoleSubscribers.size) {
        setTimeout(() => openLocalServerConsoleStream().catch(() => {}), APP_TIMEOUTS.CONSOLE_RECONNECT_MS);
      }
    });
  });
  request.end();
}

/* ---------------- window ---------------- */

/* window size/position survive restarts */
function savedBounds() {
  try { return JSON.parse(db.getAppSetting('windowBounds') || 'null'); } catch (e) { return null; }
}

/** Store the current geometry. Must run while the database is still open. */
function persistWindowBounds(win) {
  if (!win || win.isDestroyed()) return;
  try { db.setAppSetting('windowBounds', JSON.stringify(win.getNormalBounds())); } catch (e) { /* best effort */ }
}

/* The renderer builds HTML by concatenation from remote sources (CurseForge,
   Google Docs exports, Pastebin, wikis), so a Content-Security-Policy is the
   backstop against an injected <script> or a phone-home image beacon.
   `unsafe-inline` stays for scripts and styles because index.html carries
   inline handlers and inline style attributes; `object-src`/`base-uri` are the
   directives that actually block injected plugins and base-tag hijacking. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self' file:",
  "script-src 'self' file: 'unsafe-inline'",
  "style-src 'self' file: 'unsafe-inline'",
  "img-src 'self' file: data: blob: https: http:",
  "font-src 'self' file: data:",
  // mod lookups and panel/FTP deploys; http: is kept because Pterodactyl and
  // self-hosted panels are routinely reached over plain HTTP on a LAN
  "connect-src 'self' file: data: blob: https: http:",
  "media-src 'self' file: data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ');

/**
 * Is this URL one of the app's own bundled documents?
 * Used both for the CSP filter and for rejecting IPC from foreign frames.
 */
function isAppDocumentUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch (e) { return false; }
  if (parsed.protocol !== 'file:') return false;
  // file:///C:/… — strip the leading slash Windows drive paths carry
  const filePath = path.resolve(decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1'));
  const relative = path.relative(path.resolve(__dirname), filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isAppDocumentUrl(details.url)) return callback({});
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CONTENT_SECURITY_POLICY] },
    });
  });
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
      // The renderer only ever loads local files and talks to the outside world
      // through fetch, so it has no business holding OS-level privileges.
      sandbox: true,
      additionalArguments: [PRELOAD_CHANNELS_ARGUMENT + JSON.stringify(IPC_CHANNELS)],
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

  win.on('close', () => persistWindowBounds(win));

  if (IS_SMOKE) runSmokeTest(win);
  return win;
}

/**
 * Build verification: drive the real renderer once and exit with a status.
 *
 * Kept out of createWindow so the window setup stays readable. Prints
 * `SMOKE-OK` on success and `SMOKE-FAIL: {…}` with the failing assertions
 * otherwise; setup.ps1 and CI look for exactly those strings.
 */
function runSmokeTest(win) {
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
          // Poll for a condition instead of sleeping a fixed number of
          // milliseconds. The fixed waits this replaces made the run flaky on
          // a loaded CI machine: login is several awaits deep (IPC round trip,
          // state load, full re-render) and occasionally took longer than the
          // 700 ms the test allowed, failing an assertion that was actually fine.
          const until = async (condition, timeoutMs = 8000) => {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
              try { if (condition()) return true; } catch (e) { /* not ready yet */ }
              await wait(25);
            }
            return false;
          };
          const el = (id) => document.getElementById(id);
          // register
          el('authToggle').click();
          el('authUser').value = 'SmokeTester';
          el('authPass').value = 'smoke-pass';
          el('authSubmit').click();
          // fresh accounts get the first-run wizard — it must be present, then skippable
          const wizardShown = await until(() => !!el('dlgWizard') && el('dlgWizard').open);
          el('wizSkip')?.click();
          await until(() => !el('dlgWizard'));
          const registered = wizardShown && !el('dlgWizard') && !el('authOverlay')
            && document.querySelectorAll('.navitem').length > 15 && !!el('btnLogout');
          // The local server installer is a desktop-only surface. Render it
          // during smoke without choosing a folder or downloading anything.
          el('sidebar').querySelector('[data-cat="setup"]')?.click();
          await until(() => !!document.querySelector('.local-setup-intro'));
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
          await until(() => !!el('authUser') && !el('btnLogout'));
          const u = el('authUser');
          const rect = u.getBoundingClientRect();
          const covered = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2) !== u;
          u.focus();
          u.value = 'SmokeTester'; u.dispatchEvent(new Event('input', { bubbles: true }));
          const inputsUsable = !covered && !u.disabled && document.activeElement === u && u.value === 'SmokeTester';
          // log back in
          el('authPass').value = 'smoke-pass';
          el('authSubmit').click();
          await until(() => !el('authOverlay') && !!el('btnLogout'));
          const headerButtons = document.querySelectorAll('.hbtns .btn').length;
          const reentered = !el('authOverlay') && !!el('btnLogout')
            && headerButtons === 7;   // no double-init
          // Report the raw values too: a bare reentered:false gives whoever
          // broke it nothing to work from.
          const reentryDetail = { overlayGone: !el('authOverlay'), logoutButton: !!el('btnLogout'), headerButtons };
          return { registered, localSetupVisible, localProgressModalVisible, localConsoleServiceReady, inputsUsable, reentered, reentryDetail };
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
    applyContentSecurityPolicy();
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
  // Quitting from the menu (or Ctrl+Q) closes the database before the window's
  // own `close` handler runs, so the bounds used to be written to a closed
  // handle and lost. Persist them here first, then close.
  for (const win of BrowserWindow.getAllWindows()) persistWindowBounds(win);
  db.close();
});

/* ---------------- IPC ---------------- */

/* Defence in depth: every handler below assumes it is talking to the app's own
   top-level document. A frame that is not one of our bundled file:// documents
   (an embedded remote page, a detached devtools frame) is refused rather than
   trusted just because it reached the main process. */
function isAppSender(event) {
  let frame;
  try { frame = event.senderFrame; } catch (e) { return false; }   // frame already gone
  if (!frame || frame.parent) return false;
  return isAppDocumentUrl(frame.url);
}

function rejectedSender(channel) {
  console.error('[ipc] rejected ' + channel + ' from a frame outside the app.');
}

/** ipcMain.handle, restricted to the app's own main frame. */
function handleAppIpc(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppSender(event)) {
      rejectedSender(channel);
      throw new AppError('This request did not come from the application window.', 'bad-sender');
    }
    return listener(event, ...args);
  });
}

/** ipcMain.on, restricted to the app's own main frame. */
function onAppIpc(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isAppSender(event)) {
      rejectedSender(channel);
      event.returnValue = null;   // never leave a sendSync caller hanging
      return;
    }
    listener(event, ...args);
  });
}

function registerIpc() {
  registerAuthIpc();
  registerStateIpc();
  registerAppIpc();
  registerLocalServerIpc();
}

function registerAuthIpc() {
  handleAppIpc(IPC_CHANNELS.AUTH_REGISTER, (e, { username, password }) => db.registerUser(username, password));
  handleAppIpc(IPC_CHANNELS.AUTH_LOGIN, (e, { username, password, remember }) => db.login(username, password, remember));
  handleAppIpc(IPC_CHANNELS.AUTH_LOGOUT, () => db.logout());
  handleAppIpc(IPC_CHANNELS.AUTH_SESSION, () => db.currentSession());
}

function registerStateIpc() {
  handleAppIpc(IPC_CHANNELS.STATE_LOAD, (e, userId) => db.loadUserState(userId));
  handleAppIpc(IPC_CHANNELS.STATE_SAVE, (e, { userId, json }) => db.saveUserState(userId, json));
  // synchronous variant so the renderer can flush the last unsaved change
  // during beforeunload, where async IPC would be cut off mid-flight
  onAppIpc(IPC_CHANNELS.STATE_SAVE_SYNC, (e, { userId, json }) => {
    e.returnValue = db.saveUserState(userId, json);
  });
}

function registerAppIpc() {
  handleAppIpc(IPC_CHANNELS.APP_VERSION, () => app.getVersion());
  handleAppIpc(IPC_CHANNELS.APP_INSTALL_UPDATE, (event) => launchInstallerUpdate(event.sender));
}

/* ---------------- local dedicated-server setup ----------------
   Renderer code never receives Node access. These narrow IPC handlers keep
   the native work here and only write the three known server files under a
   user-selected install folder. */
function registerLocalServerIpc() {
  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_CHOOSE_DIRECTORY, async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose an ARK: Survival Ascended server folder',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, ...(await inspectLocalServer(result.filePaths[0])) };
  });

  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_INSPECT, (event, installDir) => inspectLocalServer(installDir));

  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_INSTALL, (event, installDir) => installLocalDedicatedServer(event.sender, installDir));

  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_WRITE_FILES, (event, payload) => deployLocalServerFiles(payload));

  // The first-time path is deliberately one operation: download/update the
  // server, deploy the currently generated files, then start the persistent
  // console service. Users never have to install or configure the helper
  // separately after choosing a folder.
  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_CREATE, async (event, payload) => {
    sendLocalServerProgress(event.sender, 'Setting up your local ARK server…', SETUP_PHASES.START);
    const status = await installLocalDedicatedServer(event.sender, payload && payload.installDir);
    sendLocalServerProgress(event.sender, 'Deploying the generated configuration and start script…', SETUP_PHASES.DEPLOYING_CONFIG);
    await deployLocalServerFiles(payload);
    sendLocalServerProgress(event.sender, 'Installing and starting the persistent local console service…', SETUP_PHASES.STARTING_SERVICE);
    const service = await ensureLocalServerService();
    const serviceStatus = await serviceRequest(service, 'POST', SERVICE_API.ROUTES.START, {
      installDir: payload && payload.installDir,
      launch: payload && payload.launch,
    });
    sendLocalServerProgress(event.sender, 'Local server created, configured, and running.', SETUP_PHASES.DONE);
    return { status, service: serviceStatus };
  });

  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_OPEN_FOLDER, async (event, installDir) => {
    const dir = normaliseInstallDir(installDir);
    // shell.openPath *runs* a file, so a path that is not a directory must
    // never reach it — …\payload.exe would otherwise be executed silently.
    const stats = await fsp.stat(dir).catch(() => null);
    if (!stats) throw new AppError('That server folder no longer exists on this PC.', 'folder-missing');
    if (!stats.isDirectory()) throw new AppError('That path is a file, not a folder, so it was not opened.', 'not-a-directory');
    const failure = await shell.openPath(dir);
    if (failure) throw new AppError('Windows could not open the server folder: ' + failure, 'open-folder-failed');
  });

  /* The detached helper owns the server and its pipes, so the game keeps
     running across app restarts. We only open its SSE stream while at least
     one renderer consumes the console; it drops output at every other time. */
  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_MANAGED_START, async (event, payload) => {
    const service = await ensureLocalServerService();
    return serviceRequest(service, 'POST', SERVICE_API.ROUTES.START, {
      installDir: payload && payload.installDir,
      launch: payload && payload.launch,
    });
  });

  // Stopping is idempotent and never starts the helper: if no descriptor is on
  // disk there is nothing running, which is already the requested end state.
  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_MANAGED_STOP, async () => {
    const descriptor = await localServerServiceDescriptor();
    if (!descriptor) return { running: false, reason: 'The local server service is not running.' };
    return serviceRequest(descriptor, 'POST', SERVICE_API.ROUTES.STOP);
  });

  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_STATUS, () => existingLocalServerServiceStatus());

  onAppIpc(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_SUBSCRIBE, (event) => {
    if (IS_SMOKE) return; // UI smoke renders the page but never starts a detached helper
    localServerConsoleSubscribers.add(event.sender);
    event.sender.once('destroyed', () => {
      localServerConsoleSubscribers.delete(event.sender);
      if (!localServerConsoleSubscribers.size) closeLocalServerConsoleStream();
    });
    openLocalServerConsoleStream().catch((error) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.LOCAL_SERVER_CONSOLE, {
          type: 'system',
          text: 'Could not connect to the local server service: ' + error.message,
        });
      }
    });
  });

  onAppIpc(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_UNSUBSCRIBE, (event) => {
    localServerConsoleSubscribers.delete(event.sender);
    if (!localServerConsoleSubscribers.size) closeLocalServerConsoleStream();
  });

  handleAppIpc(IPC_CHANNELS.LOCAL_SERVER_CONSOLE_SEND, async (event, command) => {
    const service = await ensureLocalServerService();
    return serviceRequest(service, 'POST', SERVICE_API.ROUTES.CONSOLE, { command });
  });
}
