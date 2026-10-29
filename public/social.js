/* Redes e publicações (#/redes): calendário mensal das publicações no Instagram, Facebook e Google Meu Negócio,
   geradas sozinhas com os imóveis do portal, o blog, a revista da semana e os guias de bairro.
   Abas: Calendário · Próximas · Escolher imóveis · Contas · Ajustes. Usa esc(), api(), ACT, FORM, modal() do app.js. */
'use strict';

const RS_ABAS = [['', 'Calendário'], ['fila', 'Próximas e prontas'], ['imoveis', 'Escolher imóveis'], ['contas', 'Contas conectadas'], ['ajustes', 'Ajustes e cadência']];
const RS_TIPO = { imovel: ['Imóvel', 'rs-t-imovel'], blog: ['Blog', 'rs-t-blog'], revista: ['Revista', 'rs-t-revista'], bairro: ['Bairro', 'rs-t-bairro'] };
const RS_ST = {
  agendado: ['Agendado', 'info'], aguardando: ['Para aprovar', 'warn'], publicando: ['Publicando…', 'info'], publicado: ['Publicado', 'ok'],
  parcial: ['Saiu em parte', 'warn'], erro: ['Erro', 'bad'], pronto_manual: ['Pronto para postar', 'gold'], cancelado: ['Fora do calendário', ''],
};
const RS_REDE = { instagram: 'Instagram', facebook: 'Facebook', google: 'Google' };
const RS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const RS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const rsPill = (s) => `<span class="pill ${(RS_ST[s] || ['', ''])[1]}">${esc((RS_ST[s] || [s])[0])}</span>`;
const rsHora = (s) => String(s || '').slice(11, 16);
const rsDia = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}`; };
const rsMesNome = (mes) => { const [a, m] = mes.split('-'); const n = RS_MESES[+m - 1]; return `${n[0].toUpperCase()}${n.slice(1)} de ${a}`; };
const rsSomaMes = (mes, n) => { const [a, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const rsRedesIcone = (p) => (p.redes || []).map((r) => {
  const x = (p.resultado || {})[r];
  return `<span class="rs-r rs-r-${r}${x && x.ok ? ' ok' : x && x.erro ? ' bad' : ''}" title="${esc(RS_REDE[r])}${x && x.ok ? ': publicado' : x && x.erro ? ': ' + esc(x.erro) : ''}">${r[0].toUpperCase()}</span>`;
}).join('');
let RS = null; // última resposta do calendário

function rsTopo(aba, d) {
  const n = d ? d.numeros : {};
  return `<div class="eyebrow">Conteúdo</div><h1>Redes e publicações</h1>
  <p class="lead">Os posts do Instagram, do Facebook e do Google Meu Negócio são gerados sozinhos com os imóveis do portal, os textos do ${esc(MARCA.blog || MARCA.cliente + ' Blog')}, a revista da semana e os guias de bairro, no ritmo do plano. Tudo fica neste calendário: dá para mudar o horário, a legenda, trocar o imóvel ou tirar um post antes de sair.</p>
  <div class="tabs rs-abas">${RS_ABAS.map(([k, l]) => `<a href="#/redes${k ? '/' + k : ''}" class="${aba === k ? 'on' : ''}">${l}${k === 'fila' && n && (n.pronto_manual || n.erros) ? ` <span class="pill ${n.erros ? 'bad' : 'gold'}">${(n.pronto_manual || 0) + (n.erros || 0)}</span>` : ''}</a>`).join('')}</div>`;
}

function rsAvisos(d) {
  const a = [];
  const contas = d.contas || [];
  const tem = (r) => contas.some((c) => c.rede === r);
  if (d.disponivel && d.disponivel.demonstracao) a.push('<div class="banner info"><b>Imobiliária de demonstração.</b> O calendário e as artes funcionam normalmente, mas nada é publicado em redes de verdade.</div>');
  else if (!contas.length) a.push(`<div class="banner warn"><b>Nenhuma rede conectada ainda.</b> Os posts continuam sendo gerados e, na hora marcada, ficam <b>prontos para postar</b> (artes para baixar e legenda para copiar). <a href="#/redes/contas">Conectar Instagram, Facebook e Google</a></div>`);
  else { const falta = ['instagram', 'facebook', 'google'].filter((r) => !tem(r)); if (falta.length) a.push(`<div class="banner info">Falta conectar: ${falta.map((r) => RS_REDE[r]).join(', ')}. <a href="#/redes/contas">Contas</a></div>`); }
  if (d.ajustes && d.ajustes.pausado) a.push('<div class="banner bad"><b>Publicações pausadas.</b> Nada sai até você retomar em <a href="#/redes/ajustes">Ajustes</a>.</div>');
  if (d.numeros.erros) a.push(`<div class="banner bad"><b>${d.numeros.erros}</b> publicação(ões) com erro nos últimos 7 dias. <a href="#/redes/fila">Ver</a></div>`);
  if (d.numeros.pronto_manual) a.push(`<div class="banner warn"><b>${d.numeros.pronto_manual}</b> post(s) pronto(s) para postar à mão. <a href="#/redes/fila">Baixar artes e copiar legendas</a></div>`);
  if (d.numeros.aguardando) a.push(`<div class="banner warn"><b>${d.numeros.aguardando}</b> post(s) esperando aprovação. ${veTudo() ? '<button class="btn sm pri" data-act="rs-aprovar-mes">Aprovar o mês</button>' : ''}</div>`);
  return a.join('');
}

async function telaRedes(aba = '', qs = new URLSearchParams()) {
  if (aba === 'contas') return rsContas(qs);
  if (aba === 'ajustes') return rsAjustes();
  if (aba === 'imoveis') return rsImoveis();
  if (aba === 'fila') return rsFila();
  const mes = /^\d{4}-\d{2}$/.test(qs.get('mes') || '') ? qs.get('mes') : null;
  const d = RS = await api('GET', '/api/social' + (mes ? `?mes=${mes}` : ''));
  const [ano, m] = d.mes.split('-').map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
  const ndias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const porDia = {};
  for (const p of d.posts) (porDia[p.agendado_para.slice(0, 10)] = porDia[p.agendado_para.slice(0, 10)] || []).push(p);
  const celula = (dia) => {
    const iso = `${d.mes}-${String(dia).padStart(2, '0')}`;
    const l = porDia[iso] || [];
    const hoje = iso === d.hoje, passado = iso < d.hoje;
    return `<div class="rs-dia${hoje ? ' hoje' : ''}${passado ? ' passado' : ''}"><div class="rs-dn">${dia}</div>${l.map((p) => `<button type="button" class="rs-post ${RS_TIPO[p.tipo] ? RS_TIPO[p.tipo][1] : ''} st-${p.status}" data-act="rs-post" data-id="${p.id}" title="${esc(p.titulo)}">
      <img src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"><span class="rs-pt"><b>${rsHora(p.agendado_para)}</b> ${esc((RS_TIPO[p.tipo] || [p.tipo])[0])}<span class="rs-pn">${esc(p.titulo)}</span></span><span class="rs-ps st-${p.status}" aria-hidden="true"></span></button>`).join('')}</div>`;
  };
  const vazios = Array.from({ length: primeiro }, () => '<div class="rs-dia vazio"></div>').join('');
  const lista = Object.keys(porDia).sort().map((dia) => `<div class="rs-ldia${dia === d.hoje ? ' hoje' : ''}"><h3>${RS_SEMANA[new Date(dia + 'T12:00:00Z').getUTCDay()]} · ${rsDia(dia)}</h3>${porDia[dia].map((p) => `<div class="item click" data-act="rs-post" data-id="${p.id}"><span class="rs-mini"><img src="${esc(p.thumb)}" alt="" loading="lazy"></span>
    <div style="flex:1;min-width:0"><div class="t">${rsHora(p.agendado_para)} · ${esc(p.titulo)}</div><div class="muted small">${esc((RS_TIPO[p.tipo] || [p.tipo])[0])} · ${p.slides} imagem(ns) ${rsRedesIcone(p)}</div></div>${rsPill(p.status)}</div>`).join('')}</div>`).join('');
  const c = d.cadencia;
  $('#main').innerHTML = `${rsTopo('', d)}${rsAvisos(d)}
  <div class="grid g4 rs-kpis">
    <div class="card kpi"><div class="n">${d.numeros.publicados_mes}</div><div class="l">Publicados em ${esc(RS_MESES[m - 1])}</div></div>
    <div class="card kpi"><div class="n">${d.numeros.agendados_7d}</div><div class="l">Agendados nos próximos 7 dias</div></div>
    <div class="card kpi"><div class="n">${d.numeros.cliques_mes}</div><div class="l">Cliques nos links do mês</div></div>
    <div class="card kpi"><div class="n">${d.numeros.leads_mes}</div><div class="l">Clientes que vieram pelas redes</div></div>
  </div>
  <div class="row rs-nav"><button class="btn sm" data-act="ir" data-href="#/redes?mes=${rsSomaMes(d.mes, -1)}" aria-label="Mês anterior">‹</button><h2>${esc(rsMesNome(d.mes))}</h2><button class="btn sm" data-act="ir" data-href="#/redes?mes=${rsSomaMes(d.mes, 1)}" aria-label="Próximo mês">›</button>
    ${d.mes !== d.hoje.slice(0, 7) ? `<button class="btn sm" data-act="ir" data-href="#/redes">Hoje</button>` : ''}<span class="sp"></span>
    <span class="rs-leg">${Object.entries(RS_TIPO).map(([, [t, cl]]) => `<span class="rs-leg-i ${cl}">${t}</span>`).join('')}</span>
    ${veTudo() ? '<button class="btn sm" data-act="rs-planejar" title="Preenche os próximos 35 dias com o que estiver disponível">Gerar agora</button>' : ''}
    <a class="btn sm pri" href="#/redes/imoveis">+ Escolher imóveis</a></div>
  <div class="rs-cal" role="grid" aria-label="Calendário de ${esc(rsMesNome(d.mes))}">${RS_SEMANA.map((s) => `<div class="rs-sem">${s}</div>`).join('')}${vazios}${Array.from({ length: ndias }, (_, i) => celula(i + 1)).join('')}</div>
  <div class="rs-lista">${lista || '<div class="card"><div class="empty">Nada neste mês.</div></div>'}</div>
  <p class="muted small" style="margin-top:14px">Plano <b>${esc(c.nome)}</b>: ${c.resumo.imoveis} imóvel(is), ${c.resumo.blog} texto(s) do blog${c.resumo.bairro ? `, ${c.resumo.bairro} guia(s) de bairro` : ''} e ${c.resumo.revista ? 'a revista' : 'nenhuma revista'} por semana · modo <b>${d.ajustes.modo === 'aprovar' ? 'aprovar antes de sair' : 'sai sozinho'}</b>${d.planejado_em ? ` · calendário atualizado ${dataBR(d.planejado_em)}` : ''}${d.ciclo_em ? ` · última rodada ${dataBR(d.ciclo_em)}` : ''}.</p>`;
}
ACT['rs-planejar'] = (el) => comBotao(el, async () => { const r = await api('POST', '/api/social/planejar'); toast(r.criados ? `${r.criados} post(s) novo(s) no calendário` : 'O calendário já está completo'); rota(); });
ACT['rs-aprovar-mes'] = (el) => comBotao(el, async () => { const r = await api('POST', '/api/social/aprovar', { mes: (RS && RS.mes) || undefined }); toast(`${r.aprovados} post(s) aprovado(s)`); rota(); });
ACT['rs-post'] = (el) => rsAbrePost(+el.dataset.id);

// ---------- um post (janela)
async function rsAbrePost(id) {
  const p = await api('GET', `/api/social/posts/${id}`);
  const podeEditar = !['publicado', 'publicando'].includes(p.status);
  const res = p.resultado || {};
  const quando = p.agendado_para.replace(' ', 'T');
  modal(`<div class="rs-modal"><div class="row" style="align-items:flex-start"><div style="flex:1;min-width:0"><div class="eyebrow">${esc((RS_TIPO[p.tipo] || [p.tipo])[0])} · ${rsDia(p.agendado_para)} às ${rsHora(p.agendado_para)}${p.origem === 'manual' ? ' · escolhido à mão' : ''}</div><h2 style="margin:2px 0 6px">${esc(p.titulo)}</h2>${rsPill(p.status)} ${rsRedesIcone(p)}</div><button type="button" class="btn sm" data-fecha aria-label="Fechar" style="flex:none;width:auto">✕</button></div>
  ${p.motivo ? `<div class="banner ${p.status === 'erro' || p.status === 'parcial' ? 'bad' : 'info'}" style="margin-top:10px">${esc(p.motivo)}</div>` : ''}
  ${!p.existe ? '<div class="banner bad" style="margin-top:10px">O conteúdo deste post saiu do ar (imóvel vendido ou retirado, texto fora do ar). Ele não vai ser publicado.</div>' : ''}
  <div class="rs-artes">${p.artes.map((a, i) => `<figure><img src="${esc(a.url)}" alt="Arte ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}"><figcaption><a href="${esc(a.url)}&baixar=1" download>Baixar ${i + 1}</a></figcaption></figure>`).join('')}
    ${p.redes.includes('google') ? `<figure class="rs-g"><img src="${esc(p.google)}" alt="Arte do Google" loading="lazy"><figcaption>Google · <a href="${esc(p.google)}&baixar=1" download>Baixar</a></figcaption></figure>` : ''}</div>
  ${Object.keys(res).length ? `<div class="rs-res">${Object.entries(res).map(([r, x]) => `<div class="small">${esc(RS_REDE[r] || (r === 'manual' ? 'Postado à mão' : r))}: ${x.ok ? `<span class="pill ok">ok</span> ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">abrir</a>` : ''} <span class="muted">${esc(x.em || '')}${x.por ? ' · ' + esc(x.por) : ''}</span>` : `<span class="pill bad">erro</span> ${esc(x.erro || '')} <span class="muted">${x.tentativas ? `(${x.tentativas} tentativa(s))` : ''}</span>`}</div>`).join('')}${p.cliques.length ? `<div class="small muted">Cliques: ${p.cliques.map((c) => `${esc(RS_REDE[c.rede] || c.rede)} ${c.n}`).join(' · ')}</div>` : ''}</div>` : ''}
  <form data-form="rs-post" data-id="${p.id}" class="grid" style="gap:12px;margin-top:12px">
    <label class="f">Legenda${p.editado ? ' <span class="pill info">editada pela equipe</span>' : ' <span class="muted small">(gerada a partir da página; o valor é conferido na hora de sair)</span>'}<textarea name="legenda" rows="8" ${podeEditar ? '' : 'readonly'}>${esc(p.legenda || '')}</textarea></label>
    <label class="f">Hashtags<input name="hashtags" value="${esc(p.hashtags || '')}" ${podeEditar ? '' : 'readonly'}></label>
    <div class="grid g2"><label class="f">Data e hora<input type="datetime-local" name="agendado_para" value="${esc(quando)}" ${podeEditar ? '' : 'readonly'}></label>
    <fieldset class="f rs-redes"><legend>Onde sai</legend>${['instagram', 'facebook', 'google'].map((r) => `<label class="chk"><input type="checkbox" name="rede_${r}" ${p.redes.includes(r) ? 'checked' : ''} ${podeEditar ? '' : 'disabled'}> ${RS_REDE[r]}</label>`).join('')}</fieldset></div>
    <details class="rs-prev"><summary>Como a legenda sai em cada rede</summary>${['instagram', 'facebook', 'google'].map((r) => `<div><b>${RS_REDE[r]}</b> <button type="button" class="btn sm" data-act="copiar" data-txt="${esc(p.previas[r])}">Copiar</button><pre>${esc(p.previas[r])}</pre></div>`).join('')}</details>
    <div class="row rs-acoes" style="flex-wrap:wrap">
      ${p.link ? `<a class="btn sm" href="${esc(p.link)}" target="_blank" rel="noopener">Abrir a página</a>` : ''}
      <button type="button" class="btn sm" data-act="copiar" data-txt="${esc(p.previas.instagram)}">Copiar legenda</button>
      ${p.status === 'pronto_manual' || p.status === 'erro' ? `<button type="button" class="btn sm" data-act="rs-postado" data-id="${p.id}">Já postei à mão</button>` : ''}
      ${podeEditar && p.status !== 'cancelado' && p.tipo === 'imovel' && p.origem === 'auto' ? `<button type="button" class="btn sm" data-act="rs-trocar" data-id="${p.id}" title="Põe o próximo imóvel do rodízio neste horário">Trocar o imóvel</button>` : ''}
      ${p.status === 'cancelado' ? `<button type="button" class="btn sm" data-act="rs-restaurar" data-id="${p.id}">Voltar para o calendário</button>` : podeEditar ? `<button type="button" class="btn sm danger" data-act="rs-cancelar" data-id="${p.id}">Tirar do calendário</button>` : ''}
      <span class="sp"></span>
      ${p.status === 'aguardando' && veTudo() ? `<button type="button" class="btn sm" data-act="rs-aprovar" data-id="${p.id}">Aprovar</button>` : ''}
      ${podeEditar && p.status !== 'cancelado' && veTudo() && p.existe ? `<button type="button" class="btn sm" data-act="rs-agora" data-id="${p.id}">Publicar agora</button>` : ''}
      ${podeEditar ? '<button class="btn pri" type="submit">Salvar</button>' : ''}
    </div>
  </form></div>`);
  // guarda o que veio do servidor para mandar só o que mudou
  const f = document.querySelector('form[data-form="rs-post"]');
  if (f) RS_ORIG.set(p.id, { legenda: f.legenda.value, hashtags: f.hashtags.value, quando: f.agendado_para.value });
}
const RS_ORIG = new Map();
FORM['rs-post'] = async (f) => {
  const d = formJSON(f);
  const redes = ['instagram', 'facebook', 'google'].filter((r) => d['rede_' + r]);
  const b = { redes };
  const orig = RS_ORIG.get(+f.dataset.id);
  if (d.legenda !== orig.legenda) b.legenda = d.legenda;
  if (d.hashtags !== orig.hashtags) b.hashtags = d.hashtags;
  if (d.agendado_para && d.agendado_para !== orig.quando) b.agendado_para = d.agendado_para;
  await api('PUT', `/api/social/posts/${f.dataset.id}`, b);
  fechaModal(); toast('Publicação salva'); rota();
};
const rsAcao = (url, msg) => (el) => comBotao(el, async () => { const r = await api('POST', url(el)); fechaModal(); toast(typeof msg === 'function' ? msg(r) : msg); rota(); });
ACT['rs-cancelar'] = (el) => { if (confirm('Tirar este post do calendário? O horário fica vazio.')) rsAcao((e) => `/api/social/posts/${e.dataset.id}/cancelar`, 'Post tirado do calendário')(el); };
ACT['rs-restaurar'] = rsAcao((e) => `/api/social/posts/${e.dataset.id}/restaurar`, 'Post de volta no calendário');
ACT['rs-trocar'] = rsAcao((e) => `/api/social/posts/${e.dataset.id}/trocar`, (r) => (r.novo ? 'Outro imóvel entrou neste horário' : 'Não havia outro imóvel livre para este horário'));
ACT['rs-aprovar'] = rsAcao((e) => `/api/social/posts/${e.dataset.id}/aprovar`, 'Aprovado');
ACT['rs-postado'] = rsAcao((e) => `/api/social/posts/${e.dataset.id}/postado`, 'Marcado como postado');
ACT['rs-agora'] = (el) => { if (confirm('Publicar este post agora nas redes marcadas?')) rsAcao((e) => `/api/social/posts/${e.dataset.id}/publicar`, (r) => `${(RS_ST[r.status] || [r.status])[0]}`)(el); };

