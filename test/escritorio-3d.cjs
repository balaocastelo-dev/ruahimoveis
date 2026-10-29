// Render real (WebGL/SwiftShader) e regressões do escritório, com a API local simulada.
// node test/escritorio-3d.cjs — CHROME_PATH opcional; padrão: Chrome instalado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const servidor = require('../docs/wip/servidor-teste.cjs');
const saida = path.resolve(__dirname, '../data/cenario-qa');
const erros = [], falhas = [], relatorio = {};
let browser;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('ok · ' + msg); };
const pronto = (page) => page.waitForFunction(() => {
  const e = window.jg3dEstado?.();
  return e && Object.values(e.agentes).length === 9 && Object.values(e.agentes).every((a) => a.b.glb)
    && [...e.texturas.values()].every((tx) => tx.image?.complete);
}, null, { timeout: 180000, polling: 500 });
const pausa = (page) => page.evaluate(() => {
  const e = window.jg3dEstado();
  clearInterval(e.vida); clearInterval(e.relogio);
  e.idleDesde = 1e12; e.voo = null;
});
const clima = async (page, hora, nome) => {
  await page.evaluate((h) => { window.__clima(h, true); }, hora);
  await page.waitForTimeout(1000);
  relatorio[nome] = await page.evaluate(() => {
    const e = window.jg3dEstado();
    return { modo: e.modoCeu, exposicao: e.renderer.toneMappingExposure,
      panorama: Object.fromEntries(Object.entries(e.panoramas).map(([n, m]) => [n, m.material.opacity])),
      agentes: Object.fromEntries(Object.values(e.agentes).map((a) => [a.slug, { glb: a.b.glb, sentado: a.b.sentado, altura: a.b.corpo.position.y }])),
      gtao: e.gtao?.enabled, fpsInicial: e.desempenho.fps, samples: e.composer.renderTarget1.samples };
  });
  ok(relatorio[nome].panorama[nome] === 1, 'panorama ' + nome);
  await page.locator('#j3').screenshot({ path: path.join(saida, nome + '.png'), timeout: 90000 });
  console.log('captura · ' + nome);
};

