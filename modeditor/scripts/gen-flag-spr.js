#!/usr/bin/env node
/**
 * gen-flag-spr.js — Build a "rally beacon" flag sprite for the ship delivery
 * point. Disembarked passengers run toward this flag. It's a tall pole with a
 * waving flag on top, animated over a few frames so the flag flutters.
 *
 * Billboard (SPR_VP_PARALLEL): always faces the camera. Drawn straight into
 * the Quake palette (no conchars). Output: ../../mod/progs/flag.spr (+ mirror
 * to d:/quake/uplifter/progs).
 *
 *   node scripts/gen-flag-spr.js
 */

const fs = require('node:fs');
const path = require('node:path');

const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'progs', 'flag.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/flag.spr';
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
const C_POLE   = nearestIdx(170, 170, 175);   // grey pole
const C_POLE_D = nearestIdx(110, 110, 115);   // pole shade (right edge)
const C_FLAG   = nearestIdx(45, 95, 210);      // blue flag
const C_FLAG_D = nearestIdx(25, 60, 150);      // blue flag shade
const C_CROSS  = nearestIdx(240, 240, 245);    // white rescue cross
const C_KNOB   = nearestIdx(235, 210, 70);     // gold finial on top

// ---------- canvas ----------
const W = 56;
const H = 104;
function blank() { return new Uint8Array(W * H).fill(TRANSPARENT_IDX); }
function put(px, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; }
function rect(px, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(px, x, y, c);
}

// Pole geometry: a vertical post near the left third, leaving room for the
// flag to fly to the right. Origin (sprite anchor) is bottom-centre-ish.
const POLE_X = 16;
const POLE_TOP = 8;
const POLE_BOT = H - 6;

// Build one flag frame. `wave` shifts the flag's right edge up/down per row to
// fake a flutter; `phase` offsets the wave so frames differ.
function buildFrame(phase) {
  const px = blank();

  // Pole (2px wide + shade column).
  rect(px, POLE_X, POLE_TOP, POLE_X + 1, POLE_BOT, C_POLE);
  rect(px, POLE_X + 2, POLE_TOP, POLE_X + 2, POLE_BOT, C_POLE_D);
  // Gold finial knob on top.
  rect(px, POLE_X - 1, POLE_TOP - 4, POLE_X + 2, POLE_TOP - 1, C_KNOB);

  // Flag: a banner flying to the right from the top of the pole. We draw it
  // COLUMN BY COLUMN: each column is a full vertical strip from the (wavy) top
  // edge to the (wavy) bottom edge, filled solid. Drawing per-column strips
  // (instead of one pixel per cell with a per-row Y shift) leaves NO gaps
  // inside the cloth — the previous approach skipped pixels between adjacent
  // rows whose wave offsets differed.
  const fy0 = POLE_TOP + 2;
  const fh = 28;                   // cloth height in px
  const fLen = 34;                 // max horizontal length
  for (let c = 0; c < fLen; c++) {
    // Wave offset for this column. The whole strip (top AND bottom edge) rides
    // the same sine, and the amplitude grows toward the free end so the tip
    // flutters more than the hoist.
    const cf = c / fLen;
    const amp = 1.5 + 4.0 * cf;
    const yoff = Math.round(Math.sin((cf * 6.28) + phase) * amp);
    // Tip taper: the banner shortens a touch near the free end for a flag look.
    const top = fy0 + yoff;
    const bot = fy0 + fh - 1 + yoff - Math.round(cf * cf * 4);
    const x = POLE_X + 3 + c;
    for (let y = top; y <= bot; y++) {
      // Lower ~40% of the cloth is the darker shade (simple top-lit shading).
      const frac = (y - top) / (bot - top + 0.001);
      put(px, x, y, (frac > 0.6) ? C_FLAG_D : C_FLAG);
    }
  }
  // White rescue cross on the flag (centred in the banner's upper area).
  const cx = POLE_X + 3 + 14;
  const cy = fy0 + 11;
  rect(px, cx - 1, cy - 4, cx, cy + 4, C_CROSS);   // vertical bar
  rect(px, cx - 4, cy - 1, cx + 4, cy, C_CROSS);   // horizontal bar

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
    // Anchor at the bottom of the pole so it stands on the deck.
    fh.writeInt32LE(-POLE_X, 0);     // origin x (so pole sits near sprite x=0)
    fh.writeInt32LE(h, 4);           // origin y (top); feet at bottom
    fh.writeInt32LE(w, 8);
    fh.writeInt32LE(h, 12);
    chunks.push(tag, fh, Buffer.from(fr));
  }
  return Buffer.concat(chunks);
}

// ---------- main ----------
const frames = [buildFrame(0), buildFrame(2.1), buildFrame(4.2)];
const spr = encodeSprite(frames, W, H);
fs.writeFileSync(OUT_REPO, spr);
try { fs.mkdirSync(path.dirname(OUT_GAME), { recursive: true }); fs.writeFileSync(OUT_GAME, spr); } catch (e) { /* game dir optional */ }
console.log(`flag.spr: ${W}x${H}, ${frames.length} frames → ${OUT_REPO}` + (fs.existsSync(OUT_GAME) ? ` (+ ${OUT_GAME})` : ''));
