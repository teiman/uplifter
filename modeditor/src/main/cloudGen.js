/**
 * Offline cloud generator. Builds discrete 3D cloud VOLUMES (math), then
 * slices each volume along ALL THREE axes — horizontal cuts (XY planes
 * stacked in Z) AND vertical cuts (YZ planes stacked in X, XZ planes
 * stacked in Y). Stacking slices on 3 axes makes the volume read solid
 * from any viewing angle (a single horizontal stack looks flat / like a
 * UFO disc from the side). Every slice is baked to a fence miptex;
 * near-duplicate / empty slices are dropped. Returns { textures, prefabs }:
 *
 *   textures : [{ name:'{cloud_<id>', lump:Buffer }]   — unique slice texs
 *   prefabs  : { version, texSize, bandHalfZ,
 *                volumes: [ { slices: [ { axis:'z'|'x'|'y', c, tex } ] } ] }
 *
 * `c` is the slice plane position in the volume's normalized [-1,1] along
 * its axis. The editor (mapWriter) reads this at compile time and stamps a
 * thin fence brush per slice, oriented by `axis`. Iterate the look here /
 * in scripts/gen-clouds.js; the editor picks it up next compile, no reload.
 *
 * Volume model (volumetric-cloud literature): a cumulus is a CLUSTER of
 * several spherical "parcels" (metaballs) — a multi-lobe cauliflower, NOT
 * one round disc — eroded by 3D fbm noise, with a flat-ish base, rounded
 * crown and an envelope keeping it inside the texture. Painting: blue-noise
 * dithered edges + a directional sun rim-light gated to the upper part
 * (no ring on the bottom of the cloud).
 */

const { allocMiptexLump, nearestPaletteIndex } = require('./wadWriter');
const { QUAKE_PALETTE } = require('../shared/quakePalette');
const {
  DEFAULT_SUN, CLOUD_VOLUME_COUNT, CLOUD_TEX_SIZE,
} = require('../shared/types');

const TRANSPARENT = 255;
const clamp = (n, lo, hi) => (n < lo ? lo : (n > hi ? hi : n));

// 3D sun direction (world) from the default sun's mangle "yaw pitch roll".
// Quake mangle: pitch is downward-positive, so elevation = -pitch.
const _mng = String(DEFAULT_SUN.mangle).split(/\s+/).map(parseFloat);
const _az = (_mng[0] || 0) * Math.PI / 180;
const _el = (-(_mng[1] || 0)) * Math.PI / 180;
const SUN3D = [Math.cos(_az) * Math.cos(_el), Math.sin(_az) * Math.cos(_el), Math.sin(_el)];

// ----- 3D value noise (lattice hash + trilinear), in [0,1] -----
function hash3(ix, iy, iz, s) {
  let n = (ix * 374761393 + iy * 668265263 + iz * 2246822519 + s * 3266489917) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return (n & 0xFFFF) / 0xFFFF;
}
function vnoise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const tx = x - ix, ty = y - iy, tz = z - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const c00 = hash3(ix, iy, iz, s)     + (hash3(ix + 1, iy, iz, s)     - hash3(ix, iy, iz, s))     * sx;
  const c10 = hash3(ix, iy + 1, iz, s) + (hash3(ix + 1, iy + 1, iz, s) - hash3(ix, iy + 1, iz, s)) * sx;
  const c01 = hash3(ix, iy, iz + 1, s) + (hash3(ix + 1, iy, iz + 1, s) - hash3(ix, iy, iz + 1, s)) * sx;
  const c11 = hash3(ix, iy + 1, iz + 1, s) + (hash3(ix + 1, iy + 1, iz + 1, s) - hash3(ix, iy + 1, iz + 1, s)) * sx;
  const c0 = c00 + (c10 - c00) * sy;
  const c1 = c01 + (c11 - c01) * sy;
  return c0 + (c1 - c0) * sz;
}
function fbm3(x, y, z, s) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { v += vnoise3(x * f, y * f, z * f, s + o * 97) * amp; amp *= 0.5; f *= 2; }
  return v;                                         // ~0..0.94
}

