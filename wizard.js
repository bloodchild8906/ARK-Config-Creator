/* =========================================================================
   ARK Config Creator — first-run setup wizard.
   Appears once for a completely fresh setup (no settings, no mods, never
   completed or skipped before) and walks a new server owner from zero to a
   ready config in three friendly steps: basics → playstyle → done.
   Works in both the desktop app (after login) and the browser build.

   Layout: the four step templates live in WIZARD_STEPS and are pure functions
   of the answer sheet; the answers are read back by wizardCollect() and
   written to the real config by wizardApplyChoices(). showSetupWizard() only
   owns the dialog element and the current step.
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

/** Index of the final (summary) step. */
const WIZARD_LAST_STEP = 3;

/** A fresh answer sheet. Defaults match what a bare ASA server would run. */
function wizardDefaults() {
  return {
    name: '',
    joinPw: '',
    adminPw: '',
    map: ASA_SERVER.DEFAULT_MAP,
    players: ASA_SERVER.DEFAULT_MAX_PLAYERS,
    preset: 'vanilla',
  };
}

/** The progress dots above every step. */
function wizardDots(step) {
  return `<div class="wiz-dots">${[0, 1, 2, 3].map((i) =>
    `<span class="wiz-dot${i === step ? ' on' : ''}${i < step ? ' done' : ''}"></span>`).join('')}</div>`;
}

/* Step templates, indexed by step number. Each is a pure function of the
   answer sheet and returns the inner markup of `.wiz-body`; nothing here
   touches the DOM or the app state, which keeps the steps easy to reorder.
   Control ids are the contract with wizardCollect() and wizardBindStep():
   #wizNext, #wizBack, #wizSkip. */
