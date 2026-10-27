// Teste das páginas de bairro: banco temporário com um bairro, um imóvel à venda
// com página no portal, prédios e pontos de interesse; ramos de conteúdo falsos
// num servidor local. Confere a régua, o "no ar", a página pública (dados ao vivo,
// fotos, créditos, JSON-LD), a lista, sitemap/robots/llms, o formulário e a tela.
//   node test/bairros.js
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-bairros-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL;

const cfg = require('../src/config');
const { run, one } = require('../src/db');
const { lerPagina } = require('../src/bairros/validar');
const { avaliarPagina } = require('../src/bairros/regua');
const { chaveBairro } = require('../src/bairros/catalogo');
const dados = require('../src/bairros/dados');

// ---- normalização dos nomes de bairro
assert.strictEqual(chaveBairro('JD. CHAPADAO'), chaveBairro('Jardim Chapadão'));
assert.strictEqual(chaveBairro('Mansões Sto Antônio'), chaveBairro('Mansões Santo Antônio'));
assert.strictEqual(chaveBairro('Jardim Santa Genebra II'), chaveBairro('Jardim Santa Genebra'));
console.log('ok · nomes de bairro com abreviação e grafia diferente se encontram');

// ---- o catálogo entra na tabela; o Cambuí recebe um apelido de teste
assert.ok(dados.listar().length >= 50, 'catálogo semeado');
assert.strictEqual(dados.slugDoTexto('CAMBUI'), 'cambui');
assert.strictEqual(dados.slugDoTexto('Parque Taquaral'), 'taquaral');
console.log('ok · catálogo semeado:', dados.listar().length, 'bairros');

// ---- um imóvel à venda no Cambuí, com 4 fotos (9201..9204), e prédios na base
const PASTA_FOTOS = path.join(cfg.DATA_DIR, 'teste-bairros');
fs.mkdirSync(PASTA_FOTOS, { recursive: true });
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA3/9k=', 'base64');
const imId = Number(run(`INSERT INTO imoveis(codigo,tipo,status,logradouro,numero,bairro,cidade,uf,quartos,suites,vagas,area_util,area_total,valor,descricao)
  VALUES('AP9301','Apartamento','publicado','Rua Secreta','12','CAMBUI','Campinas','SP',3,3,2,240,450,1450000,'Apartamento com varanda.')`).lastInsertRowid);
for (let k = 1; k <= 4; k += 1) {
  fs.writeFileSync(path.join(PASTA_FOTOS, `f${k}.jpg`), jpg);
  run('INSERT INTO arquivos(id,imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?,?)', 9200 + k, imId, 'Fotos', `f${k}.jpg`, 'image/jpeg', jpg.length, `teste-bairros/f${k}.jpg`);
}
for (const [nome, lat, lon, andares, unidades] of [['Edifício Jequitibá', -22.8955, -47.0545, 20, 80], ['Condomínio Ipê Roxo', -22.8960, -47.0538, 14, 56], ['Residencial Paineira', -22.8950, -47.0550, 9, 36]]) {
  run("INSERT INTO condominios(nome,bairro,cidade,tipo,andares,unidades,lat,lon) VALUES(?,?,?,?,?,?,?,?)", nome, 'Cambuí', 'Campinas', 'vertical', andares, unidades, lat, lon);
}
for (const [cat, nome, lat, lon] of [['escolas', 'Escola Estadual Carlos Gomes', -22.8962, -47.0540], ['parques', 'Centro de Convivência Cultural', -22.8970, -47.0530], ['mercados', 'Mercado do Bairro', -22.8952, -47.0552]]) {
  run('INSERT INTO pois(cat,nome,lat,lon) VALUES(?,?,?,?)', cat, nome, lat, lon);
}
// a licença da foto do Commons já conferida (o teste não sai para a internet)
run(`INSERT INTO bairro_commons(titulo,url,thumb,largura,altura,autor,licenca,ok,verificado_em) VALUES(?,?,?,?,?,?,?,1,datetime('now','localtime'))`,
  'File:Centro de Convivencia Campinas.jpg', 'https://upload.wikimedia.org/x.jpg', 'https://upload.wikimedia.org/thumb/x.jpg/1280px-x.jpg', 3000, 2000, 'Fulano de Tal', 'CC BY-SA 4.0');
