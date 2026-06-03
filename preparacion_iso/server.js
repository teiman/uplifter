const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8088;
const ROOT = __dirname;
const PID_FILE = path.join(os.tmpdir(), 'preparacion_iso_server.pid');
const SHUTDOWN_TOKEN = 'preparacion-iso-shutdown';

// === Modelo de patrones =====================================================
//
// Cubos: 9 bits, uno por celda del grid 3x3. Bit (r*3 + c). El centro (bit 4)
// siempre esta vacio.
//
// Decoraciones (kinds que el usuario coloca en celdas vacias):
//   - ramp       : rampa simple. dir ∈ {0,1,2,3} = N/E/S/O. Lado alto contra el cubo adyacente en dir.
//   - ramp_u     : dos rampas opuestas en U. dir ∈ {0,1} = NS / EO. Lado alto contra los dos cubos opuestos.
//   - ramp_diag  : rampa diagonal. dir ∈ {0,1,2,3} = NE/SE/SO/NO. Lado alto contra el cubo en la esquina diagonal.
//
// Direcciones ortogonales (para ramp y ramp_u): 0=N (r-1), 1=E (c+1), 2=S (r+1), 3=O (c-1).
// Direcciones diagonales (para ramp_diag): 0=NE (-1,+1), 1=SE (+1,+1), 2=SO (+1,-1), 3=NO (-1,-1).

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const DDR = [-1, 1, 1, -1];
const DDC = [1, 1, -1, -1];

const CENTER_BIT = 1 << 4;

function rcToBit(r, c) { return 1 << (r * 3 + c); }
function rotCell(r, c) { return [c, 2 - r]; }
function rotDir4(d) { return (d + 1) & 3; }
// Rotacion horaria de las direcciones diagonales: NE->SE->SO->NO->NE, es decir +1 mod 4 con esta indexacion.
function rotDirDiag(d) { return (d + 1) & 3; }

function rotate90Cubes(bits) {
  let out = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if ((bits >> (r * 3 + c)) & 1) {
        const [nr, nc] = rotCell(r, c);
        out |= rcToBit(nr, nc);
      }
    }
  }
  return out;
}

// === Generacion de casos aleatorios =========================================
// Un caso es solo el conjunto de cubos (sin decoraciones). Filtramos casos
// degenerados: queremos al menos 1 cubo y al menos 1 celda vacia adyacente
// a un cubo (asi siempre hay decoraciones posibles).

function hasDecorableCell(cubes) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if ((cubes >> (r * 3 + c)) & 1) continue;
      for (let d = 0; d < 4; d++) {
        const ar = r + DR[d], ac = c + DC[d];
        if (ar < 0 || ar > 2 || ac < 0 || ac > 2) continue;
        if ((cubes >> (ar * 3 + ac)) & 1) return true;
      }
    }
  }
  return false;
}

function randomCase() {
  while (true) {
    // 9 bits aleatorios, centro forzado a 0.
    const cubes = Math.floor(Math.random() * 512) & ~CENTER_BIT;
    if (cubes === 0) continue;
    if (!hasDecorableCell(cubes)) continue;
    // Devolvemos siempre la forma canonica para que las decoraciones guardadas
    // (que estan en coordenadas del caso servido) coincidan con la rotacion
    // del caso al recargarlo. Si servieramos rotaciones distintas, las
    // decoraciones precargadas apareceria en celdas erroneas.
    return canonicalCubes(cubes);
  }
}

// === Clave canonica del caso (solo cubos) ===================================
// Casos rotados son el mismo caso. La id estable es el minimo bajo las 4 rotaciones.

function canonicalCubes(cubes) {
  let best = cubes, cur = cubes;
  for (let i = 0; i < 3; i++) {
    cur = rotate90Cubes(cur);
    if (cur < best) best = cur;
  }
  return best;
}

function caseId(cubes) {
  return canonicalCubes(cubes).toString(16).padStart(3, '0');
}

