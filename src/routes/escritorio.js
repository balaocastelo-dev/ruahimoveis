// Escritório virtual: tela dos 9 agentes robôs (#/whats), mesa de cada um, alma (.soul), linha de WhatsApp,
// fila de aprovação, conversa de teste, afazeres dos corretores e fotos recebidas dos donos.
const express = require('express');
const A = require('../auth');
const { one, all, run, audit, getConfig } = require('../db');
const { falha, txt } = require('../util');
const B = require('../agentes/base');
const X = require('../agentes/contexto');
const M = require('../agentes/midias');
const IA = require('../agentes/ia');

const r = express.Router();
const gestor = A.exigePerfil('adm', 'gestor');
const agenteOu404 = (slug) => B.POR_SLUG[slug] || falha(404, 'Agente não encontrado.');
const telTeste = (u, slug) => `teste-${u.id}-${slug}`;
const H = (c) => `substr(${c},1,10)=date('now','localtime')`;

function pc() {
  const st = B.json(getConfig('escritorio_status'), {});
  const vivo = st.em && Date.now() - new Date(st.em).getTime() < 3 * 60e3;
  const cb = B.json(getConfig('escritorio_cerebro'), {});
  const nuvem = IA.naNuvem();
  const cbVivo = cb.em && Date.now() - new Date(cb.em).getTime() < (nuvem ? 4 : 3) * 60e3;
  return { vivo: !!vivo, ia: nuvem ? (cb.ia === false ? false : true) : vivo ? st.ia : null, modelo: nuvem ? IA.ajustes().modelo : st.modelo || null, em: st.em || null, pausado: !!st.pausado,
    nuvem, cerebro: { vivo: !!cbVivo, em: cb.em || null, onde: cb.onde || null, erro: cb.erro || null, ms: cb.ms || null } };
}
function resumoAgente(a, u) {
  const aj = B.ajustes(a.slug);
  const linha = B.linhaDe(a.slug);
  const est = B.estadoLinha(linha);
  const hoje = one(`SELECT count(DISTINCT CASE WHEN direcao='entrada' THEN telefone END) conversas, sum(CASE WHEN direcao='entrada' THEN 1 ELSE 0 END) recebidas,
    sum(CASE WHEN direcao='saida' AND status='enviada' THEN 1 ELSE 0 END) enviadas FROM agente_mensagens WHERE agente=? AND ${H('criado_em')} AND telefone NOT LIKE 'teste-%'`, a.slug) || {};
  const aprovar = (one(`SELECT count(*) n FROM agente_mensagens WHERE agente=? AND direcao='saida' AND status='aprovar'`, a.slug) || {}).n || 0;
  const leads = a.tipo === 'cliente' ? (one(`SELECT count(*) n FROM leads WHERE agente=? AND etapa NOT IN ('escritura','perdido') ${A.veTudo(u) ? '' : 'AND corretor_id=' + u.id}`, a.slug) || {}).n || 0 : null;
  const ultimo = one('SELECT tipo,texto,criado_em FROM agente_eventos WHERE agente=? ORDER BY id DESC LIMIT 1', a.slug);
  const { alma, ...aj2 } = aj;
  return { ...a, nome: aj.nome, ajustes: { ...aj2, alma_editada: !!alma }, linha, linha_nome: B.ajustes(linha).nome,
    linha_estado: { estado: est.estado, numero: est.numero || null, vivo: est.vivo, erro: est.erro || null },
    hoje: { conversas: +hoje.conversas || 0, recebidas: +hoje.recebidas || 0, enviadas: +hoje.enviadas || 0 }, aprovar, leads, ultimo };
}
function carteira(slug, g = B.geral()) {
  const status = slug === 'offmarket' ? ['off_market'] : ['publicado'];
  return all(`SELECT i.id,i.codigo,i.tipo,i.status,i.bairro,i.quartos,i.suites,i.area_util,i.area_total,i.valor,i.condominio_id,c.nome condominio,
    (SELECT min(f.id) FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria='Fotos' AND f.mime LIKE 'image/%') capa
    FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id WHERE i.status IN (${status.map(() => '?').join(',')}) ORDER BY i.valor DESC`, ...status)
    .filter((i) => B.setorDoImovel(i, g) === slug);
}
const saidasParaAprovar = (slug, u) => all(`SELECT m.id,m.agente,m.telefone,m.nome,m.texto,m.lead_id,m.pessoa_id,m.criado_em,
    (SELECT e.texto FROM agente_mensagens e WHERE e.agente=m.agente AND e.telefone=m.telefone AND e.direcao='entrada' AND e.id<m.id ORDER BY e.id DESC LIMIT 1) pergunta
  FROM agente_mensagens m LEFT JOIN leads l ON l.id=m.lead_id WHERE m.direcao='saida' AND m.status='aprovar' ${slug ? 'AND m.agente=?' : ''}
  ${A.veTudo(u) ? '' : 'AND l.corretor_id=' + u.id} ORDER BY m.id LIMIT 60`, ...(slug ? [slug] : []));

