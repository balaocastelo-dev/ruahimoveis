// Multi-imobiliária · autenticação e configuração por imobiliária (SQLite, MULTI=1): duas imobiliárias com domínios
// próprios no mesmo servidor, login pela entrada da plataforma, sessão presa à imobiliária, índice de login,
// imobiliária suspensa/cancelada, gestor da plataforma com "entrar como" e o nome certo nas páginas de cada uma.
//   node test/autenticacao-multi.js
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-auth-multi-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.MULTI = '1';
delete process.env.MULTI_ESTRITO;
delete process.env.IMOBILIARIA_PADRAO;
delete process.env.IMOBILIARIA_HOSTS;
delete process.env.DATABASE_URL;
delete process.env.PUBLIC_URL;
delete process.env.BLOG_URL;
delete process.env.PORTAL_URL;
process.env.PLATAFORMA_APP_HOSTS = 'app.corretordofuturo.app';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.CLIENTE_NOME = 'RUAH';
process.env.EMPRESA = 'RUAH Investimentos Imobiliários';
delete process.env.BLOG_NOME;
delete process.env.BLOG_LEGENDA;
// sem rede: portal, blog e bairros sem o ramo do GitHub (as páginas saem vazias, mas com a marca)
process.env.PORTAL = 'false';
process.env.BLOG_DIARIO = 'false';
process.env.BAIRROS = 'false';

const app = require('../server');
const D = require('../src/db');
const tenant = require('../src/tenant');
const registro = require('../src/plataforma/registro');

const RUAH = 'ruah.teste.local', PRADO = 'casaprado.teste.local', APP = 'app.corretordofuturo.app';
let n = 0;
const ok = (msg) => { n++; console.log('ok ·', msg); };

