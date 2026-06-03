#!/usr/bin/env node
/**
 * gen-ripple-spr.js — Generate a Quake .spr (IDSP v1) animated water ripple.
 *
 *   64x64, 24 frames, SPR_VP_PARALLEL.
 *
 *   A hollow concentric ring expands outwards from a small radius until it
 *   fades to nothing at the rim. The ring's radius grows with ease-out cubic
 *   (fast at first, slow at the end — like a real water ripple). Its
 *   thickness narrows over time and the whole thing dithers towards the
 *   transparent index (255) so it disappears smoothly.
 *
 *   Colour: shaded Quake water-blue (palette range ~38-47 + 244 highlight).
 *   Everything outside the ring is index 255 (transparent).
 *
 *   Output: ../../mod/progs/ripple.spr (also copied to d:/quake/uplifter/progs/)
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------- Config ----------
const W = 64, H = 64;
const NFRAMES = 24;
const R_START = 6;       // initial ring radius
const R_END = 30;        // final ring radius (just inside the 64-wide bitmap)
const T_START = 6;       // initial ring half-thickness
const T_END = 1.2;       // final half-thickness
const TRANSPARENT_IDX = 255;
const SEED = 0xCAFEBABE;

const PALETTE_GPL = path.resolve(__dirname,
  '../../tools/aseprite-quake-palettes/palettes/quake.gpl');
const OUT_REPO = path.resolve(__dirname, '../../mod/progs/ripple.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/ripple.spr';

// Quake-water palette ramp (manually picked from quake.gpl). Brightest at
// the centre of the ring, dimmest at its outer/inner edges where the ring
// fades to transparent.
//
//   ramp[0] = ring core (brightest)
//   ramp[N-1] = darkest just before going transparent
const RAMP = [244, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38];

// ---------- Palette ----------
function loadPalette(gplPath) {
  const lines = fs.readFileSync(gplPath, 'utf8').split(/\r?\n/);
  const pal = [];
  for (const line of lines) {
    const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (!m) continue;
    pal.push({ r: +m[1], g: +m[2], b: +m[3] });
    if (pal.length === 256) break;
  }
  return pal;
}
const PAL = loadPalette(PALETTE_GPL);

// ---------- Blue-noise mask (same algorithm as gen-smoke-spr.js) ----------
function makeBlueNoise(w, h, seed) {
  const N = w * h;
  const rank = new Int32Array(N);
  let s = seed >>> 0;
  function rnd() { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const energy = new Float64Array(N);
  const placed = new Uint8Array(N);
  const sigma = 1.5;
  const inv2s2 = 1 / (2 * sigma * sigma);
  const KR = 4;
  function bump(px, py, sign) {
    for (let dy = -KR; dy <= KR; dy++) {
      const yy = ((py + dy) % h + h) % h;
      for (let dx = -KR; dx <= KR; dx++) {
        const xx = ((px + dx) % w + w) % w;
        const d2 = dx * dx + dy * dy;
        energy[yy * w + xx] += sign * Math.exp(-d2 * inv2s2);
      }
    }
  }
  const initial = Math.floor(N / 2);
  let pc = 0;
  while (pc < initial) {
    const p = Math.floor(rnd() * N);
    if (placed[p]) continue;
    placed[p] = 1; bump(p % w, Math.floor(p / w), 1); pc++;
  }
  for (let pass = 0; pass < 4; pass++) {
    let maxE = -Infinity, maxI = -1, minE = Infinity, minI = -1;
    for (let i = 0; i < N; i++) {
      if (placed[i] && energy[i] > maxE) { maxE = energy[i]; maxI = i; }
      if (!placed[i] && energy[i] < minE) { minE = energy[i]; minI = i; }
    }
    if (maxI < 0 || minI < 0 || maxI === minI) break;
    placed[maxI] = 0; bump(maxI % w, Math.floor(maxI / w), -1);
    placed[minI] = 1; bump(minI % w, Math.floor(minI / w), +1);
  }
  const placedIdxs = [], emptyIdxs = [];
  for (let i = 0; i < N; i++) (placed[i] ? placedIdxs : emptyIdxs).push(i);
  placedIdxs.sort((a, b) => energy[a] - energy[b] || a - b);
  emptyIdxs.sort((a, b) => energy[a] - energy[b] || a - b);
  let r = 0;
  for (const i of placedIdxs) rank[i] = r++;
  for (const i of emptyIdxs) rank[i] = r++;
  return rank;
}
const BN = makeBlueNoise(W, H, SEED);

// ---------- Animation curves ----------
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInQuad(t) { return t * t; }

function radiusAt(f) {
  const t = f / (NFRAMES - 1);
  return R_START + (R_END - R_START) * easeOutCubic(t);
}

function halfThicknessAt(f) {
  const t = f / (NFRAMES - 1);
  // Thickness narrows over time, but with ease-out so the early ring stays
  // fat for a bit before thinning.
  return T_START + (T_END - T_START) * easeOutCubic(t);
}

// Overall opacity ramps down at the tail of the animation. The first ~50%
// of the animation is fully opaque, the second ~50% fades to nothing via
// blue-noise dither.
function fadeAt(f) {
  const t = f / (NFRAMES - 1);
  if (t < 0.5) return 0; // no extra fade dither
  return (t - 0.5) / 0.5; // 0..1
}

// ---------- Build a single frame ----------
const CX = W / 2 - 0.5;
const CY = H / 2 - 0.5;

function buildFrame(f) {
  const R = radiusAt(f);
  const halfT = halfThicknessAt(f);
  const fade = fadeAt(f);
  const px = new Uint8Array(W * H).fill(TRANSPARENT_IDX);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Distance from the ring centre line, normalised to its half-thickness.
      const u = Math.abs(d - R) / halfT; // 0 at the ring axis, 1 at its edge
      if (u >= 1) continue;

      // Smooth profile: brightest at u=0, fades at u=1.
      // shaped: 1.0 at centre, 0.0 at rim, with a soft falloff.
      const shaped = 1 - u * u; // 1..0

      // Map shaped (0..1) → index in RAMP (0 is brightest, last is darkest)
      // shaped near 1 → ramp[0] (highlight), shaped near 0 → ramp[last]
      const idx = Math.min(RAMP.length - 1,
        Math.floor((1 - shaped) * RAMP.length));

      // Blue-noise dither for the tail-of-animation fade.
      const bnRank = BN[y * W + x] / (W * H);
      if (fade > 0 && bnRank < fade) continue;

      // Extra rim dither: at the outer/inner edge of the ring, use blue
      // noise to fray the edge instead of a hard pixel cliff.
      const edgeFray = u; // 0..1
      if (bnRank < edgeFray * 0.6) continue;

      px[y * W + x] = RAMP[idx];
    }
  }
  return px;
}

// ---------- Encode .spr (IDSP v1) ----------
function encodeSprite(frames) {
  const radius = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);
  header.writeInt32LE(3, 8);          // SPR_ORIENTED
  header.writeFloatLE(radius, 12);
  header.writeInt32LE(W, 16);
  header.writeInt32LE(H, 20);
  header.writeInt32LE(frames.length, 24);
  header.writeFloatLE(0, 28);
  header.writeInt32LE(0, 32);

  const chunks = [header];
  for (const px of frames) {
    const tag = Buffer.alloc(4); tag.writeInt32LE(0, 0);
    const fh = Buffer.alloc(16);
    fh.writeInt32LE(-W / 2, 0);
    fh.writeInt32LE(H / 2, 4);
    fh.writeInt32LE(W, 8);
    fh.writeInt32LE(H, 12);
    chunks.push(tag, fh, Buffer.from(px));
  }
  return Buffer.concat(chunks);
}

// ---------- Main ----------
const frames = [];
for (let f = 0; f < NFRAMES; f++) frames.push(buildFrame(f));

const buf = encodeSprite(frames);
fs.mkdirSync(path.dirname(OUT_REPO), { recursive: true });
fs.writeFileSync(OUT_REPO, buf);
try { fs.writeFileSync(OUT_GAME, buf); }
catch (e) { console.warn('Could not write game copy:', e.message); }

console.log(`Wrote ${OUT_REPO} (${buf.length} bytes, ${NFRAMES} frames @ ${W}x${H})`);
console.log(`Also copied to ${OUT_GAME}`);