// Cuantas rotaciones 90 horarias hacen falta para llegar al canonico.
// Devuelve k en {0,1,2,3} tal que rotar(cubes, k) === canonicalCubes(cubes).
function rotationsToCanonical(cubes) {
  let cur = cubes;
  const target = canonicalCubes(cubes);
  for (let k = 0; k < 4; k++) {
    if (cur === target) return k;
    cur = rotate90Cubes(cur);
  }
  // Imposible si target es el minimo de las 4 rotaciones, pero por seguridad:
  return 0;
}

// Rota una decoracion k veces 90 horarios.
function rotateDecoration(dec, k) {
  let r = dec.row, c = dec.col, dir = dec.dir;
  for (let i = 0; i < k; i++) {
    const nr = c;
    const nc = 2 - r;
    r = nr; c = nc;
    if (dec.kind === 'ramp' || dec.kind === 'ramp_diag' ||
        dec.kind === 'corner_in' || dec.kind === 'corner_out' ||
        dec.kind === 'three_corners') {
      dir = (dir + 1) & 3;
    } else if (dec.kind === 'ramp_u') {
      dir = (dir + 1) % 2;
    }
    // pit, pyramid, cube, unknown, pit_diag: dir invariante.
  }
  return { row: r, col: c, kind: dec.kind, dir };
}

function bitsToGrid(bits) {
  const grid = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      row.push(((bits >> (r * 3 + c)) & 1) === 1);
    }
    grid.push(row);
  }
  return grid;
}

// === Validacion de decoraciones =============================================
// Una decoracion en celda (r,c) es valida si la celda esta vacia y los cubos
// adyacentes requeridos existen.

// Validacion ligera: solo comprueba formato de campos. La adyacencia a cubos
// se trata como recomendacion en el cliente; el usuario puede guardar lo que
// quiera (incluido un kind sin cubos adyacentes) y el server lo persiste.
function validateSolution(cubes, decorations) {
  if (!Array.isArray(decorations)) return 'decorations debe ser un array';
  const validKinds = new Set([
    'ramp', 'ramp_u', 'ramp_diag', 'pit',
    'corner_in', 'corner_out', 'pyramid',
    'cube', 'unknown',
    'wedge',
    'ramp_u_closed',
    'bridge_diag',
  ]);
  for (const d of decorations) {
    if (typeof d !== 'object' || d === null) return 'decoracion no es objeto';
    const { row, col, kind, dir } = d;
    if (!Number.isInteger(row) || row < 0 || row > 2) return 'row invalida';
    if (!Number.isInteger(col) || col < 0 || col > 2) return 'col invalida';
    if (!validKinds.has(kind)) return `kind invalido: ${kind}`;
    if (!Number.isInteger(dir) || dir < 0) return 'dir invalida';
    if ((kind === 'ramp_u' || kind === 'bridge_diag') && dir > 1) {
      return `${kind} dir debe ser 0 o 1`;
    }
    if ((kind === 'pit' || kind === 'pyramid' || kind === 'cube' || kind === 'unknown') && dir !== 0) {
      return `${kind} dir debe ser 0`;
    }
    if ((kind === 'ramp' || kind === 'ramp_diag' ||
         kind === 'corner_in' || kind === 'corner_out' || kind === 'wedge' ||
         kind === 'ramp_u_closed') && dir > 3) {
      return `${kind} dir debe ser 0..3`;
    }
  }
  return null;
}

// === Persistencia de soluciones =============================================
// Una carpeta `solutions/` con un fichero JSON por caso: `<id>.json`.
// El id es la representacion canonica de los cubos en hex (3 digitos), asi que
// dos casos rotados comparten fichero.
const SOLUTIONS_DIR = path.join(ROOT, 'solutions');

function ensureSolutionsDir() {
  try { fs.mkdirSync(SOLUTIONS_DIR, { recursive: true }); } catch {}
}

function solutionFile(id) {
  if (!/^[0-9a-f]{1,4}$/.test(id)) return null; // sanea id antes de tocar fs
  return path.join(SOLUTIONS_DIR, id + '.json');
}

function loadCaseSolution(id) {
  const f = solutionFile(id);
  if (!f) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch { return null; }
}

// === Persistencia de estado de galeria ======================================
// gallery_status.json mapea "<kind>/<dir>" -> true|false. Indica si esa figura
// se renderiza bien en la vista isometrica de la galeria. Lo marca el usuario
// con un checkbox; lo usamos como referencia para saber que kinds estan
// visualmente correctos.
const GALLERY_STATUS_FILE = path.join(ROOT, 'gallery_status.json');

