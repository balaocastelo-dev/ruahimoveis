/* Mensagens internas. Um único long polling pertence ao shell e atende todas as telas. */
const CHAT = { caixa: null, cursor: 0, sessao: 0, controle: null, inicio: null, vista: null, audio: null };
const chatTitulo = (c) => c.tipo === 'sala' ? c.titulo : c.participantes.filter((p) => p.usuario_id !== ME.id).map((p) => p.nome).join(', ');
const chatAvatar = (p) => p?.foto ? `<img class="chat-avatar" src="${esc(p.foto)}" alt="${esc(p.nome)}">`
  : `<span class="chat-avatar" aria-hidden="true">${esc(p?.iniciais || '☷')}</span>`;
function chatContador(n) {
  const b = $('#chat-contador'), sino = $('#chat-sino');
  if (b) { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }
  if (sino) sino.setAttribute('aria-label', `Mensagens: ${n} não lidas`);
  document.title = (n ? `(${n}) ` : '') + MARCA.sistema + ' · ' + MARCA.cliente;
}
function chatPara() {
  CHAT.sessao++; CHAT.controle?.abort(); CHAT.controle = null; CHAT.inicio = null; CHAT.caixa = null; CHAT.vista = null;
  chatContador(0);
}
function chatSom() {
  const a = CHAT.audio; if (!a || a.state !== 'running') return;
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.value = 660; g.gain.setValueAtTime(0.045, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.16);
  o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.17);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}