// ---------- escritório ----------
r.get('/escritorio', (req, res) => {
  const u = req.usuario;
  const agentes = B.AGENTES.map((a) => resumoAgente(a, u));
  const feito = (one(`SELECT count(*) n FROM agente_eventos WHERE ${H('criado_em')}`) || {}).n || 0;
  res.json({
    agentes, geral: A.veTudo(u) ? B.geral() : { ligado: B.geral().ligado }, pc: pc(), pode_editar: A.veTudo(u),
    feed: all(`SELECT id,agente,tipo,texto,criado_em FROM agente_eventos WHERE tipo NOT IN ('teste') ORDER BY id DESC LIMIT 40`),
    aprovar: saidasParaAprovar(null, u).slice(0, 12),
    totais: { conectados: agentes.filter((a) => a.linha_estado.estado === 'conectado').length, aprovar: agentes.reduce((s, a) => s + a.aprovar, 0),
      conversas: agentes.reduce((s, a) => s + a.hoje.conversas, 0), enviadas: agentes.reduce((s, a) => s + a.hoje.enviadas, 0), acoes: feito,
      afazeres: (one(`SELECT count(*) n FROM agente_afazeres WHERE feito=0 ${A.veTudo(u) ? '' : 'AND corretor_id=' + u.id}`) || {}).n || 0 },
  });
});
r.put('/escritorio/geral', gestor, (req, res) => {
  const g = B.salvaGeral(req.body || {});
  audit(req.usuario.id, 'escritorio.geral', JSON.stringify({ ...g, dono_telefone: g.dono_telefone ? '***' + g.dono_telefone.slice(-4) : '' }));
  res.json(g);
});
r.get('/escritorio/relatorio', gestor, (req, res) => res.json({ texto: require('../agentes/rotinas').relatorioDoDia(), numeros: X.textoNumeros(X.numerosDoDia()) }));
r.post('/escritorio/relatorio', gestor, (req, res) => {
  const g = B.geral();
  if (!g.dono_telefone) falha(400, 'Cadastre o celular do dono na mesa do Augusto (gerente) primeiro.');
  B.enfileiraSaida({ agente: 'gerente', telefone: g.dono_telefone, texto: require('../agentes/rotinas').relatorioDoDia(), nome: g.dono_nome, aprovar: false });
  B.evento('gerente', 'relatorio', `Relatório enviado ao dono a pedido de ${req.usuario.nome}`);
  res.json({ ok: true });
});


