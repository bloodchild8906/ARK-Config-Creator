# Release process

## Prepare a release

1. Update `package.json`, `package-lock.json`, and `legal.js` to the new semantic version.
2. Add release notes to `CHANGELOG.md`.
3. Run:

   ```powershell
   npm ci
   npm run smoke
   npm run dist
   ```

4. Test the installer over an existing app installation. It must preserve `%APPDATA%\ARK Config Creator` data and must not stop a running local server service.
5. Create and push a matching tag, for example `v1.0.2` for package version `1.0.2`.

## GitHub release automation

The `release.yml` workflow validates that the tag and `package.json` version match, builds the installer on Windows, then creates a GitHub Release with the setup executable and blockmap.

## User update path

Users download the newer `ARK-Config-Creator-Setup-x.y.z.exe` release asset. In the current app, **Update App** lets them select that installer. The app validates that it is newer, starts it, then exits so NSIS can perform an in-place upgrade. Users never need to uninstall first.
