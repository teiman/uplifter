import { useSyncExternalStore } from 'react';
import {
  makeEmptyTilemap, deserialiseTilemap, BRUSH_PALETTE, PALETTE, SEA_LEVEL_H,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX, MESH_CHUNK_SIZE,
  CELL_SIZE, HEIGHT_UNIT,
} from '../../shared/types.mjs';

/**
 * Minimal external store: mutable singleton + subscriber set. Components
 * read via useStore(selector) and re-render when notify() fires.
 *
 * Mutations on typed arrays (textures, heights) are in-place — we bump
 * a `revision` counter so React knows to re-run selectors.
 */
const state = {
  tilemap: makeEmptyTilemap(),
  selectedBrushIdx: 0,       // index into BRUSH_PALETTE
  mode: 'paint',             // 'paint' | 'height' | 'area' | 'copy' | '3d'
  tool: 'paint',             // when mode='paint':  'paint' | 'rect' | 'bucket'
                             // when mode='height': 'raise'|'lower'|'smooth'|'extend'|'rect'
                             // when mode='area':   always 'area' (no sub-tools)
                             // when mode='copy':   'copy' | 'paste'
                             // when mode='3d':     'perspective' | 'iso'
                             //
                             // 'rect' is a drag-rectangle sub-tool that
                             // exists in both 2D editing modes: in paint
                             // it fills the rect with the current brush;
                             // in height it sets every cell in the rect
                             // to rectTargetH.
                             //
                             // The 3D viewport is "just another mode": the
                             // view that renders the main canvas is derived
                             // from mode (3d when mode === '3d', else 2d).
                             // Within 3D mode, the tool picks the camera
                             // projection — perspective (walk-around) or
                             // iso (orthographic, classic 35.264°/45°).
  heightDelta: 1,
  // Target height for the 'extend' tool. Set by the first click of a
  // stroke (the cell under the cursor); kept across the drag so each
  // dragged-over cell gets the same height.
  extendTargetH: null,
  // Target height for the 'rect' tool in height mode. User-controlled
  // via the ribbon input. Applied to every cell inside the dragged
  // rectangle on mouseup.
  rectTargetH: 1,
  // Clipboard for the copy/paste mode. null = nothing copied yet.
  // Shape: { cols, rows, heights: Int16Array, textures: Int8Array,
  //          objects: Array(cols*rows), smoothing: Array(cols*rows) }
  clipboard: null,
  // Iso view yaw index: 0..3, mapped to 45°, 135°, 225°, 315°. Lets
  // the user rotate the isometric camera in 90° steps while keeping
  // the same focus point. Persisted so re-entering the iso tool
  // restores the last orientation.
  isoYawIdx: 0,
  // Shared 3D camera target world-space XY (Z reserved for future use).
  // Viewport3D mirrors its live camRef.target here so 2D can recenter
  // on the same world point when leaving 3D mode.
  camera3dTargetX: 0,
  camera3dTargetY: 0,
  // Live cell at the centre of the 2D viewport. Canvas2D mirrors this
  // every time its view changes so the 3D camera can recenter on the
  // same world point when the user switches to 3D mode.
  view2dCenterCol: 0,
  view2dCenterRow: 0,
  // One-shot focus requests, one per direction. Set by setMode on a
  // cross-view transition; the receiving viewport consumes (reads and
  // clears) it on its next mount. Kept separate so 2D↔3D toggles don't
  // step on each other.
  pendingFocusCell: null,        // for Canvas2D: { col, row }
  pendingFocus3dTarget: null,    // for Viewport3D: { x, y }
  revision: 0,
};

const subscribers = new Set();
function notify() {
  state.revision++;
  for (const fn of subscribers) fn();
}

// ---------- 3D mesh dirty tracking ----------
// Cell edits mark their chunk (cx,cy) as dirty here. Viewport3D drains
// the set every animation frame and rebuilds only those chunks.
const dirty3dChunks = new Set();
// When set, Viewport3D rebuilds every chunk + the water plane on its
// next frame and clears this flag. Used after resetMap/loadTilemap when
// the entire grid changes at once.
let fullRebuild3dRequested = false;

function markChunkDirty(col, row) {
  const cx = (col / MESH_CHUNK_SIZE) | 0;
  const cy = (row / MESH_CHUNK_SIZE) | 0;
  dirty3dChunks.add(`${cx},${cy}`);
}

