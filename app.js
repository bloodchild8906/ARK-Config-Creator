/* =========================================================================
   ARK ASA Config Creator — app logic (vanilla JS, works from file://)
   ========================================================================= */
'use strict';

let LS_KEY = 'asaConfigCreator.v1';   // per-account key inside the desktop app

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
function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  if (typeof authPersist === 'function') authPersist();   // mirror into the desktop app's database
}
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
function setVal(o, v) {
  const same = (o.t === 'bool') ? Boolean(v) === Boolean(o.d)
    : (o.t === 'float' || o.t === 'int') ? normNum(v) !== null && normNum(v) === normNum(o.d)
    : String(v ?? '') === String(o.d ?? '');
  if (same) delete state.opts[o.k];
  else state.opts[o.k] = v;
  saveState();
  refreshBadges();
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
  list = list.slice(0, 200);
  for (const e of list) {
    const row = document.createElement('div');
    row.className = 'picker-row';
    const badge = e.mod ? 'From mod: ' + e.mod : comboGroupOf(pickerCtx.pick.t, e);
    row.innerHTML = `<div class="picker-row-main"><b>${esc(e.n)}</b>${badge ? ` <span class="mod-badge">${esc(badge)}</span>` : ''}<br><code>${esc(e.c)}</code></div>`;
    const btns = document.createElement('div');
    btns.className = 'picker-row-btns';
    const bCopy = document.createElement('button');
    bCopy.className = 'btn small';
    bCopy.innerHTML = uiIcon('copy', 15);
    bCopy.title = 'Copy class name';
    bCopy.addEventListener('click', () => copyText(e.c).then(() => toast(`Copied ${e.c}`)));
    btns.appendChild(bCopy);
    if (!pickerCtx.pick.copy) {
      const bAdd = document.createElement('button');
      bAdd.className = 'btn small primary';
      bAdd.innerHTML = uiIcon('plus', 15);
      bAdd.title = 'Add an entry for this ' + (pickerCtx.pick.t === 'dino' ? 'creature' : 'engram');
      bAdd.addEventListener('click', () => {
        const line = (pickerCtx.pick.tpl || '{c}').replace('{c}', e.c).replace('{t}', e.t || e.n.replace(/[^A-Za-z0-9]/g, ''));
        const ta = pickerCtx.textarea;
        ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + line;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        toast(`${e.n} added to “${pickerCtx.optName}”`);
      });
      btns.appendChild(bAdd);
    }
    row.appendChild(btns);
    wrap.appendChild(row);
  }
  if (total > list.length) {
    const more = document.createElement('div');
    more.className = 'empty-msg';
    more.style.padding = '10px 0';
    more.textContent = `…and ${total - list.length} more — type to narrow the list.`;
    wrap.appendChild(more);
  }
  if (!total) {
    const none = document.createElement('div');
    none.className = 'empty-msg';
    none.textContent = 'Nothing matches your search.';
    wrap.appendChild(none);
  }
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
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
        const icon = (MOD_CATS[mod.cat] || MOD_CATS.other).icon;
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

/* ---------------- option cards ---------------- */
function makeBoolControl(o, onchange) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  const lab = document.createElement('label');
  lab.className = 'switch';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  const sl = document.createElement('span');
  sl.className = 'slider-sw';
  lab.appendChild(inp); lab.appendChild(sl);
  const stateTxt = document.createElement('span');
  stateTxt.className = 'sw-state';
  wrap.appendChild(lab); wrap.appendChild(stateTxt);
  inp.addEventListener('change', () => { onchange(inp.checked); sync(); });
  function sync() {
    inp.checked = Boolean(getVal(o));
    stateTxt.textContent = inp.checked ? 'ON' : 'OFF';
    stateTxt.classList.toggle('on', inp.checked);
  }
  sync();
  return { el: wrap, sync };
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

function makeCard(o) {
  const card = document.createElement('div');
  card.className = 'opt-card';
  const isWide = o.t === 'text' || o.t === 'raw';
  if (isWide) card.classList.add('wide');

  const head = document.createElement('div');
  head.className = 'opt-head';
  const left = document.createElement('div');
  const fileLabel = o.virtual ? (o.f === 'gus' ? 'GameUserSettings.ini' : 'Game.ini')
    : `${o.f === 'gus' ? 'GameUserSettings.ini' : 'Game.ini'} › [${optSection(o)}]`;
  left.innerHTML = `<div class="opt-name">${esc(o.n)}</div><code class="opt-key" title="${esc(fileLabel)}">${o.virtual ? esc(fileLabel) : esc(o.dk || o.k)}</code>`;
  head.appendChild(left);
  card.appendChild(head);

  const help = document.createElement('p');
  help.className = 'opt-help';
  help.textContent = o.h;
  card.appendChild(help);
  if (o.note) {
    const note = document.createElement('p');
    note.className = 'opt-note';
    note.innerHTML = uiIcon('warn', 13) + ' ' + esc(o.note);
    card.appendChild(note);
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
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:2px';
    const ta = ctl.el.querySelector('textarea');
    if (typeof BUILDERS !== 'undefined' && BUILDERS[o.k] && !o.modId) {
      const bb = document.createElement('button');
      bb.className = 'btn small primary';
      bb.innerHTML = uiIcon('wand', 15) + ' Edit visually…';
      bb.addEventListener('click', () => openBuilder(o.k, ta, o.n));
      btnRow.appendChild(bb);
    }
    const pick = pickForOption(o);
    if (pick) {
      const pb = document.createElement('button');
      pb.className = 'btn small';
      pb.innerHTML = (pick.t === 'dino' ? uiIcon('dino', 15) + ' Pick a creature…' : uiIcon('book', 15) + ' Pick an engram…');
      pb.addEventListener('click', () => openPicker(pick, ta, o.n));
      btnRow.appendChild(pb);
    }
    if (btnRow.children.length) card.insertBefore(btnRow, ctl.el.nextSibling);
  }

  const foot = document.createElement('div');
  foot.className = 'opt-foot';
  const defTxt = document.createElement('span');
  if (o.dNull) {
    defTxt.textContent = 'Default: (not documented — only written if you set it)';
  } else if (!o.virtual) {
    defTxt.textContent = 'Default: ' + (o.t === 'bool' ? (o.d ? 'ON' : 'OFF') : (o.d === '' ? '(empty)' : o.d));
  }
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const rb = document.createElement('button');
  rb.className = 'reset-btn';
  rb.textContent = 'Reset to default';
  rb.addEventListener('click', () => resetVal(o));
  foot.appendChild(defTxt); foot.appendChild(spacer); foot.appendChild(rb);
  card.appendChild(foot);

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

  const head = document.createElement('div');
  head.className = 'opt-head';
  head.innerHTML = `<div><div class="opt-name">${esc(meta.n)}</div><code class="opt-key">Game.ini › ${esc(grpId)}[0…11]</code></div>`;
  card.appendChild(head);

  const help = document.createElement('p');
  help.className = 'opt-help';
  help.textContent = meta.h + ' Default for every stat is 1.';
  card.appendChild(help);

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

  const foot = document.createElement('div');
  foot.className = 'opt-foot';
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const rb = document.createElement('button');
  rb.className = 'reset-btn';
  rb.textContent = 'Reset all 12 to default';
  rb.addEventListener('click', () => {
    members.forEach((o) => delete state.opts[o.k]);
    saveState(); update(); refreshBadges();
  });
  foot.appendChild(document.createElement('span'));
  foot.appendChild(spacer); foot.appendChild(rb);
  card.appendChild(foot);

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
  const same = String(v) === String(f.d) || (f.t === 'bool' && Boolean(v) === Boolean(f.d));
  if (same) delete state.launch[f.k];
  else state.launch[f.k] = v;
  saveState();
  refreshBadges();
  updateCmdBox();
}
let cmdBoxEl = null;
function buildLaunchCommand(forBat) {
  const spec = buildLaunchSpec();
  const exe = forBat
    ? `"${spec.serverPath || 'C:\\ASAServer\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe'}"`
    : 'ArkAscendedServer.exe';
  const args = spec.args.map((arg) => arg.startsWith('-ClusterDirOverride=')
    ? '-ClusterDirOverride="' + arg.slice('-ClusterDirOverride='.length) + '"'
    : arg);
  if (spec.extraArgs) args.push(spec.extraArgs);
  return `${exe} "${spec.query}" ${args.join(' ')}`;
}
function buildLaunchSpec() {
  const L = {};
  for (const f of LAUNCH_FIELDS) L[f.k] = getLaunch(f);
  const map = L.map === '__custom' ? (L.customMap || 'TheIsland_WP') : L.map;

  // the whole query string is wrapped in one pair of quotes, so spaces in the
  // session name are fine — no inner quotes (they would break the command line)
  let query = map + '?listen';
  const sn = state.opts.SessionName;
  if (sn) query += `?SessionName=${sn}`;
  const port = state.opts.Port;
  if (port) query += `?Port=${port}`;

  const args = [];
  args.push(`-WinLiveMaxPlayers=${L.maxPlayers || 70}`);
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

function renderLaunchCategory(grid) {
  const fieldCards = {};   // field key -> card, so handlers can toggle related cards
  for (const f of LAUNCH_FIELDS) {
    const card = document.createElement('div');
    fieldCards[f.k] = card;
    card.className = 'opt-card';
    const head = document.createElement('div');
    head.className = 'opt-head';
    const left = document.createElement('div');
    left.innerHTML = `<div class="opt-name">${esc(f.n)}</div><code class="opt-key">launch option</code>`;
    head.appendChild(left);
    card.appendChild(head);
    const help = document.createElement('p');
    help.className = 'opt-help';
    help.textContent = f.h;
    card.appendChild(help);

    if (f.t === 'bool') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px';
      const lab = document.createElement('label');
      lab.className = 'switch';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      const sl = document.createElement('span');
      sl.className = 'slider-sw';
      lab.appendChild(inp); lab.appendChild(sl);
      const stateTxt = document.createElement('span');
      stateTxt.className = 'sw-state';
      wrap.appendChild(lab); wrap.appendChild(stateTxt);
      const syncL = () => {
        inp.checked = Boolean(getLaunch(f));
        stateTxt.textContent = inp.checked ? 'ON' : 'OFF';
        stateTxt.classList.toggle('on', inp.checked);
        card.classList.toggle('changed', Boolean(getLaunch(f)) !== Boolean(f.d));
      };
      inp.addEventListener('change', () => { setLaunch(f, inp.checked); syncL(); });
      syncL();
      head.appendChild(wrap);
    } else if (f.t === 'int') {
      const wrap = document.createElement('div');
      wrap.className = 'ctl-num';
      const num = document.createElement('input');
      num.type = 'number';
      num.step = '1';
      num.value = getLaunch(f);
      num.addEventListener('input', () => {
        if (num.value === '') return;
        setLaunch(f, num.value);
        card.classList.toggle('changed', String(getLaunch(f)) !== String(f.d));
      });
      wrap.appendChild(num);
      card.appendChild(wrap);
    } else if (f.t === 'select' || f.t === 'map') {
      const sel = document.createElement('select');
      const choices = f.t === 'map' ? MAPS.map((m) => [m.id, m.name]) : f.choices;
      for (const [v, label] of choices) {
        const op = document.createElement('option');
        op.value = v; op.textContent = label;
        sel.appendChild(op);
      }
      sel.value = getLaunch(f);
      sel.addEventListener('change', () => {
        setLaunch(f, sel.value);
        card.classList.toggle('changed', String(getLaunch(f)) !== String(f.d));
        // show/hide the custom-map card in place — a full render() here would
        // destroy this select and drop keyboard focus on every arrow-key step
        if (f.t === 'map' && fieldCards.customMap) {
          fieldCards.customMap.style.display = sel.value === '__custom' ? '' : 'none';
        }
      });
      card.appendChild(sel);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'ctl-text';
      const inp = document.createElement('input');
      inp.type = 'text';
      if (f.ph) inp.placeholder = f.ph;
      inp.value = getLaunch(f);
      inp.addEventListener('input', () => {
        setLaunch(f, inp.value);
        card.classList.toggle('changed', String(getLaunch(f)) !== String(f.d));
      });
      wrap.appendChild(inp);
      card.appendChild(wrap);
    }
    card.classList.toggle('changed', f.t === 'bool'
      ? Boolean(getLaunch(f)) !== Boolean(f.d)
      : String(getLaunch(f)) !== String(f.d));

    if (f.k === 'customMap' && getLaunch(LAUNCH_FIELDS[0]) !== '__custom') card.style.display = 'none';
    grid.appendChild(card);
  }

  // live command preview
  const box = document.createElement('div');
  box.className = 'cmd-box';
  cmdBoxEl = box;
  const label = document.createElement('div');
  label.className = 'search-cat-label';
  label.innerHTML = uiIcon('server', 14) + ' Your start command (auto-generated)';
  grid.appendChild(label);
  grid.appendChild(box);
  const rowBtns = document.createElement('div');
  rowBtns.style.gridColumn = '1 / -1';
  rowBtns.style.display = 'flex';
  rowBtns.style.gap = '8px';
  const bCopy = document.createElement('button');
  bCopy.className = 'btn small';
  bCopy.innerHTML = uiIcon('copy', 15) + ' Copy command';
  bCopy.addEventListener('click', () => copyText(buildLaunchCommand(false)).then(() => toast('Command copied!')));
  const bBat = document.createElement('button');
  bBat.className = 'btn small primary';
  bBat.innerHTML = uiIcon('download', 15) + ' Download StartServer.bat';
  bBat.addEventListener('click', () => { download('StartServer.bat', buildBat()); toast('StartServer.bat downloaded'); });
  rowBtns.appendChild(bCopy); rowBtns.appendChild(bBat);
  grid.appendChild(rowBtns);
  updateCmdBox();
}

/* ---------------- render ---------------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function matchesSearch(o, term) {
  return o.n.toLowerCase().includes(term) || o.k.toLowerCase().includes(term) || (o.h || '').toLowerCase().includes(term);
}

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
    headEl.innerHTML = `<h2><span class="h2ic">${uiIcon('search', 22)}</span> Search results for “${esc(searchTerm)}”</h2><p>Searching every category. Clear the search box to go back.</p>`;
    let any = false;
    for (const c of CATEGORIES) {
    if (c.id === 'launch' || c.id === 'setup' || c.id === 'custom') continue;
      const matches = OPTIONS.filter((o) => o.c === c.id && matchesSearch(o, searchTerm) && (!changedOnly || isChanged(o)));
      const grpsDone = new Set();
      const cards = [];
      for (const o of matches) {
        if (o.grp) {
          if (!grpsDone.has(o.grp)) { grpsDone.add(o.grp); cards.push(makeStatGroupCard(o.grp)); }
        } else cards.push(makeCard(o));
      }
      if (cards.length) {
        any = true;
        const lab = document.createElement('div');
        lab.className = 'search-cat-label';
        lab.innerHTML = `${uiIcon(c.icon, 14)} ${esc(c.name)}`;
        grid.appendChild(lab);
        cards.forEach((el) => grid.appendChild(el));
      }
    }
    // settings of your selected mods
    for (const entry of (state.mods || [])) {
      const mod = modInfo(entry);
      const cards = [];
      for (const sec of (mod.ini || [])) {
        for (const s of sec.settings) {
          const o = modOption(mod, sec, s);
          if (matchesSearch(o, searchTerm) && (!changedOnly || isChanged(o))) cards.push(makeCard(o));
        }
      }
      if (cards.length) {
        any = true;
        const lab = document.createElement('div');
        lab.className = 'search-cat-label';
        lab.innerHTML = uiIcon('puzzle', 14) + ' ' + esc(mod.name);
        grid.appendChild(lab);
        cards.forEach((el) => grid.appendChild(el));
      }
    }
    // matching mods from the bundled catalog
    const modMatches = MODS_DB.filter((m) => m.name.toLowerCase().includes(searchTerm) || (m.sum || '').toLowerCase().includes(searchTerm));
    if (modMatches.length) {
      any = true;
      const lab = document.createElement('div');
      lab.className = 'search-cat-label';
      lab.innerHTML = uiIcon('puzzle', 14) + ' Mods';
      grid.appendChild(lab);
      const d = document.createElement('div');
      d.className = 'opt-card wide';
      d.innerHTML = `<p class="opt-help">${modMatches.length} mod${modMatches.length === 1 ? '' : 's'} match in the CurseForge catalog: <b>${modMatches.slice(0, 6).map((m) => esc(m.name)).join(', ')}${modMatches.length > 6 ? '…' : ''}</b></p>`;
      const b = document.createElement('button');
      b.className = 'btn small primary';
      b.innerHTML = uiIcon('puzzle', 16) + ' Open Mod Browser';
      b.addEventListener('click', () => { openModBrowser(); $('modSearch').value = searchTerm; browserFilter.term = searchTerm; renderModBrowser(); });
      d.appendChild(b);
      grid.appendChild(d);
    }
    if (!any) {
      const d = document.createElement('div');
      d.className = 'empty-msg';
      d.textContent = 'No settings match your search.';
      grid.appendChild(d);
    }
    return;
  }

  if (currentCat.startsWith('mod:')) {
    renderModPage(grid, parseInt(currentCat.slice(4), 10));
    return;
  }

  const cat = CATEGORIES.find((c) => c.id === currentCat);
  headEl.innerHTML = `<h2><span class="h2ic">${uiIcon(cat.icon, 22)}</span> ${esc(cat.name)}</h2><p>${esc(cat.desc)}</p>`;

  if (currentCat === 'launch') {
    renderLaunchCategory(grid);
    return;
  }
  if (currentCat === 'setup') {
    renderLocalServerSetup(grid);
    return;
  }
  if (currentCat === 'mods') {
    renderModsCategory(grid);
    return;
  }
  if (currentCat === 'deploy') {
    renderDeployCategory(grid);
    return;
  }

  const grpsDone = new Set();
  let shown = 0;
  for (const o of OPTIONS) {
    if (o.c !== currentCat) continue;
    if (changedOnly && !(o.grp ? OPTIONS.some((m) => m.grp === o.grp && isChanged(m)) : isChanged(o))) continue;
    if (o.grp) {
      if (grpsDone.has(o.grp)) continue;
      grpsDone.add(o.grp);
      grid.appendChild(makeStatGroupCard(o.grp));
    } else {
      grid.appendChild(makeCard(o));
    }
    shown++;
  }
  if (!shown) {
    const d = document.createElement('div');
    d.className = 'empty-msg';
    d.textContent = changedOnly ? 'You haven’t changed anything in this category yet.' : 'Nothing here.';
    grid.appendChild(d);
  }
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

/* ---------------- import ----------------
   Returns true when something was imported (callers keep the pasted text and
   the dialog open on failure). opts.skipRender leaves the UI untouched so a
   caller mid-operation (e.g. a deploy read) can re-render once at the end. */
function importText(text, opts = {}) {
  const trimmed = text.trim();
  if (!trimmed) { toast('Nothing to import — the text was empty.'); return false; }

  // Profile JSON?
  if (trimmed[0] === '{') {
    try {
      const j = JSON.parse(trimmed);
      if (j && (j.opts || j.launch || j.mods)) {
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
        if (!opts.skipRender) { buildSidebar(); render(); refreshBadges(); }
        toast('Profile loaded!');
        return true;
      }
      toast('That JSON file is not an ARK Config Creator profile.');
      return false;
    } catch (e) { toast('That JSON file could not be read.'); return false; }
  }

  const lines = trimmed.split(/\r?\n/);
  let section = '';
  let modHandler = null;   // active when the current section belongs to a known mod
  let recognized = 0;
  let aseCount = 0;        // old ASE-only settings that ASA ignores
  const unknownBySection = new Map(); // section -> lines
  const clearedMultiline = new Set();

  const gusSections = new Set(GUS_SECTION_ORDER.map((s) => s.toLowerCase()));

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) continue;
    const mSec = line.match(/^\[(.+)\]$/);
    if (mSec) { section = mSec[1].trim(); modHandler = modImportHandler(section); continue; }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    // keys inside a known mod's section always belong to that mod
    if (modHandler) { modHandler(key, value); recognized++; continue; }

    // strip array index for lookup: PerLevelStats...[3] stays as-is (we have those keys); ItemStatClamps[1] etc. won't match -> raw
    const o = optByKey.get(key.toLowerCase());
    if (o && !o.virtual) {
      recognized++;
      if (o.t === 'bool') {
        setValSilent(o, /^(true|1)$/i.test(value));
      } else if (o.t === 'float' || o.t === 'int') {
        setValSilent(o, value);
      } else if (o.t === 'str') {
        setValSilent(o, value);
      } else { // text: accumulate lines
        if (!clearedMultiline.has(o.k)) { state.opts[o.k] = ''; clearedMultiline.add(o.k); }
        const cur = state.opts[o.k];
        state.opts[o.k] = (cur ? cur + '\n' : '') + value;
      }
    } else {
      const secKey = section || (looksLikeGameSection(section) ? GAME_SECTION : 'ServerSettings');
      if (!unknownBySection.has(secKey)) unknownBySection.set(secKey, []);
      unknownBySection.get(secKey).push(line);
      if (ASE_ONLY_KEYS.has(key.toLowerCase())) aseCount++;
    }
  }

  // clean up empty multiline imports
  for (const k of clearedMultiline) {
    if (state.opts[k] === '') delete state.opts[k];
  }

  // route unknown lines to custom boxes
  let unknownCount = 0;
  for (const [sec, ls] of unknownBySection) {
    const isGame = looksLikeGameSection(sec);
    const targetKey = isGame ? '__customGame' : '__customGUS';
    const o = optByKey.get(targetKey.toLowerCase());
    let cur = String(getVal(o) ?? '');
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

  saveState();
  if (!opts.skipRender) { buildSidebar(); render(); refreshBadges(); }
  let msg = `Imported: ${recognized} setting${recognized === 1 ? '' : 's'} recognized` + (unknownCount ? `, ${unknownCount} unknown line${unknownCount === 1 ? '' : 's'} kept in Custom / Extra Lines.` : '.');
  if (aseCount) msg += ` Warning: ${aseCount} of them ${aseCount === 1 ? 'is an' : 'are'} old-ARK (ASE) setting${aseCount === 1 ? '' : 's'} that ASA ignores.`;
  toast(msg);
  // for mods recognized in the import, look up their pages online for the rest
  // of their settings (async — pages update when results arrive)
  afterImportModDiscovery();
  return true;
}
function looksLikeGameSection(sec) {
  return /shootergamemode/i.test(sec || '');
}
function setValSilent(o, v) {
  const same = (o.t === 'bool') ? Boolean(v) === Boolean(o.d)
    : (o.t === 'float' || o.t === 'int') ? normNum(v) !== null && normNum(v) === normNum(o.d)
    : String(v ?? '') === String(o.d ?? '');
  if (same) delete state.opts[o.k];
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
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
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
function refreshExportPreview() {
  const inc = $('chkIncludeDefaults').checked;
  let text;
  if (exportTab === 'gus') text = buildIniFile('gus', inc);
  else if (exportTab === 'game') text = buildIniFile('game', inc);
  else text = buildBat();
  $('filePreview').textContent = text || '(empty — change some settings first)';
  $('exportHint').style.display = exportTab === 'bat' ? 'none' : '';
  const hintBat = 'Put StartServer.bat next to nothing special — just edit the server path inside if needed, then double-click it on your server machine to start the server.';
  if (exportTab === 'bat') {
    $('exportHint').style.display = '';
    $('exportHint').innerHTML = '<b>How to use:</b><br>' + esc(hintBat) + '<br>Set the “Server .exe Location” in 🚀 Launch Options so the path is correct.';
  } else {
    $('exportHint').innerHTML = '<b>Where do these files go?</b><br>On your server machine, place both .ini files in:<br><code>…\\ARK Survival Ascended Server\\ShooterGame\\Saved\\Config\\WindowsServer\\</code><br>(For rented servers, most hosts have a config editor or FTP — upload or paste the files there.) Restart the server afterwards. <b>Tip:</b> back up your old files first!<br><b>Skip the file juggling:</b> the Deploy tab in the sidebar can write these straight to Nitrado, a Pterodactyl panel, or a self-hosted server — with automatic backups.';
  }
}
function exportFileName() {
  return exportTab === 'gus' ? 'GameUserSettings.ini' : exportTab === 'game' ? 'Game.ini' : 'StartServer.bat';
}

/* ---------------- init ---------------- */
function init() {
  loadState();
  hydrateIcons();
  document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  buildSidebar();
  render();

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

  // Updates use the same NSIS installer as first-time installs. Selecting a
  // newer setup file upgrades in place and keeps the app's local data folder.
  const updateButton = $('btnUpdateApp');
  if (typeof window.arkcc !== 'undefined' && typeof window.arkcc.installAppUpdate === 'function') {
    updateButton.hidden = false;
    updateButton.addEventListener('click', async () => {
      if (!confirm('Select a newer ARK Config Creator installer to update this app in place? Your accounts, settings, and running local server service will be kept.')) return;
      updateButton.disabled = true;
      try {
        const result = await window.arkcc.installAppUpdate();
        if (result.canceled) { updateButton.disabled = false; return; }
        toast('Starting update to version ' + result.version + '…');
      } catch (error) {
        updateButton.disabled = false;
        toast('Could not start the update: ' + error.message);
      }
    });
  }

  $('btnResetAll').addEventListener('click', () => {
    if (confirm('Reset EVERY setting back to default? This also clears your mod list. This cannot be undone.')) {
      state.opts = {};
      state.launch = {};
      state.mods = [];
      state.modExtra = {};
      state.modDynIni = {};
      state.modDocs = {};
      state.modContent = {};
      currentCat = currentCat.startsWith('mod:') ? 'mods' : currentCat;
      saveState(); buildSidebar(); render(); refreshBadges();
      toast('All settings reset to defaults.');
    }
  });

  // modals
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // export
  $('btnExport').addEventListener('click', () => { $('dlgExport').showModal(); refreshExportPreview(); });
  document.querySelectorAll('#exportTabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#exportTabs .tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    exportTab = t.dataset.file;
    refreshExportPreview();
  }));
  $('chkIncludeDefaults').addEventListener('change', refreshExportPreview);
  $('btnCopyFile').addEventListener('click', () => copyText($('filePreview').textContent).then(() => toast('Copied to clipboard!')));
  $('btnDownloadFile').addEventListener('click', () => { download(exportFileName(), $('filePreview').textContent); toast(exportFileName() + ' downloaded'); });
  $('btnDownloadAll').addEventListener('click', () => {
    const inc = $('chkIncludeDefaults').checked;
    download('GameUserSettings.ini', buildIniFile('gus', inc));
    setTimeout(() => download('Game.ini', buildIniFile('game', inc)), 300);
    setTimeout(() => download('StartServer.bat', buildBat()), 600);
    toast('Downloading all 3 files…');
  });

  // import
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
    let anyOk = false;
    for (const f of e.target.files) {
      const text = await f.text();
      if (importText(text)) anyOk = true;
    }
    e.target.value = '';
    if (anyOk) $('dlgImport').close();   // a failed file leaves the dialog open with its error toast
  });
  const dz = $('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', async (e) => {
    let anyOk = false;
    for (const f of e.dataTransfer.files) {
      const text = await f.text();
      if (importText(text)) anyOk = true;
    }
    if (anyOk) $('dlgImport').close();
  });

  // presets
  $('btnPresets').addEventListener('click', () => { buildPresetList(); $('dlgPresets').showModal(); });
  $('btnSaveProfile').addEventListener('click', () => {
    download('my-ark-server-profile.json', JSON.stringify({ opts: state.opts, launch: state.launch, mods: state.mods, modExtra: state.modExtra, modDynIni: state.modDynIni, modDocs: state.modDocs, modContent: state.modContent }, null, 2));
    toast('Profile saved — load it later via Import.');
  });

  // picker
  $('pickerSearch').addEventListener('input', renderPickerList);

  // Ctrl+F (or "/" outside a field) jumps to the settings search
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey && e.key === 'f') || (!inField && e.key === '/')) {
      e.preventDefault();
      $('searchBox').focus();
      $('searchBox').select();
    }
  });

  // mods
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
    const card = document.createElement('div');
    card.className = 'preset-card';
    const grow = document.createElement('div');
    grow.className = 'grow';
    grow.innerHTML = `<h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn primary small';
    btn.textContent = 'Apply';
    btn.addEventListener('click', () => {
      for (const [k, v] of Object.entries(p.values)) {
        const o = optByKey.get(k.toLowerCase());
        if (o) setValSilent(o, v);
      }
      saveState(); render(); refreshBadges();
      $('dlgPresets').close();
      toast(`Preset applied: ${p.name.replace(/^\S+\s/, '')} — tweak anything you like!`);
    });
    card.appendChild(grow);
    card.appendChild(btn);
    wrap.appendChild(card);
  }
}

/* Desktop app (window.arkcc from the Electron preload): gate behind login.
   Plain browser: start immediately — no accounts on the web build. */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.arkcc !== 'undefined') authBoot();
  else init();
});
