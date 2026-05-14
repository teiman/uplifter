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
} = require('../shared/types');

/** Fixed sky skin name. Resolved by the engine to gfx/env/<name>{bk,dn,...}.tga. */
const SKY_NAME = 'uplifter_blue';

function texForPaletteIdx(idx) {
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

  // World box. Sky walls/ceiling and bedrock are at ±WORLD_HALF, regardless of grid size.
  const wmin = -WORLD_HALF;
  const wmax =  WORLD_HALF;
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
    { minX: wmin - swt, maxX: wmin, minY: wmin - swt, maxY: wmax + swt,
      minZ: skyMinZ,    maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // East wall (+X).
  out.push(boxBrush(
    { minX: wmax, maxX: wmax + swt, minY: wmin - swt, maxY: wmax + swt,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // South wall (-Y).
  out.push(boxBrush(
    { minX: wmin, maxX: wmax, minY: wmin - swt, maxY: wmin,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // North wall (+Y).
  out.push(boxBrush(
    { minX: wmin, maxX: wmax, minY: wmax, maxY: wmax + swt,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // Ceiling (+Z).
  out.push(boxBrush(
    { minX: wmin - swt, maxX: wmax + swt,
      minY: wmin - swt, maxY: wmax + swt,
      minZ: SKY_TOP_Z,  maxZ: SKY_TOP_Z + swt },
    SKY_TEXTURE,
  ));

  // ---------- bedrock ----------
  // Solid slab below water — vis-opaque, seals the map from below.
  out.push(boxBrush(
    { minX: wmin, maxX: wmax, minY: wmin, maxY: wmax,
      minZ: BEDROCK_TOP_Z - BEDROCK_THICKNESS, maxZ: BEDROCK_TOP_Z },
    BEDROCK_TEXTURE,
  ));

  // ---------- water (global) ----------
  // One brush from bedrock top up to sea level, covering the whole world.
  // Liquid texture (prefix '*') makes qbsp emit warpsurface faces.
  // The water surface sits WATER_DROP units below SEA_LEVEL_Z so beach
  // tiles (h=0, top at SEA_LEVEL_Z) read as a slight shoreline instead
  // of coplanar with the water — both better visually and required for
  // qbsp to avoid coplanar-face problems.
  const WATER_DROP = 8;
  out.push(boxBrush(
    { minX: wmin, maxX: wmax, minY: wmin, maxY: wmax,
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
  // Collected light entities from object placements (e.g. lamps). Emitted
  // after worldspawn so they live in their own `{ classname light }` blocks.
  const pendingLights = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const h = heights[i];
      if (h < SEA_LEVEL_H) continue;

      const texIdx = textures[i];
      let tex = texForPaletteIdx(texIdx);
      if (!tex || tex === WATER_TEXTURE) {
        tex = BEDROCK_TEXTURE;
        untexturedLand++;
      }

      const x0 = -gridHalfX + col * cellSize;
      const x1 = x0 + cellSize;
      const ySouthIdx = (rows - 1) - row;
      const y0 = -gridHalfY + ySouthIdx * cellSize;
      const y1 = y0 + cellSize;
      // Cell box: from bedrock top up to h*HEIGHT_UNIT. h=0 → top sits
      // at exactly SEA_LEVEL_Z (= 0) so the terrain is flush with the
      // water surface — what reads as a beach. h=1 → one cube above sea
      // level, and so on. h=-1 (the default) is submerged, no brush.
      const terrainMaxZ = h * HEIGHT_UNIT;
      out.push(boxBrush(
        { minX: x0, maxX: x1, minY: y0, maxY: y1,
          minZ: BEDROCK_TOP_Z, maxZ: terrainMaxZ },
        tex,
      ));
      landCount++;

      // ---- object on this cell ----
      const obj = tilemap.objects?.[i];
      if (obj) {
        const meta = OBJECT_BY_KIND.get(obj.kind);
        if (meta) {
          // Inset from cell edges proportional to footprint.
          // footprint=1 → fills the cell; footprint=0.5 → half-cell box centred.
          const inset = (cellSize * (1 - meta.footprint)) / 2;
          const ox0 = x0 + inset;
          const ox1 = x1 - inset;
          const oy0 = y0 + inset;
          const oy1 = y1 - inset;
          const oz0 = terrainMaxZ;
          const oz1 = terrainMaxZ + meta.heightU;
          out.push(boxBrush(
            { minX: ox0, maxX: ox1, minY: oy0, maxY: oy1,
              minZ: oz0, maxZ: oz1 },
            meta.tex,
          ));
          // Optional point light (lamp).
          if (meta.light) {
            const cx = (ox0 + ox1) / 2;
            const cy = (oy0 + oy1) / 2;
            const lz = terrainMaxZ + meta.light.offsetZ;
            pendingLights.push({
              x: cx, y: cy, z: lz,
              intensity: meta.light.intensity,
              color: meta.light.color,
            });
          }
        }
      }
    }
  }
  if (untexturedLand > 0) {
    warnings.push(`${untexturedLand} emerged cells had no texture — defaulted to '${BEDROCK_TEXTURE}'`);
  }
  if (landCount === 0) {
    warnings.push('no land cells emerged — map is pure ocean');
  }

  out.push('}');  // close worldspawn

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
  // Spawn the player above the centre of the map, at mid-ceiling. The
  // pilot starts airborne (AirQuake style — helicopter).
  const spawn = tilemap.spawn ?? {
    x: 0, y: 0,
    z: Math.round((SEA_LEVEL_Z + SKY_TOP_Z) / 2),
    angle: 0,
  };
  out.push('{');
  out.push('"classname" "info_player_start"');
  out.push(`"origin" "${spawn.x} ${spawn.y} ${spawn.z}"`);
  out.push(`"angle" "${spawn.angle}"`);
  out.push('}');

  return { text: out.join('\n') + '\n', warnings };
}

/** Build the worldspawn `wad` value from absolute WAD paths. qbsp accepts
 *  forward slashes; on Windows we normalise to avoid \ escapes biting. */
function wadKeyFromPaths(absPaths) {
  return (absPaths ?? []).map(p => p.replace(/\\/g, '/')).join(';');
}

module.exports = { buildMapText, wadKeyFromPaths };
