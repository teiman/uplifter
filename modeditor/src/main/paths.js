const path = require('node:path');
const fs = require('node:fs');

// Don't touch electron.app at module scope: depending on how Electron
// boots (npm run dev with concurrently vs. plain `electron .`), the app
// object may or may not be available at require time. Detect dev vs.
// packaged via process.resourcesPath, which is always defined inside
// Electron: in dev it points to electron's own resources, in a packaged
// build it points to the app's resources/ folder containing app.asar.
const isDev = !process.resourcesPath || !process.resourcesPath.includes('app.asar');

// Dev: project root = repo root (two dirs up from src/main/).
// Packaged: PROJECT_ROOT is where the .exe lives, so tmp/ and wads/ end up
// next to it (portable layout).
const PROJECT_ROOT = isDev
  ? path.resolve(__dirname, '..', '..')
  : path.dirname(process.execPath);

// bin/ ships as extraResource. Packaged: resources/bin/.
const BIN_DIR = isDev
  ? path.join(PROJECT_ROOT, 'bin')
  : path.join(process.resourcesPath, 'bin');

const TMP_DIR = path.join(PROJECT_ROOT, 'tmp');
const WADS_DIR = path.join(PROJECT_ROOT, 'wads');
// Reusable map-area props (.tprop). Lives in the repo so saved building/area
// props are versioned with the project and shared.
const PROPS_DIR = path.join(PROJECT_ROOT, 'props');

// PNG source for the auto-generated textures.wad. In dev the textures
// live in the renderer's source tree (so Vite serves them to the
// editor's 2D preview); in a packaged build they're inside app.asar,
// which fs.readdir can still traverse — Electron ships fs with asar
// support. Same path either way.
const TEXTURES_SRC_DIR = path.join(PROJECT_ROOT, 'src', 'renderer', 'assets', 'textures');

function ensureRuntimeDirs() {
  for (const dir of [TMP_DIR, WADS_DIR, PROPS_DIR]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
}

module.exports = {
  isDev,
  PROJECT_ROOT,
  BIN_DIR,
  TMP_DIR,
  WADS_DIR,
  PROPS_DIR,
  TEXTURES_SRC_DIR,
  ensureRuntimeDirs,
};
