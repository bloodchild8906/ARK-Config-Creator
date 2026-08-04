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

`npm run dist` passes `--publish never`. Without it, electron-builder tries to publish the artifacts itself the moment it detects a tag, which fails with "GitHub Personal Access Token is not set" — uploading is the workflow's `gh release create` step, not the build's.

If a tagged build fails, fix the problem on `main`, then move the tag: `git tag -f v1.0.2 <new-commit>` and `git push --force origin v1.0.2`. The workflow re-runs on the retagged commit.

## User update path

Users download the newer `ARK-Config-Creator-Setup-x.y.z.exe` release asset. In the current app, **Update App** lets them select that installer. The app validates that it is newer, starts it, then exits so NSIS can perform an in-place upgrade. Users never need to uninstall first.
