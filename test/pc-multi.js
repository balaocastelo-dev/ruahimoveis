// Multi-imobiliária · processos do PC (src/pc.js), no SQLite com MULTI=1 e sem rede:
// duas imobiliárias em IMOBILIARIAS_PC sobem cada serviço no contexto certo; a pasta de dados da RUAH continua a mesma
// e a da outra é data/<slug>/...; eventos do WhatsApp (Baileys simulado) e do IMAP (cliente simulado) voltam para a
// imobiliária certa mesmo disparados de outro contexto; scripts aceitam --imobiliaria.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const { EventEmitter } = require('events');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-pc-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.MULTI = '1';
process.env.MULTI_ESTRITO = '1';           // sem imobiliária no contexto, tabela privada dá erro: perder o contexto aparece
process.env.IMOBILIARIAS_PC = 'ruah, outra';
process.env.RADAR_EMAIL = 'radar-ruah@exemplo.com'; process.env.RADAR_EMAIL_SENHA = 'senha-ruah';
process.env.RADAR_EMAIL_OUTRA = 'radar-outra@exemplo.com'; process.env.RADAR_EMAIL_SENHA_OUTRA = 'senha-outra';
process.env.RADAR_BAIRROS_OUTRA = 'Centro, Taquaral';
process.env.IA_MODO = 'desligado';
for (const k of ['IMOBILIARIA_PADRAO', 'IMOBILIARIA_PASTA_RAIZ', 'VERCEL', 'DATABASE_URL', 'RADAR_BAIRROS', 'FISGUEI_ROBO']) delete process.env[k];

const cfg = require('../src/config');
const DADOS = path.join(tmp, 'data');
cfg.DATA_DIR = DADOS;                       // nada do teste toca o data/ de verdade
const tenant = require('../src/tenant');
const D = require('../src/db-sqlite');
const pc = require('../src/pc');

let n = 0;
const ok = (msg) => { n++; console.log('ok ·', msg); };
const em = (slug, fn) => tenant.comImobiliaria(slug, fn);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const quem = () => (tenant.atual() ? tenant.atual().slug : null);
async function ate(cond, ms = 3000) { const fim = Date.now() + ms; while (!cond()) { if (Date.now() > fim) throw new Error('tempo esgotado esperando condição'); await espera(5); } }
const json = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };

// ---- Baileys de mentira: guarda cada socket, a pasta da sessão e em que imobiliária foi criado ----
function baileysFalso() {
  const B = { sockets: [], pastas: [] };
  B.mod = {
    default: (o) => { const s = { ev: new EventEmitter(), user: { id: '5519000000000:1@s.whatsapp.net' }, browser: o.browser, criadoEm: quem(), sendMessage: async () => ({ key: { id: 'X' } }), onWhatsApp: async () => [null], end() {}, logout: async () => {} }; B.sockets.push(s); return s; },
    useMultiFileAuthState: async (p) => { B.pastas.push({ pasta: p, em: quem() }); return { state: {}, saveCreds: () => {} }; },
    fetchLatestBaileysVersion: async () => { throw new Error('sem rede no teste'); },
    Browsers: { windows: (x) => x },
    DisconnectReason: { loggedOut: 401 },
    downloadMediaMessage: async () => Buffer.alloc(0),
  };
  return B;
}
const msgWa = (id, texto) => ({ type: 'notify', messages: [{ key: { remoteJid: '5519999990001@s.whatsapp.net', id, fromMe: false }, message: { conversation: texto }, pushName: 'Fulano' }] });

