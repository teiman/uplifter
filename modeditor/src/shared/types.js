/**
 * Shared types and constants for Uplifter ModEditor.
 *
 * TilemapData is the single source of truth for what gets compiled into
 * the .map (and then .bsp). Both the editor (renderer) and the writer
 * (main) consume this exact structure.
 *
 * Model differs from atlasmapper: each cell has a single texture and a
 * scalar height (no wall layer stack). Walls between cells are derived
 * from neighbouring height deltas at compile time.
 */

const SCHEMA_VERSION = 1;

/** Cell size in Quake units. 64u is one block — matches typical 64×64
 *  texture sizes for 1:1 mapping. */
const CELL_SIZE = 64;

/** Half-extent of the playable world, in Quake units. The world is a
 *  fixed box ±WORLD_HALF in X/Y. With CELL_SIZE = 64 → up to 512×512
 *  cells. See Uplifter.md / ModEditor.md for rationale. */
const WORLD_HALF = 16384;

/** Default grid size for a new map. The grid is centred on the world
 *  origin; the rest of the world (out to ±WORLD_HALF) is automatically
 *  ocean — the global water brush covers it for free.
 *
 *  64×64 cells × 64u = 4096u square — generous for a starter scene,
 *  fast to paint and render in the 2D view. The designer can grow the
 *  grid later if a map needs more land. */
// See types.mjs for the rationale; keep in sync.
const DEFAULT_COLS = 512;
const DEFAULT_ROWS = 512;

/** One height unit in Quake units. baseZ(h) = h * HEIGHT_UNIT. */
const HEIGHT_UNIT = 64;

/** Sea level, in height units. Cells with height < SEA_LEVEL_H are
 *  rendered as water (covered by the global water brush). */
const SEA_LEVEL_H = 0;
/** World Z of the sea surface = SEA_LEVEL_H * HEIGHT_UNIT. */
const SEA_LEVEL_Z = SEA_LEVEL_H * HEIGHT_UNIT;

/** Bedrock: a solid floor below the water that seals the map to vis
 *  (water brushes are transparent to vis — without bedrock the map
 *  would leak from below). BEDROCK_TOP_Z is the top face of the bedrock
 *  = bottom face of the water brush. BEDROCK_THICKNESS is how thick the
 *  slab is. */
const BEDROCK_TOP_Z = -2 * HEIGHT_UNIT;
const BEDROCK_THICKNESS = 64;

/** Sky / ceiling. Vertical room from sea level to the sky ceiling. */
const SKY_HEIGHT = 4096;
const SKY_TOP_Z = SEA_LEVEL_Z + SKY_HEIGHT;
const SKY_WALL_THICKNESS = 64;

/** Volumetric cloud band (see buildCloudVolume in wadWriter + emitClouds
 *  in mapWriter). The sky holds CLOUD_COUNT discrete clouds. Each cloud is
 *  a real 3D density volume (metaball "parcels" + 3D fbm erosion shaped
 *  like a cumulus) sliced into CLOUD_LAYER_COUNT horizontal cross-sections;
 *  every slice is baked to its own fence texture ({cloud_<vol>_<layer>)
 *  and stacked as thin func_detail_illusionary brushes CLOUD_LAYER_SPACING
 *  apart, so the stack reproduces the true 3D shape (each layer is the
 *  actual contour of the volume at that height). No vis/BSP cost; the heli
 *  flies through.
 *
 *    CLOUD_LAYER_Z        : Z the band is centred on.
 *    CLOUD_LAYER_COUNT    : horizontal slices per cloud (vertical res).
 *    CLOUD_LAYER_SPACING  : Z gap between slices.
 *    CLOUD_BRUSH_SIZE     : nominal footprint (full volume Ø) of a cloud.
 *    CLOUD_BRUSH_THICKNESS: slice thickness in Z (> 0 so qbsp accepts it).
 *    CLOUD_VOLUME_COUNT   : distinct cloud shapes generated (reused across
 *                           instances → variety without N×L unique texs).
 *    CLOUD_COUNT          : cloud instances placed in the map.
 *    CLOUD_FIELD_HALF     : XY dispersion half-extent (clamped to world).
 *    CLOUD_TEX_SIZE       : slice texture side, px.
 *
 *  Height: heli max cruise = WATER_Z(-8)+64×32 = 2040 (helo1.qc/weapons.qc).
 *  Centred at 1740 so a cloud's top stays ~1868 < that ceiling — the pilot
 *  can climb above and fire down. Painting: blue-noise dithered edges +
 *  directional sun rim-light. */
