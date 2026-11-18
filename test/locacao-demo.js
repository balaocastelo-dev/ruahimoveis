// Locação de demonstração (origem radar-demo): preço de aluguel na vitrine,
// selo, noindex, e fora de sitemap, llms.txt, Signature e fotos de bairro.
// origem_ref nunca sai no HTML nem em /imoveis/dados.json.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-locacao-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO = 'false';
process.env.PORTAL_CONTEUDO_URL = 'http://127.0.0.1:9';
process.env.BAIRROS = 'false';
delete process.env.DATABASE_URL;
delete process.env.TEMA;
delete process.env.PORTAL;
delete process.env.PORTAL_DEMONSTRACAO;
delete process.env.PORTAL_SOMENTE;

const SEGREDO = 'SEGREDO-RADAR-99';
const OUTRO = 'OUTRA-REF-88';

const { run, one } = require('../src/db');
const carteira = require('../src/services/carteira');
const bairros = require('../src/bairros/dados');
const fonte = require('../src/portal/fonte');

run('ALTER TABLE imoveis ADD COLUMN origem TEXT');
run('ALTER TABLE imoveis ADD COLUMN origem_ref TEXT');

const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA3/9k=', 'base64');
run("INSERT INTO condominios(nome, slug, bairro, cidade, uf, lat, lon) VALUES('Residencial Aurora Demo', 'residencial-aurora-demo', 'Cambuí', 'Campinas', 'SP', -22.9, -47.06)");
const condo = one("SELECT id FROM condominios WHERE slug='residencial-aurora-demo'").id;

function publicar(codigo, extra) {
  run(`INSERT INTO imoveis(codigo, tipo, status, bairro, cidade, uf, quartos, descricao, finalidade, valor, valor_locacao, origem, origem_ref, condominio_id)
    VALUES(?, 'Apartamento', 'publicado', 'Cambuí', 'Campinas', 'SP', 2, 'Apto.', ?, ?, ?, ?, ?, ?)`,
  codigo, extra.finalidade, extra.valor, extra.aluguel, extra.origem, extra.ref, extra.condo || null);
  const id = one('SELECT id FROM imoveis WHERE codigo=?', codigo).id;
  const arq = path.join(tmp, `${codigo}.jpg`);
  fs.writeFileSync(arq, jpg);
  run("INSERT INTO arquivos(imovel_id, categoria, nome, mime, tamanho, caminho_local) VALUES(?, 'Fotos', 'f.jpg', 'image/jpeg', ?, ?)", id, jpg.length, arq);
}

publicar('AP9301', { finalidade: 'locacao', valor: null, aluguel: 2500, origem: 'radar-demo', ref: SEGREDO, condo });
publicar('AP9302', { finalidade: 'locacao', valor: null, aluguel: 4500, origem: 'radar-demo', ref: OUTRO });
publicar('AP9303', { finalidade: 'venda', valor: 800000, aluguel: null, origem: null, ref: null });
publicar('CS9304', { finalidade: 'venda', valor: 12000000, aluguel: null, origem: 'cadastro', ref: null });
run("UPDATE imoveis SET tipo='Casa' WHERE codigo='CS9304'");
publicar('AP9305', { finalidade: 'venda', valor: 15000000, aluguel: null, origem: 'radar-demo', ref: 'REF-SIGNATURE-OCULTA' });

assert.ok(carteira.ORIGENS.some(([k, n]) => k === 'radar-demo' && n === 'Demonstração'));
console.log('ok · carteira oferece o filtro Demonstração');

const app = require('../server');
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;

function semSegredo(nome, texto) {
  assert.ok(!texto.includes(SEGREDO), `${nome} vazou ${SEGREDO}`);
  assert.ok(!texto.includes(OUTRO), `${nome} vazou ${OUTRO}`);
  assert.ok(!texto.includes('REF-SIGNATURE-OCULTA'), `${nome} vazou a referência da Signature`);
  assert.ok(!/origem_ref/.test(texto), `${nome} cita origem_ref`);
}

