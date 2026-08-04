/* =========================================================================
   ARK Config Creator — user accounts (desktop app only).
   When running inside Electron (window.arkcc exists), the app is gated behind
   a local login. Each account gets its own config state, stored in the app's
   local database; the browser build keeps working exactly as before.
   ========================================================================= */
'use strict';

let currentUser = null;
let persistTimer = null;
let appInitialized = false;   // init() wires one-time listeners — only run it once per page load

const isDesktopApp = () => typeof window !== 'undefined' && !!window.arkcc;

/** Reads the current account's saved state out of localStorage. */
function currentStateJson() {
  return localStorage.getItem(LS_KEY) || '{}';
}

/* called by app.js whenever state is saved — mirrors it into the local DB */
function authPersist() {
  if (!isDesktopApp() || !currentUser) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    window.arkcc.saveState(currentUser.id, currentStateJson());
  }, APP_TIMEOUTS.STATE_PERSIST_DEBOUNCE_MS);
}

/* Writes the account's state straight through, skipping both debounces: the
   one in app.js (state -> localStorage) and the one above (localStorage -> DB).
   Used on the two paths where there is no later chance to save. */
function authFlushState() {
  if (typeof flushPendingState === 'function') flushPendingState();
  clearTimeout(persistTimer);
  if (currentUser && window.arkcc.saveStateNow) {
    window.arkcc.saveStateNow(currentUser.id, currentStateJson());
  }
}

async function authBoot() {
  // the debounced DB mirror could lose the very last edit when the window
  // closes — flush it synchronously on the way out
  window.addEventListener('beforeunload', authFlushState);

  const session = await window.arkcc.session();
  if (session.user) {
    await enterApp(session.user);
  } else {
    showAuthOverlay();
  }
  reportStorageIssue(session.issue);
}

/* The database layer rescues an unreadable account store instead of silently
   starting an empty one, and refuses to pretend a broken SQLite file is simply
   "not available". Either case is invisible to the user unless we say so —
   without this they would just see every account and setting gone. */
function reportStorageIssue(issue) {
  if (!issue || typeof toast !== 'function') return;
  const messages = {
    'json-corrupt': 'Your saved accounts file could not be read and was set aside'
      + (issue.backupPath ? ' as ' + issue.backupPath : '') + '. Nothing was deleted.',
    'sqlite-open-failed': 'The accounts database could not be opened, so this session is not saving to it. '
      + 'Close any other copy of ARK Config Creator and restart.',
  };
  toast(messages[issue.kind] || issue.message || 'There was a problem opening your saved data.');
}

async function enterApp(user) {
  // anything the previous account still had queued belongs to the previous
  // account's key — never let it land under the new one
  if (typeof flushPendingState === 'function') flushPendingState();

  currentUser = user;
  LS_KEY = LS_KEY_BASE + '.u' + user.id;

  // the database is the source of truth for this user's settings
  const stored = await window.arkcc.loadState(user.id);
  if (stored.ok && stored.json) {
    localStorage.setItem(LS_KEY, stored.json);
  } else {
    // first login on this account: adopt any pre-account data from the web build
    const legacy = localStorage.getItem(LS_KEY_BASE);
    if (legacy) {
      localStorage.setItem(LS_KEY, legacy);
      window.arkcc.saveState(user.id, legacy);
    } else {
      localStorage.removeItem(LS_KEY);
    }
  }

  removeAuthOverlay();
  document.body.classList.remove('logged-out');

  if (window.arkcc.version) {
    window.arkcc.version().then((v) => {
      const el = document.getElementById('appVersion');
      if (el && v) el.textContent = v;
    }).catch(() => { /* footer keeps its static version */ });
  }

  if (!appInitialized) {
    init();                 // first entry: wire listeners + build UI
    appInitialized = true;
  } else {
    // re-entry after an in-place logout: reload THIS user's state and re-render
    // (never re-run init — its one-time listeners must not be bound twice, and
    // re-running it would duplicate every header button)
    resetState();
    loadState();
    document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
    currentCat = 'basics';
    searchTerm = '';
    if ($('searchBox')) $('searchBox').value = '';
    buildSidebar();
    render();
    refreshBadges();
    maybeShowSetupWizard();
  }
  addAccountChip();
}

function removeAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.remove();
}

/* Account switching happens in place, so every page that caches something
   about the signed-in user has to be told to forget it. Without this, user B
   arrived to user A's deploy log and A's live server console.

   Each hook is feature-detected: these files are separate <script> tags, and a
   missing (or later removed) hook must never break logging in. */