const CLOUD_LAYER_Z = 1740;
const CLOUD_LAYER_COUNT = 16;
const CLOUD_LAYER_SPACING = 12;
const CLOUD_BRUSH_SIZE = 1024;
const CLOUD_BRUSH_THICKNESS = 8;
const CLOUD_VOLUME_COUNT = 6;
const CLOUD_COUNT = 32;
const CLOUD_FIELD_HALF = 12000;
const CLOUD_TEX_SIZE = 256;
// Clustering: clouds aren't scattered evenly — they're placed in tight
// clusters so several models overlap and read as one big lumpy cumulus.
const CLOUD_CLUSTERS = 8;            // number of cloud clusters in the sky
const CLOUD_PER_CLUSTER_MIN = 11;    // clouds per cluster (random in [min,max])
const CLOUD_PER_CLUSTER_MAX = 12;
const CLOUD_CLUSTER_RADIUS = 1170;   // XY spread of clouds within a cluster (units).
                                     // > a model's width (~880u) so cluster
                                     // members touch at the edges and read as a
                                     // group, instead of stacking into one dense blob.
// Keep cluster CENTRES apart: each new centre is placed at least a random
// distance in [MIN,MAX] from every already-placed centre (rejection sampling),
// so clusters don't bunch up — gives clear blue sky between cumulus groups.
const CLOUD_CLUSTER_SEP_MIN = 2400;
const CLOUD_CLUSTER_SEP_MAX = 4200;

// Second cloud layer at the SAME altitude: smaller clusters of just 2 clouds,
// interspersed with the big ones to fill the gaps with little cumulus pairs.
const CLOUD2_CLUSTERS = 10;          // number of small (2-cloud) clusters
const CLOUD2_PER_CLUSTER_MIN = 2;
const CLOUD2_PER_CLUSTER_MAX = 2;
const CLOUD2_CLUSTER_RADIUS = 500;   // tight: the 2 clouds clearly overlap into one puff
const CLOUD2_CLUSTER_SEP_MIN = 1800;
const CLOUD2_CLUSTER_SEP_MAX = 3200;

/** Default sun (sunlight in worldspawn). Tweakable from the Light panel. */
const DEFAULT_SUN = {
  intensity: 250,
  mangle: '215 -45 0',
  color: '255 240 200',
  penumbra: 3,
  sunlight2: 80,
  sunlight2Color: '180 210 255',
  // Lightmap floor — see types.mjs.
  minlight: 110,
};

/** Internal textures used by the writer for the world box, not exposed
 *  in the palette. */
const SKY_TEXTURE = 'sky_auto';
const WATER_TEXTURE = '*water';
// Coastal depth banding: four liquid shades, light/shallow near the coast
// (index 0) → dark/deep out to sea (index 3). mapWriter picks one per band
// by distance to the nearest land cell. Defined in auto.wad (wadWriter).
const WATER_SHADES = ['*water1', '*water2', '*water3', '*water4'];
// The bedrock slab is hidden under the water brush; auto_wall always
// exists in auto.wad so the writer can rely on it without the user
// shipping a 'dirt' texture themselves.
const BEDROCK_TEXTURE = 'auto_wall';
// Solid blue texture used by the under-bedrock minimap as a flat "sea"
// (no warp, no transparency — it's a visual reference, not water).
const MINIMAP_SEA_TEXTURE = 'minimap_sea';