run(`INSERT INTO bairro_commons(titulo,ok,motivo,licenca,verificado_em) VALUES(?,0,'licença não aceita (CC BY-NC 2.0)','CC BY-NC 2.0',datetime('now','localtime'))`, 'File:Foto proibida.jpg');

// ---- a página do imóvel no portal (para a lista "imóveis da RUAH no bairro")
const paginaImovel = JSON.parse(fs.readFileSync(path.join(__dirname, 'portal-exemplo.json'), 'utf8'));
Object.assign(paginaImovel, { codigo: 'AP9301', slug: 'apartamento-3-quartos-cambui-campinas-ap9301', titulo: 'Apartamento de 3 quartos no Cambuí, em Campinas', capa: { foto: 9201, alt: 'Sala com varanda' },
  galeria: [{ foto: 9201, legenda: 'Sala', ambiente: 'sala' }, { foto: 9202, legenda: 'Fachada do prédio', ambiente: 'fachada' }, { foto: 9203, legenda: 'Cozinha', ambiente: 'cozinha' }, { foto: 9204, legenda: 'Quarto', ambiente: 'quarto' }],
  versao: 'x', publicadoEm: new Date(Date.now() - 86400e3).toISOString() });

// ---- a página do bairro
const P = (n) => `O Cambuí é um bairro de Campinas conhecido pelas ruas arborizadas e pelo comércio de rua. Este é o parágrafo ${n} do texto de teste, com frases simples sobre praças, cafés, prédios residenciais, escolas, feiras e o jeito de morar na região central da cidade, sempre com fatos que uma fonte sustenta.`;
const blocos = [
  { tipo: 'paragrafo', texto: P(1) }, { tipo: 'paragrafo', texto: P(2) },
  { tipo: 'resumo', titulo: 'O Cambuí em poucas linhas', itens: ['Região central de Campinas', 'Ruas arborizadas', 'Comércio de rua', 'Muitos prédios residenciais'] },
  ...['História do Cambuí', 'Como é morar no Cambuí', 'Parques, praças e cultura', 'Comércio, bares e restaurantes', 'Transporte e acesso'].flatMap((t, i) => [
    { tipo: 'titulo', nivel: 2, texto: t }, { tipo: 'paragrafo', texto: P(10 + i) }, { tipo: 'paragrafo', texto: P(20 + i) }, { tipo: 'paragrafo', texto: P(30 + i) },
    ...(i === 1 ? [{ tipo: 'fotos', fotos: ['f2'] }] : []), ...(i === 2 ? [{ tipo: 'fotos', fotos: ['f1', 'f3'] }, { tipo: 'chamada', tema: 'imoveis' }] : []),
  ]),
  { tipo: 'titulo', nivel: 2, texto: 'Para quem o Cambuí faz sentido' }, { tipo: 'paragrafo', texto: P(40) }, { tipo: 'chamada', tema: 'contato' },
];
const modelo = {
  slug: 'cambui', titulo: 'Cambuí, Campinas: como é morar no bairro, prédios e o que tem perto',
  seo: { titulo: 'Cambuí, Campinas: guia completo do bairro' },
  resumo: 'Guia do Cambuí em Campinas: história, praças, comércio, prédios residenciais, escolas e o que tem perto para quem pensa em morar no bairro.',
  capa: { foto: 'f1' },
  fotos: [
    { id: 'f1', commons: 'File:Centro de Convivencia Campinas.jpg', legenda: 'Centro de Convivência Cultural, no Cambuí', alt: 'Praça com teatro de arena e árvores altas' },
    { id: 'f2', imovel_foto: 9202, legenda: 'Prédio com apartamento da RUAH à venda no Cambuí', alt: 'Fachada de prédio residencial de vários andares' },
    { id: 'f3', commons: 'File:Foto proibida.jpg', legenda: 'Rua arborizada do bairro', alt: 'Rua com árvores e prédios dos dois lados' },
  ],
  blocos,
  perguntas: [
    { pergunta: 'O Cambuí fica longe do centro de Campinas?', resposta: 'Não: o bairro faz divisa com o Centro.' },
    { pergunta: 'O Cambuí tem prédios residenciais?', resposta: 'Sim, a maior parte dos imóveis do bairro é apartamento.' },
    { pergunta: 'Tem praça no Cambuí?', resposta: 'Sim, como o Centro de Convivência Cultural.' },
    { pergunta: 'Como falar com a RUAH sobre o Cambuí?', resposta: 'Pelo formulário no fim desta página.' },
  ],
  fontes: [{ nome: 'Prefeitura de Campinas', site: 'https://campinas.sp.gov.br/' }, { nome: 'IBGE, Censo 2022' }],
  redes: { legenda: 'Como é morar no Cambuí, em Campinas? Preparamos um guia completo do bairro, com história, praças, comércio e prédios.', hashtags: ['cambui', 'campinas', 'morarbem', 'ruahimobiliaria'] },
  publicadoEm: new Date(Date.now() - 3600e3).toISOString(),
};

