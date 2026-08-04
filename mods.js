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
    let rest = line.slice(eq + 1).trim();
    let desc = '';
    let val = rest;
    const mPar = rest.match(/^([^(]*?)\s*\((.*)\)\s*$/);
    if (mPar) { val = mPar[1].trim(); desc = mPar[2].trim(); }
    else if (rest.includes(' - ')) {
      const i = rest.indexOf(' - ');
      val = rest.slice(0, i).trim(); desc = rest.slice(i + 3).trim();
    }
    let t = 'str';
    let d = null;
    if (val === '') {
      const low = desc.toLowerCase();
      if (low.includes('true') && low.includes('false')) t = 'bool';
      else if (/\b(number|amount|seconds|radius|limit|id|%|range)\b/.test(low)) t = 'int';
      d = null;
    } else if (/^(true|false)$/i.test(val)) { t = 'bool'; d = /^true$/i.test(val); }
    else if (/^-?\d+$/.test(val)) { t = 'int'; d = parseInt(val, 10); }
    else if (/^-?\d*\.\d+$/.test(val)) { t = 'float'; d = parseFloat(val); }
    else { t = 'str'; d = val; }
    if (desc) {
      desc = desc.charAt(0).toUpperCase() + desc.slice(1);
      if (!/[.!?)]$/.test(desc)) desc += '.';
    }
    cur.settings.push({ k: key, t, d, n: friendlyKeyName(key), h: desc });
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

