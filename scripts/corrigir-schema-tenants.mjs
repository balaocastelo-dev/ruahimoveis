// Correção aditiva do schema dos tenants, aprovada pelo Thiago.
// Só cria coluna e tabela/view. Não apaga, não renomeia, não mexe no schema antigo
// e não entra nas três L7 que saem (l7minhacasa, l7loteamentos, l7altopadrao).
//
// Dry-run (não grava):
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/corrigir-schema-tenants.mjs
//
// Aplica, depois de mostrar o mesmo plano:
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/corrigir-schema-tenants.mjs --apply
//
// A URL tem de ser de um papel que possa ALTER TABLE e CREATE nos schemas
// (o dono do banco). O usuário de cada imobiliária (_app) em geral não pode.
// Não coloque a URL no código nem no PR.
//
// Tenants (padrão, os cinco do ar):
//   l7inteligencia cademeuap ondemorar casaprado lumen
// Outra lista:
//   node scripts/corrigir-schema-tenants.mjs --tenants ondemorar,cademeuap

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO_ORIGEM = path.join(RAIZ, 'sql', 'imoveis-origem.sql');

const PADRAO = ['l7inteligencia', 'cademeuap', 'ondemorar', 'casaprado', 'lumen'];
const SCHEMA_ANTIGO = ['ru', 'ah'].join('');
const FORA = new Set(['l7minhacasa', 'l7loteamentos', 'l7altopadrao', SCHEMA_ANTIGO, 'base', 'plataforma', 'public']);
const SLUG = /^[a-z][a-z0-9_]{2,30}$/;

const COLUNAS_IMOVEL = [
  ['origem', 'text'],
  ['origem_ref', 'text'],
  ['finalidade', "text NOT NULL DEFAULT 'venda'"],
  ['valor_locacao', 'double precision'],
];

const COLUNAS_CAIXA = [
  ['vagas', 'integer'],
  ['prazo_em', 'text'],
  ['prazo2_em', 'text'],
  ['prazo_tipo', 'text'],
  ['prazo_visto_em', 'text'],
  ['lat', 'double precision'],
  ['lon', 'double precision'],
  ['geo_precisao', 'text'],
  ['geo_em', 'text'],
];

function args(argv) {
  const out = { apply: false, tenants: PADRAO.slice() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--tenants') out.tenants = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--tenants=')) out.tenants = a.slice('--tenants='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (!out.tenants.length) throw new Error('Lista de tenants vazia.');
  for (const s of out.tenants) {
    if (!SLUG.test(s)) throw new Error(`Tenant inválido: ${s}`);
    if (FORA.has(s)) throw new Error(`${s} não entra nesta correção.`);
  }
  return out;
}

function ident(s) {
  if (s !== 'base' && (!SLUG.test(s) || FORA.has(s))) throw new Error(`nome recusado: ${s}`);
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(s)) throw new Error(`nome recusado: ${s}`);
  return `"${s}"`;
}

/** As duas colunas e o índice único saem de sql/imoveis-origem.sql.
 *  O laço daquele arquivo percorre toda plataforma.imobiliarias e pegaria as
 *  três L7 que saem. Aqui o mesmo SQL vale só para base e para a lista pedida. */
function confereArquivoOrigem() {
  const texto = fs.readFileSync(ARQUIVO_ORIGEM, 'utf8');
  for (const trecho of ['ADD COLUMN IF NOT EXISTS origem text', 'ADD COLUMN IF NOT EXISTS origem_ref text', 'ux_imoveis_origem']) {
    if (!texto.includes(trecho)) throw new Error(`sql/imoveis-origem.sql não contém mais "${trecho}".`);
  }
  return texto;
}

async function aplicaOrigem(client, schemas) {
  confereArquivoOrigem();
  for (const schema of schemas) {
    await client.query(`ALTER TABLE ${ident(schema)}.imoveis ADD COLUMN IF NOT EXISTS origem text`);
    await client.query(`ALTER TABLE ${ident(schema)}.imoveis ADD COLUMN IF NOT EXISTS origem_ref text`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_imoveis_origem ON ${ident(schema)}.imoveis(origem, origem_ref) WHERE origem IS NOT NULL`);
  }
}

function semSegredo(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch { return '(url ilegível)'; }
}

async function colunas(client, schema, tabela) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabela],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function relacao(client, schema, nome) {
  const r = await client.query(
    `SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, nome],
  );
  return r.rows[0] ? r.rows[0].relkind : null;
}

