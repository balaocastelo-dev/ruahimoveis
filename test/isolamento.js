// Multi-imobiliária · isolamento no SQLite (MULTI=1): duas imobiliárias no mesmo banco, cada uma só vê o que é dela;
// tabelas comuns são vistas pelas duas; operações concorrentes (com await) não trocam de imobiliária.
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-iso-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.MULTI = '1';
process.env.MULTI_ESTRITO = '1';
delete process.env.IMOBILIARIA_PADRAO;
const assert = require('assert');
const tenant = require('../src/tenant');
const D = require('../src/db-sqlite');
const { one, all, run, db } = D;

let n = 0;
const ok = (msg) => { n++; console.log('ok ·', msg); };
const em = (slug, fn) => tenant.comImobiliaria(slug, fn);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // a padrão (ruah) já nasce com o banco; a 'outra' é criada agora
  D.criaImobiliaria('outra');
  const tabs = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name));
  for (const t of ['imoveis', 'leads', 'usuarios', 'config', 'oportunidades']) assert.ok(tabs.has(`ruah__${t}`) && tabs.has(`outra__${t}`), t);
  assert.ok(tabs.has('condominios') && !tabs.has('ruah__condominios') && !tabs.has('imoveis'));
  ok('tabelas privadas com prefixo para as duas; comuns uma vez só, sem prefixo');

  // imóvel e lead só na RUAH
  em('ruah', () => {
    run("INSERT INTO imoveis(codigo,tipo,bairro,valor) VALUES('AP0001','Apartamento','Cambuí',900000)");
    run("INSERT INTO leads(nome,telefone) VALUES('Cliente da RUAH','19999990001')");
    D.setConfig('marca', 'RUAH');
  });
  em('outra', () => D.setConfig('marca', 'OUTRA'));
  em('ruah', () => {
    assert.equal(one('SELECT count(*) n FROM imoveis').n, 1);
    assert.equal(one('SELECT nome FROM leads').nome, 'Cliente da RUAH');
  });
  ok('RUAH vê o imóvel e o lead dela');
  em('outra', () => {
    assert.equal(one('SELECT count(*) n FROM imoveis').n, 0);
    assert.equal(one('SELECT count(*) n FROM leads').n, 0);
    assert.equal(one("SELECT count(*) n FROM imoveis i LEFT JOIN leads l ON 1=1 WHERE i.codigo='AP0001'").n, 0);
  });
  ok('a outra imobiliária não vê o imóvel nem o lead da RUAH (nem por JOIN)');
  assert.equal(em('ruah', () => D.getConfig('marca')), 'RUAH');
  assert.equal(em('outra', () => D.getConfig('marca')), 'OUTRA');
  ok('config separada por imobiliária (mesma chave, valores diferentes)');

  // o mesmo código de imóvel pode existir nas duas (UNIQUE é por imobiliária)
  em('outra', () => run("INSERT INTO imoveis(codigo,tipo,bairro,valor) VALUES('AP0001','Casa','Taquaral',500000)"));
  assert.equal(em('ruah', () => one("SELECT tipo FROM imoveis WHERE codigo='AP0001'").tipo), 'Apartamento');
  assert.equal(em('outra', () => one("SELECT tipo FROM imoveis WHERE codigo='AP0001'").tipo), 'Casa');
  ok('mesmo código de imóvel nas duas, cada uma lê o seu');

  // UPDATE/DELETE de uma não alcança a outra
  em('outra', () => { run('UPDATE imoveis SET valor=1'); run('DELETE FROM leads'); });
  assert.equal(em('ruah', () => one('SELECT valor FROM imoveis').valor), 900000);
  assert.equal(em('ruah', () => one('SELECT count(*) n FROM leads').n), 1);
  ok('UPDATE e DELETE na outra não mexem na RUAH');

  // tabela comum: as duas veem
  const cid = em('ruah', () => run("INSERT INTO condominios(nome,cep,numero,bairro) VALUES('Edifício Comum','13025000','100','Cambuí')").lastInsertRowid);
  assert.equal(em('outra', () => one('SELECT nome FROM condominios WHERE id=?', cid).nome), 'Edifício Comum');
  em('outra', () => run("INSERT INTO fisguei_anuncios(fisgar_id,titulo,condominio_id) VALUES('F1','Anúncio do portal',?)", cid));
  assert.equal(em('ruah', () => one("SELECT a.titulo, c.nome FROM fisguei_anuncios a JOIN condominios c ON c.id=a.condominio_id WHERE a.fisgar_id='F1'").nome), 'Edifício Comum');
  ok('tabelas comuns (condomínios, anúncios) vistas pelas duas');

  // privada ligada a comum: imóvel da outra aponta para o condomínio comum
  em('outra', () => run("UPDATE imoveis SET condominio_id=? WHERE codigo='AP0001'", cid));
  assert.equal(em('outra', () => one('SELECT c.nome FROM imoveis i JOIN condominios c ON c.id=i.condominio_id').nome), 'Edifício Comum');
  ok('JOIN privada × comum funciona');

  // estrito: sem imobiliária no contexto, tabela privada é recusada; comum passa
  assert.throws(() => one('SELECT count(*) n FROM leads'), (e) => e.code === 'SEM_IMOBILIARIA');
  assert.ok(one('SELECT count(*) n FROM condominios').n >= 1);
  ok('estrito: privada sem contexto recusada, comum permitida');

  // concorrência: duas operações com await ao mesmo tempo, a mais lenta começa antes
  const tarefa = (slug, ms) => em(slug, async () => {
    const antes = tenant.atual().slug;
    await espera(ms);
    run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES((SELECT max(id) FROM leads),?,?)', 'nota', `de ${slug}`);
    await espera(5);
    const visto = all('SELECT texto FROM interacoes').map((x) => x.texto);
    return { antes, depois: tenant.atual().slug, visto };
  });
  em('outra', () => run("INSERT INTO leads(nome) VALUES('Cliente da outra')"));
  const [r1, r2, r3] = await Promise.all([tarefa('ruah', 40), tarefa('outra', 5), em('outra', async () => { await espera(20); return all('SELECT nome FROM leads').map((x) => x.nome); })]);
  assert.deepStrictEqual([r1.antes, r1.depois], ['ruah', 'ruah']);
  assert.deepStrictEqual([r2.antes, r2.depois], ['outra', 'outra']);
  assert.deepStrictEqual(r1.visto, ['de ruah']);
  assert.deepStrictEqual(r2.visto, ['de outra']);
  assert.deepStrictEqual(r3, ['Cliente da outra']);
  ok('Promise.all com atrasos diferentes: cada operação continua na sua imobiliária depois do await');

  // setTimeout/setInterval herdam a imobiliária (processos do PC)
  const doTimer = await em('outra', () => new Promise((r) => setTimeout(() => r(one('SELECT count(*) n FROM leads').n + ':' + tenant.atual().slug), 5)));
  assert.equal(doTimer, '1:outra');
  ok('setTimeout dentro de comImobiliaria continua na mesma imobiliária');

  // o mesmo SQL em sequência alternada (cache de tradução com chave schema+sql)
  const seq = [];
  for (const s of ['ruah', 'outra', 'ruah', 'outra']) seq.push(em(s, () => one("SELECT tipo FROM imoveis WHERE codigo='AP0001'").tipo));
  assert.deepStrictEqual(seq, ['Apartamento', 'Casa', 'Apartamento', 'Casa']);
  ok('cache de tradução não mistura imobiliárias');

  console.log(`\nIsolamento entre imobiliárias: ${n} verificações, tudo certo.`);
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
