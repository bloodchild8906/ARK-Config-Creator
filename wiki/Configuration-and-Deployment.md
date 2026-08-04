# Configuration and Deployment

## Manual files

**Create Files** produces:

- `GameUserSettings.ini`
- `Game.ini`
- `StartServer.bat`

Place both INI files in:

```text
ARK Survival Ascended Server\ShooterGame\Saved\Config\WindowsServer\
```

Restart the server after changing configuration.

## Supported deployment connections

The **Deploy** page can read and deploy configuration for:

- Nitrado, using a Long Life Token
- Pterodactyl/WISP panels, using a Client API key
- A self-hosted folder on this PC

Connection details are local only and excluded from exported setup profiles. Existing server config files are backed up as `.bak` before deployment.
