// Cria a imobiliária Oportunidades Caixa. Aditivo e idempotente: rodar de novo
// não apaga linha, tabela, view nem papel. Dry-run é o padrão; --apply grava.
//
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/criar-tenant-oportunidades.mjs
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/criar-tenant-oportunidades.mjs --apply
//
// A URL é a do dono do banco (cria schema, papel e view). Não é o
// oportunidades_app e não é o Postgres do ProLiant. A senha do papel novo, quando
// gerada, sai uma vez no terminal. Não fica neste arquivo.
//
// O que faz, se ainda não existir:
//   plataforma.imobiliarias  slug oportunidades, nome "Oportunidades Caixa"
//   schema oportunidades     tabelas copiadas do schema compartilhado
//   papel oportunidades_app  search_path oportunidades, extensions
//   caixa_imoveis, fachadas e caixa_vizinhanca nesse schema (não cria schema base)
//   views e GRANT no tenant novo e nos cinco que já estão no ar

import crypto from 'crypto';
import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolver, CINCO, garantirTabelasCaixa, viewsCaixa } = require('./schema-compartilhado');

const SLUG = 'oportunidades';
const PAPEL = 'oportunidades_app';
const NOME = 'Oportunidades Caixa';
const HOST = 'oportunidades.corretordofuturo.app';
const LINK = `https://${HOST}`;
const NOTAS = 'Vitrine dos imóveis de leilão da Caixa com foto. Tema oportunidades.';

// Tabelas comuns: moram no schema compartilhado e a imobiliária enxerga por view.
const VIEWS = ['condominios', 'predios3d', 'mapa3d', 'pois', 'fachadas', 'caixa_imoveis', 'caixa_vizinhanca'];

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
  for (const a of argv) {
    if (a !== '--apply') throw new Error(`Argumento desconhecido: ${a}. Uso: --apply (sem ele, só mostra o plano).`);
  }
  return { apply: argv.includes('--apply') };
}

function qname(nome) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(nome)) throw new Error(`nome recusado: ${nome}`);
  return `"${nome}"`;
}

function semSegredo(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch { return '(url ilegível)'; }
}

function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

