/**
 * Genera las 5 texturas PNG procedurales para el objeto 'ruina':
 *
 *   base    — planta baja con cascotes (mancha clara mas escombros)
 *   side    — pisos intermedios: pared gris claro con ventanas/huecos rotos
 *   capital — ultimo piso: esqueleto del edificio (mas hueco que muro)
 *   top     — techo destruido, escombros sobre la planta superior
 *   bottom  — cara inferior (no se ve, pero ha de existir)
 *
 * Output: src/renderer/assets/textures/ruina/*.png  (64x64 RGBA cada una)
 *
 * Estilo: gris/clarito sucio (ladrillo viejo + cal descolorida), evitando
 * el marron de las casas habitadas. Sirve como mock — el usuario puede
 * sustituirlas por arte propio mas tarde sin romper el resto del editor.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 64, H = 64;

function rgba(r, g, b, a = 255) {
  return [r & 0xff, g & 0xff, b & 0xff, a & 0xff];
}

/** Determinismo: PRNG sencillo con seed. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Helper: imagen vacia rellena con un color base. */
function blankImage(r, g, b, a = 255) {
  const data = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i*4] = r; data[i*4+1] = g; data[i*4+2] = b; data[i*4+3] = a;
  }
  return data;
}

function setPx(data, x, y, [r, g, b, a]) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a;
}

function getPx(data, x, y) {
  const i = (y * W + x) * 4;
  return [data[i], data[i+1], data[i+2], data[i+3]];
}

/** Ruido grano grueso (manchas de suciedad). */
function applyGrain(data, rand, intensity = 30) {
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 2 * intensity;
    data[i*4]   = Math.max(0, Math.min(255, data[i*4]   + n));
    data[i*4+1] = Math.max(0, Math.min(255, data[i*4+1] + n * 0.95));
    data[i*4+2] = Math.max(0, Math.min(255, data[i*4+2] + n * 0.9));
  }
}

/** Lineas de juntas de ladrillo, gris oscuro. */
function brickLines(data, rand) {
  // Filas horizontales de mortero cada 6 px
  for (let y = 0; y < H; y += 6) {
    for (let x = 0; x < W; x++) {
      const darken = 35 + (rand() - 0.5) * 10;
      const px = getPx(data, x, y);
      setPx(data, x, y, [
        Math.max(0, px[0] - darken),
        Math.max(0, px[1] - darken),
        Math.max(0, px[2] - darken),
        255,
      ]);
    }
  }
  // Juntas verticales alternas por fila de ladrillo (medio offset)
  for (let row = 0; row < H / 6; row++) {
    const y0 = row * 6;
    const offset = (row % 2) * 6;
    for (let x = offset; x < W; x += 12) {
      for (let y = y0; y < y0 + 6 && y < H; y++) {
        const darken = 30 + (rand() - 0.5) * 10;
        const px = getPx(data, x, y);
        setPx(data, x, y, [
          Math.max(0, px[0] - darken),
          Math.max(0, px[1] - darken),
          Math.max(0, px[2] - darken),
          255,
        ]);
      }
    }
  }
}

/** Pinta un rectangulo. */
function fillRect(data, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPx(data, x, y, color);
    }
  }
}

/** Mancha irregular para escombros. Color base + ruido. */
function rubblePatch(data, cx, cy, radius, rand, baseColor) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d > radius) continue;
      // Borde irregular: probabilidad cae con la distancia + ruido.
      const edgeNoise = rand();
      if (d > radius * 0.6 && edgeNoise < (d / radius - 0.3)) continue;
      const shade = (rand() - 0.5) * 40;
      setPx(data, cx + dx, cy + dy, [
        Math.max(0, Math.min(255, baseColor[0] + shade)),
        Math.max(0, Math.min(255, baseColor[1] + shade)),
        Math.max(0, Math.min(255, baseColor[2] + shade)),
        255,
      ]);
    }
  }
}

/** Encoder PNG minimalista (RGBA, 8 bit). Mismo formato que el editor
 *  espera leer al construir la WAD. */