// ---------- próximas e prontas
async function rsFila() {
  const d = RS = await api('GET', '/api/social');
  const prox = rsSomaMes(d.mes, 1);
  const d2 = await api('GET', `/api/social?mes=${prox}`);
  const todos = [...d.posts, ...d2.posts];
  const prontos = todos.filter((p) => ['pronto_manual', 'erro', 'parcial'].includes(p.status));
  const futuros = todos.filter((p) => p.agendado_para > d.agora && ['agendado', 'aguardando'].includes(p.status)).slice(0, 40);
  const recentes = todos.filter((p) => p.status === 'publicado').sort((a, b) => (a.agendado_para < b.agendado_para ? 1 : -1)).slice(0, 12);
  const linha = (p) => `<div class="item click" data-act="rs-post" data-id="${p.id}"><span class="rs-mini"><img src="${esc(p.thumb)}" alt="" loading="lazy"></span>
    <div style="flex:1;min-width:0"><div class="t">${esc(p.titulo)}</div><div class="muted small">${RS_SEMANA[new Date(p.agendado_para.slice(0, 10) + 'T12:00:00Z').getUTCDay()]} ${rsDia(p.agendado_para)} às ${rsHora(p.agendado_para)} · ${esc((RS_TIPO[p.tipo] || [p.tipo])[0])} ${rsRedesIcone(p)}${p.motivo ? ` · ${esc(p.motivo)}` : ''}</div></div>${rsPill(p.status)}</div>`;
  $('#main').innerHTML = `${rsTopo('fila', d)}${rsAvisos(d)}
  <div class="card"><h2>Prontos para postar e com erro</h2><p class="muted small" style="margin:0 0 8px">Abra o post, baixe as artes e copie a legenda; depois clique em "Já postei à mão".</p>${prontos.length ? `<div class="list">${prontos.map(linha).join('')}</div>` : '<div class="empty">Nada esperando. 👍</div>'}</div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h2>Próximas publicações</h2>${futuros.length ? `<div class="list">${futuros.map(linha).join('')}</div>` : '<div class="empty">Nada agendado.</div>'}</div>
  <div class="card"><h2>Publicadas recentemente</h2>${recentes.length ? `<div class="list">${recentes.map(linha).join('')}</div>` : '<div class="empty">Nada publicado ainda.</div>'}</div></div>`;
}

