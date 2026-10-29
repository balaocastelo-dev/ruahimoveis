/* Herrera HOUSE IA — PC virtual de cada agente (o Chrome dele, na estação): tela ao vivo, mouse e teclado,
   abas, endereço e tarefas para a IA fazer no PC e entregar pelo WhatsApp. Abre por window.abrePcDoAgente(slug). */
'use strict';
const PC = { W: 1366, H: 820 };
let PC_ATUAL = null;

function pcFecha() {
  if (!PC_ATUAL) return;
  try { PC_ATUAL.ws && PC_ATUAL.ws.close(); } catch {}
  clearInterval(PC_ATUAL.tTarefas);
  document.removeEventListener('keydown', PC_ATUAL.esc, true);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#pc-janela') && $('#pc-janela').remove();
  PC_ATUAL = null;
}
window.fechaPcDoAgente = pcFecha;

window.abrePcDoAgente = async function abrePcDoAgente(slug) {
  pcFecha();
  const jg = typeof JG_ESTADO !== 'undefined' && JG_ESTADO && JG_ESTADO.agentes[slug] ? JG_ESTADO.agentes[slug].dados : null;
  const ag = (EV_CACHE && EV_CACHE.agentes || []).find((a) => a.slug === slug) || jg || { slug, nome: slug, cor: '#888', cargo: '' };
  let est = null; try { est = await api('GET', '/api/estacao'); } catch {}
  const foto = EV_AVATARES.includes(slug) ? `/plataforma/agentes/${slug}.jpg` : '';
  const el = document.createElement('div');
  el.id = 'pc-janela'; el.className = 'pc-fundo';
  el.innerHTML = `<div class="pc-quadro" style="--c:${esc(ag.cor)}">
    <header class="pc-topo">
      ${foto ? `<img class="pc-av" src="${foto}" alt="">` : ''}<div class="pc-quem"><b>PC de ${esc(ag.nome)}</b><span>${esc(ag.cargo || '')}</span></div>
      <span class="pc-st" id="pc-st"><i></i>conectando…</span><span class="sp"></span>
      <button class="pc-bt" data-act="pc-cheia" title="Tela cheia">⛶</button><button class="pc-bt" data-act="pc-fecha" title="Fechar (Esc duas vezes)">✕</button>
    </header>
    <div class="pc-corpo">
      <div class="pc-monitor">
        <div class="pc-abas" id="pc-abas"></div>
        <div class="pc-barra"><button class="pc-nav" data-act="pc-cmd" data-c="voltar" title="Voltar">←</button><button class="pc-nav" data-act="pc-cmd" data-c="avancar" title="Avançar">→</button><button class="pc-nav" data-act="pc-cmd" data-c="recarregar" title="Recarregar">⟳</button>
          <form id="pc-url-f" class="pc-url"><input id="pc-url" autocomplete="off" spellcheck="false" placeholder="Pesquise no Google ou digite um endereço"></form>
          <button class="pc-nav" data-act="pc-wa" title="Abrir o WhatsApp Web neste PC">🟢</button></div>
        <div class="pc-tela" id="pc-tela"><canvas id="pc-canvas" width="${PC.W}" height="${PC.H}" tabindex="0"></canvas>
          <div class="pc-cursor" id="pc-cursor" hidden>${foto ? `<img src="${foto}" alt="">` : ''}<svg viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.6L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
          <div class="pc-aviso" id="pc-aviso"></div></div>
      </div>
      <aside class="pc-lado">
        <h3>Dar uma tarefa para ${esc(ag.nome)}</h3>
        <form id="pc-tarefa-f"><textarea name="pedido" rows="5" required minlength="8" placeholder="Ex.: Procure no Facebook Marketplace casas à venda no Cambuí acima de R$ 1,5 milhão anunciadas por particular e me mande os 5 melhores com link."></textarea>
          <label class="small muted">Resultado no WhatsApp<input name="para_telefone" class="inp" placeholder="(19) 9 9999-9999 — vazio: o seu"></label>
          <button class="btn pri" type="submit">▶ Mandar fazer</button></form>
        <div id="pc-tarefa-ao-vivo" class="pc-tvivo" hidden></div>
        <h3>Últimas tarefas</h3><div id="pc-tarefas" class="pc-tlista"><div class="muted small">Nenhuma ainda.</div></div>
        <div class="pc-acoes" id="pc-acoes"></div>
        <p class="small muted">Clique na tela para usar mouse e teclado; Ctrl+V cola o texto daqui. Logins (Facebook, WhatsApp, portais) ficam salvos neste PC: desligar não apaga nada.</p>
      </aside>
    </div></div>`;
  document.body.appendChild(el);
  PC_ATUAL = { slug, ag, el, ws: null, controle: false, ultimoEsc: 0 };
  PC_ATUAL.esc = (e) => { if (e.key !== 'Escape' || document.activeElement === $('#pc-canvas')) return; pcFecha(); };
  document.addEventListener('keydown', PC_ATUAL.esc, true);
  pcAcoes(est);
  pcTarefasLista();
  PC_ATUAL.tTarefas = setInterval(pcTarefasLista, 5000);
  $('#pc-tarefa-f').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const b = { agente: slug, pedido: f.pedido.value, para_telefone: f.para_telefone.value };
    try { const t = await api('POST', '/api/estacao/tarefas', b); f.pedido.value = ''; toast(`${ag.nome} recebeu a tarefa #${t.id}. Acompanhe na tela.`); pcTarefasLista(); } catch (er) { toast(er.message); }
  };
  if (!est || !est.configurada) return pcAviso(`<b>O PC virtual ainda não está ligado nesta imobiliária.</b><br>${est && est.pode_editar ? 'Abra <a href="#/whats/config">Configuração geral › PCs virtuais</a> para ligar a estação.' : 'Peça ao administrador para ligar a estação dos PCs virtuais.'}`);
  if (!est.online) return pcAviso('<b>A estação dos PCs virtuais está desligada agora.</b><br>Ela volta sozinha quando o computador da estação ligar. As tarefas que você mandar ficam na fila.');
  if (est.agentes && est.agentes[slug] && est.agentes[slug].ligado === false) return pcDesligado();
  pcConecta();
};

