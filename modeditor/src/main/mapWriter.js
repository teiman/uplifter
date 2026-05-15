/**
 * Quake .map writer (Valve 220) for Uplifter tilemaps.
 *
 * World layout:
 *   - Sky box: 4 side walls + ceiling at ±WORLD_HALF, textured 'sky_auto'.
 *   - Bedrock: solid slab below sea level — seals the map to vis, since
 *     water faces are vis-transparent.
 *   - Water: single global brush from bedrock top to SEA_LEVEL_Z, covers
 *     the entire world.
 *   - Land: one box per grid cell with height >= SEA_LEVEL_H. The cell
 *     box spans from BEDROCK_TOP_Z (so the side faces of every land
 *     brush butt against bedrock) up to height * HEIGHT_UNIT.
 *
 * worldspawn keys:
 *   - protocol "666"  → bigcoords; the network protocol needed for
 *                       coordinates beyond ±4096.
 *   - sky "uplifter_blue" → fixed skybox name (the actual skin lives in
 *                       the mod's gfx/env/ folder).
 *   - _sunlight*      → sun config from tilemap.sun.
 *   - wad "..."       → list of WAD paths so qbsp can resolve textures.
 *
 * Compile flags (set in compileTools.js, not here):
 *   qbsp -bsp2 -worldextent 32768 -leaktest
 */

const path = require('node:path');

const { boxBrush } = require('../shared/tileBrushes');
const {
  CELL_SIZE, WORLD_HALF, HEIGHT_UNIT,
  SEA_LEVEL_H, SEA_LEVEL_Z,
  BEDROCK_TOP_Z, BEDROCK_THICKNESS,
  SKY_TOP_Z, SKY_WALL_THICKNESS,
  SKY_TEXTURE, WATER_TEXTURE, BEDROCK_TEXTURE,
  PALETTE, OBJECT_BY_KIND,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
  pickFaceTextures, texturesFor,
} = require('../shared/types');

/** Height of one building storey in Quake units. Matches HEIGHT_UNIT so
 *  buildings stack cleanly with the world's vertical grid. */
const STOREY_HEIGHT = HEIGHT_UNIT;

/** Fixed sky skin name. Resolved by the engine to gfx/env/<name>{bk,dn,...}.tga. */
const SKY_NAME = 'uplifter_blue';

/** Number of cubes from BEDROCK_TOP_Z up to SEA_LEVEL_Z. Used to convert
 *  height-units (where h=0 = sea level) into stack-cube indices (where
 *  k=0 = the lowest cube against bedrock). */
const SEAL_CUBES = -BEDROCK_TOP_Z / HEIGHT_UNIT;

/** Fallback 5-face texture set for cells that have no palette entry but
 *  still emerge (e.g. legacy maps). Picked to keep the cell visible. */
const FALLBACK_BIOME_TEX = texturesFor('tierra');

function biomeTexForPaletteIdx(idx) {
  if (idx < 0 || idx >= PALETTE.length) return null;
  return PALETTE[idx].tex;
}

/**
 * Build the .map text from a TilemapData.
 *
 * @param {Object} args
 * @param {object} args.tilemap
 * @param {string} args.wadKey   semicolon-separated WAD paths for worldspawn "wad"
 * @returns {{text:string, warnings:string[]}}
 */