// ---- régua
const lido = lerPagina(modelo);
assert.ok(lido.ok, JSON.stringify(lido.erros));
assert.strictEqual(lido.valor.fontes[0].site, 'campinas.sp.gov.br', 'site da fonte vira só o domínio');
const bairroCambui = () => ({ ...dados.porSlug('cambui'), fotosImoveis: [9201, 9202, 9203, 9204] });
const av = avaliarPagina(lido.valor, bairroCambui(), { modo: 'publicar' });
assert.ok(av.aprovado, av.erros.join('\n'));
console.log('ok · régua aprova o modelo:', av.medidas.palavras, 'palavras,', av.medidas.secoes, 'seções');
const ruim = { ...lido.valor, titulo: 'Guia completo de um bairro qualquer da cidade', blocos: [...lido.valor.blocos, { tipo: 'paragrafo', texto: 'Apartamentos por R$ 900.000, valorização garantida, imperdível. Visitamos o bairro. Ligue (19) 99999-1234 ou veja [aqui](https://exemplo.com).' }],
  fotos: [...lido.valor.fotos, { id: 'f9', imovel_foto: 12345, legenda: 'Foto de outro bairro', alt: 'Foto de um imóvel de outro bairro' }] };
const av2 = avaliarPagina(ruim, bairroCambui(), { modo: 'publicar' });
for (const k of [/nome do bairro/, /reais/, /promessa/, /urgência/, /experiência própria/, /telefone/, /links no texto/, /12345/]) assert.ok(av2.erros.some((e) => k.test(e)), `régua deveria barrar ${k}\n${av2.erros.join('\n')}`);
console.log('ok · régua barra título sem o bairro, preço, promessa, urgência, "visitamos", telefone, link e foto de imóvel de fora');
assert.ok(!lerPagina({ ...modelo, fotos: [{ id: 'f1', commons: 'foto.jpg', legenda: 'x', alt: 'yyyyyyyyyyyyy' }] }).ok, 'arquivo do Commons fora do formato');

