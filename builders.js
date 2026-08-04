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
      /* An unreadable quantity leaves the line unparsed, so it is preserved
         verbatim instead of being rewritten as `MaxItemQuantity=NaN`. */
      const max = builderInteger(qty, null);
      if (!cls || max === null) return null;
      return { ItemClassString: cls, __maxQty: max, __ignoreMult: /^true$/i.test(ign || 'true') };
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
        const amt = builderNumber(m[2], null);   // `.` matches [\d.]+ but is not a number
        if (amt !== null) res.push({ c: m[1], amt });
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
  /* Weights and caps are normalised here so a blank or unreadable box can
     never reach the config as `EntryWeight=NaN`. */
  const entries = withWeights
    ? rows.map((r) => `(AnEntryName="${spawnEntryName(r.c)}",EntryWeight=${builderNumber(r.w, 1)},NPCsToSpawnStrings=("${r.c}"))`)
    : rows.map((r) => `(NPCsToSpawnStrings=("${r.c}"))`);
  const limits = withWeights
    ? rows.filter((r) => builderNumber(r.pct, 0) > 0)
      .map((r) => `(NPCClassString="${r.c}",MaxPercentageOfDesiredNumToAllow=${builderNumber(r.pct, 0)})`)
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
      rows.push({ c: m[2], w: builderNumber(m[1], 1), pct: 0 });
    }
  }
  for (const m of line.matchAll(/NPCsToSpawnStrings\s*=\s*\(\s*"([^"]+)"/g)) {
    if (!rows.some((r) => r.c === m[1])) rows.push(withWeights ? { c: m[1], w: 1, pct: 0 } : { c: m[1] });
  }
  for (const m of line.matchAll(/NPCClassString\s*=\s*"([^"]+)"[^)]*MaxPercentageOfDesiredNumToAllow\s*=\s*([\d.]+)/g)) {
    const row = rows.find((r) => r.c === m[1]);
    if (row) row.pct = builderNumber(m[2], 0);
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

/* ---------------- generic serialize / parse ----------------
   Everything below eventually round-trips through the user's *real* server
   config, so two rules hold throughout: a failed parse falls back to the
   field's default (never NaN), and a value that is not writable is omitted
   rather than written out as `NaN` / `undefined`. */

