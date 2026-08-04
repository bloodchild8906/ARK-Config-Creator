/* =========================================================================
   ARK Config Creator — shared constants.

   This file is deliberately dependency-free so the same values can be used by
   all three JavaScript contexts in the app:

     • the Electron main process        (`require('./constants')`)
     • the detached local-server helper (`require('./constants')`)
     • the renderer                     (a classic <script> tag, loaded first)

   Everything that crosses a process boundary — IPC channel names, the loopback
   service protocol, on-disk file names — lives here so the two sides of each
   boundary can never drift apart. A typo used to mean a silently dead feature;
   now it is a single symbol used by both ends.
   ========================================================================= */
'use strict';

/* ---------------------------------------------------------------------------
   IPC channels (main process ⇄ preload)
   Grouped by domain. `renderer:*` entries are pushed from main to the renderer;
   everything else is invoked or sent by the renderer.
   --------------------------------------------------------------------------- */
const IPC_CHANNELS = {
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_SESSION: 'auth:session',

  STATE_LOAD: 'state:load',
  STATE_SAVE: 'state:save',
  STATE_SAVE_SYNC: 'state:save-sync',

  APP_VERSION: 'app:version',
  APP_INSTALL_UPDATE: 'app:install-update',

  LOCAL_SERVER_CHOOSE_DIRECTORY: 'local-server:choose-directory',
  LOCAL_SERVER_INSPECT: 'local-server:inspect',
  LOCAL_SERVER_INSTALL: 'local-server:install',
  LOCAL_SERVER_WRITE_FILES: 'local-server:write-files',
  LOCAL_SERVER_CREATE: 'local-server:create',
  LOCAL_SERVER_OPEN_FOLDER: 'local-server:open-folder',
  LOCAL_SERVER_MANAGED_START: 'local-server:managed-start',
  LOCAL_SERVER_MANAGED_STOP: 'local-server:managed-stop',
  LOCAL_SERVER_CONSOLE_STATUS: 'local-server:console-status',
  LOCAL_SERVER_CONSOLE_SUBSCRIBE: 'local-server:console-subscribe',
  LOCAL_SERVER_CONSOLE_UNSUBSCRIBE: 'local-server:console-unsubscribe',
  LOCAL_SERVER_CONSOLE_SEND: 'local-server:console-send',

  /* pushed from main → renderer */
  LOCAL_SERVER_PROGRESS: 'local-server:progress',
  LOCAL_SERVER_CONSOLE: 'local-server:console',
};

/* ---------------------------------------------------------------------------
   ARK: Survival Ascended dedicated-server layout
   --------------------------------------------------------------------------- */
const ASA_SERVER = {
  /** Steam application id of the ASA dedicated server (used by SteamCMD). */
  DEDICATED_APP_ID: '2430930',
  STEAMCMD_URL: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',

  /** <installDir>/ShooterGame/Saved/Config/WindowsServer */
  CONFIG_PARTS: ['ShooterGame', 'Saved', 'Config', 'WindowsServer'],
  /** <installDir>/ShooterGame/Binaries/Win64/ArkAscendedServer.exe */
  EXE_PARTS: ['ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe'],

  FILES: {
    GAME_USER_SETTINGS: 'GameUserSettings.ini',
    GAME: 'Game.ini',
    START_SCRIPT: 'StartServer.bat',
  },

  /** Suffix appended when a file is replaced, and the temp name used to make
      the replacement atomic. */
  BACKUP_SUFFIX: '.bak',
  WRITE_TEMP_SUFFIX: '.arkcc-writing',

  DEFAULT_GAME_PORT: 7777,
  DEFAULT_MAP: 'TheIsland_WP',
  DEFAULT_MAX_PLAYERS: 70,
};

/** POSIX form of CONFIG_PARTS, for remote (FTP/panel) deploy targets. */
const ASA_CONFIG_POSIX_PATH = '/' + ASA_SERVER.CONFIG_PARTS.join('/');

/* ---------------------------------------------------------------------------
   Loopback protocol shared by main.js and server-service.js
   --------------------------------------------------------------------------- */
