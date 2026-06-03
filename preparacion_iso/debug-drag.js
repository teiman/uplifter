// Verifica que el drag sobre el iso rota la escena (cambia el render).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://localhost:8088', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof currentCase !== 'undefined' && currentCase && currentCase.grid, null, { timeout: 5000 }).catch(()=>{});
  await page.waitForTimeout(300);

  const outDir = path.join(__dirname, 'debug-out');
  fs.mkdirSync(outDir, { recursive: true });

  // Screenshot inicial.
  const iso = await page.$('#isoCanvas');
  await iso.screenshot({ path: path.join(outDir, 'iso-before.png') });

  // Drag horizontal sobre el canvas iso.
  const box = await iso.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  await iso.screenshot({ path: path.join(outDir, 'iso-after-drag.png') });

  // Lee el yaw aplicado.
  const state = await page.evaluate(() => {
    try { return { yaw: __mainYaw, pitch: __mainPitch }; } catch { return null; }
  });
  console.log('estado tras drag:', state);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
