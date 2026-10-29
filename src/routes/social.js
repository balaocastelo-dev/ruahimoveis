// Redes e publicações (#/redes): calendário mensal das publicações no Instagram, Facebook e Google Meu Negócio,
// geradas sozinhas com os imóveis do portal, o blog, a revista da semana e os guias de bairro.
//
//   api (logado)   /api/social…          calendário, post, aprovar, trocar, publicar agora, contas, ajustes
//   publico        /social/arte/<id>/<n>.jpg   a arte (a Meta e o Google buscam aqui; endereço assinado)
//                  /r/<id><rede>          link rastreado: conta o clique, marca a origem e leva ao portal/blog
//                  /links                 a página "link na bio" com os últimos posts
//                  /redes/retorno/<rede>  volta do Facebook/Google ao conectar a conta
//                  POST /social-ciclo     o agendador do Supabase (a cada 10 min) planeja e publica
const express = require('express');
const crypto = require('crypto');
const A = require('../auth');
const cfg = require('../config');
const { one, all, run, audit, getConfig, setConfig } = require('../db');
const { falha, txt } = require('../util');
const tempo = require('../social/tempo');
const planos = require('../social/planos');
const gerar = require('../social/gerar');
const C = require('../social/conteudo');
const P = require('../social/publicar');
const R = require('../social/redes');

const api = express.Router();
const gestor = A.exigePerfil('adm', 'gestor');
const postOu404 = (id) => one('SELECT * FROM social_posts WHERE id=?', Number(id)) || falha(404, 'Publicação não encontrada.');
const ESTADOS = ['agendado', 'aguardando', 'publicando', 'publicado', 'parcial', 'erro', 'pronto_manual', 'cancelado'];

function resumo(p) {
  const slides = P.slidesDe(p);
  return {
    id: p.id, tipo: p.tipo, ref: p.ref, titulo: p.titulo, agendado_para: p.agendado_para, status: p.status, origem: p.origem,
    redes: P.redesDe(p), resultado: P.resultadoDe(p), slides: slides.length, motivo: p.motivo, editado: !!p.editado,
    thumb: P.arteUrl(p, 0, 'feed', false), publicado_em: p.publicado_em,
  };
}
function garanteToken() {
  if (!getConfig('social_ciclo_token')) setConfig('social_ciclo_token', A.tokenAleatorio(24));
}

// ---------- calendário do mês
api.get('/social', async (req, res) => {
  garanteToken();
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : tempo.hoje().slice(0, 7);
  // abre a tela: se o calendário nunca foi planejado (ou faz mais de 1 h), planeja agora
  const ult = getConfig('social_planejado_em');
  if (!ult || tempo.instante(tempo.local()) - tempo.instante(ult) > 60 * 60e3) { try { await gerar.planejar(); } catch (e) { console.error('[redes] planejar', e.message); } }
  const posts = all(`SELECT * FROM social_posts WHERE substr(agendado_para,1,7)=? AND status<>'cancelado' ORDER BY agendado_para, id`, mes).map(resumo);
  const canc = all(`SELECT * FROM social_posts WHERE substr(agendado_para,1,7)=? AND status='cancelado' AND chave NOT LIKE '%#x%' ORDER BY agendado_para`, mes).map(resumo);
  const c = (sql, ...p) => (one(sql, ...p) || {}).n || 0;
  const agora = tempo.local();
  const daqui7 = tempo.local(new Date(Date.now() + 7 * 864e5));
  res.json({
    mes, hoje: tempo.hoje(), agora, posts, cancelados: canc,
    cadencia: planos.cadencia(), ajustes: planos.ajustes(), contas: R.contas(), disponivel: R.disponivel(),
    numeros: {
      publicados_mes: c(`SELECT count(*) n FROM social_posts WHERE status IN ('publicado','parcial') AND substr(coalesce(publicado_em, agendado_para),1,7)=?`, mes),
      agendados_7d: c(`SELECT count(*) n FROM social_posts WHERE status IN ('agendado','aguardando') AND agendado_para > ? AND agendado_para <= ?`, agora, daqui7),
      aguardando: c(`SELECT count(*) n FROM social_posts WHERE status='aguardando' AND agendado_para > ?`, agora),
      pronto_manual: c(`SELECT count(*) n FROM social_posts WHERE status='pronto_manual' AND agendado_para >= ?`, tempo.local(new Date(Date.now() - 7 * 864e5))),
      erros: c(`SELECT count(*) n FROM social_posts WHERE status IN ('erro','parcial') AND agendado_para >= ?`, tempo.local(new Date(Date.now() - 7 * 864e5))),
      cliques_mes: c(`SELECT count(*) n FROM social_cliques WHERE substr(em,1,7)=?`, mes),
      leads_mes: c(`SELECT count(*) n FROM leads WHERE origem LIKE ? AND substr(criado_em,1,7)=?`, '% · redes%', mes),
    },
    planejado_em: getConfig('social_planejado_em'), ciclo_em: getConfig('social_ciclo_em'),
  });
});

