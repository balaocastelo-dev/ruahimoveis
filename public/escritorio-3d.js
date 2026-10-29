/* Herrera HOUSE IA — Escritório ao vivo em 3D (#/whats/ao-vivo).
   O mesmo escritório do modo jogo (escritorio-jogo.js), agora como uma maquete realista em three.js: piso de carvalho,
   fachada de vidro com a cidade lá fora acompanhando a hora do dia, três salas separadas por vidro, mesas com monitores,
   os 9 agentes sentados digitando e andando pelos corredores quando acontece algo. Os balões, o ticker, o HUD e as
   etiquetas são HTML projetado por cima da cena (texto nítido). Módulo ES carregado por import() a partir do escritorio-jogo.js.
   Reusa do app: $, esc, api, toast, ACT, poll, MARCA; do escritorio-jogo.js: jgDeEvento, JG_EMOJI_VAI, jgReduz, jgEspera.
   Ganchos para outros módulos: window.jg3dTelaDoAgente(slug, imagem) pinta o monitor do agente;
   window.abrePcDoAgente(slug), se existir, é chamado ao dar duplo clique num agente. */
import * as THREE from '/vendor/three/three.module.min.js';
import { OrbitControls } from '/vendor/three/OrbitControls.js';
import { mergeGeometries } from '/vendor/three/BufferGeometryUtils.js';

// ---------- textos da interface (os balões vêm do servidor em português e ficam como estão) ----------
const T = {
  pt: { vivo: 'ao vivo', acoes: 'ações hoje', conversas: 'conversas', enviadas: 'enviadas', aprovar: 'para aprovar', cheia: 'Tela cheia (F)', apres: 'Modo apresentação',
    painel: 'Painel de hoje', noar: 'no WhatsApp', captacao: 'Sala de captação', vendas: 'Salão de vendas', diretoria: 'Diretoria', entrada: 'Entrada', mural: 'Mural de oportunidades',
    cafe: 'Café', recepcao: 'Recepção', reuniao: 'Reunião', plantao: 'Plantão', impressora: 'Impressora', vazio: 'Quando os agentes trabalharem, cada ação aparece aqui e num balão em cima de quem fez.',
    abrir: 'Abrir a mesa', fechar: 'Fechar', esperando: 'Esperando o primeiro cliente do dia…', dica: 'Arraste para girar · roda para aproximar · duplo clique num agente abre a mesa',
    virtual: 'escritório virtual', inativo: 'inativo', equipe: 'Equipe', ver2d: 'Ver em 2D', ver3d: 'Ver em 3D', hoje: 'hoje', sem3d: 'Seu navegador não abriu o 3D; mostrando a versão 2D.' },
  en: { vivo: 'live', acoes: 'actions today', conversas: 'conversations', enviadas: 'sent', aprovar: 'to approve', cheia: 'Full screen (F)', apres: 'Presentation mode',
    painel: "Today's board", noar: 'on WhatsApp', captacao: 'Sourcing room', vendas: 'Sales floor', diretoria: 'Management', entrada: 'Entrance', mural: 'Opportunity board',
    cafe: 'Coffee', recepcao: 'Reception', reuniao: 'Meeting', plantao: 'Front desk', impressora: 'Printer', vazio: 'As the agents work, every action shows up here and in a balloon above whoever did it.',
    abrir: 'Open desk', fechar: 'Close', esperando: 'Waiting for the first client of the day…', dica: 'Drag to rotate · wheel to zoom · double-click an agent to open their desk',
    virtual: 'virtual office', inativo: 'inactive', equipe: 'Team', ver2d: 'View in 2D', ver3d: 'View in 3D', hoje: 'today', sem3d: 'Your browser could not open 3D; showing the 2D view.' },
  ja: { vivo: 'ライブ', acoes: '本日のアクション', conversas: '会話', enviadas: '送信済み', aprovar: '承認待ち', cheia: '全画面 (F)', apres: 'プレゼンモード',
    painel: '本日のボード', noar: 'WhatsApp接続中', captacao: '物件開拓室', vendas: '営業フロア', diretoria: '経営室', entrada: '入口', mural: '案件ボード',
    cafe: 'カフェ', recepcao: '受付', reuniao: '会議', plantao: 'フロント', impressora: 'プリンター', vazio: 'エージェントが働くと、各アクションがここと担当者の上の吹き出しに表示されます。',
    abrir: 'デスクを開く', fechar: '閉じる', esperando: '本日最初のお客様をお待ちしています…', dica: 'ドラッグで回転 · ホイールでズーム · エージェントをダブルクリックでデスクを開く',
    virtual: 'バーチャルオフィス', inativo: '休止中', equipe: 'チーム', ver2d: '2Dで見る', ver3d: '3Dで見る', hoje: '本日', sem3d: 'ブラウザで3Dを開けませんでした。2D表示にしています。' },
};
let LANG = 'pt';
try { const l = localStorage.getItem('jg3d-lang'); if (T[l]) LANG = l; } catch {}
const t = (k) => (T[LANG] && T[LANG][k]) || T.pt[k] || k;

// ---------- planta (metros): x da esquerda para a direita, z do fundo (janelas, -7) para a frente (entrada, +7) ----------
const SALA = { X: 12, Z: 7, H: 3.4, CORREDOR: 3.9, VIDRO: [-5.3, 5.2] };
const MESAS = {
  captador: [-8.5, -2.5],
  apartamentos: [-3, -2.5], comerciais: [0, -2.5], terrenos: [3, -2.5],
  casas: [-3, 1.9], 'alto-padrao': [0, 1.9], offmarket: [3, 1.9],
  gerente: [7.4, -2.5], 'gerente-corretores': [10.2, -2.5],
};
const SENTA = 0.95; // o agente senta a esta distância (em z) do centro da mesa, de frente para as janelas
const LUGAR = {
  mural: [-10.4, -5.3], impressora: [-10.2, 2.4], porta: [0, 7.6], recepcao: [0.9, 5.3], cafe: [-4.6, 5.3],
  tv: [10.4, -5.3], reuniao: [8.7, 4.2], sofa: [3.2, 5.1], plantao: [-2.2, 5.0],
};
const ZONAS = [['captacao', -8.6], ['vendas', 0], ['diretoria', 8.6]];
const AVATARES = ['captador', 'apartamentos', 'comerciais', 'terrenos', 'casas', 'alto-padrao', 'offmarket', 'gerente', 'gerente-corretores'];

let E = null; // estado da cena aberta
const vivo = () => E && document.body.contains(E.raiz);
const reduz = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const celular = () => matchMedia('(max-width: 720px)').matches;
const lerp = (a, b, k) => a + (b - a) * k;
const suave = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ====================================================================== tela
export async function telaEscritorio3D() {
  if (E) para();
  const d = await api('GET', '/api/escritorio/ao-vivo?full=1');
  if (E) para();
  const main = $('#main');
  main.innerHTML = `<div class="jg-topo"><div><a class="muted small" href="#/whats">← Escritório virtual</a><div class="eyebrow">Atendimento · ao vivo</div>
      <h1>Escritório ao vivo</h1><p class="lead">Os agentes da ${esc(MARCA.cliente)} trabalhando: cada atendimento, visita, captação e ação da equipe sobe num balão na hora em que acontece.</p></div>
    <div class="jg-topo-acoes"><button class="btn pri" data-act="j3-cheia">⛶ Tela cheia</button></div></div>
  <div class="j3" id="j3" tabindex="-1">
    <canvas class="j3-tela" id="j3-tela" aria-label="Escritório virtual em 3D"></canvas>
    <div class="j3-ovl" id="j3-ovl"></div>
    <div class="jg-confete" id="j3-confete"></div>
    <div class="j3-hud" id="j3-hud"></div>
    <div class="j3-ticker" id="j3-ticker"></div>
    <div class="j3-card" id="j3-card" hidden></div>
    <div class="j3-dica" id="j3-dica"></div>
    <div class="j3-carregando" id="j3-carregando"><i></i></div>
  </div>`;
  const raiz = $('#j3');
  E = { raiz, ev: d.ev, au: d.au, agentes: {}, fila: [], rodando: false, overlays: [], idleDesde: performance.now(), apres: false, totais: d.totais || {}, voo: null, tempo: 0, dados: d, hover: null };
  hud();
  try {
    montaCena();
  } catch (e) {
    console.warn('3D falhou:', e);
    para();
    throw e;
  }
  montaAgentes(d.agentes || []);
  numeros(d);
  relogio();
  tvPinta();
  const meu0 = E;
  d.eventos.forEach((e, i) => setTimeout(() => { if (E === meu0) enfileira(jgDeEvento(e), true); }, 1200 + i * 1500));
  if (!d.eventos.length) setTimeout(() => { if (E === meu0) balao(E.agentes['gerente-corretores'], '👀', t('esperando'), 'leve'); }, 1800);
  let n = 0; const meu = E;
  const iv = setInterval(async () => {
    if (E !== meu) return clearInterval(iv);
    if (!vivo()) return para();
    n++;
    try {
      const r = await api('GET', `/api/escritorio/ao-vivo?ev=${E.ev}&au=${E.au}${n % 6 === 0 ? '&full=1' : ''}`);
      if (!vivo() || E !== meu) return;
      E.ev = r.ev; E.au = r.au;
      r.eventos.forEach((e) => enfileira(jgDeEvento(e)));
      r.sistema.forEach((s) => enfileira({ agente: s.agente, emoji: s.emoji, texto: s.texto, vai: JG_EMOJI_VAI[s.emoji] || null, hora: s.criado_em, festa: s.emoji === '🎉' }));
      if (r.agentes) { atualizaAgentes(r.agentes); numeros(r); }
    } catch {}
  }, 4000);
  poll = iv; E.iv = iv;
  E.vida = setInterval(vidaNoEscritorio, 6500);
  E.relogio = setInterval(relogio, 20000);
  E.ssaver = setInterval(() => { if (vivo()) Object.values(E.agentes).forEach((ag) => ag.tela && !ag.tela.externa && telaPinta(ag)); }, 30000);
  document.addEventListener('fullscreenchange', redimensiona);
  document.addEventListener('keydown', tecla);
  if (!reduz()) setTimeout(() => { if (E === meu) { $('#j3-dica').classList.add('ve'); setTimeout(() => $('#j3-dica') && $('#j3-dica').classList.remove('ve'), 7000); } }, 2500);
}

