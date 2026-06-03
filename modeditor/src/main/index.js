const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { TMP_DIR, WADS_DIR, TEXTURES_SRC_DIR, ensureRuntimeDirs } = require('./paths');
const { compileMap, compileMapOnlyEnts } = require('./compileTools');
const { deployBsp, DEFAULT_DESTINATION } = require('./deployBsp');
const { buildMapText, wadKeyFromPaths } = require('./mapWriter');
const { loadWad } = require('./wadLoader');
const { ensureAutoWad, ensureDebugWad } = require('./wadWriter');
const { ensureTexturesWad } = require('./texturesWadBuilder');
const { deserialiseTilemap } = require('../shared/types');

// Note: don't read app.isPackaged here — depending on how Electron is
// launched, app may not be fully initialised yet. Treat any run with the
// --dev flag as dev mode; otherwise fall back to a packaged-style load.
const isDev = process.argv.includes('--dev');
ensureRuntimeDirs();

// ---------- compile cache ----------
// Snapshot del ultimo compile exitoso por basename. Persiste a disco
// (tmp/.compile-cache.json) para que al relanzar el editor no perdamos
// la huella del último .bsp — el caso típico es: el usuario relanza,
// modifica solo una entidad, y aun así la primera compilación es full
// (cara). Con persistencia, esa primera compilación detecta que el
// .bsp ya está al día geométricamente y puede ir por la ruta onlyents
// o saltarse del todo si nada cambió.
//
// Guarda de seguridad: al cargar, verificamos que el .bsp apuntado
// existe y su mtime es ≥ cache.savedAt. Si alguien tocó el .bsp por
// fuera (recompiló a mano, deploy externo, etc.) la entrada se descarta
// y caemos a full compile.
//
// Estructura: Map<basename, { geomHash, entHash, bspPath, savedAt }>.
const compileCache = new Map();
const COMPILE_CACHE_PATH = path.join(TMP_DIR, '.compile-cache.json');

async function loadCompileCache() {
  try {
    const text = await fs.readFile(COMPILE_CACHE_PATH, 'utf8').catch(() => null);
    if (text == null) {
      // Nunca compilamos en este sistema (o se borró el cache). Intenta
      // pre-popular contra el tilemap y .bsp que ya hay en disco — así
      // un editor recién instalado / recién relanzado puede ir por la
      // ruta rápida en el primer compile si el usuario solo toca
      // entidades.
      await prepopulateCompileCache();
      return;
    }
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') return;
    for (const [basename, entry] of Object.entries(obj)) {
      if (!entry || !entry.bspPath) continue;
      // Solo aceptamos la entrada si el .bsp sigue existiendo y no fue
      // tocado por fuera desde el último compile que registramos.
      const stat = await fs.stat(entry.bspPath).catch(() => null);
      if (!stat) continue;
      if (typeof entry.savedAt === 'number' && stat.mtimeMs > entry.savedAt + 1000) {
        // El .bsp es más reciente que nuestro registro: alguien lo tocó.
        continue;
      }
      compileCache.set(basename, entry);
    }
  } catch (err) {
    console.error('[compile-cache] load failed:', err);
  }
}

// Pre-popula el cache cuando arrancamos sin .compile-cache.json pero sí
// con tilemap.json + .bsp existentes en disco. Calcula el hash del
// tilemap actual asumiendo defaults razonables (debug=false, phong=true)
// y registra que ese .bsp corresponde a ese tilemap. Si los defaults no
// coinciden con la última compilación real, el hash no encajará y la
// próxima compilación irá por full compile — no es peor que el estado
// actual.
async function prepopulateCompileCache() {
  try {
    const basename = 'uplifter';
    const tmapPath = path.join(TMP_DIR, `${basename}.tmap.json`);
    const bspPath = path.join(TMP_DIR, `${basename}.bsp`);
    const [tmapStat, bspStat] = await Promise.all([
      fs.stat(tmapPath).catch(() => null),
      fs.stat(bspPath).catch(() => null),
    ]);
    if (!tmapStat || !bspStat) return; // sin tilemap o sin bsp, nada que precachear
    const tmapText = await fs.readFile(tmapPath, 'utf8');
    const tmapRaw = JSON.parse(tmapText);
    const t = deserialiseTilemap(tmapRaw);
    const wads = await listWads();
    const wadKey = wadKeyFromPaths(wads);
    // Asumimos los defaults del UI (debug off, phong on). Si el usuario
    // compiló con otros flags, el hash no coincidirá → full compile, que
    // es el comportamiento actual.
    const geomHash = hashGeometry(t, { wadKey, debug: false, phong: true });
    const entHash = hashEntities(t);
    compileCache.set(basename, {
      geomHash,
      entHash,
      bspPath,
      // Usamos el mtime del .bsp como savedAt para que la guarda de
      // "tocado por fuera" no descarte la entrada en el siguiente arranque.
      savedAt: Math.floor(bspStat.mtimeMs),
    });
    await saveCompileCache();
    console.log('[compile-cache] prepopulated from existing .bsp + tilemap');
  } catch (err) {
    console.error('[compile-cache] prepopulate failed:', err);
  }
}