function loadGalleryStatus() {
  try { return JSON.parse(fs.readFileSync(GALLERY_STATUS_FILE, 'utf8')); }
  catch { return {}; }
}

function writeGalleryStatus(obj) {
  fs.writeFileSync(GALLERY_STATUS_FILE, JSON.stringify(obj, null, 2));
}

function writeCaseSolution(id, data) {
  ensureSolutionsDir();
  const f = solutionFile(id);
  if (!f) throw new Error('id invalido');
  fs.writeFileSync(f, JSON.stringify(data, null, 2));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// === Logging persistente ====================================================
// server.log: log estructurado para debug, no solo "method url status".
// Cada linea: <ISO> <LEVEL> <tag> <key=value>... Campos legibles a ojo y
// grep-ables. Adicionalmente, INFO/WARN/ERROR son consistentes:
//   - INFO  : peticion 2xx, ciclo de vida del proceso
//   - WARN  : peticion 4xx (cliente envia algo mal); incluye body recibido
//   - ERROR : 5xx, excepcion no manejada, fallos de I/O
const LOG_FILE = path.join(ROOT, 'server.log');

function logLine(level, msg) {
  const line = `${new Date().toISOString()} ${level} ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  if (level !== 'INFO') {
    // Errores en vivo por stderr (los INFO no, para no llenar la consola).
    process.stderr.write(line);
  }
}

// Trunca y limpia un string para meter en el log (sin nuevas lineas).
function s(value, maxLen) {
  if (value === undefined) return '<undefined>';
  if (value === null) return '<null>';
  if (typeof value === 'object') {
    try { value = JSON.stringify(value); } catch { value = String(value); }
  } else {
    value = String(value);
  }
  value = value.replace(/\s+/g, ' ');
  const max = maxLen || 200;
  return value.length > max ? value.slice(0, max) + '...[' + value.length + 'B]' : value;
}

// Etiqueta una request para el log: req#NNN <ip>.
let __reqCounter = 0;
function tagReq(req) {
  if (!req.__tag) {
    req.__tag = `req#${++__reqCounter}`;
    const ip = (req.socket && req.socket.remoteAddress) || '-';
    const ua = (req.headers['user-agent'] || '').split(' ').pop() || '-';
    req.__meta = `ip=${ip} ua=${s(ua, 40)}`;
  }
  return req.__tag;
}

