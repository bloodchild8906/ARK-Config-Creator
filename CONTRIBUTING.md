# Contributing to ARK Config Creator

Thanks for helping improve ARK Config Creator.

## Before you start

- Keep changes focused and explain the player or server-owner problem they solve.
- Do not commit API tokens, server passwords, local databases, installers, or generated server files.
- Preserve compatibility with the browser version unless a feature genuinely requires the Windows desktop app.
- Treat ARK settings as version-sensitive: include a source or reproducible test case when changing game defaults or INI mappings.

## Local workflow

```powershell
npm ci
npm run verify
npm run dist
```

`npm run verify` runs ESLint, the renderer global-collision check, and the smoke test. `npm run smoke` on its own verifies login, the local-server setup surface, the progress modal, and the desktop renderer. `npm run dist` builds the Windows installer.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. Two rules there are easy to trip over:

- The renderer has no bundler. Every `<script>` shares one global scope, so declaring a top-level name that another renderer file already uses is a `SyntaxError` that stops the app booting. `npm run check:globals` catches it; ESLint cannot.
- Adding a renderer file means three edits: the file, a `<script>` tag in `index.html`, and an entry in `build.files` in `package.json`. Miss the third and the app works in development but breaks in the installer.

Prefer the shared modules over new local copies: `constants.js` for anything crossing a process or file-format boundary, and `ui-kit.js` for buttons, labelled fields and capped log panes.

## Pull requests

1. Create a focused branch.
2. Update documentation when behavior or the setup flow changes.
3. Run `npm run verify`; run a production build for installer, Electron-main-process, or packaging changes.
4. Complete the pull request template, including how you tested the change.

## Server and security changes

Local server setup can install software, write configuration, and launch a process. Keep those changes narrow, explicit, and user-initiated. Do not add shell execution from renderer-controlled text. The console service must continue to drop output when no app window is consuming it.