/** Escapes a string so it can be embedded literally in a RegExp. */
function builderRegExpEscape(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* THE TRAP — do not remove the anchor or the escaping.
   Builder field keys overlap: DinoSpawnWeightMultipliers declares BOTH
   `OverrideSpawnLimitPercentage` and `SpawnLimitPercentage`. An unanchored
   pattern for the shorter key matches *inside* the longer one, so parsing
   `(...,OverrideSpawnLimitPercentage=True,SpawnLimitPercentage=0.25)` used to
   capture "True" for SpawnLimitPercentage, and parseFloat('True') = NaN was
   then written straight back into the user's config. A key must therefore be
   preceded by start-of-string, `(` or `,` (plus optional whitespace), and be
   regex-escaped in case a key ever contains a metacharacter. */
function builderKeyPattern(key) {
  return new RegExp('(?:^|[(,])\\s*' + builderRegExpEscape(key) + '\\s*=\\s*"?([^,()"]*)"?', 'i');
}

/** parseFloat that yields `fallback` instead of NaN/Infinity. */
function builderNumber(value, fallback) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** parseInt that yields `fallback` instead of NaN. */
function builderInteger(value, fallback) {
  const n = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function serializeEntry(spec, v) {
  if (spec.serialize) return spec.serialize(v);
  if (spec.bare) return String(v[''] || '').trim();
  const parts = [];
  for (const f of spec.fields) {
    let val = v[f.k];
    const missing = val === undefined || val === null || val === '';
    const broken = typeof val === 'number' && !Number.isFinite(val);   // NaN / ±Infinity
    if (missing) {
      if (f.allowEmpty && f.quote) { parts.push(`${f.k}=""`); continue; }
      if (f.t === 'bool' && f.d !== undefined) val = f.d;
      else continue;
    } else if (broken) {
      // A broken number is rescued by the field default, or dropped entirely.
      if (f.d !== undefined) val = f.d;
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
    const m = line.match(builderKeyPattern(f.k));
    if (!m) continue;
    any = true;
    const val = m[1].trim();
    /* An unreadable number becomes the field default when it has one, and an
       empty (i.e. "leave unchanged") value otherwise — never NaN. */
    const fallback = f.d !== undefined ? f.d : '';
    if (f.t === 'bool') v[f.k] = /^true$/i.test(val);
    else if (f.t === 'int') v[f.k] = val === '' ? '' : builderInteger(val, fallback);
    else if (f.t === 'float') v[f.k] = val === '' ? '' : builderNumber(val, fallback);
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

/** The human label of a database entry (spawn areas carry their map name). */
function comboLabelOf(t, e) {
  return t === 'spawnarea' && e.m ? `${e.n} (${e.m})` : e.n;
}

/** The class name (or dino tag) a database entry commits as its value. */
function comboValueOf(t, e) {
  if (t === 'dinotag') return e.t || e.n;
  return e.c;
}

/**
 * The visible slice of the database for a search term: an empty term browses
 * the head of the full list, a term narrows it. Pure — no DOM.
 *
 * @returns {{ db: Array, hits: Array }} `db` is the full list, for the "N more" hint.
 */
function comboMatches(t, term) {
  const db = builderDb(t);
  const hits = term
    ? db.filter((e) => e.n.toLowerCase().includes(term) || e.c.toLowerCase().includes(term)).slice(0, COMBO_SEARCH_LIMIT)
    : db.slice(0, COMBO_BROWSE_LIMIT);
  return { db, hits };
}

/** One clickable dropdown row. `onPick(value, label)` commits the choice. */
function comboEntryRow(t, e, onPick) {
  const cls = t === 'dinotag' ? (e.t || '') : e.c;
  const label = comboLabelOf(t, e);
  const row = uiElement('div', {
    className: 'combo-row',
    html: `<b>${esc(label)}</b>${e.mod ? ` <span class="mod-badge">${esc(e.mod)}</span>` : ''}<code>${esc(cls)}</code>`,
  });
  // mousedown (not click) so the pick lands before the input's blur handler.
  row.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    onPick(comboValueOf(t, e), label);
  });
  return row;
}

/**
 * Render-only: rebuilds `drop` for the current term and returns whether
 * anything matched. Never touches the committed value.
 */
function comboRenderDrop(t, drop, term, onPick) {
  const { db, hits } = comboMatches(t, term);
  drop.innerHTML = '';
  let lastGroup = null;
  for (const e of hits) {
    if (!term) {
      const group = comboGroupOf(t, e);
      if (group !== lastGroup) {
        lastGroup = group;
        uiElement('div', { className: 'combo-group', text: group, parent: drop });
      }
    }
    drop.appendChild(comboEntryRow(t, e, onPick));
  }
  if (!term && db.length > hits.length) {
    uiElement('div', { className: 'combo-group', text: `…${db.length - hits.length} more — type to narrow the list`, parent: drop });
  }
  return hits.length > 0;
}

/** The inert DOM skeleton of a combo: wrapper, input, chevron and dropdown. */
function comboSkeleton(placeholder) {
  const wrap = uiElement('div', { className: 'combo' });
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = placeholder || 'Search or browse…';
  inp.autocomplete = 'off';
  // Not a uiButton: the chevron is styled by `.combo-chevron` alone, not `.btn`.
  const chevron = uiElement('button', {
    className: 'combo-chevron',
    html: uiIcon('chevdown', 15),
    attrs: { type: 'button', tabindex: '-1' },
  });
  const drop = uiElement('div', { className: 'combo-drop' });
  drop.style.display = 'none';
  wrap.append(inp, chevron, drop);
  return { wrap, inp, chevron, drop };
}

/**
 * A searchable dropdown bound to one picker database.
 *
 * @param {string} t            field type: dino | dinotag | engram | item | spawnarea
 * @param {string} [placeholder]
 * @returns {{ el: HTMLElement, get: () => string, set: (v: string) => void, isPicked: () => boolean }}
 */
function makeCombo(t, placeholder) {
  const { wrap, inp, chevron, drop } = comboSkeleton(placeholder);

  let value = '';
  const commit = (val, label) => {
    value = val;
    inp.value = label;
    drop.style.display = 'none';
    inp.classList.add('combo-ok');
  };
  /* The committed value is cleared ONLY when the user actually types (see the
     input handler) — merely focusing/browsing a filled combo must never
     discard a committed pick. */
  const refresh = () => {
    const matched = comboRenderDrop(t, drop, inp.value.trim().toLowerCase(), commit);
    drop.style.display = matched ? '' : 'none';
  };

  inp.addEventListener('input', () => {
    value = '';
    inp.classList.remove('combo-ok');
    refresh();
  });
  inp.addEventListener('focus', refresh);
  // Delayed so a mousedown on a row is processed before the list disappears.
  inp.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, APP_TIMEOUTS.COMBO_BLUR_MS));
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

/* ---------------- entry field editors ----------------
   One factory per field type. Each builds its own DOM into `fieldWrap` and
   returns a control adapter: `get()` yields the value to store in the entry
   object, in exactly the shape serializeEntry() expects. */

const BUILDER_COMBO_TYPES = new Set(['engram', 'dino', 'item', 'dinotag', 'spawnarea']);
const BUILDER_COMBO_NOUNS = { engram: 'engrams', item: 'items', spawnarea: 'spawn areas' };

/** Searchable dropdown for a class name / dino tag. */
function builderComboField(f, fieldWrap, editing) {
  const combo = makeCombo(f.t, 'Search or browse ' + (BUILDER_COMBO_NOUNS[f.t] || 'creatures') + '…');
  if (editing && editing[f.k]) combo.set(editing[f.k]);
  fieldWrap.appendChild(combo.el);
  return combo;
}

/** Checkbox, rendered inside the field's own label so the text is clickable. */
function builderBoolField(f, label, editing) {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = editing ? Boolean(editing[f.k]) : Boolean(f.d);
  label.prepend(cb);
  label.style.cursor = 'pointer';
  return { get: () => cb.checked };
}

/** Rows of creature + (when `f.cols`) spawn weight and max-share columns. */
function builderDinoListField(f, fieldWrap, editing) {
  const listWrap = uiElement('div', { className: 'reslist', parent: fieldWrap });
  const rows = [];

  const addRow = (preset) => {
    const rr = uiElement('div', { className: 'reslist-row' });
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
      const wLab = uiElement('label', { text: 'weight' });
      wLab.style.fontSize = '.78rem';
      rr.append(wLab, wInp, pctInp);
    }
    const entry = { combo, wInp, pctInp, rr };
    uiButton(rr, {
      small: true,
      html: uiIcon('x', 13),
      title: 'Remove',
      onClick: () => { rr.remove(); rows.splice(rows.indexOf(entry), 1); },
    });
    rows.push(entry);
    listWrap.insertBefore(rr, addBtn);
  };

  const addBtn = uiButton(listWrap, {
    small: true,
    html: uiIcon('plus', 13) + ' Add creature',
    onClick: () => addRow(),
  });

  if (editing && Array.isArray(editing[f.k]) && editing[f.k].length) editing[f.k].forEach(addRow);
  else addRow();

  return {
    /* Blank or unreadable boxes fall back to a usable weight / no cap so the
       serializer never sees NaN. */
    get: () => rows
      .map((r) => ({
        c: r.combo.get(),
        w: r.wInp ? builderNumber(r.wInp.value, 1) : undefined,
        pct: r.pctInp ? builderNumber(r.pctInp.value, 0) : undefined,
      }))
      .filter((r) => r.c),
  };
}

/** Rows of resource + amount, for crafting-cost overrides. */
function builderResListField(f, fieldWrap, editing) {
  const resWrap = uiElement('div', { className: 'reslist', parent: fieldWrap });
  const rows = [];

  const addRow = (c, amt) => {
    const rr = uiElement('div', { className: 'reslist-row' });
    const combo = makeCombo('item', 'Resource…');
    if (c) combo.set(c);
    const num = document.createElement('input');
    num.type = 'number';
    num.value = amt || 10;
    num.min = 0;
    num.title = 'Amount needed';
    const entry = { combo, num };
    rr.appendChild(combo.el);
    rr.appendChild(num);
    uiButton(rr, {
      small: true,
      html: uiIcon('x', 13),
      title: 'Remove',
      onClick: () => { rr.remove(); rows.splice(rows.indexOf(entry), 1); },
    });
    rows.push(entry);
    resWrap.insertBefore(rr, addBtn);
  };

  const addBtn = uiButton(resWrap, {
    small: true,
    html: uiIcon('plus', 13) + ' Add resource',
    onClick: () => addRow(),
  });

  if (editing && Array.isArray(editing[f.k])) for (const r of editing[f.k]) addRow(r.c, r.amt);
  else addRow();

  return { get: () => rows.map((r) => ({ c: r.combo.get(), amt: builderNumber(r.num.value, 0) })).filter((r) => r.c) };
}

/** Plain number box for `int` / `float` fields. */
function builderNumberField(f, fieldWrap, editing) {
  const num = document.createElement('input');
  num.type = 'number';
  if (f.t === 'float') num.step = '0.1';
  if (f.ph) num.placeholder = f.ph;
  if (editing && editing[f.k] !== undefined && editing[f.k] !== '') num.value = editing[f.k];
  else if (!editing && f.d !== undefined) num.value = f.d;
  fieldWrap.appendChild(num);
  return {
    /* Empty stays empty (= "leave this setting alone"); anything unreadable
       becomes the field default rather than NaN. */
    get: () => {
      if (String(num.value).trim() === '') return '';
      const fallback = f.d !== undefined ? f.d : '';
      return f.t === 'int' ? builderInteger(num.value, fallback) : builderNumber(num.value, fallback);
    },
  };
}

/** Free-text box — the fallback for any field type without a richer editor. */
function builderTextField(f, fieldWrap, editing) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.autocomplete = 'off';
  if (f.ph) inp.placeholder = f.ph;
  if (editing && editing[f.k] !== undefined) inp.value = editing[f.k];
  else if (!editing && f.d !== undefined) inp.value = f.d;
  fieldWrap.appendChild(inp);
  return { get: () => inp.value.trim() };
}

