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
  pickFaceTextures,
} from '../../shared/types.mjs';

export const SKY_COLOR = [0.47, 0.71, 0.90];
const WATER_COLOR    = [0.18, 0.40, 0.62];
const DEFAULT_LAND   = [0.36, 0.30, 0.20];

/** Number of cubes from BEDROCK_TOP_Z up to SEA_LEVEL_Z. Mirrors the
 *  constant used in mapWriter so the stack-cube indexing is identical. */
const SEAL_CUBES = -BEDROCK_TOP_Z / HEIGHT_UNIT;

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function scaleRgb(rgb, k) {
  return [
    Math.min(1, rgb[0] * k),
    Math.min(1, rgb[1] * k),
    Math.min(1, rgb[2] * k),
  ];
}

/** Derive the 5 face colours for a biome from its base hex. The
 *  multipliers mirror the visual hierarchy described in column.md:
 *  capital lighter, base/side a touch darker, bottom very dark
 *  (rarely seen). The 3D preview is flat-shaded; these tints are the
 *  only cue distinguishing the parts of a column. */
function biomeColorsFromHex(hex) {
  const base = hexToRgb(hex);
  return {
    top:     base,
    side:    scaleRgb(base, 0.85),
    capital: scaleRgb(base, 1.18),
    base:    scaleRgb(base, 0.92),
    bottom:  scaleRgb(base, 0.55),
  };
}

const PALETTE_COLORS = PALETTE.map(p => biomeColorsFromHex(p.color));
const OBJECT_COLORS = new Map();
for (const [k, o] of OBJECT_BY_KIND) {
  OBJECT_COLORS.set(k, biomeColorsFromHex(o.color));
}
const FALLBACK_COLORS = biomeColorsFromHex('#7a5a3a');

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

/**
 * Push an axis-aligned box's 6 faces.
 *
 *   colors: either a single [r,g,b] (used on every face) OR an object
 *           { top, side, bottom } with one [r,g,b] per face group.
 *           Side colour is shared across the 4 lateral faces.
 */
