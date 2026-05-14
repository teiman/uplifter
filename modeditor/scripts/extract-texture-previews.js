#!/usr/bin/env node
/**
 * Extract texture previews from the WADs into PNG files the renderer
 * can import. Self-contained: a minimal WAD2 reader + a minimal PNG
 * writer (zlib + manual CRCs), no third-party dependencies.
 *
 * Outputs one .png per palette entry to:
 *   src/renderer/assets/textures/<id>.png
 * where <id> matches BRUSH_PALETTE.id in shared/types.mjs.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { QUAKE_PALETTE_FLAT } = require('../src/shared/quakePalette');

const WADS_DIR = path.resolve(__dirname, '..', 'wads');
const OUT_DIR  = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures');

// Palette id → WAD texture name. Mirrors TEXTURES in shared/types.mjs.
const WANT = {
  tierra:           'dirt',
  arena:            'sand',
  agua:             '*water',
  'road-up':        'road_up',
  'road-down-left': 'road_left',
  'road-x':         'roadx',
  metal:            'metal1_1',
  plaza:            'cement1',
};

// ---------- WAD2 reader ----------
// Format: header "WAD2" + numLumps int32 + dirOffset int32. Each directory
// entry has filepos/disksize/size/type/compression/pad/name(16 bytes).
// Miptex lumps then carry: name(16) + width int32 + height int32 +
// offset[4] int32 + paletted pixel data.
function loadWad(wadPath) {
  const buf = fs.readFileSync(wadPath);
  if (buf.toString('ascii', 0, 4) !== 'WAD2') throw new Error(`Not a WAD2 file: ${wadPath}`);
  const numLumps = buf.readInt32LE(4);
  const dirOffset = buf.readInt32LE(8);
  const textures = new Map();
  for (let i = 0; i < numLumps; i++) {
    const e = dirOffset + i * 32;
    const filepos = buf.readInt32LE(e);
    const type    = buf.readUInt8(e + 12);
    // The texture-bearing type is 0x44 ('D') in vanilla id1; we accept
    // anything and just probe the mip header below.
    if (type !== 0x44) continue;
    let nameEnd = 16;
    for (let k = 0; k < 16; k++) {
      if (buf[e + 16 + k] === 0) { nameEnd = k; break; }
    }
    const lumpName = buf.toString('ascii', e + 16, e + 16 + nameEnd);

    // Miptex header.
    const mhOff = filepos;
    const w = buf.readInt32LE(mhOff + 16);
    const h = buf.readInt32LE(mhOff + 20);
    const pixelOffset = buf.readInt32LE(mhOff + 24);
    const pixels = buf.subarray(mhOff + pixelOffset, mhOff + pixelOffset + w * h);
    textures.set(lumpName, { name: lumpName, width: w, height: h, indices: pixels });
  }
  return textures;
}

// Decode a paletted texture into a tightly packed RGB buffer (w*h*3).
function paletteToRgb(tex) {
  const out = Buffer.alloc(tex.width * tex.height * 3);
  for (let i = 0; i < tex.indices.length; i++) {
    const idx = tex.indices[i];
    out[i * 3    ] = QUAKE_PALETTE_FLAT[idx * 3    ];
    out[i * 3 + 1] = QUAKE_PALETTE_FLAT[idx * 3 + 1];
    out[i * 3 + 2] = QUAKE_PALETTE_FLAT[idx * 3 + 2];
  }
  return out;
}

// ---------- PNG writer (24-bit RGB, no interlacing) ----------
// PNG = signature(8) + IHDR + IDAT + IEND. Each chunk: length(4) +
// type(4) + data + CRC(4). Pixel data is row-prefixed with a filter
// byte (0 = no filter) then RGB bytes, then zlib-deflated.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function writePng(p, rgb, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8]  = 8;   // bit depth
  ihdr[9]  = 2;   // colour type: RGB
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace
  // IDAT: each row prefixed with filter byte 0.
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw);
  fs.writeFileSync(p, Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ---------- main ----------
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wads = fs.readdirSync(WADS_DIR)
    .filter(f => f.toLowerCase().endsWith('.wad'))
    .map(f => path.join(WADS_DIR, f));
  // Later WADs override earlier ones (matches the writer's wad list semantics).
  const merged = new Map();
  for (const p of wads) {
    for (const [name, tex] of loadWad(p)) merged.set(name, tex);
  }
  let written = 0, missing = 0;
  for (const [id, wadName] of Object.entries(WANT)) {
    const tex = merged.get(wadName);
    if (!tex) { console.warn('MISSING in WADs:', id, '→', wadName); missing++; continue; }
    const rgb = paletteToRgb(tex);
    const out = path.join(OUT_DIR, `${id}.png`);
    writePng(out, rgb, tex.width, tex.height);
    console.log(`wrote ${out} (${tex.width}×${tex.height})`);
    written++;
  }
  console.log(`done: ${written} written, ${missing} missing`);
}
main();
