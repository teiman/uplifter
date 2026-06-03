// Test directo: monta una geometria simple (cubo) y comprueba que
// EdgesGeometry devuelve solo 12 aristas (las 12 del cubo), no 18 ni 24.
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8088;
async function check() {
  function req() { return new Promise(r => { const x = http.request({host:'127.0.0.1',port:PORT,path:'/',timeout:500},res=>{res.resume();r(true);}); x.on('error',()=>r(false)); x.on('timeout',()=>{x.destroy();r(false);}); x.end(); }); }
  if (!await req()) { console.log('server not running'); return; }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('[' + m.type() + ']', m.text()));
  await page.goto('http://localhost:' + PORT, { waitUntil: 'networkidle' });
  const out = await page.evaluate(() => {
    const cubeMesh = geomCube(0xff0000);
    // geomCube devuelve un Group con [Mesh, LineSegments]
    const mesh = cubeMesh.children[0];
    const lines = cubeMesh.children[1];
    const geom = mesh.geometry;
    const edgesGeom = lines.geometry;
    return {
      meshVerts: geom.attributes.position.count,
      meshIndices: geom.index ? geom.index.count : null,
      edgesVerts: edgesGeom.attributes.position.count,
      edgesSegments: edgesGeom.attributes.position.count / 2,
    };
  });
  console.log('cube geometry stats:', out);
  // Tambien probamos una rampa para ver cuantas aristas tiene.
  const rampOut = await page.evaluate(() => {
    const m = geomRampOrtho(0xd4a256, 0);
    // El group ahora tiene pivot anidado; buscamos el mesh recursivamente.
    let mesh = null, lines = null;
    m.traverse(o => {
      if (o.isMesh) mesh = o;
      if (o.isLineSegments) lines = o;
    });
    return {
      meshVerts: mesh.geometry.attributes.position.count,
      meshIndices: mesh.geometry.index ? mesh.geometry.index.count : null,
      edgesSegments: lines.geometry.attributes.position.count / 2,
    };
  });
  console.log('ramp ortho N stats:', rampOut);
  await browser.close();
}
check().catch(e => console.error(e));
