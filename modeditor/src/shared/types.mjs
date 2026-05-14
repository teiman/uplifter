// ESM mirror of types.js for the Vite-built renderer. Keep in sync
// with types.js — same constants, same logic. We duplicate (rather
// than transpile/import) to keep the build simple: no commonjs plugin,
// no dynamic require, just two files.

export const SCHEMA_VERSION = 1;
export const CELL_SIZE = 64;
export const WORLD_HALF = 16384;
export const DEFAULT_COLS = 64;
export const DEFAULT_ROWS = 64;
export const HEIGHT_UNIT = 64;
export const SEA_LEVEL_H = 0;
export const SEA_LEVEL_Z = SEA_LEVEL_H * HEIGHT_UNIT;
export const BEDROCK_TOP_Z = -2 * HEIGHT_UNIT;
export const BEDROCK_THICKNESS = 64;
export const SKY_HEIGHT = 4096;
export const SKY_TOP_Z = SEA_LEVEL_Z + SKY_HEIGHT;
export const SKY_WALL_THICKNESS = 64;

export const DEFAULT_SUN = {
  intensity: 250,
  mangle: '215 -45 0',
  color: '255 240 200',
  penumbra: 3,
  sunlight2: 80,
  sunlight2Color: '180 210 255',
};

export const TEXTURES = {
  tierra: 'dirt',
  arena: 'sand',
  agua: '*water',
  'road-up': 'road_up',
  'road-down-left': 'road_left',
  'road-x': 'roadx',
  metal: 'metal1_1',
  plaza: 'cement1',
};

export const SKY_TEXTURE = 'sky_auto';
export const WATER_TEXTURE = '*water';
export const BEDROCK_TEXTURE = 'dirt';

export const PALETTE = [
  { id: 'tierra',           label: 'Tierra',        tex: TEXTURES.tierra,            color: '#7a5a3a' },
  { id: 'arena',            label: 'Arena',         tex: TEXTURES.arena,             color: '#d9c47a' },
  { id: 'agua',             label: 'Agua',          tex: TEXTURES.agua,              color: '#3a6da5' },
  { id: 'road-up',          label: 'Road ↑',   tex: TEXTURES['road-up'],        color: '#444444' },
  { id: 'road-down-left',   label: 'Road ↙',   tex: TEXTURES['road-down-left'], color: '#555555' },
  { id: 'road-x',           label: 'Road ✕',   tex: TEXTURES['road-x'],         color: '#3a3a3a' },
  { id: 'metal',            label: 'Metal',         tex: TEXTURES.metal,             color: '#6b6b78' },
  { id: 'plaza',            label: 'Plaza',         tex: TEXTURES.plaza,             color: '#a8a89a' },
];

export const SPECIAL_OBJECTS = [
  { kind: 'casa',        label: 'Casa' },
  { kind: 'rascacielos', label: 'Rascacielos' },
  { kind: 'lampara',     label: 'Lámpara' },
  { kind: 'arbol',       label: 'Árbol' },
  { kind: 'arbusto',     label: 'Arbusto' },
  { kind: 'roca',        label: 'Roca' },
];

export const SMOOTHING_KINDS = ['rampa', 'bevel', 'prisma'];

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
    patrols: [],
    spawn: null,
    sun: { ...DEFAULT_SUN },
    quality: 'fast',
  };
}

export function isWaterCell(tilemap, idx) {
  return tilemap.heights[idx] < SEA_LEVEL_H;
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
    objects: t.objects,
    smoothing: t.smoothing,
    patrols: t.patrols,
    spawn: t.spawn,
    sun: t.sun,
    quality: t.quality,
  };
}
