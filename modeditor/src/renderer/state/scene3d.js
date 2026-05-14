/**
 * Build a flat mesh (positions, normals, colours) from a TilemapData for
 * the 3D viewport. One axis-aligned box per cell + per object + the
 * world's sky/water/bedrock chunks.
 *
 * Coordinate convention matches the .map writer:
 *   - X/Y: world units, grid centred on origin.
 *   - Z: up. Sea level at SEA_LEVEL_Z = 0. Bedrock at BEDROCK_TOP_Z = -128.
 *   - Row 0 maps to the NORTH edge (largest +Y).
 *
 * Output buffers:
 *   positions: Float32Array  (3 * vertexCount)
 *   normals:   Float32Array  (3 * vertexCount)
 *   colors:    Float32Array  (3 * vertexCount, in 0..1 range)
 *   indices:   Uint32Array
 *
 * Vertex count is 24 per box (6 faces × 4 corners) so each face has its
 * own normal & colour. Indices are 36 per box (6 faces × 2 triangles).
 */

import {
  CELL_SIZE, HEIGHT_UNIT, WORLD_HALF, SEA_LEVEL_H, SEA_LEVEL_Z,
  BEDROCK_TOP_Z, BEDROCK_THICKNESS, SKY_TOP_Z,
  PALETTE, OBJECT_BY_KIND,
} from '../../shared/types.mjs';

const SKY_COLOR     = [0.47, 0.71, 0.90];   // matches uplifter_blue sky
const WATER_COLOR   = [0.18, 0.40, 0.62];
const BEDROCK_COLOR = [0.30, 0.22, 0.14];
const DEFAULT_LAND  = [0.36, 0.30, 0.20];

/** RGB 0..1 from a hex string like '#7a5a3a'. */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

const PALETTE_RGB = PALETTE.map(p => hexToRgb(p.color));
const OBJECT_RGB = new Map();
for (const [k, o] of OBJECT_BY_KIND) OBJECT_RGB.set(k, hexToRgb(o.color));

/** Push the 6 faces of a box into the mesh builder. Each face gets its
 *  own 4 vertices so the normal is sharp at edges. */
function pushBox(out, x0, y0, z0, x1, y1, z1, rgb) {
  const [r, g, b] = rgb;
  // Each face: 4 corners CCW from outside, normal, then 2 triangles.
  const faces = [
    // +X (east)
    { p: [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], n: [ 1, 0, 0] },
    // -X (west)
    { p: [[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]], n: [-1, 0, 0] },
    // +Y (north)
    { p: [[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1]], n: [ 0, 1, 0] },
    // -Y (south)
    { p: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], n: [ 0,-1, 0] },
    // +Z (top)
    { p: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [ 0, 0, 1] },
    // -Z (bottom)
    { p: [[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]], n: [ 0, 0,-1] },
  ];
  for (const f of faces) {
    const base = out.vertexCount;
    for (const [px, py, pz] of f.p) {
      out.positions.push(px, py, pz);
      out.normals.push(f.n[0], f.n[1], f.n[2]);
      out.colors.push(r, g, b);
      out.vertexCount++;
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Build the full mesh from a TilemapData. Skips the sky and bedrock
 * volumes (they'd swallow the viewport — sky we render as a clear
 * colour, bedrock is underwater).
 */
export function buildScene(tilemap) {
  const out = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    vertexCount: 0,
  };

  const { cols, rows } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;

  // Global water surface — a thin slab at sea level, only a thin top
  // visible. We could draw a single quad, but a flat box keeps the code
  // uniform.
  pushBox(out,
    -WORLD_HALF, -WORLD_HALF, SEA_LEVEL_Z - 1,
     WORLD_HALF,  WORLD_HALF, SEA_LEVEL_Z,
    WATER_COLOR,
  );

  // Terrain cells + objects.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const h = tilemap.heights[i];
      if (h < SEA_LEVEL_H) continue;

      const x0 = -gridHalfX + col * CELL_SIZE;
      const x1 = x0 + CELL_SIZE;
      const ySouthIdx = (rows - 1) - row;
      const y0 = -gridHalfY + ySouthIdx * CELL_SIZE;
      const y1 = y0 + CELL_SIZE;
      const terrainTopZ = (h + 1) * HEIGHT_UNIT;

      let rgb = DEFAULT_LAND;
      const texIdx = tilemap.textures[i];
      if (texIdx >= 0 && texIdx < PALETTE_RGB.length) rgb = PALETTE_RGB[texIdx];

      // Brighten the colour by height for visual feedback.
      const lift = Math.min(0.25, h * 0.03);
      const rgbLifted = [rgb[0] + lift, rgb[1] + lift, rgb[2] + lift];

      pushBox(out, x0, y0, BEDROCK_TOP_Z, x1, y1, terrainTopZ, rgbLifted);

      // Object on this cell.
      const obj = tilemap.objects?.[i];
      if (obj) {
        const meta = OBJECT_BY_KIND.get(obj.kind);
        if (meta) {
          const inset = (CELL_SIZE * (1 - meta.footprint)) / 2;
          const ox0 = x0 + inset;
          const ox1 = x1 - inset;
          const oy0 = y0 + inset;
          const oy1 = y1 - inset;
          const oz0 = terrainTopZ;
          const oz1 = terrainTopZ + meta.heightU;
          const orgb = OBJECT_RGB.get(obj.kind) ?? DEFAULT_LAND;
          pushBox(out, ox0, oy0, oz0, ox1, oy1, oz1, orgb);
        }
      }
    }
  }

  return {
    positions: new Float32Array(out.positions),
    normals:   new Float32Array(out.normals),
    colors:    new Float32Array(out.colors),
    indices:   new Uint32Array(out.indices),
    vertexCount: out.vertexCount,
    triangleCount: out.indices.length / 3,
    skyColor: SKY_COLOR,
  };
}
