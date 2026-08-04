#!/usr/bin/env node
/* =========================================================================
   Cross-file global collision check for the renderer.

   The renderer has no bundler: index.html loads a dozen classic <script>
   files, and their top-level `const`/`let`/`class` bindings all land in one
   shared global lexical environment. Declaring the same name in two of those
   files is a hard SyntaxError — the whole app fails to boot with nothing but
   a console message the user never sees.

   ESLint analyses one file at a time and cannot catch this, so this script
   does: it reads the script order straight out of index.html, collects the
   top-level declarations of each file, and fails the build on any duplicate.

   Detection is intentionally simple — a declaration keyword at column 0 —
   which matches the house style throughout the renderer and keeps this tool
   dependency-free.
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');

/** Names that may legitimately be redeclared because only one copy is ever
    loaded, or because the binding is the CommonJS interop guard. */
const ALLOWED_DUPLICATES = new Set(['module', 'exports']);

/** Reads the renderer script files in the exact order index.html loads them. */
function rendererScripts() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const scripts = [];
  const tag = /<script\s+src="([^"?]+)(?:\?[^"]*)?"><\/script>/gi;
  for (const match of html.matchAll(tag)) scripts.push(match[1]);
  return scripts;
}

/** Top-level declaration names in a classic script, keyed by name. */
function topLevelDeclarations(source) {
  const names = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Column 0 only: anything indented is inside a function or block.
    const simple = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (simple) { names.push({ name: simple[1], line: i + 1 }); continue; }

    const declared = /^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (declared) { names.push({ name: declared[1], line: i + 1 }); continue; }

    // `const { a, b } = ...` / `const [a, b] = ...`
    const destructured = /^(?:const|let|var)\s+[{[]([^}\]]*)[}\]]/.exec(line);
    if (destructured) {
      for (const part of destructured[1].split(',')) {
        const id = /([A-Za-z_$][\w$]*)\s*$/.exec(part.split(':').pop().split('=')[0].trim());
        if (id) names.push({ name: id[1], line: i + 1 });
      }
    }
  }
  return names;
}

function main() {
  const scripts = rendererScripts();
  if (!scripts.length) {
    console.error('check-globals: no <script src> tags found in index.html — has the markup changed?');
    process.exit(1);
  }

  /** name -> [{ file, line }] */
  const seen = new Map();
  const missing = [];

  for (const script of scripts) {
    const file = path.join(ROOT, script);
    if (!fs.existsSync(file)) { missing.push(script); continue; }
    for (const { name, line } of topLevelDeclarations(fs.readFileSync(file, 'utf8'))) {
      if (ALLOWED_DUPLICATES.has(name)) continue;
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push({ file: script, line });
    }
  }

  const collisions = [...seen.entries()].filter(([, places]) => places.length > 1);

  if (missing.length) {
    console.error('check-globals: index.html references files that do not exist:');
    for (const script of missing) console.error('  - ' + script);
  }

  if (collisions.length) {
    console.error('check-globals: duplicate top-level names across renderer scripts.');
    console.error('These share one global scope — a duplicate is a SyntaxError at load time.\n');
    for (const [name, places] of collisions) {
      console.error('  ' + name);
      for (const place of places) console.error('    ' + place.file + ':' + place.line);
    }
  }

  if (missing.length || collisions.length) process.exit(1);

  console.log('check-globals: OK — ' + seen.size + ' top-level names across ' + scripts.length + ' renderer scripts, no collisions.');
}

main();