// ---------- configuração geral (cérebro: chave do Gemini) ----------
r.get('/escritorio/config', gestor, (req, res) => res.json({ ia: IA.ajustes(), geral: B.geral(), pc: pc(), ciclo: !!getConfig('escritorio_ciclo_token') }));
r.put('/escritorio/config/ia', gestor, (req, res) => {
  const b = req.body || {};
  const a = IA.salva({ chave: b.chave === '' || b.chave === undefined ? (b.apagar ? '' : undefined) : b.chave, modelo: b.modelo }, req.usuario.nome);
  if (!getConfig('escritorio_ciclo_token')) require('../db').setConfig('escritorio_ciclo_token', A.tokenAleatorio(24));
  audit(req.usuario.id, 'escritorio.ia', `${a.provedor} ${a.modelo}${b.chave ? ' (chave nova)' : b.apagar ? ' (chave apagada)' : ''}`);
  res.json(a);
});
r.post('/escritorio/config/ia/testar', gestor, async (req, res) => res.json(await IA.testar((req.body || {}).modelo)));

// ---------- fila de aprovação ----------
r.post('/escritorio/saidas/:id/aprovar', (req, res) => {
  const m = one(`SELECT * FROM agente_mensagens WHERE id=? AND direcao='saida'`, req.params.id) || falha(404, 'Mensagem não encontrada.');
  if (m.status !== 'aprovar') falha(409, 'Esta mensagem já foi tratada.');
  if (!A.veTudo(req.usuario)) { const l = m.lead_id && one('SELECT corretor_id FROM leads WHERE id=?', m.lead_id); if (!l || l.corretor_id !== req.usuario.id) falha(403, 'Mensagem de cliente de outro corretor.'); }
  const texto = txt(req.body && req.body.texto, 4000) || m.texto;
  run(`UPDATE agente_mensagens SET status='fila', texto=?, autor=? WHERE id=?`, texto, `${B.ajustes(m.agente).nome} (aprovado por ${req.usuario.nome})`, m.id);
  if (m.lead_id) run(`DELETE FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, m.lead_id);
  B.evento(m.agente, 'aprovado', `${req.usuario.nome} aprovou a resposta para ${m.nome || 'final ' + String(m.telefone).slice(-4)}`);
  res.json({ ok: true });
});
r.post('/escritorio/saidas/:id/descartar', (req, res) => {
  const m = one(`SELECT * FROM agente_mensagens WHERE id=? AND direcao='saida' AND status='aprovar'`, req.params.id) || falha(404, 'Mensagem não encontrada.');
  run(`UPDATE agente_mensagens SET status='descartada', motivo=? WHERE id=?`, `descartada por ${req.usuario.nome}`, m.id);
  if (m.lead_id) run(`DELETE FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, m.lead_id);
  res.json({ ok: true });
});

// ---------- afazeres (lembrados pela Marta) ----------
r.get('/escritorio/afazeres', (req, res) => {
  const u = req.usuario;
  res.json(all(`SELECT f.*, us.nome corretor, l.nome lead FROM agente_afazeres f LEFT JOIN usuarios us ON us.id=f.corretor_id LEFT JOIN leads l ON l.id=f.lead_id
    WHERE (f.feito=0 OR f.feito_em > datetime('now','localtime','-3 day')) ${A.veTudo(u) ? '' : 'AND f.corretor_id=' + u.id} ORDER BY f.feito, coalesce(f.quando,'9999'), f.id DESC LIMIT 200`));
});
r.post('/escritorio/afazeres', (req, res) => {
  const u = req.usuario; const b = req.body || {};
  const texto = txt(b.texto, 300) || falha(400, 'Escreva o afazer.');
  const corretor = A.veTudo(u) ? (parseInt(b.corretor_id, 10) || u.id) : u.id;
  const quando = b.quando ? String(b.quando).replace('T', ' ').slice(0, 16) : null;
  if (quando && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(quando)) falha(400, 'Data inválida.');
  const id = Number(run('INSERT INTO agente_afazeres(corretor_id,texto,quando,origem) VALUES(?,?,?,?)', corretor, texto, quando, 'tela:' + u.nome).lastInsertRowid);
  const c = one('SELECT nome,telefone FROM usuarios WHERE id=?', corretor);
  if (c && c.telefone && corretor !== u.id) require('../agentes/cerebro').avisaCorretor(corretor, `📌 Novo afazer de ${u.nome}: ${texto}${quando ? `\nAté: ${quando.slice(8, 10)}/${quando.slice(5, 7)} ${quando.slice(11)}` : ''}\nQuando terminar, responda "feito ${id}".`, `aviso:afazer:${id}`);
  res.json({ id });
});
r.post('/escritorio/afazeres/:id/feito', (req, res) => {
  const f = one('SELECT * FROM agente_afazeres WHERE id=?', req.params.id) || falha(404, 'Afazer não encontrado.');
  if (!A.veTudo(req.usuario) && f.corretor_id !== req.usuario.id) falha(403, 'Afazer de outro corretor.');
  const feito = req.body && req.body.feito === false ? 0 : 1;
  run(`UPDATE agente_afazeres SET feito=?, feito_em=CASE WHEN ?=1 THEN datetime('now','localtime') ELSE NULL END WHERE id=?`, feito, feito, f.id);
  res.json({ ok: true });
});

