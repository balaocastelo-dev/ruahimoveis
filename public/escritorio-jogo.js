/* Herrera HOUSE IA — Escritório ao vivo (#/whats/ao-vivo): o escritório virtual em modo jogo.
   Os 9 agentes nas mesas, andando pelo escritório e soltando balões com o que acontece no sistema, ao vivo.
   Carregado depois do escritorio.js (usa EV_AVATARES). Palco lógico de 1600×900, escalado para caber na tela (e em tela cheia). */
'use strict';
const JG = { W: 1600, H: 900, CORREDOR: 742 };
// Onde fica a mesa de cada agente (centro da mesa) e os lugares do escritório (ponto dos pés de quem está em pé).
const JG_MESAS = {
  captador: [235, 430],
  apartamentos: [600, 430], comerciais: [800, 430], terrenos: [1000, 430],
  casas: [600, 650], 'alto-padrao': [800, 650], offmarket: [1000, 650],
  gerente: [1285, 430], 'gerente-corretores': [1475, 430],
};
const JG_LUGAR = {
  mural: [110, 300], impressora: [100, 655], porta: [800, 905], recepcao: [800, 822], cafe: [515, 845],
  tv: [1380, 300], reuniao: [1380, 748], sofa: [990, 850], plantao: [670, 862],
};
// Para onde cada tipo de evento leva o agente (o resto é na própria mesa).
const JG_VAI = { visita: 'porta', captacao: 'mural', foto: 'impressora', relatorio: 'tv', afazer: 'mural', feito: 'mural', chamou_corretor: 'plantao', transferiu: null };
const JG_EMOJI_VAI = { '🏠': 'mural', '🎯': 'mural', '📷': 'impressora', '📅': 'porta', '🖋️': 'tv', '✍️': 'impressora', '🎉': 'tv', '🔎': 'mural' };
const JG_ZONAS = [['Sala de captação', 30, 450], ['Salão de vendas', 470, 1130], ['Diretoria', 1150, 1570]];

let JG_ESTADO = null;
const jgVivo = () => JG_ESTADO && document.body.contains(JG_ESTADO.raiz);
const jgReduz = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const jgEspera = (ms) => new Promise((r) => setTimeout(r, ms));

