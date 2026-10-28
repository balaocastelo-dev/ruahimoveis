/* Sistema RUAH — Fisguei: anúncios e proprietários do Fisgar + robô TH-IA-GO CORRETOR (carregado depois do app.js) */
'use strict';
const FG_ST = {
  novo: ['Sem proprietário', 'info'], abordando: ['Robô abordando', 'warn'], respondeu: ['Respondeu · corretor', 'bad'],
  confirmado: ['Dono confirmou', 'ok'], sem_interesse: ['Sem interesse', 'gold'], sem_dono: ['Ninguém confirmou', 'gold'],
  captado: ['No Radar', 'ok'], descartado: ['Descartado', 'bad'],
};
const PES_ST = { pendente: ['na fila', 'info'], abordando: ['abordado', 'warn'], respondeu: ['respondeu', 'bad'], confirmou: ['é o dono', 'ok'], negou: ['não é o dono', 'gold'], sem_interesse: ['sem interesse', 'gold'], parar: ['pediu PARAR', 'bad'] };
const ENV_ST = { fila: ['na fila', 'info'], enviado: ['enviada', 'warn'], respondeu: ['respondeu', 'ok'], pulado: ['pulado', 'gold'], erro: ['erro', 'bad'], sem_whatsapp: ['sem WhatsApp', 'gold'], fixo: ['fixo', 'info'], email: ['e-mail', 'info'] };
const fgPill = (s, M = FG_ST) => `<span class="pill ${(M[s] || ['', 'info'])[1]}">${esc((M[s] || [s])[0])}</span>`;
const fgEnd = (a) => [a.logradouro, a.numero].filter(Boolean).join(', ') || a.bairro || 'Endereço não informado';
const fgRef = (id) => 'FG-' + String(id).padStart(5, '0');
const LEAFLET = { js: '/vendor/leaflet/leaflet.js', css: '/vendor/leaflet/leaflet.css' };