// ---- os ramos falsos (portal e bairros)
let pagina = modelo;
const ramo = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const mapa = {
    '/portal/indice.json': { paginas: [{ codigo: 'AP9301', slug: paginaImovel.slug, titulo: paginaImovel.titulo, resumo: paginaImovel.resumo, capa: paginaImovel.capa, versao: 'x', publicadoEm: paginaImovel.publicadoEm }] },
    '/portal/paginas/AP9301.json': paginaImovel,
    '/bairros/indice.json': { paginas: pagina ? [{ slug: 'cambui', titulo: pagina.titulo, resumo: pagina.resumo, publicadoEm: pagina.publicadoEm }] : [] },
    '/bairros/paginas/cambui.json': pagina,
  };
  const corpo = mapa[p];
  if (!corpo) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(corpo));
}).listen(0, async () => {
  const porta = ramo.address().port;
  process.env.PORTAL_CONTEUDO_URL = `http://127.0.0.1:${porta}/portal`;
  process.env.BAIRROS_CONTEUDO_URL = `http://127.0.0.1:${porta}/bairros`;
  const app = require('../server');
  const fonte = require('../src/bairros/fonte');
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p, h = {}) => { const r = await fetch(url + p, { redirect: 'manual', headers: h }); return { s: r.status, t: await r.text(), h: r.headers }; };
  const send = async (m, p, b, h = {}) => { const r = await fetch(url + p, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
  try {
    // ---- a régua do portal aceita a página de imóvel do teste? (pré-condição)
    const portalFonte = require('../src/portal/fonte');
    assert.strictEqual((await portalFonte.noAr()).length, 1, 'página do imóvel no ar no portal');

    // ---- a página do bairro
    let r = await get('/bairros/cambui');
    assert.strictEqual(r.s, 200, r.t.slice(0, 400));
    for (const k of ['Cambuí em números', 'imóvel da RUAH à venda', 'prédios residenciais', '/imoveis/apartamento-3-quartos-cambui-campinas-ap9301', '/imoveis/foto/9202', 'Escola Estadual Carlos Gomes',
      'Edifício Jequitibá', 'Foto: Fulano de Tal · CC BY-SA 4.0 · Wikimedia Commons', '"@type":"FAQPage"', '"@type":"Place"', 'GeoCoordinates', 'Prefeitura de Campinas (campinas.sp.gov.br)', 'data-bairro-contato', '/bairros/cambui/foto/1']) {
      assert.ok(r.t.includes(k), `a página deveria ter: ${k}`);
    }
    assert.ok(!r.t.includes('Foto proibida') && !r.t.includes('/bairros/cambui/foto/3'), 'foto com licença não aceita não aparece');
    assert.ok(!r.t.includes('Rua Secreta'), 'endereço do imóvel não aparece');
    const miolo = r.t.slice(r.t.indexOf('<main id="conteudo">'), r.t.indexOf('</main>'));
    assert.ok(!/href="https?:/.test(miolo), 'o guia não leva para fora do site');
    console.log('ok · página do bairro: texto, números ao vivo, imóvel com foto da fachada, perto, prédios, créditos, JSON-LD, formulário');

    r = await get('/bairros');
    assert.ok(r.s === 200 && r.t.includes('/bairros/cambui') && r.t.includes('1 imóvel à venda'), 'lista dos bairros');
    r = await get('/bairros/parque-taquaral'); assert.strictEqual(r.s, 404, 'bairro sem página: 404');
    r = await get('/bairros/cambuy'); assert.strictEqual(r.s, 404);
    r = await get('/imoveis/apartamento-3-quartos-cambui-campinas-ap9301');
    assert.ok(r.t.includes('href="/bairros/cambui"') && r.t.includes('leia o guia do bairro'), 'imóvel leva ao guia do bairro');
    r = await get('/imoveis?bairro=CAMBUI'); assert.ok(r.t.includes('Guia do Cambuí'), 'vitrine filtrada leva ao guia');
    r = await get('/sitemap.xml'); assert.ok(r.t.includes('/bairros/cambui</loc>') && r.t.includes('/bairros</loc>'), 'sitemap');
    r = await get('/robots.txt'); assert.ok(r.t.includes('Allow: /bairros') && r.t.includes('Disallow: /bairros/dados.json'), 'robots');
    r = await get('/llms.txt'); assert.ok(r.t.includes('/bairros/cambui') && r.t.includes('Guias de bairro'), 'llms.txt');
    console.log('ok · lista, 404, ligação imóvel → bairro, sitemap, robots e llms.txt');

    // ---- dados para quem escreve
    r = await get('/bairros/dados.json');
    const d = JSON.parse(r.t);
    const camb = d.bairros.find((b) => b.slug === 'cambui');
    assert.ok(camb && camb.pagina.estado === 'no-ar' && camb.imoveis_da_ruah[0].fotos.some((f) => f.foto === 9202 && f.ambiente === 'fachada'), 'dados.json do Cambuí');
    assert.ok(camb.condominios.total === 3 && camb.perto && camb.centro, 'dados ao vivo no dados.json');
    assert.notStrictEqual(d.bairros[0].slug, 'cambui', 'bairro no ar vai para o fim da fila');
    console.log('ok · dados.json: fila, fotos de imóveis com ambiente, números ao vivo');

    // ---- formulário
    let c = await send('POST', '/api/publico/bairros/contato', { bairro: 'cambui', motivo: 'vender', nome: 'Maria', telefone: '(19) 98888-7777', aceite: true, mensagem: 'Tenho um apartamento' });
    assert.ok(c.j.ok, JSON.stringify(c.j));
    const lead = one("SELECT * FROM leads WHERE telefone='5519988887777'");
    assert.ok(lead && lead.origem === 'Portal RUAH · bairro' && lead.bairros === 'Cambuí' && lead.temperatura === 'quente', 'lead do bairro');
    c = await send('POST', '/api/publico/bairros/contato', { bairro: 'nao-existe', nome: 'X', telefone: '19988887777', aceite: true });
    assert.strictEqual(c.s, 404);
    console.log('ok · formulário vira lead "Portal RUAH · bairro" com o bairro');

    // ---- a tela do sistema
    run("INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES('Adm','adm@t','adm','x')");
    run("INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES('Cor','cor@t','corretor','x')");
    const A = require('../src/auth');
    const ck = (email) => `${A.COOKIE}=${A.criarSessao(one('SELECT id FROM usuarios WHERE email=?', email).id)}`;
    const adm = { Cookie: ck('adm@t'), Origin: url }, cor = { Cookie: ck('cor@t'), Origin: url };
    r = await get('/api/bairros', adm);
    const tela = JSON.parse(r.t);
    assert.ok(tela.bairros.find((b) => b.slug === 'cambui').estado === 'no-ar' && tela.podeEditar, 'tela lista os bairros');
    assert.strictEqual((await send('PUT', '/api/bairros/cambui', { prioridade: 3 }, cor)).s, 403, 'corretor não edita');
    c = await send('PUT', '/api/bairros/cambui', { notas: 'Falar da feira de domingo', prioridade: 3, lat: '-22,8955', lon: '-47.0545' }, adm);
    assert.ok(c.j.ok);
    assert.ok(one("SELECT * FROM bairros WHERE slug='cambui'").lat === -22.8955, 'coordenada com vírgula');
    c = await send('POST', '/api/bairros', { nome: 'Jardim Planalto', regiao: 'Norte' }, adm); assert.ok(c.j.ok);
    c = await send('POST', '/api/bairros', { nome: 'Parque Taquaral' }, adm); assert.strictEqual(c.s, 409, 'apelido existente não vira bairro novo');
    c = await send('POST', '/api/bairros/jardim-planalto/apelido', { texto: 'Jd. Planalto de Campinas' }, adm); assert.ok(c.j.ok);
    assert.strictEqual(require('../src/bairros/dados').slugDoTexto('Jardim Planalto de Campinas'), 'jardim-planalto');
    c = await send('POST', '/api/bairros/cambui/reescrever', {}, adm); assert.ok(c.j.ok);
    fonte.recalcular();
    assert.strictEqual((await fonte.situacao()).find((x) => x.slug === 'cambui').estado, 'pedida', 'reescrita pedida');
    r = await get('/bairros/dados.json');
    assert.strictEqual(JSON.parse(r.t).bairros[0].slug, 'cambui', 'reescrita pedida vai para o começo da fila');
    assert.strictEqual(JSON.parse(r.t).bairros[0].notas_da_ruah, 'Falar da feira de domingo');
    c = await send('PUT', '/api/bairros/cambui', { oculto: true }, adm); assert.ok(c.j.ok);
    r = await get('/bairros/cambui'); assert.strictEqual(r.s, 404, 'bairro oculto sai do ar');
    r = await get('/bairros'); assert.ok(!r.t.includes('/bairros/cambui'), 'bairro oculto sai da lista');
    console.log('ok · tela: editar, prioridade, notas, adicionar, apelido, pedir reescrita, ocultar; corretor não edita');

    // ---- página que deixa de passar na régua sai do ar
    await send('PUT', '/api/bairros/cambui', { oculto: false }, adm);
    pagina = { ...modelo, titulo: 'Guia de um bairro de Campinas sem o nome dele' };
    fonte.limparCache();
    r = await get('/bairros/cambui'); assert.strictEqual(r.s, 404, 'reprovada sai do ar');
    assert.strictEqual((await fonte.situacao()).find((x) => x.slug === 'cambui').estado, 'reprovada');
    console.log('ok · página reprovada na régua sai do ar e volta para a fila');
    console.log('\nTudo certo.');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { srv.close(); ramo.close(); setTimeout(() => process.exit(), 100); }
});
