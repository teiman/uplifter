/**
 * Military base generator. Contract identical to the city generator
 * (`generators/city.js`): flood the connected region under the click,
 * stamp military pieces, return { modified, dirtyCells }.
 *
 * Strategy (rewritten from scratch — no more rigid macro-zones):
 *
 *   1. Pave the WHOLE flooded region with `mil_camo` so the entire area
 *      reads as one continuous military footprint (no leftover dirt).
 *   2. Lay ONE runway across the region — orientation horizontal or
 *      vertical at random, full bbox span. Acts as a strong landmark.
 *   3. Scatter `pieces` at random positions across the bbox until the
 *      target density is met. Pieces are large and varied:
 *        - hangar_big   : 6×3 of `hangar` (long warehouse, greedy-mesh fused)
 *        - hangar_med   : 4×3 of `hangar` (smaller warehouse)
 *        - barracks     : 3×2 of `cuartel`
 *        - gama_row     : 1×5 of `bunker` (Greenham GAMA-style row)
 *        - parking      : 5×5 of `mil_tan` (vehicle apron, no buildings)
 *        - command      : 2×2 of `cuartel` storeys=4 (tall HQ block)
 *      Each piece carries its own "footprint+margin" rectangle. A new
 *      piece may only land if its rectangle doesn't overlap any prior
 *      one and stays clear of the runway. ~120 placement attempts per
 *      run gives a good fill without taking long.
 *   4. Decoration polish: every hangar gets a 1-cell `ramp` apron on
 *      the side facing the nearest runway (variation of silhouette).
 *
 * Seeding: PRNG mixes the click cell with a wall-clock-free monotonic
 * counter, so every click gives a different layout. Same map state
 * after Ctrl-Z + re-click → different result, by design.
 *
 * Pure function: returns { modified, dirtyCells }. Store wrapper handles
 * markChunkDirty + notify + undo snapshot.
 */

import {
  PALETTE,
  SEA_LEVEL_H,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
  encodeDeco,
} from '../../../shared/types.mjs';

function paletteIdxOf(id) {
  return PALETTE.findIndex(p => p.id === id);
}
const TEX = {
  road_up:    paletteIdxOf('road-up'),
  road_dl:    paletteIdxOf('road-dl'),
  road_x:     paletteIdxOf('road-x'),
  plaza:      paletteIdxOf('plaza'),       // base apron + perimeter wall
  mil_camo:   paletteIdxOf('mil_camo'),
  mil_tan:    paletteIdxOf('mil_tan'),
  mil_sand:   paletteIdxOf('mil_sand'),
  mil_bunker: paletteIdxOf('mil_bunker'),
};
const ROAD_TEX_SET = new Set([TEX.road_up, TEX.road_dl, TEX.road_x]);

const STOREYS_HANGAR  = Math.max(HOUSE_STOREYS_MIN, 2);
const STOREYS_BUNKER  = Math.max(HOUSE_STOREYS_MIN, 2);
const STOREYS_CUARTEL = Math.min(HOUSE_STOREYS_MAX, 3);
const STOREYS_COMMAND = Math.min(HOUSE_STOREYS_MAX, 4);

/** Mulberry32 — deterministic PRNG. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Monotonic counter so two clicks at the same cell don't repeat. We
// can't use Date.now()/Math.random() in this codebase, so a simple
// module-level uint32 does the job. Wraps after 4G clicks (= never).
let CLICK_NONCE = 0;

/** 4-connected flood — same predicate as city.js. */
function floodRegion(tilemap, startCol, startRow) {
  const { cols, rows, heights, textures, objects } = tilemap;
  const startIdx = startRow * cols + startCol;
  const seedH = heights[startIdx];
  const seedT = textures[startIdx];
  if (seedH < SEA_LEVEL_H) return null;
  if (objects[startIdx]) return null;
  const region = new Uint8Array(cols * rows);
  region[startIdx] = 1;
  const stack = [startIdx];
  while (stack.length > 0) {
    const i = stack.pop();
    const c = i % cols;
    const r = (i - c) / cols;
    const neighbours = [i - 1, i + 1, i - cols, i + cols];
    const nCols = [c - 1, c + 1, c, c];
    const nRows = [r, r, r - 1, r + 1];
    for (let k = 0; k < 4; k++) {
      const nc = nCols[k], nr = nRows[k];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = neighbours[k];
      if (region[ni]) continue;
      if (heights[ni] !== seedH) continue;
      if (textures[ni] !== seedT) continue;
      if (objects[ni]) continue;
      region[ni] = 1;
      stack.push(ni);
    }
  }
  return region;
}

