/* Herrera HOUSE IA — Escritório virtual: 9 agentes robôs, cada um com alma (.soul), setor e WhatsApp próprio (carregado depois do app.js) */
'use strict';
const EV_LINHA = {
  conectado: ['ok', 'No ar'], qr: ['warn', 'Esperando o QR code'], reconectando: ['warn', 'Reconectando'], iniciando: ['warn', 'Iniciando'],
  desconectado: ['bad', 'Desconectado'], erro: ['bad', 'Com erro'], parada: ['info', 'Sem número'], desligado: ['bad', 'PC desligado'],
};
const EV_ZONAS = [
  ['Sala de captação', 'Acha o dono e traz o imóvel para a ' + MARCA.cliente, ['captador']],
  ['Salão de vendas', 'Um corretor robô por setor, atendendo pelo WhatsApp', ['apartamentos', 'comerciais', 'terrenos', 'casas', 'alto-padrao', 'offmarket']],
  ['Diretoria', 'Quem coordena o escritório e fala com as pessoas da ' + MARCA.cliente, ['gerente', 'gerente-corretores']],
];
const EV_EVENTO = { visita: '📅', chamou_corretor: '🔔', transferiu: '↪', respondeu: '💬', foto: '📷', captacao: '🏠', afazer: '📌', feito: '✅', relatorio: '📊', manha: '☀️', agenda: '🗓', alerta: '⚡', aviso: '📣', atribuido: '🧭', aprovado: '👍', alma: '✍️', erro: '⚠️', lembrete: '⏰' };
const evPill = (e) => { const [c, t] = EV_LINHA[e] || ['info', e || '—']; return `<span class="pill ${c}">${esc(t)}</span>`; };
// Retrato de cada agente (public/plataforma/agentes/<slug>.jpg, foto realista gerada por IA); sem foto, ficam as letras.
const EV_AVATARES = ['captador', 'apartamentos', 'comerciais', 'terrenos', 'casas', 'alto-padrao', 'offmarket', 'gerente', 'gerente-corretores'];
const evAvatar = (a, g = '') => EV_AVATARES.includes(a.slug)
  ? `<span class="ev-av com-foto ${g}" style="--c:${esc(a.cor)}" aria-hidden="true"><img src="/plataforma/agentes/${a.slug}.jpg" alt="" loading="lazy" decoding="async"></span>`
  : `<span class="ev-av ${g}" style="--c:${esc(a.cor)}" aria-hidden="true">${esc(a.sigla)}</span>`;
const evHora = (s) => (s ? String(s).slice(11, 16) : '');
const evNum = (n) => (n || 0).toLocaleString('pt-BR');
let EV_CACHE = null;

