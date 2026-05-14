const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const { TMP_DIR, WADS_DIR, ensureRuntimeDirs } = require('./paths');
const { compileMap } = require('./compileTools');
const { deployBsp, DEFAULT_DESTINATION } = require('./deployBsp');
const { buildMapText, wadKeyFromPaths } = require('./mapWriter');
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  let mainWindow = createMainWindow();
  registerIpc(() => mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
