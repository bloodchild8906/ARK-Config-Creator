# Architecture

This document explains how ARK Config Creator is put together and, more
importantly, the two or three non-obvious rules that will bite you if you do not
know them. Read the "Renderer scope rule" section before touching any renderer
file.

## The three JavaScript contexts

The app has no bundler and no module loader. The same repository contains three
kinds of JavaScript that cannot import each other freely:

| Context | Files | Module system |
| --- | --- | --- |
| **Electron main process** | `main.js`, `db.js`, `server-paths.js` | CommonJS (`require`) |
| **Preload bridge** | `preload.js` | CommonJS, but sandboxed — see below |
| **Detached local-server helper** | `server-service.js` | CommonJS, run under `ELECTRON_RUN_AS_NODE` |
| **Renderer** | `constants.js`, `icons.js`, `ui-kit.js`, `picker-db.js`, `data.js`, `mods-db.js`, `mods.js`, `builders.js`, `deploy.js`, `server-setup.js`, `auth.js`, `legal.js`, `wizard.js`, `app.js` | Classic `<script>` tags |

`constants.js` is deliberately dual-mode: Node `require`s it, and the renderer
loads it as a plain script. It must stay dependency-free for that reason.

## Renderer scope rule (read this one)

`index.html` loads a dozen classic `<script>` files. Their top-level
`const`/`let`/`class` bindings all land in **one shared global lexical
environment**. That has two consequences:

1. **Cross-file calls are normal.** `deploy.js` calling `toast()` from `app.js`
   is expected, even though `app.js` loads last — the reference is resolved at
   call time, not at parse time.
2. **A duplicate top-level name is fatal.** Declaring `const state` in two files
   is a `SyntaxError` that stops the entire app from booting, with nothing to
   show for it but a console message the user never sees.

ESLint analyses one file at a time and cannot see this. `npm run check:globals`
(`tools/check-globals.js`) can: it reads the script order out of `index.html`,
collects every top-level declaration, and fails on any collision. It runs in CI
before the smoke test. **Run it after adding any top-level name.**

Because of the same rule, `no-undef` is switched off for renderer files in
`eslint.config.js` — cross-file references would otherwise all look undefined.

## Adding a renderer file

Adding a `.js` file to the renderer means touching three places, in this order:

1. Create the file.
2. Add a `<script src="yourfile.js?v=NN"></script>` tag to `index.html`, in
   dependency order (things that are *called* during load must come first;
   things merely *referenced inside functions* can come later).
3. Add the filename to `build.files` in `package.json`, or it will be missing
   from the packaged installer and the app will break only after a `npm run dist`.

The `?v=NN` query strings are a manual cache-bust. Keep them all on the same
number and bump the number when shipping a renderer change.

## Shared modules

### `constants.js`

Everything that crosses a process boundary or a file-format boundary lives here,
so the two sides can never drift:

- `IPC_CHANNELS` — every channel name, used by both `main.js` and `preload.js`.
- `ASA_SERVER` — the Steam app id, the SteamCMD URL, the config/exe path
  segments, the three generated file names, backup suffixes, and the default
  port/map/slot count.
- `ASA_CONFIG_POSIX_PATH` — the POSIX form of the config directory, for remote
  panel and FTP targets.
- `SERVICE_API` — host, token header, descriptor file name and routes of the
  loopback service.
- `SETUP_PHASES` / `SETUP_PHASE_PERCENT` / `STEAMCMD_PROGRESS_SPAN` — the
  local-server creation progress protocol.
- `APP_TIMEOUTS` / `APP_LIMITS` — every timeout, retry count and size cap.

### `ui-kit.js`

Renderer DOM helpers shared by every screen: `esc`, `uiElement`, `uiButton`,
`uiField`, `uiFieldMarkup`, `uiStatusLine`, `createLogBuffer`, `withBusyButton`.
Use these rather than hand-rolling another `document.createElement('button')`
block — that is how the codebase ended up with four button factories.

