#!/usr/bin/env node
/**
 * gen-wave-spr.js — Build a "wave breaking on the beach and fading" sprite,
 * laid FLAT on the water (SPR_ORIENTED, type 3, so the entity's .angles place
 * it: pitch 90 = face up, yaw = point toward land). Drawn from the Quake
 * FULLBRIGHT cyan/white range so the foam glows on the water.
 *
 * It must ANIMATE while makestatic'd (no QC think runs on a static entity), so
 * the single sprite frame is a SPR_GROUP: the engine cycles its sub-frames on
 * its own clock. Each sub-frame advances a foam crest from the seaward edge of
 * the sprite (bottom, -Y in sprite space) toward the land edge (top, +Y) and
 * fades out — a wave rolling up the beach and dissolving. The wave travels
 * along +Y in sprite space; the entity's yaw rotates that toward the shore.
 *
 * Se generan VARIAS variantes (wave0.spr..waveN.spr) idénticas en la rompiente
 * pero con distinta "cola" de agua quieta al final → distinto periodo de bucle,
 * para que olas vecinas no queden sincronizadas. wave.spr = wave0 (preview).
 *
 * Output: ../../mod/progs/wave{0..N}.spr + wave.spr (+ mirror a d:/quake/uplifter/progs)
 *
 *   node scripts/gen-wave-spr.js
 */

const fs = require('node:fs');
const path = require('node:path');

const TRANSPARENT_IDX = 255;   // sprite transparency key

// Colores de espuma ELEGIDOS para MEZCLARSE con el agua costera donde van las
// olas (textura *water1, azul dominante idx 214 = 47,47,159). En vez de
// cian/blanco rotundo usamos una rampa que parte del azul del mar y se aclara
// un poco — "agua agitada", no pintura encima. Índices verificados:
//   245 = cian claro (171,231,255)  → cresta
//   244 = cian azulado (127,191,255) → cuerpo
//   212 = azul (35,35,191)           → estela (casi se funde con el agua)
const C_FOAM_HI = 245;   // cresta
const C_FOAM_MD = 244;   // cuerpo de espuma
const C_FOAM_LO = 212;   // estela / borde (se mezcla con el agua)

// ---------- canvas ----------
const W = 96;
const H = 96;

function blank() { return new Uint8Array(W * H).fill(TRANSPARENT_IDX); }
function put(px, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; }

// Deterministic pseudo-noise (no Math.random so builds are reproducible).
function noise(x, y, salt) {
  return ((x * 73 + y * 151 + salt * 311) % 100) / 100;
}

/**
 * Build one animation sub-frame. `t` in [0..1] is progress:
 *   - the crest's centre line marches from yFront0 (seaward) toward yFront1
 *     (landward) as t grows;
 *   - the whole band fades (alpha→0) and thins out near the end ("desaparece").
 * Sprite space: y=0 is the TOP (land side), y=H-1 the BOTTOM (sea side). The
 * wave starts low (near the sea edge) and rolls up toward the top.
 */
function buildFrame(t) {
  const px = blank();

  // Crest centre marches from near the sea edge up toward the land edge.
  const yFront0 = H * 0.82;   // start: low (seaward)
  const yFront1 = H * 0.18;   // end:   high (landward)
  const crestY = yFront0 + (yFront1 - yFront0) * t;

  // The band thins and dissolves as it advances. thickness in rows.
  const thick = 24 * (1 - 0.5 * t);
  // Global fade: full early, gone by the end so it "desaparece".
  const fade = (t < 0.7) ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);

  for (let y = 0; y < H; y++) {
    // Distance from the crest line (rows). 0 = on the crest.
    const dCrest = y - crestY;
    for (let x = 0; x < W; x++) {
      // A wavy crest: the front line undulates a little across X so it isn't a
      // straight bar. Amplitude grows toward the ends for a natural look.
      const xf = x / (W - 1);                 // 0..1 across width
      const wob = Math.sin(xf * Math.PI * 3 + t * 6.28) * 4 * (0.5 + 0.5 * Math.abs(xf - 0.5) * 2);
      const d = dCrest + wob;

      // Foam band: a bright crest with a softer wash trailing on the sea side
      // (below the crest, higher y). Nothing on the far land side (above).
      let col = null;
      if (d >= -3 && d <= 3) {
        col = C_FOAM_HI;                       // crest line (más gruesa)
      } else if (d > 2 && d <= thick) {
        // trailing wash, broken up by noise so it reads as foam, not a slab
        const n = noise(x, y, Math.round(t * 50));
        const ff = d / thick;                  // 0 near crest → 1 at tail
        if (n > ff * 0.9) col = (ff < 0.5) ? C_FOAM_MD : C_FOAM_LO;
      } else if (d > -6 && d < -2) {
        // a few scattered spray dots ahead of the crest (toward land)
        if (noise(x, y, 7 + Math.round(t * 50)) > 0.86) col = C_FOAM_MD;
      }

      if (col === null) continue;
      // Fade LATERAL: la espuma se disuelve hacia los bordes izq/dcho para que
      // no acabe en seco (bordes rotundos). edgeF = 1 en el centro, 0 en los
      // extremos; cuanto más cerca del borde, más píxeles se descartan.
      const edgeF = Math.min(1, Math.sin(xf * Math.PI) * 1.25);  // 0 en bordes, ~1 centro
      if (noise(x, y, 31) > edgeF) continue;
      // Fade temporal: al final de la animación se disuelve ("desaparece").
      if (fade < 1 && noise(x, y, 99) > fade) continue;
      put(px, x, y, col);
    }
  }
  return px;
}

