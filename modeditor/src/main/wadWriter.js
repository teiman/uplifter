/**
 * Minimal WAD2 writer for the synthetic "auto.wad" file generated at
 * runtime. Currently used to ship two flat-colour textures the editor
 * needs but the user's WADs don't contain:
 *
 *   - auto_wall  (solid black, used by auto-close walls)
 *   - auto_sky   (solid sky-blue, used by the sky box)
 *
 * Quake's WAD2 layout (little-endian):
 *
 *   header:
 *     "WAD2"           4 bytes
 *     numLumps         int32
 *     dirOffset        int32
 *
 *   per miptex lump (40-byte header followed by 4 mip levels):
 *     name             16 bytes (null-terminated, lower-case)
 *     width            int32
 *     height           int32
 *     offset[4]        int32   (offsets from start of THIS lump to each mip)
 *     mip0:  width*height       bytes (paletted)
 *     mip1: (width/2)*(height/2)
 *     mip2: (width/4)*(height/4)
 *     mip3: (width/8)*(height/8)
 *
 *   directory: numLumps × 32-byte entries
 *     filepos          int32  (absolute offset in the WAD)
 *     disksize         int32
 *     size             int32
 *     type             int8   (0x44 'D' = miptex)
 *     compression      int8   (0)
 *     pad              int16
 *     name             16 bytes
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { QUAKE_PALETTE } = require('../shared/quakePalette');

const TYPE_MIPTEX = 0x44;

/** Find the closest palette index (in the non-fullbright range 0..223)
 *  for a given RGB triplet. Brute force — only used at startup for two
 *  textures, no need to optimise. */
function nearestPaletteIndex(r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 224; i++) {
    const [pr, pg, pb] = QUAKE_PALETTE[i];
    const dr = pr - r, dg = pg - g, db = pb - b;
    const d = dr*dr + dg*dg + db*db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Common miptex header writer. Returns the lump buffer with the header
 * filled in and the four mip data regions zero-initialised at the
 * correct offsets. Callers fill in the pixels.
 */
function allocMiptexLump(name, width, height) {
  if (width % 8 || height % 8) {
    throw new Error(`miptex ${name}: width/height must be multiples of 8`);
  }
  const headerSize = 16 + 4 + 4 + 4 * 4;        // 40
  const sizes = [
    width * height,
    (width / 2) * (height / 2),
    (width / 4) * (height / 4),
    (width / 8) * (height / 8),
  ];
  const totalPix = sizes.reduce((a, b) => a + b, 0);
  const buf = Buffer.alloc(headerSize + totalPix);

  buf.write(name, 0, 'ascii');
  buf.writeInt32LE(width,  16);
  buf.writeInt32LE(height, 20);
  let off = headerSize;
  const offsets = [];
  for (let i = 0; i < 4; i++) {
    buf.writeInt32LE(off, 24 + i * 4);
    offsets.push(off);
    off += sizes[i];
  }
  return { buf, offsets, sizes };
}

/**
 * Solid-colour 64×64 miptex (used for the sky brush — the colour gets
 * tinted by Quake's sky shader anyway, so flat is fine).
 */
function buildSolidMiptex(name, width, height, colorIdx) {
  const { buf, offsets, sizes } = allocMiptexLump(name, width, height);
  for (let i = 0; i < 4; i++) {
    buf.fill(colorIdx, offsets[i], offsets[i] + sizes[i]);
  }
  return buf;
}

/**
 * Procedural rock miptex. Pixel value at (x, y) is a deterministic
 * value-noise sample modulated to a rocky grey-brown range, then
 * snapped to the nearest non-fullbright palette index. Mip 1..3 are
 * straight 2× downsamples (nearest, picking the top-left).
 */
function buildRockMiptex(name, width, height) {
  const { buf, offsets } = allocMiptexLump(name, width, height);

  // 1) Generate the mip 0 RGB image first.
  const mip0 = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Multi-octave value noise — small lookup-free hash. Designed
      // to tile cleanly: sample at (x mod w, y mod h) so adjacent
      // tiles in a wall match seamlessly.
      const v = noise2(x, y, width, height);
      // Map noise [0..1] to a rocky grey-brown range.
      // base luminance 70..160, slight brown tint (more red, less blue).
      const lum = 70 + Math.floor(v * 90);
      const r = Math.min(255, lum + 10);
      const g = lum;
      const b = Math.max(0, lum - 18);
      const i = (y * width + x) * 3;
      mip0[i] = r; mip0[i + 1] = g; mip0[i + 2] = b;
    }
  }

  // 2) Quantise mip 0 to the palette and write into the lump.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const idx = nearestPaletteIndex(mip0[i], mip0[i + 1], mip0[i + 2]);
      buf[offsets[0] + y * width + x] = idx;
    }
  }

  // 3) Build mips 1..3 by averaging 2x2 blocks of mip 0 RGB and
  //    re-quantising. Better visual fidelity than picking one pixel.
  function downsampleAt(level) {
    const factor = 1 << level;
    const w2 = width / factor, h2 = height / factor;
    for (let y = 0; y < h2; y++) {
      for (let x = 0; x < w2; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const sx = x * factor + dx;
            const sy = y * factor + dy;
            const si = (sy * width + sx) * 3;
            r += mip0[si]; g += mip0[si + 1]; b += mip0[si + 2];
          }
        }
        const n = factor * factor;
        const idx = nearestPaletteIndex(r / n, g / n, b / n);
        buf[offsets[level] + y * w2 + x] = idx;
      }
    }
  }
  downsampleAt(1);
  downsampleAt(2);
  downsampleAt(3);

  return buf;
}

