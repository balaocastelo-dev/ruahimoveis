// Login, sessões, perfis de acesso e criptografia de segredos guardados no banco.
const crypto = require('crypto');
const { one, run, audit } = require('./db');
const { SECRET_KEY } = require('./config');

const SESSAO_HORAS = 12;
const COOKIE = 'ruah_sessao';

// ---- senhas (scrypt, embutido no Node) ----
function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function confereSenha(senha, armazenado) {
  const [alg, saltHex, hHex] = String(armazenado).split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hHex, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}
function senhaValida(s) {
  return typeof s === 'string' && s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokenAleatorio = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

// ---- sessões ----
// Sem MULTI: tabela sessoes da instalação (token → usuário), como sempre.
// Com MULTI=1 (plataforma): sessoes é COMUM (base.sessoes) e guarda também a imobiliária (imobiliaria_id) e, para o
// gestor da plataforma, gestor_id. O cookie continua com o mesmo nome (ruah_sessao).
const tenant = require('./tenant');
const registro = () => require('./plataforma/registro');
const multi = () => tenant.multi();
// id (no cadastro da plataforma) da imobiliária do contexto; null sem MULTI ou sem cadastro
function imobiliariaAtualId() {
  if (!multi()) return null;
  const c = tenant.atual();
  const r = c && (c.registro || registro().porSlug(c.slug));
  return r ? Number(r.id) : null;
}

function criarSessao(usuarioId, { imobiliariaId, gestorId } = {}) {
  const token = tokenAleatorio(32);
  run('DELETE FROM sessoes WHERE expira_em < ?', Date.now());
  if (!multi()) run('INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES(?,?,?)', sha256(token), usuarioId, Date.now() + SESSAO_HORAS * 3600e3);
  else {
    run('INSERT INTO sessoes(token_hash,imobiliaria_id,usuario_id,gestor_id,expira_em) VALUES(?,?,?,?,?)', sha256(token),
      imobiliariaId === undefined ? imobiliariaAtualId() : imobiliariaId, usuarioId ?? null, gestorId ?? null, Date.now() + SESSAO_HORAS * 3600e3);
  }
  return token;
}
function encerrarSessao(token) { if (token) run('DELETE FROM sessoes WHERE token_hash=?', sha256(token)); }
// Derruba as sessões de um usuário da imobiliária atual (desativado ou senha trocada).
function encerrarSessoesDoUsuario(usuarioId) {
  if (!multi()) return run('DELETE FROM sessoes WHERE usuario_id=?', usuarioId);
  run('DELETE FROM sessoes WHERE usuario_id=? AND imobiliaria_id=?', usuarioId, imobiliariaAtualId());
}

function lerCookie(req, nome) {
  const c = req.headers.cookie || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}
const SEGURO = process.env.VERCEL ? '; Secure' : ''; // no link online (https) o cookie só trafega cifrado
function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSAO_HORAS * 3600}${SEGURO}`);
}
function limparCookie(res) { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SEGURO}`); }

// A linha da sessão comum (só MULTI=1), sem olhar o host. null = sem sessão válida.
function linhaSessao(req) {
  if (!multi()) return null;
  const token = lerCookie(req, COOKIE);
  if (!token) return null;
  return one('SELECT * FROM sessoes WHERE token_hash=? AND expira_em>?', sha256(token), Date.now()) || null;
}
// Imobiliária gravada na sessão (registro do cadastro): o middleware usa no host da plataforma de entrada.
function imobiliariaDaSessao(req) {
  const s = linhaSessao(req);
  return s && s.imobiliaria_id ? registro().porId(s.imobiliaria_id) : null;
}