function resetSharedUiState() {
  if (typeof resetLocalServerUiState === 'function') resetLocalServerUiState();
  if (typeof resetDeployUiState === 'function') resetDeployUiState();
  if (typeof resetModsUiState === 'function') resetModsUiState();

  // app.js keeps two pieces of view state outside `state` — reset them and the
  // controls that display them, so the next account starts on a clean screen
  changedOnly = false;
  const changedOnlyBox = document.getElementById('chkChangedOnly');
  if (changedOnlyBox) changedOnlyBox.checked = false;

  exportTab = 'gus';
  document.querySelectorAll('#exportTabs .tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.file === exportTab);
  });
}

/* In-place logout — no page reload (reloading proved fragile: it could leave
   the login inputs unfocusable). Tear down the session, hide the app and show
   a fresh login screen. */
async function doLogout() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());   // no top-layer dialog may cover the login
  // flush the pending debounced saves — logging out must not drop the last edit
  authFlushState();
  await window.arkcc.logout();
  currentUser = null;
  const chip = document.getElementById('btnLogout');
  if (chip) chip.remove();
  resetSharedUiState();
  showAuthOverlay();
}

function addAccountChip() {
  const btns = document.querySelector('.hbtns');
  if (!btns || document.getElementById('btnLogout')) return;   // re-entry must not add a second chip
  const chip = uiButton(btns, {
    title: 'Log out of ' + currentUser.username,
    html: uiIcon('shield', 15) + ' ' + esc(currentUser.username),
    onClick: () => {
      if (!confirm('Log out? Your settings are saved to your account.')) return;
      doLogout();
    },
  });
  chip.id = 'btnLogout';
}

/* ---------------- login / register overlay ---------------- */
function showAuthOverlay() {
  removeAuthOverlay();                       // never stack two overlays
  document.body.classList.add('logged-out'); // hide the app so nothing overlaps the inputs

  const overlay = uiElement('div', { className: 'auth-overlay', parent: document.body });
  overlay.id = 'authOverlay';
  const card = uiElement('div', { className: 'auth-card', parent: overlay });

  uiElement('img', {
    className: 'auth-logo',
    attrs: { src: 'logo.png', alt: 'ARK Config Creator' },
    parent: card,
  });
  const title = uiElement('h2', { text: 'Log in', parent: card });
  title.id = 'authTitle';
  uiStatusLine(card, 'Accounts live only on this PC — each one keeps its own server configs.').id = 'authSub';

  const userInput = uiField(card, { label: 'Username', id: 'authUser', autocomplete: 'username' });
  const passInput = uiField(card, { label: 'Password', id: 'authPass', type: 'password', autocomplete: 'current-password' });
  const rememberLabel = uiElement('label', {
    className: 'auth-remember',
    html: '<input id="authRemember" type="checkbox" checked> Stay signed in on this PC',
    parent: card,
  });
  const rememberBox = rememberLabel.querySelector('#authRemember');

  const errorLine = uiElement('p', { className: 'auth-error', parent: card });
  errorLine.id = 'authError';
  errorLine.hidden = true;

  const submitButton = uiButton(card, { variant: 'primary', text: 'Log in' });
  submitButton.id = 'authSubmit';
  const toggleButton = uiButton(card, { text: 'New here? Create an account' });
  toggleButton.id = 'authToggle';

  let mode = 'login';
  const setMode = (m) => {
    mode = m;
    title.textContent = m === 'login' ? 'Log in' : 'Create your account';
    submitButton.textContent = m === 'login' ? 'Log in' : 'Create account';
    toggleButton.textContent = m === 'login' ? 'New here? Create an account' : 'Already have an account? Log in';
    errorLine.hidden = true;
  };
  const fail = (msg) => {
    errorLine.textContent = msg;
    errorLine.hidden = false;
  };

  const submit = async () => {
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) { fail('Enter a username and password.'); return; }

    let result;
    try {
      // withBusyButton re-enables in a `finally`. This used to be a bare
      // "disable, await, enable": db.verifyPassword compares hashes with
      // crypto.timingSafeEqual, which THROWS on a length mismatch (reachable
      // with a corrupt stored hash), so the re-enable line was skipped and the
      // login button stayed dead — no message, no way back except a restart.
      result = await withBusyButton(submitButton, () => (mode === 'login'
        ? window.arkcc.login(username, password, rememberBox.checked)
        : window.arkcc.register(username, password)));
    } catch (error) {
      fail('Could not ' + (mode === 'login' ? 'log in' : 'create the account')
        + ': ' + ((error && error.message) || 'unexpected error') + '. Please try again.');
      return;
    }
    if (!result || !result.ok) { fail((result && result.error) || 'Something went wrong.'); return; }
    await enterApp(result.user);
  };

  toggleButton.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
  submitButton.addEventListener('click', submit);
  // Enter submits only from the text fields — on the buttons it must keep its
  // native click behavior (e.g. Enter on "Create an account" toggles the mode)
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') submit();
  });
  // focus after the element is laid out, and make sure the window itself is focused
  if (window.focus) window.focus();
  requestAnimationFrame(() => userInput.focus());
}