/* shared type/default/description inference for one setting */
function inferSetting(key, val, desc) {
  let t = 'str';
  let d = null;
  val = String(val || '').trim();
  desc = String(desc || '').trim();
  if (val === '') {
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
const NOTHING = { sections: [], text: '' };

/* Fetches the raw text behind a settings-doc link (empty string if the link
   kind can't be read cross-origin). */
async function fetchDocText(link) {
  if (link.kind === 'gsheet') {
    const id = (link.url.match(/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
    if (!id) return '';
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`);
    return r.ok ? r.text() : '';
  }
  if (link.kind === 'gdoc') {
    const id = (link.url.match(/document\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
    if (!id) return '';
    const r = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`);
    return r.ok ? r.text() : '';
  }
  if (link.kind === 'paste') {
    const id = (link.url.match(/pastebin\.com\/(?:raw\/)?(\w+)/) || [])[1];
    if (!id) return '';
    const r = await fetch(`https://pastebin.com/raw/${id}`);
    return r.ok ? r.text() : '';
  }
  if (link.kind === 'mediawiki') {
    // the MediaWiki API supports cross-origin reads with origin=* (Fandom, wiki.gg, …)
    const m = link.url.match(/^(https?:\/\/[^\/]+)(?:\/[^\/]+)*?\/wiki\/([^?#]+)/i);
    if (!m) return '';
    const r = await fetch(`${m[1]}/api.php?action=parse&page=${encodeURIComponent(decodeURIComponent(m[2]))}&format=json&prop=wikitext&origin=*`);
    if (!r.ok) return '';
    const j = await r.json();
    const wt = j && j.parse && j.parse.wikitext && j.parse.wikitext['*'];
    return wt ? wikitextToLines(wt) : '';
  }
  return '';   // generic pages: CORS almost always blocks — handled via the paste fallback
}

/* Reads a settings-doc link and parses it. Returns { sections, text } so the
   caller can also scan the raw text for modded content. */
async function tryFetchDocSettings(link, file, fallbackSection) {
  try {
    const text = await fetchDocText(link);
    if (!text || text.length > DOC_TEXT_LIMIT) return NOTHING;

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
    return { sections: capped, text };
  } catch (e) { return NOTHING; }
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
async function fetchCfwidget(idOrPath) {
  const url = 'https://api.cfwidget.com/' + idOrPath;
  let queued = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url);
    if (r.status === 202) {
      queued = true;
      if (attempt < 2) await new Promise((res) => setTimeout(res, 2500));
      continue;
    }
    queued = false;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }
  throw new Error(queued ? 'queued' : 'unreachable');
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
      if (!opts.silent) {
        toast(String(e.message) === 'queued'
          ? 'CurseForge is still preparing this mod’s info — try again in a minute.'
          : 'Could not reach CurseForge right now (offline?).');
      }
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
      }
    }
  }
  if (!opts.silent && newContent > 0) {
    toast(`Found ${newContent} modded creature/item/engram name${newContent === 1 ? '' : 's'} — they now appear in the pickers.`);
  }

  if (currentCat === 'mod:' + modId || currentCat === 'mods') render();
  if (!opts.silent) {
    if (added > 0) toast(`Found ${added} setting${added === 1 ? '' : 's'} for this mod online!`);
    else if (links.length) toast('This mod documents its settings in a linked doc — open it below and paste the settings in.');
    else if (block) toast('All of this mod’s documented settings are already here.');
    else toast('No INI settings documented on this mod’s page.');
  }
  return added;
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

/* ---------------- shared card builders ---------------- */
function makeModHeaderCard(mod, idx, total, opts = {}) {
  const head = document.createElement('div');
  head.className = 'opt-card wide selected-mod-row';
  const catInfo = MOD_CATS[mod.cat] || MOD_CATS.other;
  const thumbHtml = mod.thumb
    ? `<img class="mod-thumb" src="${esc(mod.thumb)}" alt="" loading="lazy" data-fallback-ic="${catInfo.icon}" onerror="this.outerHTML='<div class=&quot;mod-thumb mod-thumb-fallback&quot;>'+uiIcon(this.dataset.fallbackIc,26)+'</div>'">`
    : `<div class="mod-thumb mod-thumb-fallback">${uiIcon(catInfo.icon, 26)}</div>`;
  const nIni = iniCount(mod);
  const cfUrl = mod.slug ? `https://www.curseforge.com/ark-survival-ascended/mods/${mod.slug}` : `https://www.curseforge.com/projects/${mod.id}`;
  head.innerHTML = `
    ${thumbHtml}
    <div style="flex:1;min-width:0">
      <div class="opt-name">${esc(mod.name)} <span class="mod-badge">${uiIcon(catInfo.icon, 12)} ${catInfo.name}</span>
        ${nIni ? `<span class="mod-badge has-ini">${uiIcon('gear', 12)} ${nIni} settings</span>` : ''}
        ${mod.mapName ? `<span class="mod-badge">${uiIcon('map', 12)} map: ${esc(mod.mapName)}</span>` : ''}</div>
      <code class="opt-key">ID ${esc(mod.id)}${mod.author ? ' · by ' + esc(mod.author) : ''} · <a href="${esc(cfUrl)}" target="_blank" rel="noopener" style="color:var(--accent)">View on CurseForge ↗</a></code>
      ${mod.sum ? `<p class="opt-help" style="margin-top:4px">${esc(mod.sum)}</p>` : ''}
    </div>
    <div class="mod-row-btns"></div>`;
  const btns = head.querySelector('.mod-row-btns');
  const mk = (label, title, fn, disabled) => {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.innerHTML = label;
    b.title = title;
    if (disabled) b.disabled = true;
    b.addEventListener('click', fn);
    btns.appendChild(b);
  };
  if (opts.withSettingsLink && iniCount(mod)) {
    const b = document.createElement('button');
    b.className = 'btn small primary';
    b.innerHTML = uiIcon('gear', 14) + ' Settings';
    b.addEventListener('click', () => { currentCat = 'mod:' + mod.id; render(); });
    btns.appendChild(b);
  } else if (opts.withSettingsLink) {
    mk(uiIcon('filetext', 14) + ' Page', 'Open this mod’s page', () => { currentCat = 'mod:' + mod.id; render(); });
  }
  if (opts.withReorder) {
    mk(uiIcon('up', 14), 'Load earlier', () => moveMod(mod.id, -1), idx === 0);
    mk(uiIcon('down', 14), 'Load later', () => moveMod(mod.id, 1), idx === total - 1);
  }
  mk(uiIcon('x', 14), 'Remove mod', () => removeMod(mod.id));
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

/* ---------------- per-mod page ---------------- */
function renderModPage(grid, modId) {
  const entry = selectedMods().find((m) => m.id === modId);
  if (!entry) { currentCat = 'mods'; render(); return; }
  const mod = modInfo(entry);
  const idx = selectedMods().findIndex((m) => m.id === modId);

  const headEl = $('catHeader');
  headEl.innerHTML = `<h2><span class="h2ic">${uiIcon('puzzle', 22)}</span> ${esc(mod.name)}</h2><p>This mod's own settings page. Values you set here are written into the config files under the mod's section${mod.src ? ` — documented at <a href="${esc(mod.src)}" target="_blank" rel="noopener" style="color:var(--accent)">the mod page ↗</a>` : ''}.</p>`;

  grid.appendChild(makeModHeaderCard(mod, idx, selectedMods().length, { withReorder: true }));

  if (mod.mapName) {
    const note = document.createElement('div');
    note.className = 'hint-box';
    note.style.gridColumn = '1 / -1';
    note.innerHTML = `${uiIcon('map', 14)} This is a <b>map mod</b>. To play it, also set Map to “Custom / Mod Map…” with the name <code>${esc(mod.mapName)}</code> in 🚀 Launch Options.`;
    const useBtn = document.createElement('button');
    useBtn.className = 'btn small';
    useBtn.style.marginLeft = '10px';
    useBtn.textContent = 'Use as my map';
    useBtn.addEventListener('click', () => {
      state.launch.map = '__custom';
      state.launch.customMap = mod.mapName;
      saveState(); refreshBadges();
      toast(`Map set to ${mod.mapName} — check Launch Options.`);
    });
    note.appendChild(useBtn);
    grid.appendChild(note);
  }

  // settings cards
  let nSettings = 0;
  for (const sec of (mod.ini || [])) {
    for (const s of sec.settings) {
      grid.appendChild(makeCard(modOption(mod, sec, s)));
      nSettings++;
    }
  }

  // find-more-online card
  const findCard = document.createElement('div');
  findCard.className = 'opt-card wide';
  findCard.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">${nSettings ? 'Look for more settings' : 'Find this mod’s settings'}</div>
      <code class="opt-key">reads the mod's CurseForge page live</code>
    </div></div>
    <p class="opt-help">${nSettings
      ? 'Checks the mod’s CurseForge page for settings that aren’t listed here yet (mod authors add new ones over time).'
      : 'This mod has no settings in the bundled catalog. The tool can read its CurseForge page right now and turn any documented INI settings into controls.'}</p>`;
  const findBtn = document.createElement('button');
  findBtn.className = 'btn primary small';
  findBtn.innerHTML = uiIcon('search', 15) + ' Search the mod page';
  findBtn.style.alignSelf = 'flex-start';
  findBtn.addEventListener('click', async () => {
    findBtn.disabled = true;
    findBtn.textContent = 'Reading mod page…';
    await discoverModSettings(mod.id);
    findBtn.disabled = false;
    findBtn.innerHTML = uiIcon('search', 15) + ' Search the mod page';
  });
  findCard.appendChild(findBtn);
  grid.appendChild(findCard);

  // settings docs linked from the mod page (e.g. Google Sheets)
  const docs = (state.modDocs || {})[mod.id] || [];
  if (docs.length) {
    const docsCard = document.createElement('div');
    docsCard.className = 'opt-card wide';
    docsCard.innerHTML = `
      <div class="opt-head"><div>
        <div class="opt-name">This mod's settings documentation</div>
        <code class="opt-key">links found on the mod's CurseForge page</code>
      </div></div>
      <p class="opt-help">The mod author documents settings in the doc${docs.length === 1 ? '' : 's'} below.
      ${docs.some((d) => d.autoRead) ? 'Some were read automatically. ' : ''}Docs with several tabs can't always be read automatically —
      open the doc, copy the settings table or INI block, and paste it here: the tool turns it into controls.
      <b>Tip:</b> if the mod also exists for the old ARK (ASE), make sure the doc section you copy is for the ASA version.</p>`;
    const linkRow = document.createElement('div');
    linkRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    for (const d of docs) {
      const a = document.createElement('a');
      a.className = 'btn small';
      a.href = d.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = uiIcon(d.kind === 'gsheet' ? 'doc' : d.kind === 'gdoc' ? 'filetext' : d.kind === 'mediawiki' ? 'book' : 'link', 14) + ' ' + esc((d.label || d.url).slice(0, 46)) + ' ' + uiIcon(d.autoRead ? 'check' : 'external', 12);
      linkRow.appendChild(a);
    }
    docsCard.appendChild(linkRow);
    const ta = document.createElement('textarea');
    ta.placeholder = 'Paste the settings from the doc here — INI lines or copied table rows both work…';
    ta.style.cssText = 'width:100%;min-height:90px;resize:vertical;font-family:Consolas,monospace;font-size:.82rem;white-space:pre;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);outline:none;line-height:1.5;margin-top:8px';
    docsCard.appendChild(ta);
    const parseBtn = document.createElement('button');
    parseBtn.className = 'btn small primary';
    parseBtn.style.cssText = 'align-self:flex-start;margin-top:6px';
    parseBtn.innerHTML = uiIcon('gear', 15) + ' Turn pasted text into settings';
    parseBtn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { toast('Paste the settings from the doc first.'); return; }
      const fb = fallbackSectionFor(mod);
      let parsed = parseIniAnnotated(text, 'gus');
      if (!parsed.length) parsed = parseSheetText(text, 'gus', fb);
      if (!parsed.length) { toast('Could not find any settings in the pasted text — make sure it contains the setting names and values.'); return; }
      const n = mergeDynSections(mod.id, parsed);
      if (n > 0) { toast(`Added ${n} setting${n === 1 ? '' : 's'} from the doc!`); render(); }
      else toast('Those settings are already here.');
    });
    docsCard.appendChild(parseBtn);
    grid.appendChild(docsCard);
  }

  grid.appendChild(makeModExtraCard(mod));

  // back link
  const back = document.createElement('button');
  back.className = 'btn';
  back.style.gridColumn = '1 / -1';
  back.style.justifySelf = 'start';
  back.innerHTML = uiIcon('back', 15) + ' Back to all mods';
  back.addEventListener('click', () => { currentCat = 'mods'; render(); });
  grid.appendChild(back);
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
let browserFilter = { term: '', cat: 'all', sort: 'dl' };

function openModBrowser() {
  browserFilter = { term: '', cat: 'all', sort: 'dl' };
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
  for (const m of list) {
    const nIni = iniCount(m);
    const catInfo = MOD_CATS[m.cat] || MOD_CATS.other;
    const card = document.createElement('div');
    card.className = 'mod-card';
    const cfUrl = m.slug ? `https://www.curseforge.com/ark-survival-ascended/mods/${m.slug}` : `https://www.curseforge.com/projects/${m.id}`;
    const thumbHtml = m.thumb
      ? `<img class="mod-thumb" src="${esc(m.thumb)}" alt="" loading="lazy" data-fallback-ic="${catInfo.icon}" onerror="this.outerHTML='<div class=&quot;mod-thumb mod-thumb-fallback&quot;>'+uiIcon(this.dataset.fallbackIc,26)+'</div>'">`
      : `<div class="mod-thumb mod-thumb-fallback">${uiIcon(catInfo.icon, 26)}</div>`;
    card.innerHTML = `
      ${thumbHtml}
      <div class="mod-card-body">
        <div class="mod-card-title">${esc(m.name)}</div>
        <div class="mod-card-meta">${catInfo.icon} ${catInfo.name}${m.dl ? ` · ${uiIcon('download', 11)} ${fmtDl(m.dl)}` : ''}${nIni ? ` · <span class="has-ini-text">${uiIcon('gear', 11)} ${nIni} settings</span>` : ''}</div>
        <div class="mod-card-sum">${esc(m.sum || '')}</div>
        <div class="mod-card-actions">
          <a class="btn small" href="${esc(cfUrl)}" target="_blank" rel="noopener" title="View on CurseForge">${uiIcon('external', 13)}</a>
        </div>
      </div>`;
    const actions = card.querySelector('.mod-card-actions');
    const bAdd = document.createElement('button');
    const selected = isModSelected(m.id);
    bAdd.className = 'btn small' + (selected ? '' : ' primary');
    bAdd.innerHTML = selected ? uiIcon('check', 14) + ' Added' : uiIcon('plus', 14) + ' Add';
    bAdd.disabled = selected;
    bAdd.addEventListener('click', () => {
      addMod({ id: m.id });
      bAdd.innerHTML = uiIcon('check', 14) + ' Added';
      bAdd.disabled = true;
      bAdd.classList.remove('primary');
      if (currentCat === 'mods') render();
    });
    actions.insertBefore(bAdd, actions.firstChild);
    wrap.appendChild(card);
  }
}

/* ---------------- add by ID / URL (live CurseForge lookup) ---------------- */
async function addModByIdOrUrl(input) {
  let lookup = null;
  const urlMatch = input.match(/curseforge\.com\/ark-survival-ascended\/mods\/([a-z0-9-]+)/i);
  const idMatch = input.match(/\b(\d{4,8})\b/);
  if (urlMatch) lookup = 'ark-survival-ascended/mods/' + urlMatch[1];
  else if (idMatch) lookup = idMatch[1];
  else { toast('Type a CurseForge project ID (a number) or paste the mod page URL.'); return; }

  if (idMatch && modById.has(parseInt(idMatch[1], 10))) {
    if (addMod({ id: parseInt(idMatch[1], 10) }) && currentCat === 'mods') render();
    return;
  }

  toast('Looking up the mod on CurseForge…');
  let j = null;
  let failReason = '';
  try { j = await fetchCfwidget(lookup); } catch (e) { failReason = String(e.message); }
  if (j) j.id = parseInt(j.id, 10);
  if ((!j || !Number.isFinite(j.id)) && failReason === 'queued') {
    toast('CurseForge is still preparing this mod’s info — try again in a minute.');
    return;
  }
  if (!j || !Number.isFinite(j.id) || j.id <= 0) {
    if (idMatch) {
      const id = parseInt(idMatch[1], 10);
      const name = prompt('Could not reach CurseForge (offline or mod not found).\nAdd mod ' + id + ' anyway? Type a name for it:', 'Mod ' + id);
      if (name && addMod({ id, name }) && currentCat === 'mods') render();
    } else {
      toast('Could not look up that mod. Check the URL, or use its numeric project ID.');
    }
    return;
  }
  if (j.game && j.game !== 'ark-survival-ascended') {
    toast(`That project is for "${j.game}", not ARK: Survival Ascended.`);
    return;
  }
  if (modById.has(j.id)) {
    if (addMod({ id: j.id }) && currentCat === 'mods') render();
    return;
  }

  const entry = {
    id: j.id,
    name: j.title || ('Mod ' + j.id),
    sum: (j.summary || '').slice(0, 140),
    thumb: j.thumbnail || '',
    slug: (j.urls && j.urls.curseforge || '').split('/').pop() || '',
    author: (j.members && j.members[0] && j.members[0].username) || '',
    dl: j.downloads && j.downloads.total || 0,
    cat: 'other',
  };
  const alreadySelected = isModSelected(entry.id);
  addMod(entry);

  // run the full discovery pipeline on the data we already fetched (new adds
  // only — never clobber settings/extra lines the user already has)
  if (!alreadySelected) {
    discoverModSettings(entry.id, { data: j, silent: true }).then((n) => {
      if (n > 0) toast(`Found ${n} setting${n === 1 ? '' : 's'} on the mod page — its settings page is ready!`);
      else if (((state.modDocs || {})[entry.id] || []).length) toast(`${entry.name} documents its settings in a linked doc — see its page in the sidebar.`);
    });
  }
  if (currentCat === 'mods' || currentCat === 'mod:' + entry.id) render();
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