// Fundo dos mapas: OpenStreetMap. O servidor do OSM recusa pedido sem "Referer" e o sistema não manda Referer para fora
// (Referrer-Policy same-origin); por isso só os ladrilhos do mapa levam a origem do site (sem caminho nem dados).
function camadaMapa(m) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(m);
}
function carregaLeaflet() {
  if (window.L) return Promise.resolve();
  if (!document.querySelector(`link[href="${LEAFLET.css}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAFLET.css; document.head.appendChild(l); }
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = LEAFLET.js; s.onload = ok; s.onerror = () => erro(new Error('Não consegui abrir o mapa.')); document.head.appendChild(s); });
}

// ---------- robô ----------
function cartaoRobo(r) {
  const rb = r.robo || {}; const aj = r.ajustes || {};
  const nomes = { conectado: ['ok', 'Conectado'], qr: ['warn', 'Esperando leitura do QR code'], reconectando: ['warn', 'Reconectando…'], iniciando: ['warn', 'Iniciando…'], desconectado: ['bad', 'Desconectado'], erro: ['bad', 'Com erro'], desligado: ['bad', 'Desligado (PC da RUAH sem o sistema aberto)'] };
  const [cls, txt] = nomes[rb.estado] || ['info', rb.estado || '—'];
  const prox = rb.proximo_em && new Date(rb.proximo_em) > new Date() ? new Date(rb.proximo_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  const situacao = aj.pausado ? '<span class="pill bad">pausado</span>'
    : !r.horario ? `<span class="pill info">fora do horário (${aj.hora_inicio}h–${aj.hora_fim}h, seg a ${aj.sabado ? 'sáb' : 'sex'})</span>`
    : r.hoje >= aj.limite_dia ? '<span class="pill gold">limite do dia atingido</span>'
    : rb.estado === 'conectado' ? `<span class="pill ok">trabalhando${prox ? ` · próxima abordagem ${esc(prox)}` : ''}</span>` : '';
  return `<div class="card fg-robo" id="fg-robo"><div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap">
    <div class="fg-avatar" aria-hidden="true">TH</div>
    <div style="flex:1;min-width:240px"><b>TH-IA-GO CORRETOR</b> <span class="pill ${cls}">${esc(txt)}</span> ${situacao}
      <div class="small muted" style="margin-top:4px">${rb.numero ? `WhatsApp ${esc(tel(rb.numero))} · ` : ''}<b>${r.hoje}</b> de ${aj.limite_dia} abordagens hoje · ${r.fila} número(s) na fila · uma a cada ~${Math.round(aj.intervalo_s / 60 * 10) / 10} min</div>
      ${rb.erro ? `<div class="small" style="margin-top:4px"><span class="pill bad">${esc(rb.erro)}</span></div>` : ''}
      ${rb.estado === 'desligado' ? '<div class="small muted" style="margin-top:4px">O robô roda no PC da RUAH. Abra o "Sistema RUAH" pelo atalho da Área de Trabalho e mantenha o PC ligado.</div>' : ''}
      ${rb.estado === 'qr' && rb.qr ? `<div class="fg-qr"><img src="${esc(rb.qr)}" alt="QR code do WhatsApp" width="220" height="220"><div class="small"><b>Para conectar:</b><ol style="margin:6px 0;padding-left:18px"><li>Abra o WhatsApp do celular da RUAH</li><li>Toque em <b>⋮</b> → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b></li><li>Aponte a câmera para este QR code</li></ol><span class="muted">O código muda a cada 20 segundos; a tela atualiza sozinha.</span></div></div>` : ''}
    </div>
    ${veTudo() ? `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ${aj.pausado ? 'pri' : ''}" data-act="fg-pausa" data-p="${aj.pausado ? 0 : 1}">${aj.pausado ? 'Retomar robô' : 'Pausar robô'}</button><button class="btn sm" data-act="fg-ajustes">Ajustes e mensagem</button>${rb.estado === 'conectado' ? '<button class="btn sm" data-act="fg-cmd" data-c="desconectar">Desconectar WhatsApp</button>' : ''}</div>` : ''}
  </div></div>`;
}
ACT['fg-pausa'] = (el) => comBotao(el, async () => { await api('POST', '/api/fisguei/robo', { pausado: el.dataset.p === '1' }); toast(el.dataset.p === '1' ? 'Robô pausado' : 'Robô retomado'); rota(); });
ACT['fg-cmd'] = (el) => comBotao(el, async () => {
  if (!confirm('Desconectar o WhatsApp do robô? Vai precisar ler o QR code de novo.')) return;
  await api('POST', '/api/fisguei/robo/comando', { comando: el.dataset.c }); toast('Pedido enviado ao robô (em até 30 s).');
});
ACT['fg-ajustes'] = async () => {
  const r = await api('GET', '/api/fisguei/robo'); const a = r.ajustes;
  modal(`<h2>Robô TH-IA-GO · ajustes</h2><form data-form="fg-ajustes">
    <div class="grid g2"><label class="f">Abordagens novas por dia (máx. ${a.limite_max})<input name="limite_dia" type="number" min="1" max="${a.limite_max}" value="${a.limite_dia}"></label>
    <label class="f">Intervalo entre abordagens, em segundos (mín. ${a.intervalo_min_s})<input name="intervalo_s" type="number" min="${a.intervalo_min_s}" value="${a.intervalo_s}"></label>
    <label class="f">Começa às (hora)<input name="hora_inicio" type="number" min="7" max="20" value="${a.hora_inicio}"></label>
    <label class="f">Para às (hora)<input name="hora_fim" type="number" min="8" max="21" value="${a.hora_fim}"></label></div>
    <label class="chk"><input type="checkbox" name="sabado" ${a.sabado ? 'checked' : ''}> Trabalhar aos sábados (domingo nunca)</label>
    <label class="f">Mensagem de abordagem<textarea name="modelo" rows="9">${esc(a.modelo)}</textarea></label>
    <p class="small muted" style="margin:0">Use <b>{nome}</b>, <b>{endereco}</b>, <b>{bairro}</b>, <b>{tipo}</b> e <b>{valor}</b>. A mensagem precisa ensinar a responder <b>PARAR</b>.<br>Números novos no WhatsApp são bloqueados rápido quando mandam muitas mensagens para quem não os conhece: comece com poucas por dia e aumente aos poucos.</p>
    <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`);
};
FORM['fg-ajustes'] = async (f) => { await api('POST', '/api/fisguei/robo', formJSON(f)); fechaModal(); toast('Ajustes salvos'); rota(); };

// ---------- extensão ----------
function cartaoExtensao(r) {
  const ult = r.ultimoRecebimento ? new Date(r.ultimoRecebimento) : null;
  const ha = ult ? Math.round((Date.now() - ult.getTime()) / 60000) : null;
  return `<div class="card" style="margin-top:14px"><div class="row" style="gap:10px;flex-wrap:wrap">
    <div style="flex:1;min-width:240px"><b>Extensão "Fisguei → RUAH" no Chrome</b>
      <div class="small muted">Tudo que você abre no Fisgar (lista de anúncios, ficha e cada proprietário consultado) entra aqui sozinho. ${r.chave ? (ult ? `Último envio ${ha < 1 ? 'agora há pouco' : ha < 60 ? `há ${ha} min` : 'em ' + esc(ult.toLocaleString('pt-BR'))}.` : 'Ainda não chegou nada da extensão.') : '<b>Gere a chave para ligar a extensão.</b>'}</div></div>
    ${veTudo() ? `<button class="btn sm" data-act="fg-chave">${r.chave ? 'Gerar nova chave' : 'Gerar chave da extensão'}</button>` : ''}<button class="btn sm" data-act="fg-instalar">Como instalar</button></div></div>`;
}
ACT['fg-chave'] = (el) => comBotao(el, async () => {
  const c = await api('POST', '/api/fisguei/chave');
  modal(`<h2>Chave da extensão</h2><p>Cole esta chave na extensão (ícone do Fisguei no Chrome → <b>Chave</b>). Ela aparece só agora; se perder, gere outra.</p>
    <p><input class="mono" readonly value="${esc(c.chave)}" style="width:100%" id="fg-chave-txt"></p>
    <p class="small muted">Endereço do sistema para colocar na extensão: <b class="mono">${esc(location.origin)}</b></p>
    <div class="row"><span class="sp"></span><button class="btn" data-act="copiar" data-txt="${esc(c.chave)}">Copiar chave</button><button class="btn pri" data-fecha>Pronto</button></div>`);
  rota();
});
ACT['fg-instalar'] = () => modal(`<h2>Instalar a extensão no Chrome</h2>
  <ol><li>No Chrome, abra <b class="mono">chrome://extensions</b> e ligue o <b>Modo do desenvolvedor</b> (canto superior direito).</li>
  <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta <b class="mono">Área de Trabalho\\Sistema RUAH\\extensao-fisguei</b>.</li>
  <li>Clique no ícone de quebra-cabeça e fixe o <b>Fisguei → RUAH</b>.</li>
  <li>Clique no ícone do Fisguei, cole o endereço do sistema e a chave (botão <b>Gerar chave</b> nesta tela) e toque em <b>Salvar e testar</b>.</li>
  <li>Pronto: use o Fisgar normalmente. Cada proprietário que você consultar lá aparece aqui e entra na fila do robô.</li></ol>
  <p class="small muted">A extensão só lê as telas do painel do Fisgar que você abre; não clica em nada e não gasta créditos sozinha.</p>
  <div class="row"><span class="sp"></span><button class="btn pri" data-fecha>Entendi</button></div>`);

// ---------- lista ----------
async function telaFisguei(qs) {
  const filtro = qs.get('filtro') || '', q = qs.get('q') || '', vista = qs.get('vista') || 'lista', pag = +(qs.get('pagina') || 1);
  const params = new URLSearchParams({ filtro, q, pagina: pag });
  const [r, l, pd] = await Promise.all([api('GET', '/api/fisguei/resumo'), vista === 'lista' ? api('GET', '/api/fisguei?' + params) : Promise.resolve(null), api('GET', '/api/fisguei/pedidos')]);
  const n = (k) => r.porStatus[k] || 0;
  const link = (o) => '#/fisguei?' + new URLSearchParams({ filtro, q, vista, ...o }).toString();
  $('#main').innerHTML = `<div class="eyebrow">Imóveis da base</div><h1>Anúncios e proprietários (Fisguei)</h1>
  ${typeof capAbas === 'function' ? capAbas('fisguei') : ''}
  <p class="lead">Os anúncios e proprietários que vocês abrem no Fisgar viram a base da RUAH. Quando chega o telefone de um possível dono, o robô <b>TH-IA-GO CORRETOR</b> chama no WhatsApp perguntando, com educação, se a pessoa é a proprietária. Quem responde SIM vai direto para o Radar com o corretor.</p>
  ${cartaoRobo(r)}${cartaoBusca(pd)}${cartaoExtensao(r)}
  <div class="grid g4" style="margin-top:14px">
    <div class="card kpi"><div class="n">${r.anuncios}</div><div class="l">Anúncios na base</div></div>
    <div class="card kpi"><div class="n">${r.comDono}</div><div class="l">Com proprietário consultado (${r.pessoas} pessoas)</div></div>
    <div class="card kpi"><div class="n">${r.enviadas}</div><div class="l">Abordagens feitas · ${r.responderam} resposta(s)</div></div>
    <div class="card kpi"><div class="n">${n('confirmado') + n('captado')}</div><div class="l">Donos confirmados</div></div>
  </div>
  ${r.precisaCorretor ? `<div class="banner warn" style="margin-top:14px"><b>${r.precisaCorretor}</b> endereço(s) com resposta esperando o corretor. <a href="${link({ filtro: 'precisa', pagina: 1 })}">Ver agora</a></div>` : ''}
  <div class="tabs" style="margin:16px 0 10px">${[['', 'Todos'], ['precisa', 'Precisa do corretor'], ['com_dono', 'Com proprietário'], ['abordando', 'Robô abordando'], ['confirmado', 'Dono confirmou'], ['sem_dono', 'Sem proprietário'], ['particular', 'Particulares'], ['sem_interesse', 'Sem interesse'], ['captado', 'No Radar']]
      .map(([k, t]) => `<a href="${link({ filtro: k, pagina: 1 })}" class="${filtro === k ? 'on' : ''}">${t}</a>`).join('')}</div>
  <div class="row" style="margin:0 0 12px;gap:8px;flex-wrap:wrap">
    <form data-form="fg-busca" class="row" style="gap:6px"><input name="q" value="${esc(q)}" placeholder="Rua, bairro, CEP ou imobiliária" style="min-width:280px"><button class="btn sm">Buscar</button></form><span class="sp"></span>
    <div class="row" style="gap:4px"><a class="btn sm ${vista === 'lista' ? 'pri' : ''}" href="${link({ vista: 'lista' })}">Lista</a><a class="btn sm ${vista === 'mapa' ? 'pri' : ''}" href="${link({ vista: 'mapa' })}">Mapa</a></div>
  </div>
  <div id="fg-conteudo"></div>`;
  FORM['fg-busca'] = async (f) => navega(link({ q: formJSON(f).q, pagina: 1 }));
  if (vista === 'mapa') await mapaFisguei(filtro, q); else listaFisguei(l, link);
  // atualiza o cartão do robô (QR code muda a cada 20 s)
  poll = setInterval(async () => {
    if (!location.hash.startsWith('#/fisguei') || location.hash.match(/^#\/fisguei\/\d/)) return;
    try { const rr = await api('GET', '/api/fisguei/resumo'); const el = $('#fg-robo'); if (el) el.outerHTML = cartaoRobo(rr); } catch {}
  }, 10000);
}
function listaFisguei(l, link) {
  const c = $('#fg-conteudo');
  if (!l.itens.length) { c.innerHTML = '<div class="empty">Nada aqui ainda. Abra a Base de Anúncios no Fisgar com a extensão ligada e os anúncios aparecem nesta lista.</div>'; return; }
  c.innerHTML = `<div class="card tbl"><table><thead><tr><th></th><th>Imóvel</th><th>Endereço</th><th class="num">Valor</th><th>Anunciante</th><th>Proprietários</th><th>Situação</th></tr></thead><tbody>
    ${l.itens.map((a) => `<tr class="click" data-act="ir" data-href="#/fisguei/${a.id}" style="cursor:pointer">
      <td style="width:64px">${a.foto ? `<img src="${esc(a.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:64px;height:48px;object-fit:cover;border-radius:6px">` : ''}</td>
      <td><span class="mono" style="color:var(--gold)">${esc(a.ref)}</span> <b>${esc(a.tipo || 'Imóvel')}</b><br><span class="muted small">${[a.quartos ? a.quartos + ' qto' : '', a.suites ? a.suites + ' suíte' : '', a.vagas ? a.vagas + ' vaga' : '', a.area_util ? a.area_util + ' m²' : ''].filter(Boolean).join(' · ')}</span></td>
      <td>${esc(fgEnd(a))}${a.complemento ? ' · ' + esc(a.complemento) : ''}<br><span class="muted small">${esc([a.bairro, a.cep].filter(Boolean).join(' · '))}</span></td>
      <td class="num" style="white-space:nowrap">${brl(a.valor)}</td>
      <td class="small">${esc(a.anunciante_nome || '—')}<br>${a.anunciante_tipo === 'particular' ? '<span class="pill ok">particular</span>' : a.anunciante_tipo === 'imobiliaria' ? '<span class="pill info">imobiliária</span>' : ''}</td>
      <td class="small">${a.consultadas ? `<b>${a.consultadas}</b> consultado(s)` : a.pessoas ? `${a.pessoas} na lista, nenhum consultado` : '<span class="muted">—</span>'}${a.na_fila ? `<br><span class="muted">${a.na_fila} número(s) na fila</span>` : ''}${a.enviadas ? `<br><span class="muted">${a.enviadas} mensagem(ns)</span>` : ''}</td>
      <td>${fgPill(a.status)}${a.pausado ? ' <span class="pill bad">pausado</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:10px"><span class="muted small">${l.total} anúncio(s) · página ${l.pagina} de ${l.paginas}</span><span class="sp"></span>
      ${l.pagina > 1 ? `<a class="btn sm" href="${link({ pagina: l.pagina - 1 })}">← Anterior</a>` : ''}${l.pagina < l.paginas ? `<a class="btn sm" href="${link({ pagina: l.pagina + 1 })}">Próxima →</a>` : ''}</div>`;
}
async function mapaFisguei(filtro, q) {
  const c = $('#fg-conteudo');
  c.innerHTML = '<div id="fg-mapa" class="fg-mapa"></div><p class="small muted">Até 3.000 anúncios com localização. Cores: <span class="pill ok">dono confirmou / particular</span> <span class="pill warn">robô abordando</span> <span class="pill bad">precisa do corretor</span> <span class="pill info">demais</span></p>';
  const [pts] = await Promise.all([api('GET', '/api/fisguei/mapa?' + new URLSearchParams({ filtro, q })), carregaLeaflet()]);
  const m = L.map('fg-mapa').setView([-22.9056, -47.0608], 12);
  camadaMapa(m);
  const cor = (p) => (['confirmado', 'captado'].includes(p.status) || p.anunciante_tipo === 'particular' ? '#2e7d4f' : p.status === 'respondeu' ? '#c0392b' : p.status === 'abordando' ? '#c98a1a' : '#3b6ea8');
  const b = [];
  for (const p of pts) {
    const mk = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 1.5, fillColor: cor(p), fillOpacity: 0.9 }).addTo(m);
    const div = document.createElement('div');
    div.innerHTML = `<b>${esc(p.tipo || 'Imóvel')}</b> · ${brl(p.valor)}<br>${esc(fgEnd(p))}<br><span style="color:#666">${esc(p.bairro || '')}</span><br><a href="#/fisguei/${p.id}">Abrir ${fgRef(p.id)}</a>`;
    mk.bindPopup(div); b.push([p.lat, p.lon]);
  }
  if (b.length) m.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
  if (!pts.length) c.insertAdjacentHTML('beforeend', '<div class="empty">Nenhum anúncio com localização neste filtro.</div>');
}

// ---------- ficha ----------
async function telaFisgueiAnuncio(id, aba) {
  const d = await api('GET', '/api/fisguei/' + id);
  const a = d.anuncio;
  const temGeo = a.lat && a.lon;
  const aqui = (t) => `#/fisguei/${id}${t === 'dados' ? '' : '/' + t}`;
  const vitrine = { apartamentos: 'Apartamentos', casas: 'Casas', terrenos: 'Terrenos', comerciais: 'Salas e barracões' }[a.categoria];
  $('#main').innerHTML = `<a class="btn sm" href="#/fisguei">← Radar + Fisguei</a>${vitrine ? ` <a class="btn sm" href="#/${a.categoria}">${vitrine}</a>` : ''}
  <div class="row" style="margin:12px 0 6px;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:260px">
    <div class="eyebrow">${esc(a.ref)} · Fisgar #${esc(a.fisgar_id)}${a.portal ? ' · ' + esc(a.portal) : ''}</div>
    <h1 style="margin:2px 0">${esc(a.subtipo || a.tipo || 'Imóvel')} na ${esc(fgEnd(a))}</h1>
    <div class="muted">${esc([a.complemento, a.bairro, a.cidade, a.cep].filter(Boolean).join(' · '))}</div></div>
    <div>${fgPill(a.status)}${a.pausado ? ' <span class="pill bad">robô pausado aqui</span>' : ''}</div></div>
  <div class="row" style="gap:6px;margin:10px 0 14px;flex-wrap:wrap">
    ${d.oportunidade ? `<a class="btn pri" href="#/radar/${d.oportunidade.id}">Abrir no Radar (OP-${String(d.oportunidade.id).padStart(4, '0')})</a>` : `<button class="btn pri" data-act="fg-captar" data-id="${id}">Levar para o Radar</button>`}
    ${d.imovel ? `<a class="btn" href="#/imoveis/${d.imovel.id}">Imóvel na carteira (${esc(d.imovel.codigo)})</a>` : `<button class="btn" data-act="fg-importar" data-id="${id}" title="Leva para a carteira com os dados do anúncio e o melhor proprietário encontrado (sem as fotos de terceiros)">Levar para a carteira</button>`}
    ${a.logradouro && a.numero ? `<button class="btn" data-act="fg-buscar" data-id="${id}" title="Busca o dono no Fisgar (gasta crédito); quando volta, o imóvel entra na carteira">Localizar proprietário</button>` : ''}
    <button class="btn" data-act="fg-pausar" data-id="${id}" data-p="${a.pausado ? 0 : 1}">${a.pausado ? 'Retomar robô neste endereço' : 'Pausar robô neste endereço'}</button>
    ${a.status !== 'descartado' ? `<button class="btn" data-act="fg-descartar" data-id="${id}">Descartar</button>` : ''}
  </div>
  <div id="fg-fachada"></div>
  ${linhaPedidos(d.pedidos)}
  <div class="tabs">${[['dados', 'Detalhes'], ['donos', `Proprietários (${d.pessoas.length})`], ['mapa', 'Mapa'], ['rua', 'Street View']].map(([k, t]) => `<a href="${aqui(k)}" class="${aba === k ? 'on' : ''}">${t}</a>`).join('')}</div>
  <div id="fg-aba"></div>`;
  if (aba === 'dados' && typeof fgFachada === 'function') fgFachada(id, a);
  const el = $('#fg-aba');
  if (aba === 'mapa') {
    el.innerHTML = temGeo ? `<div class="fg-frame"><iframe title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(a.lat + ',' + a.lon)}&z=17&hl=pt-BR&output=embed"></iframe></div>
      <p class="small"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.lat + ',' + a.lon)}" target="_blank" rel="noopener">Abrir no Google Maps</a></p>`
      : '<div class="empty">Este anúncio veio sem localização.</div>';
  } else if (aba === 'rua') {
    el.innerHTML = temGeo ? `<div class="fg-frame"><iframe title="Street View" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?layer=c&cbll=${encodeURIComponent(a.lat + ',' + a.lon)}&cbp=11,0,0,0,0&hl=pt-BR&output=svembed"></iframe></div>
      <p class="small muted">Se a imagem não aparecer, o Google não tem Street View exatamente neste ponto. <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(a.lat + ',' + a.lon)}" target="_blank" rel="noopener">Abrir o Street View no Google</a></p>`
      : '<div class="empty">Este anúncio veio sem localização.</div>';
  } else if (aba === 'donos') {
    el.innerHTML = d.pessoas.length ? d.pessoas.map((p) => cartaoPessoa(p)).join('') + (d.previa ? `<details class="card" style="margin-top:12px"><summary class="small"><b>Mensagem que o robô manda</b></summary><pre class="small" style="white-space:pre-wrap;margin:8px 0 0">${esc(d.previa)}</pre></details>` : '')
      : '<div class="empty">Ninguém consultado ainda. Abra este anúncio no Fisgar, vá em <b>Proprietários</b> e clique em <b>Consultar</b> em cada pessoa: os telefones chegam aqui sozinhos e o robô começa.</div>';
  } else {
    const ficha = [['Valor', brl(a.valor)], ['Condomínio', a.valor_condominio ? brl(a.valor_condominio) : '—'], ['IPTU', a.iptu ? brl(a.iptu) : '—'], ['Quartos', a.quartos ?? '—'], ['Suítes', a.suites ?? '—'], ['Banheiros', a.banheiros ?? '—'], ['Vagas', a.vagas ?? '—'],
      ['Área útil', a.area_util ? a.area_util + ' m²' : '—'], ['Área total', a.area_total ? a.area_total + ' m²' : '—'], ['Finalidade', a.finalidade || '—'], ['Anunciante', a.anunciante_nome || '—'], ['Tipo de anunciante', { particular: 'Particular', imobiliaria: 'Imobiliária (profissional)' }[a.anunciante_tipo] || '—'], ['Publicado em', a.publicado_em ? new Date(a.publicado_em + 'T12:00').toLocaleDateString('pt-BR') : '—'], ['Entrou no Fisguei', dataBR(a.criado_em)]];
    el.innerHTML = `<div class="grid g2"><div class="card"><div class="tbl"><table>${ficha.map(([k, v]) => `<tr><th style="width:42%">${k}</th><td>${esc(v)}</td></tr>`).join('')}</table></div></div>
      <div>${a.fotos.length ? `<div class="fg-fotos">${a.fotos.slice(0, 12).map((u, i) => `<img src="${esc(u)}" alt="Foto ${i + 1}" loading="lazy" referrerpolicy="no-referrer" data-act="fg-foto" data-i="${i}">`).join('')}</div>` : '<div class="empty">Sem fotos.</div>'}</div></div>`;
    window.__fgFotos = a.fotos;
  }
}
ACT['fg-foto'] = (el) => { const f = window.__fgFotos || []; if (!f.length) return; if (typeof abrirGaleria === 'function') abrirGaleria(f, +el.dataset.i, ''); else window.open(f[+el.dataset.i], '_blank', 'noopener'); };
function cartaoPessoa(p) {
  const tels = p.contatos.filter((c) => c.tipo === 'tel' || c.tipo === 'fixo'), mails = p.contatos.filter((c) => c.tipo === 'email');
  return `<div class="card" style="margin-bottom:12px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:220px"><b>${esc(p.nome)}</b> ${fgPill(p.status, PES_ST)}<br><span class="small muted">${esc([p.relacao, p.unidade, p.idade ? p.idade + ' anos' : ''].filter(Boolean).join(' · '))}</span></div>
    <div class="row" style="gap:4px;flex-wrap:wrap">${['confirmou', 'negou', 'sem_interesse', 'parar'].map((s) => `<button class="btn sm" data-act="fg-pessoa" data-id="${p.id}" data-s="${s}" ${p.status === s ? 'disabled' : ''}>${{ confirmou: 'É o dono', negou: 'Não é o dono', sem_interesse: 'Sem interesse', parar: 'Não contatar' }[s]}</button>`).join('')}</div></div>
    ${!p.consultado ? `<p class="small muted row" style="margin:8px 0 0;gap:8px">Ainda não consultado no Fisgar (sem telefones). <button class="btn sm" data-act="fg-consultar" data-id="${p.id}">Consultar no Fisgar · 1 crédito</button></p>` : `<div class="row small" style="gap:6px;flex-wrap:wrap;margin-top:8px">${tels.map((c) => `<span class="pill ${(ENV_ST[c.envio] || ['', 'info'])[1]}" title="${esc(c.erro || '')}">${c.tipo === 'fixo' ? '☎' : '📱'} ${esc(tel(c.valor))} · ${esc((ENV_ST[c.envio] || [c.envio])[0])}</span>`).join('')}${mails.map((c) => `<span class="pill info">✉ ${esc(c.valor)}</span>`).join('')}</div>`}
    ${p.mensagens.length ? `<div class="fg-chat">${p.mensagens.map((m) => `<div class="fg-msg ${m.direcao}"><div>${esc(m.texto)}</div><span>${esc(m.autor || '')} · ${dataBR(m.criado_em)}${m.direcao === 'saida' && m.status && m.status !== 'enviada' ? ' · ' + esc(m.status) : ''}</span></div>`).join('')}</div>
      <form data-form="fg-msg" data-id="${p.id}" class="row" style="gap:6px;margin-top:8px"><input name="texto" placeholder="Responder pelo WhatsApp do robô…" style="flex:1" required maxlength="2000"><button class="btn sm pri">Enviar</button></form>` : ''}
  </div>`;
}
ACT['fg-captar'] = (el) => comBotao(el, async () => { const r = await api('POST', `/api/fisguei/${el.dataset.id}/captar`); toast('Levado para o Radar'); navega('#/radar/' + r.oportunidade_id); });
ACT['fg-pausar'] = (el) => comBotao(el, async () => { await api('POST', `/api/fisguei/${el.dataset.id}/pausar`, { pausado: el.dataset.p === '1' }); rota(); });
ACT['fg-descartar'] = (el) => comBotao(el, async () => { if (!confirm('Descartar este endereço? O robô para de chamar as pessoas dele.')) return; await api('POST', `/api/fisguei/${el.dataset.id}/descartar`); rota(); });
ACT['fg-pessoa'] = (el) => comBotao(el, async () => {
  if (el.dataset.s === 'parar' && !confirm('Colocar os telefones desta pessoa na lista não contatar?')) return;
  await api('POST', `/api/fisguei/pessoas/${el.dataset.id}/status`, { status: el.dataset.s }); toast('Atualizado'); rota();
});
FORM['fg-msg'] = async (f) => { await api('POST', `/api/fisguei/pessoas/${f.dataset.id}/mensagem`, formJSON(f)); toast('Mensagem na fila do robô (sai em até 1 minuto)'); rota(); };

// ---------- robô "Buscar dados" no Fisgar ----------
const PED_ST = { fila: ['na fila do Fisgar', 'info'], buscando: ['buscando no Fisgar…', 'warn'], concluido: ['dados coletados', 'ok'], escolher: ['escolher quem consultar', 'gold'], sem_resultado: ['Fisgar sem dono', 'gold'], erro: ['erro', 'bad'] };
function cartaoBusca(pd) {
  const ext = pd.extensao || {}; const lim = pd.limites || {};
  const estado = !ext.vivo ? '<span class="pill bad">extensão sem contato · abra o Chrome com o Fisgar</span>' : !ext.fisgar_aberto ? '<span class="pill warn">abra o Fisgar numa aba do Chrome</span>' : '<span class="pill ok">pronto: Fisgar aberto</span>';
  return `<div class="card" style="margin-top:14px"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-start">
    <div class="fg-avatar" aria-hidden="true" style="background:var(--info)">🔎</div>
    <div style="flex:1;min-width:240px"><b>Busca de proprietários (Fisgar)</b> ${estado}
      <div class="small muted" style="margin-top:4px"><b>${pd.fila}</b> endereço(s) na fila${pd.buscando ? ' · 1 buscando agora' : ''} · <b>${pd.creditos_hoje}</b> de ${lim.creditos_dia} créditos hoje · ${pd.creditos_mes} no mês (estimado) · consulta sozinho até ${lim.max_consultas} dono(s) por endereço${pd.escolher ? ` · <b>${pd.escolher}</b> esperando você escolher quem consultar` : ''}</div>
      ${pd.ultimos.length ? `<div class="small" style="margin-top:6px">${pd.ultimos.slice(0, 4).map((u) => `<a href="#/fisguei/${u.anuncio_id}" style="margin-right:10px">${esc([u.logradouro, u.numero].filter(Boolean).join(', '))}</a>${fgPill(u.status, PED_ST)}${u.consultadas ? ` <span class="muted">${u.consultadas} consultado(s)</span>` : ''}`).join('<br>')}</div>` : '<div class="small muted" style="margin-top:6px">Nas vitrines da base, clique em <b>Localizar proprietário</b> (ou selecione vários).</div>'}
    </div>
    ${veTudo() ? '<button class="btn sm" data-act="fg-limites">Limite de créditos</button>' : ''}</div></div>`;
}
function linhaPedidos(peds) {
  if (!peds || !peds.length) return '';
  const u = peds[0];
  const txt = u.status === 'concluido' ? `${u.pessoas || 0} pessoa(s) no endereço, ${u.consultadas || 0} consultada(s)` : u.status === 'escolher' ? `${u.pessoas} pessoas no endereço (prédio ou condomínio): escolha abaixo quem consultar` : u.status === 'sem_resultado' ? 'O Fisgar não achou dono pelo IPTU neste endereço' : u.erro || '';
  return `<div class="banner ${u.status === 'erro' ? 'warn' : 'info'}" style="margin:0 0 12px"><b>Robô Fisgar:</b> ${fgPill(u.status, PED_ST)} ${esc(txt)}${u.creditos ? ` · ${u.creditos} crédito(s)` : ''}${u.status === 'erro' && u.erro ? '' : ''}</div>`;
}
ACT['fg-limites'] = async () => {
  const l = (await api('GET', '/api/fisguei/pedidos')).limites;
  modal(`<h2>Busca de proprietários · créditos</h2><form data-form="fg-limites">
    <div class="grid g2"><label class="f">Créditos do Fisgar por dia (máx. ${l.creditos_max})<input name="creditos_dia" type="number" min="1" max="${l.creditos_max}" value="${l.creditos_dia}"></label>
    <label class="f">Consultar sozinho até quantos donos por endereço (máx. ${l.consultas_max})<input name="max_consultas" type="number" min="0" max="${l.consultas_max}" value="${l.max_consultas}"></label></div>
    <p class="small muted" style="margin:0">O plano tem 2.200 créditos por mês (cerca de 70 por dia). Cada busca de endereço gasta 1 e cada pessoa consultada gasta 1 — a não ser que alguém do plano já tenha consultado antes. Endereço com mais possíveis donos que o limite (prédio, condomínio) espera você escolher quem consultar.</p>
    <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`);
};
FORM['fg-limites'] = async (f) => { await api('POST', '/api/fisguei/pedidos/limites', formJSON(f)); fechaModal(); toast('Limite salvo'); rota(); };
ACT['fg-buscar'] = (el) => comBotao(el, async () => { const r = await api('POST', `/api/fisguei/${el.dataset.id}/buscar`); toast(r.ja ? 'Já está na fila do Fisgar' : 'Na fila: quando o Fisgar devolver o dono, o imóvel entra na carteira (precisa do Fisgar aberto no Chrome)'); rota(); });
ACT['fg-consultar'] = (el) => comBotao(el, async () => { await api('POST', `/api/fisguei/pessoas/${el.dataset.id}/consultar`); toast('Na fila do robô (1 crédito)'); rota(); });
ACT['fg-importar'] = (el) => comBotao(el, async () => {
  if (!confirm('Levar este imóvel para a carteira? Os dados do anúncio e o melhor proprietário encontrado vão junto. As fotos do anúncio original NÃO são copiadas.')) return;
  const r = await api('POST', `/api/fisguei/${el.dataset.id}/importar`); toast(r.ja ? `Já estava na carteira (${r.codigo})` : `Imóvel ${r.codigo} criado`); navega('#/imoveis/' + r.id);
});

// No Radar: coluna "Fisgar" da lista e cartão na ficha da oportunidade
async function fgDecoraRadar() {
  const cels = $$('td.fg-op'); if (!cels.length) return;
  let mapa = {};
  try { mapa = await api('GET', '/api/fisguei/radar?ids=' + cels.map((c) => c.dataset.op).join(',')); } catch { return; }
  for (const c of cels) {
    const m = mapa[c.dataset.op];
    c.innerHTML = m ? `<a href="#/fisguei/${m.id}" class="small">${fgPill(m.pedido || m.status, m.pedido ? PED_ST : FG_ST)}${m.consultadas ? `<br><span class="muted">${m.consultadas} dono(s) com telefone</span>` : ''}</a>`
      : c.dataset.end === '1' ? `<button class="btn sm" data-act="fg-buscar-op" data-id="${c.dataset.op}" title="Busca o dono no Fisgar (gasta crédito)">Localizar dono</button>` : '<span class="muted small">sem nº</span>';
  }
}
async function fgCartaoOp() {
  const el = $('#op-fisgar'); if (!el) return;
  const id = el.dataset.op;
  let m = null; try { m = (await api('GET', '/api/fisguei/radar?ids=' + id))[id]; } catch {}
  el.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="row" style="gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><b>Dono pelo Fisgar</b> ${m ? fgPill(m.pedido || m.status, m.pedido ? PED_ST : FG_ST) : ''}
    <div class="small muted">${m ? `${m.pessoas} pessoa(s) ligadas ao endereço, ${m.consultadas} com telefone. O robô TH-IA-GO chama os celulares no WhatsApp.` : el.dataset.end === '1' ? 'O robô busca no Fisgar quem é o dono deste endereço (gasta crédito) e traz os telefones para o Fisguei.' : 'Precisa de rua e número para buscar no Fisgar.'}</div></div>
    ${m ? `<a class="btn" href="#/fisguei/${m.id}">Abrir no Fisguei (${esc(m.ref)})</a>` : ''}${el.dataset.end === '1' && (!m || !['fila', 'buscando'].includes(m.pedido)) ? `<button class="btn pri" data-act="fg-buscar-op" data-id="${id}">${m ? 'Buscar de novo' : 'Localizar proprietário'}</button>` : ''}</div></div>`;
}
ACT['fg-buscar-op'] = (el) => comBotao(el, async () => {
  const r = await api('POST', '/api/fisguei/buscar', { oportunidade_ids: [el.dataset.id] });
  if (r.sem_endereco) throw new Error('Este anúncio não tem rua e número.');
  toast('Na fila do robô: a busca acontece com o Fisgar aberto no Chrome');
  if ($('#op-fisgar')) fgCartaoOp(); else fgDecoraRadar();
});
ACT['fg-buscar-lista'] = (el) => comBotao(el, async () => {
  const ids = $$('td.fg-op').filter((c) => c.dataset.end === '1' && c.querySelector('[data-act="fg-buscar-op"]')).map((c) => c.dataset.op);
  if (!ids.length) throw new Error('Nenhum anúncio desta lista com rua e número para buscar.');
  const pd = await api('GET', '/api/fisguei/pedidos');
  if (!confirm(`Colocar ${ids.length} endereço(s) na fila do robô do Fisgar?\n\nGasta cerca de ${ids.length} a ${ids.length * (1 + pd.limites.max_consultas)} créditos. O robô respeita o limite de ${pd.limites.creditos_dia} por dia e continua nos dias seguintes.`)) return;
  const r = await api('POST', '/api/fisguei/buscar', { oportunidade_ids: ids });
  toast(`${r.criados} endereço(s) na fila do Fisgar`); fgDecoraRadar();
});
