/**
 * Build flat meshes (positions, normals, colours) from a TilemapData for
 * the 3D viewport. The world is split into MESH_CHUNK_SIZE-sided chunks
 * so editing a cell only rebuilds its chunk, not the whole world. The
 * global water plane lives in its own one-off mesh.
 *
 * Coordinate convention matches the .map writer:
 *   - X/Y: world units, grid centred on origin.
 *   - Z: up. Sea level at SEA_LEVEL_Z = 0. Bedrock at BEDROCK_TOP_Z = -128.
 *   - Row 0 maps to the NORTH edge (largest +Y).
 *
 * Mesh buffers per chunk / water:
 *   positions: Float32Array  (3 * vertexCount)
 *   normals:   Float32Array  (3 * vertexCount)
 *   colors:    Float32Array  (3 * vertexCount, in 0..1 range)
 *   indices:   Uint32Array
 *
 * Vertex count is 24 per box (6 faces × 4 corners) so each face has its
 * own normal & colour. Indices are 36 per box.
 */

import {
  CELL_SIZE, HEIGHT_UNIT, WORLD_HALF, SEA_LEVEL_H, SEA_LEVEL_Z,
  BEDROCK_TOP_Z, SKY_TOP_Z,
  PALETTE, OBJECT_BY_KIND,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
  MESH_CHUNK_SIZE,
  pickFaceTextures,
  decodeDeco,
} from '../../shared/types.mjs';

/**
 * Mapea un (kind, dir) de preparacion_iso a la direccion de pushWedge
 * (tetraedro con esquina alta). Encajan aqui:
 *   - `ramp` (cuña cardinal)
 *   - `corner_out` (pico unico)
 *   - `ramp_diag` (rampa diagonal — misma geometria que corner_out
 *     cuando se aplica Erosion sobre un heightmap)
 * Solo `corner_in` usa geometria distinta (pushCornerIn).
 */
function kindToRampDirection(kind, dir) {
  if (kind === 'ramp') return ['n','e','s','w'][dir] || null;
  if (kind === 'corner_out' || kind === 'ramp_diag')
    return ['ne','se','sw','nw'][dir] || null;
  return null;
}

export const SKY_COLOR = [0.47, 0.71, 0.90];
const WATER_COLOR    = [0.18, 0.40, 0.62];
const DEFAULT_LAND   = [0.36, 0.30, 0.20];

/** Number of cubes from BEDROCK_TOP_Z up to SEA_LEVEL_Z. Mirrors the
 *  constant used in mapWriter so the stack-cube indexing is identical. */
const SEAL_CUBES = -BEDROCK_TOP_Z / HEIGHT_UNIT;

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function scaleRgb(rgb, k) {
  return [
    Math.min(1, rgb[0] * k),
    Math.min(1, rgb[1] * k),
    Math.min(1, rgb[2] * k),
  ];
}

/** Derive the 5 face colours for a biome from its base hex. The
 *  multipliers mirror the visual hierarchy described in column.md:
 *  capital lighter, base/side a touch darker, bottom very dark
 *  (rarely seen). The 3D preview is flat-shaded; these tints are the
 *  only cue distinguishing the parts of a column. */
function biomeColorsFromHex(hex) {
  const base = hexToRgb(hex);
  return {
    top:     base,
    side:    scaleRgb(base, 0.85),
    capital: scaleRgb(base, 1.18),
    base:    scaleRgb(base, 0.92),
    bottom:  scaleRgb(base, 0.55),
  };
}

const PALETTE_COLORS = PALETTE.map(p => biomeColorsFromHex(p.color));
const OBJECT_COLORS = new Map();
for (const [k, o] of OBJECT_BY_KIND) {
  OBJECT_COLORS.set(k, biomeColorsFromHex(o.color));
}
const FALLBACK_COLORS = biomeColorsFromHex('#7a5a3a');

/** Mutable builder accumulator; finalise() converts to typed arrays. */
function makeBuilder() {
  return { positions: [], normals: [], colors: [], indices: [], vertexCount: 0 };
}
function finaliseBuilder(b) {
  return {
    positions: new Float32Array(b.positions),
    normals:   new Float32Array(b.normals),
    colors:    new Float32Array(b.colors),
    indices:   new Uint32Array(b.indices),
    vertexCount: b.vertexCount,
    triangleCount: b.indices.length / 3,
  };
}

/**
 * Push an axis-aligned box's 6 faces.
 *
 *   colors: either a single [r,g,b] (used on every face) OR an object
 *           { top, side, bottom } with one [r,g,b] per face group.
 *           Side colour is shared across the 4 lateral faces.
 */
/**
 * Empuja un triangulo al buffer (helper para wedges/tetraedros donde no
 * todas las caras son quads).
 */
function pushTri(out, p1, p2, p3, n, rgb) {
  const base = out.vertexCount;
  for (const [px, py, pz] of [p1, p2, p3]) {
    out.positions.push(px, py, pz);
    out.normals.push(n[0], n[1], n[2]);
    out.colors.push(rgb[0], rgb[1], rgb[2]);
    out.vertexCount++;
  }
  out.indices.push(base, base + 1, base + 2);
}

