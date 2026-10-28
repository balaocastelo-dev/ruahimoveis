// Traduz o SQL escrito para o SQLite para o dialeto do Postgres.
// Cobre exatamente o que o sistema usa: placeholders "?", datetime/date('now',...), date(coluna),
// LIKE sem diferenciar maiúsculas, e "RETURNING id" para devolver o id inserido.
const TZ = "(now() AT TIME ZONE 'America/Sao_Paulo')";
const SEM_ID = new Set(['sessoes', 'tentativas_login', 'config', 'arquivos_dados', 'fisguei_bloqueios', 'condominio_cache', 'predios3d', 'mapa3d', 'fachadas', 'bairros', 'bairro_commons', 'anuncio_andamento', 'condominio_alvos', 'bairro_ajustes']);
const cache = new Map();

function agoraComModificadores(func, mods) {
  let expr = TZ;
  for (const m of mods) {
    const s = m.trim().toLowerCase();
    if (s === 'localtime' || s === 'utc') continue;
    if (s === 'start of day') { expr = `date_trunc('day', ${expr})`; continue; }
    const r = s.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*(second|minute|hour|day|month|year)s?$/);
    if (!r) throw new Error(`Modificador de data não suportado: ${m}`);
    expr = `(${expr} ${r[1]} interval '${r[2]} ${r[3]}')`;
  }
  return `to_char(${expr}, '${func === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH24:MI:SS'}')`;
}

function traduzir(sql) {
  let s = sql;
  // datetime('now', 'localtime', '+7 day', ...) / date('now', ...)
  s = s.replace(/\b(datetime|date)\(\s*'now'((?:\s*,\s*'[^']*')*)\s*\)/gi, (_, f, resto) => {
    const mods = [...resto.matchAll(/'([^']*)'/g)].map((x) => x[1]);
    return agoraComModificadores(f.toLowerCase(), mods);
  });
  // date(coluna) → primeiros 10 caracteres (datas guardadas como texto)
  s = s.replace(/\bdate\(\s*([a-z_][\w.]*)\s*\)/gi, 'substr($1,1,10)');
  // número do código do imóvel (AP0012 → 12) sem quebrar com códigos fora do padrão
  s = s.replace(/CAST\(substr\(codigo,\s*3\)\s+AS\s+INTEGER\)/gi, "CAST(NULLIF(regexp_replace(substr(codigo,3),'[^0-9]','','g'),'') AS INTEGER)");

  // percorre o texto fora das aspas: troca ? por $n e LIKE por ILIKE
  let out = '', n = 0, i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      const fim = s.indexOf("'", i + 1);
      let j = fim;
      while (j !== -1 && s[j + 1] === "'") j = s.indexOf("'", j + 2);
      const ate = j === -1 ? s.length : j + 1;
      out += s.slice(i, ate); i = ate; continue;
    }
    if (ch === '?') { out += '$' + (++n); i++; continue; }
    const m = /^\bLIKE\b/i.exec(s.slice(i, i + 5)) && (i === 0 || !/[\w]/.test(s[i - 1])) && !/[\w]/.test(s[i + 4] || '');
    if (m) { out += 'ILIKE'; i += 4; continue; }
    out += ch; i++;
  }

  const ins = out.match(/^\s*INSERT\s+INTO\s+([a-z_]+)/i);
  if (ins && !/\bRETURNING\b/i.test(out) && !SEM_ID.has(ins[1].toLowerCase())) out += ' RETURNING id';
  return { text: out };
}

// ======================================================================================
// Plataforma multi-imobiliária (fase 1): prefixo de schema/tabela em cada nome de tabela.
// Não usamos search_path (com pool/pooler a conexão é compartilhada entre imobiliárias): o nome da
// tabela já sai qualificado no texto do SQL.
//   Postgres: tabela comum → base.x (ou SCHEMA_COMUM) · tabela privada → "<schema>".x
//   SQLite:   tabela comum → x (sem prefixo)         · tabela privada → <schema>__x AS x
// Só vale com MULTI=1; desligado (padrão) o SQL sai exatamente como hoje.
// ======================================================================================
const tabelas = require('./tabelas');
const tenant = require('./tenant');

