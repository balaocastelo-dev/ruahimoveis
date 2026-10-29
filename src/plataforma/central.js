// Cérebro central da plataforma (Herrera HOUSE IA).
//
// Decisão do Thiago (29/10/2026): a chave do Gemini é UMA SÓ, da plataforma, e todas as imobiliárias
// usam essa chave de graça — nenhuma precisa configurar nada. O que cada uma consome fica registrado
// para o dono da plataforma ver (plataforma.ia_uso), do jeito que já acontece com as outras contas.
//
// Onde fica: schema "plataforma", tabela config (chaves "ia_central" e "ia_central_modelo"), que todo
// projeto enxerga pelo usuário plataforma_app (PLATAFORMA_DATABASE_URL, já presente em todas as
// imobiliárias). Fica em texto no banco, como os outros segredos de plataforma.config (tokens de ciclo):
// quem protege é a permissão do banco — a chave nunca sai numa rota, só os 4 últimos dígitos.
const cfg = require('../config');

const MINUTOS = 5 * 60e3;          // releitura da chave (serve para trocar a chave sem publicar de novo)
const MINUTOS_ERRO = 60e3;         // sem banco/sem chave: tenta de novo mais rápido
let POOL = null;
let CACHE = { chave: '', modelo: '', em: 0, erro: null };
let CARREGANDO = null;
let EU = null;                     // slug (schema) desta imobiliária, para a conta do consumo

function pool() {
  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (!url) return null;
  if (!POOL) {
    const { Pool } = require('pg');
    POOL = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      max: 2, idleTimeoutMillis: 20000, connectionTimeoutMillis: 8000 });
    POOL.on('error', () => {});
  }
  return POOL;
}

/** Slug desta imobiliária (= nome do schema). Sem Postgres (PC em SQLite), usa o nome curto do cliente. */
async function eu() {
  if (EU) return EU;
  try {
    const { one } = require('../db');
    const r = one('SELECT current_schema() AS s');
    EU = (r && r.s) || null;
  } catch { EU = null; }
  if (!EU) EU = String(cfg.CLIENTE_NOME || 'local').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30) || 'local';
  return EU;
}

/** Lê a chave central (com cache). Nunca estoura: sem banco ou sem chave devolve vazio. */
async function carregar() {
  const agora = Date.now();
  const prazo = CACHE.erro ? MINUTOS_ERRO : MINUTOS;
  if (CACHE.em && agora - CACHE.em < prazo) return CACHE;
  if (CARREGANDO) return CARREGANDO;
  CARREGANDO = (async () => {
    const p = pool();
    if (!p) { CACHE = { chave: '', modelo: '', em: agora, erro: 'sem PLATAFORMA_DATABASE_URL' }; return CACHE; }
    try {
      const { rows } = await p.query("SELECT chave, valor FROM config WHERE chave IN ('ia_central','ia_central_modelo')");
      const m = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
      CACHE = { chave: String(m.ia_central || '').trim(), modelo: String(m.ia_central_modelo || '').trim(), em: Date.now(), erro: null };
    } catch (e) {
      CACHE = { chave: CACHE.chave, modelo: CACHE.modelo, em: Date.now(), erro: e.message };
    }
    return CACHE;
  })().finally(() => { CARREGANDO = null; });
  return CARREGANDO;
}

const chave = () => CACHE.chave || '';
const modelo = () => CACHE.modelo || '';
const estado = () => ({ tem_chave: !!CACHE.chave, modelo: CACHE.modelo || null, lida_em: CACHE.em ? new Date(CACHE.em).toISOString() : null, erro: CACHE.erro });

/** Soma o que esta imobiliária gastou do cérebro central (um upsert por chamada, por dia e modelo). */
async function anota({ modelo: mod, entrada = 0, saida = 0, erro = false }) {
  const p = pool(); if (!p) return;
  try {
    const slug = await eu();
    await p.query(
      `INSERT INTO ia_uso (imobiliaria, dia, modelo, chamadas, tokens_entrada, tokens_saida, erros)
       VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date, $2, 1, $3, $4, $5)
       ON CONFLICT (imobiliaria, dia, modelo) DO UPDATE SET
         chamadas = ia_uso.chamadas + 1,
         tokens_entrada = ia_uso.tokens_entrada + EXCLUDED.tokens_entrada,
         tokens_saida = ia_uso.tokens_saida + EXCLUDED.tokens_saida,
         erros = ia_uso.erros + EXCLUDED.erros,
         atualizado_em = now()`,
      [slug, String(mod || '').slice(0, 80) || 'desconhecido', Math.max(0, entrada | 0), Math.max(0, saida | 0), erro ? 1 : 0]);
  } catch { /* medir o consumo nunca pode derrubar o atendimento */ }
}

module.exports = { carregar, chave, modelo, estado, anota, eu };
