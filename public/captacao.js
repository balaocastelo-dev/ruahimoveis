/* Sistema RUAH — Robôs e Fisgar (Sistema): créditos, robô do WhatsApp, buscas de dono e extensão. A antiga tela de captação
   (painel Radar + Fisguei) saiu: a captação acontece nas vitrines da base. Carregado depois do painel.js. */
'use strict';

// Abas comuns ao painel, ao Radar e ao Fisguei
function capAbas(on) {
  // Radar e Fisguei agora moram dentro dos Imóveis da base: as mesmas abas das vitrines
  if (typeof mkAbas === 'function') return mkAbas(on);
  return '';
}

// Gráfico de colunas por dia com várias séries lado a lado: [{nome, cor, valores}]
function capColunas(dias, series) {
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const d = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
  return `<div class="cap-cols" role="img" aria-label="${esc(series.map((s) => `${s.nome}: ${s.valores.reduce((a, b) => a + b, 0)}`).join(' · '))} nos últimos ${dias.length} dias">${dias.map((dia, i) => `<div class="cap-col" title="${d(dia)} · ${esc(series.map((s) => `${s.nome}: ${s.valores[i]}`).join(' · '))}">
    <div class="cap-col-b">${series.map((s) => `<span style="height:${(s.valores[i] / max) * 100}%;background:${s.cor}"></span>`).join('')}</div>
    <span class="col-x">${i % 5 === (dias.length - 1) % 5 ? d(dia) : ''}</span></div>`).join('')}</div>
    <div class="row small" style="gap:14px;margin-top:8px;flex-wrap:wrap">${series.map((s) => `<span><span class="cd-dot" style="background:${s.cor}"></span> ${esc(s.nome)} <b>${nBR(s.valores.reduce((a, b) => a + b, 0))}</b></span>`).join('')}</div>`;
}

// Funil em degraus: cada etapa mostra quantos chegaram e a % da etapa anterior
function capFunil(etapas) {
  const max = Math.max(1, ...etapas.map((e) => e.n));
  return `<div class="cap-funil">${etapas.map((e, i) => {
    const ant = i ? etapas[i - 1].n : null;
    const taxa = ant && i !== 5 ? Math.round((e.n / ant) * 1000) / 10 : null; // o Radar recebe também dos portais: não é % do Fisguei
    return `<a class="cap-fl" href="${e.href}"><span class="cap-fl-r">${esc(e.rotulo)}</span>
      <span class="cap-fl-t"><span class="cap-fl-f ${i >= 5 ? 'radar' : ''}" style="width:${Math.max(e.n ? 3 : 0, (e.n / max) * 100)}%"></span></span>
      <b class="cap-fl-n">${nBR(e.n)}</b><span class="cap-fl-p">${taxa === null ? '' : pctT(taxa)}</span></a>`;
  }).join('')}</div>`;
}

const capCardFg = (a) => `<div class="imcardw"><a class="imcard" href="#/fisguei/${a.id}">
  <div class="imfoto">${fotoCadeia([a.foto, a.lat && MAPAS && MAPAS.fachada ? `/api/fachada?ref=fg${a.id}` : null], a.subtipo || a.tipo || 'Imóvel')}
    <span class="imst">${a.anunciante_tipo === 'particular' ? '<span class="pill ok">particular</span>' : '<span class="pill info">imobiliária</span>'}</span><span class="imbadge">${fgPill(a.status)}</span></div>
  <div class="imcorpo"><div class="row" style="justify-content:space-between"><span class="mono small muted">${esc(a.ref)}</span><span class="small muted">${esc(dataBR(a.criado_em))}</span></div>
    <div class="imtit">${esc(a.subtipo || a.tipo || 'Imóvel')}${a.bairro ? ' · ' + esc(a.bairro) : ''}</div>
    <div class="muted small">${esc([a.logradouro, a.numero].filter(Boolean).join(', ') || 'Endereço não informado')}</div>
    <div class="imspecs">${[a.quartos && `${a.quartos} quartos`, (a.area_util || a.area_total) && `${Math.round(a.area_util || a.area_total).toLocaleString('pt-BR')} m²`].filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
    <div class="imvalor">${brl(a.valor)}</div></div></a></div>`;
const capCardOp = (o) => `<div class="imcardw"><a class="imcard" href="#/radar/${o.id}">
  <div class="imfoto">${fotoCadeia([o.foto, o.fg_id && MAPAS && MAPAS.fachada ? `/api/fachada?ref=fg${o.fg_id}` : null], o.titulo || o.tipo || 'Oportunidade')}
    <span class="imst">${opPill(o.status)}</span>${o.anunciante_tipo === 'particular' ? '<span class="imbadge"><span class="pill ok">particular</span></span>' : ''}</div>
  <div class="imcorpo"><div class="row" style="justify-content:space-between"><span class="mono small" style="color:var(--gold)">${esc(o.ref)}</span><span class="small muted">${esc(o.portal || '')}</span></div>
    <div class="imtit">${esc(o.titulo || o.tipo || 'Oportunidade')}</div>
    <div class="muted small">${esc([[o.logradouro, o.numero].filter(Boolean).join(', '), o.bairro].filter(Boolean).join(' · ') || 'Endereço a descobrir')}</div>
    <div class="imvalor">${brl(o.valor)}</div></div></a></div>`;

