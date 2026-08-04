# Installation and Updates

Run `ARK-Config-Creator-Setup-x.y.z.exe` to install the Windows desktop app. The installer creates Start menu and desktop shortcuts.

## Updating without uninstalling

1. Download a newer installer from the project’s GitHub Releases page.
2. In the installed app, click **Update App**.
3. Select the newer `ARK-Config-Creator-Setup-x.y.z.exe` file.
4. The app closes and the installer upgrades it in place.

Local accounts, configuration profiles, and the persistent local-server service are retained. The update control rejects same-version and older installers, and files not named `ARK-Config-Creator-Setup-x.y.z.exe`.

Before running the installer the app checks its digital signature. If the copy you are running is code-signed, the installer must carry a valid signature from the same publisher or it is refused. If the copy you are running is unsigned, there is nothing to compare against, so the app asks you to confirm and names the exact file it is about to run. Only continue for a file you downloaded yourself from the official releases page.

You can also run the newer installer directly; it performs the same in-place upgrade.
