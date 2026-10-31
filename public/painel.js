/* Herrera HOUSE IA — Painel do administrador (adm e gestor). Carregado depois do app.js e do radar.js.
   Tudo vem de /api/painel/adm numa chamada; os gráficos são HTML puro (sem bibliotecas). */
'use strict';

const NOME_ST = { captacao: 'Em captação', aguardando_autorizacao: 'Aguardando autorização', publicado: 'Publicado', off_market: 'Off-market', vendido: 'Vendido', suspenso: 'Suspenso' };
const NOME_ETAPA = { novo: 'Novo', qualificado: 'Qualificado', visita: 'Visita', proposta: 'Proposta', escritura: 'Escritura', perdido: 'Perdido' };
const NOME_OP = { nova: 'Nova', em_contato: 'Em contato', carta_enviada: 'Carta enviada', aguardando_aprovacao: 'Aguardando aprovação', captada: 'Captada', descartada: 'Descartada' };
const ACAO = { imovel_criado: 'cadastrou o imóvel', imovel_alterado: 'alterou o imóvel', imovel_status: 'mudou o status de', arquivos_enviados: 'enviou arquivos de', autorizacao_gerada: 'gerou autorização de venda de',
  autorizacao_assinada: 'Autorização assinada:', radar_captado: 'captou pelo radar', radar_portais: 'Monitor dos portais:', radar_alertas: 'Alertas por e-mail:', radar_ler_portais: 'buscou nos portais', radar_ler_alertas: 'leu os alertas',
  radar_aprovado: 'aprovou consulta paga', radar_negado: 'negou consulta paga', portal_interesse: 'Interesse pelo portal:', usuario_criado: 'criou o usuário', usuario_alterado: 'alterou o usuário', drive_conectado: 'conectou o Google Drive', drive_desconectado: 'desconectou o Google Drive', setup: 'criou o sistema' };