// Em qual modo abrir: 3D (padrão) ou 2D. ?modo=2d na rota, ou a escolha guardada; sem WebGL cai no 2D sozinho.
function jgModo() {
  const qs = new URLSearchParams((location.hash.split('?')[1] || ''));
  if (qs.get('modo') === '2d' || qs.get('modo') === '3d') return qs.get('modo');
  try { const m = localStorage.getItem('jg-modo'); if (m === '2d' || m === '3d') return m; } catch {}
  return '3d';
}
function jgTemWebGL() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}
let JG_3D = null; // módulo escritorio-3d.js, carregado só quando abre o 3D
async function telaEscritorioJogo() {
  if (JG_ESTADO) jgPara();
  if (JG_3D && JG_3D.jg3dPara) JG_3D.jg3dPara();
  if (jgModo() === '3d' && jgTemWebGL()) {
    try {
      JG_3D = JG_3D || await import('/escritorio-3d.js');
      await JG_3D.telaEscritorio3D();
      return;
    } catch (e) {
      console.warn('Escritório 3D indisponível, abrindo o 2D:', e);
      if (!/Sessão|Erro 4/.test(e.message || '')) toast('Seu navegador não abriu o 3D; mostrando a versão 2D.');
    }
  }
  await telaEscritorioJogo2D();
}
ACT['jg-modo'] = (el) => {
  try { localStorage.setItem('jg-modo', el.dataset.modo); } catch {}
  const [path] = location.hash.split('?');
  if (location.hash !== path) { location.hash = path; return; } // tira ?modo= da rota; o hashchange reabre a tela
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  rota();
};
async function telaEscritorioJogo2D() {
  const d = await api('GET', '/api/escritorio/ao-vivo?full=1');
  if (JG_ESTADO) jgPara();
  const nomeImob = MARCA.empresa || MARCA.cliente || 'Imobiliária';
  const placa = MARCA.logo ? `<img src="${esc(MARCA.logo)}" alt="${esc(MARCA.cliente)}">`
    : `<b class="jg-mono">${esc((MARCA.cliente || 'I').slice(0, 1))}</b><span>${esc(nomeImob)}</span>`;
  $('#main').innerHTML = `<div class="jg-topo"><div><a class="muted small" href="#/whats">← Escritório virtual</a><div class="eyebrow">Atendimento · ao vivo</div>
      <h1>Escritório ao vivo</h1><p class="lead">Os agentes da ${esc(MARCA.cliente)} trabalhando: cada atendimento, visita, captação e ação da equipe sobe num balão na hora em que acontece.</p></div>
    <div class="jg-topo-acoes"><button class="btn pri" data-act="jg-cheia">⛶ Tela cheia</button></div></div>
  <div class="jg" id="jg" tabindex="-1">
    <div class="jg-palco" id="jg-palco">
      <div class="jg-parede">
        <div class="jg-janela j1"><i></i></div><div class="jg-janela j2"><i></i></div>
        <div class="jg-placa">${placa}<small>${esc(MARCA.sistema)} · escritório virtual</small></div>
        <div class="jg-mural" title="Mural de oportunidades"><b>Mural de oportunidades</b><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="jg-tv"><b>Painel de hoje</b><div id="jg-tv"></div></div>
      </div>
      <div class="jg-piso"></div>
      ${JG_ZONAS.map(([n, x1, x2], i) => `<div class="jg-zona z${i + 1}" style="left:${x1}px;width:${x2 - x1}px"><span>${esc(n)}</span></div>`).join('')}
      <div class="jg-vidro" style="left:450px"></div><div class="jg-vidro" style="left:1140px"></div>
      <div class="jg-movel jg-impressora" style="left:60px;top:540px"><i></i></div>
      <div class="jg-movel jg-cafe" style="left:470px;top:770px"><i></i><span>☕</span></div>
      <div class="jg-movel jg-planta" style="left:30px;top:790px"></div>
      <div class="jg-movel jg-planta" style="left:400px;top:520px"></div><div class="jg-movel jg-planta" style="left:1095px;top:520px"></div>
      <div class="jg-movel jg-sofa" style="left:920px;top:800px"></div>
      <div class="jg-movel jg-balcao" style="left:600px;top:792px"><span>🔔 plantão</span></div>
      <div class="jg-movel jg-reuniao" style="left:1290px;top:620px"><i style="left:-14px;top:22px"></i><i style="right:-14px;top:22px"></i><i style="left:30px;top:-16px"></i><i style="left:110px;top:-16px"></i><i style="left:30px;bottom:-16px"></i><i style="left:110px;bottom:-16px"></i></div>
      <div class="jg-porta"><span>Entrada</span></div>
      <div id="jg-mesas"></div>
      <div id="jg-gente"></div>
      <div class="jg-noite"></div>
      <div class="jg-confete" id="jg-confete"></div>
      <div class="jg-hud">
        <div class="jg-vivo"><i></i>ao vivo</div><div class="jg-relogio"><b id="jg-hora">--:--</b><span id="jg-data"></span></div><span class="sp"></span>
        <div class="jg-num"><b id="jg-n-acoes">0</b><span>ações hoje</span></div>
        <div class="jg-num"><b id="jg-n-conv">0</b><span>conversas</span></div>
        <div class="jg-num"><b id="jg-n-env">0</b><span>enviadas</span></div>
        <div class="jg-num q"><b id="jg-n-apr">0</b><span>para aprovar</span></div>
        <span class="j3-seg"><button data-act="jg-modo" data-modo="3d" title="Ver em 3D">3D</button><button class="on" title="Versão 2D">2D</button></span>
        <button class="jg-bt" data-act="jg-cheia" title="Tela cheia (F)">⛶</button>
      </div>
      <div class="jg-ticker" id="jg-ticker"><span class="jg-tk-vazio">Quando os agentes trabalharem, cada ação aparece aqui e num balão em cima de quem fez.</span></div>
    </div>
  </div>`;
  JG_ESTADO = { raiz: $('#jg'), ev: d.ev, au: d.au, agentes: {}, fila: [], rodando: false, ultimoTicker: [], vazio: true };
  jgMontaAgentes(d.agentes);
  jgNumeros(d);
  jgRelogio();
  jgEscala(); const meu0 = JG_ESTADO;
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => jgEscala()); ro.observe($('#jg')); JG_ESTADO.ro = ro; }
  document.addEventListener('fullscreenchange', jgEscala);
  document.addEventListener('keydown', jgTecla);
  // Abertura: repassa as últimas ações para o escritório não começar parado.
  d.eventos.forEach((e, i) => setTimeout(() => { if (JG_ESTADO === meu0) jgEnfileira(jgDeEvento(e), true); }, 900 + i * 1500));
  if (!d.eventos.length) setTimeout(() => { if (JG_ESTADO === meu0) jgBalao(JG_ESTADO.agentes['gerente-corretores'], '👀', 'Esperando o primeiro cliente do dia…', 'leve'); }, 1500);
  let n = 0; const meu = JG_ESTADO;
  const iv = setInterval(async () => {
    if (JG_ESTADO !== meu) return clearInterval(iv);
    if (!jgVivo()) return jgPara();
    n++;
    try {
      const r = await api('GET', `/api/escritorio/ao-vivo?ev=${JG_ESTADO.ev}&au=${JG_ESTADO.au}${n % 6 === 0 ? '&full=1' : ''}`);
      if (!jgVivo()) return;
      JG_ESTADO.ev = r.ev; JG_ESTADO.au = r.au;
      r.eventos.forEach((e) => jgEnfileira(jgDeEvento(e)));
      r.sistema.forEach((s) => jgEnfileira({ agente: s.agente, emoji: s.emoji, texto: s.texto, vai: JG_EMOJI_VAI[s.emoji] || null, hora: s.criado_em, festa: s.emoji === '🎉' }));
      if (r.agentes) { jgAtualizaAgentes(r.agentes); jgNumeros(r); }
    } catch {}
  }, 4000);
  poll = iv; JG_ESTADO.iv = iv;
  JG_ESTADO.vida = setInterval(jgVidaNoEscritorio, 6500);
  JG_ESTADO.relogio = setInterval(jgRelogio, 20000);
}

