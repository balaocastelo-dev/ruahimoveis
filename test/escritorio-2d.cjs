// Regressão dos oito lugares no fallback 2D, com cliques reais e sem WebGL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const servidor = require('../docs/wip/servidor-teste.cjs');
let browser;
const erros = [];
const rotas = {
  mural: '#/radar', tv: '#/painel', placa: '#/leads', recepcao: '#/visitas',
  impressora: '#/imoveis?autorizacoes=1', sofa: '#/leads?aguardando=1', cafe: '#/avisos', reuniao: '#/chat',
};
(async () => {
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    args: ['--disable-webgl'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => erros.push(e.message));
  // O conteúdo da tela tem testes de API próprios; aqui verificamos a interação com o iframe.
  await page.route('**/app.html?embutido=1', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><input aria-label="Busca"></body></html>' }));
  await page.goto(`http://127.0.0.1:${servidor.address().port}/teste-3d.html`);
  await page.waitForFunction(() => window.__aberto);
  assert.equal(await page.locator('#jg').count(), 1);
  assert.equal(await page.evaluate(() => window.jg3dEstado()), null);
  await page.evaluate(() => { clearInterval(JG_ESTADO.vida); clearInterval(JG_ESTADO.iv); });
  for (const [lugar, rota] of Object.entries(rotas)) {
    const alvo = page.locator(`.jg-lugar[data-lugar="${lugar}"]`);
    await alvo.hover();
    assert.ok(await alvo.locator('.jg-lugar-dica').isVisible());
    assert.match(await alvo.getAttribute('title'), /Clique para abrir/);
    await alvo.click();
    const frame = page.locator('#j3-painel iframe');
    assert.equal(await frame.getAttribute('src'), `/app.html?embutido=1${rota}`);
    assert.equal(await page.locator('#j3-painel').count(), 1);
    if (lugar === 'reuniao') assert.match(await page.locator('.j3p-aviso').innerText(), /Sala de reunião ao vivo em breve/);
    // ESC com o foco dentro do iframe deve fechar o painel, sem perder o escritório.
    await page.frameLocator('#j3-painel iframe').getByRole('textbox', { name: 'Busca' }).focus();
    await page.keyboard.press('Escape');
    await page.waitForSelector('#j3-painel', { state: 'detached' });
    console.log(`ok · 2D: ${lugar} abre ${rota}; ESC fecha a partir do iframe`);
  }
  await page.locator('.jg-lugar[data-lugar="cafe"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#j3-painel iframe').getAttribute('src'), '/app.html?embutido=1#/avisos');
  await page.locator('[data-act="j3-lugar-fecha"]').click();
  assert.equal(await page.evaluate(() => document.activeElement.dataset.lugar), 'cafe');
  await page.keyboard.press('Space');
  await page.locator('#j3-painel').click({ position: { x: 2, y: 2 } });
  assert.equal(await page.locator('#j3-painel').count(), 0);
  console.log('ok · 2D: Enter, espaço, fechar, clique fora e retorno de foco');
  await page.locator('.jg-topo-acoes [data-act="jg-cheia"]').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'jg');
  await page.locator('.jg-lugar[data-lugar="impressora"]').click();
  assert.equal(await page.locator('#jg #j3-painel iframe').getAttribute('src'), '/app.html?embutido=1#/imoveis?autorizacoes=1');
  await page.locator('[data-act="j3-lugar-abre"]').click();
  await page.waitForFunction(() => location.hash === '#/imoveis?autorizacoes=1');
  assert.equal(await page.locator('#j3-painel').count(), 0);
  console.log('ok · 2D: painel na tela cheia e abertura da rota com filtro');
  await page.evaluate(() => document.exitFullscreen());
  const saida = path.resolve(__dirname, '../data/cenario-qa');
  fs.mkdirSync(saida, { recursive: true });
  await page.locator('#jg').screenshot({ path: path.join(saida, 'lugares-2d.png') });
  assert.deepEqual(erros, []);
  console.log('Escritório 2D: todos os lugares verificados sem WebGL.');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  servidor.close();
});