// ---------- avisos para o menu (badge)
api.get('/social/resumo', (req, res) => {
  const desde = tempo.local(new Date(Date.now() - 7 * 864e5));
  const n = (sql, ...p) => (one(sql, ...p) || {}).n || 0;
  res.json({
    erros: n(`SELECT count(*) n FROM social_posts WHERE status IN ('erro','parcial') AND agendado_para >= ?`, desde),
    pronto_manual: n(`SELECT count(*) n FROM social_posts WHERE status='pronto_manual' AND agendado_para >= ?`, tempo.hoje() + ' 00:00'),
    aguardando: n(`SELECT count(*) n FROM social_posts WHERE status='aguardando' AND agendado_para > ? AND agendado_para <= ?`, tempo.local(), tempo.local(new Date(Date.now() + 3 * 864e5))),
  });
});

// ---------- um post
api.get('/social/posts/:id', async (req, res) => {
  const p = postOu404(req.params.id);
  const v = await C.vivo(p);
  const legenda = p.editado || !v ? p.legenda : v.legenda;
  const tags = p.editado || !v ? (p.hashtags || '') : v.hashtags;
  const slides = v ? v.slides : P.slidesDe(p);
  res.json({
    ...resumo(p), legenda, hashtags: tags, link: v ? v.link : p.link, chave: p.chave,
    artes: slides.map((s, i) => ({ url: P.arteUrl(p, i, 'feed', false), tipo: s.k, legenda: s.legenda || '' })),
    google: P.arteUrl(p, 0, 'google', false),
    previas: P.legendas(p, legenda, tags),
    existe: !!v,
    cliques: all('SELECT rede, count(*) n FROM social_cliques WHERE post_id=? GROUP BY rede', p.id),
  });
});
api.put('/social/posts/:id', (req, res) => {
  const p = postOu404(req.params.id);
  if (['publicado', 'publicando'].includes(p.status)) falha(400, 'Esta publicação já saiu.');
  const b = req.body || {};
  const campos = [], vals = [];
  if (b.legenda !== undefined) { campos.push('legenda=?', 'editado=1'); vals.push(txt(b.legenda, 2000) || ''); }
  if (b.hashtags !== undefined) { campos.push('hashtags=?', 'editado=1'); vals.push(String(b.hashtags || '').split(/\s+/).filter((h) => /^#?[\p{L}\p{N}_]{2,40}$/u.test(h)).slice(0, 20).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')); }
  if (b.agendado_para !== undefined) {
    const q = String(b.agendado_para).replace('T', ' ').slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(q)) falha(400, 'Data e hora inválidas.');
    if (q <= tempo.local()) falha(400, 'Escolha um horário no futuro (ou use "Publicar agora").');
    campos.push('agendado_para=?'); vals.push(q);
    if (['erro', 'pronto_manual'].includes(p.status)) { campos.push("status='agendado'"); }
  }
  if (Array.isArray(b.redes)) { campos.push('redes=?'); vals.push(JSON.stringify(b.redes.filter((r) => planos.REDES.includes(r)))); }
  if (b.desfazer_edicao) { campos.push('editado=0'); }
  if (!campos.length) return res.json(resumo(p));
  run(`UPDATE social_posts SET ${campos.join(', ')}, atualizado_em=datetime('now','localtime') WHERE id=?`, ...vals, p.id);
  audit(req.usuario.id, 'social_editou', `#${p.id} ${Object.keys(b).join(', ')}`);
  res.json(resumo(postOu404(p.id)));
});
api.post('/social/posts/:id/aprovar', gestor, (req, res) => {
  const p = postOu404(req.params.id);
  run(`UPDATE social_posts SET status='agendado', aprovado_por=?, aprovado_em=datetime('now','localtime') WHERE id=? AND status='aguardando'`, req.usuario.id, p.id);
  res.json(resumo(postOu404(p.id)));
});
api.post('/social/aprovar', gestor, (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(String((req.body || {}).mes || '')) ? req.body.mes : tempo.hoje().slice(0, 7);
  const r = run(`UPDATE social_posts SET status='agendado', aprovado_por=?, aprovado_em=datetime('now','localtime') WHERE status='aguardando' AND substr(agendado_para,1,7)=? AND agendado_para > ?`, req.usuario.id, mes, tempo.local());
  audit(req.usuario.id, 'social_aprovou_mes', `${mes}: ${r.changes}`);
  res.json({ aprovados: r.changes });
});
api.post('/social/posts/:id/cancelar', (req, res) => {
  const p = postOu404(req.params.id);
  if (['publicado', 'publicando'].includes(p.status)) falha(400, 'Esta publicação já saiu. Apague direto na rede, se quiser.');
  run(`UPDATE social_posts SET status='cancelado', motivo=?, atualizado_em=datetime('now','localtime') WHERE id=?`, `Tirado do calendário por ${req.usuario.nome}.`, p.id);
  audit(req.usuario.id, 'social_cancelou', `#${p.id} ${p.tipo} ${p.ref || ''}`);
  res.json(resumo(postOu404(p.id)));
});
api.post('/social/posts/:id/restaurar', (req, res) => {
  const p = postOu404(req.params.id);
  if (p.status !== 'cancelado') return res.json(resumo(p));
  if (p.agendado_para <= tempo.local()) falha(400, 'O horário já passou: mude a data antes de voltar com o post.');
  run(`UPDATE social_posts SET status=?, motivo=NULL, atualizado_em=datetime('now','localtime') WHERE id=?`, planos.ajustes().modo === 'aprovar' ? 'aguardando' : 'agendado', p.id);
  res.json(resumo(postOu404(p.id)));
});
api.post('/social/posts/:id/trocar', async (req, res) => {
  const p = postOu404(req.params.id);
  if (!['agendado', 'aguardando', 'pronto_manual', 'erro'].includes(p.status)) falha(400, 'Só dá para trocar o que ainda não saiu.');
  if (p.origem !== 'auto' || ['revista'].includes(p.tipo)) falha(400, 'Só os posts do rodízio automático podem ser trocados. Este você pode editar ou tirar do calendário.');
  if (p.agendado_para <= tempo.local()) falha(400, 'O horário já passou.');
  const r = await gerar.trocar(p);
  audit(req.usuario.id, 'social_trocou', `#${p.id} ${p.ref} → #${r.novo || '—'}`);
  res.json(r);
});
api.post('/social/posts/:id/publicar', gestor, async (req, res) => {
  const p = postOu404(req.params.id);
  if (p.status === 'publicado') falha(400, 'Já foi publicado.');
  if (p.status === 'cancelado') falha(400, 'Volte com o post para o calendário antes.');
  if (planos.ajustes().pausado) falha(400, 'As publicações estão pausadas (Ajustes).');
  if (['aguardando'].includes(p.status)) run(`UPDATE social_posts SET aprovado_por=?, aprovado_em=datetime('now','localtime') WHERE id=?`, req.usuario.id, p.id);
  const r = await P.publicar(p, { forcar: true });
  audit(req.usuario.id, 'social_publicou_agora', `#${p.id} → ${r && r.status}`);
  res.json(resumo(r));
});
api.post('/social/posts/:id/postado', (req, res) => {
  const p = postOu404(req.params.id);
  const res0 = P.resultadoDe(p);
  res0.manual = { ok: true, em: tempo.local(), por: req.usuario.nome };
  run(`UPDATE social_posts SET status='publicado', resultado=?, publicado_em=?, motivo=NULL, atualizado_em=datetime('now','localtime') WHERE id=?`, JSON.stringify(res0), tempo.local(), p.id);
  audit(req.usuario.id, 'social_postado_a_mao', `#${p.id}`);
  res.json(resumo(postOu404(p.id)));
});

// ---------- planejar, imóveis escolhidos à mão, ajustes
api.post('/social/planejar', gestor, async (req, res) => { const r = await gerar.planejar(); audit(req.usuario.id, 'social_planejou', `${r.criados} novo(s)`); res.json(r); });
api.get('/social/imoveis', async (req, res) => {
  const ims = await C.imoveis();
  const ult = new Map(all(`SELECT ref, max(agendado_para) u, count(*) n FROM social_posts WHERE tipo='imovel' AND status<>'cancelado' GROUP BY ref`).map((r) => [r.ref, r]));
  const prox = new Map(all(`SELECT ref, min(agendado_para) p FROM social_posts WHERE tipo='imovel' AND status IN ('agendado','aguardando') AND agendado_para > ? GROUP BY ref`, tempo.local()).map((r) => [r.ref, r.p]));
  res.json(ims.map((x) => ({
    codigo: x.imovel.codigo, titulo: x.pagina.titulo, tipo: x.imovel.tipo, bairro: x.imovel.bairro, valor: C.ehSignature(x.imovel) ? null : x.imovel.valor, signature: C.ehSignature(x.imovel),
    fotos: x.imovel.fotos.length, capa: `/imoveis/foto/${x.pagina.capa.foto}?v=2`, posts: (ult.get(x.imovel.codigo) || {}).n || 0, ultimo: (ult.get(x.imovel.codigo) || {}).u || null, proximo: prox.get(x.imovel.codigo) || null,
  })));
});
api.post('/social/imoveis', async (req, res) => {
  const b = req.body || {};
  const codigos = Array.isArray(b.codigos) ? b.codigos.slice(0, 60) : [];
  if (!codigos.length) falha(400, 'Escolha ao menos um imóvel.');
  const r = await gerar.postsDeImoveis(codigos, { inicio: b.inicio, hora: b.hora, intervaloDias: Math.min(14, Math.max(0, Number(b.intervalo) || 0)) });
  audit(req.usuario.id, 'social_escolheu_imoveis', `${r.criados.length} post(s): ${codigos.join(', ')}`.slice(0, 900));
  res.json(r);
});
api.put('/social/ajustes', gestor, (req, res) => {
  const a = planos.salvaAjustes(req.body || {});
  // ligou a aprovação: o que estava agendado passa a esperar; desligou: o que esperava vai
  if ((req.body || {}).modo === 'aprovar') run(`UPDATE social_posts SET status='aguardando' WHERE status='agendado' AND origem='auto' AND agendado_para > ?`, tempo.local());
  if ((req.body || {}).modo === 'automatico') run(`UPDATE social_posts SET status='agendado' WHERE status='aguardando' AND agendado_para > ?`, tempo.local());
  audit(req.usuario.id, 'social_ajustes', JSON.stringify(a).slice(0, 500));
  res.json(a);
});

// ---------- contas
api.get('/social/contas', (req, res) => res.json({ contas: R.contas({ todas: true }), disponivel: R.disponivel(), retorno: { meta: R.retorno('meta'), google: R.retorno('google') } }));
api.get('/social/conectar/:rede', gestor, (req, res) => {
  const d = R.disponivel();
  if (d.demonstracao) falha(400, 'Esta é uma imobiliária de demonstração: as contas de verdade não são ligadas aqui.');
  if (req.params.rede === 'meta') { if (!d.meta) falha(400, 'O app da plataforma na Meta ainda não foi configurado (META_APP_ID e META_APP_SECRET).'); return res.json({ url: R.linkMeta(req.usuario.id) }); }
  if (req.params.rede === 'google') { if (!d.google) falha(400, 'O projeto do Google ainda não foi configurado (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).'); return res.json({ url: R.linkGoogle(req.usuario.id) }); }
  falha(404, 'Rede desconhecida.');
});
api.post('/social/contas/:id/ativar', gestor, (req, res) => { const c = R.ativar(Number(req.params.id)) || falha(404, 'Conta não encontrada.'); audit(req.usuario.id, 'social_conta_ativa', `${c.rede} ${c.nome}`); res.json({ ok: true }); });
api.delete('/social/contas/:id', gestor, (req, res) => {
  const c = one('SELECT * FROM social_contas WHERE id=?', Number(req.params.id)) || falha(404, 'Conta não encontrada.');
  run('DELETE FROM social_contas WHERE id=?', c.id);
  audit(req.usuario.id, 'social_conta_removida', `${c.rede} ${c.nome}`);
  res.json({ ok: true });
});

// =================================================================== público
const publico = express.Router();

// a arte (endereço assinado: só abre com a assinatura certa, para não dar para varrer as publicações)
publico.get('/social/arte/:id/:n.jpg', async (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.id) || !/^\d{1,2}$/.test(req.params.n)) return res.sendStatus(404);
  const p = one('SELECT * FROM social_posts WHERE id=?', Number(req.params.id));
  if (!p || String(p.versao) !== String(req.query.v) || !P.confereAssinatura(p.id, p.versao, String(req.query.s || ''))) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  try {
    const jpg = await C.desenhar(p, Number(req.params.n), req.query.f === 'google' ? 'google' : 'feed');
    if (!jpg) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
    res.setHeader('Content-Type', 'image/jpeg');
    // o preço vem ao vivo: cache curto na Vercel (a Meta busca na hora de publicar)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.query.baixar) res.setHeader('Content-Disposition', `attachment; filename="post-${p.id}-${Number(req.params.n) + 1}.jpg"`);
    res.end(jpg);
  } catch (e) {
    console.error('[redes] arte', p.id, e.message);
    res.setHeader('Cache-Control', 'no-store'); res.sendStatus(502);
  }
});

