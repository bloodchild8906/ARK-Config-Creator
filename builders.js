/* =========================================================================
   ARK ASA Config Creator — visual builders for list-style settings.
   Instead of hand-writing template lines, users build entries in a dialog:
   pick a dino/engram/item, fill in friendly fields, see the list, edit/delete.
   The builder reads and writes the option's textarea (both stay in sync).
   Depends on app.js helpers ($, esc, toast, state) and picker-db.js data.
   ========================================================================= */
'use strict';

/* ---------------- builder specs ---------------- */
const BUILDERS = {
  OverrideNamedEngramEntries: {
    kind: 'entries', entryName: 'engram override',
    fields: [
      { k: 'EngramClassName', t: 'engram', n: 'Engram', req: 1, quote: 1 },
      { k: 'EngramHidden', t: 'bool', n: 'Hide this engram completely', d: false },
      { k: 'EngramPointsCost', t: 'int', n: 'Engram points cost', ph: 'empty = unchanged' },
      { k: 'EngramLevelRequirement', t: 'int', n: 'Required level', ph: 'empty = unchanged' },
      { k: 'RemoveEngramPreReq', t: 'bool', n: 'Remove prerequisites', d: false },
    ],
  },
  EngramEntryAutoUnlocks: {
    kind: 'entries', entryName: 'auto-unlock',
    fields: [
      { k: 'EngramClassName', t: 'engram', n: 'Engram', req: 1, quote: 1 },
      { k: 'LevelToAutoUnlock', t: 'int', n: 'Unlocks automatically at level', d: 1, req: 1 },
    ],
  },
  OverrideEngramEntries: {
    kind: 'entries', entryName: 'engram override (by index)',
    fields: [
      { k: 'EngramIndex', t: 'int', n: 'Engram index number', req: 1, ph: 'e.g. 0' },
      { k: 'EngramHidden', t: 'bool', n: 'Hide this engram', d: false },
      { k: 'EngramPointsCost', t: 'int', n: 'Engram points cost', ph: 'empty = unchanged' },
      { k: 'EngramLevelRequirement', t: 'int', n: 'Required level', ph: 'empty = unchanged' },
      { k: 'RemoveEngramPreReq', t: 'bool', n: 'Remove prerequisites', d: false },
    ],
  },
  DinoClassDamageMultipliers: {
    kind: 'entries', entryName: 'damage rule',
    fields: [
      { k: 'ClassName', t: 'dino', n: 'Wild creature', req: 1, quote: 1 },
      { k: 'Multiplier', t: 'float', n: 'Damage multiplier (2 = double damage)', d: 1.5, req: 1 },
    ],
  },
  DinoClassResistanceMultipliers: {
    kind: 'entries', entryName: 'resistance rule',
    fields: [
      { k: 'ClassName', t: 'dino', n: 'Wild creature', req: 1, quote: 1 },
      { k: 'Multiplier', t: 'float', n: 'Damage TAKEN multiplier (0.5 = takes half damage)', d: 0.5, req: 1 },
    ],
  },
  TamedDinoClassDamageMultipliers: {
    kind: 'entries', entryName: 'damage rule',
    fields: [
      { k: 'ClassName', t: 'dino', n: 'Tamed creature', req: 1, quote: 1 },
      { k: 'Multiplier', t: 'float', n: 'Damage multiplier (2 = double damage)', d: 1.5, req: 1 },
    ],
  },
  TamedDinoClassResistanceMultipliers: {
    kind: 'entries', entryName: 'resistance rule',
    fields: [
      { k: 'ClassName', t: 'dino', n: 'Tamed creature', req: 1, quote: 1 },
      { k: 'Multiplier', t: 'float', n: 'Damage TAKEN multiplier (0.5 = takes half damage)', d: 0.5, req: 1 },
    ],
  },
  DinoSpawnWeightMultipliers: {
    kind: 'entries', entryName: 'spawn rule',
    fields: [
      { k: 'DinoNameTag', t: 'dinotag', n: 'Creature', req: 1 },
      { k: 'SpawnWeightMultiplier', t: 'float', n: 'Spawn chance (2 = twice as common, 0.1 = rare)', d: 2, req: 1 },
      { k: 'OverrideSpawnLimitPercentage', t: 'bool', n: 'Also cap how much of an area they can fill', d: false },
      { k: 'SpawnLimitPercentage', t: 'float', n: 'Max share of local spawns (0.25 = 25%)', d: 0.25 },
    ],
  },
  NPCReplacements: {
    kind: 'entries', entryName: 'replacement',
    fields: [
      { k: 'FromClassName', t: 'dino', n: 'Replace this creature', req: 1, quote: 1 },
      { k: 'ToClassName', t: 'dino', n: 'With this creature (leave empty to remove it from the map)', quote: 1, allowEmpty: 1 },
    ],
  },
  PreventDinoTameClassNames: {
    kind: 'entries', bare: 1, entryName: 'blocked species',
    fields: [{ k: '', t: 'dino', n: 'Creature that can never be tamed', req: 1 }],
  },
  PreventBreedingForClassNames: {
    kind: 'entries', bare: 1, entryName: 'blocked species',
    fields: [{ k: '', t: 'dino', n: 'Creature that can never be bred', req: 1 }],
  },
  ConfigOverrideItemMaxQuantity: {
    kind: 'entries', entryName: 'stack rule',
    fields: [
      { k: 'ItemClassString', t: 'item', n: 'Item', req: 1, quote: 1 },
      { k: '__maxQty', t: 'int', n: 'Items per stack', d: 500, req: 1 },
      { k: '__ignoreMult', t: 'bool', n: 'Ignore the global stack multiplier (use this exact number)', d: true },
    ],
    serialize: (v) => `(ItemClassString="${v.ItemClassString}",Quantity=(MaxItemQuantity=${v.__maxQty},bIgnoreMultiplier=${v.__ignoreMult ? 'true' : 'false'}))`,
    parse: (line) => {
      const cls = (line.match(/ItemClassString\s*=\s*"([^"]*)"/) || [])[1];
      const qty = (line.match(/MaxItemQuantity\s*=\s*([\d.]+)/) || [])[1];
      const ign = (line.match(/bIgnoreMultiplier\s*=\s*(\w+)/) || [])[1];
      if (!cls || !qty) return null;
      return { ItemClassString: cls, __maxQty: parseInt(qty, 10), __ignoreMult: /^true$/i.test(ign || 'true') };
    },
  },
  ConfigOverrideItemCraftingCosts: {
    kind: 'entries', entryName: 'crafting cost',
    fields: [
      { k: 'ItemClassString', t: 'item', n: 'Item to change the recipe of', req: 1, quote: 1 },
      { k: '__res', t: 'reslist', n: 'Resources needed to craft it', req: 1 },
    ],
    serialize: (v) => {
      const parts = v.__res.map((r) => `(ResourceItemTypeString="${r.c}",BaseResourceRequirement=${r.amt},bCraftingRequireExactResourceType=false)`);
      return `(ItemClassString="${v.ItemClassString}",BaseCraftingResourceRequirements=(${parts.join(',')}))`;
    },
    parse: (line) => {
      const cls = (line.match(/ItemClassString\s*=\s*"([^"]*)"/) || [])[1];
      if (!cls) return null;
      const res = [];
      for (const m of line.matchAll(/ResourceItemTypeString\s*=\s*"([^"]*)"[^)]*?BaseResourceRequirement\s*=\s*([\d.]+)/g)) {
        res.push({ c: m[1], amt: parseFloat(m[2]) });
      }
      if (!res.length) return null;
      return { ItemClassString: cls, __res: res };
    },
  },
  LevelExperienceRampOverrides: { kind: 'ramp' },
  OverridePlayerLevelEngramPoints: { kind: 'engrampoints' },
};