function para() {
  clearInterval(poll);
  if (!E) return;
  const e = E; E = null;
  clearInterval(e.iv); clearInterval(e.vida); clearInterval(e.relogio); clearInterval(e.ssaver);
  if (e.ro) e.ro.disconnect();
  document.removeEventListener('fullscreenchange', redimensiona);
  document.removeEventListener('keydown', tecla);
  try {
    if (e.renderer) {
      e.renderer.setAnimationLoop(null);
      e.controls && e.controls.dispose();
      e.cena && e.cena.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { for (const k of ['map', 'emissiveMap', 'alphaMap', 'roughnessMap', 'normalMap']) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose && m.dispose(); }
      });
      if (e.ambiente) e.ambiente.dispose();
      e.renderer.dispose();
      e.renderer.forceContextLoss && e.renderer.forceContextLoss();
    }
  } catch {}
  for (const k of ['pointerdown', 'pointerup', 'pointermove', 'dblclick', 'wheel']) if (e.tela && e.escuta && e.escuta[k]) e.tela.removeEventListener(k, e.escuta[k]);
  if (e.urlsBlob) e.urlsBlob.forEach((u) => URL.revokeObjectURL(u));
}
export function jg3dPara() { para(); }
function tecla(e) {
  if (!vivo()) return para();
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
  if (e.key === 'f' || e.key === 'F') telaCheia();
  if (e.key === 'Escape') fechaCard();
  acordou();
}
function telaCheia() {
  const r = $('#j3'); if (!r) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (r.requestFullscreen) r.requestFullscreen().catch(() => toast('O navegador não deixou abrir em tela cheia.'));
  else toast('Este navegador não tem tela cheia. Use F11.');
}
ACT['j3-cheia'] = () => telaCheia();
ACT['j3-lang'] = (el) => { LANG = el.dataset.lang; try { localStorage.setItem('jg3d-lang', LANG); } catch {} hud(); if (E) { numeros({ totais: E.totais }); tvPinta(); Object.values(E.agentes).forEach((ag) => { if (ag.tela && !ag.tela.externa) telaPinta(ag); etiquetaNome(ag); }); zonasTexto(); $('#j3-dica').textContent = t('dica'); if (!$('#j3-card').hidden && E.cardSlug) cardAgente(E.cardSlug); } };
ACT['j3-fecha-card'] = () => fechaCard();
ACT['j3-apres'] = () => { if (!E) return; E.apres = !E.apres; E.idleDesde = E.apres ? -1e9 : performance.now(); $('#j3-hud .j3-apres').classList.toggle('on', E.apres); };

// ---------- HUD, ticker, relógio, números ----------
function hud() {
  if (!E) return;
  const langs = [['pt', 'PT'], ['en', 'EN'], ['ja', '日本語']];
  $('#j3-hud').innerHTML = `<div class="jg-vivo"><i></i>${esc(t('vivo'))}</div><div class="jg-relogio"><b id="j3-hora">--:--</b><span id="j3-data"></span></div><span class="sp"></span>
    <div class="jg-num"><b id="j3-n-acoes">0</b><span>${esc(t('acoes'))}</span></div>
    <div class="jg-num"><b id="j3-n-conv">0</b><span>${esc(t('conversas'))}</span></div>
    <div class="jg-num"><b id="j3-n-env">0</b><span>${esc(t('enviadas'))}</span></div>
    <div class="jg-num q"><b id="j3-n-apr">0</b><span>${esc(t('aprovar'))}</span></div>
    <span class="j3-seg j3-lang">${langs.map(([k, n]) => `<button class="${k === LANG ? 'on' : ''}" data-act="j3-lang" data-lang="${k}">${n}</button>`).join('')}</span>
    <span class="j3-seg"><button class="on" title="${esc(t('ver3d'))}">3D</button><button data-act="jg-modo" data-modo="2d" title="${esc(t('ver2d'))}">2D</button></span>
    <button class="jg-bt j3-apres ${E.apres ? 'on' : ''}" data-act="j3-apres" title="${esc(t('apres'))}">▶</button>
    <button class="jg-bt" data-act="j3-cheia" title="${esc(t('cheia'))}">⛶</button>`;
  const tk = $('#j3-ticker');
  if (!tk.children.length || tk.querySelector('.jg-tk-vazio')) tk.innerHTML = `<span class="jg-tk-vazio">${esc(t('vazio'))}</span>`;
  $('#j3-dica').textContent = t('dica');
  relogio();
}
function relogio() {
  if (!vivo()) return;
  const a = new Date(); const h = a.getHours() + a.getMinutes() / 60;
  const loc = LANG === 'ja' ? 'ja-JP' : LANG === 'en' ? 'en-US' : 'pt-BR';
  $('#j3-hora').textContent = a.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  $('#j3-data').textContent = a.toLocaleDateString(loc, { weekday: 'short', day: '2-digit', month: 'short' });
  E.hora = h;
  climaAlvo(h);
}
function numeros(d) {
  if (!d || !d.totais || !vivo()) return;
  E.totais = d.totais; const x = d.totais;
  const anima = (id, v) => { const el = $('#' + id); if (!el) return; if (el.textContent !== String(v)) { el.textContent = v; el.parentNode.classList.remove('pula'); void el.offsetWidth; el.parentNode.classList.add('pula'); } };
  anima('j3-n-acoes', x.acoes); anima('j3-n-conv', x.conversas); anima('j3-n-env', x.enviadas); anima('j3-n-apr', x.aprovar);
  $('#j3-n-apr').parentNode.classList.toggle('quente', x.aprovar > 0);
  tvPinta();
}
function ticker(item) {
  const tk = $('#j3-ticker'); if (!tk) return;
  const vazio = tk.querySelector('.jg-tk-vazio'); if (vazio) vazio.remove();
  const ag = E.agentes[item.agente];
  const foto = ag && AVATARES.includes(ag.slug) ? `<img src="/plataforma/agentes/${ag.slug}.svg" alt="">` : '<span class="jg-tk-p">👤</span>';
  const hora = item.hora ? String(item.hora).replace(' ', 'T').slice(11, 16) : new Date().toTimeString().slice(0, 5);
  const el = document.createElement('div'); el.className = 'jg-tk';
  el.innerHTML = `${foto}<span class="e">${esc(item.emoji)}</span><span class="t"><b>${esc(ag ? ag.nome : t('equipe'))}</b> ${esc(item.texto)}</span><small>${esc(hora)}</small>`;
  tk.prepend(el);
  while (tk.children.length > 6) tk.lastChild.remove();
}

// ====================================================================== cena
function montaCena() {
  const raiz = E.raiz; const tela = $('#j3-tela');
  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, celular() ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  E.renderer = renderer; E.tela = tela;
  const cena = new THREE.Scene(); E.cena = cena;
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 600); E.camera = camera;
  const aspecto = Math.max(0.4, raiz.clientWidth / Math.max(1, raiz.clientHeight));
  const dist = Math.min(38, 23 * Math.max(1, 1.6 / aspecto));
  camera.position.set(3, dist * 0.46, dist * 0.9);
  const controls = new OrbitControls(camera, tela); E.controls = controls;
  controls.target.set(0, 0.8, -0.5);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 3.5; controls.maxDistance = 44;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.38;
  controls.minAzimuthAngle = -1.35; controls.maxAzimuthAngle = 1.35;
  controls.zoomSpeed = 0.8; controls.rotateSpeed = 0.7; controls.panSpeed = 0.8; controls.screenSpacePanning = false;
  controls.addEventListener('start', () => { acordou(); E.voo = null; });
  controls.update();

  // reflexos: ambiente de estúdio pequeno gerado na hora (PMREM)
  const pm = new THREE.PMREMGenerator(renderer);
  E.ambiente = pm.fromScene(ambienteEstudio(), 0.04);
  pm.dispose();
  cena.environment = E.ambiente.texture;

  // luzes
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.4); sol.position.set(-9, 16, -13); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
  Object.assign(sol.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 2, far: 60 });
  sol.target.position.set(0, 0, 0); cena.add(sol, sol.target); E.sol = sol;
  const hemi = new THREE.HemisphereLight(0xcfe0f5, 0xa68a66, 0.7); cena.add(hemi); E.hemi = hemi;
  const amb = new THREE.AmbientLight(0xffffff, 0.12); cena.add(amb); E.amb = amb;
  // luzes práticas (noite): uma por sala, quentes, sem sombra
  E.praticas = [[-8.5, -0.5], [-1.5, -0.5], [1.5, -0.5], [8.8, -0.5], [-2.6, 5.2], [3.6, 5.2], [8.7, 4.8]].map(([x, z]) => { const l = new THREE.PointLight(0xffc48a, 0, 11, 1.6); l.position.set(x, 2.7, z); cena.add(l); return l; });

  constroiPredio(cena);
  constroiMobilia(cena);
  constroiCidade(cena);
  E.clima = { solI: 2.4, hemiI: 0.7, exp: 1.0, pratI: 0, cidade: 0, sol: new THREE.Color(0xfff1dc), ceuTopo: new THREE.Color(0x4f8fd6), ceuHor: new THREE.Color(0xdbe9f5), ceuBaixo: new THREE.Color(0x9aa7b2), hemiCeu: new THREE.Color(0xcfe0f5), hemiChao: new THREE.Color(0xa68a66), solPos: new THREE.Vector3(-9, 16, -13), estrelas: 0, fog: new THREE.Color(0xdbe9f5) };
  cena.fog = new THREE.Fog(0xdbe9f5, 45, 230);
  climaAlvo(new Date().getHours() + new Date().getMinutes() / 60, true);

  // eventos de interação
  E.escuta = {};
  const ray = new THREE.Raycaster(); const ponteiro = new THREE.Vector2(); E.ray = ray; E.ponteiro = ponteiro;
  const posPonteiro = (ev) => { const r = tela.getBoundingClientRect(); ponteiro.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); };
  let desceu = null;
  E.escuta.pointerdown = (ev) => { desceu = [ev.clientX, ev.clientY, performance.now()]; acordou(); };
  E.escuta.pointerup = (ev) => {
    if (!desceu) return; const [x, y, t0] = desceu; desceu = null;
    if (Math.hypot(ev.clientX - x, ev.clientY - y) > 6 || performance.now() - t0 > 600) return;
    posPonteiro(ev); const hit = acerta();
    if (hit && hit.tipo === 'monitor') vaiAoAgente(hit.slug);
  };
  E.escuta.dblclick = (ev) => { posPonteiro(ev); const hit = acerta(); if (hit) vaiAoAgente(hit.slug); };
  E.escuta.pointermove = (ev) => { if (ev.pointerType === 'touch') return; posPonteiro(ev); E.querHover = true; acordou(); };
  E.escuta.wheel = () => acordou();
  for (const k of Object.keys(E.escuta)) tela.addEventListener(k, E.escuta[k], { passive: true });

  if (window.ResizeObserver) { const ro = new ResizeObserver(() => redimensiona()); ro.observe(raiz); E.ro = ro; }
  redimensiona();
  E.t0 = performance.now();
  renderer.setAnimationLoop(quadro);
  $('#j3-carregando').remove();
}
function redimensiona() {
  if (!vivo()) return;
  const r = E.raiz; const w = Math.max(1, r.clientWidth); const h = Math.max(1, r.clientHeight);
  E.renderer.setSize(w, h, false);
  E.camera.aspect = w / h; E.camera.updateProjectionMatrix();
  E.W = w; E.H = h;
}
function acordou() { if (E && !E.apres) E.idleDesde = performance.now(); }