function pushQuad(out, p1, p2, p3, p4, n, rgb) {
  const base = out.vertexCount;
  for (const [px, py, pz] of [p1, p2, p3, p4]) {
    out.positions.push(px, py, pz);
    out.normals.push(n[0], n[1], n[2]);
    out.colors.push(rgb[0], rgb[1], rgb[2]);
    out.vertexCount++;
  }
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Normaliza un vector 3D. Si nulo, devuelve [0,0,1].
function _normalize(v) {
  const m = Math.hypot(v[0], v[1], v[2]);
  if (m === 0) return [0, 0, 1];
  return [v[0]/m, v[1]/m, v[2]/m];
}

// Normal del plano que pasa por 3 puntos (CCW desde fuera).
function _triNormal(p1, p2, p3) {
  const u = [p2[0]-p1[0], p2[1]-p1[1], p2[2]-p1[2]];
  const v = [p3[0]-p1[0], p3[1]-p1[1], p3[2]-p1[2]];
  return _normalize([
    u[1]*v[2] - u[2]*v[1],
    u[2]*v[0] - u[0]*v[2],
    u[0]*v[1] - u[1]*v[0],
  ]);
}

/**
 * Emite una cuña (rampa) en (x0,y0,z0)-(x1,y1,z1) con la cresta alta
 * indicada por `direction`. Misma convencion que rampBrush de atlasmaper:
 *   'n' → arista N alta (y=y1), 's' → arista S alta (y=y0),
 *   'e' → arista E alta (x=x1), 'w' → arista O alta (x=x0).
 *   'ne'/'nw'/'se'/'sw' → esquina diagonal alta (tetraedro).
 * Las caras CCW vistas desde fuera del solido.
 */
/**
 * Brush "corner_in" (3 esquinas altas, 1 baja) en la celda. Geometria
 * inversa al tetraedro de corner_out: cubo lleno con la esquina opuesta
 * a `dir` recortada por un plano de clip diagonal.
 *
 * dir indica la esquina ALTA puntiaguda (la opuesta a la cortada):
 *   0 = NE alto, SO baja.
 *   1 = SE alto, NO baja.
 *   2 = SO alto, NE baja.
 *   3 = NO alto, SE baja.
 *
 * Convencion mundo (igual que mapWriter): +Y norte, +X este.
 *   NW=(x0,y1), NE=(x1,y1), SE=(x1,y0), SO=(x0,y0).
 */
function pushCornerIn(out, x0, y0, z0, x1, y1, z1, dir, colors) {
  const topRgb    = Array.isArray(colors) ? colors : colors.top    ?? colors.side;
  const sideRgb   = Array.isArray(colors) ? colors : colors.side;
  const bottomRgb = Array.isArray(colors) ? colors : colors.bottom ?? colors.side;
  const NWb=[x0,y1,z0], NEb=[x1,y1,z0], SEb=[x1,y0,z0], SOb=[x0,y0,z0];
  const NWt=[x0,y1,z1], NEt=[x1,y1,z1], SEt=[x1,y0,z1], SOt=[x0,y0,z1];
  // 3 esquinas altas (forman la tapa triangular), 1 esquina baja cortada.
  // alt1-alt3 en orden CCW desde arriba para que la normal apunte a +z.
  // wallA/B = paredes completas adyacentes a alt2 (la esquina central).
  // wallC/D = paredes triangulares adyacentes a lowB (la cortada).
  let lowB, alt1, alt2, alt3;
  let wallA_b1, wallA_b2, wallA_t1, wallA_t2;
  let wallB_b1, wallB_b2, wallB_t1, wallB_t2;
  let wallC_b, wallC_t, wallD_b, wallD_t;
  let wallA_n, wallB_n, wallC_n, wallD_n;
  if (dir === 0) {
    // NE alto. Tapa NW-NE-SE. Baja SO.
    lowB = SOb;
    alt1 = NWt; alt2 = NEt; alt3 = SEt;
    wallA_b1 = NWb; wallA_b2 = NEb; wallA_t1 = NEt; wallA_t2 = NWt; wallA_n = [0,1,0];
    wallB_b1 = NEb; wallB_b2 = SEb; wallB_t1 = SEt; wallB_t2 = NEt; wallB_n = [1,0,0];
    wallC_b = NWb; wallC_t = NWt; wallC_n = [-1,0,0];
    wallD_b = SEb; wallD_t = SEt; wallD_n = [0,-1,0];
  } else if (dir === 1) {
    // SE alto. Tapa NE-SE-SO. Baja NW.
    lowB = NWb;
    alt1 = NEt; alt2 = SEt; alt3 = SOt;
    wallA_b1 = NEb; wallA_b2 = SEb; wallA_t1 = SEt; wallA_t2 = NEt; wallA_n = [1,0,0];
    wallB_b1 = SEb; wallB_b2 = SOb; wallB_t1 = SOt; wallB_t2 = SEt; wallB_n = [0,-1,0];
    wallC_b = NEb; wallC_t = NEt; wallC_n = [0,1,0];
    wallD_b = SOb; wallD_t = SOt; wallD_n = [-1,0,0];
  } else if (dir === 2) {
    // SO alto. Tapa SE-SO-NW. Baja NE.
    lowB = NEb;
    alt1 = SEt; alt2 = SOt; alt3 = NWt;
    wallA_b1 = SEb; wallA_b2 = SOb; wallA_t1 = SOt; wallA_t2 = SEt; wallA_n = [0,-1,0];
    wallB_b1 = SOb; wallB_b2 = NWb; wallB_t1 = NWt; wallB_t2 = SOt; wallB_n = [-1,0,0];
    wallC_b = SEb; wallC_t = SEt; wallC_n = [1,0,0];
    wallD_b = NWb; wallD_t = NWt; wallD_n = [0,1,0];
  } else {
    // NO alto. Tapa SO-NW-NE. Baja SE.
    lowB = SEb;
    alt1 = SOt; alt2 = NWt; alt3 = NEt;
    wallA_b1 = SOb; wallA_b2 = NWb; wallA_t1 = NWt; wallA_t2 = SOt; wallA_n = [-1,0,0];
    wallB_b1 = NWb; wallB_b2 = NEb; wallB_t1 = NEt; wallB_t2 = NWt; wallB_n = [0,1,0];
    wallC_b = SOb; wallC_t = SOt; wallC_n = [0,-1,0];
    wallD_b = NEb; wallD_t = NEt; wallD_n = [1,0,0];
  }
  // Centroide aproximado del solido (centro de la celda, sesgado hacia el
  // techo alto). Sirve para orientar todas las caras hacia FUERA.
  const cent = [(x0+x1)/2, (y0+y1)/2, z0 + (z1-z0)*0.75];
  // Tapa triangular alta.
  pushTriOriented(out, alt1, alt2, alt3, cent, topRgb);
  // Cara inclinada: alt1-alt3 (hipotenusa) → lowB (esquina cortada en suelo).
  pushTriOriented(out, alt1, alt3, lowB, cent, topRgb);
  // Paredes completas adyacentes a alt2 (las que tocan los cubos altos).
  pushQuadOriented(out, wallA_b1, wallA_b2, wallA_t1, wallA_t2, cent, sideRgb);
  pushQuadOriented(out, wallB_b1, wallB_b2, wallB_t1, wallB_t2, cent, sideRgb);
  // Paredes triangulares adyacentes a lowB (lado abierto).
  pushTriOriented(out, lowB, wallC_b, wallC_t, cent, sideRgb);
  pushTriOriented(out, lowB, wallD_t, wallD_b, cent, sideRgb);
  // Base.
  pushQuadOriented(out, NWb, NEb, SEb, SOb, cent, bottomRgb);
}

/**
 * Empuja un triangulo con winding garantizado CCW visto desde FUERA del
 * solido. Calcula la normal del triangulo y la compara con la direccion
 * hacia el centroide; si apunta hacia el centroide (hacia DENTRO), invierte
 * el orden de p2 y p3. Esto evita errores manuales de winding.
 */
function pushTriOriented(out, p1, p2, p3, centroid, rgb) {
  const n = _triNormal(p1, p2, p3);
  const toC = [centroid[0]-p1[0], centroid[1]-p1[1], centroid[2]-p1[2]];
  const dot = n[0]*toC[0] + n[1]*toC[1] + n[2]*toC[2];
  if (dot > 0) {
    // Normal apunta hacia el centroide (dentro). Invertir.
    pushTri(out, p1, p3, p2, [-n[0], -n[1], -n[2]], rgb);
  } else {
    pushTri(out, p1, p2, p3, n, rgb);
  }
}

/**
 * Empuja un quad orientado igual que pushTriOriented (se asume coplanar y
 * convexo). Internamente lo descompone en dos triangulos.
 */
function pushQuadOriented(out, p1, p2, p3, p4, centroid, rgb) {
  pushTriOriented(out, p1, p2, p3, centroid, rgb);
  pushTriOriented(out, p1, p3, p4, centroid, rgb);
}

/**
 * Bevel del casco: prisma vertical con UNA esquina cortada en diagonal a
 * 45° (en planta el cuadrado pierde una esquina). Espejo en preview del
 * _wedgeBrush de mapWriter. `corner` = esquina CORTADA: 'ne'/'se'/'sw'/'nw'.
 * Convencion mundo: +Y norte, +X este. NW=(x0,y1) NE=(x1,y1) SE=(x1,y0)
 * SO=(x0,y0). Caras: techo y suelo (pentagono → 3 tris), 3 paredes rectas
 * (las dos que NO tocan la esquina cortada quedan completas; las dos que la
 * tocaban se acortan) y 1 pared diagonal inclinada en planta pero vertical
 * en Z.
 */
function pushWedgeVertical(out, x0, y0, z0, x1, y1, z1, corner, colors) {
  const topRgb    = Array.isArray(colors) ? colors : colors.top    ?? colors.side;
  const sideRgb   = Array.isArray(colors) ? colors : colors.side;
  const bottomRgb = Array.isArray(colors) ? colors : colors.bottom ?? colors.side;
  const NW=[x0,y1], NE=[x1,y1], SE=[x1,y0], SO=[x0,y0];
  // Cortar UNA esquina de un cuadrado deja un triangulo en planta: las 3
  // esquinas conservadas. Listadas CCW desde arriba para que la tapa y la
  // base salgan con el winding correcto (pushTriOriented reorienta igual).
  // La arista C→A es la diagonal del corte (vertical en Z).
  let A, B, C;  // 3 esquinas conservadas, CCW
  if (corner === 'ne')      { A = SO; B = SE; C = NW; }   // quita NE
  else if (corner === 'se') { A = NW; B = SO; C = NE; }   // quita SE
  else if (corner === 'sw') { A = NE; B = NW; C = SE; }   // quita SO
  else                      { A = SE; B = NE; C = SO; }   // quita NO
  const Ab=[A[0],A[1],z0], Bb=[B[0],B[1],z0], Cb=[C[0],C[1],z0];
  const At=[A[0],A[1],z1], Bt=[B[0],B[1],z1], Ct=[C[0],C[1],z1];
  const cent = [(x0+x1)/2, (y0+y1)/2, (z0+z1)/2];
  // Tapa y base (triangulares en planta tras el corte).
  pushTriOriented(out, At, Bt, Ct, cent, topRgb);
  pushTriOriented(out, Ab, Bb, Cb, cent, bottomRgb);
  // 3 paredes verticales (A-B, B-C rectas; C-A es la diagonal del corte).
  pushQuadOriented(out, Ab, Bb, Bt, At, cent, sideRgb);
  pushQuadOriented(out, Bb, Cb, Ct, Bt, cent, sideRgb);
  pushQuadOriented(out, Cb, Ab, At, Ct, cent, sideRgb);
}

function pushWedge(out, x0, y0, z0, x1, y1, z1, direction, colors) {
  const topRgb    = Array.isArray(colors) ? colors : colors.top    ?? colors.side;
  const sideRgb   = Array.isArray(colors) ? colors : colors.side;
  const bottomRgb = Array.isArray(colors) ? colors : colors.bottom ?? colors.side;
  const b00 = [x0,y0,z0], b10 = [x1,y0,z0], b11 = [x1,y1,z0], b01 = [x0,y1,z0];
  const t00 = [x0,y0,z1], t10 = [x1,y0,z1], t11 = [x1,y1,z1], t01 = [x0,y1,z1];
  // Centroide aproximado del solido (medio de la celda + medio de la altura
  // ponderado hacia el lado alto). Para una cuña cardinal, el centroide cae
  // mas hacia la cresta alta; para un tetraedro diagonal, mas hacia el apex.
  // Cualquier punto estrictamente interior basta para orientar las caras.
  const cx = (x0+x1)/2, cy = (y0+y1)/2;
  const cz = z0 + (z1-z0)*0.3;
  // Para tetraedros diagonales, sesgamos el centroide hacia la esquina alta.
  const cxBias = (k) => (x0 + cx)/2 + ((k.indexOf('e')>=0 ? x1 : x0) - cx)*0.25;
  const cyBias = (k) => (y0 + cy)/2 + ((k.indexOf('n')>=0 ? y1 : y0) - cy)*0.25;
  let cent;
  if (direction === 'n')      cent = [cx, (cy+y1)/2, cz];
  else if (direction === 's') cent = [cx, (cy+y0)/2, cz];
  else if (direction === 'e') cent = [(cx+x1)/2, cy, cz];
  else if (direction === 'w') cent = [(cx+x0)/2, cy, cz];
  else cent = [cxBias(direction), cyBias(direction), cz];
  // Base (-Z): siempre presente.
  pushQuadOriented(out, b00, b10, b11, b01, cent, bottomRgb);
  if (direction === 'n') {
    // Pared trasera N (y=y1), plano inclinado, dos lados triangulares.
    pushQuadOriented(out, b01, b11, t11, t01, cent, sideRgb);
    pushQuadOriented(out, t01, t11, b10, b00, cent, topRgb);
    pushTriOriented(out, b10, b11, t11, cent, sideRgb);
    pushTriOriented(out, b00, t01, b01, cent, sideRgb);
  } else if (direction === 's') {
    pushQuadOriented(out, b00, b10, t10, t00, cent, sideRgb);
    pushQuadOriented(out, t10, t00, b01, b11, cent, topRgb);
    pushTriOriented(out, b10, t10, b11, cent, sideRgb);
    pushTriOriented(out, b00, b01, t00, cent, sideRgb);
  } else if (direction === 'e') {
    pushQuadOriented(out, b10, b11, t11, t10, cent, sideRgb);
    pushQuadOriented(out, t11, t10, b00, b01, cent, topRgb);
    pushTriOriented(out, b00, t10, b10, cent, sideRgb);
    pushTriOriented(out, b01, b11, t11, cent, sideRgb);
  } else if (direction === 'w') {
    pushQuadOriented(out, b00, t00, t01, b01, cent, sideRgb);
    pushQuadOriented(out, t00, t01, b11, b10, cent, topRgb);
    pushTriOriented(out, b00, b10, t00, cent, sideRgb);
    pushTriOriented(out, b01, t01, b11, cent, sideRgb);
  } else if (direction === 'ne') {
    const hi = t11;
    pushTriOriented(out, b01, b11, hi, cent, sideRgb);
    pushTriOriented(out, b11, b10, hi, cent, sideRgb);
    pushTriOriented(out, hi, b10, b00, cent, topRgb);
    pushTriOriented(out, hi, b00, b01, cent, topRgb);
  } else if (direction === 'nw') {
    const hi = t01;
    pushTriOriented(out, b11, b01, hi, cent, sideRgb);
    pushTriOriented(out, b01, b00, hi, cent, sideRgb);
    pushTriOriented(out, hi, b11, b10, cent, topRgb);
    pushTriOriented(out, hi, b10, b00, cent, topRgb);
  } else if (direction === 'se') {
    const hi = t10;
    pushTriOriented(out, b00, b10, hi, cent, sideRgb);
    pushTriOriented(out, b10, b11, hi, cent, sideRgb);
    pushTriOriented(out, hi, b00, b01, cent, topRgb);
    pushTriOriented(out, hi, b01, b11, cent, topRgb);
  } else if (direction === 'sw') {
    const hi = t00;
    pushTriOriented(out, b10, b00, hi, cent, sideRgb);
    pushTriOriented(out, b00, b01, hi, cent, sideRgb);
    pushTriOriented(out, hi, b01, b11, cent, topRgb);
    pushTriOriented(out, hi, b11, b10, cent, topRgb);
  }
}

/**
 * Tetraedro apoyado en el cuadrante de una esquina alta del corner_in.
 * Base triangular en z=z0 (3 esquinas del cuadrante del apex), apex en z=z1
 * directamente encima de la esquina alta. Cuatro caras: 1 base triangular +
 * 3 laterales (2 verticales pegadas al perfil de la celda + 1 inclinada
 * diagonal mirando hacia el cuadrante bajo).
 */
function pushPyramidTip(out, x0, y0, z0, x1, y1, z1, dir, colors) {
  const topRgb    = Array.isArray(colors) ? colors : colors.top    ?? colors.side;
  const sideRgb   = Array.isArray(colors) ? colors : colors.side;
  const bottomRgb = Array.isArray(colors) ? colors : colors.bottom ?? colors.side;
  const NW = [x0, y1, z0];
  const NE = [x1, y1, z0];
  const SE = [x1, y0, z0];
  const SW = [x0, y0, z0];
  let B1, B2, B3, apex;
  if (dir === 0) {
    B1 = NW; B2 = NE; B3 = SE; apex = [x1, y1, z1];
  } else if (dir === 1) {
    B1 = NE; B2 = SE; B3 = SW; apex = [x1, y0, z1];
  } else if (dir === 2) {
    B1 = SE; B2 = SW; B3 = NW; apex = [x0, y0, z1];
  } else {
    B1 = SW; B2 = NW; B3 = NE; apex = [x0, y1, z1];
  }
  // Centroide del tetraedro = promedio de los 4 vertices.
  const cent = [
    (B1[0]+B2[0]+B3[0]+apex[0])/4,
    (B1[1]+B2[1]+B3[1]+apex[1])/4,
    (B1[2]+B2[2]+B3[2]+apex[2])/4,
  ];
  // Cuatro caras: base + 3 laterales. pushTriOriented orienta cada una.
  pushTriOriented(out, B1, B2, B3, cent, bottomRgb);
  pushTriOriented(out, B1, B2, apex, cent, sideRgb);
  pushTriOriented(out, B2, B3, apex, cent, sideRgb);
  pushTriOriented(out, B3, B1, apex, cent, topRgb);
}

function pushBox(out, x0, y0, z0, x1, y1, z1, colors) {
  const topRgb    = Array.isArray(colors) ? colors : colors.top    ?? colors.side;
  const sideRgb   = Array.isArray(colors) ? colors : colors.side;
  const bottomRgb = Array.isArray(colors) ? colors : colors.bottom ?? colors.side;
  const faces = [
    { p: [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], n: [ 1, 0, 0], rgb: sideRgb },
    { p: [[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]], n: [-1, 0, 0], rgb: sideRgb },
    { p: [[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1]], n: [ 0, 1, 0], rgb: sideRgb },
    { p: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], n: [ 0,-1, 0], rgb: sideRgb },
    { p: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [ 0, 0, 1], rgb: topRgb },
    { p: [[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]], n: [ 0, 0,-1], rgb: bottomRgb },
  ];
  for (const f of faces) {
    const base = out.vertexCount;
    const [r, g, b] = f.rgb;
    for (const [px, py, pz] of f.p) {
      out.positions.push(px, py, pz);
      out.normals.push(f.n[0], f.n[1], f.n[2]);
      out.colors.push(r, g, b);
      out.vertexCount++;
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Tallest neighbour terrain height (above sea level) for cell (col,row).
 * Mirrors mapWriter.neighbourMaxH — used to anchor the `base` face.
 */
function neighbourMaxH(tilemap, col, row) {
  const { cols, rows, heights } = tilemap;
  let m = SEA_LEVEL_H;
  const test = (cc, rr) => {
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return;
    const hn = heights[rr * cols + cc];
    if (hn > m) m = hn;
  };
  test(col - 1, row);
  test(col + 1, row);
  test(col, row - 1);
  test(col, row + 1);
  return m;
}

/**
 * Emit one cell's geometry as a vertical column of unit cubes following
 * the column.md spec: bedrock-to-top stack, with face colours picked by
 * cube position (top/side/capital/base/bottom). Submerged cells emit
 * nothing — the global water brush covers them.
 */
function addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY) {
  const i = row * tilemap.cols + col;
  const h = tilemap.heights[i];
  if (h < SEA_LEVEL_H) return;

  const texIdx = tilemap.textures[i];
  const terrainColors = (texIdx >= 0 && texIdx < PALETTE_COLORS.length)
    ? PALETTE_COLORS[texIdx]
    : FALLBACK_COLORS;

  const obj = tilemap.objects?.[i];
  const meta = obj ? OBJECT_BY_KIND.get(obj.kind) : null;
  const isBuilding = meta && meta.isBuilding;
  const buildingColors = isBuilding ? OBJECT_COLORS.get(obj.kind) : null;
  const isSkyscraper = isBuilding && obj.kind === 'tower';

  // Cell footprint in world coords.
  const x0 = -gridHalfX + col * CELL_SIZE;
  const x1 = x0 + CELL_SIZE;
  const ySouthIdx = (tilemap.rows - 1) - row;
  const y0 = -gridHalfY + ySouthIdx * CELL_SIZE;
  const y1 = y0 + CELL_SIZE;

  let buildingStoreys = 0;
  if (isBuilding) {
    if (isSkyscraper) {
      const gap = SKY_TOP_Z - h * HEIGHT_UNIT;
      buildingStoreys = Math.max(1, Math.ceil(gap / HEIGHT_UNIT));
    } else {
      buildingStoreys = Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX,
        (typeof obj.storeys === 'number' ? obj.storeys : HOUSE_STOREYS_MIN)));
    }
  }

  // Stack indexing in cube units, k=0 = lowest cube against bedrock.
  // Keep in lockstep with mapWriter so the .map and the 3D preview
  // match cube for cube.
  const terrainCubes = SEAL_CUBES + h;
  const total = terrainCubes + buildingStoreys;
  const neighborMaxK = SEAL_CUBES + neighbourMaxH(tilemap, col, row);

  const inset = isBuilding ? (CELL_SIZE * (1 - meta.footprint)) / 2 : 0;
  const bx0 = x0 + inset, bx1 = x1 - inset;
  const by0 = y0 + inset, by1 = y1 - inset;

  // Bevel del casco ('wedge'): la columna de TERRENO se dibuja como un
  // prisma achaflanado verticalmente (espejo del _wedgeBrush de mapWriter)
  // en vez de cubos rectos. Los cubos de edificio se apilan encima igual.
  const cellDecoPrev = tilemap.decorations ? decodeDeco(tilemap.decorations[i]) : null;
  const isBevelPrev = cellDecoPrev && cellDecoPrev.kind === 'wedge' && terrainCubes > 0;
  const bevelCornerPrev = isBevelPrev
    ? (['ne', 'se', 'sw', 'nw'][cellDecoPrev.dir] || 'ne')
    : null;

  for (let k = 0; k < total; k++) {
    const isTerrainCube = k < terrainCubes;
    const biomeColors = isTerrainCube ? terrainColors : buildingColors;
    const faces = pickFaceTextures(k, total, neighborMaxK, biomeColors);
    // Default occluded faces to side; the 3D preview never culls so
    // we paint something on every face.
    const sideRgb   = faces.side;
    const topRgb    = faces.top    ?? sideRgb;
    const bottomRgb = faces.bottom ?? sideRgb;

    const cubeMinZ = BEDROCK_TOP_Z + k * HEIGHT_UNIT;
    const isSkyscraperTop = isSkyscraper && (k === total - 1);
    const cubeMaxZ = isSkyscraperTop ? SKY_TOP_Z : cubeMinZ + HEIGHT_UNIT;

    // En celdas con bevel cada cubo de terreno se dibuja como un wedge
    // achaflanado, con los colores por cara de pickFaceTextures (igual que
    // un cubo barco recto: side/base/capital segun el nivel). Asi el preview
    // refleja las mismas reglas de cara que el .map.
    if (isBevelPrev && isTerrainCube) {
      const bf = pickFaceTextures(k, terrainCubes, neighborMaxK, terrainColors);
      pushWedgeVertical(out, x0, y0, cubeMinZ, x1, y1, cubeMinZ + HEIGHT_UNIT,
        bevelCornerPrev,
        { top: bf.top ?? bf.side, side: bf.side, bottom: bf.bottom ?? bf.side });
      continue;
    }

    const useBuildingFootprint = !isTerrainCube && inset > 0;
    const cx0 = useBuildingFootprint ? bx0 : x0;
    const cx1 = useBuildingFootprint ? bx1 : x1;
    const cy0 = useBuildingFootprint ? by0 : y0;
    const cy1 = useBuildingFootprint ? by1 : y1;

    pushBox(out, cx0, cy0, cubeMinZ, cx1, cy1, cubeMaxZ,
      { top: topRgb, side: sideRgb, bottom: bottomRgb });
  }

  // Small decorative objects (lamp, tree, bush, rock) sit on top of
  // the terrain column with their own footprint and height. Single
  // box, single colour — they're not columns.
  if (meta && !isBuilding) {
    const decoInset = (CELL_SIZE * (1 - meta.footprint)) / 2;
    const ox0 = x0 + decoInset, ox1 = x1 - decoInset;
    const oy0 = y0 + decoInset, oy1 = y1 - decoInset;
    const terrainTopZ = h * HEIGHT_UNIT;
    const oz0 = terrainTopZ;
    const oz1 = terrainTopZ + meta.heightU;
    const orgb = OBJECT_COLORS.get(obj.kind)?.top ?? DEFAULT_LAND;
    pushBox(out, ox0, oy0, oz0, ox1, oy1, oz1, orgb);
  }

  // Decoraciones de erosion (preparacion_iso). El brush se extiende desde
  // el suelo de la celda hasta la altura del vecino mas alto en la
  // direccion del kind, de modo que la cresta alta coincide con la cara
  // superior del cubo vecino (sin escalon).
  const decoCode = tilemap.decorations ? tilemap.decorations[i] : 0;
  if (decoCode) {
    const deco = decodeDeco(decoCode);
    const rampDir = deco ? kindToRampDirection(deco.kind, deco.dir) : null;
    const yellow = [0.94, 0.78, 0.32];
    const yellowShade = [0.78, 0.62, 0.20];
    const hAtSafe = (c, r) => {
      if (c < 0 || c >= tilemap.cols || r < 0 || r >= tilemap.rows) return h;
      return Math.max(h, tilemap.heights[r * tilemap.cols + c]);
    };
    let neighborMaxH = h;
    if (deco) {
      if (deco.kind === 'ramp') {
        neighborMaxH = ({
          0: hAtSafe(col, row - 1),
          1: hAtSafe(col + 1, row),
          2: hAtSafe(col, row + 1),
          3: hAtSafe(col - 1, row),
        })[deco.dir] ?? h;
      } else if (deco.kind === 'corner_in') {
        // Max de los 3 vecinos que tocan la esquina alta (2 ortos + diag),
        // no solo el diagonal: cubre el caso de un orto entero mas alto.
        const corners3 = ({
          0: [hAtSafe(col, row - 1), hAtSafe(col + 1, row), hAtSafe(col + 1, row - 1)],
          1: [hAtSafe(col, row + 1), hAtSafe(col + 1, row), hAtSafe(col + 1, row + 1)],
          2: [hAtSafe(col, row + 1), hAtSafe(col - 1, row), hAtSafe(col - 1, row + 1)],
          3: [hAtSafe(col, row - 1), hAtSafe(col - 1, row), hAtSafe(col - 1, row - 1)],
        })[deco.dir];
        neighborMaxH = corners3
          ? Math.max(corners3[0], corners3[1], corners3[2])
          : h;
      } else if (deco.kind === 'corner_out' || deco.kind === 'ramp_diag') {
        neighborMaxH = ({
          0: hAtSafe(col + 1, row - 1),
          1: hAtSafe(col + 1, row + 1),
          2: hAtSafe(col - 1, row + 1),
          3: hAtSafe(col - 1, row - 1),
        })[deco.dir] ?? h;
      }
    }
    const terrainTopZ = h * HEIGHT_UNIT;
    // Maxima altura del bloque de erosion: 1 HEIGHT_UNIT. Si el vecino esta
    // mas alto, no estiramos el brush — mantenemos coherencia con tilemap.
    const decoTopZ = Math.min(
      neighborMaxH * HEIGHT_UNIT,
      terrainTopZ + HEIGHT_UNIT,
    );
    if (rampDir && decoTopZ > terrainTopZ) {
      // ramp cardinal y corner_out (pico unico): tetraedro/cuna.
      pushWedge(out, x0, y0, terrainTopZ, x1, y1, decoTopZ, rampDir,
        { top: yellow, side: yellowShade, bottom: yellowShade });
    } else if (deco && deco.kind === 'corner_in' && decoTopZ > terrainTopZ) {
      // corner_in: cubo lleno con la esquina opuesta cortada.
      pushCornerIn(out, x0, y0, terrainTopZ, x1, y1, decoTopZ, deco.dir,
        { top: yellow, side: yellowShade, bottom: yellowShade });
      // Tip piramidal sobre el corner_in cuando el vecino diagonal sube mas
      // de 1u. Piramide de base cuadrada con apex en la esquina alta a la
      // altura del diagonal. Dos caras laterales son verticales (lado de
      // los ortos altos) y dos son inclinadas.
      // Apex del tip: usamos cobertura POR ARISTA del vecino, no solo h+1
      // si hay deco. Solo cuenta como +1 si la deco del vecino sube las
      // esquinas adecuadas que tocan el corner_in. Sin esto, un vecino con
      // ramp:0 (cresta N alta) no cubre la arista S, pero la heuristica
      // simple "+1 si hay deco" daria un tip degenerado expuesto.
      const C_NE = 1, C_SE = 2, C_SW = 4, C_NW = 8;
      const decoKindsArr = ['ramp','ramp_u','ramp_diag','pit','corner_in','corner_out','pyramid','cube','wedge','ramp_u_closed','bridge_diag'];
      const highCornersOf = (decoCode) => {
        if (!decoCode) return 0;
        const k = decoKindsArr[((decoCode >> 2) & 0xff) - 1];
        const d = decoCode & 3;
        if (k === 'ramp') return [C_NE|C_NW, C_NE|C_SE, C_SE|C_SW, C_SW|C_NW][d];
        if (k === 'corner_in') return [C_NE|C_NW|C_SE, C_NE|C_SE|C_SW, C_SE|C_SW|C_NW, C_NW|C_NE|C_SW][d];
        if (k === 'ramp_diag' || k === 'corner_out') return [C_NE, C_SE, C_SW, C_NW][d];
        if (k === 'cube' || k === 'pyramid') return 0xf;
        return 0;
      };
      const coverEdge = (c, r, needMask) => {
        if (c < 0 || c >= tilemap.cols || r < 0 || r >= tilemap.rows) return h;
        const hn = tilemap.heights[r * tilemap.cols + c];
        const dn = (tilemap.decorations && tilemap.decorations[r * tilemap.cols + c]) || 0;
        const hi = highCornersOf(dn);
        return ((hi & needMask) === needMask) ? hn + 1 : hn;
      };
      // Cobertura por la esquina del vecino que coincide con el apex.
      // Si esa esquina del vecino es alta, su pendiente baja linealmente
      // empatando con el plano del tip.
      const tipEdges = ({
        0: [{ dc: 0, dr: -1, mask: C_SE }, { dc: 1, dr: 0, mask: C_NW }, { dc: 1, dr: -1, mask: C_SW }],
        1: [{ dc: 0, dr:  1, mask: C_NE }, { dc: 1, dr: 0, mask: C_SW }, { dc: 1, dr:  1, mask: C_NW }],
        2: [{ dc: 0, dr:  1, mask: C_NW }, { dc:-1, dr: 0, mask: C_SE }, { dc:-1, dr:  1, mask: C_NE }],
        3: [{ dc: 0, dr: -1, mask: C_SW }, { dc:-1, dr: 0, mask: C_NE }, { dc:-1, dr: -1, mask: C_SE }],
      })[deco.dir];
      let apexH = h;
      if (tipEdges) {
        apexH = Math.min(
          coverEdge(col + tipEdges[0].dc, row + tipEdges[0].dr, tipEdges[0].mask),
          coverEdge(col + tipEdges[1].dc, row + tipEdges[1].dr, tipEdges[1].mask),
          coverEdge(col + tipEdges[2].dc, row + tipEdges[2].dr, tipEdges[2].mask),
        );
      }
      if (apexH > h + 1) {
        pushPyramidTip(out, x0, y0, (h + 1) * HEIGHT_UNIT,
          x1, y1, apexH * HEIGHT_UNIT, deco.dir,
          { top: yellow, side: yellowShade, bottom: yellowShade });
      }
    } else if (deco && deco.kind === 'cube') {
      pushBox(out, x0, y0, terrainTopZ, x1, y1, terrainTopZ + HEIGHT_UNIT,
        { top: yellow, side: yellowShade, bottom: yellowShade });
    } else if (deco && deco.kind === 'wedge') {
      // El bevel del casco ya se dibujo como prisma achaflanado al construir
      // la columna de terreno (pushWedgeVertical). Nada que anadir aqui.
    } else if (deco) {
      const placeholder = [0.6, 0.5, 0.2];
      pushBox(out, x0, y0, terrainTopZ, x1, y1, terrainTopZ + HEIGHT_UNIT,
        { top: placeholder, side: placeholder, bottom: placeholder });
    }
  }
}

