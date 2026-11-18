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
//   schema oportunidades     tabelas copiadas de base (sem dados, fora as views)
//   papel oportunidades_app  search_path oportunidades, extensions
//   base.fachadas, base.caixa_imoveis, base.caixa_vizinhanca
//   views no schema da imobiliária e GRANT

import crypto from 'crypto';
import pg from 'pg';

const SLUG = 'oportunidades';
const PAPEL = 'oportunidades_app';
const NOME = 'Oportunidades Caixa';
const HOST = 'oportunidades.corretordofuturo.app';
const LINK = `https://${HOST}`;
const NOTAS = 'Vitrine dos imóveis de leilão da Caixa com foto. Tema oportunidades.';

// Tabelas comuns: moram em base e a imobiliária enxerga por view.
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

async function tabelasDeBase(client) {
  const r = await client.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'base' AND c.relkind = 'r' AND c.relname NOT LIKE 'bkp_%'
      ORDER BY c.relname`,
  );
  return r.rows.map((x) => x.relname).filter((n) => !VIEWS.includes(n));
}

async function plano(client) {
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
  const baseIm = await colunas(client, 'base', 'imoveis');
  if (!baseIm.size) {
    marca(false, false, 'base.imoveis não existe. Rode sql/schema.sql com o dono do banco antes. Nada será criado.');
    return { passos, bloqueio };
  }
  for (const [col] of COLUNAS_IMOVEL) {
    marca(true, !baseIm.has(col), baseIm.has(col) ? `base.imoveis.${col} já existe` : `base.imoveis: ADD COLUMN ${col}`);
  }

  const fach = await relacao(client, 'base', 'fachadas');
  marca(true, !fach, fach ? 'base.fachadas já existe' : 'base.fachadas: CREATE TABLE');
  const caixa = await relacao(client, 'base', 'caixa_imoveis');
  marca(true, !caixa, caixa ? 'base.caixa_imoveis já existe' : 'base.caixa_imoveis: CREATE TABLE');
  if (caixa === 'r') {
    const cols = await colunas(client, 'base', 'caixa_imoveis');
    for (const [col] of COLUNAS_CAIXA) {
      marca(true, !cols.has(col), cols.has(col) ? `base.caixa_imoveis.${col} já existe` : `base.caixa_imoveis: ADD COLUMN ${col}`);
    }
  }
  const viz = await relacao(client, 'base', 'caixa_vizinhanca');
  marca(true, !viz, viz ? 'base.caixa_vizinhanca já existe' : 'base.caixa_vizinhanca: CREATE TABLE');

  const schema = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [SLUG]);
  marca(true, !schema.rows.length, schema.rows.length ? `schema ${SLUG} já existe` : `schema ${SLUG}: CREATE SCHEMA e tabelas copiadas de base`);
  if (schema.rows.length) {
    const copiar = await tabelasDeBase(client);
    for (const nome of copiar) {
      const tem = await relacao(client, SLUG, nome);
      if (!tem) marca(true, true, `${SLUG}.${nome}: CREATE TABLE a partir de base`);
    }
    const im = await colunas(client, SLUG, 'imoveis');
    if (!im.size) marca(false, false, `${SLUG}.imoveis não existe e base não pôde ser copiada.`);
    else {
      for (const [col] of COLUNAS_IMOVEL) {
        marca(true, !im.has(col), im.has(col) ? `${SLUG}.imoveis.${col} já existe` : `${SLUG}.imoveis: ADD COLUMN ${col}`);
      }
    }
  }

  for (const nome of VIEWS) {
    const base = await relacao(client, 'base', nome);
    const noTenant = schema.rows.length ? await relacao(client, SLUG, nome) : null;
    if (base !== 'r' && nome !== 'fachadas' && nome !== 'caixa_imoveis' && nome !== 'caixa_vizinhanca') {
      marca(true, false, `base.${nome} não existe: sem view`);
      continue;
    }
    if (noTenant === 'v') marca(true, true, `${SLUG}.${nome}: CREATE OR REPLACE VIEW (atualiza colunas)`);
    else if (noTenant === 'r') marca(true, false, `${SLUG}.${nome} já é tabela: não virou view`);
    else marca(true, true, `${SLUG}.${nome}: CREATE VIEW para base.${nome}`);
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

async function garanteCaixa(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS base.fachadas (
      ref text PRIMARY KEY,
      img bytea,
      pano_lat double precision,
      pano_lon double precision,
      rumo double precision,
      data_foto text,
      gerado_em text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
    )`);
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
      criado_em text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'),
      atualizado_em text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
    )`);
  for (const [col, def] of COLUNAS_CAIXA) {
    await client.query(`ALTER TABLE base.caixa_imoveis ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }
  await client.query(`CREATE INDEX IF NOT EXISTS ix_caixa_cidade ON base.caixa_imoveis(cidade) WHERE saiu_em IS NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS ix_caixa_rmc ON base.caixa_imoveis(na_rmc, desconto DESC) WHERE saiu_em IS NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS ix_caixa_safra ON base.caixa_imoveis(ultima_safra)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS base.caixa_vizinhanca (
      numero text PRIMARY KEY,
      dados jsonb NOT NULL,
      visto_em text NOT NULL
    )`);
}

