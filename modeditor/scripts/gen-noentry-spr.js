#!/usr/bin/env node
/**
 * gen-noentry-spr.js — Build a "no entry / prohibido" sprite (red circle with a
 * diagonal bar) shown over a hospital or ship while it can no longer receive
 * survivors (full or destroyed). Static single frame.
 *
 * Billboard (SPR_VP_PARALLEL): always faces the camera. Drawn straight into the
 * Quake palette. Output: ../../mod/progs/noentry.spr (+ mirror to
 * d:/quake/uplifter/progs).
 *
 *   node scripts/gen-noentry-spr.js
 */

const fs = require('node:fs');
const path = require('node:path');

const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'progs', 'noentry.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/noentry.spr';
const PALETTE_GPL = path.resolve(__dirname, '..', '..', 'tools', 'aseprite-quake-palettes', 'palettes', 'quake.gpl');

// ---------- palette ----------
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
const TRANSPARENT_IDX = 255;
const SAFE_END = 224;   // avoid fullbright range
const _cache = new Map();
function nearestIdx(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let v = _cache.get(key);
  if (v !== undefined) return v;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < SAFE_END; i++) {
    const p = PAL[i], dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = 2*dr*dr + 4*dg*dg + 3*db*db;
    if (d < bd) { bd = d; bi = i; }
  }
  _cache.set(key, bi);
  return v = bi;
}

// ---------- colours ----------
const C_RED      = nearestIdx(220, 30, 30);     // prohibido red
const C_RED_D    = nearestIdx(150, 15, 15);     // darker red rim (anti-alias edge)
const C_WHITE    = nearestIdx(245, 245, 245);   // white circle interior

// ---------- canvas ----------
const W = 64;
const H = 64;
const CX = W / 2 - 0.5;
const CY = H / 2 - 0.5;
const R_OUT = 30;        // outer radius of the red ring
const R_IN  = 22;        // inner radius (hole)
const BAR_HALF = 5;      // half-thickness of the diagonal bar

function blank() { return new Uint8Array(W * H).fill(TRANSPARENT_IDX); }
function put(px, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; }

function buildFrame() {
  const px = blank();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // The red annular ring (outer band).
      const inRing = (dist <= R_OUT && dist >= R_IN);
      // Diagonal bar across the whole disc. Distance from the line y = x
      // (rotated 45°): |dx - dy| / sqrt(2). Only inside the outer circle.
      const lineDist = Math.abs(dx - dy) / Math.SQRT2;
      const inBar = (lineDist <= BAR_HALF && dist <= R_OUT);

      if (inRing || inBar) {
        // Slightly darker on the extreme outer/inner edge for a cleaner rim.
        const edge = (dist > R_OUT - 1.5) || (inRing && dist < R_IN + 1.5);
        put(px, x, y, edge ? C_RED_D : C_RED);
      } else if (dist < R_IN) {
        // White interior of the circle (only where the bar doesn't cover it).
        put(px, x, y, C_WHITE);
      }
    }
  }
  return px;
}

// ---------- encode .spr (IDSP v1, billboard) ----------
function encodeSprite(frames, w, h) {
  const radius = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);     // version 1
  header.writeInt32LE(2, 8);     // type 2 = SPR_VP_PARALLEL (billboard)
  header.writeFloatLE(radius, 12);
  header.writeInt32LE(w, 16);
  header.writeInt32LE(h, 20);
  header.writeInt32LE(frames.length, 24);
  header.writeFloatLE(0, 28);    // beamlength
  header.writeInt32LE(0, 32);    // synctype
  const chunks = [header];
  for (const fr of frames) {
    const tag = Buffer.alloc(4); tag.writeInt32LE(0, 0);  // SPR_SINGLE
    const fh = Buffer.alloc(16);
    // Centred anchor so the symbol floats centred over the ship marker.
    fh.writeInt32LE(-w / 2, 0);      // origin x
    fh.writeInt32LE(h / 2, 4);       // origin y
    fh.writeInt32LE(w, 8);
    fh.writeInt32LE(h, 12);
    chunks.push(tag, fh, Buffer.from(fr));
  }
  return Buffer.concat(chunks);
}

// ---------- main ----------
const frames = [buildFrame()];
const spr = encodeSprite(frames, W, H);
fs.writeFileSync(OUT_REPO, spr);
try { fs.mkdirSync(path.dirname(OUT_GAME), { recursive: true }); fs.writeFileSync(OUT_GAME, spr); } catch (e) { /* game dir optional */ }
console.log(`noentry.spr: ${W}x${H}, ${frames.length} frame → ${OUT_REPO}` + (fs.existsSync(OUT_GAME) ? ` (+ ${OUT_GAME})` : ''));