// ---------- encode .spr (IDSP v1, ORIENTED, single ANIMATED group frame) ----
function encodeAnimatedSprite(frames, intervals, w, h) {
  const radius = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
  const header = Buffer.alloc(36);
  header.write('IDSP', 0, 4, 'ascii');
  header.writeInt32LE(1, 4);     // version 1
  header.writeInt32LE(3, 8);     // type 3 = SPR_ORIENTED (uses entity angles)
  header.writeFloatLE(radius, 12);
  header.writeInt32LE(w, 16);
  header.writeInt32LE(h, 20);
  header.writeInt32LE(1, 24);    // numframes = 1 (a single GROUP frame)
  header.writeFloatLE(0, 28);    // beamlength
  header.writeInt32LE(0, 32);    // synctype (0 = sync; engine cycles by time)

  const chunks = [header];

  // One frame, type = SPR_GROUP (1): the engine animates its sub-frames on its
  // own clock. Layout: int32 type=1, int32 numsub, float intervals[numsub],
  // then each sub-frame { int32 ox, int32 oy, int32 w, int32 h, pixels[w*h] }.
  const grpType = Buffer.alloc(4); grpType.writeInt32LE(1, 0);   // SPR_GROUP
  const numsub  = Buffer.alloc(4); numsub.writeInt32LE(frames.length, 0);
  chunks.push(grpType, numsub);

  // Cumulative interval timestamps (Quake stores the END time of each sub).
  const iv = Buffer.alloc(4 * frames.length);
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    acc += intervals[i];
    iv.writeFloatLE(acc, i * 4);
  }
  chunks.push(iv);

  for (const fr of frames) {
    const fh = Buffer.alloc(16);
    fh.writeInt32LE(-w / 2, 0);    // centred anchor
    fh.writeInt32LE(h / 2, 4);
    fh.writeInt32LE(w, 8);
    fh.writeInt32LE(h, 12);
    chunks.push(fh, Buffer.from(fr));
  }
  return Buffer.concat(chunks);
}

// ---------- main ----------
// La ola en sí (cresta avanzando y disolviéndose) son NF sub-frames idénticos
// en todas las variantes. Lo que CAMBIA entre variantes es la "cola" de agua
// quieta al final: cada variante añade un número distinto de sub-frames vacíos
// (transparentes) con duraciones distintas. Eso hace que el PERIODO total del
// bucle sea distinto en cada variante, de modo que dos olas vecinas que usen
// variantes distintas nunca queden sincronizadas (rompen a destiempo).
const NF = 8;
const waveFrames = [];
for (let i = 0; i < NF; i++) waveFrames.push(buildFrame(i / (NF - 1)));
// Duraciones de la ola (el ciclo activo). Un poco más lento al hincharse,
// rápido al romper. El último valor (0.6) es la primera pausa con la ola ya ida.
const WAVE_INTERVALS = [0.18, 0.16, 0.14, 0.12, 0.12, 0.14, 0.18, 0.6];

// Una variante = la ola + N sub-frames vacíos extra de duración `tail` cada uno.
// Distintos N y `tail` → periodos de bucle distintos (desincronización).
//   variante 0: cola corta   (≈ ola rompiendo casi seguida)
//   variantes crecientes: más segundos de mar en calma entre rompientes.
const VARIANTS = [
  { extra: 0, tail: 0.0 },   // sin pausa extra (la más rápida)
  { extra: 2, tail: 0.7 },
  { extra: 4, tail: 0.8 },
  { extra: 6, tail: 0.9 },
  { extra: 9, tail: 1.0 },   // mar largo en calma entre rompientes
];

const blankFrame = blank();   // sub-frame totalmente transparente (agua quieta)

function buildVariant(v) {
  const frames = waveFrames.slice();
  const intervals = WAVE_INTERVALS.slice();
  for (let i = 0; i < v.extra; i++) { frames.push(blankFrame); intervals.push(v.tail); }
  return encodeAnimatedSprite(frames, intervals, W, H);
}

function writeBoth(name, buf) {
  const repo = path.resolve(__dirname, '..', '..', 'mod', 'progs', name);
  const game = `d:/quake/uplifter/progs/${name}`;
  fs.writeFileSync(repo, buf);
  try { fs.mkdirSync(path.dirname(game), { recursive: true }); fs.writeFileSync(game, buf); } catch (e) { /* game dir optional */ }
  return repo;
}

let totalPeriod;
for (let i = 0; i < VARIANTS.length; i++) {
  const buf = buildVariant(VARIANTS[i]);
  const n = NF + VARIANTS[i].extra;
  const period = WAVE_INTERVALS.reduce((a, b) => a + b, 0) + VARIANTS[i].extra * VARIANTS[i].tail;
  const repo = writeBoth(`wave${i}.spr`, buf);
  // wave0 también se guarda como wave.spr para retrocompatibilidad / preview.
  if (i === 0) writeBoth('wave.spr', buf);
  console.log(`wave${i}.spr: ${W}x${H}, ${n} sub-frames, periodo ${period.toFixed(2)}s → ${repo}`);
}
console.log(`${VARIANTS.length} variantes generadas (wave0..wave${VARIANTS.length - 1}.spr); wave.spr = wave0.`);
