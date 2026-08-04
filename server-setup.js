/* =========================================================================
   ARK Config Creator — local dedicated-server setup.
   The renderer owns the guided flow and generated files; privileged download,
   installation, file writes and launch stay behind the Electron preload API.
   ========================================================================= */
'use strict';

const LOCAL_SETUP_LOG_LIMIT = 180;
let localSetupBusy = false;
let localSetupLog = [];
let localSetupProgressBound = false;
let localConsoleBound = false;
let localConsoleSubscribed = false;
let localConsoleLines = [];
let localConsoleStatus = { running: false };
let localCreationDialog = null;
let localCreationPercent = 0;

function localServerSetupState() {
  if (!state.localServer || typeof state.localServer !== 'object') state.localServer = {};
  return state.localServer;
}

function hasLocalServerDesktopApi() {
  return typeof window !== 'undefined'
    && !!window.arkcc
    && typeof window.arkcc.chooseLocalServerDirectory === 'function';
}

function appendLocalSetupLog(message) {
  if (!message) return;
  localSetupLog.push(String(message));
  if (localSetupLog.length > LOCAL_SETUP_LOG_LIMIT) localSetupLog = localSetupLog.slice(-LOCAL_SETUP_LOG_LIMIT);
  const log = document.getElementById('localServerSetupLog');
  if (log) {
    log.hidden = false;
    log.textContent = localSetupLog.join('\n');
    log.scrollTop = log.scrollHeight;
  }
  const modalLog = document.getElementById('localServerCreationProgressLog');
  if (modalLog) {
    modalLog.textContent = localSetupLog.join('\n');
    modalLog.scrollTop = modalLog.scrollHeight;
  }
  updateLocalCreationProgressFromLog(String(message));
}

function setLocalCreationProgress(percent) {
  localCreationPercent = Math.max(localCreationPercent, Math.min(100, Math.round(percent)));
  const fill = document.getElementById('localServerCreationProgressFill');
  const label = document.getElementById('localServerCreationProgressPercent');
  if (fill) fill.style.width = localCreationPercent + '%';
  if (label) label.textContent = localCreationPercent + '% complete';
}

function updateLocalCreationProgressFromLog(message) {
  if (!localCreationDialog) return;
  const download = message.match(/progress:\s*([\d.]+)%?/i);
  if (download) {
    const percent = Number(download[1]);
    if (!Number.isNaN(percent)) setLocalCreationProgress(22 + percent * 0.58);
  }
  if (/Downloading SteamCMD/i.test(message)) setLocalCreationProgress(8);
  else if (/Preparing SteamCMD/i.test(message)) setLocalCreationProgress(16);
  else if (/Installing or validating/i.test(message)) setLocalCreationProgress(22);
  else if (/Dedicated-server files are ready/i.test(message)) setLocalCreationProgress(82);
  else if (/Deploying the generated configuration/i.test(message)) setLocalCreationProgress(87);
  else if (/Installing and starting the persistent/i.test(message)) setLocalCreationProgress(94);
  else if (/Local server created, configured, and running/i.test(message)) setLocalCreationProgress(100);
}

