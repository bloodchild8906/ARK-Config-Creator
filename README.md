# ARK Config Creator

ARK Config Creator is a Windows desktop app for creating and deploying ARK: Survival Ascended dedicated-server settings without editing INI files by hand.

> Unofficial fan tool. Not affiliated with Studio Wildcard, Snail Games, CurseForge, Nitrado, or any hosting provider.

## What it does

- Creates `GameUserSettings.ini`, `Game.ini`, and a ready-to-run `StartServer.bat`.
- Provides plain-language server settings, presets, launch options, mod controls, and import/export.
- Installs, configures, and launches a local ASA dedicated server in one guided action.
- Connects to Nitrado and Pterodactyl/WISP servers to read and deploy configuration.
- Keeps a live local-server console available after the app is reopened. Console output is intentionally discarded while nobody is viewing it.
- Updates the desktop app in place from a newer installer—no uninstall required.

## Install or update

1. Download the latest `ARK-Config-Creator-Setup-x.y.z.exe` from the GitHub Releases page.
2. Run it to install the app.
3. To update an existing installation, open **Update App** in the app header and select the newer setup file. The app closes, the installer upgrades it in place, and your local accounts and configurations are preserved.

## Local dedicated server

Open **Set Up Local Server**, choose a folder, then select **Create & launch local server**. The app will:

1. Download SteamCMD from Valve when needed.
2. Install or validate the ASA dedicated server.
3. Deploy the current configuration and `StartServer.bat`, backing up existing generated files as `.bak`.
4. Start the persistent local console service and server process.

The progress modal shows each stage and a percentage. A running local server continues after ARK Config Creator is closed; reopen the app and return to the Local Server page to reconnect to new console output.

## Development

Requirements: Windows, Node.js, and npm.

```powershell
npm ci
npm start
```

Useful commands:

```powershell
npm run smoke   # Desktop smoke test
npm run legal   # Regenerate legal documents
npm run dist    # Build the Windows NSIS installer
```

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Wiki source pages](wiki/README.md)
- [Release process](docs/RELEASES.md)

## License

MIT. See [LICENSE.txt](LICENSE.txt).
