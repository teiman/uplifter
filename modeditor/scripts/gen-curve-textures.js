/**
 * Generate the per-direction PNG sets for the curve biomes.
 *
 * The canonical artwork lives in assets/textures/curve-out-N/top.png
 * (hand-drawn by the user). This script:
 *
 *   1. Reads that top.png as the source rotation (0°).
 *   2. Writes a 90° / 180° / 270° rotation of it as
 *      curve-out-E/top.png, curve-out-S/top.png, curve-out-O/top.png.
 *   3. Generates side/capital/base/bottom.png for ALL FOUR folders as
 *      plain asphalt (those faces don't change with rotation).
 *
 * Important: curve-out-N/top.png is NEVER overwritten — it's the
 * source of truth. Re-running this script after edits to that file
 * propagates the new art to the other 3 rotations.
 *
 * Output: src/renderer/assets/textures/curve-out-{N,E,S,O}/*.png
 * The N folder gets its non-top faces written; its top stays as-is.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;
const OUT_ROOT = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures');
const CANON_PATH = path.join(OUT_ROOT, 'curve-out-N', 'top.png');

// ---------------------------------------------------------------------
// PNG decoder (RGBA only) — we only need to read curve-out-N/top.png,
// which the encoder below writes as bit-depth 8 RGBA. If someone hand-
// authored a different format we surface a clear error instead of
// silently producing garbage rotations.
// ---------------------------------------------------------------------
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
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 8 + len + 4;     // skip header + data + crc
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported bit depth ${ihdr.bitDepth} in ${filepath}`);
  if (ihdr.interlace !== 0) throw new Error(`interlaced PNGs not supported: ${filepath}`);
  // colorType: 2=RGB, 6=RGBA. Anything else → bail rather than guess.
  if (ihdr.colorType !== 2 && ihdr.colorType !== 6) {
    throw new Error(`unsupported colorType ${ihdr.colorType} in ${filepath} (need 2=RGB or 6=RGBA)`);
  }
  const bpp = ihdr.colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = ihdr.width * bpp;
  // Defilter line by line (PNG filter types 0..4).
  const pixels = Buffer.alloc(ihdr.height * stride);
  let pPos = 0, rawPos = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[rawPos++];
    const line = raw.slice(rawPos, rawPos + stride);
    rawPos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[pPos + x - bpp] : 0;
      const b = y > 0 ? pixels[pPos - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? pixels[pPos - stride + x - bpp] : 0;
      let val = line[x];
      switch (filter) {
        case 0: break;                                   // None
        case 1: val = (val + a) & 0xff; break;           // Sub
        case 2: val = (val + b) & 0xff; break;           // Up
        case 3: val = (val + Math.floor((a + b) / 2)) & 0xff; break;  // Average
        case 4: {                                        // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          val = (val + pr) & 0xff;
          break;
        }
        default: throw new Error(`unknown PNG filter type ${filter}`);
      }
      pixels[pPos + x] = val;
    }
    pPos += stride;
  }
  // Expand RGB → RGBA (alpha 255) so the rest of the script can assume
  // 4-channel output.
  if (ihdr.colorType === 2) {
    const out = Buffer.alloc(ihdr.width * ihdr.height * 4);
    for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
      out[j]   = pixels[i];
      out[j+1] = pixels[i+1];
      out[j+2] = pixels[i+2];
      out[j+3] = 255;
    }
    return { width: ihdr.width, height: ihdr.height, pixels: out };
  }
  return { width: ihdr.width, height: ihdr.height, pixels };
}

// ---------------------------------------------------------------------
// PNG encoder (RGBA 8-bit). Same as gen-ruina-textures.js / earlier
// drafts of this file.
// ---------------------------------------------------------------------
function writePNG(filepath, data, width = W, height = H) {
  function crc32(buf) {
    let c;
    const table = [];
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

// ---------------------------------------------------------------------
// 90° rotation. Source (W×H) → destination (H×W; same since W=H=64).
//   90° CW:  dst[x, y] = src[y, W-1-x]
//  180°:     dst[x, y] = src[W-1-x, H-1-y]
//  270° CW:  dst[x, y] = src[H-1-y, x]
// rgba buffers are row-major (y * W * 4 + x * 4).
// ---------------------------------------------------------------------
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
      dst[di]   = src[si];
      dst[di+1] = src[si+1];
      dst[di+2] = src[si+2];
      dst[di+3] = src[si+3];
    }
  }
  return dst;
}

// ---------------------------------------------------------------------
// PRNG + asphalt face generators. side/capital/base/bottom are direction-
// agnostic, so we generate ONE set and write it into all 4 folders.
// ---------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function blankImage(r, g, b, a = 255) {
  const data = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i*4] = r; data[i*4+1] = g; data[i*4+2] = b; data[i*4+3] = a;
  }
  return data;
}
function applyGrain(data, rand, intensity = 16) {
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 2 * intensity;
    data[i*4]   = Math.max(0, Math.min(255, data[i*4]   + n));
    data[i*4+1] = Math.max(0, Math.min(255, data[i*4+1] + n));
    data[i*4+2] = Math.max(0, Math.min(255, data[i*4+2] + n));
  }
}
function setPx(data, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a;
}

const ASPHALT_BG = [100, 95, 92];
const ASPHALT_DARK = [60, 55, 52];

function asphaltSide(seed) {
  const rand = mulberry32(seed);
  const data = blankImage(ASPHALT_BG[0] - 10, ASPHALT_BG[1] - 12, ASPHALT_BG[2] - 12);
  applyGrain(data, rand, 18);
  for (let x = 0; x < W; x++) {
    setPx(data, x, 22, ASPHALT_DARK[0], ASPHALT_DARK[1], ASPHALT_DARK[2], 255);
    setPx(data, x, 44, ASPHALT_DARK[0], ASPHALT_DARK[1], ASPHALT_DARK[2], 255);
  }
  return data;
}
function asphaltCapital(seed) {
  const data = asphaltSide(seed + 11);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < W; x++)
      setPx(data, x, y, ASPHALT_DARK[0], ASPHALT_DARK[1], ASPHALT_DARK[2], 255);
  return data;
}
function asphaltBase(seed) {
  const data = asphaltSide(seed + 21);
  for (let y = H - 6; y < H; y++)
    for (let x = 0; x < W; x++)
      setPx(data, x, y, ASPHALT_DARK[0] - 10, ASPHALT_DARK[1] - 10, ASPHALT_DARK[2] - 10, 255);
  return data;
}
function asphaltBottom() {
  return blankImage(35, 35, 35);
}

// ---------------------------------------------------------------------
// Driver — rotate the canonical top.png into the 3 other folders, and
// regenerate side/capital/base/bottom for all 4.
// ---------------------------------------------------------------------
const canon = decodePNG(CANON_PATH);
if (canon.width !== W || canon.height !== H) {
  throw new Error(`canon ${CANON_PATH} is ${canon.width}×${canon.height}, expected ${W}×${H}`);
}
console.log(`loaded canon: ${CANON_PATH} (${canon.width}×${canon.height})`);

const ROTATIONS = [
  { dir: 'E', deg: 90  },
  { dir: 'S', deg: 180 },
  { dir: 'O', deg: 270 },
];

// Rotate top.png into the other 3 folders.
for (const { dir, deg } of ROTATIONS) {
  const folder = path.join(OUT_ROOT, `curve-out-${dir}`);
  fs.mkdirSync(folder, { recursive: true });
  const rotated = rotate(canon.pixels, W, H, deg);
  const out = path.join(folder, 'top.png');
  writePNG(out, rotated);
  console.log(`wrote ${out}  (rotated ${deg}°)`);
}

// Regenerate the asphalt faces in all 4 folders so they exist (the writer
// expects all 5 face PNGs per biome). curve-out-N/top.png is NEVER touched.
const FACES = [
  { name: 'side',    fn: asphaltSide    },
  { name: 'capital', fn: asphaltCapital },
  { name: 'base',    fn: asphaltBase    },
  { name: 'bottom',  fn: asphaltBottom  },
];
for (const dir of ['N', 'E', 'S', 'O']) {
  const folder = path.join(OUT_ROOT, `curve-out-${dir}`);
  fs.mkdirSync(folder, { recursive: true });
  // Seed by direction so the side noise isn't identical across them
  // (purely cosmetic).
  const baseSeed = 0x6101 + ['N', 'E', 'S', 'O'].indexOf(dir) * 31;
  for (const { name, fn } of FACES) {
    writePNG(path.join(folder, `${name}.png`), fn(baseSeed));
  }
}

console.log('\nDone — top.png rotated into E/S/O, side/capital/base/bottom regenerated for all 4.');