// ---------- planta do escritório ----------
async function telaEscritorio() {
  const d = await api('GET', '/api/escritorio');
  EV_CACHE = d;
  const porSlug = Object.fromEntries(d.agentes.map((a) => [a.slug, a]));
  const p = d.pc;
  const pcAviso = !p.nuvem && !p.vivo ? `<div class="banner warn"><b>O cérebro dos agentes ainda depende do PC.</b> Coloque a chave do Gemini na <a href="#/whats/config">Configuração geral</a> e eles passam a pensar na nuvem, com o PC desligado.</div>`
    : !p.nuvem && p.ia === false ? `<div class="banner warn"><b>A IA local (Ollama) não respondeu no PC.</b> Coloque a chave do Gemini na <a href="#/whats/config">Configuração geral</a> para não depender do PC.</div>`
    : p.nuvem && p.ia === false ? `<div class="banner warn"><b>O Gemini não respondeu no último ciclo${p.cerebro.erro ? ': ' + esc(p.cerebro.erro) : ''}.</b> Confira a chave na <a href="#/whats/config">Configuração geral</a>.</div>`
    : p.nuvem && !p.vivo ? `<div class="banner info"><b>Cérebro na nuvem funcionando.</b> As linhas de WhatsApp ficam no PC da ${esc(MARCA.cliente)}: com ele desligado, as respostas esperam na fila e saem quando ele ligar. A conversa de teste funciona normalmente.</div>`
    : p.pausado ? '<div class="banner warn"><b>Escritório em pausa:</b> ninguém responde até você retomar.</div>' : '';
  const selo = `<span class="ev-pc ${p.nuvem ? 'on' : p.vivo ? 'on' : ''}"><i></i>${p.nuvem ? `Cérebro na nuvem · ${esc(p.modelo || 'Gemini')}` : p.vivo ? `Cérebro no PC · ${esc(p.modelo || '')}` : 'Cérebro desligado'}</span>
    <span class="ev-pc ${p.vivo ? 'on' : ''}"><i></i>${p.vivo ? 'WhatsApp no PC ligado' : 'WhatsApp no PC desligado'}</span>`;
  $('#main').innerHTML = `<div class="ev-topo"><div><h1>Escritório virtual</h1>
    <p class="lead">Nove agentes robôs, cada um com um setor, um número de WhatsApp (QR code) e uma <b>alma</b> — o arquivo <span class="mono">.soul</span> com as instruções de como ele pensa e fala. Eles atendem clientes, buscam donos de imóveis e mantêm o dono e os corretores informados.</p></div>
    <div class="ev-topo-acoes">${selo}
      <a class="btn jg-entra" href="#/whats/ao-vivo">🎮 Ver o escritório ao vivo</a>
      <a class="btn" href="#/whats/conversas">Conversas do CRM</a>${d.pode_editar ? '<a class="btn pri" href="#/whats/config">Configuração geral</a>' : ''}</div></div>
  ${pcAviso}
  <div class="ev-kpis">
    <div class="ev-kpi"><b>${d.totais.conectados}<small>/9</small></b><span>agentes com WhatsApp no ar</span></div>
    <div class="ev-kpi"><b>${evNum(d.totais.conversas)}</b><span>conversas hoje</span></div>
    <div class="ev-kpi"><b>${evNum(d.totais.enviadas)}</b><span>mensagens enviadas hoje</span></div>
    <div class="ev-kpi ${d.totais.aprovar ? 'quente' : ''}"><b>${evNum(d.totais.aprovar)}</b><span>respostas esperando aprovação</span></div>
    <div class="ev-kpi"><b>${evNum(d.totais.afazeres)}</b><span>afazeres abertos da equipe</span></div>
  </div>
  <div class="ev-planta">${EV_ZONAS.map(([nome, sub, slugs]) => `<section class="ev-zona z-${slugs.length}"><header><b>${esc(nome)}</b><span>${esc(sub)}</span></header>
    <div class="ev-mesas">${slugs.map((s) => evMesaCard(porSlug[s])).join('')}</div></section>`).join('')}</div>
  <div class="grid g2" style="margin-top:18px;align-items:start">
    <div class="card"><div class="row"><h2 style="margin:0">Acontecendo agora</h2><span class="sp"></span><span class="ev-ao-vivo"><i></i>ao vivo</span></div>
      <div class="ev-feed" id="ev-feed">${evFeed(d.feed, porSlug)}</div></div>
    <div class="card"><div class="row"><h2 style="margin:0">Para aprovar</h2><span class="sp"></span><span class="muted small">modo "sugerir": nada sai sem alguém aprovar</span></div>
      <div id="ev-aprovar">${evAprovar(d.aprovar, porSlug)}</div></div>
  </div>`;
  poll = setInterval(evAtualiza, 8000);
  atualizaBadge();
}
// como escrever a linha que o agente usa (o número do sistema é o mesmo para todos)
const evLinhaTexto = (a) => (a.linha === a.linha_sistema ? `número do sistema (${a.linha_nome})` : `usa a linha de ${a.linha_nome}`);
function evMesaCard(a) {
  const ls = a.linha_estado; const trabalhando = ls.estado === 'conectado' && a.ajustes.ativo;
  const ultimo = a.ultimo ? `<span class="ev-ult">${EV_EVENTO[a.ultimo.tipo] || '•'} ${esc(a.ultimo.texto)}</span>` : '<span class="ev-ult muted">Ainda sem atividade</span>';
  return `<a class="ev-mesa ${trabalhando ? 'viva' : ''} ${a.ajustes.ativo ? '' : 'off'}" href="#/whats/agente/${a.slug}" style="--c:${esc(a.cor)}">
    <div class="ev-mesa-topo"><span class="ev-n">${a.n}</span>${evPill(a.ajustes.ativo ? ls.estado : 'parada').replace('Sem número', a.ajustes.ativo ? 'Sem número' : 'Desligado')}</div>
    <div class="ev-mesa-id">${evAvatar(a, trabalhando ? 'pulsa' : '')}<div><b>${esc(a.nome)}</b><span>${esc(a.cargo)}</span></div></div>
    <p class="ev-res">${esc(a.resumo)}</p>
    <div class="ev-linha-n">${a.linha !== a.slug ? `☎ ${esc(evLinhaTexto(a))}` : ls.numero ? `☎ <span class="mono">${esc(tel(ls.numero))}</span>` : '☎ conecte um número pelo QR code'}</div>
    <div class="ev-stats"><span><b>${a.hoje.conversas}</b>conversas</span><span><b>${a.hoje.enviadas}</b>enviadas</span><span class="${a.aprovar ? 'q' : ''}"><b>${a.aprovar}</b>aprovar</span>${a.leads !== null ? `<span><b>${a.leads}</b>leads</span>` : ''}</div>
    <div class="ev-mesa-pe">${ultimo}<span class="ev-modo">${a.ajustes.modo === 'automatico' ? 'automático' : 'sugere'}</span></div><span class="btn sm" role="button" tabindex="0" data-act="chat-robo" data-slug="${esc(a.slug)}">Conversar</span></a>`;
}
function evFeed(l, porSlug) {
  if (!l.length) return '<div class="empty">Quando os agentes começarem a trabalhar, tudo o que eles fizerem aparece aqui.</div>';
  return l.map((e) => { const a = porSlug[e.agente] || { sigla: '?', cor: '#888', nome: e.agente };
    return `<div class="ev-ev">${evAvatar(a, 'mini')}<div><span class="ev-ev-t">${EV_EVENTO[e.tipo] || '•'} ${esc(e.texto)}</span><span class="muted small">${esc(a.nome)} · ${dataBR(e.criado_em)}</span></div></div>`; }).join('');
}
function evAprovar(l, porSlug) {
  if (!l.length) return '<div class="empty">Nada esperando. 👍</div>';
  return l.map((m) => { const a = porSlug[m.agente] || {};
    return `<div class="ev-ap" data-id="${m.id}"><div class="row" style="gap:8px">${evAvatar(a, 'mini')}<b>${esc(a.nome || m.agente)}</b><span class="muted small">para ${esc(m.nome || tel(m.telefone))}</span><span class="sp"></span><span class="muted small">${dataBR(m.criado_em)}</span></div>
      ${m.pergunta ? `<div class="ev-ap-q">“${esc(m.pergunta)}”</div>` : ''}
      <textarea class="inp" rows="3" id="evap-${m.id}" aria-label="Resposta sugerida (pode editar antes de aprovar)">${esc(m.texto)}</textarea>
      <div class="row" style="gap:6px"><button class="btn pri sm" data-act="ev-aprova" data-id="${m.id}">Aprovar e enviar</button><button class="btn sm" data-act="ev-descarta" data-id="${m.id}">Descartar</button>${m.lead_id ? `<a class="btn sm" href="#/whats/${m.lead_id}">Conversa</a>` : ''}</div></div>`; }).join('');
}
async function evAtualiza() {
  if (!$('#ev-feed')) return clearInterval(poll);
  try {
    const d = await api('GET', '/api/escritorio');
    if (!$('#ev-feed')) return;
    const porSlug = Object.fromEntries(d.agentes.map((a) => [a.slug, a]));
    $('#ev-feed').innerHTML = evFeed(d.feed, porSlug);
    const foco = document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('evap-');
    if (!foco) $('#ev-aprovar').innerHTML = evAprovar(d.aprovar, porSlug);
    $$('.ev-zona').forEach((z, i) => { $('.ev-mesas', z).innerHTML = EV_ZONAS[i][2].map((s) => evMesaCard(porSlug[s])).join(''); });
  } catch {}
}
ACT['ev-aprova'] = (el) => comBotao(el, async () => { const t = $('#evap-' + el.dataset.id); await api('POST', `/api/escritorio/saidas/${el.dataset.id}/aprovar`, { texto: t ? t.value : undefined }); toast('Aprovada: sai pelo WhatsApp do agente em instantes.'); rota(); });
ACT['ev-descarta'] = (el) => comBotao(el, async () => { await api('POST', `/api/escritorio/saidas/${el.dataset.id}/descartar`); toast('Descartada'); rota(); });


// ---------- mesa de um agente ----------
const EV_ABAS = [['mesa', 'Mesa'], ['conversas', 'Conversas'], ['alma', 'Alma (.soul)'], ['whatsapp', 'WhatsApp'], ['teste', 'Testar conversa'], ['ajustes', 'Ajustes']];
async function telaMesa(slug, aba = 'mesa') {
  const a = await api('GET', `/api/escritorio/${slug}`);
  const ls = a.linha_estado;
  $('#main').innerHTML = `<a class="muted small" href="#/whats">← Escritório virtual</a>
  <div class="ev-cab" style="--c:${esc(a.cor)}">${evAvatar(a, ls.estado === 'conectado' && a.ajustes.ativo ? 'grande pulsa' : 'grande')}
    <div style="flex:1;min-width:0"><h1 style="margin:0">${esc(a.nome)}</h1><div class="eyebrow depois">Agente ${a.n} · ${esc(a.setor)}</div><p class="lead" style="margin:2px 0 0">${esc(a.cargo)} — ${esc(a.resumo)}</p></div>
    <div class="ev-cab-st">${evPill(a.ajustes.ativo ? ls.estado : 'parada')}<span class="small muted">${a.linha !== a.slug ? esc(evLinhaTexto(a)) : ls.numero ? esc(tel(ls.numero)) : 'sem número'}</span>
      <span class="small muted">${a.ajustes.modo === 'automatico' ? 'responde sozinho' : 'sugere e espera aprovação'}${a.ajustes.alma_editada ? ' · alma editada' : ''}</span>
      <button class="btn pri sm" data-act="chat-robo" data-slug="${esc(a.slug)}">Conversar</button><button class="btn sm" data-act="pc-abre" data-slug="${esc(a.slug)}">🖥️ Abrir o PC de ${esc(a.nome)}</button></div></div>
  <div class="tabs">${EV_ABAS.map(([k, l]) => `<a href="#/whats/agente/${a.slug}/${k}" class="${aba === k ? 'on' : ''}">${l}${k === 'mesa' && a.aprovar ? ` <span class="pill bad">${a.aprovar}</span>` : ''}</a>`).join('')}</div>
  <div id="ev-aba"></div>`;
  const f = { mesa: evAbaMesa, conversas: evAbaConversas, alma: evAbaAlma, whatsapp: evAbaWhats, teste: evAbaTeste, ajustes: evAbaAjustes }[aba] || evAbaMesa;
  await f(a);
}