/* ---- spawn-area builders: pick an area, pick creatures, the tool writes the
        whole container entry (names, weights and limits included) ---- */
function spawnEntryName(cls) {
  return 'ACC_' + classDisplayName(cls).replace(/[^A-Za-z0-9]/g, '');
}
function serializeSpawnRows(v, withWeights) {
  const rows = v.rows || [];
  const entries = withWeights
    ? rows.map((r) => `(AnEntryName="${spawnEntryName(r.c)}",EntryWeight=${r.w ?? 1},NPCsToSpawnStrings=("${r.c}"))`)
    : rows.map((r) => `(NPCsToSpawnStrings=("${r.c}"))`);
  const limits = withWeights
    ? rows.filter((r) => r.pct > 0).map((r) => `(NPCClassString="${r.c}",MaxPercentageOfDesiredNumToAllow=${r.pct})`)
    : [];
  let out = `(NPCSpawnEntriesContainerClassString="${v.container}",NPCSpawnEntries=(${entries.join(',')})`;
  if (limits.length) out += `,NPCSpawnLimits=(${limits.join(',')})`;
  return out + ')';
}
function parseSpawnRows(line, withWeights) {
  const container = (line.match(/NPCSpawnEntriesContainerClassString\s*=\s*"([^"]+)"/) || [])[1];
  if (!container) return null;
  const rows = [];
  if (withWeights) {
    for (const m of line.matchAll(/EntryWeight\s*=\s*([\d.]+)\s*,\s*NPCsToSpawnStrings\s*=\s*\(\s*"([^"]+)"/g)) {
      rows.push({ c: m[2], w: parseFloat(m[1]), pct: 0 });
    }
  }
  for (const m of line.matchAll(/NPCsToSpawnStrings\s*=\s*\(\s*"([^"]+)"/g)) {
    if (!rows.some((r) => r.c === m[1])) rows.push(withWeights ? { c: m[1], w: 1, pct: 0 } : { c: m[1] });
  }
  for (const m of line.matchAll(/NPCClassString\s*=\s*"([^"]+)"[^)]*MaxPercentageOfDesiredNumToAllow\s*=\s*([\d.]+)/g)) {
    const row = rows.find((r) => r.c === m[1]);
    if (row) row.pct = parseFloat(m[2]);
  }
  return rows.length ? { container, rows } : null;
}
function spawnRowsSummary(v) {
  const names = (v.rows || []).map((r) => classToName(r.c));
  return `<b>${esc(classToName(v.container))}</b> · ${esc(names.slice(0, 5).join(', '))}${names.length > 5 ? ` +${names.length - 5} more` : ''}`;
}

