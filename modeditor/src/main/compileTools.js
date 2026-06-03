/**
 * Run qbsp + vis + light on tmp/<base>.map.
 *
 * Streams stdout/stderr line by line via onLog. Stops at the first non-zero
 * exit code. qbsp also writes a .pts file when -leaktest detects a leak —
 * we surface that as a warning even when qbsp exits 0.
 *
 * Flags fixed by Uplifter:
 *   qbsp: -bsp2 -worldextent 32768 -leaktest
 *   light/vis: by quality profile (fast | hq).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const { BIN_DIR, TMP_DIR } = require('./paths');

// -subdivide 512: large faces (sky walls, bedrock, global water) are
// partitioned into manageable tiles. La logica:
//  - El default qbsp (240) sobre-subdivide caras gigantes (el world box
//    de ±16384u), explotando el numero de superficies y el tiempo de vis.
//  - 1024 funciona en mapas pequenos pero, cuando hay decenas de miles
//    de cortes BSP encima (terreno + ~20k decos de erosion), una cara
//    fragmentada termina con >64 edges en EmitEdges y qbsp aborta.
//  - 512 es el punto medio: caras del sky/water/bedrock se rompen en
//    trozos mas chicos (mas faces) sin alcanzar el cap, y el subface
//    sigue por debajo del limite 256x256 luxels del motor.
const QBSP_FLAGS = ['-bsp2', '-subdivide', '512', '-worldextent', '32768', '-leaktest'];

// En modo flat el mapa no tiene erosion (sin decenas de miles de decos),
// asi que el cap de 64 edges por face de qbsp no se acerca al limite y
// podemos relajar el subdivide a 1024: menos cortes en las caras gigantes
// del sky/bedrock => qbsp procesa menos faces => mas rapido.
const QBSP_FLAGS_FLAT = ['-bsp2', '-subdivide', '1024', '-worldextent', '32768', '-leaktest'];

// Fast-profile light flags:
//   -sunsamples 1  — single sample for sun penumbra instead of the default
//     100. Sun shadows go from soft-edged to hard-edged. Safe (standard
//     lightmap format), ~40% speedup on Uplifter's big outdoor surfaces.
//
// Things we tried that we DON'T use:
//   -world_units_per_luxel 32  — 3× faster but outputs the DECOUPLED_LM
//     BSPX lump, which ironwail (and most engines) don't decode. The .bsp
//     loads but everything renders pitch black.
//   qbsp -lmscale n  — also emits a BSPX lump (LMSCALE), and combined
//     with -subdivide 1024 it produces faces beyond the 256-luxel motor
//     limit ("Bad surface extents" errors).
const FAST_LIGHT_FLAGS = ['-sunsamples', '1'];

const PROFILES = {
  // 'flat' es el perfil mas rapido. El mapWriter, cuando ve quality==='flat',
  // genera geometria minima (terreno con dos alturas, sin edificios, sin
  // erosion, sin objetos decorativos), asi que qbsp tiene muchos menos brushes
  // que partir. Saltamos light por completo: el .bsp saldra sin lightmaps,
  // se vera oscuro/negro en el juego, pero la geometria y los entities
  // estan ahi — vale para testear gameplay sin esperar la iluminacion.
  // Si la oscuridad estorba demasiado, en la consola: r_fullbright 1.
  flat: [
    { name: 'qbsp',  exe: 'qbsp.exe',  args: QBSP_FLAGS_FLAT },
  ],
  fast: [
    { name: 'qbsp',  exe: 'qbsp.exe',  args: QBSP_FLAGS },
    { name: 'light', exe: 'light.exe', args: FAST_LIGHT_FLAGS },
  ],
  hq: [
    { name: 'qbsp',  exe: 'qbsp.exe',  args: QBSP_FLAGS },
    { name: 'vis',   exe: 'vis.exe',   args: ['-noambientsky'] },
    { name: 'light', exe: 'light.exe', args: ['-extra4', '-soft'] },
  ],
};

function runTool(tool, mapBaseName, onLog) {
  return new Promise((resolve, reject) => {
    const exePath = path.join(BIN_DIR, tool.exe);
    const args = [...tool.args, mapBaseName];
    onLog({ stream: 'meta', tool: tool.name, line: `$ ${tool.exe} ${args.join(' ')}` });

    const child = spawn(exePath, args, { cwd: TMP_DIR, windowsHide: true });

    let stdoutBuf = '';
    let stderrBuf = '';
    const flush = (buf, stream) => {
      const lines = buf.split(/\r?\n/);
      const carry = lines.pop();
      for (const line of lines) {
        if (line.length > 0) onLog({ stream, tool: tool.name, line });
      }
      return carry;
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuf = flush(stdoutBuf + chunk.toString('utf8'), 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      stderrBuf = flush(stderrBuf + chunk.toString('utf8'), 'stderr');
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (stdoutBuf) onLog({ stream: 'stdout', tool: tool.name, line: stdoutBuf });
      if (stderrBuf) onLog({ stream: 'stderr', tool: tool.name, line: stderrBuf });
      onLog({ stream: 'meta', tool: tool.name, line: `(${tool.name} exited with code ${code})` });
      resolve(code ?? -1);
    });
  });
}

async function fileExists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}

async function compileMap(mapBase, onLog, opts = {}) {
  const tools = PROFILES[opts.quality] || PROFILES.fast;
  const mapFile = path.join(TMP_DIR, `${mapBase}.map`);
  if (!(await fileExists(mapFile))) {
    throw new Error(`Map not found: ${mapFile}`);
  }

  for (const ext of ['.bsp', '.pts', '.lit', '.prt']) {
    const stale = path.join(TMP_DIR, mapBase + ext);
    try { await fs.unlink(stale); } catch {}
  }

  for (const tool of tools) {
    const code = await runTool(tool, mapBase, onLog);
    if (code !== 0) {
      return { ok: false, leaked: false, bspPath: null, lastTool: tool.name, exitCode: code };
    }
    if (tool.name === 'qbsp') {
      const ptsPath = path.join(TMP_DIR, `${mapBase}.pts`);
      if (await fileExists(ptsPath)) {
        onLog({ stream: 'meta', tool: 'qbsp', line: `LEAK detected (${ptsPath})` });
        return { ok: false, leaked: true, bspPath: null, lastTool: 'qbsp', exitCode: 0 };
      }
    }
  }

  const lastTool = tools[tools.length - 1]?.name ?? 'qbsp';
  return { ok: true, leaked: false, bspPath: path.join(TMP_DIR, `${mapBase}.bsp`), lastTool, exitCode: 0 };
}

/**
 * Recompilacion incremental: solo actualiza el lump de entidades del .bsp
 * existente con las entidades del .map actual. NO recalcula BSP tree,
 * planes, faces, edges ni vertexes — todo eso se queda como esta. Casi
 * instantaneo (ms) comparado con un qbsp completo.
 *
 * Pre-requisitos:
 *   - El .bsp debe existir y ser valido (compilacion previa exitosa).
 *   - El .map debe haberse regenerado con SOLO cambios en entidades
 *     (enemies, patrols, spawn). Cambios en geometria con onlyents
 *     producen un .bsp incoherente — el llamante es responsable de
 *     decidir cuando usarlo.
 *
 * Implementacion: corremos qbsp con -onlyents. Ese flag le dice a qbsp
 * que abra el .bsp existente, parsee el .map, reemplace el entdata lump
 * y reescriba el .bsp. No toca lightmaps ni vis data — si las luces
 * (entidades light_*) cambian, el lightmap quedaria desfasado, pero
 * nosotros no usamos luces dinamicas, solo _sunlight (worldspawn), asi
 * que es seguro.
 */
async function compileMapOnlyEnts(mapBase, onLog) {
  const mapFile = path.join(TMP_DIR, `${mapBase}.map`);
  const bspFile = path.join(TMP_DIR, `${mapBase}.bsp`);
  if (!(await fileExists(mapFile))) {
    throw new Error(`Map not found: ${mapFile}`);
  }
  if (!(await fileExists(bspFile))) {
    throw new Error(`BSP not found: ${bspFile} (onlyents requires a previous full compile)`);
  }
  const tool = { name: 'qbsp', exe: 'qbsp.exe', args: ['-onlyents'] };
  const code = await runTool(tool, mapBase, onLog);
  if (code !== 0) {
    return { ok: false, leaked: false, bspPath: null, lastTool: 'qbsp', exitCode: code };
  }
  return { ok: true, leaked: false, bspPath: bspFile, lastTool: 'qbsp', exitCode: 0 };
}

module.exports = { compileMap, compileMapOnlyEnts };