/** Called by Viewport3D each frame. Returns the set of dirty chunk keys
 *  ("cx,cy"), then clears the internal set. */
export function drainDirty3dChunks() {
  const out = new Set(dirty3dChunks);
  dirty3dChunks.clear();
  return out;
}

/** Called by Viewport3D each frame. Returns true (and clears) if a full
 *  rebuild was requested since the last drain. */
export function takeFullRebuildRequest() {
  if (!fullRebuild3dRequested) return false;
  fullRebuild3dRequested = false;
  return true;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getSnapshot() {
  return state.revision;
}

/**
 * Subscribe to the store and run `selector` on every revision bump.
 *
 * Implementation note: we deliberately use `state.revision` as the
 * external snapshot (not the selector's return value), because most
 * selectors return live references into the store (tilemap, sun, etc.)
 * which never change identity even when their fields mutate. Using
 * revision as the snapshot guarantees React re-renders on every notify().
 */
export function useStore(selector) {
  useSyncExternalStore(subscribe, getSnapshot);
  return selector(state);
}

// ---------- accessors ----------
export function getTilemap()        { return state.tilemap; }
export function getBrushIdx()       { return state.selectedBrushIdx; }
export function getMode()           { return state.mode; }
export function getTool()           { return state.tool; }
/** Derived: the main canvas view ('2d' or '3d') is dictated by mode.
 *  Everything that's not 3D is a 2D-editing mode. */
export function getView()           { return state.mode === '3d' ? '3d' : '2d'; }
export function getHeightDelta()    { return state.heightDelta; }
export function getRectTargetH()    { return state.rectTargetH; }
export function getClipboard()      { return state.clipboard; }
export function getIsoYawIdx()      { return state.isoYawIdx; }

/** Rotate the iso camera by ±1 step (90° each). The view stays focused
 *  on the same world target because cameraEye is recomputed from
 *  yaw/pitch + target/distance; only the eye position moves. */
export function rotateIsoYaw(step) {
  state.isoYawIdx = ((state.isoYawIdx + step) % 4 + 4) % 4;
  notify();
}

// ---------- mutators ----------
export function setBrushIdx(idx) {
  state.selectedBrushIdx = idx;
  notify();
}

const VALID_MODES = new Set(['paint', 'height', 'area', 'copy', '3d']);

/**
 * Switch the top-level mode. Resets the sub-tool to the mode's default:
 *   paint  → 'paint'   (sub-tools: 'paint', 'rect')
 *   height → 'raise'   (sub-tools: 'raise', 'lower', 'smooth', 'extend', 'rect')
 *   area   → 'area'
 *   3d     → 'iso'     (sub-tools: 'iso', 'perspective')
 *
 * Unknown modes are coerced to 'paint' so callers can't leave the
 * editor in a state where no canvas handler picks up clicks.
 */
export function setMode(mode) {
  if (!VALID_MODES.has(mode)) mode = 'paint';
  if (state.mode === mode) return;
  const t = state.tilemap;
  const gridHalfX = (t.cols * CELL_SIZE) / 2;
  const gridHalfY = (t.rows * CELL_SIZE) / 2;
  // Leaving 3D for any 2D editing mode: stash the cell under the 3D
  // camera's target so Canvas2D can recenter on the same world spot
  // when it mounts.
  if (state.mode === '3d' && mode !== '3d') {
    const col = Math.floor((state.camera3dTargetX + gridHalfX) / CELL_SIZE);
    const ySouthIdx = Math.floor((state.camera3dTargetY + gridHalfY) / CELL_SIZE);
    const row = (t.rows - 1) - ySouthIdx;
    state.pendingFocusCell = { col, row };
  }
  // Entering 3D from any 2D mode: stash the world XY of the 2D
  // viewport's centre cell so Viewport3D can point its camera there
  // on mount.
  if (state.mode !== '3d' && mode === '3d') {
    const col = state.view2dCenterCol;
    const row = state.view2dCenterRow;
    const ySouthIdx = (t.rows - 1) - row;
    const x = -gridHalfX + (col + 0.5) * CELL_SIZE;
    const y = -gridHalfY + (ySouthIdx + 0.5) * CELL_SIZE;
    state.pendingFocus3dTarget = { x, y };
  }
  state.mode = mode;
  state.tool = (mode === 'paint')  ? 'paint'
             : (mode === 'height') ? 'raise'
             : (mode === 'area')   ? 'area'
             : (mode === 'copy')   ? 'copy'
             : (mode === '3d')     ? 'iso'
             :                       'paint';
  notify();
}

/** Viewport3D mirrors its live camera target world XY here every frame
 *  so 2D recentering on mode switch has a fresh value. Silent write —
 *  no notify(), since no React component reads this directly. */
export function setCamera3dTarget(x, y) {
  state.camera3dTargetX = x;
  state.camera3dTargetY = y;
}

/** Canvas2D mirrors the cell at the centre of its viewport here so 3D
 *  mount can pick it up. Silent. */
export function setView2dCenter(col, row) {
  state.view2dCenterCol = col;
  state.view2dCenterRow = row;
}

/** Canvas2D reads and clears this on mount. Returns null when there's
 *  no pending focus request. Clearing it on read prevents the focus
 *  from re-applying on subsequent remounts (e.g. re-running an effect). */
export function takePendingFocusCell() {
  const c = state.pendingFocusCell;
  state.pendingFocusCell = null;
  return c;
}

/** Viewport3D reads and clears this on mount. Same pattern as
 *  takePendingFocusCell, but in world XY for the 3D camera target. */
export function takePendingFocus3dTarget() {
  const t = state.pendingFocus3dTarget;
  state.pendingFocus3dTarget = null;
  return t;
}

export function setTool(tool) {
  state.tool = tool;
  notify();
}

export function setHeightDelta(n) {
  state.heightDelta = n;
  notify();
}

export function setRectTargetH(n) {
  state.rectTargetH = n;
  notify();
}

export function setSun(partial) {
  state.tilemap.sun = { ...state.tilemap.sun, ...partial };
  notify();
}

export function setQuality(q) {
  state.tilemap.quality = q;
  notify();
}

export function resetMap() {
  state.tilemap = makeEmptyTilemap();
  fullRebuild3dRequested = true;
  notify();
}

/** Replace the current tilemap with a deserialised one (from disk). */
export function loadTilemap(serialised) {
  state.tilemap = deserialiseTilemap(serialised);
  fullRebuild3dRequested = true;
  notify();
}

/** Set the playable area to the given inclusive cell rectangle.
 *  Order of corners doesn't matter; we normalise here.
 *  - `restrict` (default true): when on, mapWriter omits terrain cells
 *    outside the area.
 *  - `strict` (default true): on top of `restrict`, also shrinks the
 *    world box (sky walls/ceiling, bedrock, global water) to the area
 *    bounds. Much faster to compile because qbsp's `-subdivide` has
 *    far smaller faces to chew through. Off → the world box stays at
 *    the full ±WORLD_HALF. */
export function setPlayArea(c0, r0, c1, r1, restrict = true, strict = true) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  t.playArea = { c0: cMin, r0: rMin, c1: cMax, r1: rMax, restrict, strict };
  // 3D viewport filters geometry by playArea, so the area changing
  // means every chunk + the water plane must be re-built.
  fullRebuild3dRequested = true;
  notify();
}

