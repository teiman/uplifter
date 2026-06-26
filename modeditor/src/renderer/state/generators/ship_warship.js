/**
 * Warship (destroyer/frigate) generator.
 *
 * Stamps a single warship centered on the click cell.
 * Same fixed-stamp approach as ship_container.js — no flood fill.
 *
 * Deck elevation model (medium+ ships):
 *   forecastle  (dc 0 .. foreTurEnd)   : deckH+1 — raised bow platform
 *   main deck   (dc foreTurEnd .. aftDecEnd) : deckH
 *   quarterdeck (dc aftDecEnd .. L-1)  : deckH+1 — raised stern platform
 *
 * Layout along the long axis (dc = 0 at bow, dc = L-1 at stern):
 *   bow tip      (dc 0-1)              : metal, sharp taper (pointed)
 *   fore deck    (dc 2 .. L*0.15)      : metal
 *   fore turret  (dc L*0.15 .. L*0.30) : bunker 2 storeys, center 3 cells
 *   mid deck     (dc L*0.30 .. L*0.40) : metal (AA guns on sides)
 *   bridge       (dc L*0.40 .. L*0.60) : cuartel 4 storeys, center cells
 *   funnel       (dc L*0.60 .. +2)     : bunker 2 storeys, center cells
 *   aft deck     (dc +2 .. L*0.70)     : metal
 *   aft turret   (dc L*0.70 .. L*0.85) : bunker 2 storeys, center 3 cells
 *   stern        (dc L*0.85 .. L-1)    : metal, taper
 *
 * AA gun mounts: bunker 2 storeys on sides every ~4 cells in the mid section.
 * Hull edges (dr=0, dr=beam-1) are always metal (guard rail / hull plating).
 *
 * Radar: positions returned in `radarPositions` for the store to place
 * monster_rad entities. Bridge top always gets one; large/giant ships get
 * an additional foremast radar, giant ships also an aft-mast radar.
 */

import { PALETTE, SEA_LEVEL_H, HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX, encodeDeco }
  from '../../../shared/types.mjs';

function paletteIdxOf(id) { return PALETTE.findIndex(p => p.id === id); }
// Deck tile: the dedicated "barco" tile (steel deck top + hull sides w/
// waterline). Falls back to plain metal if 'barco' isn't in the palette.
const TEX_DECK = (paletteIdxOf('barco') >= 0) ? paletteIdxOf('barco') : paletteIdxOf('metal');

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

let CLICK_NONCE = 0;

export const WARSHIP_SIZES = {
  small:  { beam: 4,  length: 14 },
  medium: { beam: 6,  length: 22 },
  large:  { beam: 8,  length: 34 },
  giant:  { beam: 11, length: 50 },
};

/** Warships have a sharper bow taper than container ships. */
function bowTrim(dc, beam) {
  if (dc === 0) return Math.max(1, Math.floor(beam * 0.45));
  if (dc === 1) return Math.max(0, Math.floor(beam * 0.25));
  if (dc === 2) return Math.max(0, Math.floor(beam * 0.10));
  return 0;
}

function inHull(dc, dr, length, beam) {
  const fromStern = length - 1 - dc;
  const trim = Math.max(bowTrim(dc, beam), bowTrim(fromStern, beam));
  return dr >= trim && dr < beam - trim;
}

