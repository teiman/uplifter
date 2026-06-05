/**
 * Quake .map writer (Valve 220) for Uplifter tilemaps.
 *
 * World layout:
 *   - Sky box: 4 side walls + ceiling at ±WORLD_HALF, textured 'sky_auto'.
 *   - Bedrock: solid slab below sea level — seals the map to vis, since
 *     water faces are vis-transparent.
 *   - Water: single global brush from bedrock top to SEA_LEVEL_Z, covers
 *     the entire world.
 *   - Land: one box per grid cell with height >= SEA_LEVEL_H. The cell
 *     box spans from BEDROCK_TOP_Z (so the side faces of every land
 *     brush butt against bedrock) up to height * HEIGHT_UNIT.
 *
 * worldspawn keys:
 *   - protocol "666"  → bigcoords; the network protocol needed for
 *                       coordinates beyond ±4096.
 *   - sky "uplifter_blue" → fixed skybox name (the actual skin lives in
 *                       the mod's gfx/env/ folder).
 *   - _sunlight*      → sun config from tilemap.sun.
 *   - wad "..."       → list of WAD paths so qbsp can resolve textures.
 *
 * Compile flags (set in compileTools.js, not here):
 *   qbsp -bsp2 -worldextent 32768 -leaktest
 */

const path = require('node:path');

const { boxBrush } = require('../shared/tileBrushes');
const {
  CELL_SIZE, WORLD_HALF, HEIGHT_UNIT,
  SEA_LEVEL_H, SEA_LEVEL_Z,
  BEDROCK_TOP_Z, BEDROCK_THICKNESS,
  SKY_TOP_Z, SKY_WALL_THICKNESS,
  CLOUD_LAYER_Z, CLOUD_FIELD_HALF, CLOUD_BRUSH_SIZE,
  CLOUD_CLUSTERS, CLOUD_PER_CLUSTER_MIN, CLOUD_PER_CLUSTER_MAX, CLOUD_CLUSTER_RADIUS,
  CLOUD_CLUSTER_SEP_MIN, CLOUD_CLUSTER_SEP_MAX,
  CLOUD2_CLUSTERS, CLOUD2_PER_CLUSTER_MIN, CLOUD2_PER_CLUSTER_MAX, CLOUD2_CLUSTER_RADIUS,
  CLOUD2_CLUSTER_SEP_MIN, CLOUD2_CLUSTER_SEP_MAX,
  SKY_TEXTURE, WATER_TEXTURE, WATER_SHADES, BEDROCK_TEXTURE,
  MINIMAP_SEA_TEXTURE,
  MINIMAP_HEIGHT, MINIMAP_TILE_THICKNESS,
  MINIMAP_TOP_Z, MINIMAP_BOTTOM_Z, MINIMAP_SEA_Z,
  PALETTE, OBJECT_BY_KIND,
  ENEMY_BY_KIND,
  HOUSE_STOREYS_MIN, HOUSE_STOREYS_MAX,
  pickFaceTextures, texturesFor,
  decodeDeco,
} = require('../shared/types');

/** Height of one building storey in Quake units. Matches HEIGHT_UNIT so
 *  buildings stack cleanly with the world's vertical grid. */
const STOREY_HEIGHT = HEIGHT_UNIT;

/** Fixed sky skin name. Resolved by the engine to gfx/env/<name>{bk,dn,...}.tga. */
const SKY_NAME = 'uplifter_blue';

/** Number of cubes from BEDROCK_TOP_Z up to SEA_LEVEL_Z. Used to convert
 *  height-units (where h=0 = sea level) into stack-cube indices (where
 *  k=0 = the lowest cube against bedrock). */
const SEAL_CUBES = -BEDROCK_TOP_Z / HEIGHT_UNIT;

/** Fallback 5-face texture set for cells that have no palette entry but
 *  still emerge (e.g. legacy maps). Picked to keep the cell visible. */
const FALLBACK_BIOME_TEX = texturesFor('tierra');

function biomeTexForPaletteIdx(idx) {
  if (idx < 0 || idx >= PALETTE.length) return null;
  return PALETTE[idx].tex;
}

/**
 * Emit a Valve 220 face line. Portado tal cual desde
 * d:/code/atlasmaper/src/shared/tileBrushes.js:16 (rampas y cuñas).
 *
 * Convencion de QBSP: el cross product (P2-P1) x (P3-P1) apunta DENTRO del
 * solido. Los llamadores ponen los vertices en CCW visto desde FUERA del
 * solido (es decir, en sentido horario visto desde DENTRO).
 */
function _face(p1, p2, p3, texName, uAxis, vAxis, uOff, vOff, uScale, vScale) {
  return (
    `( ${p1[0]} ${p1[1]} ${p1[2]} ) ` +
    `( ${p2[0]} ${p2[1]} ${p2[2]} ) ` +
    `( ${p3[0]} ${p3[1]} ${p3[2]} ) ` +
    `${texName} ` +
    `[ ${uAxis[0]} ${uAxis[1]} ${uAxis[2]} ${uOff} ] ` +
    `[ ${vAxis[0]} ${vAxis[1]} ${vAxis[2]} ${vOff} ] ` +
    `0 ${uScale} ${vScale}`
  );
}

/**
 * Brush de rampa (cuña inclinada). Portado de atlasmaper.
 * direction:
 *   'n' = arista N alta (y=y1), baja al sur.
 *   's' = arista S alta (y=y0), baja al norte.
 *   'e' = arista E alta (x=x1), baja al oeste.
 *   'w' = arista O alta (x=x0), baja al este.
 *   'ne'/'nw'/'se'/'sw' = rampa diagonal con la esquina alta indicada.
 *
 * NOTA sobre los ejes: atlasmaper usa Y con N = +y (norte = mayor y), igual
 * que modeditor (donde ySouthIdx invierte row → y, asi que row 0 = mayor y
 * = norte). Por tanto las direcciones 'n/s/e/w' significan lo mismo en
 * ambos motores y mapean 1:1 desde los kinds de preparacion_iso.
 */
function _rampBrush({ x0, y0, x1, y1, bottomZ, topZ, direction }, texName, opts = {}) {
  const uScale = opts.uScale ?? 1;
  const vScale = opts.vScale ?? 1;
  const xy = { u: [1, 0, 0], v: [0, -1, 0] };
  const xz = { u: [1, 0, 0], v: [0, 0, -1] };
  const yz = { u: [0, 1, 0], v: [0, 0, -1] };
  const bZ = bottomZ, tZ = topZ;
  const topUOff = -x0, topVOff = y1;
  const sideXZUOff = -x0, sideXZVOff = tZ;
  const sideYZUOff = -y0, sideYZVOff = tZ;
  const lines = [];
  // +Z (top)
  lines.push(_face([x0,y1,tZ], [x1,y1,tZ], [x1,y0,tZ],
    texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));
  // -Z (bottom)
  lines.push(_face([x0,y0,bZ], [x1,y0,bZ], [x1,y1,bZ],
    texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));
  // +X
  lines.push(_face([x1,y0,bZ], [x1,y0,tZ], [x1,y1,tZ],
    texName, yz.u, yz.v, sideYZUOff, sideYZVOff, uScale, vScale));
  // -X
  lines.push(_face([x0,y1,bZ], [x0,y1,tZ], [x0,y0,tZ],
    texName, yz.u, yz.v, sideYZUOff, sideYZVOff, uScale, vScale));
  // +Y
  lines.push(_face([x0,y1,bZ], [x1,y1,bZ], [x1,y1,tZ],
    texName, xz.u, xz.v, sideXZUOff, sideXZVOff, uScale, vScale));
  // -Y
  lines.push(_face([x0,y0,tZ], [x1,y0,tZ], [x1,y0,bZ],
    texName, xz.u, xz.v, sideXZUOff, sideXZVOff, uScale, vScale));
  const pushSlope = (p1, p2, p3) =>
    lines.push(_face(p1, p2, p3, texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));
  const slopeN = () => pushSlope([x0,y0,bZ], [x1,y1,tZ], [x1,y0,bZ]);
  const slopeS = () => pushSlope([x1,y1,bZ], [x0,y0,tZ], [x0,y1,bZ]);
  const slopeE = () => pushSlope([x0,y1,bZ], [x1,y0,tZ], [x0,y0,bZ]);
  const slopeW = () => pushSlope([x1,y0,bZ], [x0,y1,tZ], [x1,y1,bZ]);
  switch (direction) {
    case 'n': slopeN(); break;
    case 's': slopeS(); break;
    case 'e': slopeE(); break;
    case 'w': slopeW(); break;
    case 'ne': slopeN(); slopeE(); break;
    case 'nw': slopeN(); slopeW(); break;
    case 'se': slopeS(); slopeE(); break;
    case 'sw': slopeS(); slopeW(); break;
    default: throw new Error(`rampBrush: bad direction "${direction}"`);
  }
  return '{\n' + lines.join('\n') + '\n}';
}

/**
 * Mapea un (kind, dir) de preparacion_iso a la direccion de _rampBrush
 * (tetraedro con esquina alta unica apuntando hacia el cubo diagonal).
 *  - `ramp` (cuña cardinal)
 *  - `corner_out` (pico unico, 3 esquinas bajas)
 *  - `ramp_diag` (rampa diagonal, tambien pico unico → misma geometria que
 *     corner_out en el contexto de Erosion sobre heightmap)
 *
 * Solo `corner_in` usa geometria distinta (_cornerInBrush, cubo con corte).
 */
function _kindToRampDirection(kind, dir) {
  if (kind === 'ramp') return ['n','e','s','w'][dir] || null;
  if (kind === 'corner_out' || kind === 'ramp_diag')
    return ['ne','se','sw','nw'][dir] || null;
  return null;
}

/**
 * Brush para `corner_in` y `ramp_diag` (preparacion_iso): cubo lleno con
 * UN solo plano de clip diagonal que recorta la esquina opuesta a `dir`.
 * Resulta en 3 esquinas altas a tZ + 1 esquina cortada a bZ. Es la
 * geometria "inversa" al tetraedro de `corner_out`.
 *
 * dir indica la esquina ALTA puntiaguda (la opuesta a la cortada):
 *   0 = NE alto, SO cortada.
 *   1 = SE alto, NO cortada.
 *   2 = SO alto, NE cortada.
 *   3 = NO alto, SE cortada.
 *
 * Convencion mundo (igual que mapWriter): +Y = norte, +X = este.
 *   NW = (x0, y1), NE = (x1, y1), SE = (x1, y0), SO = (x0, y0).
 */
