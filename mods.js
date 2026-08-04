/* =========================================================================
   ARK ASA Config Creator — mod selector, CurseForge browser & mod INI settings.
   Depends on helpers defined in app.js ($, esc, state, saveState, render,
   refreshBadges, toast, getVal, setVal, isChanged, makeCard, buildSidebar) and
   on MODS_DB / MOD_CATS from mods-db.js. Loaded before app.js; all cross-file
   references resolve at call time.

   Every selected mod gets its own page in the sidebar (currentCat = 'mod:<id>').
   Settings come from two layers, merged in modInfo():
     - the bundled catalog (MODS_DB[..].ini)
     - runtime-discovered settings (state.modDynIni[id]) parsed live from the
       mod's CurseForge page description
   ========================================================================= */
'use strict';

const modById = new Map();
for (const m of MODS_DB) modById.set(m.id, m);

/* Sections that must never be treated as mod sections on import — they belong
   to the core config files. */
const CORE_SECTIONS = new Set(
  [...GUS_SECTION_ORDER, GAME_SECTION, '/Script/ShooterGame.ShooterGameMode'].map((s) => s.toLowerCase())
);

/* static section index from the bundled catalog */
const modSectionIndex = new Map();
for (const m of MODS_DB) {
  for (const sec of (m.ini || [])) {
    const key = sec.section.toLowerCase();
    if (CORE_SECTIONS.has(key)) continue;
    modSectionIndex.set(key, { mod: m, sec });
  }
}

/* ---------------- selected-mods state helpers ---------------- */
function selectedMods() { return state.mods || []; }
function isModSelected(id) { return selectedMods().some((m) => m.id === id); }
function dynIni(modId) { return (state.modDynIni || {})[modId] || []; }

function modInfo(entry) {
  const db = modById.get(entry.id);
  const base = db
    ? { ...db, custom: false }
    : { id: entry.id, name: entry.name || ('Mod ' + entry.id), thumb: entry.thumb || '', cat: entry.cat || 'other',
        sum: entry.sum || '', dl: entry.dl || 0, slug: entry.slug || '', author: entry.author || '',
        ini: [], custom: true, mapName: entry.mapName || '' };
  const dyn = dynIni(entry.id);
  if (!dyn.length) return base;
  // merge: bundled catalog wins on duplicate keys
  const merged = (base.ini || []).map((s) => ({ ...s, settings: [...s.settings] }));
  for (const dsec of dyn) {
    const target = merged.find((s) => s.section.toLowerCase() === dsec.section.toLowerCase());
    if (!target) { merged.push({ ...dsec, settings: [...dsec.settings] }); continue; }
    for (const s of dsec.settings) {
      if (!target.settings.some((x) => x.k.toLowerCase() === s.k.toLowerCase())) target.settings.push(s);
    }
  }
  return { ...base, ini: merged };
}
function modOptKey(modId, sec, s) { return `mod:${modId}:${sec.section}:${s.k}`; }

function addMod(entry) {
  if (isModSelected(entry.id)) { toast('That mod is already selected.'); return false; }
  state.mods = selectedMods().concat([entry]);
  saveState(); buildSidebar(); refreshBadges();
  const info = modInfo(entry);
  const nIni = iniCount(info);
  toast(nIni
    ? `${info.name} added — its settings page is in the sidebar (${nIni} settings).`
    : `${info.name} added — it has its own page in the sidebar.`);
  return true;
}
function removeMod(id) {
  const info = modInfo(selectedMods().find((m) => m.id === id) || { id });
  const hasValues = Object.keys(state.opts).some((k) => k.startsWith(`mod:${id}:`)) || (state.modExtra && state.modExtra[id] && state.modExtra[id].text);
  if (hasValues && !confirm(`Remove "${info.name}"? Its mod settings in this tool will be removed too.`)) return;
  state.mods = selectedMods().filter((m) => m.id !== id);
  for (const k of Object.keys(state.opts)) if (k.startsWith(`mod:${id}:`)) delete state.opts[k];
  if (state.modExtra) delete state.modExtra[id];
  if (state.modDynIni) delete state.modDynIni[id];
  if (state.modDocs) delete state.modDocs[id];
  if (state.modContent) delete state.modContent[id];
  if (currentCat === 'mod:' + id) currentCat = 'mods';
  saveState(); buildSidebar(); render(); refreshBadges();
}
function moveMod(id, dir) {
  const arr = selectedMods().slice();
  const i = arr.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  state.mods = arr;
  saveState(); buildSidebar(); render();
}
function selectedModIds() { return selectedMods().map((m) => m.id); }

/* badge counts */
function countModChanged(id) {
  let n = 0;
  for (const k of Object.keys(state.opts)) if (k.startsWith(`mod:${id}:`)) n++;
  const ex = (state.modExtra || {})[id];
  if (ex && (ex.text || '').trim()) n++;
  return n;
}
function countModsChanged() {
  let n = selectedMods().length;
  for (const m of selectedMods()) n += countModChanged(m.id);
  return n;
}

/* ---------------- mod option objects (feed into makeCard) ---------------- */
function modOption(mod, sec, s) {
  const t = s.t || 'str';
  let d = s.d;
  if (d === null || d === undefined) d = (t === 'bool') ? false : '';
  return {
    k: modOptKey(mod.id, sec, s),
    dk: s.k,                       // display key
    f: sec.file, s: sec.section,
    t, d,
    c: 'mod:' + mod.id,
    n: s.n || s.k,
    h: s.h || '',
    dNull: s.d === null || s.d === undefined,
    modId: mod.id,
  };
}

/* ---------------- INI generation for mods ---------------- */
function buildModIniLines(file, includeDefaults) {
  const lines = [];
  for (const entry of selectedMods()) {
    const mod = modInfo(entry);
    const secs = (mod.ini || []).filter((s) => s.file === file);
    const extra = (state.modExtra || {})[mod.id];
    const extraText = extra && extra.file === file ? String(extra.text || '').trim() : '';

    // group the user's extra lines by [section] header so they can be merged
    // into the matching settings section instead of repeating the header
    const extraGroups = [];
    if (extraText) {
      let cur = { header: null, lines: [] };
      extraGroups.push(cur);
      for (const raw of extraText.split(/\r?\n/)) {
        const l = raw.trim();
        const m = l.match(/^\[(.+)\]$/);
        if (m) { cur = { header: m[1].trim(), lines: [] }; extraGroups.push(cur); }
        else if (l) cur.lines.push(l);
      }
    }
    const consumed = new Set();
    const modLines = [];
    for (const sec of secs) {
      const secLines = [];
      for (const s of sec.settings) {
        const o = modOption(mod, sec, s);
        const has = Object.prototype.hasOwnProperty.call(state.opts, o.k);
        if (!has && !(includeDefaults && !o.dNull)) continue;
        const v = has ? state.opts[o.k] : o.d;
        secLines.push(`${s.k}=${iniValue(o, v)}`);
      }
      const gi = extraGroups.findIndex((g, i) => !consumed.has(i) && g.header && g.header.toLowerCase() === sec.section.toLowerCase());
      if (gi >= 0) { consumed.add(gi); secLines.push(...extraGroups[gi].lines); }
      if (secLines.length) modLines.push(`[${sec.section}]`, ...secLines, '');
    }
    for (let i = 0; i < extraGroups.length; i++) {
      if (consumed.has(i) || !extraGroups[i].lines.length) continue;
      if (extraGroups[i].header) modLines.push(`[${extraGroups[i].header}]`);
      modLines.push(...extraGroups[i].lines, '');
    }
    if (modLines.length) lines.push(`; --- Mod: ${mod.name} (${mod.id}) ---`, ...modLines);
  }
  return lines;
}

/* ---------------- import support ---------------- */
function lookupModSection(sectionName) {
  const low = String(sectionName || '').toLowerCase();
  if (!low || CORE_SECTIONS.has(low)) return null;
  const hit = modSectionIndex.get(low);
  if (hit) return { mod: hit.mod, sec: hit.sec };
  // runtime-discovered sections of already-selected mods
  for (const entry of selectedMods()) {
    for (const sec of dynIni(entry.id)) {
      if (sec.section.toLowerCase() === low) return { mod: modInfo(entry), sec };
    }
  }
  return null;
}