/**
 * Builds the editor for one field of an entry spec.
 *
 * @param {object} f          field descriptor from BUILDERS[*].fields
 * @param {HTMLElement} fieldWrap  the `.builder-field` wrapper to fill
 * @param {HTMLElement} label      the wrapper's <label> (bool fields nest into it)
 * @param {object|null} editing    the entry being edited, or null when adding
 * @returns {{ get: () => unknown }}
 */
function builderFieldControl(f, fieldWrap, label, editing) {
  if (BUILDER_COMBO_TYPES.has(f.t)) return builderComboField(f, fieldWrap, editing);
  if (f.t === 'dinolist') return builderDinoListField(f, fieldWrap, editing);
  if (f.t === 'bool') return builderBoolField(f, label, editing);
  if (f.t === 'reslist') return builderResListField(f, fieldWrap, editing);
  if (f.t === 'int' || f.t === 'float') return builderNumberField(f, fieldWrap, editing);
  return builderTextField(f, fieldWrap, editing);
}

/* ---------------- entries builder ---------------- */

/** The list of entries already present, with per-row edit / remove actions. */
function renderExistingEntries(spec, entries) {
  const list = uiElement('div', { className: 'builder-list' });
  if (!entries.length && !builderCtx.rawLines.length) {
    list.innerHTML = `<div class="empty-msg" style="padding:14px 0">Nothing here yet — add your first ${esc(spec.entryName)} below.</div>`;
  }
  entries.forEach((v, i) => {
    const row = uiElement('div', {
      className: 'picker-row',
      html: `<div class="picker-row-main">${entrySummary(spec, v)}<br><code>${esc(serializeEntry(spec, v)).slice(0, 120)}</code></div>`,
      parent: list,
    });
    const btns = uiElement('div', { className: 'picker-row-btns', parent: row });
    uiButton(btns, {
      small: true, html: uiIcon('pencil', 14), title: 'Edit',
      onClick: () => { builderCtx.editIndex = i; renderEntriesBuilder(); },
    });
    uiButton(btns, {
      small: true, html: uiIcon('x', 14), title: 'Remove',
      onClick: () => { entries.splice(i, 1); saveEntries(); builderCtx.editIndex = -1; renderEntriesBuilder(); },
    });
  });
  const raw = builderCtx.rawLines.length;
  if (raw) {
    uiElement('p', {
      className: 'opt-help',
      text: `(${raw} line${raw === 1 ? '' : 's'} in a custom format ${raw === 1 ? 'is' : 'are'} kept unchanged.)`,
      parent: list,
    });
  }
  return list;
}

