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

/** Random storeys per house cluster — atlasmapper uses 2..4 inclusive. */
export const HOUSE_STOREYS_MIN = 2;
export const HOUSE_STOREYS_MAX = 4;

export const OBJECT_BY_KIND = new Map(SPECIAL_OBJECTS.map(o => [o.kind, o]));

export const SMOOTHING_KINDS = ['rampa', 'bevel', 'prisma'];

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
  ...PALETTE.map(p => ({ type: 'texture', id: p.id, label: p.label, color: p.color })),
  ...SPECIAL_OBJECTS.map(o => ({ type: 'object', id: o.kind, label: o.label, color: o.color, glyph: o.glyph })),
  { type: 'spawn', id: 'spawn', label: 'Spawn', color: '#ff5050', glyph: '♟' },
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
  return {
    schemaVersion: o.schemaVersion ?? SCHEMA_VERSION,
    cols, rows,
    cellSize: o.cellSize ?? CELL_SIZE,
    textures,
    heights,
    // Migrate legacy object kinds renamed for shorter Quake texture
    // names: 'rascacielos' → 'tower'. Saved maps from before the
    // rename keep working without manual fix-up.
    objects:   migrateObjects(o.objects ?? new Array(N).fill(null)),
    smoothing: o.smoothing ?? new Array(N).fill(null),
    patrols:   o.patrols   ?? [],
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
    objects: t.objects,
    smoothing: t.smoothing,
    patrols: t.patrols,
    spawn: t.spawn,
    sun: t.sun,
    quality: t.quality,
    playArea: t.playArea,
  };
}
