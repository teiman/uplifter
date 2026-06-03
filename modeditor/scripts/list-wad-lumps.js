#!/usr/bin/env node
// Quick lump inventory tool. Usage:
//   node list-wad-lumps.js <wadPath> [filterRegex] [maxSize]
// Prints "name  WxH  bytes" for each miptex lump in the WAD whose name
// matches the optional regex (case-insensitive). If maxSize is given,
// only lumps whose width AND height are <= maxSize are reported.

const fs = require('fs');

const [, , wadPath, filter, maxSize] = process.argv;
if (!wadPath) { console.error('usage: list-wad-lumps.js <wad> [regex] [maxSize]'); process.exit(1); }
const max = maxSize ? Number(maxSize) : Infinity;

const buf = fs.readFileSync(wadPath);
const magic = buf.slice(0, 4).toString('ascii');
if (magic !== 'WAD2' && magic !== 'WAD3') {
  console.error(`bad magic: ${magic}`);
  process.exit(1);
}
const numLumps = buf.readInt32LE(4);
const dirOff = buf.readInt32LE(8);
const re = filter ? new RegExp(filter, 'i') : null;

const rows = [];
for (let i = 0; i < numLumps; i++) {
  const e = dirOff + i * 32;
  if (e + 32 > buf.length) continue;
  const filepos = buf.readInt32LE(e);
  const disksize = buf.readInt32LE(e + 4);
  const type = buf.readUInt8(e + 12);
  if (type !== 0x44) continue;
  const nameBytes = buf.slice(e + 16, e + 32);
  const nul = nameBytes.indexOf(0);
  const name = nameBytes.slice(0, nul === -1 ? 16 : nul).toString('ascii');
  if (re && !re.test(name)) continue;
  if (filepos + 24 > buf.length) continue;
  const w = buf.readInt32LE(filepos + 16);
  const h = buf.readInt32LE(filepos + 20);
  if (w > max || h > max) continue;
  rows.push({ name, w, h, bytes: disksize });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
for (const r of rows) {
  console.log(`${r.name.padEnd(18)} ${String(r.w).padStart(4)}x${String(r.h).padEnd(4)}  ${r.bytes}`);
}
console.log(`-- ${rows.length} match${rows.length === 1 ? '' : 'es'} of ${numLumps} lumps in ${wadPath}`);