// ---------- escolher imóveis
async function rsImoveis() {
  const [d, l] = await Promise.all([api('GET', '/api/social'), api('GET', '/api/social/imoveis')]);
  RS = d;
  const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  $('#main').innerHTML = `${rsTopo('imoveis', d)}
  <p class="muted">Os imóveis já entram no rodízio sozinhos. Aqui você escolhe imóveis para ganhar um post extra (lançamento, baixa de preço, visita marcada…): marque, escolha o dia e o horário.</p>
  <form data-form="rs-imoveis" class="card grid rs-imform" style="gap:12px">
    <div class="grid g4"><label class="f">A partir de<input type="date" name="inicio" value="${amanha}" required></label><label class="f">Horário<input type="time" name="hora" value="12:00" required></label>
    <label class="f">Um a cada<select name="intervalo"><option value="0">no mesmo dia</option><option value="1" selected>1 dia</option><option value="2">2 dias</option><option value="3">3 dias</option><option value="7">semana</option></select></label>
    <div class="f" style="align-self:end"><button class="btn pri" type="submit" id="rs-im-btn">Agendar os marcados</button></div></div>
    <div class="row"><input type="search" id="rs-im-busca" placeholder="Buscar por código, tipo ou bairro" style="flex:1"><span class="muted small" id="rs-im-n">0 marcados</span></div>
    ${l.length ? `<div class="rs-imgrid">${l.map((x) => `<label class="rs-im" data-busca="${esc((x.codigo + ' ' + x.titulo + ' ' + x.tipo + ' ' + (x.bairro || '')).toLowerCase())}"><input type="checkbox" name="cod_${esc(x.codigo)}">
      <img src="${esc(x.capa)}" alt="" loading="lazy"><span class="rs-im-t"><b>${esc(x.titulo)}</b><span class="muted small">${esc(x.codigo)} · ${x.signature ? 'Signature' : x.valor ? brl(x.valor) : 'sob consulta'}</span>
      <span class="small">${x.posts ? `${x.posts} post(s)${x.ultimo ? ' · último ' + rsDia(x.ultimo) : ''}` : '<span class="pill warn">ainda não saiu</span>'}${x.proximo ? ` · próximo ${rsDia(x.proximo)}` : ''}</span></span></label>`).join('')}</div>` : '<div class="empty">Nenhum imóvel no portal ainda (status publicado e com foto).</div>'}
  </form>`;
  const conta = () => { const n = $$('.rs-im input:checked').length; $('#rs-im-n').textContent = `${n} marcado(s)`; };
  $$('.rs-im input').forEach((c) => c.addEventListener('change', conta));
  $('#rs-im-busca').addEventListener('input', (e) => { const q = e.target.value.toLowerCase().trim(); $$('.rs-im').forEach((el) => { el.hidden = q && !el.dataset.busca.includes(q); }); });
}
FORM['rs-imoveis'] = async (f) => {
  const d = formJSON(f);
  const codigos = Object.keys(d).filter((k) => k.startsWith('cod_') && d[k]).map((k) => k.slice(4));
  if (!codigos.length) throw new Error('Marque ao menos um imóvel.');
  const r = await api('POST', '/api/social/imoveis', { codigos, inicio: d.inicio, hora: d.hora, intervalo: +d.intervalo });
  toast(`${r.criados.length} post(s) agendado(s)`); navega('#/redes');
};

