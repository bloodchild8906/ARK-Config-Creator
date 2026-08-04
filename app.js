/* =========================================================================
   ARK ASA Config Creator — app logic (vanilla JS, works from file://)
   ========================================================================= */
'use strict';

/* Base localStorage key. The browser build uses it as-is; the desktop app
   swaps in a per-account key ("<base>.u<id>") the moment somebody logs in, so
   two accounts on the same PC can never read each other's settings. */
const LS_KEY_BASE = 'asaConfigCreator.v1';
// auth.js reassigns this on login. ESLint analyses one file at a time and
// cannot see the renderer's shared global scope, so it reads as never-reassigned.
// eslint-disable-next-line prefer-const
let LS_KEY = LS_KEY_BASE;

/* File-local constants for what used to be bare literals. Anything that
   crosses a process or file-format boundary (config file names, the default
   port/map/slots, timeouts) comes from constants.js instead, so the renderer
   and the main process can never drift apart. */
const PICKER_LIST_LIMIT = 200;            // picker rows drawn before "…and N more"
const SEARCH_MOD_NAME_PREVIEW = 6;        // catalog mod names listed in a search hit
/* Only used for the downloadable .bat when the user has not told us where the
   server executable lives. */
const FALLBACK_SERVER_EXE = 'C:\\ASAServer\\' + ASA_SERVER.EXE_PARTS.join('\\');

/* ---------------- state ---------------- */
let state = { opts: {}, launch: {}, theme: 'dark' };
let currentCat = 'basics';
let searchTerm = '';
let changedOnly = false;
let exportTab = 'gus';

const optByKey = new Map();
for (const o of OPTIONS) optByKey.set(o.k.toLowerCase(), o);

const cardRefs = new Map();   // option key -> {card, update()}
const $ = (id) => document.getElementById(id);

let statePersistTimer = null;   // pending debounced localStorage write
let badgeRefreshFrame = 0;      // pending coalesced badge recount

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') state = Object.assign(state, s);
    }
  } catch (e) { /* corrupted save — start fresh */ }
  if (!state.opts) state.opts = {};
  if (!state.launch) state.launch = {};
  if (!state.mods) state.mods = [];
  if (!state.modExtra) state.modExtra = {};
  if (!state.modDynIni) state.modDynIni = {};
  if (!state.modDocs) state.modDocs = {};
  if (!state.modContent) state.modContent = {};
}
/* Serialises the whole state and mirrors it into the desktop app's database.
   Callers should use saveState() — this is the uncoalesced write behind it. */
function writeStateNow() {
  clearTimeout(statePersistTimer);
  statePersistTimer = null;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  if (typeof authPersist === 'function') authPersist();   // mirror into the desktop app's database
}
/* Typing one character into a text setting fires one setVal, and every setVal
   used to JSON.stringify the entire state (~900 options plus every selected
   mod) straight into localStorage. Coalesce those writes into at most one per
   debounce window; flushPendingState() guarantees nothing is ever lost. */
function saveState() {
  if (statePersistTimer !== null) return;
  statePersistTimer = setTimeout(writeStateNow, APP_TIMEOUTS.STATE_PERSIST_DEBOUNCE_MS);
}
/** Writes a pending debounced save out immediately. A no-op when idle. */
function flushPendingState() {
  if (statePersistTimer !== null) writeStateNow();
}
/* Closing the window (or the desktop app's own beforeunload mirror in auth.js)
   must never drop the last keystroke. Registered at load time so it is in
   place before any handler that reads localStorage back. */
window.addEventListener('beforeunload', flushPendingState);

/* Wipe in-memory state back to defaults (keeps the UI theme). Used when a
   different user logs in so the previous account's data can never leak in. */
function resetState() {
  state = { opts: {}, launch: {}, theme: state.theme || 'dark' };
}

/* ---------------- value helpers ---------------- */
function getVal(o) {
  return Object.prototype.hasOwnProperty.call(state.opts, o.k) ? state.opts[o.k] : o.d;
}
function normNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function isChanged(o) {
  if (!Object.prototype.hasOwnProperty.call(state.opts, o.k)) return false;
  const v = state.opts[o.k];
  if (o.t === 'bool') return Boolean(v) !== Boolean(o.d);
  if (o.t === 'float' || o.t === 'int') {
    const a = normNum(v), b = normNum(o.d);
    return a === null ? String(v) !== String(o.d) : a !== b;
  }
  return String(v ?? '') !== String(o.d ?? '');
}
/**
 * True when `value` is indistinguishable from the field's documented default.
 *
 * Shared by every setter (`setVal`, `setValSilent`, `setLaunch`) for both
 * OPTIONS entries and LAUNCH_FIELDS entries, which share the `{ t, d }` shape.
 * Storing a value equal to the default is what makes a setting count as
 * "changed" forever and get written into the .ini, so all three delete the key
 * instead. This test used to be written out three times, twice byte-identical.
 *
 * @param {{t: string, d: *}} field an OPTIONS or LAUNCH_FIELDS entry
 * @param {*} value the candidate value
 */
function isDefaultValue(field, value) {
  if (field.t === 'bool') return Boolean(value) === Boolean(field.d);
  if (field.t === 'float' || field.t === 'int') {
    const n = normNum(value);
    // non-numeric text in a numeric field can still literally match the default
    return n === null ? String(value ?? '') === String(field.d ?? '') : n === normNum(field.d);
  }
  return String(value ?? '') === String(field.d ?? '');
}
function setVal(o, v) {
  setValSilent(o, v);
  saveState();
  scheduleBadgeRefresh();
}
function resetVal(o) {
  delete state.opts[o.k];
  saveState();
  const ref = cardRefs.get(o.k);
  if (ref) ref.update();
  refreshBadges();
}
function fmtNum(v) {
  const n = normNum(v);
  if (n === null) return String(v);
  return String(n);
}
function iniValue(o, v) {
  if (o.t === 'bool') return v ? 'True' : 'False';
  if (o.t === 'float') {
    const n = normNum(v);
    if (n === null) return String(v);
    return Number.isInteger(n) ? n.toFixed(6).replace(/0+$/, '0') : String(n);
  }
  if (o.t === 'int') {
    const n = normNum(v);
    return n === null ? String(v) : String(Math.round(n));
  }
  return String(v ?? '');
}

/* ---------------- effect estimates ("what does this rate mean?") ---------------- */
function fmtDur(sec) {
  if (sec >= 86400) {
    const d = sec / 86400;
    const v = d >= 10 ? Math.round(d) : Math.round(d * 10) / 10;
    return v + (v === 1 ? ' day' : ' days');
  }
  if (sec >= 3600) { const h = sec / 3600; return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + ' h'; }
  if (sec >= 60) return Math.round(sec / 60) + ' min';
  return Math.round(sec) + ' sec';
}
function trimNum(n) {
  return String(Math.round(n * 100) / 100);
}
/* Returns a small human sentence describing what the current value means. */
function fxText(o, vRaw) {
  const v = normNum(vRaw);
  if (v === null) return '';
  const fx = o.fx;
  if (!fx) {
    // generic: show the ratio vs default for any changed multiplier-ish float
    const d = normNum(o.d);
    if (o.t === 'float' && d && d > 0 && v !== d) return `≈ ${trimNum(v / d)}× the default`;
    return '';
  }
  if (v <= 0) return 'Careful: 0 turns this off or makes it never finish.';
  if (fx.t === 'x') {
    // concrete before → after examples
    const exs = fx.exs || (fx.exBase ? [{ base: fx.exBase, what: fx.exWhat }] : []);
    if (exs.length) {
      return 'Effect: ' + exs.map((e) => `${e.base} → ${trimNum(Math.round(e.base * v * 100) / 100)} ${e.what}`).join(' · ');
    }
    return `Effect: ≈ ${trimNum(v)}× ${fx.what || ''}`;
  }
  if (fx.t === 'time') {
    const t = fx.inv ? fx.base / v : fx.base * v;
    if (v === normNum(o.d)) return `${fx.what}: ≈ ${fmtDur(t)}`;
    return `${fx.what}: ≈ ${fmtDur(fx.base)} → ${fmtDur(t)}`;
  }
  if (fx.t === 'range') {
    const lo = fx.inv ? fx.lo / v : fx.lo * v;
    const hi = fx.inv ? fx.hi / v : fx.hi * v;
    if (v === normNum(o.d)) return `${fx.what}: ≈ ${fmtDur(lo)}–${fmtDur(hi)}`;
    return `${fx.what}: ≈ ${fmtDur(fx.lo)}–${fmtDur(fx.hi)} → ${fmtDur(lo)}–${fmtDur(hi)}`;
  }
  return '';
}

