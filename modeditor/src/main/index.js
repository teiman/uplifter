const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const { TMP_DIR, WADS_DIR, TEXTURES_SRC_DIR, ensureRuntimeDirs } = require('./paths');
const { compileMap } = require('./compileTools');
const { deployBsp, DEFAULT_DESTINATION } = require('./deployBsp');
const { buildMapText, wadKeyFromPaths } = require('./mapWriter');
const { loadWad } = require('./wadLoader');
const { ensureAutoWad } = require('./wadWriter');
const { ensureTexturesWad } = require('./texturesWadBuilder');
const { deserialiseTilemap } = require('../shared/types');

// Note: don't read app.isPackaged here — depending on how Electron is
// launched, app may not be fully initialised yet. Treat any run with the
// --dev flag as dev mode; otherwise fall back to a packaged-style load.
const isDev = process.argv.includes('--dev');
ensureRuntimeDirs();

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: 'Uplifter ModEditor',
    backgroundColor: '#1c2127',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (isDev) {
    win.loadURL('http://localhost:5173/');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }
  return win;
}

async function listWads() {
  try {
    const entries = await fs.readdir(WADS_DIR);
    return entries
      .filter(e => e.toLowerCase().endsWith('.wad'))
      .map(e => path.join(WADS_DIR, e));
  } catch {
    return [];
  }
}

