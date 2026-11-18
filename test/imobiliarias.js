// Cinco imobiliárias no ar, Cadê meu AP? só com apartamento, L7 única.
//   node test/imobiliarias.js
const os = require('os'), path = require('path'), fs = require('fs');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-imob-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO = 'false';
delete process.env.DATABASE_URL;
process.env.TEMA = 'cademeuap';
process.env.CLIENTE_NOME = 'Cadê meu AP ?';
process.env.EMPRESA = 'imobiliária inteligência';
process.env.BLOG_LEGENDA = 'Casa, bairro e jeito de morar, pela imobiliária inteligência';
process.env.BLOG_NOME = 'Cadê meu AP ? Blog';

const { CINCO, RETIRADAS, slugPermitido, porSlug } = require('../src/imobiliarias');
const pub = require('../src/catalogo-publico');
const { run } = require('../src/db');
const dados = require('../src/portal/dados');

assert.deepEqual(CINCO.map((i) => i.slug), ['ondemorar', 'cademeuap', 'casaprado', 'lumen', 'l7inteligencia']);
assert.equal(porSlug('cademeuap').somenteApartamentos, true);
assert.equal(porSlug('l7inteligencia').nome, 'L7 Inteligência Imobiliária');
const slugAntigo = ['ru', 'ah'].join('');
for (const s of [slugAntigo, 'base', 'plataforma', ...RETIRADAS, 'l7outra']) assert.equal(slugPermitido(s), false, s);
for (const im of CINCO) assert.equal(slugPermitido(im.slug), true, im.slug);
console.log('ok · cinco cadastros; slug reservado e as outras L7 não entram');

const raiz = path.join(__dirname, '..', 'public', 'temas');
for (const im of CINCO) {
  for (const arq of ['tema.css', 'logo.svg', 'icone.svg']) {
    assert.ok(fs.existsSync(path.join(raiz, im.tema, arq)), `${im.tema}/${arq}`);
  }
}
for (const arq of ['logo.png', 'logo-claro.png', 'logo-claro.svg', 'icone.png']) {
  assert.ok(fs.existsSync(path.join(raiz, 'l7inteligencia', arq)), arq);
}
const logoSvg = fs.readFileSync(path.join(raiz, 'l7inteligencia', 'logo.svg'), 'utf8');
const iconeSvg = fs.readFileSync(path.join(raiz, 'l7inteligencia', 'icone.svg'), 'utf8');
assert.ok(logoSvg.includes('data:image/png;base64,'), 'o logo precisa trazer o PNG dentro do SVG');
assert.ok(iconeSvg.includes('data:image/png;base64,'), 'o ícone precisa trazer o PNG dentro do SVG');
assert.ok(!/href="logo\.png"/.test(logoSvg) && !/href="icone\.png"/.test(iconeSvg), 'SVG com arquivo externo some dentro de <img>');
for (const s of RETIRADAS) assert.equal(fs.existsSync(path.join(raiz, s)), false, s);
console.log('ok · temas das cinco existem; as outras L7 saíram; a L7 tem logo claro e ícone');

assert.equal(pub.somenteApartamentos(), true);
assert.equal(pub.aceitaTipo('Apartamento'), true);
assert.equal(pub.aceitaTipo('Cobertura'), true);
assert.equal(pub.aceitaTipo('Casa'), false);
assert.equal(pub.aceitaTipo('Casa em condomínio'), false);
assert.equal(pub.aceitaTipo('Terreno'), false);
assert.equal(pub.aceitaTipo('Sala comercial'), false);
assert.equal(pub.clienteVisivel(), 'Cadê meu AP?');
assert.equal(pub.empresaVisivel(), 'Cadê meu AP?');
const legenda = pub.legendaDoBlog();
assert.ok(legenda.includes('Cadê meu AP?'), legenda);
assert.ok(!/intelig[eê]ncia/i.test(legenda), legenda);
const paginas = require('../src/portal/paginas');
const vitrine = paginas.paginaVitrine({ path: '/imoveis', query: {}, protocol: 'https', get: () => 'cademeuap.corretordofuturo.app' }, []);
assert.ok(vitrine.includes('Cadê meu AP?'), 'rodapé sem a marca');
assert.ok(!/intelig[eê]ncia/i.test(vitrine), 'rodapé ainda com a empresa errada');
console.log('ok · legenda do blog e o rodapé do portal citam a marca, não "imobiliária inteligência"');