BUILDERS.ConfigAddNPCSpawnEntriesContainer = {
  kind: 'entries', entryName: 'spawn addition',
  fields: [
    { k: 'container', t: 'spawnarea', n: 'Spawn area (which part of the map)', req: 1 },
    { k: 'rows', t: 'dinolist', n: 'Creatures to add there', req: 1, cols: true },
  ],
  serialize: (v) => serializeSpawnRows(v, true),
  parse: (line) => parseSpawnRows(line, true),
  summary: spawnRowsSummary,
};
BUILDERS.ConfigOverrideNPCSpawnEntriesContainer = {
  kind: 'entries', entryName: 'spawn replacement',
  fields: [
    { k: 'container', t: 'spawnarea', n: 'Spawn area to fully replace', req: 1 },
    { k: 'rows', t: 'dinolist', n: 'The ONLY creatures that will spawn there', req: 1, cols: true },
  ],
  serialize: (v) => serializeSpawnRows(v, true),
  parse: (line) => parseSpawnRows(line, true),
  summary: spawnRowsSummary,
};
BUILDERS.ConfigSubtractNPCSpawnEntriesContainer = {
  kind: 'entries', entryName: 'spawn removal',
  fields: [
    { k: 'container', t: 'spawnarea', n: 'Spawn area', req: 1 },
    { k: 'rows', t: 'dinolist', n: 'Creatures to remove from it', req: 1 },
  ],
  serialize: (v) => serializeSpawnRows(v, false),
  parse: (line) => parseSpawnRows(line, false),
  summary: spawnRowsSummary,
};

/* ---------------- lookups ---------------- */
const _classNameIndex = new Map();
function classToName(cls) {
  if (!_classNameIndex.size) {
    for (const d of DINOS_DB) _classNameIndex.set(d.c.toLowerCase(), d.n);
    for (const e of ENGRAMS_DB) _classNameIndex.set(e.c.toLowerCase(), e.n);
    for (const i of ITEMS_DB) _classNameIndex.set(i.c.toLowerCase(), i.n);
    for (const s of SPAWNS_DB) _classNameIndex.set(s.c.toLowerCase(), `${s.n} (${s.m})`);
    for (const d of DINOS_DB) if (d.t && !_classNameIndex.has('tag:' + d.t.toLowerCase())) _classNameIndex.set('tag:' + d.t.toLowerCase(), d.n);
  }
  const key = String(cls).toLowerCase();
  return _classNameIndex.get(key) || modContentName(cls) || cls;
}

const FIELD_KIND = { dino: 'dinos', dinotag: 'dinos', engram: 'engrams', item: 'items', spawnarea: 'spawns' };
const FIELD_BASE_DB = () => ({ dino: DINOS_DB, dinotag: DINOS_DB, engram: ENGRAMS_DB, item: ITEMS_DB, spawnarea: SPAWNS_DB });

/* Base database plus any modded content detected for the selected mods.
   Modded entries carry a `mod` label so the UI can show where they come from. */
function builderDb(t) {
  const base = FIELD_BASE_DB()[t] || DINOS_DB;
  const modded = modContentEntries(FIELD_KIND[t] || 'dinos');
  return modded.length ? base.concat(modded) : base;
}

