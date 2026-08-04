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

/* called by app.js whenever state is saved — mirrors it into the local DB */
function authPersist() {
  if (!isDesktopApp() || !currentUser) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    window.arkcc.saveState(currentUser.id, localStorage.getItem(LS_KEY) || '{}');
  }, 400);
}

async function authBoot() {
  // the debounced DB mirror could lose the very last edit when the window
  // closes — flush it synchronously on the way out
  window.addEventListener('beforeunload', () => {
    if (!currentUser || !window.arkcc.saveStateNow) return;
    clearTimeout(persistTimer);
    window.arkcc.saveStateNow(currentUser.id, localStorage.getItem(LS_KEY) || '{}');
  });

  const session = await window.arkcc.session();
  if (session.user) {
    await enterApp(session.user);
  } else {
    showAuthOverlay();
  }
}

async function enterApp(user) {
  currentUser = user;
  LS_KEY = 'asaConfigCreator.v1.u' + user.id;

  // the database is the source of truth for this user's settings
  const stored = await window.arkcc.loadState(user.id);
  if (stored.ok && stored.json) {
    localStorage.setItem(LS_KEY, stored.json);
  } else {
    // first login on this account: adopt any pre-account data from the web build
    const legacy = localStorage.getItem('asaConfigCreator.v1');
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
    // (never re-run init — its one-time listeners must not be bound twice)
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

/* In-place logout — no page reload (reloading proved fragile: it could leave
   the login inputs unfocusable). Tear down the session, hide the app and show
   a fresh login screen. */
async function doLogout() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());   // no top-layer dialog may cover the login
  // flush the pending debounced save — logging out must not drop the last edit
  clearTimeout(persistTimer);
  if (currentUser && window.arkcc.saveStateNow) {
    window.arkcc.saveStateNow(currentUser.id, localStorage.getItem(LS_KEY) || '{}');
  }
  await window.arkcc.logout();
  currentUser = null;
  const chip = document.getElementById('btnLogout');
  if (chip) chip.remove();
  showAuthOverlay();
}

function addAccountChip() {
  const btns = document.querySelector('.hbtns');
  if (!btns || document.getElementById('btnLogout')) return;
  const chip = document.createElement('button');
  chip.className = 'btn';
  chip.id = 'btnLogout';
  chip.title = 'Log out of ' + currentUser.username;
  chip.innerHTML = uiIcon('shield', 15) + ' ' + esc(currentUser.username);
  chip.addEventListener('click', () => {
    if (!confirm('Log out? Your settings are saved to your account.')) return;
    doLogout();
  });
  btns.appendChild(chip);
}

/* ---------------- login / register overlay ---------------- */
function showAuthOverlay() {
  removeAuthOverlay();                       // never stack two overlays
  document.body.classList.add('logged-out'); // hide the app so nothing overlaps the inputs
  const overlay = document.createElement('div');
  overlay.id = 'authOverlay';
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <img src="logo.png" alt="ARK Config Creator" class="auth-logo">
      <h2 id="authTitle">Log in</h2>
      <p class="opt-help" id="authSub">Accounts live only on this PC — each one keeps its own server configs.</p>
      <div class="builder-field"><label>Username</label><input id="authUser" type="text" autocomplete="username"></div>
      <div class="builder-field"><label>Password</label><input id="authPass" type="password" autocomplete="current-password"></div>
      <label class="auth-remember"><input id="authRemember" type="checkbox" checked> Stay signed in on this PC</label>
      <p class="auth-error" id="authError" hidden></p>
      <button class="btn primary" id="authSubmit">Log in</button>
      <button class="btn" id="authToggle">New here? Create an account</button>
    </div>`;
  document.body.appendChild(overlay);

  let mode = 'login';
  const el = (id) => overlay.querySelector('#' + id);
  const setMode = (m) => {
    mode = m;
    el('authTitle').textContent = m === 'login' ? 'Log in' : 'Create your account';
    el('authSubmit').textContent = m === 'login' ? 'Log in' : 'Create account';
    el('authToggle').textContent = m === 'login' ? 'New here? Create an account' : 'Already have an account? Log in';
    el('authError').hidden = true;
  };
  const fail = (msg) => {
    el('authError').textContent = msg;
    el('authError').hidden = false;
  };
  const submit = async () => {
    const username = el('authUser').value.trim();
    const password = el('authPass').value;
    if (!username || !password) { fail('Enter a username and password.'); return; }
    el('authSubmit').disabled = true;
    const result = mode === 'login'
      ? await window.arkcc.login(username, password, el('authRemember').checked)
      : await window.arkcc.register(username, password);
    el('authSubmit').disabled = false;
    if (!result.ok) { fail(result.error || 'Something went wrong.'); return; }
    await enterApp(result.user);
  };

  el('authToggle').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
  el('authSubmit').addEventListener('click', submit);
  // Enter submits only from the text fields — on the buttons it must keep its
  // native click behavior (e.g. Enter on "Create an account" toggles the mode)
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') submit();
  });
  // focus after the element is laid out, and make sure the window itself is focused
  if (window.focus) window.focus();
  requestAnimationFrame(() => el('authUser').focus());
}