function pcAviso(html) { const a = $('#pc-aviso'); if (!a) return; a.innerHTML = html; a.hidden = !html; const st = $('#pc-st'); if (st && html) { st.className = 'pc-st'; st.lastChild.textContent = 'desligado'; } }

const pcDesligado = () => pcAviso('<b>Este PC está desligado.</b><br>Clique em <b>⏻ Ligar este PC</b> aqui ao lado: ele abre em poucos segundos com os logins de sempre.');

/* Ligar e desligar o PC deste robô, aqui mesmo. O estado vem da batida da estação (a cada 8 s), por isso
   o botão fica "Aguarde…" até o PC responder — e, quando liga, a tela se conecta sozinha. */
function pcAcoes(d) {
  const s = PC_ATUAL, box = $('#pc-acoes'); if (!s || !box) return;
  if (!d || !d.pode_editar) { box.innerHTML = ''; s.acoes = ''; return; }
  const ag = (d.agentes || {})[s.slug];
  const ligado = !!(ag && ag.ligado);
  const esperando = s.espera && Date.now() < s.espera && ligado !== s.esperaLigado;
  if (s.espera && !esperando) { s.espera = 0; if (ligado) pcReconecta(); else { pcFechaWs(); pcDesligado(); } }
  const html = !d.online
    ? '<span class="small muted">A estação está fora do ar: o liga/desliga volta quando ela ligar.</span>'
    : esperando
      ? `<button class="btn sm" disabled>${s.esperaLigado ? 'Ligando o PC…' : 'Desligando o PC…'}</button>`
      : ligado
        ? `<button class="btn sm" data-act="pc-liga" data-l="0" title="Fecha o Chrome deste robô. Os logins ficam salvos.">⏻ Desligar este PC</button>
           <button class="btn sm" data-act="pc-ordem" data-c="reiniciar">Reiniciar o PC</button>
           <button class="btn sm" data-act="pc-ordem" data-c="ler_whatsapp">Ler não lidas do WhatsApp</button>`
        : `<button class="btn sm pri" data-act="pc-liga" data-l="1" title="Abre o Chrome deste robô com os logins de sempre.">⏻ Ligar este PC</button>`;
  if (html === s.acoes) return;                 // sem repintar de graça: não perde o clique nem pisca
  s.acoes = html; box.innerHTML = html;
}
function pcFechaWs() { const s = PC_ATUAL; if (!s || !s.ws) return; try { s.ws.close(); } catch {} s.ws = null; }
function pcReconecta() { const s = PC_ATUAL; if (!s || (s.ws && s.ws.readyState <= 1)) return; pcAviso(''); pcConecta(); }