function evAbaMesa(a) {
  const porSlug = Object.fromEntries((EV_CACHE ? EV_CACHE.agentes : []).map((x) => [x.slug, x])); porSlug[a.slug] = a;
  const blocos = [];
  blocos.push(`<div class="card"><h2>Para aprovar</h2>${evAprovar(a.aprovar_lista, porSlug)}</div>`);
  if (a.slug === 'captador') {
    blocos.push(`<div class="card"><h2>Captação agora</h2><div class="ev-kpis mini">
      <div class="ev-kpi"><b>${evNum(a.robo.hoje)}</b><span>donos abordados hoje</span></div><div class="ev-kpi"><b>${evNum(a.robo.fila)}</b><span>números na fila</span></div>
      <div class="ev-kpi"><b>${evNum(a.robo.conversando)}</b><span>conversando</span></div><div class="ev-kpi"><b>${evNum(a.robo.confirmados)}</b><span>confirmaram que são donos</span></div></div>
      <p class="small muted">A primeira mensagem (e o SIM / NÃO / PARAR) é feita pelo robô do Fisguei, com intervalo, horário e limite por dia. Depois da primeira resposta, o TH-IA-GO conversa com a alma dele: pede as fotos originais, a autorização de uso e o melhor horário para o corretor. <a href="#/fisguei">Abrir o Fisguei</a></p></div>`);
    blocos.push(`<div class="card"><h2>Fotos originais recebidas dos donos</h2>${a.midias.length ? `<div class="ev-fotos">${a.midias.map((m) => `<figure><a href="/api/escritorio/midias/${m.id}" target="_blank" rel="noopener"><img src="/api/escritorio/midias/${m.id}" alt="${esc(m.legenda || 'Foto do proprietário')}" loading="lazy"></a>
      <figcaption><b>${esc(m.pessoa || 'Proprietário')}</b><span>${esc([m.logradouro, m.numero].filter(Boolean).join(', ') || m.bairro || '')}</span>${m.legenda ? `<span>“${esc(m.legenda)}”</span>` : ''}<span>${dataBR(m.criado_em)}</span>
      ${m.imovel_arquivo_id ? `<span class="pill ok">no imóvel ${esc(m.codigo || '')}</span>` : m.codigo ? `<button class="btn sm" data-act="ev-foto-imovel" data-id="${m.id}">Levar para ${esc(m.codigo)}</button>` : m.anuncio_id ? `<a class="btn sm" href="#/fisguei/${m.anuncio_id}">Ver anúncio</a>` : ''}</figcaption></figure>`).join('')}</div>` : '<div class="empty">Quando um dono mandar fotos pelo WhatsApp, elas aparecem aqui (e vão para o imóvel quando ele for captado).</div>'}</div>`);
  }
  if (a.carteira) {
    blocos.push(`<div class="card"><div class="row"><h2 style="margin:0">Carteira do setor</h2><span class="sp"></span><span class="muted small">${a.carteira.length} imóvel(is) ${a.slug === 'offmarket' ? 'off-market' : 'publicados'} que ${esc(a.nome)} pode oferecer</span></div>
      ${a.carteira.length ? `<div class="ev-cart">${a.carteira.slice(0, 24).map((i) => `<a class="ev-im" href="#/imoveis/${i.id}"><span class="ev-im-f">${fotoCadeia([i.capa && `/api/arquivos/${i.capa}`], i.codigo, { vazio: i.codigo })}</span>
        <b>${esc(i.codigo)} · ${brl(i.valor)}</b><span>${esc(i.tipo)}${i.bairro ? ' · ' + esc(i.bairro) : ''}</span><span class="muted small">${[i.quartos && i.quartos + ' q', i.suites && i.suites + ' suítes', (i.area_util || i.area_total) && Math.round(i.area_util || i.area_total) + ' m²'].filter(Boolean).join(' · ')}</span></a>`).join('')}</div>${a.carteira.length > 24 ? `<p class="muted small">e mais ${a.carteira.length - 24}.</p>` : ''}`
      : `<div class="empty">Nenhum imóvel ${a.slug === 'offmarket' ? 'com status off-market' : 'publicado'} neste setor ainda. ${esc(a.nome)} anota o perfil do cliente e chama o corretor.</div>`}</div>`);
    blocos.push(`<div class="card"><h2>Clientes com ${esc(a.nome)}</h2>${a.leads_lista.length ? `<div class="list">${a.leads_lista.map((l) => `<div class="item click" data-act="ir" data-href="#/leads/${l.id}"><div style="flex:1;min-width:0"><div class="t">${esc(l.nome)}</div><div class="muted small">${esc(l.origem || '')} · ${esc(l.corretor || 'sem corretor')}</div></div>
      <span class="pill ${TEMP[l.temperatura] || 'info'}">${esc(l.temperatura)}</span><span class="muted small">${esc(l.etapa)}</span></div>`).join('')}</div>` : '<div class="empty">Nenhum cliente ainda.</div>'}</div>`);
  }
  if (a.slug === 'gerente') blocos.push(evDono(a));
  if (a.slug === 'gerente-corretores') blocos.push(evEquipe(a));
  blocos.push(`<div class="card"><h2>O que ${esc(a.nome)} fez</h2><div class="ev-feed">${a.eventos.length ? a.eventos.map((e) => `<div class="ev-ev"><span class="ev-ic">${EV_EVENTO[e.tipo] || '•'}</span><div><span class="ev-ev-t">${esc(e.texto)}</span><span class="muted small">${dataBR(e.criado_em)}</span></div></div>`).join('') : '<div class="empty">Ainda sem atividade.</div>'}</div></div>`);
  $('#ev-aba').innerHTML = `<div class="grid g2" style="align-items:start">${blocos.join('')}</div>`;
  if (a.slug === 'gerente-corretores') evCarregaAfazeres();
}
ACT['ev-foto-imovel'] = (el) => comBotao(el, async () => { const r = await api('POST', `/api/escritorio/midias/${el.dataset.id}/imovel`); toast(r.ja ? 'Essa foto já estava no imóvel.' : 'Foto copiada para a pasta Fotos do imóvel.'); rota(); });

function evDono(a) {
  const g = a.geral || {};
  if (!a.pode_editar) return '';
  return `<div class="card"><h2>O dono do portal</h2><p class="small muted">O ${esc(a.nome)} só conversa com este número. Ele manda o resumo da manhã, o relatório do fim do dia e alertas na hora; o dono também pode perguntar ("relatório", "quantas visitas hoje?").</p>
    <form class="grid" data-form="ev-dono" style="gap:10px"><div class="grid g2"><label class="f">Nome do dono<input class="inp" name="dono_nome" value="${esc(g.dono_nome || '')}" placeholder="Thiago"></label>
    <label class="f">Celular (WhatsApp)<input class="inp" name="dono_telefone" value="${esc(g.dono_telefone ? tel(g.dono_telefone) : '')}" placeholder="(19) 99999-0000"></label></div>
    <div class="grid g3"><label class="f">Resumo da manhã<input class="inp" type="time" name="hora_manha" value="${esc(g.hora_manha || '')}"></label><label class="f">Relatório do dia<input class="inp" type="time" name="hora_relatorio" value="${esc(g.hora_relatorio || '')}"></label>
    <label class="check" style="align-self:end"><input type="checkbox" name="alertas_dono" ${g.alertas_dono ? 'checked' : ''}> Alertas na hora</label></div>
    <div class="row" style="gap:6px"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-act="ev-previa">Ver o relatório de agora</button>${g.dono_telefone ? '<button class="btn" type="button" data-act="ev-relatorio">Mandar o relatório agora</button>' : ''}</div></form></div>`;
}
FORM['ev-dono'] = async (f) => { await api('PUT', '/api/escritorio/geral', formJSON(f)); toast('Salvo'); rota(); };
ACT['ev-previa'] = (el) => comBotao(el, async () => { const r = await api('GET', '/api/escritorio/relatorio'); modal(`<h2>Relatório de agora</h2><pre class="ev-pre">${esc(r.texto)}</pre><div class="row"><span class="sp"></span><button class="btn" data-fecha>Fechar</button></div>`); });
ACT['ev-relatorio'] = (el) => comBotao(el, async () => { await api('POST', '/api/escritorio/relatorio'); toast('Relatório na fila do WhatsApp do gerente.'); });

