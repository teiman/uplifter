#!/usr/bin/env node
/**
 * Regenerate the GPL palette files in this folder from the canonical
 * Quake palette shipped with the modeditor source.
 *
 * Output files:
 *   palettes/quake.gpl        — full 256-colour Quake palette.
 *   palettes/quake-no-fb.gpl  — indices 0..223 only; drops the 32
 *                               fullbright colours (224..255) that
 *                               render at constant brightness and
 *                               ruin outdoor scenes when used as
 *                               regular paint.
 *
 * Usage:
 *   node tools/aseprite-quake-palettes/generate.js
 */

const fs = require('node:fs');
const path = require('node:path');

const { QUAKE_PALETTE, FULLBRIGHT_START } = require(
  '../../modeditor/src/shared/quakePalette.js',
);

function toGpl(name, colours) {
  const lines = [];
  lines.push('GIMP Palette');
  lines.push(`Name: ${name}`);
  lines.push('Columns: 16');
  lines.push('#');
  colours.forEach(([r, g, b], i) => {
    // Right-pad each channel to 3 chars so the columns line up — Aseprite
    // doesn't care but the file is easier to skim in a text editor.
    const rs = String(r).padStart(3, ' ');
    const gs = String(g).padStart(3, ' ');
    const bs = String(b).padStart(3, ' ');
    lines.push(`${rs} ${gs} ${bs}\tquake-${String(i).padStart(3, '0')}`);
  });
  return lines.join('\n') + '\n';
}

const outDir = path.resolve(__dirname, 'palettes');
fs.mkdirSync(outDir, { recursive: true });

const full = QUAKE_PALETTE;
const noFb = QUAKE_PALETTE.slice(0, FULLBRIGHT_START);

fs.writeFileSync(path.join(outDir, 'quake.gpl'),
  toGpl('Quake', full));
fs.writeFileSync(path.join(outDir, 'quake-no-fb.gpl'),
  toGpl('Quake (no fullbrights)', noFb));

console.log(`wrote ${path.relative(process.cwd(), outDir)}/`);
for (const f of ['quake.gpl', 'quake-no-fb.gpl']) {
  const p = path.join(outDir, f);
  console.log(`  ${f}  (${fs.statSync(p).size} bytes)`);
}