/** Minimap area parameters.
 *  The minimap is a 1:1 visual copy of the playable map, sitting in its
 *  own sealed capsule far below bedrock so PVS doesn't mix the two
 *  rooms. The whole minimap is flat: emerged cells render as thin
 *  tiles (MINIMAP_TILE_THICKNESS) on top of a global blue plane.
 *
 *  - MINIMAP_GAP    : vertical gap between bedrock bottom and minimap
 *                     ceiling. Wide enough that vis treats them as
 *                     independent volumes.
 *  - MINIMAP_HEIGHT : vertical extent of the minimap capsule. Defines
 *                     how much area the peek camera sees: with FOV 90
 *                     the visible square is ~ 2 × HEIGHT in side. We
 *                     pick 3072u, which renders ~ 6000 × 6000u — a
 *                     generous slice of the playable area but not the
 *                     whole 32768u world.
 *  - MINIMAP_TILE_THICKNESS : how tall each tile of land is above the
 *                     blue plane. Just enough to read as a 3D step.
 */
const MINIMAP_GAP = 2048;
const MINIMAP_HEIGHT = 3072;
const MINIMAP_TILE_THICKNESS = 16;
const MINIMAP_TOP_Z = BEDROCK_TOP_Z - BEDROCK_THICKNESS - MINIMAP_GAP;
const MINIMAP_BOTTOM_Z = MINIMAP_TOP_Z - MINIMAP_HEIGHT;
const MINIMAP_SEA_Z = MINIMAP_BOTTOM_Z + MINIMAP_TILE_THICKNESS;

const QUAKE_TEX_NAME_MAX = 15;

/** Build the texture name for a single face. The face suffix is kept
 *  in full (so cubes can never collide on truncation); the biome
 *  prefix is shortened from the right if the combined name exceeds
 *  QUAKE_TEX_NAME_MAX. Any trailing underscore left by the cut is
 *  stripped so the final name never has `__`. */
function texNameFor(id, face) {
  const s = id.replace(/-/g, '_');
  const sep = '_';
  const budget = QUAKE_TEX_NAME_MAX - sep.length - face.length;
  const prefix = (s.length <= budget) ? s : s.slice(0, budget).replace(/_+$/, '');
  return prefix + sep + face;
}

/** Derive the 5 Quake texture names for a biome. Same algorithm the
 *  texturesWadBuilder uses, so .map refs match WAD lump names exactly. */
function texturesFor(id) {
  return {
    top:     texNameFor(id, 'top'),
    side:    texNameFor(id, 'side'),
    capital: texNameFor(id, 'capital'),
    base:    texNameFor(id, 'base'),
    bottom:  texNameFor(id, 'bottom'),
  };
}

/** Biome texture set whose 5 faces all point to the same WAD lump.
 *  Used for biomes whose art is a single tiling texture in auto.wad
 *  (e.g. the procedural mil_* set) — no per-face PNG variants. */
function singleTexBiome(name) {
  return { top: name, side: name, capital: name, base: name, bottom: name };
}

/** Face keys in canonical order. */
const FACE_KEYS = ['top', 'side', 'capital', 'base', 'bottom'];

/** Per-cube face textures from position in a vertical column. See
 *  column.md for the model and types.mjs for the doc comment. */
function pickFaceTextures(k, total, neighborMax, biomeTex) {
  const isTopCube    = k === total - 1;
  const isBottomCube = k === 0;
  const buried       = k < neighborMax;

  let sideKey;
  if (isTopCube)               sideKey = 'capital';
  else if (buried)             sideKey = 'side';
  else if (k === neighborMax)  sideKey = 'base';
  else                         sideKey = 'side';

  return {
    top:    isTopCube    ? biomeTex.top    : null,
    side:   biomeTex[sideKey],
    bottom: isBottomCube ? biomeTex.bottom : null,
  };
}

/** Ordered list of palette entries for the UI. Each entry carries its
 *  5-face Quake texture set (`tex`); see column.md for the layout. */