function evEquipe(a) {
  return `<div class="card"><h2>Equipe</h2><p class="small muted">A ${esc(a.nome)} fala com quem tem celular cadastrado em Configurações &gt; Usuários. O corretor responde "feito 12" para fechar um afazer ou "agenda" para ver o dia.</p>
    <div class="list">${a.equipe.length ? a.equipe.map((u) => `<div class="item"><div style="flex:1"><div class="t">${esc(u.nome)}</div><div class="muted small">${u.telefone ? '☎ ' + esc(u.telefone) : '<span style="color:var(--bad)">sem celular cadastrado</span>'} · ${u.visitas_hoje} visita(s) hoje</div></div><span class="pill ${u.abertos ? 'warn' : 'ok'}">${u.abertos} afazer(es)</span></div>`).join('') : '<div class="empty">Nenhum corretor cadastrado.</div>'}</div>
    ${a.pode_editar ? '<div class="row" style="margin-top:8px"><a class="btn sm" href="#/configuracoes">Cadastrar celulares</a></div>' : ''}</div>
    <div class="card"><div class="row"><h2 style="margin:0">Afazeres</h2><span class="sp"></span><button class="btn sm" data-act="ev-novo-afazer">+ Afazer</button></div><div id="ev-afazeres"><p class="muted">Carregando…</p></div></div>`;
}
async function evCarregaAfazeres() {
  const l = await api('GET', '/api/escritorio/afazeres'); const box = $('#ev-afazeres'); if (!box) return;
  box.innerHTML = l.length ? `<div class="list">${l.map((f) => `<div class="item ${f.feito ? 'ev-feito' : ''}"><label class="check" style="flex:1;min-width:0"><input type="checkbox" data-act="ev-afazer" data-id="${f.id}" ${f.feito ? 'checked' : ''}>
    <span><b>#${f.id}</b> ${esc(f.texto)}<br><span class="muted small">${esc(f.corretor || '')}${f.quando ? ' · até ' + dataBR(f.quando) : ''}${f.origem ? ' · ' + esc(String(f.origem).replace('tela:', 'por ')) : ''}</span></span></label></div>`).join('')}</div>` : '<div class="empty">Nenhum afazer aberto.</div>';
}
ACT['ev-afazer'] = async (el) => { try { await api('POST', `/api/escritorio/afazeres/${el.dataset.id}/feito`, { feito: el.checked }); evCarregaAfazeres(); } catch (e) { toast(e.message, true); } };
ACT['ev-novo-afazer'] = () => modal(`<h2>Novo afazer</h2><form class="grid" data-form="ev-afazer" style="gap:10px"><label class="f">O que fazer<input class="inp" name="texto" required maxlength="300" placeholder="Ligar para o Pedro sobre a proposta do AP0029"></label>
  <div class="grid g2">${veTudo() ? `<label class="f">Corretor<select class="inp" name="corretor_id">${opcoesUsuarios(ME.id, 'Eu')}</select></label>` : ''}<label class="f">Até quando<input class="inp" type="datetime-local" name="quando"></label></div>
  <p class="muted small" style="margin:0">A Marta avisa o corretor pelo WhatsApp e lembra 30 minutos antes.</p><div class="row"><span class="sp"></span><button class="btn" type="button" data-fecha>Cancelar</button><button class="btn pri" type="submit">Criar</button></div></form>`);
FORM['ev-afazer'] = async (f) => { await api('POST', '/api/escritorio/afazeres', formJSON(f)); fechaModal(); toast('Afazer criado'); evCarregaAfazeres(); };

