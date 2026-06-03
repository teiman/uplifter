// Debug headless: arranca el servidor si no esta corriendo, abre la pagina con
// Playwright, captura todo (logs, errores, screenshots), y termina.
//
// Uso:
//   node debug.js                      -> screenshot iso + galeria, dump logs
//   node debug.js --url=...            -> usar URL distinta a http://localhost:8088
//   node debug.js --kind=ramp --dir=0  -> forzar un caso especifico para probar un kind
//
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8088;
const URL = process.env.URL || `http://localhost:${PORT}`;
const OUT_DIR = path.join(__dirname, 'debug-out');

function parseArg(name, def) {
  const a = process.argv.find(x => x.startsWith('--' + name + '='));
  return a ? a.split('=')[1] : def;
}

const forceKind = parseArg('kind', null);
const forceDir = parseInt(parseArg('dir', '0'), 10);

function checkServer() {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/', timeout: 800 }, res => {
      res.resume(); resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

let serverProc = null;
async function ensureServer() {
  if (await checkServer()) {
    console.log('[debug] server ya escuchando en', URL);
    return;
  }
  console.log('[debug] arrancando server...');
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], detached: false,
  });
  serverProc.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  serverProc.stderr.on('data', d => process.stderr.write('[srv] ' + d));
  // Espera hasta 5s a que escuche.
  for (let i = 0; i < 50; i++) {
    if (await checkServer()) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('el server no arranco en 5s');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await ensureServer();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();

  const logs = [];
  const errors = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  page.on('requestfailed', req => errors.push('[reqfail] ' + req.url() + ' ' + (req.failure() ? req.failure().errorText : '')));

  console.log('[debug] abriendo', URL);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  // Espera a que el caso este cargado (la fetch a /api/case es async).
  // currentCase es `let` en script global, no esta en window; lo accedemos via eval.
  await page.waitForFunction(() => {
    try { return typeof currentCase !== 'undefined' && currentCase && currentCase.grid; }
    catch { return false; }
  }, null, { timeout: 5000 }).catch(() => {});
  // Damos un frame mas para que se renderice el WebGL tras setContents.
  await page.waitForTimeout(300);

  // Forzar un kind para depurar geometrias concretas.
  if (forceKind) {
    await page.evaluate(({ kind, dir }) => {
      // currentCase y decorations son `let` globales (no en window). Tenemos
      // que reasignarlos via eval para llegar al binding del script global.
      // eslint-disable-next-line no-eval
      eval(`
        currentCase = {
          id: '000', cubes: 0,
          grid: [[true,false,true],[false,false,false],[true,false,true]],
          savedSolution: null,
        };
        decorations = [{ row: 1, col: 1, kind: '${kind}', dir: ${dir} }];
        if (typeof renderAll === 'function') renderAll();
      `);
    }, { kind: forceKind, dir: forceDir });
    await page.waitForTimeout(500);
  }

  // Screenshot completo y del canvas iso aislado.
  const fullPath = path.join(OUT_DIR, 'full.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log('[debug] full ->', fullPath);

  const iso = await page.$('#isoCanvas');
  if (iso) {
    const isoPath = path.join(OUT_DIR, 'iso.png');
    await iso.screenshot({ path: isoPath });
    console.log('[debug] iso ->', isoPath);
  }
  const top = await page.$('#topCanvas');
  if (top) {
    const topPath = path.join(OUT_DIR, 'top.png');
    await top.screenshot({ path: topPath });
    console.log('[debug] top ->', topPath);
  }
  const gallery = await page.$('#gallery');
  if (gallery) {
    const galPath = path.join(OUT_DIR, 'gallery.png');
    await gallery.screenshot({ path: galPath });
    console.log('[debug] gallery ->', galPath);
  }

  // Dump de estado: caso y decoraciones actuales.
  const state = await page.evaluate(() => {
    // eslint-disable-next-line no-eval
    const cc = (() => { try { return currentCase; } catch { return null; } })();
    // eslint-disable-next-line no-eval
    const dd = (() => { try { return decorations; } catch { return null; } })();
    return {
      case: cc,
      decorations: dd,
      threeAvailable: typeof THREE !== 'undefined',
      isoCanvasSize: (() => {
        const el = document.getElementById('isoCanvas');
        return el ? { w: el.width, h: el.height, clientW: el.clientWidth, clientH: el.clientHeight } : null;
      })(),
    };
  });
  console.log('[debug] state:', JSON.stringify(state, null, 2));

  console.log('\n[debug] === LOGS (' + logs.length + ') ===');
  for (const l of logs) console.log(l);
  console.log('\n[debug] === ERRORS (' + errors.length + ') ===');
  for (const e of errors) console.log(e);

  await browser.close();
  if (serverProc) {
    serverProc.kill();
  }
  // Exit con codigo distinto si hubo errores fatales.
  process.exit(errors.length > 0 ? 2 : 0);
})().catch(e => {
  console.error('[debug] FATAL:', e.message, '\n', e.stack);
  if (serverProc) serverProc.kill();
  process.exit(1);
});
