#!/usr/bin/env node
/**
 * Generate the "uplifter_blue" skybox — 6 TGA images for an eternal
 * clear-day sky used by every Uplifter map.
 *
 * Flat blue, no gradient — the world view from a helicopter is meant to
 * read as "clear day, everywhere". A gradient drew attention to the seam
 * between the ceiling tile and the side tiles, which looked off.
 *
 * Quake skybox convention: 6 textures with suffixes
 *   _up  ceiling (zenith)
 *   _dn  floor (nadir — invisible under bedrock, written for completeness)
 *   _bk _ft _lf _rt  side walls
 *
 * TGA format used: type 2 (uncompressed true-colour), 24bpp BGR. Header
 * is 18 bytes; image-descriptor bit 0x20 = origin top-left so engines
 * read rows in the natural order. */

const fs = require('node:fs');
const path = require('node:path');

const SIZE = 16;   // flat colour, no detail needed

// Uniform daylight blue. Single source of truth for every face.
const SKY_RGB = [120, 180, 230];

/** Render an SIZE×SIZE RGB buffer painted entirely in SKY_RGB. */
function renderFace() {
  const buf = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const off = i * 3;
    // BGR for TGA.
    buf[off    ] = SKY_RGB[2];
    buf[off + 1] = SKY_RGB[1];
    buf[off + 2] = SKY_RGB[0];
  }
  return buf;
}

/** Write a 24bpp TGA. */
function writeTGA(p, rgbTopDown, w, h) {
  const header = Buffer.alloc(18);
  header[2]  = 2;            // image type: uncompressed true-colour
  header[12] = w & 0xff;
  header[13] = (w >> 8) & 0xff;
  header[14] = h & 0xff;
  header[15] = (h >> 8) & 0xff;
  header[16] = 24;           // bits per pixel
  header[17] = 0x20;         // image descriptor: origin top-left
  fs.writeFileSync(p, Buffer.concat([header, rgbTopDown]));
}

const FACES = ['up', 'dn', 'bk', 'ft', 'lf', 'rt'];
const NAME = 'uplifter_blue';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node make-sky.js <out-dir>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const buf = renderFace();
for (const face of FACES) {
  const p = path.join(outDir, `${NAME}${face}.tga`);
  writeTGA(p, buf, SIZE, SIZE);
  console.log(`wrote ${p}`);
}
console.log('done.');
