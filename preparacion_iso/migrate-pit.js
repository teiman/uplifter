// Migracion: en cada solucion guardada, las celdas vacias rodeadas por 4
// cubos ortogonales pasan a tener kind 'pit'. Reemplaza la decoracion previa
// (si la habia) o anade una nueva.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'solutions');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

function hasCube(cubes, r, c) {
  if (r < 0 || r > 2 || c < 0 || c > 2) return false;
  return ((cubes >> (r * 3 + c)) & 1) === 1;
}

let filesUpdated = 0;
let cellsAdded = 0;       // celdas donde no habia decoracion y se anade pit
let cellsReplaced = 0;    // celdas donde habia otra deco distinta de pit
let cellsAlreadyPit = 0;  // ya tenian pit, no se modifica nada
const detalle = [];

for (const f of files) {
  const fp = path.join(dir, f);
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const cubes = j.cubes;
  if (typeof cubes !== 'number') continue;
  let fileChanged = false;
  const decs = j.decorations || [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (hasCube(cubes, r, c)) continue;
      const allFour =
        hasCube(cubes, r - 1, c) && hasCube(cubes, r + 1, c) &&
        hasCube(cubes, r, c - 1) && hasCube(cubes, r, c + 1);
      if (!allFour) continue;
      const idx = decs.findIndex(d => d.row === r && d.col === c);
      if (idx < 0) {
        decs.push({ row: r, col: c, kind: 'pit', dir: 0 });
        cellsAdded++;
        detalle.push(`${j.id} (${r},${c}): + pit`);
        fileChanged = true;
      } else if (decs[idx].kind !== 'pit') {
        const before = decs[idx].kind;
        decs[idx] = { row: r, col: c, kind: 'pit', dir: 0 };
        cellsReplaced++;
        detalle.push(`${j.id} (${r},${c}): ${before} -> pit`);
        fileChanged = true;
      } else {
        cellsAlreadyPit++;
      }
    }
  }
  if (fileChanged) {
    j.decorations = decs;
    j.updatedAt = new Date().toISOString();
    fs.writeFileSync(fp, JSON.stringify(j, null, 2));
    filesUpdated++;
  }
}
console.log(`ficheros modificados: ${filesUpdated} / ${files.length}`);
console.log(`celdas anadidas (pit nuevo): ${cellsAdded}`);
console.log(`celdas reemplazadas (otro -> pit): ${cellsReplaced}`);
console.log(`celdas ya correctas (pit): ${cellsAlreadyPit}`);
if (detalle.length) {
  console.log('\nDetalle:');
  for (const d of detalle) console.log('  ' + d);
}