function senhaAceita(s) {
  return typeof s === 'string' && s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

function senhaNova() {
  return `${crypto.randomBytes(18).toString('base64url')}9a`;
}

function cliente(url) {
  return new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
}

async function relacao(client, schema, nome) {
  const r = await client.query(
    `SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, nome],
  );
  return r.rows[0] ? r.rows[0].relkind : null;
}

async function colunas(client, schema, tabela) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabela],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function tabelasDoMolde(client, sc) {
  const r = await client.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname NOT LIKE 'bkp_%'
      ORDER BY c.relname`,
    [sc],
  );
  return r.rows.map((x) => x.relname).filter((n) => !VIEWS.includes(n));
}

async function plano(client, sc) {
  const passos = [];
  let bloqueio = false;
  const marca = (ok, fazer, texto, extra = {}) => {
    passos.push({ ok, fazer, texto, ...extra });
    if (!ok) bloqueio = true;
  };

  const plat = await relacao(client, 'plataforma', 'imobiliarias');
  if (plat !== 'r') {
    marca(false, false, 'plataforma.imobiliarias não existe. Rode sql/plataforma.sql com o dono do banco antes. Nada será criado.');
    return { passos, bloqueio };
  }
  const molde = await colunas(client, sc, 'imoveis');
  if (!molde.size) {
    marca(false, false, `${sc}.imoveis não existe. Sem essa estrutura não copio o schema da imobiliária. Nenhum schema novo foi criado.`);
    return { passos, bloqueio };
  }
  if (sc === 'base') {
    for (const [col] of COLUNAS_IMOVEL) {
      marca(true, !molde.has(col), molde.has(col) ? `base.imoveis.${col} já existe` : `base.imoveis: ADD COLUMN ${col}`);
    }
  } else {
    marca(true, false, `Schema compartilhado: ${sc}. Não altero imoveis desse schema e não crio o schema base.`);
  }

  for (const nome of ['fachadas', 'caixa_imoveis', 'caixa_vizinhanca']) {
    const kind = await relacao(client, sc, nome);
    marca(true, kind !== 'r', kind === 'r' ? `${sc}.${nome} já existe` : `${sc}.${nome}: CREATE TABLE`);
  }

  const schema = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [SLUG]);
  marca(true, !schema.rows.length, schema.rows.length ? `schema ${SLUG} já existe` : `schema ${SLUG}: CREATE SCHEMA e tabelas copiadas de ${sc}`);
  if (schema.rows.length) {
    const copiar = await tabelasDoMolde(client, sc);
    for (const nome of copiar) {
      const tem = await relacao(client, SLUG, nome);
      if (!tem) marca(true, true, `${SLUG}.${nome}: CREATE TABLE a partir de ${sc}`);
    }
    const im = await colunas(client, SLUG, 'imoveis');
    if (!im.size) marca(false, false, `${SLUG}.imoveis não existe e o molde não pôde ser copiado.`);
    else {
      for (const [col] of COLUNAS_IMOVEL) {
        marca(true, !im.has(col), im.has(col) ? `${SLUG}.imoveis.${col} já existe` : `${SLUG}.imoveis: ADD COLUMN ${col}`);
      }
    }
  }

  for (const nome of VIEWS) {
    const origem = await relacao(client, sc, nome);
    const noTenant = schema.rows.length ? await relacao(client, SLUG, nome) : null;
    if (origem !== 'r' && !['fachadas', 'caixa_imoveis', 'caixa_vizinhanca'].includes(nome)) {
      marca(true, false, `${sc}.${nome} não existe: sem view`);
      continue;
    }
    if (noTenant === 'v') marca(true, true, `${SLUG}.${nome}: CREATE OR REPLACE VIEW para ${sc}.${nome}`);
    else if (noTenant === 'r') marca(true, false, `${SLUG}.${nome} já é tabela: não virou view`);
    else marca(true, true, `${SLUG}.${nome}: CREATE VIEW para ${sc}.${nome}`);
  }
  for (const slug of CINCO) {
    const ns = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [slug]);
    if (!ns.rows.length) {
      marca(true, false, `${slug}: schema ausente, view da Caixa não criada`);
      continue;
    }
    for (const nome of ['caixa_imoveis', 'fachadas', 'caixa_vizinhanca']) {
      const kind = await relacao(client, slug, nome);
      if (kind === 'r') marca(true, false, `${slug}.${nome} já é tabela`);
      else marca(true, true, kind === 'v'
        ? `${slug}.${nome}: view já existe; confirmo que aponta para ${sc}.${nome} e o GRANT`
        : `${slug}.${nome}: CREATE VIEW para ${sc}.${nome} e GRANT SELECT`);
    }
  }

  const papel = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [PAPEL]);
  marca(true, !papel.rows.length, papel.rows.length
    ? `${PAPEL} já existe (a senha não muda)`
    : `${PAPEL}: CREATE ROLE (senha de OPORTUNIDADES_APP_SENHA, ou gerada na hora; não aparece no dry-run)`);
  marca(true, true, `GRANT de uso, tabelas, sequences e SELECT nas views para ${PAPEL}`);

  if (schema.rows.length) {
    const n = await client.query(`SELECT count(*)::int AS n FROM ${qname(SLUG)}.usuarios`);
    marca(true, n.rows[0].n === 0, n.rows[0].n
      ? `${SLUG}.usuarios já tem ${n.rows[0].n} pessoa(s); ninguém novo`
      : 'administrador: INSERT (senha de OPORTUNIDADES_ADMIN_SENHA, ou gerada na hora)');
  } else {
    marca(true, true, 'administrador: INSERT no schema novo, para a raiz do site abrir o portal');
  }

  const row = await client.query('SELECT nome, empresa, link, dominio, situacao FROM plataforma.imobiliarias WHERE slug = $1', [SLUG]);
  if (!row.rows.length) marca(true, true, `plataforma.imobiliarias: INSERT ${SLUG} · ${NOME} · ${HOST}`);
  else {
    const r = row.rows[0];
    const mudaNome = r.nome !== NOME || r.empresa !== NOME;
    const mudaHost = !r.link || !r.dominio;
    marca(true, mudaNome || mudaHost, mudaNome || mudaHost
      ? `cadastro já existe (situação ${r.situacao}); nome/empresa ficam "${NOME}" e o host vazio é preenchido`
      : `cadastro já está como ${NOME} em ${HOST} (situação ${r.situacao}, não mexo)`);
  }
  return { passos, bloqueio };
}