// link rastreado: /r/123i (Instagram), /r/123f (Facebook), /r/123g (Google)
const REDE = { i: 'instagram', f: 'facebook', g: 'google', l: 'links' };
publico.get('/r/:cod', (req, res) => {
  const m = String(req.params.cod).match(/^(\d{1,9})([ifgl]?)$/);
  const p = m && one('SELECT id, tipo, link FROM social_posts WHERE id=?', Number(m[1]));
  if (!p || !p.link || !p.link.startsWith('/')) return res.redirect(302, '/imoveis');
  const rede = REDE[m[2]] || 'redes';
  try { if (!/bot|crawl|spider|facebookexternalhit|preview/i.test(String(req.get('user-agent') || ''))) run('INSERT INTO social_cliques(post_id,rede) VALUES(?,?)', p.id, rede); } catch { /* conta é conveniência */ }
  // a origem fica no aparelho por 30 dias: o lead que vier depois diz de qual rede chegou
  const seguro = String(cfg.PUBLIC_URL || '').startsWith('https://') || req.secure;
  res.setHeader('Set-Cookie', `redes_origem=${rede}.${p.id}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax${seguro ? '; Secure' : ''}`);
  res.setHeader('Cache-Control', 'no-store');
  const sep = p.link.includes('?') ? '&' : '?';
  res.redirect(302, `${p.link}${sep}utm_source=${rede}&utm_medium=social&utm_campaign=${p.tipo}-${p.id}`);
});

