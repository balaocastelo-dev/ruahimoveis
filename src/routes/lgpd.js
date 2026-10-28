// LGPD dentro do sistema (28/10/2026): aceite dos Termos e da Política por usuário, pedidos dos titulares
// feitos no portal desta imobiliária (prazo de 15 dias) e a lista "não contatar".
const express = require('express');
const A = require('../auth');
const { one, getConfig, setConfig, audit } = require('../db');
const { falha, txt } = require('../util');
const lgpd = require('../lgpd');

const r = express.Router();
const chaveAceite = (id) => `lgpd_aceite_u${id}`;

r.get('/lgpd/aceite', (req, res) => {
  let a = null; try { a = JSON.parse(getConfig(chaveAceite(req.usuario.id)) || 'null'); } catch {}
  res.json({ versao: lgpd.VERSAO, aceito: !!(a && a.versao === lgpd.VERSAO), em: a && a.em, termos: `${lgpd.PLATAFORMA.site}/termos`, privacidade: `${lgpd.PLATAFORMA.site}/privacidade` });
});
r.post('/lgpd/aceite', (req, res) => {
  if (!req.body || req.body.aceito !== true) falha(400, 'Marque que leu e aceita para continuar.');
  const em = new Date().toISOString();
  setConfig(chaveAceite(req.usuario.id), JSON.stringify({ versao: lgpd.VERSAO, em, ip: req.ip }));
  audit(req.usuario.id, 'lgpd_aceite', `Termos e Política versão ${lgpd.VERSAO} · ${req.ip}`);
  res.json({ ok: true, versao: lgpd.VERSAO, em });
});

r.get('/lgpd/resumo', (req, res) => {
  if (!A.veTudo(req.usuario)) return res.json({ abertos: 0, vencendo: 0 });
  const x = one(`SELECT count(*) AS abertos, sum(CASE WHEN prazo <= ? THEN 1 ELSE 0 END) AS vencendo FROM titular_pedidos WHERE situacao='aberto'`,
    new Date(Date.now() - 3 * 3600e3 + 3 * 86400e3).toISOString().slice(0, 10));
  res.json({ abertos: Number(x.abertos) || 0, vencendo: Number(x.vencendo) || 0 });
});
r.get('/lgpd/pedidos', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor veem os pedidos de titulares.');
  res.json({ pedidos: lgpd.lista(), tipos: lgpd.TIPOS, links: { privacidade: '/privacidade', termos: '/termos' }, cliente: { empresa: lgpd.CLIENTE.empresa, cnpj: lgpd.CLIENTE.cnpj, creci: lgpd.CLIENTE.creci, email: lgpd.CLIENTE.email } });
});
r.post('/lgpd/pedidos/:id/atender', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor respondem pedidos de titulares.');
  const resposta = txt(req.body && req.body.resposta, 4000);
  if (!resposta) falha(400, 'Escreva o que foi feito ou respondido ao titular (fica registrado como prova).');
  res.json(lgpd.atender(req.params.id, resposta, req.usuario.id));
});
r.post('/lgpd/nao-contatar', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor incluem números na lista.');
  const tel = lgpd.normTel(req.body && req.body.telefone);
  if (tel.length < 12) falha(400, 'Informe o telefone com DDD.');
  lgpd.naoContatar(tel, txt(req.body.motivo, 200) || 'incluído pela equipe');
  audit(req.usuario.id, 'lgpd_nao_contatar', `…${tel.slice(-4)}`);
  res.json({ ok: true });
});

module.exports = r;
