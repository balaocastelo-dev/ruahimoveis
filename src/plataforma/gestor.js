// Painel do gestor da plataforma (Herrera HOUSE IA): as imobiliárias clientes, os números de cada uma,
// o cadastro de uma nova, ativar/suspender e os valores (mensalidade + parte da comissão).
// Fica em corretordofuturo.app/gestor. Banco: usuário plataforma_app (PLATAFORMA_DATABASE_URL), que só enxerga
// o schema "plataforma" e chama funções que devolvem números das imobiliárias (nunca nomes, telefones ou endereços).
const crypto = require('crypto');
const express = require('express');
const cfg = require('../config');

const HOSTS = new Set(String(process.env.GESTOR_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app,localhost,127.0.0.1')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const COOKIE = 'gestor_sessao';
const SEGURO = process.env.VERCEL ? '; Secure' : '';
const TEAM = process.env.VERCEL_TEAM_ID || 'team_Mdwt9HWMVtQuaVPBUajlME76';
const REPO = process.env.PLATAFORMA_REPO || 'balaocastelo-dev/ruahimoveis';
const VAZIO = 'https://raw.githubusercontent.com/balaocastelo-dev/ruahimoveis/refs/heads/plataforma/conteudo-vazio';
const POOLER = process.env.PLATAFORMA_POOLER || 'aws-1-us-west-2.pooler.supabase.com:6543';
const PROJETO_DB = process.env.PLATAFORMA_PROJETO_DB || 'yufvfitdhfdjdluvymha';

// ---------- banco (assíncrono, conexão própria) ----------
let POOL = null;
function pool() {
  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (!url) { const e = new Error('Painel sem banco: falta PLATAFORMA_DATABASE_URL.'); e.status = 503; throw e; }
  if (!POOL) {
    const { Pool } = require('pg');
    POOL = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 20000 });
    POOL.on('error', () => {});
  }
  return POOL;
}
const q = async (sql, p = []) => (await pool().query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0] || null;

// ---------- utilidades ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
}
function confere(senha, guardado) {
  const [alg, s, h] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const x = crypto.scryptSync(String(senha), Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const y = Buffer.from(h, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const chaveCifra = () => crypto.createHash('sha256').update(String(cfg.SECRET_KEY) + '|plataforma').digest();
function cifra(txt) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', chaveCifra(), iv);
  const d = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), d].map((b) => b.toString('base64')).join('.');
}
function decifra(s) {
  const [iv, tag, d] = String(s || '').split('.').map((b) => Buffer.from(b, 'base64'));
  const c = crypto.createDecipheriv('aes-256-gcm', chaveCifra(), iv); c.setAuthTag(tag);
  return Buffer.concat([c.update(d), c.final()]).toString('utf8');
}
const senhaForte = () => crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 30);
const txt = (v, max = 200) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const slugDe = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.com.*$/, '').replace(/[^a-z0-9]+/g, '').slice(0, 30);
const falha = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
function lerCookie(req, nome) {
  for (const p of String(req.headers.cookie || '').split(';')) { const [k, ...v] = p.trim().split('='); if (k === nome) return decodeURIComponent(v.join('=')); }
  return null;
}
const evento = (gestorId, imobId, acao, detalhe) => q('INSERT INTO eventos(gestor_id, imobiliaria_id, acao, detalhe) VALUES ($1,$2,$3,$4)', [gestorId, imobId, acao, detalhe]).catch(() => {});

// ---------- sessão ----------
async function gestorDa(req) {
  const t = lerCookie(req, COOKIE); if (!t) return null;
  return um(`SELECT g.id, g.nome, g.email FROM sessoes s JOIN gestores g ON g.id = s.gestor_id WHERE s.token_hash = $1 AND s.expira_em > now() AND g.ativo = 1`, [sha256(t)]);
}
const exige = (fn) => async (req, res) => {
  try {
    if (req.method !== 'GET' && req.get('x-gestor') !== '1') falha(403, 'Pedido recusado.');
    const g = await gestorDa(req); if (!g) falha(401, 'Entre de novo.');
    req.gestor = g; await fn(req, res);
  } catch (e) { res.status(e.status || 500).json({ erro: e.status ? e.message : 'Algo deu errado: ' + e.message }); }
};