/* Concrete per-stat effect text for the 12-stat tables.
   Player baselines (vanilla): what each level point gives, and starting values. */
const PLAYER_GAIN = [10, 10, 0, 20, 10, 10, 0, 10, 5, 1.5, 2, 10];        // per level point
const PLAYER_GAIN_UNIT = ['HP', 'stamina', '', 'oxygen', 'food', 'water', '', 'weight', '% damage', '% speed', 'fortitude', '% crafting'];
const PLAYER_BASE = [100, 100, 200, 100, 100, 100, 0, 100, 100, 100, 0, 100];
const STONE_WEIGHT = 0.5;   // 1 stone weighs 0.5 → weight 100 carries 200 stone

function statFxText(grpId, i, v) {
  const name = STAT_NAMES[i];
  const r = trimNum(v);
  if (grpId === 'PerLevelStatsMultiplier_Player') {
    const g0 = PLAYER_GAIN[i];
    if (!g0) return `${name}: ${r}× per point`;
    const g1 = Math.round(g0 * v * 100) / 100;
    let s = `${name}: +${trimNum(g0)} → +${trimNum(g1)} ${PLAYER_GAIN_UNIT[i]} per point`;
    if (i === 7) s += ` (each point ≈ ${Math.round(g1 / STONE_WEIGHT)} more stone, was ${Math.round(g0 / STONE_WEIGHT)})`;
    return s;
  }
  if (grpId === 'PlayerBaseStatMultipliers') {
    const b0 = PLAYER_BASE[i];
    if (!b0) return `${name}: ${r}× starting value`;
    const b1 = Math.round(b0 * v);
    let s = `${name}: start with ${b1} instead of ${b0}`;
    if (i === 7) s += ` (carry ≈ ${Math.round(b1 / STONE_WEIGHT)} stone, was ${Math.round(b0 / STONE_WEIGHT)})`;
    return s;
  }
  // dino tables: baselines vary per species — show the per-point ratio with a Rex weight example where it helps
  if (i === 7 && (grpId === 'PerLevelStatsMultiplier_DinoTamed' || grpId === 'PerLevelStatsMultiplier_DinoWild')) {
    return `${name}: each point gives ${r}× the normal gain (Rex: +10 → +${trimNum(10 * v)} weight ≈ ${Math.round(10 * v / STONE_WEIGHT)} stone)`;
  }
  return `${name}: each point gives ${r}× the normal gain`;
}

/* ---------------- dino / engram picker ---------------- */
let pickerCtx = null;   // { pick, textarea, optName }

function pickForOption(o) {
  if (o.pick) return o.pick;
  // heuristic for mod settings: class-name fields get a picker too
  const k = (o.dk || o.k) + ' ' + (o.n || '');
  if (/classname/i.test(k)) {
    if (/engram/i.test(k)) return { t: 'engram', tpl: '{c}' };
    if (/dino|tame|breed|creature|npc/i.test(k)) return { t: 'dino', tpl: '{c}' };
  }
  return null;
}

function openPicker(pick, textarea, optName) {
  pickerCtx = { pick, textarea, optName };
  $('pickerTitle').innerHTML = pick.t === 'dino' ? uiIcon('dino', 20) + ' Pick a creature' : uiIcon('book', 20) + ' Pick an engram';
  $('pickerSearch').value = '';
  $('pickerHint').textContent = pick.hint
    || (pick.copy
      ? 'This setting uses a bigger template — use Copy on a row to grab its class name, then paste it where the template needs it.'
      : 'Use Add on a row to create an entry for “' + optName + '”. Every entry can be edited afterwards; Copy grabs just the class name.');
  renderPickerList();
  $('dlgPicker').showModal();
  $('pickerSearch').focus();
}

function renderPickerList() {
  const wrap = $('pickerList');
  wrap.innerHTML = '';
  if (!pickerCtx) return;
  const term = $('pickerSearch').value.trim().toLowerCase();
  const src = builderDb(pickerCtx.pick.t);
  let list = term
    ? src.filter((e) => e.n.toLowerCase().includes(term) || e.c.toLowerCase().includes(term))
    : src;
  const total = list.length;
  list = list.slice(0, PICKER_LIST_LIMIT);
  for (const e of list) {
    const badge = e.mod ? 'From mod: ' + e.mod : comboGroupOf(pickerCtx.pick.t, e);
    const row = uiElement('div', {
      className: 'picker-row',
      html: `<div class="picker-row-main"><b>${esc(e.n)}</b>${badge ? ` <span class="mod-badge">${esc(badge)}</span>` : ''}<br><code>${esc(e.c)}</code></div>`,
      parent: wrap,
    });
    const btns = uiElement('div', { className: 'picker-row-btns', parent: row });
    uiButton(btns, {
      small: true,
      html: uiIcon('copy', 15),
      title: 'Copy class name',
      onClick: () => copyText(e.c).then(() => toast(`Copied ${e.c}`)),
    });
    if (!pickerCtx.pick.copy) {
      uiButton(btns, {
        small: true,
        variant: 'primary',
        html: uiIcon('plus', 15),
        title: 'Add an entry for this ' + (pickerCtx.pick.t === 'dino' ? 'creature' : 'engram'),
        onClick: () => {
          const line = (pickerCtx.pick.tpl || '{c}').replace('{c}', e.c).replace('{t}', e.t || e.n.replace(/[^A-Za-z0-9]/g, ''));
          const ta = pickerCtx.textarea;
          ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + line;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          toast(`${e.n} added to “${pickerCtx.optName}”`);
        },
      });
    }
  }
  if (total > list.length) {
    const more = uiElement('div', {
      className: 'empty-msg',
      text: `…and ${total - list.length} more — type to narrow the list.`,
      parent: wrap,
    });
    more.style.padding = '10px 0';
  }
  if (!total) uiElement('div', { className: 'empty-msg', text: 'Nothing matches your search.', parent: wrap });
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), APP_TIMEOUTS.TOAST_MS);
}

/* ---------------- sidebar ---------------- */
function buildSidebar() {
  const nav = $('sidebar');
  nav.innerHTML = '';
  const addItem = (catId, iconName, label, extraClass) => {
    const b = document.createElement('button');
    b.className = 'navitem' + (extraClass ? ' ' + extraClass : '') + (catId === currentCat ? ' active' : '');
    b.dataset.cat = catId;
    b.innerHTML = `<span class="ico">${uiIcon(iconName)}</span><span class="label">${esc(label)}</span><span class="count" style="display:none">0</span>`;
    b.addEventListener('click', () => {
      currentCat = catId;
      searchTerm = '';
      $('searchBox').value = '';
      render();
    });
    nav.appendChild(b);
  };
  for (const c of CATEGORIES) {
    addItem(c.id, c.icon, c.name);
    // every selected mod gets its own page right under the Mods entry
    if (c.id === 'mods') {
      for (const entry of (state.mods || [])) {
        const mod = modInfo(entry);
        // MOD_CATS[*].icon holds an emoji, which uiIcon() cannot resolve — it
        // would silently fall back to the generic "info" glyph for every mod.
        // mods.js owns the category → ICON_PATHS mapping; use it.
        const icon = modCatIconName(mod.cat);
        const label = mod.name.length > 24 ? mod.name.slice(0, 23) + '…' : mod.name;
        addItem('mod:' + mod.id, icon, label, 'subitem');
      }
    }
  }
  refreshBadges();
}