function jgPara() {
  clearInterval(poll);
  if (!JG_ESTADO) return;
  clearInterval(JG_ESTADO.iv); clearInterval(JG_ESTADO.vida); clearInterval(JG_ESTADO.relogio);
  if (JG_ESTADO.ro) JG_ESTADO.ro.disconnect();
  document.removeEventListener('fullscreenchange', jgEscala);
  document.removeEventListener('keydown', jgTecla);
  JG_ESTADO = null;
}
function jgTecla(e) {
  if (!jgVivo()) return jgPara();
  if ((e.key === 'f' || e.key === 'F') && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) jgTelaCheia();
}

// ---------- palco: escala para caber na largura (ou na tela inteira) ----------
function jgEscala() {
  if (!jgVivo()) return;
  const jg = $('#jg'); const palco = $('#jg-palco');
  const cheia = document.fullscreenElement === jg;
  const w = cheia ? window.innerWidth : jg.clientWidth;
  const h = cheia ? window.innerHeight : Math.max(320, window.innerHeight - 140);
  const k = Math.min(w / JG.W, cheia ? h / JG.H : Math.max(w / JG.W * 0.55, Math.min(w / JG.W, h / JG.H)));
  palco.style.transform = `scale(${k})`;
  palco.style.left = cheia ? `${(w - JG.W * k) / 2}px` : `${Math.max(0, (w - JG.W * k) / 2)}px`;
  palco.style.top = cheia ? `${(h - JG.H * k) / 2}px` : '0px';
  if (!cheia) jg.style.height = `${JG.H * k}px`; else jg.style.height = '';
}
function jgTelaCheia() {
  const jg = $('#jg'); if (!jg) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (jg.requestFullscreen) jg.requestFullscreen().catch(() => toast('O navegador não deixou abrir em tela cheia.'));
  else toast('Este navegador não tem tela cheia. Use F11.');
}
ACT['jg-cheia'] = () => jgTelaCheia();

