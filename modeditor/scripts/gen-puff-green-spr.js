#!/usr/bin/env node
/**
 * gen-puff-green-spr.js — Generate green variants of the smoke puff sprites.
 *
 * Same shape and animation as gen-smoke-spr.js but recoloured to a leafy
 * green palette. Used by info_pickup as a more readable beacon than the
 * default white smoke (info_pickup is a "rescue zone" — green reads as
 * "go here" in most HUDs).
 *
 * Output: ../../mod/progs/puff_g.spr ... puff_g5.spr
 *         + mirror copies to d:/quake/uplifter/progs/
 */

const fs = require('node:fs');
const path = require('node:path');

const W = 32, H = 32;
const NFRAMES = 24;
const PEAK = 4;
const R_MIN = 3;
const R_MAX = 14;
const TRANSPARENT_IDX = 255;
const PALETTE_GPL = path.resolve(__dirname,
  '../../tools/aseprite-quake-palettes/palettes/quake.gpl');

const VARIANTS = [
  { name: 'puff_g',  seed: 0xCAFEBABE },
  { name: 'puff_g2', seed: 0x13371337 },
  { name: 'puff_g3', seed: 0xDEADBEEF },
  { name: 'puff_g4', seed: 0xA5A5A5A5 },
  { name: 'puff_g5', seed: 0x5EED5EED },
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

const SAFE_RANGE_END = 224;
function nearestIndex(r, g, b) {
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < SAFE_RANGE_END; i++) {
    const p = PAL[i];
    const dr = r - p.r, dg = g - p.g, db = b - p.b;
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}

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

// ---------- Blue-noise mask ----------
function makeBlueNoise(w, h, seed = 0xCAFEBABE) {
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
  let placedCount = 0;
  while (placedCount < initial) {
    const p = Math.floor(rnd() * N);
    if (placed[p]) continue;
    placed[p] = 1;
    bump(p % w, Math.floor(p / w), 1);
    placedCount++;
  }

  for (let pass = 0; pass < 4; pass++) {
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

  const placedIdxs = [];
  const emptyIdxs = [];
  for (let i = 0; i < N; i++) (placed[i] ? placedIdxs : emptyIdxs).push(i);
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
    const t = f / PEAK;
    return R_MIN + (R_MAX - R_MIN) * easeInOut(t);
  } else {
    const t = (f - PEAK) / (NFRAMES - 1 - PEAK);
    return R_MAX * (1 - easeOutCubic(t));
  }
}

function ditherAt(f) {
  const ditherStart = 11;
  if (f < ditherStart) return 0;
  const t = (f - ditherStart) / (NFRAMES - 1 - ditherStart);
  return Math.min(1, t);
}

function brightnessAt(f) {
  const t = f / (NFRAMES - 1);
  return 1.0 - 0.45 * t;
}

// ---------- Build a single frame ----------
const CX = W / 2 - 0.5;
const CY = H / 2 - 0.5;

// Green palette — bright signal-green at core, deeper olive at the rim.
const CORE = { r: 160, g: 235, b: 110 };
const RIM  = { r: 55,  g: 130, b: 60 };

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return { r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) };
}

function turb(theta, f, phase) {
  const tf = f * 0.18;
  return (
    0.55 * Math.sin(3 * theta + tf * 1.3 + 0.7 + phase[0]) +
    0.30 * Math.sin(5 * theta - tf * 0.9 + 2.1 + phase[1]) +
    0.15 * Math.sin(8 * theta + tf * 1.7 + 4.4 + phase[2])
  );
}

function lobeAt(theta, f, phase) {
  const ampBase = 0.18;
  const ampAge = 0.32 * (f / (NFRAMES - 1));
  const amp = ampBase + ampAge;
  return 1 + amp * turb(theta, f, phase);
}

function innerTurb(theta, radial, f, phase) {
  const tf = f * 0.12;
  return (
    0.5 * Math.sin(2 * theta + 4 * radial + tf * 1.1 + phase[3]) +
    0.5 * Math.sin(4 * theta - 3 * radial - tf * 0.7 + 1.3 + phase[4])
  );
}

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
    return px;
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      const Reff = R * lobeAt(theta, f, phase);
      if (d > Reff) continue;

      const tNorm = d / Reff;
      const bnRank = BN[y * W + x] / (W * H);

      const inner = innerTurb(theta, d / R_MAX, f, phase);
      const innerCut = Math.max(0, -inner * 0.25);

      const edgeFade = Math.max(0, (tNorm - 0.65) / 0.35);
      const ageCut = dither * (0.25 + 0.75 * tNorm);
      const cutThreshold = Math.max(edgeFade, ageCut, innerCut);
      if (bnRank < cutThreshold) continue;

      let col = lerpColor(CORE, RIM, tNorm);
      const shade = bright * (0.95 + 0.05 * inner);
      col = { r: col.r * shade, g: col.g * shade, b: col.b * shade };
      px[y * W + x] = idx(Math.round(col.r), Math.round(col.g), Math.round(col.b));
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
  header.writeInt32LE(2, 8);
  header.writeFloatLE(radius, 12);
  header.writeInt32LE(W, 16);
  header.writeInt32LE(H, 20);
  header.writeInt32LE(frames.length, 24);
  header.writeFloatLE(0, 28);
  header.writeInt32LE(0, 32);

  const chunks = [header];

  for (const px of frames) {
    const tag = Buffer.alloc(4);
    tag.writeInt32LE(0, 0);
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
