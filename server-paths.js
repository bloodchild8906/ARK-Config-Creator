/* =========================================================================
   ARK Config Creator — shared dedicated-server path helpers.

   The Electron main process and the detached local-server helper both resolve
   the same ASA install layout and both have to refuse the same unusable
   folders. These three helpers used to exist as byte-identical copies in
   main.js and server-service.js, so a fix applied to one of them silently left
   the other behind — most dangerously `normaliseInstallDir`, which is the only
   thing standing between SteamCMD and the root of a drive.
   ========================================================================= */
'use strict';

const path = require('path');
const fsp = require('fs').promises;
const { ASA_SERVER } = require('./constants');

/**
 * Resolve the well-known files of an ASA dedicated-server installation.
 *
 * @param {string} installDir Absolute install folder (see normaliseInstallDir).
 * @returns {{root: string, exe: string, configDir: string, startScript: string}}
 */
function serverPaths(installDir) {
  return {
    root: installDir,
    exe: path.join(installDir, ...ASA_SERVER.EXE_PARTS),
    configDir: path.join(installDir, ...ASA_SERVER.CONFIG_PARTS),
    startScript: path.join(installDir, ASA_SERVER.FILES.START_SCRIPT),
  };
}

/**
 * Validate a user-supplied install folder and return it in absolute form.
 *
 * @param {unknown} value Whatever the renderer sent.
 * @returns {string} The resolved absolute path.
 * @throws {Error} With a message meant to be shown to the user as-is.
 */
function normaliseInstallDir(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Choose a server installation folder first.');
  const dir = path.resolve(value.trim());
  // Never allow an install to target an entire drive. SteamCMD would otherwise
  // scatter its files at the root of the disk, and a later cleanup would be
  // dangerously broad.
  if (dir === path.parse(dir).root) throw new Error('Choose a folder inside a drive, not the drive itself.');
  return dir;
}

/**
 * @param {string} file
 * @returns {Promise<boolean>} true when the path exists and is accessible.
 */
async function fileExists(file) {
  try { await fsp.access(file); return true; } catch (e) { return false; }
}

module.exports = { serverPaths, normaliseInstallDir, fileExists };