function registerIpc(getWindow) {
  ipcMain.handle('app:ping', async () => ({
    pong: true,
    platform: process.platform,
    electron: process.versions.electron,
  }));

  ipcMain.handle('wad:listDefault', async () => listWads());

  /** Decode a WAD file → list of textures with RGBA mip0 pixels.
   *  The renderer can use this for richer texture browsing. */
  ipcMain.handle('wad:load', async (_evt, wadPath) => {
    try {
      const w = await loadWad(wadPath);
      return {
        ok: true,
        wad: {
          path: w.path,
          name: w.name,
          textures: w.textures.map(t => ({
            name: t.name,
            width: t.width,
            height: t.height,
            // Serialise as plain Uint8Array (Uint8ClampedArray survives
            // structured clone but downstream tooling is fussier).
            rgba: new Uint8Array(t.rgba.buffer, t.rgba.byteOffset, t.rgba.byteLength).slice(),
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('tilemap:save', async (_evt, { tilemap, basename = 'uplifter' } = {}) => {
    try {
      const target = path.join(TMP_DIR, `${basename}.tmap.json`);
      // tilemap is already a serialised (plain) snapshot from the renderer.
      await fs.writeFile(target, JSON.stringify(tilemap, null, 2), 'utf8');
      const stat = await fs.stat(target);
      return { ok: true, path: target, bytes: stat.size };
    } catch (err) {
      console.error('[tilemap:save]', err);
      return { ok: false, error: err.message };
    }
  });

  /** Load the last-saved tilemap, if one exists. Used by the renderer on
   *  startup to restore the previous session. Returns { ok:true, tilemap }
   *  when found, { ok:false, missing:true } when there's no file yet. */
  ipcMain.handle('tilemap:loadLast', async (_evt, { basename = 'uplifter' } = {}) => {
    try {
      const source = path.join(TMP_DIR, `${basename}.tmap.json`);
      const text = await fs.readFile(source, 'utf8').catch(() => null);
      if (text == null) return { ok: false, missing: true };
      return { ok: true, tilemap: JSON.parse(text), path: source };
    } catch (err) {
      console.error('[tilemap:loadLast]', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('tilemap:exportMap', async (_evt, { tilemap, basename = 'untitled' } = {}) => {
    try {
      const t = deserialiseTilemap(tilemap);
      const wads = await listWads();
      const wadKey = wadKeyFromPaths(wads);
      const built = buildMapText({ tilemap: t, wadKey });
      const target = path.join(TMP_DIR, `${basename}.map`);
      await fs.writeFile(target, built.text, 'utf8');
      return { ok: true, path: target, warnings: built.warnings, bytes: built.text.length };
    } catch (err) {
      console.error('[tilemap:exportMap]', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('compile:run', async (_evt, { tilemap, basename = 'uplifter' } = {}) => {
    const win = getWindow();
    const send = (entry) => {
      try { win.webContents.send('compile:log', entry); } catch {}
    };
    const startedAt = Date.now();
    try {
      const t = deserialiseTilemap(tilemap);
      const wads = await listWads();
      const wadKey = wadKeyFromPaths(wads);
      const built = buildMapText({ tilemap: t, wadKey });
      const mapPath = path.join(TMP_DIR, `${basename}.map`);
      await fs.writeFile(mapPath, built.text, 'utf8');
      send({ stream: 'meta', tool: 'mapWriter', line: `wrote ${mapPath} (${built.text.length} bytes)` });
      for (const w of built.warnings) {
        send({ stream: 'meta', tool: 'mapWriter', line: `WARNING: ${w}` });
      }
      const result = await compileMap(basename, send, { quality: t.quality || 'fast' });
      const elapsedMs = Date.now() - startedAt;
      return { ...result, elapsedMs };
    } catch (err) {
      console.error('[compile:run]', err);
      send({ stream: 'meta', tool: 'compile', line: `ERROR: ${err.message}` });
      return {
        ok: false, leaked: false, bspPath: null, lastTool: 'spawn',
        exitCode: -1, error: err.message,
        elapsedMs: Date.now() - startedAt,
      };
    }
  });

  ipcMain.handle('bsp:deploy', async (_evt, { sourcePath, destDir } = {}) => {
    try {
      const r = await deployBsp(sourcePath, destDir);
      return { ok: true, ...r };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('quake:launch', async (_evt, { map = 'uplifter', game = 'uplifter', cwd = 'd:\\quake' } = {}) => {
    try {
      const exePath = path.join(cwd, 'ironwail.exe');
      if (!(await fs.stat(exePath).catch(() => null))) {
        return { ok: false, error: `ironwail.exe not found at ${exePath}` };
      }
      const args = ['-game', game, '+map', map];
      const child = spawn(exePath, args, {
        cwd, detached: true, stdio: 'ignore', windowsHide: false, shell: false,
      });
      child.on('error', (err) => console.error('[quake:launch]', err));
      child.unref();
      return { ok: true, pid: child.pid, cmd: `${exePath} ${args.join(' ')}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:defaults', async () => ({
    deployDest: DEFAULT_DESTINATION,
    quakeCwd: 'd:\\quake',
    quakeGame: 'uplifter',
  }));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Regenerate the synthetic auto.wad on every launch. It carries the
  // textures the editor needs but the user's WADs don't ship — currently
  // sky_auto (used for the world's sky box) and a few internal helpers.
  // Writing on each launch keeps the file in sync if wadWriter.js
  // changes.
  try {
    await ensureAutoWad(path.join(WADS_DIR, 'auto.wad'));
  } catch (err) {
    console.error('[startup] auto.wad write failed:', err);
  }
  // Rebuild textures.wad if any PNG under assets/textures/<biome>/ has
  // been added, removed, or modified since the last launch. Manifest of
  // (rel path → mtimeMs) lives next to the WAD; if it matches the
  // current scan AND the WAD file exists, we skip — typical startup is
  // a no-op.
  try {
    const r = await ensureTexturesWad(
      TEXTURES_SRC_DIR,
      path.join(WADS_DIR, 'textures.wad'),
      path.join(TMP_DIR, 'textures.wad.manifest.json'),
    );
    if (r.rebuilt) console.log(`[startup] rebuilt textures.wad with ${r.count} miptexes`);
  } catch (err) {
    console.error('[startup] textures.wad write failed:', err);
  }
  let mainWindow = createMainWindow();
  registerIpc(() => mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
