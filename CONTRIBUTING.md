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
npm run smoke
npm run dist
```

`npm run smoke` verifies login, the local-server setup surface, progress modal, and the desktop renderer. `npm run dist` builds the Windows installer.

## Pull requests

1. Create a focused branch.
2. Update documentation when behavior or the setup flow changes.
3. Run the smoke test; run a production build for installer, Electron-main-process, or packaging changes.
4. Complete the pull request template, including how you tested the change.

## Server and security changes

Local server setup can install software, write configuration, and launch a process. Keep those changes narrow, explicit, and user-initiated. Do not add shell execution from renderer-controlled text. The console service must continue to drop output when no app window is consuming it.