/** The add/edit form for one entry. Returns the form plus its control map. */
function renderEntryForm(spec, editing) {
  const form = uiElement('div', {
    className: 'builder-form',
    html: `<div class="opt-name" style="margin-bottom:8px">${editing ? 'Edit' : 'Add a'} ${esc(spec.entryName)}</div>`,
  });
  const controls = {};
  for (const f of spec.fields) {
    const fieldWrap = uiElement('div', { className: 'builder-field', parent: form });
    const label = uiElement('label', { text: f.n + (f.req ? ' *' : ''), parent: fieldWrap });
    controls[f.k] = builderFieldControl(f, fieldWrap, label, editing);
  }
  return { form, controls };
}

/**
 * Reads every control into an entry object.
 * @returns {object|null} null (after a toast) when a required field is blank.
 */
function builderCollectEntry(spec, controls) {
  const v = {};
  for (const f of spec.fields) {
    const val = controls[f.k].get();
    if (f.req && (val === '' || val === undefined || (Array.isArray(val) && !val.length))) {
      toast(`Please fill in “${f.n.split('(')[0].trim()}”.`);
      return null;
    }
    v[f.k] = val;
  }
  return v;
}

/** Existing list + add/edit form. Re-rendered wholesale after every change. */
function renderEntriesBuilder() {
  const { spec, entries } = builderCtx;
  const body = $('builderBody');
  body.innerHTML = '';
  body.appendChild(renderExistingEntries(spec, entries));

  const editing = builderCtx.editIndex >= 0 ? entries[builderCtx.editIndex] : null;
  const { form, controls } = renderEntryForm(spec, editing);

  const rowBtns = uiElement('div', { parent: form });
  rowBtns.style.cssText = 'display:flex;gap:8px;margin-top:10px';
  uiButton(rowBtns, {
    small: true,
    variant: 'primary',
    html: editing ? uiIcon('save', 14) + ' Save changes' : uiIcon('plus', 14) + ' Add to list',
    onClick: () => {
      const v = builderCollectEntry(spec, controls);
      if (!v) return;
      if (editing) builderCtx.entries[builderCtx.editIndex] = v;
      else builderCtx.entries.push(v);
      builderCtx.editIndex = -1;
      saveEntries();
      renderEntriesBuilder();
      toast(editing ? 'Entry updated.' : 'Added!');
    },
  });
  if (editing) {
    uiButton(rowBtns, {
      small: true,
      text: 'Cancel',
      onClick: () => { builderCtx.editIndex = -1; renderEntriesBuilder(); },
    });
  }
  body.appendChild(form);
}

