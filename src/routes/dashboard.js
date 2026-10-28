// Painel do administrador: tudo o que acontece na imobiliária numa resposta só.
// Poucas consultas grandes (cada uma é uma ida ao banco online) e as contas são feitas aqui,
// assim o mesmo código vale para o SQLite do PC e para o Postgres da Vercel.
'use strict';
const express = require('express');
const A = require('../auth');
const { one, all } = require('../db');

const r = express.Router();

// 'AAAA-MM-DD HH:MM:SS' no horário de Brasília (como o banco guarda), deslocado em dias.
function horaSP(diasAtras = 0) {
  const d = new Date(Date.now() - diasAtras * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
const dia = (s) => String(s || '').slice(0, 10);
const soma = (l, f) => l.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const conta = (l, f) => l.reduce((m, x) => { const k = f(x) ?? '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const variacao = (atual, antes) => (antes ? Math.round(((atual - antes) / antes) * 100) : atual ? null : 0);

// Semanas (segunda a domingo) das últimas N semanas, para os gráficos de evolução.
function semanas(n) {
  const hoje = new Date(horaSP().slice(0, 10) + 'T12:00:00Z');
  const seg = new Date(hoje); seg.setUTCDate(hoje.getUTCDate() - ((hoje.getUTCDay() + 6) % 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ini = new Date(seg); ini.setUTCDate(seg.getUTCDate() - i * 7);
    const fim = new Date(ini); fim.setUTCDate(ini.getUTCDate() + 6);
    out.push({ ini: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) });
  }
  return out;
}
const porSemana = (sem, datas) => sem.map((s) => ({ ...s, n: datas.filter((d) => d >= s.ini && d <= s.fim).length }));

const FAIXAS = [[0, 500e3, 'até 500 mil'], [500e3, 1e6, '500 mil a 1 mi'], [1e6, 2e6, '1 a 2 mi'], [2e6, 3e6, '2 a 3 mi'], [3e6, 5e6, '3 a 5 mi'], [5e6, Infinity, 'acima de 5 mi']];

r.get('/painel/adm', A.exigePerfil('adm', 'gestor'), (req, res) => {
  const dias = [7, 30, 90, 365].includes(+req.query.dias) ? +req.query.dias : 30;
  const agora = horaSP(), ini = horaSP(dias), iniAnt = horaSP(dias * 2), hoje = agora.slice(0, 10);
  const corte = iniAnt < horaSP(84) ? iniAnt : horaSP(84); // 12 semanas para os gráficos
  const no = (s) => s && s >= ini, antes = (s) => s && s >= iniAnt && s < ini;
  const em = (n) => horaSP(-n).slice(0, 10); // n dias à frente

  // ---------- consultas ----------
  const usuarios = all('SELECT id, nome, perfil, ativo FROM usuarios');
  const imoveis = all(`SELECT i.id, i.codigo, i.tipo, i.status, i.bairro, i.valor, i.area_util, i.exclusivo, i.exclusivo_ate, i.corretor_id, i.proprietario_id,
      i.criado_em, i.atualizado_em, CASE WHEN i.descricao IS NULL OR i.descricao='' THEN 0 ELSE 1 END tem_desc,
      (SELECT count(*) FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria='Fotos') fotos FROM imoveis i`);
  const leads = all(`SELECT id, nome, etapa, temperatura, origem, corretor_id, criado_em, ultimo_contato, nao_contatar FROM leads
      WHERE etapa NOT IN ('escritura','perdido') OR criado_em >= ?`, corte);
  const etapasTotal = all('SELECT etapa, count(*) n FROM leads GROUP BY etapa');
  const visitas = all(`SELECT v.id, v.status, v.data_hora, v.corretor_id, v.criado_em, v.imovel_id, v.lead_id, l.nome lead, i.codigo FROM visitas v
      JOIN leads l ON l.id=v.lead_id JOIN imoveis i ON i.id=v.imovel_id WHERE v.data_hora >= ? OR v.criado_em >= ?`, corte, corte);
  const msgs = all(`SELECT m.lead_id, m.direcao, m.criado_em, m.autor, l.corretor_id FROM mensagens m LEFT JOIN leads l ON l.id=m.lead_id
      WHERE m.criado_em >= ? ORDER BY m.id LIMIT 30000`, iniAnt);
  const ultimas = all(`SELECT l.id, l.nome, l.corretor_id, m.direcao, m.criado_em FROM leads l JOIN mensagens m ON m.id=(SELECT max(id) FROM mensagens WHERE lead_id=l.id AND direcao!='sugestao')`);
  const sugestoes = one(`SELECT count(*) n FROM mensagens WHERE direcao='sugestao'`).n;
  const opsStatus = all('SELECT status, anunciante_tipo, count(*) n FROM oportunidades GROUP BY status, anunciante_tipo');
  const ops = all(`SELECT id, status, anunciante_tipo, portal, bairro, valor, valor_anterior, corretor_id, criado_em, atualizado_em, carta_enviada_em FROM oportunidades
      WHERE criado_em >= ? OR atualizado_em >= ? OR (status='nova' AND corretor_id IS NULL)`, corte, corte);
  const custos = all(`SELECT e.custo, e.em FROM oportunidade_eventos e WHERE e.custo > 0`);
  const aprovPend = one(`SELECT count(*) n, coalesce(sum(custo_estimado),0) v FROM aprovacoes WHERE status='pendente'`);
  const assin = all(`SELECT a.id, a.status, a.criado_em, a.assinado_em, i.codigo FROM assinaturas a JOIN imoveis i ON i.id=a.imovel_id
      WHERE a.status='pendente' OR a.criado_em >= ? OR a.assinado_em >= ?`, iniAnt, iniAnt);
  const acessos = all(`SELECT em FROM links_acessos WHERE em >= ?`, iniAnt);
  const linksAtivos = one(`SELECT count(*) n FROM links_internos WHERE expira_em >= ?`, agora).n;
  const vendasAud = all(`SELECT detalhe, em FROM auditoria WHERE acao='imovel_status' AND detalhe LIKE ? AND em >= ?`, '%vendido', iniAnt);
  const atividade = all(`SELECT a.acao, a.detalhe, a.em, u.nome FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
      WHERE a.acao NOT IN ('login') ORDER BY a.id DESC LIMIT 14`);

  const nomeU = Object.fromEntries(usuarios.map((u) => [u.id, u.nome]));
  const corretores = usuarios.filter((u) => u.ativo !== 0);

  // ---------- carteira ----------
  const ativos = imoveis.filter((i) => !['vendido', 'alugado', 'suspenso'].includes(i.status));
  const aVenda = imoveis.filter((i) => ['publicado', 'off_market'].includes(i.status));
  const porCodigo = Object.fromEntries(imoveis.map((i) => [i.codigo, i]));
  const vendidosNo = vendasAud.filter((v) => no(v.em)).map((v) => porCodigo[String(v.detalhe).split(' ')[0]]).filter(Boolean);
  const vendidosAnt = vendasAud.filter((v) => antes(v.em)).map((v) => porCodigo[String(v.detalhe).split(' ')[0]]).filter(Boolean);
  const m2 = aVenda.filter((i) => i.valor && i.area_util > 10).map((i) => i.valor / i.area_util);
  const statusOrdem = ['captacao', 'aguardando_autorizacao', 'publicado', 'off_market', 'vendido', 'alugado', 'suspenso'];
  const stC = conta(imoveis, (i) => i.status);
  const bairrosC = {};
  for (const i of aVenda) { const b = i.bairro || 'Sem bairro'; (bairrosC[b] ||= { bairro: b, n: 0, vgv: 0 }); bairrosC[b].n++; bairrosC[b].vgv += i.valor || 0; }
  const carteira = {
    ativos: ativos.length, aVenda: aVenda.length, vgv: soma(aVenda, (i) => i.valor), vgvAtivo: soma(ativos, (i) => i.valor),
    ticket: aVenda.filter((i) => i.valor).length ? Math.round(soma(aVenda, (i) => i.valor) / aVenda.filter((i) => i.valor).length) : 0,
    m2: m2.length ? Math.round(m2.reduce((a, b) => a + b, 0) / m2.length) : null,
    exclusivos: ativos.filter((i) => i.exclusivo).length,
    pctExclusivo: pct(ativos.filter((i) => i.exclusivo).length, ativos.length),
    novos: imoveis.filter((i) => no(i.criado_em)).length, novosAnt: imoveis.filter((i) => antes(i.criado_em)).length,
    vendidos: vendidosNo.length, vendidosAnt: vendidosAnt.length, vgvVendido: soma(vendidosNo, (i) => i.valor), vgvVendidoAnt: soma(vendidosAnt, (i) => i.valor),
    porStatus: statusOrdem.map((s) => ({ status: s, n: stC[s] || 0, vgv: soma(imoveis.filter((i) => i.status === s), (i) => i.valor) })),
    porTipo: Object.entries(conta(aVenda, (i) => i.tipo)).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    porBairro: Object.values(bairrosC).sort((a, b) => b.vgv - a.vgv).slice(0, 10),
    porFaixa: FAIXAS.map(([a, b, l]) => ({ faixa: l, n: aVenda.filter((i) => i.valor >= a && i.valor < b).length })),
  };

  // ---------- leads e funil ----------
  const ETAPAS = ['novo', 'qualificado', 'visita', 'proposta', 'escritura', 'perdido'];
  const ativosL = leads.filter((l) => !['escritura', 'perdido'].includes(l.etapa));
  const novosL = leads.filter((l) => no(l.criado_em)), novosLAnt = leads.filter((l) => antes(l.criado_em));
  const etT = Object.fromEntries(etapasTotal.map((e) => [e.etapa, e.n]));
  const totalL = soma(etapasTotal, (e) => e.n);
  const semL = semanas(12);
  const origens = Object.entries(conta(novosL, (l) => l.origem || 'Sem origem')).map(([origem, n]) => ({ origem, n })).sort((a, b) => b.n - a.n);
  const leadsK = {
    ativos: ativosL.length, novos: novosL.length, novosAnt: novosLAnt.length,
    quentes: ativosL.filter((l) => l.temperatura === 'quente').length,
    semCorretor: ativosL.filter((l) => !l.corretor_id).length,
    portal: novosL.filter((l) => /portal/i.test(l.origem || '')).length,
    funil: ETAPAS.map((e) => ({ etapa: e, n: etT[e] || 0 })),
    conversao: pct(etT.escritura || 0, totalL - (etT.novo || 0)),
    perdidos: etT.perdido || 0,
    temperatura: ['quente', 'morno', 'frio'].map((t) => ({ t, n: ativosL.filter((l) => l.temperatura === t).length })),
    origens: origens.slice(0, 8),
    semanas: porSemana(semL, leads.map((l) => dia(l.criado_em))),
  };

  // ---------- visitas ----------
  const vNo = visitas.filter((v) => no(v.data_hora) && v.data_hora <= agora), vAnt = visitas.filter((v) => antes(v.data_hora));
  const realizadas = vNo.filter((v) => v.status === 'realizada'), canceladas = vNo.filter((v) => v.status === 'cancelada');
  const futuras = visitas.filter((v) => v.data_hora >= agora && ['agendada', 'confirmada'].includes(v.status)).sort((a, b) => (a.data_hora < b.data_hora ? -1 : 1));
  const visitasK = {
    realizadas: realizadas.length, realizadasAnt: vAnt.filter((v) => v.status === 'realizada').length,
    canceladas: canceladas.length, comparecimento: pct(realizadas.length, realizadas.length + canceladas.length),
    proximas7: futuras.filter((v) => dia(v.data_hora) <= em(7)).length,
    naoConfirmadasAmanha: futuras.filter((v) => v.status === 'agendada' && dia(v.data_hora) <= em(1)).length,
    semanas: porSemana(semL, visitas.filter((v) => v.status === 'realizada').map((v) => dia(v.data_hora))),
    proximas: futuras.slice(0, 6).map((v) => ({ data_hora: v.data_hora, codigo: v.codigo, lead: v.lead, corretor: nomeU[v.corretor_id] || null, status: v.status, imovel_id: v.imovel_id })),
  };

  // ---------- atendimento (WhatsApp) ----------
  const mNo = msgs.filter((m) => no(m.criado_em));
  const tempos = []; const aberta = {};
  for (const m of msgs) {
    if (!m.lead_id || m.direcao === 'sugestao') continue;
    if (m.direcao === 'entrada') { if (!aberta[m.lead_id]) aberta[m.lead_id] = m.criado_em; }
    else if (m.direcao === 'saida' && aberta[m.lead_id]) {
      if (no(aberta[m.lead_id])) tempos.push((new Date(m.criado_em.replace(' ', 'T')) - new Date(aberta[m.lead_id].replace(' ', 'T'))) / 60000);
      delete aberta[m.lead_id];
    }
  }
  tempos.sort((a, b) => a - b);
  const esperando = ultimas.filter((u) => u.direcao === 'entrada');
  const atend = {
    recebidas: mNo.filter((m) => m.direcao === 'entrada').length, enviadas: mNo.filter((m) => m.direcao === 'saida').length,
    conversas: new Set(mNo.map((m) => m.lead_id)).size,
    esperando: esperando.length, esperando24: esperando.filter((u) => u.criado_em < horaSP(1)).length,
    sugestoes, tempoMediano: tempos.length ? Math.round(tempos[Math.floor(tempos.length / 2)]) : null,
    respondidas: tempos.length,
  };

  // ---------- radar de captação ----------
  const stOp = {}; let particulares = 0;
  for (const o of opsStatus) { stOp[o.status] = (stOp[o.status] || 0) + o.n; if (o.anunciante_tipo === 'particular' && !['captada', 'descartada'].includes(o.status)) particulares += o.n; }
  const opNo = ops.filter((o) => no(o.criado_em));
  const captadasNo = ops.filter((o) => o.status === 'captada' && no(o.atualizado_em)).length;
  const gastoNo = soma(custos.filter((c) => no(c.em)), (c) => c.custo), gastoTotal = soma(custos, (c) => c.custo);
  const radar = {
    andamento: ['nova', 'em_contato', 'carta_enviada', 'aguardando_aprovacao'].reduce((t, s) => t + (stOp[s] || 0), 0),
    particulares, novas: opNo.length, novasAnt: ops.filter((o) => antes(o.criado_em)).length,
    novasParticular: opNo.filter((o) => o.anunciante_tipo === 'particular').length,
    quedasPreco: ops.filter((o) => o.valor_anterior && o.valor < o.valor_anterior && no(o.atualizado_em)).length,
    cartas: ops.filter((o) => no(o.carta_enviada_em)).length,
    captadas: captadasNo, captadasTotal: stOp.captada || 0,
    gasto: gastoNo, custoCaptacao: (stOp.captada || 0) ? Math.round(gastoTotal / stOp.captada) : null,
    aprovacoes: aprovPend.n, aprovacoesValor: aprovPend.v,
    livres: ops.filter((o) => o.status === 'nova' && !o.corretor_id).length,
    funil: ['nova', 'em_contato', 'carta_enviada', 'aguardando_aprovacao', 'captada', 'descartada'].map((s) => ({ status: s, n: stOp[s] || 0 })),
    porPortal: Object.entries(conta(opNo, (o) => o.portal || 'Outro')).map(([portal, n]) => ({ portal, n })).sort((a, b) => b.n - a.n).slice(0, 8),
    semanas: porSemana(semL, ops.map((o) => dia(o.criado_em))),
  };

  // ---------- autorizações, links ----------
  const docs = {
    pendentes: assin.filter((a) => a.status === 'pendente').length,
    pendentes7: assin.filter((a) => a.status === 'pendente' && a.criado_em < horaSP(7)).length,
    assinadas: assin.filter((a) => a.status === 'assinado' && no(a.assinado_em)).length,
    assinadasAnt: assin.filter((a) => a.status === 'assinado' && antes(a.assinado_em)).length,
    acessos: acessos.filter((a) => no(a.em)).length, acessosAnt: acessos.filter((a) => antes(a.em)).length, linksAtivos,
  };

  // ---------- por corretor ----------
  const equipe = corretores.map((u) => {
    const meusI = ativos.filter((i) => i.corretor_id === u.id);
    const meusL = ativosL.filter((l) => l.corretor_id === u.id);
    return {
      id: u.id, nome: u.nome, perfil: u.perfil,
      imoveis: meusI.length, vgv: soma(meusI.filter((i) => ['publicado', 'off_market'].includes(i.status)), (i) => i.valor),
      exclusivos: meusI.filter((i) => i.exclusivo).length,
      leads: meusL.length, quentes: meusL.filter((l) => l.temperatura === 'quente').length,
      novosLeads: novosL.filter((l) => l.corretor_id === u.id).length,
      propostas: meusL.filter((l) => l.etapa === 'proposta').length,
      visitas: realizadas.filter((v) => v.corretor_id === u.id).length,
      vendas: vendidosNo.filter((i) => i.corretor_id === u.id).length,
      respostas: mNo.filter((m) => m.direcao === 'saida' && m.corretor_id === u.id).length,
      esperando: esperando.filter((e) => e.corretor_id === u.id).length,
      captacoes: ops.filter((o) => o.status === 'captada' && no(o.atualizado_em) && o.corretor_id === u.id).length,
    };
  }).filter((x) => x.imoveis || x.leads || x.visitas || x.vendas || x.perfil === 'corretor').sort((a, b) => b.vgv - a.vgv || b.leads - a.leads);

  // ---------- pendências (o que pede ação) ----------
  const p = [];
  const add = (nivel, n, texto, href) => { if (n) p.push({ nivel, n, texto, href }); };
  const quentesParados = ativosL.filter((l) => l.temperatura === 'quente' && !l.nao_contatar && (!l.ultimo_contato || l.ultimo_contato < horaSP(2)));
  add('bad', atend.esperando24, 'cliente(s) esperando resposta no WhatsApp há mais de 24 h', '#/whats');
  add('bad', quentesParados.length, 'lead(s) quente(s) sem contato há mais de 2 dias', '#/leads');
  add('bad', radar.aprovacoes, `pedido(s) de consulta paga esperando aprovação${aprovPend.v ? ` (R$ ${Math.round(aprovPend.v).toLocaleString('pt-BR')})` : ''}`, '#/radar/aprovacoes');
  add('warn', visitasK.naoConfirmadasAmanha, 'visita(s) de hoje ou amanhã ainda não confirmada(s)', '#/visitas');
  add('warn', atend.sugestoes, 'resposta(s) da IA esperando aprovação', '#/whats');
  add('warn', leadsK.semCorretor, 'lead(s) ativo(s) sem corretor', '#/leads');
  // captação acontece nas vitrines da base: respostas do robô e donos localizados esperando o primeiro contato
  const roboEsperando = one(`SELECT count(*) AS n FROM fisguei_anuncios WHERE status IN ('respondeu','confirmado')`).n;
  add('bad', roboEsperando, 'proprietário(s) responderam o robô TH-IA-GO e esperam o corretor', '#/fisguei?etapa=precisa');
  const etapas = require('../services/carteira').enriquece(imoveis.filter((i) => i.proprietario_id && ['captacao', 'aguardando_autorizacao'].includes(i.status)));
  add('warn', etapas.filter((i) => i.etapa === 'localizado').length, 'imóvel(is) com dono localizado esperando o primeiro contato', '#/imoveis?etapa=localizado');
  add('info', etapas.filter((i) => i.etapa === 'confirmado').length, 'dono(s) confirmado(s): falta a autorização de venda', '#/imoveis?etapa=confirmado');
  add('warn', docs.pendentes7, 'autorização(ões) de venda sem assinatura há mais de 7 dias', '#/imoveis');
  const vencendo = ativos.filter((i) => i.exclusivo && i.exclusivo_ate && dia(i.exclusivo_ate) >= hoje && dia(i.exclusivo_ate) <= em(30));
  add('warn', vencendo.length, 'exclusividade(s) vencendo nos próximos 30 dias', '#/imoveis');
  add('warn', ativos.filter((i) => i.exclusivo && i.exclusivo_ate && dia(i.exclusivo_ate) < hoje).length, 'exclusividade(s) já vencida(s): renovar ou retirar', '#/imoveis');
  add('info', aVenda.filter((i) => !i.fotos).length, 'imóvel(is) à venda sem foto (não aparecem no portal)', '#/imoveis?ficha=falta:Fotos próprias');
  add('info', aVenda.filter((i) => !i.tem_desc).length, 'imóvel(is) à venda sem descrição', '#/imoveis');
  add('info', imoveis.filter((i) => ['captacao', 'aguardando_autorizacao'].includes(i.status) && i.atualizado_em < horaSP(30)).length, 'imóvel(is) parado(s) em captação há mais de 30 dias', '#/imoveis');
  add('info', ativos.filter((i) => !i.proprietario_id).length, 'imóvel(is) sem proprietário cadastrado', '#/imoveis?dono=sem');
  add('info', ativos.filter((i) => !i.corretor_id).length, 'imóvel(is) sem corretor responsável', '#/imoveis');

  res.json({
    dias, periodo: { ini: dia(ini), fim: hoje }, gerado: agora,
    carteira, leads: leadsK, visitas: visitasK, atendimento: atend, radar, docs, equipe, pendencias: p,
    variacoes: {
      novosImoveis: variacao(carteira.novos, carteira.novosAnt), vendidos: variacao(carteira.vendidos, carteira.vendidosAnt),
      vgvVendido: variacao(carteira.vgvVendido, carteira.vgvVendidoAnt), novosLeads: variacao(leadsK.novos, leadsK.novosAnt),
      visitas: variacao(visitasK.realizadas, visitasK.realizadasAnt), opNovas: variacao(radar.novas, radar.novasAnt),
      assinadas: variacao(docs.assinadas, docs.assinadasAnt), acessos: variacao(docs.acessos, docs.acessosAnt),
    },
    atividade: atividade.map((a) => ({ acao: a.acao, detalhe: a.detalhe, em: a.em, nome: a.nome })),
  });
});

module.exports = r;
module.exports.horaSP = horaSP;
