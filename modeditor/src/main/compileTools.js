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

// -subdivide 1024: large faces (sky walls, bedrock, global water) are
// partitioned into manageable tiles. The default 240 hits a qbsp internal
// cap of 64 edges/face for very large surfaces (the ±16384 world box);
// 1024 keeps faces well below that cap AND keeps subface size below the
// engine's 256×256 lightmap limit (which is what raises "Bad surface
// extents" at map load time in quakespasm/ironwail). Without subdivision
// the engine refuses to load the .bsp.
const QBSP_FLAGS = ['-bsp2', '-subdivide', '1024', '-worldextent', '32768', '-leaktest'];

// Fast-profile light flags:
//   -world_units_per_luxel 32  — coarse lightmaps (1 luxel per 32u of world,
//     vs default 16). Outputs DECOUPLED_LM BSPX lump, supported by ironwail
//     and other post-quakespasm engines. ~3× faster on Uplifter's huge
//     surfaces; bumps BSP size ~30%; visibly coarser shadows on close detail
//     but invisible from helicopter altitude.
//   -sunsamples 1  — single sample for sun penumbra instead of 100. Sun
//     shadows go from soft-edged to hard-edged. Combined with the coarse
//     luxels this gives an 8× speedup overall on a typical Uplifter map.
const FAST_LIGHT_FLAGS = ['-world_units_per_luxel', '32', '-sunsamples', '1'];

const PROFILES = {
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

  return { ok: true, leaked: false, bspPath: path.join(TMP_DIR, `${mapBase}.bsp`), lastTool: 'light', exitCode: 0 };
}

module.exports = { compileMap };
