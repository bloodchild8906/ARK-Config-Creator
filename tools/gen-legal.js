/* =========================================================================
   Writes the distributable legal documents from legal.js, the single source
   of truth, so the installer, the repository docs and the in-app dialog can
   never show different wording.

   Run automatically before every build:  npm run dist
   Or on its own:                          npm run legal
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { LEGAL_DOCS, APP_LEGAL_NAME, APP_LEGAL_VERSION } = require('../legal.js');

const ROOT = path.join(__dirname, '..');
const RULE = '='.repeat(74);

function header(title) {
  return `${RULE}\n  ${APP_LEGAL_NAME} v${APP_LEGAL_VERSION} — ${title.toUpperCase()}\n${RULE}\n\n`;
}
function write(file, text) {
  // CRLF for Notepad, and a UTF-8 BOM so the NSIS licence page renders
  // dashes and quotes correctly instead of mojibake (without the BOM the
  // installer falls back to the system code page).
  const body = '﻿' + text.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(path.join(ROOT, file), body, 'utf8');
  console.log('wrote ' + file);
}

write('TERMS.txt', header(LEGAL_DOCS.terms.title) + LEGAL_DOCS.terms.body + '\n');
write('PRIVACY.txt', header(LEGAL_DOCS.privacy.title) + LEGAL_DOCS.privacy.body + '\n');
write('LICENSE.txt', LEGAL_DOCS.licence.body + '\n');

/* EULA.txt is what the installer shows on its licence page: the terms first
   (that is what the user is actually agreeing to), then privacy, then the
   MIT licence in full. */
write('EULA.txt', [
  header('Terms of Use, Privacy & Licence'),
  'Please read this before installing. Choosing "I Agree" accepts these terms.\n\n',
  `--- 1. ${LEGAL_DOCS.terms.title.toUpperCase()} ---\n\n`, LEGAL_DOCS.terms.body, '\n\n\n',
  `--- 2. ${LEGAL_DOCS.privacy.title.toUpperCase()} ---\n\n`, LEGAL_DOCS.privacy.body, '\n\n\n',
  `--- 3. ${LEGAL_DOCS.licence.title.toUpperCase()} ---\n\n`, LEGAL_DOCS.licence.body, '\n',
].join(''));