async function copiaTabelas(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${qname(SLUG)}`);
  await client.query(`
    CREATE OR REPLACE FUNCTION ${qname(SLUG)}.agora() RETURNS text
    LANGUAGE sql STABLE AS $hh$
      SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
    $hh$`);
  for (const nome of await tabelasDeBase(client)) {
    if (await relacao(client, SLUG, nome)) continue;
    await client.query(`CREATE TABLE ${qname(SLUG)}.${qname(nome)} (LIKE base.${qname(nome)} INCLUDING ALL)`);
  }
  const defs = await client.query(
    `SELECT column_name, column_default, table_name FROM information_schema.columns
      WHERE table_schema = $1 AND column_default LIKE '%base.agora()%'`,
    [SLUG],
  );
  for (const f of defs.rows) {
    if (!/^[a-z0-9_]+$/i.test(f.column_name) || !/^[a-z0-9_]+$/i.test(f.table_name)) continue;
    const prox = String(f.column_default).split('base.agora()').join(`${qname(SLUG)}.agora()`);
    await client.query(`ALTER TABLE ${qname(SLUG)}.${qname(f.table_name)} ALTER COLUMN ${qname(f.column_name)} SET DEFAULT ${prox}`);
  }
  await client.query(`SET search_path = ${qname(SLUG)}, extensions`);
  const fks = await client.query(
    `SELECT conname, conrelid::regclass::text AS rel, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'base'::regnamespace
        AND confrelid::regclass::text !~ '(condominios|predios3d|mapa3d|pois|fachadas|caixa_imoveis|caixa_vizinhanca)$'
        AND conrelid::regclass::text !~ 'bkp_'`,
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
    const def = String(f.def).split('base.').join(`${qname(SLUG)}.`);
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

async function views(client) {
  for (const nome of VIEWS) {
    if ((await relacao(client, 'base', nome)) !== 'r') continue;
    const noTenant = await relacao(client, SLUG, nome);
    if (noTenant === 'r') continue;
    await client.query(`CREATE OR REPLACE VIEW ${qname(SLUG)}.${qname(nome)} AS SELECT * FROM base.${qname(nome)}`);
  }
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

async function aplica(client, senhaPapel, senhaAdmin) {
  await client.query('BEGIN');
  try {
    await garanteCaixa(client);
    await colunasDoImovel(client, 'base');
    await copiaTabelas(client);
    await colunasDoImovel(client, SLUG);
    await views(client);
    const papelNovo = !(await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [PAPEL])).rows.length;
    await papel(client, senhaPapel);
    await grants(client);
    const adminNovo = await administrador(client, senhaAdmin);
    await cadastro(client);
    for (const nome of ['bairros', 'bairro_commons']) {
      if ((await relacao(client, 'base', nome)) !== 'r') continue;
      if ((await relacao(client, SLUG, nome)) !== 'r') continue;
      const n = await client.query(`SELECT count(*)::int AS n FROM ${qname(SLUG)}.${qname(nome)}`);
      if (n.rows[0].n === 0) {
        await client.query(`INSERT INTO ${qname(SLUG)}.${qname(nome)} SELECT * FROM base.${qname(nome)}`);
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
    const { passos, bloqueio } = await plano(client);
    console.log(op.apply ? 'Plano (em seguida aplica):' : 'Dry-run (nada será gravado). Para aplicar: --apply');
    console.log(`Banco: ${semSegredo(url)}`);
    console.log(`Imobiliária: ${NOME} · ${SLUG} · ${HOST}`);
    for (const p of passos) console.log(`${p.ok ? (p.fazer ? '+ ' : '= ') : '! '}${p.texto}`);
    if (!op.apply) {
      console.log(bloqueio ? 'Dry-run achou o que impede a criação. Nada foi gravado.' : 'Dry-run concluído. Nada foi gravado.');
      process.exit(bloqueio ? 2 : 0);
    }
    if (bloqueio) {
      console.error('Não apliquei: falta a plataforma ou a base.');
      process.exit(2);
    }
    const senhaPapel = senhaPapelEnv || senhaNova();
    const senhaAdmin = senhaAdminEnv || senhaNova();
    const feito = await aplica(client, senhaPapel, senhaAdmin);
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