function _cornerInBrush({ x0, y0, x1, y1, bottomZ, topZ, dir }, texName, opts = {}) {
  const uScale = opts.uScale ?? 1;
  const vScale = opts.vScale ?? 1;
  const xy = { u: [1, 0, 0], v: [0, -1, 0] };
  const xz = { u: [1, 0, 0], v: [0, 0, -1] };
  const yz = { u: [0, 1, 0], v: [0, 0, -1] };
  const bZ = bottomZ, tZ = topZ;
  const topUOff = -x0, topVOff = y1;
  const sideXZUOff = -x0, sideXZVOff = tZ;
  const sideYZUOff = -y0, sideYZVOff = tZ;
  const lines = [];
  // 6 caras axis-aligned de la caja completa.
  lines.push(_face([x0,y1,tZ], [x1,y1,tZ], [x1,y0,tZ],
    texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));        // +Z
  lines.push(_face([x0,y0,bZ], [x1,y0,bZ], [x1,y1,bZ],
    texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));        // -Z
  lines.push(_face([x1,y0,bZ], [x1,y0,tZ], [x1,y1,tZ],
    texName, yz.u, yz.v, sideYZUOff, sideYZVOff, uScale, vScale));  // +X
  lines.push(_face([x0,y1,bZ], [x0,y1,tZ], [x0,y0,tZ],
    texName, yz.u, yz.v, sideYZUOff, sideYZVOff, uScale, vScale));  // -X
  lines.push(_face([x0,y1,bZ], [x1,y1,bZ], [x1,y1,tZ],
    texName, xz.u, xz.v, sideXZUOff, sideXZVOff, uScale, vScale));  // +Y
  lines.push(_face([x0,y0,tZ], [x1,y0,tZ], [x0,y0,bZ],
    texName, xz.u, xz.v, sideXZUOff, sideXZVOff, uScale, vScale));  // -Y
  // Plano de clip diagonal: corta la esquina BAJA (opuesta a dir).
  // QBSP convencion: cross product (P2-P1) x (P3-P1) apunta DENTRO del
  // solido. Cada dir necesita su orden propio (no es uniforme entre
  // direcciones por la asimetria de las coords del cubo).
  let p1, p2, p3;
  if (dir === 0) {
    // NE alto, SO cortada. Inversion solido/aire (p2 ↔ p3) respecto a la
    // version que QBSP entendia al reves.
    p1 = [x0,y1,tZ]; p2 = [x1,y0,tZ]; p3 = [x0,y0,bZ];
  } else if (dir === 1) {
    // SE alto, NO cortada. Inversion solido/aire (p2 ↔ p3).
    p1 = [x1,y1,tZ]; p2 = [x0,y0,tZ]; p3 = [x0,y1,bZ];
  } else if (dir === 2) {
    // SO alto, NE cortada. Plano por NO (alto), SE (alto), NE (bajo).
    p1 = [x0,y1,tZ]; p2 = [x1,y1,bZ]; p3 = [x1,y0,tZ];
  } else {
    // NO alto, SE cortada. Plano por NE (alto), SO (alto), SE (bajo).
    p1 = [x1,y1,tZ]; p2 = [x1,y0,bZ]; p3 = [x0,y0,tZ];
  }
  lines.push(_face(p1, p2, p3, texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));
  return '{\n' + lines.join('\n') + '\n}';
}

/**
 * Genera la geometria del "capital" roto de una ruina. En lugar de un cubo
 * macizo, emite 1-4 brushes finos representando muros parciales (fachadas
 * caidas) + columnas, dejando huecos al cielo. Determinista por (col,row):
 * la misma celda siempre da la misma silueta.
 *
 *   args = { x0, y0, x1, y1, bottomZ, topZ }
 *   faces = { side, top, bottom }  texturas del piso capital
 *   col, row = coords de la celda (para el seed)
 *
 * Devuelve un array de strings (.map brushes).
 */
function _ruinaCapitalBrushes({ x0, y0, x1, y1, bottomZ, topZ }, faces, col, row) {
  // PRNG determinista mulberry32 con seed = hash(col, row). La misma celda
  // siempre da la misma silueta; recompilar el mapa no cambia su aspecto.
  let s = (((col * 0x9E3779B9) ^ (row * 0x85EBCA77)) >>> 0) || 1;
  const rand = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const WALL_T = 8;  // grosor del muro en uds Quake (~12% de CELL_SIZE)
  const variant = (rand() * 4) | 0;
  const out = [];

  const box = (X0, Y0, Z0, X1, Y1, Z1) =>
    boxBrush(
      { minX: X0, maxX: X1, minY: Y0, maxY: Y1, minZ: Z0, maxZ: Z1 },
      faces.side,
      { topTex: faces.top, bottomTex: faces.bottom },
    );

  // Muro completo en uno de los 4 lados con altura variable. Si gapFrac
  // se pasa, el muro se trunca a esa fraccion (ventana abierta hasta
  // arriba) en lugar de dejar un dintel flotante. side: 'N' 'S' 'E' 'O'.
  function wallSide(side, heightFrac, gapFrac) {
    let effectiveFrac = heightFrac;
    // Si hay "ventana", el muro acaba en la base de la ventana — sin
    // dintel arriba (que se veria como una raya horizontal flotante en
    // el aire, sobre todo cuando los muros adyacentes tienen distinta
    // altura).
    if (gapFrac !== null && gapFrac !== undefined) {
      effectiveFrac = Math.min(heightFrac, gapFrac);
    }
    const wallTopZ = bottomZ + (topZ - bottomZ) * effectiveFrac;
    let wx0, wy0, wx1, wy1;
    if (side === 'N')      { wx0 = x0; wx1 = x1; wy0 = y1 - WALL_T; wy1 = y1; }
    else if (side === 'S') { wx0 = x0; wx1 = x1; wy0 = y0; wy1 = y0 + WALL_T; }
    else if (side === 'E') { wx0 = x1 - WALL_T; wx1 = x1; wy0 = y0; wy1 = y1; }
    else                   { wx0 = x0; wx1 = x0 + WALL_T; wy0 = y0; wy1 = y1; }
    if (wallTopZ > bottomZ + 4) {
      out.push(box(wx0, wy0, bottomZ, wx1, wy1, wallTopZ));
    }
  }

  // Columna en una esquina (WALL_T x WALL_T, altura completa).
  function corner(c) {
    let cx0, cy0;
    if (c === 'NE')      { cx0 = x1 - WALL_T; cy0 = y1 - WALL_T; }
    else if (c === 'SE') { cx0 = x1 - WALL_T; cy0 = y0; }
    else if (c === 'SO') { cx0 = x0;          cy0 = y0; }
    else                 { cx0 = x0;          cy0 = y1 - WALL_T; }
    out.push(box(cx0, cy0, bottomZ, cx0 + WALL_T, cy0 + WALL_T, topZ));
  }

  if (variant === 0) {
    // A) L: muro N completo + medio muro E.
    wallSide('N', 1.0, null);
    wallSide('E', 0.6, null);
  } else if (variant === 1) {
    // B) U: muro N truncado (ventana abierta arriba) + muro E + medio O.
    wallSide('N', 1.0, 0.55);
    wallSide('E', 0.9, null);
    wallSide('O', 0.5, null);
  } else if (variant === 2) {
    // C) Un muro N truncado (ventana abierta) + columna SO superviviente.
    wallSide('N', 0.85, 0.5);
    corner('SO');
  } else {
    // D) Cuatro muros bajos parciales (planta baja de las fachadas).
    wallSide('N', 0.5, null);
    wallSide('E', 0.45, null);
    wallSide('S', 0.55, null);
    wallSide('O', 0.4, null);
  }
  return out;
}

/**
 * Brush tetraedro apoyado en 3 esquinas altas del corner_in con apex en la
 * misma esquina alta pero subido a `topZ`. Geometricamente: triangulo base
 * en el cuadrante de la esquina alta del corner_in (los 3 corners que tienen
 * techo plano a `bottomZ`), arista vertical en el apex, y un cuarto plano
 * inclinado que cierra el tetraedro y mira hacia el cuadrante bajo del
 * corner_in. Cuatro caras totales:
 *   - base triangular (z = bottomZ): la mitad NE de la celda (para dir=0).
 *   - 2 caras verticales en y=y1 y x=x1 (lado de los ortos altos).
 *   - 1 cara inclinada diagonal (continua con el plano interno del corner_in
 *     pero con pendiente inversa).
 *
 * dir indica la esquina ALTA del corner_in (donde esta el apex):
 *   0 = NE alto, 1 = SE alto, 2 = SO alto, 3 = NO alto.
 */
function _pyramidTipBrush({ x0, y0, x1, y1, bottomZ, topZ, dir }, texName, opts = {}) {
  const uScale = opts.uScale ?? 1;
  const vScale = opts.vScale ?? 1;
  const xy = { u: [1, 0, 0], v: [0, -1, 0] };
  const xz = { u: [1, 0, 0], v: [0, 0, -1] };
  const yz = { u: [0, 1, 0], v: [0, 0, -1] };
  const bZ = bottomZ, tZ = topZ;
  const topUOff = -x0, topVOff = y1;
  const sideXZUOff = -x0, sideXZVOff = tZ;
  const sideYZUOff = -y0, sideYZVOff = tZ;
  // 4 esquinas base (z=bZ) y 4 esquinas tope (z=tZ). El tetraedro usa
  // tres esquinas adyacentes al apex como base + el apex arriba.
  //
  // dir: 0=NE alto. Las 3 esquinas adyacentes al apex NE son NO, NE, SE.
  // dir: 1=SE alto. Las 3 esquinas adyacentes al apex SE son NE, SE, SO.
  // dir: 2=SO alto. Las 3 esquinas adyacentes al apex SO son SE, SO, NO.
  // dir: 3=NO alto. Las 3 esquinas adyacentes al apex NO son SO, NO, NE.
  // (las tres esquinas son las dos contiguas al apex + el propio apex en
  // su nivel base. La cuarta esquina, opuesta al apex, queda fuera del
  // tetraedro porque ese es el cuadrante SIN techo plano en el corner_in.)
  const NW = [x0, y1, bZ];
  const NE = [x1, y1, bZ];
  const SE = [x1, y0, bZ];
  const SW = [x0, y0, bZ];
  const NWt = [x0, y1, tZ];
  const NEt = [x1, y1, tZ];
  const SEt = [x1, y0, tZ];
  const SWt = [x0, y0, tZ];
  // Para cada dir definimos los 4 vertices del tetraedro:
  //   base = [B1, B2, B3] (triangulo base en z=bZ, CCW visto desde arriba)
  //   apex (z=tZ, justo encima de B2 — la esquina alta del corner_in)
  // y los 3 planos laterales como triplets (v1, v2, apex) que mantengan la
  // normal apuntando hacia DENTRO (cross (v2-v1)x(apex-v1) hacia el centro
  // del tetraedro). El orden de B1, B2, B3 se fija para que la base, vista
  // desde arriba en CCW, vaya recorriendo el cuadrante del apex.
  let B1, B2, B3, apex;
  if (dir === 0) {
    // Apex NE. Base triangulo NW-NE-SE (cuadrante NE de la celda).
    B1 = NW; B2 = NE; B3 = SE; apex = NEt;
  } else if (dir === 1) {
    // Apex SE. Base triangulo NE-SE-SW.
    B1 = NE; B2 = SE; B3 = SW; apex = SEt;
  } else if (dir === 2) {
    // Apex SW. Base triangulo SE-SW-NW.
    B1 = SE; B2 = SW; B3 = NW; apex = SWt;
  } else {
    // Apex NW. Base triangulo SW-NW-NE.
    B1 = SW; B2 = NW; B3 = NE; apex = NWt;
  }
  const lines = [];
  // Base (z=bZ): el tetraedro esta arriba del plano, asi que la normal
  // dentro apunta +Z. Para que (B2-B1)x(B3-B1) = +Z, B1,B2,B3 deben ir CCW
  // visto desde arriba. Pero la convencion QBSP es que cross apunta DENTRO
  // del solido — y el solido esta arriba (+Z). Por tanto CCW visto desde
  // arriba es el orden correcto.
  //
  // Verificacion dir=0: B1=NW=(x0,y1), B2=NE=(x1,y1), B3=SE=(x1,y0).
  //   (B2-B1) = (cell,0,0); (B3-B1) = (cell,-cell,0).
  //   cross = (0·0-0·(-cell), 0·cell-cell·0, cell·(-cell)-0·cell)
  //         = (0, 0, -cell^2). Apunta -Z. ✗
  // Hay que invertir el orden: B1, B3, B2.
  lines.push(_face(B1, B3, B2,
    texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));
  // Tres caras laterales: cada arista de la base + apex. El orden v1,v2,apex
  // tal que (v2-v1)x(apex-v1) apunte hacia DENTRO del tetraedro. Para una
  // base CCW vista desde arriba (cuando se da en el orden B1,B2,B3 que
  // produce +Z en cross), el orden hacia dentro es invertido. Como aqui
  // damos la base en orden B1,B3,B2 (CW visto desde arriba), el orden
  // hacia dentro de las laterales es B1->B2, B2->B3, B3->B1.
  lines.push(_face(B1, B2, apex,
    texName, xz.u, xz.v, sideXZUOff, sideXZVOff, uScale, vScale));
  lines.push(_face(B2, B3, apex,
    texName, yz.u, yz.v, sideYZUOff, sideYZVOff, uScale, vScale));
  lines.push(_face(B3, B1, apex,
    texName, xy.u, xy.v, topUOff, topVOff, uScale, vScale));
  return '{\n' + lines.join('\n') + '\n}';
}

