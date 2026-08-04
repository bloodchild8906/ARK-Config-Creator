# Changelog

All notable changes are documented here.

## Unreleased

A codebase-wide clean-up pass. No feature was removed and the on-disk state
format is unchanged, so existing accounts, saved setups and profiles keep
working. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the structure this
established.

### Fixed

- **Config corruption in the visual entry builders.** `SpawnLimitPercentage`
  was matched inside `OverrideSpawnLimitPercentage` by an unanchored regex, so
  editing dino spawn weights wrote `SpawnLimitPercentage=NaN` back into the
  user's `Game.ini`. Field keys are now regex-escaped and anchored to a key
  boundary, and no numeric parse can put `NaN` or `undefined` into a config
  value.
- **The managed local server could be started but never stopped** — the only way
  out was Task Manager. Added a `/stop` route to the console service, an IPC
  channel, and a Stop button on the live-console card.
- **Every mod category showed the same generic icon.** The category table holds
  emoji, which the icon renderer cannot resolve, so it silently fell back to the
  "info" glyph everywhere. Categories now map to real icons in the sidebar, the
  mod header and the mod browser.
- **One failed deploy blocked every later deploy** for the rest of the session:
  the in-flight flag was cleared after the `try`/`catch` instead of in a
  `finally`.
- **A rejected login left the button permanently disabled** with no message.
  `crypto.timingSafeEqual` throws on a length mismatch, which a corrupt stored
  hash can trigger; that path is now guarded and the error is shown.
- **A folder that could not be inspected spun the local-server page** in a tight
  render/IPC loop, because the "re-check" timestamp was only written on success.
- **Window size and position were lost when quitting from the menu or Ctrl+Q** —
  the database was closed before the window's `close` handler could save them.
- **Account switching leaked data between accounts.** Logging out in place left
  the previous user's deploy logs, live console output and mod browser state
  visible to the next user.
- Corrupt account storage is no longer silently discarded: an unreadable
  `arkcc.json` is renamed aside as `arkcc.json.corrupt-<timestamp>`, writes are
  atomic, a SQLite database that exists but fails to open is no longer treated as
  "SQLite unavailable", and the app now tells the user when either happened.
- An interrupted SteamCMD download no longer hangs forever and leaves a `.part`
  file behind.
- Fixed "1 line in a custom format **are** kept unchanged." in the builders.
- An IndexedDB connection was opened on every self-hosted deploy call and never
  closed.
- Destructive buttons only looked destructive on hover — the base `.btn.danger`
  rule was missing.

### Security

- **Launch-argument injection.** Values interpolated into the game's launch query
  string were unescaped, so a session name containing `?` or `&` could inject a
  real launch parameter (for example an admin password) into the spawned server
  process. All interpolated values are now sanitised.
- **Exported profiles contained secrets.** `my-ark-server-profile.json` — a file
  the app encourages users to share — included `ServerAdminPassword`,
  `ServerPassword`, `SpectatorPassword`, the RCON settings and local folder
  paths, contradicting `PRIVACY.txt`. They are stripped on export, and the
  download message says how many were left out. Importing a profile that still
  contains them keeps working.
- **`shell.openPath` could execute a file.** "Open folder" resolved a path from
  renderer state without checking it was a directory. It now refuses anything
  else.
- **The in-place updater ran any chosen `.exe` unverified.** A file merely
  *named* `ARK-Config-Creator-Setup-9.9.9.exe` was launched on the strength of
  its filename and version alone. The running app is now used as the trust
  anchor: a signed build refuses an installer that is unsigned or signed by a
  different publisher, and an unsigned build asks for explicit confirmation
  naming the exact file.
- Added a Content-Security-Policy and enabled the renderer `sandbox`. IPC
  handlers now reject anything that did not come from the app's own top-level
  frame.
- The loopback service token is compared in constant time.

### Changed

- Added `constants.js`: a single source for all 22 IPC channel names, the ASA
  server layout, the loopback service protocol, and every timeout and size limit.
  These were previously duplicated as literals across two or three files, where a
  typo meant a silently dead feature.
- The local-server progress bar no longer regex-matches the wording of log lines.
  The main process sends structured `{ phase, text, percent }` events; rewording
  a message can no longer break the progress display.
- Added `ui-kit.js` and adopted it across the renderer, replacing four button
  factories, three labelled-field factories and three capped-log implementations
  with one of each. `esc()` now also escapes single quotes.
- Extracted `server-paths.js`, shared by the main process and the console service
  — three helpers had been byte-duplicated between them.
- Broke up the largest functions. The longest was 288 lines
  (`renderLocalServerSetup`); the largest now is a declarative IPC registration
  block. `init()`, `render()`, `importText()`, `renderLaunchCategory()`,
  `renderEntriesBuilder()`, `showSetupWizard()`, `renderModPage()`,
  `deployProfileCard()` and `createWindow()` were each split into named,
  single-purpose helpers.
- Error reporting is more specific: every network failure was previously reported
  as a CORS problem, and every mod-doc lookup failure produced the same message
  regardless of cause. Control flow that had been encoded in `Error.message`
  strings now uses error codes.
- `server-setup.js` documents and follows one rule for where a failure is shown,
  instead of scattering them between a status line, a toast and a log pane.
- Typing in a settings field no longer serialises the entire configuration and
  rescans every option on each keystroke; persistence and badge counts are
  coalesced, with a synchronous flush retained on exit and account switch.

### Added

- ESLint (`npm run lint`) and a renderer global-collision checker
  (`npm run check:globals`) — the renderer's shared script scope makes a
  duplicate top-level name a fatal `SyntaxError`, and nothing caught that before.
  Both run in CI ahead of the smoke test. `npm run verify` runs everything.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), documenting the three JavaScript
  contexts, the renderer scope rule, the process boundaries and the progress
  protocol.
- The smoke test polls for conditions instead of sleeping fixed intervals (it
  could fail spuriously on a loaded machine) and reports the actual values behind
  a failed assertion.

## 1.0.1

- Added one-click local ASA server creation: install/update, config deployment, persistent console service, and launch.
- Added a reconnectable live console that discards output while no viewer is connected.
- Added a creation progress modal with staged percentage progress.
- Added an in-place desktop app update flow using a newer NSIS installer.
- Added GitHub documentation, issue forms, pull request template, CI, and release automation.

## 1.0.0

- Initial public release.
