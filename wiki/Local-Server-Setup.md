# Local Server Setup

The Local Server page is for Windows-hosted ARK: Survival Ascended dedicated servers.

1. Configure your server name, passwords, game rules, mods, and launch options.
2. Open **Set Up Local Server** and choose a folder inside a drive. Do not select the drive root.
3. Choose **Create & launch local server**.

The app downloads SteamCMD when required, installs or validates the ASA dedicated-server build, writes configuration to `ShooterGame\Saved\Config\WindowsServer`, backs up existing generated files as `.bak`, and starts the persistent console service.

The progress dialog remains open while creation runs. It gives stage progress and uses SteamCMD's reported percentage where available.

The server then runs under a background service that outlives the app window. To end it, use **Stop server** on the console card — see [Live Server Console](Live-Server-Console).

## Network access

For players outside the local network, allow the configured game UDP port and the following UDP port through Windows Firewall and forward them in the router. Keep the admin password private.