async function pcConecta() {
  const s = PC_ATUAL; if (!s) return;
  let p; try { p = await api('POST', '/api/estacao/passe', { agente: s.slug }); } catch (e) { return pcAviso(esc(e.message)); }
  if (PC_ATUAL !== s) return;
  s.controle = p.controle;
  const ws = new WebSocket(p.url.replace(/^http/, 'ws') + '/ws?p=' + encodeURIComponent(p.passe));
  ws.binaryType = 'arraybuffer'; s.ws = ws;
  const cv = $('#pc-canvas'); const ctx = cv.getContext('2d');
  let desenhando = false, proximo = null;
  const desenha = async (buf) => {
    if (desenhando) { proximo = buf; return; }
    desenhando = true;
    try { const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); ctx.drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close && bmp.close(); } catch {}
    desenhando = false;
    if (proximo) { const b = proximo; proximo = null; desenha(b); }
  };
  ws.onopen = () => { pcAviso(''); const st = $('#pc-st'); if (st) { st.className = 'pc-st on'; st.lastChild.textContent = s.controle ? 'ao vivo · você pode usar' : 'ao vivo · só vendo'; } };
  ws.onclose = (e) => { if (PC_ATUAL !== s) return; pcAviso(e.code === 4001 ? 'Passe vencido. Reabrindo…' : 'A conexão com o PC caiu. Tentando de novo…'); setTimeout(() => PC_ATUAL === s && pcConecta(), 2500); };
  ws.onmessage = (e) => {
    if (typeof e.data !== 'string') return desenha(e.data);
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'abas') pcAbas(m.abas);
    if (m.t === 'cursor') pcCursor(m);
    if (m.t === 'tarefa') pcTarefaAoVivo(m);
    if (m.t === 'erro') pcAviso(esc(m.msg));
  };
  pcEntrada(cv);
}
const pcManda = (o) => { const s = PC_ATUAL; if (s && s.ws && s.ws.readyState === 1 && s.controle) s.ws.send(JSON.stringify(o)); };

