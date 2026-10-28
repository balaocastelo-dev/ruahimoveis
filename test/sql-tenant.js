// Multi-imobiliária · tradutor de SQL com schema: prefixo certo em cada lugar onde aparece nome de tabela,
// nos dois dialetos (Postgres: base.x / "ruah".x · SQLite: x / ruah__x), e as recusas do modo estrito.
process.env.MULTI = '1';
delete process.env.MULTI_ESTRITO;
delete process.env.IMOBILIARIA_PADRAO;
const assert = require('assert');
const traduz = require('../src/sql-pg');
const { prefixar, traduzSqlite } = traduz;
const tenant = require('../src/tenant');

let n = 0;
const ok = (msg) => { n++; console.log('ok ·', msg); };
const PG = (sql, o) => prefixar(sql, { schema: 'ruah', dialeto: 'pg', estrito: false, ...o });
const LITE = (sql, o) => prefixar(sql, { schema: 'ruah', dialeto: 'sqlite', estrito: false, ...o });
const eq = (a, b, msg) => { assert.strictEqual(a, b); ok(msg); };

// ---------- Postgres ----------
eq(PG('SELECT * FROM imoveis WHERE id=?'), 'SELECT * FROM "ruah".imoveis WHERE id=?', 'pg · FROM privada');
eq(PG('SELECT * FROM condominios WHERE id=?'), 'SELECT * FROM base.condominios WHERE id=?', 'pg · FROM comum vai para base');
eq(PG('SELECT i.codigo, c.nome FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id'),
  'SELECT i.codigo, c.nome FROM "ruah".imoveis i LEFT JOIN base.condominios c ON c.id=i.condominio_id', 'pg · LEFT JOIN, alias.coluna intacto');
eq(PG('SELECT * FROM leads l INNER JOIN visitas v ON v.lead_id=l.id RIGHT OUTER JOIN imoveis AS im ON im.id=v.imovel_id CROSS JOIN pois JOIN usuarios u USING(id)'),
  'SELECT * FROM "ruah".leads l INNER JOIN "ruah".visitas v ON v.lead_id=l.id RIGHT OUTER JOIN "ruah".imoveis AS im ON im.id=v.imovel_id CROSS JOIN base.pois JOIN "ruah".usuarios u USING(id)',
  'pg · INNER / RIGHT OUTER / CROSS / JOIN simples, com AS e sem');
eq(PG('SELECT count(*) n FROM fisguei_anuncios a, oportunidades o WHERE a.oportunidade_id=o.id'),
  'SELECT count(*) n FROM base.fisguei_anuncios a, "ruah".oportunidades o WHERE a.oportunidade_id=o.id', 'pg · FROM com vírgula');
eq(PG('INSERT INTO leads(nome,telefone) VALUES(?,?)'), 'INSERT INTO "ruah".leads(nome,telefone) VALUES(?,?)', 'pg · INSERT INTO');
eq(PG('UPDATE imoveis SET valor=? WHERE imoveis.id=?'), 'UPDATE "ruah".imoveis SET valor=? WHERE imoveis.id=?', 'pg · UPDATE (tabela.coluna intacto)');
eq(PG('DELETE FROM sessoes WHERE expira_em < ?'), 'DELETE FROM "ruah".sessoes WHERE expira_em < ?', 'pg · DELETE FROM');
eq(PG('SELECT * FROM leads WHERE id IN (SELECT lead_id FROM visitas WHERE imovel_id IN (SELECT id FROM imoveis)) AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.lead_id=leads.id)'),
  'SELECT * FROM "ruah".leads WHERE id IN (SELECT lead_id FROM "ruah".visitas WHERE imovel_id IN (SELECT id FROM "ruah".imoveis)) AND NOT EXISTS (SELECT 1 FROM "ruah".mensagens m WHERE m.lead_id=leads.id)',
  'pg · subconsultas (IN, IN aninhado, NOT EXISTS)');
eq(PG('SELECT x.n FROM (SELECT count(*) n FROM leads) x'), 'SELECT x.n FROM (SELECT count(*) n FROM "ruah".leads) x', 'pg · subconsulta no FROM');
eq(PG('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor WHERE config.valor < ?'),
  'INSERT INTO "ruah".config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor WHERE config.valor < ?',
  'pg · ON CONFLICT … DO UPDATE (sem mexer em excluded/config.valor)');
