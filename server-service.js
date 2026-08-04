/* =========================================================================
   ARK Config Creator — persistent local server service.
   This detached helper owns ArkAscendedServer.exe and a tiny authenticated
   loopback API. It intentionally retains no console history: server output is
   streamed only to currently connected SSE clients and discarded otherwise.
   ========================================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const stateDir = path.resolve(readArgument('--state-dir') || '.');
const token = readArgument('--token');
const descriptorFile = path.join(stateDir, 'service.json');
const CONFIG_PARTS = ['ShooterGame', 'Saved', 'Config', 'WindowsServer'];
const subscribers = new Set();
let managedServer = null;
let idleTimer = null;

if (!token || token.length < 32) throw new Error('The local server service requires an authentication token.');

function serverPaths(installDir) {
  return {
    root: installDir,
    exe: path.join(installDir, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe'),
    configDir: path.join(installDir, ...CONFIG_PARTS),
  };
}

function normaliseInstallDir(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Choose a server installation folder first.');
  const dir = path.resolve(value.trim());
  if (dir === path.parse(dir).root) throw new Error('Choose a folder inside a drive, not the drive itself.');
  return dir;
}

async function fileExists(file) {
  try { await fsp.access(file); return true; } catch (e) { return false; }
}

function serverStatus() {
  if (!managedServer) return { running: false };
  return {
    running: !managedServer.process.killed,
    installDir: managedServer.installDir,
    startedAt: managedServer.startedAt,
  };
}

function streamEvent(message) {
  // No log cache lives here. An inactive app means no subscribers, so the
  // game's stdout/stderr chunks do not consume unbounded memory or disk.
  const wire = 'data: ' + JSON.stringify(message) + '\n\n';
  for (const response of [...subscribers]) {
    if (response.destroyed || response.writableEnded) {
      subscribers.delete(response);
      continue;
    }
    response.write(wire);
  }
}

function broadcastStatus() {
  streamEvent({ type: 'status', status: serverStatus() });
}

async function removeOwnDescriptor() {
  try {
    const current = JSON.parse(await fsp.readFile(descriptorFile, 'utf8'));
    if (current.pid === process.pid && current.token === token) await fsp.unlink(descriptorFile);
  } catch (e) { /* descriptor is already absent or belongs to a replacement */ }
}

function scheduleIdleExit() {
  clearTimeout(idleTimer);
  if (managedServer || subscribers.size) return;
  // Do not leave an empty background process behind merely because someone
  // opened the page. A running game server always keeps this helper alive.
  idleTimer = setTimeout(async () => {
    if (managedServer || subscribers.size) return;
    await removeOwnDescriptor();
    httpServer.close(() => process.exit(0));
  }, 30000);
  idleTimer.unref();
}

function validLaunchSpec(value) {
  if (!value || typeof value.query !== 'string' || !Array.isArray(value.args)) {
    throw new Error('The local server launch settings were invalid.');
  }
  if (!value.query.trim() || value.query.length > 4096 || /[\u0000\r\n]/.test(value.query)) {
    throw new Error('The local server map/query argument is invalid.');
  }
  if (value.args.length > 100 || value.args.some((arg) => typeof arg !== 'string' || arg.length > 4096 || /[\u0000\r\n]/.test(arg))) {
    throw new Error('One of the local server launch arguments is invalid.');
  }
  return { query: value.query.trim(), args: value.args };
}

async function startServer(installDir, launch) {
  const paths = serverPaths(normaliseInstallDir(installDir));
  if (managedServer && !managedServer.process.killed) {
    if (managedServer.installDir === paths.root) return serverStatus();
    throw new Error('A different local server is already being managed. Stop it before starting another one.');
  }
  if (!await fileExists(paths.exe)) throw new Error('The ARK dedicated server is not installed in this folder yet.');
  const spec = validLaunchSpec(launch);
  const child = spawn(paths.exe, [spec.query, ...spec.args], {
    cwd: path.dirname(paths.exe),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  managedServer = { process: child, installDir: paths.root, startedAt: Date.now() };
  const forward = (stream, name) => stream.on('data', (chunk) => {
    if (subscribers.size) streamEvent({ type: 'output', stream: name, text: chunk.toString() });
  });
  forward(child.stdout, 'stdout');
  forward(child.stderr, 'stderr');
  child.stdin.on('error', () => {});
  child.on('error', (error) => streamEvent({ type: 'system', text: 'Server process error: ' + error.message }));
  child.on('close', (code, signal) => {
    managedServer = null;
    streamEvent({ type: 'system', text: 'Server stopped' + (code !== null ? ' (exit code ' + code + ')' : signal ? ' (' + signal + ')' : '') + '.' });
    broadcastStatus();
    scheduleIdleExit();
  });
  broadcastStatus();
  return serverStatus();
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536) request.destroy(new Error('Request body is too large.'));
    });
    request.on('error', reject);
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Request body was not valid JSON.')); }
    });
  });
}

function respond(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

const httpServer = http.createServer(async (request, response) => {
  if (request.headers['x-arkcc-token'] !== token) return respond(response, 401, { error: 'Unauthorized' });
  try {
    if (request.method === 'GET' && request.url === '/health') return respond(response, 200, { ok: true, ...serverStatus() });
    if (request.method === 'GET' && request.url === '/status') return respond(response, 200, serverStatus());
    if (request.method === 'GET' && request.url === '/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      response.write('data: ' + JSON.stringify({ type: 'status', status: serverStatus() }) + '\n\n');
      subscribers.add(response);
      clearTimeout(idleTimer);
      request.on('close', () => {
        subscribers.delete(response);
        scheduleIdleExit();
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/start') {
      const body = await readJson(request);
      return respond(response, 200, await startServer(body.installDir, body.launch));
    }
    if (request.method === 'POST' && request.url === '/console') {
      const body = await readJson(request);
      if (!managedServer || managedServer.process.killed) throw new Error('No managed local server is running.');
      if (typeof body.command !== 'string' || !body.command.trim() || body.command.length > 1000 || /[\u0000\r\n]/.test(body.command)) {
        throw new Error('Enter one console command at a time.');
      }
      managedServer.process.stdin.write(body.command.trim() + '\r\n');
      return respond(response, 200, { ok: true });
    }
    return respond(response, 404, { error: 'Not found' });
  } catch (error) {
    return respond(response, 400, { error: error.message || 'Service request failed.' });
  }
});

async function start() {
  await fsp.mkdir(stateDir, { recursive: true });
  httpServer.listen(0, '127.0.0.1', async () => {
    const address = httpServer.address();
    await fsp.writeFile(descriptorFile, JSON.stringify({ pid: process.pid, port: address.port, token }), 'utf8');
    scheduleIdleExit();
  });
}

httpServer.on('error', async () => {
  await removeOwnDescriptor();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  if (managedServer) return; // never take the game down merely to close the app
  await removeOwnDescriptor();
  process.exit(0);
});

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