function jgRelogio() {
  if (!jgVivo()) return;
  const a = new Date(); const h = a.getHours();
  $('#jg-hora').textContent = a.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#jg-data').textContent = a.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  const ceu = h >= 6 && h < 17 ? 'dia' : h >= 17 && h < 19 ? 'tarde' : h >= 5 && h < 6 ? 'tarde' : 'noite';
  $('#jg').dataset.ceu = ceu;
}
function jgNumeros(d) {
  if (!d.totais || !jgVivo()) return;
  const t = d.totais;
  const anima = (id, v) => { const el = $('#' + id); if (!el) return; if (el.textContent !== String(v)) { el.textContent = v; el.parentNode.classList.remove('pula'); void el.offsetWidth; el.parentNode.classList.add('pula'); } };
  anima('jg-n-acoes', t.acoes); anima('jg-n-conv', t.conversas); anima('jg-n-env', t.enviadas); anima('jg-n-apr', t.aprovar);
  $('#jg-n-apr').parentNode.classList.toggle('quente', t.aprovar > 0);
  $('#jg-tv').innerHTML = `<span><b>${t.no_ar}</b>/9 no WhatsApp</span><span><b>${t.conversas}</b> conversas</span><span><b>${t.enviadas}</b> enviadas</span><span><b>${t.aprovar}</b> p/ aprovar</span>`;
}

// ---------- agentes ----------
function jgSprite(a) {
  const foto = EV_AVATARES.includes(a.slug) ? `/plataforma/agentes/${a.slug}.jpg` : '';
  return `<div class="jg-ag" data-slug="${esc(a.slug)}" data-act="pc-abre" title="Abrir o PC de ${esc(a.nome)}" style="--c:${esc(a.cor)}">
    <div class="jg-baloes"></div>
    <div class="jg-boneco"><span class="jg-sombra"></span><span class="jg-pernas"><i></i><i></i></span><span class="jg-corpo"></span>
      ${foto ? `<img class="jg-cab" src="${foto}" alt="">` : `<span class="jg-cab jg-cab-l">${esc(a.nome.slice(0, 2))}</span>`}<span class="jg-zz">z<small>z</small></span></div>
    <div class="jg-nome"><i class="st"></i>${esc(a.nome)}</div></div>`;
}
function jgMesa(a, [x, y]) {
  return `<div class="jg-mesa" data-slug="${esc(a.slug)}" data-act="pc-abre" title="Abrir o PC de ${esc(a.nome)}" style="left:${x - 78}px;top:${y - 24}px;z-index:${y + 30};--c:${esc(a.cor)}">
    <div class="jg-tampo"><span class="jg-note"><i></i></span><span class="jg-caneca"></span><span class="jg-papel"></span></div><div class="jg-frente"><i class="st"></i><span class="nm">${esc(a.nome)}</span></div></div>`;
}
function jgMontaAgentes(lista) {
  const mesas = []; const gente = [];
  for (const a of lista) {
    const m = JG_MESAS[a.slug]; if (!m) continue;
    mesas.push(jgMesa(a, m)); gente.push(jgSprite(a));
  }
  $('#jg-mesas').innerHTML = mesas.join('');
  $('#jg-gente').innerHTML = gente.join('');
  for (const a of lista) {
    const m = JG_MESAS[a.slug]; if (!m) continue;
    const el = $(`.jg-ag[data-slug="${a.slug}"]`, $('#jg-gente'));
    const ag = { slug: a.slug, nome: a.nome, el, mesa: m, x: m[0], y: m[1] - 6, ocupado: false, fila: [], dados: a };
    JG_ESTADO.agentes[a.slug] = ag;
    jgPoe(ag, ag.x, ag.y, true);
  }
  jgAtualizaAgentes(lista);
}
function jgAtualizaAgentes(lista) {
  for (const a of lista) {
    const ag = JG_ESTADO.agentes[a.slug]; if (!ag) continue;
    ag.dados = a; ag.nome = a.nome;
    ag.el.classList.toggle('dorme', !a.ativo);
    ag.el.dataset.estado = a.estado;
    const n = $('.jg-nome', ag.el); if (n) n.lastChild.textContent = a.nome;
    const mesa = $(`.jg-mesa[data-slug="${a.slug}"]`);
    if (mesa) { mesa.classList.toggle('apagada', !a.ativo); mesa.dataset.estado = a.ativo ? a.estado : 'parado'; const nm = $('.nm', mesa); if (nm) nm.textContent = a.nome; }
  }
}
function jgPoe(ag, x, y, sentado) {
  ag.x = x; ag.y = y;
  ag.el.style.left = `${x}px`; ag.el.style.top = `${y}px`;
  ag.el.style.zIndex = sentado ? String(Math.round(y)) : String(Math.round(y) + 40);
  ag.el.classList.toggle('sentado', !!sentado);
}
// Anda por pontos: sai da mesa pelo lado, desce ao corredor, segue e sobe até o destino.
async function jgAnda(ag, alvo) {
  const [sx, sy] = ag.mesa;
  const lado = sx + (ag.slug === 'gerente-corretores' || sx >= 1000 ? -100 : 100);
  const pts = [[lado, ag.y + 10], [lado, JG.CORREDOR], [alvo[0], JG.CORREDOR], alvo];
  ag.el.classList.add('anda'); ag.el.classList.remove('sentado');
  for (const [x, y] of pts) await jgPasso(ag, x, y);
  ag.el.classList.remove('anda');
}
async function jgVolta(ag) {
  const [sx, sy] = ag.mesa;
  const lado = sx + (ag.slug === 'gerente-corretores' || sx >= 1000 ? -100 : 100);
  ag.el.classList.add('anda');
  for (const [x, y] of [[ag.x, JG.CORREDOR], [lado, JG.CORREDOR], [lado, sy - 6], [sx, sy - 6]]) await jgPasso(ag, x, y);
  ag.el.classList.remove('anda');
  jgPoe(ag, sx, sy - 6, true);
}
async function jgPasso(ag, x, y) {
  const dist = Math.hypot(x - ag.x, y - ag.y);
  if (dist < 2) return;
  const ms = jgReduz() ? 0 : Math.max(180, dist / 0.26);
  ag.el.style.transitionDuration = `${ms}ms`;
  ag.el.style.zIndex = String(2000);
  ag.x = x; ag.y = y;
  ag.el.style.left = `${x}px`; ag.el.style.top = `${y}px`;
  await jgEspera(ms + 30);
}

