/**
 * Headless BSP→PNG preview. Parses a BSP2 .bsp, rasterises its textured
 * faces in software (CPU, no GL) over a sky-blue background, and writes a
 * PNG. FENCE textures ('{'-prefixed) honour palette index 255 as
 * transparent, so the dither stipple shows the sky through it — exactly
 * what we want to verify on the cloud model.
 *
 *   node scripts/render-bsp-png.js [bsp] [out.png] [--w 900 --h 640
 *        --yaw 35 --pitch 22 --dist 2.2 --bg 120,165,215]
 *
 * Reuses the software-rasteriser idea from D:\code\modelcatalog\src\thumbnail.js.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { QUAKE_PALETTE } = require('../src/shared/quakePalette');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : def; }
const BSP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', 'tmp', 'b_cloud0.bsp');
const OUT = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(__dirname, '..', 'tmp', 'b_cloud0.png');
const W = parseInt(arg('w', '900'), 10), H = parseInt(arg('h', '640'), 10);
const YAW = parseFloat(arg('yaw', '35')) * Math.PI / 180;
const PITCH = parseFloat(arg('pitch', '20')) * Math.PI / 180;
const DISTF = parseFloat(arg('dist', '2.2'));
const BG = (arg('bg', '120,165,215')).split(',').map(Number);

// ---------------- BSP2 parse ----------------
const buf = fs.readFileSync(BSP);
const magic = buf.toString('ascii', 0, 4);
if (magic !== 'BSP2') throw new Error(`expected BSP2, got "${magic}" (recompile with -bsp2)`);
const lump = (i) => ({ ofs: buf.readInt32LE(4 + i * 8), len: buf.readInt32LE(4 + i * 8 + 4) });
const L_TEXTURES = 2, L_VERTS = 3, L_TEXINFO = 6, L_FACES = 7, L_EDGES = 12, L_SURFEDGES = 13;

// vertexes
const lv = lump(L_VERTS), nVerts = lv.len / 12, verts = new Float32Array(nVerts * 3);
for (let i = 0; i < nVerts * 3; i++) verts[i] = buf.readFloatLE(lv.ofs + i * 4);
// edges (BSP2: 2×uint32)
const le = lump(L_EDGES), nEdges = le.len / 8, edges = new Uint32Array(nEdges * 2);
for (let i = 0; i < nEdges; i++) { edges[i * 2] = buf.readUInt32LE(le.ofs + i * 8); edges[i * 2 + 1] = buf.readUInt32LE(le.ofs + i * 8 + 4); }
// surfedges (int32)
const ls = lump(L_SURFEDGES), nSE = ls.len / 4, surfedges = new Int32Array(nSE);
for (let i = 0; i < nSE; i++) surfedges[i] = buf.readInt32LE(ls.ofs + i * 4);
// texinfo (8 float + 2 int32 = 40)
const lt = lump(L_TEXINFO), nTI = lt.len / 40, texinfo = [];
for (let i = 0; i < nTI; i++) {
  const o = lt.ofs + i * 40;
  texinfo.push({
    u: [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)], uo: buf.readFloatLE(o + 12),
    v: [buf.readFloatLE(o + 16), buf.readFloatLE(o + 20), buf.readFloatLE(o + 24)], vo: buf.readFloatLE(o + 28),
    miptex: buf.readInt32LE(o + 32),
  });
}
// faces (BSP2 dface_t = 28 bytes)
const lf = lump(L_FACES), nFaces = lf.len / 28, faces = [];
for (let i = 0; i < nFaces; i++) {
  const o = lf.ofs + i * 28;
  faces.push({ firstedge: buf.readInt32LE(o + 8), numedges: buf.readInt32LE(o + 12), texinfo: buf.readInt32LE(o + 16) });
}
// miptex: decode each to {w,h,rgba(Uint8 w*h*4 with a=0 for index 255)}
const lx = lump(L_TEXTURES), nMip = buf.readInt32LE(lx.ofs), mips = [];
for (let i = 0; i < nMip; i++) {
  const rel = buf.readInt32LE(lx.ofs + 4 + i * 4);
  if (rel < 0) { mips.push(null); continue; }
  const mo = lx.ofs + rel;
  const tw = buf.readUInt32LE(mo + 16), th = buf.readUInt32LE(mo + 20), m0 = buf.readUInt32LE(mo + 24);
  const rgba = new Uint8Array(tw * th * 4);
  for (let p = 0; p < tw * th; p++) {
    const idx = buf[mo + m0 + p];
    if (idx === 255) { rgba[p * 4 + 3] = 0; }
    else { const c = QUAKE_PALETTE[idx] || [255, 0, 255]; rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2]; rgba[p * 4 + 3] = 255; }
  }
  mips.push({ w: tw, h: th, rgba });
}

// ---------------- camera ----------------
let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let i = 0; i < nVerts; i++) for (let a = 0; a < 3; a++) { const c = verts[i * 3 + a]; if (c < lo[a]) lo[a] = c; if (c > hi[a]) hi[a] = c; }
const ctr = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
const rad = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 || 100;
const dist = rad * DISTF;
const eye = [
  ctr[0] + dist * Math.cos(PITCH) * Math.cos(YAW),
  ctr[1] + dist * Math.cos(PITCH) * Math.sin(YAW),
  ctr[2] + dist * Math.sin(PITCH),
];
const proj = mat4Perspective(48 * Math.PI / 180, W / H, 1, 20000);
const view = mat4LookAt(eye, ctr, [0, 0, 1]);
const mvp = mat4Multiply(proj, view);
const LIGHT = norm3([-0.5, -0.4, 0.78]);

// ---------------- raster ----------------
const color = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) { color[i * 4] = BG[0]; color[i * 4 + 1] = BG[1]; color[i * 4 + 2] = BG[2]; color[i * 4 + 3] = 255; }
const depth = new Float32Array(W * H).fill(Infinity);

for (const f of faces) {
  const ti = texinfo[f.texinfo]; if (!ti) continue;
  const tex = mips[ti.miptex];
  // gather polygon vertices
  const poly = [];
  for (let i = 0; i < f.numedges; i++) {
    const se = surfedges[f.firstedge + i];
    const e = Math.abs(se);
    const vi = se >= 0 ? edges[e * 2] : edges[e * 2 + 1];
    poly.push([verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]]);
  }
  if (poly.length < 3) continue;
  // flat shade from polygon normal
  const n = norm3(cross3(sub3(poly[1], poly[0]), sub3(poly[2], poly[0])));
  const shade = 0.45 + 0.55 * Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  // project + per-vertex uv
  const sv = poly.map((p) => {
    const clip = transformVec4(mvp, [p[0], p[1], p[2], 1]);
    const iw = 1 / clip[3];
    return {
      x: (clip[0] * iw + 1) * 0.5 * W, y: (1 - clip[1] * iw) * 0.5 * H, z: clip[2] * iw, iw,
      u: (dot3(p, ti.u) + ti.uo), v: (dot3(p, ti.v) + ti.vo), behind: clip[3] <= 0,
    };
  });
  for (let i = 1; i < sv.length - 1; i++) tri(sv[0], sv[i], sv[i + 1], tex, shade);
}

function tri(a, b, c, tex, shade) {
  if (a.behind || b.behind || c.behind) return;
  let minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  let minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(den) < 1e-6) return;
  for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
    const w0 = ((b.y - c.y) * (px + 0.5 - c.x) + (c.x - b.x) * (py + 0.5 - c.y)) / den;
    const w1 = ((c.y - a.y) * (px + 0.5 - c.x) + (a.x - c.x) * (py + 0.5 - c.y)) / den;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * a.z + w1 * b.z + w2 * c.z, di = py * W + px;
    if (z >= depth[di]) continue;
    let r = 235 * shade, g = 238 * shade, bl = 245 * shade;   // fallback if no tex
    if (tex) {
      const iw = w0 * a.iw + w1 * b.iw + w2 * c.iw;
      const u = (w0 * a.u * a.iw + w1 * b.u * b.iw + w2 * c.u * c.iw) / iw;
      const v = (w0 * a.v * a.iw + w1 * b.v * b.iw + w2 * c.v * c.iw) / iw;
      const tx = ((Math.floor(u) % tex.w) + tex.w) % tex.w, ty = ((Math.floor(v) % tex.h) + tex.h) % tex.h;
      const tp = (ty * tex.w + tx) * 4;
      if (tex.rgba[tp + 3] === 0) continue;   // fence transparent → show sky
      r = tex.rgba[tp] * shade; g = tex.rgba[tp + 1] * shade; bl = tex.rgba[tp + 2] * shade;
    }
    depth[di] = z;
    color[di * 4] = r; color[di * 4 + 1] = g; color[di * 4 + 2] = bl; color[di * 4 + 3] = 255;
  }
}

fs.writeFileSync(OUT, encodePNG(color, W, H));
console.log(`rendered ${BSP}  →  ${OUT}  (${W}x${H}, ${nFaces} faces, ${nMip} textures)`);

// ---------------- helpers ----------------
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function transformVec4(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3], m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]]; }
function mat4Perspective(fov, aspect, near, far) { const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far); return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]; }
function mat4LookAt(eye, c, up) {
  const z = norm3(sub3(eye, c)); const x = norm3(cross3(up, z)); const y = cross3(z, x);
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot3(x,eye), -dot3(y,eye), -dot3(z,eye), 1];
}
function mat4Multiply(a, b) { const o = new Array(16); for (let i=0;i<4;i++) for (let j=0;j<4;j++) o[j*4+i]=a[i]*b[j*4]+a[4+i]*b[j*4+1]+a[8+i]*b[j*4+2]+a[12+i]*b[j*4+3]; return o; }

function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.subarray ? raw.set(Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4), y * (w * 4 + 1) + 1) : 0; }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => { const c = Buffer.alloc(12 + data.length); c.writeUInt32BE(data.length, 0); c.write(type, 4, 'ascii'); data.copy(c, 8); c.writeUInt32BE(crc32(c.subarray(4, 8 + data.length)) >>> 0, 8 + data.length); return c; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
var CRC; function crc32(b) { if (!CRC) { CRC = []; for (let n=0;n<256;n++){ let c=n; for (let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; CRC[n]=c>>>0; } } let c=0xffffffff; for (let i=0;i<b.length;i++) c=CRC[(c^b[i])&0xff]^(c>>>8); return c^0xffffffff; }