const SERVICE_API = {
  HOST: '127.0.0.1',
  TOKEN_HEADER: 'X-Arkcc-Token',
  /** lower-case form, for reading off an incoming Node request */
  TOKEN_HEADER_LOWER: 'x-arkcc-token',
  DESCRIPTOR_FILE: 'service.json',
  /** Minimum accepted token length in hex characters (32 random bytes). */
  MIN_TOKEN_LENGTH: 32,
  ROUTES: {
    HEALTH: '/health',
    STATUS: '/status',
    EVENTS: '/events',
    START: '/start',
    STOP: '/stop',
    CONSOLE: '/console',
  },
};

/* ---------------------------------------------------------------------------
   Local-server creation progress.

   The main process reports a named phase; the renderer maps that name to a
   percentage. Previously the renderer regex-matched the *prose* of log lines,
   so rewording a message silently broke the progress bar.

   SteamCMD's own download percentage is interpolated between INSTALLING and
   INSTALLED, which is the long part of the operation.
   --------------------------------------------------------------------------- */
const SETUP_PHASES = {
  START: 'start',
  STEAMCMD_DOWNLOAD: 'steamcmd-download',
  STEAMCMD_PREPARE: 'steamcmd-prepare',
  INSTALLING: 'installing',
  INSTALLED: 'installed',
  DEPLOYING_CONFIG: 'deploying-config',
  STARTING_SERVICE: 'starting-service',
  DONE: 'done',
};

const SETUP_PHASE_PERCENT = {
  [SETUP_PHASES.START]: 2,
  [SETUP_PHASES.STEAMCMD_DOWNLOAD]: 8,
  [SETUP_PHASES.STEAMCMD_PREPARE]: 16,
  [SETUP_PHASES.INSTALLING]: 22,
  [SETUP_PHASES.INSTALLED]: 82,
  [SETUP_PHASES.DEPLOYING_CONFIG]: 87,
  [SETUP_PHASES.STARTING_SERVICE]: 94,
  [SETUP_PHASES.DONE]: 100,
};

/** Span of the bar given to SteamCMD's own 0-100% download reporting. */
const STEAMCMD_PROGRESS_SPAN = {
  FROM: SETUP_PHASE_PERCENT[SETUP_PHASES.INSTALLING],
  TO: SETUP_PHASE_PERCENT[SETUP_PHASES.INSTALLED],
};

/* ---------------------------------------------------------------------------
   Timeouts and limits (milliseconds unless the name says otherwise)
   --------------------------------------------------------------------------- */
const APP_TIMEOUTS = {
  STEAMCMD_DOWNLOAD_MS: 30_000,
  SERVICE_REQUEST_MS: 3_000,
  SERVICE_START_POLL_MS: 100,
  SERVICE_START_ATTEMPTS: 50,
  SERVICE_IDLE_EXIT_MS: 30_000,
  CONSOLE_RECONNECT_MS: 500,
  QUIT_AFTER_INSTALLER_MS: 350,
  TOAST_MS: 3_200,
  STATE_PERSIST_DEBOUNCE_MS: 400,
  COMBO_BLUR_MS: 150,
  OBJECT_URL_REVOKE_MS: 500,
  DOWNLOAD_STAGGER_MS: 300,
  LOCAL_SERVER_RECHECK_MS: 60_000,
  CURSEFORGE_RETRY_MS: 2_500,
};

const APP_LIMITS = {
  /** Largest generated config file the main process will write. */
  MAX_CONFIG_FILE_BYTES: 5 * 1024 * 1024,
  /** Largest JSON body the loopback service will read. */
  MAX_SERVICE_BODY_BYTES: 64 * 1024,
  MAX_LAUNCH_ARGS: 100,
  MAX_LAUNCH_ARG_LENGTH: 4096,
  MAX_CONSOLE_COMMAND_LENGTH: 1000,
  MAX_STEAMCMD_TAIL_CHARS: 2400,
  MAX_DOWNLOAD_REDIRECTS: 5,
  SETUP_LOG_LINES: 180,
  CONSOLE_LOG_LINES: 800,
};

/* Node (main process + helper) sees a module; the renderer sees a classic
   script and simply gets the bindings above in its shared global scope. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IPC_CHANNELS,
    ASA_SERVER,
    ASA_CONFIG_POSIX_PATH,
    SERVICE_API,
    SETUP_PHASES,
    SETUP_PHASE_PERCENT,
    STEAMCMD_PROGRESS_SPAN,
    APP_TIMEOUTS,
    APP_LIMITS,
  };
}