/* mods auto-selected during the current import — used to trigger the online
   settings search afterwards */
const importTouchedMods = new Set();

/* Called by importText for every [section] line: returns a key handler if the
   section belongs to a known mod, else null. */
function modImportHandler(sectionName) {
  const hit = lookupModSection(sectionName);
  if (!hit) return null;
  const { mod, sec } = hit;
  if (!isModSelected(mod.id)) {
    state.mods = selectedMods().concat([{ id: mod.id }]);
    buildSidebar();
  }
  importTouchedMods.add(mod.id);
  return (key, value) => {
    const info = modInfo({ id: mod.id });
    const allSecs = (info.ini || []).filter((x) => x.section.toLowerCase() === sec.section.toLowerCase());
    let s = null;
    for (const x of allSecs) { s = x.settings.find((y) => y.k.toLowerCase() === key.toLowerCase()); if (s) break; }
    if (s) {
      const o = modOption(info, allSecs[0], s);
      let v = value;
      if (o.t === 'bool') v = /^(true|1)$/i.test(value);
      state.opts[o.k] = v;
    } else {
      if (!state.modExtra) state.modExtra = {};
      const ex = state.modExtra[mod.id] || (state.modExtra[mod.id] = { file: sec.file, text: '' });
      const lines = ex.text ? ex.text.split('\n') : [];
      const header = `[${sec.section}]`;
      if (!lines.length) lines.push(header);
      const kv = `${key}=${value}`;
      if (!lines.includes(kv)) lines.push(kv);
      ex.text = lines.join('\n');
    }
    return true;
  };
}

/* After an import: search the mod pages online for settings we don't know yet. */
function afterImportModDiscovery() {
  const ids = [...importTouchedMods];
  importTouchedMods.clear();
  for (const id of ids) {
    discoverModSettings(id, { silent: true }).then((n) => {
      if (n > 0) {
        const info = modInfo({ id });
        toast(`Found ${n} more setting${n === 1 ? '' : 's'} for ${info.name} on its mod page.`);
      }
    });
  }
}

/* ---------------- description INI block -> typed settings ---------------- */
function friendlyKeyName(key) {
  let k = key.replace(/^b(?=[A-Z])/, '').replace(/_/g, ' ');
  k = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return k.trim();
}

/* Type/default/description inference for one documented setting.
   This is the single implementation: the INI-block parser and the
   spreadsheet/table parser both feed into it, so "1.5", "True" or a
   "true/false" comment is typed identically whichever document it came from.

   @param {string} key   the setting name as written in the doc
   @param {string} val   the value as written (may be empty — docs often omit it)
   @param {string} desc  the annotation next to it (may be empty)
   @returns {{k:string,t:'bool'|'int'|'float'|'str',d:*,n:string,h:string}}
 */
function inferSetting(key, val, desc) {
  let t = 'str';
  let d = null;
  val = String(val || '').trim();
  desc = String(desc || '').trim();
  if (val === '') {
    // no value documented: guess the type from the wording of the comment
    const low = desc.toLowerCase();
    if (low.includes('true') && low.includes('false')) t = 'bool';
    else if (/\b(number|amount|seconds|radius|limit|id|%|range)\b/.test(low)) t = 'int';
  } else if (/^(true|false)$/i.test(val)) { t = 'bool'; d = /^true$/i.test(val); }
  else if (/^-?\d+$/.test(val)) { t = 'int'; d = parseInt(val, 10); }
  else if (/^-?\d*\.\d+$/.test(val)) { t = 'float'; d = parseFloat(val); }
  else { t = 'str'; d = val; }
  if (desc) {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);
    if (!/[.!?)]$/.test(desc)) desc += '.';
  }
  return { k: key, t, d, n: friendlyKeyName(key), h: desc };
}

/* Mod docs annotate a value either as "value (comment)" or "value - comment". */
function splitValueAndDescription(rest) {
  const paren = rest.match(/^([^(]*?)\s*\((.*)\)\s*$/);
  if (paren) return { val: paren[1].trim(), desc: paren[2].trim() };
  const dash = rest.indexOf(' - ');
  if (dash >= 0) return { val: rest.slice(0, dash).trim(), desc: rest.slice(dash + 3).trim() };
  return { val: rest, desc: '' };
}

/* Parses an INI-ish text block (with "( comment )" / " - comment" annotations)
   into [{file, section, settings:[{k,t,d,n,h}]}]. */
function parseIniAnnotated(text, file) {
  const sections = [];
  let cur = null;
  const seen = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const msec = line.match(/^\[(.+)\]$/);
    if (msec) {
      const name = msec[1];
      const low = name.trim().toLowerCase();
      if (seen.has(low)) { cur = null; continue; }   // duplicate example blocks
      seen.add(low);
      cur = { file, section: name.trim(), settings: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z][\w\[\]]*$/.test(key)) continue;
    const { val, desc } = splitValueAndDescription(line.slice(eq + 1).trim());
    cur.settings.push(inferSetting(key, val, desc));
  }
  return sections.filter((s) => s.settings.length);
}

/* ---------------- modded content detection ----------------
   Mod pages and their docs mention the mod's own creatures, items and engrams
   by class name. Scanning every fetched text for those tokens lets the
   dino/item/engram dropdowns offer modded content too. */
const MOD_CONTENT_PATTERNS = {
  dinos: /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*_Character_BP[A-Za-z0-9_]*_C\b/g,
  items: /\bPrimalItem[A-Za-z0-9_]*_C\b/g,
  engrams: /\bEngramEntry_[A-Za-z0-9_]*_C\b/g,
};

/* "PrimalItemResource_SnailPaste_C" -> "Snail Paste" */
function classDisplayName(cls) {
  let n = cls
    .replace(/_C$/, '')
    .replace(/^PrimalItem(Resource|Consumable|Armor|Weapon|Structure|Ammo|Skin|Costume)?_?/, '')
    .replace(/^EngramEntry_/, '')
    .replace(/_Character_BP.*$/, '')
    .replace(/_/g, ' ');
  n = n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return n || cls;
}

function baseDbHas(kind, cls) {
  const db = kind === 'dinos' ? DINOS_DB : kind === 'items' ? ITEMS_DB : kind === 'spawns' ? SPAWNS_DB : ENGRAMS_DB;
  const low = cls.toLowerCase();
  return db.some((e) => e.c.toLowerCase() === low);
}

/* Scans text for class-name tokens and stores unknown ones as this mod's
   content. Returns how many new entries were found. */
function scanModContent(modId, text) {
  if (!text) return 0;
  if (!state.modContent) state.modContent = {};
  const store = state.modContent[modId] || (state.modContent[modId] = { dinos: [], items: [], engrams: [], spawns: [] });
  let added = 0;
  for (const [kind, pattern] of Object.entries(MOD_CONTENT_PATTERNS)) {
    if (!store[kind]) store[kind] = [];
    const known = new Set(store[kind].map((e) => e.c.toLowerCase()));
    for (const match of String(text).matchAll(pattern)) {
      const cls = match[0];
      const low = cls.toLowerCase();
      if (known.has(low) || baseDbHas(kind, cls)) continue;
      known.add(low);
      store[kind].push({ n: classDisplayName(cls), c: cls });
      added++;
    }
  }
  if (added) saveState();
  return added;
}

/* All modded entries of one kind across the selected mods, tagged with the
   mod's name so dropdowns can show where they come from. */
function modContentEntries(kind) {
  const out = [];
  for (const entry of selectedMods()) {
    const store = (state.modContent || {})[entry.id];
    if (!store || !store[kind] || !store[kind].length) continue;
    const name = modInfo(entry).name;
    for (const e of store[kind]) out.push({ ...e, mod: name });
  }
  return out;
}