/* ---------------- generic serialize / parse ---------------- */
function serializeEntry(spec, v) {
  if (spec.serialize) return spec.serialize(v);
  if (spec.bare) return String(v[''] || '').trim();
  const parts = [];
  for (const f of spec.fields) {
    let val = v[f.k];
    if (val === undefined || val === null || val === '') {
      if (f.allowEmpty && f.quote) { parts.push(`${f.k}=""`); continue; }
      if (f.t === 'bool' && f.d !== undefined) val = f.d;
      else continue;
    }
    if (f.t === 'bool') parts.push(`${f.k}=${val ? 'True' : 'False'}`);
    else if (f.quote) parts.push(`${f.k}="${val}"`);
    else parts.push(`${f.k}=${val}`);
  }
  return '(' + parts.join(',') + ')';
}
function parseEntryLine(spec, line) {
  line = line.trim();
  if (!line) return null;
  if (spec.parse) return spec.parse(line);
  if (spec.bare) {
    if (/^[A-Za-z][\w]*$/.test(line)) return { '': line };
    return null;
  }
  if (!line.startsWith('(')) return null;
  const v = {};
  let any = false;
  for (const f of spec.fields) {
    const m = line.match(new RegExp(f.k + '\\s*=\\s*"?([^,()"]*)"?', 'i'));
    if (!m) continue;
    any = true;
    let val = m[1].trim();
    if (f.t === 'bool') v[f.k] = /^true$/i.test(val);
    else if (f.t === 'int') v[f.k] = val === '' ? '' : parseInt(val, 10);
    else if (f.t === 'float') v[f.k] = val === '' ? '' : parseFloat(val);
    else v[f.k] = val;
  }
  return any ? v : null;
}
function entrySummary(spec, v) {
  if (spec.summary) return spec.summary(v);
  if (spec.bare) return classToName(v['']);
  const bits = [];
  for (const f of spec.fields) {
    const val = v[f.k];
    if (val === undefined || val === null || val === '') continue;
    if (f.t === 'engram' || f.t === 'dino' || f.t === 'item') bits.push('<b>' + esc(classToName(val)) + '</b>');
    else if (f.t === 'dinotag') bits.push('<b>' + esc(classToName('tag:' + val)) + '</b>');
    else if (f.t === 'bool') { if (val) bits.push(esc(f.n)); }
    else if (f.t === 'reslist') bits.push(esc(val.map((r) => `${r.amt}× ${classToName(r.c)}`).join(', ')));
    else bits.push(esc(f.n.split('(')[0].trim() + ': ' + val));
  }
  return bits.join(' · ') || esc(serializeEntry(spec, v));
}

/* ---------------- searchable dropdown (dino / engram / item) ----------------
   Behaves like a select: clicking (or the chevron) browses the full list,
   grouped by category, with modded entries labelled by their mod. Typing
   filters; manual class names (unlisted modded content) are still allowed. */
const COMBO_BROWSE_LIMIT = 150;
const COMBO_SEARCH_LIMIT = 40;

function comboGroupOf(t, e) {
  if (e.mod) return 'From mod: ' + e.mod;
  if (t === 'engram') return { Base: 'Base game', ASA: 'ASA additions', BTT: "Bob's Tall Tales", LC: 'Lost Colony' }[e.s] || 'Other';
  if (t === 'spawnarea') return e.m || 'Other';
  return e.g || 'Other';
}

function makeCombo(t, placeholder) {
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = placeholder || 'Search or browse…';
  inp.autocomplete = 'off';
  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = 'combo-chevron';
  chevron.tabIndex = -1;
  chevron.innerHTML = uiIcon('chevdown', 15);
  const drop = document.createElement('div');
  drop.className = 'combo-drop';
  drop.style.display = 'none';
  wrap.append(inp, chevron, drop);

  let value = '';
  const commit = (val, label) => {
    value = val;
    inp.value = label;
    drop.style.display = 'none';
    inp.classList.add('combo-ok');
  };
  const entryRow = (e) => {
    const row = document.createElement('div');
    row.className = 'combo-row';
    const cls = t === 'dinotag' ? (e.t || '') : e.c;
    const label = t === 'spawnarea' && e.m ? `${e.n} (${e.m})` : e.n;
    row.innerHTML = `<b>${esc(label)}</b>${e.mod ? ` <span class="mod-badge">${esc(e.mod)}</span>` : ''}<code>${esc(cls)}</code>`;
    row.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      commit(t === 'dinotag' ? (e.t || e.n) : e.c, label);
    });
    return row;
  };
  /* render-only: rebuilds the dropdown list. The committed value is cleared
     ONLY when the user actually types (see the input handler) — merely
     focusing/browsing a filled combo must never discard a committed pick. */
  const refresh = () => {
    const term = inp.value.trim().toLowerCase();
    const db = builderDb(t);
    const hits = term
      ? db.filter((e) => e.n.toLowerCase().includes(term) || e.c.toLowerCase().includes(term)).slice(0, COMBO_SEARCH_LIMIT)
      : db.slice(0, COMBO_BROWSE_LIMIT);
    drop.innerHTML = '';
    let lastGroup = null;
    for (const e of hits) {
      if (!term) {
        const group = comboGroupOf(t, e);
        if (group !== lastGroup) {
          lastGroup = group;
          const g = document.createElement('div');
          g.className = 'combo-group';
          g.textContent = group;
          drop.appendChild(g);
        }
      }
      drop.appendChild(entryRow(e));
    }
    if (!term && db.length > hits.length) {
      const more = document.createElement('div');
      more.className = 'combo-group';
      more.textContent = `…${db.length - hits.length} more — type to narrow the list`;
      drop.appendChild(more);
    }
    drop.style.display = hits.length ? '' : 'none';
  };
  inp.addEventListener('input', () => {
    value = '';
    inp.classList.remove('combo-ok');
    refresh();
  });
  inp.addEventListener('focus', refresh);
  inp.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 150));
  chevron.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    if (drop.style.display === 'none') { inp.focus(); } else { drop.style.display = 'none'; }
  });

  return {
    el: wrap,
    get: () => value || inp.value.trim(),   // manual class names (unlisted modded content) allowed
    set: (v) => {
      if (!v) { value = ''; inp.value = ''; inp.classList.remove('combo-ok'); return; }
      const label = classToName(t === 'dinotag' ? 'tag:' + v : v);
      commit(v, label === ('tag:' + v) ? v : label);
    },
    isPicked: () => !!value,
  };
}

