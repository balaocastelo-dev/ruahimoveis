// Multi-imobiliária · tabelas mistas (MULTI=1, SQLite): o anúncio, o prédio e o bairro são comuns (as duas veem),
// mas o trabalho de cada imobiliária sobre eles (andamento do anúncio, prédio-alvo, ajustes de bairro) é só dela.
// Também confere que os caches em memória não misturam imobiliárias. As duas entram pelo endereço (host) do pedido.
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-mistas-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.MULTI = '1';
process.env.IMOBILIARIA_HOSTS = 'ruah.teste=ruah,outra.teste=outra';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.MERCADO_CACHE_S = '0';
process.env.BAIRROS = 'false';
process.env.PORTAL = 'false';
delete process.env.DATABASE_URL; delete process.env.IMOBILIARIA_PADRAO; delete process.env.MULTI_ESTRITO;
const assert = require('assert');
const tenant = require('../src/tenant');
const D = require('../src/db-sqlite');
D.criaImobiliaria('outra');
const app = require('../server');
const { one, all, run } = D;
const em = (slug, fn) => tenant.comImobiliaria(slug, fn);

let n = 0;
const ok = (msg) => { n++; console.log('ok ·', msg); };

(async () => {
  const srv = app.listen(0);
  const porta = srv.address().port;
  const cookies = {};
  // pedido HTTP com o host da imobiliária (o middleware escolhe a imobiliária pelo host)
  const req = (host, metodo, url, body) => new Promise((resolve, reject) => {
    const dados = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: porta, path: url, method: metodo,
      headers: { host, 'Content-Type': 'application/json', ...(cookies[host] ? { cookie: cookies[host] } : {}), ...(dados ? { 'Content-Length': Buffer.byteLength(dados) } : {}) } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => {
        const sc = res.headers['set-cookie']; if (sc) cookies[host] = sc[0].split(';')[0];
        let j; try { j = JSON.parse(t); } catch { j = t; }
        resolve({ s: res.statusCode, j });
      });
    });
    r.on('error', reject); if (dados) r.write(dados); r.end();
  });
  const A = 'ruah.teste', B = 'outra.teste';
  const certo = async (host, m, url, body) => { const r = await req(host, m, url, body); if (r.s >= 400) throw new Error(`${host} ${m} ${url} → ${r.s} ${JSON.stringify(r.j)}`); return r.j; };

  // ---------- migração única: o trabalho que estava nas colunas antigas vai só para a imobiliária padrão ----------
  const velho = em('ruah', () => run("INSERT INTO fisguei_anuncios(fisgar_id,titulo,status,pausado,observacoes) VALUES('velho','Anúncio antigo','captado',1,'nota antiga')").lastInsertRowid);
  em('ruah', () => run("DELETE FROM config WHERE chave='plataforma_mistas_v1'"));
  em('outra', () => D.migraMistas());
  em('ruah', () => D.migraMistas());
  em('ruah', () => D.migraMistas()); // segunda vez não duplica nem falha
  assert.deepStrictEqual({ ...em('ruah', () => one('SELECT status, pausado, observacoes FROM anuncio_andamento WHERE anuncio_id=?', velho)) }, { status: 'captado', pausado: 1, observacoes: 'nota antiga' });
  assert.equal(em('outra', () => one('SELECT count(*) n FROM anuncio_andamento').n), 0);
  ok('migração copia o andamento antigo só para a imobiliária padrão (uma vez); a outra começa vazia');

  await certo(A, 'POST', '/api/setup', { nome: 'Adm RUAH', email: 'adm@ruah.com', senha: 'Teste1234' });
  // imobiliária nova: o primeiro acesso não é pela tela (/setup); o cadastro e o 1º adm vêm da plataforma
  const registro = require('../src/plataforma/registro');
  const outra = registro.porSlug('outra') || registro.criar({ slug: 'outra', nome_curto: 'Outra', empresa: 'Outra Imóveis' });
  const admB = em('outra', () => Number(run('INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES(?,?,?,?)', 'Adm Outra', 'adm@outra.com', 'adm', require('../src/auth').hashSenha('Teste1234')).lastInsertRowid));
  registro.indexaLogin(outra.id, admB, 'adm@outra.com');
  await certo(B, 'POST', '/api/login', { email: 'adm@outra.com', senha: 'Teste1234' });
  ok('cada imobiliária com o seu administrador (login pelo host)');

  // ---------- anúncio comum, andamento privado ----------
  const F = require('../src/fisguei/base');
  const an = em('ruah', () => F.salvaAnuncio({ fisgar_id: 'X1', portal: 'OLX', titulo: 'Apto no Cambuí', tipo: 'Apartamento', logradouro: 'Rua Coronel Quirino', numero: '100', bairro: 'Cambuí', cidade: 'Campinas', valor: 1200000, area_util: 100, anunciante_tipo: 'particular' }));
  const an2 = em('outra', () => F.salvaAnuncio({ fisgar_id: 'X2', portal: 'ZAP', titulo: 'Casa no Taquaral', tipo: 'Casa', logradouro: 'Rua X', numero: '7', bairro: 'Taquaral', cidade: 'Campinas', valor: 2000000, area_util: 200, anunciante_tipo: 'imobiliaria' }));
  const fichaA0 = await certo(A, 'GET', `/api/fisguei/${an2}`), fichaB0 = await certo(B, 'GET', `/api/fisguei/${an}`);
  assert.equal(fichaA0.anuncio.titulo, 'Casa no Taquaral'); assert.equal(fichaB0.anuncio.titulo, 'Apto no Cambuí');
  assert.equal(fichaA0.anuncio.status, 'novo'); assert.equal(fichaB0.anuncio.status, 'novo');
  ok('o anúncio comum aparece para as duas, como "novo" (sem andamento)');

  const cap = await certo(A, 'POST', `/api/fisguei/${an}/captar`);
  await certo(A, 'POST', `/api/fisguei/${an}/pausar`, { pausado: true });
  const fA = await certo(A, 'GET', `/api/fisguei/${an}`), fB = await certo(B, 'GET', `/api/fisguei/${an}`);
  assert.equal(fA.anuncio.status, 'captado'); assert.equal(fA.anuncio.pausado, 1); assert.equal(fA.anuncio.oportunidade_id, cap.oportunidade_id); assert.ok(fA.oportunidade);
  assert.equal(fB.anuncio.status, 'novo'); assert.equal(fB.anuncio.pausado, 0); assert.equal(fB.anuncio.oportunidade_id, null); assert.equal(fB.oportunidade, null);
  assert.equal(em('outra', () => one('SELECT count(*) n FROM oportunidades').n), 0);
  ok('captar e pausar na RUAH: status, pausa e oportunidade não aparecem para a outra');

  const imp = await certo(A, 'POST', `/api/fisguei/${an}/importar`);
  assert.ok(imp.codigo);
  assert.equal((await certo(A, 'GET', `/api/fisguei/${an}`)).imovel.codigo, imp.codigo);
  assert.equal((await certo(B, 'GET', `/api/fisguei/${an}`)).imovel, null);
  assert.equal(em('outra', () => one('SELECT count(*) n FROM imoveis').n), 0);
  assert.equal(em('ruah', () => one('SELECT imovel_id FROM fisguei_anuncios WHERE id=?', an).imovel_id), null, 'coluna antiga sem uso');
  ok('levar para a carteira: o imóvel da RUAH não aparece na outra (e a coluna antiga da tabela comum fica vazia)');

  await certo(B, 'POST', `/api/fisguei/${an}/descartar`);
  assert.equal((await certo(B, 'GET', `/api/fisguei/${an}`)).anuncio.status, 'descartado');
  assert.equal((await certo(A, 'GET', `/api/fisguei/${an}`)).anuncio.status, 'captado');
  const listaA = await certo(A, 'GET', '/api/fisguei?filtro=captado'), listaB = await certo(B, 'GET', '/api/fisguei');
  assert.deepStrictEqual(listaA.itens.map((x) => x.id).sort(), [velho, an].sort());
  assert.equal(listaB.contagem.captado, 0); assert.equal(listaB.total, 3);
  const resA = await certo(A, 'GET', '/api/fisguei/resumo'), resB = await certo(B, 'GET', '/api/fisguei/resumo');
  assert.equal(resA.porStatus.captado, 2); assert.equal(resB.porStatus.descartado, 1); assert.ok(!resB.porStatus.captado);
  ok('descartar na outra não muda a RUAH; listas, abas e resumo contam o andamento de cada uma');

  // Fisguei inteligente e vitrines: cada imobiliária com o seu cache (a primeira leitura não serve para a outra)
  const exA = await certo(A, 'GET', '/api/fisguei/explorar?etapa=captado'), exB = await certo(B, 'GET', '/api/fisguei/explorar?etapa=captado');
  assert.deepStrictEqual(exA.itens.map((x) => x.id).sort(), [velho, an].sort()); assert.equal(exB.total, 0);
  const exB2 = await certo(B, 'GET', '/api/fisguei/explorar');
  assert.ok(!exB2.itens.some((x) => x.id === an), 'descartado na outra sai da leitura dela');
  assert.ok((await certo(A, 'GET', '/api/fisguei/explorar')).itens.some((x) => x.id === an));
  const vA = await certo(A, 'GET', '/api/mercado/resumo?cat=apartamentos'), vB = await certo(B, 'GET', '/api/mercado/resumo?cat=apartamentos');
  assert.equal(vA.anuncios, 1); assert.equal(vB.anuncios, 0, 'descartado na outra sai da vitrine dela');
  ok('Fisguei inteligente e vitrines: leitura e cache separados por imobiliária');

  // apagar o anúncio comum nunca leva junto o dado privado
  em('outra', () => run("INSERT INTO fisguei_pessoas(anuncio_id,chave,nome) VALUES(?,'nome:x','Fulano')", an2));
  assert.throws(() => em('outra', () => run('DELETE FROM fisguei_anuncios WHERE id=?', an2)), /FOREIGN KEY/);
  assert.throws(() => em('ruah', () => run('DELETE FROM fisguei_anuncios WHERE id=?', an)), /FOREIGN KEY/);
  assert.equal(em('outra', () => one('SELECT count(*) n FROM fisguei_pessoas').n), 1);
  ok('apagar anúncio comum com pessoa ou andamento privado é recusado (RESTRICT)');

  // ---------- prédio comum, alvo privado ----------
  const cid = em('ruah', () => run("INSERT INTO condominios(nome,cep,numero,bairro,tipo,lat,lon,slug) VALUES('Edifício Comum','13025000','100','Cambuí','vertical',-22.9,-47.06,'edificio-comum')").lastInsertRowid);
  await certo(A, 'PUT', `/api/condominios/${cid}`, { alvo: true });
  const cA = await certo(A, 'GET', '/api/condominios?alvo=1'), cB = await certo(B, 'GET', '/api/condominios?alvo=1');
  assert.deepStrictEqual(cA.itens.map((x) => x.id), [cid]); assert.equal(cB.itens.length, 0);
  assert.equal(cA.resumo.alvos, 1); assert.equal(cB.resumo.alvos, 0);
  assert.equal((await certo(A, 'GET', `/api/condominios/${cid}`)).alvo, 1); assert.equal((await certo(B, 'GET', `/api/condominios/${cid}`)).alvo, 0);
  assert.equal((await certo(B, 'GET', `/api/condominios/${cid}`)).nome, 'Edifício Comum');
  const mapaB = await certo(B, 'GET', '/api/condominios/mapa'); assert.equal(mapaB.find((p) => p[0] === cid)[5], 0);
  await certo(B, 'PUT', `/api/condominios/${cid}`, { andares: 12 });
  assert.equal((await certo(A, 'GET', `/api/condominios/${cid}`)).andares, 12, 'dado do prédio é comum');
  assert.equal(em('ruah', () => one('SELECT alvo FROM condominios WHERE id=?', cid).alvo), 0, 'coluna antiga sem uso');
  // alerta de anúncio novo em prédio-alvo: só para quem marcou
  em('ruah', () => F.salvaAnuncio({ fisgar_id: 'X3', portal: 'OLX', titulo: 'No prédio-alvo', tipo: 'Apartamento', cep: '13025000', logradouro: 'Rua Y', numero: '100', cidade: 'Campinas', valor: 900000, anunciante_tipo: 'particular' }));
  for (const s of ['ruah', 'outra']) em(s, () => require('../src/condominios/base').vincular({}));
  assert.equal((await certo(A, 'GET', '/api/condominios/alertas')).length, 1);
  assert.equal((await certo(B, 'GET', '/api/condominios/alertas')).length, 0);
  ok('prédio-alvo da RUAH (lista, resumo, ficha, mapa e alerta) não aparece para a outra; o prédio é comum');

  // ---------- bairro comum, ajustes privados ----------
  await certo(A, 'GET', '/api/bairros'); // a primeira listagem semeia o catálogo comum
  await certo(A, 'PUT', '/api/bairros/cambui', { prioridade: 3, notas: 'Notas só da RUAH', oculto: true });
  await certo(A, 'POST', '/api/bairros/taquaral/reescrever');
  const bA = (await certo(A, 'GET', '/api/bairros')).bairros.find((b) => b.slug === 'cambui');
  const bB = (await certo(B, 'GET', '/api/bairros')).bairros.find((b) => b.slug === 'cambui');
  assert.equal(bA.prioridade, 3); assert.equal(bA.notas, 'Notas só da RUAH'); assert.equal(bA.oculto, true);
  assert.equal(bB.prioridade, 0); assert.equal(bB.notas, ''); assert.equal(bB.oculto, false);
  assert.equal((await certo(B, 'GET', '/api/bairros')).bairros.filter((b) => b.pedidoEm).length, 0);
  assert.equal((await certo(A, 'GET', '/api/bairros')).bairros.filter((b) => b.pedidoEm).length, 1);
  assert.equal(em('outra', () => one('SELECT count(*) n FROM bairro_ajustes').n), 0);
  // o catálogo é comum: um apelido novo vale para as duas
  await certo(B, 'POST', '/api/bairros/cambui/apelido', { texto: 'Cambuí Velho' });
  assert.ok((await certo(A, 'GET', '/api/bairros')).bairros.find((b) => b.slug === 'cambui').apelidos.includes('Cambuí Velho'));
  assert.equal((await certo(A, 'GET', '/api/bairros')).bairros.find((b) => b.slug === 'cambui').notas, 'Notas só da RUAH', 'apelido da outra não apaga as notas da RUAH');
  ok('ajustes de bairro (prioridade, notas, oculto, reescrita) só na RUAH; o catálogo (apelidos) é comum');

  // ---------- caches de conteúdo: cada imobiliária lê e guarda o seu ----------
  const fetchReal = global.fetch; let pedidos = 0;
  // 404: o blog não grava cópia em disco (o teste não mexe na pasta data/ do PC)
  global.fetch = async (u, o) => (String(u).startsWith('http://blog.teste/') ? (pedidos++, new Response('', { status: 404 })) : fetchReal(u, o));
  process.env.BLOG_DIARIO_URL = 'http://blog.teste';
  const blog = require('../src/blog/diario');
  await em('ruah', () => blog.listar()); await em('ruah', () => blog.listar());
  assert.equal(pedidos, 1, 'segunda leitura da RUAH vem da memória');
  await em('outra', () => blog.listar());
  assert.equal(pedidos, 2, 'a outra não usa a memória da RUAH');
  em('outra', () => blog.limparCache()); await em('ruah', () => blog.listar());
  assert.equal(pedidos, 2, 'limpar o cache da outra não apaga o da RUAH');
  global.fetch = fetchReal;
  const dadosB = require('../src/bairros/dados');
  const l1 = em('ruah', () => dadosB.listar()), l2 = em('outra', () => dadosB.listar());
  assert.notStrictEqual(l1, l2); assert.equal(l1.find((b) => b.slug === 'cambui').prioridade, 3); assert.equal(l2.find((b) => b.slug === 'cambui').prioridade, 0);
  ok('caches em memória (blog, lista de bairros) separados por imobiliária');

  // prévia OG: o arquivo 1 da RUAH e o arquivo 1 da outra são fotos diferentes (cada uma tem a sua tabela arquivos)
  const sharp = require('sharp'), conteudo = require('../src/services/conteudo'), og = require('../src/og');
  const foto = (r, g, b) => sharp({ create: { width: 400, height: 300, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
  const fotos = { ruah: await foto(220, 20, 20), outra: await foto(20, 20, 220) };
  const lerReal = conteudo.ler; conteudo.ler = () => fotos[tenant.atual().slug];
  const resposta = () => { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { this.corpo = b; }, sendStatus(c) { this.status = c; } }; return r; };
  const cor = async (buf) => (await sharp(buf).stats()).dominant;
  const rA = resposta(), rB = resposta();
  await em('ruah', () => og.enviarJpeg(rA, { id: 1, tamanho: 10, mime: 'image/jpeg' }));
  await em('outra', () => og.enviarJpeg(rB, { id: 1, tamanho: 10, mime: 'image/jpeg' }));
  conteudo.ler = lerReal;
  assert.ok((await cor(rA.corpo)).r > 150 && (await cor(rB.corpo)).b > 150, 'cada imobiliária recebe a própria foto');
  ok('prévia OG: mesmo id de arquivo em imobiliárias diferentes não mistura a foto do cache');

  srv.close();
  console.log(`\nTabelas mistas: ${n} verificações, tudo certo.`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
