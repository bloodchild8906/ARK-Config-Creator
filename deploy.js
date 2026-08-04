/* =========================================================================
   ARK Config Creator — deploy integrations.
   Reads and deploys GameUserSettings.ini / Game.ini directly on game-server
   hosts, plus optional restart:

   - nitrado      official REST API (verified CORS-open for browsers)
   - pterodactyl  any Pterodactyl/WISP panel — Legion Hosting and most indie
                  ASA hosts run one (some panels block browser access; the UI
                  explains that when it happens)
   - selfhosted   a server on this PC via the File System Access API

   Connection presets live ONLY in this browser's storage and are deliberately
   excluded from shared setup exports — API tokens must never travel in a
   profile file.
   ========================================================================= */
'use strict';

/* The two files we read and write, and where they live on a server — both come
   from constants.js so the deploy layer, the main process and the local-server
   helper can never disagree about a name or a path. */
const CONFIG_FILES = [ASA_SERVER.FILES.GAME_USER_SETTINGS, ASA_SERVER.FILES.GAME];

/* The tail of the config path ("…/Config/WindowsServer"): if the user picked
   one of these folders directly there is nothing left to walk down. */
const CONFIG_FOLDER_NAMES = ASA_SERVER.CONFIG_PARTS.slice(-2);

let deployInFlight = false;              // one operation at a time, app-wide
const DEPLOY_LOG_LINES = 200;
const deployLogLines = new Map();        // profileId -> log buffer (survives re-renders)

/** The log buffer for a profile, created on first use. */
function deployLogBuffer(profileId) {
  let buffer = deployLogLines.get(profileId);
  if (!buffer) {
    buffer = createLogBuffer({ limit: DEPLOY_LOG_LINES });
    deployLogLines.set(profileId, buffer);
  }
  return buffer;
}

/* ---------------------------------------------------------------------------
   Network failure reporting.

   `fetch` rejects with the same opaque TypeError whether the machine is
   offline, DNS failed, the certificate is bad or the response lacked CORS
   headers. Reporting all of them as "the panel blocks CORS" sent users chasing
   the wrong problem, so distinguish everything the browser does tell us and
   only mention CORS as one candidate of several.
   --------------------------------------------------------------------------- */

/**
 * @param {unknown} error the rejection from `fetch`
 * @param {string} url    the URL we tried to reach
 * @param {string} what   human name of the target, e.g. 'the panel'
 */
function describeFetchFailure(error, url, what) {
  const name = error && error.name;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'This PC is offline — reconnect and try again.';
  }
  if (name === 'AbortError' || name === 'TimeoutError') {
    return `${what} did not answer in time — it may be slow or down right now.`;
  }
  if (typeof location !== 'undefined' && location.protocol === 'https:' && /^http:\/\//i.test(String(url))) {
    return `${what} is served over plain http://, which this page is not allowed to contact. Use its https:// address.`;
  }
  if (name === 'TypeError') {
    return `Could not reach ${what} at all. The address may be wrong or the host down (DNS), its certificate may not be trusted (HTTPS),`
      + ` or it may refuse cross-site access from a browser (CORS). If this keeps failing, use Create Files and upload the files yourself.`;
  }
  return `Could not reach ${what}: ${(error && error.message) || 'unknown error'}`;
}

/* ---------------- state ---------------- */
function deployState() {
  if (!state.deploy) state.deploy = { profiles: [], activeId: null, restartAfter: false };
  if (!Array.isArray(state.deploy.profiles)) state.deploy.profiles = [];
  return state.deploy;
}
function activeProfile() {
  const d = deployState();
  return d.profiles.find((p) => p.id === d.activeId) || null;
}
function saveProfile(profile) {
  const d = deployState();
  const existing = d.profiles.findIndex((p) => p.id === profile.id);
  if (existing >= 0) d.profiles[existing] = profile;
  else d.profiles.push(profile);
  d.activeId = profile.id;
  saveState();
}
function deleteProfile(id) {
  const d = deployState();
  d.profiles = d.profiles.filter((p) => p.id !== id);
  if (d.activeId === id) d.activeId = d.profiles.length ? d.profiles[0].id : null;
  saveState();
}
function newProfileId() {
  return 'dp' + Math.random().toString(36).slice(2, 10);
}

