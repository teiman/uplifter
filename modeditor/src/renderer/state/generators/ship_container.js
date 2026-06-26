/**
 * Container ship generator.
 *
 * Stamps a single container ship centered on the click cell.
 * No flood fill — the ship has a fixed size dictated by the `size` param.
 * Works on water (height < 0), sea level and land; always raises ship
 * cells to SEA_LEVEL_H (0) so the deck floats correctly on water.
 *
 * Layout along the ship's long axis (dc = 0 at bow, dc = L-1 at stern):
 *   bow         (dc 0-1)               : metal only, tapered
 *   fore deck   (dc 2 .. L*0.20)       : metal only
 *   cargo       (dc L*0.20 .. L*0.75)  : contenedores 2-3 storeys
 *   bridge      (dc L*0.75 .. L*0.90)  : cuartel 3 storeys (full beam)
 *   stern       (dc L*0.90 .. L-1)     : metal only, tapered
 *
 * The beam is tapered at bow and stern: the extreme tip is only 3 cells
 * (or 1 for a small ship), widening to the full beam by dc=2.
 * Hull edges (dr=0, dr=beam-1) never carry containers.
 * A 1-cell walkway runs down the centre of the cargo section.
 *
 * Returns { modified, dirtyCells } like all other generators.
 */

import { PALETTE, SEA_LEVEL_H, HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX, encodeDeco }
  from '../../../shared/types.mjs';

function paletteIdxOf(id) { return PALETTE.findIndex(p => p.id === id); }
// Deck tile: the dedicated "barco" tile (steel deck + hull sides w/ waterline).
// Falls back to plain metal if 'barco' isn't in the palette.
const TEX_DECK = (paletteIdxOf('barco') >= 0) ? paletteIdxOf('barco') : paletteIdxOf('metal');

/** Mulberry32 PRNG */
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

export const CONTAINER_SHIP_SIZES = {
  small:  { beam: 5,  length: 16 },
  medium: { beam: 7,  length: 26 },
  large:  { beam: 9,  length: 38 },
  giant:  { beam: 13, length: 56 },
};

/**
 * How many rows to trim from each side at column-offset dc from an end.
 * dc=0 → heaviest taper, dc=1 → slight taper, dc>=2 → none.
 */
function bowTrim(dc, beam) {
  if (dc === 0) return Math.max(1, Math.floor(beam / 3));
  if (dc === 1) return Math.max(0, Math.floor(beam / 6));
  return 0;
}

/** Is cell (dc, dr) inside the ship hull? */
function inHull(dc, dr, length, beam) {
  const fromStern = length - 1 - dc;
  const trim = Math.max(bowTrim(dc, beam), bowTrim(fromStern, beam));
  return dr >= trim && dr < beam - trim;
}

