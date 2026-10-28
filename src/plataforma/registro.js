// Plataforma multi-imobiliária · o cadastro das imobiliárias (tabelas comuns: imobiliarias, dominios, login_indice,
// gestores, auditoria_plataforma). Só é usado com MULTI=1; com MULTI desligado nada aqui é chamado e o sistema
// segue lendo a configuração do .env, como sempre.
//
// Semente: se o cadastro estiver vazio, a imobiliária padrão (IMOBILIARIA_PADRAO, hoje 'ruah') nasce com os dados
// do .env atual (CLIENTE_NOME, EMPRESA, WHATSAPP_CLIENTE, BLOG_*…), então o comportamento é o mesmo de hoje.
const { one, all, run } = require('../db');

const CACHE_MS = 60e3;
const STATUS = new Set(['ativa', 'teste', 'suspensa', 'cancelada']);
const LIBERADA = new Set(['ativa', 'teste']);
// Páginas e entradas públicas da imobiliária (portal, blog, bairros, condomínios, links e assinaturas, formulários).
const PUBLICAS = /^\/(imoveis|blog|bairros|condominios|v|assinar)(\/|$)|^\/(llms\.txt|sitemap\.xml|robots\.txt|feed|rss)|^\/api\/publico(\/|$)|^\/webhook\/|^\/fisguei-api(\/|$)|^\/escritorio-ciclo$/;

let cacheImob = null;   // { quando, porSlug: Map, porId: Map }
let cacheHosts = null;  // { quando, mapa: Map host → slug }
let semeado = false;

const slugPadrao = () => (process.env.IMOBILIARIA_PADRAO || 'ruah').trim().toLowerCase();

function ler(r) {
  if (!r) return null;
  let config = {};
  try { config = r.config ? JSON.parse(r.config) : {}; } catch { config = {}; }
  return Object.freeze({ ...r, config: Object.freeze(config) });
}

// Cria a imobiliária padrão com o que está no .env, se o cadastro estiver vazio. Devolve o registro da padrão.
function semente() {
  if (one('SELECT count(*) n FROM imobiliarias').n === 0) {
    const e = require('../config').doEnv();
    const slug = slugPadrao();
    criar({
      slug, nome_curto: e.CLIENTE_NOME, empresa: e.EMPRESA, cidade: e.CIDADE_PADRAO, uf: e.UF_PADRAO,
      whatsapp: e.WHATSAPP_CLIENTE || null, site: e.SITE_CLIENTE || null, instagram: e.INSTAGRAM_CLIENTE || null, creci: e.BLOG_CRECI || null,
      blog_nome: e.BLOG_NOME, blog_legenda: e.BLOG_LEGENDA, blog_url: e.BLOG_URL || null, portal_url: e.PORTAL_URL || null,
      public_url: e.PUBLIC_URL || null, radar_bairros: e.RADAR_BAIRROS || null, status: 'ativa',
      config: { link_online: e.LINK_ONLINE, drive_root_name: e.DRIVE_ROOT_NAME },
    }, { semCache: true });
  }
  semeado = true;
}

function carrega() {
  if (cacheImob && Date.now() - cacheImob.quando < CACHE_MS) return cacheImob;
  if (!semeado) semente();
  const lista = all('SELECT * FROM imobiliarias').map(ler);
  cacheImob = { quando: Date.now(), porSlug: new Map(lista.map((r) => [r.slug, r])), porId: new Map(lista.map((r) => [Number(r.id), r])) };
  return cacheImob;
}

const porSlug = (slug) => carrega().porSlug.get(String(slug || '').trim().toLowerCase()) || null;
const porId = (id) => (id == null ? null : carrega().porId.get(Number(id)) || null);
const lista = () => [...carrega().porSlug.values()];
const padrao = () => porSlug(slugPadrao());

// host → slug pelo cadastro de domínios (cache de 60 s).
function slugDoHost(host) {
  const h = String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
  if (!h) return null;
  if (!cacheHosts || Date.now() - cacheHosts.quando > CACHE_MS) {
    carrega();
    const linhas = all('SELECT d.host, i.slug FROM dominios d JOIN imobiliarias i ON i.id=d.imobiliaria_id');
    cacheHosts = { quando: Date.now(), mapa: new Map(linhas.map((x) => [String(x.host).toLowerCase(), x.slug])) };
  }
  return cacheHosts.mapa.get(h) || null;
}

const liberada = (r) => !!r && LIBERADA.has(r.status);
// Mensagem para login recusado (null = pode entrar).
function motivoBloqueio(r) {
  if (!r) return 'Imobiliária não encontrada.';
  if (r.status === 'suspensa') return `O acesso da ${r.nome_curto} está suspenso. Fale com o suporte da plataforma para reativar.`;
  if (r.status === 'cancelada') return `A assinatura da ${r.nome_curto} foi cancelada. Fale com o suporte da plataforma.`;
  return null;
}
// Páginas públicas de imobiliária suspensa → 404; cancelada → 410. null = segue normal.
function bloqueioPublico(r, caminho) {
  if (liberada(r) || !PUBLICAS.test(String(caminho || ''))) return null;
  return r.status === 'cancelada' ? 410 : 404;
}

