# Security Policy

## Supported versions

Security fixes are made on the latest released version.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability involving credentials, arbitrary file access, command execution, or the local console service. Use GitHub's private security-advisory reporting for this repository, or contact the maintainer privately through the channel listed on the repository profile.

Include the affected version, a clear reproduction path, expected impact, and any proof of concept. Remove API tokens, passwords, IP addresses, and server configuration before sharing logs or screenshots.

## Security boundaries

- Hosting-provider tokens and local folder handles stay on the user’s computer.
- The local server helper listens only on `127.0.0.1` and uses a random local token.
- Console output is not retained when no ARK Config Creator window is subscribed.
- The app updater accepts only a newer `ARK-Config-Creator-Setup-x.y.z.exe` installer.