/**
 * Build a cumulus density grid in [-1,1]³. grid[(z*res+y)*res+x] is a
 * SIGNED density (> 0 inside, < 0 outside, iso 0). Multi-lobe metaball
 * cluster + fbm erosion + flat base + rounded crown + envelope.
 */
function buildCloudVolume(res, seed) {
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const blobs = [];
  const baseN = 2 + Math.floor(rnd() * 2);          // 2..3 wide low base lobes
  for (let i = 0; i < baseN; i++) {
    blobs.push({ cx: (rnd() - 0.5) * 0.6, cy: (rnd() - 0.5) * 0.6, cz: -0.5 + rnd() * 0.2, r: 0.30 + rnd() * 0.14, w: 0.95 });
  }
  // More, smaller, distinctly-placed billows climbing high → a lumpy
  // cauliflower that fills the vertical extent (not a flat single puff).
  const billowN = 9 + Math.floor(rnd() * 6);        // 9..14 billows
  for (let i = 0; i < billowN; i++) {
    const a = rnd() * Math.PI * 2, rad = 0.12 + rnd() * 0.5;
    blobs.push({ cx: Math.cos(a) * rad, cy: Math.sin(a) * rad, cz: -0.3 + rnd() * 1.05, r: 0.13 + rnd() * 0.15, w: 0.55 + rnd() * 0.4 });
  }
  const dFreq = 2.4 + rnd() * 1.4, dSeed = (seed * 131 + 17) | 0, dAmp = 0.5;
  const iso = 0.5, zBase = -0.5;
  const grid = new Float32Array(res * res * res);
  for (let kz = 0; kz < res; kz++) {
    const z = (kz / (res - 1)) * 2 - 1;
    for (let ky = 0; ky < res; ky++) {
      const y = (ky / (res - 1)) * 2 - 1;
      for (let kx = 0; kx < res; kx++) {
        const x = (kx / (res - 1)) * 2 - 1;
        let dsum = 0;
        for (let i = 0; i < blobs.length; i++) {
          const b = blobs[i];
          const dx = x - b.cx, dy = y - b.cy, dz = z - b.cz;
          dsum += b.w * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * b.r * b.r));
        }
        let d = dsum - iso;
        d += dAmp * (fbm3(x * dFreq + 3.1, y * dFreq + 1.7, z * dFreq + 5.3, dSeed) - 0.5);
        if (z < zBase) d -= (zBase - z) * 3.2;
        d -= Math.max(0, z - 0.80) * 3.0;
        d -= Math.max(0, Math.sqrt(x * x + y * y) - 0.84) * 4.0;
        d -= Math.max(0, Math.abs(z) - 0.92) * 4.0;
        grid[(kz * res + ky) * res + kx] = d;
      }
    }
  }
  return { grid, res };
}

/** Trilinear sample at normalized (vx,vy,vz) in [-1,1]. */
function sampleVol(vol, vx, vy, vz) {
  const { grid, res } = vol;
  let fx = ((vx + 1) * 0.5) * (res - 1);
  let fy = ((vy + 1) * 0.5) * (res - 1);
  let fz = ((vz + 1) * 0.5) * (res - 1);
  if (fx < 0) fx = 0; else if (fx > res - 1) fx = res - 1;
  if (fy < 0) fy = 0; else if (fy > res - 1) fy = res - 1;
  if (fz < 0) fz = 0; else if (fz > res - 1) fz = res - 1;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const ix1 = Math.min(ix + 1, res - 1), iy1 = Math.min(iy + 1, res - 1), iz1 = Math.min(iz + 1, res - 1);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const g = (X, Y, Z) => grid[(Z * res + Y) * res + X];
  const c000 = g(ix, iy, iz), c100 = g(ix1, iy, iz), c010 = g(ix, iy1, iz), c110 = g(ix1, iy1, iz);
  const c001 = g(ix, iy, iz1), c101 = g(ix1, iy, iz1), c011 = g(ix, iy1, iz1), c111 = g(ix1, iy1, iz1);
  const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
  const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
  const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
  return y0 + (y1 - y0) * tz;
}