function buildMapText({ tilemap, wadKey }) {
  const warnings = [];
  const { cols, rows, cellSize, textures, heights, sun } = tilemap;

  // Grid is centred on the world origin. The grid spans gridHalf on each axis;
  // outside the grid, the world is just ocean (the global water brush covers it).
  const gridHalfX = (cols * cellSize) / 2;
  const gridHalfY = (rows * cellSize) / 2;
  if (gridHalfX > WORLD_HALF || gridHalfY > WORLD_HALF) {
    warnings.push(
      `grid ${cols}×${rows} (${gridHalfX*2}×${gridHalfY*2}u) exceeds world ±${WORLD_HALF}`,
    );
  }

  // Play-area extraction (used both by the cell loop later AND by the
  // world box below when strict mode shrinks the seal to the area).
  const pa = tilemap.playArea;
  const restrictArea = !!(pa && pa.restrict);
  const strictArea   = !!(pa && pa.restrict && pa.strict);

  // World box bounds in X/Y. By default they cover the full playable
  // world (±WORLD_HALF). In strict-area mode they shrink to the area's
  // cell rectangle — far fewer big faces for qbsp/vis to process.
  let xMin, xMax, yMin, yMax;
  if (strictArea) {
    xMin = -gridHalfX +  pa.c0       * cellSize;
    xMax = -gridHalfX + (pa.c1 + 1)  * cellSize;
    // Rows flip: row 0 = +Y edge.
    const yIdxSouthOfR1 = (rows - 1) - pa.r1;
    const yIdxNorthOfR0 = (rows - 1) - pa.r0 + 1;
    yMin = -gridHalfY + yIdxSouthOfR1 * cellSize;
    yMax = -gridHalfY + yIdxNorthOfR0 * cellSize;
  } else {
    xMin = -WORLD_HALF; xMax = WORLD_HALF;
    yMin = -WORLD_HALF; yMax = WORLD_HALF;
  }
  const swt = SKY_WALL_THICKNESS;

  const out = [];

  // ---------- worldspawn ----------
  out.push('{');
  out.push('"classname" "worldspawn"');
  out.push(`"wad" "${wadKey}"`);
  out.push(`"sky" "${SKY_NAME}"`);
  // Protocol 666 (bigcoords) — required for coords beyond ±4096.
  out.push('"protocol" "666"');
  // Sun.
  out.push(`"_sunlight" "${sun.intensity}"`);
  out.push(`"_sunlight_mangle" "${sun.mangle}"`);
  out.push(`"_sunlight_color" "${sun.color}"`);
  out.push(`"_sunlight_penumbra" "${sun.penumbra}"`);
  if (sun.sunlight2) out.push(`"_sunlight2" "${sun.sunlight2}"`);
  if (sun.sunlight2Color) out.push(`"_sunlight_color2" "${sun.sunlight2Color}"`);
  out.push('"_dirt" "1"');

  // ---------- sky box ----------
  // 4 walls + ceiling. Sit just outside the playable world so their
  // thickness doesn't bite into ±WORLD_HALF.
  const skyMinZ = BEDROCK_TOP_Z;
  const skyMaxZ = SKY_TOP_Z + swt;

  // West wall (-X).
  out.push(boxBrush(
    { minX: xMin - swt, maxX: xMin, minY: yMin - swt, maxY: yMax + swt,
      minZ: skyMinZ,    maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // East wall (+X).
  out.push(boxBrush(
    { minX: xMax, maxX: xMax + swt, minY: yMin - swt, maxY: yMax + swt,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // South wall (-Y).
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin - swt, maxY: yMin,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // North wall (+Y).
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMax, maxY: yMax + swt,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // Ceiling (+Z).
  out.push(boxBrush(
    { minX: xMin - swt, maxX: xMax + swt,
      minY: yMin - swt, maxY: yMax + swt,
      minZ: SKY_TOP_Z,  maxZ: SKY_TOP_Z + swt },
    SKY_TEXTURE,
  ));

  // ---------- bedrock ----------
  // Solid slab below water — vis-opaque, seals the map from below.
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax,
      minZ: BEDROCK_TOP_Z - BEDROCK_THICKNESS, maxZ: BEDROCK_TOP_Z },
    BEDROCK_TEXTURE,
  ));

  // ---------- water (global) ----------
  // One brush from bedrock top up to sea level, covering the (possibly
  // strict-shrunk) world box. Liquid texture (prefix '*') makes qbsp
  // emit warpsurface faces. The water surface sits WATER_DROP units
  // below SEA_LEVEL_Z so beach tiles (h=0, top at SEA_LEVEL_Z) read as
  // a slight shoreline instead of coplanar — both better visually and
  // required for qbsp to avoid coplanar-face problems.
  const WATER_DROP = 8;
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax,
      minZ: BEDROCK_TOP_Z, maxZ: SEA_LEVEL_Z - WATER_DROP },
    WATER_TEXTURE,
  ));

  // ---------- terrain cells + objects ----------
  // Cell (col, row) maps to world XY centred on origin.
  //   x0 = -gridHalfX + col * cellSize
  //   row 0 is the NORTH edge (largest Y). Flip:
  //   ySouthIdx = (rows - 1) - row
  //   y0 = -gridHalfY + ySouthIdx * cellSize
  //
  // Only emerged cells (height >= SEA_LEVEL_H) emit a terrain brush.
  // Submerged cells are covered by the global water brush.
  // Objects sit on top of the cell's terrain.
  let landCount = 0;
  let untexturedLand = 0;
  // Non-sealing brushes (terrain cells, low buildings, props) go in a
  // single func_detail at the end. func_detail brushes don't participate
  // in vis, which speeds compilation a lot on big outdoor maps. Only
  // brushes that actually seal the map (sky walls/ceiling, bedrock, the
  // global water brush, and skyscrapers reaching the sky) stay in
  // worldspawn.
  const detailBrushes = [];
  // Collected light entities from object placements (e.g. lamps). Emitted
  // after worldspawn so they live in their own `{ classname light }` blocks.
  const pendingLights = [];

  // Optional play area: when defined AND `restrict` is true, only emit
  // cells whose (col, row) falls inside the rectangle. Cells outside
  // become plain ocean (covered by the global water brush).
  // pa / restrictArea are already declared up top (the world box also
  // needs them for the strict-shrink case).
  const inArea = restrictArea
    ? (col, row) => (col >= pa.c0 && col <= pa.c1 && row >= pa.r0 && row <= pa.r1)
    : () => true;

  // Helper: tallest neighbour terrain height (above sea level), in
  // height-units. Submerged neighbours don't contribute. Falls back to
  // SEA_LEVEL_H when all neighbours are below water — keeps the column
  // "base" at the first cube above sea level in that case.
  function neighbourMaxH(col, row) {
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

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const h = heights[i];
      if (h < SEA_LEVEL_H) continue;
      if (!inArea(col, row)) continue;

      const texIdx = textures[i];
      let terrainBiomeTex = biomeTexForPaletteIdx(texIdx);
      if (!terrainBiomeTex) {
        terrainBiomeTex = FALLBACK_BIOME_TEX;
        untexturedLand++;
      }

      // Object on this cell: buildings extend the column stack; small
      // decorative objects (lamp, tree, etc.) emit their own brush
      // alongside the terrain column.
      const obj = tilemap.objects?.[i];
      const objMeta = obj ? OBJECT_BY_KIND.get(obj.kind) : null;
      const isBuilding = objMeta && objMeta.isBuilding;
      const buildingBiomeTex = isBuilding ? objMeta.tex : null;
      const isSkyscraper = isBuilding && obj.kind === 'rascacielos';

      const x0 = -gridHalfX + col * cellSize;
      const x1 = x0 + cellSize;
      const ySouthIdx = (rows - 1) - row;
      const y0 = -gridHalfY + ySouthIdx * cellSize;
      const y1 = y0 + cellSize;

      // Building storey count. Skyscrapers reach SKY_TOP_Z exactly; the
      // top storey is widened so the last cube butts the ceiling.
      let buildingStoreys = 0;
      if (isBuilding) {
        if (isSkyscraper) {
          const gap = SKY_TOP_Z - h * HEIGHT_UNIT;
          buildingStoreys = Math.max(1, Math.ceil(gap / STOREY_HEIGHT));
        } else {
          buildingStoreys = Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX,
            (typeof obj.storeys === 'number' ? obj.storeys : HOUSE_STOREYS_MIN)));
        }
      }

      // Stack indexing in cube units, k=0 = lowest cube against bedrock.
      //   terrainCubes  = SEAL_CUBES (sub-water) + h (emerged terrain)
      //   total         = terrainCubes + buildingStoreys
      //   neighborMax_k = SEAL_CUBES + neighbourMaxH(col,row)
      //                   (so the base anchors at the first cube above
      //                    the tallest adjacent terrain)
      const terrainCubes = SEAL_CUBES + h;
      const total = terrainCubes + buildingStoreys;
      const neighborMaxK = SEAL_CUBES + neighbourMaxH(col, row);

      // Building footprint inset (centred in the cell). Terrain cubes
      // always fill the full cell.
      const inset = isBuilding ? (cellSize * (1 - objMeta.footprint)) / 2 : 0;
      const bx0 = x0 + inset, bx1 = x1 - inset;
      const by0 = y0 + inset, by1 = y1 - inset;

      for (let k = 0; k < total; k++) {
        const isTerrainCube = k < terrainCubes;
        const biomeTex = isTerrainCube ? terrainBiomeTex : buildingBiomeTex;
        const faces = pickFaceTextures(k, total, neighborMaxK, biomeTex);
        // Default occluded faces to side — keeps face data clean even
        // if qbsp inspects the brush before culling.
        const sideTex   = faces.side;
        const topTex    = faces.top    ?? sideTex;
        const bottomTex = faces.bottom ?? sideTex;

        const cubeMinZ = BEDROCK_TOP_Z + k * HEIGHT_UNIT;
        // Skyscraper top cube extends to SKY_TOP_Z exactly so it seals
        // the world ceiling.
        const isSkyscraperTop = isSkyscraper && (k === total - 1);
        const cubeMaxZ = isSkyscraperTop ? SKY_TOP_Z : cubeMinZ + HEIGHT_UNIT;

        // Terrain cubes fill the full cell; building cubes use the
        // building's footprint inset.
        const useBuildingFootprint = !isTerrainCube && inset > 0;
        const cx0 = useBuildingFootprint ? bx0 : x0;
        const cx1 = useBuildingFootprint ? bx1 : x1;
        const cy0 = useBuildingFootprint ? by0 : y0;
        const cy1 = useBuildingFootprint ? by1 : y1;

        const brush = boxBrush(
          { minX: cx0, maxX: cx1, minY: cy0, maxY: cy1,
            minZ: cubeMinZ, maxZ: cubeMaxZ },
          sideTex,
          { topTex, sideTex, bottomTex },
        );
        // Skyscraper top cube seals the sky → worldspawn. Everything
        // else (terrain, houses, lower skyscraper cubes) is non-sealing
        // and goes into func_detail.
        if (isSkyscraperTop) out.push(brush);
        else                 detailBrushes.push(brush);
      }
      landCount++;

      // Small decorative objects (lamp, tree, bush, rock): single brush
      // on top of the terrain, plus optional point light.
      if (objMeta && !isBuilding) {
        const decoInset = (cellSize * (1 - objMeta.footprint)) / 2;
        const ox0 = x0 + decoInset, ox1 = x1 - decoInset;
        const oy0 = y0 + decoInset, oy1 = y1 - decoInset;
        const terrainTopZ = h * HEIGHT_UNIT;
        const oz0 = terrainTopZ;
        const oz1 = terrainTopZ + objMeta.heightU;
        detailBrushes.push(boxBrush(
          { minX: ox0, maxX: ox1, minY: oy0, maxY: oy1, minZ: oz0, maxZ: oz1 },
          objMeta.tex,
        ));
        if (objMeta.light) {
          const cx = (ox0 + ox1) / 2;
          const cy = (oy0 + oy1) / 2;
          const lz = terrainTopZ + objMeta.light.offsetZ;
          pendingLights.push({
            x: cx, y: cy, z: lz,
            intensity: objMeta.light.intensity,
            color: objMeta.light.color,
          });
        }
      }
    }
  }
  if (untexturedLand > 0) {
    warnings.push(`${untexturedLand} emerged cells had no texture — defaulted to 'tierra' biome`);
  }
  if (landCount === 0) {
    warnings.push('no land cells emerged — map is pure ocean');
  }

  out.push('}');  // close worldspawn

  // ---------- func_detail: non-sealing geometry ----------
  // One func_detail entity for everything that doesn't seal the world.
  // qbsp treats this as worldspawn for rendering/collision but skips it
  // during vis portal computation, which is a big speedup on outdoor
  // maps with hundreds of small terrain brushes.
  if (detailBrushes.length > 0) {
    out.push('{');
    out.push('"classname" "func_detail"');
    for (const b of detailBrushes) out.push(b);
    out.push('}');
  }

  // ---------- point lights from object placements ----------
  for (const L of pendingLights) {
    out.push('{');
    out.push('"classname" "light"');
    out.push(`"origin" "${Math.round(L.x)} ${Math.round(L.y)} ${Math.round(L.z)}"`);
    out.push(`"light" "${L.intensity}"`);
    if (L.color) out.push(`"_color" "${L.color}"`);
    out.push('}');
  }

  // ---------- info_player_start ----------
  // Spawn the player at mid-ceiling above the chosen cell — the pilot
  // starts airborne (AirQuake style). If z is unset (the usual case
  // when placed via the 2D editor's spawn brush), derive it from the
  // playable vertical range.
  //
  // Area restriction: when the play area is active and the user's spawn
  // sits outside it (or there's no spawn at all), the writer drops a
  // temporary spawn at the centre of the area, 4 cells above the cell's
  // terrain height (or 4 cells above sea level if the centre is
  // submerged).
  const defaultZ = Math.round((SEA_LEVEL_Z + SKY_TOP_Z) / 2);
  let sx, sy, sz, sa;
  const userSpawn = tilemap.spawn;
  const userSpawnInArea = userSpawn && typeof userSpawn.col === 'number'
    && inArea(userSpawn.col, userSpawn.row);

  if (restrictArea && !userSpawnInArea) {
    const cCenter = Math.round((pa.c0 + pa.c1) / 2);
    const rCenter = Math.round((pa.r0 + pa.r1) / 2);
    const idx = rCenter * cols + cCenter;
    const hCenter = heights[idx];
    const baseZ = (hCenter >= SEA_LEVEL_H) ? hCenter * HEIGHT_UNIT : SEA_LEVEL_Z;
    sx = -gridHalfX + cCenter * cellSize + cellSize / 2;
    const ySouthIdx = (rows - 1) - rCenter;
    sy = -gridHalfY + ySouthIdx * cellSize + cellSize / 2;
    sz = baseZ + 4 * HEIGHT_UNIT;
    sa = 0;
    warnings.push('spawn was outside the play area — placed a temporary spawn at the area centre');
  } else {
    const spawnInput = userSpawn ?? { x: 0, y: 0, z: defaultZ, angle: 0 };
    sx = spawnInput.x ?? 0;
    sy = spawnInput.y ?? 0;
    sz = (spawnInput.z == null) ? defaultZ : spawnInput.z;
    sa = spawnInput.angle ?? 0;
  }
  out.push('{');
  out.push('"classname" "info_player_start"');
  out.push(`"origin" "${Math.round(sx)} ${Math.round(sy)} ${Math.round(sz)}"`);
  out.push(`"angle" "${sa}"`);
  out.push('}');

  return { text: out.join('\n') + '\n', warnings };
}

/** Build the worldspawn `wad` value from absolute WAD paths. qbsp accepts
 *  forward slashes; on Windows we normalise to avoid \ escapes biting. */
function wadKeyFromPaths(absPaths) {
  return (absPaths ?? []).map(p => p.replace(/\\/g, '/')).join(';');
}

module.exports = { buildMapText, wadKeyFromPaths };