/* ---------------- builder dialog ---------------- */
let builderCtx = null;   // { spec, textarea, optName, entries, editIndex, form }

function openBuilder(key, textarea, optName) {
  const spec = BUILDERS[key];
  if (!spec) return;
  builderCtx = { spec, textarea, optName, entries: [], editIndex: -1, rawLines: [] };
  $('builderTitle').innerHTML = uiIcon('wand', 20) + ' ' + esc(optName);
  if (spec.kind === 'ramp') { renderRampBuilder(); }
  else if (spec.kind === 'engrampoints') { renderPointsBuilder(); }
  else { loadEntries(); renderEntriesBuilder(); }
  $('dlgBuilder').showModal();
}

function loadEntries() {
  const { spec, textarea } = builderCtx;
  builderCtx.entries = [];
  builderCtx.rawLines = [];
  for (const line of textarea.value.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const v = parseEntryLine(spec, line);
    if (v) builderCtx.entries.push(v);
    else builderCtx.rawLines.push(line.trim());   // preserved as-is
  }
}
function saveEntries() {
  const { spec, textarea } = builderCtx;
  const lines = builderCtx.entries.map((v) => serializeEntry(spec, v)).concat(builderCtx.rawLines);
  textarea.value = lines.join('\n');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderEntriesBuilder() {
  const { spec, entries } = builderCtx;
  const body = $('builderBody');
  body.innerHTML = '';

  // current entries
  const list = document.createElement('div');
  list.className = 'builder-list';
  if (!entries.length && !builderCtx.rawLines.length) {
    list.innerHTML = `<div class="empty-msg" style="padding:14px 0">Nothing here yet — add your first ${esc(spec.entryName)} below.</div>`;
  }
  entries.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'picker-row';
    row.innerHTML = `<div class="picker-row-main">${entrySummary(spec, v)}<br><code>${esc(serializeEntry(spec, v)).slice(0, 120)}</code></div>`;
    const btns = document.createElement('div');
    btns.className = 'picker-row-btns';
    const bEdit = document.createElement('button');
    bEdit.className = 'btn small';
    bEdit.innerHTML = uiIcon('pencil', 14);
    bEdit.title = 'Edit';
    bEdit.addEventListener('click', () => { builderCtx.editIndex = i; renderEntriesBuilder(); });
    const bDel = document.createElement('button');
    bDel.className = 'btn small';
    bDel.innerHTML = uiIcon('x', 14);
    bDel.title = 'Remove';
    bDel.addEventListener('click', () => { entries.splice(i, 1); saveEntries(); builderCtx.editIndex = -1; renderEntriesBuilder(); });
    btns.appendChild(bEdit); btns.appendChild(bDel);
    row.appendChild(btns);
    list.appendChild(row);
  });
  if (builderCtx.rawLines.length) {
    const note = document.createElement('p');
    note.className = 'opt-help';
    note.textContent = `(${builderCtx.rawLines.length} line${builderCtx.rawLines.length === 1 ? '' : 's'} in a custom format ${'are'} kept unchanged.)`;
    list.appendChild(note);
  }
  body.appendChild(list);

  // add / edit form
  const editing = builderCtx.editIndex >= 0 ? entries[builderCtx.editIndex] : null;
  const form = document.createElement('div');
  form.className = 'builder-form';
  form.innerHTML = `<div class="opt-name" style="margin-bottom:8px">${editing ? 'Edit' : 'Add a'} ${esc(spec.entryName)}</div>`;
  const controls = {};
  for (const f of spec.fields) {
    const fw = document.createElement('div');
    fw.className = 'builder-field';
    const lab = document.createElement('label');
    lab.textContent = f.n + (f.req ? ' *' : '');
    fw.appendChild(lab);
    if (f.t === 'engram' || f.t === 'dino' || f.t === 'item' || f.t === 'dinotag' || f.t === 'spawnarea') {
      const what = { engram: 'engrams', item: 'items', spawnarea: 'spawn areas' }[f.t] || 'creatures';
      const combo = makeCombo(f.t, 'Search or browse ' + what + '…');
      if (editing && editing[f.k]) combo.set(editing[f.k]);
      controls[f.k] = combo;
      fw.appendChild(combo.el);
    } else if (f.t === 'dinolist') {
      // rows of creature + (optionally) spawn weight and max-share columns
      const listWrap = document.createElement('div');
      listWrap.className = 'reslist';
      const rows = [];
      const addRow = (preset) => {
        const rr = document.createElement('div');
        rr.className = 'reslist-row';
        const combo = makeCombo('dino', 'Creature…');
        if (preset && preset.c) combo.set(preset.c);
        rr.appendChild(combo.el);
        let wInp = null;
        let pctInp = null;
        if (f.cols) {
          wInp = document.createElement('input');
          wInp.type = 'number';
          wInp.step = '0.1';
          wInp.min = 0;
          wInp.value = preset && preset.w !== undefined ? preset.w : 1;
          wInp.title = 'Spawn weight — higher = more common';
          pctInp = document.createElement('input');
          pctInp.type = 'number';
          pctInp.step = '0.05';
          pctInp.min = 0;
          pctInp.max = 1;
          pctInp.value = preset && preset.pct ? preset.pct : '';
          pctInp.placeholder = 'max %';
          pctInp.title = 'Optional cap: max share of this area (0.25 = 25%)';
          const wLab = document.createElement('label');
          wLab.textContent = 'weight';
          wLab.style.fontSize = '.78rem';
          rr.append(wLab, wInp, pctInp);
        }
        const del = document.createElement('button');
        del.className = 'btn small';
        del.innerHTML = uiIcon('x', 13);
        const entry = { combo, wInp, pctInp, rr };
        del.addEventListener('click', () => { rr.remove(); rows.splice(rows.indexOf(entry), 1); });
        rr.appendChild(del);
        rows.push(entry);
        listWrap.insertBefore(rr, addBtn);
      };
      const addBtn = document.createElement('button');
      addBtn.className = 'btn small';
      addBtn.innerHTML = uiIcon('plus', 13) + ' Add creature';
      addBtn.addEventListener('click', () => addRow());
      listWrap.appendChild(addBtn);
      if (editing && Array.isArray(editing[f.k]) && editing[f.k].length) editing[f.k].forEach(addRow);
      else addRow();
      controls[f.k] = {
        get: () => rows
          .map((r) => ({ c: r.combo.get(), w: r.wInp ? parseFloat(r.wInp.value) || 1 : undefined, pct: r.pctInp ? parseFloat(r.pctInp.value) || 0 : undefined }))
          .filter((r) => r.c),
      };
      fw.appendChild(listWrap);
    } else if (f.t === 'bool') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = editing ? Boolean(editing[f.k]) : Boolean(f.d);
      lab.prepend(cb);
      lab.style.cursor = 'pointer';
      controls[f.k] = { get: () => cb.checked };
    } else if (f.t === 'reslist') {
      const resWrap = document.createElement('div');
      resWrap.className = 'reslist';
      const rows = [];
      const addRow = (c, amt) => {
        const rr = document.createElement('div');
        rr.className = 'reslist-row';
        const combo = makeCombo('item', 'Resource…');
        if (c) combo.set(c);
        const num = document.createElement('input');
        num.type = 'number';
        num.value = amt || 10;
        num.min = 0;
        num.title = 'Amount needed';
        const del = document.createElement('button');
        del.className = 'btn small';
        del.innerHTML = uiIcon('x', 13);
        del.addEventListener('click', () => { rr.remove(); rows.splice(rows.indexOf(entry), 1); });
        const entry = { combo, num };
        rows.push(entry);
        rr.appendChild(combo.el); rr.appendChild(num); rr.appendChild(del);
        resWrap.insertBefore(rr, addBtn);
      };
      const addBtn = document.createElement('button');
      addBtn.className = 'btn small';
      addBtn.innerHTML = uiIcon('plus', 13) + ' Add resource';
      addBtn.addEventListener('click', () => addRow());
      resWrap.appendChild(addBtn);
      if (editing && Array.isArray(editing[f.k])) for (const r of editing[f.k]) addRow(r.c, r.amt);
      else addRow();
      controls[f.k] = { get: () => rows.map((r) => ({ c: r.combo.get(), amt: parseFloat(r.num.value) || 0 })).filter((r) => r.c) };
      fw.appendChild(resWrap);
    } else {
      const num = document.createElement('input');
      num.type = 'number';
      if (f.t === 'float') num.step = '0.1';
      if (f.ph) num.placeholder = f.ph;
      if (editing && editing[f.k] !== undefined && editing[f.k] !== '') num.value = editing[f.k];
      else if (!editing && f.d !== undefined && f.t !== 'bool') num.value = f.d;
      controls[f.k] = { get: () => (num.value === '' ? '' : (f.t === 'int' ? parseInt(num.value, 10) : parseFloat(num.value))) };
      fw.appendChild(num);
    }
    form.appendChild(fw);
  }
  const rowBtns = document.createElement('div');
  rowBtns.style.cssText = 'display:flex;gap:8px;margin-top:10px';
  const bSave = document.createElement('button');
  bSave.className = 'btn primary small';
  bSave.innerHTML = editing ? uiIcon('save', 14) + ' Save changes' : uiIcon('plus', 14) + ' Add to list';
  bSave.addEventListener('click', () => {
    const v = {};
    for (const f of spec.fields) {
      const val = controls[f.k].get();
      if (f.req && (val === '' || val === undefined || (Array.isArray(val) && !val.length))) {
        toast(`Please fill in “${f.n.split('(')[0].trim()}”.`);
        return;
      }
      v[f.k] = val;
    }
    if (editing) builderCtx.entries[builderCtx.editIndex] = v;
    else builderCtx.entries.push(v);
    builderCtx.editIndex = -1;
    saveEntries();
    renderEntriesBuilder();
    toast(editing ? 'Entry updated.' : 'Added!');
  });
  rowBtns.appendChild(bSave);
  if (editing) {
    const bCancel = document.createElement('button');
    bCancel.className = 'btn small';
    bCancel.textContent = 'Cancel';
    bCancel.addEventListener('click', () => { builderCtx.editIndex = -1; renderEntriesBuilder(); });
    rowBtns.appendChild(bCancel);
  }
  form.appendChild(rowBtns);
  body.appendChild(form);
}