function pcEntrada(cv) {
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.round((e.clientX - r.left) * PC.W / r.width), y: Math.round((e.clientY - r.top) * PC.H / r.height) }; };
  const mods = (e) => ({ ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
  let ultimoMove = 0;
  cv.onmousemove = (e) => { const t = performance.now(); if (t - ultimoMove < 30) return; ultimoMove = t; pcManda({ t: 'mouse', tipo: 'move', ...pos(e), botoes: e.buttons, ...mods(e) }); };
  cv.onmousedown = (e) => { cv.focus(); e.preventDefault(); pcManda({ t: 'mouse', tipo: 'down', ...pos(e), botao: e.button, botoes: e.buttons, cliques: e.detail || 1, ...mods(e) }); };
  cv.onmouseup = (e) => { e.preventDefault(); pcManda({ t: 'mouse', tipo: 'up', ...pos(e), botao: e.button, cliques: e.detail || 1, ...mods(e) }); };
  cv.oncontextmenu = (e) => e.preventDefault();
  cv.addEventListener('wheel', (e) => { e.preventDefault(); pcManda({ t: 'mouse', tipo: 'roda', ...pos(e), dx: e.deltaX, dy: e.deltaY }); }, { passive: false });
  cv.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) return; // o colar vem pelo evento paste
    e.preventDefault(); pcManda({ t: 'tecla', tipo: 'down', key: e.key, code: e.code, ...mods(e) });
  };
  cv.onkeyup = (e) => { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) return; e.preventDefault(); pcManda({ t: 'tecla', tipo: 'up', key: e.key, code: e.code, ...mods(e) }); };
  cv.onpaste = (e) => { const t = e.clipboardData && e.clipboardData.getData('text'); if (t) { e.preventDefault(); pcManda({ t: 'texto', s: t }); } };
  $('#pc-url-f').onsubmit = (e) => { e.preventDefault(); pcManda({ t: 'ir', url: $('#pc-url').value }); $('#pc-canvas').focus(); };
}
function pcAbas(abas) {
  const box = $('#pc-abas'); if (!box) return;
  box.innerHTML = abas.map((a) => `<button class="pc-aba ${a.ativa ? 'on' : ''}" data-act="pc-aba" data-i="${a.i}" title="${esc(a.url)}"><span>${esc(a.titulo || a.url.replace(/^https?:\/\//, '') || 'Nova aba')}</span>${abas.length > 1 ? `<i data-act="pc-aba-fecha" data-i="${a.i}">×</i>` : ''}</button>`).join('') + '<button class="pc-aba nova" data-act="pc-aba-nova" title="Nova aba">+</button>';
  const at = abas.find((a) => a.ativa); const u = $('#pc-url'); if (at && u && document.activeElement !== u) u.value = at.url === 'about:blank' ? '' : at.url;
}
function pcCursor(m) {
  const c = $('#pc-cursor'); if (!c) return;
  if (!m.ia) { c.hidden = true; return; }
  c.hidden = false; c.style.left = (m.x / PC.W * 100) + '%'; c.style.top = (m.y / PC.H * 100) + '%';
  if (m.clique) { c.classList.remove('clica'); void c.offsetWidth; c.classList.add('clica'); }
  clearTimeout(PC_ATUAL && PC_ATUAL.tCursor); if (PC_ATUAL) PC_ATUAL.tCursor = setTimeout(() => { c.hidden = true; }, 6000);
}
function pcTarefaAoVivo(m) {
  const b = $('#pc-tarefa-ao-vivo'); if (!b) return;
  b.hidden = false;
  b.innerHTML = `<div class="row"><b>Tarefa #${m.id}</b><span class="sp"></span>${m.fim ? '' : `<button class="btn sm" data-act="pc-cancela" data-id="${m.id}">Parar</button>`}</div><div class="small muted">${esc(m.pedido || '')}</div><div class="pc-passo">${m.fim ? '' : '<i class="pc-gira"></i>'}${esc(m.passo || '')}</div>`;
  if (m.fim) setTimeout(() => { if (b) b.hidden = true; pcTarefasLista(); }, 6000);
}
async function pcTarefasLista() {
  const s = PC_ATUAL; const box = $('#pc-tarefas'); if (!s || !box) return;
  try {
    const d = await api('GET', '/api/estacao');
    if (PC_ATUAL !== s) return;
    pcAcoes(d);
    const l = (d.tarefas || []).filter((t) => t.agente === s.slug).slice(0, 8);
    const nome = { fila: 'na fila', rodando: 'fazendo agora', feita: 'feita ✅', erro: 'não conseguiu', cancelada: 'cancelada' };
    box.innerHTML = l.length ? l.map((t) => `<details class="pc-t ${t.status}"><summary><b>#${t.id}</b> ${esc(t.pedido.slice(0, 70))}<span class="pill ${t.status === 'feita' ? 'ok' : t.status === 'erro' ? 'bad' : 'warn'}">${nome[t.status] || t.status}</span></summary>
      ${t.resultado ? `<div class="pc-res">${esc(t.resultado)}</div>` : ''}${t.erro ? `<div class="pc-res erro">${esc(t.erro)}</div>` : ''}
      <ol class="pc-passos">${(t.passos || []).map((p) => `<li><b>${esc(p.acao)}</b> ${esc(p.pensamento || p.detalhe || '')}</li>`).join('')}</ol>
      ${['fila', 'rodando'].includes(t.status) ? `<button class="btn sm" data-act="pc-cancela" data-id="${t.id}">Cancelar</button>` : ''}</details>`).join('') : '<div class="muted small">Nenhuma ainda.</div>';
  } catch {}
}
ACT['pc-abre'] = (el) => window.abrePcDoAgente(el.dataset.slug);
ACT['pc-fecha'] = () => pcFecha();
ACT['pc-cheia'] = () => { const q = $('.pc-quadro'); if (!q) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else q.requestFullscreen && q.requestFullscreen().catch(() => {}); };
ACT['pc-cmd'] = (el) => pcManda({ t: el.dataset.c });
ACT['pc-aba'] = (el) => pcManda({ t: 'aba', acao: 'ativar', i: +el.dataset.i });
ACT['pc-aba-fecha'] = (el) => pcManda({ t: 'aba', acao: 'fechar', i: +el.dataset.i });
ACT['pc-aba-nova'] = () => pcManda({ t: 'aba', acao: 'nova' });
ACT['pc-wa'] = () => (PC_ATUAL ? api('POST', '/api/estacao/comando', { agente: PC_ATUAL.slug, comando: 'abrir_whatsapp' }).then(() => toast('Abrindo o WhatsApp Web neste PC (em até 10 s). Se pedir, leia o QR code com o celular.')).catch((e) => toast(e.message)) : null);
ACT['pc-liga'] = (el) => comBotao(el, async () => {
  const s = PC_ATUAL; if (!s) return;
  const liga = el.dataset.l === '1';
  await api('POST', '/api/estacao/comando', { agente: s.slug, comando: liga ? 'ligar' : 'desligar' });
  s.espera = Date.now() + 90e3; s.esperaLigado = liga; s.acoes = '';
  if (!liga) { pcFechaWs(); pcDesligado(); }                      // a tela para na hora; o PC fecha na próxima batida
  else pcAviso('<b>Ligando o PC…</b><br>O Chrome deste robô abre em poucos segundos.');
  pcTarefasLista();
  toast(liga ? 'Ligando o PC (em até 10 s).' : 'Desligando o PC. Ele só volta quando você ligar de novo.');
});
ACT['pc-ordem'] = (el) => comBotao(el, async () => { await api('POST', '/api/estacao/comando', { agente: PC_ATUAL.slug, comando: el.dataset.c }); toast('Pedido enviado ao PC (em até 10 s).'); });
ACT['pc-cancela'] = (el) => comBotao(el, async () => { await api('POST', `/api/estacao/tarefas/${el.dataset.id}/cancelar`); toast('Tarefa cancelada.'); pcTarefasLista(); });