(async () => {
  const srv = app.listen(0);
  const porta = srv.address().port;
  // pedido HTTP com o Host escolhido (o fetch não deixa trocar o Host)
  const req = (host, metodo, url, { corpo, cookie } = {}) => new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const h = { Host: host };
    if (dados) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(dados); }
    if (cookie) h.Cookie = cookie;
    const r = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: url, headers: h }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { t += c; });
      res.on('end', () => {
        let j; try { j = JSON.parse(t); } catch { j = null; }
        const sc = res.headers['set-cookie'];
        resolve({ s: res.statusCode, t, j, cookie: sc ? sc[0].split(';')[0] : null });
      });
    });
    r.on('error', reject);
    if (dados) r.write(dados);
    r.end();
  });
  const get = (host, url, cookie) => req(host, 'GET', url, { cookie });
  const post = (host, url, corpo, cookie) => req(host, 'POST', url, { corpo, cookie });
  const patch = (host, url, corpo, cookie) => req(host, 'PATCH', url, { corpo, cookie });
  const login = async (host, email, senha) => post(host, '/api/login', { email, senha });

  try {
    // ---- cadastro: a padrão nasce do .env; a segunda é criada com domínio próprio
    const ruah = registro.padrao();
    assert.equal(ruah.slug, 'ruah'); assert.equal(ruah.nome_curto, 'RUAH'); assert.equal(ruah.empresa, 'RUAH Investimentos Imobiliários');
    assert.equal(ruah.status, 'ativa'); assert.equal(ruah.pais, 'BR'); assert.equal(ruah.moeda, 'BRL'); assert.equal(ruah.idioma, 'pt-BR');
    ok('imobiliária padrão semeada com os dados do .env (pais/moeda/idioma padrão)');
    registro.adicionarDominio(ruah.id, RUAH, true);
    const prado = registro.criar({ slug: 'casaprado', nome_curto: 'Casa Prado', empresa: 'Casa Prado Imóveis', cidade: 'Valinhos', uf: 'SP',
      blog_nome: 'Varanda', blog_legenda: 'Casas e jardins, pela Casa Prado', site: 'https://casaprado.exemplo', hosts: [PRADO] });
    D.criaImobiliaria('casaprado');
    assert.equal(registro.slugDoHost(PRADO), 'casaprado'); assert.equal(registro.slugDoHost(RUAH), 'ruah');
    assert.equal(tenant.resolveHost(`${PRADO}:8080`).slug, 'casaprado'); assert.ok(tenant.resolveHost(APP).plataforma);
    ok('domínios no cadastro: cada host cai na sua imobiliária; app.corretordofuturo.app é a entrada da plataforma');

    // ---- primeiro acesso: só a padrão; as outras recebem o adm pelo gestor
    const st = await post(RUAH, '/api/setup', { nome: 'Adm RUAH', email: 'adm@ruah.com', senha: 'Teste1234' });
    assert.equal(st.s, 200, st.t);
    const ckRuahHost = st.cookie;
    assert.equal(registro.loginPorEmail('ADM@RUAH.COM').imobiliaria_id, ruah.id);
    assert.equal((await post(PRADO, '/api/setup', { nome: 'X', email: 'x@prado.com', senha: 'Teste1234' })).s, 409);
    ok('/setup cria o adm da imobiliária padrão (e o índice de login); na outra é recusado');

    // ---- gestor da plataforma: login próprio, entrar-como e auditoria
    registro.criarGestor('Gestor Plataforma', 'gestor@plataforma.app', 'Gestor1234');
    assert.equal((await post(APP, '/api/plataforma/login', { email: 'gestor@plataforma.app', senha: 'errada1234' })).s, 401);
    const lg = await post(APP, '/api/plataforma/login', { email: 'gestor@plataforma.app', senha: 'Gestor1234' });
    assert.equal(lg.s, 200, lg.t);
    const ckGestor = lg.cookie;
    assert.equal((await get(APP, '/api/me', ckGestor)).s, 403, 'gestor sem imobiliária escolhida não usa o sistema');
    assert.equal((await post(APP, '/api/plataforma/entrar-como', { slug: 'naoexiste' }, ckGestor)).s, 404);
    const ec = await post(APP, '/api/plataforma/entrar-como', { slug: 'casaprado' }, ckGestor);
    assert.equal(ec.s, 200, ec.t);
    const aud = D.all('SELECT * FROM auditoria_plataforma WHERE acao=?', 'entrar_como');
    assert.equal(aud.length, 1); assert.equal(aud[0].imobiliaria_id, prado.id); assert.ok(/casaprado/.test(aud[0].detalhe));
    const meG = await get(PRADO, '/api/me', ckGestor);
    assert.equal(meG.j.perfil, 'plataforma'); assert.equal(meG.j.imobiliaria, 'casaprado');
    ok('gestor entra na plataforma, entra como casaprado e o registro aparece em auditoria_plataforma');
    // perfil 'plataforma' passa em exigePerfil('adm'): cria o adm e um corretor da Casa Prado
    const novoAdm = await post(PRADO, '/api/usuarios', { nome: 'Adm Prado', email: 'adm@prado.com', perfil: 'adm', senha: 'Prado1234' }, ckGestor);
    assert.equal(novoAdm.s, 200, novoAdm.t);
    const corr = await post(PRADO, '/api/usuarios', { nome: 'Corretora Prado', email: 'corretora@prado.com', perfil: 'corretor', senha: 'Prado1234' }, ckGestor);
    assert.equal(corr.s, 200, corr.t);
    assert.equal((await get(PRADO, '/api/auditoria', ckGestor)).s, 200);
    assert.equal(registro.loginPorEmail('corretora@prado.com').imobiliaria_id, prado.id);
    ok("perfil 'plataforma' passa em exigePerfil (cria usuários e lê a auditoria da imobiliária); usuários entram no login_indice");
    // mesmo e-mail não entra em duas imobiliárias (o login pela plataforma não saberia qual)
    assert.equal((await post(PRADO, '/api/usuarios', { nome: 'Dup', email: 'adm@ruah.com', perfil: 'corretor', senha: 'Prado1234' }, ckGestor)).s, 409);
    ok('e-mail já usado em outra imobiliária é recusado');

    // ---- login pela entrada da plataforma: o e-mail leva à imobiliária certa
    const lp = await login(APP, 'adm@prado.com', 'Prado1234');
    assert.equal(lp.s, 200, lp.t); assert.equal(lp.j.imobiliaria, 'casaprado');
    const ckPrado = lp.cookie;
    const meP = await get(APP, '/api/me', ckPrado);
    assert.equal(meP.j.email, 'adm@prado.com'); assert.equal(meP.j.imobiliaria, 'casaprado');
    const usP = (await get(APP, '/api/usuarios', ckPrado)).j.map((u) => u.email).sort();
    assert.deepStrictEqual(usP, ['adm@prado.com', 'corretora@prado.com']);
    const lr = await login(APP, 'adm@ruah.com', 'Teste1234');
    assert.equal(lr.s, 200); assert.equal(lr.j.imobiliaria, 'ruah');
    const ckRuah = lr.cookie;
    assert.equal((await get(APP, '/api/me', ckRuah)).j.imobiliaria, 'ruah');
    assert.equal((await login(APP, 'adm@prado.com', 'senhaerrada1')).s, 401);
    assert.equal((await login(APP, 'ninguem@x.com', 'Teste1234')).s, 401);
    ok('login no host da plataforma cai na imobiliária do e-mail (e só vê os usuários dela)');
    // no host de uma imobiliária, o login procura só nela
    assert.equal((await login(RUAH, 'adm@prado.com', 'Prado1234')).s, 401);
    const lpd = await login(PRADO, 'adm@prado.com', 'Prado1234');
    assert.equal(lpd.s, 200);
    ok('no domínio de uma imobiliária o login procura só nela');

    // ---- a sessão é presa à imobiliária
    assert.equal((await get(RUAH, '/api/me', ckPrado)).s, 401);
    assert.equal((await get(PRADO, '/api/me', ckRuah)).s, 401);
    assert.equal((await get(RUAH, '/api/me', ckRuahHost)).s, 200);
    assert.equal((await get(PRADO, '/api/me', ckPrado)).s, 200);
    ok('cookie de uma imobiliária no domínio da outra → 401; no próprio domínio e na plataforma → ok');
    // dados não atravessam
    assert.equal((await post(RUAH, '/api/leads', { nome: 'Cliente da RUAH', telefone: '19999990001' }, ckRuahHost)).s, 200);
    assert.equal((await get(APP, '/api/leads', ckPrado)).j.length, 0);
    assert.equal((await get(APP, '/api/leads', ckRuah)).j.length, 1);
    ok('leads da RUAH não aparecem para a Casa Prado');

    // ---- usuário desativado sai do índice de login (e perde as sessões)
    const lc = await login(APP, 'corretora@prado.com', 'Prado1234');
    assert.equal(lc.s, 200);
    assert.equal((await patch(PRADO, `/api/usuarios/${corr.j.id}`, { ativo: 0 }, ckPrado)).s, 200);
    assert.equal(registro.loginPorEmail('corretora@prado.com'), null);
    assert.equal((await get(APP, '/api/me', lc.cookie)).s, 401);
    assert.equal((await login(APP, 'corretora@prado.com', 'Prado1234')).s, 401);
    assert.equal((await login(PRADO, 'corretora@prado.com', 'Prado1234')).s, 401);
    assert.equal((await patch(PRADO, `/api/usuarios/${corr.j.id}`, { ativo: 1 }, ckPrado)).s, 200);
    assert.equal(registro.loginPorEmail('corretora@prado.com').imobiliaria_id, prado.id);
    assert.equal((await login(APP, 'corretora@prado.com', 'Prado1234')).s, 200);
    ok('desativado sai do login_indice e perde a sessão; reativado volta');

    // ---- marca e textos de cada imobiliária no seu domínio
    const marca = async (host) => { const r = await get(host, '/marca.js'); return JSON.parse(r.t.replace(/^window\.MARCA=/, '').replace(/;$/, '')); };
    const mR = await marca(RUAH), mP = await marca(PRADO);
    assert.equal(mR.cliente, 'RUAH'); assert.equal(mR.empresa, 'RUAH Investimentos Imobiliários');
    assert.equal(mP.cliente, 'Casa Prado'); assert.equal(mP.empresa, 'Casa Prado Imóveis');
    assert.equal(mP.sistema, mR.sistema);
    assert.equal((await marca(APP)).cliente, 'RUAH', 'entrada da plataforma sem sessão: a padrão');
    ok('/marca.js mostra o nome de cada imobiliária no seu domínio (sistema igual para todas)');
    const vitR = await get(RUAH, '/imoveis'), vitP = await get(PRADO, '/imoveis');
    assert.equal(vitP.s, 200);
    assert.ok(vitR.t.includes('<meta property="og:site_name" content="RUAH Investimentos Imobiliários">'));
    assert.ok(vitP.t.includes('<meta property="og:site_name" content="Casa Prado Imóveis">'));
    assert.ok(vitP.t.includes('Site da Casa Prado') && vitP.t.includes('https://casaprado.exemplo'));
    assert.ok(!/RUAH/.test(vitP.t), 'nada da RUAH na vitrine da Casa Prado');
    ok('og:site_name e rodapé do portal com o nome de cada imobiliária');
    const blogR = await get(RUAH, '/blog'), blogP = await get(PRADO, '/blog');
    assert.ok(blogR.t.includes('<meta property="og:site_name" content="Sopro · RUAH">'));
    assert.ok(blogP.t.includes('<meta property="og:site_name" content="Varanda · Casa Prado">'));
    assert.ok(blogP.t.includes('Casas e jardins, pela Casa Prado') && blogP.t.includes('Fale com a Casa Prado'));
    assert.ok(!/RUAH/.test(blogP.t), 'nada da RUAH no blog da Casa Prado');
    ok('blog: nome, legenda e convites da imobiliária do domínio');
    const bR = await get(RUAH, '/bairros'), bP = await get(PRADO, '/bairros');
    assert.ok(bR.t.includes('Guias de bairro · RUAH') && bP.t.includes('Guias de bairro · Casa Prado'));
    ok('bairros: a marca de cada imobiliária');
    // lead do formulário do blog: origem com o nome da imobiliária, na carteira dela
    assert.equal((await post(PRADO, '/api/publico/blog/contato', { nome: 'Visitante', telefone: '19988887777', aceite: 1, motivo: 'comprar' })).s, 200);
    const leadsP = (await get(PRADO, '/api/leads', ckPrado)).j;
    assert.equal(leadsP.length, 1); assert.equal(leadsP[0].origem, 'Blog Casa Prado');
    assert.equal((await get(RUAH, '/api/leads', ckRuahHost)).j.length, 1);
    ok('formulário do blog vira lead "Blog Casa Prado" só na Casa Prado');
    // textos montados na hora, fora de requisição
    const em = (slug, fn) => tenant.comImobiliaria(registro.porSlug(slug), fn);
    assert.ok(em('casaprado', () => require('../src/fisguei/base').RESPOSTAS.parar).includes('Casa Prado'));
    assert.ok(em('ruah', () => require('../src/fisguei/base').MODELO_PADRAO).includes('RUAH Investimentos Imobiliários'));
    assert.ok(em('casaprado', () => require('../src/portal/config').CHAMADAS.visita.texto).includes('Casa Prado'));
    assert.ok(em('casaprado', () => require('../src/portal/edicoes').CARTA.paragrafos[0]).includes('Casa Prado'));
    const cfg = require('../src/config');
    assert.equal(em('casaprado', () => cfg.CIDADE_PADRAO), 'Valinhos');
    assert.equal(em('casaprado', () => cfg.DRIVE_ROOT_NAME), 'Casa Prado Imóveis', 'campo vazio na outra imobiliária: valor neutro, nunca o .env da padrão');
    assert.equal(cfg.CLIENTE_NOME, 'RUAH', 'sem contexto: .env');
    ok('Fisguei, chamadas, revista e config (cidade, Drive) usam a imobiliária do contexto; sem contexto, o .env');

    // ---- imobiliária suspensa: login recusado com mensagem clara, sessão para, páginas públicas 404
    registro.alterar('casaprado', { status: 'suspensa' });
    const ls = await login(APP, 'adm@prado.com', 'Prado1234');
    assert.equal(ls.s, 403); assert.ok(/suspenso/.test(ls.j.erro), ls.t);
    assert.equal((await login(PRADO, 'adm@prado.com', 'Prado1234')).s, 403);
    const ses = await get(APP, '/api/me', ckPrado);
    assert.equal(ses.s, 403); assert.ok(/suspenso/.test(ses.j.erro));
    assert.equal((await get(PRADO, '/imoveis')).s, 404);
    assert.equal((await get(PRADO, '/blog')).s, 404);
    assert.equal((await post(PRADO, '/api/publico/blog/contato', { nome: 'V', telefone: '19988887770', aceite: 1 })).s, 404);
    assert.equal((await get(RUAH, '/imoveis')).s, 200);
    assert.equal((await login(APP, 'adm@ruah.com', 'Teste1234')).s, 200);
    ok('suspensa: login recusado ("acesso suspenso"), sessão aberta para, páginas públicas 404; a RUAH segue normal');
    registro.alterar('casaprado', { status: 'cancelada' });
    assert.equal((await get(PRADO, '/blog')).s, 410);
    assert.ok(/cancelada/.test((await login(APP, 'adm@prado.com', 'Prado1234')).j.erro));
    registro.alterar('casaprado', { status: 'teste' });
    assert.equal((await login(APP, 'adm@prado.com', 'Prado1234')).s, 200);
    assert.equal((await get(PRADO, '/imoveis')).s, 200);
    ok("cancelada: páginas 410 e login recusado; em 'teste' volta a funcionar");

    // ---- sair
    assert.equal((await post(APP, '/api/logout', {}, ckRuah)).s, 200);
    assert.equal((await get(APP, '/api/me', ckRuah)).s, 401);
    ok('logout encerra a sessão comum');

    console.log(`\nAutenticação multi-imobiliária: ${n} verificações, tudo certo.`);
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
  } catch (e) {
    console.error('FALHOU:', e);
    srv.close();
    process.exit(1);
  }
})();
