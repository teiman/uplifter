#!/usr/bin/env node
/**
 * spr-to-gif.js — Decode a Quake .spr (IDSP v1, single SPR_GROUP frame or
 * several SPR_SINGLE frames) and write an animated GIF89a so you can preview
 * the animation outside the engine. Pure Node, no deps.
 *
 *   node scripts/spr-to-gif.js ../mod/progs/wave.spr wave.gif
 */

const fs = require('node:fs');
const path = require('node:path');

const SRC = process.argv[2] || path.resolve(__dirname, '..', '..', 'mod', 'progs', 'wave.spr');
const OUT = process.argv[3] || path.resolve(__dirname, '..', 'tmp', 'wave.gif');
const PALETTE_GPL = path.resolve(__dirname, '..', '..', 'tools', 'aseprite-quake-palettes', 'palettes', 'quake.gpl');
const TRANSPARENT_IDX = 255;

// ---------- Quake palette (index → [r,g,b]) ----------
function loadPalette(p) {
  const pal = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (m) { pal.push([+m[1], +m[2], +m[3]]); if (pal.length === 256) break; }
  }
  while (pal.length < 256) pal.push([0, 0, 0]);
  return pal;
}
const PAL = loadPalette(PALETTE_GPL);

// ---------- decode .spr ----------
function decodeSpr(buf) {
  if (buf.toString('ascii', 0, 4) !== 'IDSP') throw new Error('not IDSP');
  const w = buf.readInt32LE(16), h = buf.readInt32LE(20);
  const numframes = buf.readInt32LE(24);
  let off = 36;
  const frames = [];        // { w, h, pixels }
  const delays = [];        // seconds per frame
  for (let f = 0; f < numframes; f++) {
    const type = buf.readInt32LE(off); off += 4;
    if (type === 0) {
      // SPR_SINGLE: ox, oy, w, h, pixels
      off += 8;                                   // skip origin
      const fw = buf.readInt32LE(off); off += 4;
      const fh = buf.readInt32LE(off); off += 4;
      const px = buf.subarray(off, off + fw * fh); off += fw * fh;
      frames.push({ w: fw, h: fh, pixels: px });
      delays.push(0.1);
    } else {
      // SPR_GROUP: numsub, intervals[numsub], then each { ox,oy,w,h,pixels }
      const numsub = buf.readInt32LE(off); off += 4;
      const intervals = [];
      for (let i = 0; i < numsub; i++) { intervals.push(buf.readFloatLE(off)); off += 4; }
      let prev = 0;
      for (let i = 0; i < numsub; i++) {
        off += 8;                                 // skip origin
        const fw = buf.readInt32LE(off); off += 4;
        const fh = buf.readInt32LE(off); off += 4;
        const px = buf.subarray(off, off + fw * fh); off += fw * fh;
        frames.push({ w: fw, h: fh, pixels: px });
        delays.push(Math.max(0.02, intervals[i] - prev));
        prev = intervals[i];
      }
    }
  }
  return { w, h, frames, delays };
}

// ---------- GIF89a writer (global palette, per-frame transparency) ----------
function writeGif(out, W, H, frames, delays) {
  const bytes = [];
  const u8 = (v) => bytes.push(v & 0xff);
  const u16 = (v) => { bytes.push(v & 0xff); bytes.push((v >> 8) & 0xff); };
  const str = (s) => { for (const ch of s) bytes.push(ch.charCodeAt(0)); };

  str('GIF89a');
  u16(W); u16(H);
  u8(0xF7);            // global colour table, 256 entries, 8 bpp
  u8(TRANSPARENT_IDX); // background colour index
  u8(0);               // pixel aspect ratio
  for (let i = 0; i < 256; i++) { u8(PAL[i][0]); u8(PAL[i][1]); u8(PAL[i][2]); }

  // NETSCAPE loop extension (infinite loop)
  u8(0x21); u8(0xFF); u8(0x0B); str('NETSCAPE2.0'); u8(0x03); u8(0x01); u16(0); u8(0x00);

  for (let f = 0; f < frames.length; f++) {
    const delayCs = Math.max(2, Math.round(delays[f] * 100)); // centiseconds
    // Graphic control extension: transparency on, restore-to-background.
    u8(0x21); u8(0xF9); u8(0x04);
    u8(0x09);                       // disposal=2 (restore bg) | transparent flag
    u16(delayCs);
    u8(TRANSPARENT_IDX);
    u8(0x00);
    // Image descriptor
    u8(0x2C); u16(0); u16(0); u16(W); u16(H); u8(0x00);
    // LZW image data (min code size 8)
    const lzw = gifLZW(frames[f].pixels, 8);
    u8(8);
    for (let i = 0; i < lzw.length; i += 255) {
      const chunk = lzw.subarray(i, Math.min(i + 255, lzw.length));
      u8(chunk.length);
      for (const b of chunk) u8(b);
    }
    u8(0x00); // block terminator
  }
  u8(0x3B); // trailer
  fs.writeFileSync(out, Buffer.from(bytes));
}

// Minimal GIF-LZW compressor.
function gifLZW(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map();
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i);
    return clearCode + 2;
  };
  let next = resetDict();

  const out = [];
  let cur = 0, curBits = 0;
  const emit = (code) => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 0xff); cur >>= 8; curBits -= 8; }
  };

  emit(clearCode);
  let prefix = String.fromCharCode(pixels[0]);
  for (let i = 1; i < pixels.length; i++) {
    const ch = String.fromCharCode(pixels[i]);
    const comb = prefix + ch;
    if (dict.has(comb)) { prefix = comb; }
    else {
      emit(dict.get(prefix));
      dict.set(comb, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      if (next >= 4096) { emit(clearCode); next = resetDict(); codeSize = minCodeSize + 1; }
      prefix = ch;
    }
  }
  emit(dict.get(prefix));
  emit(eoiCode);
  if (curBits > 0) out.push(cur & 0xff);
  return Uint8Array.from(out);
}

// ---------- main ----------
const buf = fs.readFileSync(SRC);
const { w, h, frames, delays } = decodeSpr(buf);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
writeGif(OUT, w, h, frames, delays);
console.log(`GIF: ${w}x${h}, ${frames.length} frames → ${OUT}`);
