// Herrera HOUSE IA · plataforma multi-imobiliária (fase 1): qual imobiliária está sendo atendida agora.
// A imobiliária vive num AsyncLocalStorage: a requisição (ou o processo do PC) entra com comImobiliaria()/als.run()
// e todo SQL feito dali em diante — inclusive depois de await, setTimeout e setInterval — sabe para qual schema vai.
// Não usamos search_path da conexão: com pool/pooler a mesma conexão atende imobiliárias diferentes.
//
// TODO(fase1 · antes da 2ª imobiliária no ar):
//  - MULTI=1 no Postgres só depois da migração (schema "base" + tabelas comuns movidas); hoje fica desligado.
//  - caches em memória com dado privado usam chaveCache() (fisguei/inteligencia, bairros/dados e fonte, blog/diario,
//    portal/fonte, og, services/drive; routes/mercado separa por schema). Estado de processo (robô do WhatsApp, linhas
//    dos agentes, monitor de portais) ainda é um só por PC e roda na imobiliária padrão.
//  - sql/plataforma.sql (base.imobiliarias, dominios, login_indice, gestores, sessoes…) escrito, NÃO aplicado.
//  - tela do gestor da plataforma (fase 2); hoje só a API /api/plataforma.
//  - scripts/migrar-para-online.js e scripts/demo-vitrine.js usam o SQLite direto (fora do tradutor).
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();
const SLUG_OK = /^[a-z][a-z0-9_]{0,39}$/;

const multi = () => process.env.MULTI === '1';                 // liga o prefixo de schema/tabela no SQL
const estrito = () => process.env.MULTI_ESTRITO === '1';       // tabela fora do mapa ou privada sem imobiliária = erro
const slugPadrao = () => (process.env.IMOBILIARIA_PADRAO || 'ruah').trim().toLowerCase();

// { slug, schema, registro? } a partir de um slug, de um contexto já montado ou do registro da imobiliária
// (linha de base.imobiliarias, ver src/plataforma/registro.js). Só com slug, o schema é o próprio slug (RUAH = "ruah").
function contexto(x) {
  const slug = typeof x === 'string' ? x.trim().toLowerCase() : x && x.slug;
  const schema = typeof x === 'object' && x && x.schema ? x.schema : slug;
  for (const v of [slug, schema]) {
    if (!SLUG_OK.test(String(v || '')) || String(v).includes('__')) throw new Error(`Imobiliária inválida: ${JSON.stringify(v)}`);
  }
  const registro = typeof x === 'object' && x ? (x.registro || (x.id != null && 'nome_curto' in x ? x : null)) : null;
  return Object.freeze(registro ? { slug, schema, registro } : { slug, schema });
}

const padrao = () => contexto(slugPadrao());
const atual = () => als.getStore() || null;
const comImobiliaria = (x, fn) => als.run(contexto(x), fn);
function exige() {
  const c = atual();
  if (!c) { const e = new Error('Nenhuma imobiliária no contexto desta operação.'); e.code = 'SEM_IMOBILIARIA'; throw e; }
  return c;
}
// Chave para caches em memória com dado da imobiliária: o slug do contexto (sem contexto, o da padrão).
// Com MULTI desligado há uma imobiliária só, então a chave é sempre a mesma e o cache se comporta como antes.
const chaveCache = () => (atual() || padrao()).slug;
// Schema que o tradutor de SQL deve usar: o do contexto; sem contexto, a imobiliária padrão
// (assim tudo que está no ar continua igual). No modo estrito, sem contexto devolve null e o tradutor recusa tabela privada.
function schemaSql() {
  const c = atual();
  if (c) return c.schema;
  return estrito() ? null : padrao().schema;
}

// Registro completo da imobiliária do contexto (nome, cidade, WhatsApp, blog…), lido de base.imobiliarias.
// Só com MULTI=1; desligado (ou sem contexto) devolve null e a configuração vem do .env, como sempre.
function imobiliaria() {
  if (!multi()) return null;
  const c = atual();
  if (!c) return null;
  if (c.registro) return c.registro;
  try { return require('./plataforma/registro').porSlug(c.slug); } catch { return null; }
}

// ---- imobiliária pelo endereço (host) da requisição ----
// Ordem: IMOBILIARIA_HOSTS="host=slug,host2=slug" (env, vale sempre) → base.dominios (só com MULTI=1, cache de 60 s).
function hostsMap() {
  const m = new Map();
  for (const par of String(process.env.IMOBILIARIA_HOSTS || '').split(',')) {
    const [h, s] = par.split('=').map((x) => (x || '').trim().toLowerCase());
    if (h && s) m.set(h.replace(/:\d+$/, ''), s);
  }
  return m;
}
const normHost = (host) => String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
// Só o mapa do env (sem banco): usado com MULTI desligado e pelos testes do tradutor.
function porHost(host) {
  return contexto(hostsMap().get(normHost(host)) || slugPadrao());
}
// Entrada da plataforma (login de todas as imobiliárias): aqui a imobiliária vem da sessão, não do host.
const appHosts = () => new Set(String(process.env.PLATAFORMA_APP_HOSTS || 'app.corretordofuturo.app')
  .split(',').map((h) => normHost(h)).filter(Boolean));
// { plataforma: true } | { slug, origem: 'env'|'dominio'|'padrao' }
function resolveHost(host) {
  const h = normHost(host);
  const doEnv = hostsMap().get(h);
  if (doEnv) return { slug: doEnv, origem: 'env' };
  if (appHosts().has(h)) return { plataforma: true };
  const doBanco = multi() ? require('./plataforma/registro').slugDoHost(h) : null;
  if (doBanco) return { slug: doBanco, origem: 'dominio' };
  return { slug: slugPadrao(), origem: 'padrao' };
}
// Middleware do Express: o resto da requisição roda dentro da imobiliária do host.
// Com MULTI=1: host da plataforma → imobiliária da sessão (sem sessão, a padrão só para /setup e telas);
// imobiliária suspensa/cancelada → páginas públicas 404/410 (o login dá a mensagem clara).
function middleware(req, res, next) {
  let c;
  try {
    if (!multi()) c = porHost(req.hostname || req.headers.host);
    else {
      const reg = require('./plataforma/registro');
      const r = resolveHost(req.hostname || req.headers.host);
      req.hostPlataforma = !!r.plataforma;
      if (r.plataforma) {
        const imob = require('./auth').imobiliariaDaSessao(req);
        req.imobiliariaDaSessao = !!imob;
        c = contexto(imob || reg.porSlug(slugPadrao()) || slugPadrao());
      } else {
        const imob = reg.porSlug(r.slug);
        const bloqueio = imob && reg.bloqueioPublico(imob, req.path);
        if (bloqueio) return res.status(bloqueio).type('text/plain').send(bloqueio === 410 ? 'Esta página não existe mais.' : 'Não encontrado.');
        c = contexto(imob || r.slug);
      }
    }
  } catch (e) { return next(e); }
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

module.exports = { als, atual, chaveCache, comImobiliaria, exige, contexto, padrao, schemaSql, multi, estrito, porHost, resolveHost, appHosts, hostsMap, middleware, preserva, imobiliaria, slugPadrao, SLUG_OK };