// ---------- miniaturas: a tela de cada PC no monitor da mesa (escritório 3D) ----------
const PC_MINIS = {};
async function pcMinisAtualiza() {
  const ativo = /^#\/whats\/ao-vivo/.test(location.hash) && typeof window.jg3dTelaDoAgente === 'function';
  if (!ativo) { for (const k of Object.keys(PC_MINIS)) { try { PC_MINIS[k].close(); } catch {} delete PC_MINIS[k]; } return; }
  let est; try { est = await api('GET', '/api/estacao'); } catch { return; }
  if (!est.online) return;
  for (const [slug, s] of Object.entries(est.agentes || {})) {
    if (!s.ligado || PC_MINIS[slug]) continue;
    try {
      const p = await api('POST', '/api/estacao/passe', { agente: slug });
      const ws = new WebSocket(p.url.replace(/^http/, 'ws') + '/ws?modo=mini&p=' + encodeURIComponent(p.passe));
      ws.binaryType = 'arraybuffer'; PC_MINIS[slug] = ws;
      ws.onmessage = async (e) => { if (typeof e.data === 'string' || typeof window.jg3dTelaDoAgente !== 'function') return; try { window.jg3dTelaDoAgente(slug, await createImageBitmap(new Blob([e.data], { type: 'image/jpeg' }))); } catch {} };
      ws.onclose = () => { if (PC_MINIS[slug] === ws) delete PC_MINIS[slug]; };
    } catch {}
  }
}
setInterval(pcMinisAtualiza, 15000);
window.addEventListener('hashchange', () => setTimeout(pcMinisAtualiza, 1500));

