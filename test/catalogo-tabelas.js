// Multi-imobiliária · catálogo: toda tabela criada em src/db-sqlite.js e em sql/*.sql precisa estar
// classificada (comum ou privada) em src/tabelas.js. Tabela nova sem classificação faz este teste falhar.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { MAPA, COMUNS, PRIVADAS, classe } = require('../src/tabelas');

const raiz = path.join(__dirname, '..');
const fontes = [path.join(raiz, 'src/db-sqlite.js'), ...fs.readdirSync(path.join(raiz, 'sql')).filter((f) => f.endsWith('.sql')).map((f) => path.join(raiz, 'sql', f))];
const RE = /CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-z_]+"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;

const achadas = new Map();
for (const f of fontes) for (const m of fs.readFileSync(f, 'utf8').matchAll(RE)) {
  const t = m[1].toLowerCase();
  if (!achadas.has(t)) achadas.set(t, new Set());
  achadas.get(t).add(path.relative(raiz, f));
}
assert.ok(achadas.size >= 35, `poucas tabelas encontradas (${achadas.size}): a expressão de busca quebrou?`);

const fora = [...achadas.keys()].filter((t) => !classe(t));
assert.deepStrictEqual(fora, [], `Tabelas sem classificação em src/tabelas.js: ${fora.map((t) => `${t} (${[...achadas.get(t)].join(', ')})`).join('; ')}`);
console.log(`ok · ${achadas.size} tabelas encontradas em ${fontes.length} arquivos, todas classificadas`);

for (const t of COMUNS) assert.ok(!PRIVADAS.has(t), `tabela nas duas listas: ${t}`);
console.log('ok · nenhuma tabela é comum e privada ao mesmo tempo');

// tabelas classificadas que (ainda) não existem: só as previstas da plataforma
const previstas = new Set(['chaves_integracao']);
const sobram = Object.keys(MAPA).filter((t) => !achadas.has(t) && !previstas.has(t));
assert.deepStrictEqual(sobram, [], `Tabelas no mapa que não existem em lugar nenhum: ${sobram.join(', ')}`);
console.log(`ok · mapa sem tabela fantasma (${previstas.size} previstas para a plataforma)`);

// as mesmas tabelas nos dois bancos (SQLite do PC e Postgres online)
const lite = new Set([...achadas].filter(([, f]) => f.has('src/db-sqlite.js')).map(([t]) => t));
const pg = new Set([...achadas].filter(([, f]) => [...f].some((x) => x.startsWith('sql'))).map(([t]) => t));
const soLite = [...lite].filter((t) => !pg.has(t)), soPg = [...pg].filter((t) => !lite.has(t));
if (soLite.length || soPg.length) console.log(`aviso · só no SQLite: ${soLite.join(', ') || '—'} · só no Postgres: ${soPg.join(', ') || '—'}`);
console.log(`ok · comuns: ${[...achadas.keys()].filter((t) => classe(t) === 'comum').length} · privadas: ${[...achadas.keys()].filter((t) => classe(t) === 'privada').length}`);
console.log('\nCatálogo de tabelas: tudo certo.');