`esc()` escapes `&`, `<`, `>`, `"` **and** `'`. The renderer builds HTML by
string concatenation in many places and consumes untrusted remote content (mod
descriptions, linked docs); keep it conservative.

## Process boundaries

### Renderer → main (IPC)

The renderer never has Node access (`contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`). `preload.js` exposes a narrow,
promise-based `window.arkcc` API over `ipcRenderer.invoke`. Main-process handlers
validate their input and reject anything that did not come from the app's own
top-level `file://` frame.

A sandboxed preload may only `require` Electron built-ins, so `preload.js`
cannot `require('./constants')`. The channel map is passed to it through
`webPreferences.additionalArguments` instead; the values still originate in
`constants.js`.

### Main → detached helper (loopback HTTP)

`server-service.js` runs detached so the game server survives the app closing.
It owns `ArkAscendedServer.exe` and its pipes, and exposes an authenticated
loopback API (`/health`, `/status`, `/events`, `/start`, `/stop`, `/console`) on
`127.0.0.1` with a random 32-byte token in the `X-Arkcc-Token` header, compared
in constant time.

**The helper keeps no console history by design.** Server output is written only
to currently connected SSE subscribers and discarded otherwise, so an idle
machine does not accumulate unbounded log memory or disk. The main process opens
the SSE stream only while at least one renderer is actually viewing the console.

### Local-server progress protocol

`main.js` sends structured progress on `IPC_CHANNELS.LOCAL_SERVER_PROGRESS`:

```js
{ phase: string|null, text: string, percent: number|null }
```

- `text` — the human-readable log line; always present.
- `phase` — one of `SETUP_PHASES`, mapped to a bar percentage by the renderer
  through `SETUP_PHASE_PERCENT`.
- `percent` — SteamCMD's own 0–100 download percentage, interpolated across
  `STEAMCMD_PROGRESS_SPAN`.

This replaced an arrangement where the renderer regex-matched the *prose* of the
main process's log lines. Rewording a message used to silently break the
progress bar. Do not reintroduce that coupling: if you need a new step, add a
phase to `constants.js`.

## Account switching

Logging out in place does not reload the page, so module-level caches in every
renderer file would otherwise survive into the next account's session. Each file
that caches user-specific data exposes a reset hook, and `auth.js`'s `doLogout()`
calls all of them through `resetSharedUiState()`:

- `resetLocalServerUiState()` — `server-setup.js`
- `resetDeployUiState()` — `deploy.js`
- `resetModsUiState()` — `mods.js`

The calls are feature-detected, so a file that drops its hook cannot break login.
**If you add a module-level cache holding user data, add it to that file's reset
hook.**

## Data storage

`db.js` is the main process's account store. It prefers `node:sqlite` and falls
back to a JSON file, and it distinguishes two situations that used to look
identical:

- *SQLite is not available in this runtime* — a quiet, legitimate fallback.
- *SQLite is available but this database failed to open* — reported, never
  silently replaced with an empty JSON store.

An unreadable JSON store is renamed aside as `arkcc.json.corrupt-<timestamp>`
rather than overwritten, and writes are atomic (temp file + rename). Either
condition is reported to the renderer as `currentSession().issue` and surfaced to
the user, because otherwise their accounts would simply appear to have vanished.

Renderer state additionally lives in `localStorage` under
`asaConfigCreator.v1.u<id>`, mirrored to the database. Writes are debounced, and
flushed synchronously on `beforeunload` and before any account switch.

## Verification

```
npm run lint            # ESLint
npm run check:globals   # renderer global-scope collision check
npm run smoke           # Electron end-to-end boot/login/logout/relogin run
npm run verify          # all three
```

The smoke test drives the real UI: register, skip the first-run wizard, open the
local-server page, open the progress modal, log out, confirm the login inputs are
usable again, and log back in — asserting the header is not double-initialised.
It polls for conditions rather than sleeping fixed intervals, so it does not fail
spuriously on a loaded machine.

It asserts on specific element ids, class names and one string of user-visible
copy. If you rename any of those, update `runSmokeTest` in `main.js` in the same
commit.