/* ---------------- level ramp builder ----------------
   The maths lives in small pure functions so the generated curve can be read
   (and reasoned about) without wading through the DOM wiring below. */

/** Dino ramps are generated at this share of the player total XP. */
const RAMP_DINO_XP_SHARE = 0.9;

/**
 * Cumulative XP thresholds for a level curve. `totalXp` is reached at the top
 * level; `exponent` shapes the curve (< 2 = fast early levels, > 2 = a steep
 * grind at the top). Every step is forced at least 1 XP above the previous
 * one — ARK ignores a ramp that is not strictly increasing.
 *
 * @param {number} levels    number of levels, including level 1
 * @param {number} totalXp   XP needed for the final level
 * @param {number} exponent  curve shape
 * @returns {number[]} one threshold per level step (`levels - 1` of them)
 */
function rampCurveValues(levels, totalXp, exponent) {
  const values = [];
  let prev = 0;
  for (let i = 1; i <= levels - 1; i++) {
    let xp = Math.round(totalXp * Math.pow(i / (levels - 1), exponent));
    if (!Number.isFinite(xp) || xp <= prev) xp = prev + 1;
    values.push(xp);
    prev = xp;
  }
  return values;
}

/** One `LevelExperienceRampOverrides` line for a set of thresholds. */
function rampLine(values) {
  return '(' + values.map((xp, idx) => `ExperiencePointsForLevel[${idx}]=${xp}`).join(',') + ')';
}

