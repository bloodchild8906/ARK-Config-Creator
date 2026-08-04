/* =========================================================================
   ARK Config Creator — local storage layer (main process).
   Primary backend: SQLite via node:sqlite (built into Electron's Node runtime,
   no native compilation). If it is ever unavailable, a JSON-file backend with
   the same interface takes over — the app must never fail to start because of
   a database.
   Passwords are stored as scrypt hashes with per-user random salts.
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let backend = null;
let sqliteHandle = null;   // kept so close() can checkpoint the WAL on quit

/* ---------------- password hashing ---------------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

/* ---------------- SQLite backend (node:sqlite — built into Electron's Node) ---------------- */
function sqliteBackend(dir) {
  const { DatabaseSync } = require('node:sqlite');
  const sql = new DatabaseSync(path.join(dir, 'arkcc.db'));
  sqliteHandle = sql;
  sql.exec('PRAGMA journal_mode = WAL;');
  sql.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  return {
    kind: 'sqlite',
    getUser: (username) => sql.prepare('SELECT * FROM users WHERE username = ?').get(username),
    getUserById: (id) => sql.prepare('SELECT * FROM users WHERE id = ?').get(id),
    addUser: (username, salt, hash) =>
      sql.prepare('INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)')
        .run(username, salt, hash, new Date().toISOString()).lastInsertRowid,
    getState: (userId) => {
      const row = sql.prepare('SELECT json FROM user_state WHERE user_id = ?').get(userId);
      return row ? row.json : null;
    },
    setState: (userId, json) =>
      sql.prepare(`INSERT INTO user_state (user_id, json, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`)
        .run(userId, json, new Date().toISOString()),
    getSetting: (key) => {
      const row = sql.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
      return row ? row.value : null;
    },
    setSetting: (key, value) =>
      sql.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value),
  };
}

/* ---------------- JSON-file fallback backend ---------------- */
function jsonBackend(dir) {
  const file = path.join(dir, 'arkcc.json');
  let data = { users: [], state: {}, settings: {}, nextId: 1 };
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* fresh store */ }
  const persist = () => fs.writeFileSync(file, JSON.stringify(data));
  return {
    kind: 'json',
    getUser: (username) => data.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase()),
    getUserById: (id) => data.users.find((u) => u.id === id),
    addUser: (username, salt, hash) => {
      const id = data.nextId++;
      data.users.push({ id, username, salt, hash, created_at: new Date().toISOString() });
      persist();
      return id;
    },
    getState: (userId) => data.state[userId] || null,
    setState: (userId, json) => { data.state[userId] = json; persist(); },
    getSetting: (key) => (key in data.settings ? data.settings[key] : null),
    setSetting: (key, value) => { data.settings[key] = value; persist(); },
  };
}

/* ---------------- public API ---------------- */
let currentUser = null;   // { id, username } for this app run

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  try {
    backend = sqliteBackend(dir);
  } catch (e) {
    console.warn('SQLite unavailable (' + e.message + ') — using JSON store.');
    backend = jsonBackend(dir);
  }
  // restore a remembered session
  const rememberedId = parseInt(backend.getSetting('rememberedUserId') || '', 10);
  if (rememberedId) {
    const user = backend.getUserById(rememberedId);
    if (user) currentUser = { id: user.id, username: user.username };
  }
}

function registerUser(username, password) {
  username = String(username || '').trim();
  if (!/^[A-Za-z0-9_ .-]{2,32}$/.test(username)) return { ok: false, error: 'Pick a username of 2–32 letters, numbers or spaces.' };
  if (String(password || '').length < 4) return { ok: false, error: 'The password needs at least 4 characters.' };
  if (backend.getUser(username)) return { ok: false, error: 'That username already exists on this PC — log in instead.' };
  const { salt, hash } = hashPassword(password);
  const id = backend.addUser(username, salt, hash);
  currentUser = { id, username };
  backend.setSetting('rememberedUserId', String(id));
  return { ok: true, user: currentUser };
}

function login(username, password, remember) {
  const user = backend.getUser(String(username || '').trim());
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return { ok: false, error: 'Wrong username or password.' };
  }
  currentUser = { id: user.id, username: user.username };
  backend.setSetting('rememberedUserId', remember === false ? '' : String(user.id));
  return { ok: true, user: currentUser };
}

function logout() {
  currentUser = null;
  backend.setSetting('rememberedUserId', '');
  return { ok: true };
}

function currentSession() {
  return { ok: true, user: currentUser, storage: backend.kind };
}

function loadUserState(userId) {
  if (!currentUser || currentUser.id !== userId) return { ok: false, error: 'Not logged in.' };
  return { ok: true, json: backend.getState(userId) };
}

function saveUserState(userId, json) {
  if (!currentUser || currentUser.id !== userId) return { ok: false, error: 'Not logged in.' };
  backend.setState(userId, String(json));
  return { ok: true };
}

/* non-user app settings (window bounds etc.) */
function getAppSetting(key) { return backend ? backend.getSetting(key) : null; }
function setAppSetting(key, value) { if (backend) backend.setSetting(key, String(value)); }

/* checkpoint + close SQLite on quit so no stray -wal file is left behind */
function close() {
  if (sqliteHandle) {
    try { sqliteHandle.close(); } catch (e) { /* already closed */ }
    sqliteHandle = null;
  }
}

module.exports = {
  init, registerUser, login, logout, currentSession,
  loadUserState, saveUserState, getAppSetting, setAppSetting, close,
};