/** Remove the playable area entirely. */
export function clearPlayArea() {
  state.tilemap.playArea = null;
  fullRebuild3dRequested = true;
  notify();
}

/** Toggle whether the area restricts compilation (or just shows in the
 *  editor as a reference). No-op when there's no area defined. */
export function setPlayAreaRestrict(restrict) {
  const a = state.tilemap.playArea;
  if (!a) return;
  a.restrict = !!restrict;
  notify();
}

/** Toggle the 'strict' flag — when on, the world box also shrinks to
 *  fit the area, dramatically speeding up compilation at the cost of
 *  the rest of the world being unreachable. */
export function setPlayAreaStrict(strict) {
  const a = state.tilemap.playArea;
  if (!a) return;
  a.strict = !!strict;
  notify();
}

/** Move the player spawn to the centre of (col, row) in world coords.
 *  The mapWriter re-derives Z at compile time, so we leave it null
 *  (and `angle` defaults to 0). */
function setSpawnToCell(col, row) {
  const t = state.tilemap;
  const gridHalfX = (t.cols * CELL_SIZE) / 2;
  const gridHalfY = (t.rows * CELL_SIZE) / 2;
  const x = -gridHalfX + col * CELL_SIZE + CELL_SIZE / 2;
  const ySouthIdx = (t.rows - 1) - row;
  const y = -gridHalfY + ySouthIdx * CELL_SIZE + CELL_SIZE / 2;
  t.spawn = { col, row, x, y, z: null, angle: 0 };
  notify();
}