// estúdio para os reflexos (parecido com o RoomEnvironment do three, bem simplificado)
function ambienteEstudio() {
  const s = new THREE.Scene();
  const sala = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, side: THREE.BackSide, roughness: 1 }));
  sala.scale.set(20, 20, 20); sala.position.y = 9; s.add(sala);
  const luz = new THREE.PointLight(0xffffff, 900, 60, 2); luz.position.set(0, 14, 0); s.add(luz);
  const painel = (w, h, x, y, z, ry, cor, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: cor })); m.material.color.multiplyScalar(i); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); return m; };
  painel(10, 4, 0, 17, -4, 0, 0xffffff, 12).rotation.x = Math.PI / 2; // teto
  painel(6, 3, -9.5, 8, 0, Math.PI / 2, 0xfff2e0, 4);
  painel(6, 3, 9.5, 8, 0, -Math.PI / 2, 0xe0ecff, 4);
  painel(12, 4, 0, 6, -9.5, 0, 0xbcd4f5, 6); // janela "fria" ao fundo
  return s;
}

// ---------- materiais e geometria compartilhados ----------
const MAT = {};
function materiais() {
  if (MAT.ok) return MAT;
  MAT.ok = true;
  MAT.parede = new THREE.MeshStandardMaterial({ color: 0xece6db, roughness: 0.92 });
  MAT.paredeCorte = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.8 });
  MAT.pedra = new THREE.MeshStandardMaterial({ color: 0x3b393d, roughness: 0.5, metalness: 0.05 });
  MAT.aluminio = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.4, metalness: 0.65 });
  MAT.vidro = new THREE.MeshPhysicalMaterial({ color: 0xd9ecf8, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false });
  MAT.vidroFosco = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0.42, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  MAT.madeira = new THREE.MeshStandardMaterial({ color: 0xb98c5e, roughness: 0.55 });
  MAT.madeiraClara = new THREE.MeshStandardMaterial({ map: texturaMadeiraClara(), roughness: 0.5 });
  MAT.preto = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.5, metalness: 0.2 });
  MAT.plasticoEscuro = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55 });
  MAT.tecido = new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.95 });
  MAT.tecidoSofa = new THREE.MeshStandardMaterial({ color: 0x5e7b9a, roughness: 0.95 });
  MAT.branco = new THREE.MeshStandardMaterial({ color: 0xf3f3f1, roughness: 0.6 });
  MAT.cinzaClaro = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.55 });
  MAT.verde = new THREE.MeshStandardMaterial({ color: 0x3f8a46, roughness: 0.85 });
  MAT.verde2 = new THREE.MeshStandardMaterial({ color: 0x5ea85a, roughness: 0.85 });
  MAT.vaso = new THREE.MeshStandardMaterial({ color: 0xb8693f, roughness: 0.8 });
  MAT.cortica = new THREE.MeshStandardMaterial({ color: 0xc08f5e, roughness: 0.98 });
  MAT.papel = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.95 });
  MAT.vermelho = new THREE.MeshStandardMaterial({ color: 0xd6453a, roughness: 0.5 });
  MAT.dourado = new THREE.MeshStandardMaterial({ color: 0xc9a96f, roughness: 0.3, metalness: 0.8 });
  MAT.led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6b8, emissiveIntensity: 1.2, roughness: 0.4 });
  MAT.tapete = new THREE.MeshStandardMaterial({ color: 0x8a7f73, roughness: 1 });
  MAT.pele = new THREE.MeshStandardMaterial({ color: 0xd9a27c, roughness: 0.65 });
  MAT.cabelo = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.8 });
  MAT.calca = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.9 });
  MAT.sapato = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.45 });
  MAT.hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  MAT.sombra = new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false, opacity: 0.5 });
  return MAT;
}
// Lote: junta várias caixas/cilindros no mesmo material num só Mesh (menos draw calls).
class Lote {
  constructor(cena) { this.cena = cena; this.mapa = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone(); const m = new THREE.Matrix4(); const e = new THREE.Euler(rx, ry, rz);
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m);
    if (!this.mapa.has(mat)) this.mapa.set(mat, []); this.mapa.get(mat).push(g); return this;
  }
  caixa(w, h, d, mat, x, y, z, ry = 0) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry, 0); }
  cil(r1, r2, h, mat, x, y, z, seg = 18) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z); }
  fecha(sombra = true) {
    for (const [mat, gs] of this.mapa) {
      const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)), false); if (!g) continue;
      const m = new THREE.Mesh(g, mat); m.castShadow = sombra; m.receiveShadow = true; this.cena.add(m);
    }
    this.mapa.clear();
  }
}
const GEO = { caixa: new THREE.BoxGeometry(1, 1, 1) };

