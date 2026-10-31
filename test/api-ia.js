// Controle por IA: chave de API em qualquer rota /api, catálogo, estado, executar e consulta.
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-api-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado'; process.env.ESCRITORIO = '0'; process.env.FISGUEI_ROBO = '0'; process.env.RADAR_PORTAIS = '0';
// Exercita apenas o banco temporário e impede consultas ao cofre real da plataforma.
for (const k of ['DATABASE_URL', 'PLATAFORMA_DATABASE_URL', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) process.env[k] = '';
const app = require('../server');
const assert = require('assert');

(async () => {
  const srv = app.listen(0); const porta = srv.address().port;
  process.env.PORT = String(porta); require('../src/config').PORT = porta; // o executar chama o próprio sistema
  const base = `http://127.0.0.1:${porta}`;
  let cookie = '', chave = '';
  const req = async (m, url, body, comChave = false) => {
    const h = { 'Content-Type': 'application/json' };
    if (comChave) h.authorization = `Bearer ${chave}`; else h.cookie = cookie;
    const r = await fetch(base + url, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };

  ok(await req('POST', '/api/setup', { nome: 'Thiago', email: 'adm@teste.local', senha: 'senha1234' }), 'administrador criado');

  const nova = ok(await req('POST', '/api/chaves', { nome: 'Claude', escopos: '*' }), 'chave de API criada');
  chave = nova.chave; assert(/^hh_[0-9a-f]{8}_/.test(chave), 'formato da chave');

  const eu = ok(await req('GET', '/api/me', null, true), 'entra pela chave em /api/me');
  assert.equal(eu.perfil, 'adm');
  assert.equal((await req('GET', '/api/me')).s, 200);                       // sessão continua valendo
  assert.equal((await fetch(base + '/api/me', { headers: { authorization: 'Bearer hh_00000000_naoexiste' } })).status, 401, 'chave falsa recusada');

  const man = ok(await req('GET', '/api/ia/manifesto', null, true), 'manifesto');
  assert(man.acoes > 150 && man.mapas.executar === '/api/ia/executar');
  const acoes = ok(await req('GET', '/api/ia/acoes', null, true), 'catálogo de ações');
  assert(acoes.length > 150 && acoes.every((a) => a.nome && a.metodo && a.caminho && a.escopo));
  const ferr = ok(await req('GET', '/api/ia/ferramentas.json', null, true), 'ferramentas para LLM');
  assert(ferr[0].name && ferr[0].input_schema.type === 'object');
  const oa = ok(await req('GET', '/api/ia/openapi.json', null, true), 'OpenAPI');
  assert.equal(oa.openapi, '3.1.0'); assert(Object.keys(oa.paths).length > 150);
  const est = ok(await req('GET', '/api/ia/estado', null, true), 'estado do sistema');
  assert('imoveis' in est.carteira && 'leads' in est.crm);

  // escrever pela chave: cria imóvel e lead
  const im = ok(await req('POST', '/api/imoveis', { tipo: 'Apartamento', bairro: 'Cambuí', valor: 1250000, quartos: 3 }, true), 'imóvel criado pela chave');
  assert(im.codigo);
  ok(await req('POST', '/api/leads', { nome: 'Cliente IA', telefone: '19999990000', origem: 'API' }, true), 'lead criado pela chave');

  // uma ferramenta só
  const ex = ok(await req('POST', '/api/ia/executar', { acao: 'imoveis.listar', query: { limite: 5 } }, true), 'executar imoveis.listar');
  assert.equal(ex.status, 200);
  const ex2 = ok(await req('POST', '/api/ia/executar', { acao: 'imoveis.ver', dados: { id: im.id } }, true), 'executar imoveis.ver');
  assert.equal(ex2.resultado.codigo, im.codigo);
  assert.equal((await req('POST', '/api/ia/executar', { acao: 'nao.existe' }, true)).s, 404, 'ação desconhecida');

  // banco: esquema e consulta só de leitura
  const esq = ok(await req('GET', '/api/ia/esquema?tabela=imoveis', null, true), 'esquema do banco');
  assert(JSON.stringify(esq).includes('codigo'));
  const cons = ok(await req('POST', '/api/ia/consulta', { sql: 'SELECT count(*) AS n FROM imoveis' }, true), 'consulta de leitura');
  assert.equal(cons.linhas[0].n, 1);
  assert.equal((await req('POST', '/api/ia/consulta', { sql: 'DELETE FROM imoveis' }, true)).s, 400, 'escrita recusada na consulta');

  // configuração
  ok(await req('PUT', '/api/ia/config', { chave: 'teste_api', valor: 'valor' }, true), 'configuração gravada');
  const cfgs = ok(await req('GET', '/api/ia/config?chave=teste_api', null, true), 'configuração lida');
  assert.equal(cfgs[0].valor, 'valor');

  // escopo e somente leitura
  const so = ok(await req('POST', '/api/chaves', { nome: 'Só painel', escopos: ['painel'], somente_leitura: true }), 'chave restrita');
  const r1 = await fetch(base + '/api/imoveis', { headers: { authorization: `Bearer ${so.chave}` } });
  assert.equal(r1.status, 403, 'escopo bloqueia /api/imoveis');
  const r2 = await fetch(base + '/api/ia/config', { method: 'PUT', headers: { authorization: `Bearer ${so.chave}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r2.status, 403, 'somente leitura bloqueia escrita');
  console.log('ok · escopos e somente leitura');

  // revogar
  const lista = ok(await req('GET', '/api/chaves', null, true), 'chaves listadas');
  assert(lista.length === 2 && !lista.some((c) => c.chave_hash));
  ok(await req('DELETE', `/api/chaves/${so.id}`, null, true), 'chave revogada');
  assert.equal((await fetch(base + '/api/ia/manifesto', { headers: { authorization: `Bearer ${so.chave}` } })).status, 401, 'chave revogada não entra');

  const log = ok(await req('GET', '/api/chaves/log?limite=5', null, true), 'registro de uso');
  assert(log.length > 0 && log[0].caminho);

  await new Promise((resolve, reject) => srv.close((erro) => erro ? reject(erro) : resolve()));
  require('../src/db').db.close(); // Windows mantém o arquivo bloqueado enquanto o SQLite está aberto.
  const limpeza = fs.realpathSync(tmp);
  assert.equal(path.dirname(limpeza), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(limpeza).startsWith('hh-api-'));
  fs.rmSync(limpeza, { recursive: true, force: true });
  console.log('\nAPI de controle por IA: tudo certo.');
})().catch((e) => { console.error(e); process.exit(1); });