// ---------- fotos recebidas dos donos ----------
r.get('/escritorio/midias/:id', (req, res) => {
  const m = M.ler(req.params.id) || falha(404, 'Foto não encontrada.');
  res.setHeader('Content-Type', /^image\//.test(m.mime || '') ? m.mime : 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(Buffer.from(m.dados));
});
r.post('/escritorio/midias/:id/imovel', gestor, async (req, res) => res.json(await M.paraImovel(+req.params.id, req.usuario.id)));

// ---------- mesa de um agente ----------
r.get('/escritorio/:slug', (req, res) => {
  const a = agenteOu404(req.params.slug); const u = req.usuario;
  const aj = B.ajustes(a.slug);
  const linha = B.linhaDe(a.slug);
  const est = B.estadoLinha(linha);
  const conversas = all(`SELECT g.telefone, g.ultimo, g.n, g.nome, g.lead_id, g.pessoa_id, m.texto, m.direcao, m.status, m.criado_em quando
    FROM (SELECT telefone, max(id) ultimo, count(*) n, max(nome) nome, max(lead_id) lead_id, max(pessoa_id) pessoa_id FROM agente_mensagens
          WHERE agente=? AND telefone NOT LIKE 'teste-%' GROUP BY telefone) g
    JOIN agente_mensagens m ON m.id=g.ultimo LEFT JOIN leads l ON l.id=g.lead_id
    ${A.veTudo(u) ? '' : 'WHERE l.corretor_id=' + u.id} ORDER BY g.ultimo DESC LIMIT 40`, a.slug);
  const out = {
    ...resumoAgente(a, u), alma: B.alma(a.slug), alma_padrao: require('../agentes/catalogo').almaPadrao(a.slug), alma_arquivo: require('path').relative(require('../config').ROOT, require('../agentes/catalogo').arquivoAlma(a.slug)).replace(/\\/g, '/'),
    linha_estado: { ...est, qr: A.veTudo(u) ? est.qr : null }, linhas_possiveis: B.AGENTES.filter((x) => x.slug !== a.slug && x.slug !== 'captador').map((x) => ({ slug: x.slug, nome: B.ajustes(x.slug).nome })),
    usam_esta_linha: B.AGENTES.filter((x) => x.slug !== a.slug && B.linhaDe(x.slug) === a.slug).map((x) => B.ajustes(x.slug).nome),
    conversas: conversas.map((c) => ({ ...c, telefone: A.veTudo(u) ? c.telefone : c.telefone.slice(0, 4) + '•••' + c.telefone.slice(-4) })),
    aprovar_lista: saidasParaAprovar(a.slug, u),
    eventos: all('SELECT id,tipo,texto,criado_em FROM agente_eventos WHERE agente=? ORDER BY id DESC LIMIT 40', a.slug),
    pode_editar: A.veTudo(u), pc: pc(), geral: a.slug === 'gerente' && A.veTudo(u) ? B.geral() : null,
  };
  if (a.tipo === 'cliente') {
    out.carteira = carteira(a.slug);
    out.leads_lista = all(`SELECT l.id,l.nome,l.etapa,l.temperatura,l.origem,l.ultimo_contato,us.nome corretor FROM leads l LEFT JOIN usuarios us ON us.id=l.corretor_id
      WHERE l.agente=? AND l.etapa NOT IN ('escritura','perdido') ${A.veTudo(u) ? '' : 'AND l.corretor_id=' + u.id} ORDER BY coalesce(l.ultimo_contato,l.criado_em) DESC LIMIT 60`, a.slug);
  }
  if (a.slug === 'captador') {
    out.midias = M.lista({ agente: 'captador' }).slice(0, 60);
    out.robo = { hoje: (one(`SELECT count(*) n FROM fisguei_contatos WHERE ${H('enviado_em')}`) || {}).n || 0, fila: (one(`SELECT count(*) n FROM fisguei_contatos WHERE envio='fila' AND tipo='tel'`) || {}).n || 0,
      confirmados: (one(`SELECT count(*) n FROM fisguei_pessoas WHERE status='confirmou'`) || {}).n || 0, conversando: (one(`SELECT count(*) n FROM fisguei_pessoas WHERE status='respondeu'`) || {}).n || 0 };
  }
  if (a.slug === 'gerente-corretores') {
    out.equipe = all(`SELECT id,nome,perfil,telefone FROM usuarios WHERE ativo=1 AND perfil IN ('corretor','gestor') ORDER BY nome`).map((x) => ({ ...x, telefone: x.telefone ? X.fimTel(x.telefone) : null,
      abertos: (one('SELECT count(*) n FROM agente_afazeres WHERE corretor_id=? AND feito=0', x.id) || {}).n || 0,
      visitas_hoje: (one(`SELECT count(*) n FROM visitas WHERE corretor_id=? AND substr(data_hora,1,10)=date('now','localtime') AND status!='cancelada'`, x.id) || {}).n || 0 }));
  }
  res.json(out);
});
r.get('/escritorio/:slug/conversa', (req, res) => {
  const a = agenteOu404(req.params.slug);
  const t = String(req.query.tel || '');
  if (!A.veTudo(req.usuario)) falha(403, 'Só gestores abrem a conversa por aqui. Use a ficha do lead.');
  res.json(all(`SELECT id,direcao,texto,status,autor,motivo,criado_em,enviado_em FROM agente_mensagens WHERE agente=? AND telefone=? ORDER BY id DESC LIMIT 80`, a.slug, t).reverse());
});
r.put('/escritorio/:slug', gestor, (req, res) => {
  const a = agenteOu404(req.params.slug);
  const b = req.body || {};
  const aj = B.salvaAjustes(a.slug, { ativo: b.ativo, modo: b.modo, linha: b.linha, nome: b.nome }, req.usuario);
  audit(req.usuario.id, 'escritorio.agente', `${a.slug} ${JSON.stringify({ ativo: aj.ativo, modo: aj.modo, linha: aj.linha, nome: aj.nome })}`);
  res.json({ ok: true });
});
r.put('/escritorio/:slug/alma', gestor, (req, res) => {
  const a = agenteOu404(req.params.slug);
  const alma = String((req.body || {}).alma || '');
  if (alma.trim().length < 40) falha(400, 'A alma ficou curta demais. Escreva quem o agente é e como ele trabalha (ou use "Voltar ao padrão").');
  B.salvaAjustes(a.slug, { alma }, req.usuario);
  B.evento(a.slug, 'alma', `${req.usuario.nome} editou a alma (.soul)`);
  audit(req.usuario.id, 'escritorio.alma', a.slug);
  res.json({ ok: true });
});
r.post('/escritorio/:slug/alma/restaurar', gestor, (req, res) => {
  const a = agenteOu404(req.params.slug);
  B.salvaAjustes(a.slug, { alma: '' }, req.usuario);
  B.evento(a.slug, 'alma', `${req.usuario.nome} voltou a alma para o padrão`);
  res.json({ ok: true });
});
r.get('/escritorio/:slug/alma.soul', (req, res) => {
  const a = agenteOu404(req.params.slug);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${String(a.n).padStart(2, '0')}-${a.slug}.soul"`);
  res.send(B.alma(a.slug));
});
r.post('/escritorio/:slug/comando', gestor, (req, res) => {
  const a = agenteOu404(req.params.slug);
  const c = String((req.body || {}).comando || '');
  if (B.linhaDe(a.slug) !== a.slug) falha(400, `Este agente usa a linha de ${B.ajustes(B.linhaDe(a.slug)).nome}. Conecte por lá ou mude para "linha própria".`);
  B.comando(a.slug, c);
  audit(req.usuario.id, 'escritorio.linha', `${a.slug} ${c}`);
  res.json({ ok: true });
});

// ---------- conversa de teste (o PC responde com a IA local, nada sai pelo WhatsApp) ----------
r.get('/escritorio/:slug/teste', (req, res) => {
  const a = agenteOu404(req.params.slug);
  res.json({ mensagens: all(`SELECT id,direcao,texto,status,criado_em FROM agente_mensagens WHERE telefone=? ORDER BY id`, telTeste(req.usuario, a.slug)),
    acoes: all(`SELECT texto,criado_em FROM agente_eventos WHERE agente=? AND tipo='teste' AND criado_em > datetime('now','localtime','-1 day') ORDER BY id DESC LIMIT 8`, a.slug),
    pendente: !!one(`SELECT 1 FROM agente_mensagens WHERE telefone=? AND processada=0`, telTeste(req.usuario, a.slug)), pc: pc() });
});
r.post('/escritorio/:slug/teste', async (req, res) => {
  const a = agenteOu404(req.params.slug);
  const texto = txt((req.body || {}).texto, 1000) || falha(400, 'Escreva a mensagem.');
  B.registraEntrada({ agente: a.slug, linha: 'teste', telefone: telTeste(req.usuario, a.slug), nome: req.usuario.nome + ' (teste)', texto });
  // com o Gemini, quem responde é a nuvem, na hora (o PC não precisa estar ligado)
  if (IA.naNuvem()) { try { await require('../agentes/escritorio').cicloCerebro({ telefone: telTeste(req.usuario, a.slug), prazo: 40e3, rotinas: false, atribuir: false }); } catch {} }
  res.json({ ok: true, pc: pc() });
});
r.delete('/escritorio/:slug/teste', (req, res) => {
  const a = agenteOu404(req.params.slug);
  run('DELETE FROM agente_mensagens WHERE telefone=?', telTeste(req.usuario, a.slug));
  res.json({ ok: true });
});

// Chamado pelo agendador do Supabase (a cada minuto) e pelo PC quando chega mensagem. Sem chave do Gemini não faz nada (o PC cuida).
async function ciclo(req, res) {
  const token = getConfig('escritorio_ciclo_token');
  const veio = String(req.headers['x-ruah-ciclo'] || '');
  if (!token || veio.length !== token.length || !require('crypto').timingSafeEqual(Buffer.from(veio), Buffer.from(token))) return res.status(401).json({ erro: 'não autorizado' });
  if (!IA.naNuvem()) return res.json({ ok: true, sem_chave: true });
  res.json(await require('../agentes/escritorio').cicloCerebro({ prazo: 45e3 }));
}

module.exports = r;
module.exports.ciclo = ciclo;