/** Return the storeys count of any 4-connected neighbouring house, or
 *  null if none exists. Used to make contiguous houses share a height. */
function houseStoreysFromNeighbours(t, col, row) {
  const check = (cc, rr) => {
    if (cc < 0 || cc >= t.cols || rr < 0 || rr >= t.rows) return null;
    const o = t.objects[rr * t.cols + cc];
    return (o && o.kind === 'casa' && typeof o.storeys === 'number') ? o.storeys : null;
  };
  return check(col - 1, row) ?? check(col + 1, row) ?? check(col, row - 1) ?? check(col, row + 1);
}

/**
 * Apply the currently selected paint brush to a cell. Returns true if
 * anything changed.
 *
 * `toggleObject`:
 *   - true  (default for single-cell paint): clicking the same kind on a
 *     cell that already holds it removes the object.
 *   - false (used by fillRect): always set the object, never toggle.
 */
function applyPaintAtCell(col, row, { toggleObject } = { toggleObject: true }) {
  const t = state.tilemap;
  const i = row * t.cols + col;
  let changed = false;
  const brush = BRUSH_PALETTE[state.selectedBrushIdx];
  if (!brush) return false;
  if (brush.type === 'texture') {
    const palIdx = PALETTE.findIndex(p => p.id === brush.id);
    if (palIdx < 0) return false;
    // Painting a texture also lifts a submerged cell to sea level —
    // otherwise pintar on the default all-water map would produce no
    // visible cube. Use Altura tools to submerge or raise further.
    if (t.textures[i] !== palIdx) { t.textures[i] = palIdx; changed = true; }
    if (t.heights[i] < SEA_LEVEL_H) { t.heights[i] = SEA_LEVEL_H; changed = true; }
  } else if (brush.type === 'spawn') {
    // Spawn is a singleton — each click relocates the single
    // info_player_start to the centre of the clicked cell. Z is
    // re-derived by the mapWriter (mid-ceiling above the terrain).
    setSpawnToCell(col, row);
    // No per-chunk dirty needed (no geometry change); notify so any
    // overlay redraws.
    return false;
  } else if (brush.type === 'object') {
    const existing = t.objects[i];
    if (toggleObject && existing && existing.kind === brush.id) {
      t.objects[i] = null;
      changed = true;
    } else if (!existing || existing.kind !== brush.id) {
      const newObj = { kind: brush.id };
      if (brush.id === 'casa') {
        const inherited = houseStoreysFromNeighbours(t, col, row);
        newObj.storeys = inherited != null
          ? inherited
          : (HOUSE_STOREYS_MIN + Math.floor(Math.random() * (HOUSE_STOREYS_MAX - HOUSE_STOREYS_MIN + 1)));
      }
      t.objects[i] = newObj;
      changed = true;
      // Snap a submerged cell up so the object doesn't end up under
      // water. Pick a default 'tierra' texture if the cell was bare,
      // so the surface isn't empty on emergence.
      if (t.heights[i] < SEA_LEVEL_H) {
        t.heights[i] = SEA_LEVEL_H;
        if (t.textures[i] < 0) {
          const dirtIdx = PALETTE.findIndex(p => p.id === 'tierra');
          if (dirtIdx >= 0) t.textures[i] = dirtIdx;
        }
      }
    }
  }
  if (changed) markChunkDirty(col, row);
  return changed;
}

/**
 * Fill an axis-aligned cell rectangle with the currently selected brush.
 * Inclusive on both ends. Used by the 'rect' tool when the user releases
 * the mouse over the target rectangle.
 */
export function fillRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  let anyChanged = false;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      if (applyPaintAtCell(col, row, { toggleObject: false })) anyChanged = true;
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Bucket-fill: paint every cell 4-connected to (col, row) that shares
 * its current height AND texture index with the start cell. Submerged
 * starts are rejected (you can't bucket-fill ocean — use Altura tools
 * to raise the land first). For non-texture brushes (object/spawn) we
 * fall back to a single-cell apply so a click doesn't carpet half the
 * map with houses.
 */
