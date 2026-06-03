// Verifica: marcar un checkbox de la galeria persiste en el servidor.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

function fetchStatus() {
  return new Promise((resolve, reject) => {
    const req = http.request({ host:'127.0.0.1', port:8088, path:'/api/gallery-status' }, res => {
      let buf = ''; res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('http://localhost:8088', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('status inicial:', await fetchStatus());

  // Marcar el checkbox del primer thumb (ramp/0).
  await page.evaluate(() => {
    const cb = document.querySelector('.galleryItem .thumb-ok input');
    cb.click();
  });
  await page.waitForTimeout(300);
  console.log('tras click 1:', await fetchStatus());

  // Volver a desmarcar.
  await page.evaluate(() => {
    const cb = document.querySelector('.galleryItem .thumb-ok input');
    cb.click();
  });
  await page.waitForTimeout(300);
  console.log('tras click 2:', await fetchStatus());

  // Marcar 3 distintos.
  await page.evaluate(() => {
    const cbs = document.querySelectorAll('.galleryItem .thumb-ok input');
    cbs[0].click(); cbs[3].click(); cbs[10].click();
  });
  await page.waitForTimeout(500);
  console.log('tras marcar 3:', await fetchStatus());

  const gal = await page.$('#gallery');
  fs.mkdirSync(path.join(__dirname, 'debug-out'), { recursive: true });
  await gal.screenshot({ path: path.join(__dirname, 'debug-out/gallery-checkboxes.png') });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
