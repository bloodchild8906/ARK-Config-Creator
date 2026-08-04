/* =========================================================================
   ARK Config Creator — local dedicated-server setup.
   The renderer owns the guided flow and generated files; privileged download,
   installation, file writes and launch stay behind the Electron preload API.

   ── Error-surfacing rule ────────────────────────────────────────────────────
   Failures used to land in whichever of three places the author happened to
   pick — an inline <p>, a toast(), or the log <pre> — so the same class of
   problem was reported differently depending on which button produced it.
   One rule now applies to everything in this file:

     • Inline status line  — a control that fails immediately (choose folder,
       start/stop the managed server, send a console command). The message
       belongs next to the control the user just pressed.
     • Setup log pane      — anything from a long-running operation (create,
       install/update, write files). That is where the operation's progress
       already goes, so its outcome belongs there too, and it survives the
       re-render that follows.
     • toast()             — success confirmations only. A toast disappears on
       its own, which makes it the wrong home for something the user may need
       to read twice.
   ========================================================================= */
'use strict';

let localSetupBusy = false;
let localSetupProgressBound = false;
let localConsoleBound = false;
let localConsoleSubscribed = false;
let localConsoleStatus = { running: false };
let localCreationDialog = null;
let localCreationPercent = 0;

/** Last inspect failure for the selected folder. Kept in memory rather than in
    `state.localServer` so the persisted shape is unchanged, and so a stale
    error never survives an app restart. */
let localFolderError = '';

/** Signature of the folder state the page was last painted from. The
    background re-check compares against it so it can re-render on a real
    change and stay silent otherwise. */
let localServerCheckSignature = null;

/* Both panes are capped, append-only views. `paintInto` writes the buffer into
   every element id that is currently in the DOM, so the setup log lands in the
   page pane and the creation modal without either side knowing about the
   other. */
const localSetupLog = createLogBuffer({ limit: APP_LIMITS.SETUP_LOG_LINES });
const localConsoleLines = createLogBuffer({ limit: APP_LIMITS.CONSOLE_LOG_LINES });

function localServerSetupState() {
  if (!state.localServer || typeof state.localServer !== 'object') state.localServer = {};
  return state.localServer;
}

function hasLocalServerDesktopApi() {
  return typeof window !== 'undefined'
    && !!window.arkcc
    && typeof window.arkcc.chooseLocalServerDirectory === 'function';
}

/* The Stop control only exists in newer preload builds. Feature-detect it so an
   older bridge simply renders without the button instead of throwing. */
function hasManagedStopApi() {
  return hasLocalServerDesktopApi() && typeof window.arkcc.stopManagedLocalServer === 'function';
}

/* ---------------------------------------------------------------------------
   Setup log + creation progress
   --------------------------------------------------------------------------- */

function appendLocalSetupLog(message) {
  if (!message) return;
  localSetupLog.push(message);
  localSetupLog.paintInto('localServerSetupLog', 'localServerCreationProgressLog');
}

function setLocalCreationProgress(percent) {
  localCreationPercent = Math.max(localCreationPercent, Math.min(100, Math.round(percent)));
  const fill = document.getElementById('localServerCreationProgressFill');
  const label = document.getElementById('localServerCreationProgressPercent');
  if (fill) fill.style.width = localCreationPercent + '%';
  if (label) label.textContent = localCreationPercent + '% complete';
}

/**
 * Applies one structured progress update from the main process:
 * `{ phase: string|null, text: string, percent: number|null }`.
 *
 * The previous implementation regex-matched the prose of each log line, so
 * rewording a message silently broke the bar. The phase name is now the
 * contract and `SETUP_PHASE_PERCENT` is the only mapping.
 */
function handleLocalServerProgress(message) {
  // Be forgiving about the payload: an older main process (or a replayed
  // message) may still send a bare string, which carries no progress data.
  const update = (message && typeof message === 'object')
    ? message
    : { phase: null, text: message, percent: null };

  appendLocalSetupLog(update.text);

  // Only the creation modal has a bar; without it there is nothing to move.
  if (!localCreationDialog) return;

  const phasePercent = update.phase ? SETUP_PHASE_PERCENT[update.phase] : undefined;
  if (typeof phasePercent === 'number') setLocalCreationProgress(phasePercent);

  // SteamCMD reports its own 0-100% download progress, which is interpolated
  // across the span of the bar reserved for the install step.
  if (typeof update.percent === 'number' && Number.isFinite(update.percent)) {
    const { FROM, TO } = STEAMCMD_PROGRESS_SPAN;
    setLocalCreationProgress(FROM + update.percent * (TO - FROM) / 100);
  }
}