/** ----- Chunk-based API ----- */

/** How many chunks per axis for a given tilemap. */
export function chunkCounts(tilemap) {
  return {
    cx: Math.ceil(tilemap.cols / MESH_CHUNK_SIZE),
    cy: Math.ceil(tilemap.rows / MESH_CHUNK_SIZE),
  };
}

/** Chunk key for (col, row) cell. */
export function chunkKeyForCell(col, row) {
  return ((row / MESH_CHUNK_SIZE) | 0) * 100000 + ((col / MESH_CHUNK_SIZE) | 0);
}

/** Chunk index → mesh of just that chunk's cells. When the tilemap has
 *  a playArea set, cells outside it are skipped so the 3D viewport
 *  shows only the selected region — matches the compile-time filter. */
export function buildChunk(tilemap, chunkCol, chunkRow) {
  const out = makeBuilder();
  const { cols, rows } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  const col0 = chunkCol * MESH_CHUNK_SIZE;
  const row0 = chunkRow * MESH_CHUNK_SIZE;
  const col1 = Math.min(cols, col0 + MESH_CHUNK_SIZE);
  const row1 = Math.min(rows, row0 + MESH_CHUNK_SIZE);
  const pa = tilemap.playArea;
  for (let row = row0; row < row1; row++) {
    if (pa && (row < pa.r0 || row > pa.r1)) continue;
    for (let col = col0; col < col1; col++) {
      if (pa && (col < pa.c0 || col > pa.c1)) continue;
      addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY);
    }
  }
  return finaliseBuilder(out);
}