function countChanged(catId) {
  let n = 0;
  for (const o of OPTIONS) if (o.c === catId && isChanged(o)) n++;
  if (catId === 'launch') {
    for (const f of LAUNCH_FIELDS) {
      const v = state.launch[f.k];
      if (v !== undefined && String(v) !== String(f.d)) n++;
    }
  }
  if (catId === 'mods') n += countModsChanged();
  if (catId && catId.startsWith('mod:')) n += countModChanged(parseInt(catId.slice(4), 10));
  return n;
}
function refreshBadges() {
  let total = 0;
  document.querySelectorAll('.navitem').forEach((b) => {
    const n = countChanged(b.dataset.cat);
    total += n;
    const badge = b.querySelector('.count');
    badge.textContent = n;
    badge.style.display = n > 0 ? '' : 'none';
  });
  const el = $('changedTotal');
  if (el) el.textContent = total === 0 ? 'Everything is at default values.' : `${total} setting${total === 1 ? '' : 's'} changed from default.`;
}
/* refreshBadges() re-counts every category for each of the 20+ nav items, and
   each count scans all ~900 options plus every selected mod's keys. Running
   that per keystroke was tens of thousands of comparisons per character, so
   the edit path coalesces it down to one recount per animation frame. */
function scheduleBadgeRefresh() {
  if (badgeRefreshFrame) return;
  badgeRefreshFrame = requestAnimationFrame(() => {
    badgeRefreshFrame = 0;
    refreshBadges();
  });
}

/* ---------------- option cards ---------------- */

/**
 * The ON/OFF slider widget, in one place. Option cards and launch-option cards
 * used to contain two hand-written copies of the same markup and wiring.
 *
 * @param {{
 *   read: () => *,                       current value (coerced to a boolean)
 *   onChange: (checked: boolean) => void, called before the widget re-syncs
 *   onSync?: () => void                   called after every repaint
 * }} options
 * @returns {{ el: HTMLElement, sync: () => void }}
 */
function makeSwitchControl(options) {
  const wrap = uiElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px';

  const label = uiElement('label', { className: 'switch', parent: wrap });
  const input = document.createElement('input');
  input.type = 'checkbox';
  label.appendChild(input);
  uiElement('span', { className: 'slider-sw', parent: label });
  const stateText = uiElement('span', { className: 'sw-state', parent: wrap });

  function sync() {
    input.checked = Boolean(options.read());
    stateText.textContent = input.checked ? 'ON' : 'OFF';
    stateText.classList.toggle('on', input.checked);
    if (options.onSync) options.onSync();
  }
  input.addEventListener('change', () => { options.onChange(input.checked); sync(); });
  sync();
  return { el: wrap, sync };
}

function makeBoolControl(o, onchange) {
  return makeSwitchControl({ read: () => getVal(o), onChange: onchange });
}

function makeNumControl(o, onchange) {
  const outer = document.createElement('div');
  const wrap = document.createElement('div');
  wrap.className = 'ctl-num';
  outer.appendChild(wrap);
  const num = document.createElement('input');
  num.type = 'number';
  num.step = o.t === 'int' ? '1' : String(o.st ?? 'any');
  let range = null;
  if (o.mx !== undefined && o.t !== 'int') {
    range = document.createElement('input');
    range.type = 'range';
    range.min = o.mn ?? 0;
    range.max = o.mx;
    range.step = o.st ?? 0.1;
    range.addEventListener('input', () => {
      num.value = range.value;
      onchange(range.value);
      updFx();
    });
    wrap.appendChild(range);
  }
  wrap.appendChild(num);
  // live "what does this mean" estimate
  const fxDiv = document.createElement('div');
  fxDiv.className = 'fx-line';
  outer.appendChild(fxDiv);
  function updFx() {
    const txt = fxText(o, getVal(o));
    fxDiv.textContent = txt;
    fxDiv.style.display = txt ? '' : 'none';
  }
  num.addEventListener('input', () => {
    if (num.value === '' || normNum(num.value) === null) return;
    onchange(num.value);
    if (range) range.value = num.value;
    updFx();
  });
  num.addEventListener('blur', () => { if (num.value === '') { sync(); } });
  function sync() {
    const v = getVal(o);
    num.value = fmtNum(v);
    if (range) range.value = normNum(v) ?? o.d;
    updFx();
  }
  sync();
  return { el: outer, sync };
}

function makeTextControl(o, onchange, multiline) {
  const wrap = document.createElement('div');
  wrap.className = 'ctl-text';
  const inp = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) inp.type = 'text';
  if (o.ph) inp.placeholder = o.ph;
  inp.addEventListener('input', () => onchange(inp.value));
  wrap.appendChild(inp);
  function sync() { inp.value = String(getVal(o) ?? ''); }
  sync();
  return { el: wrap, sync };
}

/** "Default: 1.5" / "Default: ON" — empty for virtual (file-level) options. */
function defaultValueText(o) {
  if (o.dNull) return 'Default: (not documented — only written if you set it)';
  if (o.virtual) return '';
  return 'Default: ' + (o.t === 'bool' ? (o.d ? 'ON' : 'OFF') : (o.d === '' ? '(empty)' : o.d));
}

/**
 * The footer every option card shares: default-value text on the left, the
 * reset link on the right. `.reset-btn` is deliberately not a ui-kit `.btn` —
 * it is styled as a quiet inline link inside the card.
 */
function appendCardFoot(card, defaultText, resetLabel, onReset) {
  const foot = uiElement('div', { className: 'opt-foot', parent: card });
  uiElement('span', { text: defaultText, parent: foot });
  uiElement('span', { className: 'spacer', parent: foot });
  const reset = uiElement('button', { className: 'reset-btn', text: resetLabel, parent: foot });
  reset.addEventListener('click', onReset);
}

function makeCard(o) {
  const card = document.createElement('div');
  card.className = 'opt-card';
  const isWide = o.t === 'text' || o.t === 'raw';
  if (isWide) card.classList.add('wide');

  const iniName = o.f === 'gus' ? ASA_SERVER.FILES.GAME_USER_SETTINGS : ASA_SERVER.FILES.GAME;
  const fileLabel = o.virtual ? iniName : `${iniName} › [${optSection(o)}]`;
  const head = uiElement('div', {
    className: 'opt-head',
    html: `<div><div class="opt-name">${esc(o.n)}</div>`
      + `<code class="opt-key" title="${esc(fileLabel)}">${o.virtual ? esc(fileLabel) : esc(o.dk || o.k)}</code></div>`,
    parent: card,
  });

  const help = uiElement('p', { className: 'opt-help', text: o.h, parent: card });
  if (o.note) {
    uiElement('p', { className: 'opt-note', html: uiIcon('warn', 13) + ' ' + esc(o.note), parent: card });
  }

  const onchange = (v) => {
    setVal(o, o.t === 'bool' ? Boolean(v) : v);
    card.classList.toggle('changed', isChanged(o));
  };

  let ctl;
  if (o.t === 'bool') { ctl = makeBoolControl(o, onchange); head.appendChild(ctl.el); }
  else if (o.t === 'float' || o.t === 'int') { ctl = makeNumControl(o, onchange); card.insertBefore(ctl.el, help.nextSibling); }
  else if (o.t === 'str') { ctl = makeTextControl(o, onchange, false); card.insertBefore(ctl.el, help.nextSibling); }
  else { ctl = makeTextControl(o, onchange, true); card.insertBefore(ctl.el, help.nextSibling); }

  // visual builder + class-name picker for list-style settings
  if (o.t === 'text' || o.t === 'raw') {
    const btnRow = uiElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:2px';
    const ta = ctl.el.querySelector('textarea');
    if (typeof BUILDERS !== 'undefined' && BUILDERS[o.k] && !o.modId) {
      uiButton(btnRow, {
        small: true,
        variant: 'primary',
        html: uiIcon('wand', 15) + ' Edit visually…',
        onClick: () => openBuilder(o.k, ta, o.n),
      });
    }
    const pick = pickForOption(o);
    if (pick) {
      uiButton(btnRow, {
        small: true,
        html: pick.t === 'dino' ? uiIcon('dino', 15) + ' Pick a creature…' : uiIcon('book', 15) + ' Pick an engram…',
        onClick: () => openPicker(pick, ta, o.n),
      });
    }
    if (btnRow.children.length) card.insertBefore(btnRow, ctl.el.nextSibling);
  }

  appendCardFoot(card, defaultValueText(o), 'Reset to default', () => resetVal(o));

  const update = () => {
    ctl.sync();
    card.classList.toggle('changed', isChanged(o));
  };
  card.classList.toggle('changed', isChanged(o));
  cardRefs.set(o.k, { card, update });
  return card;
}

