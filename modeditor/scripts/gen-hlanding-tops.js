/**
 * Clone the canonical hlanding top into its 3 rotations.
 *
 * The user hand-paints assets/textures/hlanding-N/top.png. This script
 * rotates it 90°/180°/270° into hlanding-E/S/O/top.png. ONLY top.png is
 * touched — side/capital/base/bottom are left as-is. Re-run after editing
 * the N art to propagate it.
 *
 * Reuses the same PNG decode/encode/rotate logic as gen-curve-textures.js.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;
const OUT_ROOT = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures');
const CANON_PATH = path.join(OUT_ROOT, 'hlanding-N', 'top.png');

// ---- PNG decoder (RGBA / RGB 8-bit), same as gen-curve-textures.js ----
function decodePNG(filepath) {
  const buf = fs.readFileSync(filepath);
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error(`not a PNG: ${filepath}`);
  }
  let pos = 8;
  let ihdr = null;
  let idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!ihdr) throw new Error(`no IHDR in ${filepath}`);
  if (ihdr.bitDepth !== 8 || (ihdr.colorType !== 6 && ihdr.colorType !== 2)) {
    throw new Error(`unsupported PNG (bitDepth=${ihdr.bitDepth} colorType=${ihdr.colorType}) in ${filepath}; need 8-bit RGB or RGBA`);
  }
  const channels = ihdr.colorType === 6 ? 4 : 3;
  const stride = ihdr.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(ihdr.width * ihdr.height * channels);
  let pPos = 0, rPos = 0;
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[rPos++];
    const row = raw.slice(rPos, rPos + stride);
    rPos += stride;
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          v = (v + pred) & 0xff;
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      out[x] = v;
    }
    out.copy(prev);
    out.copy(pixels, pPos);
    pPos += stride;
  }
  if (channels === 3) {
    const rgba = Buffer.alloc(ihdr.width * ihdr.height * 4);
    for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
      rgba[j] = pixels[i]; rgba[j+1] = pixels[i+1]; rgba[j+2] = pixels[i+2]; rgba[j+3] = 255;
    }
    return { width: ihdr.width, height: ihdr.height, pixels: rgba };
  }
  return { width: ihdr.width, height: ihdr.height, pixels };
}

// ---- PNG encoder (RGBA 8-bit) ----
function writePNG(filepath, data, width = W, height = H) {
  function crc32(buf) {
    let c; const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, body) {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])), 0);
    return Buffer.concat([len, typeBuf, body, crcBuf]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (1 + width * 4) + 1 + x * 4;
      const i = (y * width + x) * 4;
      raw[o] = data[i]; raw[o+1] = data[i+1]; raw[o+2] = data[i+2]; raw[o+3] = data[i+3];
    }
  }
  const idat = zlib.deflateSync(raw);
  fs.writeFileSync(filepath, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

// ---- 90° rotation (W==H==64) ----
function rotate(src, srcW, srcH, deg) {
  const dst = Buffer.alloc(srcW * srcH * 4);
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      let sx, sy;
      switch (deg) {
        case 90:  sx = y;            sy = srcW - 1 - x; break;
        case 180: sx = srcW - 1 - x; sy = srcH - 1 - y; break;
        case 270: sx = srcH - 1 - y; sy = x;            break;
        default: throw new Error(`unsupported rotation ${deg}`);
      }
      const si = (sy * srcW + sx) * 4;
      const di = (y * srcW + x) * 4;
      dst[di] = src[si]; dst[di+1] = src[si+1]; dst[di+2] = src[si+2]; dst[di+3] = src[si+3];
    }
  }
  return dst;
}

const canon = decodePNG(CANON_PATH);
if (canon.width !== W || canon.height !== H) {
  throw new Error(`canon ${CANON_PATH} is ${canon.width}×${canon.height}, expected ${W}×${H}`);
}
console.log(`loaded canon: ${CANON_PATH} (${canon.width}×${canon.height})`);

for (const { dir, deg } of [{ dir: 'E', deg: 90 }, { dir: 'S', deg: 180 }, { dir: 'O', deg: 270 }]) {
  const out = path.join(OUT_ROOT, `hlanding-${dir}`, 'top.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writePNG(out, rotate(canon.pixels, W, H, deg));
  console.log(`wrote ${out}  (rotated ${deg}°)`);
}
console.log('done — only top.png rotated; other faces untouched.');
