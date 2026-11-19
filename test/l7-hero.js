// O hero da L7 usa a foto versionada no tema. Os outros temas continuam sem ela.
//   node test/l7-hero.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
for (const arq of ['hero-1920.jpg', 'hero-3840.jpg', 'hero-3840.webp']) {
  assert.ok(fs.existsSync(path.join(raiz, 'public', 'temas', 'l7inteligencia', arq)), arq);
}

process.env.HOUSE_DB = path.join(require('os').tmpdir(), 'hh-l7-hero.db');
process.env.SECRET_KEY = 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO = 'false';
delete process.env.DATABASE_URL;
delete process.env.PORTAL_FUNDO;
process.env.TEMA = 'l7inteligencia';
process.env.CLIENTE_NOME = 'L7 Inteligência Imobiliária';
process.env.EMPRESA = 'L7 Inteligência Imobiliária';

const { FUNDOS, SEQUENCIA, fundoAgora } = require('../src/portal/fundos');
const paginas = require('../src/portal/paginas');

assert.equal(SEQUENCIA.includes('l7'), false, 'a foto da L7 não entra na rotação');
const fundo = fundoAgora('', 'L7 Inteligência Imobiliária');
assert.equal(fundo.id, 'l7');
assert.ok(fundo.src.includes('/temas/l7inteligencia/hero-1920.jpg'));
assert.ok(fundo.srcset.includes('hero-3840.webp'));
assert.ok(FUNDOS.l7.posicao.includes('right'));

const html = paginas.paginaVitrine({ path: '/imoveis', query: {}, protocol: 'https', get: () => 'l7inteligencia.corretordofuturo.app' }, []);
assert.ok(html.includes('class="v-abrir-foto"'), 'falta a foto no hero');
assert.ok(html.includes('hero-1920.jpg'), html.slice(0, 400));
assert.ok(html.includes('hero-3840.webp'));
assert.ok(html.includes('hero-3840.jpg'));
assert.ok(html.includes('fetchpriority="high"'));
assert.ok(html.includes('rel="preload"'));
assert.ok(html.includes('object-fit:cover') || html.includes('v-abrir-foto'));
assert.ok(!html.includes('[object Object]'));
console.log('ok · hero da L7 aponta para a foto do tema, com preload');

const outro = execFileSync(process.execPath, ['-e', `
process.env.HOUSE_DB = ${JSON.stringify(path.join(require('os').tmpdir(), 'hh-l7-outro.db'))};
process.env.SECRET_KEY = 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO = 'false';
process.env.TEMA = 'lumen';
process.env.CLIENTE_NOME = 'Lumen';
const paginas = require(${JSON.stringify(path.join(raiz, 'src/portal/paginas.js'))});
const html = paginas.paginaVitrine({ path: '/imoveis', query: {}, protocol: 'https', get: () => 'lumen.corretordofuturo.app' }, []);
if (html.includes('v-abrir-foto') || html.includes('hero-3840')) process.exit(2);
`], { cwd: raiz, encoding: 'utf8' });
assert.ok(!outro.includes('hero-3840'));
console.log('ok · os outros temas não recebem a foto da L7');
