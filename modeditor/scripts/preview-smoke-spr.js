#!/usr/bin/env node
/**
 * preview-smoke-spr.js — Decodes ../../mod/progs/smoke.spr and writes a
 * single PPM image with all frames laid out horizontally so you can eyeball
 * the animation.
 *
 *   Output: tmp/smoke-preview.ppm
 */
const fs = require('node:fs');
const path = require('node:path');

const SPR_NAMES = ['smoke', 'smoke2', 'smoke3', 'smoke4', 'smoke5'];
const SPR_DIR = path.resolve(__dirname, '../../mod/progs');
const PALETTE_GPL = path.resolve(__dirname,
  '../../tools/aseprite-quake-palettes/palettes/quake.gpl');
const OUT_PPM = path.resolve(__dirname, '../../tmp/smoke-preview.ppm');

function loadPalette(gplPath) {
  const lines = fs.readFileSync(gplPath, 'utf8').split(/\r?\n/);
  const pal = [];
  for (const line of lines) {
    const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (!m) continue;
    pal.push([+m[1], +m[2], +m[3]]);
    if (pal.length === 256) break;
  }
  return pal;
}

const PAL = loadPalette(PALETTE_GPL);

function decodeSpr(buf) {
  const ident = buf.toString('ascii', 0, 4);
  if (ident !== 'IDSP') throw new Error('Not an IDSP');
  const W = buf.readInt32LE(16);
  const H = buf.readInt32LE(20);
  const N = buf.readInt32LE(24);
  const frames = [];
  let off = 36;
  for (let f = 0; f < N; f++) {
    const tag = buf.readInt32LE(off); off += 4;
    if (tag !== 0) throw new Error('Group frames not supported in preview');
    off += 16; // skip origin + width/height (we know them)
    const pixels = buf.subarray(off, off + W * H); off += W * H;
    frames.push({ w: W, h: H, pixels });
  }
  return { W, H, N, frames };
}

const sprites = SPR_NAMES.map(n => {
  const buf = fs.readFileSync(path.join(SPR_DIR, n + '.spr'));
  return { name: n, ...decodeSpr(buf) };
});

const W = sprites[0].W, H = sprites[0].H, N = sprites[0].N;
const ROWS = sprites.length;
const GUTTER = 2;
const OUT_W = N * W + (N + 1) * GUTTER;
const OUT_H = ROWS * H + (ROWS + 1) * GUTTER;
const out = Buffer.alloc(OUT_W * OUT_H * 3);

// Fill with checkerboard so transparent pixels are visible.
for (let y = 0; y < OUT_H; y++) {
  for (let x = 0; x < OUT_W; x++) {
    const cb = ((x >> 2) ^ (y >> 2)) & 1;
    const v = cb ? 80 : 50;
    const p = (y * OUT_W + x) * 3;
    out[p] = v; out[p + 1] = v; out[p + 2] = v + 20;
  }
}

for (let row = 0; row < ROWS; row++) {
  const spr = sprites[row];
  for (let f = 0; f < N; f++) {
    const fr = spr.frames[f];
    const xOff = GUTTER + f * (W + GUTTER);
    const yOff = GUTTER + row * (H + GUTTER);
    for (let y = 0; y < fr.h; y++) {
      for (let x = 0; x < fr.w; x++) {
        const idx = fr.pixels[y * fr.w + x];
        if (idx === 255) continue;
        const [r, g, b] = PAL[idx];
        const p = ((yOff + y) * OUT_W + (xOff + x)) * 3;
        out[p] = r; out[p + 1] = g; out[p + 2] = b;
      }
    }
  }
  console.log(`Row ${row}: ${spr.name}`);
}

fs.mkdirSync(path.dirname(OUT_PPM), { recursive: true });
const header = `P6\n${OUT_W} ${OUT_H}\n255\n`;
fs.writeFileSync(OUT_PPM, Buffer.concat([Buffer.from(header, 'ascii'), out]));
console.log(`Wrote preview: ${OUT_PPM} (${OUT_W}x${OUT_H})`);