function logReq(req, res, extra) {
  const status = res.statusCode;
  const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
  const tag = tagReq(req);
  const dur = req.__t0 ? (Date.now() - req.__t0) + 'ms' : '-';
  const parts = [
    tag, level + '=' + status,
    `${req.method} ${s(req.url, 120)}`,
    `dur=${dur}`,
    req.__meta || '',
  ];
  if (res._lastError) parts.push(`err="${s(res._lastError, 200)}"`);
  if (res._respMeta) parts.push(res._respMeta);
  if (req.__bodySummary) parts.push(`body=${req.__bodySummary}`);
  if (extra) parts.push(extra);
  logLine(level, parts.filter(Boolean).join(' '));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(body));
  if (status >= 400 && body && body.error) res._lastError = body.error;
  // Anota meta de respuesta para que el log final tenga info de salida.
  if (status < 400 && body && typeof body === 'object') {
    const keys = Object.keys(body);
    if (keys.length > 0 && keys.length <= 5) {
      const meta = keys.map(k => {
        const v = body[k];
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
          return `${k}=${s(v, 40)}`;
        }
        if (Array.isArray(v)) return `${k}.length=${v.length}`;
        if (v && typeof v === 'object') return `${k}=<obj>`;
        return null;
      }).filter(Boolean).join(' ');
      if (meta) res._respMeta = 'resp{ ' + meta + ' }';
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { buf += chunk; if (buf.length > 64 * 1024) reject(new Error('body too large')); });
    req.on('end', () => {
      // Guardamos resumen del body para el log (truncado, sin saltos).
      req.__bodySummary = s(buf, 300);
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Lee la lista de ids ya guardados a partir de los ficheros en solutions/.
function listSavedIds() {
  try {
    const set = new Set();
    for (const f of fs.readdirSync(SOLUTIONS_DIR)) {
      const m = f.match(/^([0-9a-f]{1,4})\.json$/);
      if (m) set.add(m[1]);
    }
    return set;
  } catch { return new Set(); }
}

async function handleRequest(req, res) {
  // GET /api/case -> { id, cubes, grid, savedSolution? }
  if (req.method === 'GET' && req.url === '/api/case') {
    const cubes = randomCase();
    const id = caseId(cubes);
    const sol = loadCaseSolution(id);
    sendJson(res, 200, {
      id, cubes, grid: bitsToGrid(cubes),
      savedSolution: sol,
    });
    // Log de debug: id servido, si ya tenia solucion guardada (asi sabemos si
    // el cliente esta volviendo a "ver" casos ya resueltos como si fueran nuevos).
    res._respMeta = `case_served id=${id} cubes=0x${cubes.toString(16)} ` +
      `had_saved=${sol ? sol.quality : 'no'}`;
    return;
  }

  // GET /api/stats -> conteos para los contadores de la UI.
  if (req.method === 'GET' && req.url === '/api/stats') {
    let total = 0, good = 0, almost = 0, withUnknown = 0;
    try {
      const ids = listSavedIds();
      for (const id of ids) {
        const sol = loadCaseSolution(id);
        if (!sol) continue;
        total++;
        if (sol.quality === 'good') good++;
        else if (sol.quality === 'almost') almost++;
        if (Array.isArray(sol.decorations) && sol.decorations.some(d => d.kind === 'unknown')) {
          withUnknown++;
        }
      }
    } catch {}
    sendJson(res, 200, { total, good, almost, withUnknown });
    return;
  }

  // GET /api/case/with-unknown -> sortea entre los casos guardados que tienen
  // al menos una decoracion 'unknown' (los que dejaste a medias con ?).
  if (req.method === 'GET' && req.url === '/api/case/with-unknown') {
    const candidatos = [];
    for (const id of listSavedIds()) {
      const sol = loadCaseSolution(id);
      if (!sol) continue;
      if (Array.isArray(sol.decorations) && sol.decorations.some(d => d.kind === 'unknown')) {
        candidatos.push({ id, sol });
      }
    }
    if (candidatos.length === 0) {
      sendJson(res, 404, { error: 'no quedan casos con ?' });
      return;
    }
    const pick = candidatos[Math.floor(Math.random() * candidatos.length)];
    const cubes = pick.sol.cubes;
    sendJson(res, 200, {
      id: pick.id, cubes, grid: bitsToGrid(cubes),
      savedSolution: pick.sol,
    });
    res._respMeta = `case_with_unknown id=${pick.id} pool=${candidatos.length}`;
    return;
  }

  // GET /api/case/unevaluated -> mismo formato; rechaza casos cuyo id ya este
  // en solutions/. Si tras un n umero alto de intentos no encuentra ninguno
  // (puede haberse evaluado todo el espacio), devuelve 404.
  if (req.method === 'GET' && req.url === '/api/case/unevaluated') {
    const saved = listSavedIds();
    for (let attempt = 0; attempt < 500; attempt++) {
      const cubes = randomCase();
      const id = caseId(cubes);
      if (saved.has(id)) continue;
      sendJson(res, 200, { id, cubes, grid: bitsToGrid(cubes), savedSolution: null });
      return;
    }
    sendJson(res, 404, { error: 'no se encontro caso sin evaluar tras 500 intentos' });
    return;
  }

  // GET /api/case/by-id?id=XXX -> carga el caso canonico cuyos cubes tienen ese id.
  if (req.method === 'GET' && req.url.startsWith('/api/case/by-id')) {
    const u = new URL(req.url, 'http://localhost');
    const idParam = (u.searchParams.get('id') || '').toLowerCase().replace(/^l/, '');
    if (!/^[0-9a-f]{1,3}$/.test(idParam)) {
      sendJson(res, 400, { error: 'id invalido (esperado hasta 3 hex)' }); return;
    }
    const cubes = parseInt(idParam, 16);
    if (cubes < 0 || cubes >= 512) {
      sendJson(res, 400, { error: 'id fuera de rango' }); return;
    }
    if (cubes & CENTER_BIT) {
      sendJson(res, 400, { error: 'centro debe estar vacio (bit 4 = 0)' }); return;
    }
    // Si el cubes no es la forma canonica, lo devolvemos en canonica para que id coincida.
    const canon = canonicalCubes(cubes);
    const id = caseId(canon);
    sendJson(res, 200, {
      id, cubes: canon, grid: bitsToGrid(canon),
      savedSolution: loadCaseSolution(id),
    });
    return;
  }

  // GET /api/gallery-status -> { "<kind>/<dir>": true|false, ... }
  if (req.method === 'GET' && req.url === '/api/gallery-status') {
    sendJson(res, 200, loadGalleryStatus());
    return;
  }

  // POST /api/gallery-status  body: { key, ok }
  if (req.method === 'POST' && req.url === '/api/gallery-status') {
    let body;
    try { body = await readJsonBody(req); }
    catch { sendJson(res, 400, { error: 'json invalido' }); return; }
    const { key, ok } = body;
    if (typeof key !== 'string' || !/^[a-z_]+\/[0-9]+$/.test(key)) {
      sendJson(res, 400, { error: 'key invalida' }); return;
    }
    if (typeof ok !== 'boolean') {
      sendJson(res, 400, { error: 'ok debe ser boolean' }); return;
    }
    const data = loadGalleryStatus();
    data[key] = ok;
    writeGalleryStatus(data);
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/solution  body: { id, cubes, decorations, quality }
  if (req.method === 'POST' && req.url === '/api/solution') {
    let body;
    try { body = await readJsonBody(req); }
    catch { sendJson(res, 400, { error: 'json invalido' }); return; }
    const { id, cubes, decorations, quality } = body;
    if (typeof cubes !== 'number' || typeof id !== 'string') {
      sendJson(res, 400, { error: 'faltan id/cubes' }); return;
    }
    if (caseId(cubes) !== id) {
      sendJson(res, 400, { error: 'id no coincide con cubes' }); return;
    }
    if (quality !== 'good' && quality !== 'almost') {
      sendJson(res, 400, { error: 'quality debe ser "good" o "almost"' }); return;
    }
    const err = validateSolution(cubes, decorations || []);
    if (err) { sendJson(res, 400, { error: err }); return; }
    // Normalizamos a coordenadas canonicas: el caso se guarda siempre como si
    // los cubos estuvieran en su forma canonica, y las decoraciones rotadas
    // de la misma manera. Asi, sea cual sea la rotacion en que el cliente
    // ediro y guardo (incluso si pulso "Rotar 90" varias veces), al recargarlo
    // el caso vuelve a salir alineado.
    const k = rotationsToCanonical(cubes);
    const canonCubes = canonicalCubes(cubes);
    const canonDecs = (decorations || []).map(d => rotateDecoration(d, k));
    // Diagnostico: leemos la solucion ANTES de sobrescribir para saber si es
    // re-guardado o nuevo. Si es re-guardado, comparamos quality y decs.
    const prev = loadCaseSolution(id);
    const isResave = !!prev;
    const qualityChanged = isResave && prev.quality !== quality;
    const numDecs = canonDecs.length;
    const prevNumDecs = isResave ? (prev.decorations || []).length : 0;
    const numUnknown = canonDecs.filter(d => d.kind === 'unknown').length;
    writeCaseSolution(id, {
      id,
      cubes: canonCubes,
      decorations: canonDecs,
      quality,
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, 200, { ok: true, quality });
    // Log estructurado del save: facil de grep.
    res._respMeta = `solution_saved id=${id} cubes=0x${canonCubes.toString(16)} ` +
      `quality=${quality} resave=${isResave} ` +
      (isResave ? `prev_quality=${prev.quality} quality_changed=${qualityChanged} prev_decs=${prevNumDecs} ` : '') +
      `decs=${numDecs} unknown=${numUnknown} rot_to_canonical=${k}`;
    return;
  }

  if (req.method === 'POST' && req.url === `/__shutdown?token=${SHUTDOWN_TOKEN}`) {
    res.setHeader('Connection', 'close');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('shutting down');
    console.log('Recibida orden de shutdown; cerrando.');
    // Cierra el listening socket de inmediato y termina sin esperar conexiones vivas.
    try { server.close(); } catch {}
    cleanupPidFile();
    logLine('INFO', `=== SHUTDOWN endpoint hit, pid=${process.pid} exiting ===`);
    setImmediate(() => process.exit(0));
    return;
  }

  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  req.__t0 = Date.now();
  tagReq(req);
  res.on('finish', () => logReq(req, res));
  res.on('error', e => {
    logLine('ERROR', `${tagReq(req)} stream error: ${e.message}`);
  });
  try {
    await handleRequest(req, res);
  } catch (e) {
    logLine('ERROR', `${tagReq(req)} unhandled exception: ${e.message}\n${e.stack || ''}`);
    if (!res.headersSent) {
      try { sendJson(res, 500, { error: 'internal server error' }); } catch {}
    } else {
      try { res.end(); } catch {}
    }
  }
});

function requestShutdown() {
  return new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, method: 'POST',
      path: `/__shutdown?token=${SHUTDOWN_TOKEN}`,
      timeout: 1000,
    }, res => {
      res.resume();
      // Solo lo damos por bueno si la instancia anterior reconoce el endpoint.
      // Un 404 (instancia vieja sin esta ruta) o cualquier otro código no cuenta.
      const ok = res.statusCode === 200;
      res.on('end', () => resolve(ok));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// Comprueba si podemos ocupar el puerto creando un servidor de prueba y cerrandolo.
// Es mas fiable que hacer un GET: detecta el caso real que nos importa (EADDRINUSE en listen).
function tryClaimPort() {
  return new Promise(resolve => {
    const probe = http.createServer();
    probe.once('error', err => resolve(err.code !== 'EADDRINUSE' ? true : false));
    probe.listen(PORT, '0.0.0.0', () => {
      probe.close(() => resolve(true));
    });
  });
}

async function waitPortFree(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tryClaimPort()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

function killByPidFile() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!pid || pid === process.pid) return false;
    process.kill(pid);
    console.log(`Enviada señal de terminación al PID ${pid}.`);
    return true;
  } catch {
    return false;
  }
}

function writePidFile() {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch {}
}

function cleanupPidFile() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid === process.pid) fs.unlinkSync(PID_FILE);
  } catch {}
}