function bindLocalSetupProgress() {
  if (localSetupProgressBound || !hasLocalServerDesktopApi()) return;
  localSetupProgressBound = true;
  window.arkcc.onLocalServerProgress(handleLocalServerProgress);
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
  setLocalCreationProgress(SETUP_PHASE_PERCENT[SETUP_PHASES.START]);
  appendLocalSetupLog('Creating local server…');
  return dialog;
}

function finishLocalCreationProgress(success, message) {
  const dialog = localCreationDialog;
  if (!dialog) return;
  // Deliberately not named `state`: that is the global application state, and
  // shadowing it here made every reference inside this function ambiguous.
  const stateLine = dialog.querySelector('#localServerCreationState');
  const button = dialog.querySelector('#btnCloseLocalServerCreation');
  if (stateLine) {
    stateLine.classList.toggle('failed', !success);
    stateLine.classList.toggle('complete', success);
    stateLine.innerHTML = `${uiIcon(success ? 'check' : 'warn', 19)}<span>${esc(message)}</span>`;
  }
  if (button) {
    button.disabled = false;
    button.textContent = success ? 'Done' : 'Close';
  }
  if (success) setLocalCreationProgress(SETUP_PHASE_PERCENT[SETUP_PHASES.DONE]);
}

/* ---------------------------------------------------------------------------
   Live console
   --------------------------------------------------------------------------- */

function appendLocalConsoleLine(text, stream) {
  if (!localConsoleSubscribed || !text) return;
  const prefix = stream === 'stderr' ? '[stderr] ' : '';
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    if (line) localConsoleLines.push(prefix + line);
  }
  updateLocalConsoleView();
}

function updateLocalConsoleView() {
  const running = Boolean(localConsoleStatus.running);
  const label = document.getElementById('localServerConsoleStatus');
  if (label) {
    label.textContent = running
      ? 'Connected · server running'
      : 'Connected · no managed server is running';
    label.classList.toggle('running', running);
  }
  const output = document.getElementById('localServerConsoleOutput');
  if (output) {
    output.textContent = localConsoleLines.text() || 'Waiting for new server output…';
    output.scrollTop = output.scrollHeight;
  }
  document.querySelectorAll('[data-local-console-command]').forEach((control) => { control.disabled = !running; });
  // `.btn` sets its own display, so the [hidden] attribute alone would not
  // hide the Stop control.
  document.querySelectorAll('[data-local-console-stop]').forEach((control) => {
    control.hidden = !running;
    control.style.display = running ? '' : 'none';
  });
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
    localConsoleLines.clear(); // nothing is retained while the page is not consuming output
    window.arkcc.unsubscribeLocalServerConsole();
  }
}

/** Pulls the managed-server status once, e.g. straight after a stop request. */
async function refreshLocalConsoleStatus() {
  if (!hasLocalServerDesktopApi() || typeof window.arkcc.localServerConsoleStatus !== 'function') return;
  try {
    localConsoleStatus = (await window.arkcc.localServerConsoleStatus()) || { running: false };
  } catch (error) {
    // A status read that fails tells us nothing useful about the server; the
    // service's own event stream is the authority and will correct this.
    localConsoleStatus = { running: false };
  }
  updateLocalConsoleView();
}

/**
 * Clears everything this page holds about the signed-in user's local server.
 *
 * Account switching happens in place, so without this user B inherited user
 * A's console output, setup log and progress state. Called by the logout path
 * in another file — never from here.
 */
function resetLocalServerUiState() {
  syncLocalServerConsoleConsumer(false);
  localSetupLog.clear();
  localConsoleLines.clear();
  localConsoleStatus = { running: false };
  localCreationPercent = 0;
  localFolderError = '';
  localServerCheckSignature = null;
}