function texturaSombra() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(0.6, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const tx = new THREE.CanvasTexture(c); return tx;
}
function sombraContato(cena, x, z, w, d, op = 0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT.sombra.clone()); m.material.opacity = op;
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.renderOrder = 1; cena.add(m); return m;
}
// Piso de carvalho claro: tábuas desenhadas num canvas (sem baixar textura nenhuma).
function texturaPiso() {
  const S = 1024; const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#b8936a'; x.fillRect(0, 0, S, S);
  const linhas = 8, alt = S / linhas; let semente = 7;
  const rnd = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };
  for (let i = 0; i < linhas; i++) {
    let px = -rnd() * 400;
    while (px < S) {
      const w = 420 + rnd() * 380; const tom = 0.9 + rnd() * 0.22;
      x.fillStyle = `rgb(${Math.round(186 * tom)},${Math.round(148 * tom)},${Math.round(104 * tom)})`;
      x.fillRect(px, i * alt, w, alt);
      // veios
      x.globalAlpha = 0.16;
      for (let v = 0; v < 26; v++) { x.strokeStyle = rnd() < 0.5 ? '#8a6a44' : '#e3c8a0'; x.lineWidth = 0.6 + rnd() * 1.4; x.beginPath(); const y0 = i * alt + rnd() * alt; x.moveTo(px, y0); x.bezierCurveTo(px + w * 0.3, y0 + (rnd() - 0.5) * 10, px + w * 0.6, y0 + (rnd() - 0.5) * 10, px + w, y0 + (rnd() - 0.5) * 6); x.stroke(); }
      x.globalAlpha = 1;
      // frestas
      x.fillStyle = 'rgba(70,45,25,.55)'; x.fillRect(px + w - 2, i * alt, 2, alt);
      px += w;
    }
    x.fillStyle = 'rgba(70,45,25,.5)'; x.fillRect(0, i * alt + alt - 2, S, 2);
  }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(5, 3); tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = E.renderer.capabilities.getMaxAnisotropy(); return tx;
}
function texturaMadeiraClara() {
  const S = 512; const c = document.createElement('canvas'); c.width = S; c.height = S / 2; const x = c.getContext('2d');
  x.fillStyle = '#e4cba3'; x.fillRect(0, 0, S, S / 2);
  let s = 3; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  x.globalAlpha = 0.14;
  for (let v = 0; v < 70; v++) { x.strokeStyle = rnd() < 0.5 ? '#a98457' : '#f3e2c4'; x.lineWidth = 0.6 + rnd() * 1.8; x.beginPath(); const y0 = rnd() * S / 2; x.moveTo(0, y0); x.bezierCurveTo(S * 0.3, y0 + (rnd() - 0.5) * 14, S * 0.6, y0 + (rnd() - 0.5) * 14, S, y0 + (rnd() - 0.5) * 8); x.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

// ---------- o prédio: piso, paredes, fachada de vidro, divisórias ----------
function constroiPredio(cena) {
  const M = materiais(); const { X, Z, H } = SALA;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(X * 2, Z * 2), new THREE.MeshStandardMaterial({ map: texturaPiso(), roughness: 0.62, metalness: 0.0, envMapIntensity: 0.35 }));
  piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena.add(piso);
  const laje = new THREE.Mesh(new THREE.BoxGeometry(X * 2 + 0.6, 0.6, Z * 2 + 0.6), M.pedra); laje.position.y = -0.3; cena.add(laje);
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(X * 2 + 0.2, 60, Z * 2 + 0.2), new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.7, metalness: 0.2 })); corpo.position.y = -30.6; cena.add(corpo);
  const L = new Lote(cena);
  // fachada de vidro ao fundo (z=-7): três pilares sólidos (mural, marca, TV) e dois panos de vidro com montantes
  const pil = [[-X, -8.6], [-2.4, 2.4], [8.6, X]];
  for (const [a, b] of pil) { L.caixa(b - a, H, 0.3, M.pedra, (a + b) / 2, H / 2, -Z - 0.05); }
  const vidroG = new THREE.PlaneGeometry(6.2, H - 0.25);
  for (const cx of [-5.5, 5.5]) {
    const v = new THREE.Mesh(vidroG, M.vidro); v.position.set(cx, (H - 0.25) / 2 + 0.12, -Z); cena.add(v);
    for (let i = 0; i <= 4; i++) L.caixa(0.08, H, 0.14, M.aluminio, cx - 3.1 + i * 1.55, H / 2, -Z);
    L.caixa(6.2, 0.12, 0.16, M.aluminio, cx, 0.1, -Z); L.caixa(6.2, 0.1, 0.16, M.aluminio, cx, H - 0.06, -Z); L.caixa(6.2, 0.06, 0.12, M.aluminio, cx, 1.05, -Z);
  }
  // paredes laterais e da frente, cortadas na altura de uma maquete (1,05 m), com a borda clara
  const hC = 1.05;
  L.caixa(0.22, hC, Z * 2, M.parede, -X - 0.11, hC / 2, 0); L.caixa(0.22, hC, Z * 2, M.parede, X + 0.11, hC / 2, 0);
  L.caixa(0.26, 0.05, Z * 2 + 0.04, M.paredeCorte, -X - 0.11, hC + 0.02, 0); L.caixa(0.26, 0.05, Z * 2 + 0.04, M.paredeCorte, X + 0.11, hC + 0.02, 0);
  for (const [a, b] of [[-X - 0.22, -0.9], [0.9, X + 0.22]]) { L.caixa(b - a, hC, 0.22, M.parede, (a + b) / 2, hC / 2, Z + 0.11); L.caixa(b - a, 0.05, 0.26, M.paredeCorte, (a + b) / 2, hC + 0.02, Z + 0.11); }
  // porta de entrada: batente alto com vidro
  L.caixa(0.12, 2.35, 0.3, M.aluminio, -0.95, 1.175, Z + 0.11); L.caixa(0.12, 2.35, 0.3, M.aluminio, 0.95, 1.175, Z + 0.11); L.caixa(2.0, 0.12, 0.3, M.aluminio, 0, 2.36, Z + 0.11);
  const porta = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 2.26), M.vidro); porta.position.set(0, 1.17, Z + 0.11); cena.add(porta);
  L.caixa(0.04, 1.0, 0.04, M.aluminio, -0.2, 1.05, Z + 0.25); L.caixa(0.04, 1.0, 0.04, M.aluminio, 0.2, 1.05, Z + 0.25);
  // tapete da entrada
  L.caixa(2.4, 0.015, 1.3, M.tapete, 0, 0.008, Z - 0.8);
  // divisórias de vidro entre as três salas (do fundo até o corredor), com montantes e faixa jateada
  for (const vx of SALA.VIDRO) {
    const comp = Z + SALA.CORREDOR - 0.7; const zc = -Z + comp / 2;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(comp, 2.7), M.vidro); v.rotation.y = Math.PI / 2; v.position.set(vx, 1.37, zc); cena.add(v);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(comp, 0.28), M.vidroFosco); f.rotation.y = Math.PI / 2; f.position.set(vx, 1.3, zc); cena.add(f);
    L.caixa(0.08, 2.72, 0.08, M.aluminio, vx, 1.36, -Z + comp); L.caixa(0.1, 0.06, comp, M.aluminio, vx, 2.72, zc); L.caixa(0.1, 0.05, comp, M.aluminio, vx, 0.025, zc);
    for (let i = 1; i < 4; i++) L.caixa(0.05, 2.7, 0.05, M.aluminio, vx, 1.36, -Z + (comp / 4) * i);
  }
  L.fecha();
  // placa da imobiliária no pilar central, com LED por cima
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), new THREE.MeshStandardMaterial({ map: texturaPlaca(), roughness: 0.35, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
  placa.position.set(0, 2.05, -Z + 0.12); cena.add(placa); E.placa = placa;
  const led = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 0.08), M.led); led.position.set(0, 2.78, -Z + 0.16); cena.add(led); E.leds = [led];
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 0.08), M.led); base.position.set(0, 1.33, -Z + 0.16); cena.add(base); E.leds.push(base);
  // mural de oportunidades (pilar da esquerda) e TV (pilar da direita)
  const Lm = new Lote(cena);
  Lm.caixa(2.3, 1.3, 0.05, M.madeira, -10.3, 1.9, -Z + 0.14); Lm.caixa(2.16, 1.16, 0.03, M.cortica, -10.3, 1.9, -Z + 0.17);
  let s = 11; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 8; i++) { const px = -11.2 + i * 0.27 + rnd() * 0.05; const py = 1.6 + rnd() * 0.55; Lm.add(new THREE.BoxGeometry(0.21, 0.28, 0.01), M.papel, px, py, -Z + 0.19, 0, 0, (rnd() - 0.5) * 0.16); Lm.cil(0.012, 0.012, 0.02, M.vermelho, px, py + 0.13, -Z + 0.2, 8); }
  Lm.caixa(2.75, 1.6, 0.06, M.preto, 10.3, 2.0, -Z + 0.15);
  Lm.fecha(false);
  const tvCv = document.createElement('canvas'); tvCv.width = 1024; tvCv.height = 576; const tvTx = new THREE.CanvasTexture(tvCv); tvTx.colorSpace = THREE.SRGBColorSpace;
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.46), new THREE.MeshStandardMaterial({ map: tvTx, emissive: 0xffffff, emissiveMap: tvTx, emissiveIntensity: 0.9, roughness: 0.2 }));
  tv.position.set(10.3, 2.0, -Z + 0.19); cena.add(tv); E.tv = { cv: tvCv, tx: tvTx };
}
function texturaPlaca() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 416; const x = cv.getContext('2d');
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const pinta = (img) => {
    x.fillStyle = '#f7f1e6'; x.fillRect(0, 0, 1024, 416);
    x.strokeStyle = '#c9a96f'; x.lineWidth = 10; x.strokeRect(14, 14, 996, 388);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (img) { const k = Math.min(760 / img.width, 230 / img.height); const w = img.width * k, h = img.height * k; x.drawImage(img, 512 - w / 2, 190 - h / 2, w, h); }
    else {
      x.fillStyle = '#2b2622'; x.font = `600 ${(MARCA.empresa || MARCA.cliente || '').length > 22 ? 64 : 84}px "Cormorant Garamond", Georgia, serif`;
      x.fillText(MARCA.empresa || MARCA.cliente || 'Imobiliária', 512, 180, 900);
    }
    x.fillStyle = '#9a7b45'; x.font = '600 26px "DM Sans", system-ui, sans-serif';
    const sub = `${MARCA.sistema} · ${t('virtual')}`.toUpperCase().split('').join(String.fromCharCode(8202));
    x.fillText(sub, 512, 350, 940);
    tx.needsUpdate = true;
  };
  pinta(null);
  if (MARCA.logo) { const im = new Image(); im.onload = () => pinta(im); im.onerror = () => pinta(null); im.src = MARCA.logo; }
  return tx;
}
function tvPinta() {
  if (!E || !E.tv) return;
  const x = E.tv.cv.getContext('2d'); const tt = E.totais || {};
  const g = x.createLinearGradient(0, 0, 0, 576); g.addColorStop(0, '#15181d'); g.addColorStop(1, '#0c0e12');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 576);
  x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillStyle = '#7fe0c8'; x.font = '700 28px "DM Sans", system-ui, sans-serif'; x.fillText(t('painel').toUpperCase(), 56, 64);
  x.fillStyle = '#9aa3ad'; x.font = '500 26px "DM Sans", system-ui, sans-serif'; x.textAlign = 'right'; x.fillText(`${MARCA.cliente || ''}  ·  ${new Date().toLocaleTimeString(LANG === 'ja' ? 'ja-JP' : LANG === 'en' ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 968, 64);
  x.fillStyle = '#ff5c5c'; x.beginPath(); x.arc(968 - x.measureText(`${MARCA.cliente || ''}  ·  00:00`).width - 26, 64, 9, 0, Math.PI * 2); x.fill();
  const itens = [[`${tt.no_ar ?? 0}/9`, t('noar')], [tt.conversas ?? 0, t('conversas')], [tt.enviadas ?? 0, t('enviadas')], [tt.aprovar ?? 0, t('aprovar')]];
  itens.forEach(([v, l], i) => {
    const cx = 56 + (i % 2) * 470, cy = 150 + Math.floor(i / 2) * 200;
    x.fillStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.roundRect(cx, cy, 440, 170, 18); x.fill();
    x.textAlign = 'left'; x.fillStyle = i === 3 && tt.aprovar > 0 ? '#e8c36a' : '#ffffff'; x.font = '600 84px "JetBrains Mono", ui-monospace, monospace'; x.fillText(String(v), cx + 28, cy + 70);
    x.fillStyle = '#b7c0ca'; x.font = '500 28px "DM Sans", system-ui, sans-serif'; x.fillText(l, cx + 30, cy + 132);
  });
  E.tv.tx.needsUpdate = true;
}

// ---------- mobília ----------
function constroiMobilia(cena) {
  const M = materiais(); const { Z } = SALA; const L = new Lote(cena);
  // mesas (tampo em carvalho, pés em aço preto), monitores, teclado, caneca
  for (const [slug, [x, z]] of Object.entries(MESAS)) {
    L.caixa(1.6, 0.04, 0.8, M.madeiraClara, x, 0.74, z);
    L.caixa(0.05, 0.72, 0.7, M.preto, x - 0.74, 0.36, z); L.caixa(0.05, 0.72, 0.7, M.preto, x + 0.74, 0.36, z); L.caixa(1.48, 0.04, 0.05, M.preto, x, 0.08, z - 0.3);
    L.caixa(1.5, 0.3, 0.02, M.plasticoEscuro, x, 0.56, z - 0.38); // painel de privacidade
    L.cil(0.14, 0.17, 0.02, M.preto, x, 0.77, z - 0.18, 24); L.caixa(0.04, 0.26, 0.04, M.preto, x, 0.9, z - 0.2); // base e haste do monitor
    L.caixa(0.62, 0.4, 0.028, M.preto, x, 1.17, z - 0.17); // moldura
    L.caixa(0.42, 0.012, 0.14, M.plasticoEscuro, x, 0.766, z + 0.12); L.caixa(0.06, 0.02, 0.1, M.plasticoEscuro, x + 0.32, 0.77, z + 0.14); // teclado e mouse
    L.caixa(0.22, 0.012, 0.3, M.papel, x - 0.5, 0.766, z + 0.05, -0.3); // papel
    // cadeira (de frente para a mesa e as janelas)
    const cz = z + SENTA + 0.05;
    L.cil(0.26, 0.26, 0.02, M.preto, x, 0.03, cz, 20); L.cil(0.03, 0.03, 0.42, M.aluminio, x, 0.24, cz, 10);
    L.caixa(0.5, 0.08, 0.5, M.tecido, x, 0.47, cz); L.caixa(0.5, 0.56, 0.07, M.tecido, x, 0.82, cz + 0.24);
    L.caixa(0.06, 0.2, 0.36, M.preto, x - 0.27, 0.66, cz); L.caixa(0.06, 0.2, 0.36, M.preto, x + 0.27, 0.66, cz);
    sombraContato(cena, x, z, 2.4, 1.5, 0.45); sombraContato(cena, x, cz, 1.0, 1.0, 0.4);
    // luminária de mesa (acende à noite)
    L.cil(0.06, 0.07, 0.015, M.preto, x + 0.6, 0.76, z - 0.25, 12); L.caixa(0.015, 0.34, 0.015, M.preto, x + 0.6, 0.93, z - 0.25);
  }
  // café (canto da frente, à esquerda): balcão, máquina, xícaras
  L.caixa(1.8, 0.9, 0.6, M.madeira, -4.6, 0.45, Z - 0.42); L.caixa(1.86, 0.04, 0.66, M.pedra, -4.6, 0.92, Z - 0.42);
  L.caixa(0.34, 0.42, 0.36, M.preto, -5.0, 1.15, Z - 0.42); L.caixa(0.28, 0.1, 0.02, M.plasticoEscuro, -5.0, 1.25, Z - 0.61);
  for (let i = 0; i < 4; i++) L.cil(0.04, 0.035, 0.08, M.branco, -4.35 + i * 0.14, 0.98, Z - 0.45 + (i % 2) * 0.12, 10);
  L.caixa(0.5, 0.26, 0.3, M.cinzaClaro, -3.95, 1.07, Z - 0.42);
  sombraContato(cena, -4.6, Z - 0.5, 2.6, 1.3, 0.4);
  // balcão de recepção / plantão (frente à porta, à esquerda): curvo em madeira com tampo claro
  L.caixa(1.7, 1.05, 0.5, M.madeira, -2.2, 0.525, Z - 1.6); L.caixa(1.8, 0.04, 0.6, M.branco, -2.2, 1.07, Z - 1.6);
  L.caixa(0.5, 0.012, 0.35, M.papel, -2.2, 1.095, Z - 1.6); L.cil(0.04, 0.04, 0.16, M.dourado, -1.6, 1.17, Z - 1.6, 12);
  sombraContato(cena, -2.2, Z - 1.6, 2.4, 1.2, 0.45);
  // sofá e mesinha (direita da porta) sobre tapete
  L.caixa(2.6, 0.015, 1.9, M.tapete, 3.2, 0.008, Z - 1.5);
  L.caixa(1.9, 0.42, 0.85, M.tecidoSofa, 3.2, 0.3, Z - 0.75); L.caixa(1.9, 0.5, 0.2, M.tecidoSofa, 3.2, 0.7, Z - 0.42);
  L.caixa(0.2, 0.3, 0.85, M.tecidoSofa, 2.25, 0.64, Z - 0.75); L.caixa(0.2, 0.3, 0.85, M.tecidoSofa, 4.15, 0.64, Z - 0.75);
  L.caixa(0.9, 0.03, 0.5, M.madeiraClara, 3.2, 0.4, Z - 1.9); for (const [dx, dz] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]]) L.caixa(0.03, 0.4, 0.03, M.preto, 3.2 + dx, 0.2, Z - 1.9 + dz);
  sombraContato(cena, 3.2, Z - 0.8, 2.6, 1.3, 0.45);
  // impressora (esquerda, junto à parede)
  L.caixa(0.6, 0.5, 0.5, M.cinzaClaro, -11.3, 0.9, 2.4); L.caixa(0.7, 0.65, 0.6, M.branco, -11.3, 0.325, 2.4); L.caixa(0.4, 0.01, 0.3, M.papel, -11.3, 1.16, 2.5);
  sombraContato(cena, -11.3, 2.4, 1.2, 1.1, 0.4);
  // mesa de reunião redonda (diretoria, na frente) com 4 cadeiras
  L.cil(0.8, 0.8, 0.04, M.madeira, 8.7, 0.74, 5.2, 36); L.cil(0.06, 0.1, 0.72, M.preto, 8.7, 0.36, 5.2, 12); L.cil(0.4, 0.4, 0.02, M.preto, 8.7, 0.01, 5.2, 24);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const cx = 8.7 + Math.cos(a) * 1.15, cz = 5.2 + Math.sin(a) * 1.15; L.caixa(0.46, 0.06, 0.46, M.tecido, cx, 0.46, cz, -a); L.add(new THREE.BoxGeometry(0.46, 0.5, 0.06), M.tecido, cx + Math.cos(a) * 0.22, 0.75, cz + Math.sin(a) * 0.22, 0, -a + Math.PI / 2, 0); L.cil(0.03, 0.03, 0.44, M.aluminio, cx, 0.22, cz, 8); L.cil(0.22, 0.22, 0.02, M.preto, cx, 0.01, cz, 16); }
  sombraContato(cena, 8.7, 5.2, 3.2, 3.2, 0.4);
  // plantas em vasos
  for (const [x, z, k] of [[-11.2, 6.1, 1.1], [-6.4, -6.2, 1.0], [4.3, -6.2, 1.0], [11.2, 6.1, 1.1], [-11.2, -1.0, 0.8], [6.2, 0.6, 0.85]]) planta(L, x, z, k);
  // luminárias de piso (arco) — a cúpula acende à noite
  const cupulas = [];
  for (const [x, z] of [[-11.0, -4.4], [-1.6, 4.6], [11.0, -4.4], [5.9, 6.2]]) { L.cil(0.18, 0.18, 0.02, M.preto, x, 0.01, z, 16); L.cil(0.02, 0.02, 1.9, M.aluminio, x, 0.96, z, 8); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2e9d8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.8, side: THREE.DoubleSide })); c.position.set(x, 1.98, z); cena.add(c); cupulas.push(c); }
  E.cupulas = cupulas;
  L.fecha();
  // telas dos monitores (uma textura por agente) e caixa invisível de clique por mesa
  for (const [slug, [x, z]] of Object.entries(MESAS)) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.75, roughness: 0.25 });
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), mat); tela.position.set(x, 1.17, z - 0.155); tela.userData = { slug, tipo: 'monitor' }; cena.add(tela);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.9), MAT.hit); hit.position.set(x, 0.75, z + 0.4); hit.userData = { slug, tipo: 'mesa' }; cena.add(hit);
    E.monitores = E.monitores || {}; E.monitores[slug] = { cv, tx, mesh: tela, hit, externa: false };
  }
}
function planta(L, x, z, k = 1) {
  const M = materiais();
  L.cil(0.2 * k, 0.16 * k, 0.42 * k, M.vaso, x, 0.21 * k, z, 18); L.cil(0.17 * k, 0.17 * k, 0.02, M.pedra, x, 0.42 * k, z, 14);
  let s = Math.round(x * 13 + z * 7) & 0xffff; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, r = 0.12 + rnd() * 0.3; const g = new THREE.SphereGeometry(0.16 + rnd() * 0.14, 8, 6); g.scale(1, 0.45 + rnd() * 0.3, 1); L.add(g, i % 2 ? M.verde : M.verde2, x + Math.cos(a) * r * k, (0.6 + rnd() * 0.55) * k, z + Math.sin(a) * r * k, rnd() - 0.5, a, rnd() - 0.5); }
  sombraContato(E.cena, x, z, 1.2 * k, 1.2 * k, 0.4);
}

// ---------- a cidade lá fora: céu, prédios com janelas, estrelas ----------
function constroiCidade(cena) {
  const ceuMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { topo: { value: new THREE.Color(0x4f8fd6) }, hor: { value: new THREE.Color(0xdbe9f5) }, baixo: { value: new THREE.Color(0x9aa7b2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 topo,hor,baixo; varying vec3 vP; void main(){ float h=normalize(vP).y; vec3 c = h>0. ? mix(hor,topo,pow(h,.55)) : mix(hor,baixo,pow(-h,.5)); gl_FragColor=vec4(c,1.); }' });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), ceuMat); cena.add(ceu); E.ceu = ceuMat;
  // estrelas
  const n = 500; const pos = new Float32Array(n * 3); let s = 5; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3; pos[i * 3] = Math.cos(a) * Math.cos(e) * 380; pos[i * 3 + 1] = Math.sin(e) * 380; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380; }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const estrelas = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })); cena.add(estrelas); E.estrelas = estrelas;
  // prédios: janelas desenhadas num canvas; emissivo só à noite
  const jan = document.createElement('canvas'); jan.width = 256; jan.height = 512; const x = jan.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 512);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 4; c++) { if (rnd() < 0.48) { const q = 0.5 + rnd() * 0.5; x.fillStyle = rnd() < 0.8 ? `rgba(${Math.round(255 * q)},${Math.round((190 + rnd() * 40) * q)},${Math.round((110 + rnd() * 70) * q)},1)` : `rgba(${Math.round(190 * q)},${Math.round(215 * q)},${Math.round(255 * q)},1)`; x.fillRect(c * 64 + 14, r * 32 + 9, 36, 17); } }
  const janTx = new THREE.CanvasTexture(jan); janTx.wrapS = janTx.wrapT = THREE.RepeatWrapping; janTx.colorSpace = THREE.SRGBColorSpace;
  const dia = document.createElement('canvas'); dia.width = 256; dia.height = 512; const y = dia.getContext('2d');
  y.fillStyle = '#a9b6c4'; y.fillRect(0, 0, 256, 512); for (let r = 0; r < 16; r++) for (let c = 0; c < 4; c++) { y.fillStyle = rnd() < 0.5 ? '#7d94ad' : '#90a7bf'; y.fillRect(c * 64 + 14, r * 32 + 9, 36, 17); }
  const diaTx = new THREE.CanvasTexture(dia); diaTx.wrapS = diaTx.wrapT = THREE.RepeatWrapping; diaTx.colorSpace = THREE.SRGBColorSpace;
  const geos = []; E.predios = [];
  const tons = [0x8e9bab, 0x7d8a99, 0xa3adb8, 0x6c7886, 0x97a3b1];
  for (let i = 0; i < 110; i++) {
    const lado = rnd(); let px, pz;
    if (lado < 0.7) { px = -190 + rnd() * 380; pz = -60 - rnd() * 200; } else { px = (rnd() < 0.5 ? -1 : 1) * (85 + rnd() * 120); pz = -80 + rnd() * 110; }
    if (Math.abs(px) < 40 && pz > -60) continue;
    const longe = Math.hypot(px, pz);
    const w = 8 + rnd() * 13, d = 8 + rnd() * 13, h = 16 + rnd() * 34 + (longe > 150 && rnd() < 0.35 ? 30 + rnd() * 50 : 0); const base = -62 - rnd() * 16;
    const g = new THREE.BoxGeometry(w, h, d); g.translate(px, base + h / 2, pz);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 7), uv.getY(k) * (h / 14));
    geos.push(g);
  }
  const predios = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: diaTx, color: 0xffffff, emissive: 0xffffff, emissiveMap: janTx, emissiveIntensity: 0, roughness: 0.75, metalness: 0.1 }));
  cena.add(predios); E.predios = predios;
  // o chão da cidade, bem lá embaixo
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3b414b, roughness: 1 })); chao.rotation.x = -Math.PI / 2; chao.position.y = -48; cena.add(chao); E.chaoCidade = chao;
}
// Alvo da iluminação pela hora: dia, fim de tarde, noite (interpola suave no quadro).
function climaAlvo(h, agora) {
  if (!E || !E.clima) return;
  const C = (hex) => new THREE.Color(hex);
  let a;
  if (h >= 6.5 && h < 16.5) a = { solI: 1.7, hemiI: 0.65, exp: 0.95, pratI: 0, cidade: 0, estrelas: 0, sol: C(0xfff1dc), ceuTopo: C(0x3f82cf), ceuHor: C(0xd9e8f4), ceuBaixo: C(0x8f9ca8), hemiCeu: C(0xcfe0f5), hemiChao: C(0xa68a66), solPos: new THREE.Vector3(-9, 16, -13), fog: C(0xd9e8f4) };
  else if ((h >= 16.5 && h < 19) || (h >= 5.5 && h < 6.5)) a = { solI: 2.0, hemiI: 0.6, exp: 1.05, pratI: 14, cidade: 0.3, estrelas: 0, sol: C(0xffb36e), ceuTopo: C(0x4a5f9e), ceuHor: C(0xffbf8a), ceuBaixo: C(0x6d5a5f), hemiCeu: C(0xf5c9a0), hemiChao: C(0x8a6a4e), solPos: new THREE.Vector3(16, 4.5, -13), fog: C(0xf1c2a0) };
  else a = { solI: 0.25, hemiI: 0.4, exp: 1.0, pratI: 48, cidade: 0.75, estrelas: 0.9, sol: C(0x8ea4ff), ceuTopo: C(0x05080f), ceuHor: C(0x1a2340), ceuBaixo: C(0x0a0d14), hemiCeu: C(0x303c5e), hemiChao: C(0x2a1c12), solPos: new THREE.Vector3(-6, 14, -10), fog: C(0x141a2c) };
  E.alvo = a; E.modoCeu = a.estrelas > 0.5 ? 'noite' : a.cidade > 0 ? 'tarde' : 'dia';
  if (agora) { for (const k of Object.keys(a)) { if (a[k] && a[k].isColor) E.clima[k].copy(a[k]); else if (a[k] && a[k].isVector3) E.clima[k].copy(a[k]); else E.clima[k] = a[k]; } aplicaClima(); }
}
function aplicaClima() {
  const c = E.clima;
  E.sol.intensity = c.solI; E.sol.color.copy(c.sol); E.sol.position.copy(c.solPos);
  E.hemi.intensity = c.hemiI; E.hemi.color.copy(c.hemiCeu); E.hemi.groundColor.copy(c.hemiChao);
  E.renderer.toneMappingExposure = c.exp;
  E.praticas.forEach((l) => { l.intensity = c.pratI; });
  E.cupulas.forEach((m) => { m.material.emissiveIntensity = c.pratI / 25; });
  E.ceu.uniforms.topo.value.copy(c.ceuTopo); E.ceu.uniforms.hor.value.copy(c.ceuHor); E.ceu.uniforms.baixo.value.copy(c.ceuBaixo);
  E.cena.fog.color.copy(c.fog);
  E.predios.material.emissiveIntensity = c.cidade; E.predios.material.color.setScalar(1 - c.cidade * 0.75);
  E.estrelas.material.opacity = c.estrelas;
  E.leds.forEach((m) => { m.material.emissiveIntensity = 0.6 + c.pratI / 30; });
  E.placa.material.emissiveIntensity = 0;
}
function interpolaClima(dt) {
  const c = E.clima, a = E.alvo; if (!a || !a.sol) return;
  const k = Math.min(1, dt * 0.9);
  for (const n of ['solI', 'hemiI', 'exp', 'pratI', 'cidade', 'estrelas']) c[n] = lerp(c[n], a[n], k);
  for (const n of ['sol', 'ceuTopo', 'ceuHor', 'ceuBaixo', 'hemiCeu', 'hemiChao', 'fog']) c[n].lerp(a[n], k);
  c.solPos.lerp(a.solPos, k);
  aplicaClima();
}

// ====================================================================== agentes
function texturaRosto(slug, nome, cor) {
  const tam = 256; const cv = document.createElement('canvas'); cv.width = cv.height = tam; const x = cv.getContext('2d');
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const anel = () => { x.lineWidth = 9; x.strokeStyle = '#ffffff'; x.beginPath(); x.arc(tam / 2, tam / 2, tam / 2 - 6, 0, Math.PI * 2); x.stroke(); tx.needsUpdate = true; };
  // reserva: iniciais na cor do agente
  x.fillStyle = cor; x.beginPath(); x.arc(tam / 2, tam / 2, tam / 2 - 8, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.font = '700 92px "DM Sans", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(nome.slice(0, 2).toUpperCase(), tam / 2, tam / 2 + 6); anel();
  if (AVATARES.includes(slug)) {
    // o SVG não traz width/height: injeta para o navegador rasterizar no tamanho certo
    fetch(`/plataforma/agentes/${slug}.svg`, { credentials: 'same-origin' }).then((r) => r.text()).then((svg) => {
      const s2 = svg.replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${tam}" height="${tam}">`);
      const url = URL.createObjectURL(new Blob([s2], { type: 'image/svg+xml' })); (E.urlsBlob = E.urlsBlob || []).push(url);
      const im = new Image(); im.onload = () => { x.clearRect(0, 0, tam, tam); x.save(); x.beginPath(); x.arc(tam / 2, tam / 2, tam / 2 - 8, 0, Math.PI * 2); x.clip(); x.drawImage(im, 0, 0, tam, tam); x.restore(); anel(); }; im.src = url;
    }).catch(() => {});
  }
  return tx;
}
function texturaRostoEmoji(emoji) {
  const tam = 256; const cv = document.createElement('canvas'); cv.width = cv.height = tam; const x = cv.getContext('2d');
  x.fillStyle = '#e9dccd'; x.beginPath(); x.arc(tam / 2, tam / 2, tam / 2 - 8, 0, Math.PI * 2); x.fill();
  x.font = '140px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, tam / 2, tam / 2 + 10);
  x.lineWidth = 9; x.strokeStyle = '#fff'; x.beginPath(); x.arc(tam / 2, tam / 2, tam / 2 - 6, 0, Math.PI * 2); x.stroke();
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
// Boneco estilizado: pernas em duas partes (para sentar), tronco, braços, cabeça esférica e o rosto (sprite que olha sempre para a câmera).
function fazBoneco(cor, rostoTx, slug) {
  const M = materiais();
  const g = new THREE.Group(); g.userData = { slug, tipo: 'agente' };
  const roupa = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), roughness: 0.78 });
  const marca = (m) => { m.castShadow = true; m.userData = { slug, tipo: 'agente' }; return m; };
  const b = { g, roupa, partes: [] };
  const corpo = new THREE.Group(); g.add(corpo); b.corpo = corpo;
  // pernas
  b.coxas = []; b.canelas = [];
  for (const dx of [-0.11, 0.11]) {
    const coxa = new THREE.Group(); coxa.position.set(dx, 0.86, 0); corpo.add(coxa);
    const cm = marca(new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 10), M.calca)); cm.position.y = -0.2; coxa.add(cm);
    const canela = new THREE.Group(); canela.position.y = -0.42; coxa.add(canela);
    const cn = marca(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), M.calca)); cn.position.y = -0.2; canela.add(cn);
    const pe = marca(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), M.sapato)); pe.position.set(0, -0.4, -0.05); canela.add(pe);
    b.coxas.push(coxa); b.canelas.push(canela);
  }
  // tronco e quadril
  const quadril = marca(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.08, 4, 14), M.calca)); quadril.position.y = 0.9; quadril.scale.set(1, 0.7, 0.8); corpo.add(quadril);
  const tronco = marca(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 16), roupa)); tronco.position.y = 1.26; tronco.scale.set(1.05, 1, 0.78); corpo.add(tronco);
  const gola = marca(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 12), M.pele)); gola.position.y = 1.56; corpo.add(gola);
  // braços
  b.bracos = [];
  for (const dx of [-0.27, 0.27]) {
    const br = new THREE.Group(); br.position.set(dx, 1.48, 0); corpo.add(br);
    const m1 = marca(new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.3, 4, 10), roupa)); m1.position.y = -0.2; br.add(m1);
    const ante = new THREE.Group(); ante.position.y = -0.38; br.add(ante);
    const m2 = marca(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 10), M.pele)); m2.position.y = -0.17; ante.add(m2);
    b.bracos.push({ br, ante });
  }
  // cabeça: esfera (cabelo/volume) e o rosto por cima
  const cab = marca(new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), M.cabelo)); cab.position.y = 1.74; corpo.add(cab); b.cabeca = cab;
  const rosto = new THREE.Sprite(new THREE.SpriteMaterial({ map: rostoTx, transparent: true, depthWrite: false })); rosto.scale.set(0.44, 0.44, 1); rosto.position.y = 1.74; rosto.userData = { slug, tipo: 'agente' }; corpo.add(rosto); b.rosto = rosto;
  b.mats = [roupa];
  return b;
}
function sentaBoneco(b) {
  b.sentado = true; b.corpo.position.y = -0.39;
  b.coxas.forEach((c) => { c.rotation.x = Math.PI / 2; }); b.canelas.forEach((c) => { c.rotation.x = -Math.PI / 2 + 0.1; });
  b.bracos.forEach(({ br, ante }) => { br.rotation.x = 0.55; ante.rotation.x = 0.95; });
}
function levantaBoneco(b) {
  b.sentado = false; b.corpo.position.y = 0;
  b.coxas.forEach((c) => { c.rotation.x = 0; }); b.canelas.forEach((c) => { c.rotation.x = 0; });
  b.bracos.forEach(({ br, ante }) => { br.rotation.x = 0; ante.rotation.x = 0.15; });
}
function montaAgentes(lista) {
  for (const a of lista) {
    const m = MESAS[a.slug]; if (!m) continue;
    const b = fazBoneco(a.cor, texturaRosto(a.slug, a.nome, a.cor), a.slug);
    const ag = { slug: a.slug, nome: a.nome, cor: a.cor, dados: a, b, mesa: m, x: m[0], z: m[1] + SENTA, rot: Math.PI, rotAlvo: Math.PI, ocupado: false, andando: false, digita: 0, faz: 0, estica: 0, dorme: !a.ativo, tela: E.monitores[a.slug] };
    b.g.position.set(ag.x, 0, ag.z); b.g.rotation.y = Math.PI; // de frente para as janelas (olhando para -z)
    sentaBoneco(b); E.cena.add(b.g);
    // etiquetas HTML: nome e balões
    const ovl = $('#j3-ovl');
    const nome = document.createElement('div'); nome.className = 'j3-nome'; nome.style.setProperty('--c', a.cor); ovl.appendChild(nome);
    const baloes = document.createElement('div'); baloes.className = 'j3-baloes'; baloes.style.setProperty('--c', a.cor); ovl.appendChild(baloes);
    ag.elNome = nome; ag.elBaloes = baloes;
    E.agentes[a.slug] = ag;
    etiquetaNome(ag); telaPinta(ag);
  }
  zonasTexto();
  atualizaAgentes(lista);
}
function etiquetaNome(ag) {
  ag.elNome.innerHTML = `<i class="st"></i>${esc(ag.nome)}${ag.dorme ? `<small class="zz">z<small>z</small></small>` : ''}`;
  ag.elNome.classList.toggle('dorme', !!ag.dorme);
}
function zonasTexto() {
  const ovl = $('#j3-ovl'); if (!ovl) return;
  ovl.querySelectorAll('.j3-zona').forEach((z) => z.remove());
  E.zonas = ZONAS.map(([k, x]) => { const el = document.createElement('div'); el.className = 'j3-zona'; el.textContent = t(k); ovl.appendChild(el); return { el, pos: new THREE.Vector3(x, 3.05, -SALA.Z + 0.1) }; });
  const lugares = [['entrada', 0, 2.55, SALA.Z + 0.1], ['cafe', -4.6, 1.75, SALA.Z - 0.4], ['recepcao', -2.2, 1.55, SALA.Z - 1.6], ['reuniao', 8.7, 1.3, 5.2], ['mural', -10.3, 2.75, -SALA.Z + 0.2], ['impressora', -11.3, 1.5, 2.4]];
  E.lugares = lugares.map(([k, x, y, z]) => { const el = document.createElement('div'); el.className = 'j3-zona j3-lugar'; el.textContent = t(k); ovl.appendChild(el); return { el, pos: new THREE.Vector3(x, y, z) }; });
}
function atualizaAgentes(lista) {
  for (const a of lista) {
    const ag = E.agentes[a.slug]; if (!ag) continue;
    ag.dados = a; ag.nome = a.nome; ag.estado = a.estado;
    const dormia = ag.dorme; ag.dorme = !a.ativo;
    ag.b.mats.forEach((m) => { m.transparent = ag.dorme; m.opacity = ag.dorme ? 0.55 : 1; m.color.set(a.cor); if (ag.dorme) m.color.lerp(new THREE.Color(0x888888), 0.5); });
    ag.b.rosto.material.opacity = ag.dorme ? 0.6 : 1;
    ag.b.cabeca.rotation.z = ag.dorme ? 0.25 : 0;
    if (dormia !== ag.dorme && !ag.tela.externa) telaPinta(ag);
    etiquetaNome(ag);
    ag.elNome.dataset.estado = a.estado;
  }
}
// Protetor de tela do monitor (até alguém pintar a tela de verdade com window.jg3dTelaDoAgente).
function telaPinta(ag) {
  const m = ag.tela; if (!m || m.externa) return;
  const x = m.cv.getContext('2d'); const W = 512, H = 320;
  if (ag.dorme) { x.fillStyle = '#0a0b0e'; x.fillRect(0, 0, W, H); m.tx.needsUpdate = true; m.mesh.material.emissiveIntensity = 0.08; return; }
  m.mesh.material.emissiveIntensity = 0.75;
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#111722'); g.addColorStop(1, '#1b2434');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // janela de "chat" estilizada: cabeçalho + bolhas suaves (sem texto de cliente nenhum)
  x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.roundRect(22, 22, W - 44, H - 44, 14); x.fill();
  x.fillStyle = ag.cor; x.beginPath(); x.roundRect(22, 22, W - 44, 46, [14, 14, 0, 0]); x.fill();
  x.fillStyle = '#fff'; x.font = '700 20px "DM Sans", system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(`${ag.nome} · WhatsApp`, 42, 45);
  x.font = '500 15px "DM Sans", system-ui, sans-serif'; x.textAlign = 'right'; x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), W - 42, 45);
  let s = ag.slug.length * 31 + new Date().getMinutes(); const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let y = 90;
  for (let i = 0; i < 5 && y < H - 70; i++) { const w = 120 + rnd() * 180; const h = 26 + Math.round(rnd()) * 16; const dir = i % 2; x.fillStyle = dir ? 'rgba(127,224,200,.28)' : 'rgba(255,255,255,.14)'; x.beginPath(); x.roundRect(dir ? W - 42 - w : 42, y, w, h, 10); x.fill(); y += h + 12; }
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '600 14px "DM Sans", system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(`${MARCA.empresa || MARCA.cliente || ''} · ${MARCA.sistema}`, W / 2, H - 36);
  m.tx.needsUpdate = true;
}
// Gancho para outro módulo pintar a tela de verdade do agente (ImageBitmap, canvas, <img> ou <video>).
window.jg3dTelaDoAgente = function (slug, imagem) {
  if (!E || !E.monitores || !E.monitores[slug]) return false;
  const m = E.monitores[slug];
  try {
    const x = m.cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, m.cv.width, m.cv.height);
    const iw = imagem.width || imagem.videoWidth || m.cv.width, ih = imagem.height || imagem.videoHeight || m.cv.height;
    const k = Math.min(m.cv.width / iw, m.cv.height / ih); const w = iw * k, h = ih * k;
    x.drawImage(imagem, (m.cv.width - w) / 2, (m.cv.height - h) / 2, w, h);
    m.tx.needsUpdate = true; m.externa = true; m.mesh.material.emissiveIntensity = 0.8;
    return true;
  } catch (e) { console.warn('jg3dTelaDoAgente:', e); return false; }
};