/* stat-group card: one card with a 12-row table */
function makeStatGroupCard(grpId) {
  const members = OPTIONS.filter((o) => o.grp === grpId).sort((a, b) => a.gi - b.gi);
  const meta = STAT_GROUPS.find((g) => g.id === grpId);
  const card = document.createElement('div');
  card.className = 'opt-card wide';

  uiElement('div', {
    className: 'opt-head',
    html: `<div><div class="opt-name">${esc(meta.n)}</div>`
      + `<code class="opt-key">${esc(ASA_SERVER.FILES.GAME)} › ${esc(grpId)}[0…11]</code></div>`,
    parent: card,
  });
  uiElement('p', { className: 'opt-help', text: meta.h + ' Default for every stat is 1.', parent: card });

  const wrapGrid = document.createElement('div');
  wrapGrid.className = 'stat-cols';
  const inputs = [];
  for (let col = 0; col < 2; col++) {
    const tbl = document.createElement('table');
    tbl.className = 'stat-table';
    for (let i = col * 6; i < col * 6 + 6; i++) {
      const o = members[i];
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.textContent = STAT_NAMES[o.gi];
      const tdInp = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = '0.1';
      inp.addEventListener('input', () => {
        if (inp.value === '' || normNum(inp.value) === null) return;
        setVal(o, inp.value);
        inp.classList.toggle('changed', isChanged(o));
        card.classList.toggle('changed', members.some(isChanged));
        updGroupFx();
      });
      tdInp.appendChild(inp);
      tr.appendChild(tdName); tr.appendChild(tdInp);
      tbl.appendChild(tr);
      inputs.push({ o, inp });
    }
    wrapGrid.appendChild(tbl);
  }
  card.appendChild(wrapGrid);

  // live summary of what the changed stats mean, with concrete numbers
  const fxDiv = document.createElement('div');
  fxDiv.className = 'fx-line';
  card.appendChild(fxDiv);
  function updGroupFx() {
    const changed = members.filter(isChanged);
    const txt = changed.length
      ? 'Effect: ' + changed.map((o) => statFxText(grpId, o.gi, normNum(getVal(o)) ?? 1)).join(' · ')
      : '';
    fxDiv.textContent = txt;
    fxDiv.style.display = txt ? '' : 'none';
  }

  appendCardFoot(card, '', 'Reset all 12 to default', () => {
    members.forEach((o) => delete state.opts[o.k]);
    saveState(); update(); refreshBadges();
  });

  function update() {
    for (const { o, inp } of inputs) {
      inp.value = fmtNum(getVal(o));
      inp.classList.toggle('changed', isChanged(o));
    }
    card.classList.toggle('changed', members.some(isChanged));
    updGroupFx();
  }
  update();
  for (const { o } of inputs) cardRefs.set(o.k, { card, update });
  return card;
}

/* ---------------- launch category ---------------- */
function getLaunch(f) {
  return Object.prototype.hasOwnProperty.call(state.launch, f.k) ? state.launch[f.k] : f.d;
}
function setLaunch(f, v) {
  if (isDefaultValue(f, v)) delete state.launch[f.k];
  else state.launch[f.k] = v;
  saveState();
  scheduleBadgeRefresh();
  updateCmdBox();
}
let cmdBoxEl = null;
function buildLaunchCommand(forBat) {
  const spec = buildLaunchSpec();
  const exe = forBat
    ? `"${spec.serverPath || FALLBACK_SERVER_EXE}"`
    : ASA_SERVER.EXE_PARTS[ASA_SERVER.EXE_PARTS.length - 1];
  const args = spec.args.map((arg) => arg.startsWith('-ClusterDirOverride=')
    ? '-ClusterDirOverride="' + arg.slice('-ClusterDirOverride='.length) + '"'
    : arg);
  if (spec.extraArgs) args.push(spec.extraArgs);
  return `${exe} "${spec.query}" ${args.join(' ')}`;
}
/**
 * Makes a user-supplied value safe to interpolate into the `?a=b?c=d` launch
 * query string.
 *
 * The query is one shell-quoted argument handed straight to spawn(), and `?`
 * separates parameters inside it. Without this, a server name of
 * `My Server?ServerAdminPassword=hunter2` silently became a real launch
 * parameter — anybody who could set the name could set any option. `&` is
 * stripped for the same reason (some hosts' wrappers split on it) and `"`
 * because it would terminate the quoted argument in the generated .bat.
 */
function sanitizeQueryValue(value) {
  return String(value ?? '').replace(/[?&"]/g, '');
}

function buildLaunchSpec() {
  const L = {};
  for (const f of LAUNCH_FIELDS) L[f.k] = getLaunch(f);
  const map = L.map === '__custom' ? (L.customMap || ASA_SERVER.DEFAULT_MAP) : L.map;

  // the whole query string is wrapped in one pair of quotes, so spaces in the
  // session name are fine — no inner quotes (they would break the command line)
  let query = sanitizeQueryValue(map) + '?listen';
  const sn = state.opts.SessionName;
  if (sn) query += `?SessionName=${sanitizeQueryValue(sn)}`;
  const port = state.opts.Port;
  if (port) query += `?Port=${sanitizeQueryValue(port)}`;

  const args = [];
  args.push(`-WinLiveMaxPlayers=${L.maxPlayers || ASA_SERVER.DEFAULT_MAX_PLAYERS}`);
  // mods: selected in the Mods tab (in load order) + any extra manual IDs
  const modIds = selectedModIds();
  if (L.mods) {
    for (const x of String(L.mods).split(/[,\s]+/)) {
      const n = parseInt(x, 10);
      if (n && !modIds.includes(n)) modIds.push(n);
    }
  }
  if (modIds.length) args.push(`-mods=${modIds.join(',')}`);
  if (L.platforms) args.push(`-ServerPlatform=${L.platforms}`);
  if (!L.battleye) args.push('-NoBattlEye');
  if (L.clusterId) args.push(`-clusterid=${L.clusterId}`);
  if (L.clusterDir) args.push(`-ClusterDirOverride=${L.clusterDir}`);
  if (L.noTransferFromFiltering) args.push('-NoTransferFromFiltering');
  if (L.exclusiveJoin) args.push('-exclusivejoin');
  if (L.forceAllowCaveFlyers) args.push('-ForceAllowCaveFlyers');
  if (L.forceRespawnDinos) args.push('-ForceRespawnDinos');
  if (L.noWildBabies) args.push('-NoWildBabies');
  if (L.disableCustomCosmetics) args.push('-DisableCustomCosmetics');
  if (L.useDynamicConfig) args.push('-UseDynamicConfig');
  if (L.serverGameLog) args.push('-servergamelog');
  if (L.activeEvent) args.push(`-ActiveEvent=${L.activeEvent}`);
  return { query, args, extraArgs: (L.extraArgs || '').trim(), serverPath: L.serverPath || '' };
}
/* Turn the optional advanced text field into argv without ever passing it
   through a shell. This supports the usual Windows quoted values, including
   backslashes in folder paths. */
function splitLaunchExtraArgs(text) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let hasText = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      let count = 1;
      while (text[i + count] === '\\') count++;
      if (text[i + count] === '"') {
        current += '\\'.repeat(Math.floor(count / 2));
        if (count % 2) { current += '"'; hasText = true; }
        else { inQuotes = !inQuotes; hasText = true; }
        i += count;
      } else {
        current += '\\'.repeat(count);
        hasText = true;
        i += count - 1;
      }
    } else if (char === '"') {
      inQuotes = !inQuotes;
      hasText = true;
    } else if (/\s/.test(char) && !inQuotes) {
      if (hasText) { args.push(current); current = ''; hasText = false; }
    } else {
      current += char;
      hasText = true;
    }
  }
  if (inQuotes) throw new Error('Extra launch arguments contain an unclosed quote.');
  if (hasText) args.push(current);
  return args;
}
function buildManagedLaunchSpec() {
  const spec = buildLaunchSpec();
  return {
    query: spec.query,
    args: spec.args.concat(spec.extraArgs ? splitLaunchExtraArgs(spec.extraArgs) : []),
  };
}
function buildBat() {
  return [
    '@echo off',
    'title ARK Survival Ascended Server',
    'echo Starting ARK: Survival Ascended server...',
    ':start',
    buildLaunchCommand(true),
    'echo Server stopped. Restarting in 10 seconds... (close this window to stop)',
    'timeout /t 10',
    'goto start',
    '',
  ].join('\r\n');
}
function updateCmdBox() {
  if (cmdBoxEl) cmdBoxEl.textContent = buildLaunchCommand(false);
}