async function garanteCaixa(client, sc) {
  await garantirTabelasCaixa(client, sc);
}

async function copiaTabelas(client, sc) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${qname(SLUG)}`);
  await client.query(`
    CREATE OR REPLACE FUNCTION ${qname(SLUG)}.agora() RETURNS text
    LANGUAGE sql STABLE AS $hh$
      SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
    $hh$`);
  for (const nome of await tabelasDoMolde(client, sc)) {
    if (await relacao(client, SLUG, nome)) continue;
    await client.query(`CREATE TABLE ${qname(SLUG)}.${qname(nome)} (LIKE ${qname(sc)}.${qname(nome)} INCLUDING ALL)`);
  }
  const defs = await client.query(
    `SELECT column_name, column_default, table_name FROM information_schema.columns
      WHERE table_schema = $1 AND column_default LIKE $2`,
    [SLUG, `%${sc}.agora()%`],
  );
  for (const f of defs.rows) {
    if (!/^[a-z0-9_]+$/i.test(f.column_name) || !/^[a-z0-9_]+$/i.test(f.table_name)) continue;
    const prox = String(f.column_default).split(`${sc}.agora()`).join(`${qname(SLUG)}.agora()`);
    await client.query(`ALTER TABLE ${qname(SLUG)}.${qname(f.table_name)} ALTER COLUMN ${qname(f.column_name)} SET DEFAULT ${prox}`);
  }
  await client.query(`SET search_path = ${qname(SLUG)}, extensions`);
  const fks = await client.query(
    `SELECT conname, conrelid::regclass::text AS rel, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE contype = 'f' AND connamespace = $1::regnamespace
        AND confrelid::regclass::text !~ '(condominios|predios3d|mapa3d|pois|fachadas|caixa_imoveis|caixa_vizinhanca)$'
        AND conrelid::regclass::text !~ 'bkp_'`,
    [sc],
  );
  const ja = new Set((await client.query(
    `SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1`,
    [SLUG],
  )).rows.map((x) => x.conname));
  for (const f of fks.rows) {
    if (ja.has(f.conname)) continue;
    const tabela = String(f.rel).split('.').pop();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabela)) continue;
    if (!(await relacao(client, SLUG, tabela))) continue;
    const def = String(f.def).split(`${sc}.`).join(`${qname(SLUG)}.`);
    await client.query(`ALTER TABLE ${qname(SLUG)}.${qname(tabela)} ADD CONSTRAINT ${qname(f.conname)} ${def}`);
  }
}

async function colunasDoImovel(client, schema) {
  for (const [col, def] of COLUNAS_IMOVEL) {
    await client.query(`ALTER TABLE ${qname(schema)}.imoveis ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_imoveis_origem ON ${qname(schema)}.imoveis(origem, origem_ref) WHERE origem IS NOT NULL`,
  );
}

async function views(client, sc) {
  for (const nome of VIEWS) {
    if ((await relacao(client, sc, nome)) !== 'r') continue;
    const noTenant = await relacao(client, SLUG, nome);
    if (noTenant === 'r') continue;
    await client.query(`CREATE OR REPLACE VIEW ${qname(SLUG)}.${qname(nome)} AS SELECT * FROM ${qname(sc)}.${qname(nome)}`);
  }
  await viewsCaixa(client, sc, CINCO);
}

async function grants(client) {
  const db = (await client.query('SELECT current_database() AS n')).rows[0].n;
  await client.query(`GRANT CONNECT ON DATABASE ${qname(db)} TO ${qname(PAPEL)}`);
  await client.query(`GRANT USAGE ON SCHEMA ${qname(SLUG)} TO ${qname(PAPEL)}`);
  const ext = await client.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'extensions'`);
  if (ext.rows.length) await client.query(`GRANT USAGE ON SCHEMA extensions TO ${qname(PAPEL)}`);
  const rels = await client.query(
    `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'v')`,
    [SLUG],
  );
  for (const r of rels.rows) {
    const alvo = `${qname(SLUG)}.${qname(r.relname)}`;
    if (r.relkind === 'v') await client.query(`GRANT SELECT ON ${alvo} TO ${qname(PAPEL)}`);
    else await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${alvo} TO ${qname(PAPEL)}`);
  }
  await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${qname(SLUG)} TO ${qname(PAPEL)}`);
  await client.query(`GRANT EXECUTE ON FUNCTION ${qname(SLUG)}.agora() TO ${qname(PAPEL)}`);
}