export function floodFillPaint(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const i0 = row * t.cols + col;
  if (t.heights[i0] < SEA_LEVEL_H) return false;
  const brush = BRUSH_PALETTE[state.selectedBrushIdx];
  if (!brush || brush.type !== 'texture') {
    // Object/spawn brushes bypass the flood — same behaviour as a
    // regular single-cell paint.
    return applyToolAtCell(col, row);
  }
  const cols = t.cols;
  const rows = t.rows;
  const origH = t.heights[i0];
  const origT = t.textures[i0];
  const visited = new Uint8Array(cols * rows);
  const stack = [i0];
  visited[i0] = 1;
  let anyChanged = false;
  while (stack.length > 0) {
    const i = stack.pop();
    const cc = i % cols;
    const cr = (i - cc) / cols;
    if (applyPaintAtCell(cc, cr, { toggleObject: false })) anyChanged = true;
    const neighbours = [i - 1, i + 1, i - cols, i + cols];
    const nCols = [cc - 1, cc + 1, cc, cc];
    const nRows = [cr, cr, cr - 1, cr + 1];
    for (let k = 0; k < 4; k++) {
      const nc = nCols[k], nr = nRows[k];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = neighbours[k];
      if (visited[ni]) continue;
      if (t.heights[ni] !== origH || t.textures[ni] !== origT) continue;
      visited[ni] = 1;
      stack.push(ni);
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Set every cell in the inclusive rectangle to height `targetH`.
 * Submerging a cell strips its texture/object (consistent with the
 * 'lower' and 'extend' tools). Used by the rect-fill drag in height
 * mode.
 */
export function fillRectHeight(c0, r0, c1, r1, targetH) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  let anyChanged = false;
  for (let row = rMin; row <= rMax; row++) {
    for (let col = cMin; col <= cMax; col++) {
      const i = row * t.cols + col;
      if (t.heights[i] === targetH) continue;
      t.heights[i] = targetH;
      if (targetH < SEA_LEVEL_H) {
        t.textures[i] = -1;
        t.objects[i] = null;
      }
      markChunkDirty(col, row);
      anyChanged = true;
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/**
 * Copy/paste clipboard for the 'copy' mode.
 *
 * copyRect snapshots heights + textures + objects + smoothing for the
 * inclusive cell rectangle (any corner ordering). Objects are
 * deep-cloned so editing the live tilemap after a copy can't mutate
 * the clipboard. pasteAt drops the clipboard at (col, row) as the
 * top-left anchor, clipping at the tilemap edges.
 */
export function copyRect(c0, r0, c1, r1) {
  const t = state.tilemap;
  const cMin = Math.max(0, Math.min(c0, c1));
  const cMax = Math.min(t.cols - 1, Math.max(c0, c1));
  const rMin = Math.max(0, Math.min(r0, r1));
  const rMax = Math.min(t.rows - 1, Math.max(r0, r1));
  const cw = cMax - cMin + 1;
  const ch = rMax - rMin + 1;
  if (cw <= 0 || ch <= 0) return false;
  const heights   = new Int16Array(cw * ch);
  const textures  = new Int8Array (cw * ch);
  const objects   = new Array(cw * ch).fill(null);
  const smoothing = new Array(cw * ch).fill(null);
  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      const src = (rMin + r) * t.cols + (cMin + c);
      const dst = r * cw + c;
      heights[dst]  = t.heights[src];
      textures[dst] = t.textures[src];
      const so = t.objects[src];
      objects[dst]  = so ? { ...so } : null;
      smoothing[dst] = t.smoothing ? t.smoothing[src] : null;
    }
  }
  state.clipboard = { cols: cw, rows: ch, heights, textures, objects, smoothing };
  notify();
  return true;
}

export function pasteAt(col, row) {
  const cb = state.clipboard;
  if (!cb) return false;
  const t = state.tilemap;
  let anyChanged = false;
  for (let r = 0; r < cb.rows; r++) {
    for (let c = 0; c < cb.cols; c++) {
      const dc = col + c;
      const dr = row + r;
      if (dc < 0 || dc >= t.cols || dr < 0 || dr >= t.rows) continue;
      const src = r * cb.cols + c;
      const dst = dr * t.cols + dc;
      let cellChanged = false;
      if (t.heights[dst] !== cb.heights[src]) {
        t.heights[dst] = cb.heights[src];
        cellChanged = true;
      }
      if (t.textures[dst] !== cb.textures[src]) {
        t.textures[dst] = cb.textures[src];
        cellChanged = true;
      }
      const srcObj = cb.objects[src];
      // Object comparison: shallow-equal on (kind, storeys); cheaper
      // than a full deep diff and covers all the fields we care about.
      const dstObj = t.objects[dst];
      const objSame = !srcObj && !dstObj
        || (srcObj && dstObj && srcObj.kind === dstObj.kind && srcObj.storeys === dstObj.storeys);
      if (!objSame) {
        t.objects[dst] = srcObj ? { ...srcObj } : null;
        cellChanged = true;
      }
      if (t.smoothing && t.smoothing[dst] !== cb.smoothing[src]) {
        t.smoothing[dst] = cb.smoothing[src];
        cellChanged = true;
      }
      if (cellChanged) {
        markChunkDirty(dc, dr);
        anyChanged = true;
      }
    }
  }
  if (anyChanged) notify();
  return anyChanged;
}

/** Drop the clipboard. UI surface mostly for clarity. */
export function clearClipboard() {
  state.clipboard = null;
  notify();
}

/**
 * Apply the active tool at cell (col, row). Idempotent within a stroke
 * for paint; additive for raise/lower (drag keeps raising).
 *
 * Painting with an object brush:
 *   - first click on an empty cell  → place the object.
 *   - click on a cell already holding the SAME kind → remove it.
 *   - click on a cell holding a DIFFERENT object → replace.
 *
 * Returns true if anything changed.
 */
export function applyToolAtCell(col, row) {
  const t = state.tilemap;
  if (col < 0 || col >= t.cols || row < 0 || row >= t.rows) return false;
  const i = row * t.cols + col;
  let changed = false;
  switch (state.tool) {
    case 'paint': {
      changed = applyPaintAtCell(col, row);
      break;
    }
    case 'rect': {
      // Single-click in rect mode is a no-op. The fill happens on
      // mouse-up via fillRect(). Marking changed=false avoids redraws.
      break;
    }
    case 'area': {
      // Same shape as 'rect': mouseup handler on the canvas calls
      // setPlayArea() with the drag bounds. Single-click is a no-op.
      break;
    }
    case 'raise': {
      t.heights[i] += state.heightDelta;
      changed = true;
      break;
    }
    case 'lower': {
      t.heights[i] -= state.heightDelta;
      if (t.heights[i] < SEA_LEVEL_H) {
        t.textures[i] = -1;
        t.objects[i] = null;  // submerged: objects vanish.
      }
      changed = true;
      break;
    }
    case 'smooth': {
      let sum = t.heights[i];
      let count = 1;
      const push = (cc, rr) => {
        if (cc < 0 || cc >= t.cols || rr < 0 || rr >= t.rows) return;
        sum += t.heights[rr * t.cols + cc];
        count++;
      };
      push(col - 1, row);
      push(col + 1, row);
      push(col, row - 1);
      push(col, row + 1);
      const avg = Math.round(sum / count);
      if (avg !== t.heights[i]) { t.heights[i] = avg; changed = true; }
      break;
    }
    case 'extend': {
      // The first click of a stroke captures the cell's current height
      // as the target. Subsequent cells dragged over snap to that
      // height — handy for flattening or extending a plateau.
      if (state.extendTargetH == null) {
        state.extendTargetH = t.heights[i];
      } else if (t.heights[i] !== state.extendTargetH) {
        t.heights[i] = state.extendTargetH;
        // Submerging a cell strips its surface state, consistent with
        // the 'lower' tool.
        if (t.heights[i] < SEA_LEVEL_H) {
          t.textures[i] = -1;
          t.objects[i] = null;
        }
        changed = true;
      }
      break;
    }
    default:
      break;
  }
  if (changed) {
    markChunkDirty(col, row);
    notify();
  }
  return changed;
}

/** Called by the canvas when the mouse button is released. Clears
 *  per-stroke state so the next drag starts fresh. */
export function endStroke() {
  if (state.extendTargetH != null) {
    state.extendTargetH = null;
    // No notify — visual state didn't change, only intent.
  }
}
