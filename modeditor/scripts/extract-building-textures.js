#!/usr/bin/env node
/**
 * One-shot helper: pull the original Quake building textures (front,
 * building, iktkfl03) out of atlasmaper's text.wad and emit them as
 * PNGs under assets/textures/{casa,tower}/<face>.png so the column
 * renderer uses the real textures instead of the metal placeholder.
 *
 * Mapping (matches the column.md face spec):
 *   top     ← iktkfl03   (metal roof)
 *   side    ← building   (upper-storey wall)
 *   capital ← building   (idem)
 *   base    ← front      (storefront / ground floor)
 *   bottom  ← front      (never seen, but kept consistent)
 *
 * Uses Node-builtin zlib for PNG encoding so the script has no deps.
 * Run from the modeditor/ folder:
 *   node scripts/extract-building-textures.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { loadWad } = require('../src/main/wadLoader');

const ATLAS_WAD = path.resolve(__dirname, '..', '..', '..', 'atlasmaper', 'wads', 'text.wad');
const ASSETS = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures');

const FACE_TO_SOURCE = {
  top:     'iktkfl03',
  side:    'building',
  capital: 'building',
  base:    'front',
  bottom:  'front',
};

const TARGET_BIOMES = ['casa', 'tower'];

// ---------- PNG encoder (RGBA, no deps) ----------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePngRgba(width, height, rgba) {
  // IHDR.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;     // bit depth
  ihdr[9]  = 6;     // color type RGBA
  ihdr[10] = 0;     // compression
  ihdr[11] = 0;     // filter
  ihdr[12] = 0;     // interlace
  // IDAT — filter-byte 0 (None) before each scanline.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- main ----------
(async () => {
  if (!fs.existsSync(ATLAS_WAD)) {
    console.error(`text.wad not found at ${ATLAS_WAD}`);
    process.exit(1);
  }
  const wad = await loadWad(ATLAS_WAD);
  const byName = new Map(wad.textures.map(t => [t.name, t]));

  const needed = [...new Set(Object.values(FACE_TO_SOURCE))];
  for (const n of needed) {
    if (!byName.has(n)) {
      console.error(`texture "${n}" not found in ${ATLAS_WAD}`);
      process.exit(1);
    }
  }

  for (const biome of TARGET_BIOMES) {
    const dir = path.join(ASSETS, biome);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (const [face, srcName] of Object.entries(FACE_TO_SOURCE)) {
      const src = byName.get(srcName);
      const png = encodePngRgba(src.width, src.height, Buffer.from(src.rgba.buffer, src.rgba.byteOffset, src.rgba.byteLength));
      const out = path.join(dir, `${face}.png`);
      fs.writeFileSync(out, png);
      console.log(`wrote ${path.relative(ASSETS, out)}  ←  ${srcName}  (${src.width}×${src.height})`);
    }
  }
})().catch(err => { console.error(err); process.exit(1); });