/**
 * Reads the ramp form into plain numbers.
 * @returns {object|null} null when the level/XP boxes are unusable.
 */
function rampFormValues() {
  const pMax = builderInteger($('rampPMax').value, 0);
  const pXp = builderInteger($('rampPXp').value, 0);
  if (!(pMax > 1) || !(pXp > 0)) return null;
  return {
    pMax,
    pXp,
    exponent: builderNumber($('rampShape').value, 2),
    dino: $('rampDino').checked,
    dMax: builderInteger($('rampDMax').value, 88),
    setMax: $('rampSetMax').checked,
  };
}

/** Three sample levels, so the shape of the curve is visible before it is used. */
function rampPreviewText(form) {
  const sample = [1, Math.round(form.pMax / 2), form.pMax - 1].map((lv) => {
    const xp = Math.round(form.pXp * Math.pow(lv / (form.pMax - 1), form.exponent));
    return `Level ${lv + 1}: ${xp.toLocaleString()} XP total`;
  });
  return `Generated ${form.pMax - 1} player level steps${form.dino ? ' + dino levels' : ''}:\n` + sample.join('\n');
}

/** Writes the generated ramp — and, optionally, the matching XP caps. */
function applyRampCurve(form) {
  const dinoXp = Math.round(form.pXp * RAMP_DINO_XP_SHARE);
  const lines = [rampLine(rampCurveValues(form.pMax, form.pXp, form.exponent))];
  if (form.dino) lines.push(rampLine(rampCurveValues(form.dMax + 1, dinoXp, form.exponent)));
  builderCtx.textarea.value = lines.join('\n');
  builderCtx.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  if (form.setMax) {
    /* A ramp above the max-XP override is silently capped in game, so the two
       settings are kept in step unless the user opts out. */
    const optPlayer = OPTIONS.find((o) => o.k === 'OverrideMaxExperiencePointsPlayer');
    const optDino = OPTIONS.find((o) => o.k === 'OverrideMaxExperiencePointsDino');
    if (optPlayer) setValSilent(optPlayer, form.pXp + 1);
    if (optDino && form.dino) setValSilent(optDino, dinoXp + 1);
    saveState();
    refreshBadges();
  }
}

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
    const form = rampFormValues();
    if (!form) { toast('Enter a max level and total XP first.'); return; }
    applyRampCurve(form);
    const preview = $('rampPreview');
    preview.textContent = rampPreviewText(form);
    preview.style.display = '';
    toast('Level curve generated and applied!');
  });
}

/* ---------------- engram points builder ---------------- */

/** Shown when the option is still empty: official-ish 8 points per level. */
const POINTS_FALLBACK_RANGE = { from: 2, to: 105, pts: 8 };

/**
 * Compresses the existing "one number per level" lines back into editable
 * ranges. Levels start at 2, so line index 0 is level 2.
 *
 * @param {string} text raw textarea contents
 * @returns {{from: number, to: number, pts: number}[]} never empty
 */