/** Water surface plane. When a playArea is set, the plane shrinks to
 *  match — otherwise the user would see ocean stretching beyond the
 *  selected region in the iso view. */
export function buildWater(tilemap) {
  const out = makeBuilder();
  const WATER_DROP = 8;
  const { cols, rows, playArea } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  let x0, y0, x1, y1;
  if (playArea) {
    x0 = -gridHalfX + playArea.c0 * CELL_SIZE;
    x1 = -gridHalfX + (playArea.c1 + 1) * CELL_SIZE;
    // Row 0 = north (+Y max); convert to ySouthIdx range.
    const ySouth0 = (rows - 1) - playArea.r1;
    const ySouth1 = (rows - 1) - playArea.r0;
    y0 = -gridHalfY + ySouth0 * CELL_SIZE;
    y1 = -gridHalfY + (ySouth1 + 1) * CELL_SIZE;
  } else {
    x0 = -WORLD_HALF; y0 = -WORLD_HALF;
    x1 =  WORLD_HALF; y1 =  WORLD_HALF;
  }
  pushBox(out,
    x0, y0, SEA_LEVEL_Z - WATER_DROP - 1,
    x1, y1, SEA_LEVEL_Z - WATER_DROP,
    WATER_COLOR,
  );
  return finaliseBuilder(out);
}

