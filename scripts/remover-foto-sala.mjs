// Tira das listas a foto da sala com armário ripado, TV, mesa redonda preta,
// piso geométrico preto e branco e três arandelas. Reconhece pelo desenho
// (dHash), não pelo nome do arquivo.
//
// Não grava nada se faltar --apply. Não apaga arquivo remoto: só a linha em
// arquivos (a lista do imóvel). arquivos_dados sai junto, pelo ON DELETE CASCADE.
//
// Conferir, sem gravar:
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/remover-foto-sala.mjs
//
// Apagar as linhas que bateram, depois de ler a lista:
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/remover-foto-sala.mjs --apply
//
// A URL é a do dono do banco, que enxerga os schemas. Não coloque a URL no código.
// Padrão: os cinco tenants no ar. Outra lista:
//   node scripts/remover-foto-sala.mjs --tenants lumen,l7inteligencia

import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import sharp from 'sharp';

// 64 bits da foto anexada pelo Thiago (18/11/2026). Distância até 8 ainda é a mesma sala.
const HASH = '0011010000111110101001100011001000111010000011000000001100010001';
const LIMITE = 8;
const PADRAO = ['l7inteligencia', 'cademeuap', 'ondemorar', 'casaprado', 'lumen'];
const SLUG = /^[a-z][a-z0-9_]{2,40}$/;

// O que a varredura pública de 18/11 já achou, para a lista existir mesmo sem banco.
const JA_VISTO = [
  ['lumen', 'CC0013', 169, 'https://lumen.corretordofuturo.app/imoveis/foto/169'],
  ['l7inteligencia', 'CC0013', 210, 'https://l7inteligencia.corretordofuturo.app/imoveis/foto/210'],
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
  for (const s of out.tenants) if (!SLUG.test(s)) throw new Error(`Tenant inválido: ${s}`);
  return out;
}

function ident(s) {
  if (!SLUG.test(s)) throw new Error(`nome recusado: ${s}`);
  return `"${s}"`;
}

function semSegredo(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch { return '(url ilegível)'; }
}

async function dhash(input) {
  const buf = await sharp(input, { failOn: 'none' }).rotate().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += buf[y * 9 + x] < buf[y * 9 + x + 1] ? '1' : '0';
  return bits;
}

function distancia(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

async function bytesDaFoto(client, schema, row) {
  const qtd = await client.query(`SELECT dados FROM ${ident(schema)}.arquivos_dados WHERE arquivo_id = $1`, [row.id]);
  if (qtd.rows[0] && qtd.rows[0].dados) return qtd.rows[0].dados;
  const url = String(row.url_externa || '');
  if (!/^https:\/\//i.test(url)) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const op = args(process.argv.slice(2));
  console.log(op.apply ? 'MODO apply: as linhas que baterem saem de arquivos.' : 'MODO dry-run: nada é apagado.');
  console.log('Foto já vista em produção, sem mexer no banco:');
  for (const [tenant, codigo, id, url] of JA_VISTO) console.log(`  ${tenant}  ${codigo}  arquivo ${id}  ${url}`);
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('\nSem DATABASE_URL. Nada foi lido no banco e nada foi apagado.');
    process.exitCode = 2;
    return;
  }
  console.log('Banco', semSegredo(url));
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  const achados = [];
  try {
    await client.query('BEGIN');
    for (const schema of op.tenants) {
      const existe = await client.query('SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', [schema, 'arquivos']);
      if (!existe.rows.length) { console.log(`${schema}: sem tabela arquivos (este papel pode não enxergar o schema).`); continue; }
      const fotos = await client.query(
        `SELECT a.id, a.nome, a.mime, a.url_externa, a.categoria, i.codigo
         FROM ${ident(schema)}.arquivos a
         JOIN ${ident(schema)}.imoveis i ON i.id = a.imovel_id
         WHERE coalesce(a.mime, '') ILIKE 'image/%'
            OR a.categoria ILIKE 'foto%'
            OR a.url_externa IS NOT NULL`,
      );
      for (const row of fotos.rows) {
        let buf = null;
        try { buf = await bytesDaFoto(client, schema, row); } catch { buf = null; }
        if (!buf) continue;
        let dist = 99;
        try { dist = distancia(HASH, await dhash(buf)); } catch { continue; }
        if (dist > LIMITE) continue;
        const publica = `https://${schema}.corretordofuturo.app/imoveis/foto/${row.id}`;
        achados.push({ schema, codigo: row.codigo, id: row.id, dist, url: row.url_externa || publica });
        console.log(`MATCH ${schema}  ${row.codigo}  arquivo ${row.id}  distância ${dist}  ${row.url_externa || publica}`);
      }
    }
    if (!achados.length) console.log('Nenhuma foto com esse desenho nos tenants pedidos.');
    if (op.apply && achados.length) {
      for (const a of achados) {
        await client.query(`DELETE FROM ${ident(a.schema)}.arquivos WHERE id = $1`, [a.id]);
      }
      await client.query('COMMIT');
      console.log(`Apagadas ${achados.length} linha(s) de arquivos. A foto sai da lista do imóvel.`);
    } else {
      await client.query('ROLLBACK');
      if (op.apply) console.log('Nada para apagar.');
      else console.log('Dry-run: transação desfeita. Para apagar, rode de novo com --apply.');
    }
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* já fechada */ }
    throw e;
  } finally {
    await client.end();
  }
}

const aqui = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === aqui) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