/* ---------------------------------------------------------------------------
   Folder state
   --------------------------------------------------------------------------- */

function rememberLocalServer(status) {
  const local = localServerSetupState();
  local.installDir = status.installDir;
  local.status = status;
  local.checkedAt = Date.now();
  localFolderError = '';
  localServerCheckSignature = localStatusSignature(status);
  state.launch = state.launch || {};
  // Keep Launch Options and the generated StartServer.bat correct without
  // asking the user to copy a long executable path by hand.
  state.launch.serverPath = status.serverExe;
  saveState();
}

/** Everything the setup page paints from, reduced to a comparable string. */
function localStatusSignature(status) {
  if (!status || typeof status !== 'object') return 'none';
  return [status.installed ? 'installed' : 'empty', status.installDir || '', status.serverExe || ''].join('|');
}

/**
 * Re-inspects the selected folder and returns the resulting signature.
 *
 * The failure path records `checkedAt` too. It previously did not, while the
 * caller re-checked "if checkedAt is missing or older than a minute" and then
 * re-rendered — so a folder that could not be inspected at all (deleted drive,
 * permission error) spun the page in a tight render/IPC loop.
 */
async function refreshLocalServer() {
  const local = localServerSetupState();
  if (!local.installDir) {
    localServerCheckSignature = 'no-folder';
    return localServerCheckSignature;
  }
  try {
    const status = await window.arkcc.inspectLocalServer(local.installDir);
    rememberLocalServer(status); // sets the signature from the fresh status
    return localServerCheckSignature;
  } catch (error) {
    localFolderError = error.message;
    local.checkedAt = Date.now();
    saveState();
    localServerCheckSignature = 'error:' + error.message;
    return localServerCheckSignature;
  }
}

/**
 * A persisted folder might have changed since the last session, so it is
 * re-checked in the background after rendering. Re-rendering only on a real
 * change is what keeps this from becoming a loop.
 */
function maybeRecheckLocalServerFolder(local) {
  if (!local.installDir || localSetupBusy) return;
  const age = local.checkedAt ? Date.now() - local.checkedAt : Infinity;
  if (age <= APP_TIMEOUTS.LOCAL_SERVER_RECHECK_MS) return;

  if (localServerCheckSignature === null) localServerCheckSignature = localStatusSignature(local.status);
  const before = localServerCheckSignature;
  // Claim the attempt before awaiting, so a second render in the same tick
  // cannot start a duplicate inspection.
  local.checkedAt = Date.now();

  refreshLocalServer().then((signature) => {
    if (signature !== before && currentCat === 'setup') render();
  });
}

/* ---------------------------------------------------------------------------
   Shared pieces of the three long-running flows
   --------------------------------------------------------------------------- */

/** The generated files, in the shape both write paths send over IPC. */
function localServerFilePayload() {
  return {
    gameUserSettings: buildIniFile('gus', false),
    gameIni: buildIniFile('game', false),
    startScript: buildBat(),
  };
}

/**
 * Runs one of the three long-running setup flows (create / install-update /
 * write-files).
 *
 * All three shared the same skeleton — confirm, take the busy lock, disable the
 * control, call one privileged IPC method, log the outcome, re-render — as
 * three hand-copied variants that had already drifted apart: one cleared the
 * log and the others did not, and all three re-rendered while still marked
 * busy, which painted every setup control disabled until the user navigated
 * away and back.
 *
 * @param {HTMLButtonElement} button   the control that started the flow
 * @param {{
 *   confirm?: string,
 *   clearLog?: boolean,
 *   startMessage?: string,
 *   run: () => Promise<unknown>,
 *   onSuccess?: (result: unknown) => void,
 *   successMessage?: string,
 *   successToast?: string,
 *   failurePrefix?: string,
 *   onError?: (error: Error) => void
 * }} options
 * @returns {Promise<boolean>} whether the operation completed
 */
