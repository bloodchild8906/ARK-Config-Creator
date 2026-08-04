/* =========================================================================
   ARK Config Creator — first-run setup wizard.
   Appears once for a completely fresh setup (no settings, no mods, never
   completed or skipped before) and walks a new server owner from zero to a
   ready config in three friendly steps: basics → playstyle → done.
   Works in both the desktop app (after login) and the browser build.
   ========================================================================= */
'use strict';

function maybeShowSetupWizard() {
  if (state.wizardDone) return;
  const fresh = Object.keys(state.opts).length === 0 && (state.mods || []).length === 0;
  if (!fresh) {
    // an existing setup (e.g. imported config) never gets the wizard again
    state.wizardDone = true;
    saveState();
    return;
  }
  showSetupWizard();
}

function showSetupWizard() {
  document.getElementById('dlgWizard')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'dlgWizard';
  dlg.className = 'wizard';
  document.body.appendChild(dlg);

  const data = {
    name: '', joinPw: '', adminPw: '',
    map: 'TheIsland_WP', players: 70,
    preset: 'vanilla',
  };
  let step = 0;
  const LAST_STEP = 3;

  const finishWizard = (applied) => {
    state.wizardDone = true;
    saveState();
    dlg.close();
    dlg.remove();
    if (applied) {
      buildSidebar(); render(); refreshBadges();
      toast('Your server is set up — tweak anything you like, then Create Files or Deploy.');
    }
  };

  const applyChoices = () => {
    const set = (key, value) => {
      const o = optByKey.get(key.toLowerCase());
      if (o && value !== '') setValSilent(o, value);
    };
    set('SessionName', data.name.trim());
    set('ServerPassword', data.joinPw);
    set('ServerAdminPassword', data.adminPw);
    state.launch.map = data.map;
    if (parseInt(data.players, 10) > 0 && parseInt(data.players, 10) !== 70) {
      state.launch.maxPlayers = parseInt(data.players, 10);
    }
    if (data.preset !== 'vanilla') {
      const preset = PRESETS.find((p) => p.id === data.preset);
      if (preset) {
        for (const [k, v] of Object.entries(preset.values)) {
          const o = optByKey.get(k.toLowerCase());
          if (o) setValSilent(o, v);
        }
      }
    }
  };

  const dots = () => `<div class="wiz-dots">${[0, 1, 2, 3].map((i) =>
    `<span class="wiz-dot${i === step ? ' on' : ''}${i < step ? ' done' : ''}"></span>`).join('')}</div>`;

  const field = (label, id, type, value, placeholder) => `
    <div class="builder-field">
      <label>${label}</label>
      <input id="${id}" type="${type}" value="${esc(String(value))}" placeholder="${esc(placeholder || '')}" autocomplete="off">
    </div>`;

  const steps = {
    0: () => `
      <div class="wiz-hero">
        <img src="logo.png" alt="" class="wiz-logo" onerror="this.style.display='none'">
        <h2>Welcome!</h2>
        <p class="opt-help">Let's set up your ARK: Survival Ascended server in under a minute —
        name it, pick a map and a playstyle, and you're ready. Everything can be changed later.</p>
      </div>
      <div class="wiz-actions">
        <button class="btn primary" id="wizNext">${uiIcon('bolt', 15)} Set up my server</button>
        <button class="btn" id="wizSkip">Skip — I'll explore myself</button>
      </div>
      <p class="wiz-legal">By using this tool you accept the
        <button class="linklike" data-legal="terms">Terms of Use</button> and
        <button class="linklike" data-legal="privacy">Privacy statement</button>.</p>`,
    1: () => `
      <h2>${uiIcon('server', 20)} Server basics</h2>
      <p class="opt-help">Only the name is really needed — passwords are optional.</p>
      ${field('Server name', 'wizName', 'text', data.name, 'My Awesome ARK Server')}
      ${field('Join password (optional — empty = public)', 'wizJoinPw', 'text', data.joinPw, '')}
      ${field('Admin password (for cheats & RCON)', 'wizAdminPw', 'text', data.adminPw, 'choose a strong password')}
      <div class="builder-field"><label>Map</label>
        <select id="wizMap">${MAPS.filter((m) => m.id !== '__custom').map((m) =>
          `<option value="${m.id}"${m.id === data.map ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      ${field('Player slots', 'wizPlayers', 'number', data.players, '')}
      <div class="wiz-actions">
        <button class="btn" id="wizBack">${uiIcon('back', 14)} Back</button>
        <button class="btn primary" id="wizNext">Next ${uiIcon('chevdown', 14)}</button>
        <button class="btn" id="wizSkip">Skip setup</button>
      </div>`,
    2: () => `
      <h2>${uiIcon('gamepad', 20)} Pick a playstyle</h2>
      <p class="opt-help">A starting point for rates and rules — every value stays fully adjustable.</p>
      <div class="wiz-presets">
        <label class="wiz-preset${data.preset === 'vanilla' ? ' on' : ''}">
          <input type="radio" name="wizPreset" value="vanilla"${data.preset === 'vanilla' ? ' checked' : ''}>
          <b>Vanilla</b><span>Untouched official 1× settings.</span>
        </label>
        ${PRESETS.map((p) => `
        <label class="wiz-preset${data.preset === p.id ? ' on' : ''}">
          <input type="radio" name="wizPreset" value="${p.id}"${data.preset === p.id ? ' checked' : ''}>
          <b>${esc(p.name)}</b><span>${esc(p.desc)}</span>
        </label>`).join('')}
      </div>
      <div class="wiz-actions">
        <button class="btn" id="wizBack">${uiIcon('back', 14)} Back</button>
        <button class="btn primary" id="wizNext">Next ${uiIcon('chevdown', 14)}</button>
        <button class="btn" id="wizSkip">Skip setup</button>
      </div>`,
    3: () => {
      const preset = PRESETS.find((p) => p.id === data.preset);
      return `
      <h2>${uiIcon('check', 20)} Ready to go!</h2>
      <div class="wiz-summary">
        <div>${uiIcon('server', 14)} <b>${esc(data.name.trim() || 'Unnamed server')}</b> on ${esc((MAPS.find((m) => m.id === data.map) || {}).name || data.map)} · ${esc(String(data.players))} players</div>
        <div>${uiIcon('gamepad', 14)} Playstyle: <b>${esc(preset ? preset.name : 'Vanilla (official 1×)')}</b></div>
      </div>
      <p class="opt-help">Where to go next:</p>
      <ul class="wiz-tips">
        <li>${uiIcon('puzzle', 14)} <b>Mods</b> — pick mods from the CurseForge catalog; their settings appear as pages.</li>
        <li>${uiIcon('upload', 14)} <b>Deploy</b> — connect Nitrado, a panel host or a local server and push configs directly.</li>
        <li>${uiIcon('save', 14)} <b>Create Files</b> — download GameUserSettings.ini, Game.ini and a start script.</li>
      </ul>
      <div class="wiz-actions">
        <button class="btn" id="wizBack">${uiIcon('back', 14)} Back</button>
        <button class="btn primary" id="wizNext">${uiIcon('check', 15)} Finish — open my settings</button>
      </div>`;
    },
  };

  const collect = () => {
    const v = (id) => dlg.querySelector('#' + id)?.value;
    if (step === 1) {
      data.name = v('wizName') ?? data.name;
      data.joinPw = v('wizJoinPw') ?? data.joinPw;
      data.adminPw = v('wizAdminPw') ?? data.adminPw;
      data.map = v('wizMap') ?? data.map;
      data.players = v('wizPlayers') ?? data.players;
    }
    if (step === 2) {
      const picked = dlg.querySelector('input[name="wizPreset"]:checked');
      if (picked) data.preset = picked.value;
    }
  };

  const renderStep = () => {
    dlg.innerHTML = `<div class="wiz-body">${dots()}${steps[step]()}</div>`;
    dlg.querySelectorAll('[data-legal]').forEach((b) =>
      b.addEventListener('click', () => showLegalDialog(b.dataset.legal)));
    dlg.querySelector('#wizSkip')?.addEventListener('click', () => finishWizard(false));
    dlg.querySelector('#wizBack')?.addEventListener('click', () => { collect(); step--; renderStep(); });
    dlg.querySelector('#wizNext')?.addEventListener('click', () => {
      collect();
      if (step === LAST_STEP) { applyChoices(); finishWizard(true); return; }
      step++;
      renderStep();
    });
    // keep radio highlight in sync
    dlg.querySelectorAll('input[name="wizPreset"]').forEach((r) => r.addEventListener('change', () => {
      dlg.querySelectorAll('.wiz-preset').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
    }));
  };

  renderStep();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); });   // Esc must not half-close it
  dlg.showModal();
}