function showLocalCreationProgressModal() {
  localCreationDialog?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'dlgLocalServerCreation';
  dialog.className = 'local-creation-dialog';
  dialog.innerHTML = `
    <div class="modal-head">
      <h3>${uiIcon('rocket', 20)} Creating your local server</h3>
    </div>
    <div class="modal-body">
      <div class="local-creation-state" id="localServerCreationState" aria-live="polite">
        <span class="local-creation-spinner" aria-hidden="true"></span>
        <span>Preparing the server setup…</span>
      </div>
      <p class="opt-help">Keep this window open while ARK Config Creator installs the server, deploys your files, and starts the persistent console service.</p>
      <pre class="local-creation-log" id="localServerCreationProgressLog" aria-live="polite"></pre>
      <div class="local-creation-footer">
        <div class="local-creation-progress" aria-label="Server creation progress" aria-valuemin="0" aria-valuemax="100" role="progressbar">
          <div class="local-creation-progress-fill" id="localServerCreationProgressFill"></div>
        </div>
        <span class="local-creation-percent" id="localServerCreationProgressPercent">0% complete</span>
        <button class="btn primary" id="btnCloseLocalServerCreation" disabled>Done</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  const close = () => {
    if (localSetupBusy) return;
    dialog.close();
    dialog.remove();
    if (localCreationDialog === dialog) localCreationDialog = null;
  };
  dialog.querySelector('#btnCloseLocalServerCreation').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { if (localSetupBusy) event.preventDefault(); else close(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !localSetupBusy) close(); });
  localCreationDialog = dialog;
  localCreationPercent = 0;
  dialog.showModal();
  setLocalCreationProgress(2);
  appendLocalSetupLog('Creating local server…');
  return dialog;
}

function finishLocalCreationProgress(success, message) {
  const dialog = localCreationDialog;
  if (!dialog) return;
  const state = dialog.querySelector('#localServerCreationState');
  const button = dialog.querySelector('#btnCloseLocalServerCreation');
  if (state) {
    state.classList.toggle('failed', !success);
    state.classList.toggle('complete', success);
    state.innerHTML = `${uiIcon(success ? 'check' : 'warn', 19)}<span>${esc(message)}</span>`;
  }
  if (button) {
    button.disabled = false;
    button.textContent = success ? 'Done' : 'Close';
  }
  if (success) setLocalCreationProgress(100);
}

function bindLocalSetupProgress() {
  if (localSetupProgressBound || !hasLocalServerDesktopApi()) return;
  localSetupProgressBound = true;
  window.arkcc.onLocalServerProgress((message) => appendLocalSetupLog(message));
}

function appendLocalConsoleLine(text, stream) {
  if (!localConsoleSubscribed || !text) return;
  const prefix = stream === 'stderr' ? '[stderr] ' : '';
  const lines = String(text).replace(/\r/g, '').split('\n');
  for (const line of lines) {
    if (line) localConsoleLines.push(prefix + line);
  }
  if (localConsoleLines.length > 800) localConsoleLines = localConsoleLines.slice(-800);
  updateLocalConsoleView();
}

function updateLocalConsoleView() {
  const label = document.getElementById('localServerConsoleStatus');
  if (label) {
    label.textContent = localConsoleStatus.running
      ? 'Connected · server running'
      : 'Connected · no managed server is running';
    label.classList.toggle('running', Boolean(localConsoleStatus.running));
  }
  const output = document.getElementById('localServerConsoleOutput');
  if (output) {
    output.textContent = localConsoleLines.join('\n') || 'Waiting for new server output…';
    output.scrollTop = output.scrollHeight;
  }
  document.querySelectorAll('[data-local-console-command]').forEach((control) => { control.disabled = !localConsoleStatus.running; });
}

function bindLocalConsole() {
  if (localConsoleBound || !hasLocalServerDesktopApi() || typeof window.arkcc.onLocalServerConsole !== 'function') return;
  localConsoleBound = true;
  window.arkcc.onLocalServerConsole((message) => {
    if (!message) return;
    if (message.type === 'status') {
      localConsoleStatus = message.status || { running: false };
      updateLocalConsoleView();
    } else if (message.type === 'output') {
      appendLocalConsoleLine(message.text, message.stream);
    } else if (message.type === 'system') {
      appendLocalConsoleLine('[service] ' + message.text);
    }
  });
}

function syncLocalServerConsoleConsumer(consume) {
  if (!hasLocalServerDesktopApi() || typeof window.arkcc.subscribeLocalServerConsole !== 'function') return;
  bindLocalConsole();
  if (consume && !localConsoleSubscribed) {
    localConsoleSubscribed = true;
    window.arkcc.subscribeLocalServerConsole();
    window.arkcc.localServerConsoleStatus().then((status) => {
      if (localConsoleSubscribed) { localConsoleStatus = status || { running: false }; updateLocalConsoleView(); }
    }).catch(() => {});
  } else if (!consume && localConsoleSubscribed) {
    localConsoleSubscribed = false;
    localConsoleLines = []; // nothing is retained while the page is not consuming output
    window.arkcc.unsubscribeLocalServerConsole();
  }
}

function rememberLocalServer(status) {
  const local = localServerSetupState();
  local.installDir = status.installDir;
  local.status = status;
  local.checkedAt = Date.now();
  state.launch = state.launch || {};
  // Keep Launch Options and the generated StartServer.bat correct without
  // asking the user to copy a long executable path by hand.
  state.launch.serverPath = status.serverExe;
  saveState();
}

function setupCard(title, key, help) {
  const card = document.createElement('section');
  card.className = 'opt-card local-setup-card';
  card.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">${title}</div>
      ${key ? `<code class="opt-key">${key}</code>` : ''}
    </div></div>
    ${help ? `<p class="opt-help">${help}</p>` : ''}`;
  return card;
}