// Map an image texel (a = horizontal -1..1, b = vertical, +down) on a slice
// of the given axis at plane coord c → volume (vx,vy,vz). Also returns the
// image-space sun direction for that axis's plane (for the rim).
//   axis 'z' (horizontal, XY plane): u=+X, v=down=−Y.
//   axis 'x' (vertical,  YZ plane):  u=+Y, v=down=−Z (image-top = world +Z).
//   axis 'y' (vertical,  XZ plane):  u=+X, v=down=−Z.
function axisMap(axis, a, b, c) {
  if (axis === 'x') return [c, a, -b];
  if (axis === 'y') return [a, c, -b];
  return [a, -b, c];                                 // 'z'
}
function axisSunImg(axis) {
  let u, v;
  if (axis === 'x') { u = SUN3D[1]; v = -SUN3D[2]; }       // (Y, +Z up)
  else if (axis === 'y') { u = SUN3D[0]; v = -SUN3D[2]; }  // (X, +Z up)
  else { u = SUN3D[0]; v = -SUN3D[1]; }                    // 'z' (X, +Y up... image v=−Y)
  const len = Math.hypot(u, v) || 1e-4;
  return [u / len, v / len];
}

/**
 * Bake one slice (axis + plane coord c) of a volume into a fence miptex.
 * Returns { lump, opaque }. Shading: vertical gradient by the texel's world
 * Z (sunlit crown brighter), a directional sun rim gated to the upper part,
 * blue-noise dithered edge, mips re-dithered from continuous density.
 */
function buildSlice(name, w, h, vol, axis, c, seed, opts = {}) {
  const { buf, offsets } = allocMiptexLump(name, w, h);
  const tint = opts.tint ?? [1, 1, 1];
  // --flat experiment: keep the shaded look ONLY in the border band (where
  // the dither dots live) and fill the deep interior with one flat light
  // grey, instead of the vertical/depth/rim gradient.
  const FLAT = !!opts.flat;
  const FLAT_LUM = opts.flatLum ?? 214;   // light grey interior
  const halfW = w / 2, halfH = h / 2;
  const EDGE = 0.16;
  const R_MAX = 0.94, R_BORDER = 0.12;
  const ox = (seed & 31) * 0.37, oy = ((seed >> 5) & 31) * 0.41;
  const ign = (x, y) => {
    const t = 0.06711056 * (x + ox) + 0.00583715 * (y + oy);
    const f = t - Math.floor(t);
    const g = 52.9829189 * f;
    return g - Math.floor(g);
  };
  const sunImg = axisSunImg(axis);
  const eps = 1.6 / halfW;

  const densArr = new Float32Array(w * h);
  const rArr = new Uint8Array(w * h), gArr = new Uint8Array(w * h), bArr = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a = (x + 0.5 - halfW) / halfW;
      const b = (y + 0.5 - halfH) / halfH;
      const radius = Math.sqrt(a * a + b * b);
      const m = axisMap(axis, a, b, c);
      const d3 = sampleVol(vol, m[0], m[1], m[2]);
      let dens = clamp(d3 / EDGE + 0.5, 0, 1);
      dens = Math.min(dens, clamp((R_MAX - radius) / R_BORDER, 0, 1));
      densArr[p] = dens;
      // World-Z fraction of this texel → vertical shading (crown brighter).
      const vertN = (m[2] + 1) * 0.5;
      const depthIn = clamp(d3 / 0.5, 0, 1);
      let lum = 178 + vertN * 48 - depthIn * 26;
      // Directional sun rim from the in-plane outward normal (−∇density),
      // gated to the upper part so the cloud's underside has no ring.
      const gu = sampleVol(vol, ...axisMap(axis, a + eps, b, c)) - sampleVol(vol, ...axisMap(axis, a - eps, b, c));
      const gv = sampleVol(vol, ...axisMap(axis, a, b + eps, c)) - sampleVol(vol, ...axisMap(axis, a, b - eps, c));
      const glen = Math.sqrt(gu * gu + gv * gv) || 1e-4;
      const sunFace = Math.max(0, (-gu / glen) * sunImg[0] + (-gv / glen) * sunImg[1]);
      const rimEdge = Math.max(0, 1 - depthIn / 0.30);
      const rimGate = clamp((vertN - 0.30) / 0.4, 0, 1);
      lum += rimEdge * sunFace * sunFace * 56 * rimGate;
      lum = clamp(lum, 140, 252);
      // Flatten the interior: blend the shaded value toward a flat grey as
      // we move inward (depthIn 0=edge → 1=deep). Keeps the border band (the
      // dither dots) exactly as shaded; the body becomes one light grey.
      if (FLAT) {
        const inward = clamp((depthIn - 0.18) / 0.18, 0, 1);   // 0 at edge, 1 inside
        lum = lum + (FLAT_LUM - lum) * inward;
      }
      rArr[p] = Math.min(255, Math.round(lum * tint[0]));
      gArr[p] = Math.min(255, Math.round(lum * tint[1]));
      bArr[p] = Math.min(255, Math.round(lum * tint[2]));
    }
  }

  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (densArr[p] > ign(x, y)) { buf[offsets[0] + p] = nearestPaletteIndex(rArr[p], gArr[p], bArr[p]); opaque++; }
      else buf[offsets[0] + p] = TRANSPARENT;
    }
  }
  for (let level = 1; level <= 3; level++) {
    const factor = 1 << level;
    const w2 = w / factor, h2 = h / factor;
    const n = factor * factor;
    for (let yy = 0; yy < h2; yy++) {
      for (let xx = 0; xx < w2; xx++) {
        let d = 0, r = 0, g = 0, bb = 0;
        for (let sy = 0; sy < factor; sy++) {
          for (let sx = 0; sx < factor; sx++) {
            const p = (yy * factor + sy) * w + (xx * factor + sx);
            d += densArr[p]; r += rArr[p]; g += gArr[p]; bb += bArr[p];
          }
        }
        d /= n;
        buf[offsets[level] + yy * w2 + xx] = (d > ign(xx, yy))
          ? nearestPaletteIndex(r / n, g / n, bb / n)
          : TRANSPARENT;
      }
    }
  }
  return { lump: buf, opaque };
}