/* class -> display name lookup across mod content (base DBs handled elsewhere) */
function modContentName(cls) {
  const low = String(cls).toLowerCase();
  for (const store of Object.values(state.modContent || {})) {
    for (const kind of ['dinos', 'items', 'engrams', 'spawns']) {
      const hit = (store[kind] || []).find((e) => e.c.toLowerCase() === low);
      if (hit) return hit.n;
    }
  }
  return null;
}

/* ---------------- settings docs: link extraction & doc parsing ---------------- */
function extractDocLinks(html) {
  const links = [];
  const seen = new Set();
  const push = (url, label) => {
    url = String(url || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    // dedupe Google docs/sheets by their document ID (URL variants abound)
    const docId = (url.match(/\/(?:spreadsheets|document)\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
    const key = docId || url.replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    let kind = 'link';
    if (/docs\.google\.com\/spreadsheets/i.test(url)) kind = 'gsheet';
    else if (/docs\.google\.com\/document/i.test(url)) kind = 'gdoc';
    else if (/pastebin\.com/i.test(url)) kind = 'paste';
    else if (/(fandom\.com|wiki\.gg|miraheze\.org|gamepedia\.com)\/wiki\//i.test(url) || /\/wiki\/[^\/]+$/i.test(url)) kind = 'mediawiki';
    else if (/gitbook|wiki|notion\.site/i.test(url)) kind = 'wiki';
    else return; // only keep documentation-ish links
    links.push({ url, kind, label: label || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) });
  };
  try {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    for (const a of doc.querySelectorAll('a[href]')) push(a.href, (a.textContent || '').trim().slice(0, 60));
    const text = doc.body ? doc.body.textContent : '';
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>()]+/g)) push(m[0], '');
  } catch (e) { /* malformed html */ }
  return links;
}

/* split one CSV/TSV line into cells (handles quoted CSV cells) */
function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/* Parse spreadsheet-ish text (pasted from Google Sheets = TSV, or fetched CSV)
   into settings sections. Rows can be "[Section]", "Key=Value | desc", or
   "Key | Value | desc" columns. */
function parseSheetText(text, file, fallbackSection) {
  const sections = [];
  let cur = null;
  const ensure = (name) => {
    let s = sections.find((x) => x.section.toLowerCase() === name.toLowerCase());
    if (!s) { s = { file, section: name, settings: [] }; sections.push(s); }
    return s;
  };
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = splitRow(raw).filter((c) => c !== '');
    if (!cells.length) continue;
    const secCell = cells.find((c) => /^\[[A-Za-z0-9_. \/]+\]$/.test(c));
    if (secCell) { cur = ensure(secCell.slice(1, -1).trim()); continue; }
    // "Key=Value" style inside any cell
    const kvCell = cells.find((c) => /^[A-Za-z][\w\[\]]*\s*=/.test(c));
    if (kvCell) {
      const eq = kvCell.indexOf('=');
      const key = kvCell.slice(0, eq).trim();
      let val = kvCell.slice(eq + 1).trim();
      let desc = cells.filter((c) => c !== kvCell).join(' — ');
      // a "( comment )" after the value is a description, not part of the value
      const mPar = val.match(/^([^(]*?)\s*\((.*)\)\s*$/);
      if (mPar) { desc = desc ? mPar[2] + ' — ' + desc : mPar[2]; val = mPar[1].trim(); }
      if (!cur) cur = ensure(fallbackSection);
      if (!cur.settings.some((s) => s.k.toLowerCase() === key.toLowerCase())) cur.settings.push(inferSetting(key, val, desc));
      continue;
    }
    // "Key | Value | Description" columns
    if (cells.length >= 2 && /^[A-Za-z][A-Za-z0-9_]{2,60}$/.test(cells[0]) && !/^(name|setting|option|key|config)$/i.test(cells[0])) {
      const val = cells[1];
      if (/^(true|false|-?\d+(\.\d+)?)$/i.test(val) || cells.length >= 3) {
        if (!cur) cur = ensure(fallbackSection);
        if (!cur.settings.some((s) => s.k.toLowerCase() === cells[0].toLowerCase())) {
          cur.settings.push(inferSetting(cells[0], /^(true|false|-?\d+(\.\d+)?)$/i.test(val) ? val : '', cells.slice(/^(true|false|-?\d+(\.\d+)?)$/i.test(val) ? 2 : 1).join(' — ')));
        }
      }
    }
  }
  return sections.filter((s) => s.settings.length);
}

/* Convert MediaWiki wikitext into plain lines the settings parsers understand:
   wikitable rows become tab-separated lines, markup is stripped. */
