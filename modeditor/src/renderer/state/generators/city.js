/**
 * City generator (port of atlasmaper's). Floods the cells connected
 * to a click that share the click cell's height + texture, then tiles
 * the region with a regular grid of blocks (rectangles of `casa`
 * objects, 1–3 storeys each) separated by 1-cell streets.
 *
 * Restrictions match the user's spec: it never crosses cells with a
 * different height or texture than the seed cell, and never
 * overrides cells that already host an object (existing buildings,
 * trees, lamps, … act as borders).
 *
 * Pure function on the tilemap-shape side: returns
 *   { modified, dirtyCells: [{col,row}, …] }
 * so the caller (store) can call markChunkDirty + notify exactly
 * once after we run.
 */

import {
  PALETTE,
  SEA_LEVEL_H,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
} from '../../../shared/types.mjs';

const ROAD_UP_ID = 'road-up';      // N-S street (vertical column of road)
const ROAD_DL_ID = 'road-dl';      // E-W street (horizontal row of road)
const ROAD_X_ID  = 'road-x';       // intersection

function paletteIdxOf(id) {
  return PALETTE.findIndex(p => p.id === id);
}

const ROAD_IDX = (() => {
  const up = paletteIdxOf(ROAD_UP_ID);
  const dl = paletteIdxOf(ROAD_DL_ID);
  const x  = paletteIdxOf(ROAD_X_ID);
  return { up, dl, x };
})();
const ROAD_TEX_SET = new Set([ROAD_IDX.up, ROAD_IDX.dl, ROAD_IDX.x]);

/** Mulberry32 — small deterministic PRNG. Same seed → same layout. */
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

/** 4-connected flood fill bounded by matching height + texture, and
 *  blocked by cells that already carry an object. */
function floodRegion(tilemap, startCol, startRow) {
  const { cols, rows, heights, textures, objects } = tilemap;
  const startIdx = startRow * cols + startCol;
  const seedH = heights[startIdx];
  const seedT = textures[startIdx];
  if (seedH < SEA_LEVEL_H) return null;       // submerged seed: refuse
  if (objects[startIdx]) return null;          // can't start on an existing object
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
 * Drop a city on the connected region under (startCol, startRow).
 * Returns the number of cells modified plus the list of cell coords
 * for chunk dirtying. Returns {modified: 0, dirtyCells: []} if the
 * seed is invalid (submerged / on an object / off-grid).
 */
export function generateCityAt(tilemap, startCol, startRow) {
  const out = { modified: 0, dirtyCells: [] };
  const { cols, rows } = tilemap;
  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) return out;
  const region = floodRegion(tilemap, startCol, startRow);
  if (!region) return out;

  const bounds = regionBounds(region, cols, rows);
  if (bounds.maxC < 0) return out;
  const rand = rng(startCol * 1000 + startRow);

  const setRoad = (col, row, idx) => {
    const i = row * cols + col;
    if (tilemap.textures[i] !== idx) {
      tilemap.textures[i] = idx;
      out.dirtyCells.push({ col, row });
      out.modified++;
    }
    // A road cell cannot host an object — clear any stray one.
    if (tilemap.objects[i]) {
      tilemap.objects[i] = null;
      out.dirtyCells.push({ col, row });
      out.modified++;
    }
  };
  const setHouse = (col, row, storeys) => {
    const i = row * cols + col;
    const cur = tilemap.objects[i];
    const sameStoreys = cur && cur.kind === 'casa' && cur.storeys === storeys;
    if (!sameStoreys) {
      tilemap.objects[i] = { kind: 'casa', storeys };
      out.dirtyCells.push({ col, row });
      out.modified++;
    }
  };

  // Tile the bbox in block slots. blockW/blockH vary per slot (2..4)
  // so the grid doesn't look mechanical. Each slot leaves 1 cell of
  // road on its east and south edges.
  let r = bounds.minR;
  while (r <= bounds.maxR) {
    const blockH = 2 + Math.floor(rand() * 3);   // 2..4 cells tall
    let c = bounds.minC;
    while (c <= bounds.maxC) {
      const blockW = 2 + Math.floor(rand() * 3); // 2..4 cells wide
      // Storey count for this whole block: skewed toward shorter.
      // 60% one storey, 30% two, 10% three. Clamped to HOUSE_STOREYS_*.
      const sr = rand();
      const rawStoreys = sr < 0.60 ? 1 : sr < 0.90 ? 2 : 3;
      const storeys = Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX, rawStoreys));

      // Houses fill the interior; occasional 5% chance of a stray
      // interior road cell adds some texture (only in slots large
      // enough for the gap to be readable).
      for (let dr = 0; dr < blockH; dr++) {
        for (let dc = 0; dc < blockW; dc++) {
          const cc = c + dc, rr = r + dr;
          if (cc > bounds.maxC || rr > bounds.maxR) continue;
          if (!region[rr * cols + cc]) continue;
          if (rand() < 0.05 && (blockW >= 3 || blockH >= 3)) {
            setRoad(cc, rr, ROAD_IDX.dl);
            continue;
          }
          setHouse(cc, rr, storeys);
        }
      }

      // East road column (between this slot and the next).
      const roadC = c + blockW;
      if (roadC <= bounds.maxC) {
        for (let dr = 0; dr < blockH; dr++) {
          const rr = r + dr;
          if (rr > bounds.maxR) continue;
          if (!region[rr * cols + roadC]) continue;
          setRoad(roadC, rr, ROAD_IDX.up);
        }
      }
      c += blockW + 1;
    }
    // South road row.
    const roadR = r + blockH;
    if (roadR <= bounds.maxR) {
      for (let cc = bounds.minC; cc <= bounds.maxC; cc++) {
        if (!region[roadR * cols + cc]) continue;
        setRoad(cc, roadR, ROAD_IDX.dl);
      }
    }
    r += blockH + 1;
  }

  // Promote any road cell with street neighbours on BOTH axes to a
  // crossroads texture. Operates only inside the flooded region so we
  // don't relabel pre-existing roads outside.
  const isRoad = (cc, rr) => {
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return false;
    return ROAD_TEX_SET.has(tilemap.textures[rr * cols + cc]);
  };
  for (let rr = bounds.minR; rr <= bounds.maxR; rr++) {
    for (let cc = bounds.minC; cc <= bounds.maxC; cc++) {
      if (!region[rr * cols + cc]) continue;
      if (!isRoad(cc, rr)) continue;
      const hAxis = isRoad(cc - 1, rr) || isRoad(cc + 1, rr);
      const vAxis = isRoad(cc, rr - 1) || isRoad(cc, rr + 1);
      if (hAxis && vAxis && tilemap.textures[rr * cols + cc] !== ROAD_IDX.x) {
        tilemap.textures[rr * cols + cc] = ROAD_IDX.x;
        out.dirtyCells.push({ col: cc, row: rr });
        out.modified++;
      }
    }
  }

  return out;
}
