// Redes e publicações · as contas conectadas e a publicação de verdade.
//
//   Facebook e Instagram: app da plataforma na Meta (META_APP_ID / META_APP_SECRET). A imobiliária entra
//   com o Facebook dela, escolhe a Página; o Instagram profissional ligado à Página vem junto.
//   Google Meu Negócio: o mesmo projeto do Google usado pelo Drive (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET),
//   com a permissão business.manage (precisa do acesso à API liberado pelo Google).
//
// Os tokens ficam cifrados no banco (cifra derivada da conexão do banco, igual no PC e no link).
// Sem as chaves do app, os botões "Conectar" explicam o que falta e os posts saem como "pronto para postar".
const crypto = require('crypto');
const cfg = require('../config');
const { one, all, run } = require('../db');

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v24.0'}`;
const DIALOGO = () => `https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v24.0'}/dialog/oauth`;
const ESCOPO_META = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management', 'instagram_basic', 'instagram_content_publish'];
const ESCOPO_GOOGLE = 'https://www.googleapis.com/auth/business.manage';

// ------------------------------------------------------------------ cifra dos tokens
const segredo = () => crypto.createHash('sha256').update('herrera-redes:' + (process.env.DATABASE_URL || cfg.DATABASE_URL || cfg.SECRET_KEY)).digest();
function cifra(t) {
  if (!t) return null;
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', segredo(), iv);
  const enc = Buffer.concat([c.update(String(t), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decifra(p) {
  if (!p) return null;
  try { const [iv, tag, enc] = String(p).split('.').map((s) => Buffer.from(s, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', segredo(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch { return null; }
}

// ------------------------------------------------------------------ o que está ligado
const demonstracao = () => /^(1|sim|true)$/i.test(String(process.env.PORTAL_DEMONSTRACAO || '').trim());
function disponivel() {
  return {
    meta: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    google: !!(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET),
    demonstracao: demonstracao(),
  };
}
function contas({ todas = false } = {}) {
  return all(`SELECT id, rede, conta_id, nome, usuario, expira_em, ativo, ultimo_erro, conectado_em FROM social_contas ${todas ? '' : 'WHERE ativo=1'} ORDER BY rede, id`);
}
const contaAtiva = (rede) => one('SELECT * FROM social_contas WHERE rede=? AND ativo=1 ORDER BY id DESC LIMIT 1', rede) || null;

function origem() { return String(cfg.PUBLIC_URL || cfg.BASE_URL || '').replace(/\/+$/, ''); }
const retorno = (rede) => `${origem()}/redes/retorno/${rede}`; // fora de /api: a volta do Facebook/Google é uma navegação comum

// state assinado (evita que alguém ligue a conta dele no sistema de outra pessoa)
function estado(usuarioId, rede) {
  const corpo = `${rede}.${usuarioId}.${Date.now()}`;
  const ass = crypto.createHmac('sha256', segredo()).update(corpo).digest('hex').slice(0, 24);
  return `${corpo}.${ass}`;
}
function confereEstado(s, rede, usuarioId) {
  const [r, u, t, ass] = String(s || '').split('.');
  if (r !== rede || Number(u) !== usuarioId || Date.now() - Number(t) > 20 * 60e3) return false;
  const esperado = crypto.createHmac('sha256', segredo()).update(`${r}.${u}.${t}`).digest('hex').slice(0, 24);
  return ass && ass.length === esperado.length && crypto.timingSafeEqual(Buffer.from(ass), Buffer.from(esperado));
}

async function pedir(url, o = {}) {
  const r = await fetch(url, { ...o, signal: AbortSignal.timeout(o.timeout || 25000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const m = (j.error && (j.error.message || j.error.status)) || j.error_description || `HTTP ${r.status}`;
    const e = new Error(String(m).slice(0, 300)); e.status = r.status; e.detalhe = j; throw e;
  }
  return j;
}
const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));

function salvarConta(c, usuarioId) {
  run(`INSERT INTO social_contas(rede,conta_id,nome,usuario,token,refresh,expira_em,dados,ativo,conectado_por,ultimo_erro)
    VALUES(?,?,?,?,?,?,?,?,?,?,NULL)
    ON CONFLICT(rede,conta_id) DO UPDATE SET nome=excluded.nome, usuario=excluded.usuario, token=excluded.token, refresh=coalesce(excluded.refresh, social_contas.refresh),
      expira_em=excluded.expira_em, dados=excluded.dados, ativo=excluded.ativo, conectado_por=excluded.conectado_por, ultimo_erro=NULL, conectado_em=datetime('now','localtime')`,
  c.rede, c.conta_id, c.nome || null, c.usuario || null, cifra(c.token), cifra(c.refresh), c.expira_em || null, c.dados ? JSON.stringify(c.dados) : null, c.ativo ? 1 : 0, usuarioId || null);
}
/** Só uma conta ativa por rede: liga esta e desliga as outras da mesma rede. */
function ativar(id) {
  const c = one('SELECT * FROM social_contas WHERE id=?', id);
  if (!c) return null;
  run('UPDATE social_contas SET ativo=0 WHERE rede=? AND id<>?', c.rede, id);
  run('UPDATE social_contas SET ativo=1 WHERE id=?', id);
  return c;
}

// ================================================================== META (Facebook + Instagram)
function linkMeta(usuarioId) {
  const u = new URL(DIALOGO());
  u.search = form({ client_id: process.env.META_APP_ID, redirect_uri: retorno('meta'), state: estado(usuarioId, 'meta'), scope: ESCOPO_META.join(','), response_type: 'code' }).toString();
  return u.toString();
}
async function retornoMeta(code, usuarioId) {
  const curto = await pedir(`${GRAPH()}/oauth/access_token?${form({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: retorno('meta'), code })}`);
  const longo = await pedir(`${GRAPH()}/oauth/access_token?${form({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: curto.access_token })}`);
  const pg = await pedir(`${GRAPH()}/me/accounts?${form({ fields: 'id,name,access_token,instagram_business_account{id,username,name}', limit: 50, access_token: longo.access_token })}`);
  const paginas = pg.data || [];
  if (!paginas.length) throw new Error('Nenhuma Página do Facebook apareceu. Confira se você é administrador da Página e se marcou a Página na hora de conectar.');
  paginas.forEach((p, i) => {
    const primeira = i === 0; // a primeira Página fica ativa; a tela troca se houver mais de uma
    salvarConta({ rede: 'facebook', conta_id: p.id, nome: p.name, token: p.access_token, ativo: primeira }, usuarioId);
    const ig = p.instagram_business_account;
    if (ig) salvarConta({ rede: 'instagram', conta_id: ig.id, nome: ig.name || ig.username, usuario: ig.username ? `@${ig.username}` : null, token: p.access_token, dados: { pagina: p.id }, ativo: primeira }, usuarioId);
  });
  for (const r of ['facebook', 'instagram']) { const a = all('SELECT id FROM social_contas WHERE rede=? AND ativo=1 ORDER BY conectado_em DESC, id DESC', r); a.slice(1).forEach((x) => run('UPDATE social_contas SET ativo=0 WHERE id=?', x.id)); }
  return { paginas: paginas.length, instagram: paginas.filter((p) => p.instagram_business_account).length };
}

async function esperaContainer(id, token) {
  for (let i = 0; i < 12; i++) {
    const s = await pedir(`${GRAPH()}/${id}?${form({ fields: 'status_code', access_token: token })}`);
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`O Instagram não aceitou a imagem (${s.status_code}).`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('O Instagram demorou para processar as imagens; tento de novo na próxima rodada.');
}
async function publicarInstagram(conta, { imagens, legenda }) {
  const token = decifra(conta.token);
  if (!token) throw new Error('Conexão do Instagram perdida: conecte de novo.');
  const ig = conta.conta_id;
  let criacao;
  if (imagens.length === 1) {
    criacao = (await pedir(`${GRAPH()}/${ig}/media`, { method: 'POST', body: form({ image_url: imagens[0], caption: legenda, access_token: token }) })).id;
  } else {
    const filhos = [];
    for (const u of imagens.slice(0, 10)) filhos.push((await pedir(`${GRAPH()}/${ig}/media`, { method: 'POST', body: form({ image_url: u, is_carousel_item: 'true', access_token: token }) })).id);
    for (const f of filhos) await esperaContainer(f, token);
    criacao = (await pedir(`${GRAPH()}/${ig}/media`, { method: 'POST', body: form({ media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda, access_token: token }) })).id;
  }
  await esperaContainer(criacao, token);
  const pub = await pedir(`${GRAPH()}/${ig}/media_publish`, { method: 'POST', body: form({ creation_id: criacao, access_token: token }) });
  let url = null;
  try { url = (await pedir(`${GRAPH()}/${pub.id}?${form({ fields: 'permalink', access_token: token })}`)).permalink || null; } catch { /* sem o endereço */ }
  return { id: pub.id, url };
}
async function publicarFacebook(conta, { imagens, legenda }) {
  const token = decifra(conta.token);
  if (!token) throw new Error('Conexão do Facebook perdida: conecte de novo.');
  const pg = conta.conta_id;
  if (imagens.length === 1) {
    const r = await pedir(`${GRAPH()}/${pg}/photos`, { method: 'POST', body: form({ url: imagens[0], message: legenda, access_token: token }) });
    const id = r.post_id || r.id;
    return { id, url: `https://www.facebook.com/${id}` };
  }
  const fotos = [];
  for (const u of imagens.slice(0, 10)) fotos.push((await pedir(`${GRAPH()}/${pg}/photos`, { method: 'POST', body: form({ url: u, published: 'false', access_token: token }) })).id);
  const r = await pedir(`${GRAPH()}/${pg}/feed`, { method: 'POST', body: form({ message: legenda, attached_media: fotos.map((media_fbid) => ({ media_fbid })), access_token: token }) });
  return { id: r.id, url: `https://www.facebook.com/${r.id}` };
}

// ================================================================== GOOGLE MEU NEGÓCIO
function linkGoogle(usuarioId) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = form({ client_id: cfg.GOOGLE_CLIENT_ID, redirect_uri: retorno('google'), response_type: 'code', scope: ESCOPO_GOOGLE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: estado(usuarioId, 'google') }).toString();
  return u.toString();
}
async function tokenGoogle(refresh) {
  const j = await pedir('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
  return j.access_token;
}
async function retornoGoogle(code, usuarioId) {
  const t = await pedir('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ code, client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, redirect_uri: retorno('google'), grant_type: 'authorization_code' }) });
  if (!t.refresh_token) throw new Error('O Google não devolveu a autorização permanente. Tente conectar de novo.');
  const auth = { Authorization: `Bearer ${t.access_token}` };
  const contasG = (await pedir('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20', { headers: auth })).accounts || [];
  const locais = [];
  for (const a of contasG) {
    const l = await pedir(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`, { headers: auth }).catch(() => ({}));
    for (const x of l.locations || []) locais.push({ conta: a.name, local: x.name, nome: x.title });
  }
  if (!locais.length) throw new Error('Nenhum perfil do Google Meu Negócio apareceu nessa conta do Google.');
  const ja = !!contaAtiva('google');
  locais.forEach((x, i) => salvarConta({ rede: 'google', conta_id: `${x.conta}/${x.local}`, nome: x.nome, token: null, refresh: t.refresh_token, ativo: !ja && i === 0 }, usuarioId));
  if (ja) { const ult = one(`SELECT id FROM social_contas WHERE rede='google' ORDER BY conectado_em DESC, id DESC LIMIT 1`); if (ult) ativar(ult.id); }
  return { perfis: locais.length };
}
async function publicarGoogle(conta, { imagem, resumo, link }) {
  const refresh = decifra(conta.refresh);
  if (!refresh) throw new Error('Conexão do Google perdida: conecte de novo.');
  const tk = await tokenGoogle(refresh);
  const corpo = { languageCode: 'pt-BR', summary: resumo.slice(0, 1450), topicType: 'STANDARD', media: [{ mediaFormat: 'PHOTO', sourceUrl: imagem }], ...(link ? { callToAction: { actionType: 'LEARN_MORE', url: link } } : {}) };
  const r = await pedir(`https://mybusiness.googleapis.com/v4/${conta.conta_id}/localPosts`, { method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { id: r.name, url: r.searchUrl || null };
}

module.exports = {
  disponivel, contas, contaAtiva, ativar, salvarConta, cifra, decifra, confereEstado,
  linkMeta, retornoMeta, publicarInstagram, publicarFacebook,
  linkGoogle, retornoGoogle, publicarGoogle, retorno,
};