const nBR = (v) => (v || v === 0 ? Number(v).toLocaleString('pt-BR') : '—');
function brlC(v) { // compacto para indicadores: R$ 12,5 mi · R$ 850 mil
  if (!v) return 'R$ 0';
  const a = Math.abs(v);
  if (a >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi';
  if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (a >= 1e4) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}
const pctT = (v) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
function tempoT(min) {
  if (min === null || min === undefined) return '—';
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${m}` : `${h} h`; }
  return `${Math.round(min / 1440)} dias`;
}
function delta(v, inverso) { // variação contra o período anterior
  if (v === null || v === undefined) return '<span class="dl-var neutro" title="Sem base no período anterior">novo</span>';
  if (v === 0) return '<span class="dl-var neutro">= anterior</span>';
  const bom = inverso ? v < 0 : v > 0;
  return `<span class="dl-var ${bom ? 'sobe' : 'cai'}" title="Comparado ao período anterior de mesmo tamanho">${v > 0 ? '▲' : '▼'} ${Math.abs(v)}%</span>`;
}
const kpi = (rotulo, valor, sub, extra = '') => `<div class="card kpi dk"><div class="l">${rotulo}</div><div class="n">${valor}</div><div class="dk-sub">${sub}</div>${extra}</div>`;

// Barras horizontais: [{rotulo, n, txt?, href?}]
function hbarras(lista, o = {}) {
  const max = Math.max(1, ...lista.map((x) => x.n || 0));
  if (!lista.length || !lista.some((x) => x.n)) return `<div class="empty">${o.vazio || 'Sem dados no período.'}</div>`;
  return `<div class="hb">${lista.map((x) => `<div class="hb-l" title="${esc(x.rotulo)}: ${esc(x.txt || nBR(x.n))}">
    <span class="hb-r">${esc(x.rotulo)}</span><span class="hb-t"><span class="hb-f${x.cor ? ' ' + x.cor : ''}" style="width:${Math.max(x.n ? 2 : 0, (x.n / max) * 100)}%"></span></span><span class="hb-v">${esc(x.txt || nBR(x.n))}</span></div>`).join('')}</div>`;
}
// Colunas por semana: [{ini, fim, n}]
function colunas(sem, o = {}) {
  const max = Math.max(1, ...sem.map((s) => s.n));
  const total = sem.reduce((t, s) => t + s.n, 0);
  const d = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
  return `<div class="cols" role="img" aria-label="${esc(o.nome || 'Por semana')}: ${total} nas últimas ${sem.length} semanas">${sem.map((s, i) => `<div class="col-w" title="Semana ${d(s.ini)} a ${d(s.fim)}: ${s.n}">
      <span class="col-n">${s.n || ''}</span><span class="col-b" style="height:${(s.n / max) * 100}%"></span><span class="col-x">${i % 2 === sem.length % 2 ? d(s.ini) : ''}</span></div>`).join('')}</div>
    <div class="small muted" style="margin-top:6px">${nBR(total)} nas últimas ${sem.length} semanas · média ${(total / sem.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por semana</div>`;
}
const caixa = (titulo, corpo, link) => `<div class="card dk-box"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">${titulo}</h3>${link ? `<a class="small" href="${link[0]}">${link[1]}</a>` : ''}</div>${corpo}</div>`;

let PAINEL_DIAS = 30;
async function telaPainelAdm() {
  PAINEL_DIAS = +lerPref('hh.painel.dias', '30') || 30;
  const [d, base, al] = await Promise.all([
    api('GET', '/api/painel/adm?dias=' + PAINEL_DIAS),
    api('GET', '/api/painel').catch(() => null),
    api('GET', '/api/radar/alertas').catch(() => null),
  ]);
  const c = d.carteira, L = d.leads, V = d.visitas, W = d.atendimento, R = d.radar, D = d.docs, va = d.variacoes;
  const per = { 7: '7 dias', 30: '30 dias', 90: '90 dias', 365: '12 meses' }[d.dias];
  const nivelP = { bad: ['bad', 'Urgente'], warn: ['warn', 'Atenção'], info: ['info', 'Melhorar'] };
  const funilRef = L.funil.reduce((t, e) => t + e.n, 0) || 1;

  $('#main').innerHTML = `
  <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:6px">
    <div><h1 style="margin-bottom:2px">Painel da imobiliária</h1><div class="eyebrow depois">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <p class="muted small" style="margin:0">Últimos ${per} (${esc(d.periodo.ini.split('-').reverse().join('/'))} a hoje), comparado ao período anterior. Atualizado às ${esc(d.gerado.slice(11, 16))}.</p></div>
    <div class="row" style="gap:8px"><div class="seg" role="group" aria-label="Período">${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']].map(([v, t]) => `<button type="button" data-act="painel-dias" data-dias="${v}" aria-pressed="${v === d.dias}">${t}</button>`).join('')}</div>
      <button class="btn sm" data-act="painel-atualiza" title="Buscar os números de agora">↻ Atualizar</button></div>
  </div>

  ${al && typeof avisoSaude === 'function' ? avisoSaude(al, false) : ''}

  ${d.pendencias.length ? `<div class="card dk-pend"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Precisa de atenção</h3><span class="small muted">${d.pendencias.length} item(ns)</span></div>
    <div class="dk-pend-l">${d.pendencias.map((x) => `<a class="item click dk-pi" href="${x.href}"><span class="pill ${nivelP[x.nivel][0]}">${nivelP[x.nivel][1]}</span><b class="dk-pn">${nBR(x.n)}</b><span>${esc(x.texto)}</span></a>`).join('')}</div></div>`
    : '<div class="banner info" style="margin-bottom:16px"><b>Tudo em dia.</b> Nenhuma pendência no momento.</div>'}

  <h2 class="dk-sec">Negócio</h2>
  <div class="grid dk-g5">
    ${kpi('Valor à venda (VGV)', brlC(c.vgv), `${nBR(c.aVenda)} imóveis publicados ou off-market`)}
    ${kpi('Carteira ativa', nBR(c.ativos), `${nBR(c.novos)} novo(s) no período`, delta(va.novosImoveis))}
    ${kpi('Vendidos no período', nBR(c.vendidos), `${brlC(c.vgvVendido)} em valor de venda`, delta(va.vendidos))}
    ${kpi('Ticket médio', brlC(c.ticket), c.m2 ? `R$ ${nBR(c.m2)} por m² útil` : 'Sem área cadastrada')}
    ${kpi('Exclusividade', pctT(c.pctExclusivo), `${nBR(c.exclusivos)} imóvel(is) exclusivo(s)`)}
  </div>

  <h2 class="dk-sec">Comercial</h2>
  <div class="grid dk-g5">
    ${kpi('Leads novos', nBR(L.novos), `${nBR(L.portal)} vieram do portal`, delta(va.novosLeads))}
    ${kpi('Leads em negociação', nBR(L.ativos), `${nBR(L.quentes)} quente(s) · ${nBR(L.semCorretor)} sem corretor`)}
    ${kpi('Visitas realizadas', nBR(V.realizadas), `${pctT(V.comparecimento)} de comparecimento · ${nBR(V.proximas7)} nos próximos 7 dias`, delta(va.visitas))}
    ${kpi('Conversão em venda', pctT(L.conversao), `${nBR(L.funil.find((e) => e.etapa === 'escritura').n)} escritura(s) · ${nBR(L.perdidos)} perdido(s)`)}
    ${kpi('Resposta no WhatsApp', tempoT(W.tempoMediano), `tempo típico · ${nBR(W.esperando)} esperando agora`)}
  </div>

  <h2 class="dk-sec">Captação</h2>
  <div class="grid dk-g5">
    ${kpi('Oportunidades novas', nBR(R.novas), `${nBR(R.novasParticular)} de particular (o dono)`, delta(va.opNovas))}
    ${kpi('Radar em andamento', nBR(R.andamento), `${nBR(R.particulares)} de particular · ${nBR(R.livres)} sem corretor`)}
    ${kpi('Captadas', nBR(R.captadas), `${nBR(R.captadasTotal)} desde o início · ${nBR(R.cartas)} carta(s) no período`)}
    ${kpi('Custo por captação', R.custoCaptacao === null ? '—' : brlC(R.custoCaptacao), `${brlC(R.gasto)} gasto no período em consultas`)}
    ${kpi('Autorizações de venda', nBR(D.assinadas), `assinadas · ${nBR(D.pendentes)} esperando assinatura`, delta(va.assinadas))}
  </div>

  <h2 class="dk-sec">Funil e leads</h2>
  <div class="grid g3">
    ${caixa('Funil de vendas', hbarras(L.funil.map((e) => ({ rotulo: NOME_ETAPA[e.etapa], n: e.n, cor: e.etapa === 'perdido' ? 'cinza' : '', txt: `${nBR(e.n)} · ${pctT(Math.round((e.n / funilRef) * 1000) / 10)}` }))) + '<p class="small muted" style="margin:8px 0 0">Todos os leads cadastrados, pela etapa em que estão agora.</p>', ['#/leads', 'Abrir funil'])}
    ${caixa(`Leads por semana`, colunas(L.semanas, { nome: 'Leads novos por semana' }), ['#/leads', 'Ver leads'])}
    ${caixa(`Origem dos leads (${per})`, hbarras(L.origens.map((o) => ({ rotulo: o.origem, n: o.n })), { vazio: 'Nenhum lead novo no período.' }))}
  </div>
  <div class="grid g3" style="margin-top:16px">
    ${caixa('Temperatura dos leads em negociação', hbarras(L.temperatura.map((t) => ({ rotulo: t.t[0].toUpperCase() + t.t.slice(1), n: t.n }))))}
    ${caixa('Visitas realizadas por semana', colunas(V.semanas, { nome: 'Visitas realizadas por semana' }), ['#/visitas', 'Agenda'])}
    ${caixa(`Atendimento no WhatsApp (${per})`, `<dl class="dl dk-dl">
      <dt>Mensagens recebidas</dt><dd>${nBR(W.recebidas)}</dd><dt>Mensagens enviadas</dt><dd>${nBR(W.enviadas)}</dd>
      <dt>Conversas com movimento</dt><dd>${nBR(W.conversas)}</dd><dt>Tempo típico de resposta</dt><dd>${tempoT(W.tempoMediano)} <span class="muted small">(${nBR(W.respondidas)} respostas)</span></dd>
      <dt>Esperando resposta</dt><dd>${nBR(W.esperando)}${W.esperando24 ? ` <span class="pill bad">${nBR(W.esperando24)} há +24 h</span>` : ''}</dd>
      <dt>Sugestões da IA pendentes</dt><dd>${nBR(W.sugestoes)}</dd></dl>`, ['#/whats', 'Abrir WhatsApp'])}
  </div>

  <h2 class="dk-sec">Carteira</h2>
  <div class="grid g2">
    ${caixa('Imóveis por status', hbarras(c.porStatus.map((s) => ({ rotulo: NOME_ST[s.status], n: s.n, cor: ['vendido', 'suspenso'].includes(s.status) ? 'cinza' : '', txt: `${nBR(s.n)} · ${brlC(s.vgv)}` }))), ['#/imoveis', 'Ver imóveis'])}
    ${caixa('Valor à venda por bairro', hbarras(c.porBairro.map((b) => ({ rotulo: b.bairro, n: b.vgv, txt: `${brlC(b.vgv)} · ${b.n} im.` })), { vazio: 'Nenhum imóvel à venda.' }))}
  </div>
  <div class="grid g2" style="margin-top:16px">
    ${caixa('Imóveis à venda por faixa de preço', hbarras(c.porFaixa.map((f) => ({ rotulo: f.faixa, n: f.n }))))}
    ${caixa('Imóveis à venda por tipo', hbarras(c.porTipo.map((t) => ({ rotulo: t.tipo, n: t.n })), { vazio: 'Nenhum imóvel à venda.' }))}
  </div>

  <h2 class="dk-sec">Radar de captação</h2>
  <div class="grid g3">
    ${caixa('Oportunidades por semana', colunas(R.semanas, { nome: 'Oportunidades novas por semana' }), ['#/radar', 'Abrir radar'])}
    ${caixa('Situação das oportunidades', hbarras(R.funil.map((s) => ({ rotulo: NOME_OP[s.status], n: s.n, cor: s.status === 'descartada' ? 'cinza' : '' }))))}
    ${caixa(`De onde vieram (${per})`, hbarras(R.porPortal.map((x) => ({ rotulo: x.portal, n: x.n })), { vazio: 'Nenhuma oportunidade nova no período.' }) +
      `<dl class="dl dk-dl" style="margin-top:12px"><dt>Quedas de preço</dt><dd>${nBR(R.quedasPreco)}</dd><dt>Consultas pagas esperando</dt><dd>${nBR(R.aprovacoes)}${R.aprovacoesValor ? ` · ${brlC(R.aprovacoesValor)}` : ''}</dd></dl>`)}
  </div>

  <h2 class="dk-sec">Equipe (${per})</h2>
  <div class="card tbl">${d.equipe.length ? `<table class="dk-eq"><thead><tr><th>Corretor</th><th class="num">Imóveis</th><th class="num">Valor à venda</th><th class="num">Exclusivos</th><th class="num">Leads</th><th class="num">Quentes</th><th class="num">Leads novos</th><th class="num">Propostas</th><th class="num">Visitas</th><th class="num">Vendas</th><th class="num">Captações</th><th class="num">Mensagens</th><th class="num">Esperando</th></tr></thead><tbody>
    ${d.equipe.map((u) => `<tr><td><b>${esc(u.nome)}</b> <span class="muted small">${esc({ adm: 'adm', gestor: 'gestor', corretor: '' }[u.perfil] || '')}</span></td><td class="num">${nBR(u.imoveis)}</td><td class="num">${brlC(u.vgv)}</td><td class="num">${nBR(u.exclusivos)}</td>
      <td class="num">${nBR(u.leads)}</td><td class="num">${nBR(u.quentes)}</td><td class="num">${nBR(u.novosLeads)}</td><td class="num">${nBR(u.propostas)}</td><td class="num">${nBR(u.visitas)}</td><td class="num">${nBR(u.vendas)}</td><td class="num">${nBR(u.captacoes)}</td><td class="num">${nBR(u.respostas)}</td>
      <td class="num">${u.esperando ? `<span class="pill bad">${nBR(u.esperando)}</span>` : '0'}</td></tr>`).join('')}</tbody></table>
    <p class="small muted" style="margin:8px 4px 2px">Imóveis, valor, exclusivos, leads, quentes e propostas: situação de agora. O resto: no período escolhido.</p>` : '<div class="empty">Nenhum corretor cadastrado.</div>'}</div>

  <div class="grid g3" style="margin-top:22px">
    ${caixa('Próximas visitas', V.proximas.length ? `<div class="list">${V.proximas.map((v) => `<a class="item click" href="#/imoveis/${v.imovel_id}"><div style="min-width:0"><div class="mono small">${dataBR(v.data_hora)}</div><div class="t">${esc(v.codigo)} · ${esc(v.lead)}</div><div class="muted small">${esc(v.corretor || 'sem corretor')} · ${v.status === 'confirmada' ? 'confirmada' : '<b>não confirmada</b>'}</div></div></a>`).join('')}</div>` : '<div class="empty">Nenhuma visita agendada.</div>', ['#/visitas', 'Agenda'])}
    ${caixa('Esperando resposta', base && base.aguardando.length ? `<div class="list">${base.aguardando.map((a) => `<a class="item click" href="#/whats/${a.id}"><div style="flex:1;min-width:0"><div class="t">${esc(a.nome)}</div><div class="muted small dk-cut">${esc(a.texto)}</div></div><span class="muted small">${dataBR(a.criado_em)}</span></a>`).join('')}</div>` : '<div class="empty">Ninguém esperando.</div>', ['#/whats', 'WhatsApp'])}
    ${caixa('Atividade recente', d.atividade.length ? `<div class="timeline">${d.atividade.map((a) => `<div><div class="when">${dataBR(a.em)}</div>${a.nome ? `<b>${esc(a.nome)}</b> ` : ''}${esc(ACAO[a.acao] || a.acao)} ${esc(a.detalhe || '')}</div>`).join('')}</div>` : '<div class="empty">Sem atividade registrada.</div>', ME.perfil === 'adm' ? ['#/configuracoes', 'Registro completo'] : null)}
  </div>

  ${base && base.novos.length ? `<h2 class="dk-sec">Novos na carteira</h2><p class="muted small" style="margin:-6px 0 12px">Cadastrados nos últimos 7 dias e os compradores que combinam.</p>
    ${imCards(base.novos, { extra: (n) => `<div class="imcompr">${n.compradores.length ? n.compradores.map((x) => `<div class="small"><span class="pill ok">${x.score}%</span> ${esc(x.nome)}</div>`).join('') : '<span class="muted small">Sem compradores ainda</span>'}</div>`, href: (n) => n.compradores.length ? `#/imoveis/${n.id}/compradores` : `#/imoveis/${n.id}` })}` : ''}`;
}
ACT['painel-dias'] = (el) => { gravaPref('hh.painel.dias', el.dataset.dias); rota(); };
ACT['painel-atualiza'] = () => rota();
