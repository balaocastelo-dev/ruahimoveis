// Plataforma multi-imobiliária · API do gestor da plataforma (a tela é da fase 2). Só com MULTI=1.
//   POST /api/plataforma/login        { email, senha }  → sessão do gestor (sem imobiliária)
//   POST /api/plataforma/entrar-como  { slug }          → grava a imobiliária na sessão e registra na auditoria
//   GET  /api/plataforma/me                              → o gestor e a imobiliária em que entrou
//   POST /api/plataforma/sair                            → encerra a sessão
// Com a imobiliária escolhida, o gestor usa o sistema dela com perfil 'plataforma' (passa em todo exigePerfil).
const express = require('express');
const A = require('../auth');
const { one, run } = require('../db');
const { falha } = require('../util');
const tenant = require('../tenant');
const registro = require('../plataforma/registro');

const r = express.Router();
r.use((req, res, next) => (tenant.multi() ? next() : res.status(404).json({ erro: 'Rota não encontrada.' })));

function gestorDaSessao(req) {
  const s = A.linhaSessao(req);
  if (!s || !s.gestor_id) return null;
  const g = one('SELECT id,nome,email FROM gestores WHERE id=? AND ativo=1', s.gestor_id);
  return g ? { ...g, sessao: s } : null;
}

r.post('/login', (req, res) => {
  const { email, senha } = req.body || {};
  const chave = `plataforma|${req.ip}|${String(email || '').toLowerCase()}`;
  if (!A.podeTentar(chave)) falha(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  const g = one('SELECT * FROM gestores WHERE email=? AND ativo=1', String(email || '').trim());
  if (!g || !A.confereSenha(String(senha || ''), g.senha_hash)) { A.registraFalha(chave); falha(401, 'E-mail ou senha incorretos.'); }
  A.limpaFalhas(chave);
  A.setCookie(res, A.criarSessao(null, { imobiliariaId: null, gestorId: g.id }));
  registro.auditar(g.id, null, 'login', null, req.ip);
  res.json({ ok: true, gestor: { id: g.id, nome: g.nome } });
});

r.post('/entrar-como', (req, res) => {
  const g = gestorDaSessao(req) || falha(401, 'Entre como gestor da plataforma.');
  const im = registro.porSlug((req.body || {}).slug) || falha(404, 'Imobiliária não encontrada.');
  run('UPDATE sessoes SET imobiliaria_id=? WHERE token_hash=?', im.id, g.sessao.token_hash);
  registro.auditar(g.id, im.id, 'entrar_como', `${g.email} entrou como ${im.slug} (status ${im.status})`, req.ip);
  res.json({ ok: true, imobiliaria: { slug: im.slug, nome: im.nome_curto, status: im.status } });
});

r.get('/me', (req, res) => {
  const g = gestorDaSessao(req) || falha(401, 'Entre como gestor da plataforma.');
  const im = registro.porId(g.sessao.imobiliaria_id);
  res.json({ id: g.id, nome: g.nome, email: g.email, imobiliaria: im ? { slug: im.slug, nome: im.nome_curto, status: im.status } : null });
});

r.post('/sair', (req, res) => { A.encerrarSessao(A.lerCookie(req, A.COOKIE)); A.limparCookie(res); res.json({ ok: true }); });

module.exports = r;