// Labels match the biome id / asset folder name. See types.mjs.
const PALETTE = [
  { id: 'tierra',  label: 'tierra',  tex: texturesFor('tierra'),  color: '#7a5a3a' },
  { id: 'arena',   label: 'arena',   tex: texturesFor('arena'),   color: '#d9c47a' },
  { id: 'road-up', label: 'road-up', tex: texturesFor('road-up'), color: '#444444' },
  { id: 'road-dl', label: 'road-dl', tex: texturesFor('road-dl'), color: '#555555' },
  { id: 'road-x',  label: 'road-x',  tex: texturesFor('road-x'),  color: '#3a3a3a' },
  { id: 'metal',   label: 'metal',   tex: texturesFor('metal'),   color: '#6b6b78' },
  { id: 'plaza',   label: 'plaza',   tex: texturesFor('plaza'),   color: '#a8a89a' },
  // Procedural military textures from auto.wad (see wadWriter.js). No
  // per-face PNG previews — the 2D editor falls back to the swatch color.
  { id: 'mil_camo',   label: 'mil camo',   tex: singleTexBiome('mil_camo'),   color: '#4a5a3a' },
  { id: 'mil_tan',    label: 'mil tan',    tex: singleTexBiome('mil_tan'),    color: '#b8a070' },
  { id: 'mil_sand',   label: 'mil sand',   tex: singleTexBiome('mil_sand'),   color: '#a89060' },
  { id: 'mil_bunker', label: 'mil bunker', tex: singleTexBiome('mil_bunker'), color: '#7a7a7a' },
  // Curve biomes — APPEND-ONLY at the end of the palette. Saved maps
  // store textures as numeric indices into PALETTE; inserting biomes
  // anywhere except at the tail would shift all later indices and
  // corrupt existing maps. Keep the tail order stable from now on.
  //
  // 4 cardinal rotations of a single hand-drawn road corner. The art
  // for `-N` lives in assets/textures/curve-out-N/top.png and is the
  // canonical source; `-E`, `-S`, `-O` are generated from it by
  // rotating 90°/180°/270° (scripts/gen-curve-textures.js). The other
  // 4 faces (side/capital/base/bottom) are shared asphalt that doesn't
  // need rotation.
  //
  // Painting cycles through the 4 directions automatically — see
  // applyPaintAtCell in store.js.
  { id: 'curve-out-N', label: 'curve-out N', tex: texturesFor('curve-out-N'), color: '#3a3a3a' },
  { id: 'curve-out-E', label: 'curve-out E', tex: texturesFor('curve-out-E'), color: '#3a3a3a' },
  { id: 'curve-out-S', label: 'curve-out S', tex: texturesFor('curve-out-S'), color: '#3a3a3a' },
  { id: 'curve-out-O', label: 'curve-out O', tex: texturesFor('curve-out-O'), color: '#3a3a3a' },
  // hlanding — helipad corner tile. Same machinery as curve-out (4 cardinal
  // rotations, painting cycles). Art hand-painted per direction. APPEND-ONLY.
  { id: 'hlanding-N', label: 'hlanding N', tex: texturesFor('hlanding-N'), color: '#2e3a3a' },
  { id: 'hlanding-E', label: 'hlanding E', tex: texturesFor('hlanding-E'), color: '#2e3a3a' },
  { id: 'hlanding-S', label: 'hlanding S', tex: texturesFor('hlanding-S'), color: '#2e3a3a' },
  { id: 'hlanding-O', label: 'hlanding O', tex: texturesFor('hlanding-O'), color: '#2e3a3a' },
  // Ship block: deck top + riveted hull sides w/ red waterline. APPEND-ONLY.
  { id: 'barco', label: 'barco', tex: texturesFor('barco'), color: '#6a7078' },
];