async function runLocalSetupAction(button, options) {
  if (localSetupBusy) return false;
  if (options.confirm && !confirm(options.confirm)) return false;

  localSetupBusy = true;
  if (options.clearLog) localSetupLog.clear();
  if (options.startMessage) appendLocalSetupLog(options.startMessage);

  let succeeded = false;
  try {
    const result = await withBusyButton(button, () => options.run());
    succeeded = true;
    options.onSuccess?.(result);
    if (options.successMessage) appendLocalSetupLog(options.successMessage);
    if (options.successToast) toast(options.successToast);
  } catch (error) {
    // Long-running operation: the log pane is where its progress already went.
    appendLocalSetupLog((options.failurePrefix || 'Failed') + ': ' + error.message);
    options.onError?.(error);
  } finally {
    // Release the lock before re-rendering, or every control comes back
    // disabled and stays that way until the next unrelated render.
    localSetupBusy = false;
  }
  render();
  return succeeded;
}

/* ---------------------------------------------------------------------------
   Cards
   --------------------------------------------------------------------------- */

function setupCard(title, key, help) {
  return uiElement('section', {
    className: 'opt-card local-setup-card',
    html: `
    <div class="opt-head"><div>
      <div class="opt-name">${title}</div>
      ${key ? `<code class="opt-key">${key}</code>` : ''}
    </div></div>
    ${help ? `<p class="opt-help">${help}</p>` : ''}`,
  });
}

function renderLocalSetupIntroCard(grid) {
  uiElement('section', {
    className: 'opt-card wide local-setup-intro',
    parent: grid,
    html: `
    <div class="local-setup-intro-icon">${uiIcon('server', 29)}</div>
    <div>
      <div class="opt-name">Run an ARK: Survival Ascended server on this PC</div>
      <p class="opt-help">Choose a dedicated folder, then create the server in one action. The app downloads SteamCMD from Valve, installs the official ASA dedicated-server build, deploys your current configuration, and starts the persistent console service.</p>
    </div>`,
  });
}

/** Shown instead of the whole flow when running in a plain browser. */
function renderLocalSetupUnavailableCard(grid) {
  const unavailable = setupCard('Use the desktop app for local setup', 'desktop app required',
    'The browser version can create configuration files, but it cannot download software, write to a server folder, or start a local process. Open ARK Config Creator’s installed desktop app to use this guided setup.');
  unavailable.classList.add('wide');
  grid.appendChild(unavailable);
}

function renderLocalFolderCard(grid, local) {
  const savedStatus = local.status || {};
  const card = setupCard('1. Choose the server folder', 'where the dedicated-server files will live',
    'Choose an empty folder or an existing ASA dedicated-server folder. The app never installs directly into the root of a drive.');

  uiElement('code', {
    className: 'local-setup-path',
    text: local.installDir || 'No folder selected yet',
    parent: card,
  });

  const folderStatus = uiElement('p', { className: 'local-setup-status', parent: card });
  folderStatus.textContent = localFolderError
    ? 'Could not read this folder: ' + localFolderError
    : !local.installDir
      ? 'Pick a folder to begin.'
      : savedStatus.installed
        ? 'Dedicated server found and ready to configure.'
        : 'Folder selected — the dedicated server is not installed there yet.';

  const actions = uiElement('div', { className: 'local-setup-actions', parent: card });

  uiButton(actions, {
    variant: 'primary',
    html: uiIcon('folder', 15) + ' Choose folder',
    onClick: async () => {
      try {
        const result = await window.arkcc.chooseLocalServerDirectory();
        if (result.canceled) return;
        rememberLocalServer(result);
        render();
      } catch (error) {
        // Immediate control failure: report next to the control itself.
        folderStatus.textContent = 'Could not choose folder: ' + error.message;
      }
    },
  });

  if (local.installDir) {
    const refresh = uiButton(actions, {
      html: uiIcon('reset', 14) + ' Refresh',
      onClick: () => withBusyButton(refresh, async () => {
        await refreshLocalServer();
        render(); // user-initiated, so always repaint — including the error state
      }),
    });

    uiButton(actions, {
      html: uiIcon('external', 14) + ' Open folder',
      onClick: async () => {
        try { await window.arkcc.openLocalServerFolder(local.installDir); }
        catch (error) { folderStatus.textContent = 'Could not open the folder: ' + error.message; }
      },
    });
  }

  grid.appendChild(card);
}