// página "link na bio"
publico.get('/links', async (req, res) => {
  const paginas = require('../portal/paginas');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const posts = all(`SELECT * FROM social_posts WHERE status IN ('publicado','parcial') ORDER BY coalesce(publicado_em, agendado_para) DESC LIMIT 24`);
  const vivos = [];
  for (const p of posts) { if (vivos.length >= 12) break; const v = await C.vivo(p).catch(() => null); if (v) vivos.push({ p, v }); }
  const NOME = { imovel: 'Imóvel', blog: 'Blog', revista: 'Revista', bairro: 'Guia do bairro' };
  const corpo = `<section class="p-links"><h1>Nas redes da ${esc(cfg.CLIENTE_NOME)}</h1><p class="p-links-l">Toque na publicação que você viu para abrir a página completa.</p>
  <div class="p-links-fixos"><a class="p-botao" href="/imoveis">Todos os imóveis</a><a class="p-botao sec" href="/imoveis/revista">Revista</a><a class="p-botao sec" href="/blog">${esc(cfg.BLOG_NOME)}</a><a class="p-botao sec" href="/bairros">Bairros</a></div>
  ${vivos.length ? `<div class="p-links-grade">${vivos.map(({ p }) => `<a class="p-links-item" href="/r/${p.id}l"><img src="${esc(P.arteUrl(p, 0, 'feed', false))}" alt="${esc(p.titulo)}" width="1080" height="1350" loading="lazy" decoding="async"><span><small>${esc(NOME[p.tipo] || '')}</small>${esc(p.titulo)}</span></a>`).join('')}</div>` : '<p class="p-links-l">As publicações aparecem aqui assim que saírem nas redes.</p>'}</section>`;
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.type('html').send(paginas.casca(req, { titulo: `${cfg.CLIENTE_NOME} nas redes · links`, descricao: `As publicações da ${cfg.CLIENTE_NOME} no Instagram e no Facebook, com o link de cada uma.`, caminho: '/links', corpo, classe: 'p-vitrine', semIndice: true }));
});