function wikitextToLines(wt) {
  let t = String(wt);
  // strip templates ({{...}}), repeatedly for shallow nesting
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{[^{}]*\}\}/g, ' ');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
       .replace(/<\/?(code|pre|nowiki|tt|b|i|small|span|div)[^>]*>/gi, '')
       .replace(/'''?/g, '')
       .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');   // [[link|text]] -> text
  const out = [];
  let row = null;
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('{|') || line.startsWith('|}')) { if (row && row.length) out.push(row.join('\t')); row = null; continue; }
    if (line.startsWith('|-')) { if (row && row.length) out.push(row.join('\t')); row = []; continue; }
    if (line.startsWith('!') ) continue;                     // header cells
    if (line.startsWith('|')) {
      if (!row) row = [];
      for (const cell of line.slice(1).split('||')) row.push(cell.trim());
      continue;
    }
    if (row && row.length) { out.push(row.join('\t')); row = null; }
    out.push(line);
  }
  if (row && row.length) out.push(row.join('\t'));
  return out.join('\n');
}

const DOC_TEXT_LIMIT = 500000;
const DOC_SETTINGS_CAP = 200;   // a huge wiki page must not flood a mod with junk settings

/* Why a settings doc produced nothing. The old code collapsed every one of
   these into a single empty sentinel, so a dead network, a 404, a Google Doc
   that needs a login and a page full of prose all told the user the exact same
   thing ("could not find any settings"). */
const DOC_STATUS = {
  OK: 'ok',                     // settings were parsed out of it
  UNSUPPORTED: 'unsupported',   // a link kind we cannot read from the browser at all
  UNREACHABLE: 'unreachable',   // network/HTTP/permission failure — we never saw the text
  UNREADABLE: 'unreadable',     // we got a response but it was not the format we expect
  TOO_LARGE: 'too-large',       // guard against pulling a whole wiki into memory
  NOTHING: 'nothing',           // read fine, but nothing in it looks like a setting
};

/** A parsed doc that yielded no settings, tagged with the reason why. */
function docFailure(status) { return { status, sections: [], text: '' }; }

/* Thrown by fetchDocText so the caller can tell *why* a doc could not be read
   instead of guessing from an empty string. */
class DocFetchError extends Error {
  constructor(status, message) {
    super(message || status);
    this.name = 'DocFetchError';
    this.status = status;
  }
}

/** Fetches a URL as text, mapping network and HTTP failures onto DOC_STATUS. */
async function fetchDocResponseText(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new DocFetchError(DOC_STATUS.UNREACHABLE, e.message || 'network error');
  }
  if (!response.ok) throw new DocFetchError(DOC_STATUS.UNREACHABLE, 'HTTP ' + response.status);
  return response.text();
}

/* Fetches the raw text behind a settings-doc link.
   Throws DocFetchError when the link cannot be read. */
async function fetchDocText(link) {
  if (link.kind === 'gsheet') {
    const id = (link.url.match(/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
    if (!id) throw new DocFetchError(DOC_STATUS.UNSUPPORTED, 'no spreadsheet id in the link');
    return fetchDocResponseText(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`);
  }
  if (link.kind === 'gdoc') {
    const id = (link.url.match(/document\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
    if (!id) throw new DocFetchError(DOC_STATUS.UNSUPPORTED, 'no document id in the link');
    return fetchDocResponseText(`https://docs.google.com/document/d/${id}/export?format=txt`);
  }
  if (link.kind === 'paste') {
    const id = (link.url.match(/pastebin\.com\/(?:raw\/)?(\w+)/) || [])[1];
    if (!id) throw new DocFetchError(DOC_STATUS.UNSUPPORTED, 'no paste id in the link');
    return fetchDocResponseText(`https://pastebin.com/raw/${id}`);
  }
  if (link.kind === 'mediawiki') {
    // the MediaWiki API supports cross-origin reads with origin=* (Fandom, wiki.gg, …)
    const m = link.url.match(/^(https?:\/\/[^\/]+)(?:\/[^\/]+)*?\/wiki\/([^?#]+)/i);
    if (!m) throw new DocFetchError(DOC_STATUS.UNSUPPORTED, 'not a /wiki/ article URL');
    const raw = await fetchDocResponseText(
      `${m[1]}/api.php?action=parse&page=${encodeURIComponent(decodeURIComponent(m[2]))}&format=json&prop=wikitext&origin=*`
    );
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { throw new DocFetchError(DOC_STATUS.UNREADABLE, 'the wiki API did not return JSON'); }
    const wikitext = parsed && parsed.parse && parsed.parse.wikitext && parsed.parse.wikitext['*'];
    if (!wikitext) throw new DocFetchError(DOC_STATUS.UNREADABLE, 'the wiki API returned no article text');
    return wikitextToLines(wikitext);
  }
  // generic pages: CORS almost always blocks — handled via the paste-it-yourself fallback
  throw new DocFetchError(DOC_STATUS.UNSUPPORTED, 'not a source we can read from here');
}

/**
 * Reads a settings-doc link and parses it.
 *
 * @returns {{ status: string, sections: Array, text: string }} `status` is a
 *   DOC_STATUS value so the caller can tell the user whether the doc could not
 *   be reached, is not a supported source, or simply had nothing in it.
 */
async function tryFetchDocSettings(link, file, fallbackSection) {
  let text;
  try {
    text = await fetchDocText(link);
  } catch (e) {
    return docFailure(e instanceof DocFetchError ? e.status : DOC_STATUS.UNREADABLE);
  }
  if (!text) return docFailure(DOC_STATUS.NOTHING);
  if (text.length > DOC_TEXT_LIMIT) return docFailure(DOC_STATUS.TOO_LARGE);

  // run both parsers and combine — docs often mix INI blocks with tables
  const sections = parseIniAnnotated(text, file);
  for (const ss of parseSheetText(text, file, fallbackSection)) {
    const target = sections.find((s) => s.section.toLowerCase() === ss.section.toLowerCase());
    if (!target) { sections.push(ss); continue; }
    for (const st of ss.settings) {
      if (!target.settings.some((x) => x.k.toLowerCase() === st.k.toLowerCase())) target.settings.push(st);
    }
  }
  let total = 0;
  const capped = [];
  for (const s of sections) {
    if (total >= DOC_SETTINGS_CAP) break;
    const take = s.settings.slice(0, DOC_SETTINGS_CAP - total);
    total += take.length;
    capped.push({ ...s, settings: take });
  }
  // the raw text is still useful even with no settings — it names the mod's
  // own creatures and items, which the content scanner picks up
  return { status: capped.length ? DOC_STATUS.OK : DOC_STATUS.NOTHING, sections: capped, text };
}

/** One short, human sentence explaining a non-OK DOC_STATUS. */
function docStatusMessage(status, label) {
  const what = label ? `“${label}”` : 'that doc';
  switch (status) {
    case DOC_STATUS.UNREACHABLE: return `Could not reach ${what} — it may be offline, private, or need a login.`;
    case DOC_STATUS.UNSUPPORTED: return `${what} is not a source this tool can read — open it and paste the settings in below.`;
    case DOC_STATUS.UNREADABLE: return `${what} answered, but not in a format this tool understands.`;
    case DOC_STATUS.TOO_LARGE: return `${what} is too big to read here — open it and paste just the settings table in below.`;
    default: return `${what} had nothing this tool recognises as settings.`;
  }
}

/* merge parsed sections into a mod's runtime settings, skipping known keys.
   Returns how many new settings were added. */
function mergeDynSections(modId, parsed) {
  const entry = selectedMods().find((m) => m.id === modId);
  if (!entry || !parsed || !parsed.length) return 0;
  const info = modInfo(entry);
  const known = new Set();
  for (const sec of (info.ini || [])) for (const s of sec.settings) known.add((sec.section + '/' + s.k).toLowerCase());
  let added = 0;
  const cleaned = [];
  for (const sec of parsed) {
    const fresh = sec.settings.filter((s) => !known.has((sec.section + '/' + s.k).toLowerCase()));
    if (fresh.length) { cleaned.push({ ...sec, settings: fresh }); added += fresh.length; }
  }
  if (!added) return 0;
  if (!state.modDynIni) state.modDynIni = {};
  const existing = state.modDynIni[modId] || [];
  for (const sec of cleaned) {
    const tgt = existing.find((s) => s.section.toLowerCase() === sec.section.toLowerCase());
    if (tgt) tgt.settings.push(...sec.settings);
    else existing.push(sec);
  }
  state.modDynIni[modId] = existing;
  migrateExtraLinesToSettings(modId);
  saveState(); refreshBadges();
  return added;
}

/* the section to assume when a doc doesn't name one */
function fallbackSectionFor(mod) {
  const info = typeof mod === 'object' ? mod : modInfo({ id: mod });
  if (info.ini && info.ini.length) return info.ini[0].section;
  return info.name.replace(/[^A-Za-z0-9]/g, '') || ('Mod' + info.id);
}

/* ---------------- online settings discovery ---------------- */

/** Why a CurseForge lookup failed. Callers branch on `code`, never on prose. */
const CF_ERROR = {
  QUEUED: 'queued',            // cfwidget is still building this project's data (HTTP 202)
  UNREACHABLE: 'unreachable',  // no response at all — offline, DNS, blocked
  HTTP: 'http',                // the service answered with an error status
  MALFORMED: 'malformed',      // answered, but not with the JSON we expect
};

/* The failure reason used to be smuggled inside the *display* message, so
   rewording a toast would silently change control flow. It travels as a code
   now; `message` is free to be human-readable. */
class CurseForgeError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'CurseForgeError';
    this.code = code;
  }
}

const CF_LOOKUP_ATTEMPTS = 3;

async function fetchCfwidget(idOrPath) {
  const url = 'https://api.cfwidget.com/' + idOrPath;
  let queued = false;
  for (let attempt = 0; attempt < CF_LOOKUP_ATTEMPTS; attempt++) {
    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      throw new CurseForgeError(CF_ERROR.UNREACHABLE, e.message || 'network error');
    }
    if (r.status === 202) {
      // 202 = "come back in a moment", not a failure: retry a couple of times
      queued = true;
      if (attempt < CF_LOOKUP_ATTEMPTS - 1) await new Promise((res) => setTimeout(res, APP_TIMEOUTS.CURSEFORGE_RETRY_MS));
      continue;
    }
    queued = false;
    if (!r.ok) throw new CurseForgeError(CF_ERROR.HTTP, 'HTTP ' + r.status);
    try {
      return await r.json();
    } catch (e) {
      throw new CurseForgeError(CF_ERROR.MALFORMED, 'CurseForge sent something that is not JSON');
    }
  }
  throw new CurseForgeError(queued ? CF_ERROR.QUEUED : CF_ERROR.UNREACHABLE, 'no usable answer from CurseForge');
}

/** True when `error` is a CurseForge failure of the given code. */
function isCfError(error, code) {
  return Boolean(error) && error.code === code;
}

/** The sentence to show the user for a failed CurseForge lookup. */
function cfErrorMessage(error) {
  if (isCfError(error, CF_ERROR.QUEUED)) return 'CurseForge is still preparing this mod’s info — try again in a minute.';
  if (isCfError(error, CF_ERROR.HTTP)) return 'CurseForge could not give us this mod (' + error.message + ') — check the ID or URL.';
  if (isCfError(error, CF_ERROR.MALFORMED)) return 'CurseForge answered with something this tool could not read — try again shortly.';
  return 'Could not reach CurseForge right now (offline?).';
}

/* Looks at the mod's CurseForge page (and any settings docs it links, like
   Google Sheets) and merges any settings we don't know yet.
   Returns the number of new settings found (or -1 on failure). */
async function discoverModSettings(modId, opts = {}) {
  const entry = selectedMods().find((m) => m.id === modId);
  if (!entry) return -1;
  if (!opts.silent) toast('Reading the mod page on CurseForge…');
  let j = opts.data || null;
  if (!j) {
    try { j = await fetchCfwidget(modId); } catch (e) {
      if (!opts.silent) toast(cfErrorMessage(e));
      return -1;
    }
  }
  const desc = (j && j.description) || '';
  const fbSection = fallbackSectionFor(modInfo(entry));
  let added = 0;

  // 1) INI blocks written directly on the mod page
  const block = extractIniFromDescription(desc);
  if (block) {
    const parsed = parseIniAnnotated(block.text, block.file);
    if (parsed.length) added += mergeDynSections(modId, parsed);
  }
  // the description also names the mod's own creatures/items/engrams
  const newContent = scanModContent(modId, desc);

  // 2) settings docs linked from the page (Google Sheets/Docs, pastebin, wikis)
  const links = extractDocLinks(desc);
  const docFailures = [];
  if (links.length) {
    if (!state.modDocs) state.modDocs = {};
    state.modDocs[modId] = links;
    saveState();
    if (!opts.silent && links.some((l) => l.kind !== 'link')) toast('Found settings docs linked on the mod page — reading them…');
    for (const link of links) {
      const doc = await tryFetchDocSettings(link, block ? block.file : 'gus', fbSection);
      scanModContent(modId, doc.text);
      if (doc.sections.length) {
        const n = mergeDynSections(modId, doc.sections);
        if (n) { added += n; link.autoRead = true; saveState(); }
      } else {
        docFailures.push({ status: doc.status, label: link.label || link.url });
      }
    }
  }
  if (!opts.silent && newContent > 0) {
    toast(`Found ${newContent} modded creature/item/engram name${newContent === 1 ? '' : 's'} — they now appear in the pickers.`);
  }

  if (currentCat === 'mod:' + modId || currentCat === 'mods') render();
  if (!opts.silent) reportDiscoveryOutcome({ added, links, docFailures, hasBlock: Boolean(block) });
  return added;
}

/* The end-of-discovery toast. Kept apart from the pipeline above because the
   wording is the only part of it that users ever see, and it must say *which*
   of the several possible nothing-happened cases actually occurred. */
function reportDiscoveryOutcome({ added, links, docFailures, hasBlock }) {
  if (added > 0) { toast(`Found ${added} setting${added === 1 ? '' : 's'} for this mod online!`); return; }
  if (docFailures.length) {
    // report the most actionable failure: an unreachable doc is a different
    // problem from a doc we simply cannot parse
    const order = [DOC_STATUS.UNREACHABLE, DOC_STATUS.TOO_LARGE, DOC_STATUS.UNREADABLE, DOC_STATUS.UNSUPPORTED, DOC_STATUS.NOTHING];
    const worst = docFailures.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
    toast(docStatusMessage(worst.status, worst.label));
    return;
  }
  if (links.length) { toast('This mod documents its settings in a linked doc — open it below and paste the settings in.'); return; }
  if (hasBlock) { toast('All of this mod’s documented settings are already here.'); return; }
  toast('No INI settings documented on this mod’s page.');
}

/* If Extra INI lines contain Key=Value pairs that are now real settings,
   move the values into the settings and strip them from the text. */
function migrateExtraLinesToSettings(modId) {
  const ex = (state.modExtra || {})[modId];
  if (!ex || !(ex.text || '').trim()) return;
  const info = modInfo({ id: modId });
  const keep = [];
  let curSec = null;
  for (const raw of ex.text.split('\n')) {
    const line = raw.trim();
    const msec = line.match(/^\[(.+)\]$/);
    if (msec) { curSec = msec[1].trim().toLowerCase(); keep.push(raw); continue; }
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim().toLowerCase();
      const value = line.slice(eq + 1).trim();
      let matched = false;
      for (const sec of (info.ini || [])) {
        if (curSec && sec.section.toLowerCase() !== curSec) continue;
        const s = sec.settings.find((x) => x.k.toLowerCase() === key);
        if (s) {
          const o = modOption(info, sec, s);
          state.opts[o.k] = o.t === 'bool' ? /^(true|1)$/i.test(value) : value;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }
    keep.push(raw);
  }
  // drop headers that now have nothing under them
  const cleaned = keep.filter((l, i) => {
    if (!/^\[.+\]$/.test(l.trim())) return true;
    const next = keep.slice(i + 1).find((x) => x.trim() !== '');
    return next && !/^\[.+\]$/.test(next.trim());
  });
  const text = cleaned.join('\n').trim();
  if (text) state.modExtra[modId] = { ...ex, text };
  else delete state.modExtra[modId];
}

/* ---------------- category icons, thumbnails, links ---------------- */

/* MOD_CATS[*].icon in mods-db.js holds an *emoji*, but uiIcon() only resolves
   names from ICON_PATHS and silently falls back to the generic info circle —
   so every mod category used to render the same icon. mods-db.js is shared and
   must not change, so the catalog's category ids are mapped to real icon names
   here instead. app.js maps the same ids for the sidebar. */
const MOD_CAT_ICON_NAMES = {
  qol: 'sparkles',
  structures: 'blocks',
  dinos: 'dino',
  maps: 'map',
  stacking: 'pack',
  utility: 'gear',
  overhaul: 'gamepad',
  admin: 'shield',
  cosmetics: 'palette',
  other: 'puzzle',
};
const MOD_CAT_ICON_FALLBACK = 'puzzle';

/**
 * The ICON_PATHS name to draw for a mod category id.
 * @param {string} cat a MOD_CATS key (unknown/missing ids fall back to 'puzzle')
 */
function modCatIconName(cat) {
  return MOD_CAT_ICON_NAMES[cat] || MOD_CAT_ICON_FALLBACK;
}

/** `{ name, iconName }` for a mod's category, with the catalog's own fallback. */
function modCatInfo(cat) {
  const entry = MOD_CATS[cat] || MOD_CATS.other;
  return { name: entry.name, iconName: modCatIconName(MOD_CATS[cat] ? cat : 'other') };
}

/**
 * The mod's square thumbnail, or the category icon when it has none.
 * The inline `onerror` swaps a broken image for the same category icon; it is
 * a string because the markup is built by concatenation before it is parsed.
 */
function modThumbMarkup(mod, size = 26) {
  const iconName = modCatInfo(mod.cat).iconName;
  if (!mod.thumb) return `<div class="mod-thumb mod-thumb-fallback">${uiIcon(iconName, size)}</div>`;
  return `<img class="mod-thumb" src="${esc(mod.thumb)}" alt="" loading="lazy" data-fallback-ic="${esc(iconName)}"`
    + ` data-fallback-size="${size}"`
    + ` onerror="this.outerHTML='&lt;div class=&quot;mod-thumb mod-thumb-fallback&quot;&gt;'+uiIcon(this.dataset.fallbackIc,parseInt(this.dataset.fallbackSize,10))+'&lt;/div&gt;'">`;
}

/** Public CurseForge page for a mod (by slug when we know it, else by id). */
function modCurseforgeUrl(mod) {
  return mod.slug
    ? `https://www.curseforge.com/ark-survival-ascended/mods/${mod.slug}`
    : `https://www.curseforge.com/projects/${mod.id}`;
}

/* ---------------- shared card builders ---------------- */
function makeModHeaderCard(mod, idx, total, opts = {}) {
  const head = document.createElement('div');
  head.className = 'opt-card wide selected-mod-row';
  const catInfo = modCatInfo(mod.cat);
  const thumbHtml = modThumbMarkup(mod);
  const nIni = iniCount(mod);
  const cfUrl = modCurseforgeUrl(mod);
  head.innerHTML = `
    ${thumbHtml}
    <div style="flex:1;min-width:0">
      <div class="opt-name">${esc(mod.name)} <span class="mod-badge">${uiIcon(catInfo.iconName, 12)} ${esc(catInfo.name)}</span>
        ${nIni ? `<span class="mod-badge has-ini">${uiIcon('gear', 12)} ${nIni} settings</span>` : ''}
        ${mod.mapName ? `<span class="mod-badge">${uiIcon('map', 12)} map: ${esc(mod.mapName)}</span>` : ''}</div>
      <code class="opt-key">ID ${esc(mod.id)}${mod.author ? ' · by ' + esc(mod.author) : ''} · <a href="${esc(cfUrl)}" target="_blank" rel="noopener" style="color:var(--accent)">View on CurseForge ↗</a></code>
      ${mod.sum ? `<p class="opt-help" style="margin-top:4px">${esc(mod.sum)}</p>` : ''}
    </div>
    <div class="mod-row-btns"></div>`;
  const btns = head.querySelector('.mod-row-btns');
  const openModPage = () => { currentCat = 'mod:' + mod.id; render(); };
  if (opts.withSettingsLink) {
    const hasSettings = Boolean(nIni);
    uiButton(btns, {
      small: true,
      variant: hasSettings ? 'primary' : '',
      html: hasSettings ? uiIcon('gear', 14) + ' Settings' : uiIcon('filetext', 14) + ' Page',
      title: hasSettings ? 'Open this mod’s settings' : 'Open this mod’s page',
      onClick: openModPage,
    });
  }
  if (opts.withReorder) {
    uiButton(btns, { small: true, html: uiIcon('up', 14), title: 'Load earlier', disabled: idx === 0, onClick: () => moveMod(mod.id, -1) });
    uiButton(btns, { small: true, html: uiIcon('down', 14), title: 'Load later', disabled: idx === total - 1, onClick: () => moveMod(mod.id, 1) });
  }
  uiButton(btns, { small: true, html: uiIcon('x', 14), title: 'Remove mod', onClick: () => removeMod(mod.id) });
  return head;
}

function makeModExtraCard(mod) {
  const ex = (state.modExtra || {})[mod.id] || { file: 'gus', text: '' };
  const exCard = document.createElement('div');
  exCard.className = 'opt-card wide';
  exCard.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">Extra INI lines for ${esc(mod.name)}</div>
      <code class="opt-key">written under this mod in the file you choose</code>
    </div></div>
    <p class="opt-help">For mod settings this tool doesn't know yet. Copy them from the mod's CurseForge page (include the [SectionName] line). They are written to the chosen file exactly as typed.</p>`;
  const selRow = document.createElement('div');
  selRow.style.cssText = 'display:flex;gap:8px;align-items:center';
  const sel = document.createElement('select');
  sel.innerHTML = '<option value="gus">→ GameUserSettings.ini</option><option value="game">→ Game.ini</option>';
  sel.value = ex.file || 'gus';
  selRow.appendChild(sel);
  exCard.appendChild(selRow);
  const ta = document.createElement('textarea');
  ta.placeholder = `[${esc(mod.name).replace(/[^A-Za-z0-9]/g, '')}]\nSomeSetting=True`;
  ta.style.cssText = 'width:100%;min-height:80px;resize:vertical;font-family:Consolas,monospace;font-size:.82rem;white-space:pre;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);outline:none;line-height:1.5';
  ta.value = ex.text || '';
  const saveExtra = () => {
    if (!state.modExtra) state.modExtra = {};
    if (ta.value.trim()) state.modExtra[mod.id] = { file: sel.value, text: ta.value };
    else delete state.modExtra[mod.id];
    saveState(); refreshBadges();
  };
  ta.addEventListener('input', saveExtra);
  sel.addEventListener('change', saveExtra);
  exCard.appendChild(ta);
  return exCard;
}

function iniCount(m) { return (m.ini || []).reduce((n, s) => n + s.settings.length, 0); }

/* ---------------- per-mod page ----------------
   renderModPage is deliberately only an orchestrator: each card below builds
   itself, so a change to one card cannot disturb the others. */
function renderModPage(grid, modId) {
  const entry = selectedMods().find((m) => m.id === modId);
  if (!entry) { currentCat = 'mods'; render(); return; }
  const mod = modInfo(entry);
  const idx = selectedMods().findIndex((m) => m.id === modId);

  paintModPageHeader(mod);
  grid.appendChild(makeModHeaderCard(mod, idx, selectedMods().length, { withReorder: true }));

  const mapNote = makeMapModNote(mod);
  if (mapNote) grid.appendChild(mapNote);

  const nSettings = appendModSettingCards(grid, mod);
  grid.appendChild(makeFindSettingsCard(mod, nSettings));

  const docsCard = makeModDocsCard(mod);
  if (docsCard) grid.appendChild(docsCard);

  grid.appendChild(makeModExtraCard(mod));
  grid.appendChild(makeBackToModsButton());
}

/* the page title above the grid */
function paintModPageHeader(mod) {
  const documented = mod.src
    ? ` — documented at <a href="${esc(mod.src)}" target="_blank" rel="noopener" style="color:var(--accent)">the mod page ↗</a>`
    : '';
  $('catHeader').innerHTML = `<h2><span class="h2ic">${uiIcon('puzzle', 22)}</span> ${esc(mod.name)}</h2>`
    + `<p>This mod's own settings page. Values you set here are written into the config files under the mod's section${documented}.</p>`;
}

/* Map mods need a launch-option change as well as the mod itself — say so, and
   offer to make it. Returns null for ordinary mods. */
function makeMapModNote(mod) {
  if (!mod.mapName) return null;
  const note = document.createElement('div');
  note.className = 'hint-box';
  note.style.gridColumn = '1 / -1';
  note.innerHTML = `${uiIcon('map', 14)} This is a <b>map mod</b>. To play it, also set Map to “Custom / Mod Map…” with the name <code>${esc(mod.mapName)}</code> in ${uiIcon('rocket', 14)} Launch Options.`;
  const useBtn = uiButton(note, {
    small: true,
    text: 'Use as my map',
    onClick: () => {
      state.launch.map = '__custom';
      state.launch.customMap = mod.mapName;
      saveState(); refreshBadges();
      toast(`Map set to ${mod.mapName} — check Launch Options.`);
    },
  });
  useBtn.style.marginLeft = '10px';
  return note;
}

/** Appends one control per known setting. @returns {number} how many. */
function appendModSettingCards(grid, mod) {
  let nSettings = 0;
  for (const sec of (mod.ini || [])) {
    for (const s of sec.settings) {
      grid.appendChild(makeCard(modOption(mod, sec, s)));
      nSettings++;
    }
  }
  return nSettings;
}

/* "read the CurseForge page live" card */
function makeFindSettingsCard(mod, nSettings) {
  const card = document.createElement('div');
  card.className = 'opt-card wide';
  card.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">${nSettings ? 'Look for more settings' : 'Find this mod’s settings'}</div>
      <code class="opt-key">reads the mod's CurseForge page live</code>
    </div></div>
    <p class="opt-help">${nSettings
      ? 'Checks the mod’s CurseForge page for settings that aren’t listed here yet (mod authors add new ones over time).'
      : 'This mod has no settings in the bundled catalog. The tool can read its CurseForge page right now and turn any documented INI settings into controls.'}</p>`;
  const idleLabel = uiIcon('search', 15) + ' Search the mod page';
  const findBtn = uiButton(card, {
    small: true,
    variant: 'primary',
    html: idleLabel,
    onClick: () => withBusyButton(findBtn, async () => {
      findBtn.textContent = 'Reading mod page…';
      try { await discoverModSettings(mod.id); } finally { findBtn.innerHTML = idleLabel; }
    }),
  });
  findBtn.style.alignSelf = 'flex-start';
  return card;
}

/* One button per settings doc found on the mod page, plus a paste box for the
   docs we cannot read from here. Returns null when the mod links none. */
function makeModDocsCard(mod) {
  const docs = (state.modDocs || {})[mod.id] || [];
  if (!docs.length) return null;

  const card = document.createElement('div');
  card.className = 'opt-card wide';
  card.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">This mod's settings documentation</div>
      <code class="opt-key">links found on the mod's CurseForge page</code>
    </div></div>
    <p class="opt-help">The mod author documents settings in the doc${docs.length === 1 ? '' : 's'} below.
    ${docs.some((d) => d.autoRead) ? 'Some were read automatically. ' : ''}Docs with several tabs can't always be read automatically —
    open the doc, copy the settings table or INI block, and paste it here: the tool turns it into controls.
    <b>Tip:</b> if the mod also exists for the old ARK (ASE), make sure the doc section you copy is for the ASA version.</p>`;

  const linkRow = uiElement('div', { parent: card });
  linkRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  for (const d of docs) {
    const a = uiElement('a', { className: 'btn small', parent: linkRow });
    a.href = d.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = uiIcon(docLinkIconName(d.kind), 14) + ' ' + esc((d.label || d.url).slice(0, 46)) + ' ' + uiIcon(d.autoRead ? 'check' : 'external', 12);
  }

  const ta = document.createElement('textarea');
  ta.placeholder = 'Paste the settings from the doc here — INI lines or copied table rows both work…';
  ta.style.cssText = 'width:100%;min-height:90px;resize:vertical;font-family:Consolas,monospace;font-size:.82rem;white-space:pre;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);outline:none;line-height:1.5;margin-top:8px';
  card.appendChild(ta);

  const parseBtn = uiButton(card, {
    small: true,
    variant: 'primary',
    html: uiIcon('gear', 15) + ' Turn pasted text into settings',
    onClick: () => applyPastedDocSettings(mod, ta.value),
  });
  parseBtn.style.cssText = 'align-self:flex-start;margin-top:6px';
  return card;
}

function docLinkIconName(kind) {
  if (kind === 'gsheet') return 'doc';
  if (kind === 'gdoc') return 'filetext';
  if (kind === 'mediawiki') return 'book';
  return 'link';
}

/* Turns text the user pasted out of a settings doc into real controls. */
function applyPastedDocSettings(mod, raw) {
  const text = String(raw || '').trim();
  if (!text) { toast('Paste the settings from the doc first.'); return; }
  let parsed = parseIniAnnotated(text, 'gus');
  if (!parsed.length) parsed = parseSheetText(text, 'gus', fallbackSectionFor(mod));
  if (!parsed.length) { toast('Could not find any settings in the pasted text — make sure it contains the setting names and values.'); return; }
  const n = mergeDynSections(mod.id, parsed);
  if (n > 0) { toast(`Added ${n} setting${n === 1 ? '' : 's'} from the doc!`); render(); }
  else toast('Those settings are already here.');
}

function makeBackToModsButton() {
  const back = uiButton(null, {
    html: uiIcon('back', 15) + ' Back to all mods',
    onClick: () => { currentCat = 'mods'; render(); },
  });
  back.style.gridColumn = '1 / -1';
  back.style.justifySelf = 'start';
  return back;
}

/* ---------------- Mods overview page ---------------- */
function renderModsCategory(grid) {
  const intro = document.createElement('div');
  intro.className = 'opt-card wide';
  intro.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">Your mod list <span style="color:var(--muted);font-weight:400">(${selectedMods().length} selected — load order matters)</span></div>
      <code class="opt-key">added to the start command as -mods=…</code>
    </div></div>
    <p class="opt-help">Browse the built-in CurseForge catalog (works offline), or add any mod by its project ID or page URL.
    Every selected mod gets its own page in the sidebar with friendly settings controls.</p>`;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const bBrowse = document.createElement('button');
  bBrowse.className = 'btn primary';
  bBrowse.innerHTML = uiIcon('puzzle', 16) + ' Open Mod Browser';
  bBrowse.addEventListener('click', openModBrowser);
  const addWrap = document.createElement('div');
  addWrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex:1;min-width:260px';
  const addInp = document.createElement('input');
  addInp.type = 'text';
  addInp.placeholder = 'CurseForge project ID or mod page URL…';
  addInp.style.cssText = 'flex:1;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);outline:none;font-size:.88rem';
  const bAdd = document.createElement('button');
  bAdd.className = 'btn';
  bAdd.innerHTML = uiIcon('plus', 15) + ' Add';
  const doAdd = () => { if (addInp.value.trim()) { addModByIdOrUrl(addInp.value.trim()); addInp.value = ''; } };
  bAdd.addEventListener('click', doAdd);
  addInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  addWrap.appendChild(addInp); addWrap.appendChild(bAdd);
  row.appendChild(bBrowse); row.appendChild(addWrap);
  intro.appendChild(row);
  grid.appendChild(intro);

  if (!selectedMods().length) {
    const d = document.createElement('div');
    d.className = 'empty-msg';
    d.innerHTML = 'No mods selected yet — open the <b>Mod Browser</b> to pick some!';
    grid.appendChild(d);
    return;
  }

  selectedMods().forEach((entry, idx) => {
    const mod = modInfo(entry);
    grid.appendChild(makeModHeaderCard(mod, idx, selectedMods().length, { withReorder: true, withSettingsLink: true }));
  });
}

/* ---------------- Mod Browser modal ---------------- */
const DEFAULT_BROWSER_FILTER = { term: '', cat: 'all', sort: 'dl' };
let browserFilter = { ...DEFAULT_BROWSER_FILTER };

function openModBrowser() {
  browserFilter = { ...DEFAULT_BROWSER_FILTER };
  $('modSearch').value = '';
  $('modCatFilter').value = 'all';
  $('modSort').value = 'dl';
  renderModBrowser();
  $('dlgMods').showModal();
}

function fmtDl(n) {
  if (!n) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

function renderModBrowser() {
  const wrap = $('modGrid');
  wrap.innerHTML = '';
  let list = MODS_DB.slice();
  if (browserFilter.cat !== 'all') list = list.filter((m) => m.cat === browserFilter.cat);
  if (browserFilter.term) {
    const t = browserFilter.term.toLowerCase();
    list = list.filter((m) => m.name.toLowerCase().includes(t) || (m.sum || '').toLowerCase().includes(t) || String(m.id).includes(t) || (m.author || '').toLowerCase().includes(t));
  }
  if (browserFilter.sort === 'dl') list.sort((a, b) => (b.dl || 0) - (a.dl || 0));
  else if (browserFilter.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (browserFilter.sort === 'ini') list.sort((a, b) => iniCount(b) - iniCount(a) || (b.dl || 0) - (a.dl || 0));

  if (!list.length) {
    wrap.innerHTML = '<div class="empty-msg">No mods match. You can still add any CurseForge mod by ID below.</div>';
    return;
  }
  for (const m of list) wrap.appendChild(makeModBrowserCard(m));
}

/* One catalog entry in the Mod Browser grid. */
function makeModBrowserCard(m) {
  const nIni = iniCount(m);
  const catInfo = modCatInfo(m.cat);
  const card = document.createElement('div');
  card.className = 'mod-card';
  card.innerHTML = `
    ${modThumbMarkup(m)}
    <div class="mod-card-body">
      <div class="mod-card-title">${esc(m.name)}</div>
      <div class="mod-card-meta">${uiIcon(catInfo.iconName, 12)} ${esc(catInfo.name)}${m.dl ? ` · ${uiIcon('download', 11)} ${fmtDl(m.dl)}` : ''}${nIni ? ` · <span class="has-ini-text">${uiIcon('gear', 11)} ${nIni} settings</span>` : ''}</div>
      <div class="mod-card-sum">${esc(m.sum || '')}</div>
      <div class="mod-card-actions">
        <a class="btn small" href="${esc(modCurseforgeUrl(m))}" target="_blank" rel="noopener" title="View on CurseForge">${uiIcon('external', 13)}</a>
      </div>
    </div>`;
  const actions = card.querySelector('.mod-card-actions');
  const selected = isModSelected(m.id);
  const bAdd = uiButton(null, {
    small: true,
    variant: selected ? '' : 'primary',
    html: selected ? uiIcon('check', 14) + ' Added' : uiIcon('plus', 14) + ' Add',
    disabled: selected,
    onClick: () => {
      addMod({ id: m.id });
      bAdd.innerHTML = uiIcon('check', 14) + ' Added';
      bAdd.disabled = true;
      bAdd.classList.remove('primary');
      if (currentCat === 'mods') render();
    },
  });
  actions.insertBefore(bAdd, actions.firstChild);
  return card;
}

/* ---------------- add by ID / URL (live CurseForge lookup) ----------------
   Five things can go wrong here (unparseable input, CurseForge still
   preparing the project, CurseForge unreachable, a project for another game,
   a project we cannot identify), so the flow is split: one function decides
   *what* the user typed, one adds it, and one explains each failure. */

/** Adds a mod, re-rendering the mods page when it is the one on screen. */
function addModAndRefresh(entry) {
  const added = addMod(entry);
  if (added && (currentCat === 'mods' || currentCat === 'mod:' + entry.id)) render();
  return added;
}

/**
 * Works out what the user pasted.
 * @returns {{ lookup: string, id: number|null }|null} null when it is neither
 *   a CurseForge mod URL nor a project id.
 */
function parseModLookup(input) {
  const text = String(input || '');
  const urlMatch = text.match(/curseforge\.com\/ark-survival-ascended\/mods\/([a-z0-9-]+)/i);
  const idMatch = text.match(/\b(\d{4,8})\b/);
  const id = idMatch ? parseInt(idMatch[1], 10) : null;
  if (urlMatch) return { lookup: 'ark-survival-ascended/mods/' + urlMatch[1], id };
  if (idMatch) return { lookup: idMatch[1], id };
  return null;
}

/* Offline/not-found fallback for a numeric id: the mod still loads on the
   server by id alone, so let the user add it by hand rather than lose the
   whole action. */
function addUnknownModByPrompt(id, reason) {
  const name = prompt(reason + '\nAdd mod ' + id + ' anyway? Type a name for it:', 'Mod ' + id);
  if (name) addModAndRefresh({ id, name });
}

/** Turns a cfwidget project into the entry we store in state.mods. */
function modEntryFromProject(project) {
  return {
    id: project.id,
    name: project.title || ('Mod ' + project.id),
    sum: (project.summary || '').slice(0, 140),
    thumb: project.thumbnail || '',
    slug: (project.urls && project.urls.curseforge || '').split('/').pop() || '',
    author: (project.members && project.members[0] && project.members[0].username) || '',
    dl: project.downloads && project.downloads.total || 0,
    cat: 'other',
  };
}

async function addModByIdOrUrl(input) {
  const parsed = parseModLookup(input);
  if (!parsed) { toast('Type a CurseForge project ID (a number) or paste the mod page URL.'); return; }

  // already in the bundled catalog: no network needed at all
  if (parsed.id !== null && modById.has(parsed.id)) { addModAndRefresh({ id: parsed.id }); return; }

  toast('Looking up the mod on CurseForge…');
  let project = null;
  let failure = null;
  try { project = await fetchCfwidget(parsed.lookup); } catch (e) { failure = e; }
  if (project) project.id = parseInt(project.id, 10);

  if (!project || !Number.isFinite(project.id) || project.id <= 0) {
    addModLookupFailed(parsed, failure);
    return;
  }
  if (project.game && project.game !== 'ark-survival-ascended') {
    toast(`That project is for "${project.game}", not ARK: Survival Ascended.`);
    return;
  }
  if (modById.has(project.id)) { addModAndRefresh({ id: project.id }); return; }

  const entry = modEntryFromProject(project);
  const alreadySelected = isModSelected(entry.id);
  addModAndRefresh(entry);
  if (!alreadySelected) discoverSettingsForNewMod(entry, project);
}

/* The lookup produced nothing usable — say which of the possible reasons it
   was, and offer the manual fallback when we have a numeric id to fall back to. */
function addModLookupFailed(parsed, failure) {
  if (isCfError(failure, CF_ERROR.QUEUED)) { toast(cfErrorMessage(failure)); return; }
  if (parsed.id !== null) {
    addUnknownModByPrompt(parsed.id, failure ? cfErrorMessage(failure) : 'CurseForge did not recognise that mod.');
    return;
  }
  toast('Could not look up that mod. Check the URL, or use its numeric project ID.');
}

/* Run the full discovery pipeline on the data we already fetched (new adds
   only — never clobber settings/extra lines the user already has). */
function discoverSettingsForNewMod(entry, project) {
  discoverModSettings(entry.id, { data: project, silent: true }).then((n) => {
    if (n > 0) toast(`Found ${n} setting${n === 1 ? '' : 's'} on the mod page — its settings page is ready!`);
    else if (((state.modDocs || {})[entry.id] || []).length) toast(`${entry.name} documents its settings in a linked doc — see its page in the sidebar.`);
  });
}

/* Scan a CurseForge description (HTML) for INI-style config blocks. */
function extractIniFromDescription(html) {
  if (!html) return null;
  let text = '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p, div, li, pre, h1, h2, h3, h4').forEach((el) => el.append('\n'));
    text = doc.body.textContent || '';
  } catch (e) { return null; }
  const lines = text.split(/\n/).map((l) => l.trim());
  const out = [];
  let inBlock = false;
  let kvCount = 0;
  for (const l of lines) {
    const isSection = /^\[[A-Za-z0-9_. \/]+\]$/.test(l);
    const isKv = /^[A-Za-z][A-Za-z0-9_\[\]]*\s*=\s*\S/.test(l) && !/^https?:/i.test(l) && l.length < 200;
    if (isSection) { inBlock = true; out.push(l); continue; }
    if (inBlock && isKv) { out.push(l); kvCount++; continue; }
    if (inBlock && l === '') continue;
    inBlock = false;
  }
  if (!out.length || !kvCount) return null;
  const file = /game\.ini/i.test(text) && !/gameusersettings\.ini/i.test(text) ? 'game' : 'gus';
  return { file, text: out.join('\n') };
}

/* ---------------- wiring (called from app.js init) ---------------- */
function initModsUI() {
  if (!state.mods) state.mods = [];
  if (!state.modExtra) state.modExtra = {};
  if (!state.modDynIni) state.modDynIni = {};
  if (!state.modDocs) state.modDocs = {};
  if (!state.modContent) state.modContent = {};
  $('modDbDate').textContent = MODS_DB_DATE;
  $('modSearch').addEventListener('input', (e) => { browserFilter.term = e.target.value.trim(); renderModBrowser(); });
  $('modCatFilter').addEventListener('change', (e) => { browserFilter.cat = e.target.value; renderModBrowser(); });
  $('modSort').addEventListener('change', (e) => { browserFilter.sort = e.target.value; renderModBrowser(); });
  $('btnModAddById2').addEventListener('click', () => {
    const v = $('modAddId2').value.trim();
    if (v) { addModByIdOrUrl(v); $('modAddId2').value = ''; }
  });
  $('modAddId2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { addModByIdOrUrl(v); e.target.value = ''; } }
  });
  const sel = $('modCatFilter');
  sel.innerHTML = '<option value="all">All categories</option>';
  const cats = [...new Set(MODS_DB.map((m) => m.cat))];
  for (const c of Object.keys(MOD_CATS)) {
    if (!cats.includes(c)) continue;
    const op = document.createElement('option');
    op.value = c;
    op.textContent = MOD_CATS[c].name;
    sel.appendChild(op);
  }
}

/**
 * Drops every module-level cache this file keeps, so a different account never
 * inherits the previous one's browser filter or half-finished import.
 * Called by auth.js when the signed-in user changes; nothing here calls it.
 */
function resetModsUiState() {
  browserFilter = { ...DEFAULT_BROWSER_FILTER };
  importTouchedMods.clear();
  // the dialog's own controls are rebuilt from browserFilter on open, but the
  // inputs live in static markup and would otherwise keep the old text
  const search = document.getElementById('modSearch');
  if (search) search.value = '';
  const catFilter = document.getElementById('modCatFilter');
  if (catFilter) catFilter.value = DEFAULT_BROWSER_FILTER.cat;
  const sort = document.getElementById('modSort');
  if (sort) sort.value = DEFAULT_BROWSER_FILTER.sort;
}