function renderLocalCreateCard(grid, local) {
  const files = ASA_SERVER.FILES;
  const card = uiElement('section', {
    className: 'opt-card wide local-setup-create',
    html: `
    <div class="local-setup-intro-icon">${uiIcon('rocket', 26)}</div>
    <div class="local-setup-create-copy">
      <div class="opt-name">Create this local server</div>
      <p class="opt-help">One action installs or validates the dedicated server, deploys <code>${esc(files.GAME_USER_SETTINGS)}</code>, <code>${esc(files.GAME)}</code> and <code>${esc(files.START_SCRIPT)}</code>, then installs and starts the persistent console service. No manual service setup is needed.</p>
    </div>`,
  });

  const actions = uiElement('div', { className: 'local-setup-actions', parent: card });
  const createButton = uiButton(actions, {
    variant: 'primary',
    html: uiIcon('rocket', 16) + ' Create & launch local server',
    disabled: !local.installDir || localSetupBusy,
    onClick: () => {
      if (!local.installDir) return;
      return runLocalSetupAction(createButton, {
        confirm: `Create and launch a complete ARK: Survival Ascended server in:\n\n${local.installDir}\n\nThis will install or update the server, deploy your current settings, and start its persistent console service. Continue?`,
        clearLog: true,
        run: () => {
          // The console view is per-run: old output would be misleading next
          // to a server that has just been reinstalled.
          localConsoleLines.clear();
          showLocalCreationProgressModal();
          return window.arkcc.createLocalServer({
            installDir: local.installDir,
            files: localServerFilePayload(),
            launch: buildManagedLaunchSpec(),
          });
        },
        onSuccess: (result) => {
          rememberLocalServer(result.status);
          localConsoleStatus = result.service || { running: false };
          finishLocalCreationProgress(true, 'Local server created and running.');
        },
        successMessage: 'Complete — the service is running and the live console is connected.',
        successToast: 'Local server created, configured, and launched.',
        failurePrefix: 'Creation failed',
        onError: () => finishLocalCreationProgress(false, 'Local server creation did not finish. Review the log below.'),
      });
    },
  });

  grid.appendChild(card);
}

/** The two optional post-creation maintenance cards. */
function renderLocalMaintenanceCards(grid, local) {
  renderLocalInstallCard(grid, local);
  renderLocalDeployCard(grid, local);
}

function renderLocalInstallCard(grid, local) {
  const savedStatus = local.status || {};
  const card = setupCard('Install or update the dedicated server', `Steam app ${esc(ASA_SERVER.DEDICATED_APP_ID)}`,
    'Use this individual maintenance action when you only need to update or validate server files. First-time setup is handled by “Create & launch local server” above.');

  uiElement('p', {
    className: 'opt-note',
    parent: card,
    text: local.installDir
      ? (savedStatus.installed ? 'Server files detected — this will check for updates and validate them.' : 'Ready to download the dedicated-server files into the selected folder.')
      : 'Choose a server folder first.',
  });

  const actions = uiElement('div', { className: 'local-setup-actions', parent: card });
  const installButton = uiButton(actions, {
    variant: 'primary',
    html: uiIcon('download', 15) + (savedStatus.installed ? ' Update & validate server' : ' Download & install server'),
    disabled: !local.installDir || localSetupBusy,
    onClick: () => {
      if (!local.installDir) return;
      const verb = savedStatus.installed ? 'update and validate' : 'download and install';
      return runLocalSetupAction(installButton, {
        confirm: `This will ${verb} the ARK: Survival Ascended dedicated server in:\n\n${local.installDir}\n\nSteamCMD is downloaded from Valve if needed. Continue?`,
        clearLog: true,
        startMessage: 'Starting local server setup…',
        run: () => window.arkcc.installLocalServer(local.installDir),
        onSuccess: (status) => rememberLocalServer(status),
        successMessage: 'Ready — configure the files in step 3.',
        successToast: 'Dedicated server installed and ready.',
      });
    },
  });

  grid.appendChild(card);
}

