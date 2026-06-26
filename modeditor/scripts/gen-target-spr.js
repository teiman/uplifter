#!/usr/bin/env node
/**
 * gen-target-spr.js — Build a big red "target / impact zone" reticle sprite,
 * laid FLAT on the ground (SPR_ORIENTED, type 3, so the entity's .angles place
 * it). It marks where an artillery salvo is about to land and is removed when
 * the last rocket of that salvo hits.
 *
 * Design: concentric red rings (a shooting-range bullseye) + a thin crosshair,
 * transparent interior so the ground shows through. Red is drawn from the
 * FULLBRIGHT range so it glows clearly on dark ground.
 *
 * Output: ../../mod/progs/target_ring.spr (+ mirror to d:/quake/uplifter/progs)
 *
 *   node scripts/gen-target-spr.js
 */

const fs = require('node:fs');
const path = require('node:path');

const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'progs', 'target_ring.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/target_ring.spr';

const TRANSPARENT_IDX = 255;   // sprite transparency key

// Fullbright reds from the Quake palette (glow, no light shading):
//   251 = bright red, 250 = mid red, 247 = deep red. (255 is reserved as the
//   transparency key, so we never use it as a colour.)
const C_RED      = 251;
const C_RED_MID  = 250;
const C_RED_DARK = 247;

// ---------- canvas ----------
const W = 128;
const H = 128;
const CX = W / 2 - 0.5;
const CY = H / 2 - 0.5;

function blank() { return new Uint8Array(W * H).fill(TRANSPARENT_IDX); }
function put(px, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; }

// A ring (annulus) from radius r0..r1 in colour c.
function ring(px, r0, r1, c) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r0 && d <= r1) put(px, x, y, c);
    }
  }
}

function buildFrame() {
  const px = blank();
  // Concentric rings: outer thick rim, two inner rings, centre dot.
  ring(px, 56, 62, C_RED);        // outer rim
  ring(px, 53, 56, C_RED_DARK);   // rim shade
  ring(px, 38, 42, C_RED_MID);    // mid ring
  ring(px, 20, 24, C_RED_MID);    // inner ring
  ring(px, 0, 5, C_RED);          // centre dot

  // Crosshair tick marks reaching inward from the rim (4 cardinal spokes).
  const spokeLen = 14;
  for (let i = 0; i < spokeLen; i++) {
    // top / bottom
    put(px, Math.round(CX),     Math.round(CY) - (62 - i), C_RED);
    put(px, Math.round(CX) - 1, Math.round(CY) - (62 - i), C_RED);
    put(px, Math.round(CX),     Math.round(CY) + (62 - i), C_RED);
    put(px, Math.round(CX) - 1, Math.round(CY) + (62 - i), C_RED);
    // left / right
    put(px, Math.round(CX) - (62 - i), Math.round(CY),     C_RED);
    put(px, Math.round(CX) - (62 - i), Math.round(CY) - 1, C_RED);
    put(px, Math.round(CX) + (62 - i), Math.round(CY),     C_RED);
    put(px, Math.round(CX) + (62 - i), Math.round(CY) - 1, C_RED);
  }
  return px;
}

// ---------- encode .spr (IDSP v1, ORIENTED so .angles lay it flat) ----------
function encodeSprite(frames, w, h) {
  const radius = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);     // version 1
  header.writeInt32LE(3, 8);     // type 3 = SPR_ORIENTED (uses entity angles)
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
    fh.writeInt32LE(-w / 2, 0);      // centred anchor
    fh.writeInt32LE(h / 2, 4);
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
console.log(`target_ring.spr: ${W}x${H}, ${frames.length} frame → ${OUT_REPO}` + (fs.existsSync(OUT_GAME) ? ` (+ ${OUT_GAME})` : ''));