function pushBox(out, x0, y0, z0, x1, y1, z1, colors) {
  const topRgb    = Array.isArray(colors) ? colors : colors.top    ?? colors.side;
  const sideRgb   = Array.isArray(colors) ? colors : colors.side;
  const bottomRgb = Array.isArray(colors) ? colors : colors.bottom ?? colors.side;
  const faces = [
    { p: [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], n: [ 1, 0, 0], rgb: sideRgb },
    { p: [[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]], n: [-1, 0, 0], rgb: sideRgb },
    { p: [[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1]], n: [ 0, 1, 0], rgb: sideRgb },
    { p: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], n: [ 0,-1, 0], rgb: sideRgb },
    { p: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [ 0, 0, 1], rgb: topRgb },
    { p: [[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]], n: [ 0, 0,-1], rgb: bottomRgb },
  ];
  for (const f of faces) {
    const base = out.vertexCount;
    const [r, g, b] = f.rgb;
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
 * Tallest neighbour terrain height (above sea level) for cell (col,row).
 * Mirrors mapWriter.neighbourMaxH — used to anchor the `base` face.
 */
function neighbourMaxH(tilemap, col, row) {
  const { cols, rows, heights } = tilemap;
  let m = SEA_LEVEL_H;
  const test = (cc, rr) => {
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return;
    const hn = heights[rr * cols + cc];
    if (hn > m) m = hn;
  };
  test(col - 1, row);
  test(col + 1, row);
  test(col, row - 1);
  test(col, row + 1);
  return m;
}

/**
 * Emit one cell's geometry as a vertical column of unit cubes following
 * the column.md spec: bedrock-to-top stack, with face colours picked by
 * cube position (top/side/capital/base/bottom). Submerged cells emit
 * nothing — the global water brush covers them.
 */
function addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY) {
  const i = row * tilemap.cols + col;
  const h = tilemap.heights[i];
  if (h < SEA_LEVEL_H) return;

  const texIdx = tilemap.textures[i];
  const terrainColors = (texIdx >= 0 && texIdx < PALETTE_COLORS.length)
    ? PALETTE_COLORS[texIdx]
    : FALLBACK_COLORS;

  const obj = tilemap.objects?.[i];
  const meta = obj ? OBJECT_BY_KIND.get(obj.kind) : null;
  const isBuilding = meta && meta.isBuilding;
  const buildingColors = isBuilding ? OBJECT_COLORS.get(obj.kind) : null;
  const isSkyscraper = isBuilding && obj.kind === 'rascacielos';

  // Cell footprint in world coords.
  const x0 = -gridHalfX + col * CELL_SIZE;
  const x1 = x0 + CELL_SIZE;
  const ySouthIdx = (tilemap.rows - 1) - row;
  const y0 = -gridHalfY + ySouthIdx * CELL_SIZE;
  const y1 = y0 + CELL_SIZE;

  let buildingStoreys = 0;
  if (isBuilding) {
    if (isSkyscraper) {
      const gap = SKY_TOP_Z - h * HEIGHT_UNIT;
      buildingStoreys = Math.max(1, Math.ceil(gap / HEIGHT_UNIT));
    } else {
      buildingStoreys = Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX,
        (typeof obj.storeys === 'number' ? obj.storeys : HOUSE_STOREYS_MIN)));
    }
  }

  // Stack indexing in cube units, k=0 = lowest cube against bedrock.
  // Keep in lockstep with mapWriter so the .map and the 3D preview
  // match cube for cube.
  const terrainCubes = SEAL_CUBES + h;
  const total = terrainCubes + buildingStoreys;
  const neighborMaxK = SEAL_CUBES + neighbourMaxH(tilemap, col, row);

  const inset = isBuilding ? (CELL_SIZE * (1 - meta.footprint)) / 2 : 0;
  const bx0 = x0 + inset, bx1 = x1 - inset;
  const by0 = y0 + inset, by1 = y1 - inset;

  for (let k = 0; k < total; k++) {
    const isTerrainCube = k < terrainCubes;
    const biomeColors = isTerrainCube ? terrainColors : buildingColors;
    const faces = pickFaceTextures(k, total, neighborMaxK, biomeColors);
    // Default occluded faces to side; the 3D preview never culls so
    // we paint something on every face.
    const sideRgb   = faces.side;
    const topRgb    = faces.top    ?? sideRgb;
    const bottomRgb = faces.bottom ?? sideRgb;

    const cubeMinZ = BEDROCK_TOP_Z + k * HEIGHT_UNIT;
    const isSkyscraperTop = isSkyscraper && (k === total - 1);
    const cubeMaxZ = isSkyscraperTop ? SKY_TOP_Z : cubeMinZ + HEIGHT_UNIT;

    const useBuildingFootprint = !isTerrainCube && inset > 0;
    const cx0 = useBuildingFootprint ? bx0 : x0;
    const cx1 = useBuildingFootprint ? bx1 : x1;
    const cy0 = useBuildingFootprint ? by0 : y0;
    const cy1 = useBuildingFootprint ? by1 : y1;

    pushBox(out, cx0, cy0, cubeMinZ, cx1, cy1, cubeMaxZ,
      { top: topRgb, side: sideRgb, bottom: bottomRgb });
  }

  // Small decorative objects (lamp, tree, bush, rock) sit on top of
  // the terrain column with their own footprint and height. Single
  // box, single colour — they're not columns.
  if (meta && !isBuilding) {
    const decoInset = (CELL_SIZE * (1 - meta.footprint)) / 2;
    const ox0 = x0 + decoInset, ox1 = x1 - decoInset;
    const oy0 = y0 + decoInset, oy1 = y1 - decoInset;
    const terrainTopZ = h * HEIGHT_UNIT;
    const oz0 = terrainTopZ;
    const oz1 = terrainTopZ + meta.heightU;
    const orgb = OBJECT_COLORS.get(obj.kind)?.top ?? DEFAULT_LAND;
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