function pointsRangesFromText(text) {
  const nums = text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => builderInteger(l.replace(/^.*=/, ''), null))
    .filter((n) => n !== null);
  const ranges = [];
  nums.forEach((pts, i) => {
    const last = ranges[ranges.length - 1];
    if (last && last.pts === pts) last.to = i + 2;
    else ranges.push({ from: i + 2, to: i + 2, pts });
  });
  return ranges.length ? ranges : [{ ...POINTS_FALLBACK_RANGE }];
}

/**
 * One points value per level, rows applied in listed order so a later row
 * deliberately overrides an overlapping earlier one (e.g. 2–60 = 8, then
 * 10–20 = 20 boosts just the middle). Levels no range covers give 0.
 *
 * @param {{from: HTMLInputElement, to: HTMLInputElement, pts: HTMLInputElement}[]} rowRefs
 * @returns {Map<number, number>} level → points
 */
function pointsByLevel(rowRefs) {
  const byLevel = new Map();
  for (const r of rowRefs) {
    const from = builderInteger(r.from.value, 0);
    const to = builderInteger(r.to.value, 0);
    const pts = builderInteger(r.pts.value, -1);
    if (from >= 2 && to >= from && pts >= 0) for (let lv = from; lv <= to; lv++) byLevel.set(lv, pts);
  }
  return byLevel;
}

/** The written form: level 2 upwards, one number per line, gaps filled with 0. */
function pointsLines(byLevel) {
  const maxLv = Math.max(...byLevel.keys());
  const lines = [];
  for (let lv = 2; lv <= maxLv; lv++) lines.push(String(byLevel.get(lv) ?? 0));
  return lines;
}

function renderPointsBuilder() {
  const body = $('builderBody');
  const ranges = pointsRangesFromText(builderCtx.textarea.value);

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

  const updTotal = () => {
    const byLevel = pointsByLevel(rowRefs);
    let total = 0;
    for (const p of byLevel.values()) total += p;
    $('epTotal').textContent = byLevel.size ? `${byLevel.size} levels · ${total.toLocaleString()} engram points in total` : '';
  };

  const addRange = (r) => {
    const row = uiElement('div', { className: 'reslist-row', html: '<label style="font-size:.85rem">Levels</label>', parent: wrap });
    const from = document.createElement('input'); from.type = 'number'; from.value = r.from; from.min = 2;
    const dash = uiElement('span', { text: '–' });
    const to = document.createElement('input'); to.type = 'number'; to.value = r.to; to.min = 2;
    const lab = uiElement('label', { text: 'get' }); lab.style.fontSize = '.85rem';
    const pts = document.createElement('input'); pts.type = 'number'; pts.value = r.pts; pts.min = 0;
    const lab2 = uiElement('label', { text: 'points each' }); lab2.style.fontSize = '.85rem';
    row.append(from, dash, to, lab, pts, lab2);
    const ref = { from, to, pts, row };
    uiButton(row, {
      small: true, html: uiIcon('x', 13), title: 'Remove range',
      onClick: () => { row.remove(); rowRefs.splice(rowRefs.indexOf(ref), 1); updTotal(); },
    });
    [from, to, pts].forEach((i) => i.addEventListener('input', updTotal));
    rowRefs.push(ref);
  };

  ranges.forEach(addRange);
  updTotal();

  $('epAdd').addEventListener('click', () => {
    const last = rowRefs[rowRefs.length - 1];
    const start = last ? builderInteger(last.to.value, 2) + 1 : 2;
    addRange({ from: start, to: start + 10, pts: 12 });
    updTotal();
  });
  $('epApply').addEventListener('click', () => {
    const byLevel = pointsByLevel(rowRefs);
    if (!byLevel.size) { toast('Add at least one level range first.'); return; }
    const lines = pointsLines(byLevel);
    builderCtx.textarea.value = lines.join('\n');
    builderCtx.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    toast(`Engram points set for ${lines.length} levels!`);
  });
}