async function papel(client, senha) {
  const tem = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [PAPEL]);
  if (!tem.rows.length) {
    await client.query(`CREATE ROLE ${qname(PAPEL)} LOGIN PASSWORD ${client.escapeLiteral(senha)}`);
  }
  await client.query(`ALTER ROLE ${qname(PAPEL)} SET search_path = ${qname(SLUG)}, extensions`);
  await client.query(`ALTER ROLE ${qname(PAPEL)} SET statement_timeout = '30s'`);
}

async function administrador(client, senha) {
  const n = await client.query(`SELECT count(*)::int AS n FROM ${qname(SLUG)}.usuarios`);
  if (n.rows[0].n > 0) return false;
  await client.query(
    `INSERT INTO ${qname(SLUG)}.usuarios(nome, email, perfil, senha_hash) VALUES ($1, $2, 'adm', $3)`,
    [`Administrador ${NOME}`, 'admin@oportunidades.corretordofuturo.app', hashSenha(senha)],
  );
  return true;
}

async function cadastro(client) {
  await client.query(
    `INSERT INTO plataforma.imobiliarias
       (slug, nome, empresa, link, dominio, plano, situacao, publicada, notas)
     VALUES ($1, $2, $2, $3, $4, 'essencial', 'implantacao', 0, $5)
     ON CONFLICT (slug) DO NOTHING`,
    [SLUG, NOME, LINK, HOST, NOTAS],
  );
  await client.query(
    `UPDATE plataforma.imobiliarias
        SET nome = $2, empresa = $2,
            link = coalesce(nullif(link, ''), $3),
            dominio = coalesce(nullif(dominio, ''), $4),
            atualizado_em = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
      WHERE slug = $1
        AND (nome IS DISTINCT FROM $2 OR empresa IS DISTINCT FROM $2
             OR coalesce(link, '') = '' OR coalesce(dominio, '') = '')`,
    [SLUG, NOME, LINK, HOST],
  );
}