/* ---------------- provider: Nitrado ---------------- */
const nitrado = {
  async api(token, path, options = {}) {
    const url = 'https://api.nitrado.net' + path;
    let resp;
    try {
      resp = await fetch(url, {
        ...options,
        headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
      });
    } catch (e) {
      throw new Error(describeFetchFailure(e, url, 'Nitrado'));
    }
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.message || ('Nitrado error ' + resp.status));
    return body.data || {};
  },

  async listGameservers(token) {
    const data = await this.api(token, '/services');
    return (data.services || [])
      .filter((s) => s.type === 'gameserver')
      .map((s) => ({ id: s.id, label: `${s.details && s.details.name || 'Gameserver'} (#${s.id})` }));
  },

  async configDir(cfg) {
    const data = await this.api(cfg.token, `/services/${cfg.serviceId}/gameservers`);
    const gs = data.gameserver || {};
    const base = (gs.game_specific && gs.game_specific.path) || '';
    if (!base) throw new Error('Could not find the server file path — is this an ARK: Survival Ascended server?');
    return base.replace(/\/+$/, '') + ASA_CONFIG_POSIX_PATH;
  },

  async readFile(cfg, dir, name) {
    const q = encodeURIComponent(dir + '/' + name);
    const data = await this.api(cfg.token, `/services/${cfg.serviceId}/gameservers/file_server/download?file=${q}`);
    const grant = data.token || {};
    if (!grant.url) throw new Error('Nitrado did not return a download link for ' + name);
    const resp = await fetch(grant.url);
    if (!resp.ok) throw new Error('Download failed for ' + name);
    return resp.text();
  },

  async writeFile(cfg, dir, name, content) {
    const q = `path=${encodeURIComponent(dir)}&file=${encodeURIComponent(name)}`;
    const data = await this.api(cfg.token, `/services/${cfg.serviceId}/gameservers/file_server/upload?${q}`);
    const grant = data.token || {};
    if (!grant.url) throw new Error('Nitrado did not return an upload link for ' + name);
    const resp = await fetch(grant.url, { method: 'POST', headers: { token: grant.token, 'Content-Type': 'text/plain' }, body: content });
    if (!resp.ok) throw new Error('Upload failed for ' + name);
  },

  async restart(cfg) {
    await this.api(cfg.token, `/services/${cfg.serviceId}/gameservers/restart`, { method: 'POST' });
  },
};

