# Troubleshooting

## SteamCMD cannot download the server

Check the progress dialog for the SteamCMD response. Anonymous SteamCMD downloads can be delayed or rejected by Steam CDN. Try again later; if the problem remains, verify that SteamCMD can reach the internet from this PC.

## The local server does not appear for friends

Confirm the server is still running in the local console. Allow the configured game port and its following UDP port in Windows Firewall and your router. Test on the local network first.

## The console is blank after reopening the app

This is expected until the server produces new output. Console history is deliberately not stored while the page is closed.

## An update installer is rejected

Choose a file named `ARK-Config-Creator-Setup-x.y.z.exe` with a version higher than the version shown in the footer.

If the app reports that the installer is unsigned or signed by a different publisher, download it again from the official releases page. That check only applies when the copy you are running is itself code-signed; an unsigned build asks you to confirm instead.

## The local server will not stop

Use **Stop server** on the console card. The server runs under a background service that deliberately survives the app closing, so closing the window will not end it.

If the button is missing, the server is not currently reported as running — reopen the Local Server page to refresh its status.

## A folder cannot be opened

**Open folder** refuses anything that is not a directory. If the saved path now points at a file, or the drive is gone, choose the folder again.