/* ---------------- level ramp builder ---------------- */
function renderRampBuilder() {
  const body = $('builderBody');
  const existing = builderCtx.textarea.value.split(/\r?\n/).filter((l) => l.trim());
  body.innerHTML = `
    <p class="opt-help">Builds fully custom level curves. Choose the max level and how much total XP the final level takes —
    the tool generates a smooth curve (like the popular level calculators).
    ${existing.length ? `<br><b>Currently set:</b> ${existing.length === 1 ? 'player levels only' : 'player + dino levels'} (${existing.length} line${existing.length === 1 ? '' : 's'}).` : ''}</p>
    <div class="builder-form">
      <div class="builder-field"><label>Max player level</label><input id="rampPMax" type="number" value="105" min="2" max="500"></div>
      <div class="builder-field"><label>Total XP to reach max level</label><input id="rampPXp" type="number" value="5000000" min="100"></div>
      <div class="builder-field"><label>Curve shape</label>
        <select id="rampShape">
          <option value="1.6">Gentle — early levels come fast</option>
          <option value="2" selected>Balanced (recommended)</option>
          <option value="2.6">Steep — high levels take much longer</option>
        </select></div>
      <div class="builder-field"><label style="cursor:pointer"><input id="rampDino" type="checkbox" checked> Also generate dino levels</label></div>
      <div class="builder-field" id="rampDinoWrap"><label>Max dino level-ups (after taming)</label><input id="rampDMax" type="number" value="88" min="2" max="500"></div>
      <div class="builder-field"><label style="cursor:pointer"><input id="rampSetMax" type="checkbox" checked> Also set the “Max XP Override” settings to match (recommended)</label></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn primary small" id="rampGen"></button>
      </div>
      <pre class="file-preview" id="rampPreview" style="min-height:70px;max-height:150px;display:none"></pre>
    </div>`;
  $('rampGen').innerHTML = uiIcon('bolt', 14) + ' Generate level curve';
  $('rampDino').addEventListener('change', () => { $('rampDinoWrap').style.display = $('rampDino').checked ? '' : 'none'; });
  $('rampGen').addEventListener('click', () => {
    const pMax = parseInt($('rampPMax').value, 10);
    const pXp = parseInt($('rampPXp').value, 10);
    const exp = parseFloat($('rampShape').value);
    if (!(pMax > 1) || !(pXp > 0)) { toast('Enter a max level and total XP first.'); return; }
    const makeRamp = (levels, totalXp) => {
      const vals = [];
      let prev = 0;
      for (let i = 1; i <= levels - 1; i++) {
        let xp = Math.round(totalXp * Math.pow(i / (levels - 1), exp));
        if (xp <= prev) xp = prev + 1;
        vals.push(xp);
        prev = xp;
      }
      return '(' + vals.map((x, idx) => `ExperiencePointsForLevel[${idx}]=${x}`).join(',') + ')';
    };
    const lines = [makeRamp(pMax, pXp)];
    if ($('rampDino').checked) {
      const dMax = parseInt($('rampDMax').value, 10) || 88;
      lines.push(makeRamp(dMax + 1, Math.round(pXp * 0.9)));
    }
    builderCtx.textarea.value = lines.join('\n');
    builderCtx.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    if ($('rampSetMax').checked) {
      const oP = OPTIONS.find((o) => o.k === 'OverrideMaxExperiencePointsPlayer');
      const oD = OPTIONS.find((o) => o.k === 'OverrideMaxExperiencePointsDino');
      if (oP) setValSilent(oP, pXp + 1);
      if (oD && $('rampDino').checked) setValSilent(oD, Math.round(pXp * 0.9) + 1);
      saveState(); refreshBadges();
    }
    const pv = $('rampPreview');
    const sample = [1, Math.round(pMax / 2), pMax - 1].map((lv) => {
      const xp = Math.round(pXp * Math.pow(lv / (pMax - 1), exp));
      return `Level ${lv + 1}: ${xp.toLocaleString()} XP total`;
    });
    pv.textContent = `Generated ${pMax - 1} player level steps${$('rampDino').checked ? ' + dino levels' : ''}:\n` + sample.join('\n');
    pv.style.display = '';
    toast('Level curve generated and applied!');
  });
}