// ---------- Vercel (opcional: só com VERCEL_TOKEN) ----------
async function vercel(caminho, metodo = 'GET', corpo) {
  const tok = process.env.VERCEL_TOKEN; if (!tok) return null;
  const r = await fetch(`https://api.vercel.com${caminho}${caminho.includes('?') ? '&' : '?'}teamId=${TEAM}`, {
    method: metodo, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) falha(502, 'Vercel: ' + ((j.error && j.error.message) || r.status));
  return j;
}
function variaveis(im, dbUrl, segredo) {
  const v = {
    DATABASE_URL: dbUrl, SECRET_KEY: segredo, CLIENTE_NOME: im.nome, EMPRESA: im.empresa || im.nome,
    BLOG_NOME: `${im.nome} Blog`, BLOG_LEGENDA: `Casa, bairro e jeito de morar, pela ${im.empresa || im.nome}`,
    BLOG_DIARIO_URL: `${VAZIO}/blog`, PORTAL_CONTEUDO_URL: `${VAZIO}/portal`, BAIRROS_CONTEUDO_URL: `${VAZIO}/bairros`,
    IA_MODO: 'desligado', RADAR_PORTAIS: '0', FISGUEI_ROBO: '0', ESCRITORIO: '0', DRIVE_ROOT_NAME: `${im.nome} Imóveis`,
  };
  if (im.fundo) v.PORTAL_FUNDO = im.fundo; // papel de parede do portal: um lugar-símbolo de Campinas, diferente para cada imobiliária
  if (im.link) { v.PUBLIC_URL = im.link; v.LINK_ONLINE = im.link; }
  return v;
}
// Cada imobiliária ganha um papel de parede próprio, pela ordem de criação (a RUAH fica com o Castelo).
async function comFundo(im) {
  const r = await um(`SELECT count(*)::int AS n FROM imobiliarias WHERE slug <> 'ruah' AND id < $1`, [im.id]);
  const { SEQUENCIA } = require('../portal/fundos');
  return { ...im, fundo: im.slug === 'ruah' ? 'castelo' : SEQUENCIA[((r && r.n) || 0) % SEQUENCIA.length] };
}
async function publicaNaVercel(im, vars) {
  const nome = ('imob-' + im.slug).slice(0, 40);
  const p = await vercel('/v11/projects', 'POST', {
    name: nome, framework: null, serverlessFunctionRegion: 'pdx1', gitRepository: { type: 'github', repo: REPO },
    environmentVariables: Object.entries(vars).map(([key, value]) => ({ key, value, type: /URL$|KEY$/.test(key) && key !== 'BLOG_DIARIO_URL' ? 'encrypted' : 'plain', target: ['production', 'preview'] })),
  });
  if (!p) return null;
  const [org, repo] = REPO.split('/');
  await vercel('/v13/deployments', 'POST', { name: nome, project: p.id, target: 'production', gitSource: { type: 'github', org, repo, ref: 'main' } });
  return p;
}
// link do projeto (a Vercel escolhe o endereço .vercel.app na primeira publicação)
async function linkDaVercel(projeto) {
  try {
    const d = await vercel(`/v9/projects/${encodeURIComponent(projeto)}/domains?production=true`);
    const l = d && (d.domains || []).map((x) => x.name).sort((a, b) => a.length - b.length);
    return l && l.length ? 'https://' + l[0] : null;
  } catch { return null; }
}

// ---------- rotas ----------
const api = express.Router();
api.use(express.json({ limit: '200kb' }));

api.post('/login', async (req, res) => {
  try {
    const email = txt(req.body && req.body.email, 160) || '', senha = String((req.body && req.body.senha) || '');
    const chave = sha256((req.ip || '') + '|' + email.toLowerCase());
    const n = await um(`SELECT count(*)::int n FROM tentativas WHERE chave = $1 AND em > now() - interval '15 minutes'`, [chave]);
    if (n && n.n >= 8) falha(429, 'Muitas tentativas. Espere 15 minutos.');
    const g = await um('SELECT * FROM gestores WHERE email = $1 AND ativo = 1', [email]);
    if (!g || !confere(senha, g.senha_hash)) { await q('INSERT INTO tentativas(chave) VALUES ($1)', [chave]); falha(401, 'E-mail ou senha não conferem.'); }
    const token = crypto.randomBytes(32).toString('hex');
    await q(`INSERT INTO sessoes(token_hash, gestor_id, expira_em) VALUES ($1, $2, now() + interval '12 hours')`, [sha256(token), g.id]);
    await q(`DELETE FROM sessoes WHERE expira_em < now()`);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${SEGURO}`);
    evento(g.id, null, 'login', req.ip);
    res.json({ nome: g.nome, email: g.email });
  } catch (e) { res.status(e.status || 500).json({ erro: e.status ? e.message : 'Não foi possível entrar agora.' }); }
});
api.post('/logout', async (req, res) => {
  const t = lerCookie(req, COOKIE); if (t) await q('DELETE FROM sessoes WHERE token_hash = $1', [sha256(t)]).catch(() => {});
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${SEGURO}`); res.json({ ok: true });
});
api.get('/eu', exige(async (req, res) => res.json(req.gestor)));
api.post('/senha', exige(async (req, res) => {
  const nova = String((req.body && req.body.nova) || '');
  if (nova.length < 10) falha(400, 'A senha nova precisa ter pelo menos 10 caracteres.');
  const g = await um('SELECT senha_hash FROM gestores WHERE id = $1', [req.gestor.id]);
  if (!confere(String(req.body.atual || ''), g.senha_hash)) falha(400, 'A senha atual não confere.');
  await q('UPDATE gestores SET senha_hash = $1 WHERE id = $2', [hashSenha(nova), req.gestor.id]);
  await q('DELETE FROM sessoes WHERE gestor_id = $1 AND token_hash <> $2', [req.gestor.id, sha256(lerCookie(req, COOKIE))]);
  evento(req.gestor.id, null, 'senha', null); res.json({ ok: true });
}));

const COLS = 'id, slug, nome, empresa, contato_nome, contato_email, contato_telefone, link, dominio, vercel_projeto, plano, mensalidade, comissao_pct, comissao_venda_pct, creditos_fisgar_mes, situacao, publicada, notas, criado_em, atualizado_em';
api.get('/imobiliarias', exige(async (req, res) => {
  const lista = await q(`SELECT ${COLS} FROM imobiliarias ORDER BY id`);
  { // papel de parede de cada imobiliária (o mesmo do portal dela), para o fundo do cartão
    const { SEQUENCIA, fundoDe } = require('../portal/fundos'); let k = 0;
    for (const im of lista) { const f = fundoDe(im.slug === 'ruah' ? 'castelo' : SEQUENCIA[(k++) % SEQUENCIA.length], im.nome); im.fundo = { src: f.src, lugar: f.lugar, posicao: f.posicao }; }
  }
  await Promise.all(lista.map(async (im) => {
    try { im.numeros = (await um('SELECT numeros($1) AS n', [im.slug])).n; } catch (e) { im.numeros = null; im.erro = e.message; }
    if (!im.link && im.vercel_projeto && process.env.VERCEL_TOKEN) {
      im.link = await linkDaVercel(im.vercel_projeto);
      if (im.link) await q('UPDATE imobiliarias SET link = $1, publicada = 1 WHERE id = $2', [im.link, im.id]);
    }
    for (const k of ['mensalidade', 'comissao_pct', 'comissao_venda_pct']) im[k] = Number(im[k]);
    const n = im.numeros || {};
    im.comissao_mes = Math.round(Number(n.valor_vendido_mes || 0) * (im.comissao_venda_pct / 100) * (im.comissao_pct / 100));
    im.comissao_total = Math.round(Number(n.valor_vendido_total || 0) * (im.comissao_venda_pct / 100) * (im.comissao_pct / 100));
  }));
  const ativas = lista.filter((i) => i.situacao === 'ativa');
  res.json({
    imobiliarias: lista,
    resumo: {
      total: lista.length, ativas: ativas.length, suspensas: lista.filter((i) => i.situacao === 'suspensa').length, implantacao: lista.filter((i) => i.situacao === 'implantacao').length,
      mensalidades: ativas.reduce((s, i) => s + i.mensalidade, 0),
      comissao_mes: lista.reduce((s, i) => s + i.comissao_mes, 0),
      vgv: lista.reduce((s, i) => s + Number((i.numeros || {}).vgv_carteira || 0), 0),
      imoveis: lista.reduce((s, i) => s + Number((i.numeros || {}).imoveis || 0), 0),
      leads_30d: lista.reduce((s, i) => s + Number((i.numeros || {}).leads_30d || 0), 0),
      creditos_mes: lista.reduce((s, i) => s + Number((i.numeros || {}).creditos_mes || 0), 0),
      vercel_automatico: !!process.env.VERCEL_TOKEN,
    },
  });
}));

const EDITAVEIS = { nome: 120, empresa: 160, contato_nome: 120, contato_email: 160, contato_telefone: 40, link: 300, dominio: 200, plano: 40, notas: 2000 };
const NUMEROS = ['mensalidade', 'comissao_pct', 'comissao_venda_pct', 'creditos_fisgar_mes'];
api.patch('/imobiliarias/:id', exige(async (req, res) => {
  const im = await um(`SELECT ${COLS} FROM imobiliarias WHERE id = $1`, [Number(req.params.id)]) || falha(404, 'Imobiliária não encontrada.');
  const b = req.body || {}, sets = [], p = [];
  for (const [k, max] of Object.entries(EDITAVEIS)) if (b[k] !== undefined) { if (k === 'nome' && !txt(b[k])) falha(400, 'O nome não pode ficar vazio.'); sets.push(`${k} = $${p.push(txt(b[k], max))}`); }
  for (const k of NUMEROS) if (b[k] !== undefined) { const v = num(b[k]); if (v === null || v < 0 || (k.endsWith('_pct') && v > 100)) falha(400, `Valor inválido em ${k}.`); sets.push(`${k} = $${p.push(k === 'creditos_fisgar_mes' ? Math.round(v) : v)}`); }
  if (b.link !== undefined && b.link && !/^https:\/\/[a-z0-9.-]+(\/.*)?$/i.test(b.link)) falha(400, 'O link precisa começar com https://');
  if (!sets.length) return res.json({ ok: true });
  sets.push(`atualizado_em = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')`);
  await q(`UPDATE imobiliarias SET ${sets.join(', ')} WHERE id = $${p.push(im.id)}`, p);
  evento(req.gestor.id, im.id, 'editou', Object.keys(b).join(', '));
  res.json({ ok: true });
}));

api.post('/imobiliarias/:id/situacao', exige(async (req, res) => {
  const im = await um('SELECT id, slug, nome FROM imobiliarias WHERE id = $1', [Number(req.params.id)]) || falha(404, 'Imobiliária não encontrada.');
  const suspensa = !!(req.body && req.body.suspensa);
  await q('SELECT suspender($1, $2)', [im.slug, suspensa]);
  evento(req.gestor.id, im.id, suspensa ? 'suspendeu' : 'reativou', im.nome);
  res.json({ ok: true, situacao: suspensa ? 'suspensa' : 'ativa' });
}));

// Nova imobiliária: cadastro + banco próprio + administrador; publica na Vercel sozinho se houver VERCEL_TOKEN.
api.post('/imobiliarias', exige(async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 120) || falha(400, 'Informe o nome da imobiliária.');
  const slug = slugDe(b.slug || nome);
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(slug)) falha(400, 'Nome técnico inválido: use letras e números (começando por letra).');
  const adminEmail = txt(b.admin_email, 160); if (!adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) falha(400, 'Informe o e-mail do administrador da imobiliária.');
  const adminSenha = String(b.admin_senha || ''); if (adminSenha.length < 8) falha(400, 'A senha do administrador precisa ter pelo menos 8 caracteres.');
  if (await um('SELECT 1 FROM imobiliarias WHERE slug = $1', [slug])) falha(409, `Já existe uma imobiliária com o nome técnico "${slug}".`);
  const im = await um(`INSERT INTO imobiliarias(slug, nome, empresa, contato_nome, contato_email, contato_telefone, plano, mensalidade, comissao_pct, comissao_venda_pct, creditos_fisgar_mes, situacao, notas)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'implantacao',$12) RETURNING ${COLS}`,
  [slug, nome, txt(b.empresa, 160) || nome, txt(b.contato_nome, 120), txt(b.contato_email, 160) || adminEmail, txt(b.contato_telefone, 40), txt(b.plano, 40) || 'essencial',
    num(b.mensalidade) || 0, num(b.comissao_pct) ?? 20, num(b.comissao_venda_pct) ?? 6, Math.round(num(b.creditos_fisgar_mes) || 0), txt(b.notas, 2000)]);
  const dbSenha = senhaForte();
  try {
    await q('SELECT criar_imobiliaria($1, $2, $3, $4, $5)', [slug, dbSenha, txt(b.admin_nome, 120) || `Administrador ${nome}`, adminEmail, hashSenha(adminSenha)]);
  } catch (e) { await q('DELETE FROM imobiliarias WHERE id = $1', [im.id]); falha(400, 'Não foi possível criar o banco: ' + e.message); }
  const dbUrl = `postgres://${slug}_app.${PROJETO_DB}:${dbSenha}@${POOLER}/postgres`;
  const segredo = crypto.randomBytes(32).toString('hex');
  await q('UPDATE imobiliarias SET db_url_cifrada = $1 WHERE id = $2', [cifra(JSON.stringify({ dbUrl, segredo })), im.id]);
  evento(req.gestor.id, im.id, 'criou', `${nome} (${slug})`);
  let publicada = false, aviso = null;
  if (process.env.VERCEL_TOKEN) {
    try {
      const p = await publicaNaVercel(im, variaveis(await comFundo(im), dbUrl, segredo));
      if (p) { publicada = true; await q(`UPDATE imobiliarias SET vercel_projeto = $1, publicada = 1, situacao = 'ativa' WHERE id = $2`, [p.name, im.id]); }
    } catch (e) { aviso = e.message; }
  }
  res.json({ ok: true, id: im.id, slug, publicada, aviso });
}));