async function telaCaptacao() {
  const [d, al, fr] = await Promise.all([
    api('GET', '/api/captacao/painel'),
    veTudo() ? api('GET', '/api/radar/alertas').catch(() => null) : null,
    api('GET', '/api/fisguei/resumo').catch(() => null),
    mapasCfg(),
  ]);
  const k = d.kpis, s = d.serie;
  const nivel = { bad: ['bad', 'Agora'], warn: ['warn', 'Atenção'], ok: ['ok', 'Avançar'], info: ['info', 'Oportunidade'] };
  const hoje30 = (l) => l.reduce((a, b) => a + b, 0);
  $('#main').innerHTML = `<div class="eyebrow">Captação · Radar + Fisguei</div><h1>Painel de captação</h1>
  ${capAbas('painel')}
  <p class="lead">Do anúncio que entra na base até o imóvel captado, num lugar só: o Fisguei traz os anúncios e os proprietários do Fisgar e o robô TH-IA-GO faz o primeiro contato; o Radar recebe os portais e cuida da abordagem até a captação.</p>
  ${al && typeof avisoSaude === 'function' ? avisoSaude(al, false) : ''}
  ${fr ? `<div class="cap-robo">${cartaoRobo(fr)}</div>` : ''}
  ${d.atencao.length ? `<div class="card dk-pend" style="margin-top:14px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Precisa de você</h3><span class="small muted">${d.atencao.length} item(ns)</span></div>
    <div class="dk-pend-l">${d.atencao.map((x) => `<a class="item click dk-pi" href="${x.href}"><span class="pill ${nivel[x.nivel][0]}">${nivel[x.nivel][1]}</span><b class="dk-pn">${nBR(x.n)}</b><span>${esc(x.txt)}</span></a>`).join('')}</div></div>`
    : '<div class="banner info" style="margin-top:14px"><b>Tudo em dia.</b> Nenhuma resposta ou oportunidade esperando.</div>'}

  <h2 class="dk-sec">Números</h2>
  <div class="grid dk-g5">
    ${kpi('Anúncios na base', nBR(k.base), `${nBR(k.partFg)} de particular · ${nBR(k.hoje)} entraram hoje`)}
    ${kpi('Proprietários achados', nBR(k.comDono), `anúncios com dono consultado · ${nBR(k.creditosMes)} crédito(s) do Fisgar no mês`)}
    ${kpi('Abordagens do robô', nBR(k.abordagens), `${nBR(k.fila)} número(s) na fila · ${k.taxaResposta === null ? 'sem respostas ainda' : pctT(k.taxaResposta) + ' responderam'}`)}
    ${kpi('Oportunidades ativas', nBR(k.ativas), `${nBR(k.opsHoje)} nova(s) hoje · ${nBR(k.confirmados)} dono(s) confirmado(s) pelo robô`)}
    ${kpi('Captadas', nBR(k.captadas), k.custoPorCaptacao === null ? `${brl(k.gasto)} gastos em consultas pagas` : `${brl(k.custoPorCaptacao)} por captação`)}
  </div>

  <div class="grid g2" style="margin-top:16px">
    ${caixa('Funil da captação', capFunil(d.funil) + '<p class="small muted" style="margin:10px 0 0">A % mostra quantos passaram da etapa anterior. Clique numa etapa para ver a lista.</p>')}
    ${caixa('Últimos 30 dias', capColunas(s.dias, [{ nome: 'Anúncios no Fisguei', cor: 'var(--gold)', valores: s.fisguei }, { nome: 'Oportunidades no Radar', cor: '#3b6ea8', valores: s.radar }, { nome: 'Abordagens do robô', cor: '#2e7d4f', valores: s.abordagens }, { nome: 'Respostas', cor: '#c0392b', valores: s.respostas }])
      + `<p class="small muted" style="margin:8px 0 0">${nBR(hoje30(s.fisguei) + hoje30(s.radar))} entradas no período.</p>`)}
  </div>
  <div class="grid g3" style="margin-top:16px">
    ${caixa('Bairros com mais anúncios', hbarras(d.bairros.map((b) => ({ rotulo: b.nome, n: b.n, txt: `${nBR(b.n)}${b.radar ? ` · ${b.radar} no Radar` : ''}` })), { vazio: 'Nenhum anúncio ainda.' }))}
    ${caixa('Na base por vitrine', hbarras(d.vitrines.map((v) => ({ rotulo: v.rotulo, n: v.n }))) + `<div class="row small" style="gap:6px;flex-wrap:wrap;margin-top:10px">${d.vitrines.map((v) => `<a class="btn sm" href="${v.href}">${esc(v.rotulo)}</a>`).join('')}</div>`)}
    ${caixa('De onde vêm', hbarras(d.portais) + `<p class="small muted" style="margin:10px 0 0">${nBR(k.particulares)} anúncio(s) de particular e ${nBR(k.imobiliarias)} de imobiliária.</p>`)}
  </div>
  <div class="grid g2" style="margin-top:16px">
    ${caixa('Radar por situação', hbarras(d.radarStatus.map((x) => ({ ...x, cor: /Descart/.test(x.rotulo) ? 'cinza' : '' }))), ['#/radar', 'Abrir o Radar'])}
    ${caixa('Fisguei por situação', hbarras(d.fisgueiStatus), ['#/fisguei', 'Abrir o Fisguei'])}
  </div>

  <h2 class="dk-sec">Anúncios mais novos na base</h2>
  ${d.novosFg.length ? `<div class="imcards mini">${d.novosFg.map(capCardFg).join('')}</div>` : '<div class="empty">Nenhum anúncio ainda. Abra a Base de Anúncios no Fisgar com a extensão ligada.</div>'}
  <h2 class="dk-sec">Oportunidades mais novas no Radar</h2>
  ${d.novasOp.length ? `<div class="imcards mini">${d.novasOp.map(capCardOp).join('')}</div>` : '<div class="empty">Nenhuma oportunidade ainda.</div>'}
  ${fr ? `<h2 class="dk-sec">Ferramentas</h2>${cartaoExtensao(fr)}` : ''}`;
  // o QR code do robô muda a cada 20 s
  poll = setInterval(async () => {
    if (location.hash.split('?')[0] !== '#/captacao') return;
    try { const rr = await api('GET', '/api/fisguei/resumo'); const el = $('#fg-robo'); if (el) el.outerHTML = cartaoRobo(rr); } catch {}
  }, 10000);
}