/** Special objects placed in a cell. See types.mjs for the field spec. */
const SPECIAL_OBJECTS = [
  { kind: 'casa',    label: 'casa',    glyph: '⌂', color: '#c08c4a',
    footprint: 1, isBuilding: true, tex: texturesFor('casa') },
  { kind: 'tower',   label: 'tower',   glyph: '▮', color: '#8888a0',
    footprint: 1, isBuilding: true, tex: texturesFor('tower') },
  { kind: 'ruina',   label: 'ruina',   glyph: '⌑', color: '#a8a098',
    footprint: 1, isBuilding: true, tex: texturesFor('ruina') },
  // Military buildings — used by the military base generator. Each one
  // has its own folder of 5 PNG faces (top/side/capital/base/bottom)
  // under assets/textures/<kind>/, generated by scripts/gen-mil-textures.js.
  // So they go through the same `texturesFor(id)` machinery as plaza or
  // casa: the writer's column-stack uses `capital` on top, `base` where
  // a shorter neighbour cuts in, `side` everywhere else, and the
  // decoration system (rampas, corner_in) corners them correctly.
  //
  // hangar:  footprint 1 → adjacent same-kind/storeys cells fuse via the
  //   greedy mesh into a long warehouse volume; corrugated camo green
  //   walls + yellow safety stripe on the capital.
  // cuartel: footprint 0.9 → discrete barrack buildings; tan stucco walls
  //   with rows of small windows + parapet on top.
  // bunker:  footprint 0.8 → small chunky concrete cube; weathered grey
  //   wall with a slit window + heavy cornice on the capital.
  { kind: 'hangar',  label: 'hangar',  glyph: '▭', color: '#5a6a4a',
    footprint: 1,   isBuilding: true, tex: texturesFor('hangar') },
  { kind: 'cuartel', label: 'cuartel', glyph: '☰', color: '#a89060',
    footprint: 0.9, isBuilding: true, tex: texturesFor('cuartel') },
  { kind: 'bunker',  label: 'bunker',  glyph: '◧', color: '#7a7a7a',
    footprint: 0.8, isBuilding: true, tex: texturesFor('bunker') },
  // Shipping containers: stacked 2-4 high like casa, but each cube gets a
  // different colour chosen by mapWriter from cell position (2-cell bands) +
  // level. containerColors lists the cont<N> colour-texture ids.
  { kind: 'contenedores', label: 'contenedores', glyph: '▦', color: '#2e5a8a',
    footprint: 1, isBuilding: true, tex: texturesFor('cont0'),
    containerColors: ['cont0', 'cont1', 'cont2', 'cont3', 'cont4', 'cont5'] },
  { kind: 'lampara', label: 'lampara', glyph: '✦', color: '#f0d870',
    heightU: 192, footprint: 0.18, tex: 'metal1_1',
    light: { offsetZ: 192, intensity: 350, color: '255 240 200' } },
  // Reference procedural textures generated into auto.wad on launch.
  { kind: 'arbol',   label: 'arbol',   glyph: '♣', color: '#3a8030',
    heightU: 192, footprint: 0.5, tex: '+0wood' },
  { kind: 'arbusto', label: 'arbusto', glyph: '♠', color: '#4a7040',
    heightU: 32, footprint: 0.6, tex: 'gren3a' },
  { kind: 'roca',    label: 'roca',    glyph: '◆', color: '#7a7a7a',
    heightU: 48, footprint: 0.5, tex: 'rock1_2' },
];
const OBJECT_BY_KIND = new Map(SPECIAL_OBJECTS.map(o => [o.kind, o]));

/** Enemigos colocables del mod Airquake/Uplifter. Ver types.mjs para
 *  el doc completo; aqui solo el catalogo en CJS para mapWriter. */
