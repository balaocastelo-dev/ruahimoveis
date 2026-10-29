const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], out = process.argv[3], espera = +(process.argv[4] || 6000); const cam = process.argv[5];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 1400, height: 760 } });
  pg.on('console', (m) => { console.log('[console]', m.text().slice(0, 400)); }); pg.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await pg.goto(url); await pg.waitForFunction(() => window.__aberto, null, { timeout: 90000 });
  await pg.waitForTimeout(espera);
  if (cam) { await pg.evaluate((c) => { const E = window.jg3dEstado(); E.idleDesde = 1e12; E.voo = null; const [x, y, z, tx, ty, tz] = c.split(',').map(Number); E.camera.position.set(x, y, z); E.controls.target.set(tx, ty, tz); E.controls.update(); }, cam); await pg.waitForTimeout(400); }
  const info = await pg.evaluate(() => { const E = window.jg3dEstado(); return Object.fromEntries(Object.values(E.agentes).map((a) => [a.slug, { glb: !!a.b.glb, anim: a.b.atual && a.b.atual.getClip().name, sent: a.b.sentado, pos: [a.x.toFixed(1), a.z.toFixed(1)] }])); });
  console.log(JSON.stringify(info));
  await pg.screenshot({ path: out }); await b.close();
})();