// Dados de instalação (para publicar à mão na Vercel): variáveis com a conexão do banco.
api.get('/imobiliarias/:id/instalacao', exige(async (req, res) => {
  const im = await um(`SELECT ${COLS}, db_url_cifrada FROM imobiliarias WHERE id = $1`, [Number(req.params.id)]) || falha(404, 'Imobiliária não encontrada.');
  if (!im.db_url_cifrada) return res.json({ variaveis: null, aviso: 'Esta imobiliária foi instalada antes do painel: as variáveis estão no projeto dela na Vercel.' });
  const { dbUrl, segredo } = JSON.parse(decifra(im.db_url_cifrada));
  evento(req.gestor.id, im.id, 'viu_instalacao', null);
  res.json({ variaveis: variaveis(await comFundo(im), dbUrl, segredo), repo: REPO, vercel_automatico: !!process.env.VERCEL_TOKEN });
}));
api.post('/imobiliarias/:id/publicada', exige(async (req, res) => {
  const link = txt(req.body && req.body.link, 300);
  if (link && !/^https:\/\/[a-z0-9.-]+(\/.*)?$/i.test(link)) falha(400, 'O link precisa começar com https://');
  await q(`UPDATE imobiliarias SET publicada = 1, situacao = CASE WHEN situacao = 'implantacao' THEN 'ativa' ELSE situacao END, link = coalesce($1, link), vercel_projeto = coalesce($2, vercel_projeto) WHERE id = $3`,
    [link, txt(req.body && req.body.vercel_projeto, 100), Number(req.params.id)]);
  evento(req.gestor.id, Number(req.params.id), 'publicada', link); res.json({ ok: true });
}));
api.get('/eventos', exige(async (req, res) => res.json(await q(`SELECT e.acao, e.detalhe, e.em, i.nome imobiliaria FROM eventos e LEFT JOIN imobiliarias i ON i.id = e.imobiliaria_id WHERE e.acao <> 'login' ORDER BY e.id DESC LIMIT 30`))));
api.use((req, res) => res.status(404).json({ erro: 'Não encontrado.' }));

const PAGINA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel do gestor · Herrera HOUSE IA</title><meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/gestor/gestor.css"></head><body><div id="raiz"></div><script src="/gestor/gestor.js"></script></body></html>`;

function gestor(req, res, next) {
  const host = String(req.hostname || '').toLowerCase();
  const ehGestor = req.path === '/gestor' || req.path === '/gestor/' || req.path.startsWith('/gestor-api/');
  if (!ehGestor) return next();
  if (!HOSTS.has(host)) return res.status(404).type('text/plain').send('Não encontrado.');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (req.path.startsWith('/gestor-api/')) { req.url = req.url.replace(/^\/gestor-api/, ''); return api(req, res, next); }
  res.type('html').send(PAGINA);
}

module.exports = { gestor, slugDe, cifra, decifra, hashSenha, confere };