/** True when a launch field currently differs from its default. */
function isLaunchChanged(f) {
  return !isDefaultValue(f, getLaunch(f));
}

/** Toggles the card's "changed" ring from the field's current value. */
function markLaunchCard(card, f) {
  card.classList.toggle('changed', isLaunchChanged(f));
}

/**
 * Builds the input for one launch field and attaches it to its card.
 * `fieldCards` is the key → card map so the map select can show/hide the
 * custom-map card without a re-render.
 */
function buildLaunchControl(f, card, head, fieldCards) {
  if (f.t === 'bool') {
    const control = makeSwitchControl({
      read: () => getLaunch(f),
      onChange: (checked) => setLaunch(f, checked),
      onSync: () => markLaunchCard(card, f),
    });
    head.appendChild(control.el);
    return;
  }

  if (f.t === 'int') {
    const wrap = uiElement('div', { className: 'ctl-num', parent: card });
    const num = uiElement('input', { parent: wrap });
    num.type = 'number';
    num.step = '1';
    num.value = getLaunch(f);
    num.addEventListener('input', () => {
      if (num.value === '') return;
      setLaunch(f, num.value);
      markLaunchCard(card, f);
    });
    return;
  }

  if (f.t === 'select' || f.t === 'map') {
    const sel = uiElement('select', { parent: card });
    const choices = f.t === 'map' ? MAPS.map((m) => [m.id, m.name]) : f.choices;
    for (const [v, label] of choices) {
      const op = uiElement('option', { text: label, parent: sel });
      op.value = v;
    }
    sel.value = getLaunch(f);
    sel.addEventListener('change', () => {
      setLaunch(f, sel.value);
      markLaunchCard(card, f);
      // show/hide the custom-map card in place — a full render() here would
      // destroy this select and drop keyboard focus on every arrow-key step
      if (f.t === 'map' && fieldCards.customMap) {
        fieldCards.customMap.style.display = sel.value === '__custom' ? '' : 'none';
      }
    });
    return;
  }

  const wrap = uiElement('div', { className: 'ctl-text', parent: card });
  const inp = uiElement('input', { parent: wrap });
  inp.type = 'text';
  if (f.ph) inp.placeholder = f.ph;
  inp.value = getLaunch(f);
  inp.addEventListener('input', () => {
    setLaunch(f, inp.value);
    markLaunchCard(card, f);
  });
}

/** One launch-option card: title, help text and the field's own control. */
function makeLaunchCard(f, fieldCards) {
  const card = uiElement('div', { className: 'opt-card' });
  const head = uiElement('div', {
    className: 'opt-head',
    html: `<div><div class="opt-name">${esc(f.n)}</div><code class="opt-key">launch option</code></div>`,
    parent: card,
  });
  uiElement('p', { className: 'opt-help', text: f.h, parent: card });

  buildLaunchControl(f, card, head, fieldCards);
  markLaunchCard(card, f);

  // the custom map name only matters while the map select is on "Custom"
  if (f.k === 'customMap' && getLaunch(LAUNCH_FIELDS[0]) !== '__custom') card.style.display = 'none';
  return card;
}

/** The live "your start command" preview plus its copy / download buttons. */
function appendCommandPreview(grid) {
  uiElement('div', {
    className: 'search-cat-label',
    html: uiIcon('server', 14) + ' Your start command (auto-generated)',
    parent: grid,
  });
  cmdBoxEl = uiElement('div', { className: 'cmd-box', parent: grid });

  const rowBtns = uiElement('div', { parent: grid });
  rowBtns.style.cssText = 'grid-column:1 / -1;display:flex;gap:8px';
  uiButton(rowBtns, {
    small: true,
    html: uiIcon('copy', 15) + ' Copy command',
    onClick: () => copyText(buildLaunchCommand(false)).then(() => toast('Command copied!')),
  });
  uiButton(rowBtns, {
    small: true,
    variant: 'primary',
    html: uiIcon('download', 15) + ' Download ' + esc(ASA_SERVER.FILES.START_SCRIPT),
    onClick: () => {
      download(ASA_SERVER.FILES.START_SCRIPT, buildBat());
      toast(ASA_SERVER.FILES.START_SCRIPT + ' downloaded');
    },
  });
  updateCmdBox();
}

function renderLaunchCategory(grid) {
  const fieldCards = {};   // field key -> card, so handlers can toggle related cards
  for (const f of LAUNCH_FIELDS) {
    fieldCards[f.k] = makeLaunchCard(f, fieldCards);
    grid.appendChild(fieldCards[f.k]);
  }
  appendCommandPreview(grid);
}

/* ---------------- render ----------------
   `esc()` used to live here. It now comes from ui-kit.js, which also escapes
   the single quote — every call site is unchanged. */

function matchesSearch(o, term) {
  return o.n.toLowerCase().includes(term) || o.k.toLowerCase().includes(term) || (o.h || '').toLowerCase().includes(term);
}

/** Categories that have their own page instead of a grid of option cards. */
const SPECIAL_CATEGORY_RENDERERS = {
  launch: (grid) => renderLaunchCategory(grid),
  setup: (grid) => renderLocalServerSetup(grid),
  mods: (grid) => renderModsCategory(grid),
  deploy: (grid) => renderDeployCategory(grid),
};

/** A "── icon Name ──" divider above a group of search hits. */
function appendSectionLabel(grid, html) {
  uiElement('div', { className: 'search-cat-label', html, parent: grid });
}

/** The cards for one normal category, with each stat group collapsed to one. */
function cardsForOptions(options) {
  const groupsDone = new Set();
  const cards = [];
  for (const o of options) {
    if (o.grp) {
      if (groupsDone.has(o.grp)) continue;
      groupsDone.add(o.grp);
      cards.push(makeStatGroupCard(o.grp));
    } else {
      cards.push(makeCard(o));
    }
  }
  return cards;
}

/** Search hits from the built-in option catalog, grouped by category. */
function appendOptionSearchHits(grid, term) {
  let any = false;
  for (const c of CATEGORIES) {
    // these three are whole pages, not searchable option cards
    if (c.id === 'launch' || c.id === 'setup' || c.id === 'custom') continue;
    const matches = OPTIONS.filter((o) => o.c === c.id && matchesSearch(o, term) && (!changedOnly || isChanged(o)));
    const cards = cardsForOptions(matches);
    if (!cards.length) continue;
    any = true;
    appendSectionLabel(grid, `${uiIcon(c.icon, 14)} ${esc(c.name)}`);
    cards.forEach((el) => grid.appendChild(el));
  }
  return any;
}

/** Search hits among the settings of the mods the user already selected. */
function appendSelectedModSearchHits(grid, term) {
  let any = false;
  for (const entry of (state.mods || [])) {
    const mod = modInfo(entry);
    const cards = [];
    for (const sec of (mod.ini || [])) {
      for (const s of sec.settings) {
        const o = modOption(mod, sec, s);
        if (matchesSearch(o, term) && (!changedOnly || isChanged(o))) cards.push(makeCard(o));
      }
    }
    if (!cards.length) continue;
    any = true;
    appendSectionLabel(grid, uiIcon('puzzle', 14) + ' ' + esc(mod.name));
    cards.forEach((el) => grid.appendChild(el));
  }
  return any;
}

