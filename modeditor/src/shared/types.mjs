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

/**
 * Special objects placed in a cell. Each entry describes:
 *   - kind/label/glyph: identity for the UI palette.
 *   - color: 2D tint and 3D mesh fallback.
 *   - heightU: total height in Quake units above the cell's terrain top.
 *   - footprint: 0..1, fraction of the cell (in X/Y) the object occupies.
 *                Wide (~0.9) for buildings, narrow (~0.2) for poles/trunks.
 *   - tex: bare texture name (must exist in the WAD).
 *   - light: optional point light spec emitted with the brush.
 */
export const SPECIAL_OBJECTS = [
  { kind: 'casa',        label: 'Casa',        glyph: '⌂', color: '#c08c4a',
    heightU: 128, footprint: 0.9, tex: 'cement1' },
  { kind: 'rascacielos', label: 'Rascacielos', glyph: '▮', color: '#8888a0',
    heightU: 1024, footprint: 0.9, tex: 'cement1' },
  { kind: 'lampara',     label: 'Lámpara',     glyph: '✦', color: '#f0d870',
    heightU: 192, footprint: 0.18, tex: 'metal1_1',
    light: { offsetZ: 192, intensity: 350, color: '255 240 200' } },
  { kind: 'arbol',       label: 'Árbol',       glyph: '♣', color: '#3a8030',
    heightU: 192, footprint: 0.5, tex: 'dirt' },
  { kind: 'arbusto',     label: 'Arbusto',     glyph: '♠', color: '#4a7040',
    heightU: 32, footprint: 0.6, tex: 'dirt' },
  { kind: 'roca',        label: 'Roca',        glyph: '◆', color: '#7a7a7a',
    heightU: 48, footprint: 0.5, tex: 'dirt' },
];

export const OBJECT_BY_KIND = new Map(SPECIAL_OBJECTS.map(o => [o.kind, o]));

export const SMOOTHING_KINDS = ['rampa', 'bevel', 'prisma'];

/**
 * Unified palette item shape used by the LeftPanel and the 2D editor's
 * paint logic. Texturas and objetos coexist; only `type` differentiates
 * how applying it mutates the tilemap.
 *
 *   type: 'texture' | 'object'
 *   id:   palette key (texture id) or object kind
 *   label, color, glyph: visual
 */
export const BRUSH_PALETTE = [
  ...PALETTE.map(p => ({ type: 'texture', id: p.id, label: p.label, color: p.color })),
  ...SPECIAL_OBJECTS.map(o => ({ type: 'object', id: o.kind, label: o.label, color: o.color, glyph: o.glyph })),
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
    patrols: [],
    spawn: null,
    sun: { ...DEFAULT_SUN },
    quality: 'fast',
  };
}

export function isWaterCell(tilemap, idx) {
  return tilemap.heights[idx] < SEA_LEVEL_H;
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
  return {
    schemaVersion: o.schemaVersion ?? SCHEMA_VERSION,
    cols, rows,
    cellSize: o.cellSize ?? CELL_SIZE,
    textures,
    heights,
    objects:   o.objects   ?? new Array(N).fill(null),
    smoothing: o.smoothing ?? new Array(N).fill(null),
    patrols:   o.patrols   ?? [],
    spawn:     o.spawn     ?? null,
    sun:       o.sun       ?? { ...DEFAULT_SUN },
    quality:   o.quality   ?? 'fast',
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
    objects: t.objects,
    smoothing: t.smoothing,
    patrols: t.patrols,
    spawn: t.spawn,
    sun: t.sun,
    quality: t.quality,
  };
}