/* ---------------- provider: Pterodactyl / WISP panels ---------------- */
const pterodactyl = {
  async api(cfg, path, options = {}) {
    const base = String(cfg.panelUrl || '').replace(/\/+$/, '');
    // a URL without a scheme would make fetch resolve against this app's own
    // origin — and send the API key to the wrong place
    if (!/^https?:\/\//i.test(base)) {
      throw new Error('The panel URL must start with https:// (e.g. https://panel.yourhost.com).');
    }
    let resp;
    try {
      resp = await fetch(base + path, {
        ...options,
        headers: {
          Authorization: 'Bearer ' + cfg.apiKey,
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch (e) {
      throw new Error(describeFetchFailure(e, base + path, 'the panel'));
    }
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const detail = body.errors && body.errors[0] && body.errors[0].detail;
      throw new Error(detail || ('Panel error ' + resp.status + ' — check the API key and server ID.'));
    }
    return resp;
  },

  async listServers(cfg) {
    const resp = await this.api(cfg, '/api/client');
    const body = await resp.json();
    return (body.data || []).map((s) => ({ id: s.attributes.identifier, label: `${s.attributes.name} (${s.attributes.identifier})` }));
  },

  configDir(cfg) {
    return (cfg.configDir || ASA_CONFIG_POSIX_PATH).replace(/\/+$/, '');
  },

  async readFile(cfg, dir, name) {
    const resp = await this.api(cfg, `/api/client/servers/${cfg.serverId}/files/contents?file=${encodeURIComponent(dir + '/' + name)}`);
    return resp.text();
  },

  async writeFile(cfg, dir, name, content) {
    await this.api(cfg, `/api/client/servers/${cfg.serverId}/files/write?file=${encodeURIComponent(dir + '/' + name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    });
  },

  async restart(cfg) {
    await this.api(cfg, `/api/client/servers/${cfg.serverId}/power`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal: 'restart' }),
    });
  },
};

/* ---------------- provider: self-hosted (File System Access API) ---------------- */
const selfhosted = {
  supported: () => typeof window.showDirectoryPicker === 'function',
  handles: new Map(),   // profileId -> directory handle; persisted in IndexedDB below

  /* One connection for the whole session. Every call used to open its own,
     and none of them were ever closed, so a long session leaked a connection
     per read/write and blocked any later version upgrade. */
  dbPromise: null,

  openDb() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('arkcc-deploy', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onerror = () => { this.dbPromise = null; reject(request.error); };
      request.onsuccess = () => {
        const db = request.result;
        // if the connection is closed under us (or another tab upgrades the
        // schema), drop the cache so the next call reopens
        db.onclose = () => { this.dbPromise = null; };
        db.onversionchange = () => { this.dbPromise = null; db.close(); };
        resolve(db);
      };
    });
    return this.dbPromise;
  },

  closeDb() {
    const pending = this.dbPromise;
    this.dbPromise = null;
    if (pending) pending.then((db) => db.close()).catch(() => { /* never opened */ });
  },

  async idb(mode, key, value) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', mode === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('handles');
      const req = mode === 'get' ? store.get(key) : store.put(value, key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  },

  /* each profile keeps its own folder — two self-hosted servers must never
     silently share one directory handle */
  async pickFolder(profileId) {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    this.handles.set(profileId, dir);
    await this.idb('put', 'serverDir:' + profileId, dir).catch(() => { /* persistence is best-effort */ });
    return dir.name;
  },

  async restoreHandle(profileId) {
    if (this.handles.has(profileId)) return this.handles.get(profileId);
    let saved = await this.idb('get', 'serverDir:' + profileId).catch(() => null);
    // migrate a pre-existing single-profile handle stored under the old key
    if (!saved) saved = await this.idb('get', 'serverDir').catch(() => null);
    if (!saved) return null;
    const perm = await saved.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && (await saved.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    this.handles.set(profileId, saved);
    return saved;
  },

  forget(profileId) {
    this.handles.delete(profileId);
    this.idb('put', 'serverDir:' + profileId, null).catch(() => { /* best effort */ });
  },

  /* Accepts either the server root or the WindowsServer folder itself.
     Directories are only created on the write path — a read must never
     scaffold a bogus nested tree inside an empty config folder. */
  async configDirHandle(profile, forWrite = false) {
    const root = await this.restoreHandle(profile.id);
    if (!root) throw new Error('No server folder chosen yet — click "Choose server folder" first.');
    try {
      await root.getFileHandle(ASA_SERVER.FILES.GAME_USER_SETTINGS);
      return root;
    } catch (e) {
      // NotFoundError means "this is not the config folder", which is normal
      // and we go looking below. Anything else — above all a revoked or denied
      // permission — is a real failure and must not masquerade as one.
      if (e && e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') {
        throw new Error(`Could not read the chosen folder (${e.name || 'error'}: ${e.message}). Re-pick the server folder to grant access again.`);
      }
    }
    if (CONFIG_FOLDER_NAMES.includes(root.name)) return root;
    let dir = root;
    for (const part of ASA_SERVER.CONFIG_PARTS) dir = await dir.getDirectoryHandle(part, { create: forWrite });
    return dir;
  },

  async readFile(profile, name) {
    const dir = await this.configDirHandle(profile, false);
    const fh = await dir.getFileHandle(name);
    return (await fh.getFile()).text();
  },

  async writeFile(profile, name, content) {
    const dir = await this.configDirHandle(profile, true);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  },
};

/* ---------------- provider registry ---------------- */
const DEPLOY_PROVIDERS = {
  nitrado: {
    name: 'Nitrado',
    icon: 'server',
    blurb: 'Official Nitrado API. Create a "Long Life Token" at nitrado.net → Account → Developer Portal, paste it here, then pick your server.',
    canRestart: true,
  },
  pterodactyl: {
    name: 'Pterodactyl panel',
    icon: 'globe',
    blurb: 'For Legion Hosting and every other host running a Pterodactyl/WISP panel. Create a Client API key in the panel (Account → API Credentials).',
    canRestart: true,
  },
  selfhosted: {
    name: 'Self-hosted (this PC)',
    icon: 'save',
    blurb: 'Your server runs on this machine? Point the tool at its folder once — reads and deploys then happen instantly, no copying files around.',
    canRestart: false,
  },
};

/* ---------------- read & deploy flows ---------------- */
/* resolve the remote config directory once per operation (null for selfhosted) */
async function providerDir(profile) {
  if (profile.provider === 'nitrado') return nitrado.configDir(profile.cfg);
  if (profile.provider === 'pterodactyl') return pterodactyl.configDir(profile.cfg);
  return null;
}
function providerReadFile(profile, dir, name) {
  if (profile.provider === 'nitrado') return nitrado.readFile(profile.cfg, dir, name);
  if (profile.provider === 'pterodactyl') return pterodactyl.readFile(profile.cfg, dir, name);
  return selfhosted.readFile(profile, name);
}
function providerWriteFile(profile, dir, name, content) {
  if (profile.provider === 'nitrado') return nitrado.writeFile(profile.cfg, dir, name, content);
  if (profile.provider === 'pterodactyl') return pterodactyl.writeFile(profile.cfg, dir, name, content);
  return selfhosted.writeFile(profile, name, content);
}

async function deployReadConfig(profile, log) {
  log('Reading config files from the server…');
  const dir = await providerDir(profile);
  const files = {};
  for (const name of CONFIG_FILES) files[name] = await providerReadFile(profile, dir, name);
  for (const [name, content] of Object.entries(files)) {
    log(`Importing ${name} (${content.length.toLocaleString()} bytes)…`);
    // skipRender: a mid-operation re-render would rebuild this card and
    // detach the log the user is watching
    importText(content, { skipRender: true });
  }
  buildSidebar();
  log('Done — the server\'s settings are now loaded in this tool.');
}

async function deployWriteConfig(profile, log) {
  const files = {
    [ASA_SERVER.FILES.GAME_USER_SETTINGS]: buildIniFile('gus', false),
    [ASA_SERVER.FILES.GAME]: buildIniFile('game', false),
  };
  const dir = await providerDir(profile);

  // back up each file independently — one missing file on the server must not
  // cancel the backup of the other
  for (const name of CONFIG_FILES) {
    const backupName = name + ASA_SERVER.BACKUP_SUFFIX;
    try {
      const current = await providerReadFile(profile, dir, name);
      log(`Backing up ${name} → ${backupName}…`);
      await providerWriteFile(profile, dir, backupName, current);
    } catch (e) {
      log(`No backup for ${name} (${e.message})`);
    }
  }

  for (const [name, content] of Object.entries(files)) {
    log(`Writing ${name}…`);
    await providerWriteFile(profile, dir, name, content);
  }

  // the deploy itself succeeded at this point — a restart hiccup must not
  // report the whole operation as failed
  let restarted = false;
  if (deployState().restartAfter && DEPLOY_PROVIDERS[profile.provider].canRestart) {
    try {
      log('Restarting the server…');
      if (profile.provider === 'nitrado') await nitrado.restart(profile.cfg);
      else await pterodactyl.restart(profile.cfg);
      restarted = true;
    } catch (e) {
      log('Restart failed (' + e.message + ') — restart the server yourself to apply the new settings.');
    }
  }
  log('Deployed! ' + (restarted ? 'The server is restarting with the new settings.' : 'Restart the server to apply the new settings.'));
}

/* ---------------- UI ---------------- */
function renderDeployCategory(grid) {
  const d = deployState();

  const intro = document.createElement('div');
  intro.className = 'opt-card wide';
  intro.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">Server connections</div>
      <code class="opt-key">read a server's current config, or deploy this one directly</code>
    </div></div>
    <p class="opt-help">Save a connection per server, then read or deploy with one click.
    API tokens are stored only in this browser and are never included in shared setup files.</p>`;
  grid.appendChild(intro);

  for (const p of d.profiles) grid.appendChild(deployProfileCard(p));

  grid.appendChild(deployNewConnectionCard());
}

/* One saved connection: the card markup, then the three things it can do.
   Each flow lives in its own function so the shared busy-guard below stays
   small enough to be obviously correct. */
function deployProfileCard(profile) {
  const card = deployProfileCardShell(profile);
  const logEl = card.querySelector('.deploy-log');
  const btns = card.querySelector('.mod-row-btns');

  // logs survive re-renders: the lines live in a module-level buffer and are
  // repainted whenever this profile's card is rebuilt
  const buffer = deployLogBuffer(profile.id);
  if (!buffer.isEmpty()) buffer.paint(logEl);
  const log = (msg) => { buffer.push(msg); buffer.paint(logEl); };

  /* Runs one deploy operation, app-wide exclusive.
     The in-flight flag and the button MUST be released in a `finally`: they
     used to be reset after the try/catch, so anything that threw outside the
     inner catch (a confirm() in a closed window, a render error) left
     deployInFlight stuck true and blocked every deploy for the rest of the
     session. */
  const runExclusive = async (button, work) => {
    if (deployInFlight) { toast('A deploy operation is already running — wait for it to finish.'); return; }
    deployInFlight = true;
    buffer.clear();
    logEl.textContent = '';
    try {
      await withBusyButton(button, work);
    } catch (e) {
      log('Failed: ' + e.message);
    } finally {
      deployInFlight = false;
      refreshBadges();
    }
  };

  const readBtn = uiButton(btns, {
    small: true,
    html: uiIcon('download', 14) + ' Read',
    title: 'Load this server\'s current settings into the tool',
    onClick: () => runExclusive(readBtn, () => deployReadFlow(profile, log)),
  });
  const deployBtn = uiButton(btns, {
    small: true,
    variant: 'primary',
    html: uiIcon('upload', 14) + ' Deploy',
    title: 'Write this tool\'s settings to the server',
    onClick: () => runExclusive(deployBtn, () => deployWriteFlow(profile, log)),
  });
  uiButton(btns, {
    small: true,
    html: uiIcon('x', 14),
    title: 'Delete this connection',
    onClick: () => deployDeleteFlow(profile),
  });

  if (DEPLOY_PROVIDERS[profile.provider].canRestart) {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:.76rem;color:var(--muted);cursor:pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'deploy-restart-cb';
    cb.checked = Boolean(deployState().restartAfter);
    cb.addEventListener('change', () => {
      deployState().restartAfter = cb.checked;
      saveState();
      // one shared flag — keep every card's checkbox in sync
      document.querySelectorAll('.deploy-restart-cb').forEach((other) => { other.checked = cb.checked; });
    });
    lab.append(cb, 'restart after deploy');
    btns.appendChild(lab);
  }
  return card;
}

/** The static markup of a connection card: identity, summary and empty log. */
function deployProfileCardShell(profile) {
  const provider = DEPLOY_PROVIDERS[profile.provider];
  const isActive = deployState().activeId === profile.id;
  const card = document.createElement('div');
  card.className = 'opt-card wide selected-mod-row';
  card.innerHTML = `
    <div class="mod-thumb mod-thumb-fallback">${uiIcon(provider.icon, 24)}</div>
    <div style="flex:1;min-width:0">
      <div class="opt-name">${esc(profile.name)} <span class="mod-badge">${esc(provider.name)}</span>
        ${isActive ? '<span class="mod-badge has-ini">active</span>' : ''}</div>
      <code class="opt-key">${esc(profileSummary(profile))}</code>
      <pre class="deploy-log" hidden></pre>
    </div>
    <div class="mod-row-btns"></div>`;
  return card;
}

/* Reading merges the server's files over whatever is set up locally — warn
   before touching a setup the user has been working on. */
async function deployReadFlow(profile, log) {
  const hasLocalWork = Object.keys(state.opts).length > 0 || (state.mods || []).length > 0;
  if (hasLocalWork && !confirm(`Read the config from "${profile.name}"?\nThe server's settings will be merged over your current setup here. Tip: save a profile first (Presets → Save my setup) if you want a backup.`)) return;
  deployState().activeId = profile.id;
  saveState();
  await deployReadConfig(profile, log);
}

async function deployWriteFlow(profile, log) {
  if (!confirm(`Deploy the current settings to "${profile.name}"?\nThe server's existing files are backed up as ${ASA_SERVER.BACKUP_SUFFIX} first.`)) return;
  deployState().activeId = profile.id;
  saveState();
  await deployWriteConfig(profile, log);
}

function deployDeleteFlow(profile) {
  if (!confirm(`Delete the connection "${profile.name}"?`)) return;
  if (profile.provider === 'selfhosted') selfhosted.forget(profile.id);
  deployLogLines.delete(profile.id);
  deleteProfile(profile.id);
  render();
}

function profileSummary(profile) {
  if (profile.provider === 'nitrado') return `Nitrado service #${profile.cfg.serviceId}`;
  if (profile.provider === 'pterodactyl') return `${profile.cfg.panelUrl} · server ${profile.cfg.serverId}`;
  const handle = selfhosted.handles.get(profile.id);
  return 'Local server folder' + (handle ? `: ${handle.name}` : ' (chosen once, remembered)');
}

function deployNewConnectionCard() {
  const card = document.createElement('div');
  card.className = 'opt-card wide';
  card.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">${uiIcon('plus', 15)} Add a server connection</div>
    </div></div>`;

  const form = document.createElement('div');
  form.className = 'builder-form';
  card.appendChild(form);

  const providerField = document.createElement('div');
  providerField.className = 'builder-field';
  providerField.innerHTML = '<label>Hosting provider</label>';
  const sel = document.createElement('select');
  for (const [id, p] of Object.entries(DEPLOY_PROVIDERS)) {
    const op = document.createElement('option');
    op.value = id;
    op.textContent = p.name;
    sel.appendChild(op);
  }
  providerField.appendChild(sel);
  form.appendChild(providerField);

  const blurb = document.createElement('p');
  blurb.className = 'opt-help';
  form.appendChild(blurb);

  const fieldsWrap = document.createElement('div');
  fieldsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  form.appendChild(fieldsWrap);

  const renderFields = () => {
    const provider = sel.value;
    blurb.textContent = DEPLOY_PROVIDERS[provider].blurb;
    fieldsWrap.innerHTML = '';
    if (provider === 'nitrado') deployNitradoFields(fieldsWrap);
    else if (provider === 'pterodactyl') deployPterodactylFields(fieldsWrap);
    else deploySelfhostedFields(fieldsWrap);
  };
  sel.addEventListener('change', renderFields);
  renderFields();
  return card;
}

/* A one-line status message under a form, returned as a setter. */
function deployStatus(parent) {
  const el = uiStatusLine(parent, '');
  return (msg) => { el.textContent = msg; };
}

/** The `.btn small` used throughout the connection forms. */
function deployActionButton(parent, html, primary, onClick) {
  return uiButton(parent, { small: true, variant: primary ? 'primary' : '', html, onClick });
}

function deployNitradoFields(wrap) {
  const token = uiField(wrap, { label: 'Nitrado API token (Long Life Token)', placeholder: 'paste your token…', type: 'password' });
  const nameInp = uiField(wrap, { label: 'Connection name', placeholder: 'e.g. My Island server' });
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  wrap.appendChild(row);
  const status = deployStatus(wrap);
  let serverSel = null;

  const loadBtn = deployActionButton(row, uiIcon('search', 14) + ' Load my servers', false, () => withBusyButton(loadBtn, async () => {
    if (!token.value.trim()) { status('Paste your Nitrado token first.'); return; }
    status('Asking Nitrado for your servers…');
    try {
      const servers = await nitrado.listGameservers(token.value.trim());
      if (!servers.length) { status('No gameservers found on this account.'); return; }
      if (serverSel) serverSel.remove();
      serverSel = document.createElement('select');
      for (const s of servers) {
        const op = document.createElement('option');
        op.value = s.id;
        op.textContent = s.label;
        serverSel.appendChild(op);
      }
      row.insertBefore(serverSel, row.children[1] || null);
      status(`Found ${servers.length} server${servers.length === 1 ? '' : 's'} — pick one and save.`);
    } catch (e) { status('Failed: ' + e.message); }
  }));

  deployActionButton(row, uiIcon('save', 14) + ' Save connection', true, () => {
    if (!token.value.trim() || !serverSel) { toast('Load your servers and pick one first.'); return; }
    saveProfile({
      id: newProfileId(),
      name: nameInp.value.trim() || serverSel.selectedOptions[0].textContent,
      provider: 'nitrado',
      cfg: { token: token.value.trim(), serviceId: parseInt(serverSel.value, 10) },
    });
    render();
    toast('Nitrado connection saved.');
  });
}

function deployPterodactylFields(wrap) {
  const panel = uiField(wrap, { label: 'Panel URL', placeholder: 'e.g. https://panel.legion-hosting.com' });
  const key = uiField(wrap, { label: 'Client API key', placeholder: 'ptlc_…', type: 'password' });
  const server = uiField(wrap, { label: 'Server ID', placeholder: 'e.g. a1b2c3d4 (from the panel URL or via Load)' });
  const dir = uiField(wrap, { label: 'Config folder on the server', placeholder: ASA_CONFIG_POSIX_PATH });
  const nameInp = uiField(wrap, { label: 'Connection name', placeholder: 'e.g. Legion ASA server' });
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  wrap.appendChild(row);
  const status = deployStatus(wrap);

  const loadBtn = deployActionButton(row, uiIcon('search', 14) + ' Load my servers', false, () => withBusyButton(loadBtn, async () => {
    status('Asking the panel for your servers…');
    try {
      const servers = await pterodactyl.listServers({ panelUrl: panel.value.trim(), apiKey: key.value.trim() });
      status(servers.length
        ? 'Servers: ' + servers.map((s) => s.label).join(' · ') + ' — paste the ID you want above.'
        : 'The panel returned no servers for this key.');
    } catch (e) { status(e.message); }
  }));

  deployActionButton(row, uiIcon('save', 14) + ' Save connection', true, () => {
    if (!panel.value.trim() || !key.value.trim() || !server.value.trim()) { status('Panel URL, API key and server ID are all needed.'); return; }
    saveProfile({
      id: newProfileId(),
      name: nameInp.value.trim() || 'Panel server',
      provider: 'pterodactyl',
      cfg: {
        panelUrl: panel.value.trim(),
        apiKey: key.value.trim(),
        serverId: server.value.trim(),
        configDir: dir.value.trim() || ASA_CONFIG_POSIX_PATH,
      },
    });
    render();
    toast('Panel connection saved.');
  });
}

function deploySelfhostedFields(wrap) {
  const status = deployStatus(wrap);
  if (!selfhosted.supported()) {
    status('Your browser does not support direct folder access (needs Chrome or Edge). Use Create Files instead.');
    return;
  }
  const nameInp = uiField(wrap, { label: 'Connection name', placeholder: 'e.g. My home server' });
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  wrap.appendChild(row);

  deployActionButton(row, uiIcon('folder', 14) + ' Choose server folder', true, async () => {
    try {
      const id = newProfileId();   // the folder handle is stored under this id
      const folder = await selfhosted.pickFolder(id);
      saveProfile({ id, name: nameInp.value.trim() || `This PC (${folder})`, provider: 'selfhosted', cfg: {} });
      render();
      toast(`Folder "${folder}" connected.`);
    } catch (e) {
      // the user simply closing the picker is not an error worth reporting
      if (e.name !== 'AbortError') status('Could not open the folder: ' + e.message);
    }
  });
  status('Pick your server\'s install folder (or the WindowsServer config folder directly) — remembered for next time.');
}

/**
 * Drops every module-level cache this file keeps — pending logs, folder
 * handles and the IndexedDB connection — so a different account never sees the
 * previous one's servers. Called by auth.js when the signed-in user changes;
 * nothing here calls it.
 */
function resetDeployUiState() {
  deployLogLines.clear();
  selfhosted.handles.clear();
  selfhosted.closeDb();
  deployInFlight = false;
}