/* ---------------- engram points builder ---------------- */
function renderPointsBuilder() {
  const body = $('builderBody');
  // compress existing lines into ranges
  const nums = builderCtx.textarea.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => parseInt(l.replace(/^.*=/, ''), 10)).filter((n) => !isNaN(n));
  const ranges = [];
  for (let i = 0; i < nums.length; i++) {
    const last = ranges[ranges.length - 1];
    if (last && last.pts === nums[i]) last.to = i + 2;
    else ranges.push({ from: i + 2, to: i + 2, pts: nums[i] });
  }
  if (!ranges.length) ranges.push({ from: 2, to: 105, pts: 8 });

  body.innerHTML = `
    <p class="opt-help">How many engram points players get at each level. Work in ranges — e.g. levels 2–20 give 8 points each,
    21–60 give 16, and so on. The tool writes one line per level for you.</p>
    <div class="builder-form">
      <div id="epRanges"></div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn small" id="epAdd"></button>
        <button class="btn primary small" id="epApply"></button>
        <span id="epTotal" style="font-size:.85rem;color:var(--muted);align-self:center"></span>
      </div>
    </div>`;
  $('epAdd').innerHTML = uiIcon('plus', 14) + ' Add range';
  $('epApply').innerHTML = uiIcon('bolt', 14) + ' Apply';
  const wrap = $('epRanges');
  const rowRefs = [];
  const addRange = (r) => {
    const row = document.createElement('div');
    row.className = 'reslist-row';
    row.innerHTML = `<label style="font-size:.85rem">Levels</label>`;
    const from = document.createElement('input'); from.type = 'number'; from.value = r.from; from.min = 2;
    const dash = document.createElement('span'); dash.textContent = '–';
    const to = document.createElement('input'); to.type = 'number'; to.value = r.to; to.min = 2;
    const lab = document.createElement('label'); lab.textContent = 'get'; lab.style.fontSize = '.85rem';
    const pts = document.createElement('input'); pts.type = 'number'; pts.value = r.pts; pts.min = 0;
    const lab2 = document.createElement('label'); lab2.textContent = 'points each'; lab2.style.fontSize = '.85rem';
    const del = document.createElement('button'); del.className = 'btn small'; del.innerHTML = uiIcon('x', 13);
    const ref = { from, to, pts, row };
    del.addEventListener('click', () => { row.remove(); rowRefs.splice(rowRefs.indexOf(ref), 1); updTotal(); });
    [from, to, pts].forEach((i) => i.addEventListener('input', updTotal));
    row.append(from, dash, to, lab, pts, lab2, del);
    wrap.appendChild(row);
    rowRefs.push(ref);
  };
  /* One points value per level, rows applied in listed order so a later row
     deliberately overrides an overlapping earlier one (e.g. 2–60 = 8, then
     10–20 = 20 boosts just the middle). Levels no range covers give 0. */
  const pointsByLevel = () => {
    const byLevel = new Map();
    for (const r of rowRefs) {
      const f = parseInt(r.from.value, 10), t = parseInt(r.to.value, 10), p = parseInt(r.pts.value, 10);
      if (f >= 2 && t >= f && p >= 0) for (let lv = f; lv <= t; lv++) byLevel.set(lv, p);
    }
    return byLevel;
  };
  const updTotal = () => {
    const byLevel = pointsByLevel();
    let total = 0;
    for (const p of byLevel.values()) total += p;
    $('epTotal').textContent = byLevel.size ? `${byLevel.size} levels · ${total.toLocaleString()} engram points in total` : '';
  };
  ranges.forEach(addRange);
  updTotal();
  $('epAdd').addEventListener('click', () => {
    const last = rowRefs[rowRefs.length - 1];
    const start = last ? (parseInt(last.to.value, 10) || 2) + 1 : 2;
    addRange({ from: start, to: start + 10, pts: 12 });
    updTotal();
  });
  $('epApply').addEventListener('click', () => {
    const byLevel = pointsByLevel();
    if (!byLevel.size) { toast('Add at least one level range first.'); return; }
    const maxLv = Math.max(...byLevel.keys());
    const lines = [];
    for (let lv = 2; lv <= maxLv; lv++) lines.push(String(byLevel.get(lv) ?? 0));
    builderCtx.textarea.value = lines.join('\n');
    builderCtx.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    toast(`Engram points set for ${lines.length} levels!`);
  });
}