// ---------- Sistema > Robôs e Fisgar ----------
async function telaRobos() {
  const [r, pd, cr, rr] = await Promise.all([api('GET', '/api/fisguei/resumo'), api('GET', '/api/fisguei/pedidos'), api('GET', '/api/fisguei/creditos'),
    veTudo() ? api('GET', '/api/radar/resumo').catch(() => null) : null]);
  const al = veTudo() ? await api('GET', '/api/radar/alertas').catch(() => null) : null;
  $('#main').innerHTML = `<div class="eyebrow">Sistema</div><h1>Robôs e Fisgar</h1>
  <p class="lead">Tudo o que trabalha sozinho para a captação: os créditos do Fisgar, a busca de proprietários (a extensão do Chrome executa no Fisgar o que vocês pedem nas vitrines), o robô TH-IA-GO no WhatsApp e o radar dos portais.</p>
  <div id="rb-radar">${al && typeof avisoSaude === 'function' ? avisoSaude(al, false) : ''}</div>
  ${r.precisaCorretor ? `<div class="banner warn"><b>${r.precisaCorretor}</b> resposta(s) de proprietário esperando o corretor. <a href="#/fisguei?etapa=precisa">Ver agora</a></div>` : ''}
  ${rr && rr.aprovacoesPendentes ? `<div class="banner warn"><b>${rr.aprovacoesPendentes}</b> pedido(s) de matrícula/birô esperando aprovação. <a href="#/radar/aprovacoes">Revisar</a></div>` : ''}
  <div class="rb-topo"><div id="fx-cred">${typeof fxCreditos === 'function' ? fxCreditos(cr) : ''}</div>
    <div class="card"><h3>Atalhos</h3><div class="list">
      <a class="item click" href="#/apartamentos"><div class="t">Vitrines da base</div><span class="muted small">escolher imóveis e localizar o proprietário</span></a>
      <a class="item click" href="#/fisguei"><div class="t">Leitura da IA</div><span class="muted small">quedas de preço, particulares, abaixo do bairro</span></a>
      <a class="item click" href="#/imoveis"><div class="t">Carteira de imóveis</div><span class="muted small">os que já têm dono localizado</span></a>
      ${veTudo() ? '<a class="item click" href="#/radar/aprovacoes"><div class="t">Aprovações</div><span class="muted small">consultas pagas (matrícula e birô)</span></a>' : ''}</div></div></div>
  ${cartaoBusca(pd)}${cartaoRobo(r)}${cartaoExtensao(r)}`;
  FX = Object.assign(FX || {}, { cred: cr, resumo: r, pedidos: pd }); // "Corrigir saldo" usa o mesmo estado da Leitura da IA
  poll = setInterval(async () => {
    if (location.hash !== '#/robos') return;
    try { const x = await api('GET', '/api/fisguei/resumo'); const el = $('#fg-robo'); if (el) el.outerHTML = cartaoRobo(x); } catch {}
  }, 10000);
}
