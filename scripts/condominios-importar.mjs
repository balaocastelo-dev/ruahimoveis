// Condomínios · importa a base de Campinas (CNPJ + Censo 2022 + mapa aberto) e os prédios do 3D para o banco online.
// Uso (no PC, com DATABASE_URL no .env):
//   node scripts/condominios-importar.mjs data/condominios/condominios-campinas.json [data/condominios/predios3d.jsonl]
// Pode rodar de novo quando a base for atualizada: não apaga nada e não desfaz o que a RUAH editou na ficha.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../src/config');
const pg = require('pg');

const [arqBase, arqPredios] = process.argv.slice(2);
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL não configurada no .env'); process.exit(1); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: /sslmode=disable/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, max: 4 });
const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const COLS = ['nome', 'tipo', 'cnpj', 'razao_social', 'situacao', 'abertura', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'lat', 'lon', 'geo_fonte', 'fontes', 'osm_ref', 'andares', 'torres', 'unidades', 'unidades_fonte', 'contorno', 'numeracao', 'sem_nome', 'slug', 'nome_busca'];
// campos que a RUAH edita na ficha: só preenche se estiverem vazios
const SO_SE_VAZIO = new Set(['andares', 'torres', 'unidades', 'unidades_fonte', 'osm_ref']);

async function base(arq) {
  const lista = JSON.parse(fs.readFileSync(arq, 'utf8'));
  console.log(`condomínios no arquivo: ${lista.length}`);
  const c = await pool.connect();
  try {
    await c.query('SET search_path = ruah, extensions');
    for (let i = 0; i < lista.length; i += 250) {
      const lote = lista.slice(i, i + 250);
      const vals = [], linhas = [];
      for (const x of lote) {
        x.nome_busca = chave(x.nome);
        linhas.push('(' + COLS.map((k) => { vals.push(x[k] ?? null); return `$${vals.length}`; }).join(',') + ')');
      }
      const upd = COLS.filter((k) => k !== 'slug').map((k) => {
        if (k === 'nome' || k === 'nome_busca') return `${k} = CASE WHEN condominios.atualizado_em IS NOT NULL OR condominios.fontes = 'ruah' THEN condominios.${k} ELSE excluded.${k} END`;
        if (k === 'lat' || k === 'lon' || k === 'geo_fonte') return `${k} = CASE WHEN condominios.geo_fonte = 'ajustado' THEN condominios.${k} ELSE coalesce(excluded.${k}, condominios.${k}) END`;
        if (k === 'tipo') return `tipo = CASE WHEN condominios.atualizado_em IS NOT NULL THEN condominios.tipo ELSE excluded.tipo END`;
        if (SO_SE_VAZIO.has(k)) return `${k} = coalesce(condominios.${k}, excluded.${k})`;
        return `${k} = coalesce(excluded.${k}, condominios.${k})`;
      }).join(', ');
      await c.query(`INSERT INTO condominios(${COLS.join(',')}) VALUES ${linhas.join(',')}
        ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET ${upd}`, vals);
      process.stdout.write(`\r  ${Math.min(i + 250, lista.length)}/${lista.length}`);
    }
    console.log('');
    // condomínios antigos (cadastros da RUAH sem endereço) ganham slug e nome de busca
    await c.query(`UPDATE condominios SET nome_busca = upper(nome) WHERE nome_busca IS NULL`);
    const r = await c.query(`SELECT id, nome FROM condominios WHERE slug IS NULL`);
    for (const x of r.rows) await c.query('UPDATE condominios SET slug=$1, fontes=coalesce(fontes,$2) WHERE id=$3', [`${chave(x.nome).toLowerCase().replace(/ /g, '-')}-${x.id}`, 'ruah', x.id]);
    const t = await c.query(`SELECT count(*) n, count(lat) geo FROM condominios WHERE coalesce(tipo,'') <> 'comercial'`);
    console.log(`no banco: ${t.rows[0].n} condomínios residenciais, ${t.rows[0].geo} no mapa`);
  } finally { c.release(); }
}

async function predios(arq) {
  const linhas = fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean);
  console.log(`blocos de prédios 3D: ${linhas.length}`);
  const c = await pool.connect();
  try {
    await c.query('SET search_path = ruah, extensions');
    for (let i = 0; i < linhas.length; i += 100) {
      const lote = linhas.slice(i, i + 100).map((l) => JSON.parse(l));
      const vals = [], v = [];
      for (const x of lote) { vals.push(x.t, Buffer.from(x.d, 'base64')); v.push(`($${vals.length - 1},$${vals.length})`); }
      await c.query(`INSERT INTO predios3d(tile,dados) VALUES ${v.join(',')} ON CONFLICT (tile) DO UPDATE SET dados=excluded.dados, atualizado_em=ruah.agora()`, vals);
      process.stdout.write(`\r  ${Math.min(i + 100, linhas.length)}/${linhas.length}`);
    }
    console.log('');
  } finally { c.release(); }
}

try {
  if (arqBase) await base(path.resolve(arqBase));
  if (arqPredios) await predios(path.resolve(arqPredios));
  // liga carteira, Radar e Fisguei aos condomínios
  const B = require('../src/condominios/base');
  console.log('vínculos:', B.vincular({ tudo: false }));
  fs.writeFileSync(path.join(path.dirname(path.resolve(arqBase || arqPredios)), 'importar_ok.txt'), new Date().toISOString());
} catch (e) { console.error('ERRO', e.message); process.exitCode = 1; }
await pool.end();
process.exit();