function limparCache() { cacheImob = null; cacheHosts = null; }

// ---- escrita (gestor da plataforma, semente e testes) ----
const CAMPOS = ['nome_curto', 'empresa', 'cidade', 'uf', 'pais', 'moeda', 'idioma', 'whatsapp', 'site', 'instagram', 'creci',
  'blog_nome', 'blog_legenda', 'blog_url', 'portal_url', 'public_url', 'radar_bairros', 'status', 'plano'];

// Cadastra uma imobiliária (só o registro; as tabelas privadas dela são criadas à parte:
// SQLite → db.criaImobiliaria(slug); Postgres → script do schema, fase 2). Devolve o registro.
function criar(d, { semCache = false } = {}) {
  const tenant = require('../tenant');
  const slug = String(d.slug || '').trim().toLowerCase();
  const schema = String(d.schema || slug).trim().toLowerCase();
  tenant.contexto({ slug, schema }); // valida slug/schema (mesma regra do tradutor de SQL)
  if (!d.nome_curto) throw new Error('nome_curto é obrigatório.');
  if (d.status && !STATUS.has(d.status)) throw new Error(`status inválido: ${d.status}`);
  const cols = ['slug', 'schema', ...CAMPOS.filter((k) => d[k] !== undefined), 'config'];
  const vals = [slug, schema, ...CAMPOS.filter((k) => d[k] !== undefined).map((k) => d[k]), d.config ? JSON.stringify(d.config) : null];
  const id = Number(run(`INSERT INTO imobiliarias(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...vals).lastInsertRowid);
  for (const [i, h] of (d.hosts || []).entries()) adicionarDominio(id, h, i === 0);
  if (!semCache) limparCache();
  return semCache ? { id, slug, schema } : porId(id);
}

function alterar(slug, d) {
  const r = porSlug(slug);
  if (!r) throw new Error(`Imobiliária não encontrada: ${slug}`);
  if (d.status && !STATUS.has(d.status)) throw new Error(`status inválido: ${d.status}`);
  const ks = CAMPOS.filter((k) => d[k] !== undefined);
  if (d.config !== undefined) ks.push('config');
  if (ks.length) run(`UPDATE imobiliarias SET ${ks.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...ks.map((k) => (k === 'config' ? JSON.stringify(d.config || {}) : d[k])), r.id);
  limparCache();
  return porId(r.id);
}

function adicionarDominio(imobiliariaId, host, principal = false) {
  const h = String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
  if (!/^[a-z0-9.-]+$/.test(h)) throw new Error(`Domínio inválido: ${host}`);
  run('INSERT INTO dominios(host,imobiliaria_id,principal) VALUES(?,?,?) ON CONFLICT(host) DO UPDATE SET imobiliaria_id=excluded.imobiliaria_id, principal=excluded.principal',
    h, imobiliariaId, principal ? 1 : 0);
  cacheHosts = null;
}

// ---- índice de login (e-mail → imobiliária): usado no login pela entrada da plataforma ----
// Um e-mail entra no sistema por uma imobiliária só.
function emailEmOutra(email, imobiliariaId) {
  const r = one('SELECT imobiliaria_id FROM login_indice WHERE email=?', String(email || '').trim());
  return !!r && Number(r.imobiliaria_id) !== Number(imobiliariaId);
}
function indexaLogin(imobiliariaId, usuarioId, email) {
  run('DELETE FROM login_indice WHERE imobiliaria_id=? AND usuario_id=?', imobiliariaId, usuarioId);
  run('INSERT INTO login_indice(email,imobiliaria_id,usuario_id) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET imobiliaria_id=excluded.imobiliaria_id, usuario_id=excluded.usuario_id',
    String(email).trim(), imobiliariaId, usuarioId);
}
function desindexaLogin(imobiliariaId, usuarioId) {
  run('DELETE FROM login_indice WHERE imobiliaria_id=? AND usuario_id=?', imobiliariaId, usuarioId);
}
const loginPorEmail = (email) => one('SELECT * FROM login_indice WHERE email=?', String(email || '').trim()) || null;

// ---- gestores da plataforma e auditoria ----
function criarGestor(nome, email, senha) {
  const A = require('../auth');
  if (!A.senhaValida(senha)) throw new Error('A senha precisa ter 8 caracteres ou mais, com letras e números.');
  return Number(run('INSERT INTO gestores(nome,email,senha_hash) VALUES(?,?,?)', nome, String(email).trim(), A.hashSenha(senha)).lastInsertRowid);
}
function auditar(gestorId, imobiliariaId, acao, detalhe, ip) {
  run('INSERT INTO auditoria_plataforma(gestor_id,imobiliaria_id,acao,detalhe,ip) VALUES(?,?,?,?,?)',
    gestorId ?? null, imobiliariaId ?? null, acao, detalhe ? String(detalhe).slice(0, 1000) : null, ip || null);
}

module.exports = {
  semente, porSlug, porId, lista, padrao, slugDoHost, liberada, motivoBloqueio, bloqueioPublico, limparCache,
  criar, alterar, adicionarDominio, emailEmOutra, indexaLogin, desindexaLogin, loginPorEmail, criarGestor, auditar,
  STATUS, PUBLICAS,
};