async function aplica(client, senhaPapel, senhaAdmin, sc) {
  await client.query('BEGIN');
  try {
    await garanteCaixa(client, sc);
    if (sc === 'base' && (await relacao(client, 'base', 'imoveis')) === 'r') await colunasDoImovel(client, 'base');
    await copiaTabelas(client, sc);
    await colunasDoImovel(client, SLUG);
    await views(client, sc);
    const papelNovo = !(await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [PAPEL])).rows.length;
    await papel(client, senhaPapel);
    await grants(client);
    const adminNovo = await administrador(client, senhaAdmin);
    await cadastro(client);
    for (const nome of ['bairros', 'bairro_commons']) {
      if ((await relacao(client, sc, nome)) !== 'r') continue;
      if ((await relacao(client, SLUG, nome)) !== 'r') continue;
      const n = await client.query(`SELECT count(*)::int AS n FROM ${qname(SLUG)}.${qname(nome)}`);
      if (n.rows[0].n === 0) {
        await client.query(`INSERT INTO ${qname(SLUG)}.${qname(nome)} SELECT * FROM ${qname(sc)}.${qname(nome)}`);
      }
    }
    await client.query('COMMIT');
    return { papelNovo, adminNovo };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  const op = args(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL (papel dono do banco, não o oportunidades_app). Nada foi alterado.');
    process.exit(1);
  }
  const senhaPapelEnv = process.env.OPORTUNIDADES_APP_SENHA || '';
  const senhaAdminEnv = process.env.OPORTUNIDADES_ADMIN_SENHA || '';
  if (senhaPapelEnv && !senhaAceita(senhaPapelEnv)) throw new Error('OPORTUNIDADES_APP_SENHA precisa de 8 caracteres, com letra e número.');
  if (senhaAdminEnv && !senhaAceita(senhaAdminEnv)) throw new Error('OPORTUNIDADES_ADMIN_SENHA precisa de 8 caracteres, com letra e número.');

  const client = cliente(url);
  await client.connect();
  try {
    const sc = await resolver(client);
    const { passos, bloqueio } = await plano(client, sc);
    console.log(op.apply ? 'Plano (em seguida aplica):' : 'Dry-run (nada será gravado). Para aplicar: --apply');
    console.log(`Banco: ${semSegredo(url)}`);
    console.log(`Schema compartilhado: ${sc}`);
    console.log(`Imobiliária: ${NOME} · ${SLUG} · ${HOST}`);
    for (const p of passos) console.log(`${p.ok ? (p.fazer ? '+ ' : '= ') : '! '}${p.texto}`);
    if (!op.apply) {
      console.log(bloqueio ? 'Dry-run achou o que impede a criação. Nada foi gravado.' : 'Dry-run concluído. Nada foi gravado.');
      process.exit(bloqueio ? 2 : 0);
    }
    if (bloqueio) {
      console.error('Não apliquei: falta a plataforma ou a tabela imoveis do schema compartilhado.');
      process.exit(2);
    }
    const senhaPapel = senhaPapelEnv || senhaNova();
    const senhaAdmin = senhaAdminEnv || senhaNova();
    const feito = await aplica(client, senhaPapel, senhaAdmin, sc);
    console.log('Aplicado. Rodar de novo não apaga o que já existe.');
    if (feito.papelNovo && !senhaPapelEnv) {
      console.log(`Senha do papel ${PAPEL} (guarde agora; não fica no git): ${senhaPapel}`);
      console.log(`Monte a DATABASE_URL do projeto Vercel como postgres://${PAPEL}.<ref-do-projeto>:${senhaPapel}@<pooler>/postgres`);
    } else if (feito.papelNovo) {
      console.log(`Papel ${PAPEL} criado com OPORTUNIDADES_APP_SENHA. A senha não foi repetida aqui.`);
    }
    if (feito.adminNovo && !senhaAdminEnv) {
      console.log(`Senha do administrador admin@${HOST} (guarde agora; não fica no git): ${senhaAdmin}`);
    } else if (feito.adminNovo) {
      console.log('Administrador criado com OPORTUNIDADES_ADMIN_SENHA. A senha não foi repetida aqui.');
    }
  } finally {
    await client.end();
  }
}

const ehMain = process.argv[1] && process.argv[1].endsWith('criar-tenant-oportunidades.mjs');
if (ehMain) main().catch((e) => { console.error(e.message || e); process.exit(1); });