// Estado da cena para outros módulos (ex.: o visualizador do PC do agente) e para testes: null quando o 3D não está aberto.
window.jg3dEstado = () => E;
// ---------- clique: ir até o agente e abrir a mesa ----------
function acerta() {
  E.ray.setFromCamera(E.ponteiro, E.camera);
  const alvos = []; for (const ag of Object.values(E.agentes)) alvos.push(ag.b.g); for (const m of Object.values(E.monitores)) alvos.push(m.mesh, m.hit);
  const hits = E.ray.intersectObjects(alvos, true);
  for (const h of hits) { let o = h.object; while (o && !(o.userData && o.userData.slug)) o = o.parent; if (o) return { slug: o.userData.slug, tipo: h.object.userData.tipo || o.userData.tipo }; }
  return null;
}
function vaiAoAgente(slug) {
  const ag = E.agentes[slug]; if (!ag) return;
  const [mx, mz] = ag.mesa;
  const lado = mx >= 3 || slug === 'gerente-corretores' ? -1 : 1;
  const p1 = new THREE.Vector3(mx + lado * 2.4, 2.3, mz - 2.6); const a1 = new THREE.Vector3(mx, 1.05, mz + 0.5);
  E.voo = { t0: performance.now(), dur: reduz() ? 1 : 1400, p0: E.camera.position.clone(), a0: E.controls.target.clone(), p1, a1 };
  acordou();
  if (typeof window.abrePcDoAgente === 'function') { try { window.abrePcDoAgente(slug); return; } catch (e) { console.warn(e); } }
  cardAgente(slug);
}
function cardAgente(slug) {
  const ag = E.agentes[slug]; const a = ag.dados || {}; const c = $('#j3-card'); E.cardSlug = slug;
  const foto = AVATARES.includes(slug) ? `<img src="/plataforma/agentes/${slug}.svg" alt="">` : `<span class="j3-ini" style="background:${esc(ag.cor)}">${esc(ag.nome.slice(0, 2))}</span>`;
  c.innerHTML = `<button class="j3-x" data-act="j3-fecha-card" title="${esc(t('fechar'))}">×</button>
    <div class="j3-card-topo">${foto}<div><b>${esc(ag.nome)}</b><span>${esc(a.cargo || '')}</span><small><i class="st" data-estado="${esc(a.estado || '')}"></i>${esc(a.estado === 'conectado' ? 'WhatsApp ' + t('vivo') : a.estado || '')}${ag.dorme ? ` · ${esc(t('inativo'))}` : ''}</small></div></div>
    <div class="j3-card-nums"><div><b>${a.conversas ?? 0}</b><span>${esc(t('conversas'))}</span></div><div><b>${a.enviadas ?? 0}</b><span>${esc(t('enviadas'))}</span></div><div class="${a.aprovar > 0 ? 'q' : ''}"><b>${a.aprovar ?? 0}</b><span>${esc(t('aprovar'))}</span></div></div>
    <a class="btn pri" href="#/whats/agente/${esc(slug)}">${esc(t('abrir'))} →</a>`;
  c.style.setProperty('--c', ag.cor); c.hidden = false;
}
function fechaCard() { const c = $('#j3-card'); if (c) { c.hidden = true; } if (E) E.cardSlug = null; }

