/**
 * Generate 5-face PNG sets for the military buildings: hangar, cuartel,
 * bunker. Same shape as gen-ruina-textures.js, so the editor reads them
 * the same way as plaza/arena/casa/etc.
 *
 *   <kind>/base.png    — ground-floor face (heavy, with skirt)
 *   <kind>/side.png    — middle storeys
 *   <kind>/capital.png — top storey (parapet/cornice variant)
 *   <kind>/top.png     — roof seen from above
 *   <kind>/bottom.png  — underside (rarely visible)
 *
 * Output: src/renderer/assets/textures/{hangar,cuartel,bunker}/*.png
 * 64x64 RGBA each.
 *
 * Once these PNGs exist, types.js can switch the kinds from
 * singleTexBiome('mil_camo') etc. to texturesFor('hangar') etc., and the
 * writer will resolve them through the per-face Quake name machinery
 * exactly like plaza or casa — meaning the writer's column-stack logic
 * (capital on top, base where the neighbour cuts in, side elsewhere)
 * applies, and the cells can be cornered with decorations correctly.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;
const OUT_ROOT = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures');

// ---------------------------------------------------------------------
// PRNG + image helpers (identical pattern to gen-ruina-textures.js so
// the noise/grain look matches the rest of the procedural sets).
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

function setPx(data, x, y, [r, g, b, a]) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = (a === undefined) ? 255 : a;
}

function getPx(data, x, y) {
  const i = (y * W + x) * 4;
  return [data[i], data[i+1], data[i+2], data[i+3]];
}

function applyGrain(data, rand, intensity = 18) {
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 2 * intensity;
    data[i*4]   = Math.max(0, Math.min(255, data[i*4]   + n));
    data[i*4+1] = Math.max(0, Math.min(255, data[i*4+1] + n * 0.95));
    data[i*4+2] = Math.max(0, Math.min(255, data[i*4+2] + n * 0.9));
  }
}

function fillRect(data, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPx(data, x, y, color);
    }
  }
}

function hLine(data, x0, x1, y, color) {
  for (let x = x0; x < x1; x++) setPx(data, x, y, color);
}

function vLine(data, x, y0, y1, color) {
  for (let y = y0; y < y1; y++) setPx(data, x, y, color);
}

// Minimal PNG encoder — same as gen-ruina-textures.js.
function writePNG(filepath, data) {
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

// ---------------------------------------------------------------------
// HANGAR — camo green corrugated steel + roof skylights.
// ---------------------------------------------------------------------
// Palette inspired by mil_camo (auto.wad procedural) — kept close so a
// hangar wall reads similar to surrounding camo if both appear.
const HANG_BASE = [80, 95, 70];   // muted olive
const HANG_DARK = [55, 65, 48];
const HANG_LIGHT = [115, 130, 95];
const HANG_TRIM = [40, 45, 35];

function hangarSide(seed) {
  const rand = mulberry32(seed);
  const data = blankImage(HANG_BASE[0], HANG_BASE[1], HANG_BASE[2]);
  applyGrain(data, rand, 12);
  // Vertical corrugation: every 4 px a darker line + a lighter highlight.
  for (let x = 0; x < W; x += 4) {
    vLine(data, x,     0, H, [HANG_DARK[0], HANG_DARK[1], HANG_DARK[2], 255]);
    vLine(data, x + 1, 0, H, [HANG_LIGHT[0], HANG_LIGHT[1], HANG_LIGHT[2], 255]);
  }
  // Two horizontal seam lines (panel joints).
  hLine(data, 0, W, 20, [HANG_TRIM[0], HANG_TRIM[1], HANG_TRIM[2], 255]);
  hLine(data, 0, W, 44, [HANG_TRIM[0], HANG_TRIM[1], HANG_TRIM[2], 255]);
  return data;
}

function hangarBase(seed) {
  // Same corrugation, plus a concrete skirt at the bottom 12 px.
  const data = hangarSide(seed + 1);
  fillRect(data, 0, 52, W, H, [120, 118, 110, 255]);
  // Skirt grime line.
  hLine(data, 0, W, 52, [70, 68, 62, 255]);
  // Drainage spots.
  const rand = mulberry32(seed + 2);
  for (let k = 0; k < 4; k++) {
    const x = 4 + ((rand() * (W - 8)) | 0);
    setPx(data, x, 58, [55, 53, 48, 255]);
    setPx(data, x, 59, [55, 53, 48, 255]);
  }
  return data;
}

function hangarCapital(seed) {
  // Corrugated wall + parapet band on top.
  const data = hangarSide(seed + 3);
  fillRect(data, 0, 0, W, 6, [HANG_TRIM[0], HANG_TRIM[1], HANG_TRIM[2], 255]);
  hLine(data, 0, W, 6, [HANG_LIGHT[0], HANG_LIGHT[1], HANG_LIGHT[2], 255]);
  // Mid stripe — yellow safety band, classic hangar livery.
  fillRect(data, 0, 30, W, 34, [180, 160, 50, 255]);
  hLine(data, 0, W, 29, [70, 60, 20, 255]);
  hLine(data, 0, W, 34, [70, 60, 20, 255]);
  return data;
}

function hangarTop(seed) {
  // Roof seen from above: ribbed metal in the same camo green, with two
  // skylight strips and a roof vent silhouette.
  const rand = mulberry32(seed + 4);
  const data = blankImage(HANG_BASE[0] + 8, HANG_BASE[1] + 10, HANG_BASE[2] + 5);
  applyGrain(data, rand, 10);
  // Ribs along Y axis.
  for (let y = 0; y < H; y += 5) {
    hLine(data, 0, W, y, [HANG_DARK[0], HANG_DARK[1], HANG_DARK[2], 255]);
  }
  // Two long skylights running E-W (lighter, slightly translucent grey).
  fillRect(data, 6, 16, W - 6, 22, [160, 175, 180, 255]);
  fillRect(data, 6, 42, W - 6, 48, [160, 175, 180, 255]);
  // Vent stack.
  fillRect(data, 28, 30, 36, 36, [50, 50, 50, 255]);
  fillRect(data, 30, 26, 34, 30, [70, 70, 70, 255]);
  return data;
}

function hangarBottom(seed) {
  // Underside — just a darker variant of the side. Mostly invisible.
  const rand = mulberry32(seed + 5);
  const data = blankImage(HANG_DARK[0], HANG_DARK[1], HANG_DARK[2]);
  applyGrain(data, rand, 8);
  return data;
}

// ---------------------------------------------------------------------
// CUARTEL — barracks: tan stucco walls with rows of small windows.
// ---------------------------------------------------------------------
const CUA_BASE = [185, 165, 120];
const CUA_DARK = [130, 115, 80];
const CUA_TRIM = [80, 70, 50];
const CUA_WIN  = [40, 50, 60];

function cuartelSide(seed) {
  const rand = mulberry32(seed);
  const data = blankImage(CUA_BASE[0], CUA_BASE[1], CUA_BASE[2]);
  applyGrain(data, rand, 14);
  // Two horizontal rows of small barracks windows.
  for (let row = 0; row < 2; row++) {
    const y0 = 10 + row * 26;
    for (let col = 0; col < 4; col++) {
      const x0 = 6 + col * 14;
      // Frame + window.
      fillRect(data, x0 - 1, y0 - 1, x0 + 9, y0 + 11, [CUA_TRIM[0], CUA_TRIM[1], CUA_TRIM[2], 255]);
      fillRect(data, x0, y0, x0 + 8, y0 + 10, [CUA_WIN[0], CUA_WIN[1], CUA_WIN[2], 255]);
      // Sash bar.
      hLine(data, x0, x0 + 8, y0 + 5, [CUA_TRIM[0], CUA_TRIM[1], CUA_TRIM[2], 255]);
    }
  }
  return data;
}

function cuartelBase(seed) {
  // Same as side, plus concrete plinth bottom 10 px.
  const data = cuartelSide(seed + 1);
  fillRect(data, 0, 54, W, H, [110, 105, 95, 255]);
  hLine(data, 0, W, 54, [60, 55, 48, 255]);
  return data;
}

function cuartelCapital(seed) {
  // Side + parapet on top.
  const data = cuartelSide(seed + 2);
  fillRect(data, 0, 0, W, 5, [CUA_TRIM[0], CUA_TRIM[1], CUA_TRIM[2], 255]);
  hLine(data, 0, W, 5, [CUA_DARK[0], CUA_DARK[1], CUA_DARK[2], 255]);
  // Faint horizontal stripe under the parapet.
  hLine(data, 0, W, 8, [CUA_DARK[0], CUA_DARK[1], CUA_DARK[2], 255]);
  return data;
}

function cuartelTop(seed) {
  // Tar-and-gravel flat roof seen from above. Darker than walls; AC unit.
  const rand = mulberry32(seed + 3);
  const data = blankImage(70, 65, 58);
  applyGrain(data, rand, 18);
  // Roof perimeter strip.
  fillRect(data, 0, 0, W, 3, [90, 85, 75, 255]);
  fillRect(data, 0, H - 3, W, H, [90, 85, 75, 255]);
  fillRect(data, 0, 0, 3, H, [90, 85, 75, 255]);
  fillRect(data, W - 3, 0, W, H, [90, 85, 75, 255]);
  // AC unit silhouette.
  fillRect(data, 22, 22, 42, 42, [60, 60, 65, 255]);
  fillRect(data, 24, 24, 40, 40, [110, 110, 115, 255]);
  // Vent.
  fillRect(data, 50, 10, 56, 16, [50, 50, 55, 255]);
  return data;
}

function cuartelBottom(seed) {
  return blankImage(50, 45, 38);
}

// ---------------------------------------------------------------------
// BUNKER — heavy concrete: rough light-grey wall + dark slit windows.
// ---------------------------------------------------------------------
const BUN_BASE = [150, 148, 140];
const BUN_DARK = [95, 92, 86];
const BUN_TRIM = [60, 58, 54];

function bunkerSide(seed) {
  const rand = mulberry32(seed);
  const data = blankImage(BUN_BASE[0], BUN_BASE[1], BUN_BASE[2]);
  applyGrain(data, rand, 22);
  // Stained streaks running down from the top — water marks on concrete.
  for (let k = 0; k < 8; k++) {
    const x = 2 + ((rand() * (W - 4)) | 0);
    const len = 15 + ((rand() * 35) | 0);
    for (let y = 0; y < len; y++) {
      const px = getPx(data, x, y);
      setPx(data, x, y, [
        Math.max(0, px[0] - 25),
        Math.max(0, px[1] - 25),
        Math.max(0, px[2] - 25),
        255,
      ]);
    }
  }
  // One horizontal slit window in the upper half.
  const slitY = 16 + ((rand() * 8) | 0);
  fillRect(data, 8, slitY - 1, W - 8, slitY + 5, [BUN_TRIM[0], BUN_TRIM[1], BUN_TRIM[2], 255]);
  fillRect(data, 10, slitY, W - 10, slitY + 4, [20, 20, 25, 255]);
  return data;
}

function bunkerBase(seed) {
  // Plain bunker wall (no skirt — bunkers sit straight on the ground).
  return bunkerSide(seed + 1);
}

function bunkerCapital(seed) {
  // Bunker wall + heavy cornice / roof overhang.
  const data = bunkerSide(seed + 2);
  fillRect(data, 0, 0, W, 8, [BUN_DARK[0], BUN_DARK[1], BUN_DARK[2], 255]);
  hLine(data, 0, W, 8, [BUN_TRIM[0], BUN_TRIM[1], BUN_TRIM[2], 255]);
  hLine(data, 0, W, 9, [BUN_TRIM[0], BUN_TRIM[1], BUN_TRIM[2], 255]);
  return data;
}

function bunkerTop(seed) {
  // Concrete roof — heavily weathered, some grass tufts (GAMA-style mound
  // tops are covered in earth).
  const rand = mulberry32(seed + 3);
  const data = blankImage(BUN_BASE[0] - 15, BUN_BASE[1] - 12, BUN_BASE[2] - 18);
  applyGrain(data, rand, 25);
  // Sparse green tufts.
  for (let k = 0; k < 22; k++) {
    const x = (rand() * W) | 0;
    const y = (rand() * H) | 0;
    setPx(data, x, y, [70, 100, 50, 255]);
    if (rand() < 0.5) setPx(data, x + 1, y, [60, 90, 45, 255]);
    if (rand() < 0.5) setPx(data, x, y + 1, [60, 90, 45, 255]);
  }
  // Hatch in the middle.
  fillRect(data, 26, 26, 38, 38, [50, 50, 55, 255]);
  fillRect(data, 28, 28, 36, 36, [80, 80, 85, 255]);
  return data;
}

function bunkerBottom(seed) {
  return blankImage(40, 38, 35);
}

// ---------------------------------------------------------------------
// Driver — write all 15 PNGs.
// ---------------------------------------------------------------------
const KINDS = [
  {
    id: 'hangar', seedBase: 0x4101,
    fns: {
      base: hangarBase, side: hangarSide, capital: hangarCapital,
      top: hangarTop,   bottom: hangarBottom,
    },
  },
  {
    id: 'cuartel', seedBase: 0x4201,
    fns: {
      base: cuartelBase, side: cuartelSide, capital: cuartelCapital,
      top: cuartelTop,   bottom: cuartelBottom,
    },
  },
  {
    id: 'bunker', seedBase: 0x4301,
    fns: {
      base: bunkerBase, side: bunkerSide, capital: bunkerCapital,
      top: bunkerTop,   bottom: bunkerBottom,
    },
  },
];

const FACES = ['base', 'side', 'capital', 'top', 'bottom'];

let written = 0;
for (const k of KINDS) {
  const dir = path.join(OUT_ROOT, k.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const face of FACES) {
    const png = k.fns[face](k.seedBase);
    const out = path.join(dir, `${face}.png`);
    writePNG(out, png);
    written++;
    console.log(`wrote ${out}`);
  }
}
console.log(`\nDone — wrote ${written} PNGs across ${KINDS.length} kinds.`);
