/**
 * gen-barco-textures.js — 5-face PNG set for the "barco" tile: a terrain
 * block whose TOP reads as a ship DECK (steel hatch covers seen from above)
 * and whose SIDES read as a ship HULL (riveted steel plating with a red
 * waterline stripe near the bottom). Based on real cargo-ship references
 * (riveted/seamed steel plates, red boot-topping waterline, hatch-cover decks
 * — see the photo references the user cited). Modern naval grey.
 *
 * Output: src/renderer/assets/textures/barco/{top,side,capital,base,bottom}.png
 * 64x64 RGBA. The editor's textures.wad builder palettises these to the Quake
 * palette (which already avoids the fullbright range), so we just author plain
 * RGB here. Hand-edit the PNGs and re-run to iterate.
 *
 * Same encoder/helpers as gen-contenedores-textures.js / gen-mil-textures.js.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;
const OUT_ROOT = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'textures', 'barco');

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function blankImage(r, g, b, a = 255) {
  const data = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a; }
  return data;
}
function setPx(data, x, y, [r, g, b, a]) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=(a===undefined)?255:a;
}
function applyGrain(data, rand, intensity = 9) {
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 2 * intensity;
    data[i*4]   = Math.max(0, Math.min(255, data[i*4]   + n));
    data[i*4+1] = Math.max(0, Math.min(255, data[i*4+1] + n));
    data[i*4+2] = Math.max(0, Math.min(255, data[i*4+2] + n));
  }
}
function vLine(data, x, y0, y1, color) { for (let y = y0; y < y1; y++) setPx(data, x, y, color); }
function hLine(data, x0, x1, y, color) { for (let x = x0; x < x1; x++) setPx(data, x, y, color); }
function fillRect(data, x0, y0, x1, y1, color) { for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++) setPx(data,x,y,color); }
function dot(data, cx, cy, color) { setPx(data,cx,cy,color); setPx(data,cx+1,cy,color); setPx(data,cx,cy+1,color); setPx(data,cx+1,cy+1,color); }

function writePNG(filepath, data) {
  function crc32(b){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}let cr=0xffffffff;for(let i=0;i<b.length;i++)cr=(cr>>>8)^t[(cr^b[i])&0xff];return(cr^0xffffffff)>>>0;}
  function chunk(ty,b){const L=Buffer.alloc(4);L.writeUInt32BE(b.length,0);const T=Buffer.from(ty,'ascii');const C=Buffer.alloc(4);C.writeUInt32BE(crc32(Buffer.concat([T,b])),0);return Buffer.concat([L,T,b,C]);}
  const sig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc(H*(1+W*4));
  for(let y=0;y<H;y++){raw[y*(1+W*4)]=0;for(let x=0;x<W;x++){const o=y*(1+W*4)+1+x*4,i=(y*W+x)*4;raw[o]=data[i];raw[o+1]=data[i+1];raw[o+2]=data[i+2];raw[o+3]=data[i+3];}}
  fs.writeFileSync(filepath, Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

const shade = (c, f) => [
  Math.max(0, Math.min(255, Math.round(c[0]*f))),
  Math.max(0, Math.min(255, Math.round(c[1]*f))),
  Math.max(0, Math.min(255, Math.round(c[2]*f))),
];

// Naval greys + boot-topping red.
const HULL    = [96, 104, 112];    // hull plate grey (slight blue)
const DECK    = [110, 114, 118];   // deck steel, a touch lighter
const SEAM    = shade(HULL, 0.62);
const RIVET_D = shade(HULL, 0.5);
const RIVET_L = shade(HULL, 1.25);
const RED     = [150, 52, 46];     // waterline boot-topping
const RED_D   = shade(RED, 0.7);

// HULL SIDE: riveted steel plates, horizontal plate seams, vertical butt
// seams, a row of rivets along the seams, and a red waterline band at the
// bottom (the side faces stack downward, so "bottom of the texture" = nearer
// the water). `darken` shades the whole plate for the buried/base course.
function hullSide(seed, darken, withWaterline) {
  const base = shade(HULL, darken);
  const data = blankImage(base[0], base[1], base[2]);
  const rand = mulberry32(seed);
  applyGrain(data, rand, 9);
  const seam = shade(base, 0.62);
  const rivD = shade(base, 0.5);
  const rivL = shade(base, 1.25);
  // Horizontal plate seams every 16px.
  for (let y = 0; y <= H; y += 16) {
    hLine(data, 0, W, y, seam);
    // rivet row just below each seam
    for (let x = 5; x < W; x += 9) { dot(data, x, y + 3, rivD); setPx(data, x, y + 3, rivL); }
  }
  // Vertical butt seams (staggered per plate row).
  for (let row = 0; row < 4; row++) {
    const vx = ((row & 1) ? 32 : 16) % W;
    vLine(data, vx, row*16, row*16 + 16, seam);
  }
  // Red waterline band along the bottom of the side.
  if (withWaterline) {
    fillRect(data, 0, H - 14, W, H - 11, RED_D);   // boot-top edge
    fillRect(data, 0, H - 11, W, H, RED);          // red band
    for (let x = 5; x < W; x += 9) setPx(data, x, H - 8, RED_D);   // rivets in red
  }
  return data;
}

// DECK TOP: steel hatch covers seen from above — a couple of big rectangular
// panels (coamings) with a raised border line, plus thin lashing/seam lines.
function deckTop(seed) {
  const data = blankImage(DECK[0], DECK[1], DECK[2]);
  const rand = mulberry32(seed);
  applyGrain(data, rand, 8);
  const line = shade(DECK, 0.6);
  const hi   = shade(DECK, 1.15);
  // Two hatch-cover panels with coaming borders.
  const panel = (x0, y0, x1, y1) => {
    // outer coaming (raised edge): dark line + light inner highlight
    for (let x = x0; x <= x1; x++) { setPx(data, x, y0, line); setPx(data, x, y1, line); setPx(data, x, y0+1, hi); }
    for (let y = y0; y <= y1; y++) { setPx(data, x0, y, line); setPx(data, x1, y, line); setPx(data, x0+1, y, hi); }
    // ribbing across the panel (hatch cover stiffeners)
    for (let yy = y0 + 5; yy < y1 - 2; yy += 6) hLine(data, x0 + 3, x1 - 2, yy, shade(DECK, 0.88));
  };
  panel(3, 3, 30, 60);
  panel(33, 3, 60, 60);
  // central gap line between panels + a couple of lashing dots
  vLine(data, 31, 3, 61, line);
  for (let y = 8; y < 58; y += 12) { dot(data, 30, y, shade(DECK,0.55)); }
  return data;
}

function bottomFace() { return blankImage(34, 36, 40); }

fs.mkdirSync(OUT_ROOT, { recursive: true });
const seed = 0x5A1;
writePNG(path.join(OUT_ROOT, 'top.png'),     deckTop(seed));
writePNG(path.join(OUT_ROOT, 'side.png'),    hullSide(seed + 1, 1.0,  true));   // hull w/ waterline
writePNG(path.join(OUT_ROOT, 'capital.png'), hullSide(seed + 2, 1.08, false));  // upper course, no waterline
writePNG(path.join(OUT_ROOT, 'base.png'),    hullSide(seed + 3, 0.82, true));   // ground course w/ waterline
writePNG(path.join(OUT_ROOT, 'bottom.png'),  bottomFace());
console.log('barco textures written to', OUT_ROOT);