// ---------- balões ----------
function jgBalao(ag, emoji, texto, tipo = '') {
  if (!ag || !jgVivo()) return;
  const caixa = $('.jg-baloes', ag.el);
  const b = document.createElement('div');
  b.className = `jg-balao ${tipo}`;
  b.innerHTML = `<span class="e">${esc(emoji || '💬')}</span>${texto ? `<span class="t">${esc(texto)}</span>` : ''}`;
  caixa.appendChild(b);
  while (caixa.children.length > 3) caixa.firstChild.remove();
  setTimeout(() => b.classList.add('sobe'), texto ? 7000 : 2600);
  setTimeout(() => b.remove(), texto ? 8600 : 4200);
}
function jgTicker(item) {
  const tk = $('#jg-ticker'); if (!tk) return;
  const vazio = $('.jg-tk-vazio', tk); if (vazio) vazio.remove();
  const ag = JG_ESTADO.agentes[item.agente];
  const foto = ag && EV_AVATARES.includes(ag.slug) ? `<img src="/plataforma/agentes/${ag.slug}.jpg" alt="">` : '<span class="jg-tk-p">👤</span>';
  const hora = item.hora ? String(item.hora).replace(' ', 'T').slice(11, 16) : new Date().toTimeString().slice(0, 5);
  const el = document.createElement('div'); el.className = 'jg-tk';
  el.innerHTML = `${foto}<span class="e">${esc(item.emoji)}</span><span class="t"><b>${esc(ag ? ag.nome : 'Equipe')}</b> ${esc(item.texto)}</span><small>${esc(hora)}</small>`;
  tk.prepend(el);
  while (tk.children.length > 6) tk.lastChild.remove();
}

