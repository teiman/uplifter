#!/usr/bin/env node
/**
 * gen-firepuff-spr.js — Build a warm "fire puff" sprite for artillery
 * explosions: a soft blob in red/orange/yellow using the Quake FULLBRIGHT
 * palette range (indices 224..255 render at full brightness, no light
 * shading) so the puff glows. 5 animation frames go from a hot, tight,
 * bright core to a dim, spread, fading puff.
 *
 * Billboard (SPR_VP_PARALLEL). Output: ../../mod/progs/puff_fire.spr
 * (+ mirror to d:/quake/uplifter/progs).
 *
 *   node scripts/gen-firepuff-spr.js
 */

const fs = require('node:fs');
const path = require('node:path');

const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'progs', 'puff_fire.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/puff_fire.spr';

const TRANSPARENT_IDX = 255;   // index 255 is the sprite transparency key

// Quake fullbright warm ramp (indices into the standard Quake palette). These
// are the hot colours, drawn at full brightness by the engine:
//   224..242  dark-red → orange → pale-yellow (the classic fire gradient)
// We pick from this ramp by "heat": hot core = bright yellow, cooler edge =
// deep red. Index 255 is reserved as transparent, so we never emit it as a
// real colour.
const RAMP = [
  227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242,
];
// heat in [0..1] → ramp index (0 = coolest red, 1 = hottest yellow)
function heatColour(heat) {
  if (heat < 0) heat = 0;
  if (heat > 1) heat = 1;
  const i = Math.round(heat * (RAMP.length - 1));
  return RAMP[i];
}

// ---------- canvas ----------
const W = 48;
const H = 48;
const CX = W / 2 - 0.5;
const CY = H / 2 - 0.5;

function blank() { return new Uint8Array(W * H).fill(TRANSPARENT_IDX); }
function put(px, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; }

// Build one frame. `t` in [0..1] is animation progress: the blob grows in
// radius and cools (hot yellow core early; dull red and patchy late).
function buildFrame(t) {
  const px = blank();
  const rMax = 8 + t * 14;          // radius grows over the animation
  const coolness = t;                // later frames are cooler/dimmer
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rMax) continue;
      const f = dist / rMax;         // 0 at centre, 1 at edge
      // Heat: hottest at the core, cooling toward the edge, and the whole
      // blob cools as the animation progresses.
      let heat = (1 - f) - coolness * 0.7;
      // Punch a few transparent holes near the edge in later frames so the
      // puff looks like it's breaking up rather than a solid disc.
      if (t > 0.4 && f > 0.55) {
        // deterministic pseudo-noise from coordinates (no Math.random so the
        // sprite is reproducible build-to-build)
        const n = ((x * 73 + y * 151 + Math.round(t * 97)) % 7);
        if (n < 3) continue;
      }
      if (heat < -0.15) continue;    // too cool → no pixel (transparent)
      put(px, x, y, heatColour(heat));
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
    fh.writeInt32LE(-w / 2, 0);      // centred anchor
    fh.writeInt32LE(h / 2, 4);
    fh.writeInt32LE(w, 8);
    fh.writeInt32LE(h, 12);
    chunks.push(tag, fh, Buffer.from(fr));
  }
  return Buffer.concat(chunks);
}

// ---------- main ----------
const NF = 5;
const frames = [];
for (let i = 0; i < NF; i++) frames.push(buildFrame(i / (NF - 1)));
const spr = encodeSprite(frames, W, H);
fs.writeFileSync(OUT_REPO, spr);
try { fs.mkdirSync(path.dirname(OUT_GAME), { recursive: true }); fs.writeFileSync(OUT_GAME, spr); } catch (e) { /* game dir optional */ }
console.log(`puff_fire.spr: ${W}x${H}, ${frames.length} frames → ${OUT_REPO}` + (fs.existsSync(OUT_GAME) ? ` (+ ${OUT_GAME})` : ''));