/**
 * Noise-based miptex with a configurable tint. Same noise as the rock
 * texture but the colour mapping is parameterised so each prop placeholder
 * reads differently at a glance.
 *
 * @param {string} name   texture name (max 15 chars)
 * @param {number} w      width  (must be multiple of 8)
 * @param {number} h      height (must be multiple of 8)
 * @param {function(number): [number,number,number]} colorFn
 *   Maps a noise value in [0,1] to an [r,g,b] triplet.
 */
function buildTintedMiptex(name, w, h, colorFn) {
  const { buf, offsets } = allocMiptexLump(name, w, h);
  const mip0 = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = noise2(x, y, w, h);
      const [r, g, b] = colorFn(v);
      const i = (y * w + x) * 3;
      mip0[i] = r; mip0[i + 1] = g; mip0[i + 2] = b;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      buf[offsets[0] + y * w + x] = nearestPaletteIndex(mip0[i], mip0[i + 1], mip0[i + 2]);
    }
  }
  for (let level = 1; level <= 3; level++) {
    const factor = 1 << level;
    const w2 = w / factor, h2 = h / factor;
    for (let yy = 0; yy < h2; yy++) {
      for (let xx = 0; xx < w2; xx++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const si = ((yy * factor + dy) * w + xx * factor + dx) * 3;
            r += mip0[si]; g += mip0[si + 1]; b += mip0[si + 2];
          }
        }
        const n = factor * factor;
        buf[offsets[level] + yy * w2 + xx] = nearestPaletteIndex(r / n, g / n, b / n);
      }
    }
  }
  return { lump: buf, mip0 };
}