// ---------- fila de ações ----------
function jgDeEvento(e) {
  return { agente: e.agente, emoji: EV_EVENTO[e.tipo] || '💬', texto: e.texto, vai: JG_VAI[e.tipo] || null, hora: e.criado_em, alerta: e.tipo === 'alerta' };
}
function jgEnfileira(item, abertura) {
  if (!jgVivo() || !item || !item.texto) return;
  JG_ESTADO.vazio = false;
  item.texto = String(item.texto).replace(/\s+/g, ' ').slice(0, 110);
  item.abertura = !!abertura;
  JG_ESTADO.fila.push(item);
  if (!JG_ESTADO.rodando) jgRoda();
}
async function jgRoda() {
  JG_ESTADO.rodando = true;
  while (jgVivo() && JG_ESTADO.fila.length) {
    const it = JG_ESTADO.fila.shift();
    jgExecuta(it);
    await jgEspera(JG_ESTADO.fila.length > 6 ? 500 : 1300);
  }
  if (JG_ESTADO) JG_ESTADO.rodando = false;
}
async function jgExecuta(it) {
  jgTicker(it);
  if (it.agente === 'porta') return jgVisitante(it);
  const ag = JG_ESTADO.agentes[it.agente];
  if (!ag) return;
  if (it.festa) jgFesta();
  if (ag.ocupado || !it.vai || jgReduz() || ag.el.classList.contains('dorme')) {
    jgBalao(ag, it.emoji, it.texto, it.alerta ? 'alerta' : it.festa ? 'festa' : '');
    jgDigita(ag);
    return;
  }
  ag.ocupado = true;
  jgBalao(ag, it.emoji, it.texto, it.festa ? 'festa' : '');
  try {
    await jgAnda(ag, JG_LUGAR[it.vai]);
    ag.el.classList.add('faz');
    await jgEspera(2600);
    ag.el.classList.remove('faz');
    await jgVolta(ag);
  } finally { ag.ocupado = false; }
}
function jgDigita(ag) {
  const mesa = $(`.jg-mesa[data-slug="${ag.slug}"]`);
  ag.el.classList.add('digita'); if (mesa) mesa.classList.add('liga');
  clearTimeout(ag.tDig);
  ag.tDig = setTimeout(() => { ag.el.classList.remove('digita'); if (mesa) mesa.classList.remove('liga'); }, 4200);
}
// Alguém da equipe entra pela porta (ex.: "Marcelo chegou no escritório").
async function jgVisitante(it) {
  const g = document.createElement('div');
  g.className = 'jg-ag jg-pessoa anda'; g.style.setProperty('--c', '#8a8f98');
  g.innerHTML = `<div class="jg-baloes"></div><div class="jg-boneco"><span class="jg-sombra"></span><span class="jg-pernas"><i></i><i></i></span><span class="jg-corpo"></span><span class="jg-cab jg-cab-p">👤</span></div>`;
  $('#jg-gente').appendChild(g);
  const p = { el: g, x: JG_LUGAR.porta[0], y: JG.H + 40, slug: 'pessoa' };
  g.style.left = `${p.x}px`; g.style.top = `${p.y}px`; g.style.zIndex = '2000';
  await jgEspera(60);
  await jgPasso(p, JG_LUGAR.recepcao[0], JG_LUGAR.recepcao[1]);
  g.classList.remove('anda');
  jgBalao(p, it.emoji, it.texto);
  await jgEspera(3800);
  g.classList.add('anda');
  await jgPasso(p, JG_LUGAR.sofa[0] + 120, JG.CORREDOR);
  g.classList.add('some');
  setTimeout(() => g.remove(), 900);
}
function jgFesta() {
  const c = $('#jg-confete'); if (!c || jgReduz()) return;
  const cores = ['#e8c36a', '#3ddc84', '#ff8a8a', '#7fb4ff', '#c9a0ff', '#ffb38a'];
  c.innerHTML = Array.from({ length: 90 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${cores[i % cores.length]};animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(2.4 + Math.random() * 1.6).toFixed(2)}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
  setTimeout(() => { if (c) c.innerHTML = ''; }, 4800);
}
// Vida no escritório quando não há nada acontecendo: café, alongar, olhar o celular (só emoji, sem inventar ação).
function jgVidaNoEscritorio() {
  if (!jgVivo()) return jgPara();
  if (JG_ESTADO.fila.length) return;
  const livres = Object.values(JG_ESTADO.agentes).filter((a) => !a.ocupado && !a.el.classList.contains('dorme'));
  if (!livres.length) return;
  const ag = livres[Math.floor(Math.random() * livres.length)];
  const r = Math.random();
  if (r < 0.32 && !jgReduz()) {
    ag.ocupado = true;
    (async () => { try { await jgAnda(ag, [JG_LUGAR.cafe[0] + (Math.random() * 40 - 20), JG_LUGAR.cafe[1]]); jgBalao(ag, '☕', '', 'leve'); await jgEspera(2200); await jgVolta(ag); } finally { ag.ocupado = false; } })();
  } else if (r < 0.6) {
    jgDigita(ag);
  } else if (r < 0.75) {
    ag.el.classList.add('estica'); setTimeout(() => ag.el.classList.remove('estica'), 1600);
  } else if (r < 0.85) {
    jgBalao(ag, ['📱', '💭', '📋', '🙂'][Math.floor(Math.random() * 4)], '', 'leve');
  }
}