const WIZARD_STEPS = [
  /* 0 — welcome */
  () => `
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

  /* 1 — server basics */
  (data) => `
      <h2>${uiIcon('server', 20)} Server basics</h2>
      <p class="opt-help">Only the name is really needed — passwords are optional.</p>
      ${uiFieldMarkup({ label: 'Server name', id: 'wizName', value: data.name, placeholder: 'My Awesome ARK Server' })}
      ${uiFieldMarkup({ label: 'Join password (optional — empty = public)', id: 'wizJoinPw', value: data.joinPw })}
      ${uiFieldMarkup({ label: 'Admin password (for cheats & RCON)', id: 'wizAdminPw', value: data.adminPw, placeholder: 'choose a strong password' })}
      <div class="builder-field"><label>Map</label>
        <select id="wizMap">${MAPS.filter((m) => m.id !== '__custom').map((m) =>
    `<option value="${esc(m.id)}"${m.id === data.map ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      ${uiFieldMarkup({ label: 'Player slots', id: 'wizPlayers', type: 'number', value: data.players })}
      <div class="wiz-actions">
        <button class="btn" id="wizBack">${uiIcon('back', 14)} Back</button>
        <button class="btn primary" id="wizNext">Next ${uiIcon('chevdown', 14)}</button>
        <button class="btn" id="wizSkip">Skip setup</button>
      </div>`,

  /* 2 — playstyle preset */
  (data) => `
      <h2>${uiIcon('gamepad', 20)} Pick a playstyle</h2>
      <p class="opt-help">A starting point for rates and rules — every value stays fully adjustable.</p>
      <div class="wiz-presets">
        <label class="wiz-preset${data.preset === 'vanilla' ? ' on' : ''}">
          <input type="radio" name="wizPreset" value="vanilla"${data.preset === 'vanilla' ? ' checked' : ''}>
          <b>Vanilla</b><span>Untouched official 1× settings.</span>
        </label>
        ${PRESETS.map((p) => `
        <label class="wiz-preset${data.preset === p.id ? ' on' : ''}">
          <input type="radio" name="wizPreset" value="${esc(p.id)}"${data.preset === p.id ? ' checked' : ''}>
          <b>${esc(p.name)}</b><span>${esc(p.desc)}</span>
        </label>`).join('')}
      </div>
      <div class="wiz-actions">
        <button class="btn" id="wizBack">${uiIcon('back', 14)} Back</button>
        <button class="btn primary" id="wizNext">Next ${uiIcon('chevdown', 14)}</button>
        <button class="btn" id="wizSkip">Skip setup</button>
      </div>`,

  /* 3 — summary */
  (data) => {
    const preset = PRESETS.find((p) => p.id === data.preset);
    const map = MAPS.find((m) => m.id === data.map);
    return `
      <h2>${uiIcon('check', 20)} Ready to go!</h2>
      <div class="wiz-summary">
        <div>${uiIcon('server', 14)} <b>${esc(data.name.trim() || 'Unnamed server')}</b> on ${esc((map || {}).name || data.map)} · ${esc(String(data.players))} players</div>
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
];

/**
 * Reads the controls of the step currently on screen back into `data`.
 * Steps 0 and 3 have nothing to read.
 *
 * @param {HTMLDialogElement} dlg
 * @param {number} step
 * @param {object} data  mutated in place
 */
function wizardCollect(dlg, step, data) {
  const value = (id) => dlg.querySelector('#' + id)?.value;
  if (step === 1) {
    data.name = value('wizName') ?? data.name;
    data.joinPw = value('wizJoinPw') ?? data.joinPw;
    data.adminPw = value('wizAdminPw') ?? data.adminPw;
    data.map = value('wizMap') ?? data.map;
    data.players = value('wizPlayers') ?? data.players;
  }
  if (step === 2) {
    const picked = dlg.querySelector('input[name="wizPreset"]:checked');
    if (picked) data.preset = picked.value;
  }
}

/**
 * Writes the collected answers into the real option/launch state. Called once,
 * when the user finishes the last step.
 */
function wizardApplyChoices(data) {
  const set = (key, value) => {
    const o = optByKey.get(key.toLowerCase());
    if (o && value !== '') setValSilent(o, value);
  };
  set('SessionName', data.name.trim());
  set('ServerPassword', data.joinPw);
  set('ServerAdminPassword', data.adminPw);
  if (data.map) state.launch.map = data.map;

  /* Only a deliberate, readable, non-default slot count is stored — an empty
     or unparseable box must never land in the launch args as NaN. */
  const players = parseInt(data.players, 10);
  if (Number.isFinite(players) && players > 0 && players !== ASA_SERVER.DEFAULT_MAX_PLAYERS) {
    state.launch.maxPlayers = players;
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
}

/**
 * Attaches every listener of the step currently on screen. Each step change
 * replaces the dialog's markup wholesale, so this is called again after every
 * render — keeping it in one place is what makes that safe.
 *
 * @param {HTMLDialogElement} dlg
 * @param {{ skip: () => void, back: () => void, next: () => void }} actions
 */
function wizardBindStep(dlg, actions) {
  dlg.querySelectorAll('[data-legal]').forEach((b) =>
    b.addEventListener('click', () => showLegalDialog(b.dataset.legal)));
  dlg.querySelector('#wizSkip')?.addEventListener('click', actions.skip);
  dlg.querySelector('#wizBack')?.addEventListener('click', actions.back);
  dlg.querySelector('#wizNext')?.addEventListener('click', actions.next);
  // keep the radio highlight in sync with the actual selection
  dlg.querySelectorAll('input[name="wizPreset"]').forEach((r) => r.addEventListener('change', () => {
    dlg.querySelectorAll('.wiz-preset').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
  }));
}

/** Opens the first-run wizard. Kept global: app.js and the smoke test call it. */
function showSetupWizard() {
  document.getElementById('dlgWizard')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'dlgWizard';
  dlg.className = 'wizard';
  document.body.appendChild(dlg);

  const data = wizardDefaults();
  let step = 0;

  /* Finishing and skipping both mark the wizard done — it is a first-run
     experience, so it must not reappear on the next launch either way. */
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

  const renderStep = () => {
    dlg.innerHTML = `<div class="wiz-body">${wizardDots(step)}${WIZARD_STEPS[step](data)}</div>`;
    wizardBindStep(dlg, {
      skip: () => finishWizard(false),
      back: () => { wizardCollect(dlg, step, data); step--; renderStep(); },
      next: () => {
        wizardCollect(dlg, step, data);
        if (step === WIZARD_LAST_STEP) { wizardApplyChoices(data); finishWizard(true); return; }
        step++;
        renderStep();
      },
    });
  };

  renderStep();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); });   // Esc must not half-close it
  dlg.showModal();
}
