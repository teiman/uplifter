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
const DEFAULT_COLS = 64;
const DEFAULT_ROWS = 64;

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

/** Default sun (sunlight in worldspawn). Tweakable from the Light panel. */
const DEFAULT_SUN = {
  intensity: 250,
  mangle: '215 -45 0',
  color: '255 240 200',
  penumbra: 3,
  sunlight2: 80,
  sunlight2Color: '180 210 255',
};

/** Texture mapping: Uplifter palette symbols → WAD texture names.
 *  Single source of truth, read by both the editor (preview) and the
 *  mapWriter. */
const TEXTURES = {
  tierra:           'dirt',
  arena:            'sand',
  agua:             '*water',
  'road-up':        'road_up',
  'road-down-left': 'road_left',
  'road-x':         'roadx',
  metal:            'metal1_1',
  plaza:            'cement1',
};

/** Internal textures used by the writer for the world box, not exposed
 *  in the palette. */
const SKY_TEXTURE = 'sky_auto';
const WATER_TEXTURE = '*water';
const BEDROCK_TEXTURE = 'dirt';

/** Ordered list of palette entries for the UI. */
const PALETTE = [
  { id: 'tierra',           label: 'Tierra',        tex: TEXTURES.tierra,            color: '#7a5a3a' },
  { id: 'arena',            label: 'Arena',         tex: TEXTURES.arena,             color: '#d9c47a' },
  { id: 'agua',             label: 'Agua',          tex: TEXTURES.agua,              color: '#3a6da5' },
  { id: 'road-up',          label: 'Road ↑',        tex: TEXTURES['road-up'],        color: '#444444' },
  { id: 'road-down-left',   label: 'Road ↙',        tex: TEXTURES['road-down-left'], color: '#555555' },
  { id: 'road-x',           label: 'Road ✕',        tex: TEXTURES['road-x'],         color: '#3a3a3a' },
  { id: 'metal',            label: 'Metal',         tex: TEXTURES.metal,             color: '#6b6b78' },
  { id: 'plaza',            label: 'Plaza',         tex: TEXTURES.plaza,             color: '#a8a89a' },
];

/** Special objects that can live in a cell (mutually exclusive with
 *  smoothing terrain). For now metadata only — geometry emission lands
 *  in a later milestone. */
const SPECIAL_OBJECTS = [
  { kind: 'casa',        label: 'Casa' },
  { kind: 'rascacielos', label: 'Rascacielos' },
  { kind: 'lampara',     label: 'Lámpara' },
  { kind: 'arbol',       label: 'Árbol' },
  { kind: 'arbusto',     label: 'Arbusto' },
  { kind: 'roca',        label: 'Roca' },
];

/** Smoothing terrains (mutually exclusive with special objects). */
const SMOOTHING_KINDS = ['rampa', 'bevel', 'prisma'];

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
    objects: new Array(N).fill(null),
    smoothing: new Array(N).fill(null),
    patrols: [],
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
    objects: t.objects,
    smoothing: t.smoothing,
    patrols: t.patrols,
    spawn: t.spawn,
    sun: t.sun,
    quality: t.quality,
  };
}

/** Inverse of serialiseTilemap — reattach typed arrays. */
function deserialiseTilemap(o) {
  return {
    ...o,
    textures: Int8Array.from(o.textures),
    heights: Int16Array.from(o.heights),
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
  DEFAULT_SUN,
  TEXTURES,
  SKY_TEXTURE,
  WATER_TEXTURE,
  BEDROCK_TEXTURE,
  PALETTE,
  SPECIAL_OBJECTS,
  SMOOTHING_KINDS,
  makeEmptyTilemap,
  isWaterCell,
  serialiseTilemap,
  deserialiseTilemap,
};