const ID = /[A-Za-z_][A-Za-z0-9_$]*/y;
// palavras que, depois do nome da tabela, NÃO são alias
const NAO_ALIAS = new Set(['where', 'set', 'on', 'using', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'natural', 'join',
  'order', 'group', 'having', 'limit', 'offset', 'union', 'intersect', 'except', 'values', 'select', 'default', 'returning',
  'window', 'indexed', 'not', 'for', 'do', 'as', 'lateral', 'only', 'fetch', 'with', 'tablesample', 'add', 'rename', 'drop',
  'alter', 'owner', 'enable', 'disable']);
// palavras que, antes de "(", indicam subconsulta/lista (e não chamada de função)
const NAO_FUNCAO = new Set(['in', 'exists', 'as', 'from', 'join', 'on', 'and', 'or', 'not', 'where', 'select', 'values', 'set',
  'then', 'else', 'when', 'case', 'returning', 'any', 'all', 'some', 'lateral', 'using', 'by', 'union', 'intersect', 'except',
  'into', 'with', 'having', 'is', 'like', 'ilike', 'between', 'conflict', 'distinct', 'recursive', 'materialized', 'over',
  'filter', 'within', 'table', 'references', 'unique', 'check', 'key', 'limit', 'offset', 'glob', 'match', 'regexp', 'escape']);

function tokens(sql) {
  const out = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i], c2 = sql.slice(i, i + 2);
    let j, t;
    if (ch === "'") { // texto: '' é aspa escapada
      j = i + 1;
      while (j < sql.length) { if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } j++; break; } j++; }
      t = 'str';
    } else if (ch === '"') {
      j = i + 1;
      while (j < sql.length) { if (sql[j] === '"') { if (sql[j + 1] === '"') { j += 2; continue; } j++; break; } j++; }
      t = 'qid';
    } else if (c2 === '--') { j = sql.indexOf('\n', i); j = j === -1 ? sql.length : j; t = 'ws'; }
    else if (c2 === '/*') { j = sql.indexOf('*/', i + 2); j = j === -1 ? sql.length : j + 2; t = 'ws'; }
    else if (ch === '$' && /^\$([A-Za-z_]\w*)?\$/.test(sql.slice(i))) { // $$ … $$ (corpo de função no DDL)
      const tag = sql.slice(i).match(/^\$([A-Za-z_]\w*)?\$/)[0];
      j = sql.indexOf(tag, i + tag.length); j = j === -1 ? sql.length : j + tag.length; t = 'str';
    } else if (/\s/.test(ch)) { j = i + 1; while (j < sql.length && /\s/.test(sql[j])) j++; t = 'ws'; }
    else if (/[A-Za-z_]/.test(ch)) { ID.lastIndex = i; ID.exec(sql); j = ID.lastIndex; t = 'word'; }
    else if (/[0-9]/.test(ch)) { j = i + 1; while (j < sql.length && /[\w.]/.test(sql[j])) j++; t = 'num'; }
    else { j = i + 1; t = 'sym'; }
    out.push({ t, v: sql.slice(i, j) });
    i = j;
  }
  return out;
}

function erroTenant(msg, code) { const e = new Error(msg); e.code = code; return e; }