export function generateContainerShipAt(tilemap, startCol, startRow, size = 'medium', orientation = 'rnd', deckH = 0) {
  const out = { modified: 0, dirtyCells: [] };
  const { cols, rows } = tilemap;
  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) return out;

  CLICK_NONCE = (CLICK_NONCE + 1) >>> 0;
  const rand = rng(
    ((startCol * 73856093) ^ (startRow * 19349663) ^ (CLICK_NONCE * 2654435761)) >>> 0
  );

  const dims = CONTAINER_SHIP_SIZES[size] || CONTAINER_SHIP_SIZES.medium;
  const { beam, length } = dims;
  const horizontal = orientation === 'h' ? true : orientation === 'v' ? false : rand() < 0.5;

  // Ship bounding box (c0,r0) to (c1,r1)
  const shipW = horizontal ? length : beam;
  const shipH = horizontal ? beam   : length;
  const c0 = startCol - Math.floor(shipW / 2);
  const r0 = startRow - Math.floor(shipH / 2);
  const c1 = c0 + shipW - 1;
  const r1 = r0 + shipH - 1;

  if (c0 < 0 || r0 < 0 || c1 >= cols || r1 >= rows) return out;  // out of map

  // Cell helpers — dc = distance from bow, dr = beam position
  const toIdx = (col, row) => row * cols + col;
  const cellOf = (dc, dr) => horizontal ? [c0 + dc, r0 + dr] : [c0 + dr, r0 + dc];

  const setMetal = (dc, dr) => {
    const [col, row] = cellOf(dc, dr);
    const i = toIdx(col, row);
    let changed = false;
    if (tilemap.heights[i] < deckH) { tilemap.heights[i] = deckH; changed = true; }
    if (tilemap.textures[i] !== TEX_DECK) { tilemap.textures[i] = TEX_DECK; changed = true; }
    if (tilemap.objects[i]) { tilemap.objects[i] = null; changed = true; }
    if (changed) { out.dirtyCells.push({ col, row }); out.modified++; }
  };

  const setBuilding = (dc, dr, kind, storeys) => {
    const [col, row] = cellOf(dc, dr);
    const i = toIdx(col, row);
    let changed = false;
    if (tilemap.heights[i] < deckH) { tilemap.heights[i] = deckH; changed = true; }
    if (tilemap.textures[i] !== TEX_DECK) { tilemap.textures[i] = TEX_DECK; changed = true; }
    const cur = tilemap.objects[i];
    if (!cur || cur.kind !== kind || cur.storeys !== storeys) {
      tilemap.objects[i] = { kind, storeys };
      changed = true;
    }
    if (changed) { out.dirtyCells.push({ col, row }); out.modified++; }
  };

  // Pone un bevel ('wedge') en la celda (dc,dr), con la esquina cortada
  // apuntando al AGUA segun de que punta/lado del casco sea. La celda ya es
  // hull (metal + altura), asi que solo escribimos la decoracion.
  //   tip   : 'bow' (proa, hacia dc-) | 'stern' (popa, hacia dc+)
  //   side  : 'lo'  (dr-, borde "bajo") | 'hi' (dr+, borde "alto")
  // La esquina del MUNDO que se corta depende de la orientacion del barco:
  // en horizontal dc va W→E (proa=oeste) y dr va N→S; en vertical dc va
  // N→S (proa=norte) y dr va W→E. encodeDeco usa dir 0=NE 1=SE 2=SO 3=NO.
  const setBevel = (dc, dr, tip, side) => {
    if (!tilemap.decorations) return;
    const [col, row] = cellOf(dc, dr);
    const i = toIdx(col, row);
    // Esquina de mundo a cortar (la que mira al agua) por (tip, side).
    let cornerDir;
    if (horizontal) {
      // proa=W, popa=E; dr 'lo'=N, 'hi'=S.
      if (tip === 'bow')  cornerDir = (side === 'lo') ? 3 : 2;   // NO : SO
      else                cornerDir = (side === 'lo') ? 0 : 1;   // NE : SE
    } else {
      // proa=N, popa=S; dr 'lo'=W, 'hi'=E.
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

  const center = Math.floor(beam / 2);

  // Section boundaries (in dc units)
  const foredeckEnd  = Math.max(3, Math.floor(length * 0.20));
  const cargoEnd     = Math.floor(length * 0.75);
  const bridgeEnd    = Math.floor(length * 0.90);
  // bridge storeys (3–4 depending on size)
  const bridgeStoreys = Math.min(HOUSE_STOREYS_MAX, beam >= 9 ? 4 : 3);
  // container storeys: 2 or 3 (seeded per cargo row)
  const ri = (n) => Math.floor(rand() * n);

  for (let dc = 0; dc < length; dc++) {
    for (let dr = 0; dr < beam; dr++) {
      if (!inHull(dc, dr, length, beam)) continue;

      if (dc < foredeckEnd || dc >= bridgeEnd) {
        // Bow / fore deck / stern: plain metal
        setMetal(dc, dr);
      } else if (dc < cargoEnd) {
        // Cargo section
        const isEdge   = dr === 0 || dr === beam - 1;
        const isWalkway = dr === center;
        if (isEdge || isWalkway) {
          setMetal(dc, dr);
        } else {
          const storeys = Math.max(HOUSE_STOREYS_MIN,
            Math.min(HOUSE_STOREYS_MAX, 2 + ri(2)));  // 2 or 3
          setBuilding(dc, dr, 'contenedores', storeys);
        }
      } else {
        // Bridge section (cuartel full-beam)
        setBuilding(dc, dr, 'cuartel', bridgeStoreys);
      }
    }
  }

  // --- Beveles de proa y popa ---------------------------------------------
  // El taper (bowTrim) deja escalones de 90° en las puntas. Redondeamos cada
  // ESQUINA del escalon con un bevel cuya esquina cortada mira al agua. Una
  // celda (dc, dr) del hull se bevela si es la esquina del borde recortado de
  // su columna Y la columna adyacente HACIA LA PUNTA esta mas recortada (hay
  // un escalon diagonal). Asi obtenemos la "escalera" de wedges que redondea
  // la punta — el mismo patron pintado a mano (proa NO/SO, popa NE/SE).
  const trimAt = (dc) => Math.max(bowTrim(dc, beam), bowTrim(length - 1 - dc, beam));
  for (let dc = 0; dc < length; dc++) {
    const trim = trimAt(dc);
    if (trim <= 0) continue;                       // columna a beam completa
    // De que punta esta cerca esta columna (para orientar la esquina cortada).
    const tip = (dc <= length - 1 - dc) ? 'bow' : 'stern';
    // La columna vecina hacia la punta: si esta MAS recortada, esta celda es
    // una esquina de escalon que hay que redondear.
    const dcToward = (tip === 'bow') ? dc - 1 : dc + 1;
    const trimToward = (dcToward < 0 || dcToward >= length)
      ? beam                                       // fuera del barco = todo agua
      : trimAt(dcToward);
    if (trimToward <= trim) continue;              // sin escalon diagonal aqui
    // Filas-esquina de esta columna: la primera (lo) y la ultima (hi) del hull.
    const loRow = trim;
    const hiRow = beam - 1 - trim;
    if (inHull(dc, loRow, length, beam)) setBevel(dc, loRow, tip, 'lo');
    if (hiRow !== loRow && inHull(dc, hiRow, length, beam)) setBevel(dc, hiRow, tip, 'hi');
  }

  return out;
}