// ---------- Configuração geral › PCs virtuais (estação + cérebro que opera os navegadores) ----------
const PC_AJUDA = [
  ['gemini', 'Google Gemini — grátis, recomendado', 'Entre em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> com uma conta Google › <b>Create API key</b> › copie e cole aqui. Não pede cartão; o plano grátis tem limite por minuto e por dia (sobra para tarefas do dia a dia). Modelo: <span class="mono">gemini-flash-latest</span>.'],
  ['openai', 'OpenRouter — grátis com modelos ":free"', 'Crie a conta em <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a> › <b>Keys</b> › <b>Create key</b>. Escolha "Compatível com OpenAI", endereço <span class="mono">https://openrouter.ai/api/v1</span> e o modelo <span class="mono">openrouter/free</span> (escolhe sozinho um modelo grátis que lê imagem). Tem limite diário de pedidos grátis.'],
  ['openai', 'Groq — grátis e muito rápido', 'Crie a chave em <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>. Escolha "Compatível com OpenAI", endereço <span class="mono">https://api.groq.com/openai/v1</span> e o modelo <span class="mono">meta-llama/llama-4-scout-17b-16e-instruct</span> (vê a tela). Limites grátis por minuto.'],
  ['ollama', 'IA local do PC — grátis, sem chave', 'Roda na placa de vídeo do computador da estação (Ollama). Modelo <span class="mono">qwen2.5vl:7b</span>. Mais lenta e menos esperta que as da nuvem, mas sem custo e sem limite.'],
  ['anthropic', 'Claude (Anthropic) — pago, o melhor em operar o computador', 'Crie a chave em <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> (pede cartão; cobra por uso). Modelo <span class="mono">claude-sonnet-5-5</span>.'],
];
async function pcConfig() {
  const box = $('#pcv-config'); if (!box) return;
  let d; try { d = await api('GET', '/api/estacao'); } catch (e) { box.innerHTML = `<div class="banner warn">${esc(e.message)}</div>`; return; }
  const ia = d.ia || {}; const prov = d.provedores || {};
  const ligados = Object.entries(d.agentes || {}).filter(([, s]) => s.ligado);
  box.innerHTML = `<h2 style="margin:26px 0 6px">PCs virtuais dos agentes</h2>
  <p class="lead" style="margin-top:0">Cada agente tem um computador de verdade (um Chrome sempre ligado, com os logins dele). Você abre o PC pelo escritório, usa com mouse e teclado, deixa Facebook e WhatsApp Web abertos para ele e dá tarefas que a IA faz sozinha e entrega pelo WhatsApp.</p>
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="row"><h3 style="margin:0">Estação</h3><span class="sp"></span><span class="pill ${d.online ? 'ok' : d.configurada ? 'bad' : 'warn'}">${d.online ? 'ligada' : d.configurada ? 'desligada' : 'não ligada ainda'}</span></div>
      ${d.online ? `<p class="small">Computador <b>${esc(d.maquina || '')}</b> · versão ${esc(d.versao || '')} · ${ligados.length} PC(s) ligado(s)${ligados.length ? ': ' + ligados.map(([s]) => esc(((EV_CACHE && EV_CACHE.agentes || []).find((a) => a.slug === s) || { nome: s }).nome)).join(', ') : ''}.</p>` : d.configurada ? '<p class="small">A estação está configurada mas não respondeu no último minuto. Ela volta sozinha quando o computador ligar.</p>' : '<p class="small">Gere a chave e coloque no computador da estação (no arquivo de configuração dela). Quem cuida da plataforma faz isso para você.</p>'}
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" data-act="pc-gera-chave">${d.configurada ? 'Trocar a chave da estação' : 'Gerar chave da estação'}</button></div>
      <div id="pc-chave-nova"></div></div>
    <form class="card grid" data-form="pc-ia" style="gap:10px"><div class="row"><h3 style="margin:0">Quem opera os PCs</h3><span class="sp"></span><span class="pill ${ia.provedor === 'ollama' || ia.tem_chave ? 'ok' : 'warn'}">${esc(ia.provedor_nome || '')}</span></div>
      <label class="f">Provedor<select class="inp" name="provedor">${Object.entries(prov).map(([k, p]) => `<option value="${k}" ${ia.provedor === k ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="f">Modelo<input class="inp mono" name="modelo" value="${esc(ia.modelo || '')}"></label>
      <label class="f">Endereço da API <span class="muted small">(só para "Compatível com OpenAI" e IA local)</span><input class="inp mono" name="base_url" value="${esc(ia.base_url || '')}" placeholder="https://openrouter.ai/api/v1"></label>
      <label class="f">Chave${ia.tem_chave ? ` <span class="muted small">· salva, termina em <span class="mono">${esc(ia.chave_final)}</span>${ia.usa_chave_do_escritorio ? ' (a mesma do cérebro do escritório)' : ''}</span>` : ''}<input class="inp mono" name="chave" type="password" autocomplete="off" placeholder="${ia.tem_chave ? 'Deixe em branco para manter' : 'Cole a chave aqui'}"></label>
      ${ia.testado_em ? `<div class="banner ${ia.teste_ok ? 'ok' : ia.teste_ok === false ? 'bad' : 'info'} small" style="margin:0">${ia.teste_ok ? '✓ ' : ia.teste_ok === false ? '✗ ' : ''}${esc(ia.teste_msg || '')}</div>` : ''}
      <div class="row" style="gap:6px"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-act="pc-ia-testar">Testar</button></div></form>
  </div>
  <div class="card" style="margin-top:16px"><h3 style="margin-top:0">Como conseguir uma chave grátis</h3>
    <div class="pc-ajuda">${PC_AJUDA.map(([p, t, h]) => `<div><b>${t}</b><p class="small">${h}</p><button class="btn sm" type="button" data-act="pc-ia-usa" data-p="${p}">Usar este</button></div>`).join('')}</div>
    <p class="small muted">A chave fica cifrada no banco desta imobiliária e só vai para a estação dos PCs. Os sites e as conversas que o agente vê vão para o provedor escolhido; confira a política de privacidade dele.</p></div>`;
}
ACT['pc-ia-usa'] = (el) => {
  const f = $('form[data-form="pc-ia"]'); if (!f) return;
  const ex = { gemini: ['gemini', 'gemini-flash-latest', ''], ollama: ['ollama', 'qwen2.5vl:7b', 'http://127.0.0.1:11434'], anthropic: ['anthropic', 'claude-sonnet-5-5', ''] };
  const txt = el.parentNode.textContent;
  const v = el.dataset.p === 'openai' ? (/groq/i.test(txt) ? ['openai', 'meta-llama/llama-4-scout-17b-16e-instruct', 'https://api.groq.com/openai/v1'] : ['openai', 'openrouter/free', 'https://openrouter.ai/api/v1']) : ex[el.dataset.p];
  f.provedor.value = v[0]; f.modelo.value = v[1]; f.base_url.value = v[2]; f.chave.focus();
  toast('Preenchido. Cole a chave (se precisar) e clique em Salvar.');
};
FORM['pc-ia'] = async (f) => { const o = formJSON(f); if (!o.chave) delete o.chave; await api('PUT', '/api/estacao/ia', o); toast('Salvo'); pcConfig(); };
ACT['pc-ia-testar'] = (el) => comBotao(el, async () => { await api('POST', '/api/estacao/ia/testar'); pcConfig(); });
ACT['pc-gera-chave'] = (el) => comBotao(el, async () => {
  if (!confirm('Gerar uma chave nova? A estação que usa a chave antiga para de funcionar até receber a nova.')) return;
  const r = await api('POST', '/api/estacao/chave');
  $('#pc-chave-nova').innerHTML = `<div class="banner info small" style="margin-top:10px">Copie agora (ela não aparece de novo) e coloque no arquivo da estação:<pre class="mono" style="white-space:pre-wrap;user-select:all">{ "id": "${esc(r.id)}", "base": "${esc(r.base || location.origin)}", "chave": "${esc(r.chave)}" }</pre></div>`;
});