function writePNG(filepath, data) {
  function crc32(buf) {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, body) {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])), 0);
    return Buffer.concat([len, typeBuf, body, crcBuf]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // Filter byte 0 por linea + pixels.
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (1 + W * 4) + 1 + x * 4;
      const i = (y * W + x) * 4;
      raw[o] = data[i]; raw[o+1] = data[i+1]; raw[o+2] = data[i+2]; raw[o+3] = data[i+3];
    }
  }
  const idat = zlib.deflateSync(raw);
  fs.writeFileSync(filepath, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

// ---- side: pared gris clara sucia, mismo estilo que base pero sin la
// franja de escombros. Pocas ventanas rotas dispersas + mas grietas
// largas. Pega visualmente con base.
function makeSide(seed) {
  const rand = mulberry32(seed);
  // Base: hormigon viejo gris claro (mismo tono que makeBase).
  const data = blankImage(170, 165, 158);
  applyGrain(data, rand, 20);
  brickLines(data, rand);
  // Manchas de hollin/humedad — manchas oscuras irregulares.
  for (let k = 0; k < 6; k++) {
    const cx = (rand() * W) | 0;
    const cy = (rand() * H) | 0;
    const r = 3 + ((rand() * 5) | 0);
    rubblePatch(data, cx, cy, r, rand, [130, 125, 116]);
  }
  // 2 ventanas pequeñas dispersas (no en cuadricula).
  const wins = [];
  // Una ventana siempre en la mitad superior, otra en la mitad inferior,
  // ambas con posicion X aleatoria para que no se alineen entre instancias.
  wins.push({
    x: 6 + ((rand() * 36) | 0),
    y: 6 + ((rand() * 18) | 0),
    w: 12 + ((rand() * 6) | 0),
    h: 14 + ((rand() * 6) | 0),
  });
  // 50% de probabilidad de una segunda ventana en la mitad inferior.
  if (rand() < 0.5) {
    wins.push({
      x: 6 + ((rand() * 36) | 0),
      y: 36 + ((rand() * 16) | 0),
      w: 12 + ((rand() * 6) | 0),
      h: 12 + ((rand() * 6) | 0),
    });
  }
  for (const win of wins) {
    fillRect(data, win.x - 1, win.y - 1, win.x + win.w + 1, win.y + win.h + 1, [60, 55, 50, 255]);
    fillRect(data, win.x, win.y, win.x + win.w, win.y + win.h, [20, 18, 16, 255]);
    // Trozos rotos del marco.
    for (let k = 0; k < 5; k++) {
      const sideIdx = (rand() * 4) | 0;
      const bite = 2 + ((rand() * 4) | 0);
      if (sideIdx === 0) {
        const sx = win.x + ((rand() * (win.w - bite)) | 0);
        fillRect(data, sx, win.y, sx + bite, win.y + bite, [120, 115, 108, 255]);
      } else if (sideIdx === 1) {
        const sy = win.y + ((rand() * (win.h - bite)) | 0);
        fillRect(data, win.x + win.w - bite, sy, win.x + win.w, sy + bite, [120, 115, 108, 255]);
      } else if (sideIdx === 2) {
        const sx = win.x + ((rand() * (win.w - bite)) | 0);
        fillRect(data, sx, win.y + win.h - bite, sx + bite, win.y + win.h, [120, 115, 108, 255]);
      } else {
        const sy = win.y + ((rand() * (win.h - bite)) | 0);
        fillRect(data, win.x, sy, win.x + bite, sy + bite, [120, 115, 108, 255]);
      }
    }
  }
  // Grietas finas largas — mas que en la version anterior.
  for (let k = 0; k < 10; k++) {
    let x = (rand() * W) | 0;
    let y = (rand() * H) | 0;
    const len = 12 + ((rand() * 30) | 0);
    const vertical = rand() < 0.7;  // mayoria verticales
    for (let s = 0; s < len; s++) {
      setPx(data, x, y, [55, 50, 45, 255]);
      if (vertical) y++;
      else x++;
      if (rand() < 0.25) {
        if (vertical) x += (rand() < 0.5) ? -1 : 1;
        else          y += (rand() < 0.5) ? -1 : 1;
      }
    }
  }
  return data;
}

// ---- base: planta baja, sigue siendo muro pero con cascotes apilados ----
function makeBase(seed) {
  const data = makeSide(seed);  // arranca como side normal
  const rand = mulberry32(seed + 1);
  // Acumulacion de escombros en la parte inferior: monticulo irregular.
  const rubbleColor = [125, 120, 112];
  for (let x = 0; x < W; x++) {
    const baseHeight = 14 + Math.sin(x * 0.3) * 4 + (rand() - 0.5) * 6;
    for (let y = H - baseHeight; y < H; y++) {
      const dist = (H - y) / baseHeight;
      const shade = (rand() - 0.5) * 35 + (1 - dist) * 20;
      setPx(data, x, y, [
        Math.max(0, Math.min(255, rubbleColor[0] + shade)),
        Math.max(0, Math.min(255, rubbleColor[1] + shade)),
        Math.max(0, Math.min(255, rubbleColor[2] + shade)),
        255,
      ]);
    }
  }
  // Cascotes individuales encima del monticulo.
  for (let k = 0; k < 18; k++) {
    const cx = (rand() * W) | 0;
    const cy = H - 18 + ((rand() * 18) | 0);
    const r = 1 + ((rand() * 3) | 0);
    rubblePatch(data, cx, cy, r, rand, [140, 134, 124]);
  }
  return data;
}

// ---- capital: ultimo piso, esqueleto. Casi todo hueco con columnas. ----
function makeCapital(seed) {
  const rand = mulberry32(seed + 2);
  // Empieza casi todo "hueco" (negro = cielo visible).
  const data = blankImage(20, 18, 16);
  // Columnas verticales del esqueleto en X = 4, 18, 44, 56 (4 pilares).
  const pillars = [4, 18, 44, 56];
  for (const px of pillars) {
    for (let x = px; x < px + 4; x++) {
      for (let y = 0; y < H; y++) {
        // Pilar gris claro con grain y muescas.
        const noise = (rand() - 0.5) * 25;
        const baseR = 175 + noise;
        setPx(data, x, y, [Math.max(0, baseR), Math.max(0, baseR - 5), Math.max(0, baseR - 12), 255]);
      }
    }
  }
  // Viga horizontal superior (lo que queda de la cornisa) - dentada.
  for (let x = 0; x < W; x++) {
    const beamH = 4 + ((rand() < 0.3) ? 3 : 0);
    for (let y = 0; y < beamH; y++) {
      const noise = (rand() - 0.5) * 20;
      if (rand() < 0.1) continue; // hueco roto
      setPx(data, x, y, [170 + noise, 165 + noise, 158 + noise, 255]);
    }
  }
  // Trocitos de muro sueltos colgando entre columnas.
  for (let k = 0; k < 8; k++) {
    const x = ((rand() * W) | 0);
    const y = ((rand() * H) | 0);
    const w = 2 + ((rand() * 4) | 0);
    const h = 2 + ((rand() * 4) | 0);
    fillRect(data, x, y, Math.min(W, x + w), Math.min(H, y + h), [160, 155, 148, 255]);
  }
  // Brick lines + grain ligero solo sobre los pilares (no afecta los huecos).
  brickLines(data, rand);
  return data;
}

// ---- top: techo destruido, escombros visto desde arriba ----
function makeTop(seed) {
  const rand = mulberry32(seed + 3);
  // Base gris polvoriento.
  const data = blankImage(150, 145, 138);
  applyGrain(data, rand, 25);
  // Manchas de escombros desperdigadas.
  for (let k = 0; k < 25; k++) {
    const cx = (rand() * W) | 0;
    const cy = (rand() * H) | 0;
    const r = 1 + ((rand() * 4) | 0);
    rubblePatch(data, cx, cy, r, rand, [130, 125, 116]);
  }
  // Algunos agujeros abiertos al interior (manchas negras).
  for (let k = 0; k < 4; k++) {
    const cx = 12 + ((rand() * 40) | 0);
    const cy = 12 + ((rand() * 40) | 0);
    const r = 3 + ((rand() * 4) | 0);
    rubblePatch(data, cx, cy, r, rand, [30, 25, 22]);
  }
  return data;
}

// ---- bottom: subsuelo, casi negro con poco detalle ----
function makeBottom() {
  const rand = mulberry32(777);
  const data = blankImage(40, 38, 35);
  applyGrain(data, rand, 12);
  return data;
}

const OUT_DIR = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'textures', 'ruina');
fs.mkdirSync(OUT_DIR, { recursive: true });

writePNG(path.join(OUT_DIR, 'side.png'),    makeSide(101));
writePNG(path.join(OUT_DIR, 'base.png'),    makeBase(202));
writePNG(path.join(OUT_DIR, 'capital.png'), makeCapital(303));
writePNG(path.join(OUT_DIR, 'top.png'),     makeTop(404));
writePNG(path.join(OUT_DIR, 'bottom.png'),  makeBottom());

console.log('Wrote 5 PNGs to', OUT_DIR);
