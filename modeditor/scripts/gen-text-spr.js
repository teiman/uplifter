#!/usr/bin/env node
/**
 * gen-text-spr.js — Build a multi-frame world-text sprite from the game's
 * conchars font. Each FRAME is one whole WORD (EXTRACTION, PICKUP, ...),
 * composed by copying the 8x8 glyph of each letter out of conchars_mod.png.
 *
 * The QC `worldtext` entity loads this one sprite and picks `frame = word
 * index` to mark things in the world ("EXTRACTION", "PICKUP", "RETURN", ...).
 *
 * Rendering:
 *   - Glyphs are read from conchars_mod.png (128x128, 16x16 grid of 8x8).
 *   - Each glyph is RECOLOURED by word: its shape (ink mask) is painted with
 *     the word's colour; the rest is transparent.
 *   - Scaled SCALE x (default 4 → 32px tall letters).
 *   - Billboard (SPR_VP_PARALLEL): always faces the camera.
 *
 * Adding a word: append to WORDS below and re-run. The QC keeps the frame
 * order in sync via the WORDTEXT_* constants — keep both lists in the same
 * order. Output: ../../mod/progs/worldtext.spr + mirror to d:/quake/uplifter.
 *
 *   node scripts/gen-text-spr.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CONCHARS = path.resolve(__dirname, '..', '..', 'conchars_mod.png');
const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'progs', 'worldtext.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/worldtext.spr';

const GLYPH = 8;          // conchars cell size
const SCALE = 4;          // 8 → 32px letters
const PAD   = 2 * SCALE;  // border padding around the word (transparent)
const SPACING = 1;        // extra glyph-space between letters, in glyph px

// Word list. ORDER MATTERS — the QC's WORDTEXT_* frame indices must match.
// Add new words at the END to keep existing indices stable. `color` is RGB
// 0..255; the glyph shape is repainted with it.
const WORDS = [
  { text: 'EXTRACTION', color: [90, 230, 120] },  // frame 0 — green
  { text: 'PICKUP',     color: [240, 210, 60] },  // frame 1 — yellow
  { text: 'RETURN',     color: [80, 150, 240] },  // frame 2 — blue
];

// ---------- PNG decode (RGBA / RGB 8-bit) ----------
function decodePNG(filepath) {
  const buf = fs.readFileSync(filepath);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${filepath}`);
  let pos = 8, ihdr = null; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr || ihdr.bitDepth !== 8 || (ihdr.colorType !== 6 && ihdr.colorType !== 2))
    throw new Error(`need 8-bit RGB/RGBA PNG: ${filepath}`);
  const ch = ihdr.colorType === 6 ? 4 : 3;
  const stride = ihdr.width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(ihdr.width * ihdr.height * ch);
  const prev = Buffer.alloc(stride);
  let rPos = 0, pPos = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[rPos++];
    const row = raw.slice(rPos, rPos + stride); rPos += stride;
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      switch (filter) {
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff; break; }
      }
      out[x] = v;
    }
    out.copy(prev); out.copy(px, pPos); pPos += stride;
  }
  // Normalise to RGBA.
  if (ch === 3) {
    const rgba = Buffer.alloc(ihdr.width * ihdr.height * 4);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { rgba[j] = px[i]; rgba[j+1] = px[i+1]; rgba[j+2] = px[i+2]; rgba[j+3] = 255; }
    return { width: ihdr.width, height: ihdr.height, rgba };
  }
  return { width: ihdr.width, height: ihdr.height, rgba: px };
}

// ---------- Quake palette (for the .spr indexed pixels) ----------
const PALETTE_GPL = path.resolve(__dirname, '..', '..', 'tools', 'aseprite-quake-palettes', 'palettes', 'quake.gpl');
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
const SAFE_END = 224;  // avoid fullbright range when matching
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

// ---------- conchars glyph lookup ----------
const font = decodePNG(CONCHARS);
if (font.width !== 128 || font.height !== 128) throw new Error(`expected 128x128 conchars, got ${font.width}x${font.height}`);

// Ink test: a conchars pixel is "ink" if it's not the dark background. Use
// luma threshold + alpha. Background of conchars is near-black/transparent.
function isInk(x, y) {
  const i = (y * font.width + x) * 4;
  const a = font.rgba[i + 3];
  if (a < 64) return false;
  const r = font.rgba[i], g = font.rgba[i + 1], b = font.rgba[i + 2];
  return (r + g + b) > 96;   // brighter than background
}

// ---------- encode .spr (IDSP v1, billboard) ----------
// type 2 = SPR_VP_PARALLEL (billboard: always faces the camera). NOTE: in the
// Quake sprite format 2 = SPR_VP_PARALLEL and 3 = SPR_ORIENTED (fixed) — do
// NOT use 3 for a billboard.
function encodeSprite(frames, W, H) {
  const radius = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);     // version 1
  header.writeInt32LE(2, 8);     // type 2 = SPR_VP_PARALLEL (billboard)
  header.writeFloatLE(radius, 12);
  header.writeInt32LE(W, 16);
  header.writeInt32LE(H, 20);
  header.writeInt32LE(frames.length, 24);
  header.writeFloatLE(0, 28);    // beamlength
  header.writeInt32LE(0, 32);    // synctype
  const chunks = [header];
  for (const px of frames) {
    const tag = Buffer.alloc(4); tag.writeInt32LE(0, 0);  // SPR_SINGLE
    const fh = Buffer.alloc(16);
    fh.writeInt32LE(-Math.floor(W / 2), 0);   // origin x
    fh.writeInt32LE(Math.floor(H / 2), 4);    // origin y
    fh.writeInt32LE(W, 8);
    fh.writeInt32LE(H, 12);
    chunks.push(tag, fh, Buffer.from(px));
  }
  return Buffer.concat(chunks);
}

// ---------- main ----------
// All frames in a .spr must share the same W/H (one header W/H). Size to the
// widest word so every frame fits; narrower words are centred.
let maxW = 0;
for (const w of WORDS) maxW = Math.max(maxW, w.text.length * (GLYPH + SPACING) * SCALE);
const W = maxW + PAD * 2;
const H = GLYPH * SCALE + PAD * 2 + Math.floor(SCALE / 2);  // + shadow room

const frames = WORDS.map(w => {
  // Centre the word: shift pen by half the slack. buildWordFrame starts at
  // PAD; re-centre by building into a temp then copying — simplest is to vary
  // PAD per word, so recompute with a per-word left margin.
  const wordW = w.text.length * (GLYPH + SPACING) * SCALE;
  const left = Math.floor((W - wordW) / 2);
  return buildWordFrameAt(w.text, w.color, W, H, left);
});

// Variant of buildWordFrame with an explicit left margin (for centring).
function buildWordFrameAt(text, color, W, H, left) {
  const px = new Uint8Array(W * H).fill(TRANSPARENT_IDX);
  const ink = nearestIdx(color[0], color[1], color[2]);
  const shadow = nearestIdx(10, 10, 10);
  const advance = (GLYPH + SPACING) * SCALE;
  const penY = PAD;
  const sh = Math.floor(SCALE / 2);
  // shadow pass
  let penX = left;
  for (let k = 0; k < text.length; k++) {
    const ch = text.charCodeAt(k);
    if (ch !== 32) {
      const gx = (ch % 16) * GLYPH, gy = Math.floor(ch / 16) * GLYPH;
      for (let yy = 0; yy < GLYPH; yy++) for (let xx = 0; xx < GLYPH; xx++) {
        if (!isInk(gx + xx, gy + yy)) continue;
        for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
          const dx = penX + xx * SCALE + sx + sh, dy = penY + yy * SCALE + sy + sh;
          if (dx >= 0 && dx < W && dy >= 0 && dy < H && px[dy * W + dx] === TRANSPARENT_IDX) px[dy * W + dx] = shadow;
        }
      }
    }
    penX += advance;
  }
  // ink pass
  penX = left;
  for (let k = 0; k < text.length; k++) {
    const ch = text.charCodeAt(k);
    if (ch !== 32) {
      const gx = (ch % 16) * GLYPH, gy = Math.floor(ch / 16) * GLYPH;
      for (let yy = 0; yy < GLYPH; yy++) for (let xx = 0; xx < GLYPH; xx++) {
        if (!isInk(gx + xx, gy + yy)) continue;
        for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
          const dx = penX + xx * SCALE + sx, dy = penY + yy * SCALE + sy;
          if (dx >= 0 && dx < W && dy >= 0 && dy < H) px[dy * W + dx] = ink;
        }
      }
    }
    penX += advance;
  }
  return px;
}

const buf = encodeSprite(frames, W, H);
fs.mkdirSync(path.dirname(OUT_REPO), { recursive: true });
fs.writeFileSync(OUT_REPO, buf);
try { fs.mkdirSync(path.dirname(OUT_GAME), { recursive: true }); fs.writeFileSync(OUT_GAME.replace(/\\/g, '/'), buf); } catch (e) { console.warn('game copy failed:', e.message); }

console.log(`worldtext.spr: ${W}x${H}, ${frames.length} frames (${WORDS.map(w => w.text).join(', ')})`);
console.log(`  → ${OUT_REPO} (${buf.length} bytes)`);