/** A single card pointing at the mod browser when the catalog matches. */
function appendCatalogModSearchHits(grid, term) {
  const modMatches = MODS_DB.filter((m) => m.name.toLowerCase().includes(term) || (m.sum || '').toLowerCase().includes(term));
  if (!modMatches.length) return false;

  appendSectionLabel(grid, uiIcon('puzzle', 14) + ' Mods');
  const names = modMatches.slice(0, SEARCH_MOD_NAME_PREVIEW).map((m) => esc(m.name)).join(', ');
  const card = uiElement('div', {
    className: 'opt-card wide',
    html: `<p class="opt-help">${modMatches.length} mod${modMatches.length === 1 ? '' : 's'} match in the CurseForge catalog: `
      + `<b>${names}${modMatches.length > SEARCH_MOD_NAME_PREVIEW ? '…' : ''}</b></p>`,
    parent: grid,
  });
  uiButton(card, {
    small: true,
    variant: 'primary',
    html: uiIcon('puzzle', 16) + ' Open Mod Browser',
    onClick: () => { openModBrowser(); $('modSearch').value = term; browserFilter.term = term; renderModBrowser(); },
  });
  return true;
}

/* Search mode: one flat page of hits from every category, the user's mods and
   the bundled mod catalog. */
function renderSearchResults(grid, headEl, term) {
  headEl.innerHTML = `<h2><span class="h2ic">${uiIcon('search', 22)}</span> Search results for “${esc(term)}”</h2>`
    + '<p>Searching every category. Clear the search box to go back.</p>';

  // deliberately not short-circuiting: every section appends its own hits
  const found = [
    appendOptionSearchHits(grid, term),
    appendSelectedModSearchHits(grid, term),
    appendCatalogModSearchHits(grid, term),
  ].some(Boolean);

  if (!found) uiElement('div', { className: 'empty-msg', text: 'No settings match your search.', parent: grid });
}

/* A plain category: every option card that belongs to it. */
function renderOptionCategory(grid) {
  const visible = OPTIONS.filter((o) => o.c === currentCat
    && !(changedOnly && !(o.grp ? OPTIONS.some((m) => m.grp === o.grp && isChanged(m)) : isChanged(o))));
  const cards = cardsForOptions(visible);
  cards.forEach((card) => grid.appendChild(card));
  if (!cards.length) {
    uiElement('div', {
      className: 'empty-msg',
      text: changedOnly ? 'You haven’t changed anything in this category yet.' : 'Nothing here.',
      parent: grid,
    });
  }
}

/* Routing only: pick the page for the current category (or the search term)
   and hand the grid to whoever renders it. */
function render() {
  if (typeof syncLocalServerConsoleConsumer === 'function' && (currentCat !== 'setup' || searchTerm)) {
    syncLocalServerConsoleConsumer(false);
  }
  cardRefs.clear();
  cmdBoxEl = null;
  const grid = $('optGrid');
  grid.innerHTML = '';
  document.querySelectorAll('.navitem').forEach((b) => b.classList.toggle('active', b.dataset.cat === currentCat && !searchTerm));

  const headEl = $('catHeader');
  if (searchTerm) {
    renderSearchResults(grid, headEl, searchTerm);
    return;
  }
  if (currentCat.startsWith('mod:')) {
    renderModPage(grid, parseInt(currentCat.slice(4), 10));
    return;
  }

  const cat = CATEGORIES.find((c) => c.id === currentCat);
  headEl.innerHTML = `<h2><span class="h2ic">${uiIcon(cat.icon, 22)}</span> ${esc(cat.name)}</h2><p>${esc(cat.desc)}</p>`;

  const special = SPECIAL_CATEGORY_RENDERERS[currentCat];
  if (special) special(grid);
  else renderOptionCategory(grid);
}

/* ---------------- INI generation ---------------- */
function includeOpt(o, includeDefaults) {
  if (o.t === 'text' || o.t === 'raw') return String(getVal(o) ?? '').trim() !== '';
  if (o.t === 'str') {
    const v = String(getVal(o) ?? '');
    return v !== '' && (includeDefaults || isChanged(o));
  }
  return includeDefaults || isChanged(o);
}

function emitOpt(lines, o) {
  const v = getVal(o);
  if (o.t === 'text') {
    const keyRe = new RegExp('^\\s*' + o.k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*', 'i');
    for (let line of String(v).split(/\r?\n/)) {
      line = line.trim();
      if (!line) continue;
      line = line.replace(keyRe, '');
      lines.push(`${o.k}=${line}`);
    }
  } else if (o.t === 'raw') {
    for (const line of String(v).split(/\r?\n/)) {
      if (line.trim() === '') continue;
      lines.push(line.trim());
    }
  } else {
    lines.push(`${o.k}=${iniValue(o, v)}`);
  }
}

function buildIniFile(file, includeDefaults) {
  const lines = [];
  const sections = file === 'gus' ? GUS_SECTION_ORDER : [GAME_SECTION];
  for (const sec of sections) {
    const opts = OPTIONS.filter((o) => o.f === file && !o.virtual && optSection(o) === sec && includeOpt(o, includeDefaults));
    if (!opts.length && !(file === 'gus' && sec === 'ServerSettings') && !(file === 'game')) continue;
    lines.push(`[${sec}]`);
    for (const o of opts) emitOpt(lines, o);
    lines.push('');
  }
  // mod sections (from the Mods tab)
  lines.push(...buildModIniLines(file, includeDefaults));
  // custom passthrough
  const customKey = file === 'gus' ? '__customGUS' : '__customGame';
  const co = optByKey.get(customKey.toLowerCase());
  const cv = String(getVal(co) ?? '').trim();
  if (cv) {
    for (const line of cv.split(/\r?\n/)) lines.push(line);
    lines.push('');
  }
  return lines.join('\r\n');
}

/* ---------------- import ---------------- */

/** Repaints everything an import may have touched, unless the caller opted out. */
function afterImportRepaint(opts) {
  if (opts.skipRender) return;
  buildSidebar();
  render();
  refreshBadges();
}

/**
 * Loads a saved profile (.json). A profile REPLACES the whole setup, so the
 * user is asked first whenever there is local work to lose.
 *
 * Profiles written before secret-stripping (and hand-edited ones) may still
 * contain passwords and RCON settings — those are imported as-is on purpose;
 * only the *export* side strips them.
 *
 * @returns {boolean} true when the profile was applied
 */
function importProfileJson(trimmed, opts) {
  let j;
  try {
    j = JSON.parse(trimmed);
  } catch (e) {
    toast('That JSON file could not be read.');
    return false;
  }
  if (!j || !(j.opts || j.launch || j.mods)) {
    toast('That JSON file is not an ARK Config Creator profile.');
    return false;
  }

  // a profile REPLACES the whole setup — never silently discard local work
  const hasLocalWork = Object.keys(state.opts).length > 0 || (state.mods || []).length > 0;
  if (hasLocalWork && !confirm('Load this profile? It REPLACES your current setup (settings and mod list).\nTip: save your current setup first via Presets → Save my setup.')) {
    return false;
  }

  state.opts = j.opts || {};
  state.launch = j.launch || {};
  // ids must be numeric — imported profiles are untrusted
  state.mods = (Array.isArray(j.mods) ? j.mods : [])
    .map((m) => ({ ...m, id: parseInt(m.id, 10) }))
    .filter((m) => Number.isFinite(m.id) && m.id > 0);
  state.modExtra = j.modExtra || {};
  state.modDynIni = j.modDynIni || {};
  state.modDocs = j.modDocs || {};
  state.modContent = j.modContent || {};
  saveState();
  afterImportRepaint(opts);
  toast('Profile loaded!');
  return true;
}

/**
 * Walks the lines of a pasted/dropped .ini and applies every key it knows.
 * Nothing is rendered or persisted here — the caller does that once.
 *
 * @returns {{recognized: number, aseCount: number, unknownBySection: Map<string, string[]>}}
 */
function scanIniLines(trimmed) {
  let section = '';
  let modHandler = null;   // active when the current section belongs to a known mod
  let recognized = 0;
  let aseCount = 0;        // old ASE-only settings that ASA ignores
  const unknownBySection = new Map(); // section -> lines
  const clearedMultiline = new Set();

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) continue;
    const mSec = line.match(/^\[(.+)\]$/);
    if (mSec) { section = mSec[1].trim(); modHandler = modImportHandler(section); continue; }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    // keys inside a known mod's section always belong to that mod
    if (modHandler) { modHandler(key, value); recognized++; continue; }

    // strip array index for lookup: PerLevelStats...[3] stays as-is (we have those keys); ItemStatClamps[1] etc. won't match -> raw
    const o = optByKey.get(key.toLowerCase());
    if (o && !o.virtual) {
      recognized++;
      if (o.t === 'bool') {
        setValSilent(o, /^(true|1)$/i.test(value));
      } else if (o.t === 'text' || o.t === 'raw') {
        // multi-line settings accumulate every occurrence of the key
        if (!clearedMultiline.has(o.k)) { state.opts[o.k] = ''; clearedMultiline.add(o.k); }
        const cur = state.opts[o.k];
        state.opts[o.k] = (cur ? cur + '\n' : '') + value;
      } else {
        setValSilent(o, value);   // float / int / str all store the raw text
      }
    } else {
      // Unknown keys are kept verbatim in the Custom / Extra Lines box for the
      // file the section belongs to. A line before any [Section] header has no
      // section at all and goes to the GameUserSettings box; the old code had
      // an unreachable GAME_SECTION branch here (looksLikeGameSection('') can
      // never be true), which is why this is now a plain fallback.
      const secKey = section || 'ServerSettings';
      if (!unknownBySection.has(secKey)) unknownBySection.set(secKey, []);
      unknownBySection.get(secKey).push(line);
      if (ASE_ONLY_KEYS.has(key.toLowerCase())) aseCount++;
    }
  }

  // clean up empty multiline imports
  for (const k of clearedMultiline) {
    if (state.opts[k] === '') delete state.opts[k];
  }
  return { recognized, aseCount, unknownBySection };
}