const ENEMY_TYPES = [
  { kind: 'monster_aag', label: 'monster_aag', glyph: '⊕', color: '#c04030', needsPath: false, aerial: false },
  { kind: 'monster_amg', label: 'monster_amg', glyph: '⊗', color: '#b03048', needsPath: false, aerial: false },
  { kind: 'monster_sam', label: 'monster_sam', glyph: '⌃', color: '#a02040', needsPath: false, aerial: false },
  { kind: 'monster_rad', label: 'monster_rad', glyph: '◎', color: '#a06070', needsPath: false, aerial: false },
  { kind: 'monster_etank',  label: 'monster_etank',  glyph: '▲', color: '#80604a', needsPath: true,  aerial: false },
  { kind: 'monster_ehmmv',  label: 'monster_ehmmv',  glyph: '▼', color: '#706050', needsPath: true,  aerial: false },
  { kind: 'monster_emsam',  label: 'monster_emsam',  glyph: '◆', color: '#604858', needsPath: true,  aerial: false },
  // Aereos: spawnean a la altura de su ruta. Sin ruta cae a un default
  // de altura de vuelo (8 unidades de celda) para no aparecer en el suelo.
  { kind: 'monster_drone',  label: 'monster_drone',  glyph: '✈', color: '#7090c0', needsPath: true,  aerial: true },
  { kind: 'monster_drone2', label: 'monster_drone2', glyph: '✈', color: '#5078a8', needsPath: true,  aerial: true },
  { kind: 'monster_helo',   label: 'monster_helo',   glyph: '↻', color: '#609080', needsPath: true,  aerial: true },
  { kind: 'monster_swarm_pilot', label: 'monster_swarm_pilot', glyph: '✦', color: '#d06030', needsPath: false, aerial: true },
  // Bombing launcher: indestructible ambient hazard. Lobs bursts of slow
  // ballistic rockets at random city pickups. Stationary, no path.
  { kind: 'bombing_launcher', label: 'bombing launcher', glyph: '💣', color: '#e05028', needsPath: false, aerial: false },
  // Decorative bird flock: pacific, non-solid swarm boid. No path.
  { kind: 'monster_birds_flock', label: 'birds', glyph: '🕊', color: '#e8e8f0', needsPath: false, aerial: true },
  // Gameplay entities (no enemigos): pickups y barco.
  { kind: 'info_pickup', label: 'info_pickup', glyph: '◉', color: '#60c060', needsPath: false, aerial: false, gameplay: true },
  { kind: 'info_ship',   label: 'info_ship',   glyph: '⚓', color: '#4070c0', needsPath: false, aerial: false, gameplay: true },
  { kind: 'info_ship_goal', label: 'ship goal', glyph: '⚑', color: '#40a0c0', needsPath: false, aerial: false, gameplay: true },
  { kind: 'info_hospital', label: 'info_hospital', glyph: '✚', color: '#c04040', needsPath: false, aerial: false, gameplay: true },
  { kind: 'info_representative', label: 'info_representative', glyph: '★', color: '#e0d040', needsPath: false, aerial: false, gameplay: true },
  { kind: 'info_carrier', label: 'info_carrier', glyph: '⏏', color: '#3060a0', needsPath: false, aerial: false, gameplay: true },
  { kind: 'info_enemy_slot', label: 'info_enemy_slot', glyph: '◇', color: '#909090', needsPath: false, aerial: false, gameplay: true },
  // counterforces_origin: punto de spawn de unidades Davenport aliadas al
  // jugador. Coloca uno o varios; el sistema elige el más cercano al objetivo.
  { kind: 'counterforces_origin', label: 'counterforces', glyph: '⊛', color: '#50c878', needsPath: false, aerial: false, gameplay: true },
  // forces_attack_origin: punto de spawn de ENEMIGOS terrestres (tanques)
  // hostiles al jugador. Espejo de counterforces_origin, pero atacan.
  { kind: 'forces_attack_origin', label: 'forces attack', glyph: '⊗', color: '#c83232', needsPath: false, aerial: false, gameplay: true },
  // Props decorativos: aviones aparcados (solo de mirar, makestatic al iniciar).
  // El mapper los rota con .angles; por defecto quedan en diagonal.
  { kind: 'prop_plane_a10',    label: 'A-10 (parked)',  glyph: '✈', color: '#8a8f96', needsPath: false, aerial: false },
  { kind: 'prop_plane_parked', label: 'plane (parked)', glyph: '✈', color: '#6f7a86', needsPath: false, aerial: false },
];
const ENEMY_BY_KIND = new Map(ENEMY_TYPES.map(e => [e.kind, e]));

