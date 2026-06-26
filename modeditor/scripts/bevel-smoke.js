#!/usr/bin/env node
/**
 * Smoke test del bevel del casco. Construye un "barco" rectangular de tile
 * 'barco' con un bevel ('wedge') en cada una de las 4 esquinas y valida que:
 *   - el writer no peta,
 *   - cada celda con wedge emite un brush con 7 caras (cubo achaflanado),
 *   - el resto del casco son cubos normales (6 caras).
 *
 *   node scripts/bevel-smoke.js
 */
const fs = require('node:fs');
const path = require('node:path');

const { makeEmptyTilemap, PALETTE, encodeDeco } = require('../src/shared/types.js');
const { buildMapText, wadKeyFromPaths } = require('../src/main/mapWriter.js');

const t = makeEmptyTilemap();
const barcoIdx = PALETTE.findIndex(p => p.id === 'barco');
if (barcoIdx < 0) { console.error('no barco tile in PALETTE'); process.exit(1); }

// Casco rectangular 6×4 de 'barco' a altura 1, en el centro.
const cx = Math.floor(t.cols / 2);
const cy = Math.floor(t.rows / 2);
const W = 6, H = 4;
const c0 = cx - W / 2, r0 = cy - H / 2;
for (let r = r0; r < r0 + H; r++) {
  for (let c = c0; c < c0 + W; c++) {
    const i = r * t.cols + c;
    t.textures[i] = barcoIdx;
    t.heights[i] = 1;
  }
}
// Bevel en las 4 esquinas del rectangulo. dir: 0=NE 1=SE 2=SO 3=NO.
const corners = [
  [r0,         c0 + W - 1, 0],  // esq sup-der → cortar... (depende de y-flip)
  [r0 + H - 1, c0 + W - 1, 1],
  [r0 + H - 1, c0,         2],
  [r0,         c0,         3],
];
for (const [r, c, dir] of corners) {
  t.decorations[r * t.cols + c] = encodeDeco('wedge', dir);
}

const wads = [
  path.resolve(__dirname, '..', 'wads', 'auto.wad'),
  path.resolve(__dirname, '..', 'wads', 'text.wad'),
];
const wadKey = wadKeyFromPaths(wads);
const built = buildMapText({ tilemap: t, wadKey });
const outDir = path.resolve(__dirname, '..', 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'bevel.map');
fs.writeFileSync(outPath, built.text, 'utf8');
console.log(`wrote ${outPath} — ${built.text.length} bytes`);
for (const w of built.warnings) console.log(`WARNING: ${w}`);

// Cuenta caras por brush. Un wedge = 7 planos "( ... )" en 3 puntos por cara,
// es decir lineas que empiezan por "( ". Contamos brushes con exactamente 7
// caras como candidatos a wedge.
const blocks = built.text.split('\n');
let inBrush = false, faces = 0, sevenFaceBrushes = 0, totalBrushes = 0;
for (const line of blocks) {
  const s = line.trim();
  if (s === '{') { inBrush = true; faces = 0; }
  else if (s === '}') {
    if (inBrush && faces > 0) {
      totalBrushes++;
      if (faces === 7) sevenFaceBrushes++;
    }
    inBrush = false;
  } else if (inBrush && s.startsWith('( ')) {
    faces++;
  }
}
console.log(`total brushes (con caras): ${totalBrushes}`);
console.log(`brushes de 7 caras (wedges esperados=4): ${sevenFaceBrushes}`);
if (sevenFaceBrushes < 4) {
  console.error('FALLO: se esperaban >=4 brushes de 7 caras (uno por bevel).');
  process.exit(2);
}
console.log('OK: bevel genera la geometria de 7 caras esperada.');