/**
 * Build the .map text from a TilemapData.
 *
 * @param {Object} args
 * @param {object} args.tilemap
 * @param {string} args.wadKey   semicolon-separated WAD paths for worldspawn "wad"
 * @returns {{text:string, warnings:string[], info:string[]}}
 *   - warnings  things that may make the map look wrong (missing
 *               textures, pure-ocean output, …)
 *   - info      neutral progress/optimisation stats (brush counts,
 *               cell counts, etc.) — separated so the compile-log
 *               viewer doesn't flag them as WARNING.
 */
function buildMapText({ tilemap, wadKey, debug = false, phong = true }) {
  const warnings = [];
  const info = [];

  // ---------- modo 'flat' ----------
  // El perfil mas rapido. El usuario lo elige en RightPanel ("Flat") para
  // iterar gameplay sin esperar la compilacion completa. Sustituimos
  // heights por una version binaria (debajo del agua = -1, encima = 0),
  // descartamos edificios (casas/torres) y limpiamos decoraciones de
  // erosion. Como el resto del writer lee los mismos arrays, basta con
  // sobrescribirlos en un tilemap "vista" sin tocar el original.
  //
  // Nota: NO tocamos enemies, patrols ni spawn — esos son justo lo que
  // queremos testear. Tampoco objetos no-edificio (arboles, lamparas)
  // por ahora; si tambien queremos saltarlos para velocidad extra,
  // pondriamos un check `isBuilding || true` mas adelante.
  if (tilemap.quality === 'flat') {
    // Phong fuera tambien — el terreno aplanado no tiene rampas ni esquinas
    // donde phong ayude, y light pierde tiempo computando normales por
    // vertice para nada. Sobrescribimos el parametro local; el toggle de
    // la toolbar se respeta para los demas perfiles.
    phong = false;
    const N = tilemap.cols * tilemap.rows;
    // Aplanamos TODAS las celdas a h=0: incluso las que estaban sumergidas
    // se elevan a tierra para que no queden huecos en el suelo cuando
    // saltemos el water brush global. El resultado es una losa plana —
    // sirve para testear gameplay sobre la planta del mapa.
    const flatHeights = new Int16Array(N);
    // .fill(0) implicit (Int16Array nuevo)
    // Edificios fuera (casa, tower). Pequenos decorativos (lampara, arbol,
    // arbusto, roca) tambien fuera porque cada uno emite un brush extra
    // que no aporta nada a un test de gameplay.
    const flatObjects = new Array(N).fill(null);
    // Decoraciones de erosion fuera: con el terreno aplanado dejarian de
    // tener sentido (todas las rampas/pits estarian a la misma altura).
    const flatDecos = tilemap.decorations ? new Int16Array(N) : null;
    tilemap = {
      ...tilemap,
      heights: flatHeights,
      objects: flatObjects,
      decorations: flatDecos,
      smoothing: new Array(N).fill(null),
    };
    info.push(`flat mode: terrain flattened to single level, water/buildings/objects/decorations dropped`);
  }
  const { cols, rows, cellSize, textures, heights, sun } = tilemap;
  // En modo debug todos los brushes de erosion y terreno usan texturas
  // dbg_* planas para que `debug_point` del motor Ironwail patcheado nos
  // diga directamente que kind genera el face donde apuntamos.
  // Las texturas dbg_* viven en debug.wad (ver wadWriter.ensureDebugWad).
  const DBG_TEX = {
    terrain:    'dbg_terrain',
    corner_in:  'dbg_corner_in',
    corner_tip: 'dbg_corner_tip',
    ramp:       'dbg_ramp',
    ramp_diag:  'dbg_ramp_diag',
    cube:       'dbg_cube',
    other:      'dbg_other',
  };

  // Grid is centred on the world origin. The grid spans gridHalf on each axis;
  // outside the grid, the world is just ocean (the global water brush covers it).
  const gridHalfX = (cols * cellSize) / 2;
  const gridHalfY = (rows * cellSize) / 2;
  if (gridHalfX > WORLD_HALF || gridHalfY > WORLD_HALF) {
    warnings.push(
      `grid ${cols}×${rows} (${gridHalfX*2}×${gridHalfY*2}u) exceeds world ±${WORLD_HALF}`,
    );
  }

  // Play-area extraction (used both by the cell loop later AND by the
  // world box below when strict mode shrinks the seal to the area).
  const pa = tilemap.playArea;
  const restrictArea = !!(pa && pa.restrict);
  const strictArea   = !!(pa && pa.restrict && pa.strict);

  // World box bounds in X/Y. By default they cover the full playable
  // world (±WORLD_HALF). In strict-area mode they shrink to the area's
  // cell rectangle — far fewer big faces for qbsp/vis to process.
  let xMin, xMax, yMin, yMax;
  if (strictArea) {
    xMin = -gridHalfX +  pa.c0       * cellSize;
    xMax = -gridHalfX + (pa.c1 + 1)  * cellSize;
    // Rows flip: row 0 = +Y edge.
    const yIdxSouthOfR1 = (rows - 1) - pa.r1;
    const yIdxNorthOfR0 = (rows - 1) - pa.r0 + 1;
    yMin = -gridHalfY + yIdxSouthOfR1 * cellSize;
    yMax = -gridHalfY + yIdxNorthOfR0 * cellSize;
  } else {
    xMin = -WORLD_HALF; xMax = WORLD_HALF;
    yMin = -WORLD_HALF; yMax = WORLD_HALF;
  }
  const swt = SKY_WALL_THICKNESS;

  const out = [];

  // ---------- worldspawn ----------
  out.push('{');
  out.push('"classname" "worldspawn"');
  out.push(`"wad" "${wadKey}"`);
  out.push(`"sky" "${SKY_NAME}"`);
  // Protocol 666 (bigcoords) — required for coords beyond ±4096.
  out.push('"protocol" "666"');
  // Sun.
  out.push(`"_sunlight" "${sun.intensity}"`);
  out.push(`"_sunlight_mangle" "${sun.mangle}"`);
  out.push(`"_sunlight_color" "${sun.color}"`);
  out.push(`"_sunlight_penumbra" "${sun.penumbra}"`);
  if (sun.sunlight2) out.push(`"_sunlight2" "${sun.sunlight2}"`);
  if (sun.sunlight2Color) out.push(`"_sunlight_color2" "${sun.sunlight2Color}"`);
  // _minlight clamps the lightmap floor — keeps interior shadows
  // readable. Skipped when 0 so 'off' doesn't add the key at all.
  if (sun.minlight) out.push(`"_minlight" "${sun.minlight}"`);
  out.push('"_dirt" "1"');

  // ---------- sky box ----------
  // 4 walls + ceiling. Sit just outside the playable world so their
  // thickness doesn't bite into ±WORLD_HALF.
  const skyMinZ = BEDROCK_TOP_Z;
  const skyMaxZ = SKY_TOP_Z + swt;

  // West wall (-X).
  out.push(boxBrush(
    { minX: xMin - swt, maxX: xMin, minY: yMin - swt, maxY: yMax + swt,
      minZ: skyMinZ,    maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // East wall (+X).
  out.push(boxBrush(
    { minX: xMax, maxX: xMax + swt, minY: yMin - swt, maxY: yMax + swt,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // South wall (-Y).
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin - swt, maxY: yMin,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // North wall (+Y).
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMax, maxY: yMax + swt,
      minZ: skyMinZ, maxZ: skyMaxZ },
    SKY_TEXTURE,
  ));
  // Ceiling (+Z).
  out.push(boxBrush(
    { minX: xMin - swt, maxX: xMax + swt,
      minY: yMin - swt, maxY: yMax + swt,
      minZ: SKY_TOP_Z,  maxZ: SKY_TOP_Z + swt },
    SKY_TEXTURE,
  ));

  // ---------- bedrock ----------
  // Solid slab below water — vis-opaque, seals the map from below.
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax,
      minZ: BEDROCK_TOP_Z - BEDROCK_THICKNESS, maxZ: BEDROCK_TOP_Z },
    BEDROCK_TEXTURE,
  ));

  // ---------- water (coastal depth bands) ----------
  // The sea covers the whole world box from bedrock top up to (just below)
  // sea level. Liquid texture (prefix '*') makes qbsp emit warpsurface
  // faces. The surface sits WATER_DROP units below SEA_LEVEL_Z so beach
  // tiles (h=0, top at SEA_LEVEL_Z) read as a slight shoreline instead of
  // coplanar — better visually and avoids qbsp coplanar-face problems.
  //
  // Instead of one flat '*water' brush we shade the sea by distance to the
  // coast: shallow water touching land is bright turquoise (*water1), going
  // darker out to open sea (*water4). To keep brush count low (and avoid
  // coplanar overlaps) we DON'T emit one brush per cell — we classify each
  // submerged grid cell into a shade band, then greedily merge same-shade
  // cells along each row into wide strips (one brush per run). Open ocean
  // outside the grid is the deepest shade.
  //
  // Skipped in flat mode: the terrain is flattened to dry land everywhere
  // (no submerged cells), so there's no sea to cover.
  if (tilemap.quality !== 'flat') {
    const WATER_DROP = 8;
    emitWaterBands({
      out, heights, cols, rows, cellSize, gridHalfX, gridHalfY,
      xMin, xMax, yMin, yMax,
      waterMinZ: BEDROCK_TOP_Z, waterMaxZ: SEA_LEVEL_Z - WATER_DROP,
    });
  }

  // ---------- terrain cells + objects ----------
  // (declarations needed by both the main terrain pass AND the minimap.)
  // Cell (col, row) maps to world XY centred on origin.
  //   x0 = -gridHalfX + col * cellSize
  //   row 0 is the NORTH edge (largest Y). Flip:
  //   ySouthIdx = (rows - 1) - row
  //   y0 = -gridHalfY + ySouthIdx * cellSize
  //
  // Only emerged cells (height >= SEA_LEVEL_H) emit a terrain brush.
  // Submerged cells are covered by the global water brush.
  // Objects sit on top of the cell's terrain.
  let landCount = 0;
  let untexturedLand = 0;
  // Non-sealing brushes (terrain cells, low buildings, props) go in a
  // single func_detail at the end. func_detail brushes don't participate
  // in vis, which speeds compilation a lot on big outdoor maps. Only
  // brushes that actually seal the map (sky walls/ceiling, bedrock, the
  // global water brush, and skyscrapers reaching the sky) stay in
  // worldspawn.
  const detailBrushes = [];
  // Collected light entities (object placements + minimap fill light).
  // Emitted after worldspawn so they live in their own `{ classname light }` blocks.
  // Declared up here because emitMinimap needs to push into it.
  const pendingLights = [];
  // Visual brushes of the minimap. They go into their own
  // func_detail_illusionary entity after worldspawn closes — keeps them
  // out of the main BrushBSP, which speeds qbsp dramatically.
  const minimapVisualBrushes = [];
  // NOTE: clouds are no longer emitted by the editor. They're built offline
  // as a standalone brush model (scripts/gen-cloud-bsp.js → cloudGen.js).

  // ---------- minimap (under-bedrock visual copy of the map) ----------
  // Sealed capsule far below the main world. Flat 1:1 copy with land
  // cells as thin tiles on a global blue-sea plane. Visual / design
  // reference only — not playable. Walls/ceiling/floor seal the capsule
  // (worldspawn); tiles and sea go to func_detail_illusionary later.
  emitMinimap({
    out, detailBrushes, minimapVisualBrushes,
    tilemap, heights, textures,
    cols, rows, cellSize, gridHalfX, gridHalfY,
    xMin, xMax, yMin, yMax,
  });

  // Counters for the compile-log summary. runsBeforeMesh totals every
  // vertical run produced by optimisation A; bucketRuns is the subset
  // that entered the greedy-mesh pass (opt-B). The greedy pass collapses
  // those into meshBrushes, so opt-B saved (bucketRuns − meshBrushes)
  // brushes on top of opt-A.
  let runsBeforeMesh = 0;
  let bucketRuns = 0;
  // Optimisation B (greedy mesh 2D). Each vertical run that fills its
  // cell footprint goes into a bucket keyed by its texture/Z signature.
  // After the cell loop we walk each bucket and emit one brush per
  // maximal rectangle of cells contributing to it. Building runs with
  // an inset and sealing runs (skyscraper top) skip this — they go
  // straight to detailBrushes / worldspawn.
  //
  // bucket.cellMask is a Uint8Array(cols*rows): 1 if the cell at
  // (col,row) is unclaimed and contributes this signature.
  const meshBuckets = new Map();
  // pendingLights is declared up top — emitMinimap pushes into it.

  // Optional play area: when defined AND `restrict` is true, only emit
  // cells whose (col, row) falls inside the rectangle. Cells outside
  // become plain ocean (covered by the global water brush).
  // pa / restrictArea are already declared up top (the world box also
  // needs them for the strict-shrink case).
  const inArea = restrictArea
    ? (col, row) => (col >= pa.c0 && col <= pa.c1 && row >= pa.r0 && row <= pa.r1)
    : () => true;

  // Helper: tallest neighbour terrain height (above sea level), in
  // height-units. Submerged neighbours don't contribute. Falls back to
  // SEA_LEVEL_H when all neighbours are below water — keeps the column
  // "base" at the first cube above sea level in that case.
  function neighbourMaxH(col, row) {
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

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const h = heights[i];
      if (h < SEA_LEVEL_H) continue;
      if (!inArea(col, row)) continue;

      const texIdx = textures[i];
      let terrainBiomeTex = biomeTexForPaletteIdx(texIdx);
      if (!terrainBiomeTex) {
        terrainBiomeTex = FALLBACK_BIOME_TEX;
        untexturedLand++;
      }

      // Object on this cell: buildings extend the column stack; small
      // decorative objects (lamp, tree, etc.) emit their own brush
      // alongside the terrain column.
      const obj = tilemap.objects?.[i];
      const objMeta = obj ? OBJECT_BY_KIND.get(obj.kind) : null;
      const isBuilding = objMeta && objMeta.isBuilding;
      const buildingBiomeTex = isBuilding ? objMeta.tex : null;
      const isSkyscraper = isBuilding && obj.kind === 'tower';

      const x0 = -gridHalfX + col * cellSize;
      const x1 = x0 + cellSize;
      const ySouthIdx = (rows - 1) - row;
      const y0 = -gridHalfY + ySouthIdx * cellSize;
      const y1 = y0 + cellSize;

      // Building storey count. Towers were skyscrapers (reached the sky
      // ceiling); now they're a tall but bounded watch tower: 30..40
      // storeys chosen deterministically from (col,row) so the same map
      // always compiles to the same silhouette.
      let buildingStoreys = 0;
      if (isBuilding) {
        if (isSkyscraper) {
          // Deterministic hash of (col,row) → integer in [30, 40].
          const m = Math.imul(col, 0x85EBCA6B) ^ Math.imul(row + 1, 0xC2B2AE35);
          const u = (m ^ (m >>> 13)) >>> 0;
          buildingStoreys = 30 + (u % 11);                  // 30..40 inclusive
        } else {
          buildingStoreys = Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX,
            (typeof obj.storeys === 'number' ? obj.storeys : HOUSE_STOREYS_MIN)));
        }
      }

      // Stack indexing in cube units, k=0 = lowest cube against bedrock.
      //   terrainCubes  = SEAL_CUBES (sub-water) + h (emerged terrain)
      //   total         = terrainCubes + buildingStoreys
      //   neighborMax_k = SEAL_CUBES + neighbourMaxH(col,row)
      //                   (so the base anchors at the first cube above
      //                    the tallest adjacent terrain)
      const terrainCubes = SEAL_CUBES + h;
      const total = terrainCubes + buildingStoreys;
      const neighborMaxK = SEAL_CUBES + neighbourMaxH(col, row);

      // Building footprint inset (centred in the cell). Terrain cubes
      // always fill the full cell.
      const inset = isBuilding ? (cellSize * (1 - objMeta.footprint)) / 2 : 0;
      const bx0 = x0 + inset, bx1 = x1 - inset;
      const by0 = y0 + inset, by1 = y1 - inset;

      // Vertical run accumulator. Coalesces consecutive cubes of the
      // column into a single taller brush when they share the same
      // sideTex AND the boundary between them is occluded (top of the
      // earlier cube + bottom of the later cube are both hidden by
      // the contact). Cuts a typical column of 12 cubes down to 2–4
      // runs: SEAL + (BASE) + SIDE-RUN + CAPITAL/TOP. The
      // skyscraper top cube is always its own run because it goes to
      // worldspawn (sealing) while everything else goes to func_detail.
      //
      // Runs that fill the cell footprint (i.e. terrain, or buildings
      // with footprint=1) are buffered into meshBuckets so the greedy
      // 2D pass at the end can merge identical runs across adjacent
      // cells. Sealing runs and inset-building runs sidestep the mesh
      // and emit immediately.
      let run = null;
      function emitRun(r) {
        if (!r) return;
        runsBeforeMesh++;
        const fillsCell = r.x0 === x0 && r.x1 === x1
                       && r.y0 === y0 && r.y1 === y1;
        if (r.sealing || !fillsCell) {
          const sideTex   = r.sideTex;
          const topTex    = r.topTex    ?? sideTex;
          const bottomTex = r.bottomTex ?? sideTex;
          const brush = boxBrush(
            { minX: r.x0, maxX: r.x1, minY: r.y0, maxY: r.y1,
              minZ: r.minZ, maxZ: r.maxZ },
            sideTex,
            { topTex, sideTex, bottomTex },
          );
          if (r.sealing) out.push(brush);
          else           detailBrushes.push(brush);
          return;
        }
        // Cell-filling, non-sealing → defer to the greedy pass.
        bucketRuns++;
        const key = `${r.minZ}|${r.maxZ}|${r.sideTex}|${r.topTex ?? ''}|${r.bottomTex ?? ''}`;
        let bucket = meshBuckets.get(key);
        if (!bucket) {
          bucket = {
            minZ: r.minZ, maxZ: r.maxZ,
            sideTex: r.sideTex,
            topTex: r.topTex, bottomTex: r.bottomTex,
            cellMask: new Uint8Array(cols * rows),
          };
          meshBuckets.set(key, bucket);
        }
        bucket.cellMask[row * cols + col] = 1;
      }
      for (let k = 0; k < total; k++) {
        const isTerrainCube = k < terrainCubes;
        const biomeTex = isTerrainCube ? terrainBiomeTex : buildingBiomeTex;
        let faces = pickFaceTextures(k, total, neighborMaxK, biomeTex);
        if (debug && isTerrainCube) {
          // Override total: en debug todo el terreno usa dbg_terrain plano.
          // Solo afecta cubos de terreno; los edificios mantienen su look.
          faces = { side: DBG_TEX.terrain, top: DBG_TEX.terrain, bottom: faces.bottom };
        }

        const cubeMinZ = BEDROCK_TOP_Z + k * HEIGHT_UNIT;
        const cubeMaxZ = cubeMinZ + HEIGHT_UNIT;

        const useBuildingFootprint = !isTerrainCube && inset > 0;
        const cx0 = useBuildingFootprint ? bx0 : x0;
        const cx1 = useBuildingFootprint ? bx1 : x1;
        const cy0 = useBuildingFootprint ? by0 : y0;
        const cy1 = useBuildingFootprint ? by1 : y1;

        // Caso especial: piso capital de una RUINA. Sustituye el cubo
        // entero por muros parciales (silueta de esqueleto/escombros). La
        // variante se elige determinista por (col,row). Solo cuando el
        // edificio tiene >=2 plantas de construccion (si solo hay 1 piso,
        // emitimos el cubo normal para que el edificio no se "desvanezca").
        const isRuinaCapital = !isTerrainCube
          && obj && obj.kind === 'ruina'
          && k === total - 1
          && buildingStoreys >= 2;
        if (isRuinaCapital) {
          // Cerramos el run actual (todas las plantas anteriores ya van
          // como cubos normales) antes de meter los brushes especiales.
          emitRun(run);
          run = null;
          const capFaces = pickFaceTextures(k, total, neighborMaxK, buildingBiomeTex);
          const ruinaBrushes = _ruinaCapitalBrushes(
            { x0: cx0, y0: cy0, x1: cx1, y1: cy1,
              bottomZ: cubeMinZ, topZ: cubeMaxZ },
            { side: capFaces.side, top: capFaces.top, bottom: capFaces.bottom },
            col, row,
          );
          for (const b of ruinaBrushes) detailBrushes.push(b);
          continue;  // saltamos la logica normal de extender/iniciar run.
        }

        // Can we stretch the previous run to include this cube? Need
        // matching footprint + same sideTex + the boundary between
        // them must be hidden on both sides (run's top was null AND
        // this cube's bottom is null), AND neither end is the special
        // sky-sealing brush (those must stay alone so they reach
        // worldspawn).
        const canExtend = run
          && run.x0 === cx0 && run.x1 === cx1
          && run.y0 === cy0 && run.y1 === cy1
          && run.sideTex === faces.side
          && run.topTex === null
          && faces.bottom === null
          && !run.sealing;

        if (canExtend) {
          run.maxZ   = cubeMaxZ;
          run.topTex = faces.top;
        } else {
          emitRun(run);
          run = {
            x0: cx0, x1: cx1, y0: cy0, y1: cy1,
            minZ: cubeMinZ, maxZ: cubeMaxZ,
            sideTex: faces.side,
            topTex: faces.top,
            bottomTex: faces.bottom,
            sealing: false,
          };
        }
      }
      emitRun(run);
      landCount++;

      // Decoraciones de erosion (preparacion_iso). El rampBrush conecta el
      // suelo de la celda con la altura del vecino mas alto correspondiente
      // (norte para ramp-N, esquina NE para ramp-NE, etc.), de modo que la
      // rampa "encaja" sin escalon visible con el cubo vecino.
      const decoCode = tilemap.decorations ? tilemap.decorations[i] : 0;
      if (decoCode) {
        const deco = decodeDeco(decoCode);
        const rampDir = deco ? _kindToRampDirection(deco.kind, deco.dir) : null;
        // En modo debug elegimos la textura segun el kind para que en el
        // motor `debug_point` la identifique. En modo normal usamos la
        // textura top del bioma del cubo de abajo.
        let decoTex;
        if (debug) {
          if (!deco) decoTex = DBG_TEX.other;
          else if (deco.kind === 'corner_in') decoTex = DBG_TEX.corner_in;
          else if (deco.kind === 'ramp')      decoTex = DBG_TEX.ramp;
          else if (deco.kind === 'ramp_diag' || deco.kind === 'corner_out')
            decoTex = DBG_TEX.ramp_diag;
          else if (deco.kind === 'cube')      decoTex = DBG_TEX.cube;
          else                                decoTex = DBG_TEX.other;
        } else {
          decoTex = terrainBiomeTex.top || FALLBACK_BIOME_TEX.top;
        }
        const terrainTopZ = h * HEIGHT_UNIT;
        // Altura objetivo: la del vecino mas alto en la direccion del kind.
        // Asi la cara alta de la rampa cuadra con la cara superior del cubo
        // vecino y no queda escalon ni hueco.
        function hAtSafe(c, r) {
          if (c < 0 || c >= cols || r < 0 || r >= rows) return h;
          return Math.max(h, heights[r * cols + c]);
        }
        let neighborMaxH = h;
        if (deco) {
          if (deco.kind === 'ramp') {
            neighborMaxH = ({
              0: hAtSafe(col, row - 1),    // N
              1: hAtSafe(col + 1, row),    // E
              2: hAtSafe(col, row + 1),    // S
              3: hAtSafe(col - 1, row),    // O
            })[deco.dir] ?? h;
          } else if (deco.kind === 'corner_in') {
            // Para corner_in necesitamos la altura del vecino MAS ALTO entre
            // los tres que tocan la esquina alta (dos ortogonales + diagonal).
            // Antes mirabamos solo el diagonal: cuando un orto era cubo entero
            // mas alto, decoTopZ se quedaba corto y la condicion
            // `decoTopZ > terrainTopZ` daba false, suprimiendo todo el brush.
            const corners3 = ({
              0: [hAtSafe(col, row - 1), hAtSafe(col + 1, row), hAtSafe(col + 1, row - 1)],
              1: [hAtSafe(col, row + 1), hAtSafe(col + 1, row), hAtSafe(col + 1, row + 1)],
              2: [hAtSafe(col, row + 1), hAtSafe(col - 1, row), hAtSafe(col - 1, row + 1)],
              3: [hAtSafe(col, row - 1), hAtSafe(col - 1, row), hAtSafe(col - 1, row - 1)],
            })[deco.dir];
            neighborMaxH = corners3
              ? Math.max(corners3[0], corners3[1], corners3[2])
              : h;
          } else if (deco.kind === 'ramp_diag' || deco.kind === 'corner_out') {
            neighborMaxH = ({
              0: hAtSafe(col + 1, row - 1), // NE
              1: hAtSafe(col + 1, row + 1), // SE
              2: hAtSafe(col - 1, row + 1), // SO
              3: hAtSafe(col - 1, row - 1), // NO
            })[deco.dir] ?? h;
          }
        }
        // Limitamos la altura del bloque de erosion a 1 HEIGHT_UNIT (64u).
        // Si el cubo vecino esta a varias unidades por encima, no estiramos
        // el brush hasta alli — eso producia rampas de 128u o mas que el
        // jugador veia raras y rompian la coherencia con el tilemap.
        const decoTopZ = Math.min(
          neighborMaxH * HEIGHT_UNIT,
          terrainTopZ + HEIGHT_UNIT,
        );
        if (rampDir && decoTopZ > terrainTopZ) {
          // ramp cardinal y corner_out (pico unico): tetraedro/cuna.
          detailBrushes.push(_rampBrush(
            { x0, y0, x1, y1,
              bottomZ: terrainTopZ, topZ: decoTopZ,
              direction: rampDir },
            decoTex,
          ));
        } else if (deco && deco.kind === 'corner_in' && decoTopZ > terrainTopZ) {
          // corner_in: cubo lleno con la esquina opuesta cortada (geometria
          // inversa al tetraedro de corner_out / ramp_diag).
          detailBrushes.push(_cornerInBrush(
            { x0, y0, x1, y1,
              bottomZ: terrainTopZ, topZ: decoTopZ, dir: deco.dir },
            decoTex,
          ));
          // Tip piramidal encima del corner_in. Para que las dos caras
          // verticales del tip (en y=y1 y x=x1 para dir=0) queden ocultas,
          // los vecinos ortogonales N y E deben tener carne solida a la
          // altura del apex en la arista que toca el corner_in. Eso solo
          // ocurre cuando el deco del vecino eleva LAS DOS esquinas de esa
          // arista (no basta con que tenga "alguna" deco). Si la deco del
          // vecino sube en otra direccion, la arista que toca el corner_in
          // sigue al nivel `h_vecino`, y un apex mas alto deja la cara del
          // tip al aire.
          //
          // helps(c, r, needCorners): cobertura del vecino (c,r) en las
          // esquinas pedidas. Devuelve h+1 si TODAS las esquinas estan
          // altas, h en caso contrario. needCorners es un subset de
          // {NE, SE, SW, NW} expresado como mascara de bits (1=NE, 2=SE,
          // 4=SW, 8=NW).
          const C_NE = 1, C_SE = 2, C_SW = 4, C_NW = 8;
          function highCornersOf(decoCode) {
            if (!decoCode) return 0;
            const kIdx = ((decoCode >> 2) & 0xff) - 1;
            const d = decoCode & 3;
            const kinds = ['ramp','ramp_u','ramp_diag','pit','corner_in','corner_out','pyramid','cube','wedge','ramp_u_closed','bridge_diag'];
            const k = kinds[kIdx];
            if (k === 'ramp') {
              // dir: 0=N alto (cresta y=y1) → NE+NW altas.
              //      1=E alto → NE+SE; 2=S alto → SE+SW; 3=O alto → SW+NW.
              return [C_NE|C_NW, C_NE|C_SE, C_SE|C_SW, C_SW|C_NW][d];
            }
            if (k === 'corner_in') {
              // dir indica la esquina ALTA puntiaguda (las 3 ADYACENTES a
              // la opuesta son altas). dir=0 NE alto → NE+NW+SE altas.
              return [C_NE|C_NW|C_SE, C_NE|C_SE|C_SW, C_SE|C_SW|C_NW, C_NW|C_NE|C_SW][d];
            }
            if (k === 'ramp_diag' || k === 'corner_out') {
              return [C_NE, C_SE, C_SW, C_NW][d];
            }
            if (k === 'cube' || k === 'pyramid') return 0xf; // todas altas
            return 0;
          }
          function coverEdge(c, r, needMask) {
            if (c < 0 || c >= cols || r < 0 || r >= rows) return h;
            const hn = heights[r * cols + c];
            const dn = (tilemap.decorations && tilemap.decorations[r * cols + c]) || 0;
            const hi = highCornersOf(dn);
            // +1 solo si TODAS las esquinas necesarias estan altas.
            return ((hi & needMask) === needMask) ? hn + 1 : hn;
          }
          // Para que el apex del tip a (x_apex, y_apex, apexH*64) este
          // cubierto, basta con que cada vecino que rodea el apex tenga
          // ALTA la esquina que coincide con la esquina apex.
          // Para corner_in dir=0 (apex NE de la celda):
          //   - vecino N: esquina del vecino que coincide con apex = SE
          //   - vecino E: esquina del vecino que coincide con apex = NW
          //   - vecino NE: esquina del vecino que coincide con apex = SW
          // Si esa esquina del vecino es alta, el vecino baja linealmente
          // desde el apex hacia su esquina opuesta, formando un plano que
          // empata con el plano del tip — sin huecos.
          const tipEdges = ({
            0: [
              { dc: 0,  dr: -1, mask: C_SE },                  // N
              { dc: 1,  dr:  0, mask: C_NW },                  // E
              { dc: 1,  dr: -1, mask: C_SW },                  // NE
            ],
            1: [
              { dc: 0,  dr:  1, mask: C_NE },                  // S
              { dc: 1,  dr:  0, mask: C_SW },                  // E
              { dc: 1,  dr:  1, mask: C_NW },                  // SE
            ],
            2: [
              { dc: 0,  dr:  1, mask: C_NW },                  // S
              { dc: -1, dr:  0, mask: C_SE },                  // O
              { dc: -1, dr:  1, mask: C_NE },                  // SO
            ],
            3: [
              { dc: 0,  dr: -1, mask: C_SW },                  // N
              { dc: -1, dr:  0, mask: C_NE },                  // O
              { dc: -1, dr: -1, mask: C_SE },                  // NO
            ],
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
            // En debug, el tip tiene su propia textura (dbg_corner_tip)
            // para distinguirlo del cuerpo del corner_in (dbg_corner_in).
            const tipTex = debug ? DBG_TEX.corner_tip : decoTex;
            detailBrushes.push(_pyramidTipBrush(
              { x0, y0, x1, y1,
                bottomZ: (h + 1) * HEIGHT_UNIT,
                topZ: apexH * HEIGHT_UNIT,
                dir: deco.dir },
              tipTex,
            ));
          }
        } else if (deco && deco.kind === 'cube') {
          // 'cube' decoracion: caja solida 1u por encima del terreno.
          detailBrushes.push(boxBrush(
            { minX: x0, maxX: x1, minY: y0, maxY: y1,
              minZ: terrainTopZ, maxZ: terrainTopZ + HEIGHT_UNIT },
            decoTex,
          ));
        }
        // Otros kinds (pit, ramp_u, pyramid, wedge, ramp_u_closed,
        // bridge_diag): pendientes de implementar geometria propia.
      }

      // Small decorative objects (lamp, tree, bush, rock): single brush
      // on top of the terrain, plus optional point light.
      if (objMeta && !isBuilding) {
        const decoInset = (cellSize * (1 - objMeta.footprint)) / 2;
        const ox0 = x0 + decoInset, ox1 = x1 - decoInset;
        const oy0 = y0 + decoInset, oy1 = y1 - decoInset;
        const terrainTopZ = h * HEIGHT_UNIT;
        const oz0 = terrainTopZ;
        const oz1 = terrainTopZ + objMeta.heightU;
        detailBrushes.push(boxBrush(
          { minX: ox0, maxX: ox1, minY: oy0, maxY: oy1, minZ: oz0, maxZ: oz1 },
          objMeta.tex,
        ));
        if (objMeta.light) {
          const cx = (ox0 + ox1) / 2;
          const cy = (oy0 + oy1) / 2;
          const lz = terrainTopZ + objMeta.light.offsetZ;
          pendingLights.push({
            x: cx, y: cy, z: lz,
            intensity: objMeta.light.intensity,
            color: objMeta.light.color,
          });
        }
      }
    }
  }
  if (untexturedLand > 0) {
    warnings.push(`${untexturedLand} emerged cells had no texture — defaulted to 'tierra' biome`);
  }
  if (landCount === 0) {
    warnings.push('no land cells emerged — map is pure ocean');
  }

  // ---------- Optimisation B: greedy 2D rectangle pass ----------
  // For each bucket of runs that share an exact texture/Z signature,
  // walk the cell mask and emit one brush per maximal rectangle of
  // contributing cells. Cells get cleared as they're consumed so each
  // is covered by exactly one rect.
  //
  // The mesh runs across the whole tilemap regardless of playArea
  // because the inArea filter already excluded outside cells from
  // contributing to the masks during the main loop.
  let meshBrushes = 0;
  for (const bucket of meshBuckets.values()) {
    const { minZ, maxZ, sideTex, topTex, bottomTex, cellMask } = bucket;
    const tEx = topTex    ?? sideTex;
    const bEx = bottomTex ?? sideTex;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!cellMask[r * cols + c]) continue;
        // Grow right as far as the mask stays set on this row.
        let c1 = c;
        while (c1 + 1 < cols && cellMask[r * cols + (c1 + 1)]) c1++;
        // Grow down as far as the rows c..c1 stay fully covered.
        let r1 = r;
        outer: while (r1 + 1 < rows) {
          for (let cc = c; cc <= c1; cc++) {
            if (!cellMask[(r1 + 1) * cols + cc]) break outer;
          }
          r1++;
        }
        // Convert cell rectangle to world AABB. Row 0 is the NORTH
        // edge so the rows flip in Y just like the per-cell case.
        const rx0 = -gridHalfX + c * cellSize;
        const rx1 = -gridHalfX + (c1 + 1) * cellSize;
        const ySouthLow  = (rows - 1) - r1;
        const ySouthHigh = (rows - 1) - r;
        const ry0 = -gridHalfY + ySouthLow * cellSize;
        const ry1 = -gridHalfY + (ySouthHigh + 1) * cellSize;
        detailBrushes.push(boxBrush(
          { minX: rx0, maxX: rx1, minY: ry0, maxY: ry1,
            minZ, maxZ },
          sideTex,
          { topTex: tEx, sideTex, bottomTex: bEx },
        ));
        meshBrushes++;
        // Clear all cells in this rectangle.
        for (let rr = r; rr <= r1; rr++) {
          for (let cc = c; cc <= c1; cc++) {
            cellMask[rr * cols + cc] = 0;
          }
        }
      }
    }
  }
  const optBSaved = bucketRuns - meshBrushes;
  info.push(`geometry: ${landCount} cells emerged`);
  info.push(`opt-A (vertical merge): collapsed to ${runsBeforeMesh} runs`);
  info.push(`opt-B (greedy mesh):    ${bucketRuns} runs → ${meshBrushes} rects (saved ${optBSaved})`);
  info.push(`func_detail brushes:    ${detailBrushes.length}`);

  out.push('}');  // close worldspawn

  // ---------- func_detail: non-sealing geometry ----------
  // One func_detail entity for everything that doesn't seal the world.
  // qbsp treats this as worldspawn for rendering/collision but skips it
  // during vis portal computation, which is a big speedup on outdoor
  // maps with hundreds of small terrain brushes.
  if (detailBrushes.length > 0) {
    out.push('{');
    out.push('"classname" "func_detail"');
    if (phong) {
      // Phong shading sobre toda la geometria detalle: suaviza la
      // iluminacion entre caras casi-coplanares (rampas <-> cuerpo del
      // corner_in <-> tip piramidal apilado). Sin esto las uniones se ven
      // con bordes duros porque cada brush facetado tiene su propia
      // normal. _phong_angle 60 limita la mezcla a faces cuyos planos
      // formen menos de 60° — preserva el corte vivo entre la cara
      // superior plana y la cara vertical (90°) de un mismo brush.
      out.push('"_phong" "1"');
      out.push('"_phong_angle" "60"');
    }
    for (const b of detailBrushes) out.push(b);
    out.push('}');
  }

  // ---------- func_detail_illusionary: minimap visual brushes ----------
  // Los tiles de tierra y el mar global del minimap viven aquí. qbsp los
  // excluye del BrushBSP del worldspawn (sin coste de subdivisión, sin
  // portales vis), pero siguen recibiendo lightmap y dibujándose. Como
  // el minimap está sellado en su propia cápsula y el jugador no lo
  // toca físicamente (M solo recoloca la cámara), la falta de colisión
  // es exactamente lo que queremos.
  if (minimapVisualBrushes.length > 0) {
    out.push('{');
    out.push('"classname" "func_detail_illusionary"');
    for (const b of minimapVisualBrushes) out.push(b);
    out.push('}');
  }

  // ---------- point lights from object placements ----------
  for (const L of pendingLights) {
    out.push('{');
    out.push('"classname" "light"');
    out.push(`"origin" "${Math.round(L.x)} ${Math.round(L.y)} ${Math.round(L.z)}"`);
    out.push(`"light" "${L.intensity}"`);
    if (L.color) out.push(`"_color" "${L.color}"`);
    // ericw-tools `delay` falloff modes:
    //   0 = linear (default), 1 = inverse, 2 = inverse-square,
    //   3 = no falloff (constant infinite reach), 4 = local minlight,
    //   5 = inverse-square (clamped).
    // We set delay=3 only when the caller explicitly asks for it
    // (e.g. the minimap fill-light).
    if (L.delay != null) out.push(`"delay" "${L.delay}"`);
    out.push('}');
  }

  // ---------- patrullas: path_corner por nodo ----------
  // Cada ruta es una lista circular. Emitimos un path_corner por nodo con
  //   targetname = "patrol_<id>_<i>"
  //   target     = "patrol_<id>_<(i+1) mod N>"
  // El bucle se cierra naturalmente (nodes[N-1].target = nodes[0].targetname).
  // `noise` = nombre de ruta — los drones de Airquake/Uplifter usan
  //   `find(world, noise, self.noise)` para descubrir nodos amigos.
  // Z = terreno bajo el nodo + flightHeight * HEIGHT_UNIT. Si la celda esta
  // sumergida (h<0) usamos sea level como base.
  if (Array.isArray(tilemap.patrols)) {
    // Offset Z para nodos de rutas terrestres: pequeno (24u) para que
    // el path_corner quede justo encima del suelo sin coplanar con el.
    // El bbox del path_corner es '-8 -8 -8' .. '8 8 8' (16u de alto)
    // asi que el centro a +24 deja el inferior a +16, sobre la
    // superficie. Lo bastante alto para que el touch del tanque
    // (bbox '-16 -16 -24' .. '16 16 8') solape al pasar por ahi.
    const GROUND_PATH_OFFSET = 24;
    for (const p of tilemap.patrols) {
      if (!p || !Array.isArray(p.nodes) || p.nodes.length === 0) continue;
      const N = p.nodes.length;
      const safeName = String(p.name ?? p.id).replace(/["\r\n]/g, '');
      const flightH = Math.max(0, Math.floor(p.flightHeight ?? 0));
      const isGround = p.kind === 'ground';
      // Area-restricted compilation: a path_corner outside the sealed
      // play area sits in the void and triggers a qbsp leak. We classify
      // the route as fully-in / fully-out / mixed and skip mixed routes
      // entirely (truncating would leave a broken target chain).
      if (restrictArea) {
        let inCount = 0, outCount = 0;
        for (const n of p.nodes) {
          if (!n) continue;
          if (n.col < 0 || n.col >= cols || n.row < 0 || n.row >= rows) {
            outCount++;
          } else if (inArea(n.col, n.row)) {
            inCount++;
          } else {
            outCount++;
          }
        }
        if (outCount > 0 && inCount > 0) {
          warnings.push(`patrol "${safeName}" crosses the play-area boundary — omitted (move all nodes inside the area or disable "Solo área")`);
          continue;
        }
        if (inCount === 0) continue;
      }
      for (let i = 0; i < N; i++) {
        const n = p.nodes[i];
        if (!n) continue;
        const col = n.col, row = n.row;
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        const xc = -gridHalfX + col * cellSize + cellSize / 2;
        const ySouthIdx = (rows - 1) - row;
        const yc = -gridHalfY + ySouthIdx * cellSize + cellSize / 2;
        // Z:
        //   - zOverride por nodo gana siempre (Z absoluto en uQ).
        //   - kind='ground': groundZ + GROUND_PATH_OFFSET. flightHeight
        //     se ignora porque no tiene sentido para una ruta a ras.
        //   - kind='aerial' (default): groundZ + flightHeight * HEIGHT_UNIT.
        const h = heights[row * cols + col];
        const baseZ = (h >= SEA_LEVEL_H) ? h * HEIGHT_UNIT : SEA_LEVEL_Z;
        let z;
        if (typeof n.zOverride === 'number') {
          z = n.zOverride;
        } else if (isGround) {
          z = baseZ + GROUND_PATH_OFFSET;
        } else {
          z = baseZ + flightH * HEIGHT_UNIT;
        }
        const tn = `patrol_${p.id}_${i}`;
        const tg = `patrol_${p.id}_${(i + 1) % N}`;
        out.push('{');
        out.push('"classname" "path_corner"');
        out.push(`"origin" "${Math.round(xc)} ${Math.round(yc)} ${Math.round(z)}"`);
        out.push(`"targetname" "${tn}"`);
        out.push(`"target" "${tg}"`);
        out.push(`"noise" "${safeName}"`);
        out.push('}');
      }
    }
  }

  // ---------- enemigos ----------
  // Cada enemigo es { id, kind, col, row, angle, target }. Emitimos una
  // entity point con classname = kind. Origin: centro de la celda en XY,
  // Z derivado del terreno:
  //   - estaticos (needsPath=false): apoyados en el suelo (top de la
  //     columna de tierra), elevados un poco (16u) para que el shotgun de
  //     ronde no clippe en el bedrock.
  //   - terrestres moviles (needsPath=true, aerial=false): igual que
  //     estaticos. Patrullan a ras de suelo.
  //   - aereos (aerial=true): a la altura de su ruta (flightHeight de la
  //     ruta target * HEIGHT_UNIT) sobre el terreno. Si no hay ruta,
  //     usamos un default razonable para que no aparezcan en el suelo.
  //
  // `target`: el id de patrulla (ej. 'p3') se convierte al targetname del
  // primer path_corner emitido en la seccion anterior: 'patrol_p3_0'. El
  // engine usa el primer path_corner como ancla del bucle de patrullaje.
  //
  // Celdas fuera del playArea (cuando restrictArea esta activo) se saltan
  // para no dejar entidades flotando sobre vacio.
  const DEFAULT_FLIGHT_HEIGHT = 8;
  // Offset vertical para entidades terrestres respecto al top del cubo
  // de terreno. groundZ es el top de la columna, no el suelo donde los
  // "pies" del bbox descansan — el origin de las entidades en Quake
  // esta tipicamente en el centro del bbox. Los vehiculos terrestres
  // (tank/humvee/m-sam) tienen bbox '-16 -16 -24' .. '16 16 8' (32x32x32
  // con 24u por debajo del origin), asi que con un offset bajo (16u) el
  // modelo aparecia medio enterrado. 64u es de sobra para cualquier
  // bbox razonable; si flotan demasiado lo bajamos.
  const GROUND_OFFSET_U = 64;
  if (Array.isArray(tilemap.enemies)) {
    for (const e of tilemap.enemies) {
      if (!e || typeof e.col !== 'number' || typeof e.row !== 'number') continue;
      const col = e.col, row = e.row;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      if (restrictArea && !inArea(col, row)) continue;
      const meta = ENEMY_BY_KIND.get(e.kind);
      if (!meta) { warnings.push(`enemy ${e.id ?? '?'}: kind desconocido "${e.kind}", se omite`); continue; }
      const xc = -gridHalfX + col * cellSize + cellSize / 2;
      const ySouthIdx = (rows - 1) - row;
      const yc = -gridHalfY + ySouthIdx * cellSize + cellSize / 2;
      const h = heights[row * cols + col];
      const groundZ = (h >= SEA_LEVEL_H) ? h * HEIGHT_UNIT : SEA_LEVEL_Z;
      let z;
      if (meta.aerial) {
        // Altura de vuelo: la de la ruta target si tenemos una, si no el
        // default. Coincide con como se calcula Z para los path_corner
        // arriba, asi que avion+ruta spawnea exactamente sobre su primer
        // nodo de patrulla.
        let flightH = DEFAULT_FLIGHT_HEIGHT;
        if (e.target && Array.isArray(tilemap.patrols)) {
          const route = tilemap.patrols.find(p => p.id === e.target);
          if (route && typeof route.flightHeight === 'number') {
            flightH = Math.max(0, Math.floor(route.flightHeight));
          }
        }
        z = groundZ + flightH * HEIGHT_UNIT;
      } else {
        z = groundZ + GROUND_OFFSET_U;
      }
      const angle = ((Math.round(Number(e.angle) || 0) % 360) + 360) % 360;
      out.push('{');
      out.push(`"classname" "${e.kind}"`);
      out.push(`"origin" "${Math.round(xc)} ${Math.round(yc)} ${Math.round(z)}"`);
      out.push(`"angle" "${angle}"`);
      if (e.target) {
        // El editor guarda el id de patrulla (p.ej. 'p3'). El targetname
        // del primer path_corner de esa ruta es 'patrol_<id>_0'.
        out.push(`"target" "patrol_${e.target}_0"`);
      }
      // info_enemy_slot lleva campos extra: enemy_kind y activate_day.
      // El runtime QC los usa para decidir qué spawnea y a partir de qué
      // día se puede activar.
      if (e.kind === 'info_enemy_slot') {
        const slotKind = (typeof e.enemyKind === 'string' && e.enemyKind)
          ? e.enemyKind
          : 'monster_aag';
        const activateDay = Math.max(1, Math.min(5,
          Math.round(Number(e.activateDay) || 1)));
        out.push(`"enemy_kind" "${slotKind}"`);
        out.push(`"activate_day" "${activateDay}"`);
      }
      out.push('}');
    }
  }

  // ---------- info_player_start ----------
  // Spawn the player at mid-ceiling above the chosen cell — the pilot
  // starts airborne (AirQuake style). If z is unset (the usual case
  // when placed via the 2D editor's spawn brush), derive it from the
  // playable vertical range.
  //
  // Area restriction: when the play area is active and the user's spawn
  // sits outside it (or there's no spawn at all), the writer drops a
  // temporary spawn at the centre of the area, 4 cells above the cell's
  // terrain height (or 4 cells above sea level if the centre is
  // submerged).
  const SPAWN_HEIGHT_ABOVE_GROUND = 200;
  let sx, sy, sz, sa;
  const userSpawn = tilemap.spawn;
  const userSpawnInArea = userSpawn && typeof userSpawn.col === 'number'
    && inArea(userSpawn.col, userSpawn.row);

  if (restrictArea && !userSpawnInArea) {
    const cCenter = Math.round((pa.c0 + pa.c1) / 2);
    const rCenter = Math.round((pa.r0 + pa.r1) / 2);
    const idx = rCenter * cols + cCenter;
    const hCenter = heights[idx];
    const baseZ = (hCenter >= SEA_LEVEL_H) ? hCenter * HEIGHT_UNIT : SEA_LEVEL_Z;
    sx = -gridHalfX + cCenter * cellSize + cellSize / 2;
    const ySouthIdx = (rows - 1) - rCenter;
    sy = -gridHalfY + ySouthIdx * cellSize + cellSize / 2;
    sz = baseZ + SPAWN_HEIGHT_ABOVE_GROUND;
    sa = 0;
    warnings.push('spawn was outside the play area — placed a temporary spawn at the area centre');
  } else {
    let defaultZ = SEA_LEVEL_Z + SPAWN_HEIGHT_ABOVE_GROUND;
    if (userSpawn && typeof userSpawn.col === 'number' && typeof userSpawn.row === 'number') {
      const idx = userSpawn.row * cols + userSpawn.col;
      const hCell = heights[idx];
      const baseZ = (hCell >= SEA_LEVEL_H) ? hCell * HEIGHT_UNIT : SEA_LEVEL_Z;
      defaultZ = baseZ + SPAWN_HEIGHT_ABOVE_GROUND;
    }
    const spawnInput = userSpawn ?? { x: 0, y: 0, z: defaultZ, angle: 0 };
    sx = spawnInput.x ?? 0;
    sy = spawnInput.y ?? 0;
    sz = (spawnInput.z == null) ? defaultZ : spawnInput.z;
    sa = spawnInput.angle ?? 0;
  }
  out.push('{');
  out.push('"classname" "info_player_start"');
  out.push(`"origin" "${Math.round(sx)} ${Math.round(sy)} ${Math.round(sz)}"`);
  out.push(`"angle" "${sa}"`);
  out.push('}');

  // ---------- clouds ----------
  // Place `cloud` point entities at the cloud altitude in tight CLUSTERS, in
  // two layers (big lumpy cumulus + small 2-cloud puffs filling the gaps), so
  // models overlap and merge. Each entity loads one of the 5 offline-baked
  // models (maps/b_cloud0..4.bsp) — the QC `cloud` picks which at random and
  // sets SOLID_NOT (the heli flies through). Models + textures live in the
  // .bsps, so the map needs no cloud brushes or wad. Skipped in 'flat' mode.
  if (tilemap.quality !== 'flat') {
    const cloudN = emitCloudEntities(out, xMin, xMax, yMin, yMax);
    if (cloudN > 0) info.push(`clouds: ${cloudN} cloud entities in ${CLOUD_CLUSTERS}+${CLOUD2_CLUSTERS} clusters (models b_cloud0..4, non-solid)`);
  }

  return { text: out.join('\n') + '\n', warnings, info };
}

/**
 * Emit the sea as coastal depth bands. Builds a per-grid-cell shade index by
 * BFS distance from the nearest land cell (4-connected), maps distance →
 * WATER_SHADES band (0 = shallow/bright at the coast, last = deep/dark), then
 * greedily merges same-shade cells along each row into wide strips (one brush
 * per run) to keep the brush count low. The grid is wrapped by open ocean
 * (everything outside the grid), emitted as full-width deep-water brushes
 * north of, south of, and flanking the grid using the deepest shade.
 *
 * All water brushes span [waterMinZ, waterMaxZ] (bedrock top → just below sea
 * level) so the sea is a solid volume; only the texture varies by band.
 */
function emitWaterBands({ out, heights, cols, rows, cellSize, gridHalfX, gridHalfY,
                          xMin, xMax, yMin, yMax, waterMinZ, waterMaxZ }) {
  const shades = WATER_SHADES;
  const deep = shades[shades.length - 1];
  const SEA = SEA_LEVEL_H;
  const water = (c, r) => heights[r * cols + c] < SEA;   // submerged cell?

  // BFS distance (in cells) from land to each submerged cell. dist[i] = 0 for
  // land, 1 for water adjacent to land, etc. Cells stay -1 (unreached) only
  // if the whole grid is water (no land at all) — handled below.
  const N = cols * rows;
  const dist = new Int32Array(N).fill(-1);
  let queue = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!water(c, r)) { dist[r * cols + c] = 0; queue.push(r * cols + c); }
    }
  }
  // If there's no land at all, every grid cell is open sea → deepest shade.
  const allSea = queue.length === 0;
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const c = i % cols, r = (i - c) / cols, d = dist[i];
    const nb = [[c, r - 1], [c, r + 1], [c - 1, r], [c + 1, r]];
    for (const [nc, nr] of nb) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (dist[j] !== -1) continue;
      dist[j] = d + 1;
      queue.push(j);
    }
  }

  // distance (≥1, in cells) → shade band index. Bands 1,2,3 cells out map to
  // shades 0,1,2; everything ≥4 cells from land is the deepest shade.
  const shadeOf = (cellDist) => {
    if (cellDist <= 1) return 0;
    if (cellDist === 2) return 1;
    if (cellDist === 3) return 2;
    return shades.length - 1;
  };

  // Cell (col,row) → world XY box. col runs west→east; row 0 is the NORTH
  // edge (largest Y), matching the terrain pass.
  const cellX0 = (c) => -gridHalfX + c * cellSize;
  const cellY0 = (r) => -gridHalfY + ((rows - 1) - r) * cellSize;  // south edge of row
  const pushWater = (bx0, bx1, by0, by1, tex) => {
    out.push(boxBrush({ minX: bx0, maxX: bx1, minY: by0, maxY: by1, minZ: waterMinZ, maxZ: waterMaxZ }, tex));
  };

  // -- Open ocean wrapping the grid (full world box minus the grid rect). --
  const gx0 = Math.max(xMin, -gridHalfX), gx1 = Math.min(xMax, gridHalfX);
  const gy0 = Math.max(yMin, -gridHalfY), gy1 = Math.min(yMax, gridHalfY);
  if (yMax > gy1) pushWater(xMin, xMax, gy1, yMax, deep);            // north strip
  if (gy0 > yMin) pushWater(xMin, xMax, yMin, gy0, deep);            // south strip
  if (gx0 > xMin) pushWater(xMin, gx0, gy0, gy1, deep);              // west strip
  if (xMax > gx1) pushWater(gx1, xMax, gy0, gy1, deep);              // east strip

  // -- Bands inside the grid: per row, greedy-merge same-shade water runs. --
  // Land cells (dist 0) emit no water (the terrain brush covers them).
  for (let r = 0; r < rows; r++) {
    let runStart = -1, runShade = -1;
    const flush = (cEnd) => {
      if (runStart < 0) return;
      const bx0 = cellX0(runStart), bx1 = cellX0(cEnd) + cellSize;
      const by0 = cellY0(r), by1 = by0 + cellSize;
      pushWater(bx0, bx1, by0, by1, shades[runShade]);
      runStart = -1; runShade = -1;
    };
    for (let c = 0; c < cols; c++) {
      const d = dist[r * cols + c];
      const isWater = allSea || (d >= 1);   // dist 0 = land (no water here)
      if (!isWater) { flush(c - 1); continue; }
      const sh = allSea ? (shades.length - 1) : shadeOf(d);
      if (runStart >= 0 && sh === runShade) continue;   // extend current run
      flush(c - 1);
      runStart = c; runShade = sh;
    }
    flush(cols - 1);
  }
}