/** Rewrite the 16-byte miptex name field in a lump. */
function renameLump(lump, name) {
  lump.fill(0, 0, 16);
  lump.write(name, 0, Math.min(name.length, 15), 'ascii');
  return lump;
}

/** mip2 (64×64) signature for near-duplicate detection: transparent→0,
 *  opaque→1..255 (palette luminance). Finer than mip3 so distinct
 *  silhouettes stay distinct. */
function sliceSignature(lump) {
  const w = lump.readInt32LE(16);
  const mip2Off = lump.readInt32LE(24 + 2 * 4);
  const mw = Math.max(1, w >> 2);
  const sig = new Uint8Array(mw * mw);
  for (let i = 0; i < mw * mw; i++) {
    const idx = lump[mip2Off + i];
    if (idx === TRANSPARENT) { sig[i] = 0; continue; }
    const c = QUAKE_PALETTE[idx];
    sig[i] = Math.max(1, Math.round((c[0] + c[1] + c[2]) / 3));
  }
  return sig;
}
/** Two slices are "the same" only if their SILHOUETTES match almost
 *  exactly (opacity mismatch under opThresh of texels) AND the shared
 *  opaque pixels are close in tone (mean diff under valThresh). This
 *  merges genuinely-near-identical slices without collapsing distinct
 *  shapes (a plain mean-abs-diff over a mostly-transparent texture merges
 *  everything). */
function sliceSame(a, b, opThresh, valThresh) {
  let mismatch = 0, vsum = 0, both = 0;
  for (let i = 0; i < a.length; i++) {
    const ao = a[i] > 0, bo = b[i] > 0;
    if (ao !== bo) mismatch++;
    else if (ao) { vsum += Math.abs(a[i] - b[i]); both++; }
  }
  if (mismatch / a.length > opThresh) return false;
  if (both > 0 && vsum / both > valThresh) return false;
  return true;
}

/**
 * Generate clouds: volumes → 3-axis slices → dedup. Returns { textures,
 * prefabs, stats }. `dedupDist` = max mean-abs-diff (0..255) at which two
 * slices share a texture (0 = exact only). `bandHalfZ` = world half-height
 * the editor maps the volume's z=±1 to (controls how tall the clouds are).
 */