function setupButton(parent, html, className, action) {
  const button = document.createElement('button');
  button.className = 'btn' + (className ? ' ' + className : '');
  button.innerHTML = html;
  button.addEventListener('click', action);
  parent.appendChild(button);
  return button;
}

async function refreshLocalServer(statusLine) {
  const local = localServerSetupState();
  if (!local.installDir) return null;
  try {
    const status = await window.arkcc.inspectLocalServer(local.installDir);
    rememberLocalServer(status);
    if (statusLine) statusLine.textContent = status.installed
      ? 'Dedicated server found and ready to configure.'
      : 'This folder is selected. Install the dedicated-server files here next.';
    return status;
  } catch (error) {
    if (statusLine) statusLine.textContent = 'Could not read this folder: ' + error.message;
    return null;
  }
}

function renderLocalServerSetup(grid) {
  const desktop = hasLocalServerDesktopApi();
  const local = localServerSetupState();
  if (desktop) bindLocalSetupProgress();

  const intro = document.createElement('section');
  intro.className = 'opt-card wide local-setup-intro';
  intro.innerHTML = `
    <div class="local-setup-intro-icon">${uiIcon('server', 29)}</div>
    <div>
      <div class="opt-name">Run an ARK: Survival Ascended server on this PC</div>
      <p class="opt-help">Choose a dedicated folder, then create the server in one action. The app downloads SteamCMD from Valve, installs the official ASA dedicated-server build, deploys your current configuration, and starts the persistent console service.</p>
    </div>`;
  grid.appendChild(intro);

  if (!desktop) {
    const unavailable = setupCard('Use the desktop app for local setup', 'desktop app required',
      'The browser version can create configuration files, but it cannot download software, write to a server folder, or start a local process. Open ARK Config Creator’s installed desktop app to use this guided setup.');
    unavailable.classList.add('wide');
    grid.appendChild(unavailable);
    return;
  }

  const folder = setupCard('1. Choose the server folder', 'where the dedicated-server files will live',
    'Choose an empty folder or an existing ASA dedicated-server folder. The app never installs directly into the root of a drive.');
  const selectedPath = document.createElement('code');
  selectedPath.className = 'local-setup-path';
  selectedPath.textContent = local.installDir || 'No folder selected yet';
  folder.appendChild(selectedPath);
  const folderStatus = document.createElement('p');
  folderStatus.className = 'local-setup-status';
  const savedStatus = local.status || {};
  folderStatus.textContent = !local.installDir
    ? 'Pick a folder to begin.'
    : savedStatus.installed
      ? 'Dedicated server found and ready to configure.'
      : 'Folder selected — the dedicated server is not installed there yet.';
  folder.appendChild(folderStatus);
  const folderActions = document.createElement('div');
  folderActions.className = 'local-setup-actions';
  folder.appendChild(folderActions);
  setupButton(folderActions, uiIcon('folder', 15) + ' Choose folder', 'primary', async () => {
    try {
      const result = await window.arkcc.chooseLocalServerDirectory();
      if (result.canceled) return;
      rememberLocalServer(result);
      render();
    } catch (error) { folderStatus.textContent = 'Could not choose folder: ' + error.message; }
  });
  if (local.installDir) {
    setupButton(folderActions, uiIcon('reset', 14) + ' Refresh', '', async function () {
      this.disabled = true;
      await refreshLocalServer(folderStatus);
      this.disabled = false;
      render();
    });
    setupButton(folderActions, uiIcon('external', 14) + ' Open folder', '', async () => {
      try { await window.arkcc.openLocalServerFolder(local.installDir); }
      catch (error) { toast('Could not open the folder: ' + error.message); }
    });
  }
  grid.appendChild(folder);

  const create = document.createElement('section');
  create.className = 'opt-card wide local-setup-create';
  create.innerHTML = `
    <div class="local-setup-intro-icon">${uiIcon('rocket', 26)}</div>
    <div class="local-setup-create-copy">
      <div class="opt-name">Create this local server</div>
      <p class="opt-help">One action installs or validates the dedicated server, deploys <code>GameUserSettings.ini</code>, <code>Game.ini</code> and <code>StartServer.bat</code>, then installs and starts the persistent console service. No manual service setup is needed.</p>
    </div>`;
  const createActions = document.createElement('div');
  createActions.className = 'local-setup-actions';
  const createButton = setupButton(createActions, uiIcon('rocket', 16) + ' Create & launch local server', 'primary', async () => {
    if (!local.installDir || localSetupBusy) return;
    if (!confirm(`Create and launch a complete ARK: Survival Ascended server in:\n\n${local.installDir}\n\nThis will install or update the server, deploy your current settings, and start its persistent console service. Continue?`)) return;
    localSetupBusy = true;
    localSetupLog = [];
    localConsoleLines = [];
    showLocalCreationProgressModal();
    createButton.disabled = true;
    try {
      const result = await window.arkcc.createLocalServer({
        installDir: local.installDir,
        files: {
          gameUserSettings: buildIniFile('gus', false),
          gameIni: buildIniFile('game', false),
          startScript: buildBat(),
        },
        launch: buildManagedLaunchSpec(),
      });
      rememberLocalServer(result.status);
      localConsoleStatus = result.service || { running: false };
      appendLocalSetupLog('Complete — the service is running and the live console is connected.');
      finishLocalCreationProgress(true, 'Local server created and running.');
      toast('Local server created, configured, and launched.');
      render();
    } catch (error) {
      appendLocalSetupLog('Creation failed: ' + error.message);
      finishLocalCreationProgress(false, 'Local server creation did not finish. Review the log below.');
      toast('Local server creation did not finish — see the log below.');
    } finally {
      localSetupBusy = false;
      createButton.disabled = false;
    }
  });
  createButton.disabled = !local.installDir || localSetupBusy;
  create.appendChild(createActions);
  grid.appendChild(create);

  const install = setupCard('Install or update the dedicated server', 'Steam app 2430930',
    'Use this individual maintenance action when you only need to update or validate server files. First-time setup is handled by “Create & launch local server” above.');
  const installNote = document.createElement('p');
  installNote.className = 'opt-note';
  installNote.textContent = local.installDir
    ? (savedStatus.installed ? 'Server files detected — this will check for updates and validate them.' : 'Ready to download the dedicated-server files into the selected folder.')
    : 'Choose a server folder first.';
  install.appendChild(installNote);
  const installActions = document.createElement('div');
  installActions.className = 'local-setup-actions';
  install.appendChild(installActions);
  const installButton = setupButton(installActions,
    uiIcon('download', 15) + (savedStatus.installed ? ' Update & validate server' : ' Download & install server'),
    'primary', async () => {
      if (!local.installDir || localSetupBusy) return;
      const verb = savedStatus.installed ? 'update and validate' : 'download and install';
      if (!confirm(`This will ${verb} the ARK: Survival Ascended dedicated server in:\n\n${local.installDir}\n\nSteamCMD is downloaded from Valve if needed. Continue?`)) return;
      localSetupBusy = true;
      localSetupLog = [];
      appendLocalSetupLog('Starting local server setup…');
      installButton.disabled = true;
      try {
        const status = await window.arkcc.installLocalServer(local.installDir);
        rememberLocalServer(status);
        appendLocalSetupLog('Ready — configure the files in step 3.');
        toast('Dedicated server installed and ready.');
        render();
      } catch (error) {
        appendLocalSetupLog('Failed: ' + error.message);
        toast('Server setup did not finish — see the log below.');
      } finally {
        localSetupBusy = false;
        installButton.disabled = false;
      }
    });
  installButton.disabled = !local.installDir || localSetupBusy;
  grid.appendChild(install);

  const configure = setupCard('Deploy config or start script separately', 'GameUserSettings.ini · Game.ini · StartServer.bat',
    'These individual maintenance actions are optional after first-time creation. Any existing copy of each generated file is first saved with a .bak extension.');
  const configStatus = document.createElement('p');
  configStatus.className = 'local-setup-status';
  configStatus.textContent = savedStatus.installed
    ? 'Ready to write your current configuration.'
    : 'Install or select an existing dedicated server first.';
  configure.appendChild(configStatus);
  const configActions = document.createElement('div');
  configActions.className = 'local-setup-actions';
  configure.appendChild(configActions);
  const writeButton = setupButton(configActions, uiIcon('save', 15) + ' Write files to local server', 'primary', async () => {
    if (!local.installDir || !savedStatus.installed || localSetupBusy) return;
    if (!confirm('Write the current settings and StartServer.bat to this local server? Existing copies are backed up as .bak first.')) return;
    localSetupBusy = true;
    writeButton.disabled = true;
    try {
      // refresh first so an old saved status cannot accidentally write to a
      // folder whose executable was deleted or moved between app launches.
      const current = await window.arkcc.inspectLocalServer(local.installDir);
      if (!current.installed) throw new Error('ArkAscendedServer.exe is no longer in this folder. Install or select the server again.');
      rememberLocalServer(current);
      await window.arkcc.writeLocalServerFiles({
        installDir: local.installDir,
        files: {
          gameUserSettings: buildIniFile('gus', false),
          gameIni: buildIniFile('game', false),
          startScript: buildBat(),
        },
      });
      configStatus.textContent = 'Config files and StartServer.bat written. Existing files were backed up when present.';
      toast('Local server files written.');
      render();
    } catch (error) {
      configStatus.textContent = 'Could not write the files: ' + error.message;
    } finally {
      localSetupBusy = false;
      writeButton.disabled = false;
    }
  });
  writeButton.disabled = !local.installDir || !savedStatus.installed || localSetupBusy;
  const launchButton = setupButton(configActions, uiIcon('rocket', 15) + ' Start in managed console', '', async () => {
    if (!local.installDir || !savedStatus.installed || localSetupBusy) return;
    if (!confirm('Start the local ARK server under the persistent console service? It will keep running when this app closes, and you can reconnect here later.')) return;
    try {
      localConsoleLines = [];
      localConsoleStatus = await window.arkcc.startManagedLocalServer({
        installDir: local.installDir,
        launch: buildManagedLaunchSpec(),
      });
      updateLocalConsoleView();
      toast('The local server is running under the console service.');
    } catch (error) { configStatus.textContent = 'Could not start the server: ' + error.message; }
  });
  launchButton.disabled = !local.installDir || !savedStatus.installed || localSetupBusy;
  grid.appendChild(configure);

  const consoleCard = document.createElement('section');
  consoleCard.className = 'opt-card wide local-console-card';
  consoleCard.innerHTML = `
    <div class="opt-head"><div>
      <div class="opt-name">Live server console <span id="localServerConsoleStatus" class="local-console-status">Connecting…</span></div>
      <code class="opt-key">new output only · nothing is retained while this page is closed</code>
    </div></div>
    <p class="opt-help">This connects to the persistent local server service. Close and reopen ARK Config Creator at any time: if the server is still running, this console reconnects and shows output from that point onward.</p>`;
  const consoleOutput = document.createElement('pre');
  consoleOutput.id = 'localServerConsoleOutput';
  consoleOutput.className = 'local-server-console';
  consoleOutput.textContent = localConsoleLines.join('\n') || 'Waiting for new server output…';
  consoleCard.appendChild(consoleOutput);
  const consoleForm = document.createElement('form');
  consoleForm.className = 'local-console-input';
  const consoleInput = document.createElement('input');
  consoleInput.type = 'text';
  consoleInput.placeholder = 'Send one server-console command…';
  consoleInput.autocomplete = 'off';
  consoleInput.dataset.localConsoleCommand = 'true';
  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.className = 'btn small primary';
  sendButton.dataset.localConsoleCommand = 'true';
  sendButton.innerHTML = uiIcon('upload', 14) + ' Send';
  consoleForm.append(consoleInput, sendButton);
  consoleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const command = consoleInput.value.trim();
    if (!command) return;
    try {
      await window.arkcc.sendLocalServerConsole(command);
      appendLocalConsoleLine('> ' + command);
      consoleInput.value = '';
    } catch (error) { appendLocalConsoleLine('[service] Could not send command: ' + error.message); }
  });
  consoleCard.appendChild(consoleForm);
  const clearConsole = document.createElement('button');
  clearConsole.className = 'btn small';
  clearConsole.innerHTML = uiIcon('x', 14) + ' Clear this view';
  clearConsole.addEventListener('click', () => { localConsoleLines = []; updateLocalConsoleView(); });
  consoleCard.appendChild(clearConsole);
  grid.appendChild(consoleCard);

  const advice = document.createElement('section');
  advice.className = 'opt-card wide local-setup-advice';
  const portOption = optByKey.get('port');
  const gamePort = portOption ? getVal(portOption) : 7777;
  advice.innerHTML = `
    <div class="opt-head"><div><div class="opt-name">Before players join</div><code class="opt-key">local network · firewall · router</code></div></div>
    <p class="opt-help">For people outside your home network, allow the game port (<b>${esc(gamePort)}</b>) and the next UDP port through Windows Firewall and forward them in your router. Keep your admin password private. The <b>Server Basics</b> and <b>Launch Options</b> pages are where you change those settings.</p>`;
  grid.appendChild(advice);

  const remote = document.createElement('section');
  remote.className = 'opt-card wide local-setup-remote';
  remote.innerHTML = `
    <div class="opt-head"><div><div class="opt-name">Remote-server setup is next</div><code class="opt-key">local installation is the first release of this workflow</code></div></div>
    <p class="opt-help">The existing <b>Deploy</b> page already reads and writes config on Nitrado and Pterodactyl/WISP connections. Provisioning a brand-new remote machine will be added separately, because it needs provider-specific access and safeguards.</p>`;
  const remoteButton = document.createElement('button');
  remoteButton.className = 'btn small';
  remoteButton.innerHTML = uiIcon('upload', 14) + ' Open Deploy';
  remoteButton.addEventListener('click', () => { currentCat = 'deploy'; render(); });
  remote.appendChild(remoteButton);
  grid.appendChild(remote);

  const log = document.createElement('pre');
  log.id = 'localServerSetupLog';
  log.className = 'local-setup-log';
  log.hidden = !localSetupLog.length;
  log.textContent = localSetupLog.join('\n');
  grid.appendChild(log);

  // Subscribe only after the console element exists. Leaving this page calls
  // syncLocalServerConsoleConsumer(false) from app.js and releases the pipe.
  syncLocalServerConsoleConsumer(true);
  updateLocalConsoleView();

  // A persisted folder might have changed since the last session. Check it
  // once after rendering, without blocking the page or changing its layout.
  if (local.installDir && !localSetupBusy && (!local.checkedAt || Date.now() - local.checkedAt > 60000)) {
    refreshLocalServer(null).then(() => { if (currentCat === 'setup') render(); });
  }
}