const HOUSE_STOREYS_MIN = 2;
const HOUSE_STOREYS_MAX = 4;

/** Smoothing terrains (mutually exclusive with special objects). */
const SMOOTHING_KINDS = ['rampa', 'bevel', 'prisma'];

/** Kinds de relleno (preparacion_iso) generados por la tool Erosion. Una
 *  decoracion por celda se guarda en tilemap.decorations[i] como entero
 *  compacto: code = (kindIdx + 1) * 4 + dir. 0 = sin decoracion. */
const DECO_KINDS = [
  'ramp', 'ramp_u', 'ramp_diag', 'pit',
  'corner_in', 'corner_out', 'pyramid',
  'cube', 'wedge', 'ramp_u_closed', 'bridge_diag',
];
function encodeDeco(kind, dir) {
  if (!kind) return 0;
  const idx = DECO_KINDS.indexOf(kind);
  if (idx < 0) return 0;
  return (idx + 1) * 4 + (dir & 3);
}
function decodeDeco(code) {
  if (!code) return null;
  const kindIdx = Math.floor(code / 4) - 1;
  if (kindIdx < 0 || kindIdx >= DECO_KINDS.length) return null;
  return { kind: DECO_KINDS[kindIdx], dir: code & 3 };
}

/**
 * Build an empty TilemapData.
 *
 *   schemaVersion: 1
 *   cols, rows, cellSize
 *   textures: Int8Array[N]  — palette index per cell (-1 = none)
 *   heights:  Int16Array[N] — scalar height in HEIGHT_UNIT steps
 *   objects:  (object|null)[N] — special object placed in the cell
 *   smoothing:(string|null)[N] — 'rampa' | 'bevel' | 'prisma'
 *   patrols:  Patrol[]      — list of node loops (gameplay AI paths)
 *   spawn:    {x,y,z,angle} | null
 *   sun:      sun config
 *   quality:  'fast' | 'hq'
 *
 * Default: all cells start at height -1 (below sea level = ocean) with
 * no texture (the water brush covers everything visually).
 */
function makeEmptyTilemap({ cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = {}) {
  const N = cols * rows;
  return {
    schemaVersion: SCHEMA_VERSION,
    cols,
    rows,
    cellSize: CELL_SIZE,
    // -1 in the palette index = "no painted texture" (visible only on
    // emerged cells; submerged ones are covered by the water brush).
    textures: new Int8Array(N).fill(-1),
    // Scalar height in HEIGHT_UNIT steps. -1 = below sea level = ocean.
    heights: (() => { const a = new Int16Array(N); a.fill(-1); return a; })(),
    // Decoraciones de erosion (preparacion_iso). 0 = sin decoracion.
    decorations: new Int16Array(N),
    objects: new Array(N).fill(null),
    smoothing: new Array(N).fill(null),
    patrols: [],
    enemies: [],
    spawn: null,
    sun: { ...DEFAULT_SUN },
    quality: 'fast',
  };
}

/** True iff the cell is submerged — drawn as water in the editor, no
 *  per-cell brush emitted by the writer (the global water brush covers
 *  it). */
function isWaterCell(tilemap, idx) {
  return tilemap.heights[idx] < SEA_LEVEL_H;
}

/**
 * Serialise a TilemapData to a JSON-safe plain object. Typed arrays
 * become regular arrays. */
function serialiseTilemap(t) {
  return {
    schemaVersion: t.schemaVersion,
    cols: t.cols,
    rows: t.rows,
    cellSize: t.cellSize,
    textures: Array.from(t.textures),
    heights: Array.from(t.heights),
    decorations: t.decorations ? Array.from(t.decorations) : undefined,
    objects: t.objects,
    smoothing: t.smoothing,
    patrols: t.patrols,
    enemies: t.enemies,
    spawn: t.spawn,
    sun: t.sun,
    quality: t.quality,
  };
}

/** Map of legacy object kinds → current kinds. Applied at load time so
 *  saved maps from before a rename keep working. */
const KIND_ALIASES = { rascacielos: 'tower' };

function migrateObjects(objects) {
  if (!Array.isArray(objects)) return objects;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (o && KIND_ALIASES[o.kind]) {
      objects[i] = { ...o, kind: KIND_ALIASES[o.kind] };
    }
  }
  return objects;
}