function buildClouds(opts = {}) {
  const volumeCount = opts.volumeCount ?? CLOUD_VOLUME_COUNT;
  const texSize = opts.texSize ?? CLOUD_TEX_SIZE;
  const gridRes = opts.gridRes ?? 96;
  const nZ = opts.nZ ?? 12;            // horizontal cuts (stacked in Z)
  const nX = opts.nX ?? 8;             // vertical cuts (stacked in X)
  const nY = opts.nY ?? 8;             // vertical cuts (stacked in Y)
  const span = opts.span ?? 0.85;      // slice the inner volume (skip dead caps)
  // Dedup: merge two slices only if their silhouettes match within
  // opThresh (fraction of texels) and tone within valThresh (0..255).
  // Conservative so distinct shapes are NOT collapsed.
  const opThresh = opts.opThresh ?? 0.02;
  const valThresh = opts.valThresh ?? 12;
  const bandHalfZ = opts.bandHalfZ ?? 110;

  const unique = [];                   // { lump, sig }
  const volumes = [];
  let rawCount = 0, emptyCount = 0;

  const addSlice = (slicesOut, vol, axis, c, tintForZ, seedBase) => {
    rawCount++;
    // crown/base tint only really meaningful per-z; keep a gentle vertical
    // tint for horizontal slices, neutral-ish for vertical (they span z).
    const tint = tintForZ ?? [0.95, 0.97, 1.0];
    const { lump, opaque } = buildSlice('{tmp', texSize, texSize, vol, axis, c, seedBase, { tint });
    if (opaque === 0) { emptyCount++; return; }
    const sig = sliceSignature(lump);
    let hit = -1;
    for (let u = 0; u < unique.length; u++) {
      if (sliceSame(sig, unique[u].sig, opThresh, valThresh)) { hit = u; break; }
    }
    if (hit < 0) { hit = unique.length; unique.push({ lump, sig }); }
    slicesOut.push({ axis, c, texIdx: hit });
  };

  for (let v = 0; v < volumeCount; v++) {
    const vol = buildCloudVolume(gridRes, 0x51F + v * 0x9E37);
    const slices = [];
    for (let i = 0; i < nZ; i++) {
      const c = ((i / (nZ - 1)) * 2 - 1) * span;
      const t = (c + 1) * 0.5;
      addSlice(slices, vol, 'z', c, [0.86 + 0.14 * t, 0.91 + 0.09 * t, 1.0], v * 257 + i);
    }
    for (let i = 0; i < nX; i++) {
      const c = ((i / (nX - 1)) * 2 - 1) * span;
      addSlice(slices, vol, 'x', c, null, v * 257 + 100 + i);
    }
    for (let i = 0; i < nY; i++) {
      const c = ((i / (nY - 1)) * 2 - 1) * span;
      addSlice(slices, vol, 'y', c, null, v * 257 + 200 + i);
    }
    volumes.push({ slices });
  }

  const textures = unique.map((u, i) => {
    const name = `{cloud_${i}`;
    return { name, lump: renameLump(u.lump, name) };
  });
  const prefabVolumes = volumes.map(vol => ({
    slices: vol.slices.map(s => ({ axis: s.axis, c: Math.round(s.c * 1000) / 1000, tex: `{cloud_${s.texIdx}` })),
  }));
  const prefabs = { version: 2, texSize, bandHalfZ, volumes: prefabVolumes };
  const stats = {
    rawCount, emptyCount, uniqueCount: unique.length,
    placedCount: prefabVolumes.reduce((a, x) => a + x.slices.length, 0),
  };
  return { textures, prefabs, stats };
}