const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA3/9k=', 'base64');
function publica(codigo, tipo) {
  const id = Number(run(`INSERT INTO imoveis(codigo,tipo,status,bairro,cidade,uf,quartos,valor,descricao)
    VALUES(?,?, 'publicado', 'Cambuí', 'Campinas', 'SP', 2, 500000, 'Imóvel de teste.')`, codigo, tipo).lastInsertRowid);
  run('INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?)', id, 'Fotos', 'f.jpg', 'image/jpeg', jpg.length, 'nao-existe.jpg');
  return id;
}
publica('AP9101', 'Apartamento');
publica('CA9102', 'Casa');
publica('CC9103', 'Casa em condomínio');
publica('TE9104', 'Terreno');
publica('SL9105', 'Sala comercial');
publica('CB9106', 'Cobertura');

let codigos = dados.imoveisAVenda().map((i) => i.codigo).sort();
assert.deepEqual(codigos, ['AP9101', 'CB9106']);
assert.equal(dados.imovelAVenda('CA9102'), null);
assert.ok(dados.imovelAVenda('AP9101'));
console.log('ok · vitrine do Cadê meu AP? só tem apartamento e cobertura');

process.env.TEMA = 'lumen';
process.env.CLIENTE_NOME = 'Lumen';
process.env.EMPRESA = 'Lumen Negócios Imobiliários';
delete process.env.PORTAL_SOMENTE;
delete process.env.BLOG_LEGENDA;
assert.equal(pub.somenteApartamentos(), false);
codigos = dados.imoveisAVenda().map((i) => i.codigo).sort();
assert.deepEqual(codigos, ['AP9101', 'CA9102', 'CB9106', 'CC9103', 'SL9105', 'TE9104']);
assert.ok(pub.legendaDoBlog().includes('Lumen'), pub.legendaDoBlog());
console.log('ok · as outras casas continuam mostrando casa, terreno e sala');

process.env.TEMA = 'cademeuap';
process.env.CLIENTE_NOME = 'Cadê meu AP?';
const app = require('../server');
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
(async () => {
  try {
    const vit = await fetch(base + '/imoveis');
    const html = await vit.text();
    assert.equal(vit.status, 200, html.slice(0, 200));
    assert.ok(html.includes('Apartamento'));
    assert.ok(!html.includes('Casa em condomínio'), 'casa no portal');
    assert.ok(!html.includes('Sala comercial'), 'sala no portal');
    assert.ok(!html.includes('>Terreno<') && !html.includes('Terreno ·'), 'terreno no portal');
    assert.ok(html.includes('Cadê meu AP?'));
    assert.ok(!/imobili[aá]ria intelig[eê]ncia/i.test(html), 'empresa errada no rodapé do portal');
    assert.ok(html.includes('/temas/cademeuap/'));
    const dadosJson = await (await fetch(base + '/imoveis/dados.json')).json();
    assert.deepEqual(dadosJson.imoveis.map((i) => i.codigo).sort(), ['AP9101', 'CB9106']);
    const oc = await fetch(base + '/oportunidades');
    assert.equal(oc.status, 200);
    const blog = await fetch(base + '/blog');
    const blogHtml = await blog.text();
    assert.equal(blog.status, 200, blogHtml.slice(0, 180));
    assert.ok(blogHtml.includes('Cadê meu AP?'));
    assert.ok(!/imobili[aá]ria intelig[eê]ncia/i.test(blogHtml), 'subtítulo antigo ainda no blog');
    console.log('ok · /imoveis, /imoveis/dados.json, /oportunidades e /blog respondem com a marca certa');
  } finally { srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