/** Deterministic mulberry32 PRNG — fixed seed → identical cloud layout on
 *  every compile, so the geometry hash stays stable. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Emit one cloud LAYER of clustered `cloud` entities, all at CLOUD_LAYER_Z.
 *  Picks cfg.clusters cluster centres across the (clamped) field — each kept
 *  a random [sepMin,sepMax] from every centre already placed (incl. other
 *  layers, via `centres`) — then drops perMin..perMax clouds within
 *  cfg.radius of each so they overlap and merge. The model each one shows is
 *  chosen at random in QC. `centres` accumulates across layers so they don't
 *  stack on the same spot. Returns how many entities were emitted. */
function emitCloudLayer(out, field, rand, cfg, centres) {
  const { fx0, fx1, fy0, fy1 } = field;
  const span = cfg.perMax - cfg.perMin + 1;
  const sepRange = cfg.sepMax - cfg.sepMin;
  let n = 0;
  for (let k = 0; k < cfg.clusters; k++) {
    // Pick a centre kept at least a random [sepMin,sepMax] from every centre
    // placed so far (rejection sampling). Relax the spacing if the field is
    // too tight to honour it within a budget of tries, so we never hang.
    let cx, cy;
    for (let attempt = 0; ; attempt++) {
      cx = fx0 + (fx1 - fx0) * rand();
      cy = fy0 + (fy1 - fy0) * rand();
      const sep = cfg.sepMin + rand() * sepRange;
      const relax = Math.max(0.25, 1 - attempt / 60);   // ease the rule if it won't fit
      let ok = true;
      for (const c of centres) {
        if (Math.hypot(cx - c[0], cy - c[1]) < sep * relax) { ok = false; break; }
      }
      if (ok || attempt >= 120) break;
    }
    centres.push([cx, cy]);
    const count = cfg.perMin + Math.floor(rand() * span);
    for (let c = 0; c < count; c++) {
      // Offset within the cluster: uniform in a disc of cfg.radius.
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * cfg.radius;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const z = CLOUD_LAYER_Z + (rand() - 0.5) * 120; // slight height variation
      const ang = Math.floor(rand() * 360);           // yaw rotates the bmodel
      out.push('{');
      out.push('"classname" "cloud"');
      out.push(`"origin" "${Math.round(x)} ${Math.round(y)} ${Math.round(z)}"`);
      out.push(`"angle" "${ang}"`);
      out.push('}');
      n++;
    }
  }
  return n;
}

