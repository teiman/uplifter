#!/usr/bin/env node
/**
 * gen-birds-spr.js — Build the flapping flock-of-birds sprite (birds.spr)
 * from EDITABLE per-frame PNGs.
 *
 * Editable frames live in:   modeditor/src/renderer/assets/birds/frame{0..N}.png
 * Each PNG is one animation frame (a few white birds with their wings in a
 * given flap pose). Edit them by hand, then re-run this command to rebuild:
 *
 *     node scripts/gen-birds-spr.js
 *
 * If the frame PNGs don't exist yet, this script writes PLACEHOLDER art
 * (simple white "V" gull silhouettes flapping) so there's something to ship
 * and to paint over. Delete a frame and re-run to regenerate just that
 * placeholder; existing PNGs are never overwritten.
 *
 * Output: mod/progs/birds.spr  (+ mirror to d:/quake/uplifter/progs/birds.spr)
 * Billboard sprite (SPR_VP_PARALLEL) so the flock always faces the camera.
 *
 * Reuses the PNG decode / palette / IDSP encoder pattern from gen-text-spr.js.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;
const NFRAMES = 4;                 // wing-flap poses
const FRAME_DIR = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'birds');
const OUT_REPO = path.resolve(__dirname, '..', '..', 'mod', 'progs', 'birds.spr');
const OUT_GAME = 'd:/quake/uplifter/progs/birds.spr';
const PALETTE_GPL = path.resolve(__dirname, '..', '..', 'tools', 'aseprite-quake-palettes', 'palettes', 'quake.gpl');
const TRANSPARENT_IDX = 255;

// ---------- palette ----------
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
const SAFE_END = 224;
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
  return bi;
}

// ---------- PNG decode (8-bit RGB/RGBA) ----------
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
  if (ch === 3) {
    const rgba = Buffer.alloc(ihdr.width * ihdr.height * 4);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { rgba[j]=px[i]; rgba[j+1]=px[i+1]; rgba[j+2]=px[i+2]; rgba[j+3]=255; }
    return { width: ihdr.width, height: ihdr.height, rgba };
  }
  return { width: ihdr.width, height: ihdr.height, rgba: px };
}

// ---------- PNG encode (RGBA, for placeholders) ----------
function writePNG(filepath, rgba, w, h) {
  function crc32(b){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}let cr=0xffffffff;for(let i=0;i<b.length;i++)cr=(cr>>>8)^t[(cr^b[i])&0xff];return(cr^0xffffffff)>>>0;}
  function chunk(ty,b){const L=Buffer.alloc(4);L.writeUInt32BE(b.length,0);const T=Buffer.from(ty,'ascii');const C=Buffer.alloc(4);C.writeUInt32BE(crc32(Buffer.concat([T,b])),0);return Buffer.concat([L,T,b,C]);}
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  const rawb=Buffer.alloc(h*(1+w*4));
  for(let y=0;y<h;y++){rawb[y*(1+w*4)]=0;for(let x=0;x<w;x++){const o=y*(1+w*4)+1+x*4,i=(y*w+x)*4;rawb[o]=rgba[i];rawb[o+1]=rgba[i+1];rawb[o+2]=rgba[i+2];rawb[o+3]=rgba[i+3];}}
  fs.writeFileSync(filepath, Buffer.concat([sig,chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(rawb)),chunk('IEND',Buffer.alloc(0))]));
}

// ---------- placeholder generator: a few white gull "V"s ----------
// `bend` (0..1) = how far the wings are swept down (the flap pose). 0 = wings
// up/flat, 1 = wings folded down. We draw 3 small birds at fixed spots.
function placeholderFrame(bend) {
  const rgba = Buffer.alloc(W * H * 4);   // all zero = transparent
  const put = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    rgba[i] = 255; rgba[i+1] = 255; rgba[i+2] = 255; rgba[i+3] = 255;
  };
  // One gull: a shallow "V" centred at (cx,cy); wing half-span `span`, the
  // wingtips droop by `bend*droop`. Drawn 2px thick.
  const gull = (cx, cy, span, droop) => {
    for (let t = 0; t <= span; t++) {
      const dy = (t / span) * droop * bend;   // tip droops with bend
      // left wing
      put(cx - t, cy + dy);     put(cx - t, cy + dy + 1);
      // right wing
      put(cx + t, cy + dy);     put(cx + t, cy + dy + 1);
    }
    // little body dot at the apex
    put(cx, cy - 1); put(cx, cy);
  };
  gull(32, 26, 11, 7);
  gull(18, 38, 8,  6);
  gull(46, 40, 9,  6);
  return rgba;
}

// The editable PNGs are now authored RIGHT-SIDE-UP (flipped once in place so
// they're comfortable to edit), and the sprite shows them the same way up in
// game, so NO flip on assembly. (Flip the source PNGs again if a future
// engine/setup needs the opposite.)
const FLIP_V = false;

// ---------- RGBA frame → indexed sprite pixels ----------
function rgbaToIndexed(rgba, w, h) {
  const px = new Uint8Array(w * h).fill(TRANSPARENT_IDX);
  for (let y = 0; y < h; y++) {
    const srcY = FLIP_V ? (h - 1 - y) : y;
    for (let x = 0; x < w; x++) {
      const si = (srcY * w + x) * 4;
      if (rgba[si + 3] < 64) continue;     // transparent
      px[y * w + x] = nearestIdx(rgba[si], rgba[si + 1], rgba[si + 2]);
    }
  }
  return px;
}

// ---------- IDSP v1 encoder (billboard) ----------
function encodeSprite(frames, w, h) {
  const radius = Math.sqrt((w/2)**2 + (h/2)**2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);     // version
  header.writeInt32LE(2, 8);     // type 2 = SPR_VP_PARALLEL (billboard)
  header.writeFloatLE(radius, 12);
  header.writeInt32LE(w, 16);
  header.writeInt32LE(h, 20);
  header.writeInt32LE(frames.length, 24);
  header.writeFloatLE(0, 28);
  header.writeInt32LE(0, 32);
  const chunks = [header];
  for (const fr of frames) {
    const tag = Buffer.alloc(4); tag.writeInt32LE(0, 0);
    const fh = Buffer.alloc(16);
    fh.writeInt32LE(-Math.floor(w/2), 0);
    fh.writeInt32LE(Math.floor(h/2), 4);
    fh.writeInt32LE(w, 8);
    fh.writeInt32LE(h, 12);
    chunks.push(tag, fh, Buffer.from(fr));
  }
  return Buffer.concat(chunks);
}

// ---------- main ----------
// Use WHATEVER frameN.png files exist, in numeric order. We do NOT create
// placeholders and we do NOT assume a fixed count: the sprite is built only
// from the art you actually put in the folder. Frames can be numbered from 0
// or from any base (e.g. after renumbering) — gaps are skipped.
if (!fs.existsSync(FRAME_DIR)) {
  console.error(`frame dir not found: ${FRAME_DIR}`);
  process.exit(1);
}
const names = fs.readdirSync(FRAME_DIR)
  .map(n => { const m = n.match(/^frame(\d+)\.png$/i); return m ? { n, idx: +m[1] } : null; })
  .filter(Boolean)
  .sort((a, b) => a.idx - b.idx);

if (names.length === 0) {
  console.error(`no frameN.png files in ${FRAME_DIR} — nothing to build.`);
  process.exit(1);
}

const frames = [];
for (const { n } of names) {
  const img = decodePNG(path.join(FRAME_DIR, n));
  if (img.width !== W || img.height !== H)
    throw new Error(`${n} is ${img.width}x${img.height}, expected ${W}x${H}`);
  frames.push(rgbaToIndexed(img.rgba, W, H));
}

const buf = encodeSprite(frames, W, H);
fs.mkdirSync(path.dirname(OUT_REPO), { recursive: true });
fs.writeFileSync(OUT_REPO, buf);
try { fs.mkdirSync(path.dirname(OUT_GAME), { recursive: true }); fs.writeFileSync(OUT_GAME.replace(/\\/g,'/'), buf); }
catch (e) { console.warn('game copy failed:', e.message); }

console.log(`birds.spr: ${W}x${H}, ${frames.length} frames [${names.map(x => x.n).join(', ')}]`);
console.log(`  → ${OUT_REPO} (${buf.length} bytes)`);
console.log(`  edit frames in: ${FRAME_DIR}`);
console.log(`  → ${OUT_REPO} (${buf.length} bytes)`);