(async () => {
  try {
    const loc = await (await fetch(`${base}/imoveis?negocio=locacao`)).text();
    assert.ok(loc.includes('AP9301') && loc.includes('AP9302'), 'os dois aluguéis entram na vitrine');
    assert.ok(!loc.includes('AP9303'), 'venda não entra em negocio=locacao');
    assert.ok(loc.includes('Aluguel') && loc.includes('R$ 2.500/mês') && loc.includes('R$ 4.500/mês'), loc.slice(0, 400));
    assert.ok(loc.includes('Demonstração'));
    assert.ok(!loc.includes('Valor sob consulta'));
    assert.ok(loc.includes('value="2500"') && loc.includes('value="1500"'));
    assert.ok(!loc.includes('value="500000"'));
    assert.ok(loc.indexOf('AP9301') < loc.indexOf('AP9302'), 'menor-valor usa valor_locacao');
    semSegredo('vitrine locacao', loc);

    const ate = await (await fetch(`${base}/imoveis?negocio=locacao&ate=3000`)).text();
    assert.ok(ate.includes('AP9301') && !ate.includes('AP9302'), 'ate filtra pelo aluguel');
    const de = await (await fetch(`${base}/imoveis?negocio=locacao&de=4000`)).text();
    assert.ok(de.includes('AP9302') && !de.includes('AP9301'), 'de filtra pelo aluguel');
    const maior = await (await fetch(`${base}/imoveis?negocio=locacao&ordem=maior-valor`)).text();
    assert.ok(maior.indexOf('AP9302') < maior.indexOf('AP9301'), 'maior-valor usa valor_locacao');

    const venda = await (await fetch(`${base}/imoveis`)).text();
    assert.ok(venda.includes('AP9303') && !venda.includes('AP9301'));
    assert.ok(venda.includes('value="500000"'));
    semSegredo('vitrine venda', venda);

    const href = loc.match(/data-codigo="AP9301"[\s\S]*?href="\/imoveis\/([^"]+)"/);
    assert.ok(href, 'slug do AP9301');
    const pag = await (await fetch(`${base}/imoveis/${href[1]}`)).text();
    assert.ok(pag.includes('name="robots" content="noindex"'), 'demonstração é noindex mesmo fora de PORTAL_DEMONSTRACAO');
    assert.ok(pag.includes('Aluguel') && pag.includes('R$ 2.500/mês'));
    assert.ok(pag.includes('para alugar'));
    assert.ok(pag.includes('Demonstração'));
    assert.ok(pag.includes('LeaseOut'));
    assert.ok(!pag.includes('#Sell'));
    assert.ok(!pag.includes('Valor de venda'));
    semSegredo('página do imóvel', pag);

    const slugVenda = venda.match(/data-codigo="AP9303"[\s\S]*?href="\/imoveis\/([^"]+)"/);
    const pagVenda = await (await fetch(`${base}/imoveis/${slugVenda[1]}`)).text();
    assert.ok(!pagVenda.includes('name="robots" content="noindex"'), 'venda comum continua indexável');
    assert.ok(pagVenda.includes('Valor de venda'));
    assert.ok(pagVenda.includes('#Sell'));

    const json = await (await fetch(`${base}/imoveis/dados.json`)).json();
    const cru = JSON.stringify(json);
    semSegredo('dados.json', cru);
    for (const im of json.imoveis) {
      assert.ok(!Object.prototype.hasOwnProperty.call(im, 'origem_ref'));
      assert.ok(!Object.prototype.hasOwnProperty.call(im, 'origem'));
    }
    assert.ok(json.imoveis.some((i) => i.codigo === 'AP9301'));

    const site = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.ok(!site.includes(href[1]), 'sitemap não lista a demonstração');
    assert.ok(site.includes(slugVenda[1]), 'sitemap continua com a venda');
    semSegredo('sitemap', site);
    const llms = await (await fetch(`${base}/llms.txt`)).text();
    assert.ok(!llms.includes(href[1]) && llms.includes(slugVenda[1]));
    semSegredo('llms.txt', llms);

    const sig = await (await fetch(`${base}/imoveis/signature`)).text();
    assert.ok(sig.includes('/imoveis/signature/cs9304'), 'a venda acima do limite continua na Signature');
    assert.ok(!sig.includes('signature/ap9305') && !sig.includes('signature/ap9301') && !sig.includes('AP9301'));
    semSegredo('signature', sig);

    const condoHtml = await (await fetch(`${base}/condominios/residencial-aurora-demo`)).text();
    assert.equal((await fetch(`${base}/condominios/residencial-aurora-demo`)).status, 200);
    assert.ok(!condoHtml.includes('AP9301'), 'foto/cartão do condomínio não mostra a demonstração');
    semSegredo('condomínio', condoHtml);

    const noAr = await fonte.noAr();
    const por = bairros.imoveisPorBairro(noAr).get('cambui') || [];
    const codigos = por.map((x) => x.imovel.codigo);
    assert.ok(codigos.includes('AP9303'));
    assert.ok(!codigos.includes('AP9301') && !codigos.includes('AP9302'));
    const fotos = bairros.fotosDeImoveis('cambui', noAr.map((x) => x.imovel), noAr).map((x) => x.codigo);
    assert.ok(fotos.includes('AP9303') && !fotos.includes('AP9301'));
    console.log('ok · aluguel na tela, noindex, fora de sitemap/llms/Signature/bairro/condomínio, origem_ref oculto');
  } finally {
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