(async () => {
  fs.mkdirSync(saida, { recursive: true });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  console.log('Chrome aberto; carregando cenário e humanos.');
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 }, timezoneId: 'America/Sao_Paulo' });
  const monitora = (p) => {
    p.on('pageerror', (e) => { erros.push(e.message); console.error('pageerror:', e.stack); });
    p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    p.on('response', (r) => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`); });
    p.on('requestfailed', (r) => { if (!r.failure()?.errorText.includes('ERR_ABORTED')) falhas.push(`${r.failure()?.errorText} ${r.url()}`); });
  };
  monitora(page);
  await page.goto(base + '/teste-3d.html?quiet=1');
  await pronto(page); await pausa(page);
  await page.waitForFunction(() => Object.values(window.jg3dEstado().agentes).every((a) => Math.abs(a.b.corpo.position.y + 0.3) < 0.02), null, { timeout: 90000 });
  ok(true, '9 GLBs e 21 texturas carregados');
  ok(await page.locator('#j3-hud').isVisible(), 'HUD visível');
  await page.waitForFunction(() => window.jg3dEstado().desempenho.fps !== null);
  // Composição completa, inclusive AO, mesmo se o software tiver acionado a redução.
  await page.evaluate(() => { const e = window.jg3dEstado(); e.gtao.enabled = true; });
  await clima(page, 12, 'dia');
  await clima(page, 17.5, 'tarde');
  await clima(page, 21, 'noite');
  const estrutura = await page.evaluate(() => {
    const e = window.jg3dEstado();
    const g = e.panoramas.dia.geometry.attributes.position;
    let zMax = -Infinity; for (let i = 0; i < g.count; i++) zMax = Math.max(zMax, g.getZ(i));
    return { passes: e.composer.passes.map((p) => p.constructor.name), sombra: e.sol.shadow.mapSize.x, zMax,
      sentados: Object.values(e.agentes).every((a) => a.b.sentado && Math.abs(a.z - a.mesa[1] - 0.8) < 0.001 && Math.abs(a.b.corpo.position.y + 0.3) < 0.02) };
  });
  relatorio.estrutura = estrutura;
  assert.deepEqual(estrutura.passes, ['RenderPass', 'GTAOPass', 'UnrealBloomPass', 'OutputPass']);
  ok(estrutura.sombra === 4096 && estrutura.zMax < -7, 'sombra 4096 e panorama atrás da fachada (-z)');
  ok(estrutura.sentados, 'pessoas sentadas nas posições e alturas originais');

  ok(await page.evaluate(() => !window.jg3dEstado().tour), 'tour nunca começa sozinho');
  await page.click('[data-act="j3-apres"]');
  ok(await page.evaluate(() => window.jg3dEstado().tour.indice === 0 && window.jg3dEstado().tourLuz.visible), 'Apresentar inicia na entrada e acende o lugar');
  await page.click('[data-act="j3-lang"][data-lang="en"]');
  ok((await page.locator('#j3-tour').innerText()).includes('Welcome'), 'tour em inglês');
  await page.click('[data-act="j3-lang"][data-lang="ja"]');
  ok((await page.locator('#j3-tour').innerText()).includes('ようこそ'), 'tour em japonês');
  await page.click('[data-act="j3-lang"][data-lang="pt"]');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
  ok(await page.evaluate(() => window.jg3dEstado().tour.indice === 0), 'setas avançam e voltam no tour');
  for (let i = 0; i < 6; i++) await page.click('[data-act="j3-tour-proxima"]');
  ok(await page.evaluate(() => !window.jg3dEstado().tour && window.jg3dEstado().apres && !window.jg3dEstado().tourLuz.visible), 'fim do tour volta à órbita e apaga destaque');
  await page.click('[data-act="j3-apres"]'); await page.click('[data-act="j3-apres"]');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !window.jg3dEstado().tour && !window.jg3dEstado().apres && window.jg3dEstado().controls.enabled), 'ESC sai do tour e devolve controle da câmera');
  await pausa(page);

  // Aproxima a câmera para conferir as texturas e a cadeira com o humano.
  await page.evaluate(() => { const e = window.jg3dEstado(); window.__clima(12, true); e.camera.position.set(-5, 3.4, 3); e.controls.target.set(-3, 0.9, -1.8); e.controls.update(); });
  await page.waitForTimeout(800);
  await page.locator('#j3').screenshot({ path: path.join(saida, 'detalhe.png'), timeout: 90000 });
  await page.evaluate(() => { const e = window.jg3dEstado(); window.__cameraDetalhe = e.camera.position.clone(); window.__alvoDetalhe = e.controls.target.clone(); e.camera.position.set(22, 9, 5); e.controls.target.set(0, 0.8, -0.5); e.controls.update(); });
  await page.waitForTimeout(500);
  await page.locator('#j3').screenshot({ path: path.join(saida, 'lateral.png'), timeout: 90000 });
  await page.evaluate(() => { const e = window.jg3dEstado(); e.camera.position.copy(window.__cameraDetalhe); e.controls.target.copy(window.__alvoDetalhe); e.controls.update(); e.camera.updateMatrixWorld(); });

  // O PC externo ainda consegue pintar a mesma textura do monitor.
  ok(await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40;
    const x = cv.getContext('2d'); x.fillStyle = '#1bb080'; x.fillRect(0, 0, 64, 40);
    const r = window.jg3dTelaDoAgente('apartamentos', cv);
    return r && window.jg3dEstado().monitores.apartamentos.externa;
  }), 'PC virtual pinta o monitor');
  const alvo = await page.evaluate(() => {
    const e = window.jg3dEstado(), a = e.agentes.apartamentos;
    window.abrePcDoAgente = (slug) => { window.__pcAberto = slug; };
    const pos = a.b.g.position.clone(); pos.y = 1.0; pos.project(e.camera);
    const r = e.tela.getBoundingClientRect();
    return { x: r.left + (pos.x + 1) * r.width / 2, y: r.top + (1 - pos.y) * r.height / 2 };
  });
  await page.mouse.dblclick(alvo.x, alvo.y);
  await page.waitForFunction(() => window.__pcAberto === 'apartamentos');
  ok(true, 'duplo clique no agente abre o PC');
  await pausa(page);

  // Lugares clicáveis: mural → oportunidades, TV da diretoria → painel, placa do salão → CRM.
  for (const [lugar, rota] of [['mural', '#/radar'], ['tv', '#/painel'], ['placa', '#/leads']]) {
    // sem amortecimento a câmera vai exatamente para onde o teste manda (e o alvo cai no centro da tela)
    const p = await page.evaluate(async (k) => {
      const e = window.jg3dEstado(), o = e.cliques.find((c) => c.userData.lugar === k);
      e.idleDesde = 1e12; e.voo = null; e.apres = false; e.controls.autoRotate = false; e.controls.enableDamping = false;
      e.camera.position.set(o.position.x * 0.5, 3.2, o.position.z + 9); e.controls.target.copy(o.position); e.controls.update();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const v = o.position.clone().project(e.camera), r = e.tela.getBoundingClientRect();
      return { x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 };
    }, lugar);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(150);
    const cursor = await page.evaluate(() => window.jg3dEstado().tela.style.cursor);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => !!document.querySelector('#j3-painel iframe'), null, { timeout: 5000 });
    const src = await page.evaluate(() => document.querySelector('#j3-painel iframe').getAttribute('src'));
    ok(cursor === 'pointer' && src === `/app.html?embutido=1${rota}`, `clique no ${lugar} abre ${rota} embutido`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => !document.querySelector('#j3-painel')), `ESC fecha o painel do ${lugar}`);
  }

  await page.evaluate(() => { window.jg3dEstado().controls.enableDamping = true; });

  // Andar pelo escritório (tipo Roblox): entra, caminha, abre um lugar e sai.
  await page.click('.j3-andar-bt');
  await page.waitForFunction(() => window.jg3dEstado().andando, null, { timeout: 30000 });
  ok(await page.locator('.j3a-ajuda').isVisible(), 'modo andar entra com o visitante e a ajuda na tela');
  const antes = await page.evaluate(() => window.jg3dEstado().andar && [...document.querySelectorAll('.j3a-ajuda')].length);
  await page.keyboard.down('w'); await page.waitForTimeout(800); await page.keyboard.up('w');
  ok(antes === 1 && await page.evaluate(() => Number.isFinite(window.jg3dEstado().camera.position.z)), 'W caminha sem sair da sala');
  await page.evaluate(() => window.jg3dAbreLugar('mural'));
  await page.waitForFunction(() => !!document.querySelector('#j3-painel iframe'), null, { timeout: 5000 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !document.querySelector('#j3-painel') && window.jg3dEstado().andando), 'painel abre e fecha sem sair do modo andar');
  await page.click('.j3-andar-bt'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !window.jg3dEstado().andando && window.jg3dEstado().controls.enabled), 'sai do modo andar e a órbita volta');

  await page.mouse.move(650, 470); await page.mouse.down(); await page.mouse.move(730, 490, { steps: 5 }); await page.mouse.up();
  ok(await page.evaluate(() => Number.isFinite(window.jg3dEstado().camera.position.x)), 'órbita da câmera responde');

  await page.setViewportSize({ width: 1024, height: 800 });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => {
    const e = window.jg3dEstado(), dpr = e.renderer.getPixelRatio();
    return e.composer.renderTarget1.width === e.W * dpr && e.gtao.width === Math.round(e.W * dpr / 2);
  }), 'composer e GTAO redimensionados');
  await page.evaluate(() => {
    const e = window.jg3dEstado(); e.aoLento = false; e.gtao.enabled = true;
    e.desempenho = { inicio: performance.now() - 3100, quadros: 20, fps: null };
  });
  await page.waitForFunction(() => window.jg3dEstado().aoLento);
  ok(await page.evaluate(() => { const e = window.jg3dEstado(); return !e.gtao.enabled && e.bloom.enabled && e.composer.passes.at(-1).enabled; }), 'abaixo de 25 fps desliga só GTAO');

  // Observa descarte de recursos reais ao alternar para 2D e reabre o mesmo módulo.
  await page.evaluate(() => {
    const e = window.jg3dEstado(); window.__descartados = [];
    for (const [nome, alvo] of [['composer', e.composer.renderTarget1], ['gtao', e.gtao.normalRenderTarget], ['bloom', e.bloom.renderTargetBright], ['output', e.composer.passes.at(-1).material]]) {
      alvo.addEventListener('dispose', () => window.__descartados.push(nome));
    }
  });
  await page.locator('[data-act="jg-modo"][data-modo="2d"]').click();
  await page.waitForSelector('#jg');
  ok(await page.evaluate(() => !window.jg3dEstado() && window.__descartados.length === 4), 'troca para 2D descarta composer e passes');
  await page.locator('[data-act="jg-modo"][data-modo="3d"]').click();
  await pronto(page); await pausa(page);
  ok(await page.evaluate(() => window.jg3dEstado().texturas.size === 21), 'reabre 3D com materiais, texturas e 9 humanos');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  monitora(mobile);
  await mobile.goto(base + '/teste-3d.html?quiet=1&h=600'); await pronto(mobile); await pausa(mobile);
  ok(await mobile.evaluate(() => {
    const e = window.jg3dEstado(); return !e.gtao && e.composer.passes.length === 3 && e.renderer.getPixelRatio() === 1.5;
  }), 'celular usa render + bloom + output, sem GTAO');
  await mobile.locator('#j3').screenshot({ path: path.join(saida, 'celular.png'), timeout: 90000 });
  await mobile.close();
  relatorio.erros = erros; relatorio.falhas = falhas;
  fs.writeFileSync(path.join(saida, 'render.json'), JSON.stringify(relatorio, null, 2));
  assert.deepEqual(erros, [], 'nenhum erro JavaScript/WebGL');
  assert.deepEqual(falhas, [], 'nenhum recurso com erro HTTP/rede');
  console.log('Escritório 3D: tudo certo. Capturas em ' + saida);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(path.join(saida, 'render.json'), JSON.stringify({ ...relatorio, erros, falhas }, null, 2));
  if (browser) await browser.close();
  servidor.close();
});
