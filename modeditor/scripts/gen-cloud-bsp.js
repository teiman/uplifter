/**
 * Offline cloud model → D:\quake\uplifter\maps\b_cloud0.bsp
 *
 *   node scripts/gen-cloud-bsp.js [flags]
 *
 * The cloud is built from THIN PLANES that cross in 3 axes — one set
 * stacked horizontally (Z) and two sets vertical (X and Y) — NOT voxel
 * cubes. Each plane is textured with the volume's cross-section at that
 * position: a fence ('{') texture whose edges dither into transparency, so
 * the cloud's silhouette dissolves into dots (no hard/blocky edges) and
 * the crossing planes give it body from any angle. Baked once; the editor
 * places `cloud` entities that load this model as SOLID_NOT (non-solid).
 *
 * Flags:
 *   --vol N    volume shape (seed)        default 0
 *   --nz N     horizontal planes (Z)      default 14
 *   --nx N     vertical planes (X)        default 10
 *   --ny N     vertical planes (Y)        default 10
 *   --hx U     half-width X (and Y)       default 440
 *   --hz U     half-height Z              default 220
 *   --thick U  plane half-thickness       default 4  (8u)
 *   --tex PX   cross-section texture px   default 256
 *   --span F   inner fraction sliced      default 0.85
 *   --grid N   volume grid resolution     default 96
 *
 * Render a PNG preview: node scripts/render-bsp-png.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildCloudVolume, buildSlice, cloudSliceBrush } = require('../src/main/cloudGen');
const { writeWad, buildSolidMiptex, nearestPaletteIndex } = require('../src/main/wadWriter');
const { boxBrush } = require('../src/shared/tileBrushes');

// --debug : opaque solid colour per axis (no fence, no dither) so we can
//           see the raw geometry and tell whether holes are CSG (geometric)
//           or just the dither. --solid : put planes in worldspawn (CSG)
//           instead of func_detail_illusionary, to A/B the CSG effect.
const DEBUG = process.argv.includes('--debug');
const SOLID = process.argv.includes('--solid');
// --flat : keep the dithered border as-is but fill the cloud interior with a
//          flat light grey instead of the vertical/depth/sun gradient.
const FLAT = process.argv.includes('--flat');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : def; }
const VOL  = parseInt(arg('vol', '0'), 10);
const NZ   = parseInt(arg('nz', '14'), 10);
const NX   = parseInt(arg('nx', '10'), 10);
const NY   = parseInt(arg('ny', '10'), 10);
const HX   = parseFloat(arg('hx', '440'));
const HY   = parseFloat(arg('hy', String(HX)));
const HZ   = parseFloat(arg('hz', '220'));
const THICK = parseFloat(arg('thick', '1'));   // FULL plane thickness in units (1u = thin plane)
const HT   = THICK / 2;
const TEX  = parseInt(arg('tex', '256'), 10);
const SPAN = parseFloat(arg('span', '0.85'));
const GRID = parseInt(arg('grid', '96'), 10);
const FLATLUM = parseFloat(arg('flatlum', '214'));

const BIN_DIR = path.join(__dirname, '..', 'bin');
const TMP_DIR = path.join(__dirname, '..', 'tmp');
const OUT_DIR = 'D:/quake/uplifter/maps';
const BASE = 'b_cloud0';

function run(exe, args) {
  const r = spawnSync(path.join(BIN_DIR, exe), args, { cwd: TMP_DIR, encoding: 'utf8' });
  if (r.status !== 0) { if (r.stdout) process.stdout.write(r.stdout.split(/\r?\n/).slice(-10).join('\n') + '\n'); if (r.stderr) process.stderr.write(r.stderr); throw new Error(`${exe} exited ${r.status}`); }
  return r.stdout || '';
}

// Debug box: every one of the 6 sides gets its own opaque colour, so we
// can see each face of every plane-box (+X red, -X dkred, +Y green,
// -Y dkgreen, +Z blue, -Z yellow). Windings match boxBrush.
function dfc(p1, p2, p3, tex) {
  return `( ${p1[0]} ${p1[1]} ${p1[2]} ) ( ${p2[0]} ${p2[1]} ${p2[2]} ) ( ${p3[0]} ${p3[1]} ${p3[2]} ) ${tex} [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 1 1`;
}
function box6({ minX, minY, minZ, maxX, maxY, maxZ }) {
  const L = [
    dfc([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], 'dbg_zp'),
    dfc([minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], 'dbg_zn'),
    dfc([maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], 'dbg_xp'),
    dfc([minX, maxY, minZ], [minX, maxY, maxZ], [minX, minY, maxZ], 'dbg_xn'),
    dfc([minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], 'dbg_yp'),
    dfc([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], 'dbg_yn'),
  ];
  return '{\n' + L.join('\n') + '\n}';
}

function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();

  const vol = buildCloudVolume(GRID, 0x51F + VOL * 0x9E37);

  const textures = [];
  const slices = [];        // { axis, c, tex }
  let empty = 0;

  // DEBUG: 6 opaque colours, one per BRUSH SIDE (no fence/dither), so we
  // can see each face of every plane-box and tell what's a face vs a gap.
  //   +X red  -X dkred  +Y green  -Y dkgreen  +Z blue  -Z yellow
  if (DEBUG) {
    const C = [['dbg_xp', 230, 70, 70], ['dbg_xn', 120, 40, 40], ['dbg_yp', 70, 210, 70],
      ['dbg_yn', 40, 120, 40], ['dbg_zp', 90, 130, 240], ['dbg_zn', 235, 215, 70]];
    for (const [nm, r, g, b] of C) textures.push({ name: nm, lump: buildSolidMiptex(nm, 64, 64, nearestPaletteIndex(r, g, b)) });
  }

  const addAxis = (axis, n, seedBase) => {
    if (n < 1) return;
    for (let i = 0; i < n; i++) {
      const c = (n === 1) ? 0 : ((i / (n - 1)) * 2 - 1) * SPAN;
      if (DEBUG) { slices.push({ axis, c }); continue; }  // box6 colours per side
      let tint = [0.95, 0.97, 1.0];
      if (axis === 'z') { const t = (c / SPAN + 1) * 0.5; tint = [0.86 + 0.14 * t, 0.91 + 0.09 * t, 1.0]; }
      const name = `{cloud_${textures.length}`;
      const { lump, opaque } = buildSlice(name, TEX, TEX, vol, axis, c, seedBase + i, { tint, flat: FLAT, flatLum: FLATLUM });
      if (opaque === 0) { empty++; continue; }
      textures.push({ name, lump });
      slices.push({ axis, c, tex: name });
    }
  };
  addAxis('z', NZ, VOL * 911 + 1);
  addAxis('x', NX, VOL * 911 + 300);
  addAxis('y', NY, VOL * 911 + 600);

  const wadPath = path.join(TMP_DIR, 'cloud0.wad');
  return writeWad(wadPath, textures.map(e => ({ name: e.name, lump: e.lump }))).then(() => {
    // Build the plane brushes.
    const slabs = slices.map((s) => {
      let box;
      if (s.axis === 'x') { const x0 = s.c * HX; box = { minX: x0 - HT, maxX: x0 + HT, minY: -HY, maxY: HY, minZ: -HZ, maxZ: HZ }; }
      else if (s.axis === 'y') { const y0 = s.c * HY; box = { minX: -HX, maxX: HX, minY: y0 - HT, maxY: y0 + HT, minZ: -HZ, maxZ: HZ }; }
      else { const z0 = s.c * HZ; box = { minX: -HX, maxX: HX, minY: -HY, maxY: HY, minZ: z0 - HT, maxZ: z0 + HT }; }
      return DEBUG ? box6(box) : cloudSliceBrush(box, s.tex, TEX, s.axis);
    });

    const out = [];
    if (SOLID) {
      // Planes in WORLDSPAWN (solid). qbsp runs CSG → at every crossing the
      // shared chunk is removed from BOTH planes → aligned grid of holes.
      out.push('{', '"classname" "worldspawn"', `"wad" "${wadPath.replace(/\\/g, '/')}"`, '"_minlight" "200"', '"_shadow" "0"', '"_dirt" "0"');
      for (const b of slabs) out.push(b);
      out.push('}');
    } else {
      // Planes in func_detail_illusionary (non-solid): no CSG between them →
      // each plane stays whole, no holes. Worldspawn just needs an anchor.
      out.push('{', '"classname" "worldspawn"', `"wad" "${wadPath.replace(/\\/g, '/')}"`);
      out.push(boxBrush({ minX: -16, maxX: 16, minY: -16, maxY: 16, minZ: -3000, maxZ: -2968 }, 'skip'));
      out.push('}');
      out.push('{', '"classname" "func_detail_illusionary"', '"_minlight" "200"', '"_shadow" "0"', '"_phong" "0"', '"_dirt" "0"');
      for (const b of slabs) out.push(b);
      out.push('}');
    }
    out.push('{', '"classname" "info_player_start"', '"origin" "1300 0 0"', '"angle" "180"', '}');
    fs.writeFileSync(path.join(TMP_DIR, `${BASE}.map`), out.join('\n') + '\n', 'utf8');

    run('qbsp.exe', ['-bsp2', '-subdivide', '4096', '-nopercent', `${BASE}.map`]);
    run('light.exe', ['-nopercent', `${BASE}.bsp`]);

    const dst = path.join(OUT_DIR, `${BASE}.bsp`);
    fs.copyFileSync(path.join(TMP_DIR, `${BASE}.bsp`), dst);
    const info = run('bspinfo.exe', [`${BASE}.bsp`]);
    const faces = (info.match(/(\d+)\s+faces/) || [])[1] || '?';
    const kb = (fs.statSync(dst).size / 1024).toFixed(0);

    console.log('--- gen-cloud-bsp (3-axis PLANES) ---');
    console.log(`params: vol=${VOL} nz=${NZ} nx=${NX} ny=${NY} hx=${HX} hy=${HY} hz=${HZ} thick=${HT * 2}u tex=${TEX} span=${SPAN} grid=${GRID}`);
    console.log(`planes: ${slices.length} (${empty} empty dropped)   textures: ${textures.length}   FACES: ${faces}`);
    console.log(`bsp: ${dst} (${kb} KB)   gen ${Date.now() - t0} ms`);
    console.log(`view: ironwail (uplifter) →  map ${BASE}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
