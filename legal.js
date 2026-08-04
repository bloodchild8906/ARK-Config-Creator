/* =========================================================================
   ARK Config Creator — legal documents (single source of truth).
   The in-app "Terms / Privacy / Licence" dialog renders these strings, and
   tools/gen-legal.js writes TERMS.txt, PRIVACY.txt and EULA.txt from them so
   the installer and the app can never show different wording.
   ========================================================================= */
'use strict';

const APP_LEGAL_NAME = 'ARK Config Creator';
const APP_LEGAL_VERSION = '1.0.1';

const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Use',
    body: `ARK Config Creator ("the Software") is a free, unofficial fan-made tool that
helps you create and manage server configuration files for ARK: Survival
Ascended. By installing or using the Software you agree to these terms.

1. NOT AN OFFICIAL PRODUCT
   The Software is not affiliated with, endorsed by, sponsored by or connected
   to Studio Wildcard, Snail Games, Overwolf/CurseForge, Nitrado, Pterodactyl,
   or any game-server host. "ARK", "ARK: Survival Ascended" and all related
   names and logos are trademarks of their respective owners and are used here
   only to describe what the Software is for.

2. YOUR SERVER, YOUR RESPONSIBILITY
   The Software writes game configuration files and can, when you set it up to
   do so, upload those files to a game server you control and restart it.
   You are responsible for:
     - the settings you choose and their effect on your server and players;
     - keeping your own backups before applying changes;
     - complying with the rules and terms of your hosting provider.
   The Software makes a best-effort ".bak" copy of files it replaces, but this
   is a convenience, not a guarantee. Always keep an independent backup.

3. THIRD-PARTY SERVICES
   Some features contact third-party services on your behalf: SteamCMD and
   Steam content delivery when you choose to install or update a local
   dedicated server; mod information
   from CurseForge (via the public cfwidget API and forgecdn images), settings
   documentation from sources such as ark.wiki.gg, Google Docs/Sheets and
   Pastebin, and any hosting provider API you configure (for example Nitrado
   or a Pterodactyl panel). Those services have their own terms and privacy
   policies, are outside the control of the Software, and may change or become
   unavailable at any time. Mod names, descriptions, images and settings belong
   to their respective authors.

4. ACCURACY OF GAME DATA
   Server settings, creature and item data change with every game and mod
   update. The Software's bundled data reflects a point in time and may be
   incomplete or outdated. Settings marked as unverified may not work. Always
   test configuration changes on a server you can safely restart.

5. LOCAL ACCOUNTS
   Desktop accounts exist only on the computer where they were created. There
   is no online account, no password recovery and no synchronisation. If you
   forget a password or lose the computer, the data stored under that account
   cannot be recovered by anyone.

6. NO WARRANTY
   The Software is provided "as is", without warranty of any kind. To the
   fullest extent permitted by law, the authors are not liable for any damage,
   data loss, server downtime, lost progress or other harm arising from use of
   the Software.

7. LICENCE
   The Software is distributed under the MIT Licence, reproduced in full in
   the Licence document supplied with it.

8. CHANGES
   These terms may change in later versions. The version you agreed to is the
   one supplied with your copy of the Software.`,
  },

  privacy: {
    title: 'Privacy',
    body: `Short version: ARK Config Creator has no servers, no accounts in the cloud,
no analytics and no telemetry. Nothing about you or your configuration is ever
sent to the makers of this Software.

WHAT IS STORED, AND WHERE
   Desktop app: your account and its settings are stored in a local database
   on your PC, under
       %APPDATA%\\ARK Config Creator\\arkcc-data
   Browser version: settings are stored in that browser's local storage.

   Account passwords are never stored in readable form. They are hashed with
   scrypt using a random per-account salt.

   Server connection details (hosting provider API tokens, panel URLs, chosen
   local folders) are stored only on this PC. The local server service also
   stores a random loopback-only access token on this PC so the app can
   reconnect to a running local server after it is reopened. They are deliberately excluded
   from the profile files you can export and share, so sharing a setup never
   leaks a token.

NETWORK CONNECTIONS THE SOFTWARE MAKES
   The Software only reaches the internet when a feature you use needs it:
     - Mod browser and mod settings discovery: the public CurseForge widget
       API (api.cfwidget.com) and mod thumbnails (forgecdn.net).
     - "Search the mod page" / settings documents: the linked document, which
       may be on Google Docs/Sheets, a MediaWiki site such as ark.wiki.gg, or
       Pastebin.
     - Local Server Setup: Valve's SteamCMD download and Steam content
       delivery, only after you explicitly start an install or update.
     - Deploy: only the hosting provider you configured (for example
       api.nitrado.net or your own panel URL). Your API token is sent to that
       provider, and to nobody else.
   No connection is made in the background, on startup, or for any other
   purpose. Everything else — every setting, every generated file — is
   computed entirely on your own computer.

LOCAL SERVER CONSOLE
   When you start a local server from the Software, a small local background
   service keeps the server process and its console pipes alive while the app
   is closed. It listens only on 127.0.0.1 and requires the random local token
   above. Console output is streamed only while an open app page is viewing
   it; it is not uploaded, written to a log, or retained after the viewer
   disconnects.

REMOVING YOUR DATA
   Uninstalling offers to delete the local data folder. You can also delete
   %APPDATA%\\ARK Config Creator at any time; the Software will start fresh.`,
  },

  licence: {
    title: 'Licence',
    body: `MIT License

Copyright (c) 2026 ARK Config Creator

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
};

/* ---------------- in-app viewer ---------------- */
function showLegalDialog(which) {
  const key = LEGAL_DOCS[which] ? which : 'terms';
  document.getElementById('dlgLegal')?.remove();

  const dlg = document.createElement('dialog');
  dlg.id = 'dlgLegal';
  dlg.innerHTML = `
    <div class="modal-head">
      <h3>${uiIcon('filetext', 20)} <span id="legalTitle"></span></h3>
      <button class="close-x" data-close aria-label="Close">${uiIcon('x', 18)}</button>
    </div>
    <div class="modal-body">
      <div class="tabs" id="legalTabs">
        ${Object.keys(LEGAL_DOCS).map((k) =>
          `<button class="tab${k === key ? ' active' : ''}" data-doc="${k}">${esc(LEGAL_DOCS[k].title)}</button>`).join('')}
      </div>
      <pre class="file-preview legal-text" id="legalBody"></pre>
      <p class="opt-help" style="margin-top:10px">
        ${esc(APP_LEGAL_NAME)} v${esc(APP_LEGAL_VERSION)} — unofficial fan tool, not affiliated with Studio Wildcard.
      </p>
    </div>`;
  document.body.appendChild(dlg);

  const showDoc = (k) => {
    dlg.querySelector('#legalTitle').textContent = LEGAL_DOCS[k].title;
    dlg.querySelector('#legalBody').textContent = LEGAL_DOCS[k].body;
    dlg.querySelectorAll('#legalTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.doc === k));
  };
  dlg.querySelectorAll('#legalTabs .tab').forEach((t) => t.addEventListener('click', () => showDoc(t.dataset.doc)));
  dlg.querySelector('[data-close]').addEventListener('click', () => { dlg.close(); dlg.remove(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) { dlg.close(); dlg.remove(); } });
  showDoc(key);
  dlg.showModal();
}

/* tools/gen-legal.js imports this file to write the .txt documents */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LEGAL_DOCS, APP_LEGAL_NAME, APP_LEGAL_VERSION };
}