document.addEventListener('pointerdown', () => {
  if (!ME) return;
  try { CHAT.audio ||= new (window.AudioContext || window.webkitAudioContext)(); CHAT.audio.resume().catch(() => {}); } catch {}
});
async function chatCaixa() {
  const sessao = CHAT.sessao, d = await api('GET', '/api/chat/caixa');
  if (sessao !== CHAT.sessao || !ME) return null;
  CHAT.caixa = d; chatContador(d.nao_lidas_total); chatLista(); return d;
}
function chatInicia() {
  if (CHAT.inicio) return CHAT.inicio;
  const sessao = CHAT.sessao;
  CHAT.inicio = (async () => {
    const d = await chatCaixa(); if (!d || sessao !== CHAT.sessao) return;
    CHAT.cursor = d.ate;
    chatEscuta(sessao);
  })().catch(() => { if (sessao === CHAT.sessao) { CHAT.inicio = null; setTimeout(() => { if (ME && sessao === CHAT.sessao) chatInicia(); }, 5000); } });
  return CHAT.inicio;
}
async function chatEscuta(sessao) {
  let falhas = 0;
  while (ME && sessao === CHAT.sessao) {
    const controle = new AbortController(); CHAT.controle = controle;
    try {
      const r = await fetch(`/api/chat/novidades?desde=${CHAT.cursor}`, { credentials: 'same-origin', signal: controle.signal });
      if (sessao !== CHAT.sessao) return;
      if (r.status === 401) { ME = null; telaLogin(); return; }
      if (!r.ok) throw new Error('Conexão interrompida');
      const d = await r.json(); if (sessao !== CHAT.sessao) return;
      CHAT.cursor = d.ate; falhas = 0;
      for (const m of d.mensagens) {
        if (m.de_agente && typeof window.jg3dChatBalao === 'function') window.jg3dChatBalao(m.de_agente, m.texto);
        const c = CHAT.caixa?.conversas.find((c) => c.id === m.conversa_id);
        const aberta = !document.hidden && location.hash === `#/chat/${m.conversa_id}`;
        if (m.de_usuario !== ME.id && !aberta && !c?.silenciado) {
          toast(`${m.remetente.nome}: ${m.texto.slice(0, 120)}`); chatSom();
        }
      }
      chatContador(d.nao_lidas_total);
      await chatAtualizaConversa();
      await chatCaixa();
    } catch (e) {
      if (controle.signal.aborted || sessao !== CHAT.sessao) return;
      const s = $('#chat-conexao'); if (s) s.textContent = 'Reconectando…';
      await new Promise((r) => setTimeout(r, Math.min(15000, 1000 * 2 ** Math.min(++falhas, 4))));
    }
  }
}
function chatLista() {
  const box = $('#chat-lista'); if (!box || !CHAT.caixa) return;
  const busca = ($('#chat-busca')?.value || '').toLocaleLowerCase('pt-BR');
  box.innerHTML = CHAT.caixa.conversas.filter((c) => `${chatTitulo(c)} ${c.ultima_texto || ''}`.toLocaleLowerCase('pt-BR').includes(busca)).map((c) => {
    const p = c.participantes.find((p) => p.usuario_id !== ME.id);
    return `<a class="chat-item ${location.hash === '#/chat/' + c.id ? 'on' : ''}" href="#/chat/${c.id}">
      ${c.tipo === 'sala' ? chatAvatar(null) : chatAvatar(p)}<span class="chat-item-texto"><b>${esc(chatTitulo(c))}</b>
      <span>${esc(c.ultima_texto || 'Comece a conversa')}</span></span><span class="chat-item-fim"><time>${esc(dataBR(c.ultima_em || c.criado_em))}</time>
      ${c.nao_lidas ? `<b class="chat-nao-lidas">${c.nao_lidas}</b>` : ''}</span></a>`;
  }).join('') || '<p class="empty">Nenhuma conversa por aqui.</p>';
}
async function telaChat(id) {
  const seq = rotaSeq;
  await chatInicia();
  if (!CHAT.caixa) await chatCaixa();
  if (seq !== rotaSeq || !ME) return;
  CHAT.vista = id ? { id, mensagens: new Map(), participantes: [], mais: false, carregou: false, busy: false } : null;
  $('#main').innerHTML = `<div class="chat-topo"><h1>Mensagens</h1><span class="muted small" id="chat-conexao">Equipe e robôs da ${esc(MARCA.cliente)}</span></div>
    <div class="chat-layout ${id ? 'chat-aberto' : ''}"><aside class="chat-caixa" aria-label="Caixa de entrada">
      <div class="chat-ferramentas"><button class="btn pri" data-act="chat-nova" data-tipo="direta">Nova conversa</button><button class="btn" data-act="chat-nova" data-tipo="sala">Nova sala de reunião</button>
      <label class="f">Buscar<input class="inp" id="chat-busca" type="search" placeholder="Nome ou mensagem"></label></div><div id="chat-lista"></div></aside>
      <section class="chat-conversa" aria-label="Conversa">${id ? `<header class="chat-cab"><a class="btn sm chat-voltar" href="#/chat">← Voltar</a><div id="chat-cab-nome">Carregando…</div></header>
      <div class="chat-historico" id="chat-historico" role="log" aria-label="Mensagens"><button class="btn sm" id="chat-antigas" data-act="chat-antigas" hidden>Mensagens anteriores</button><div id="chat-mensagens"></div></div>
      <div id="chat-digitando" class="small muted" aria-live="polite"></div>
      <form class="chat-envio" data-form="chat-enviar"><label class="f"><span class="sr-only">Mensagem</span><textarea class="inp" name="texto" id="chat-texto" rows="2" maxlength="4000" required placeholder="Escreva uma mensagem…"></textarea></label><button class="btn pri" type="submit">Enviar</button></form>
      <div class="chat-dica small muted">Enter envia · Shift+Enter quebra linha · Para um robô: tarefa: descreva o que fazer no PC</div>` : '<div class="empty">Selecione uma conversa ou comece uma nova.</div>'}</section></div>`;
  $('#chat-busca').addEventListener('input', chatLista); chatLista();
  $('#chat-texto')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!e.target.form.querySelector('button').disabled) e.target.form.requestSubmit(); }
  });
  if (id) { await chatAtualizaConversa(); await chatCaixa(); }
}
async function chatAtualizaConversa() {
  const v = CHAT.vista;
  if (!v || location.hash !== `#/chat/${v.id}` || !$('#chat-mensagens') || document.hidden) return;
  if (v.busy) { v.repetir = true; return; }
  v.busy = true;
  try {
    let mais;
    do {
      v.repetir = false;
      const desde = v.carregou ? Math.max(0, ...v.mensagens.keys()) : 0;
      const d = await api('GET', `/api/chat/conversas/${v.id}${desde ? '?desde=' + desde : ''}`);
      if (CHAT.vista !== v || location.hash !== `#/chat/${v.id}`) return;
      d.mensagens.forEach((m) => v.mensagens.set(m.id, m)); v.participantes = d.participantes;
      if (!v.carregou) v.mais = d.mais;
      mais = !!desde && d.mais; v.carregou = true;
      $('#chat-cab-nome').innerHTML = `<b>${esc(chatTitulo({ ...d.conversa, participantes: d.participantes }))}</b><div class="small muted">${esc(d.participantes.map((p) => p.nome).join(', '))}</div>`;
      $('#chat-digitando').textContent = d.digitando.length ? d.participantes.filter((p) => d.digitando.includes(p.agente)).map((p) => p.nome).join(', ') + ' digitando… (aguardando o cérebro)' : '';
      $('#chat-conexao').textContent = 'Conectado'; chatContador(d.nao_lidas_total); chatDesenha(v);
    } while (mais || v.repetir);
  } finally { v.busy = false; }
}
function chatDesenha(v, antigas = false) {
  const box = $('#chat-mensagens'), hist = $('#chat-historico'); if (!box || CHAT.vista !== v) return;
  const altura = hist.scrollHeight, topo = hist.scrollTop, fim = altura - topo - hist.clientHeight < 100;
  const html = [...v.mensagens.values()].sort((a, b) => a.id - b.id).map((m) => {
    const minha = m.de_usuario === ME.id;
    const vistos = v.participantes.filter((p) => p.usuario_id && p.usuario_id !== ME.id && p.lido_ate >= m.id);
    return `<article class="chat-balao ${minha ? 'minha' : ''}"><b>${esc(m.remetente.nome)}</b><div class="chat-texto">${esc(m.texto)}</div>
      <small>${esc(dataBR(m.criado_em))}${minha && vistos.length ? ' · visto por ' + esc(vistos.map((p) => p.nome).join(', ')) : ''}</small></article>`;
  }).join('') || '<p class="empty">Mande a primeira mensagem.</p>';
  if (box.innerHTML !== html) { box.innerHTML = html; hist.scrollTop = antigas ? topo + hist.scrollHeight - altura : fim ? hist.scrollHeight : topo; }
  $('#chat-antigas').hidden = !v.mais;
}
ACT['chat-antigas'] = (el) => comBotao(el, async () => {
  const v = CHAT.vista, antes = Math.min(...v.mensagens.keys());
  const d = await api('GET', `/api/chat/conversas/${v.id}?antes=${antes}`);
  if (CHAT.vista !== v) return;
  d.mensagens.forEach((m) => v.mensagens.set(m.id, m)); v.mais = d.mais; chatDesenha(v, true);
});
FORM['chat-enviar'] = async (f) => {
  const v = CHAT.vista, campo = f.elements.texto, texto = campo.value.trim(); if (!texto) return;
  const destino = v.id;
  try {
    await api('POST', `/api/chat/conversas/${destino}/mensagens`, { texto });
    if (CHAT.vista === v) { if (campo.value.trim() === texto) campo.value = ''; await chatAtualizaConversa(); campo.focus(); }
    await chatCaixa();
  } catch (e) { throw e; }
};
ACT['chat-nova'] = (el) => {
  const sala = el.dataset.tipo === 'sala';
  modal(`<form data-form="chat-criar"><h2>${sala ? 'Nova sala de reunião' : 'Nova conversa'}</h2>
    ${sala ? '<label class="f">Título<input class="inp" name="titulo" maxlength="100" required></label>' : ''}
    <input type="hidden" name="tipo" value="${sala ? 'sala' : 'direta'}"><fieldset class="chat-contatos"><legend>Escolha ${sala ? 'os contatos' : 'um contato'}</legend>
    ${CHAT.caixa.contatos.map((p) => `<label class="chat-contato"><input type="${sala ? 'checkbox' : 'radio'}" name="com" value="${esc(p.agente || p.usuario_id)}" ${sala ? '' : 'required'}>${chatAvatar(p)}<span>${esc(p.nome)}${p.agente ? '<small class="muted"> · robô</small>' : ''}</span></label>`).join('')}</fieldset>
    <div class="row"><button class="btn" type="button" data-fecha>Cancelar</button><span class="sp"></span><button class="btn pri" type="submit">Abrir conversa</button></div></form>`);
};
FORM['chat-criar'] = async (f) => {
  const d = new FormData(f), com = d.getAll('com').map((v) => /^\d+$/.test(v) ? +v : v);
  const c = await api('POST', '/api/chat/conversas', { tipo: d.get('tipo'), titulo: d.get('titulo'), com });
  fechaModal(); await chatCaixa(); navega('#/chat/' + c.id);
};
ACT['chat-robo'] = (el) => comBotao(el, async () => {
  const c = await api('POST', '/api/chat/conversas', { tipo: 'direta', com: [el.dataset.slug] });
  await chatCaixa(); navega('#/chat/' + c.id);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && ME) chatAtualizaConversa().then(() => chatCaixa()).catch(() => {}); });