async function saveCompileCache() {
  try {
    const obj = {};
    for (const [k, v] of compileCache.entries()) obj[k] = v;
    await fs.writeFile(COMPILE_CACHE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('[compile-cache] save failed:', err);
  }
}

/** Stable JSON: typed arrays a Array para que JSON.stringify de un
 *  resultado determinista, y orden de keys por sort para que cambios
 *  cosmeticos en el objeto no afecten al hash. */
function stableJSONString(value) {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (ArrayBuffer.isView(value)) {
    // Int8Array, Int16Array, Uint8Array, etc. — serializamos como array
    // de numeros. JSON.stringify(typedArray) ya hace esto, pero
    // explicito para que el contrato sea claro.
    return JSON.stringify(Array.from(value));
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableJSONString).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableJSONString(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/** Version del generador de geometria del mapWriter. Se incluye en el
 *  geomHash para que un cambio en COMO se emite la geometria (y no en los
 *  datos del tilemap) invalide los .bsp cacheados y fuerce un full
 *  recompile. Súbela cuando toques la geometria que emite el writer y
 *  quieras que mapas ya compilados la recojan.
 *    1 → baseline.
 *    2 → banda de nubes (func_detail_illusionary {cloud_N), ver nubes.md.
 *    3 → nubes redondas (radial puff + UV 1:1) y banda bajada a ~1740.
 *    4 → nubes discretas (volumen apilado por capas) + textura esponjosa.
 *    5 → capas finas/juntas, sombreado invertido + rim line + edge dither.
 *    6 → margen transparente (sin corte recto en el borde) + menos densas.
 *    7 → rim direccional (solo lado del sol) en vez de contorno completo.
 *    8 → mips re-ditherados (borde suave a distancia) + feather ancho.
 *    9 → nubes volumétricas reales (volumen 3D cortado en capas-textura).
 *   10 → nubes pregeneradas offline (clouds.wad + prefabs), corte en 3 ejes.
 *   11 → nubes como entidades `cloud` (modelo sólido b_cloud0.bsp, no-sólido). */
const GEOM_WRITER_VERSION = 11;

/** Hash de TODO lo que afecta a la geometria/BSP/iluminacion del .bsp.
 *  Si este hash cambia, hay que recompilar completo (qbsp + light). */
function hashGeometry(t, { wadKey, debug, phong }) {
  const payload = {
    geomWriterVersion: GEOM_WRITER_VERSION,
    cols: t.cols, rows: t.rows, cellSize: t.cellSize,
    heights: t.heights,
    textures: t.textures,
    objects: t.objects,
    decorations: t.decorations,
    smoothing: t.smoothing,
    sun: t.sun,
    quality: t.quality,
    playArea: t.playArea,
    wadKey,
    debug: !!debug,
    phong: !!phong,
  };
  return sha256Hex(stableJSONString(payload));
}

/** Hash de SOLO los campos que van al entdata lump (enemies, patrols,
 *  spawn). Si solo este hash cambia → qbsp -onlyents basta. */
function hashEntities(t) {
  const payload = {
    enemies: t.enemies,
    patrols: t.patrols,
    spawn: t.spawn,
  };
  return sha256Hex(stableJSONString(payload));
}

async function fileExists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}

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

/**
 * Regenerate the runtime-managed WAD files (auto.wad + textures.wad).
 * Both are no-ops on the fast path: auto.wad is cheap to rewrite,
 * textures.wad compares mtimes against the manifest and skips when
 * nothing has changed. Called at app launch AND before every compile,
 * so editing a PNG and hitting Compile picks up the change without
 * restarting the app.
 *
 * `send` is the compile-log forwarder; when provided, the rebuilt
 * textures.wad event surfaces in the editor's log panel.
 */
async function refreshAutoWads(send) {
  try {
    await ensureAutoWad(path.join(WADS_DIR, 'auto.wad'));
  } catch (err) {
    console.error('[auto.wad]', err);
    if (send) send({ stream: 'meta', tool: 'auto.wad', line: `ERROR: ${err.message}` });
  }
  // debug.wad: contiene texturas planas dbg_* usadas en modo debug
  // (lanzando con debug_iw.exe). Siempre referenciada en worldspawn `wad`;
  // no se aplica en modo normal, asi que su presencia no afecta al juego.
  try {
    await ensureDebugWad(path.join(WADS_DIR, 'debug.wad'));
  } catch (err) {
    console.error('[debug.wad]', err);
    if (send) send({ stream: 'meta', tool: 'debug.wad', line: `ERROR: ${err.message}` });
  }
  try {
    const r = await ensureTexturesWad(
      TEXTURES_SRC_DIR,
      path.join(WADS_DIR, 'textures.wad'),
      path.join(TMP_DIR, 'textures.wad.manifest.json'),
    );
    if (r.rebuilt) {
      const header = `rebuilt textures.wad with ${r.count} miptexes`
        + (r.reason ? ` (${r.reason})` : '');
      console.log(`[textures.wad] ${header}`);
      if (send) send({ stream: 'meta', tool: 'textures.wad', line: header });
      // List the actual PNG changes so the user can see exactly which
      // file edits triggered the rebuild. Capped per category to keep
      // the log skimmable on bulk edits.
      const cat = (label, list) => {
        if (!list || list.length === 0) return;
        const MAX = 8;
        const head = list.slice(0, MAX).join(', ');
        const tail = list.length > MAX ? ` (+${list.length - MAX} more)` : '';
        const line = `  ${label}: ${head}${tail}`;
        console.log(`[textures.wad] ${line}`);
        if (send) send({ stream: 'meta', tool: 'textures.wad', line });
      };
      if (r.changes) {
        cat('added',    r.changes.added);
        cat('modified', r.changes.modified);
        cat('removed',  r.changes.removed);
      }
    }
  } catch (err) {
    console.error('[textures.wad]', err);
    if (send) send({ stream: 'meta', tool: 'textures.wad', line: `ERROR: ${err.message}` });
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

  ipcMain.handle('compile:run', async (_evt, { tilemap, basename = 'uplifter', debug = false, phong = true } = {}) => {
    const win = getWindow();
    const send = (entry) => {
      try { win.webContents.send('compile:log', entry); } catch {}
    };
    const startedAt = Date.now();
    try {
      // Pick up any art edits that happened since the app started.
      // refreshAutoWads is a no-op on the fast path (manifest hits)
      // so this only costs anything when the user actually changed
      // a PNG. listWads() below will see the freshly-written WADs.
      await refreshAutoWads(send);
      const t = deserialiseTilemap(tilemap);
      const wads = await listWads();
      const wadKey = wadKeyFromPaths(wads);

      // Decidir estrategia: full vs onlyents vs skip. Calculamos dos
      // hashes sobre el tilemap deserializado:
      //   geomHash → todo lo que afecta a la BSP (geometria, texturas,
      //              iluminacion, playArea, debug/phong, wadKey).
      //   entHash  → solo enemies/patrols/spawn (lo que va al entdata).
      // Comparamos con el ultimo compile exitoso del mismo basename:
      //   - geom igual + ent igual                → skip (devuelve cache).
      //   - geom igual + ent distinto + .bsp ok   → qbsp -onlyents.
      //   - cualquier otro caso                   → full compile.
      const geomHash = hashGeometry(t, { wadKey, debug, phong });
      const entHash = hashEntities(t);
      const cached = compileCache.get(basename);
      const bspPath = path.join(TMP_DIR, `${basename}.bsp`);
      const bspExists = await fileExists(bspPath);
      const sameGeom = cached && cached.geomHash === geomHash && bspExists;
      const sameEnts = cached && cached.entHash === entHash;

      if (sameGeom && sameEnts) {
        send({ stream: 'meta', tool: 'compile', line: 'no changes since last compile — reusing existing .bsp' });
        const elapsedMs = Date.now() - startedAt;
        return { ok: true, leaked: false, bspPath, lastTool: 'cache', exitCode: 0, elapsedMs, skipped: true };
      }

      // Escribir el .map (siempre, para que qbsp -onlyents tenga el
      // .map fresco con las entidades nuevas).
      const built = buildMapText({ tilemap: t, wadKey, debug, phong });
      const mapPath = path.join(TMP_DIR, `${basename}.map`);
      await fs.writeFile(mapPath, built.text, 'utf8');
      send({ stream: 'meta', tool: 'mapWriter', line: `wrote ${mapPath} (${built.text.length} bytes${debug ? ', debug mode' : ''})` });
      for (const m of built.info ?? []) {
        send({ stream: 'meta', tool: 'mapWriter', line: m });
      }
      for (const w of built.warnings) {
        send({ stream: 'meta', tool: 'mapWriter', line: `WARNING: ${w}` });
      }

      let result;
      if (sameGeom) {
        // Ruta incremental: solo cambiaron entidades. qbsp -onlyents
        // reescribe el lump entdata del .bsp existente.
        send({ stream: 'meta', tool: 'compile', line: 'geometry unchanged — running qbsp -onlyents' });
        result = await compileMapOnlyEnts(basename, send);
      } else {
        result = await compileMap(basename, send, { quality: t.quality || 'fast' });
      }

      // Actualizamos el cache solo si la compilacion tuvo exito. En el
      // caso onlyents, el geomHash se queda igual al cacheado (no
      // recalculamos geometria); el entHash es el nuevo.
      if (result.ok) {
        compileCache.set(basename, {
          geomHash,
          entHash,
          bspPath: result.bspPath,
          savedAt: Date.now(),
        });
        // Persiste sin esperar — no bloqueamos el response al renderer.
        saveCompileCache();
      }

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

  // Devuelve la ruta al .bsp ya compilado para `basename` si existe. El
  // renderer lo usa al arrancar para sembrar `lastBspPath` y habilitar el
  // botón "Lanzar" sin obligar a recompilar primero.
  ipcMain.handle('bsp:findExisting', async (_evt, { basename = 'uplifter' } = {}) => {
    try {
      const bspPath = path.join(TMP_DIR, `${basename}.bsp`);
      if (await fileExists(bspPath)) {
        return { ok: true, bspPath };
      }
      return { ok: false };
    } catch (err) {
      return { ok: false, error: err.message };
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

  ipcMain.handle('quake:launch', async (_evt, { map = 'uplifter', game = 'uplifter', cwd = 'd:\\quake', debug = false } = {}) => {
    try {
      // Lanzamos por defecto debug_iw.exe (Ironwail patcheado con el comando
      // 'debug_point'). En consola del juego con debug_point se hace un
      // traceline 4000u hacia delante y se escribe debug.txt con la textura
      // del face impactado — clave para saber que brush emite el .map en
      // modo debug (cada kind usa una textura distinta).
      const exeName = debug ? 'debug_iw.exe' : 'ironwail.exe';
      const exePath = path.join(cwd, exeName);
      if (!(await fs.stat(exePath).catch(() => null))) {
        return { ok: false, error: `${exeName} not found at ${exePath}` };
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

  // Log de debug para el renderer cuando DevTools no esta accesible
  // (caso del usuario corriendo dentro de Eclipse u otro entorno). El
  // renderer llama window.modeditor.debug.log('mensaje', ...) y queda
  // escrito en tmp/debug.log con timestamp. Tail-eable desde la build.
  // El archivo se trunca al iniciar la app para no crecer infinito.
  const DEBUG_LOG_PATH = path.join(TMP_DIR, 'debug.log');
  // Trunca el log al arrancar para no acumular sesiones anteriores.
  // Sync porque estamos dentro de registerIpc (no async); el coste es
  // marginal (un escribir-vacio una sola vez al inicio).
  try { require('node:fs').writeFileSync(DEBUG_LOG_PATH, ''); } catch {}
  ipcMain.handle('debug:log', async (_evt, line) => {
    try {
      const ts = new Date().toISOString().slice(11, 23);
      await fs.appendFile(DEBUG_LOG_PATH, `[${ts}] ${line}\n`);
    } catch {}
  });

  ipcMain.handle('app:defaults', async () => ({
    deployDest: DEFAULT_DESTINATION,
    quakeCwd: 'd:\\quake',
    quakeGame: 'uplifter',
  }));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await refreshAutoWads();
  // Carga el cache de compile persistido (si lo hay). Esto permite que
  // la primera compilación tras un relaunch use la ruta rápida
  // (skip / onlyents) en lugar de un full compile innecesario.
  await loadCompileCache();
  let mainWindow = createMainWindow();
  registerIpc(() => mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
