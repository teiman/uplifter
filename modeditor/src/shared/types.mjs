// ESM mirror of types.js for the Vite-built renderer. Keep in sync
// with types.js — same constants, same logic. We duplicate (rather
// than transpile/import) to keep the build simple: no commonjs plugin,
// no dynamic require, just two files.

export const SCHEMA_VERSION = 1;
export const CELL_SIZE = 64;
export const WORLD_HALF = 16384;
// 512×512 cells × 64u = 32768u square = the full playable world
// (±16384 per axis). 262144 cells total — viable thanks to per-chunk
// mesh caching in scene3d.js. The mapWriter and Canvas2D scale linearly
// with painted cells, not grid size, so they stay fast.
export const DEFAULT_COLS = 512;
export const DEFAULT_ROWS = 512;

/** 3D mesh chunk granularity. The scene is sliced into MESH_CHUNK_SIZE×
 *  MESH_CHUNK_SIZE cell blocks; each block is its own VBO. Editing a
 *  cell only invalidates its chunk, not the entire mesh. 32 keeps the
 *  per-chunk vertex count small enough to upload in <1ms while keeping
 *  the chunk grid (512/32 = 16²= 256 chunks) cheap to iterate. */
export const MESH_CHUNK_SIZE = 32;

/** Side length of the play-area region grid (REGION_GRID × REGION_GRID
 *  regions tile the whole map). The user picks regions instead of
 *  drawing arbitrary rectangles, so the count is fixed regardless of
 *  map size. */
export const REGION_GRID = 4;

/** Cell bounds of region (rcol, rrow) given a map of cols×rows. Returns
 *  an inclusive { c0, r0, c1, r1 } rectangle. The map size doesn't have
 *  to divide evenly by REGION_GRID — we partition proportionally so
 *  edge regions absorb the remainder. */
export function regionBounds(cols, rows, rcol, rrow) {
  const c0 = Math.floor(rcol * cols / REGION_GRID);
  const c1 = Math.floor((rcol + 1) * cols / REGION_GRID) - 1;
  const r0 = Math.floor(rrow * rows / REGION_GRID);
  const r1 = Math.floor((rrow + 1) * rows / REGION_GRID) - 1;
  return { c0, r0, c1, r1 };
}

/** Inverse of regionBounds: return the (rcol, rrow) the cell falls in.
 *  Returns null for out-of-grid cells. Used to highlight the region a
 *  given playArea matches in the mini-map. */
export function regionOfCell(cols, rows, col, row) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const rcol = Math.min(REGION_GRID - 1, Math.floor(col * REGION_GRID / cols));
  const rrow = Math.min(REGION_GRID - 1, Math.floor(row * REGION_GRID / rows));
  return { rcol, rrow };
}
export const HEIGHT_UNIT = 64;
export const SEA_LEVEL_H = 0;
export const SEA_LEVEL_Z = SEA_LEVEL_H * HEIGHT_UNIT;
export const BEDROCK_TOP_Z = -2 * HEIGHT_UNIT;
export const BEDROCK_THICKNESS = 64;
export const SKY_HEIGHT = 4096;
export const SKY_TOP_Z = SEA_LEVEL_Z + SKY_HEIGHT;
export const SKY_WALL_THICKNESS = 64;

/** Volumetric cloud band (see buildCloudVolume in wadWriter + emitClouds
 *  in mapWriter). CLOUD_COUNT discrete clouds; each is a real 3D density
 *  volume (metaball parcels + 3D fbm erosion, cumulus-shaped) sliced into
 *  CLOUD_LAYER_COUNT horizontal cross-sections, each baked to its own
 *  fence texture ({cloud_<vol>_<layer>) and stacked as thin
 *  func_detail_illusionary brushes — so the stack reproduces the true 3D
 *  shape. No vis/BSP cost; heli flies through.
 *
 *  Height: heli max cruise = WATER_Z(-8)+64×32 = 2040 (helo1.qc/weapons.qc).
 *  Centred at 1740 so a cloud's top stays ~1868 < that. Painting:
 *  blue-noise dithered edges + directional sun rim-light. */