// ====================================================================== quadro a quadro
const _v = new THREE.Vector3(); const _c = new THREE.Vector3();
function quadro(agoraMs) {
  if (!vivo()) return para();
  const dt = Math.min(0.05, (agoraMs - (E.ultimo || agoraMs)) / 1000); E.ultimo = agoraMs; E.tempo += dt;
  interpolaClima(dt);
  // voo da câmera
  if (E.voo) {
    const v = E.voo; const k = suave(Math.min(1, (agoraMs - v.t0) / v.dur));
    E.camera.position.lerpVectors(v.p0, v.p1, k); E.controls.target.lerpVectors(v.a0, v.a1, k);
    if (k >= 1) E.voo = null;
  } else if (!reduz() && (E.apres || agoraMs - E.idleDesde > 20000)) {
    // modo apresentação: órbita lenta, vai e volta dentro dos limites
    const ang = Math.sin(E.tempo * 0.07) * 1.05; const dist = 18 + Math.sin(E.tempo * 0.05) * 3; const alt = 7.5 + Math.sin(E.tempo * 0.09) * 1.5;
    const alvo = new THREE.Vector3(Math.sin(E.tempo * 0.04) * 3, 0.9, -0.5 + Math.cos(E.tempo * 0.03) * 1.5);
    const p = new THREE.Vector3(Math.sin(ang) * dist, alt, Math.cos(ang) * dist).add(alvo);
    E.camera.position.lerp(p, Math.min(1, dt * 0.8)); E.controls.target.lerp(alvo, Math.min(1, dt * 0.8));
  }
  // limites: o alvo nunca sai do prédio, a câmera nunca entra no chão
  const tg = E.controls.target; tg.x = THREE.MathUtils.clamp(tg.x, -SALA.X, SALA.X); tg.z = THREE.MathUtils.clamp(tg.z, -SALA.Z, SALA.Z + 1); tg.y = THREE.MathUtils.clamp(tg.y, 0.3, 3);
  E.controls.update();
  if (E.camera.position.y < 0.5) E.camera.position.y = 0.5;
  // agentes
  for (const ag of Object.values(E.agentes)) animaAgente(ag, dt);
  if (E.visitante) animaAgente(E.visitante, dt);
  // rostos sempre um pouco à frente da cabeça, do lado da câmera
  for (const ag of Object.values(E.agentes).concat(E.visitante ? [E.visitante] : [])) {
    const b = ag.b; b.cabeca.getWorldPosition(_v); _c.copy(E.camera.position).sub(_v).normalize().multiplyScalar(0.13);
    b.rosto.position.copy(b.cabeca.position).add(b.corpo.worldToLocal(_c.add(_v)).sub(b.cabeca.position).multiplyScalar(1));
  }
  // hover
  if (E.querHover) { E.querHover = false; const h = acerta(); E.tela.style.cursor = h ? 'pointer' : ''; }
  E.renderer.render(E.cena, E.camera);
  projeta();
}
function animaAgente(ag, dt) {
  const b = ag.b; const g = b.g;
  // andar até o alvo
  if (ag.alvo) {
    const dx = ag.alvo[0] - ag.x, dz = ag.alvo[1] - ag.z; const d = Math.hypot(dx, dz); const vel = 1.35;
    if (d < 0.03 || reduz()) { ag.x = ag.alvo[0]; ag.z = ag.alvo[1]; const r = ag.alvo; ag.alvo = null; if (ag.resolve) { const f = ag.resolve; ag.resolve = null; f(r); } }
    else { const p = Math.min(d, vel * dt); ag.x += (dx / d) * p; ag.z += (dz / d) * p; ag.rotAlvo = Math.atan2(dx, dz); ag.passo = (ag.passo || 0) + dt * 7.5; }
  }
  g.position.x = ag.x; g.position.z = ag.z;
  // vira suave
  let dr = ag.rotAlvo - ag.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); ag.rot += dr * Math.min(1, dt * 9); g.rotation.y = ag.rot;
  if (ag.andando && !b.sentado) {
    const s = Math.sin(ag.passo || 0);
    b.coxas[0].rotation.x = s * 0.55; b.coxas[1].rotation.x = -s * 0.55;
    b.canelas[0].rotation.x = -Math.max(0, -s) * 0.7; b.canelas[1].rotation.x = -Math.max(0, s) * 0.7;
    b.bracos[0].br.rotation.x = -s * 0.45; b.bracos[1].br.rotation.x = s * 0.45;
    b.corpo.position.y = Math.abs(Math.cos(ag.passo || 0)) * 0.035;
  } else if (!b.sentado) {
    b.coxas.forEach((c) => { c.rotation.x *= 0.85; }); b.canelas.forEach((c) => { c.rotation.x *= 0.85; }); b.bracos.forEach(({ br }) => { br.rotation.x *= 0.85; });
    b.corpo.position.y = ag.faz > 0 ? Math.abs(Math.sin(E.tempo * 9)) * 0.12 : 0; // "fazendo" algo no lugar: pulinho
    if (ag.faz > 0) { ag.faz -= dt; b.bracos[1].br.rotation.x = -1.4 + Math.sin(E.tempo * 10) * 0.3; }
  } else {
    // sentado: respira; digita quando tem o que digitar; alonga de vez em quando
    const resp = Math.sin(E.tempo * 1.6 + ag.x) * 0.006; b.corpo.position.y = -0.39 + resp;
    if (ag.dorme) { b.cabeca.rotation.z = 0.25 + Math.sin(E.tempo * 0.8) * 0.03; b.bracos.forEach(({ br, ante }) => { br.rotation.x = 0.3; ante.rotation.x = 0.4; }); }
    else if (ag.digita > 0) { ag.digita -= dt; b.bracos[0].ante.rotation.x = 0.95 + Math.sin(E.tempo * 18) * 0.12; b.bracos[1].ante.rotation.x = 0.95 + Math.cos(E.tempo * 17) * 0.12; b.cabeca.rotation.x = -0.12 + Math.sin(E.tempo * 2.5) * 0.03; b.cabeca.rotation.z = 0; }
    else if (ag.estica > 0) { ag.estica -= dt; const k = Math.sin(Math.min(Math.PI, (1.6 - ag.estica) * 2)); b.bracos.forEach(({ br, ante }) => { br.rotation.x = 0.55 - k * 3.2; ante.rotation.x = 0.95 - k * 0.9; }); b.cabeca.rotation.x = -k * 0.25; }
    else { b.bracos.forEach(({ br, ante }) => { br.rotation.x += (0.55 - br.rotation.x) * 0.1; ante.rotation.x += (0.95 - ante.rotation.x) * 0.1; }); b.cabeca.rotation.x += (-0.05 - b.cabeca.rotation.x) * 0.1; b.cabeca.rotation.z = 0; }
  }
}
// Projeta as etiquetas HTML (nome, balões, salas) a partir das posições 3D.
function projeta() {
  const W = E.W, H = E.H; const cam = E.camera;
  const poe = (el, p, dy = 0) => {
    _v.copy(p).project(cam);
    if (_v.z > 1 || _v.x < -1.3 || _v.x > 1.3 || _v.y < -1.3 || _v.y > 1.3) { el.style.display = 'none'; return; }
    el.style.display = ''; el.style.transform = `translate3d(${((_v.x + 1) / 2) * W}px,${((1 - _v.y) / 2) * H + dy}px,0) translate(-50%,-100%)`;
  };
  const dist = cam.position.distanceTo(E.controls.target); const k = THREE.MathUtils.clamp(14 / dist, 0.6, 1.25);
  E.raiz.style.setProperty('--k', k.toFixed(3));
  for (const ag of Object.values(E.agentes).concat(E.visitante ? [E.visitante] : [])) {
    ag.b.cabeca.getWorldPosition(_v); const topo = _v.clone(); topo.y += 0.26;
    poe(ag.elBaloes, topo, -26 * k);
    if (ag.elNome) { const sent = ag.b.sentado && !ag.dorme && !ag.b.g.userData.visitante; ag.elNome.classList.toggle('longe', dist > 24); poe(ag.elNome, topo, 2); if (sent && dist < 9) ag.elNome.style.display = 'none'; }
  }
  for (const z of E.zonas || []) poe(z.el, z.pos);
  for (const l of E.lugares || []) { poe(l.el, l.pos); if (dist > 22) l.el.style.display = 'none'; }
}