/** Inverse of serialiseTilemap — reattach typed arrays. */
function deserialiseTilemap(o) {
  const N = (o.cols ?? 0) * (o.rows ?? 0);
  let decorations;
  if (Array.isArray(o.decorations)) {
    decorations = new Int16Array(N);
    for (let i = 0; i < Math.min(N, o.decorations.length); i++)
      decorations[i] = o.decorations[i];
  } else {
    decorations = new Int16Array(N);
  }
  return {
    ...o,
    textures: Int8Array.from(o.textures),
    heights: Int16Array.from(o.heights),
    decorations,
    objects: migrateObjects(o.objects),
    // Merge so newly-added sun keys (e.g. minlight) pick up their
    // default when the map was saved before the field existed.
    sun: { ...DEFAULT_SUN, ...(o.sun ?? {}) },
  };
}

module.exports = {
  SCHEMA_VERSION,
  CELL_SIZE,
  WORLD_HALF,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  HEIGHT_UNIT,
  SEA_LEVEL_H,
  SEA_LEVEL_Z,
  BEDROCK_TOP_Z,
  BEDROCK_THICKNESS,
  SKY_HEIGHT,
  SKY_TOP_Z,
  SKY_WALL_THICKNESS,
  CLOUD_LAYER_Z,
  CLOUD_LAYER_COUNT,
  CLOUD_LAYER_SPACING,
  CLOUD_BRUSH_SIZE,
  CLOUD_BRUSH_THICKNESS,
  CLOUD_VOLUME_COUNT,
  CLOUD_COUNT,
  CLOUD_FIELD_HALF,
  CLOUD_TEX_SIZE,
  CLOUD_CLUSTERS,
  CLOUD_PER_CLUSTER_MIN,
  CLOUD_PER_CLUSTER_MAX,
  CLOUD_CLUSTER_RADIUS,
  CLOUD_CLUSTER_SEP_MIN,
  CLOUD_CLUSTER_SEP_MAX,
  CLOUD2_CLUSTERS,
  CLOUD2_PER_CLUSTER_MIN,
  CLOUD2_PER_CLUSTER_MAX,
  CLOUD2_CLUSTER_RADIUS,
  CLOUD2_CLUSTER_SEP_MIN,
  CLOUD2_CLUSTER_SEP_MAX,
  DEFAULT_SUN,
  SKY_TEXTURE,
  WATER_TEXTURE,
  WATER_SHADES,
  BEDROCK_TEXTURE,
  MINIMAP_SEA_TEXTURE,
  MINIMAP_GAP,
  MINIMAP_HEIGHT,
  MINIMAP_TILE_THICKNESS,
  MINIMAP_TOP_Z,
  MINIMAP_BOTTOM_Z,
  MINIMAP_SEA_Z,
  FACE_KEYS,
  QUAKE_TEX_NAME_MAX,
  texNameFor,
  texturesFor,
  pickFaceTextures,
  PALETTE,
  SPECIAL_OBJECTS,
  OBJECT_BY_KIND,
  ENEMY_TYPES,
  ENEMY_BY_KIND,
  SMOOTHING_KINDS,
  HOUSE_STOREYS_MIN,
  HOUSE_STOREYS_MAX,
  DECO_KINDS,
  encodeDeco,
  decodeDeco,
  makeEmptyTilemap,
  isWaterCell,
  serialiseTilemap,
  deserialiseTilemap,
};