/** Emit the cloud field: TWO layers at CLOUD_LAYER_Z — big clusters (many
 *  clouds) plus a second layer of small 2-cloud clusters filling the gaps.
 *  Both share one `centres` list so clusters never stack on the same spot.
 *  Returns the total number of cloud entities emitted. */
function emitCloudEntities(out, xMin, xMax, yMin, yMax) {
  const rand = mulberry32(0xC10D5EED);
  // Keep clouds inside the world box. A cloud can sit up to the largest
  // cluster radius from its centre, so inset the field for the CENTRES by
  // that (plus the model's half-footprint and a little slack).
  const maxRadius = Math.max(CLOUD_CLUSTER_RADIUS, CLOUD2_CLUSTER_RADIUS);
  const margin = CLOUD_BRUSH_SIZE / 2 + maxRadius + 80;
  const fx0 = Math.max(xMin + margin, -CLOUD_FIELD_HALF);
  const fx1 = Math.min(xMax - margin, +CLOUD_FIELD_HALF);
  const fy0 = Math.max(yMin + margin, -CLOUD_FIELD_HALF);
  const fy1 = Math.min(yMax - margin, +CLOUD_FIELD_HALF);
  if (fx1 <= fx0 || fy1 <= fy0) return 0;
  const field = { fx0, fx1, fy0, fy1 };
  const centres = [];
  let n = 0;
  // Layer 1: the big lumpy cumulus clusters.
  n += emitCloudLayer(out, field, rand, {
    clusters: CLOUD_CLUSTERS, perMin: CLOUD_PER_CLUSTER_MIN, perMax: CLOUD_PER_CLUSTER_MAX,
    radius: CLOUD_CLUSTER_RADIUS, sepMin: CLOUD_CLUSTER_SEP_MIN, sepMax: CLOUD_CLUSTER_SEP_MAX,
  }, centres);
  // Layer 2: small 2-cloud clusters filling the gaps, same altitude.
  n += emitCloudLayer(out, field, rand, {
    clusters: CLOUD2_CLUSTERS, perMin: CLOUD2_PER_CLUSTER_MIN, perMax: CLOUD2_PER_CLUSTER_MAX,
    radius: CLOUD2_CLUSTER_RADIUS, sepMin: CLOUD2_CLUSTER_SEP_MIN, sepMax: CLOUD2_CLUSTER_SEP_MAX,
  }, centres);
  return n;
}