// Prefixa as tabelas de um SQL. opcoes: { schema, dialeto: 'pg'|'sqlite', estrito, comum }
function prefixar(sql, opcoes = {}) {
  const dialeto = opcoes.dialeto || 'pg';
  const schema = opcoes.schema === undefined ? tenant.schemaSql() : opcoes.schema;
  const estrito = opcoes.estrito === undefined ? tenant.estrito() : opcoes.estrito;
  const comum = opcoes.comum || process.env.SCHEMA_COMUM || 'base';
  if (schema != null && (!tenant.SLUG_OK.test(schema) || schema.includes('__'))) throw erroTenant(`Schema inválido: ${schema}`, 'SCHEMA_INVALIDO');

  const tk = tokens(sql);
  const sig = []; // índices dos tokens significativos (sem espaço/comentário)
  tk.forEach((x, i) => { if (x.t !== 'ws') sig.push(i); });
  const low = (k) => (k >= 0 && k < sig.length && tk[sig[k]].t === 'word' ? tk[sig[k]].v.toLowerCase() : null);
  const val = (k) => (k >= 0 && k < sig.length ? tk[sig[k]].v : null);

  // nomes de CTE (WITH x AS (…)) não são tabelas
  const ctes = new Set();
  for (let k = 0; k < sig.length; k++) {
    if (low(k) === 'as' && val(k + 1) === '(') {
      let a = k - 1;
      if (val(a) === ')') { let d = 0; for (; a >= 0; a--) { if (val(a) === ')') d++; else if (val(a) === '(' && --d === 0) break; } a--; }
      if (low(a) === 'materialized') a -= low(a - 1) === 'not' ? 2 : 1;
      const p = low(a - 1);
      if (low(a) && (p === 'with' || p === 'recursive' || val(a - 1) === ',')) ctes.add(low(a));
    }
  }

  const parens = []; // pilha: true = parêntese de função (FROM ali dentro não é tabela: EXTRACT, substring, trim…)
  let criaIndice = null; // { k do nome do índice } dentro de CREATE INDEX
  let stmtCreate = false;

  // troca o nome em sig[k]; devolve o próximo k depois do nome (e do alias)
  function troca(k, ctx) {
    const tok = tk[sig[k]];
    let nome;
    if (tok.t === 'word') nome = tok.v;
    else if (tok.t === 'qid') nome = tok.v.slice(1, -1).replace(/""/g, '"');
    else return k;
    if (val(k + 1) === '.') return k + 3; // já qualificado (schema.tabela)
    if (tok.t === 'word' && val(k + 1) === '(' && ctx === 'from') return k; // função de tabela: json_each(…)
    const n = nome.toLowerCase();
    if (tok.t === 'word' && ctes.has(n)) return k + 1;
    if (tok.t === 'word' && ctx !== 'ddl' && NAO_ALIAS.has(n)) return k; // palavra-chave, não tabela
    const c = tabelas.classe(n);
    if (!c) {
      if (estrito) throw erroTenant(`Tabela fora do mapa de classificação (src/tabelas.js): ${nome}`, 'TABELA_FORA_DO_MAPA');
      return k + 1;
    }
    if (c === 'privada' && !schema) throw erroTenant(`Tabela privada "${nome}" sem imobiliária no contexto.`, 'SEM_IMOBILIARIA');
    // há alias logo depois?
    const prox = low(k + 1);
    const semAlias = ctx === 'ddl' || ctx === 'indice';
    const temAlias = !semAlias && (prox === 'as' || (!!prox && !NAO_ALIAS.has(prox)));
    if (dialeto === 'pg') {
      tok.v = c === 'comum' ? `${comum}.${tok.t === 'qid' ? tok.v : n}` : `"${schema}".${tok.t === 'qid' ? tok.v : n}`;
    } else if (c === 'privada') {
      tok.v = `${schema}__${n}`;
      if (!semAlias && !temAlias) tok.v += ` AS ${n}`; // mantém "tabela.coluna" funcionando
      if (ctx === 'indice' && criaIndice != null) { const it = tk[sig[criaIndice]]; it.v = `${schema}__${it.v}`; }
    }
    return temAlias ? k + (prox === 'as' ? 3 : 2) : k + 1;
  }

  for (let k = 0; k < sig.length; k++) {
    const tok = tk[sig[k]];
    if (tok.t === 'sym') {
      if (tok.v === '(') { const a = low(k - 1); parens.push(!!a && !NAO_FUNCAO.has(a)); }
      else if (tok.v === ')') parens.pop();
      else if (tok.v === ';') { parens.length = 0; criaIndice = null; stmtCreate = false; }
      continue;
    }
    if (tok.t !== 'word' || val(k - 1) === '.') continue;
    const w = tok.v.toLowerCase();
    const emFuncao = parens.length && parens[parens.length - 1];
    if (w === 'create') { stmtCreate = true; continue; }
    if (w === 'index' && stmtCreate) {
      let a = k + 1;
      if (low(a) === 'concurrently') a++;
      if (low(a) === 'if') a += low(a + 1) === 'not' ? 3 : 2;
      criaIndice = low(a + 1) === 'on' ? a : null;
      continue;
    }
    if (w === 'on' && stmtCreate && low(k - 1) !== 'conflict' && (criaIndice != null || low(k - 2) === 'index')) {
      let a = k + 1; if (low(a) === 'only') a++;
      troca(a, 'indice'); criaIndice = null; continue;
    }
    if (w === 'from' || w === 'join') {
      if (emFuncao || low(k - 1) === 'distinct') continue;
      let a = k + 1;
      if (low(a) === 'only' || low(a) === 'lateral') a++;
      for (;;) {
        if (val(a) === '(' || a >= sig.length) break;
        const b = troca(a, 'from');
        if (b === a) break;
        if (val(b) === ',' && w === 'from') { a = b + 1; continue; }
        break;
      }
      continue;
    }
    if (w === 'into') { if (!emFuncao) troca(k + 1, 'into'); continue; }
    if (w === 'update') {
      const a0 = low(k - 1);
      if (a0 === 'do' || a0 === 'for' || a0 === 'key' || a0 === 'on') continue; // DO UPDATE SET / FOR UPDATE / ON UPDATE CASCADE
      let a = k + 1; if (low(a) === 'or') a += 2; if (low(a) === 'only') a++;
      troca(a, 'from'); continue;
    }
    if (w === 'table') {
      const a0 = low(k - 1);
      if (!['create', 'temp', 'temporary', 'alter', 'drop', 'unlogged', 'truncate'].includes(a0)) continue;
      let a = k + 1;
      if (low(a) === 'if') a += low(a + 1) === 'not' ? 3 : 2;
      if (low(a) === 'only') a++;
      troca(a, 'ddl'); continue;
    }
    if (w === 'references') { troca(k + 1, 'ddl'); continue; }
  }
  return tk.map((x) => x.v).join('');
}