export const CLOUD_LAYER_Z = 1740;
export const CLOUD_LAYER_COUNT = 16;
export const CLOUD_LAYER_SPACING = 12;
export const CLOUD_BRUSH_SIZE = 1024;
export const CLOUD_BRUSH_THICKNESS = 8;
// Distinct 3D cloud shapes generated, reused across instances for variety.
export const CLOUD_VOLUME_COUNT = 6;
// ~32 discrete cloud instances over a ±12000 field ≈ scattered sky with
// clear blue gaps. Tune freely (raise for a busier sky).
export const CLOUD_COUNT = 32;
export const CLOUD_FIELD_HALF = 12000;
/** Side (px) of the procedural cloud slice textures. Multiple of 8. */
export const CLOUD_TEX_SIZE = 256;
// Clustering: clouds are placed in tight clusters so several models overlap
// and read as one big lumpy cumulus (not scattered evenly).
export const CLOUD_CLUSTERS = 8;
export const CLOUD_PER_CLUSTER_MIN = 11;
export const CLOUD_PER_CLUSTER_MAX = 12;
export const CLOUD_CLUSTER_RADIUS = 1170;
// Min random distance between cluster centres (rejection sampling) so groups
// don't bunch up — clear blue sky between cumulus clusters.
export const CLOUD_CLUSTER_SEP_MIN = 2400;
export const CLOUD_CLUSTER_SEP_MAX = 4200;
// Second cloud layer at the SAME altitude: smaller clusters of just 2 clouds.
export const CLOUD2_CLUSTERS = 10;
export const CLOUD2_PER_CLUSTER_MIN = 2;
export const CLOUD2_PER_CLUSTER_MAX = 2;
export const CLOUD2_CLUSTER_RADIUS = 500;
export const CLOUD2_CLUSTER_SEP_MIN = 1800;
export const CLOUD2_CLUSTER_SEP_MAX = 3200;

export const DEFAULT_SUN = {
  intensity: 250,
  mangle: '215 -45 0',
  color: '255 240 200',
  penumbra: 3,
  sunlight2: 80,
  sunlight2Color: '180 210 255',
  // Floor for the lightmap: shaded faces never drop below this value.
  // Keeps interior shadows readable on outdoor maps. 0 disables it.
  minlight: 110,
};

export const SKY_TEXTURE = 'sky_auto';
export const WATER_TEXTURE = '*water';
// Coastal depth banding: light/shallow near coast (0) → dark/deep (3).
export const WATER_SHADES = ['*water1', '*water2', '*water3', '*water4'];
// The bedrock slab sits under the global water brush and is never
// seen, but qbsp still wants a real texture on its faces. Point to
// auto_wall — a rocky procedural texture that always exists in
// auto.wad, removing the dependency on the user shipping a 'dirt'
// texture in a hand-built WAD.
export const BEDROCK_TEXTURE = 'auto_wall';

/** Maximum length of a Quake miptex name in characters (the on-disk
 *  field is 16 bytes, last byte is a null terminator). */
export const QUAKE_TEX_NAME_MAX = 15;

/** Build the texture name for a single face. The face suffix is kept
 *  in full (so cubes can never collide on truncation), and the biome
 *  prefix is shortened from the right if the combined name exceeds
 *  QUAKE_TEX_NAME_MAX. Any trailing underscore left by the cut is
 *  stripped so the final name never has `__`. */
export function texNameFor(id, face) {
  const s = id.replace(/-/g, '_');
  const sep = '_';
  const budget = QUAKE_TEX_NAME_MAX - sep.length - face.length;
  const prefix = (s.length <= budget) ? s : s.slice(0, budget).replace(/_+$/, '');
  return prefix + sep + face;
}

/** Derive the 5 Quake texture names for a biome (top/side/capital/base/
 *  bottom) from its id. The texturesWadBuilder uses this same helper
 *  when generating textures.wad, guaranteeing that the .map references
 *  and the WAD lump names match byte-for-byte. See column.md §Naming. */
