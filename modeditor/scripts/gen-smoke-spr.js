#!/usr/bin/env node
/**
 * gen-smoke-spr.js — Generate a Quake .spr (IDSP v1) animated smoke puff.
 *
 *   24 frames at 32x32, SPR_VP_PARALLEL.
 *   The puff grows with ease-in-out, peaks at frame ~7, then decays with
 *   ease-out cubic. Color goes from bone-white at the center to grey at the
 *   edge, darkening as it ages. Transparency in the tail of the animation
 *   is produced by a blue-noise dither against the transparent index (255).
 *
 *   Output: ../../mod/progs/smoke.spr  (also copied to d:/quake/uplifter/progs/)
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------- Config ----------
const W = 32, H = 32;
const NFRAMES = 24;
const PEAK = 4;                       // frame at which the puff is largest
const R_MIN = 3;                      // starting radius — avoids an empty frame 0
const R_MAX = 14;                     // max radius in pixels (32/2 = 16, leave a margin)
const TRANSPARENT_IDX = 255;
const PALETTE_GPL = path.resolve(__dirname,
  '../../tools/aseprite-quake-palettes/palettes/quake.gpl');

// Each entry generates one .spr with its own seed.
// `name` is the filename stem (smoke, smoke2, ...). Seed drives the
// blue-noise mask and the turbulence phase offsets, so each variant has
// a distinct rim/cluster pattern while sharing the same animation curves.
const VARIANTS = [
  { name: 'smoke',  seed: 0xCAFEBABE },
  { name: 'smoke2', seed: 0x13371337 },
  { name: 'smoke3', seed: 0xDEADBEEF },
  { name: 'smoke4', seed: 0xA5A5A5A5 },
  { name: 'smoke5', seed: 0x5EED5EED },
];

const OUT_REPO_DIR = path.resolve(__dirname, '../../mod/progs');
const OUT_GAME_DIR = 'd:/quake/uplifter/progs';

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
  if (pal.length !== 256) throw new Error(`Palette parse: got ${pal.length}, expected 256`);
  return pal;
}

const PAL = loadPalette(PALETTE_GPL);

// Build a nearest-index lookup that EXCLUDES fullbrights (224..254) and the
// transparent index (255). We want stable shaded greys, no neon.
const SAFE_RANGE_END = 224;
function nearestIndex(r, g, b) {
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < SAFE_RANGE_END; i++) {
    const p = PAL[i];
    const dr = r - p.r, dg = g - p.g, db = b - p.b;
    // perceptual weighting (sRGB-ish)
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}

// Cache by packed RGB to speed up.
const COLOR_CACHE = new Map();
function idx(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let v = COLOR_CACHE.get(key);
  if (v === undefined) {
    v = nearestIndex(r, g, b);
    COLOR_CACHE.set(key, v);
  }
  return v;
}

// ---------- Blue-noise mask (void-and-cluster approximation) ----------
//
// Deterministic, seeded. Generates a WxH array of ranks in [0..W*H-1].
// Threshold the rank to get a stable blue-noise-ish mask: rank / (W*H) < t.
function makeBlueNoise(w, h, seed = 0xCAFEBABE) {
  const N = w * h;
  const rank = new Int32Array(N);
  // Start with shuffled positions via mulberry32 PRNG.
  let s = seed >>> 0;
  function rnd() { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  // Energy field: each placed pixel contributes a wraparound gaussian.
  const energy = new Float64Array(N);
  const placed = new Uint8Array(N);
  const sigma = 1.5;
  const inv2s2 = 1 / (2 * sigma * sigma);
  const KR = 4; // kernel radius

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

  // Phase 1: scatter ~N/2 random initial points.
  const initial = Math.floor(N / 2);
  let placedCount = 0;
  while (placedCount < initial) {
    const p = Math.floor(rnd() * N);
    if (placed[p]) continue;
    placed[p] = 1;
    bump(p % w, Math.floor(p / w), 1);
    placedCount++;
  }

  // Phase 2: redistribute (tighten clusters / fill voids).
  for (let pass = 0; pass < 4; pass++) {
    // Find tightest cluster (max energy that is placed) and largest void.
    let maxE = -Infinity, maxI = -1, minE = Infinity, minI = -1;
    for (let i = 0; i < N; i++) {
      if (placed[i] && energy[i] > maxE) { maxE = energy[i]; maxI = i; }
      if (!placed[i] && energy[i] < minE) { minE = energy[i]; minI = i; }
    }
    if (maxI < 0 || minI < 0) break;
    if (maxI === minI) break;
    placed[maxI] = 0; bump(maxI % w, Math.floor(maxI / w), -1);
    placed[minI] = 1; bump(minI % w, Math.floor(minI / w), +1);
  }

  // Phase 3: assign ranks. First, rank the placed pixels DESCENDING by
  // energy (tightest cluster first); then rank the empties ASCENDING by
  // energy (largest void first). This yields a good ordering.
  const placedIdxs = [];
  const emptyIdxs = [];
  for (let i = 0; i < N; i++) (placed[i] ? placedIdxs : emptyIdxs).push(i);

  // Sort placed by ascending energy → assign higher ranks (later removed = lower threshold)
  // To keep it simple and deterministic, sort by energy + tiebreak by index.
  placedIdxs.sort((a, b) => energy[a] - energy[b] || a - b);
  emptyIdxs.sort((a, b) => energy[a] - energy[b] || a - b);

  let r = 0;
  for (const i of placedIdxs) rank[i] = r++;
  for (const i of emptyIdxs) rank[i] = r++;
  return rank;
}

// ---------- Animation curves ----------
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function radiusAt(f) {
  if (f <= PEAK) {
    const t = f / PEAK; // 0..1
    return R_MIN + (R_MAX - R_MIN) * easeInOut(t);
  } else {
    const t = (f - PEAK) / (NFRAMES - 1 - PEAK); // 0..1
    return R_MAX * (1 - easeOutCubic(t));
  }
}

// Dither threshold ramps up during the decay phase.
// 0 .. ditherStart: no dither.
// ditherStart .. NFRAMES-1: 0 → 1.
function ditherAt(f) {
  const ditherStart = 11;
  if (f < ditherStart) return 0;
  const t = (f - ditherStart) / (NFRAMES - 1 - ditherStart);
  return Math.min(1, t);
}

// Age affects brightness: 1.0 fully bright at frame 0, 0.55 by end.
function brightnessAt(f) {
  const t = f / (NFRAMES - 1);
  return 1.0 - 0.45 * t;
}

// ---------- Build a single frame ----------
const CX = W / 2 - 0.5;
const CY = H / 2 - 0.5;

const BONE = { r: 235, g: 235, b: 220 }; // bone-white at core
const GREY = { r: 145, g: 145, b: 140 }; // greyish at edge

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return { r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) };
}

// Procedural turbulence in (theta, frame) — sum of sines at three octaves
// with phases that advance per frame so the volutes evolve over time. Returns
// a value in roughly [-1, 1]. Deterministic, parametrised by `phase`.
function turb(theta, f, phase) {
  const tf = f * 0.18; // time scrolls slowly per frame
  return (
    0.55 * Math.sin(3 * theta + tf * 1.3 + 0.7 + phase[0]) +
    0.30 * Math.sin(5 * theta - tf * 0.9 + 2.1 + phase[1]) +
    0.15 * Math.sin(8 * theta + tf * 1.7 + 4.4 + phase[2])
  );
}

// Lobed multiplier: ~1.0 ± amp. Amp grows with frame age so older puffs are
// more wispy / less circular.
function lobeAt(theta, f, phase) {
  const ampBase = 0.18;
  const ampAge = 0.32 * (f / (NFRAMES - 1));
  const amp = ampBase + ampAge;
  return 1 + amp * turb(theta, f, phase);
}

// A second turbulence field driving internal density variations — slower
// frequencies so we see broad swirls inside the puff rather than rim wobble.
function innerTurb(theta, radial, f, phase) {
  const tf = f * 0.12;
  return (
    0.5 * Math.sin(2 * theta + 4 * radial + tf * 1.1 + phase[3]) +
    0.5 * Math.sin(4 * theta - 3 * radial - tf * 0.7 + 1.3 + phase[4])
  );
}

// Derive 5 phase offsets in [0, 2π) from a 32-bit seed.
function phasesFromSeed(seed) {
  let s = seed >>> 0;
  const out = [];
  for (let i = 0; i < 5; i++) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out.push(((t ^ (t >>> 14)) >>> 0) / 4294967296 * Math.PI * 2);
  }
  return out;
}

function buildFrame(f, BN, phase) {
  const R = radiusAt(f);
  const dither = ditherAt(f);
  const bright = brightnessAt(f);
  const px = new Uint8Array(W * H).fill(TRANSPARENT_IDX);

  if (R <= 0.5) {
    return px; // fully empty frame at the very tail
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      // Lobed effective radius per angle → volutes instead of perfect circle.
      const Reff = R * lobeAt(theta, f, phase);
      if (d > Reff) continue;

      // tNorm: 0 at center, 1 at this angle's rim.
      const tNorm = d / Reff;

      // Blue-noise rank in [0..1).
      const bnRank = BN[y * W + x] / (W * H);

      // Edge feathering uses turbulence too so the rim eats into the puff
      // unevenly. Inner turbulence adds density variation in the middle.
      const inner = innerTurb(theta, d / R_MAX, f, phase); // -1..1
      const innerCut = Math.max(0, -inner * 0.25); // negative inner = void

      const edgeFade = Math.max(0, (tNorm - 0.65) / 0.35); // 0..1 in outer rim
      const ageCut = dither * (0.25 + 0.75 * tNorm);
      const cutThreshold = Math.max(edgeFade, ageCut, innerCut);
      if (bnRank < cutThreshold) continue;

      // Colour: bone-white core → grey rim, darkened by age, slightly
      // modulated by inner turbulence for variation.
      let col = lerpColor(BONE, GREY, tNorm);
      const shade = bright * (0.95 + 0.05 * inner);
      col = { r: col.r * shade, g: col.g * shade, b: col.b * shade };
      px[y * W + x] = idx(Math.round(col.r), Math.round(col.g), Math.round(col.b));
    }
  }
  return px;
}

// ---------- Encode .spr (IDSP v1) ----------
function encodeSprite(frames) {
  // header: 36 bytes
  // ident "IDSP", version 1, type 2 (SPR_VP_PARALLEL),
  // bounding radius, width, height, numframes, beamlength 0, synctype 0
  const radius = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);          // version
  header.writeInt32LE(2, 8);          // SPR_VP_PARALLEL
  header.writeFloatLE(radius, 12);    // boundingradius
  header.writeInt32LE(W, 16);
  header.writeInt32LE(H, 20);
  header.writeInt32LE(frames.length, 24);
  header.writeFloatLE(0, 28);         // beamlength
  header.writeInt32LE(0, 32);         // synctype = ST_SYNC

  const chunks = [header];

  for (const px of frames) {
    // frametype = SPR_SINGLE (0)
    const tag = Buffer.alloc(4);
    tag.writeInt32LE(0, 0);

    // dspriteframe_t: origin[0], origin[1], width, height
    const fh = Buffer.alloc(16);
    fh.writeInt32LE(-W / 2, 0);       // origin x
    fh.writeInt32LE(H / 2, 4);        // origin y (Y up, so positive = top)
    fh.writeInt32LE(W, 8);
    fh.writeInt32LE(H, 12);

    chunks.push(tag, fh, Buffer.from(px));
  }

  return Buffer.concat(chunks);
}

// ---------- Main ----------
fs.mkdirSync(OUT_REPO_DIR, { recursive: true });
try { fs.mkdirSync(OUT_GAME_DIR, { recursive: true }); } catch {}

for (const variant of VARIANTS) {
  const BN = makeBlueNoise(W, H, variant.seed);
  const phase = phasesFromSeed(variant.seed);

  const frames = [];
  for (let f = 0; f < NFRAMES; f++) frames.push(buildFrame(f, BN, phase));

  const buf = encodeSprite(frames);
  const outRepo = path.join(OUT_REPO_DIR, variant.name + '.spr');
  const outGame = path.join(OUT_GAME_DIR, variant.name + '.spr').replace(/\\/g, '/');
  fs.writeFileSync(outRepo, buf);
  try { fs.writeFileSync(outGame, buf); }
  catch (e) { console.warn('Could not write game copy:', e.message); }

  console.log(`Wrote ${outRepo} (${buf.length} bytes, seed 0x${variant.seed.toString(16).toUpperCase()})`);
}