// ---------- contas
async function rsContas(qs) {
  const [d, c] = await Promise.all([api('GET', '/api/social'), api('GET', '/api/social/contas')]);
  RS = d;
  const msg = qs.get('conexao');
  const por = (r) => c.contas.filter((x) => x.rede === r);
  const disp = c.disponivel;
  const bloco = (r, desc) => `<div class="card rs-conta"><div class="row"><span class="rs-r rs-r-${r} grande">${r[0].toUpperCase()}</span><h2 style="margin:0">${RS_REDE[r]}</h2><span class="sp"></span>${por(r).some((x) => x.ativo) ? '<span class="pill ok">conectado</span>' : '<span class="pill">não conectado</span>'}</div>
    <p class="muted small">${desc}</p>
    ${por(r).length ? `<div class="list">${por(r).map((x) => `<div class="item"><div style="flex:1;min-width:0"><div class="t">${esc(x.nome || x.conta_id)} ${x.usuario ? `<span class="muted">${esc(x.usuario)}</span>` : ''}</div><div class="muted small">conectado ${dataBR(x.conectado_em)}${x.ultimo_erro ? ` · <span class="bad-t">último erro: ${esc(x.ultimo_erro)}</span>` : ''}</div></div>
      ${x.ativo ? '<span class="pill ok">em uso</span>' : veTudo() ? `<button class="btn sm" data-act="rs-conta-ativar" data-id="${x.id}">Usar esta</button>` : ''}${veTudo() ? ` <button class="btn sm danger" data-act="rs-conta-remover" data-id="${x.id}">Remover</button>` : ''}</div>`).join('')}</div>` : ''}</div>`;
  $('#main').innerHTML = `${rsTopo('contas', d)}
  ${msg ? `<div class="banner ${msg === 'ok' ? 'ok' : 'bad'}">${msg === 'ok' ? 'Conta conectada. As próximas publicações já saem nela.' : esc(msg)}</div>` : ''}
  ${disp.demonstracao ? '<div class="banner info">Imobiliária de demonstração: as contas de verdade não são ligadas aqui.</div>' : ''}
  <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">
    ${veTudo() && !disp.demonstracao ? `<button class="btn pri" data-act="rs-conectar" data-rede="meta" ${disp.meta ? '' : 'disabled'}>Conectar com o Facebook (Instagram + Página)</button>
    <button class="btn pri" data-act="rs-conectar" data-rede="google" ${disp.google ? '' : 'disabled'}>Conectar o Google Meu Negócio</button>` : ''}
  </div>
  ${!disp.meta && !disp.demonstracao ? '<div class="banner warn">A conexão com Facebook e Instagram está sendo liberada pela Meta para a plataforma. Até lá, os posts ficam prontos para postar à mão.</div>' : ''}
  ${!disp.google && !disp.demonstracao ? '<div class="banner warn">A conexão com o Google Meu Negócio está sendo liberada pelo Google para a plataforma.</div>' : ''}
  <div class="grid g3">${bloco('instagram', 'Conta profissional (empresa ou criador) ligada à Página do Facebook. Os imóveis saem em carrossel, com a capa, as fotos e o convite para a visita.')}
  ${bloco('facebook', 'A Página da imobiliária. Sai o mesmo carrossel, com o link direto para a página do imóvel.')}
  ${bloco('google', 'O perfil da imobiliária no Google (Meu Negócio). Sai a capa em formato do Google com o botão "Saiba mais".')}</div>
  <div class="card" style="margin-top:16px"><h2>Link da bio do Instagram</h2><p class="muted small" style="margin:0 0 8px">No Instagram o link da legenda não abre. Coloque este endereço na bio: ele mostra as últimas publicações e cada uma leva à página certa, sem sair do site.</p>
    <div class="row"><span class="mono">${esc(location.origin)}/links</span><button class="btn sm" data-act="copiar" data-txt="${esc(location.origin)}/links">Copiar</button><a class="btn sm" href="/links" target="_blank" rel="noopener">Abrir</a></div></div>`;
}
ACT['rs-conectar'] = (el) => comBotao(el, async () => { const r = await api('GET', `/api/social/conectar/${el.dataset.rede}`); location.href = r.url; });
ACT['rs-conta-ativar'] = (el) => comBotao(el, async () => { await api('POST', `/api/social/contas/${el.dataset.id}/ativar`); rota(); });
ACT['rs-conta-remover'] = (el) => { if (confirm('Remover esta conta? As publicações param de sair nela.')) comBotao(el, async () => { await api('DELETE', `/api/social/contas/${el.dataset.id}`); rota(); }); };

