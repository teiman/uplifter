/**
 * Generate 5-face PNG sets for shipping-container blocks, one folder per
 * colour: cont0..cont5 (rust red, Maersk blue, green, yellow, orange, grey).
 *
 *   cont<N>/side.png    — container wall: vertical corrugation + door seams
 *   cont<N>/capital.png — same wall (top course of the stack)
 *   cont<N>/base.png    — same wall, a touch darker (ground course)
 *   cont<N>/top.png     — corrugated steel roof seen from above
 *   cont<N>/bottom.png  — plain dark underside
 *
 * Output: src/renderer/assets/textures/cont{0..5}/*.png  (64x64 RGBA)
 *
 * The building "contenedores" stacks these; mapWriter picks WHICH colour per
 * cube from the cell position (2-cell bands) + level, so a yard of containers
 * reads as coloured stripes like a real container ship. These are placeholder
 * art — hand-edit the PNGs later.
 *
 * Same encoder/helpers as gen-mil-textures.js so the look matches.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;
const OUT_ROOT = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures');

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
  for (let i = 0; i < W * H; i++) { data[i*4] = r; data[i*4+1] = g; data[i*4+2] = b; data[i*4+3] = a; }
  return data;
}
function setPx(data, x, y, [r, g, b, a]) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = (a === undefined) ? 255 : a;
}
function applyGrain(data, rand, intensity = 10) {
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 2 * intensity;
    data[i*4]   = Math.max(0, Math.min(255, data[i*4]   + n));
    data[i*4+1] = Math.max(0, Math.min(255, data[i*4+1] + n));
    data[i*4+2] = Math.max(0, Math.min(255, data[i*4+2] + n));
  }
}
function vLine(data, x, y0, y1, color) { for (let y = y0; y < y1; y++) setPx(data, x, y, color); }
function hLine(data, x0, x1, y, color) { for (let x = x0; x < x1; x++) setPx(data, x, y, color); }

function writePNG(filepath, data) {
  function crc32(buf) {
    let c; const table = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, body) {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])), 0);
    return Buffer.concat([len, typeBuf, body, crcBuf]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (1 + W * 4) + 1 + x * 4;
      const i = (y * W + x) * 4;
      raw[o] = data[i]; raw[o+1] = data[i+1]; raw[o+2] = data[i+2]; raw[o+3] = data[i+3];
    }
  }
  const idat = zlib.deflateSync(raw);
  fs.writeFileSync(filepath, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

const shade = (c, f) => [
  Math.max(0, Math.min(255, Math.round(c[0] * f))),
  Math.max(0, Math.min(255, Math.round(c[1] * f))),
  Math.max(0, Math.min(255, Math.round(c[2] * f))),
];

// Shipping-line palette (classic container colours).
const COLORS = [
  { id: 'cont0', name: 'rust red',  rgb: [150, 52, 44]  },
  { id: 'cont1', name: 'maersk blue',rgb: [40, 78, 140] },
  { id: 'cont2', name: 'green',      rgb: [40, 110, 64]  },
  { id: 'cont3', name: 'yellow',     rgb: [200, 168, 48] },
  { id: 'cont4', name: 'orange',     rgb: [196, 96, 36]  },
  { id: 'cont5', name: 'grey',       rgb: [120, 122, 126]},
];

// Container WALL: base colour + vertical corrugation (alternating light/dark
// columns) + a horizontal top/bottom rail + a faint vertical door seam down
// the middle. `darken` shifts the whole thing for the ground course.
function containerWall(rgb, seed, darken = 1) {
  const base = shade(rgb, darken);
  const data = blankImage(base[0], base[1], base[2]);
  const rand = mulberry32(seed);
  const litCol  = shade(base, 1.14);
  const darkCol = shade(base, 0.82);
  // Vertical corrugation: ribs every 4px (lit edge + shadow edge).
  for (let x = 0; x < W; x++) {
    const phase = x % 4;
    let col = null;
    if (phase === 0) col = litCol;
    else if (phase === 2) col = darkCol;
    if (col) for (let y = 0; y < H; y++) setPx(data, x, y, col);
  }
  // Top and bottom rails (the container's steel frame edges).
  const rail = shade(base, 0.6);
  for (let y = 0; y < 4; y++) hLine(data, 0, W, y, rail);
  for (let y = H - 5; y < H; y++) hLine(data, 0, W, y, rail);
  // Centre door seam + corner posts (vertical frame).
  const post = shade(base, 0.55);
  vLine(data, 0, 0, H, post); vLine(data, 1, 0, H, post);
  vLine(data, W - 2, 0, H, post); vLine(data, W - 1, 0, H, post);
  vLine(data, W / 2 - 1, 4, H - 5, shade(base, 0.7));
  vLine(data, W / 2,     4, H - 5, shade(base, 0.7));
  applyGrain(data, rand, 8);
  return data;
}

// Corrugated steel ROOF seen from above: neutral metal with the rib pattern
// running one way, tinted slightly toward the container colour.
function containerTop(rgb, seed) {
  const metal = shade(rgb, 0.5).map((v, i) => Math.round(v * 0.4 + 150 * 0.6));
  const data = blankImage(metal[0], metal[1], metal[2]);
  const rand = mulberry32(seed + 7);
  const lit  = shade(metal, 1.12);
  const dark = shade(metal, 0.85);
  for (let y = 0; y < H; y++) {
    const phase = y % 4;
    let col = null;
    if (phase === 0) col = lit; else if (phase === 2) col = dark;
    if (col) hLine(data, 0, W, y, col);
  }
  // Frame edge.
  const edge = shade(metal, 0.6);
  for (let y = 0; y < 3; y++) hLine(data, 0, W, y, edge);
  for (let y = H - 3; y < H; y++) hLine(data, 0, W, y, edge);
  vLine(data, 0, 0, H, edge); vLine(data, 1, 0, H, edge);
  vLine(data, W - 2, 0, H, edge); vLine(data, W - 1, 0, H, edge);
  applyGrain(data, rand, 7);
  return data;
}

function containerBottom() { return blankImage(28, 28, 30); }

let n = 0;
for (const c of COLORS) {
  const folder = path.join(OUT_ROOT, c.id);
  fs.mkdirSync(folder, { recursive: true });
  const seed = 0x100 + c.id.charCodeAt(4) * 31;
  writePNG(path.join(folder, 'side.png'),    containerWall(c.rgb, seed, 1.0));
  writePNG(path.join(folder, 'capital.png'), containerWall(c.rgb, seed + 1, 1.05));
  writePNG(path.join(folder, 'base.png'),    containerWall(c.rgb, seed + 2, 0.85));
  writePNG(path.join(folder, 'top.png'),     containerTop(c.rgb, seed));
  writePNG(path.join(folder, 'bottom.png'),  containerBottom());
  console.log(`wrote ${c.id} (${c.name})`);
  n++;
}
console.log(`done — ${n} container colours, 5 faces each, in ${OUT_ROOT}`);