/**
 * Pinta gizmos 3D para los nodos de patrulla: un cubo pequeno por nodo a
 * (terrenoTopZ + flightHeight*HEIGHT_UNIT). Aristas no — el 2D ya las
 * muestra. Las rutas se ven coloreadas: la activa naranja, el resto azul.
 *
 * No respeta playArea (los nodos de patrulla son entidades sueltas; tiene
 * sentido verlas siempre que existan).
 */
export function buildPatrolGizmos(tilemap, activePatrolId) {
  const out = makeBuilder();
  const patrols = tilemap.patrols;
  if (!patrols || patrols.length === 0) return finaliseBuilder(out);
  const { cols, rows, heights } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  const ACTIVE_RGB   = [1.0, 0.55, 0.15];
  const INACTIVE_RGB = [0.35, 0.6, 0.9];
  const HALF = 16; // cubo de 32u de arista
  for (const p of patrols) {
    const rgb = (p.id === activePatrolId) ? ACTIVE_RGB : INACTIVE_RGB;
    for (const n of p.nodes) {
      if (n.col < 0 || n.col >= cols || n.row < 0 || n.row >= rows) continue;
      const xc = -gridHalfX + (n.col + 0.5) * CELL_SIZE;
      const ySouthIdx = (rows - 1) - n.row;
      const yc = -gridHalfY + (ySouthIdx + 0.5) * CELL_SIZE;
      // Altura: terreno bajo el nodo + flightHeight*HEIGHT_UNIT.
      // Si la celda esta sumergida (h<0) usamos sea level como referencia.
      const h = heights[n.row * cols + n.col];
      const baseZ = (h >= 0 ? h : 0) * HEIGHT_UNIT;
      const zc = baseZ + p.flightHeight * HEIGHT_UNIT;
      pushBox(out,
        xc - HALF, yc - HALF, zc - HALF,
        xc + HALF, yc + HALF, zc + HALF,
        rgb,
      );
    }
  }
  return finaliseBuilder(out);
}

/** ----- Legacy whole-scene builder (kept for callers that want a single
 *  draw call). Not used by Viewport3D anymore. ----- */
export function buildScene(tilemap) {
  const out = makeBuilder();
  const { cols, rows } = tilemap;
  const gridHalfX = (cols * CELL_SIZE) / 2;
  const gridHalfY = (rows * CELL_SIZE) / 2;
  const WATER_DROP = 8;
  pushBox(out,
    -WORLD_HALF, -WORLD_HALF, SEA_LEVEL_Z - WATER_DROP - 1,
     WORLD_HALF,  WORLD_HALF, SEA_LEVEL_Z - WATER_DROP,
    WATER_COLOR,
  );
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      addCellToMesh(out, tilemap, col, row, gridHalfX, gridHalfY);
    }
  }
  const m = finaliseBuilder(out);
  return { ...m, skyColor: SKY_COLOR };
}
