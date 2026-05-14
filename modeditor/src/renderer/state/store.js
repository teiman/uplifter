import { useSyncExternalStore } from 'react';
import { makeEmptyTilemap, PALETTE, SEA_LEVEL_H } from '../../shared/types.mjs';

/**
 * Minimal external store: mutable singleton + subscriber set. Components
 * read via useStore(selector) and re-render when notify() fires.
 *
 * Mutations on typed arrays (textures, heights) are in-place — we bump
 * a `revision` counter so React knows to re-run selectors.
 */
const state = {
  tilemap: makeEmptyTilemap(),
  selectedPaletteIdx: 0,     // PALETTE index, -1 = none
  tool: 'paint',             // 'paint' | 'raise' | 'lower' | 'smooth'
  heightDelta: 1,            // how much each raise/lower click changes
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

export function useStore(selector) {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------- accessors ----------
export function getTilemap()        { return state.tilemap; }
export function getPaletteIdx()     { return state.selectedPaletteIdx; }
export function getTool()           { return state.tool; }
export function getHeightDelta()    { return state.heightDelta; }

// ---------- mutators ----------
export function setPaletteIdx(idx) {
  state.selectedPaletteIdx = idx;
  notify();
}

export function setTool(tool) {
  state.tool = tool;
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

/**
 * Apply the active tool at cell (col, row). Designed for use from mouse
 * drag handlers — idempotent within a stroke (texture paint), additive
 * for raise/lower (so dragging keeps raising).
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
      const idx = state.selectedPaletteIdx;
      if (idx < 0) return false;
      const tex = PALETTE[idx];
      // Painting 'agua' is shorthand for "submerge": drop height below sea level.
      if (tex.id === 'agua') {
        if (t.heights[i] >= SEA_LEVEL_H) { t.heights[i] = SEA_LEVEL_H - 1; changed = true; }
        if (t.textures[i] !== -1)        { t.textures[i] = -1;             changed = true; }
      } else {
        if (t.textures[i] !== idx) { t.textures[i] = idx; changed = true; }
        // Emerge the cell if it was submerged.
        if (t.heights[i] < SEA_LEVEL_H) { t.heights[i] = SEA_LEVEL_H; changed = true; }
      }
      break;
    }
    case 'raise': {
      t.heights[i] += state.heightDelta;
      // Re-emerging from water? Clear water styling — caller will pick a texture.
      changed = true;
      break;
    }
    case 'lower': {
      t.heights[i] -= state.heightDelta;
      if (t.heights[i] < SEA_LEVEL_H) t.textures[i] = -1; // submerged → no texture
      changed = true;
      break;
    }
    case 'smooth': {
      // Average with 4-neighbours, round to int.
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