// ====================================================================== fila de ações, balões, andar
function balao(ag, emoji, texto, tipo = '') {
  if (!ag || !vivo()) return;
  const caixa = ag.elBaloes; if (!caixa) return;
  const b = document.createElement('div'); b.className = `jg-balao ${tipo}`;
  b.innerHTML = `<span class="e">${esc(emoji || '💬')}</span>${texto ? `<span class="t">${esc(texto)}</span>` : ''}`;
  caixa.appendChild(b);
  while (caixa.children.length > 3) caixa.firstChild.remove();
  setTimeout(() => b.classList.add('sobe'), texto ? 7000 : 2600);
  setTimeout(() => b.remove(), texto ? 8600 : 4200);
}
function enfileira(item, abertura) {
  if (!vivo() || !item || !item.texto) return;
  item.texto = String(item.texto).replace(/\s+/g, ' ').slice(0, 110); item.abertura = !!abertura;
  E.fila.push(item);
  if (!E.rodando) roda();
}
async function roda() {
  E.rodando = true;
  while (vivo() && E.fila.length) { const it = E.fila.shift(); executa(it); await espera(E.fila.length > 6 ? 500 : 1300); }
  if (E) E.rodando = false;
}
async function executa(it) {
  ticker(it);
  if (it.agente === 'porta') return visitante(it);
  const ag = E.agentes[it.agente]; if (!ag) return;
  if (it.festa) festa();
  if (ag.ocupado || !it.vai || reduz() || ag.dorme) { balao(ag, it.emoji, it.texto, it.alerta ? 'alerta' : it.festa ? 'festa' : ''); digita(ag); return; }
  ag.ocupado = true;
  balao(ag, it.emoji, it.texto, it.festa ? 'festa' : '');
  try {
    await anda(ag, LUGAR[it.vai]);
    ag.faz = 2.4; await espera(2600); ag.faz = 0;
    await volta(ag);
  } finally { ag.ocupado = false; }
}
function digita(ag) { ag.digita = 4.2; if (ag.tela && ag.tela.mesh) { ag.tela.mesh.material.emissiveIntensity = 1.0; setTimeout(() => { if (ag.tela && ag.tela.mesh) ag.tela.mesh.material.emissiveIntensity = ag.dorme ? 0.08 : 0.75; }, 4200); } }
function passo(ag, x, z) {
  return new Promise((res) => { if (!vivo()) return res(); ag.alvo = [x, z]; ag.resolve = res; });
}
const ladoDaMesa = (ag) => ag.mesa[0] + (ag.mesa[0] >= 3 || ag.slug === 'gerente-corretores' ? -1.3 : 1.3);
async function anda(ag, alvo) {
  const lado = ladoDaMesa(ag);
  levantaBoneco(ag.b); ag.andando = true; ag.rotAlvo = Math.atan2(lado - ag.x, 0);
  const pts = [[lado, ag.z], [lado, SALA.CORREDOR], [alvo[0], SALA.CORREDOR], alvo];
  for (const [x, z] of pts) await passo(ag, x, z);
  ag.andando = false;
  // de frente para o que foi fazer: parede do fundo ou o móvel
  ag.rotAlvo = alvo[1] < -4 ? Math.PI : alvo[1] > 4.5 ? 0 : ag.rotAlvo;
}
async function volta(ag) {
  const [sx, sz] = ag.mesa; const lado = ladoDaMesa(ag);
  ag.andando = true;
  for (const [x, z] of [[ag.x, SALA.CORREDOR], [lado, SALA.CORREDOR], [lado, sz + SENTA], [sx, sz + SENTA]]) await passo(ag, x, z);
  ag.andando = false; ag.rotAlvo = Math.PI; sentaBoneco(ag.b);
}
// Alguém da equipe entra pela porta ("Marcelo chegou no escritório").
async function visitante(it) {
  if (E.visitante) return;
  const b = fazBoneco('#8a8f98', texturaRostoEmoji('👤'), 'visitante'); b.g.userData.visitante = true;
  const ovl = $('#j3-ovl'); const baloes = document.createElement('div'); baloes.className = 'j3-baloes'; baloes.style.setProperty('--c', '#8a8f98'); ovl.appendChild(baloes);
  const p = { slug: 'visitante', b, x: 0, z: SALA.Z + 1.6, rot: Math.PI, rotAlvo: Math.PI, andando: true, elBaloes: baloes, elNome: null, mesa: [0, 0] };
  b.g.position.set(p.x, 0, p.z); levantaBoneco(b); E.cena.add(b.g); E.visitante = p;
  try {
    await passo(p, LUGAR.porta[0], LUGAR.porta[1] - 0.3); await passo(p, LUGAR.recepcao[0], LUGAR.recepcao[1]);
    p.andando = false; p.rotAlvo = -Math.PI / 2;
    balao(p, it.emoji, it.texto); await espera(3800);
    p.andando = true; await passo(p, LUGAR.sofa[0] + 1.2, SALA.CORREDOR); await passo(p, 6.2, SALA.CORREDOR);
    p.andando = false;
    b.mats.forEach((m) => { m.transparent = true; }); for (let i = 0; i < 10; i++) { await espera(60); b.mats.forEach((m) => { m.opacity = 1 - i / 10; }); b.rosto.material.opacity = 1 - i / 10; }
  } finally {
    E && E.cena.remove(b.g); baloes.remove(); b.rosto.material.map.dispose(); if (E) E.visitante = null;
  }
}
function festa() {
  const c = $('#j3-confete'); if (!c || reduz()) return;
  const cores = ['#e8c36a', '#3ddc84', '#ff8a8a', '#7fb4ff', '#c9a0ff', '#ffb38a'];
  c.innerHTML = Array.from({ length: 90 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${cores[i % cores.length]};animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(2.4 + Math.random() * 1.6).toFixed(2)}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
  setTimeout(() => { if (c) c.innerHTML = ''; }, 4800);
}
// Vida no escritório quando não há nada acontecendo: café, alongar, olhar o celular (só emoji, sem inventar ação).
function vidaNoEscritorio() {
  if (!vivo()) return para();
  if (E.fila.length) return;
  const livres = Object.values(E.agentes).filter((a) => !a.ocupado && !a.dorme);
  if (!livres.length) return;
  const ag = livres[Math.floor(Math.random() * livres.length)];
  const r = Math.random();
  if (r < 0.3 && !reduz()) {
    ag.ocupado = true;
    (async () => { try { await anda(ag, [LUGAR.cafe[0] + (Math.random() * 0.8 - 0.4), LUGAR.cafe[1]]); ag.rotAlvo = 0; balao(ag, '☕', '', 'leve'); await espera(2400); await volta(ag); } finally { ag.ocupado = false; } })();
  } else if (r < 0.6) digita(ag);
  else if (r < 0.75) ag.estica = 1.6;
  else if (r < 0.85) balao(ag, ['📱', '💭', '📋', '🙂'][Math.floor(Math.random() * 4)], '', 'leve');
}
