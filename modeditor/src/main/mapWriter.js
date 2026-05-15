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
 * @returns {{text:string, warnings:string[], info:string[]}}
 *   - warnings  things that may make the map look wrong (missing
 *               textures, pure-ocean output, …)
 *   - info      neutral progress/optimisation stats (brush counts,
 *               cell counts, etc.) — separated so the compile-log
 *               viewer doesn't flag them as WARNING.
 */
function buildMapText({ tilemap, wadKey }) {
  const warnings = [];
  const info = [];
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
  // Counters for the compile-log summary. runsBeforeMesh totals every
  // vertical run produced by optimisation A; bucketRuns is the subset
  // that entered the greedy-mesh pass (opt-B). The greedy pass collapses
  // those into meshBrushes, so opt-B saved (bucketRuns − meshBrushes)
  // brushes on top of opt-A.
  let runsBeforeMesh = 0;
  let bucketRuns = 0;
  // Optimisation B (greedy mesh 2D). Each vertical run that fills its
  // cell footprint goes into a bucket keyed by its texture/Z signature.
  // After the cell loop we walk each bucket and emit one brush per
  // maximal rectangle of cells contributing to it. Building runs with
  // an inset and sealing runs (skyscraper top) skip this — they go
  // straight to detailBrushes / worldspawn.
  //
  // bucket.cellMask is a Uint8Array(cols*rows): 1 if the cell at
  // (col,row) is unclaimed and contributes this signature.
  const meshBuckets = new Map();
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
      const isSkyscraper = isBuilding && obj.kind === 'tower';

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

      // Vertical run accumulator. Coalesces consecutive cubes of the
      // column into a single taller brush when they share the same
      // sideTex AND the boundary between them is occluded (top of the
      // earlier cube + bottom of the later cube are both hidden by
      // the contact). Cuts a typical column of 12 cubes down to 2–4
      // runs: SEAL + (BASE) + SIDE-RUN + CAPITAL/TOP. The
      // skyscraper top cube is always its own run because it goes to
      // worldspawn (sealing) while everything else goes to func_detail.
      //
      // Runs that fill the cell footprint (i.e. terrain, or buildings
      // with footprint=1) are buffered into meshBuckets so the greedy
      // 2D pass at the end can merge identical runs across adjacent
      // cells. Sealing runs and inset-building runs sidestep the mesh
      // and emit immediately.
      let run = null;
      function emitRun(r) {
        if (!r) return;
        runsBeforeMesh++;
        const fillsCell = r.x0 === x0 && r.x1 === x1
                       && r.y0 === y0 && r.y1 === y1;
        if (r.sealing || !fillsCell) {
          const sideTex   = r.sideTex;
          const topTex    = r.topTex    ?? sideTex;
          const bottomTex = r.bottomTex ?? sideTex;
          const brush = boxBrush(
            { minX: r.x0, maxX: r.x1, minY: r.y0, maxY: r.y1,
              minZ: r.minZ, maxZ: r.maxZ },
            sideTex,
            { topTex, sideTex, bottomTex },
          );
          if (r.sealing) out.push(brush);
          else           detailBrushes.push(brush);
          return;
        }
        // Cell-filling, non-sealing → defer to the greedy pass.
        bucketRuns++;
        const key = `${r.minZ}|${r.maxZ}|${r.sideTex}|${r.topTex ?? ''}|${r.bottomTex ?? ''}`;
        let bucket = meshBuckets.get(key);
        if (!bucket) {
          bucket = {
            minZ: r.minZ, maxZ: r.maxZ,
            sideTex: r.sideTex,
            topTex: r.topTex, bottomTex: r.bottomTex,
            cellMask: new Uint8Array(cols * rows),
          };
          meshBuckets.set(key, bucket);
        }
        bucket.cellMask[row * cols + col] = 1;
      }
      for (let k = 0; k < total; k++) {
        const isTerrainCube = k < terrainCubes;
        const biomeTex = isTerrainCube ? terrainBiomeTex : buildingBiomeTex;
        const faces = pickFaceTextures(k, total, neighborMaxK, biomeTex);

        const cubeMinZ = BEDROCK_TOP_Z + k * HEIGHT_UNIT;
        const isSkyscraperTop = isSkyscraper && (k === total - 1);
        const cubeMaxZ = isSkyscraperTop ? SKY_TOP_Z : cubeMinZ + HEIGHT_UNIT;

        const useBuildingFootprint = !isTerrainCube && inset > 0;
        const cx0 = useBuildingFootprint ? bx0 : x0;
        const cx1 = useBuildingFootprint ? bx1 : x1;
        const cy0 = useBuildingFootprint ? by0 : y0;
        const cy1 = useBuildingFootprint ? by1 : y1;

        // Can we stretch the previous run to include this cube? Need
        // matching footprint + same sideTex + the boundary between
        // them must be hidden on both sides (run's top was null AND
        // this cube's bottom is null), AND neither end is the special
        // sky-sealing brush (those must stay alone so they reach
        // worldspawn).
        const canExtend = run
          && run.x0 === cx0 && run.x1 === cx1
          && run.y0 === cy0 && run.y1 === cy1
          && run.sideTex === faces.side
          && run.topTex === null
          && faces.bottom === null
          && !run.sealing
          && !isSkyscraperTop;

        if (canExtend) {
          run.maxZ   = cubeMaxZ;
          run.topTex = faces.top;
        } else {
          emitRun(run);
          run = {
            x0: cx0, x1: cx1, y0: cy0, y1: cy1,
            minZ: cubeMinZ, maxZ: cubeMaxZ,
            sideTex: faces.side,
            topTex: faces.top,
            bottomTex: faces.bottom,
            sealing: isSkyscraperTop,
          };
        }
      }
      emitRun(run);
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

  // ---------- Optimisation B: greedy 2D rectangle pass ----------
  // For each bucket of runs that share an exact texture/Z signature,
  // walk the cell mask and emit one brush per maximal rectangle of
  // contributing cells. Cells get cleared as they're consumed so each
  // is covered by exactly one rect.
  //
  // The mesh runs across the whole tilemap regardless of playArea
  // because the inArea filter already excluded outside cells from
  // contributing to the masks during the main loop.
  let meshBrushes = 0;
  for (const bucket of meshBuckets.values()) {
    const { minZ, maxZ, sideTex, topTex, bottomTex, cellMask } = bucket;
    const tEx = topTex    ?? sideTex;
    const bEx = bottomTex ?? sideTex;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!cellMask[r * cols + c]) continue;
        // Grow right as far as the mask stays set on this row.
        let c1 = c;
        while (c1 + 1 < cols && cellMask[r * cols + (c1 + 1)]) c1++;
        // Grow down as far as the rows c..c1 stay fully covered.
        let r1 = r;
        outer: while (r1 + 1 < rows) {
          for (let cc = c; cc <= c1; cc++) {
            if (!cellMask[(r1 + 1) * cols + cc]) break outer;
          }
          r1++;
        }
        // Convert cell rectangle to world AABB. Row 0 is the NORTH
        // edge so the rows flip in Y just like the per-cell case.
        const rx0 = -gridHalfX + c * cellSize;
        const rx1 = -gridHalfX + (c1 + 1) * cellSize;
        const ySouthLow  = (rows - 1) - r1;
        const ySouthHigh = (rows - 1) - r;
        const ry0 = -gridHalfY + ySouthLow * cellSize;
        const ry1 = -gridHalfY + (ySouthHigh + 1) * cellSize;
        detailBrushes.push(boxBrush(
          { minX: rx0, maxX: rx1, minY: ry0, maxY: ry1,
            minZ, maxZ },
          sideTex,
          { topTex: tEx, sideTex, bottomTex: bEx },
        ));
        meshBrushes++;
        // Clear all cells in this rectangle.
        for (let rr = r; rr <= r1; rr++) {
          for (let cc = c; cc <= c1; cc++) {
            cellMask[rr * cols + cc] = 0;
          }
        }
      }
    }
  }
  const optBSaved = bucketRuns - meshBrushes;
  info.push(`geometry: ${landCount} cells emerged`);
  info.push(`opt-A (vertical merge): collapsed to ${runsBeforeMesh} runs`);
  info.push(`opt-B (greedy mesh):    ${bucketRuns} runs → ${meshBrushes} rects (saved ${optBSaved})`);
  info.push(`func_detail brushes:    ${detailBrushes.length}`);

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

  return { text: out.join('\n') + '\n', warnings, info };
}

/** Build the worldspawn `wad` value from absolute WAD paths. qbsp accepts
 *  forward slashes; on Windows we normalise to avoid \ escapes biting. */
function wadKeyFromPaths(absPaths) {
  return (absPaths ?? []).map(p => p.replace(/\\/g, '/')).join(';');
}

module.exports = { buildMapText, wadKeyFromPaths };