export function generateWarshipAt(tilemap, startCol, startRow, size = 'medium', orientation = 'rnd', deckH = 0) {
  const out = { modified: 0, dirtyCells: [], radarPositions: [] };
  const { cols, rows } = tilemap;
  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) return out;

  CLICK_NONCE = (CLICK_NONCE + 1) >>> 0;
  const rand = rng(
    ((startCol * 73856093) ^ (startRow * 19349663) ^ (CLICK_NONCE * 2654435761)) >>> 0
  );

  const dims = WARSHIP_SIZES[size] || WARSHIP_SIZES.medium;
  const { beam, length } = dims;
  const horizontal = orientation === 'h' ? true : orientation === 'v' ? false : rand() < 0.5;

  const shipW = horizontal ? length : beam;
  const shipH = horizontal ? beam   : length;
  const c0 = startCol - Math.floor(shipW / 2);
  const r0 = startRow - Math.floor(shipH / 2);
  const c1 = c0 + shipW - 1;
  const r1 = r0 + shipH - 1;

  if (c0 < 0 || r0 < 0 || c1 >= cols || r1 >= rows) return out;

  const toIdx = (col, row) => row * cols + col;
  const cellOf = (dc, dr) => horizontal ? [c0 + dc, r0 + dr] : [c0 + dr, r0 + dc];

  // Section boundaries
  const foreDecEnd   = Math.max(3,  Math.floor(length * 0.15));
  const foreTurStart = foreDecEnd;
  const foreTurEnd   = Math.floor(length * 0.30);
  const midDecEnd    = Math.floor(length * 0.40);
  const bridgeStart  = midDecEnd;
  const bridgeEnd    = Math.floor(length * 0.60);
  const aftDecEnd    = Math.floor(length * 0.70);
  const aftTurEnd    = Math.floor(length * 0.85);
  // stern: aftTurEnd to L-1

  // Multi-level deck: forecastle and quarterdeck raised by 1 for medium+ ships.
  // Small destroyers/frigates stay flat (too narrow to look good with levels).
  const useMultiDeck = size !== 'small';

  // Returns the floor height for a given dc position.
  const zoneH = (dc) => {
    if (!useMultiDeck) return deckH;
    if (dc < foreTurEnd) return deckH + 1;   // forecastle (bow + fore turret)
    if (dc >= aftDecEnd) return deckH + 1;   // quarterdeck (aft turret + stern)
    return deckH;                            // main deck
  };

  const center = Math.floor(beam / 2);
  const bridgeStoreys = Math.min(HOUSE_STOREYS_MAX, 4);
  const turretStoreys = Math.max(HOUSE_STOREYS_MIN, 2);

  // Funnel depth (cells aft of bridge): 1 for medium, 2 for large/giant.
  const funnelDepth = (size === 'large' || size === 'giant') ? 2 : 1;
  // Funnel half-width (cells each side of center): 0 for medium, 1 for large/giant.
  const funnelHW = (size === 'large' || size === 'giant') ? 1 : 0;
  const funnelEnd = Math.min(bridgeEnd + funnelDepth, aftDecEnd);

  // AA gun positions: sides every 4 cells in the mid section (fore turret → bridge).
  const aaPositions = new Set();
  for (let dc = foreTurEnd; dc < aftTurEnd; dc += 4) {
    aaPositions.add(dc);
  }

  const setMetal = (dc, dr) => {
    const h = zoneH(dc);
    const [col, row] = cellOf(dc, dr);
    const i = toIdx(col, row);
    let changed = false;
    if (tilemap.heights[i] < h) { tilemap.heights[i] = h; changed = true; }
    if (tilemap.textures[i] !== TEX_DECK) { tilemap.textures[i] = TEX_DECK; changed = true; }
    if (tilemap.objects[i]) { tilemap.objects[i] = null; changed = true; }
    if (changed) { out.dirtyCells.push({ col, row }); out.modified++; }
  };

  const setBuilding = (dc, dr, kind, storeys) => {
    const h = zoneH(dc);
    const [col, row] = cellOf(dc, dr);
    const i = toIdx(col, row);
    let changed = false;
    if (tilemap.heights[i] < h) { tilemap.heights[i] = h; changed = true; }
    if (tilemap.textures[i] !== TEX_DECK) { tilemap.textures[i] = TEX_DECK; changed = true; }
    const cur = tilemap.objects[i];
    if (!cur || cur.kind !== kind || cur.storeys !== storeys) {
      tilemap.objects[i] = { kind, storeys };
      changed = true;
    }
    if (changed) { out.dirtyCells.push({ col, row }); out.modified++; }
  };

  // Bevel ('wedge') en la celda (dc,dr) con la esquina cortada mirando al
  // agua. Igual que en ship_container: dir 0=NE 1=SE 2=SO 3=NO; la esquina
  // de mundo depende de la orientacion del barco. tip='bow'|'stern',
  // side='lo' (dr-) | 'hi' (dr+).
  const setBevel = (dc, dr, tip, side) => {
    if (!tilemap.decorations) return;
    const [col, row] = cellOf(dc, dr);
    const i = toIdx(col, row);
    let cornerDir;
    if (horizontal) {
      if (tip === 'bow')  cornerDir = (side === 'lo') ? 3 : 2;   // NO : SO
      else                cornerDir = (side === 'lo') ? 0 : 1;   // NE : SE
    } else {
      if (tip === 'bow')  cornerDir = (side === 'lo') ? 3 : 0;   // NO : NE
      else                cornerDir = (side === 'lo') ? 2 : 1;   // SO : SE
    }
    const code = encodeDeco('wedge', cornerDir);
    if (tilemap.decorations[i] !== code) {
      tilemap.decorations[i] = code;
      out.dirtyCells.push({ col, row });
      out.modified++;
    }
  };

  for (let dc = 0; dc < length; dc++) {
    for (let dr = 0; dr < beam; dr++) {
      if (!inHull(dc, dr, length, beam)) continue;

      const isEdge = dr === 0 || dr === beam - 1;

      if (dc < foreDecEnd || (dc >= funnelEnd && dc < aftDecEnd) || dc >= aftTurEnd) {
        // Fore deck / aft deck gap / stern: metal
        setMetal(dc, dr);
      } else if (dc >= bridgeEnd && dc < funnelEnd) {
        // Funnel zone: bunker on center cells, metal on edges
        const inFunnel = !isEdge && Math.abs(dr - center) <= funnelHW;
        if (inFunnel) setBuilding(dc, dr, 'bunker', 2);
        else setMetal(dc, dr);
      } else if (dc >= foreTurStart && dc < foreTurEnd) {
        // Fore turret: bunker in central 3 cells (or 1 for small ships)
        const turWidth = Math.min(3, beam - 2);
        const inTurret = !isEdge && Math.abs(dr - center) < Math.ceil(turWidth / 2);
        if (inTurret) setBuilding(dc, dr, 'bunker', turretStoreys);
        else setMetal(dc, dr);
      } else if (dc >= bridgeStart && dc < bridgeEnd) {
        // Bridge: cuartel in central cells (leave 1 edge each side)
        if (!isEdge) setBuilding(dc, dr, 'cuartel', bridgeStoreys);
        else setMetal(dc, dr);
      } else if (dc >= aftDecEnd && dc < aftTurEnd) {
        // Aft turret
        const turWidth = Math.min(3, beam - 2);
        const inTurret = !isEdge && Math.abs(dr - center) < Math.ceil(turWidth / 2);
        if (inTurret) setBuilding(dc, dr, 'bunker', turretStoreys);
        else setMetal(dc, dr);
      } else {
        // Mid deck area (foreTurEnd to bridgeStart): check AA gun positions on edges
        if (isEdge && aaPositions.has(dc)) {
          setBuilding(dc, dr, 'bunker', turretStoreys);
        } else {
          setMetal(dc, dr);
        }
      }
    }
  }

  // --- Beveles de proa y popa ---------------------------------------------
  // El taper deja escalones de 90° en las puntas; redondeamos cada esquina de
  // escalon con un bevel mirando al agua (mismo metodo que ship_container).
  const trimAt = (dc) => Math.max(bowTrim(dc, beam), bowTrim(length - 1 - dc, beam));
  for (let dc = 0; dc < length; dc++) {
    const trim = trimAt(dc);
    if (trim <= 0) continue;
    const tip = (dc <= length - 1 - dc) ? 'bow' : 'stern';
    const dcToward = (tip === 'bow') ? dc - 1 : dc + 1;
    const trimToward = (dcToward < 0 || dcToward >= length) ? beam : trimAt(dcToward);
    if (trimToward <= trim) continue;
    const loRow = trim;
    const hiRow = beam - 1 - trim;
    if (inHull(dc, loRow, length, beam)) setBevel(dc, loRow, tip, 'lo');
    if (hiRow !== loRow && inHull(dc, hiRow, length, beam)) setBevel(dc, hiRow, tip, 'hi');
  }

  // Radar positions — returned for the store to place monster_rad entities.
  // The radar coexists with the cuartel on the same cell (enemy entity vs. object).
  if (size !== 'small') {
    // Primary: bridge top (center of bridge island)
    const bridgeMidDc = Math.floor((bridgeStart + bridgeEnd) / 2);
    const [rc, rr] = cellOf(bridgeMidDc, center);
    out.radarPositions.push({ col: rc, row: rr });
  }
  if (size === 'large' || size === 'giant') {
    // Foremast: midpoint between fore turret and bridge
    const foremastDc = foreTurEnd + Math.floor((bridgeStart - foreTurEnd) / 2);
    if (foremastDc >= foreTurEnd && foremastDc < bridgeStart) {
      const [fc, fr] = cellOf(foremastDc, center);
      out.radarPositions.push({ col: fc, row: fr });
    }
  }
  if (size === 'giant') {
    // Aft mast: midpoint between bridge-end funnel and aft turret
    const aftmastDc = funnelEnd + Math.floor((aftDecEnd - funnelEnd) / 2);
    if (aftmastDc >= funnelEnd && aftmastDc < aftDecEnd) {
      const [ac, ar] = cellOf(aftmastDc, center);
      out.radarPositions.push({ col: ac, row: ar });
    }
  }

  return out;
}