function renderLocalDeployCard(grid, local) {
  const files = ASA_SERVER.FILES;
  const savedStatus = local.status || {};
  const ready = Boolean(local.installDir) && Boolean(savedStatus.installed);

  const card = setupCard('Deploy config or start script separately',
    [files.GAME_USER_SETTINGS, files.GAME, files.START_SCRIPT].map(esc).join(' · '),
    `These individual maintenance actions are optional after first-time creation. Any existing copy of each generated file is first saved with a ${esc(ASA_SERVER.BACKUP_SUFFIX)} extension.`);

  const configStatus = uiElement('p', {
    className: 'local-setup-status',
    parent: card,
    text: savedStatus.installed
      ? 'Ready to write your current configuration.'
      : 'Install or select an existing dedicated server first.',
  });

  const actions = uiElement('div', { className: 'local-setup-actions', parent: card });

  const writeButton = uiButton(actions, {
    variant: 'primary',
    html: uiIcon('save', 15) + ' Write files to local server',
    disabled: !ready || localSetupBusy,
    onClick: () => {
      if (!ready) return;
      return runLocalSetupAction(writeButton, {
        confirm: `Write the current settings and ${files.START_SCRIPT} to this local server? Existing copies are backed up as ${ASA_SERVER.BACKUP_SUFFIX} first.`,
        run: async () => {
          // Refresh first so an old saved status cannot accidentally write to a
          // folder whose executable was deleted or moved between app launches.
          const exeName = ASA_SERVER.EXE_PARTS[ASA_SERVER.EXE_PARTS.length - 1];
          const current = await window.arkcc.inspectLocalServer(local.installDir);
          if (!current.installed) throw new Error(`${exeName} is no longer in this folder. Install or select the server again.`);
          rememberLocalServer(current);
          await window.arkcc.writeLocalServerFiles({
            installDir: local.installDir,
            files: localServerFilePayload(),
          });
        },
        successMessage: `Config files and ${files.START_SCRIPT} written. Existing files were backed up when present.`,
        successToast: 'Local server files written.',
        failurePrefix: 'Could not write the files',
      });
    },
  });

  const launchButton = uiButton(actions, {
    html: uiIcon('rocket', 15) + ' Start in managed console',
    disabled: !ready || localSetupBusy,
    onClick: () => withBusyButton(launchButton, async () => {
      if (!ready || localSetupBusy) return;
      if (!confirm('Start the local ARK server under the persistent console service? It will keep running when this app closes, and you can reconnect here later.')) return;
      try {
        localConsoleLines.clear();
        localConsoleStatus = await window.arkcc.startManagedLocalServer({
          installDir: local.installDir,
          launch: buildManagedLaunchSpec(),
        });
        updateLocalConsoleView();
        toast('The local server is running under the console service.');
      } catch (error) {
        configStatus.textContent = 'Could not start the server: ' + error.message;
      }
    }),
  });

  grid.appendChild(card);
}

function renderLocalConsoleCard(grid) {
  const card = uiElement('section', {
    className: 'opt-card wide local-console-card',
    html: `
    <div class="opt-head"><div>
      <div class="opt-name">Live server console <span id="localServerConsoleStatus" class="local-console-status">Connecting…</span></div>
      <code class="opt-key">new output only · nothing is retained while this page is closed</code>
    </div></div>
    <p class="opt-help">This connects to the persistent local server service. Close and reopen ARK Config Creator at any time: if the server is still running, this console reconnects and shows output from that point onward.</p>`,
  });

  uiElement('pre', {
    className: 'local-server-console',
    text: localConsoleLines.text() || 'Waiting for new server output…',
    parent: card,
    attrs: { id: 'localServerConsoleOutput' },
  });

  const form = uiElement('form', { className: 'local-console-input', parent: card });
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Send one server-console command…';
  input.autocomplete = 'off';
  input.dataset.localConsoleCommand = 'true';

  const sendButton = uiButton(null, { small: true, variant: 'primary', html: uiIcon('upload', 14) + ' Send' });
  sendButton.type = 'submit';
  sendButton.dataset.localConsoleCommand = 'true';

  form.append(input, sendButton);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    try {
      await window.arkcc.sendLocalServerConsole(command);
      appendLocalConsoleLine('> ' + command);
      input.value = '';
    } catch (error) {
      // The console pane *is* this control's inline status line.
      appendLocalConsoleLine('[service] Could not send command: ' + error.message);
    }
  });

  const consoleStatus = uiElement('p', { className: 'local-setup-status', parent: card });
  const actions = uiElement('div', { className: 'local-setup-actions', parent: card });

  /* The server could previously be started but never stopped from here — the
     only way out was Task Manager. Older preload builds have no stop bridge,
     so the control is only built when one is present. */
  if (hasManagedStopApi()) {
    const stopButton = uiButton(actions, {
      small: true,
      className: 'danger',
      html: uiIcon('stop', 14) + ' Stop server',
      onClick: () => withBusyButton(stopButton, async () => {
        if (!confirm('Stop the local ARK server running under the console service? Connected players will be disconnected.')) return;
        consoleStatus.textContent = '';
        try {
          await window.arkcc.stopManagedLocalServer();
          appendLocalConsoleLine('[service] Stop requested.');
        } catch (error) {
          consoleStatus.textContent = 'Could not stop the server: ' + error.message;
          return;
        }
        await refreshLocalConsoleStatus();
      }),
    });
    stopButton.dataset.localConsoleStop = 'true';
  }

  uiButton(actions, {
    small: true,
    html: uiIcon('x', 14) + ' Clear this view',
    onClick: () => { localConsoleLines.clear(); updateLocalConsoleView(); },
  });

  grid.appendChild(card);
}

