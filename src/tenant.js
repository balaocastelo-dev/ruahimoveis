// Herrera HOUSE IA · plataforma multi-imobiliária (fase 1): qual imobiliária está sendo atendida agora.
// A imobiliária vive num AsyncLocalStorage: a requisição (ou o processo do PC) entra com comImobiliaria()/als.run()
// e todo SQL feito dali em diante — inclusive depois de await, setTimeout e setInterval — sabe para qual schema vai.
// Não usamos search_path da conexão: com pool/pooler a mesma conexão atende imobiliárias diferentes.
//
// TODO(fase1 · antes da 2ª imobiliária no ar):
//  - MULTI=1 no Postgres só depois da migração (schema "base" + tabelas comuns movidas); hoje fica desligado.
//  - caches em memória que ainda não separam por imobiliária: fisguei/inteligencia.js (CACHE), bairros/dados.js
//    (cacheLista/cacheCond/cachePerto), bairros/fonte.js e blog/diario.js (memoria). Só routes/mercado.js já separa (BASES).
//  - config por imobiliária (CLIENTE_NOME, EMPRESA, chaves) ainda vem do .env; autenticação/sessões na base.
//  - scripts/migrar-para-online.js e scripts/demo-vitrine.js usam o SQLite direto (fora do tradutor).
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();
const SLUG_OK = /^[a-z][a-z0-9_]{0,39}$/;

const multi = () => process.env.MULTI === '1';                 // liga o prefixo de schema/tabela no SQL
const estrito = () => process.env.MULTI_ESTRITO === '1';       // tabela fora do mapa ou privada sem imobiliária = erro
const slugPadrao = () => (process.env.IMOBILIARIA_PADRAO || 'ruah').trim().toLowerCase();

// { slug, schema } a partir de um slug ou de um contexto já montado.
// TODO(fase1 · etapa plataforma): ler slug→schema de base.imobiliarias; por enquanto o schema é o próprio slug (RUAH = "ruah").
function contexto(x) {
  const slug = typeof x === 'string' ? x.trim().toLowerCase() : x && x.slug;
  const schema = typeof x === 'object' && x && x.schema ? x.schema : slug;
  for (const v of [slug, schema]) {
    if (!SLUG_OK.test(String(v || '')) || String(v).includes('__')) throw new Error(`Imobiliária inválida: ${JSON.stringify(v)}`);
  }
  return Object.freeze({ slug, schema });
}

const padrao = () => contexto(slugPadrao());
const atual = () => als.getStore() || null;
const comImobiliaria = (x, fn) => als.run(contexto(x), fn);
function exige() {
  const c = atual();
  if (!c) { const e = new Error('Nenhuma imobiliária no contexto desta operação.'); e.code = 'SEM_IMOBILIARIA'; throw e; }
  return c;
}
// Schema que o tradutor de SQL deve usar: o do contexto; sem contexto, a imobiliária padrão
// (assim tudo que está no ar continua igual). No modo estrito, sem contexto devolve null e o tradutor recusa tabela privada.
function schemaSql() {
  const c = atual();
  if (c) return c.schema;
  return estrito() ? null : padrao().schema;
}

// ---- imobiliária pelo endereço (host) da requisição ----
// TODO(fase1 · etapa plataforma): trocar pelo cadastro em base.dominios. Formato: IMOBILIARIA_HOSTS="host=slug,host2=slug".
function hostsMap() {
  const m = new Map();
  for (const par of String(process.env.IMOBILIARIA_HOSTS || '').split(',')) {
    const [h, s] = par.split('=').map((x) => (x || '').trim().toLowerCase());
    if (h && s) m.set(h.replace(/:\d+$/, ''), s);
  }
  return m;
}
function porHost(host) {
  const h = String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
  return contexto(hostsMap().get(h) || slugPadrao());
}
// Middleware do Express: o resto da requisição roda dentro da imobiliária do host.
function middleware(req, res, next) {
  let c;
  try { c = porHost(req.hostname || req.headers.host); } catch (e) { return next(e); }
  req.imobiliaria = c;
  als.run(c, next);
}
// Alguns middlewares (ex.: multer/busboy) chamam next() fora da cadeia assíncrona e perdem o contexto:
// este embrulho devolve a imobiliária ao que vem depois.
function preserva(mw) {
  return (req, res, next) => {
    const c = atual() || req.imobiliaria;
    mw(req, res, (...a) => (c ? als.run(c, () => next(...a)) : next(...a)));
  };
}

module.exports = { als, atual, comImobiliaria, exige, contexto, padrao, schemaSql, multi, estrito, porHost, hostsMap, middleware, preserva, SLUG_OK };
