#!/usr/bin/env node
/**
 * Smoke test for the .map writer. Runs without Electron — builds a tiny
 * sample tilemap (an island in the middle of the ocean) and writes the
 * .map to tmp/smoke.map. Useful to validate the writer before launching
 * the UI.
 */
const fs = require('node:fs');
const path = require('node:path');

const { makeEmptyTilemap, SEA_LEVEL_H, PALETTE } = require('../src/shared/types.js');
const { buildMapText, wadKeyFromPaths } = require('../src/main/mapWriter.js');

const t = makeEmptyTilemap();
// Carve a small 8×8 island of "tierra" in the middle, height = 0..2.
const tierraIdx = PALETTE.findIndex(p => p.id === 'tierra');
const cx = Math.floor(t.cols / 2);
const cy = Math.floor(t.rows / 2);
for (let dr = -4; dr < 4; dr++) {
  for (let dc = -4; dc < 4; dc++) {
    const r = cy + dr;
    const c = cx + dc;
    const i = r * t.cols + c;
    t.textures[i] = tierraIdx;
    // Higher near the centre.
    const d = Math.max(Math.abs(dr), Math.abs(dc));
    t.heights[i] = Math.max(0, 2 - d);
  }
}

const wads = [
  path.resolve(__dirname, '..', 'wads', 'auto.wad'),
  path.resolve(__dirname, '..', 'wads', 'text.wad'),
];
const wadKey = wadKeyFromPaths(wads);
const built = buildMapText({ tilemap: t, wadKey });
const outDir = path.resolve(__dirname, '..', 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'smoke.map');
fs.writeFileSync(outPath, built.text, 'utf8');
console.log(`wrote ${outPath} — ${built.text.length} bytes`);
for (const w of built.warnings) console.log(`WARNING: ${w}`);

// Show the first few lines and a count of brushes for a quick sanity check.
const brushCount = (built.text.match(/^\{$/gm) || []).length;
console.log(`brushes: ${brushCount}`);
console.log('--- head ---');
console.log(built.text.split('\n').slice(0, 20).join('\n'));