// ---------------------------------------------------------------------
// emitMinimap — sealed capsule below the bedrock with a flat 1:1 copy of
// the map. Used as a visual / design reference (not playable).
//
// Geometry layout (top → bottom):
//   MINIMAP_TOP_Z         ceiling (sky-textured slab)
//   ...                   inner volume; tile brushes & global blue sea
//   MINIMAP_SEA_Z         top of the blue sea (= MINIMAP_BOTTOM_Z + tile thickness)
//   MINIMAP_BOTTOM_Z      floor (bedrock slab top)
//
// The capsule's lateral walls are sky-textured too (same look as the
// main world's sky), so vis treats it as its own room and there's no
// leak risk between the two volumes.
//
// For every emerged cell (height >= SEA_LEVEL_H) we emit a thin tile of
// MINIMAP_TILE_THICKNESS at MINIMAP_SEA_Z, using the cell's biome top
// texture. Submerged cells are not emitted — the global blue sea brush
// covers them.
// ---------------------------------------------------------------------
function emitMinimap({
  out, detailBrushes, minimapVisualBrushes,
  tilemap, heights, textures,
  cols, rows, cellSize, gridHalfX, gridHalfY,
  xMin, xMax, yMin, yMax,
}) {
  // El minimap genera muchos brushes en una cápsula aislada que el
  // jugador no toca físicamente. Los tiles de tierra y el mar global
  // van a un func_detail_illusionary propio en lugar de worldspawn:
  // ericw-tools los saca del BrushBSP principal (no contribuyen a vis
  // ni a árbol de colisiones), lo que acelera muchísimo qbsp en mapas
  // grandes. Las paredes/techo/suelo de la cápsula SÍ van a worldspawn
  // para que sellen contra leaks.
  //
  // minimapVisualBrushes lo pasa el caller (un array compartido). El
  // entity se emite después de cerrar worldspawn.
  const swt = SKY_WALL_THICKNESS;
  const top = MINIMAP_TOP_Z;
  const bot = MINIMAP_BOTTOM_Z;
  const seaZ = MINIMAP_SEA_Z;

  // ---- capsule walls (sky-textured, sealed) ----
  // 4 lateral walls.
  out.push(boxBrush(
    { minX: xMin - swt, maxX: xMin, minY: yMin - swt, maxY: yMax + swt,
      minZ: bot, maxZ: top },
    SKY_TEXTURE,
  ));
  out.push(boxBrush(
    { minX: xMax, maxX: xMax + swt, minY: yMin - swt, maxY: yMax + swt,
      minZ: bot, maxZ: top },
    SKY_TEXTURE,
  ));
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin - swt, maxY: yMin,
      minZ: bot, maxZ: top },
    SKY_TEXTURE,
  ));
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMax, maxY: yMax + swt,
      minZ: bot, maxZ: top },
    SKY_TEXTURE,
  ));
  // Ceiling.
  out.push(boxBrush(
    { minX: xMin - swt, maxX: xMax + swt,
      minY: yMin - swt, maxY: yMax + swt,
      minZ: top, maxZ: top + swt },
    SKY_TEXTURE,
  ));
  // Floor — bedrock slab.
  out.push(boxBrush(
    { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax,
      minZ: bot - swt, maxZ: bot },
    BEDROCK_TEXTURE,
  ));

  // (No fill light. Las texturas del minimap aparecen ya bien iluminadas
  // por el _minlight del worldspawn — añadir una luz puntual aquí solo
  // creaba un brillo azul circular visible en el centro del mapa y
  // gastaba tiempo extra de `light`.)

  // ---- greedy-merge all cells into rectangles ----
  // El minimap es completamente plano: cada celda emite un brush con
  // su textura (bioma para tierra, MINIMAP_SEA_TEXTURE azul para
  // celdas sumergidas), todas a la misma Z. El "agua" no es un caso
  // especial — es simplemente otra textura más.
  //
  // Greedy mesh 2D por textura: para cada celda no consumida, se
  // expande el rectángulo máximo de celdas vecinas con misma textura
  // y se emite un único brush. Orden de magnitud menos brushes en
  // mapas grandes.
  const total = cols * rows;
  const claimed = new Uint8Array(total);
  const texByCell = new Array(total);
  for (let i = 0; i < total; i++) {
    if (heights[i] < SEA_LEVEL_H) {
      texByCell[i] = MINIMAP_SEA_TEXTURE;
    } else {
      const biome = biomeTexForPaletteIdx(textures[i]) || FALLBACK_BIOME_TEX;
      texByCell[i] = biome.top || biome.side || BEDROCK_TEXTURE;
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (claimed[i]) continue;
      const tex = texByCell[i];

      // Expand right while same texture / not claimed.
      let c1 = col;
      while (c1 + 1 < cols) {
        const j = row * cols + (c1 + 1);
        if (claimed[j] || texByCell[j] !== tex) break;
        c1++;
      }
      // Expand down while every cell in the row band still matches.
      let r1 = row;
      while (r1 + 1 < rows) {
        let ok = true;
        for (let cc = col; cc <= c1; cc++) {
          const j = (r1 + 1) * cols + cc;
          if (claimed[j] || texByCell[j] !== tex) { ok = false; break; }
        }
        if (!ok) break;
        r1++;
      }
      // Claim the rectangle.
      for (let rr = row; rr <= r1; rr++) {
        for (let cc = col; cc <= c1; cc++) {
          claimed[rr * cols + cc] = 1;
        }
      }
      // Emit one brush for the rectangle.
      const x0 = -gridHalfX + col * cellSize;
      const x1 = -gridHalfX + (c1 + 1) * cellSize;
      const ySouthIdxN = (rows - 1) - r1;
      const ySouthIdxS = (rows - 1) - row + 1;
      const y0 = -gridHalfY + ySouthIdxN * cellSize;
      const y1 = -gridHalfY + ySouthIdxS * cellSize;

      minimapVisualBrushes.push(boxBrush(
        { minX: x0, maxX: x1, minY: y0, maxY: y1,
          minZ: seaZ - MINIMAP_TILE_THICKNESS, maxZ: seaZ },
        tex,
      ));
    }
  }

  // El caller emitirá el func_detail_illusionary con
  // minimapVisualBrushes después de cerrar worldspawn.
}

/** Build the worldspawn `wad` value from absolute WAD paths. qbsp accepts
 *  forward slashes; on Windows we normalise to avoid \ escapes biting. */
function wadKeyFromPaths(absPaths) {
  return (absPaths ?? []).map(p => p.replace(/\\/g, '/')).join(';');
}

module.exports = { buildMapText, wadKeyFromPaths };