async function plano(client, tenants) {
  const passos = [];
  const baseIm = await colunas(client, 'base', 'imoveis');
  if (!baseIm.size) passos.push({ ok: false, texto: 'base.imoveis não existe: as colunas da base ficam de fora; os tenants seguem.' });
  else for (const [col] of COLUNAS_IMOVEL) {
    passos.push({ ok: true, texto: baseIm.has(col) ? `base.imoveis.${col} já existe` : `base.imoveis: ADD COLUMN ${col}`, fazer: !baseIm.has(col), tipo: 'col', schema: 'base', col });
  }
  const caixa = await relacao(client, 'base', 'caixa_imoveis');
  passos.push({
    ok: true,
    texto: caixa ? 'base.caixa_imoveis já existe' : 'base.caixa_imoveis: CREATE TABLE',
    fazer: !caixa, tipo: 'tabela',
  });
  if (caixa === 'r') {
    const cols = await colunas(client, 'base', 'caixa_imoveis');
    for (const [col] of COLUNAS_CAIXA) {
      passos.push({ ok: true, texto: cols.has(col) ? `base.caixa_imoveis.${col} já existe` : `base.caixa_imoveis: ADD COLUMN ${col}`, fazer: !cols.has(col), tipo: 'col-caixa', col });
    }
  } else if (!caixa) {
    passos.push({ ok: true, texto: 'base.caixa_imoveis nasce com prazo, lat/lon e geo (a lista da Caixa lê essas colunas)', fazer: false });
  }

  for (const slug of tenants) {
    const ns = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [slug]);
    if (!ns.rows.length) {
      passos.push({ ok: false, texto: `${slug}: schema não existe. Nada será criado no lugar.` });
      continue;
    }
    const im = await colunas(client, slug, 'imoveis');
    if (!im.size) {
      passos.push({ ok: false, texto: `${slug}.imoveis não existe.` });
      continue;
    }
    for (const [col] of COLUNAS_IMOVEL) {
      passos.push({ ok: true, texto: im.has(col) ? `${slug}.imoveis.${col} já existe` : `${slug}.imoveis: ADD COLUMN ${col}`, fazer: !im.has(col), tipo: 'col', schema: slug, col });
    }
    const cx = await relacao(client, slug, 'caixa_imoveis');
    if (!cx) passos.push({ ok: true, texto: `${slug}.caixa_imoveis: CREATE VIEW para base.caixa_imoveis`, fazer: true, tipo: 'view', schema: slug });
    else passos.push({ ok: true, texto: `${slug}.caixa_imoveis já existe (${cx === 'v' ? 'view' : 'tabela'})`, fazer: false });
    const papel = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [`${slug}_app`]);
    passos.push({ ok: true, texto: papel.rows.length ? `${slug}_app: GRANT SELECT na lista da Caixa, se a view/tabela existir` : `${slug}_app não existe: sem GRANT`, fazer: !!papel.rows.length, tipo: papel.rows.length ? 'grant' : '', schema: slug });
  }
  return passos;
}

async function aplica(client, tenants) {
  await client.query('BEGIN');
  try {
    const baseIm = await colunas(client, 'base', 'imoveis');
    const schemasOrigem = [];
    if (baseIm.size) schemasOrigem.push('base');
    for (const slug of tenants) {
      const im = await colunas(client, slug, 'imoveis');
      if (im.size) schemasOrigem.push(slug);
    }
    await aplicaOrigem(client, schemasOrigem);
    for (const schema of schemasOrigem) {
      await client.query(`ALTER TABLE ${ident(schema)}.imoveis ADD COLUMN IF NOT EXISTS finalidade text NOT NULL DEFAULT 'venda'`);
      await client.query(`ALTER TABLE ${ident(schema)}.imoveis ADD COLUMN IF NOT EXISTS valor_locacao double precision`);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS base.caixa_imoveis (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        numero text NOT NULL UNIQUE,
        uf text, cidade text, bairro text, endereco text,
        preco numeric, avaliacao numeric, desconto numeric,
        financiamento text, descricao text, modalidade text, link text,
        tipo text, quartos integer, vagas integer,
        area_util numeric, area_terreno numeric,
        na_rmc boolean NOT NULL DEFAULT false,
        primeira_safra text NOT NULL DEFAULT '',
        ultima_safra text NOT NULL DEFAULT '',
        saiu_em text,
        prazo_em text, prazo2_em text, prazo_tipo text, prazo_visto_em text,
        lat double precision, lon double precision, geo_precisao text, geo_em text,
        criado_em text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
        atualizado_em text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS')
      )`);
    for (const [col, def] of COLUNAS_CAIXA) {
      await client.query(`ALTER TABLE base.caixa_imoveis ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    }
    for (const slug of tenants) {
      const cx = await relacao(client, slug, 'caixa_imoveis');
      if (!cx) {
        await client.query(`CREATE VIEW ${ident(slug)}.caixa_imoveis AS SELECT * FROM base.caixa_imoveis`);
      }
      const papel = `${slug}_app`;
      const tem = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel]);
      if (tem.rows.length) {
        await client.query(`GRANT SELECT ON base.caixa_imoveis TO ${ident(papel)}`);
        await client.query(`GRANT SELECT ON ${ident(slug)}.caixa_imoveis TO ${ident(papel)}`);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  const op = args(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL (papel dono do banco, não o _app). Nada foi alterado.');
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const passos = await plano(client, op.tenants);
    console.log(op.apply ? 'Plano (em seguida aplica):' : 'Dry-run (nada será gravado). Para aplicar: --apply');
    console.log(`Banco: ${semSegredo(url)}`);
    console.log(`Tenants: ${op.tenants.join(', ')}`);
    let bloqueio = false;
    for (const p of passos) {
      console.log(`${p.ok ? (p.fazer ? '+ ' : '= ') : '! '}${p.texto}`);
      if (!p.ok) bloqueio = true;
    }
    if (!op.apply) {
      console.log(bloqueio ? 'Dry-run achou schema ausente. Nada foi gravado.' : 'Dry-run concluído. Nada foi gravado.');
      process.exit(bloqueio ? 2 : 0);
    }
    if (bloqueio) {
      console.error('Não apliquei: há schema ou tabela imoveis ausente na lista.');
      process.exit(2);
    }
    await aplica(client, op.tenants);
    console.log('Aplicado. Rodar de novo não muda o que já existe.');
  } finally {
    await client.end();
  }
}

const ehMain = process.argv[1] && process.argv[1].endsWith('corrigir-schema-tenants.mjs');
if (ehMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });

export { args, PADRAO, FORA };