function regionBounds(region, cols, rows) {
  let minC = cols, maxC = -1, minR = rows, maxR = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (region[r * cols + c]) {
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }
  }
  return { minC, maxC, minR, maxR };
}

/**
 * Drop a military base on the connected region under (startCol, startRow).
 */
export function generateMilitaryAt(tilemap, startCol, startRow) {
  const out = { modified: 0, dirtyCells: [] };
  const { cols, rows } = tilemap;
  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) return out;
  const region = floodRegion(tilemap, startCol, startRow);
  if (!region) return out;
  const bounds = regionBounds(region, cols, rows);
  if (bounds.maxC < 0) return out;

  const winW = bounds.maxC - bounds.minC + 1;
  const winH = bounds.maxR - bounds.minR + 1;
  if (winW < 8 || winH < 8) return out;                 // too small

  // PRNG: click cell + per-call nonce → every click is unique.
  CLICK_NONCE = (CLICK_NONCE + 1) >>> 0;
  const rand = rng(((startCol * 73856093) ^ (startRow * 19349663) ^ (CLICK_NONCE * 2654435761)) >>> 0);
  const ri = (n) => Math.floor(rand() * n);             // integer in [0, n)

  // ----- write helpers ---------------------------------------------
  const setTex = (col, row, texIdx) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const i = row * cols + col;
    if (!region[i]) return false;
    let changed = false;
    if (tilemap.textures[i] !== texIdx) {
      tilemap.textures[i] = texIdx;
      changed = true;
    }
    if (tilemap.objects[i]) {
      tilemap.objects[i] = null;
      changed = true;
    }
    if (changed) { out.dirtyCells.push({ col, row }); out.modified++; }
    return true;
  };
  const setBuilding = (col, row, kind, storeys, texIdx) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const i = row * cols + col;
    if (!region[i]) return false;
    let changed = false;
    if (texIdx != null && tilemap.textures[i] !== texIdx) {
      tilemap.textures[i] = texIdx;
      changed = true;
    }
    const cur = tilemap.objects[i];
    if (!cur || cur.kind !== kind || cur.storeys !== storeys) {
      tilemap.objects[i] = { kind, storeys };
      changed = true;
    }
    if (tilemap.decorations && tilemap.decorations[i] !== 0) {
      tilemap.decorations[i] = 0;
      changed = true;
    }
    if (changed) { out.dirtyCells.push({ col, row }); out.modified++; }
    return true;
  };
  const setDeco = (col, row, kind, dir) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const i = row * cols + col;
    if (!region[i]) return false;
    if (!tilemap.decorations) return false;
    if (tilemap.objects[i]) return false;
    const code = encodeDeco(kind, dir);
    if (tilemap.decorations[i] !== code) {
      tilemap.decorations[i] = code;
      out.dirtyCells.push({ col, row });
      out.modified++;
    }
    return true;
  };

  // ----- 1. Pave the whole flooded region with plaza ------------
  // Plaza is the standard "smooth concrete" biome in the editor —
  // matches what real airbase aprons look like in the reference photos
  // (Tonopah, Bagram) and ties the base into the rest of the city/road
  // palette visually. Camo green is reserved for HANGAR ROOFS only.
  for (let r = bounds.minR; r <= bounds.maxR; r++) {
    for (let c = bounds.minC; c <= bounds.maxC; c++) {
      if (region[r * cols + c]) setTex(c, r, TEX.plaza);
    }
  }

  // ----- occupancy mask (NOT region — for piece overlap) ---------
  // We re-use Uint8Array semantics: 0 = free, 1 = taken by a piece (incl
  // its margin), 2 = runway (no piece allowed and no other runway).
  const occ = new Uint8Array(cols * rows);

  // ----- 2. ONE runway across the region -------------------------
  // Orientation: prefer the longer axis. If E-W, the runway is a few
  // rows tall × the full bbox width. If N-S, swap. 3-cell thick.
  const RUN_THICK = 3;
  const horizontal = winW >= winH;
  let runR0, runR1, runC0, runC1;
  if (horizontal) {
    // Runway is centred vertically with a small random offset.
    const rOff = ri(Math.max(1, winH - RUN_THICK - 6));
    runR0 = bounds.minR + 3 + rOff;
    runR1 = runR0 + RUN_THICK - 1;
    runC0 = bounds.minC + 1;
    runC1 = bounds.maxC - 1;
    for (let r = runR0; r <= runR1; r++) {
      for (let c = runC0; c <= runC1; c++) {
        if (setTex(c, r, TEX.road_dl)) occ[r * cols + c] = 2;
      }
    }
  } else {
    const cOff = ri(Math.max(1, winW - RUN_THICK - 6));
    runC0 = bounds.minC + 3 + cOff;
    runC1 = runC0 + RUN_THICK - 1;
    runR0 = bounds.minR + 1;
    runR1 = bounds.maxR - 1;
    for (let r = runR0; r <= runR1; r++) {
      for (let c = runC0; c <= runC1; c++) {
        if (setTex(c, r, TEX.road_up)) occ[r * cols + c] = 2;
      }
    }
  }
  // 1-cell exclusion shoulder around the runway so pieces don't crowd it.
  const SHOULDER = 1;
  const inflateRunway = () => {
    for (let r = Math.max(bounds.minR, runR0 - SHOULDER); r <= Math.min(bounds.maxR, runR1 + SHOULDER); r++) {
      for (let c = Math.max(bounds.minC, runC0 - SHOULDER); c <= Math.min(bounds.maxC, runC1 + SHOULDER); c++) {
        if (region[r * cols + c] && occ[r * cols + c] === 0) occ[r * cols + c] = 2;
      }
    }
  };
  inflateRunway();

  // ----- 3. Piece catalogue --------------------------------------
  // Each piece carries: size (w,h), margin (gap around it), weight in
  // the random pick, and a stamp function. The stamp function gets the
  // top-left cell (c, r) and the region/occ guarantees that the
  // full piece footprint is free of other pieces / runway.
  const PIECES = [
    { id: 'hangar_big', w: 6, h: 3, margin: 2, weight: 5,
      stamp: (c, r) => {
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 6; dc++)
            setBuilding(c + dc, r + dr, 'hangar', STOREYS_HANGAR, TEX.mil_camo);
      } },
    { id: 'hangar_med', w: 4, h: 3, margin: 2, weight: 4,
      stamp: (c, r) => {
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 4; dc++)
            setBuilding(c + dc, r + dr, 'hangar', STOREYS_HANGAR, TEX.mil_camo);
      } },
    { id: 'barracks',   w: 3, h: 2, margin: 1, weight: 4,
      stamp: (c, r) => {
        // Plaza-paint the whole footprint, then stamp cuartel cells.
        for (let dr = 0; dr < 2; dr++)
          for (let dc = 0; dc < 3; dc++)
            setBuilding(c + dc, r + dr, 'cuartel', STOREYS_CUARTEL, TEX.mil_tan);
      } },
    { id: 'gama_row',   w: 5, h: 1, margin: 2, weight: 3,
      stamp: (c, r) => {
        // 3 bunkers spaced 2 cells apart on a tan strip.
        for (let dc = 0; dc < 5; dc++) setTex(c + dc, r, TEX.mil_tan);
        for (let dc = 0; dc < 5; dc += 2) {
          setBuilding(c + dc, r, 'bunker', STOREYS_BUNKER, TEX.mil_bunker);
        }
      } },
    { id: 'parking',    w: 5, h: 5, margin: 1, weight: 4,
      stamp: (c, r) => {
        // Just a tan paving patch — no buildings. Reads as a vehicle
        // parking apron once the surrounding camo paving touches it.
        for (let dr = 0; dr < 5; dr++)
          for (let dc = 0; dc < 5; dc++) setTex(c + dc, r + dr, TEX.mil_tan);
      } },
    { id: 'command',    w: 2, h: 2, margin: 2, weight: 2,
      stamp: (c, r) => {
        // 4-storey HQ — taller and chunkier than barracks.
        for (let dr = 0; dr < 2; dr++)
          for (let dc = 0; dc < 2; dc++)
            setBuilding(c + dc, r + dr, 'cuartel', STOREYS_COMMAND, TEX.mil_tan);
      } },
  ];
  const totalWeight = PIECES.reduce((s, p) => s + p.weight, 0);
  const pickPiece = () => {
    let t = rand() * totalWeight;
    for (const p of PIECES) {
      t -= p.weight;
      if (t <= 0) return p;
    }
    return PIECES[PIECES.length - 1];
  };

  // ----- 4. Scatter loop ------------------------------------------
  // Heuristic: ~120 attempts is enough to fill 30×30 → 60×60 plates
  // without slowing the editor. We stop early if 30 consecutive
  // attempts fail (the region is full).
  const ATTEMPTS = 200;
  const placed = [];                                    // { piece, c, r }
  let dryRun = 0;
  const fitsAt = (p, c, r) => {
    // Footprint inside region + all cells free in occ.
    for (let dr = -p.margin; dr < p.h + p.margin; dr++) {
      for (let dc = -p.margin; dc < p.w + p.margin; dc++) {
        const cc = c + dc, rr = r + dr;
        if (cc < bounds.minC || cc > bounds.maxC) return false;
        if (rr < bounds.minR || rr > bounds.maxR) return false;
        const i = rr * cols + cc;
        if (!region[i]) return false;
        // Inside the inner footprint (not the margin band): must be free.
        if (dr >= 0 && dr < p.h && dc >= 0 && dc < p.w) {
          if (occ[i] !== 0) return false;
        }
        // Inside the margin band: don't allow runway or other piece
        // bodies, but other pieces' margins are fine (overlap of
        // margins = pieces just touch their gap zones, that's OK).
        else {
          if (occ[i] === 2) return false;               // runway shoulder still off-limits
        }
      }
    }
    return true;
  };
  const markOcc = (p, c, r) => {
    for (let dr = 0; dr < p.h; dr++) {
      for (let dc = 0; dc < p.w; dc++) {
        occ[(r + dr) * cols + (c + dc)] = 1;
      }
    }
  };
  for (let a = 0; a < ATTEMPTS && dryRun < 40; a++) {
    const p = pickPiece();
    const c = bounds.minC + ri(Math.max(1, winW - p.w));
    const r = bounds.minR + ri(Math.max(1, winH - p.h));
    if (!fitsAt(p, c, r)) { dryRun++; continue; }
    dryRun = 0;
    p.stamp(c, r);
    markOcc(p, c, r);
    placed.push({ piece: p, c, r });
  }

  // ----- 5. Decoration polish ------------------------------------
  // For every hangar piece, drop a `ramp` deco on the cell just outside
  // the side facing the runway, so the hangar wall tapers up instead of
  // cubing in. Dir convention (encodeDeco): 0=N high, 1=E, 2=S, 3=W.
  // Apron ramp lives 1 cell OUTSIDE the hangar; its "high edge" points
  // AT the hangar (so the ramp rises toward it).
  for (const { piece, c, r } of placed) {
    if (!piece.id.startsWith('hangar')) continue;
    // Pick the side closest to the runway centre.
    const runCx = (runC0 + runC1) / 2;
    const runCy = (runR0 + runR1) / 2;
    const hCx = c + piece.w / 2;
    const hCy = r + piece.h / 2;
    const dx = runCx - hCx, dy = runCy - hCy;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        // Runway is to the W → ramp on W side, high edge facing E
        for (let dr = 0; dr < piece.h; dr++) setDeco(c - 1, r + dr, 'ramp', 1);
      } else {
        for (let dr = 0; dr < piece.h; dr++) setDeco(c + piece.w, r + dr, 'ramp', 3);
      }
    } else {
      if (dy < 0) {
        // Runway is to the N → ramp on N side, high edge facing S
        for (let dc = 0; dc < piece.w; dc++) setDeco(c + dc, r - 1, 'ramp', 2);
      } else {
        for (let dc = 0; dc < piece.w; dc++) setDeco(c + dc, r + piece.h, 'ramp', 0);
      }
    }
  }

  // ----- 6. Crossroad polish (same trick as city) ----------------
  const isRoad = (cc, rr) => {
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return false;
    return ROAD_TEX_SET.has(tilemap.textures[rr * cols + cc]);
  };
  for (let r = bounds.minR; r <= bounds.maxR; r++) {
    for (let c = bounds.minC; c <= bounds.maxC; c++) {
      if (!region[r * cols + c]) continue;
      if (!isRoad(c, r)) continue;
      const hAxis = isRoad(c - 1, r) || isRoad(c + 1, r);
      const vAxis = isRoad(c, r - 1) || isRoad(c, r + 1);
      if (hAxis && vAxis && tilemap.textures[r * cols + c] !== TEX.road_x) {
        tilemap.textures[r * cols + c] = TEX.road_x;
        out.dirtyCells.push({ col: c, row: r });
        out.modified++;
      }
    }
  }

  return out;
}