eq(PG('INSERT INTO fachadas(ref,img) VALUES(?,?) ON CONFLICT(ref) DO UPDATE SET img=excluded.img'),
  'INSERT INTO base.fachadas(ref,img) VALUES(?,?) ON CONFLICT(ref) DO UPDATE SET img=excluded.img', 'pg · ON CONFLICT em tabela comum');
eq(PG("SELECT 'FROM leads JOIN imoveis' AS t, nome FROM leads WHERE nome LIKE '%update imoveis%' AND x <> 'it''s FROM usuarios'"),
  "SELECT 'FROM leads JOIN imoveis' AS t, nome FROM \"ruah\".leads WHERE nome LIKE '%update imoveis%' AND x <> 'it''s FROM usuarios'",
  'pg · palavras FROM/JOIN/UPDATE dentro de aspas não são mexidas (inclusive com aspa escapada)');
eq(PG('SELECT "imoveis".codigo FROM "imoveis"'), 'SELECT "imoveis".codigo FROM "ruah"."imoveis"', 'pg · identificador entre aspas como tabela; "x".coluna intacto');
eq(PG('SELECT * FROM outro.imoveis'), 'SELECT * FROM outro.imoveis', 'pg · nome já qualificado não muda');
eq(PG("SELECT EXTRACT(year FROM now()), substring(nome FROM 1 FOR 3), trim(both ' ' FROM nome) FROM leads"),
  "SELECT EXTRACT(year FROM now()), substring(nome FROM 1 FOR 3), trim(both ' ' FROM nome) FROM \"ruah\".leads", 'pg · FROM dentro de função (EXTRACT/substring/trim) não é tabela');
eq(PG('SELECT * FROM leads FOR UPDATE'), 'SELECT * FROM "ruah".leads FOR UPDATE', 'pg · FOR UPDATE não é tabela');
eq(PG('WITH ult AS (SELECT lead_id, max(id) m FROM mensagens GROUP BY lead_id) SELECT * FROM ult JOIN leads l ON l.id=ult.lead_id'),
  'WITH ult AS (SELECT lead_id, max(id) m FROM "ruah".mensagens GROUP BY lead_id) SELECT * FROM ult JOIN "ruah".leads l ON l.id=ult.lead_id', 'pg · CTE (WITH) não vira tabela');
eq(PG('CREATE TABLE IF NOT EXISTS visitas (id int, lead_id int REFERENCES leads(id) ON DELETE CASCADE ON UPDATE CASCADE, cond int REFERENCES condominios(id))'),
  'CREATE TABLE IF NOT EXISTS "ruah".visitas (id int, lead_id int REFERENCES "ruah".leads(id) ON DELETE CASCADE ON UPDATE CASCADE, cond int REFERENCES base.condominios(id))',
  'pg · DDL: CREATE TABLE e REFERENCES (privada e comum)');
eq(PG('CREATE INDEX IF NOT EXISTS ix_leads_tel ON leads(telefone)'), 'CREATE INDEX IF NOT EXISTS ix_leads_tel ON "ruah".leads(telefone)', 'pg · CREATE INDEX … ON');
eq(PG('SELECT * FROM leads', { schema: 'outra' }), 'SELECT * FROM "outra".leads', 'pg · outra imobiliária, outro schema');
eq(PG('SELECT * FROM condominios', { comum: 'plataforma' }), 'SELECT * FROM plataforma.condominios', 'pg · nome do schema comum configurável');