function renderLocalFirewallCard(grid) {
  const portOption = optByKey.get('port');
  const gamePort = portOption ? getVal(portOption) : ASA_SERVER.DEFAULT_GAME_PORT;
  uiElement('section', {
    className: 'opt-card wide local-setup-advice',
    parent: grid,
    html: `
    <div class="opt-head"><div><div class="opt-name">Before players join</div><code class="opt-key">local network · firewall · router</code></div></div>
    <p class="opt-help">For people outside your home network, allow the game port (<b>${esc(gamePort)}</b>) and the next UDP port through Windows Firewall and forward them in your router. Keep your admin password private. The <b>Server Basics</b> and <b>Launch Options</b> pages are where you change those settings.</p>`,
  });
}

function renderLocalRemoteCard(grid) {
  const card = uiElement('section', {
    className: 'opt-card wide local-setup-remote',
    html: `
    <div class="opt-head"><div><div class="opt-name">Remote-server setup is next</div><code class="opt-key">local installation is the first release of this workflow</code></div></div>
    <p class="opt-help">The existing <b>Deploy</b> page already reads and writes config on Nitrado and Pterodactyl/WISP connections. Provisioning a brand-new remote machine will be added separately, because it needs provider-specific access and safeguards.</p>`,
  });
  uiButton(card, {
    small: true,
    html: uiIcon('upload', 14) + ' Open Deploy',
    onClick: () => { currentCat = 'deploy'; render(); },
  });
  grid.appendChild(card);
}

/** The page-level setup log, shared with the creation modal while it is open. */
function renderLocalSetupLogPane(grid) {
  const log = uiElement('pre', {
    className: 'local-setup-log',
    text: localSetupLog.text(),
    parent: grid,
    attrs: { id: 'localServerSetupLog' },
  });
  log.hidden = localSetupLog.isEmpty();
}

/* ---------------------------------------------------------------------------
   Orchestration
   --------------------------------------------------------------------------- */

function renderLocalServerSetup(grid) {
  const desktop = hasLocalServerDesktopApi();
  const local = localServerSetupState();
  if (desktop) bindLocalSetupProgress();

  renderLocalSetupIntroCard(grid);
  if (!desktop) {
    renderLocalSetupUnavailableCard(grid);
    return;
  }

  renderLocalFolderCard(grid, local);
  renderLocalCreateCard(grid, local);
  renderLocalMaintenanceCards(grid, local);
  renderLocalConsoleCard(grid);
  renderLocalFirewallCard(grid);
  renderLocalRemoteCard(grid);
  renderLocalSetupLogPane(grid);

  // Subscribe only after the console element exists. Leaving this page calls
  // syncLocalServerConsoleConsumer(false) from app.js and releases the pipe.
  syncLocalServerConsoleConsumer(true);
  updateLocalConsoleView();

  maybeRecheckLocalServerFolder(local);
}
