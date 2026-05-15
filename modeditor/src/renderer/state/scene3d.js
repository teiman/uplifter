/**
 * Build flat meshes (positions, normals, colours) from a TilemapData for
 * the 3D viewport. The world is split into MESH_CHUNK_SIZE-sided chunks
 * so editing a cell only rebuilds its chunk, not the whole world. The
 * global water plane lives in its own one-off mesh.
 *
 * Coordinate convention matches the .map writer:
 *   - X/Y: world units, grid centred on origin.
 *   - Z: up. Sea level at SEA_LEVEL_Z = 0. Bedrock at BEDROCK_TOP_Z = -128.
 *   - Row 0 maps to the NORTH edge (largest +Y).
 *
 * Mesh buffers per chunk / water:
 *   positions: Float32Array  (3 * vertexCount)
 *   normals:   Float32Array  (3 * vertexCount)
 *   colors:    Float32Array  (3 * vertexCount, in 0..1 range)
 *   indices:   Uint32Array
 *
 * Vertex count is 24 per box (6 faces × 4 corners) so each face has its
 * own normal & colour. Indices are 36 per box.
 */

import {
  CELL_SIZE, HEIGHT_UNIT, WORLD_HALF, SEA_LEVEL_H, SEA_LEVEL_Z,
  BEDROCK_TOP_Z, SKY_TOP_Z,
  PALETTE, OBJECT_BY_KIND,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
  MESH_CHUNK_SIZE,
} from '../../shared/types.mjs';

const WALL_GROUND_RGB = [0.65, 0.50, 0.32];
const WALL_UPPER_RGB  = [0.55, 0.55, 0.62];
const ROOF_METAL_RGB  = [0.42, 0.42, 0.46];

export const SKY_COLOR = [0.47, 0.71, 0.90];
const WATER_COLOR    = [0.18, 0.40, 0.62];
const DEFAULT_LAND   = [0.36, 0.30, 0.20];

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

const PALETTE_RGB = PALETTE.map(p => hexToRgb(p.color));
const OBJECT_RGB = new Map();
for (const [k, o] of OBJECT_BY_KIND) OBJECT_RGB.set(k, hexToRgb(o.color));

/** Mutable builder accumulator; finalise() converts to typed arrays. */
function makeBuilder() {
  return { positions: [], normals: [], colors: [], indices: [], vertexCount: 0 };
}
function finaliseBuilder(b) {
  return {
    positions: new Float32Array(b.positions),
    normals:   new Float32Array(b.normals),
    colors:    new Float32Array(b.colors),
    indices:   new Uint32Array(b.indices),
    vertexCount: b.vertexCount,
    triangleCount: b.indices.length / 3,
  };
}

function pushBox(out, x0, y0, z0, x1, y1, z1, rgb) {
  const [r, g, b] = rgb;
  const faces = [
    { p: [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], n: [ 1, 0, 0] },
    { p: [[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]], n: [-1, 0, 0] },
    { p: [[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1]], n: [ 0, 1, 0] },
    { p: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], n: [ 0,-1, 0] },
    { p: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [ 0, 0, 1] },
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
 * Emit the terrain + object geometry for cell (col, row) into the
 * builder. No-op for submerged cells.
 */
function addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY) {
  const i = row * tilemap.cols + col;
  const h = tilemap.heights[i];
  if (h < SEA_LEVEL_H) return;

  const x0 = -gridHalfX + col * CELL_SIZE;
  const x1 = x0 + CELL_SIZE;
  const ySouthIdx = (tilemap.rows - 1) - row;
  const y0 = -gridHalfY + ySouthIdx * CELL_SIZE;
  const y1 = y0 + CELL_SIZE;
  const terrainTopZ = h * HEIGHT_UNIT;

  let rgb = DEFAULT_LAND;
  const texIdx = tilemap.textures[i];
  if (texIdx >= 0 && texIdx < PALETTE_RGB.length) rgb = PALETTE_RGB[texIdx];
  const lift = Math.min(0.25, h * 0.03);
  const rgbLifted = [rgb[0] + lift, rgb[1] + lift, rgb[2] + lift];

  pushBox(out, x0, y0, BEDROCK_TOP_Z, x1, y1, terrainTopZ, rgbLifted);

  const obj = tilemap.objects?.[i];
  if (!obj) return;
  const meta = OBJECT_BY_KIND.get(obj.kind);
  if (!meta) return;

  const inset = (CELL_SIZE * (1 - meta.footprint)) / 2;
  const ox0 = x0 + inset;
  const ox1 = x1 - inset;
  const oy0 = y0 + inset;
  const oy1 = y1 - inset;

  if (obj.kind === 'casa' || obj.kind === 'rascacielos') {
    const isSkyscraper = obj.kind === 'rascacielos';
    const storeys = isSkyscraper
      ? Math.max(1, Math.ceil((SKY_TOP_Z - terrainTopZ) / HEIGHT_UNIT))
      : Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX,
          (typeof obj.storeys === 'number' ? obj.storeys : HOUSE_STOREYS_MIN)));
    for (let s = 0; s < storeys; s++) {
      const sz0 = terrainTopZ + s * HEIGHT_UNIT;
      const sz1 = (isSkyscraper && s === storeys - 1)
        ? SKY_TOP_Z
        : sz0 + HEIGHT_UNIT;
      const isTop = s === storeys - 1;
      const sRgb = (s === 0) ? WALL_GROUND_RGB
                 : isTop      ? ROOF_METAL_RGB
                 :              WALL_UPPER_RGB;
      pushBox(out, ox0, oy0, sz0, ox1, oy1, sz1, sRgb);
    }
  } else {
    const oz0 = terrainTopZ;
    const oz1 = terrainTopZ + meta.heightU;
    const orgb = OBJECT_RGB.get(obj.kind) ?? DEFAULT_LAND;
    pushBox(out, ox0, oy0, oz0, ox1, oy1, oz1, orgb);
  }
}

