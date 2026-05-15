/**
 * Build (and keep in sync) `textures.wad` from the per-biome PNG art
 * under `src/renderer/assets/textures/<biome>/<face>.png`.
 *
 * The WAD names each miptex `<biome>_<face>` (snake_case), matching the
 * `texturesFor(id)` convention shared with mapWriter and the renderer.
 * qbsp then has everything it needs to resolve the names emitted by the
 * .map writer without the user having to maintain a hand-built WAD.
 *
 * On every app launch we compare the PNGs' mtimes against a manifest
 * stored alongside the WAD. If anything was modified, added, or removed
 * (or the WAD just doesn't exist yet), we rebuild and refresh the
 * manifest. Otherwise we skip — the WAD on disk is already current.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { writeWad, allocMiptexLump, nearestPaletteIndex } = require('./wadWriter');

const FACE_KEYS = ['top', 'side', 'capital', 'base', 'bottom'];

/**
 * Decode a PNG file to RGBA via Electron's nativeImage. Returns
 * { width, height, rgba: Buffer }.
 *
 * nativeImage.getBitmap() returns BGRA on Windows and Linux, RGBA on
 * macOS. We swap on the non-mac path so callers always see RGBA.
 */
async function loadPngRgba(pngPath) {
  // Lazy-require: this module is loaded post-app-ready, so the
  // nativeImage API is initialised by the time we hit this line.
  const { nativeImage } = require('electron');
  const img = nativeImage.createFromPath(pngPath);
  if (img.isEmpty()) throw new Error(`failed to decode PNG: ${pngPath}`);
  const { width, height } = img.getSize();
  const bgra = img.getBitmap();
  if (process.platform === 'darwin') {
    return { width, height, rgba: bgra };
  }
  const rgba = Buffer.allocUnsafe(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i]     = bgra[i + 2];
    rgba[i + 1] = bgra[i + 1];
    rgba[i + 2] = bgra[i];
    rgba[i + 3] = bgra[i + 3];
  }
  return { width, height, rgba };
}

/**
 * Build a paletted miptex lump from RGBA pixels. Mips 1..3 are 2x2
 * box-filtered downsamples of the RGB and then re-quantised. Width and
 * height must be multiples of 8 — same constraint Quake imposes.
 */
function pngRgbaToMiptex(name, width, height, rgba) {
  const { buf, offsets } = allocMiptexLump(name, width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const idx = nearestPaletteIndex(rgba[si], rgba[si + 1], rgba[si + 2]);
      buf[offsets[0] + y * width + x] = idx;
    }
  }
  for (let level = 1; level <= 3; level++) {
    const factor = 1 << level;
    const w2 = width / factor;
    const h2 = height / factor;
    for (let y = 0; y < h2; y++) {
      for (let x = 0; x < w2; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const si = ((y * factor + dy) * width + x * factor + dx) * 4;
            r += rgba[si];
            g += rgba[si + 1];
            b += rgba[si + 2];
          }
        }
        const n = factor * factor;
        buf[offsets[level] + y * w2 + x] = nearestPaletteIndex(r / n, g / n, b / n);
      }
    }
  }
  return buf;
}

/**
 * Walk `textureRoot` and return one record per face PNG. Subfolders
 * that are not biomes (no face PNG inside) are silently ignored.
 *
 *   { biome, face, abs, rel: 'biome/face.png', mtimeMs }
 */
async function scanTextures(textureRoot) {
  const out = [];
  let dirs;
  try {
    dirs = await fs.readdir(textureRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const biome = d.name;
    const subdir = path.join(textureRoot, biome);
    let files;
    try { files = await fs.readdir(subdir); }
    catch { continue; }
    for (const f of files) {
      if (!/\.png$/i.test(f)) continue;
      const face = f.replace(/\.png$/i, '');
      if (!FACE_KEYS.includes(face)) continue;
      const abs = path.join(subdir, f);
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) continue;
      out.push({
        biome,
        face,
        abs,
        rel: `${biome}/${f}`,
        mtimeMs: stat.mtimeMs,
      });
    }
  }
  return out;
}

function manifestFromScan(scan) {
  const m = {};
  for (const r of scan) m[r.rel] = r.mtimeMs;
  return m;
}

function manifestsEqual(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (a[ka[i]] !== b[kb[i]]) return false;
  }
  return true;
}

/**
 * Convert each scanned PNG into a Quake miptex named `<biome>_<face>`
 * (matching texturesFor()) and bundle them all into one WAD2 file.
 */
async function buildTexturesWad(scan, outWadPath) {
  const entries = [];
  for (const r of scan) {
    const png = await loadPngRgba(r.abs);
    const id = r.biome.replace(/-/g, '_');
    const fullName = `${id}_${r.face}`;
    // Quake miptex names cap at 15 ASCII chars + null. If the biome id
    // is long enough to overrun, truncate and warn — the user will
    // notice the qbsp warning and shorten the biome name.
    if (fullName.length > 15) {
      console.warn(`[textures.wad] "${fullName}" > 15 chars, truncating`);
    }
    const name = fullName.slice(0, 15);
    entries.push({ name, lump: pngRgbaToMiptex(name, png.width, png.height, png.rgba) });
  }
  return writeWad(outWadPath, entries);
}

/**
 * Ensure `outWadPath` is up to date with the PNGs under `textureRoot`.
 * Reads `manifestPath`; if the recorded mtimes match the current ones
 * AND the WAD file exists, skips. Otherwise rebuilds the WAD and
 * writes the new manifest. Returns { rebuilt, count, path }.
 */
async function ensureTexturesWad(textureRoot, outWadPath, manifestPath) {
  const scan = await scanTextures(textureRoot);
  if (scan.length === 0) {
    return { rebuilt: false, count: 0, path: outWadPath, reason: 'no PNGs found' };
  }
  const current = manifestFromScan(scan);
  let saved = null;
  try {
    saved = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch { /* missing or invalid → rebuild */ }
  const wadExists = await fs.stat(outWadPath).then(() => true).catch(() => false);
  if (wadExists && manifestsEqual(current, saved)) {
    return { rebuilt: false, count: scan.length, path: outWadPath };
  }
  await buildTexturesWad(scan, outWadPath);
  await fs.writeFile(manifestPath, JSON.stringify(current, null, 2), 'utf8');
  return { rebuilt: true, count: scan.length, path: outWadPath };
}

module.exports = {
  ensureTexturesWad,
  buildTexturesWad,
  scanTextures,
  loadPngRgba,
  pngRgbaToMiptex,
};
