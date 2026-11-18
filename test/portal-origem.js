// Reproduz o 500 de produção: SELECT i.origem numa imoveis sem essa coluna
// (Postgres 42703 no ar; aqui o SQLite diz "no such column"). O portal tem de
// responder mesmo assim. A lista da Caixa ausente também não pode derrubar /oportunidades.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-origem-'));
process.env.HOUSE_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO = 'false';
process.env.PORTAL = 'false';
delete process.env.DATABASE_URL;
delete process.env.TEMA;
delete process.env.PORTAL_SOMENTE;
process.env.CLIENTE_NOME = 'Imobiliária';

const { one, all } = require('../src/db');
const dados = require('../src/portal/dados');

assert.equal(dados.colunaAusente({ code: '42703', message: 'column i.origem does not exist' }), 'origem');
assert.equal(dados.colunaAusente({ message: 'no such column: i.origem' }), 'origem');
assert.equal(dados.colunaAusente({ code: '42P01', message: 'relation "caixa_imoveis" does not exist' }), null);
const sem = dados.tiraColuna('SELECT i.valor_locacao, i.origem, c.nome FROM imoveis i', 'origem');
assert.ok(!/\borigem\b/.test(sem), sem);
assert.ok(/i\.valor_locacao,/.test(sem), sem);
console.log('ok · reconhece 42703 de i.origem e não confunde com a tabela da Caixa');

let estourou = false;
try { all('SELECT i.origem FROM imoveis i LIMIT 1'); } catch (e) { estourou = /no such column/i.test(e.message); }
assert.ok(estourou, 'o banco de teste precisa nascer sem imoveis.origem, como produção');

one(`INSERT INTO imoveis(codigo,tipo,status,bairro,cidade,uf,quartos,valor,descricao) VALUES('AP7701','Apartamento','publicado','Cambuí','Campinas','SP',2,800000,'Apartamento de teste sem a coluna origem.')`);
const id = one("SELECT id FROM imoveis WHERE codigo='AP7701'").id;
one("INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?, 'Fotos', 'f.jpg', 'image/jpeg', 10, 'nao.jpg')", id);
const lista = dados.imoveisAVenda();
assert.ok(lista.some((i) => i.codigo === 'AP7701'), 'imoveisAVenda não pode lançar quando origem não existe');
const semColuna = dados.imovelAVenda('AP7701');
assert.equal(semColuna.codigo, 'AP7701');
assert.equal(semColuna.origem, null);
assert.equal(semColuna.finalidade, 'venda');
console.log('ok · vitrine lê o imóvel mesmo sem imoveis.origem');

one("UPDATE imoveis SET finalidade='locacao', valor_locacao=3200 WHERE codigo='AP7701'");
one('ALTER TABLE imoveis ADD COLUMN origem TEXT');
one("UPDATE imoveis SET origem='caixa' WHERE codigo='AP7701'");
const cheio = dados.imovelAVenda('AP7701');
assert.equal(cheio.finalidade, 'locacao');
assert.equal(cheio.valor_locacao, 3200);
assert.equal(cheio.origem, 'caixa');
const locacao = [{ imovel: cheio }].filter((x) => {
  const f = String(x.imovel.finalidade || 'venda');
  return f === 'locacao' || f === 'venda_locacao';
});
const venda = [{ imovel: cheio }].filter((x) => {
  const f = String(x.imovel.finalidade || 'venda');
  return f === 'venda' || f === 'venda_locacao';
});
assert.equal(locacao.length, 1);
assert.equal(venda.length, 0);
console.log('ok · montar copia finalidade, valor_locacao e origem para o filtro');

const app = require('../server');
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
(async () => {
  try {
    for (const caminho of ['/imoveis', '/imoveis/dados.json', '/imoveis/favoritos', '/imoveis/signature', '/imoveis/revista', '/oportunidades']) {
      const r = await fetch(base + caminho);
      const t = await r.text();
      assert.equal(r.status, 200, `${caminho} ${r.status} ${t.slice(0, 160)}`);
    }
    const json = await (await fetch(base + '/imoveis/dados.json')).json();
    assert.ok(json.imoveis.some((i) => i.codigo === 'AP7701'));
    console.log('ok · /imoveis, dados.json, signature, favoritos, revista e /oportunidades respondem 200');
  } finally { srv.close(); }

  const script = path.join(__dirname, '..', 'scripts', 'corrigir-schema-tenants.mjs');
  const recusado = spawnSync(process.execPath, [script, '--tenants', 'l7minhacasa'], { encoding: 'utf8' });
  assert.notEqual(recusado.status, 0);
  assert.match(`${recusado.stdout}\n${recusado.stderr}`, /não entra/);
  const semUrl = spawnSync(process.execPath, [script, '--tenants', 'ondemorar'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  assert.notEqual(semUrl.status, 0);
  assert.match(`${semUrl.stdout}\n${semUrl.stderr}`, /DATABASE_URL/);
  assert.doesNotMatch(`${semUrl.stdout}\n${semUrl.stderr}`, /postgres:\/\//);
  console.log('ok · o script recusa as L7 que saem e não roda sem DATABASE_URL');
})().catch((e) => { console.error(e); process.exit(1); });