async function evAbaConversas(a) {
  $('#ev-aba').innerHTML = `<div class="grid g12"><div class="card list" id="ev-convs">${a.conversas.length ? a.conversas.map((c) => `<div class="item click" data-act="ev-conv" data-tel="${esc(c.telefone)}"><div style="flex:1;min-width:0"><div class="t">${esc(c.nome || tel(c.telefone))}</div>
    <div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.direcao === 'saida' ? '✓ ' : ''}${esc(c.texto)}</div></div><div style="text-align:right">${c.status === 'aprovar' ? '<span class="pill gold">aprovar</span>' : c.direcao === 'entrada' ? '<span class="pill bad">nova</span>' : ''}<div class="muted small">${dataBR(c.quando)}</div></div></div>`).join('') : '<div class="empty">Nenhuma conversa ainda.</div>'}</div>
    <div class="card" id="ev-conv"><div class="empty">Escolha uma conversa.</div></div></div>`;
}
ACT['ev-conv'] = async (el) => {
  $$('#ev-convs .item').forEach((x) => x.classList.toggle('sel', x === el));
  const box = $('#ev-conv');
  try {
    const l = await api('GET', `/api/escritorio/${location.hash.split('/')[3]}/conversa?tel=${encodeURIComponent(el.dataset.tel)}`);
    box.innerHTML = `<div class="row"><b>${esc(tel(el.dataset.tel))}</b></div><div class="chat" style="margin-top:10px">${l.map((m) => `<div class="msg ${m.direcao === 'entrada' ? 'entrada' : m.direcao === 'nota' ? 'nota' : 'saida'}">${esc(m.texto)}<small>${esc(m.autor || '')} · ${dataBR(m.criado_em)}${m.direcao === 'saida' ? ' · ' + esc(m.status || '') + (m.motivo ? ' (' + esc(m.motivo) + ')' : '') : ''}</small></div>`).join('')}</div>`;
    const ch = $('.chat', box); if (ch) ch.scrollTop = ch.scrollHeight;
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
};

function evAbaAlma(a) {
  const editada = a.alma !== a.alma_padrao;
  $('#ev-aba').innerHTML = `<div class="grid ev-alma-g" style="align-items:start">
    <div class="card"><div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">Alma de ${esc(a.nome)}</h2><span class="pill ${editada ? 'gold' : 'info'}">${editada ? 'editada na tela' : 'padrão'}</span><span class="sp"></span>
      <a class="btn sm" href="/api/escritorio/${a.slug}/alma.soul">Baixar .soul</a>${a.pode_editar ? `<label class="btn sm">Abrir arquivo .soul<input type="file" accept=".soul,.md,.txt,text/plain" id="ev-alma-arq" hidden></label>` : ''}</div>
      <textarea class="inp ev-alma" id="ev-alma" spellcheck="false" ${a.pode_editar ? '' : 'readonly'}>${esc(a.alma)}</textarea>
      <div class="row" style="gap:6px;margin-top:8px"><span class="muted small" id="ev-alma-ct"></span><span class="sp"></span>${a.pode_editar ? `${editada ? '<button class="btn" data-act="ev-alma-padrao">Voltar ao padrão</button>' : ''}<button class="btn pri" data-act="ev-alma-salva">Salvar alma</button>` : ''}</div></div>
    <div class="card ev-alma-ajuda"><h3>Como a alma funciona</h3>
      <p class="small">A alma é o jeito de ser do agente: quem ele é, como fala, o que faz, o que nunca faz e quando chama uma pessoa. Escreva como se estivesse treinando um corretor novo.</p>
      <p class="small"><b>O sistema junta sozinho, a cada mensagem:</b></p>
      <ul class="small"><li>${a.tipo === 'cliente' ? 'o catálogo do setor (só imóveis da ' + esc(MARCA.cliente) + ', com valor e página do portal)' : a.slug === 'captador' ? 'o imóvel do Fisguei, a pessoa, a conversa e as fotos que ela já mandou' : a.slug === 'gerente' ? 'os números do dia (leads, visitas, captação, robôs, pendências)' : 'a agenda, os afazeres e os leads quentes do corretor que está falando'}</li>
      ${a.tipo === 'cliente' ? '<li>a ficha do cliente no CRM e o que ele pediu no portal</li>' : ''}<li>a conversa até agora e a data e hora</li><li>as ações que ele pode usar no sistema (${a.tipo === 'cliente' ? 'atualizar perfil, marcar visita, mandar link, transferir para outro agente, chamar corretor' : a.slug === 'captador' ? 'registrar a captação, chamar corretor' : 'criar e fechar afazeres'})</li></ul>
      <p class="small">Essa parte não fica na alma, então editar a alma não quebra a ligação com o sistema.</p>
      <p class="small muted">Arquivo padrão no código: <span class="mono">${esc(a.alma_arquivo)}</span>. A versão salva aqui vale para o PC e para o link.</p>
      <p class="small"><a href="#/whats/agente/${a.slug}/teste">Testar a alma numa conversa →</a></p></div></div>`;
  const ta = $('#ev-alma'); const ct = () => { $('#ev-alma-ct').textContent = `${ta.value.length.toLocaleString('pt-BR')} caracteres · ${ta.value.split('\n').length} linhas`; };
  ta.addEventListener('input', ct); ct();
  const arq = $('#ev-alma-arq');
  if (arq) arq.addEventListener('change', () => { const f = arq.files[0]; if (!f) return; if (f.size > 40000) return toast('Arquivo grande demais.', true); const r = new FileReader(); r.onload = () => { ta.value = String(r.result); ct(); toast('Arquivo carregado. Confira e clique em Salvar alma.'); }; r.readAsText(f); });
}
ACT['ev-alma-salva'] = (el) => comBotao(el, async () => { await api('PUT', `/api/escritorio/${location.hash.split('/')[3]}/alma`, { alma: $('#ev-alma').value }); toast('Alma salva. Vale na próxima mensagem.'); rota(); });
ACT['ev-alma-padrao'] = (el) => comBotao(el, async () => { if (!confirm('Voltar a alma para o texto padrão? A versão editada será perdida.')) return; await api('POST', `/api/escritorio/${location.hash.split('/')[3]}/alma/restaurar`); toast('Alma padrão restaurada'); rota(); });

// Canal do WhatsApp do agente: aparelho conectado no PC (QR, como antes) ou o WhatsApp Web aberto no PC virtual dele.
function evAbaWhats(a) {
  const propria = a.linha === a.slug;
  const web = a.ajustes.canal === 'web';
  if (!propria) return evAbaWhatsQr(a);
  if (web) evAbaWhatsWeb(a); else evAbaWhatsQr(a);
  if (!a.pode_editar) return;
  const box = document.createElement('form'); box.className = 'card grid ev-canal'; box.dataset.form = 'ev-canal'; box.style.gap = '10px'; box.style.marginTop = '16px';
  box.innerHTML = `<h2 style="margin:0">Como ${esc(a.nome)} usa o WhatsApp</h2>
    <label class="check"><input type="radio" name="canal" value="qr" ${web ? '' : 'checked'}> <span><b>Aparelho conectado (QR code)</b> — a linha roda no PC da ${esc(MARCA.cliente)}, como sempre.</span></label>
    <label class="check"><input type="radio" name="canal" value="web" ${web ? 'checked' : ''}> <span><b>WhatsApp Web no PC virtual de ${esc(a.nome)}</b> — o WhatsApp fica aberto no Chrome dele, sempre ligado: ele lê as conversas novas, responde pelo cérebro do escritório e entrega resultados de tarefas.</span></label>
    <label class="f">Quem ele atende no WhatsApp Web<select class="inp" name="wa_filtro"><option value="nao_salvos" ${a.ajustes.wa_filtro !== 'todos' ? 'selected' : ''}>Só quem NÃO está salvo na agenda do número (bom para número pessoal)</option><option value="todos" ${a.ajustes.wa_filtro === 'todos' ? 'selected' : ''}>Todo mundo que escrever (número só da imobiliária)</option></select></label>
    <div class="banner warn small" style="margin:0">Automatizar o WhatsApp Web vai contra as regras do WhatsApp: o número pode ser bloqueado, principalmente ao mandar mensagem para quem não conhece. As respostas seguem o modo do agente (${a.ajustes.modo === 'automatico' ? 'responde sozinho' : 'sugere e espera aprovação'}) e quem pede PARAR não recebe mais nada.</div>
    <div class="row"><span class="sp"></span><button class="btn pri" type="submit">Salvar</button></div>`;
  $('#ev-aba').appendChild(box);
}
FORM['ev-canal'] = async (f) => { const o = formJSON(f); const slug = location.hash.split('/')[3]; await api('PUT', `/api/escritorio/${slug}`, o); toast(o.canal === 'web' ? 'Pronto: o WhatsApp Web abre no PC virtual em até 30 s.' : 'Salvo'); telaMesa(slug, 'whatsapp'); };
function evAbaWhatsWeb(a) {
  const ls = a.linha_estado;
  const corpo = ls.estado === 'qr' && ls.qr
    ? `<div class="fg-qr"><img src="${esc(ls.qr)}" alt="QR code do WhatsApp Web" width="240" height="240"><div class="small"><b>Para entrar no WhatsApp Web do PC de ${esc(a.nome)}:</b><ol style="margin:6px 0;padding-left:18px"><li>No celular com o número que ${esc(a.nome)} vai usar, abra o WhatsApp</li><li>Toque em <b>⋮</b> → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b></li><li>Aponte para este QR code</li></ol>A conexão fica salva no PC virtual.</div></div>`
    : ls.estado === 'conectado' ? `<p>WhatsApp Web conectado no número <b>${esc(tel(ls.numero))}</b>, aberto no PC virtual de ${esc(a.nome)}.</p>`
    : ls.estado === 'desligado' ? '<p>A estação dos PCs virtuais está desligada agora. O WhatsApp volta sozinho quando ela ligar.</p>'
    : `<p>Abrindo o WhatsApp Web no PC virtual… (${esc(ls.estado || '')})${ls.erro ? ' — ' + esc(ls.erro) : ''}</p>`;
  $('#ev-aba').innerHTML = `<div class="grid g2" style="align-items:start"><div class="card"><div class="row"><h2 style="margin:0">WhatsApp Web no PC virtual</h2><span class="sp"></span>${evPill(ls.estado)}</div>${corpo}
    <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn pri" data-act="pc-abre" data-slug="${esc(a.slug)}">🖥️ Abrir o PC de ${esc(a.nome)}</button>${a.pode_editar ? `<button class="btn" data-act="ev-wa-ordem" data-c="ler_whatsapp">Ler as não lidas agora</button><button class="btn" data-act="ev-wa-ordem" data-c="sair_whatsapp">Sair do WhatsApp</button>` : ''}</div></div>
    <div class="card"><h3>Bom saber</h3><ul class="small"><li>O WhatsApp Web fica numa aba própria do Chrome de ${esc(a.nome)}, que nunca desliga.</li><li>Cada mensagem nova vai para o cérebro do escritório; a resposta sai pelo mesmo WhatsApp (ou espera aprovação, conforme o modo).</li><li>"Ler as não lidas" passa para o escritório as conversas que chegaram antes.</li><li>Grupos e status não são lidos.</li></ul></div></div>`;
  if (ls.estado !== 'conectado') poll = setInterval(async () => { if (!$('#ev-aba')) return clearInterval(poll); try { const n = await api('GET', `/api/escritorio/${a.slug}`); if (n.linha_estado.estado !== ls.estado || n.linha_estado.qr !== ls.qr) { clearInterval(poll); telaMesa(a.slug, 'whatsapp'); } } catch {} }, 5000);
}
ACT['ev-wa-ordem'] = (el) => comBotao(el, async () => { if (el.dataset.c === 'sair_whatsapp' && !confirm('Sair do WhatsApp Web neste PC? Para voltar, será preciso ler o QR code de novo.')) return; await api('POST', '/api/estacao/comando', { agente: location.hash.split('/')[3], comando: el.dataset.c }); toast('Pedido enviado ao PC virtual (em até 10 s).'); });
function evAbaWhatsQr(a) {
  const ls = a.linha_estado; const propria = a.linha === a.slug;
  const qr = ls.estado === 'qr' && ls.qr ? `<div class="fg-qr"><img src="${esc(ls.qr)}" alt="QR code do WhatsApp" width="240" height="240"><div class="small"><b>Para conectar o número de ${esc(a.nome)}:</b><ol style="margin:6px 0;padding-left:18px"><li>Abra o WhatsApp do celular que vai ser de ${esc(a.nome)}</li><li>Toque em <b>⋮</b> → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b></li><li>Aponte a câmera para este QR code</li></ol><span class="muted">O código muda a cada 20 segundos; a tela atualiza sozinha.</span></div></div>` : '';
  let corpo;
  if (a.slug === 'captador') corpo = `<p class="small">O TH-IA-GO usa o número do robô do Fisguei (a linha de abordagem dos proprietários). Para conectar, trocar o número ou ajustar horário, limite e intervalo, use o cartão do robô no Fisguei.</p>
    ${qr}<div class="row" style="gap:6px"><a class="btn pri" href="#/fisguei">Abrir o robô no Fisguei</a></div>`;
  else if (!propria) corpo = `<p>${esc(a.nome)} atende pelo ${a.linha === a.linha_sistema ? `<b>número do sistema</b> (a linha de ${esc(a.linha_nome)}), o mesmo de todos os agentes — não precisa de QR code novo` : `número de <b>${esc(a.linha_nome)}</b>`}. Quem escreve nesse número é atendido por quem cuida daquele cliente (ou pelo setor do pedido).</p><div class="row"><a class="btn" href="#/whats/agente/${a.linha}/whatsapp">Ver a linha de ${esc(a.linha_nome)}</a></div>`;
  else corpo = `${qr}${ls.estado === 'conectado' ? `<p>Conectado no número <b>${esc(tel(ls.numero))}</b>.${a.usam_esta_linha.length ? ` Também atendem por este número: ${esc(a.usam_esta_linha.join(', '))}.` : ''}</p>` : ls.estado === 'desligado' ? '<p>O PC da ' + esc(MARCA.cliente) + ' está desligado (ou sem o sistema aberto). A linha liga quando o PC voltar.</p>' : ls.estado === 'parada' ? `<p>${esc(a.nome)} ainda não tem número. Separe um chip (ou um número de WhatsApp Business) só para ${esc(a.nome)}, clique em <b>Conectar</b> e leia o QR code que vai aparecer aqui.</p>` : ls.erro ? `<p style="color:var(--bad)">${esc(ls.erro)}</p>` : ''}
    ${a.pode_editar ? `<div class="row" style="gap:6px">${['parada', 'desconectado', 'erro', 'desligado'].includes(ls.estado) ? '<button class="btn pri" data-act="ev-linha" data-c="conectar">Conectar (gerar QR code)</button>' : ''}${['conectado', 'reconectando', 'qr'].includes(ls.estado) ? '<button class="btn" data-act="ev-linha" data-c="reiniciar">Reiniciar</button><button class="btn" data-act="ev-linha" data-c="desconectar">Desconectar este número</button>' : ''}</div>` : ''}`;
  $('#ev-aba').innerHTML = `<div class="grid g2" style="align-items:start"><div class="card"><div class="row"><h2 style="margin:0">Linha de WhatsApp</h2><span class="sp"></span>${evPill(ls.estado)}</div>${corpo}</div>
    <div class="card"><h3>Bom saber</h3><ul class="small"><li>A conexão é pelo QR code (aparelho conectado), igual ao WhatsApp Web, e roda no PC da ${esc(MARCA.cliente)}.</li><li>Use um número separado para cada agente que vai falar com clientes. Se preferir, um agente pode usar o número de outro (aba Ajustes).</li>
    <li>WhatsApp não oficial pode ser bloqueado se mandar muitas mensagens para quem não conhece o número. Os agentes de venda só respondem quem escreveu (ou quem deixou contato no portal); a abordagem fria fica só com o TH-IA-GO, com limite por dia.</li><li>Quem responder PARAR não recebe mais nada.</li></ul></div></div>`;
  if (ls.estado !== 'conectado' && propria) poll = setInterval(async () => { if (!$('#ev-aba')) return clearInterval(poll); try { const n = await api('GET', `/api/escritorio/${a.slug}`); if (n.linha_estado.estado !== ls.estado || n.linha_estado.qr !== ls.qr) { clearInterval(poll); telaMesa(a.slug, 'whatsapp'); } } catch {} }, 5000);
}
ACT['ev-linha'] = (el) => comBotao(el, async () => {
  if (el.dataset.c === 'desconectar' && !confirm('Desconectar este número? Para voltar, será preciso ler o QR code de novo.')) return;
  await api('POST', `/api/escritorio/${location.hash.split('/')[3]}/comando`, { comando: el.dataset.c }); toast('Pedido enviado ao PC (em até 15 s).');
});

async function evAbaTeste(a) {
  $('#ev-aba').innerHTML = `<div class="grid g21" style="align-items:start"><div class="card"><div class="row"><h2 style="margin:0">Converse com ${esc(a.nome)}</h2><span class="sp"></span><button class="btn sm" data-act="ev-teste-limpa">Começar de novo</button></div>
    <p class="small muted">Você faz o papel ${a.tipo === 'cliente' ? 'do cliente' : a.slug === 'captador' ? 'do proprietário' : a.slug === 'gerente' ? 'do dono' : 'de um corretor'}. ${esc(a.nome)} responde com a alma atual e os dados reais do sistema, mas nada sai pelo WhatsApp e nenhuma ação é gravada (aparece ao lado o que ele faria).</p>
    <div class="chat ev-teste" id="ev-teste-chat"></div>
    <form class="copybox" data-form="ev-teste" style="margin-top:10px"><input class="inp" id="ev-teste-txt" name="texto" placeholder="${esc(a.tipo === 'cliente' ? 'Oi! Procuro ' + (a.slug === 'terrenos' ? 'um terreno em condomínio em Sousas' : a.slug === 'comerciais' ? 'um galpão perto da Anhanguera' : a.slug === 'apartamentos' ? 'um apartamento de 3 quartos no Cambuí' : a.slug === 'offmarket' ? 'uma casa grande com discrição' : 'uma casa em condomínio fechado') : a.slug === 'gerente' ? 'Como foi o dia?' : a.slug === 'gerente-corretores' ? 'Qual é a minha agenda hoje?' : 'Sim, sou o dono. Como funciona?')}" autocomplete="off" required><button class="btn pri" type="submit">Enviar</button></form></div>
    <div class="card"><h3>O que ${esc(a.nome)} faria no sistema</h3><div id="ev-teste-acoes" class="ev-feed"></div></div></div>`;
  await evTesteCarrega(a.slug);
  poll = setInterval(() => evTesteCarrega(a.slug, true), 3000);
}
async function evTesteCarrega(slug, silencioso) {
  const box = $('#ev-teste-chat'); if (!box) return clearInterval(poll);
  const d = await api('GET', `/api/escritorio/${slug}/teste`);
  const sig = JSON.stringify(d.mensagens.map((m) => m.id)) + d.pendente;
  if (silencioso && box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = (d.mensagens.length ? d.mensagens.map((m) => `<div class="msg ${m.direcao === 'entrada' ? 'saida' : 'entrada'}">${esc(m.texto)}<small>${m.direcao === 'entrada' ? 'você' : esc(slug)} · ${evHora(m.criado_em)}</small></div>`).join('') : '<span class="muted small">Mande a primeira mensagem.</span>')
    + (d.pendente ? `<div class="msg entrada ev-digitando"><span></span><span></span><span></span>${d.pc.nuvem ? (d.pc.ia === false ? '<small>o Gemini não respondeu: confira a chave na Configuração geral</small>' : '') : !d.pc.vivo ? '<small>sem chave do Gemini, quem responde é o PC (desligado). Coloque a chave na Configuração geral.</small>' : d.pc.ia === false ? '<small>esperando a IA local (Ollama) no PC</small>' : ''}</div>` : '');
  box.scrollTop = box.scrollHeight;
  const ac = $('#ev-teste-acoes'); if (ac) ac.innerHTML = d.acoes.length ? d.acoes.map((x) => `<div class="ev-ev"><span class="ev-ic">⚙</span><div><span class="ev-ev-t">${esc(x.texto.replace('Na conversa de teste, faria: ', ''))}</span><span class="muted small">${dataBR(x.criado_em)}</span></div></div>`).join('') : '<div class="empty">Nenhuma ação ainda.</div>';
}
FORM['ev-teste'] = async (f) => { const slug = location.hash.split('/')[3]; await api('POST', `/api/escritorio/${slug}/teste`, formJSON(f)); f.reset(); await evTesteCarrega(slug); };
ACT['ev-teste-limpa'] = (el) => comBotao(el, async () => { const slug = location.hash.split('/')[3]; await api('DELETE', `/api/escritorio/${slug}/teste`); await evTesteCarrega(slug); });

function evAbaAjustes(a) {
  if (!a.pode_editar) { $('#ev-aba').innerHTML = '<div class="empty">Só o administrativo e o gestor mudam os ajustes dos agentes.</div>'; return; }
  $('#ev-aba').innerHTML = `<div class="grid g2" style="align-items:start"><form class="card grid" data-form="ev-ajustes" style="gap:12px"><h2 style="margin:0">Ajustes de ${esc(a.nome)}</h2>
    <label class="check"><input type="checkbox" name="ativo" ${a.ajustes.ativo ? 'checked' : ''}> Agente trabalhando</label>
    <label class="f">Nome que ele usa com as pessoas<input class="inp" name="nome" value="${esc(a.nome)}" maxlength="40"></label>
    <fieldset class="ev-modos"><legend class="small">Como ele responde</legend>
      <label class="ev-op"><input type="radio" name="modo" value="sugerir" ${a.ajustes.modo !== 'automatico' ? 'checked' : ''}><span><b>Sugere e espera aprovação</b><span class="muted small">A resposta aparece em "Para aprovar" e nas Conversas do CRM. Um corretor ou o gestor aprova (e pode editar) antes de sair.</span></span></label>
      <label class="ev-op"><input type="radio" name="modo" value="automatico" ${a.ajustes.modo === 'automatico' ? 'checked' : ''}><span><b>Responde sozinho</b><span class="muted small">Sai na hora pelo WhatsApp. Link privado do off-market sempre passa por aprovação.</span></span></label></fieldset>
    ${a.slug === 'captador' ? '' : `<label class="f">Número de WhatsApp<select class="inp" name="linha"><option value="sistema" ${a.ajustes.linha === 'sistema' ? 'selected' : ''}>Número do sistema — um QR code para todos (${esc(a.linha_sistema_nome)})</option><option value="propria" ${a.ajustes.linha === 'propria' ? 'selected' : ''}>Número próprio (QR code na aba WhatsApp)</option>${a.linhas_possiveis.map((x) => `<option value="${x.slug}" ${a.ajustes.linha === x.slug ? 'selected' : ''}>Usar o número de ${esc(x.nome)}</option>`).join('')}</select></label>`}
    <div class="row"><span class="sp"></span><button class="btn pri" type="submit">Salvar</button></div></form>
    <div class="card"><h3>Como ${esc(a.nome)} se liga ao sistema</h3>${evLigacoes(a)}</div></div>`;
}
FORM['ev-ajustes'] = async (f) => { const o = formJSON(f); await api('PUT', `/api/escritorio/${location.hash.split('/')[3]}`, o); toast('Ajustes salvos'); rota(); };
function evLigacoes(a) {
  const L = {
    cliente: ['<b>Quem chega:</b> quem escreve no número dele e quem deixa contato no portal ou no blog sobre um imóvel do setor.', '<b>O que ele vê:</b> os imóveis da carteira da ' + esc(MARCA.cliente) + ' do setor (com valor, área e página do portal), a ficha do cliente no CRM e a conversa.',
      '<b>O que ele faz:</b> atualiza o perfil do lead, marca visita (a Marta avisa o corretor), manda a página do imóvel, passa o cliente para outro agente e chama o corretor quando precisa de gente.', '<b>Onde aparece:</b> CRM e funil, Conversas, Visitas e o painel do dono.'],
    captacao: ['<b>Quem chega:</b> os proprietários que o robô do Fisguei abordou e responderam.', '<b>O que ele vê:</b> o anúncio e o endereço do Fisguei, quem é a pessoa, a conversa e as fotos que ela já mandou.',
      '<b>O que ele faz:</b> pede as fotos originais e a autorização de uso, anota interesse e melhor horário na oportunidade do Radar e chama o corretor.', '<b>Onde aparece:</b> Radar + Fisguei, fotos na mesa dele (e no imóvel quando for captado), alerta para o dono.'],
    gerente: ['<b>Com quem fala:</b> só com o dono do portal (celular cadastrado na mesa dele).', '<b>O que ele vê:</b> os números do dia: leads, visitas, conversas de cada agente, captação, fotos, pendências e linhas paradas.',
      '<b>O que ele faz:</b> manda o resumo da manhã e o relatório do dia, alerta na hora e cria afazeres para a equipe quando o dono pede.'],
    'gerente-corretores': ['<b>Com quem fala:</b> os corretores e gestores com celular cadastrado em Configurações > Usuários.', '<b>O que ele vê:</b> visitas, afazeres e leads quentes de cada corretor.',
      '<b>O que ele faz:</b> agenda da manhã, lembrete antes da visita, aviso de lead novo, de proprietário que confirmou e de quando um robô chama um humano; fecha afazeres com "feito 12".'],
  };
  return `<ul class="small">${(L[a.tipo === 'interno' ? a.slug : a.tipo] || []).map((x) => `<li>${x}</li>`).join('')}</ul>`;
}

// ---------- configuração geral do escritório ----------
async function telaEscritorioConfig() {
  if (!veTudo()) { $('#main').innerHTML = '<div class="empty">Só o administrativo e o gestor mudam a configuração do escritório.</div>'; return; }
  const d = await api('GET', '/api/escritorio/config');
  const ia = d.ia, g = d.geral, p = d.pc;
  $('#main').innerHTML = `<a class="muted small" href="#/whats">← Escritório virtual</a><h1>Configuração geral</h1>
  <p class="lead">O que vale para os 9 agentes: o cérebro que alimenta todos eles, as regras dos setores e o funcionamento sem o PC.</p>
  <div class="grid g2" style="align-items:start">
    <form class="card grid" data-form="ev-ia" style="gap:12px">
      <div class="row"><h2 style="margin:0">Cérebro dos agentes</h2><span class="sp"></span><span class="pill ${ia.provedor === 'gemini' ? 'ok' : 'warn'}">${ia.provedor === 'gemini' ? 'Gemini (nuvem)' : 'IA local do PC'}</span></div>
      <p class="small" style="margin:0">Com a chave da API do Gemini, os agentes pensam na nuvem: respondem, marcam visitas, mandam relatórios e fazem a conversa de teste mesmo com o PC desligado. Sem chave, quem pensa é a IA local do PC (${esc(ia.ollama_modelo)}).</p>
      <label class="f">Chave da API do Gemini${ia.tem_chave ? ` <span class="muted small">· salva, termina em <span class="mono">${esc(ia.chave_final)}</span></span>` : ''}
        <input class="inp mono" name="chave" type="password" autocomplete="off" spellcheck="false" placeholder="${ia.tem_chave ? 'Deixe em branco para manter a chave salva' : 'Cole aqui a chave (AIza…)'}"></label>
      ${ia.chave_quebrada ? '<div class="banner warn small" style="margin:0">A chave salva não pôde ser lida neste ambiente. Cole a chave de novo.</div>' : ''}
      <p class="muted small" style="margin:-4px 0 0">Crie a chave em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio › Get API key</a>. Ela fica cifrada no banco e nunca aparece inteira na tela.</p>
      <label class="f">Modelo<input class="inp mono" name="modelo" list="ev-modelos" value="${esc(ia.modelo)}" placeholder="gemini-flash-latest"><datalist id="ev-modelos"></datalist></label>
      <p class="muted small" style="margin:-4px 0 0"><span class="mono">gemini-flash-latest</span> sempre aponta para o Flash mais novo (rápido e barato, bom para WhatsApp). "Testar" lista os modelos que a sua chave pode usar.</p>
      <div id="ev-ia-teste">${ia.testado_em ? `<div class="banner ${ia.teste_ok ? 'ok' : 'bad'} small" style="margin:0">${ia.teste_ok ? '✓ ' : '✗ '}${esc(ia.teste_msg || '')}<br><span class="muted">${dataBR(ia.testado_em)}</span></div>` : ''}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-act="ev-ia-testar" ${ia.tem_chave ? '' : 'disabled'}>Testar a chave</button>
        ${ia.tem_chave ? '<span class="sp"></span><button class="btn" type="button" data-act="ev-ia-apagar">Remover a chave</button>' : ''}</div>
    </form>
    <div class="card"><h2>Funcionando sem o PC</h2>
      <div class="ev-func">
        <div class="${ia.provedor === 'gemini' ? 'on' : ''}"><b>Cérebro</b><span>${ia.provedor === 'gemini' ? `Na nuvem (Gemini)${p.cerebro.em ? ' · último ciclo ' + dataBR(p.cerebro.em.replace('T', ' ').slice(0, 19)) : ''}` : 'No PC (sem chave do Gemini)'}</span></div>
        <div class="${ia.provedor === 'gemini' ? 'on' : ''}"><b>Conversa de teste, aprovações, relatório do dono, lembretes</b><span>${ia.provedor === 'gemini' ? 'Na nuvem, a qualquer hora' : 'Dependem do PC ligado'}</span></div>
        <div class="${p.vivo ? 'on' : ''}"><b>Linhas de WhatsApp (QR code)</b><span>No PC da ${esc(MARCA.cliente)}${p.vivo ? ', ligado agora' : ', desligado agora'}. Com o PC desligado, as mensagens esperam na fila e saem quando ele ligar.</span></div>
      </div>
      <p class="small muted">Para as linhas também saírem do PC, dá para usar um serviço de WhatsApp na nuvem (Z-API, W-API) ou um servidor próprio. Fica para quando você decidir.</p></div>
    <form class="card grid" data-form="ev-regras" style="gap:10px"><h2 style="margin:0">Regras do escritório</h2>
      <label class="check"><input type="checkbox" name="ligado" ${g.ligado ? 'checked' : ''}> Escritório trabalhando (desmarque para pausar todos os agentes)</label>
      <div class="grid g2"><label class="f">Casas da Clara até (R$)<input class="inp" name="limite_casas" type="number" step="50000" value="${g.limite_casas}"></label>
      <label class="f">Apartamento vira alto padrão a partir de (R$)<input class="inp" name="limite_alto_apto" type="number" step="50000" value="${g.limite_alto_apto}"></label></div>
      <label class="check"><input type="checkbox" name="puxar_conversa" ${g.puxar_conversa ? 'checked' : ''}> Lead novo do portal ou do blog: o agente do setor manda a primeira mensagem (no modo "sugerir", espera aprovação)</label>
      <div class="grid g3"><label class="f">Agenda dos corretores<input class="inp" type="time" name="hora_agenda" value="${esc(g.hora_agenda || '')}"></label><label class="f">Lembrete antes da visita (min)<input class="inp" type="number" name="lembrete_visita_min" min="0" max="240" value="${g.lembrete_visita_min}"></label><span></span></div>
      <p class="muted small" style="margin:0">Off-market → Vicente; terreno → Teo; galpão, sala e loja → Bruno; apartamento → Ana (ou Helena acima do limite); casa → Clara (ou Helena acima do limite). O dono e os horários do relatório ficam na mesa do Augusto.</p>
      <div class="row"><span class="sp"></span><button class="btn pri" type="submit">Salvar regras</button></div></form>
  </div>
  <div id="pcv-config"></div>`;
  if (typeof pcConfig === 'function') pcConfig();
}
FORM['ev-ia'] = async (f) => { const o = formJSON(f); if (!o.chave) delete o.chave; const r = await api('PUT', '/api/escritorio/config/ia', o); toast(r.tem_chave ? 'Salvo. Testando a chave…' : 'Salvo'); if (r.tem_chave && o.chave) await evIaTesta(); else rota(); };
async function evIaTesta(el) {
  const box = $('#ev-ia-teste'); if (box) box.innerHTML = '<div class="banner info small" style="margin:0">Testando com o Google…</div>';
  const modelo = $('input[name=modelo]') ? $('input[name=modelo]').value : undefined;
  const r = await api('POST', '/api/escritorio/config/ia/testar', { modelo });
  if (!$('#ev-ia-teste')) return;
  $('#ev-ia-teste').innerHTML = `<div class="banner ${r.teste_ok ? 'ok' : 'bad'} small" style="margin:0">${r.teste_ok ? '✓ ' : '✗ '}${esc(r.teste_msg || '')}${r.modelos.length ? `<br><span class="muted">${r.modelos.length} modelo(s) disponíveis para a chave.</span>` : ''}</div>`;
  const dl = $('#ev-modelos'); if (dl) dl.innerHTML = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest', ...r.modelos.map((m) => m.id)].map((m) => `<option value="${esc(m)}">`).join('');
  toast(r.teste_ok ? 'Chave funcionando' : 'A chave não funcionou', !r.teste_ok);
}
ACT['ev-ia-testar'] = (el) => comBotao(el, () => evIaTesta(el));
ACT['ev-ia-apagar'] = (el) => comBotao(el, async () => { if (!confirm('Remover a chave do Gemini? Os agentes voltam a depender da IA local do PC.')) return; await api('PUT', '/api/escritorio/config/ia', { apagar: true }); toast('Chave removida'); rota(); });
FORM['ev-regras'] = async (f) => { await api('PUT', '/api/escritorio/geral', formJSON(f)); toast('Regras salvas'); rota(); };
