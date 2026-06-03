// Audita las soluciones guardadas en busca de corrupciones.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'solutions');

function rotate90(bits) {
  let out = 0;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      if ((bits >> (r * 3 + c)) & 1)
        out |= 1 << (c * 3 + (2 - r));
  return out;
}
function canonical(bits) {
  let best = bits, cur = bits;
  for (let i = 0; i < 3; i++) { cur = rotate90(cur); if (cur < best) best = cur; }
  return best;
}
function caseId(cubes) {
  return canonical(cubes).toString(16).padStart(3, '0');
}

const VALID_KINDS = new Set([
  'ramp', 'ramp_u', 'ramp_diag', 'pit',
  'corner_in', 'corner_out', 'pyramid',
  'cube', 'unknown',
  'wedge', 'ramp_u_closed',
]);
const DIR_LIMITS = {
  ramp: 3, ramp_diag: 3, corner_in: 3, corner_out: 3,
  wedge: 3, ramp_u_closed: 3,
  ramp_u: 1,
  pit: 0, pyramid: 0, cube: 0, unknown: 0,
};

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const issues = [];

for (const f of files) {
  const fp = path.join(dir, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { issues.push({ file: f, err: 'JSON invalido: ' + e.message }); continue; }

  const expectedId = f.replace('.json', '');
  if (j.id !== expectedId) {
    issues.push({ file: f, err: `id en json (${j.id}) no coincide con nombre fichero (${expectedId})` });
  }
  if (typeof j.cubes !== 'number') {
    issues.push({ file: f, err: 'cubes no es number' });
    continue;
  }
  // El cubes debe ser canonico (su id == nombre fichero).
  const cid = caseId(j.cubes);
  if (cid !== j.id) {
    issues.push({ file: f, err: `cubes no es canonico: caseId(${j.cubes}) = ${cid}, esperado ${j.id}` });
  }
  if ((j.cubes & 16) !== 0) {
    issues.push({ file: f, err: 'centro tiene cubo (bit 4 = 1), prohibido' });
  }
  if (j.cubes < 0 || j.cubes > 511) {
    issues.push({ file: f, err: `cubes fuera de rango: ${j.cubes}` });
  }

  // Decoraciones.
  if (!Array.isArray(j.decorations)) {
    issues.push({ file: f, err: 'decorations no es array' });
    continue;
  }
  const seenCells = new Set();
  for (const d of j.decorations) {
    if (typeof d !== 'object' || d === null) {
      issues.push({ file: f, err: 'decoracion no es objeto' });
      continue;
    }
    const { row, col, kind, dir } = d;
    if (!Number.isInteger(row) || row < 0 || row > 2) {
      issues.push({ file: f, err: `row invalida en ${JSON.stringify(d)}` });
    }
    if (!Number.isInteger(col) || col < 0 || col > 2) {
      issues.push({ file: f, err: `col invalida en ${JSON.stringify(d)}` });
    }
    if (!VALID_KINDS.has(kind)) {
      issues.push({ file: f, err: `kind invalido: ${kind} en (${row},${col})` });
    }
    if (typeof dir !== 'number' || dir < 0 || dir > (DIR_LIMITS[kind] ?? 3)) {
      issues.push({ file: f, err: `dir fuera de rango: ${dir} para kind=${kind} en (${row},${col})` });
    }
    // Celda no debe tener cubo.
    if (((j.cubes >> (row * 3 + col)) & 1) === 1) {
      issues.push({ file: f, err: `decoracion ${kind} en (${row},${col}) sobre celda con cubo` });
    }
    // Duplicada?
    const cellKey = `${row},${col}`;
    if (seenCells.has(cellKey)) {
      issues.push({ file: f, err: `multiples decoraciones en (${row},${col})` });
    }
    seenCells.add(cellKey);
  }

  // Quality.
  if (j.quality !== 'good' && j.quality !== 'almost') {
    issues.push({ file: f, err: `quality invalida: ${j.quality}` });
  }
}

console.log(`Auditados ${files.length} ficheros.`);
console.log(`Problemas encontrados: ${issues.length}\n`);
for (const i of issues) {
  console.log(`[${i.file}] ${i.err}`);
}
if (issues.length === 0) {
  console.log('Todo correcto.');
}