(async () => {
  D.criaImobiliaria('outra');

  // ---------------------------------------------------------------- lista de imobiliárias do PC
  assert.deepEqual(pc.slugsPc(), ['ruah', 'outra']);
  { const avisos = []; process.env.IMOBILIARIAS_PC = 'ruah,Inválida!,outra,ruah';
    assert.deepEqual(pc.slugsPc({ avisa: (m) => avisos.push(m) }), ['ruah', 'outra']); assert.equal(avisos.length, 1);
    process.env.IMOBILIARIAS_PC = ''; assert.deepEqual(pc.slugsPc(), ['ruah']);
    process.env.IMOBILIARIAS_PC = 'outra'; assert.deepEqual(pc.slugsPc(), ['outra']);
    process.env.IMOBILIARIAS_PC = 'ruah,outra'; process.env.MULTI = '0';
    assert.deepEqual(pc.slugsPc({ avisa: () => {} }), ['ruah']);       // sem MULTI as duas escreveriam nas mesmas tabelas
    process.env.MULTI = '1'; process.env.IMOBILIARIAS_PC = 'ruah, outra'; }
  ok('IMOBILIARIAS_PC: lista com padrão = IMOBILIARIA_PADRAO, ignora slug inválido/repetido, sem MULTI só a padrão');

  // ---------------------------------------------------------------- pastas de dados
  assert.equal(pc.pastaDe('ruah', 'whatsapp-thiago'), path.join(DADOS, 'whatsapp-thiago'));
  assert.equal(pc.pastaDe('ruah', 'whatsapp-agente-apartamentos'), path.join(DADOS, 'whatsapp-agente-apartamentos'));
  assert.equal(pc.pastaDe('outra', 'whatsapp-thiago'), path.join(DADOS, 'outra', 'whatsapp-thiago'));
  assert.equal(em('outra', () => pc.pastaDados('whatsapp-agente-ana')), path.join(DADOS, 'outra', 'whatsapp-agente-ana'));
  assert.equal(pc.pastaDados('x'), path.join(DADOS, 'x'));                 // sem contexto: imobiliária padrão (RUAH)
  process.env.IMOBILIARIA_PADRAO = 'outra';                                // mudar a padrão não muda onde a RUAH guarda
  assert.equal(pc.pastaDe('ruah', 'whatsapp-thiago'), path.join(DADOS, 'whatsapp-thiago'));
  assert.equal(pc.pastaDados('x'), path.join(DADOS, 'outra', 'x'));
  delete process.env.IMOBILIARIA_PADRAO;
  assert.throws(() => pc.pastaDe('../etc', 'x'), /inválida/);
  ok('pasta da RUAH continua em data/whatsapp-*; a da outra em data/outra/whatsapp-*; slug com ../ recusado');

  // ---------------------------------------------------------------- configuração por imobiliária
  assert.equal(em('ruah', () => pc.cfgDa('RADAR_EMAIL')), 'radar-ruah@exemplo.com');
  assert.equal(em('outra', () => pc.cfgDa('RADAR_EMAIL')), 'radar-outra@exemplo.com');
  assert.equal(em('outra', () => pc.cfgDa('RADAR_PORTAIS_MIN', '60')), '60');      // nunca herda o valor da RUAH
  ok('config dos serviços: RUAH lê cfg como sempre; a outra lê X_<SLUG> ou o padrão, nunca o da RUAH');

  // ---------------------------------------------------------------- arranque: cada serviço no contexto certo
  {
    const vistos = [];
    const marca = (nome) => async (slug) => {
      vistos.push({ nome, slug, agora: quem() });
      await espera(5); vistos.push({ nome, slug, depoisAwait: quem() });
      setTimeout(() => vistos.push({ nome, slug, timer: quem() }), 1);
      setImmediate(() => vistos.push({ nome, slug, immediate: quem() }));
    };
    const r = pc.arranca({ imobiliaria: { alertas: marca('alertas'), portais: marca('portais'), robo: marca('robo'), escritorio: marca('escritorio') }, base: { vincula: marca('vincula') } });
    await espera(40);
    assert.deepEqual(r.slugs, ['ruah', 'outra']);
    assert.equal(r.iniciados.length, 4 * 2 + 1);
    for (const nome of ['alertas', 'portais', 'robo', 'escritorio']) for (const slug of ['ruah', 'outra']) {
      const v = vistos.filter((x) => x.nome === nome && x.slug === slug);
      assert.equal(v.length, 4, `${nome}/${slug}`);
      for (const x of v) assert.equal(x.agora || x.depoisAwait || x.timer || x.immediate, slug, `${nome}/${slug} perdeu o contexto`);
    }
    const vinc = vistos.filter((x) => x.nome === 'vincula');
    assert.equal(vinc.length, 4); assert.ok(vinc.every((x) => (x.agora || x.depoisAwait || x.timer || x.immediate) === 'ruah'));
    // um serviço que falha não impede os outros nem a outra imobiliária
    const r2 = pc.arranca({ slugs: ['ruah', 'outra'], imobiliaria: { quebra: () => { throw new Error('boom'); }, bom: () => {} }, base: {} });
    assert.equal(r2.falhas.length, 2); assert.equal(r2.iniciados.length, 2);
  }
  ok('arranque: serviços da imobiliária uma vez por slug no contexto dele (após await/timer também); rotina comum uma vez só');

  // ---------------------------------------------------------------- vínculo de condomínios: um timer, todas as imobiliárias
  {
    // agenda uma vez só, e o arranque entrega a lista das imobiliárias do PC
    const chamadas = [];
    pc.arranca({ imobiliaria: {}, base: { vincula: (s, slugs) => chamadas.push({ s, slugs, em: quem() }) } });
    assert.deepEqual(chamadas, [{ s: 'ruah', slugs: ['ruah', 'outra'], em: 'ruah' }]);
    // rodada de verdade (condominios/base.vincular): prédio comum; oportunidade em cada imobiliária; prédio-alvo só na outra
    const cond = Number(D.run(`INSERT INTO condominios(nome,cep,logradouro,numero,bairro,cidade,uf,lat,lon,slug,nome_busca)
      VALUES('Edifício Teste','13013000','Rua das Flores','100','Cambuí','Campinas','SP',-22.9,-47.06,'edificio-teste','EDIFICIO TESTE')`).lastInsertRowid);
    for (const slug of ['ruah', 'outra']) em(slug, () => D.run("INSERT INTO oportunidades(portal,link,titulo,tipo,bairro,logradouro,numero,valor,status) VALUES('ZAP',?,'Apto','Apartamento','Cambuí','Rua das Flores','100',800000,'nova')", 'https://exemplo/' + slug));
    em('outra', () => D.run('INSERT INTO condominio_alvos(condominio_id) VALUES(?)', cond));
    const r = pc.rodadaVincula(['ruah', 'outra']);
    assert.equal(r.ruah.radar, 1, JSON.stringify(r)); assert.equal(r.outra.radar, 1, JSON.stringify(r));
    for (const slug of ['ruah', 'outra']) assert.equal(em(slug, () => D.one('SELECT condominio_id FROM oportunidades').condominio_id), cond);
    assert.equal(em('outra', () => D.one('SELECT count(*) n FROM condominio_alertas').n), 1);
    assert.equal(em('ruah', () => D.one('SELECT count(*) n FROM condominio_alertas').n), 0);
    // uma imobiliária com erro não impede a outra
    const r2 = pc.rodadaVincula(['ruah', 'outra'], () => { if (quem() === 'ruah') throw new Error('boom'); return { radar: 0 }; });
    assert.equal(r2.ruah.erro, 'boom'); assert.deepEqual(r2.outra, { radar: 0 });
  }
  ok('vínculo de condomínios: agendado uma vez; cada rodada liga carteira/Radar e avisa prédio-alvo de cada imobiliária');

  // ---------------------------------------------------------------- escritório: um processo por imobiliária
  {
    const forks = [];
    const forkFalso = (arq, args) => { const p = new EventEmitter(); p.kill = () => {}; forks.push({ arq, args }); return p; };
    pc.abreEscritorio('ruah', { fork: forkFalso }); pc.abreEscritorio('outra', { fork: forkFalso });
    assert.deepEqual(forks.map((f) => f.args), [['ruah'], ['outra']]);
    assert.ok(forks.every((f) => f.arq.endsWith(path.join('src', 'agentes', 'servico.js'))));
  }
  ok('escritório: abre src/agentes/servico.js com o slug de cada imobiliária');

  // ---------------------------------------------------------------- robô do Fisguei (Baileys simulado)
  {
    const B = baileysFalso();
    const robo = require('../src/fisguei/robo');
    robo._teste.usaBaileys(async () => B.mod);
    const F = require('../src/fisguei/base');
    const recebidas = [];
    const original = F.recebida;
    F.recebida = (x) => { recebidas.push({ ...x, em: quem() }); return { ignorado: 'teste' }; };
    pc.arranca({ imobiliaria: { robo: pc.SERVICOS_IMOBILIARIA.robo }, base: {} });
    await ate(() => B.sockets.length === 2);
    const pastas = Object.fromEntries(B.pastas.map((p) => [p.em, p.pasta]));
    assert.equal(pastas.ruah, path.join(DADOS, 'whatsapp-thiago'));
    assert.equal(pastas.outra, path.join(DADOS, 'outra', 'whatsapp-thiago'));
    const sock = Object.fromEntries(B.sockets.map((s) => [s.criadoEm, s]));
    // eventos disparados DE OUTRO contexto (como faria um timer/cache interno do Baileys) voltam para a imobiliária do socket
    em('outra', () => sock.ruah.ev.emit('connection.update', { connection: 'open' }));
    em('ruah', () => sock.outra.ev.emit('connection.update', { qr: 'codigo-qr-da-outra' }));
    sock.ruah.ev.emit('messages.upsert', msgWa('R1', 'oi da RUAH'));                 // sem contexto nenhum
    em('ruah', () => sock.outra.ev.emit('messages.upsert', msgWa('O1', 'oi da outra')));
    await ate(() => recebidas.length === 2 && (json(em('outra', () => D.getConfig('fisguei_robo'))) || {}).estado === 'qr');
    const stR = json(em('ruah', () => D.getConfig('fisguei_robo'))), stO = json(em('outra', () => D.getConfig('fisguei_robo')));
    assert.equal(stR.estado, 'conectado'); assert.equal(stR.numero, '5519000000000');
    assert.equal(stO.estado, 'qr'); assert.ok(String(stO.qr).startsWith('data:image/png'));
    assert.equal(em('ruah', () => robo.estado().estado), 'conectado');
    assert.equal(em('outra', () => robo.estado().estado), 'qr');
    assert.deepEqual(recebidas.map((x) => [x.wa_id, x.em]).sort(), [['O1', 'outra'], ['R1', 'ruah']]);
    // iniciar de novo na mesma imobiliária não abre outro WhatsApp
    em('ruah', () => robo.iniciar()); await espera(20); assert.equal(B.sockets.length, 2);
    robo._teste.para(); F.recebida = original;
  }
  ok('robô do Fisguei: um WhatsApp por imobiliária, sessão na pasta certa, eventos do Baileys gravam na imobiliária certa');

  // ---------------------------------------------------------------- linhas dos agentes (Baileys simulado)
  {
    const B = baileysFalso();
    const linhas = require('../src/agentes/linhas');
    linhas._teste.usaBaileys(async () => B.mod);
    const chegou = [];
    for (const slug of ['ruah', 'outra']) em(slug, () => { linhas._teste.EST().aoReceber = async (m) => { await espera(1); chegou.push({ ...m, em: quem() }); }; linhas._teste.conecta('apartamentos'); });
    await ate(() => B.sockets.length === 2);
    const pastas = Object.fromEntries(B.pastas.map((p) => [p.em, p.pasta]));
    assert.equal(pastas.ruah, path.join(DADOS, 'whatsapp-agente-apartamentos'));
    assert.equal(pastas.outra, path.join(DADOS, 'outra', 'whatsapp-agente-apartamentos'));
    const sock = Object.fromEntries(B.sockets.map((s) => [s.criadoEm, s]));
    em('outra', () => sock.ruah.ev.emit('connection.update', { connection: 'open' }));
    sock.outra.ev.emit('messages.upsert', msgWa('A1', 'quero um apê'));
    em('outra', () => sock.ruah.ev.emit('messages.upsert', msgWa('A2', 'quero vender')));
    await ate(() => chegou.length === 2);
    assert.deepEqual(chegou.map((x) => [x.wa_id, x.em, x.linha]).sort(), [['A1', 'outra', 'apartamentos'], ['A2', 'ruah', 'apartamentos']]);
    assert.equal(json(em('ruah', () => D.getConfig('agente_wa:apartamentos'))).estado, 'conectado');
    assert.notEqual((json(em('outra', () => D.getConfig('agente_wa:apartamentos'))) || {}).estado, 'conectado');
    assert.equal(em('ruah', () => linhas.conectada('apartamentos')), true);
    assert.equal(em('outra', () => linhas.conectada('apartamentos')), false);
  }
  ok('linhas dos agentes: estado e sessão por imobiliária; mensagem recebida vai para a imobiliária da linha');

  // ---------------------------------------------------------------- leitor de alertas por e-mail (IMAP simulado)
  {
    const al = require('../src/services/alertas');
    const clientes = [];
    class ImapFalso extends EventEmitter {
      constructor(o) { super(); this.o = o; this.em = quem(); clientes.push(this); }
      async connect() { await espera(10); const e = new Error('Invalid credentials'); e.authenticationFailed = true; throw e; }
      async logout() {}
    }
    al._teste.usaImap(ImapFalso);
    assert.equal(em('ruah', () => al.status().email), 'radar-ruah@exemplo.com');
    assert.equal(em('outra', () => al.status().email), 'radar-outra@exemplo.com');
    // as duas leem ao mesmo tempo: uma não engole a leitura da outra
    const [rR, rO] = await Promise.all([em('ruah', () => al.ler()), em('outra', () => al.ler())]);
    assert.ok(rR.erro && rO.erro);
    assert.deepEqual(clientes.map((c) => [c.em, c.o.auth.user]).sort(), [['outra', 'radar-outra@exemplo.com'], ['ruah', 'radar-ruah@exemplo.com']]);
    assert.ok(/recusou o login/.test(em('ruah', () => al.status().ultima.erro)));
    assert.ok(/recusou o login/.test(em('outra', () => al.status().ultima.erro)));
    // erro do socket emitido fora de qualquer contexto: o aviso sai com a imobiliária certa
    const avisos = []; const ce = console.error; console.error = (...a) => avisos.push(a.join(' '));
    try { for (const c of clientes) c.emit('error', new Error('socket caiu')); } finally { console.error = ce; }
    assert.ok(avisos.some((a) => a.includes('[radar ruah] IMAP: socket caiu')) && avisos.some((a) => a.includes('[radar outra] IMAP: socket caiu')));
    // iniciar: um timer por imobiliária (e só um)
    pc.arranca({ imobiliaria: { alertas: pc.SERVICOS_IMOBILIARIA.alertas }, base: {} });
    em('outra', () => al.iniciar());
    assert.deepEqual([...al._teste.EST.todos.keys()].sort(), ['outra', 'ruah']);
    assert.ok([...al._teste.EST.todos.values()].every((e) => e.timer));
    al._teste.para(); al._teste.usaImap(null);
  }
  ok('alertas por e-mail: Gmail, leitura em andamento, status e avisos do IMAP separados por imobiliária');

  // ---------------------------------------------------------------- monitor dos portais
  {
    const portais = require('../src/services/portais');
    assert.ok(em('ruah', () => portais.bairros()).some((b) => b.nome === 'Cambuí'));
    assert.deepEqual(em('outra', () => portais.bairros()).map((b) => b.nome), ['Centro', 'Taquaral']);
    em('outra', () => D.setConfig('portais_status', JSON.stringify({ em: new Date().toISOString(), novas: 7 })));
    assert.equal(em('outra', () => portais.status().ultima.novas), 7);
    assert.equal(em('ruah', () => portais.status().ultima), null);
    pc.arranca({ imobiliaria: { portais: pc.SERVICOS_IMOBILIARIA.portais }, base: {} });
    assert.deepEqual([...portais._teste.EST.todos.keys()].sort(), ['outra', 'ruah']);
    portais._teste.para();
  }
  ok('monitor dos portais: bairros, estado e timer por imobiliária');

  // ---------------------------------------------------------------- scripts: --imobiliaria
  {
    const a = (x) => pc.argImobiliaria(x);
    assert.deepEqual(a(['listar']), { slug: 'ruah', args: ['listar'] });
    assert.deepEqual(a(['listar', '--imobiliaria', 'outra', '--quantos', '2']), { slug: 'outra', args: ['listar', '--quantos', '2'] });
    assert.deepEqual(a(['--imobiliaria=Outra', 'conferir', 'x.json']), { slug: 'outra', args: ['conferir', 'x.json'] });
    assert.ok(a(['--imobiliaria']).erro && a(['--imobiliaria', '--quantos']).erro && a(['--imobiliaria', 'a-b']).erro);
    process.env.IMOBILIARIA_PADRAO = 'outra'; assert.equal(a([]).slug, 'outra'); delete process.env.IMOBILIARIA_PADRAO;
    assert.equal(pc.travaOutra({ slug: 'ruah', comando: 'publicar', escreve: ['publicar'] }), null);
    assert.match(pc.travaOutra({ slug: 'outra', comando: 'publicar', escreve: ['publicar'] }), /Nada foi feito/);
    delete process.env.PORTAL_URL;
    assert.match(pc.travaOutra({ slug: 'outra', comando: 'listar', escreve: ['publicar'], urlEnv: 'PORTAL_URL' }), /PORTAL_URL/);
    // os scripts de verdade (só ajuda, recusas e o conferir local: nada sai para a rede, nada é publicado)
    const { spawnSync } = require('child_process');
    const roda = (...x) => spawnSync(process.execPath, x, { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, MULTI: '', MULTI_ESTRITO: '', PORTAL_URL: '', BLOG_URL: '' } });
    let r = roda('scripts/portal-publicar.mjs', '--imobiliaria', 'outra');
    assert.equal(r.status, 0); assert.match(r.stdout, /desta vez: outra/);
    r = roda('scripts/portal-publicar.mjs', 'publicar', 'a.json', '--imobiliaria', 'outra'); assert.equal(r.status, 2); assert.match(r.stderr, /Nada foi feito/);
    r = roda('scripts/portal-publicar.mjs', 'listar', '--imobiliaria', 'outra'); assert.equal(r.status, 2); assert.match(r.stderr, /PORTAL_URL/);
    r = roda('scripts/portal-publicar.mjs', 'listar', '--imobiliaria', 'Ruim!'); assert.equal(r.status, 2); assert.match(r.stderr, /inválida/);
    r = roda('scripts/bairros-publicar.mjs', 'preparar', '--imobiliaria', 'outra'); assert.equal(r.status, 2); assert.match(r.stderr, /Nada foi feito/);
    r = roda('scripts/blog-publicar.mjs', 'listar', '--imobiliaria', 'outra'); assert.equal(r.status, 2);
    r = roda('scripts/blog-publicar.mjs', 'conferir', 'test/blog-exemplo.json', '--imobiliaria', 'outra'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Aprovado/);
    r = roda('scripts/portal-gpu.mjs', '--ajuda', '--imobiliaria', 'outra'); assert.equal(r.status, 0); assert.ok(r.stdout.includes(path.join('data', 'outra', 'portal-gpu')));
    r = roda('scripts/portal-gpu.mjs', '--ajuda'); assert.equal(r.status, 0); assert.ok(r.stdout.includes('ruah') && !r.stdout.includes(path.join('data', 'ruah')));
    r = roda('scripts/portal-gpu.mjs', '--imobiliaria', 'outra', '--sem-publicar'); assert.equal(r.status, 2); assert.match(r.stderr, /PORTAL_URL/);
    r = roda('scripts/portal-gpu.mjs', '--fase', 'x'); assert.equal(r.status, 2);
    r = roda('scripts/condominios-importar.mjs', '--imobiliaria', 'outra'); assert.equal(r.status, 2); assert.match(r.stdout, /vínculo: outra/);
  }
  ok('scripts: --imobiliaria lido e tirado dos argumentos; outra imobiliária não publica nem lê o site da RUAH');

  console.log(`\nPC multi-imobiliária: ${n} verificações ok.`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
