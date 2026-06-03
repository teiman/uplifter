// Verifica que multiples thumbs (uno por kind) estan animados.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://localhost:8088', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // espera a buildGallery + un par de frames

  const animated = await page.evaluate(() => {
    try {
      return __galleryThumbs.filter(t => t.animate).map(t => ({ kind: t.kind, dir: t.dir }));
    } catch { return null; }
  });
  console.log('thumbs animados:', animated);
  console.log('total kinds animados:', animated ? animated.length : 0);

  const outDir = path.join(__dirname, 'debug-out');
  fs.mkdirSync(outDir, { recursive: true });
  const gal = await page.$('#gallery');
  await gal.screenshot({ path: path.join(outDir, 'gallery-t0.png') });
  await page.waitForTimeout(800);
  await gal.screenshot({ path: path.join(outDir, 'gallery-t1.png') });
  console.log('capturas en t0 y t1 escritas');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
