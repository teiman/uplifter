import { useSyncExternalStore } from 'react';
import {
  makeEmptyTilemap, deserialiseTilemap, BRUSH_PALETTE, PALETTE, SEA_LEVEL_H,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
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
  tool: 'paint',             // 'paint' (texture or object) | 'raise' | 'lower' | 'smooth'
  view: '2d',                // '2d' | '3d'
  heightDelta: 1,
  revision: 0,
};

const subscribers = new Set();
function notify() {
  state.revision++;
  for (const fn of subscribers) fn();
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
export function getTool()           { return state.tool; }
export function getView()           { return state.view; }
export function getHeightDelta()    { return state.heightDelta; }

// ---------- mutators ----------
export function setBrushIdx(idx) {
  state.selectedBrushIdx = idx;
  notify();
}

export function setTool(tool) {
  state.tool = tool;
  notify();
}

export function setView(view) {
  state.view = view;
  notify();
}

export function setHeightDelta(n) {
  state.heightDelta = n;
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
  notify();
}

/** Replace the current tilemap with a deserialised one (from disk). */
export function loadTilemap(serialised) {
  state.tilemap = deserialiseTilemap(serialised);
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
      const brush = BRUSH_PALETTE[state.selectedBrushIdx];
      if (!brush) return false;
      if (brush.type === 'texture') {
        const palIdx = PALETTE.findIndex(p => p.id === brush.id);
        if (palIdx < 0) return false;
        const palItem = PALETTE[palIdx];
        if (palItem.id === 'agua') {
          // Submerge: drop height below sea level, clear texture.
          if (t.heights[i] >= SEA_LEVEL_H) { t.heights[i] = SEA_LEVEL_H - 1; changed = true; }
          if (t.textures[i] !== -1)        { t.textures[i] = -1;             changed = true; }
        } else {
          if (t.textures[i] !== palIdx) { t.textures[i] = palIdx; changed = true; }
          if (t.heights[i] < SEA_LEVEL_H) { t.heights[i] = SEA_LEVEL_H; changed = true; }
        }
      } else if (brush.type === 'object') {
        const existing = t.objects[i];
        if (existing && existing.kind === brush.id) {
          // Toggle off — second click on same kind removes it.
          t.objects[i] = null;
          changed = true;
        } else {
          const newObj = { kind: brush.id };
          // Houses share a storey count with their 4-connected neighbours
          // (a "block" of contiguous houses uses the same building height).
          // Inherit from an existing neighbour if any; otherwise pick a
          // fresh random count in [2..4]. Persisted on the object so the
          // map compiles deterministically.
          if (brush.id === 'casa') {
            const inherited = houseStoreysFromNeighbours(t, col, row);
            newObj.storeys = inherited != null
              ? inherited
              : (HOUSE_STOREYS_MIN + Math.floor(Math.random() * (HOUSE_STOREYS_MAX - HOUSE_STOREYS_MIN + 1)));
          }
          t.objects[i] = newObj;
          changed = true;
          // Placing an object on a submerged cell makes no sense (it'd be
          // underwater). Snap the cell up to sea level if needed.
          if (t.heights[i] < SEA_LEVEL_H) {
            t.heights[i] = SEA_LEVEL_H;
            // Default a texture so the cell isn't bare on emergence.
            if (t.textures[i] < 0) {
              const dirtIdx = PALETTE.findIndex(p => p.id === 'tierra');
              if (dirtIdx >= 0) t.textures[i] = dirtIdx;
            }
          }
        }
      }
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
    default:
      break;
  }
  if (changed) notify();
  return changed;
}