// ---------- ajustes
async function rsAjustes() {
  const d = RS = await api('GET', '/api/social');
  const a = d.ajustes, c = d.cadencia;
  const dias = (x) => (x.dias.length === 7 ? 'todo dia' : x.dias.length ? x.dias.map((k) => RS_SEMANA[k]).join(', ') : '—');
  const ed = veTudo();
  $('#main').innerHTML = `${rsTopo('ajustes', d)}
  <div class="grid g2">
  <form class="card grid" data-form="rs-ajustes" style="gap:12px;align-content:start"><h2 style="margin:0">Como as publicações saem</h2>
    <label class="chk"><input type="radio" name="modo" value="automatico" ${a.modo === 'automatico' ? 'checked' : ''} ${ed ? '' : 'disabled'}> <span><b>Saem sozinhas</b> no horário marcado (você ainda pode mudar ou tirar qualquer post antes).</span></label>
    <label class="chk"><input type="radio" name="modo" value="aprovar" ${a.modo === 'aprovar' ? 'checked' : ''} ${ed ? '' : 'disabled'}> <span><b>Aprovar antes</b>: cada post espera o "Aprovar" (ou "Aprovar o mês") de um gestor.</span></label>
    <label class="chk"><input type="checkbox" name="pausado" ${a.pausado ? 'checked' : ''} ${ed ? '' : 'disabled'}> <span>Pausar tudo (nada sai até desmarcar)</span></label>
    <fieldset class="f"><legend>Redes</legend>${['instagram', 'facebook', 'google'].map((r) => `<label class="chk"><input type="checkbox" name="rede_${r}" ${a.redes[r] ? 'checked' : ''} ${ed ? '' : 'disabled'}> ${RS_REDE[r]}</label>`).join('')}</fieldset>
    <fieldset class="f"><legend>O que entra no calendário</legend>${[['imovel', 'Imóveis do portal'], ['blog', 'Textos do blog'], ['revista', 'Revista da semana'], ['bairro', 'Guias de bairro']].map(([k, t]) => `<label class="chk"><input type="checkbox" name="tipo_${k}" ${a.tipos[k] ? 'checked' : ''} ${ed ? '' : 'disabled'}> ${t}</label>`).join('')}</fieldset>
    ${ed ? '<div><button class="btn pri" type="submit">Salvar</button></div>' : '<p class="muted small">Só o administrativo e o gestor mudam os ajustes.</p>'}</form>
  <div class="card" style="align-content:start"><h2 style="margin:0 0 6px">Cadência do plano ${esc(c.nome)}</h2><p class="muted small" style="margin:0 0 10px">O ritmo vem do plano contratado. Para publicar mais, fale com a Herrera HOUSE IA sobre o plano Rede.</p>
    <div class="tbl"><table><thead><tr><th>O quê</th><th>Dias</th><th>Horário</th><th class="num">Por semana</th></tr></thead><tbody>
    <tr><td>Imóveis do portal (rodízio)</td><td>${dias(c.imoveis)}</td><td>${c.imoveis.horas.join(' e ')}</td><td class="num">${c.resumo.imoveis}</td></tr>
    <tr><td>Textos do blog</td><td>${dias(c.blog)}</td><td>${c.blog.horas.join(', ')}</td><td class="num">${c.resumo.blog}</td></tr>
    <tr><td>Guias de bairro</td><td>${dias(c.bairro)}</td><td>${c.bairro.horas.join(', ')}</td><td class="num">${c.resumo.bairro}</td></tr>
    <tr><td>Revista da semana</td><td>${dias(c.revista)}</td><td>${c.revista.horas.join(', ')}</td><td class="num">${c.resumo.revista}</td></tr>
    </tbody></table></div>
    <p class="muted small">O mesmo imóvel só volta depois de alguns dias (até 7, conforme o tamanho da vitrine); quem nunca saiu tem a vez primeiro. Imóvel vendido ou retirado sai do calendário sozinho e o horário recebe outro. Imóveis da seleção Signature saem sem o valor.</p></div>
  </div>`;
}
FORM['rs-ajustes'] = async (f) => {
  const d = formJSON(f);
  await api('PUT', '/api/social/ajustes', {
    modo: (f.querySelector('input[name=modo]:checked') || {}).value, pausado: !!d.pausado,
    redes: Object.fromEntries(['instagram', 'facebook', 'google'].map((r) => [r, !!d['rede_' + r]])),
    tipos: Object.fromEntries(['imovel', 'blog', 'revista', 'bairro'].map((t) => [t, !!d['tipo_' + t]])),
  });
  toast('Ajustes salvos'); rota();
};

// selo do menu: erros e posts prontos para postar à mão
function rsBadge() {
  api('GET', '/api/social/resumo').then((r) => {
    const b = $('#badge-redes'); if (!b) return;
    const n = (r.erros || 0) + (r.pronto_manual || 0) + (r.aguardando || 0);
    b.textContent = r.erros ? '!' : n; b.hidden = !n; b.title = r.erros ? 'Publicação com erro' : 'Posts para postar à mão ou aprovar';
    if (typeof topoAtualiza === 'function') topoAtualiza();
  }).catch(() => {});
}