// Quem está logado: { usuario } ou { erro, status } (só o motivo da recusa, para o exigeLogin).
function sessao(req) {
  if (!multi()) {
    const token = lerCookie(req, COOKIE);
    if (!token) return { status: 401 };
    const u = one(`SELECT u.id,u.nome,u.email,u.perfil,u.telefone FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
                   WHERE s.token_hash=? AND s.expira_em>? AND u.ativo=1`, sha256(token), Date.now());
    return u ? { usuario: u } : { status: 401 };
  }
  const s = linhaSessao(req);
  if (!s) return { status: 401 };
  // o host já definiu a imobiliária (domínio dela): a da sessão tem de ser a mesma. No host da plataforma, o
  // middleware já pôs a imobiliária da sessão no contexto.
  const aqui = imobiliariaAtualId();
  if (!req.hostPlataforma && s.imobiliaria_id && Number(s.imobiliaria_id) !== aqui) return { status: 401 };
  const imob = s.imobiliaria_id ? registro().porId(s.imobiliaria_id) : null;
  if (s.gestor_id) {
    const g = one('SELECT id,nome,email FROM gestores WHERE id=? AND ativo=1', s.gestor_id);
    if (!g) return { status: 401 };
    return { usuario: { id: null, nome: g.nome, email: g.email, perfil: 'plataforma', telefone: null, gestor_id: g.id, imobiliaria: imob ? imob.slug : null } };
  }
  if (!imob) return { status: 401 };
  const motivo = registro().motivoBloqueio(imob);
  if (motivo) return { status: 403, erro: motivo };
  const u = one('SELECT id,nome,email,perfil,telefone FROM usuarios WHERE id=? AND ativo=1', s.usuario_id);
  return u ? { usuario: { ...u, imobiliaria: imob.slug } } : { status: 401 };
}
function usuarioDaSessao(req) { return sessao(req).usuario || null; }

// ---- proteção contra tentativa de senha em sequência ----
function podeTentar(chave) {
  const r = one('SELECT * FROM tentativas_login WHERE chave=?', chave);
  return !r || r.bloqueado_ate < Date.now();
}
function registraFalha(chave) {
  const r = one('SELECT * FROM tentativas_login WHERE chave=?', chave);
  const falhas = (r ? r.falhas : 0) + 1;
  const bloqueio = falhas >= 5 ? Date.now() + 15 * 60e3 : 0;
  run('INSERT INTO tentativas_login(chave,falhas,bloqueado_ate) VALUES(?,?,?) ON CONFLICT(chave) DO UPDATE SET falhas=excluded.falhas, bloqueado_ate=excluded.bloqueado_ate',
    chave, bloqueio ? 0 : falhas, bloqueio);
}
function limpaFalhas(chave) { run('DELETE FROM tentativas_login WHERE chave=?', chave); }

// ---- middlewares ----
function exigeLogin(req, res, next) {
  const r = sessao(req);
  if (!r.usuario) return res.status(r.status || 401).json({ erro: r.erro || 'Sessão expirada. Entre novamente.' });
  // gestor da plataforma só usa as telas de uma imobiliária depois do "entrar como"
  if (r.usuario.perfil === 'plataforma' && !r.usuario.imobiliaria) return res.status(403).json({ erro: 'Escolha a imobiliária (entrar como) antes de usar o sistema.' });
  req.usuario = r.usuario;
  next();
}
// O gestor da plataforma (perfil 'plataforma') passa em qualquer perfil exigido.
const exigePerfil = (...perfis) => (req, res, next) => {
  if (req.usuario.perfil !== 'plataforma' && !perfis.includes(req.usuario.perfil)) return res.status(403).json({ erro: 'Seu perfil não tem acesso a esta função.' });
  next();
};
// Bloqueia requisições de escrita vindas de outro site (CSRF), além do SameSite=Lax.
function mesmaOrigem(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origem = req.headers.origin;
  if (origem) {
    try {
      if (new URL(origem).host !== req.headers.host) return res.status(403).json({ erro: 'Origem não permitida.' });
    } catch { return res.status(403).json({ erro: 'Origem inválida.' }); }
  }
  next();
}

const veTudo = (u) => u.perfil === 'adm' || u.perfil === 'gestor' || u.perfil === 'plataforma';

// ---- criptografia de segredos (tokens do Google) ----
function chave() {
  if (!SECRET_KEY || SECRET_KEY.length < 32) throw new Error('SECRET_KEY ausente ou curta no .env');
  return crypto.createHash('sha256').update(SECRET_KEY).digest();
}
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decifrar(pacote) {
  const [iv, tag, enc] = pacote.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

module.exports = {
  hashSenha, confereSenha, senhaValida, sha256, tokenAleatorio,
  criarSessao, encerrarSessao, encerrarSessoesDoUsuario, lerCookie, setCookie, limparCookie, usuarioDaSessao, sessao, linhaSessao, imobiliariaDaSessao,
  imobiliariaAtualId, COOKIE,
  podeTentar, registraFalha, limpaFalhas,
  exigeLogin, exigePerfil, mesmaOrigem, veTudo, cifrar, decifrar, audit,
};