function mip0ToRgba(mip0, w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4]     = mip0[i * 3];
    rgba[i * 4 + 1] = mip0[i * 3 + 1];
    rgba[i * 4 + 2] = mip0[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** Cheap 2D value noise that wraps on (w, h) — gradient-free, integer
 *  hash. Returns a value in [0, 1]. */
function noise2(x, y, w, h) {
  function hash(ix, iy) {
    let n = (ix * 374761393 + iy * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = (n ^ (n >>> 16)) >>> 0;
    return (n & 0xFFFF) / 0xFFFF;
  }
  // 3 octaves at scales 8 / 16 / 32, weighted 0.5 / 0.3 / 0.2.
  function octave(scale) {
    const fx = (x / scale), fy = (y / scale);
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    // Wrap so the texture tiles cleanly.
    const cellsX = Math.max(1, Math.floor(w / scale));
    const cellsY = Math.max(1, Math.floor(h / scale));
    const a = hash(ix % cellsX,           iy % cellsY);
    const b = hash((ix + 1) % cellsX,     iy % cellsY);
    const c = hash(ix % cellsX,           (iy + 1) % cellsY);
    const d = hash((ix + 1) % cellsX,     (iy + 1) % cellsY);
    // smoothstep
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return Math.min(1, Math.max(0,
    octave(8)  * 0.5 +
    octave(16) * 0.3 +
    octave(32) * 0.2,
  ));
}

/**
 * Write a WAD2 file containing the given lumps.
 *
 * @param {string} outPath
 * @param {Array<{name:string, lump:Buffer}>} entries
 */
async function writeWad(outPath, entries) {
  // Header (12 bytes) + lumps + directory.
  const headerSize = 12;
  let lumpsBytes = 0;
  for (const e of entries) lumpsBytes += e.lump.length;
  const dirOffset = headerSize + lumpsBytes;
  const dirSize = entries.length * 32;
  const total = dirOffset + dirSize;

  const buf = Buffer.alloc(total);
  // Magic + counts.
  buf.write('WAD2', 0, 'ascii');
  buf.writeInt32LE(entries.length, 4);
  buf.writeInt32LE(dirOffset,      8);

  // Lumps (sequentially appended).
  let cursor = headerSize;
  const dirEntries = [];
  for (const e of entries) {
    e.lump.copy(buf, cursor);
    dirEntries.push({ name: e.name, filepos: cursor, size: e.lump.length });
    cursor += e.lump.length;
  }

  // Directory.
  let dirCursor = dirOffset;
  for (const d of dirEntries) {
    buf.writeInt32LE(d.filepos,  dirCursor);
    buf.writeInt32LE(d.size,     dirCursor + 4);
    buf.writeInt32LE(d.size,     dirCursor + 8);
    buf.writeInt8(TYPE_MIPTEX,   dirCursor + 12);
    buf.writeInt8(0,             dirCursor + 13);
    buf.writeInt16LE(0,          dirCursor + 14);
    buf.write(d.name,            dirCursor + 16, 'ascii');
    dirCursor += 32;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buf);
  return { path: outPath, bytes: buf.length, entries: entries.length };
}

/**
 * Extract a raw miptex lump from a WAD file, rename it, and decode its
 * RGBA for the renderer atlas. Returns { name, lump, rgba, width, height }
 * or null if the source WAD or texture is not found.
 */
async function extractAndRenameTexture(wadPath, srcName, destName) {
  let buf;
  try { buf = await fs.readFile(wadPath); } catch { return null; }
  if (buf.length < 12) return null;
  const magic = buf.slice(0, 4).toString('ascii');
  if (magic !== 'WAD2' && magic !== 'WAD3') return null;

  const numLumps = buf.readInt32LE(4);
  const dirOffset = buf.readInt32LE(8);
  const needle = srcName.toLowerCase();

  for (let i = 0; i < numLumps; i++) {
    const entryStart = dirOffset + i * 32;
    if (entryStart + 32 > buf.length) continue;
    const filepos = buf.readInt32LE(entryStart);
    const disksize = buf.readInt32LE(entryStart + 4);
    const type = buf.readUInt8(entryStart + 12);
    const nameBytes = buf.slice(entryStart + 16, entryStart + 32);
    const nul = nameBytes.indexOf(0);
    const name = nameBytes.slice(0, nul === -1 ? 16 : nul).toString('ascii').toLowerCase();

    if (type !== TYPE_MIPTEX || name !== needle) continue;
    if (filepos + disksize > buf.length) continue;

    const lump = Buffer.from(buf.slice(filepos, filepos + disksize));
    // Rewrite the 16-byte name field in the lump header
    lump.fill(0, 0, 16);
    lump.write(destName, 0, Math.min(destName.length, 15), 'ascii');

    const width = lump.readInt32LE(16);
    const height = lump.readInt32LE(20);
    const mip0Off = lump.readInt32LE(24);
    if (width <= 0 || height <= 0) return null;
    const pixCount = width * height;

    const rgba = new Uint8ClampedArray(pixCount * 4);
    for (let p = 0; p < pixCount; p++) {
      const idx = lump[mip0Off + p];
      if (idx === 255) {
        rgba[p * 4 + 3] = 0;
      } else {
        const [r, g, b] = QUAKE_PALETTE[idx];
        rgba[p * 4] = r; rgba[p * 4 + 1] = g;
        rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = 255;
      }
    }
    return { name: destName, lump, rgba, width, height };
  }
  return null;
}

/**
 * Extract a miptex, rotate it 90° clockwise, and rename it.
 * Works for any texture (square or rectangular — width/height swap).
 */
async function extractRotateAndRename(wadPath, srcName, destName) {
  const src = await extractAndRenameTexture(wadPath, srcName, srcName);
  if (!src) return null;

  const lump = src.lump;
  const w = lump.readInt32LE(16);
  const h = lump.readInt32LE(20);
  const nw = h, nh = w;

  const hdrSize = 40;
  const sizes = [];
  let totalPix = 0;
  for (let m = 0; m < 4; m++) {
    const mw = Math.max(1, w >> m), mh = Math.max(1, h >> m);
    sizes.push({ sw: mw, sh: mh, dw: Math.max(1, h >> m), dh: Math.max(1, w >> m) });
    totalPix += sizes[m].dw * sizes[m].dh;
  }

  const newLump = Buffer.alloc(hdrSize + totalPix);
  newLump.fill(0, 0, 16);
  newLump.write(destName, 0, Math.min(destName.length, 15), 'ascii');
  newLump.writeInt32LE(nw, 16);
  newLump.writeInt32LE(nh, 20);

  let cursor = hdrSize;
  for (let m = 0; m < 4; m++) {
    newLump.writeInt32LE(cursor, 24 + m * 4);
    const { sw, sh, dw, dh } = sizes[m];
    const srcOff = lump.readInt32LE(24 + m * 4);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = y;
        const sy = sw - 1 - x;
        newLump[cursor + y * dw + x] = lump[srcOff + sy * sw + sx];
      }
    }
    cursor += dw * dh;
  }

  const rgba = new Uint8ClampedArray(nw * nh * 4);
  const mip0Off = hdrSize;
  for (let p = 0; p < nw * nh; p++) {
    const idx = newLump[mip0Off + p];
    if (idx === 255) {
      rgba[p * 4 + 3] = 0;
    } else {
      const [r, g, b] = QUAKE_PALETTE[idx];
      rgba[p * 4] = r; rgba[p * 4 + 1] = g;
      rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = 255;
    }
  }

  return { name: destName, lump: newLump, rgba, width: nw, height: nh };
}

/**
 * Generate the synthetic WAD with the runtime-only textures the editor
 * needs but the user's WADs don't necessarily contain:
 *
 *   - auto_wall: a procedural rock texture, used by the auto-close
 *     wall outline so the boundary of the play area always reads as
 *     "natural cliff" regardless of which user WAD is loaded.
 *   - sky_auto: a flat sky blue, used by the sky box brushes.
 *
 * Returns the absolute path to the WAD plus the decoded RGBA buffers so
 * the renderer can register the same textures in its in-memory atlas
 * (used by the editor 2D, the palette panel, and the 3D preview).
 */
async function ensureAutoWad(outPath) {
  const W = 64, H = 64;

  function solidEntry(name, r, g, b) {
    const idx = nearestPaletteIndex(r, g, b);
    const lump = buildSolidMiptex(name, W, H, idx);
    const rgb = QUAKE_PALETTE[idx];
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1];
      rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 255;
    }
    return { name, lump, rgba };
  }

  function tintedEntry(name, colorFn) {
    const { lump, mip0 } = buildTintedMiptex(name, W, H, colorFn);
    return { name, lump, rgba: mip0ToRgba(mip0, W, H) };
  }

  // -- World textures --
  const autoWall = tintedEntry('auto_wall', v => {
    const lum = 70 + Math.floor(v * 90);
    return [Math.min(255, lum + 10), lum, Math.max(0, lum - 18)];
  });
  const sky    = solidEntry('sky_auto', 140, 180, 230);
  const water  = solidEntry('*water',   30,  80, 160);

  // -- Prop placeholder textures --
  // Green foliage (tree leaves, bush)
  const gren3a = tintedEntry('gren3a', v => {
    const lum = 50 + Math.floor(v * 80);
    return [Math.max(0, lum - 25), Math.min(255, lum + 20), Math.max(0, lum - 30)];
  });
  // Brown wood (tree trunk, '+0' prefix = Quake animated frame 0)
  const wood = tintedEntry('+0wood', v => {
    const lum = 60 + Math.floor(v * 70);
    return [Math.min(255, lum + 30), Math.max(0, lum - 5), Math.max(0, lum - 30)];
  });
  // Grey rock
  const rock = tintedEntry('rock1_2', v => {
    const lum = 80 + Math.floor(v * 80);
    return [lum, lum, Math.max(0, lum - 8)];
  });
  // Warm brown wood (posts)
  const wood18 = tintedEntry('wood1_8', v => {
    const lum = 70 + Math.floor(v * 60);
    return [Math.min(255, lum + 20), Math.max(0, lum - 10), Math.max(0, lum - 35)];
  });
  // Dark metal (barrel)
  const metal = tintedEntry('metal1_1', v => {
    const lum = 55 + Math.floor(v * 60);
    return [Math.max(0, lum - 5), lum, Math.min(255, lum + 5)];
  });
  // Light rock (half-wall sides / bevel sides)
  const halfSide = tintedEntry('auto_hside', v => {
    const lum = 90 + Math.floor(v * 70);
    return [Math.min(255, lum + 5), lum, Math.max(0, lum - 10)];
  });

  // Skip texture: used on invisible faces of billboard brushes.
  const skip = solidEntry('skip', 128, 128, 128);

  // Lamp housing: fullbright white. Index 254 is pure white in the
  // fullbright range (224..255) so Quake renders it at constant brightness
  // regardless of the lightmap — looks like a glowing bulb day or night.
  // We bypass nearestPaletteIndex (which only quantises to 0..223) and
  // build the lump directly with index 254 in every mip.
  const lampFb = (() => {
    const lump = buildSolidMiptex('lamp_fb', W, H, 254);
    const [r, g, b] = QUAKE_PALETTE[254];
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      rgba[i * 4] = r; rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
    }
    return { name: 'lamp_fb', lump, rgba };
  })();

  // Fully transparent texture for billboard edge faces.
  // All pixels = palette index 255 (transparent in {-prefixed textures).
  const nullTex = (() => {
    const nw = 16, nh = 16;
    const lump = buildSolidMiptex('{null_auto', nw, nh, 255);
    const rgba = new Uint8ClampedArray(nw * nh * 4);
    return { name: '{null_auto', lump, rgba, width: nw, height: nh };
  })();

  // Tree / bush billboards and the road2/airdr2/airwd2/airbr2 textures
  // used to be runtime-extracted from fantasy.wad / foliage.wad / air2.wad.
  // Those source WADs no longer ship with the app; the tree/bush textures
  // were injected into text.wad offline (see scripts/inject-tree-into-text-wad.js),
  // and the road/airbase textures have native replacements in text.wad.

  const all = [autoWall, sky, water, gren3a, wood, rock, wood18, metal, halfSide, skip, nullTex, lampFb];

  await writeWad(outPath, all.map(e => ({ name: e.name, lump: e.lump })));

  return {
    path: outPath,
    name: 'auto',
    textures: all.map(e => ({ name: e.name, width: e.width ?? W, height: e.height ?? H, rgba: e.rgba })),
  };
}

module.exports = {
  writeWad,
  buildSolidMiptex,
  allocMiptexLump,
  nearestPaletteIndex,
  ensureAutoWad,
};
