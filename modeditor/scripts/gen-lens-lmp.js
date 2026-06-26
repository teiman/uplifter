#!/usr/bin/env node
/**
 * gen-lens-lmp.js — Generate the lens-flare gfx for the CSQC sun flare:
 *   gfx/lens_glow.lmp  — a soft round glow (bright centre → transparent edge)
 *   gfx/lens_ring.lmp  — a hollow ring/halo
 *
 * Output as Quake .lmp qpic (int w, int h, then w*h palette indices). The CSQC
 * draws them with additive blend, so the transparent index (255) and dim
 * pixels read as "no light"; only the bright pixels glow. The drawpic rgb
 * tint colours each halo, so these are generated near-white/grey.
 *
 *   node scripts/gen-lens-lmp.js
 *
 * Output: mod/gfx/lens_glow.lmp, mod/gfx/lens_ring.lmp
 *         (+ mirror to d:/quake/uplifter/gfx/)
 */

const fs = require('node:fs');
const path = require('node:path');

const PALETTE_GPL = path.resolve(__dirname, '..', '..', 'tools', 'aseprite-quake-palettes', 'palettes', 'quake.gpl');
const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'gfx');
const OUT_GAME = 'd:/quake/uplifter/gfx';
const TRANSPARENT_IDX = 255;
const SIZE = 64;

function loadPalette(p) {
  const pal = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (m) { pal.push([+m[1], +m[2], +m[3]]); if (pal.length === 256) break; }
  }
  if (pal.length !== 256) throw new Error(`palette parse: ${pal.length}/256`);
  return pal;
}
const PAL = loadPalette(PALETTE_GPL);
const SAFE_END = 256;   // include the full ramp; we want the brightest whites
const _cache = new Map();
function nearestIdx(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let v = _cache.get(key);
  if (v !== undefined) return v;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < SAFE_END; i++) {
    if (i === TRANSPARENT_IDX) continue;
    const p = PAL[i], dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = 2*dr*dr + 4*dg*dg + 3*db*db;
    if (d < bd) { bd = d; bi = i; }
  }
  _cache.set(key, bi);
  return bi;
}

// Write a qpic .lmp: int w, int h (LE) + w*h palette indices.
function writeLmp(filepath, idx, w, h) {
  const head = Buffer.alloc(8);
  head.writeInt32LE(w, 0);
  head.writeInt32LE(h, 4);
  fs.writeFileSync(filepath, Buffer.concat([head, Buffer.from(idx)]));
}

// Map a 0..1 brightness to a near-white palette index; b<=cut → transparent
// (index 255). The engine's drawpic has NO additive blend (the drawflag is
// ignored) but DOES honour the alpha parameter, so the flare is drawn ALPHA-
// BLENDED at low opacity: pale near-white pixels over the sky read as a soft
// veil of light, and a SOFT radial falloff (not a hard edge) makes the disc
// dissolve into the sky instead of looking like a solid object. The brightness
// itself drives how white→sky each pixel is; the CSQC alpha translucects it.
function veilIdx(b, cut) {
  if (b <= cut) return TRANSPARENT_IDX;
  // brightness 0..1 → grey 150..255 (paler = more light)
  const v = Math.round((150 + 105 * Math.min(1, b)));
  return nearestIdx(v, v, v);
}

// Round sun glow: bright core, SOFT gaussian-ish falloff so the rim fades to
// transparent (no square corners, no hard disc edge).
function buildGlow() {
  const out = new Uint8Array(SIZE * SIZE);
  const c = (SIZE - 1) / 2;
  const R = SIZE * 0.5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.sqrt(dx*dx + dy*dy) / R;   // 0 centre .. 1 edge .. >1 corners
      // Hard CIRCULAR cut so corners (and the very rim) are fully
      // transparent — no square edge. Inside, a soft bright-cored falloff.
      if (d >= 0.96) { out[y*SIZE + x] = TRANSPARENT_IDX; continue; }
      let b = 1 - (d / 0.96);
      b = b * b;
      out[y*SIZE + x] = veilIdx(b, 0.0);        // no extra cut; circle does it
    }
  }
  return out;
}

// Hollow ring/halo: a soft annulus that fades to transparent on both sides.
function buildRing() {
  const out = new Uint8Array(SIZE * SIZE);
  const c = (SIZE - 1) / 2;
  const R = SIZE * 0.5;
  const mid = 0.66;          // ring radius (fraction of R)
  const wdt = 0.26;          // ring half-width (wider → softer)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.sqrt(dx*dx + dy*dy) / R;
      const dist = Math.abs(d - mid);
      let b = 1 - (dist / wdt);                  // peak on the ring line
      if (b < 0) b = 0;
      b = b * b;                                 // soft edges
      out[y*SIZE + x] = veilIdx(b, 0.04);
    }
  }
  return out;
}

fs.mkdirSync(OUT_REPO, { recursive: true });
try { fs.mkdirSync(OUT_GAME, { recursive: true }); } catch {}

for (const [name, fn] of [['lens_glow', buildGlow], ['lens_ring', buildRing]]) {
  const idx = fn();
  const repo = path.join(OUT_REPO, name + '.lmp');
  writeLmp(repo, idx, SIZE, SIZE);
  try { writeLmp(path.join(OUT_GAME, name + '.lmp').replace(/\\/g, '/'), idx, SIZE, SIZE); }
  catch (e) { console.warn('game copy failed:', e.message); }
  console.log(`wrote ${repo} (${SIZE}x${SIZE} qpic)`);
}
console.log('done — lens flare gfx generated.');