const ligado = () => tenant.multi();
const chave = (d, schema, sql) => `${d}\u0000${schema || ''}\u0000${process.env.SCHEMA_COMUM || ''}\u0000${tenant.estrito() ? 1 : 0}\u0000${sql}`;

// Postgres: dialeto + (com MULTI=1) prefixo de schema. Cache por schema + SQL.
function traduz(sql, schema) {
  if (!ligado()) {
    let r = cache.get(sql);
    if (!r) { r = traduzir(sql); if (cache.size < 5000) cache.set(sql, r); }
    return r;
  }
  if (schema === undefined) schema = tenant.schemaSql();
  const k = chave('pg', schema, sql);
  let r = cache.get(k);
  if (!r) {
    const t = traduzir(sql);
    r = { text: prefixar(t.text, { schema, dialeto: 'pg' }) };
    if (cache.size < 5000) cache.set(k, r);
  }
  return r;
}

// SQLite: com MULTI desligado devolve o SQL intacto; ligado, prefixa as tabelas privadas (<schema>__tabela).
function traduzSqlite(sql, schema) {
  if (!ligado()) return sql;
  if (schema === undefined) schema = tenant.schemaSql();
  const k = chave('lite', schema, sql);
  let r = cache.get(k);
  if (r === undefined) { r = prefixar(sql, { schema, dialeto: 'sqlite' }); if (cache.size < 5000) cache.set(k, r); }
  return r;
}

// Nome físico de uma tabela no SQLite (para PRAGMA table_info e afins, que o tradutor não reescreve).
function nomeSqlite(tabela, schema) {
  if (!ligado() || tabelas.classe(tabela) !== 'privada') return tabela;
  if (schema === undefined) schema = tenant.schemaSql();
  if (!schema) throw erroTenant(`Tabela privada "${tabela}" sem imobiliária no contexto.`, 'SEM_IMOBILIARIA');
  return `${schema}__${tabela}`;
}

module.exports = traduz;
module.exports.nomeSqlite = nomeSqlite;
module.exports.traduzir = traduzir;
module.exports.prefixar = prefixar;
module.exports.traduzSqlite = traduzSqlite;
module.exports.tokens = tokens;
