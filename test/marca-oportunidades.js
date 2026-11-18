// Identidade do tenant Oportunidades Caixa: logo em paths, aviso no rodapé
// e na ficha, selo de texto nos cards. Outro tema não herda nada disso.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const sharp = require('sharp');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-marca-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO = 'false';
process.env.TEMA = 'oportunidades';
process.env.CLIENTE_NOME = 'Oportunidades Caixa';
process.env.EMPRESA = 'Oportunidades Caixa';
delete process.env.DATABASE_URL;

const AVISO = 'Oportunidades Caixa é uma assessoria imobiliária independente e não é a Caixa Econômica Federal nem tem vínculo com ela. Os imóveis são da Caixa e as informações vêm da lista pública do site venda-imoveis.caixa.gov.br; confirme condições e valores no edital oficial.';
const pasta = path.join(__dirname, '..', 'public', 'temas', 'oportunidades');

const logo = fs.readFileSync(path.join(pasta, 'logo.svg'), 'utf8');
assert.ok(!/<text[\s>]/.test(logo), 'o logo não pode depender de fonte');
assert.ok(!/font-family|@font-face/.test(logo));
assert.ok(logo.includes('#005CA9'));
assert.equal((logo.match(/#F39200/g) || []).length, 1);
assert.ok(logo.includes('aria-label="Oportunidades Caixa"'));
assert.ok(fs.readFileSync(path.join(pasta, 'icone.svg'), 'utf8').includes('#F39200'));

(async () => {
const og = await sharp(path.join(pasta, 'og.png')).metadata();
assert.equal(og.width, 1200);
assert.equal(og.height, 630);
console.log('ok · logo em paths, telhado laranja único, og 1200×630');

const paginas = require('../src/portal/paginas');
const caixa = require('../src/portal/caixa');
const req = { path: '/imoveis', query: {}, protocol: 'https', get: () => 'oportunidades.corretordofuturo.app', hostname: 'localhost' };
const home = paginas.casca(req, { titulo: 'Home', descricao: 'Lista', caminho: '/imoveis', corpo: '<p>lista</p>' });
assert.ok(home.includes(AVISO), 'rodapé sem o aviso');
assert.ok(home.includes('/temas/oportunidades/logo.svg'));
assert.ok(home.includes('/temas/oportunidades/og.png'));
assert.ok(home.includes('content="1200"'));

const ficha = paginas.paginaImovel(req, {
  imovel: {
    id: 1, codigo: 'CX0002', tipo: 'Apartamento', bairro: 'Cambui', cidade: 'Campinas', uf: 'SP',
    origem: 'caixa', valor: 48758, quartos: 2, vagas: 1, area_util: 42, fotos: [7],
    descricao: 'Imóvel retomado pela Caixa.', finalidade: 'venda',
  },
  pagina: {
    slug: 'apartamento-cambui-cx0002', titulo: 'Apartamento com 2 quartos no Cambui',
    resumo: 'Apartamento à venda em Cambui.', capa: { foto: 7, alt: 'Apartamento' },
    blocos: [{ tipo: 'paragrafo', texto: 'Apartamento à venda em Cambui, com dois quartos e uma vaga.' }],
    galeria: [{ foto: 7, legenda: 'Apartamento', ambiente: 'outro' }],
  },
}, []);
assert.ok(ficha.includes(AVISO));
assert.ok(ficha.includes('oc-aviso-imovel'));
assert.ok(ficha.includes('/temas/oportunidades/logo.svg'));
console.log('ok · home e ficha trazem o logo e o aviso de independência');

const daCaixa = paginas.cartao({
  imovel: { codigo: 'CX0002', tipo: 'Apartamento', bairro: 'Cambui', cidade: 'Campinas', uf: 'SP', origem: 'caixa', valor: 48758, quartos: 2, fotos: [7] },
  pagina: { slug: 'ap', titulo: 'Apartamento', resumo: 'r', capa: { foto: 7, alt: 'a' } },
});
assert.ok(daCaixa.includes('Imóvel da Caixa'));
assert.ok(!daCaixa.includes('caixa.gov.br/logo') && !/x-caixa|logo-caixa/i.test(daCaixa));
const proprio = paginas.cartao({
  imovel: { codigo: 'AP0001', tipo: 'Apartamento', bairro: 'Cambui', cidade: 'Campinas', uf: 'SP', origem: 'captacao', valor: 100, quartos: 1, fotos: [1] },
  pagina: { slug: 'outro', titulo: 'Outro', resumo: 'r', capa: { foto: 1, alt: 'a' } },
});
assert.ok(!proprio.includes('Imóvel da Caixa'));
const oc = caixa.cartao({ numero: '8444431067520', tipo: 'Apartamento', cidade: 'Campinas', bairro: 'Cambui', preco: 43534, avaliacao: 90100, desconto: 51, financiamento: 'Sim', quartos: 2, vagas: 1, area_util: 42 });
assert.ok(oc.includes('Imóvel da Caixa'));
console.log('ok · selo de texto só no imóvel da Caixa, sem o símbolo da Caixa');

process.env.TEMA = 'lumen';
delete require.cache[require.resolve('../src/config')];
delete require.cache[require.resolve('../src/portal/marca-oportunidades')];
delete require.cache[require.resolve('../src/portal/paginas')];
const outras = require('../src/portal/paginas');
const lumen = outras.casca(req, { titulo: 'Lumen', descricao: 'd', caminho: '/imoveis', corpo: '<p>x</p>' });
assert.ok(!lumen.includes(AVISO));
assert.ok(!lumen.includes('oc-aviso'));
console.log('ok · outro tema não mostra o aviso da Oportunidades Caixa');
})().catch((e) => { console.error(e); process.exit(1); });