// traduz() completo (dialeto + schema), cache separado por schema
const a = tenant.comImobiliaria('ruah', () => traduz('SELECT * FROM leads WHERE nome LIKE ? AND id=?').text);
const b = tenant.comImobiliaria('outra', () => traduz('SELECT * FROM leads WHERE nome LIKE ? AND id=?').text);
eq(a, 'SELECT * FROM "ruah".leads WHERE nome ILIKE $1 AND id=$2', 'pg · traduz(): ILIKE + $n + schema');
eq(b, 'SELECT * FROM "outra".leads WHERE nome ILIKE $1 AND id=$2', 'pg · traduz(): cache com chave schema+sql (não devolve o da outra)');
eq(traduz('INSERT INTO leads(nome) VALUES(?)', 'ruah').text, 'INSERT INTO "ruah".leads(nome) VALUES($1) RETURNING id', 'pg · INSERT ganha RETURNING id');
eq(traduz('INSERT INTO config(chave,valor) VALUES(?,?)', 'ruah').text, 'INSERT INTO "ruah".config(chave,valor) VALUES($1,$2)', 'pg · tabela sem id continua sem RETURNING');
eq(traduz('SELECT * FROM leads').text, 'SELECT * FROM "ruah".leads', 'pg · sem contexto e sem estrito: imobiliária padrão (ruah)');
process.env.IMOBILIARIA_PADRAO = 'outra';
eq(traduz('SELECT * FROM leads').text, 'SELECT * FROM "outra".leads', 'pg · IMOBILIARIA_PADRAO muda o padrão');
delete process.env.IMOBILIARIA_PADRAO;

// ---------- SQLite ----------
eq(LITE('SELECT * FROM imoveis WHERE id=?'), 'SELECT * FROM ruah__imoveis AS imoveis WHERE id=?', 'sqlite · FROM privada (alias mantém imoveis.coluna)');
eq(LITE('SELECT * FROM condominios WHERE id=?'), 'SELECT * FROM condominios WHERE id=?', 'sqlite · comum fica sem prefixo');
eq(LITE('SELECT i.codigo FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id INNER JOIN usuarios AS u ON u.id=i.corretor_id CROSS JOIN leads'),
  'SELECT i.codigo FROM ruah__imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id INNER JOIN ruah__usuarios AS u ON u.id=i.corretor_id CROSS JOIN ruah__leads AS leads',
  'sqlite · JOINs (alias existente é respeitado)');
eq(LITE('INSERT INTO leads(nome) VALUES(?)'), 'INSERT INTO ruah__leads AS leads(nome) VALUES(?)', 'sqlite · INSERT INTO');
eq(LITE('UPDATE imoveis SET valor=? WHERE imoveis.id=?'), 'UPDATE ruah__imoveis AS imoveis SET valor=? WHERE imoveis.id=?', 'sqlite · UPDATE');
eq(LITE('UPDATE OR IGNORE leads SET etapa=?'), 'UPDATE OR IGNORE ruah__leads AS leads SET etapa=?', 'sqlite · UPDATE OR IGNORE');
eq(LITE('DELETE FROM sessoes WHERE expira_em < ?'), 'DELETE FROM ruah__sessoes AS sessoes WHERE expira_em < ?', 'sqlite · DELETE FROM');
eq(LITE('INSERT OR IGNORE INTO fisguei_bloqueios(telefone) VALUES(?)'), 'INSERT OR IGNORE INTO ruah__fisguei_bloqueios AS fisguei_bloqueios(telefone) VALUES(?)', 'sqlite · INSERT OR IGNORE');
eq(LITE('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor WHERE config.valor < ?'),
  'INSERT INTO ruah__config AS config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor WHERE config.valor < ?', 'sqlite · ON CONFLICT');
eq(LITE('SELECT * FROM leads WHERE id IN (SELECT lead_id FROM visitas v WHERE v.imovel_id IN (SELECT id FROM imoveis))'),
  'SELECT * FROM ruah__leads AS leads WHERE id IN (SELECT lead_id FROM ruah__visitas v WHERE v.imovel_id IN (SELECT id FROM ruah__imoveis AS imoveis))', 'sqlite · subconsultas');
eq(LITE("SELECT 'JOIN leads FROM imoveis' t FROM fisguei_anuncios a WHERE a.titulo LIKE '%from imoveis%'"),
  "SELECT 'JOIN leads FROM imoveis' t FROM fisguei_anuncios a WHERE a.titulo LIKE '%from imoveis%'", 'sqlite · textos com FROM/JOIN intactos');
eq(LITE('SELECT * FROM leads', { schema: 'outra' }), 'SELECT * FROM outra__leads AS leads', 'sqlite · outra imobiliária');
eq(LITE('CREATE TABLE IF NOT EXISTS visitas (lead_id INTEGER REFERENCES leads(id), c INTEGER REFERENCES condominios(id))'),
  'CREATE TABLE IF NOT EXISTS ruah__visitas (lead_id INTEGER REFERENCES ruah__leads(id), c INTEGER REFERENCES condominios(id))', 'sqlite · DDL e REFERENCES');