/**
 * Appends the lines this tool did not recognise to the right Custom / Extra
 * Lines box, keeping their section header when it is not one of ours.
 *
 * @returns {number} how many lines were actually added (duplicates are skipped)
 */
function keepUnknownLines(unknownBySection) {
  const gusSections = new Set(GUS_SECTION_ORDER.map((s) => s.toLowerCase()));
  let unknownCount = 0;
  for (const [sec, ls] of unknownBySection) {
    const isGame = looksLikeGameSection(sec);
    const targetKey = isGame ? '__customGame' : '__customGUS';
    const o = optByKey.get(targetKey.toLowerCase());
    const cur = String(getVal(o) ?? '');
    const curLines = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
    const add = [];
    const needsHeader = sec && !isGame && !gusSections.has(sec.toLowerCase());
    if (needsHeader && !curLines.has(`[${sec}]`)) add.push(`[${sec}]`);
    for (const l of ls) {
      if (!curLines.has(l)) { add.push(l); unknownCount++; }
    }
    if (add.length) {
      state.opts[o.k] = (cur.trim() ? cur.trim() + '\n' : '') + add.join('\n');
    }
  }
  return unknownCount;
}

/** The "Imported: N settings recognized…" sentence shown after an .ini import. */
function importSummary(recognized, unknownCount, aseCount) {
  let msg = `Imported: ${recognized} setting${recognized === 1 ? '' : 's'} recognized`
    + (unknownCount ? `, ${unknownCount} unknown line${unknownCount === 1 ? '' : 's'} kept in Custom / Extra Lines.` : '.');
  if (aseCount) {
    msg += ` Warning: ${aseCount} of them ${aseCount === 1 ? 'is an' : 'are'} old-ARK (ASE) setting${aseCount === 1 ? '' : 's'} that ASA ignores.`;
  }
  return msg;
}

/* Returns true when something was imported (callers keep the pasted text and
   the dialog open on failure). opts.skipRender leaves the UI untouched so a
   caller mid-operation (e.g. a deploy read) can re-render once at the end. */
function importText(text, opts = {}) {
  const trimmed = text.trim();
  if (!trimmed) { toast('Nothing to import — the text was empty.'); return false; }
  if (trimmed[0] === '{') return importProfileJson(trimmed, opts);

  const { recognized, aseCount, unknownBySection } = scanIniLines(trimmed);
  const unknownCount = keepUnknownLines(unknownBySection);

  saveState();
  afterImportRepaint(opts);
  toast(importSummary(recognized, unknownCount, aseCount));
  // for mods recognized in the import, look up their pages online for the rest
  // of their settings (async — pages update when results arrive)
  afterImportModDiscovery();
  return true;
}
function looksLikeGameSection(sec) {
  return /shootergamemode/i.test(sec || '');
}
/* Sets an option without persisting or re-rendering — for bulk changes
   (import, presets, the wizard) that save and repaint once at the end. */
function setValSilent(o, v) {
  if (isDefaultValue(o, v)) delete state.opts[o.k];
  else state.opts[o.k] = v;
}

/* ---------------- download / copy ---------------- */
function download(name, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  // the object URL has to outlive the click, but not much longer
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, APP_TIMEOUTS.OBJECT_URL_REVOKE_MS);
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // file:// fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return Promise.resolve();
}

/* ---------------- export modal ---------------- */
/** Where the two .ini files have to end up on a Windows server machine. */
const WINDOWS_CONFIG_HINT_PATH = '…\\ARK Survival Ascended Server\\' + ASA_SERVER.CONFIG_PARTS.join('\\') + '\\';

function refreshExportPreview() {
  const inc = $('chkIncludeDefaults').checked;
  let text;
  if (exportTab === 'gus') text = buildIniFile('gus', inc);
  else if (exportTab === 'game') text = buildIniFile('game', inc);
  else text = buildBat();
  $('filePreview').textContent = text || '(empty — change some settings first)';
  $('exportHint').style.display = '';
  if (exportTab === 'bat') {
    const hintBat = `Put ${ASA_SERVER.FILES.START_SCRIPT} next to nothing special — just edit the server path inside if needed, then double-click it on your server machine to start the server.`;
    $('exportHint').innerHTML = '<b>How to use:</b><br>' + esc(hintBat) + '<br>Set the “Server .exe Location” in 🚀 Launch Options so the path is correct.';
  } else {
    $('exportHint').innerHTML = '<b>Where do these files go?</b><br>On your server machine, place both .ini files in:<br>'
      + `<code>${esc(WINDOWS_CONFIG_HINT_PATH)}</code><br>`
      + '(For rented servers, most hosts have a config editor or FTP — upload or paste the files there.) Restart the server afterwards. '
      + '<b>Tip:</b> back up your old files first!<br><b>Skip the file juggling:</b> the Deploy tab in the sidebar can write these straight to Nitrado, a Pterodactyl panel, or a self-hosted server — with automatic backups.';
  }
}
function exportFileName() {
  if (exportTab === 'gus') return ASA_SERVER.FILES.GAME_USER_SETTINGS;
  if (exportTab === 'game') return ASA_SERVER.FILES.GAME;
  return ASA_SERVER.FILES.START_SCRIPT;
}

/* ---------------- shareable profile (.json) ----------------
   The Presets dialog tells people to save a profile and load it later, and
   profiles get passed around between server owners. state.opts, however, also
   holds the admin/join/spectator passwords and the RCON settings, and
   PRIVACY.txt already promises that connection secrets are excluded from
   exported profiles. So the export drops them; the import deliberately still
   accepts them, because profiles written before this change (and hand-made
   ones) must keep working. */
const PROFILE_FILE_NAME = 'my-ark-server-profile.json';
const PROFILE_SECRET_KEY_PATTERN = /password|^rcon/i;

/* Launch fields naming a folder on this machine. PRIVACY.txt also promises
   that chosen local folders stay local, and they would be wrong on somebody
   else's PC anyway, so they are stripped from the export too. */
const PROFILE_LOCAL_PATH_KEYS = ['serverPath', 'clusterDir'];

/** True for option keys that must never leave this PC inside a profile. */
function isProfileSecretKey(key) {
  return PROFILE_SECRET_KEY_PATTERN.test(key);
}