// ---------------------------------------------------------------------
// Slice → brush. A thin slab whose slice texture maps exactly ONCE across
// the two faces perpendicular to `axis`; the other 4 (thin) faces use
// 'skip' (qbsp drops them). Lives here (not in the editor) so the offline
// tool is self-contained. axis: 'z' horizontal cut (textured ±Z, u=+X,
// v=-Y), 'x'/'y' vertical cuts (textured ±X / ±Y, u=other horizontal,
// v=-Z so image-up = world +Z). UV solved so the texture spans the face
// once, matching how buildSlice baked it.
// ---------------------------------------------------------------------
function _face(p1, p2, p3, tex, uAxis, vAxis, uOff, vOff, uScale, vScale) {
  return (
    `( ${p1[0]} ${p1[1]} ${p1[2]} ) ` +
    `( ${p2[0]} ${p2[1]} ${p2[2]} ) ` +
    `( ${p3[0]} ${p3[1]} ${p3[2]} ) ` +
    `${tex} ` +
    `[ ${uAxis[0]} ${uAxis[1]} ${uAxis[2]} ${uOff} ] ` +
    `[ ${vAxis[0]} ${vAxis[1]} ${vAxis[2]} ${vOff} ] ` +
    `0 ${uScale} ${vScale}`
  );
}
function cloudSliceBrush({ minX, minY, minZ, maxX, maxY, maxZ }, texName, texSize, axis) {
  const TEX = texSize || CLOUD_TEX_SIZE;
  const SKIP = 'skip';
  let lines;
  if (axis === 'x') {
    const uS = (maxY - minY) / TEX, vS = (maxZ - minZ) / TEX;
    const uOff = -minY / uS, vOff = maxZ / vS;
    lines = [
      _face([maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], texName, [0, 1, 0], [0, 0, -1], uOff, vOff, uS, vS),
      _face([minX, maxY, minZ], [minX, maxY, maxZ], [minX, minY, maxZ], texName, [0, 1, 0], [0, 0, -1], uOff, vOff, uS, vS),
      _face([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], SKIP, [1, 0, 0], [0, -1, 0], 0, 0, 1, 1),
      _face([minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], SKIP, [1, 0, 0], [0, -1, 0], 0, 0, 1, 1),
      _face([minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], SKIP, [1, 0, 0], [0, 0, -1], 0, 0, 1, 1),
      _face([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], SKIP, [1, 0, 0], [0, 0, -1], 0, 0, 1, 1),
    ];
  } else if (axis === 'y') {
    const uS = (maxX - minX) / TEX, vS = (maxZ - minZ) / TEX;
    const uOff = -minX / uS, vOff = maxZ / vS;
    lines = [
      _face([minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], texName, [1, 0, 0], [0, 0, -1], uOff, vOff, uS, vS),
      _face([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], texName, [1, 0, 0], [0, 0, -1], uOff, vOff, uS, vS),
      _face([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], SKIP, [1, 0, 0], [0, -1, 0], 0, 0, 1, 1),
      _face([minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], SKIP, [1, 0, 0], [0, -1, 0], 0, 0, 1, 1),
      _face([maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], SKIP, [0, 1, 0], [0, 0, -1], 0, 0, 1, 1),
      _face([minX, maxY, minZ], [minX, maxY, maxZ], [minX, minY, maxZ], SKIP, [0, 1, 0], [0, 0, -1], 0, 0, 1, 1),
    ];
  } else {
    const uS = (maxX - minX) / TEX, vS = (maxY - minY) / TEX;
    const uOff = -minX / uS, vOff = maxY / vS;
    lines = [
      _face([minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], texName, [1, 0, 0], [0, -1, 0], uOff, vOff, uS, vS),
      _face([minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], texName, [1, 0, 0], [0, -1, 0], uOff, vOff, uS, vS),
      _face([maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], SKIP, [0, 1, 0], [0, 0, -1], 0, 0, 1, 1),
      _face([minX, maxY, minZ], [minX, maxY, maxZ], [minX, minY, maxZ], SKIP, [0, 1, 0], [0, 0, -1], 0, 0, 1, 1),
      _face([minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], SKIP, [1, 0, 0], [0, 0, -1], 0, 0, 1, 1),
      _face([minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], SKIP, [1, 0, 0], [0, 0, -1], 0, 0, 1, 1),
    ];
  }
  return '{\n' + lines.join('\n') + '\n}';
}

module.exports = { buildClouds, buildCloudVolume, sampleVol, buildSlice, cloudSliceBrush };
