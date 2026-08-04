/* =========================================================================
   ARK Config Creator — persistent local server service.
   This detached helper owns ArkAscendedServer.exe and a tiny authenticated
   loopback API. It intentionally retains no console history: server output is
   streamed only to currently connected SSE clients and discarded otherwise.
   ========================================================================= */
'use strict';

const http = require('http');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { serverPaths, normaliseInstallDir, fileExists } = require('./server-paths');
const { SERVICE_API, APP_TIMEOUTS, APP_LIMITS } = require('./constants');

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const stateDir = path.resolve(readArgument('--state-dir') || '.');
const token = readArgument('--token');
const descriptorFile = path.join(stateDir, SERVICE_API.DESCRIPTOR_FILE);
const subscribers = new Set();
let managedServer = null;
let idleTimer = null;

if (!token || token.length < SERVICE_API.MIN_TOKEN_LENGTH) {
  throw new Error('The local server service requires an authentication token.');
}

const expectedToken = Buffer.from(token, 'utf8');

/* How long a politely-asked server gets before it is killed outright. ARK
   flushes its world save on shutdown, so the grace period is generous. */
const STOP_GRACE_MS = 8_000;

/**
 * Constant-time comparison of the caller's token against ours.
 * A plain `!==` leaks the position of the first wrong byte through its timing,
 * which is enough to walk a token out of a loopback service byte by byte.
 */
function tokenMatches(value) {
  if (typeof value !== 'string') return false;
  const given = Buffer.from(value, 'utf8');
  return given.length === expectedToken.length && crypto.timingSafeEqual(given, expectedToken);
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
  }, APP_TIMEOUTS.SERVICE_IDLE_EXIT_MS);
  idleTimer.unref();
}

function validLaunchSpec(value) {
  if (!value || typeof value.query !== 'string' || !Array.isArray(value.args)) {
    throw new Error('The local server launch settings were invalid.');
  }
  if (!value.query.trim() || value.query.length > APP_LIMITS.MAX_LAUNCH_ARG_LENGTH || /[\u0000\r\n]/.test(value.query)) {
    throw new Error('The local server map/query argument is invalid.');
  }
  if (value.args.length > APP_LIMITS.MAX_LAUNCH_ARGS
    || value.args.some((arg) => typeof arg !== 'string' || arg.length > APP_LIMITS.MAX_LAUNCH_ARG_LENGTH || /[\u0000\r\n]/.test(arg))) {
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
    // A late 'close' from an already-replaced child must not wipe the current
    // one out of the record.
    if (managedServer && managedServer.process === child) managedServer = null;
    streamEvent({ type: 'system', text: 'Server stopped' + (code !== null ? ' (exit code ' + code + ')' : signal ? ' (' + signal + ')' : '') + '.' });
    broadcastStatus();
    scheduleIdleExit();
  });
  broadcastStatus();
  return serverStatus();
}

/** @returns {boolean} true while the child has neither exited nor been signalled. */
function isAlive(child) {
  return child.exitCode === null && child.signalCode === null;
}

/* SIGKILL is emulated on Windows and does not reach a process tree, so ask
   Windows itself to end the game server and anything it spawned. */
function forceKill(child) {
  if (!isAlive(child)) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    killer.on('error', () => { /* nothing further we can do from here */ });
  } else {
    try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
  }
}

/**
 * Stop the managed server, if any.
 *
 * The request is answered as soon as the shutdown has been asked for: the
 * escalation to a forced kill runs on a timer so a server that ignores the
 * polite request cannot hold the HTTP response open past the client timeout.
 * Calling this with nothing running is a successful no-op.
 *
 * @returns {{running: boolean, stopping?: boolean}}
 */
function stopServer() {
  const current = managedServer;
  // Clear first: from the caller's point of view the server is on its way out,
  // and a later 'close' event must not resurrect any of this state.
  managedServer = null;
  let stopping = false;
  if (current && isAlive(current.process)) {
    stopping = true;
    streamEvent({ type: 'system', text: 'Stopping the local server…' });
    try { current.process.kill(); } catch (e) { /* it exited between the checks */ }
    const escalation = setTimeout(() => forceKill(current.process), STOP_GRACE_MS);
    escalation.unref();
    current.process.once('close', () => clearTimeout(escalation));
  }
  broadcastStatus();
  scheduleIdleExit();
  return { ...serverStatus(), stopping };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > APP_LIMITS.MAX_SERVICE_BODY_BYTES) request.destroy(new Error('Request body is too large.'));
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
  if (!tokenMatches(request.headers[SERVICE_API.TOKEN_HEADER_LOWER])) return respond(response, 401, { error: 'Unauthorized' });
  try {
    if (request.method === 'GET' && request.url === SERVICE_API.ROUTES.HEALTH) return respond(response, 200, { ok: true, ...serverStatus() });
    if (request.method === 'GET' && request.url === SERVICE_API.ROUTES.STATUS) return respond(response, 200, serverStatus());
    if (request.method === 'GET' && request.url === SERVICE_API.ROUTES.EVENTS) {
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
    if (request.method === 'POST' && request.url === SERVICE_API.ROUTES.START) {
      const body = await readJson(request);
      return respond(response, 200, await startServer(body.installDir, body.launch));
    }
    if (request.method === 'POST' && request.url === SERVICE_API.ROUTES.STOP) {
      return respond(response, 200, stopServer());
    }
    if (request.method === 'POST' && request.url === SERVICE_API.ROUTES.CONSOLE) {
      const body = await readJson(request);
      if (!managedServer || managedServer.process.killed) throw new Error('No managed local server is running.');
      if (typeof body.command !== 'string' || !body.command.trim()
        || body.command.length > APP_LIMITS.MAX_CONSOLE_COMMAND_LENGTH || /[\u0000\r\n]/.test(body.command)) {
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
  httpServer.listen(0, SERVICE_API.HOST, async () => {
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
