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

const CONFIG_FILES = ['GameUserSettings.ini', 'Game.ini'];
const SELFHOSTED_CONFIG_PATH = ['ShooterGame', 'Saved', 'Config', 'WindowsServer'];

let deployInFlight = false;              // one operation at a time, app-wide
const deployLogLines = new Map();        // profileId -> log lines (survive re-renders)

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
    const resp = await fetch('https://api.nitrado.net' + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
    });
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
    return base.replace(/\/+$/, '') + '/ShooterGame/Saved/Config/WindowsServer';
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
      throw new Error('Could not reach the panel from your browser. Many Pterodactyl panels block cross-site access (CORS) — if this keeps failing, use Create Files and upload via the panel instead.');
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
    return (cfg.configDir || '/ShooterGame/Saved/Config/WindowsServer').replace(/\/+$/, '');
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

  async idb(mode, key, value) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('arkcc-deploy', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('handles');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('handles', mode === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('handles');
        const req = mode === 'get' ? store.get(key) : store.put(value, key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      };
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
      await root.getFileHandle('GameUserSettings.ini');
      return root;
    } catch (e) { /* no config file here (yet) */ }
    if (root.name === 'WindowsServer' || root.name === 'Config') return root;
    let dir = root;
    for (const part of SELFHOSTED_CONFIG_PATH) dir = await dir.getDirectoryHandle(part, { create: forWrite });
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
    'GameUserSettings.ini': buildIniFile('gus', false),
    'Game.ini': buildIniFile('game', false),
  };
  const dir = await providerDir(profile);

  // back up each file independently — one missing file on the server must not
  // cancel the backup of the other
  for (const name of CONFIG_FILES) {
    try {
      const current = await providerReadFile(profile, dir, name);
      log(`Backing up ${name} → ${name}.bak…`);
      await providerWriteFile(profile, dir, name + '.bak', current);
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

function deployProfileCard(profile) {
  const provider = DEPLOY_PROVIDERS[profile.provider];
  const d = deployState();
  const card = document.createElement('div');
  card.className = 'opt-card wide selected-mod-row';
  card.innerHTML = `
    <div class="mod-thumb mod-thumb-fallback">${uiIcon(provider.icon, 24)}</div>
    <div style="flex:1;min-width:0">
      <div class="opt-name">${esc(profile.name)} <span class="mod-badge">${esc(provider.name)}</span>
        ${d.activeId === profile.id ? '<span class="mod-badge has-ini">active</span>' : ''}</div>
      <code class="opt-key">${esc(profileSummary(profile))}</code>
      <pre class="deploy-log" hidden></pre>
    </div>
    <div class="mod-row-btns"></div>`;
  const logEl = card.querySelector('.deploy-log');
  // logs survive re-renders: keep the lines in a module map and restore them
  // whenever this profile's card is rebuilt
  const savedLog = deployLogLines.get(profile.id);
  if (savedLog && savedLog.length) {
    logEl.hidden = false;
    logEl.textContent = savedLog.join('\n');
  }
  const log = (msg) => {
    const lines = deployLogLines.get(profile.id) || [];
    lines.push(msg);
    deployLogLines.set(profile.id, lines);
    logEl.hidden = false;
    logEl.textContent = lines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  };
  const busy = async (btn, fn) => {
    if (deployInFlight) { toast('A deploy operation is already running — wait for it to finish.'); return; }
    deployInFlight = true;
    deployLogLines.set(profile.id, []);
    logEl.textContent = '';
    btn.disabled = true;
    try { await fn(); } catch (e) { log('Failed: ' + e.message); }
    btn.disabled = false;
    deployInFlight = false;
    refreshBadges();
  };

  const btns = card.querySelector('.mod-row-btns');
  const add = (html, title, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'btn small' + (cls ? ' ' + cls : '');
    b.innerHTML = html;
    b.title = title;
    b.addEventListener('click', fn);
    btns.appendChild(b);
    return b;
  };

  const readBtn = add(uiIcon('download', 14) + ' Read', 'Load this server\'s current settings into the tool', '', () =>
    busy(readBtn, async () => {
      // reading merges the server's files over whatever is set up locally —
      // warn before touching a setup the user has been working on
      const hasLocalWork = Object.keys(state.opts).length > 0 || (state.mods || []).length > 0;
      if (hasLocalWork && !confirm(`Read the config from "${profile.name}"?\nThe server's settings will be merged over your current setup here. Tip: save a profile first (Presets → Save my setup) if you want a backup.`)) return;
      deployState().activeId = profile.id;
      saveState();
      await deployReadConfig(profile, log);
    }));
  const deployBtn = add(uiIcon('upload', 14) + ' Deploy', 'Write this tool\'s settings to the server', 'primary', () =>
    busy(deployBtn, async () => {
      if (!confirm(`Deploy the current settings to "${profile.name}"?\nThe server's existing files are backed up as .bak first.`)) return;
      deployState().activeId = profile.id;
      saveState();
      await deployWriteConfig(profile, log);
    }));
  add(uiIcon('x', 14), 'Delete this connection', '', () => {
    if (!confirm(`Delete the connection "${profile.name}"?`)) return;
    if (profile.provider === 'selfhosted') selfhosted.forget(profile.id);
    deployLogLines.delete(profile.id);
    deleteProfile(profile.id);
    render();
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

function deployField(parent, label, placeholder, type) {
  const fw = document.createElement('div');
  fw.className = 'builder-field';
  const lab = document.createElement('label');
  lab.textContent = label;
  const inp = document.createElement('input');
  inp.type = type || 'text';
  inp.placeholder = placeholder || '';
  inp.autocomplete = 'off';
  fw.append(lab, inp);
  parent.appendChild(fw);
  return inp;
}
function deployButton(parent, html, primary, fn) {
  const b = document.createElement('button');
  b.className = 'btn small' + (primary ? ' primary' : '');
  b.innerHTML = html;
  b.addEventListener('click', fn);
  parent.appendChild(b);
  return b;
}
function deployStatus(parent) {
  const el = document.createElement('p');
  el.className = 'opt-help';
  parent.appendChild(el);
  return (msg) => { el.textContent = msg; };
}

function deployNitradoFields(wrap) {
  const token = deployField(wrap, 'Nitrado API token (Long Life Token)', 'paste your token…', 'password');
  const nameInp = deployField(wrap, 'Connection name', 'e.g. My Island server');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  wrap.appendChild(row);
  const status = deployStatus(wrap);
  let serverSel = null;

  deployButton(row, uiIcon('search', 14) + ' Load my servers', false, async function () {
    if (!token.value.trim()) { status('Paste your Nitrado token first.'); return; }
    this.disabled = true;
    status('Asking Nitrado for your servers…');
    try {
      const servers = await nitrado.listGameservers(token.value.trim());
      if (!servers.length) { status('No gameservers found on this account.'); this.disabled = false; return; }
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
    this.disabled = false;
  });

  deployButton(row, uiIcon('save', 14) + ' Save connection', true, () => {
    if (!token.value.trim() || !serverSel) { deployStatusToast('Load your servers and pick one first.'); return; }
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
  const panel = deployField(wrap, 'Panel URL', 'e.g. https://panel.legion-hosting.com');
  const key = deployField(wrap, 'Client API key', 'ptlc_…', 'password');
  const server = deployField(wrap, 'Server ID', 'e.g. a1b2c3d4 (from the panel URL or via Load)');
  const dir = deployField(wrap, 'Config folder on the server', '/ShooterGame/Saved/Config/WindowsServer');
  const nameInp = deployField(wrap, 'Connection name', 'e.g. Legion ASA server');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  wrap.appendChild(row);
  const status = deployStatus(wrap);

  deployButton(row, uiIcon('search', 14) + ' Load my servers', false, async function () {
    this.disabled = true;
    status('Asking the panel for your servers…');
    try {
      const servers = await pterodactyl.listServers({ panelUrl: panel.value.trim(), apiKey: key.value.trim() });
      status(servers.length
        ? 'Servers: ' + servers.map((s) => s.label).join(' · ') + ' — paste the ID you want above.'
        : 'The panel returned no servers for this key.');
    } catch (e) { status(e.message); }
    this.disabled = false;
  });

  deployButton(row, uiIcon('save', 14) + ' Save connection', true, () => {
    if (!panel.value.trim() || !key.value.trim() || !server.value.trim()) { status('Panel URL, API key and server ID are all needed.'); return; }
    saveProfile({
      id: newProfileId(),
      name: nameInp.value.trim() || 'Panel server',
      provider: 'pterodactyl',
      cfg: {
        panelUrl: panel.value.trim(),
        apiKey: key.value.trim(),
        serverId: server.value.trim(),
        configDir: dir.value.trim() || '/ShooterGame/Saved/Config/WindowsServer',
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
  const nameInp = deployField(wrap, 'Connection name', 'e.g. My home server');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  wrap.appendChild(row);

  deployButton(row, uiIcon('folder', 14) + ' Choose server folder', true, async () => {
    try {
      const id = newProfileId();   // the folder handle is stored under this id
      const folder = await selfhosted.pickFolder(id);
      saveProfile({ id, name: nameInp.value.trim() || `This PC (${folder})`, provider: 'selfhosted', cfg: {} });
      render();
      toast(`Folder "${folder}" connected.`);
    } catch (e) {
      if (e.name !== 'AbortError') status('Could not open the folder: ' + e.message);
    }
  });
  status('Pick your server\'s install folder (or the WindowsServer config folder directly) — remembered for next time.');
}

function deployStatusToast(msg) { toast(msg); }