export function texturesFor(id) {
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
export function singleTexBiome(name) {
  return { top: name, side: name, capital: name, base: name, bottom: name };
}

/** Face keys in canonical order. Used when iterating per-face texture
 *  sets (mapWriter brushes, 3D mesh per-face colours, etc.). */
export const FACE_KEYS = ['top', 'side', 'capital', 'base', 'bottom'];

/**
 * Given a cube's position in a vertical column, return the texture
 * names that go on its visible faces. See column.md for the model.
 *
 *   k            cube index inside the stack, 0 = bottom (against bedrock)
 *   total        total cubes in the stack (height of the column in HEIGHT_UNIT)
 *   neighborMax  height of the tallest adjacent terrain (in HEIGHT_UNIT).
 *                The cube whose lower face sits at this Z is the one that
 *                exposes the `base` face — cubes below it are buried by
 *                neighbours and the engine will cull their lateral faces.
 *   biomeTex     5-face texture set for THIS cube's biome (terreno for
 *                terrain cubes, building tex for building cubes). The
 *                caller is responsible for picking which biome each k
 *                belongs to.
 *
 * Returns { top, side, bottom } — each a Quake texture name string, or
 * null when the face is occluded by a same-column neighbour and the
 * writer can skip emitting it.
 *
 * Conflict rule (single-cube columns, k=0 = k=total-1 = neighborMax):
 *   capital wins on the laterals. This matches column.md "1 cube → capital".
 */
export function pickFaceTextures(k, total, neighborMax, biomeTex) {
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

// 'agua' is intentionally not in this palette: water is a height
// concept (submerged cell), not a paint surface. To submerge/raise
// land use the Altura tools. The visible texture on the sea floor is
// still painted from this palette — the global water brush sits above
// it.
// Labels mirror the biome id (= asset folder name) so the swatch in the
// LeftPanel reads the same as the path the user edits on disk.
export const PALETTE = [
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
];

/**
 * Special objects placed in a cell. Each entry describes:
 *   - kind/label/glyph: identity for the UI palette.
 *   - color: 2D tint and 3D mesh fallback.
 *   - heightU: total height in Quake units above the cell's terrain top
 *              (single-brush decorative objects only — buildings use
 *              storey-based emission, see mapWriter).
 *   - footprint: 0..1, fraction of the cell (in X/Y) the object occupies.
 *                1 for buildings (so contiguous buildings fuse into blocks);
 *                narrower (~0.5) for trees/rocks; tiny (~0.18) for lamps.
 *   - isBuilding: true → object is rendered as a column stack using the
 *                 5-face texture set (top/side/capital/base/bottom) from
 *                 its own `tex`. false/absent → object is a single brush
 *                 with a flat `tex` string.
 *   - tex: for decorative objects, a single Quake texture name (string).
 *          For buildings, the 5-face texture set (object) from texturesFor().
 *   - light: optional point light spec emitted with the brush.
 */
export const SPECIAL_OBJECTS = [
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
  { kind: 'lampara', label: 'lampara', glyph: '✦', color: '#f0d870',
    heightU: 192, footprint: 0.18, tex: 'metal1_1',
    light: { offsetZ: 192, intensity: 350, color: '255 240 200' } },
  // Trees/bushes/rocks reference textures that auto.wad provides
  // procedurally — no dependency on a hand-built WAD.
  { kind: 'arbol',   label: 'arbol',   glyph: '♣', color: '#3a8030',
    heightU: 192, footprint: 0.5, tex: '+0wood' },
  { kind: 'arbusto', label: 'arbusto', glyph: '♠', color: '#4a7040',
    heightU: 32, footprint: 0.6, tex: 'gren3a' },
  { kind: 'roca',    label: 'roca',    glyph: '◆', color: '#7a7a7a',
    heightU: 48, footprint: 0.5, tex: 'rock1_2' },
];

/**
 * Catalogo de enemigos colocables. Cada entrada describe un classname del
 * mod (decompilado de Airquake) que puede usarse como entidad point en el
 * .map. Dos categorias:
 *
 *   needsPath: false → estacionarios. Se ponen donde se ponen y disparan.
 *   needsPath: true  → moviles. Si tienen `target` apuntando al targetname
 *                      del primer path_corner de una ruta entran en el
 *                      bucle de patrullaje; si no, se quedan vigilando.
 *
 * `glyph` y `color` van al render del editor (2D + 3D), siguiendo el mismo
 * patron que SPECIAL_OBJECTS. `label` es el texto que aparece en la paleta
 * y en el panel de propiedades.
 */
export const ENEMY_TYPES = [
  // ---- estacionarios ----
  { kind: 'monster_aag', label: 'monster_aag', glyph: '⊕', color: '#c04030', needsPath: false, aerial: false },
  { kind: 'monster_amg', label: 'monster_amg', glyph: '⊗', color: '#b03048', needsPath: false, aerial: false },
  { kind: 'monster_sam', label: 'monster_sam', glyph: '⌃', color: '#a02040', needsPath: false, aerial: false },
  { kind: 'monster_rad', label: 'monster_rad', glyph: '◎', color: '#a06070', needsPath: false, aerial: false },
  // ---- moviles ----
  { kind: 'monster_etank',  label: 'monster_etank',  glyph: '▲', color: '#80604a', needsPath: true,  aerial: false },
  { kind: 'monster_ehmmv',  label: 'monster_ehmmv',  glyph: '▼', color: '#706050', needsPath: true,  aerial: false },
  { kind: 'monster_emsam',  label: 'monster_emsam',  glyph: '◆', color: '#604858', needsPath: true,  aerial: false },
  // Aereos: spawnean a la altura de su ruta (flightHeight * HEIGHT_UNIT
  // sobre el terreno). Sin ruta usan un default de altura de vuelo para
  // que no aparezcan sobre el suelo.
  { kind: 'monster_drone',  label: 'monster_drone',  glyph: '✈', color: '#7090c0', needsPath: true,  aerial: true },
  { kind: 'monster_drone2', label: 'monster_drone2', glyph: '✈', color: '#5078a8', needsPath: true,  aerial: true },
  { kind: 'monster_helo',   label: 'monster_helo',   glyph: '↻', color: '#609080', needsPath: true,  aerial: true },
  // SwarmPlane: boid-flocking, persigue al heli sin ruta. Usa
  // DEFAULT_FLIGHT_HEIGHT para spawnear a una altura sensata.
  { kind: 'monster_swarm_pilot', label: 'monster_swarm_pilot', glyph: '✦', color: '#d06030', needsPath: false, aerial: true },
  // ---- gameplay entities (no enemigos: pickup points y barco) ----
  // info_scrap: pieza de chatarra que cura al recogerla; respawna a los
  // 120s. Coloca varias por el mapa.
  { kind: 'info_scrap',  label: 'info_scrap',  glyph: '✪', color: '#c0c060', needsPath: false, aerial: false, gameplay: true },
  // info_pickup: zona de rescate. El game elige una random al inicio del
  // mapa; al aterrizar dentro, spawneean civiles que suben al heli.
  { kind: 'info_pickup', label: 'info_pickup', glyph: '◉', color: '#60c060', needsPath: false, aerial: false, gameplay: true },
  // info_ship: el barco al que vuelves a descargar pasajeros. Cap 12,
  // ritmo 10s, +250 cr/pax. Mapa típico: 3 barcos en mar abierto.
  { kind: 'info_ship',   label: 'info_ship',   glyph: '⚓', color: '#4070c0', needsPath: false, aerial: false, gameplay: true },
  // info_hospital: hospital en tierra (Davenport). Cap 6, ritmo 4s,
  // +400 cr/pax. Más rápido pero vulnerable (puede caer durante la sesión).
  // Mapa típico: 2 hospitales dentro de Davenport.
  { kind: 'info_hospital', label: 'info_hospital', glyph: '✚', color: '#c04040', needsPath: false, aerial: false, gameplay: true },
  // info_representative: spawn del NPC que se rescata el día 5. Único
  // por mapa. Solo se activa al llegar al día 5.
  { kind: 'info_representative', label: 'info_representative', glyph: '★', color: '#e0d040', needsPath: false, aerial: false, gameplay: true },
  // info_carrier: el portaaviones USA del día 5. Aterrizar aquí con el
  // representante a bordo termina la partida.
  { kind: 'info_carrier', label: 'info_carrier', glyph: '⏏', color: '#3060a0', needsPath: false, aerial: false, gameplay: true },
  // info_enemy_slot: posición candidata de enemigo. Cada día se activa
  // un porcentaje (Day_SlotActivationPct). El mapper coloca muchos y el
  // sistema decide cuáles spawnean. Configura el tipo en .enemy_kind
  // (monster_aag/sam/rad) y el día mínimo en .activate_day.
  { kind: 'info_enemy_slot', label: 'info_enemy_slot', glyph: '◇', color: '#909090', needsPath: false, aerial: false, gameplay: true },
];

export const ENEMY_BY_KIND = new Map(ENEMY_TYPES.map(e => [e.kind, e]));

/** Random storeys per house cluster — atlasmapper uses 2..4 inclusive. */
export const HOUSE_STOREYS_MIN = 2;
export const HOUSE_STOREYS_MAX = 4;

export const OBJECT_BY_KIND = new Map(SPECIAL_OBJECTS.map(o => [o.kind, o]));

export const SMOOTHING_KINDS = ['rampa', 'bevel', 'prisma'];

/**
 * Kinds de relleno (estilo preparacion_iso): bloques amarillos que se
 * generan automaticamente con la tool "Erosion". Una decoracion por celda
 * se guarda en tilemap.decorations[i] como un entero compacto:
 *
 *   code = (kindIdx + 1) * 4 + dir
 *   0 = sin decoracion
 *
 * Asi kindIdx 0..14 y dir 0..3 caben en un Int16Array sin holguras raras.
 */
export const DECO_KINDS = [
  'ramp',          // 1 - 4 dirs (N/E/S/O alto)
  'ramp_u',        // 2 - 2 dirs (NS, EO)
  'ramp_diag',     // 3 - 4 dirs (NE/SE/SO/NO alta)
  'pit',           // 4 - 1 dir
  'corner_in',     // 5 - 4 dirs
  'corner_out',    // 6 - 4 dirs
  'pyramid',       // 7 - 1 dir
  'cube',          // 8 - 1 dir (bloque solido amarillo)
  'wedge',         // 9 - 4 dirs (cuna diagonal)
  'ramp_u_closed', // 10 - 4 dirs
  'bridge_diag',   // 11 - 2 dirs
];

export function encodeDeco(kind, dir) {
  if (!kind) return 0;
  const idx = DECO_KINDS.indexOf(kind);
  if (idx < 0) return 0;
  return (idx + 1) * 4 + (dir & 3);
}

export function decodeDeco(code) {
  if (!code) return null;
  const kindIdx = Math.floor(code / 4) - 1;
  if (kindIdx < 0 || kindIdx >= DECO_KINDS.length) return null;
  return { kind: DECO_KINDS[kindIdx], dir: code & 3 };
}

/**
 * Unified palette item shape used by the LeftPanel and the 2D editor's
 * paint logic. Texturas, objetos y el spawn coexisten; only `type`
 * differentiates how applying it mutates the tilemap.
 *
 *   type: 'texture' | 'object' | 'spawn'
 *   id:   palette key (texture id) or object kind
 *   label, color, glyph: visual
 *
 * Spawn is a singleton (there's only one info_player_start per map).
 * Clicking on a cell with the spawn brush selected moves the spawn
 * there; it doesn't paint anything per cell.
 */
export const BRUSH_PALETTE = [
  // For curve biomes we expose ONE representative brush ("curve out").
  // The 4 cardinal variants (-N/-E/-S/-O) are real biomes in PALETTE
  // (so the writer / canvas can render them), but selecting the brush +
  // clicking cycles through the 4 directions automatically. See
  // applyPaintAtCell in store.js. The `cycle` field tells the paint
  // logic which family this brush drives; non-curve brushes have no
  // `cycle` and behave as before.
  ...PALETTE
    .filter(p => !/^curve-out-[NESO]$/.test(p.id))
    .map(p => ({ type: 'texture', id: p.id, label: p.label, color: p.color })),
  { type: 'texture', id: 'curve-out-N', label: 'curve', color: '#3a3a3a', cycle: 'curve-out' },
  ...SPECIAL_OBJECTS.map(o => ({ type: 'object', id: o.kind, label: o.label, color: o.color, glyph: o.glyph })),
  { type: 'spawn', id: 'spawn', label: 'Spawn', color: '#ff5050', glyph: '♟' },
  // Enemigos. Cada uno con su categoria (needsPath) para que la LeftPanel
  // pueda agruparlos en dos secciones.
  ...ENEMY_TYPES.map(e => ({
    type: 'enemy', id: e.kind, label: e.label, color: e.color, glyph: e.glyph,
    needsPath: e.needsPath,
  })),
];

export function makeEmptyTilemap({ cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = {}) {
  const N = cols * rows;
  return {
    schemaVersion: SCHEMA_VERSION,
    cols,
    rows,
    cellSize: CELL_SIZE,
    textures: (() => { const a = new Int8Array(N); a.fill(-1); return a; })(),
    heights: (() => { const a = new Int16Array(N); a.fill(-1); return a; })(),
    objects: new Array(N).fill(null),
    smoothing: new Array(N).fill(null),
    // Bloques de relleno generados por la tool "Erosion" (preparacion_iso).
    // 0 = sin decoracion. Ver encodeDeco/decodeDeco.
    decorations: new Int16Array(N),
    patrols: [],
    // Enemigos colocados en el mapa. Cada uno: { id, kind, col, row, angle,
    // target }. `target` es el id de una ruta de `patrols` (no el
    // targetname raw de un path_corner) — el writer lo convierte al
    // compilar. null = enemigo suelto, sin patrullaje.
    enemies: [],
    spawn: null,
    sun: { ...DEFAULT_SUN },
    quality: 'fast',
    // Optional axis-aligned cell rectangle defining the playable zone.
    //   null               → no area defined; whole map compiles.
    //   { c0, r0, c1, r1, restrict }
    //     c0..c1, r0..r1   → inclusive cell bounds (any order).
    //     restrict         → when true, mapWriter only emits cells inside
    //                        the area; when false, the area is drawn in
    //                        the editor for reference but doesn't affect
    //                        compilation.
    playArea: null,
  };
}

export function isWaterCell(tilemap, idx) {
  return tilemap.heights[idx] < SEA_LEVEL_H;
}

/** Map of legacy object kinds → current kinds, applied on load. */
const KIND_ALIASES = { rascacielos: 'tower' };

function migrateObjects(objects) {
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (o && KIND_ALIASES[o.kind]) {
      objects[i] = { ...o, kind: KIND_ALIASES[o.kind] };
    }
  }
  return objects;
}

/** Reconstruct a TilemapData from a serialised plain object (typed
 *  arrays come back as regular arrays). Tolerant of older snapshots
 *  that lack newer fields (objects, smoothing, patrols, etc.). */
export function deserialiseTilemap(o) {
  const cols = o.cols, rows = o.rows;
  const N = cols * rows;
  const textures = new Int8Array(N);
  textures.set(o.textures ?? []);
  const heights = new Int16Array(N);
  if (Array.isArray(o.heights)) {
    for (let i = 0; i < Math.min(N, o.heights.length); i++) heights[i] = o.heights[i];
  } else {
    heights.fill(-1);
  }
  // Decoraciones de erosion (preparacion_iso). Mapas viejos sin este campo
  // arrancan con un array de ceros (sin decoracion).
  const decorations = new Int16Array(N);
  if (Array.isArray(o.decorations)) {
    for (let i = 0; i < Math.min(N, o.decorations.length); i++) decorations[i] = o.decorations[i];
  }
  return {
    schemaVersion: o.schemaVersion ?? SCHEMA_VERSION,
    cols, rows,
    cellSize: o.cellSize ?? CELL_SIZE,
    textures,
    heights,
    decorations,
    // Migrate legacy object kinds renamed for shorter Quake texture
    // names: 'rascacielos' → 'tower'. Saved maps from before the
    // rename keep working without manual fix-up.
    objects:   migrateObjects(o.objects ?? new Array(N).fill(null)),
    smoothing: o.smoothing ?? new Array(N).fill(null),
    patrols:   o.patrols   ?? [],
    enemies:   o.enemies   ?? [],
    spawn:     o.spawn     ?? null,
    // Merge so newly-added sun keys (e.g. minlight) pick up their
    // default on maps saved before the field existed.
    sun:       { ...DEFAULT_SUN, ...(o.sun ?? {}) },
    quality:   o.quality   ?? 'fast',
    // Fill in defaults on saved areas that predate the `strict` flag,
    // so loading an old map gives you the new default (strict ON).
    playArea: o.playArea
      ? { ...o.playArea, strict: o.playArea.strict ?? true }
      : null,
  };
}

/** Serialise to IPC-safe plain object. Typed arrays → regular arrays. */
export function serialiseTilemap(t) {
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
    playArea: t.playArea,
  };
}