// volta do Facebook / Google ao conectar a conta (navegação comum, com a sessão do sistema)
publico.get('/redes/retorno/:rede', async (req, res) => {
  const rede = req.params.rede === 'google' ? 'google' : req.params.rede === 'meta' ? 'meta' : null;
  const volta = (msg) => res.redirect(`/#/redes/contas?${new URLSearchParams({ conexao: msg })}`);
  const u = A.usuarioDaSessao(req);
  if (!rede) return res.redirect('/#/redes');
  if (!u || !['adm', 'gestor'].includes(u.perfil)) return volta('Entre como administrador ou gestor para conectar as redes.');
  if (req.query.error) return volta(rede === 'meta' ? 'Conexão cancelada no Facebook.' : 'Conexão cancelada no Google.');
  if (!R.confereEstado(req.query.state, rede, u.id)) return volta('O pedido de conexão expirou. Tente de novo.');
  try {
    const r = rede === 'meta' ? await R.retornoMeta(String(req.query.code || ''), u.id) : await R.retornoGoogle(String(req.query.code || ''), u.id);
    audit(u.id, 'social_conectou', `${rede} ${JSON.stringify(r)}`);
    volta('ok');
  } catch (e) { volta(e.message); }
});

// o agendador do Supabase (pg_cron + pg_net) chama a cada 10 minutos, com o token desta imobiliária
publico.post('/social-ciclo', async (req, res) => {
  const token = getConfig('social_ciclo_token');
  const veio = String(req.headers['x-social-ciclo'] || '');
  if (!token || veio.length !== token.length || !crypto.timingSafeEqual(Buffer.from(veio), Buffer.from(token))) return res.status(401).json({ erro: 'não autorizado' });
  res.json(await P.ciclo());
});

module.exports = { api, publico, ESTADOS };