/** ----- Chunk-based API ----- */

/** How many chunks per axis for a given tilemap. */
export function chunkCounts(tilemap) {
  return {
    cx: Math.ceil(tilemap.cols / MESH_CHUNK_SIZE),
    cy: Math.ceil(tilemap.rows / MESH_CHUNK_SIZE),
  };
}

/** Chunk key for (col, row) cell. */
export function chunkKeyForCell(col, row) {
  return ((row / MESH_CHUNK_SIZE) | 0) * 100000 + ((col / MESH_CHUNK_SIZE) | 0);
}

/** Chunk index → mesh of just that chunk's cells. When the tilemap has
 *  a playArea set, cells outside it are skipped so the 3D viewport
 *  shows only the selected region — matches the compile-time filter. */
export function buildChunk(tilemap, chunkCol, chunkRow) {
  const out = makeBuilder();
  const { cols, rows } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  const col0 = chunkCol * MESH_CHUNK_SIZE;
  const row0 = chunkRow * MESH_CHUNK_SIZE;
  const col1 = Math.min(cols, col0 + MESH_CHUNK_SIZE);
  const row1 = Math.min(rows, row0 + MESH_CHUNK_SIZE);
  const pa = tilemap.playArea;
  for (let row = row0; row < row1; row++) {
    if (pa && (row < pa.r0 || row > pa.r1)) continue;
    for (let col = col0; col < col1; col++) {
      if (pa && (col < pa.c0 || col > pa.c1)) continue;
      addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY);
    }
  }
  return finaliseBuilder(out);
}

/** Water surface plane. When a playArea is set, the plane shrinks to
 *  match — otherwise the user would see ocean stretching beyond the
 *  selected region in the iso view. */
export function buildWater(tilemap) {
  const out = makeBuilder();
  const WATER_DROP = 8;
  const { cols, rows, playArea } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  let x0, y0, x1, y1;
  if (playArea) {
    x0 = -gridHalfX + playArea.c0 * CELL_SIZE;
    x1 = -gridHalfX + (playArea.c1 + 1) * CELL_SIZE;
    // Row 0 = north (+Y max); convert to ySouthIdx range.
    const ySouth0 = (rows - 1) - playArea.r1;
    const ySouth1 = (rows - 1) - playArea.r0;
    y0 = -gridHalfY + ySouth0 * CELL_SIZE;
    y1 = -gridHalfY + (ySouth1 + 1) * CELL_SIZE;
  } else {
    x0 = -WORLD_HALF; y0 = -WORLD_HALF;
    x1 =  WORLD_HALF; y1 =  WORLD_HALF;
  }
  pushBox(out,
    x0, y0, SEA_LEVEL_Z - WATER_DROP - 1,
    x1, y1, SEA_LEVEL_Z - WATER_DROP,
    WATER_COLOR,
  );
  return finaliseBuilder(out);
}

/** ----- Legacy whole-scene builder (kept for callers that want a single
 *  draw call). Not used by Viewport3D anymore. ----- */
export function buildScene(tilemap) {
  const out = makeBuilder();
  const { cols, rows } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  const WATER_DROP = 8;
  pushBox(out,
    -WORLD_HALF, -WORLD_HALF, SEA_LEVEL_Z - WATER_DROP - 1,
     WORLD_HALF,  WORLD_HALF, SEA_LEVEL_Z - WATER_DROP,
    WATER_COLOR,
  );
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY);
    }
  }
  const m = finaliseBuilder(out);
  return { ...m, skyColor: SKY_COLOR };
}