async function start() {
  // 1) Pedir shutdown limpio a la instancia previa, si hay una escuchando.
  const acked = await requestShutdown();
  if (acked) {
    console.log('Instancia previa avisada; esperando a que libere el puerto.');
    const ok = await waitPortFree(8000);
    if (!ok) {
      // El proceso viejo aceptó el shutdown pero sigue reteniendo el puerto
      // (caso típico bajo debugger). Forzar por PID.
      console.log('Sigue ocupado tras ACK; forzando por PID.');
      if (killByPidFile()) await waitPortFree(5000);
    }
  } else {
    // 2) Fallback: matar por PID guardado.
    if (killByPidFile()) await waitPortFree(5000);
  }

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`El puerto ${PORT} sigue ocupado y no se pudo liberar.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    writePidFile();
    const url = `http://localhost:${PORT}`;
    console.log('');
    console.log('==========================================');
    console.log(`  preparacion_iso server listo`);
    console.log(`  URL: ${url}`);
    console.log(`  pid: ${process.pid}`);
    console.log('==========================================');
    console.log('');
    logLine('INFO', `=== SERVER START pid=${process.pid} port=${PORT} ===`);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logLine('INFO', `=== SERVER SHUTDOWN signal=${sig} pid=${process.pid} ===`);
    cleanupPidFile();
    process.exit(0);
  });
}
process.on('exit', code => {
  logLine('INFO', `=== SERVER EXIT pid=${process.pid} code=${code} ===`);
  cleanupPidFile();
});
process.on('uncaughtException', e => {
  logLine('ERROR', `uncaughtException: ${e.message}\n${e.stack || ''}`);
});
process.on('unhandledRejection', e => {
  logLine('ERROR', `unhandledRejection: ${e && e.message || e}\n${e && e.stack || ''}`);
});

start();
