/**
 * WAD2 / WAD3 loader. Reads a Quake .wad file and returns the embedded
 * miptex entries (texture name + dimensions + decoded RGBA mipmap level 0).
 *
 * WAD2 (Quake 1) layout:
 *   header:
 *     "WAD2"           4 bytes
 *     numLumps         int32 (little-endian)
 *     dirOffset        int32
 *   directory: numLumps × {
 *     filepos          int32
 *     disksize         int32
 *     size             int32
 *     type             int8    (0x42 'B' = miptex, others ignored)
 *     compression      int8
 *     pad              int16
 *     name             16 bytes (null-terminated)
 *   }
 *   per miptex lump (Quake mip header):
 *     name             16 bytes
 *     width            int32
 *     height           int32
 *     offset[4]        int32   (offsets from start of mip header to each mip level)
 *     ... pixel data follows ...
 *
 * Pixel data is paletted indices into the canonical Quake palette
 * (gfx/palette.lmp). We use the embedded palette table from
 * src/shared/quakePalette.js to resolve to RGBA.
 *
 * Some WAD3 files (Half-Life) embed the palette per-lump after the largest
 * mip; we don't bother — Atlasmapper targets Quake 1, so we always use the
 * Quake palette.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { QUAKE_PALETTE } = require('../shared/quakePalette');

const TYPE_MIPTEX = 0x44;   // 'D' in Quake; 0x42 'B' is "console picture".
                             // Empirically all id1 textures use 0x44.

/**
 * Load a single .wad file and return its texture lumps.
 *
 * @param {string} wadPath
 * @returns {Promise<{
 *   path: string,
 *   name: string,                       // file basename, no extension
 *   textures: Array<{
 *     name: string, width: number, height: number,
 *     rgba: Uint8ClampedArray            // length = width*height*4 (mip 0)
 *   }>
 * }>}
 */
async function loadWad(wadPath) {
  const buf = await fs.readFile(wadPath);

  if (buf.length < 12) throw new Error(`${wadPath}: too small to be a WAD`);
  const magic = buf.slice(0, 4).toString('ascii');
  if (magic !== 'WAD2' && magic !== 'WAD3') {
    throw new Error(`${wadPath}: bad magic "${magic}" (expected WAD2 or WAD3)`);
  }
  const numLumps = buf.readInt32LE(4);
  const dirOffset = buf.readInt32LE(8);

  const textures = [];
  for (let i = 0; i < numLumps; i++) {
    const entryStart = dirOffset + i * 32;
    if (entryStart + 32 > buf.length) {
      throw new Error(`${wadPath}: directory entry ${i} out of bounds`);
    }
    const filepos = buf.readInt32LE(entryStart);
    const disksize = buf.readInt32LE(entryStart + 4);
    // size unused.
    const type = buf.readUInt8(entryStart + 12);
    // compression and pad unused.
    const nameBytes = buf.slice(entryStart + 16, entryStart + 32);
    const nul = nameBytes.indexOf(0);
    const name = nameBytes.slice(0, nul === -1 ? 16 : nul).toString('ascii').toLowerCase();

    if (type !== TYPE_MIPTEX) continue;
    if (filepos + disksize > buf.length) continue;

    const lump = buf.slice(filepos, filepos + disksize);
    if (lump.length < 40) continue;
    const width = lump.readInt32LE(16);
    const height = lump.readInt32LE(20);
    const mip0Off = lump.readInt32LE(24);
    if (width <= 0 || height <= 0 || width > 2048 || height > 2048) continue;
    const pixCount = width * height;
    if (mip0Off + pixCount > lump.length) continue;

    const rgba = new Uint8ClampedArray(pixCount * 4);
    for (let p = 0; p < pixCount; p++) {
      const idx = lump[mip0Off + p];
      const [r, g, b] = QUAKE_PALETTE[idx];
      rgba[p * 4 + 0] = r;
      rgba[p * 4 + 1] = g;
      rgba[p * 4 + 2] = b;
      rgba[p * 4 + 3] = 255;
    }
    textures.push({ name, width, height, rgba });
  }

  return {
    path: wadPath,
    name: path.basename(wadPath, path.extname(wadPath)),
    textures,
  };
}

/**
 * Load every .wad in a directory. Returns a flat list of WAD records.
 */
async function loadWadDir(dirPath) {
  const entries = await fs.readdir(dirPath);
  const wadFiles = entries
    .filter(e => e.toLowerCase().endsWith('.wad'))
    .map(e => path.join(dirPath, e));
  const out = [];
  for (const f of wadFiles) {
    try {
      out.push(await loadWad(f));
    } catch (err) {
      console.error(`[wadLoader] skipping ${f}: ${err.message}`);
    }
  }
  return out;
}

module.exports = { loadWad, loadWadDir };
