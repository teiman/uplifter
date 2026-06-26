#!/usr/bin/env node
/**
 * gen-birds-gif.js — Build an animated GIF preview of the birds flap from the
 * editable frame PNGs (assets/birds/frameN.png), so you can eyeball the
 * animation without launching the game.
 *
 * The birds are white on transparent; we composite each frame over a sky-blue
 * background and write an animated GIF (frames in numeric order, looping).
 *
 *   node scripts/gen-birds-gif.js
 *
 * Output: modeditor/tmp/birds.gif
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const FRAME_DIR = path.resolve(__dirname, '..', 'src', 'renderer', 'assets', 'birds');
const OUT = path.resolve(__dirname, '..', 'tmp', 'birds.gif');
const BG = [60, 110, 170];      // sky blue
const SCALE = 3;                // upscale for visibility
const DELAY_CS = 12;            // frame delay in centiseconds (~8 fps)

// ---- PNG decode (8-bit RGB/RGBA) ----
function decodePNG(filepath) {
  const buf = fs.readFileSync(filepath);
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
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); v = (v + (pa<=pb&&pa<=pc?a:pb<=pc?b:c)) & 255; }
      out[x] = v;
    }
    out.copy(prev); out.copy(px, pPos); pPos += stride;
  }
  if (ch === 3) { const r = Buffer.alloc(ihdr.width*ihdr.height*4); for (let i=0,j=0;i<px.length;i+=3,j+=4){r[j]=px[i];r[j+1]=px[i+1];r[j+2]=px[i+2];r[j+3]=255;} return {w:ihdr.width,h:ihdr.height,rgba:r}; }
  return { w: ihdr.width, h: ihdr.height, rgba: px };
}

// Composite an RGBA frame over the sky bg, upscaled, → an indexed buffer with
// a tiny palette: 0 = sky, 1 = white (bird). (Birds are white, bg is sky, so
// 2 colours suffice — keeps the GIF trivial.)
function frameToIndexed(img, sw, sh) {
  const idx = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const sx = Math.floor(x / SCALE), sy = Math.floor(y / SCALE);
      const a = img.rgba[(sy * img.w + sx) * 4 + 3];
      idx[y * sw + x] = (a >= 64) ? 1 : 0;   // 1 bird, 0 sky
    }
  }
  return idx;
}

// ---- minimal GIF89a LZW encoder ----
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map();
  const resetDict = () => { dict = new Map(); for (let i = 0; i < clearCode; i++) dict.set(String(i), i); return clearCode + 2; };
  let next = resetDict();

  const out = []; let cur = 0, curBits = 0;
  const emit = (code) => { cur |= code << curBits; curBits += codeSize; while (curBits >= 8) { out.push(cur & 255); cur >>= 8; curBits -= 8; } };

  emit(clearCode);
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const combo = prefix + ',' + k;
    if (dict.has(combo)) { prefix = combo; }
    else {
      emit(dict.get(prefix));
      dict.set(combo, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      if (next >= 4096) { emit(clearCode); next = resetDict(); codeSize = minCodeSize + 1; }
      prefix = String(k);
    }
  }
  emit(dict.get(prefix));
  emit(eoiCode);
  if (curBits > 0) out.push(cur & 255);
  return out;
}

function buildGif(frames, w, h) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const pushStr = (s) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };
  const u16 = (v) => { push(v & 255, (v >> 8) & 255); };

  pushStr('GIF89a');
  u16(w); u16(h);
  // global colour table: 2 entries (sky, white). flags: GCT present, size 2^1.
  push(0xF0 | 0x00); push(0); push(0);
  push(BG[0], BG[1], BG[2]);   // colour 0 = sky
  push(255, 255, 255);         // colour 1 = white bird

  // application extension for looping (NETSCAPE2.0, loop forever)
  push(0x21, 0xFF, 0x0B); pushStr('NETSCAPE2.0'); push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const fr of frames) {
    // graphic control extension: delay, no transparency.
    push(0x21, 0xF9, 0x04, 0x00); u16(DELAY_CS); push(0x00, 0x00);
    // image descriptor
    push(0x2C); u16(0); u16(0); u16(w); u16(h); push(0x00);
    const minCode = 2;        // must be >= 2
    push(minCode);
    const lzw = lzwEncode(fr, minCode);
    // sub-blocks of <=255 bytes
    for (let i = 0; i < lzw.length; i += 255) {
      const chunk = lzw.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00);   // block terminator
  }
  push(0x3B);     // trailer
  return Buffer.from(bytes);
}

// ---- main ----
const names = fs.readdirSync(FRAME_DIR)
  .map(n => { const m = n.match(/^frame(\d+)\.png$/i); return m ? { n, idx: +m[1] } : null; })
  .filter(Boolean).sort((a, b) => a.idx - b.idx);
if (!names.length) { console.error('no frames'); process.exit(1); }

const first = decodePNG(path.join(FRAME_DIR, names[0].n));
const sw = first.w * SCALE, sh = first.h * SCALE;
const frames = names.map(({ n }) => frameToIndexed(decodePNG(path.join(FRAME_DIR, n)), sw, sh));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buildGif(frames, sw, sh));
console.log(`birds.gif: ${sw}x${sh}, ${frames.length} frames [${names.map(x=>x.n).join(', ')}] → ${OUT}`);