/**
 * Serialises the current setup for sharing.
 * @returns {{ json: string, strippedKeys: string[] }}
 */
function buildProfileExport() {
  const opts = {};
  const strippedKeys = [];
  for (const [key, value] of Object.entries(state.opts)) {
    if (isProfileSecretKey(key)) strippedKeys.push(key);
    else opts[key] = value;
  }
  const launch = { ...state.launch };
  for (const key of PROFILE_LOCAL_PATH_KEYS) {
    if (launch[key]) { delete launch[key]; strippedKeys.push(key); }
  }
  const profile = {
    opts,
    launch,
    mods: state.mods,
    modExtra: state.modExtra,
    modDynIni: state.modDynIni,
    modDocs: state.modDocs,
    modContent: state.modContent,
  };
  return { json: JSON.stringify(profile, null, 2), strippedKeys };
}

/** Downloads the profile and says out loud which secrets were left out. */
function downloadProfile() {
  const { json, strippedKeys } = buildProfileExport();
  download(PROFILE_FILE_NAME, json);
  const n = strippedKeys.length;
  toast(n
    ? `Profile saved — ${n} password, RCON and local-folder setting${n === 1 ? '' : 's'} left out so the file is safe to share. Load it later via Import.`
    : 'Profile saved (passwords, RCON settings and local folders are never included) — load it later via Import.');
}

/* ---------------- init ----------------
   init() is called exactly once per page load (auth.js guards re-entry after a
   logout, because binding these one-time listeners twice would duplicate every
   header button and fire every handler twice). Each init* helper below owns one
   area of the UI and is safe to read on its own. */

/** Restores the saved setup and paints the first screen. */
function initState() {
  loadState();
  hydrateIcons();
  document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  buildSidebar();
  render();
}

/** Search box, "changed only" filter and the theme toggle. */
function initFilters() {
  $('searchBox').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
  $('chkChangedOnly').addEventListener('change', (e) => { changedOnly = e.target.checked; render(); });
  $('btnTheme').addEventListener('click', () => {
    state.theme = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    saveState();
  });
}

/* Updates use the same NSIS installer as first-time installs. Selecting a
   newer setup file upgrades in place and keeps the app's local data folder.
   The button stays hidden in the browser build, which cannot install anything. */
function initUpdateButton() {
  const updateButton = $('btnUpdateApp');
  if (typeof window.arkcc === 'undefined' || typeof window.arkcc.installAppUpdate !== 'function') return;
  updateButton.hidden = false;
  updateButton.addEventListener('click', async () => {
    if (!confirm('Select a newer ARK Config Creator installer to update this app in place? Your accounts, settings, and running local server service will be kept.')) return;
    updateButton.disabled = true;
    try {
      const result = await window.arkcc.installAppUpdate();
      if (result.canceled) { updateButton.disabled = false; return; }
      // stays disabled on purpose: the installer is running and this app is
      // seconds away from being replaced — a second click must not start it twice
      toast('Starting update to version ' + result.version + '…');
    } catch (error) {
      updateButton.disabled = false;
      toast('Could not start the update: ' + error.message);
    }
  });
}

/** The destructive "reset everything" header button. */
function initResetAll() {
  $('btnResetAll').addEventListener('click', () => {
    if (!confirm('Reset EVERY setting back to default? This also clears your mod list. This cannot be undone.')) return;
    state.opts = {};
    state.launch = {};
    state.mods = [];
    state.modExtra = {};
    state.modDynIni = {};
    state.modDocs = {};
    state.modContent = {};
    // the page for a mod that no longer exists cannot stay selected
    currentCat = currentCat.startsWith('mod:') ? 'mods' : currentCat;
    saveState(); buildSidebar(); render(); refreshBadges();
    toast('All settings reset to defaults.');
  });
}

function initHeaderControls() {
  initFilters();
  initUpdateButton();
  initResetAll();
}

/** Close buttons and click-outside-to-close, for every dialog in the page. */
function initDialogs() {
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

function initExportModal() {
  $('btnExport').addEventListener('click', () => { $('dlgExport').showModal(); refreshExportPreview(); });
  document.querySelectorAll('#exportTabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#exportTabs .tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    exportTab = t.dataset.file;
    refreshExportPreview();
  }));
  $('chkIncludeDefaults').addEventListener('change', refreshExportPreview);
  $('btnCopyFile').addEventListener('click', () => copyText($('filePreview').textContent).then(() => toast('Copied to clipboard!')));
  $('btnDownloadFile').addEventListener('click', () => {
    download(exportFileName(), $('filePreview').textContent);
    toast(exportFileName() + ' downloaded');
  });
  $('btnDownloadAll').addEventListener('click', () => {
    const inc = $('chkIncludeDefaults').checked;
    const files = ASA_SERVER.FILES;
    // browsers drop rapid-fire downloads, so the three are staggered
    download(files.GAME_USER_SETTINGS, buildIniFile('gus', inc));
    setTimeout(() => download(files.GAME, buildIniFile('game', inc)), APP_TIMEOUTS.DOWNLOAD_STAGGER_MS);
    setTimeout(() => download(files.START_SCRIPT, buildBat()), APP_TIMEOUTS.DOWNLOAD_STAGGER_MS * 2);
    toast('Downloading all 3 files…');
  });
}

/** Imports every dropped/selected file, closing the dialog when any succeeded. */
async function importFiles(fileList) {
  let anyOk = false;
  for (const f of fileList) {
    const text = await f.text();
    if (importText(text)) anyOk = true;
  }
  // a failed file leaves the dialog open with its error toast, so the user can
  // see what went wrong and try another one
  if (anyOk) $('dlgImport').close();
}

function initImportModal() {
  $('btnImport').addEventListener('click', () => $('dlgImport').showModal());
  $('btnDoImport').addEventListener('click', () => {
    // keep the pasted text and the dialog open when the import fails, so the
    // user can fix it instead of losing what they pasted
    if (importText($('importPaste').value)) {
      $('importPaste').value = '';
      $('dlgImport').close();
    }
  });
  $('btnPickFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';   // reset first, so picking the same file twice still fires
    await importFiles(files);
  });

  const dz = $('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => importFiles(e.dataTransfer.files));
}

function initPresetsModal() {
  $('btnPresets').addEventListener('click', () => { buildPresetList(); $('dlgPresets').showModal(); });
  $('btnSaveProfile').addEventListener('click', downloadProfile);
}

/* Ctrl+F (or "/" outside a field) jumps to the settings search. */
function initHotkeys() {
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey && e.key === 'f') || (!inField && e.key === '/')) {
      e.preventDefault();
      $('searchBox').focus();
      $('searchBox').select();
    }
  });
}

function init() {
  initState();
  initHeaderControls();
  initDialogs();
  initExportModal();
  initImportModal();
  initPresetsModal();
  $('pickerSearch').addEventListener('input', renderPickerList);
  initHotkeys();
  initModsUI();
  // legal documents (footer links)
  document.querySelectorAll('[data-legal]').forEach((b) =>
    b.addEventListener('click', () => showLegalDialog(b.dataset.legal)));
  // brand-new setup? offer the guided first-run wizard
  maybeShowSetupWizard();
}

function buildPresetList() {
  const wrap = $('presetList');
  wrap.innerHTML = '';
  for (const p of PRESETS) {
    const card = uiElement('div', { className: 'preset-card', parent: wrap });
    uiElement('div', { className: 'grow', html: `<h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p>`, parent: card });
    uiButton(card, {
      small: true,
      variant: 'primary',
      text: 'Apply',
      onClick: () => {
        for (const [k, v] of Object.entries(p.values)) {
          const o = optByKey.get(k.toLowerCase());
          if (o) setValSilent(o, v);
        }
        saveState(); render(); refreshBadges();
        $('dlgPresets').close();
        toast(`Preset applied: ${p.name.replace(/^\S+\s/, '')} — tweak anything you like!`);
      },
    });
  }
}

/* Desktop app (window.arkcc from the Electron preload): gate behind login.
   Plain browser: start immediately — no accounts on the web build. */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.arkcc !== 'undefined') authBoot();
  else init();
});
