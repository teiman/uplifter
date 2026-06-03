#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const SPR_PATH = path.resolve(__dirname, '../../mod/progs/ripple.spr');
const PALETTE_GPL = path.resolve(__dirname,
  '../../tools/aseprite-quake-palettes/palettes/quake.gpl');
const OUT_PPM = path.resolve(__dirname, '../../tmp/ripple-preview.ppm');

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
const buf = fs.readFileSync(SPR_PATH);
if (buf.toString('ascii', 0, 4) !== 'IDSP') throw new Error('Not IDSP');
const W = buf.readInt32LE(16), H = buf.readInt32LE(20), N = buf.readInt32LE(24);
console.log(`Sprite: ${W}x${H}, ${N} frames`);

const frames = [];
let off = 36;
for (let f = 0; f < N; f++) {
  off += 4; // tag
  off += 16; // origin + w + h
  frames.push(buf.subarray(off, off + W * H));
  off += W * H;
}

const GUTTER = 2;
const OUT_W = N * W + (N + 1) * GUTTER;
const OUT_H = H + 2 * GUTTER;
const out = Buffer.alloc(OUT_W * OUT_H * 3);
for (let y = 0; y < OUT_H; y++) {
  for (let x = 0; x < OUT_W; x++) {
    const cb = ((x >> 2) ^ (y >> 2)) & 1;
    const v = cb ? 80 : 50;
    const p = (y * OUT_W + x) * 3;
    out[p] = v; out[p + 1] = v; out[p + 2] = v + 20;
  }
}
for (let f = 0; f < N; f++) {
  const px = frames[f];
  const xOff = GUTTER + f * (W + GUTTER), yOff = GUTTER;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = px[y * W + x];
      if (idx === 255) continue;
      const [r, g, b] = PAL[idx];
      const p = ((yOff + y) * OUT_W + (xOff + x)) * 3;
      out[p] = r; out[p + 1] = g; out[p + 2] = b;
    }
  }
}

fs.mkdirSync(path.dirname(OUT_PPM), { recursive: true });
const header = `P6\n${OUT_W} ${OUT_H}\n255\n`;
fs.writeFileSync(OUT_PPM, Buffer.concat([Buffer.from(header, 'ascii'), out]));
console.log(`Wrote ${OUT_PPM}`);