eq(LITE('CREATE INDEX IF NOT EXISTS ix_leads_tel ON leads(telefone)'), 'CREATE INDEX IF NOT EXISTS ruah__ix_leads_tel ON ruah__leads(telefone)', 'sqlite · índice da tabela privada ganha prefixo no nome');
eq(LITE('CREATE INDEX IF NOT EXISTS ix_fa_status ON fisguei_anuncios(status)'), 'CREATE INDEX IF NOT EXISTS ix_fa_status ON fisguei_anuncios(status)', 'sqlite · índice de tabela comum não muda');

// MULTI desligado: tradutor sem efeito
process.env.MULTI = '0';
eq(traduzSqlite('SELECT * FROM imoveis'), 'SELECT * FROM imoveis', 'sqlite · MULTI desligado: SQL intacto');
eq(traduz('SELECT * FROM imoveis WHERE id=?').text, 'SELECT * FROM imoveis WHERE id=$1', 'pg · MULTI desligado: só o dialeto, como antes');
process.env.MULTI = '1';

// ---------- modo estrito ----------
const erro = (fn, code, msg) => { assert.throws(fn, (e) => e.code === code); ok(msg); };
erro(() => PG('SELECT * FROM tabela_nova', { estrito: true }), 'TABELA_FORA_DO_MAPA', 'pg · estrito: tabela fora do mapa → erro');
erro(() => LITE('SELECT * FROM leads l JOIN tabela_nova t ON t.id=l.id', { estrito: true }), 'TABELA_FORA_DO_MAPA', 'sqlite · estrito: tabela fora do mapa no JOIN → erro');
erro(() => PG('SELECT * FROM leads', { schema: null, estrito: true }), 'SEM_IMOBILIARIA', 'pg · privada sem imobiliária → erro');
erro(() => LITE('UPDATE imoveis SET valor=1', { schema: null, estrito: true }), 'SEM_IMOBILIARIA', 'sqlite · privada sem imobiliária → erro');
eq(PG('SELECT * FROM condominios', { schema: null, estrito: true }), 'SELECT * FROM base.condominios', 'pg · estrito: comum sem imobiliária é permitida');
eq(PG('SELECT * FROM tabela_nova'), 'SELECT * FROM tabela_nova', 'fora do estrito: tabela desconhecida passa sem prefixo');
process.env.MULTI_ESTRITO = '1';
erro(() => traduz('SELECT * FROM leads'), 'SEM_IMOBILIARIA', 'pg · traduz() estrito sem contexto → erro');
erro(() => traduzSqlite('SELECT * FROM leads'), 'SEM_IMOBILIARIA', 'sqlite · traduzSqlite() estrito sem contexto → erro');
eq(tenant.comImobiliaria('ruah', () => traduzSqlite('SELECT * FROM leads')), 'SELECT * FROM ruah__leads AS leads', 'sqlite · estrito com contexto funciona');
erro(() => tenant.comImobiliaria('ruah', () => traduz('SELECT * FROM xyz')), 'TABELA_FORA_DO_MAPA', 'pg · traduz() estrito: fora do mapa → erro');
delete process.env.MULTI_ESTRITO;

// slug/schema inválido nunca entra no SQL
assert.throws(() => tenant.comImobiliaria('ru"ah', () => 1)); assert.throws(() => tenant.comImobiliaria('a__b', () => 1));
assert.throws(() => PG('SELECT 1 FROM leads', { schema: 'x"; drop' }));
ok('slug/schema inválido recusado');

// host → imobiliária
process.env.IMOBILIARIA_HOSTS = 'ruah.exemplo.com=ruah, outra.exemplo.com:8080=outra';
eq(tenant.porHost('outra.exemplo.com').slug, 'outra', 'host mapeado vai para a imobiliária certa');
eq(tenant.porHost('OUTRA.exemplo.com:443').slug, 'outra', 'host sem diferenciar maiúsculas e porta');
eq(tenant.porHost('qualquer.com').slug, 'ruah', 'host desconhecido cai na IMOBILIARIA_PADRAO');
delete process.env.IMOBILIARIA_HOSTS;

console.log(`\nTradutor com schema: ${n} verificações, tudo certo.`);
