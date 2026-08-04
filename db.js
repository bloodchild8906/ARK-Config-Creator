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

/* Anything that happened at start-up which the user deserves to be told about:
   a store we could not read, or a database we could not open. Reported through
   currentSession() so the UI can surface it instead of it living only in a
   console message nobody sees. */
let storageIssue = null;

/**
 * Records a start-up storage problem.
 * @param {'json-corrupt'|'sqlite-open-failed'} kind
 * @param {string} message  human-readable detail
 * @param {object} [extra]  e.g. { backupPath }
 */
function noteStorageIssue(kind, message, extra = {}) {
  storageIssue = { kind, message, ...extra };
  console.error('arkcc storage: ' + kind + ' — ' + message);
}

/* ---------------- password hashing ---------------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

/* timingSafeEqual *throws* when the two buffers differ in length, and a stored
   hash can easily be the wrong length: truncated by an interrupted write, or
   non-hex (Buffer.from(x,'hex') silently stops at the first bad character).
   A thrown error here would surface as a crash instead of a failed login, so
   compare lengths first and treat any mismatch as "wrong password". */
function verifyPassword(password, salt, expectedHash) {
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  const { hash } = hashPassword(password, salt);
  const actual = Buffer.from(hash, 'hex');
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/* ---------------- SQLite backend (node:sqlite — built into Electron's Node) ----------------
   Loading the module and opening the database are two different failures: the
   first means "this runtime has no SQLite" (a legitimate, quiet fallback), the
   second means "the database is there but broken", which must never be treated
   as "this user has no accounts". */
function loadSqlite() {
  try {
    return require('node:sqlite');
  } catch (e) {
    return null;   // not built into this runtime
  }
}

function sqliteBackend(dir, sqliteModule) {
  const { DatabaseSync } = sqliteModule;
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

/** Shape of a brand-new, empty JSON store. */
function emptyJsonStore() {
  return { users: [], state: {}, settings: {}, nextId: 1 };
}

/* An unreadable store used to be dropped on the floor: every account and all
   their settings vanished, and the next persist() overwrote the evidence.
   Move the file aside instead, so it can be recovered by hand, and record that
   it happened so the app can say so. */
function rescueUnreadableStore(file, error) {
  const backupPath = file + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.renameSync(file, backupPath);
    noteStorageIssue('json-corrupt',
      `The local account file could not be read (${error.message}). It was kept as ${path.basename(backupPath)} and a new empty one was started.`,
      { backupPath });
  } catch (renameError) {
    // could not even move it — say so and leave the original untouched
    noteStorageIssue('json-corrupt',
      `The local account file could not be read (${error.message}) and could not be moved aside (${renameError.message}).`);
  }
}

/** Reads the JSON store, preserving (never deleting) a file we cannot parse. */
function readJsonStore(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') rescueUnreadableStore(file, e);   // exists but unreadable (permissions, I/O)
    return emptyJsonStore();                                    // ENOENT: genuinely a fresh install
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
      throw new Error('the file is valid JSON but not an account store');
    }
    return { ...emptyJsonStore(), ...parsed };
  } catch (e) {
    rescueUnreadableStore(file, e);
    return emptyJsonStore();
  }
}

function jsonBackend(dir) {
  const file = path.join(dir, 'arkcc.json');
  const data = readJsonStore(file);

  /* Write to a temp file and rename over the original: a crash or a full disk
     mid-write can then only destroy the temp file, never the real store. This
     is what produced the corrupt files the reader above has to rescue. */
  const persist = () => {
    const temp = file + '.writing-' + process.pid;
    try {
      fs.writeFileSync(temp, JSON.stringify(data));
      fs.renameSync(temp, file);
    } catch (e) {
      try { fs.unlinkSync(temp); } catch (cleanupError) { /* nothing left to clean up */ }
      throw e;
    }
  };

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
  storageIssue = null;

  const sqliteModule = loadSqlite();
  if (!sqliteModule) {
    // No SQLite in this runtime at all — the JSON store is the intended,
    // quiet fallback and there is no existing database to worry about.
    backend = jsonBackend(dir);
  } else {
    try {
      backend = sqliteBackend(dir, sqliteModule);
    } catch (e) {
      /* SQLite exists but this database would not open — locked by another
         copy of the app, corrupt, or unreadable. The accounts are still in
         arkcc.db, so starting a blank JSON store silently would look exactly
         like "all my accounts are gone". Fall back so the app still runs, but
         make the reason available to the UI. */
      // the constructor may have succeeded and a later statement failed —
      // release the half-open handle rather than leaking it
      if (sqliteHandle) {
        try { sqliteHandle.close(); } catch (closeError) { /* never opened */ }
        sqliteHandle = null;
      }
      noteStorageIssue('sqlite-open-failed',
        `The account database could not be opened (${e.message}). Your accounts are still in arkcc.db — close any other copy of ARK Config Creator and restart. Anything you change now is stored separately.`);
      backend = jsonBackend(dir);
    }
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

/* `issue` is null in the normal case; when set, the UI can tell the user that
   their data was rescued or that this run is not using the real database. */
function currentSession() {
  return { ok: true, user: currentUser, storage: backend.kind, issue: storageIssue };
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
