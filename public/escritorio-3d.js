/* Herrera HOUSE IA — Escritório ao vivo em 3D (#/whats/ao-vivo).
   O mesmo escritório do modo jogo (escritorio-jogo.js), agora como uma maquete realista em three.js: piso de carvalho,
   fachada de vidro com a cidade lá fora acompanhando a hora do dia, três salas separadas por vidro, mesas com monitores,
   os 9 agentes sentados digitando e andando pelos corredores quando acontece algo. Os balões, o ticker, o HUD e as
   etiquetas são HTML projetado por cima da cena (texto nítido). Módulo ES carregado por import() a partir do escritorio-jogo.js.
   Reusa do app: $, esc, api, toast, ACT, poll, MARCA; do escritorio-jogo.js: jgDeEvento, JG_EMOJI_VAI, jgReduz, jgEspera.
   Ganchos para outros módulos: window.jg3dTelaDoAgente(slug, imagem) pinta o monitor do agente;
   window.abrePcDoAgente(slug), se existir, é chamado ao dar duplo clique num agente.
   Pessoas: cada agente é um humano 3D de verdade (public/plataforma/pessoas/<slug>.glb — personagens da biblioteca
   Microsoft Rocketbox, MIT, com o rosto e a roupa combinando com o retrato em /plataforma/agentes/<slug>.jpg) animado por
   esqueleto: sentado à mesa, digitando, andando, bebendo café, lendo papel, acenando. As animações vêm em dois arquivos
   partilhados (pessoas/anim-m.glb e anim-f.glb). Se um GLB não carregar, entra o boneco estilizado antigo (fazBoneco). */
import { LUGAR_TELA, painelLugar, fechaPainelLugar } from '/escritorio-lugares.js';
import * as THREE from '/vendor/three/three.module.min.js';
import { OrbitControls } from '/vendor/three/OrbitControls.js';
import { mergeGeometries } from '/vendor/three/BufferGeometryUtils.js';
import { GLTFLoader } from '/vendor/three/GLTFLoader.js';
import { clone as clonaEsqueleto } from '/vendor/three/SkeletonUtils.js';
import { RoundedBoxGeometry } from '/vendor/three/RoundedBoxGeometry.js';
import { Sky } from '/vendor/three/pos/Sky.js';
import { EffectComposer } from '/vendor/three/pos/EffectComposer.js';
import { RenderPass } from '/vendor/three/pos/RenderPass.js';
import { GTAOPass } from '/vendor/three/pos/GTAOPass.js';
import { UnrealBloomPass } from '/vendor/three/pos/UnrealBloomPass.js';
import { OutputPass } from '/vendor/three/pos/OutputPass.js';

// ---------- textos da interface (os balões vêm do servidor em português e ficam como estão) ----------
const T = {
  pt: { cliente: 'Cliente', entraramHoje: 'Entraram hoje', semImoveisHoje: 'Nenhum imóvel cadastrado hoje', semFoto: 'Sem foto', vivo: 'ao vivo', acoes: 'ações hoje', conversas: 'conversas', enviadas: 'enviadas', aprovar: 'para aprovar', cheia: 'Tela cheia (F)', apres: 'Modo apresentação',
    painel: 'Painel de hoje', noar: 'no WhatsApp', captacao: 'Sala de captação', vendas: 'Salão de vendas', diretoria: 'Diretoria', entrada: 'Entrada', mural: 'Mural de oportunidades',
    cafe: 'Café', recepcao: 'Recepção', reuniao: 'Reunião', plantao: 'Plantão', impressora: 'Impressora', vazio: 'Quando os agentes trabalharem, cada ação aparece aqui e num balão em cima de quem fez.',
    abrir: 'Abrir a mesa', fechar: 'Fechar', esperando: 'Esperando o primeiro cliente do dia…', dica: 'Arraste para girar · roda para aproximar · duplo clique num agente abre a mesa',
    virtual: 'escritório virtual', inativo: 'inativo', equipe: 'Equipe', ver2d: 'Ver em 2D', ver3d: 'Ver em 3D', hoje: 'hoje', sem3d: 'Seu navegador não abriu o 3D; mostrando a versão 2D.',
    entrar: 'Entrar no escritório', sair: 'Sair do escritório', ajuda: 'WASD ou setas andam · Shift corre · arraste para olhar · E interage · Esc sai', falarCom: 'Falar com', abrirLugar: 'Abrir', crm: 'CRM e funil', sofa: 'Sofá', cliqueAbrir: 'Clique para abrir', salaEmBreve: 'Sala de reunião ao vivo em breve',
  },
  en: { cliente: 'Client', entraramHoje: 'Added today', semImoveisHoje: 'No properties added today', semFoto: 'No photo', vivo: 'live', acoes: 'actions today', conversas: 'conversations', enviadas: 'sent', aprovar: 'to approve', cheia: 'Full screen (F)', apres: 'Presentation mode',
    painel: "Today's board", noar: 'on WhatsApp', captacao: 'Sourcing room', vendas: 'Sales floor', diretoria: 'Management', entrada: 'Entrance', mural: 'Opportunity board',
    cafe: 'Coffee', recepcao: 'Reception', reuniao: 'Meeting', plantao: 'Front desk', impressora: 'Printer', vazio: 'As the agents work, every action shows up here and in a balloon above whoever did it.',
    abrir: 'Open desk', fechar: 'Close', esperando: 'Waiting for the first client of the day…', dica: 'Drag to rotate · wheel to zoom · double-click an agent to open their desk',
    virtual: 'virtual office', inativo: 'inactive', equipe: 'Team', ver2d: 'View in 2D', ver3d: 'View in 3D', hoje: 'today', sem3d: 'Your browser could not open 3D; showing the 2D view.',
    entrar: 'Walk into the office', sair: 'Leave the office', ajuda: 'WASD or arrows to walk · Shift to run · drag to look · E to interact · Esc to leave', falarCom: 'Talk to', abrirLugar: 'Open', crm: 'CRM and pipeline', sofa: 'Sofa', cliqueAbrir: 'Click to open', salaEmBreve: 'Live meeting room coming soon',
  },
  ja: { cliente: 'お客様', entraramHoje: '本日の新着物件', semImoveisHoje: '本日の新着物件はありません', semFoto: '写真なし', vivo: 'ライブ', acoes: '本日のアクション', conversas: '会話', enviadas: '送信済み', aprovar: '承認待ち', cheia: '全画面 (F)', apres: 'プレゼンモード',
    painel: '本日のボード', noar: 'WhatsApp接続中', captacao: '物件開拓室', vendas: '営業フロア', diretoria: '経営室', entrada: '入口', mural: '案件ボード',
    cafe: 'カフェ', recepcao: '受付', reuniao: '会議', plantao: 'フロント', impressora: 'プリンター', vazio: 'エージェントが働くと、各アクションがここと担当者の上の吹き出しに表示されます。',
    abrir: 'デスクを開く', fechar: '閉じる', esperando: '本日最初のお客様をお待ちしています…', dica: 'ドラッグで回転 · ホイールでズーム · エージェントをダブルクリックでデスクを開く',
    virtual: 'バーチャルオフィス', inativo: '休止中', equipe: 'チーム', ver2d: '2Dで見る', ver3d: '3Dで見る', hoje: '本日', sem3d: 'ブラウザで3Dを開けませんでした。2D表示にしています。',
    entrar: 'オフィスに入る', sair: 'オフィスを出る', ajuda: 'WASD / 矢印キーで移動 · Shiftで走る · ドラッグで視点 · Eで操作 · Escで退出', falarCom: '話す:', abrirLugar: '開く', crm: 'CRM・商談', sofa: 'ソファ', cliqueAbrir: 'クリックして開く', salaEmBreve: 'ライブ会議室は近日公開',
  },
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
const SENTA = 0.80; // o agente senta a esta distância (em z) do centro da mesa, de frente para as janelas (joelhos por baixo do tampo)
const LUGAR = {
  mural: [-10.4, -5.3], impressora: [-10.2, 2.4], porta: [0, 7.6], recepcao: [0.9, 5.3], cafe: [-4.6, 5.3],
  tv: [10.4, -5.3], reuniao: [8.7, 4.2], sofa: [3.2, 5.1], plantao: [-2.2, 5.0],
};
const ZONAS = [['captacao', -8.6], ['vendas', 0], ['diretoria', 8.6]];
const AVATARES = ['captador', 'apartamentos', 'comerciais', 'terrenos', 'casas', 'alto-padrao', 'offmarket', 'gerente', 'gerente-corretores'];
const FOTO = (slug) => `/plataforma/agentes/${slug}.jpg`; // retrato fotorrealista (gerado no Flux) de cada agente
// humanos 3D: sexo de cada personagem (escolhe o conjunto de animações) e onde ficam os arquivos
const PESSOA_GENERO = { captador: 'm', apartamentos: 'f', comerciais: 'm', terrenos: 'm', casas: 'f', 'alto-padrao': 'f', offmarket: 'm', gerente: 'm', 'gerente-corretores': 'f', visitante: 'm' };
const PESSOAS_URL = '/plataforma/pessoas/';
const PESSOA_Y = -0.30; // as animações sentadas do Rocketbox assumem uma cadeira alta: baixa o corpo para os pés tocarem o chão

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
  E.tvIntervalo = setInterval(() => { if (vivo()) { E.tvFotos = !E.tvFotos; tvPinta(); } }, 8000);
  document.addEventListener('fullscreenchange', redimensiona);
  document.addEventListener('keydown', tecla);
  if (!reduz()) setTimeout(() => { if (E === meu) { $('#j3-dica').classList.add('ve'); setTimeout(() => $('#j3-dica') && $('#j3-dica').classList.remove('ve'), 7000); } }, 2500);
}

function para() {
  clearInterval(poll);
  if (!E) return;
  fechaPainelLugar();
  const e = E; E = null;
  clearInterval(e.iv); clearInterval(e.vida); clearInterval(e.relogio); clearInterval(e.ssaver);
  clearInterval(e.tvIntervalo);
  if (e.andar) { try { e.andar.desmonta(); } catch {} }
  if (e.ro) e.ro.disconnect();
  document.removeEventListener('fullscreenchange', redimensiona);
  document.removeEventListener('keydown', tecla);
  try {
    if (e.renderer) {
      e.renderer.setAnimationLoop(null);
      e.controls && e.controls.dispose();
      if (e.composer) {
        for (const pass of e.composer.passes) pass.dispose();
        e.composer.dispose();
      }
      // GTAOPass r170 não descarta estes dois shaders em dispose().
      if (e.gtao) { e.gtao.gtaoMaterial.dispose(); e.gtao.blendMaterial.dispose(); }
      const descartados = new Set();
      const descarta = (recurso) => { if (recurso && recurso.dispose && !descartados.has(recurso)) { descartados.add(recurso); recurso.dispose(); } };
      const descartaMaterial = (m) => { for (const v of Object.values(m)) if (v && v.isTexture) descarta(v); descarta(m); };
      e.cena && e.cena.traverse((o) => {
        descarta(o.geometry);
        if (o.shadow) o.shadow.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) descartaMaterial(m);
      });
      for (const m of Object.values(MAT)) if (m && m.isMaterial) descartaMaterial(m);
      for (const k of Object.keys(MAT)) delete MAT[k];
      if (e.texturas) for (const tx of e.texturas.values()) descarta(tx);
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
// Andar dentro do escritório (módulo próprio, carregado só quando o usuário pede).
ACT['j3-andar'] = async () => {
  if (!E) return;
  try {
    if (!E.andar) {
      const m = await import('/escritorio-andar.js');
      if (!E) return;
      E.andar = m.ligaAndar({ THREE, E, fazPessoa, SALA, MESAS, LUGAR, SENTA, reduz, $, esc,
        textos: { entrar: t('entrar'), sair: t('sair'), ajuda: t('ajuda'), falarCom: t('falarCom'), abrir: t('abrirLugar'),
          mural: t('mural'), tv: t('painel'), crm: t('crm'), recepcao: t('recepcao'), impressora: t('impressora'), cafe: t('cafe'), reuniao: t('reuniao') } });
    }
    await E.andar.alterna();
  } catch (e) { console.warn('andar:', e); toast('Não deu para entrar no escritório agora.', true); }
};
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
    <button class="jg-bt j3-andar-bt" data-act="j3-andar" title="${esc(t('entrar'))}">🚶</button>
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
  if (d.entraram) tvImoveis(d.entraram);
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
  const foto = ag && AVATARES.includes(ag.slug) ? `<img src="${FOTO(ag.slug)}" alt="">` : '<span class="jg-tk-p">👤</span>';
  const hora = item.hora ? String(item.hora).replace(' ', 'T').slice(11, 16) : new Date().toTimeString().slice(0, 5);
  const el = document.createElement('div'); el.className = 'jg-tk';
  el.innerHTML = `${foto}<span class="e">${esc(item.emoji)}</span><span class="t"><b>${esc(ag ? ag.nome : t('equipe'))}</b> ${esc(item.texto)}</span><small>${esc(hora)}</small>`;
  tk.prepend(el);
  while (tk.children.length > 6) tk.lastChild.remove();
}

// ====================================================================== cena
function montaCena() {
  const raiz = E.raiz; const tela = $('#j3-tela');
  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: false, powerPreference: 'high-performance', alpha: false });
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
  const estudio = ambienteEstudio();
  E.ambiente = pm.fromScene(estudio, 0.04);
  estudio.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  pm.dispose();
  cena.environment = E.ambiente.texture;
  // O ambiente de estúdio é HDR; evita que reflexos amplos dominem o bloom.
  cena.environmentIntensity = 0.2;

  // luzes
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.4); sol.position.set(-9, 16, -13); sol.castShadow = true;
  const sombraPx = Math.min(renderer.capabilities.maxTextureSize, celular() ? 2048 : 4096);
  sol.shadow.mapSize.set(sombraPx, sombraPx); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
  Object.assign(sol.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 2, far: 60 });
  sol.target.position.set(0, 0, 0); cena.add(sol, sol.target); E.sol = sol;
  const hemi = new THREE.HemisphereLight(0xcfe0f5, 0xa68a66, 0.7); cena.add(hemi); E.hemi = hemi;
  const amb = new THREE.AmbientLight(0xffffff, 0.12); cena.add(amb); E.amb = amb;
  // luzes práticas (noite): uma por sala, quentes, sem sombra
  E.praticas = [[-8.5, -0.5], [-1.5, -0.5], [1.5, -0.5], [8.8, -0.5], [-2.6, 5.2], [3.6, 5.2], [8.7, 4.8]].map(([x, z]) => { const l = new THREE.PointLight(0xffc48a, 0, 11, 1.6); l.position.set(x, 2.7, z); cena.add(l); return l; });

  constroiPredio(cena);
  constroiMobilia(cena);
  constroiCidade(cena);
  E.clima = { solI: 2.4, hemiI: 0.7, exp: 1.0, pratI: 0, cidade: 0, sol: new THREE.Color(0xfff1dc), hemiCeu: new THREE.Color(0xcfe0f5), hemiChao: new THREE.Color(0xa68a66), solPos: new THREE.Vector3(-9, 16, -13), ceuSol: new THREE.Vector3(-0.35, 0.62, -0.7), turb: 5, ray: 1.4, estrelas: 0, fog: new THREE.Color(0xdbe9f5) };
  cena.fog = new THREE.Fog(0xdbe9f5, 75, 300);
  montaEfeitos();
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
    if (hit && hit.tipo === 'lugar') abreLugar(hit.lugar);
    else if (hit && hit.tipo === 'monitor') vaiAoAgente(hit.slug);
  };
  E.escuta.dblclick = (ev) => { posPonteiro(ev); const hit = acerta(); if (!hit) return; if (hit.tipo === 'lugar') abreLugar(hit.lugar); else vaiAoAgente(hit.slug); };
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
  if (E.composer) E.composer.setSize(w, h);
  // O composer usa pixels físicos; GTAO em meia resolução reduz o custo.
  if (E.gtao) {
    E.gtao.enabled = !celular() && !E.aoLento;
    const dpr = E.renderer.getPixelRatio();
    E.gtao.setSize(Math.max(1, Math.round(w * dpr / 2)), Math.max(1, Math.round(h * dpr / 2)));
  }
  E.W = w; E.H = h;
}
function montaEfeitos() {
  const { renderer, cena, camera } = E;
  const alvo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, alvo); E.composer = composer;
  composer.addPass(new RenderPass(cena, camera));
  if (!celular()) {
    const gtao = new GTAOPass(cena, camera, 1, 1); E.gtao = gtao;
    gtao.updateGtaoMaterial({ radius: 0.35, thickness: 0.5, distanceFallOff: 1 });
    gtao.blendIntensity = 0.65;
    // Vidros, sombras em planos e caixas de clique invisíveis não são paredes.
    const override = gtao.overrideVisibility.bind(gtao);
    gtao.overrideVisibility = () => {
      override();
      cena.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        if (o.isSky || ms.some((m) => m.transparent || m.alphaTest > 0)) o.visible = false;
      });
    };
    composer.addPass(gtao);
  }
  E.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.4, 0.9);
  composer.addPass(E.bloom);
  composer.addPass(new OutputPass());
  E.exposicao = 1;
  E.desempenho = { inicio: null, quadros: 0, fps: null };
}
function medeDesempenho(agoraMs) {
  const d = E.desempenho;
  if (!d || d.fps !== null) return;
  // Conta tempo real, sem o limite de dt usado nas animações, e ignora aba oculta.
  if (document.hidden) { d.inicio = null; d.quadros = 0; return; }
  if (d.inicio === null) { d.inicio = agoraMs; return; }
  d.quadros++;
  const ms = agoraMs - d.inicio;
  if (ms < 3000) return;
  d.fps = d.quadros * 1000 / ms;
  if (d.fps < 25 && E.gtao) { E.aoLento = true; E.gtao.enabled = false; }
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
// Texturas fotográficas (Flux na RTX 4090), repetíveis e com normal map tangente RGB:
// public/plataforma/cenario/<nome>.jpg (cor) e <nome>-n.jpg (relevo). O carregamento é assíncrono: a cena abre com as cores base.
const CENARIO_URL = '/plataforma/cenario/';
let TEXLOADER = null;
function tex(nome, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  E.texturas = E.texturas || new Map();
  const chave = JSON.stringify([nome, repeat, srgb, aniso]);
  if (E.texturas.has(chave)) return E.texturas.get(chave);
  TEXLOADER = TEXLOADER || new THREE.TextureLoader();
  const tx = TEXLOADER.load(CENARIO_URL + nome + '.jpg');
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat[0], repeat[1]);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = Math.min(aniso, E.renderer.capabilities.getMaxAnisotropy());
  E.texturas.set(chave, tx);
  return tx;
}
// material PBR com cor + relevo (a textura é "por metro": as caixas do Lote recebem UV em metros)
function pbr(nome, { cor = 0xffffff, rough = 0.7, metal = 0, relevo = 0.6, escala = 1, env = 0.5, extra = {} } = {}) {
  const r = [1 / escala, 1 / escala];
  const m = new THREE.MeshStandardMaterial({ color: cor, roughness: rough, metalness: metal, map: tex(nome, { repeat: r }), normalMap: tex(nome + '-n', { repeat: r, srgb: false }), normalScale: new THREE.Vector2(relevo, relevo), envMapIntensity: env, ...extra });
  return m;
}
const MAT = {};
function materiais() {
  if (MAT.ok) return MAT;
  MAT.ok = true;
  MAT.parede = pbr('parede-reboco', { cor: 0xf1ece3, rough: 0.9, relevo: 0.35, escala: 2.2 });
  MAT.paredeCorte = new THREE.MeshStandardMaterial({ color: 0xf7f3ec, roughness: 0.8 });
  MAT.pedra = pbr('concreto', { cor: 0x8f8d8a, rough: 0.55, relevo: 0.5, escala: 2.4, env: 0.6 });
  MAT.pedraEscura = pbr('concreto', { cor: 0x4a4a4e, rough: 0.5, relevo: 0.5, escala: 2.4, env: 0.6 });
  MAT.aluminio = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.35, metalness: 0.75, envMapIntensity: 0.9 });
  MAT.aco = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
  MAT.vidro = new THREE.MeshPhysicalMaterial({ color: 0xdbeef8, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02 });
  MAT.vidroFosco = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0.42, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  MAT.madeira = pbr('nogueira', { cor: 0xffffff, rough: 0.45, relevo: 0.45, escala: 1.2, env: 0.7 });
  MAT.madeiraClara = pbr('tampo-carvalho', { cor: 0xffffff, rough: 0.42, relevo: 0.4, escala: 1.4, env: 0.7 });
  MAT.marmore = pbr('marmore', { cor: 0xffffff, rough: 0.18, relevo: 0.25, escala: 1.6, env: 1.1 });
  MAT.preto = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.5, metalness: 0.2 });
  MAT.plasticoEscuro = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55 });
  MAT.tecido = pbr('tecido-cadeira', { cor: 0xffffff, rough: 0.95, relevo: 0.7, escala: 0.5, env: 0.2 });
  MAT.tecidoSofa = pbr('tecido-sofa', { cor: 0xffffff, rough: 0.95, relevo: 0.7, escala: 0.6, env: 0.2 });
  MAT.tapete = pbr('tapete', { cor: 0xffffff, rough: 1, relevo: 0.8, escala: 0.8, env: 0.1 });
  MAT.branco = new THREE.MeshStandardMaterial({ color: 0xf3f3f1, roughness: 0.6 });
  MAT.cinzaClaro = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.55 });
  MAT.verde = new THREE.MeshStandardMaterial({ color: 0x3f8a46, roughness: 0.85 });
  MAT.verde2 = new THREE.MeshStandardMaterial({ color: 0x5ea85a, roughness: 0.85 });
  MAT.folha = new THREE.MeshStandardMaterial({ map: texturaFolha(), color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.5 });
  MAT.vaso = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.6 });
  MAT.vasoEscuro = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.6 });
  MAT.terra = new THREE.MeshStandardMaterial({ color: 0x3a2b1f, roughness: 1 });
  MAT.cortica = new THREE.MeshStandardMaterial({ color: 0xc08f5e, roughness: 0.98 });
  MAT.papel = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.95 });
  MAT.vermelho = new THREE.MeshStandardMaterial({ color: 0xd6453a, roughness: 0.5 });
  MAT.dourado = new THREE.MeshStandardMaterial({ color: 0xc9a96f, roughness: 0.3, metalness: 0.8 });
  MAT.led = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6b8, emissiveIntensity: 1.2, roughness: 0.4 });
  MAT.pele = new THREE.MeshStandardMaterial({ color: 0xd9a27c, roughness: 0.65 });
  MAT.cabelo = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.8 });
  MAT.calca = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.9 });
  MAT.sapato = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.45 });
  MAT.ceramica = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.35, envMapIntensity: 0.8 });
  MAT.cafe = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.3 });
  MAT.hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  MAT.sombra = new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false, opacity: 0.5 });
  MAT.cupula = new THREE.MeshStandardMaterial({ color: 0xf2e9d8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.8, side: THREE.DoubleSide });
  return MAT;
}
// UV em metros: cada face da caixa recebe UV do tamanho real (as texturas são "por metro")
function uvMundo(geo, w, h, d) {
  const uv = geo.attributes.uv; const tam = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let g = 0; g < 6; g++) { const [sx, sy] = tam[g]; for (let i = g * 4; i < g * 4 + 4; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); }
  return geo;
}
// Lote: junta várias caixas/cilindros no mesmo material num só Mesh (menos draw calls).
class Lote {
  constructor(cena) { this.cena = cena; this.mapa = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone(); const m = new THREE.Matrix4(); const e = new THREE.Euler(rx, ry, rz);
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m);
    if (!this.mapa.has(mat)) this.mapa.set(mat, []); this.mapa.get(mat).push(g); return this;
  }
  caixa(w, h, d, mat, x, y, z, ry = 0) { return this.add(uvMundo(new THREE.BoxGeometry(w, h, d), w, h, d), mat, x, y, z, 0, ry, 0); }
  // caixa de cantos arredondados (tampos, almofadas, encostos)
  redonda(w, h, d, r, mat, x, y, z, ry = 0, rx = 0) { const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d), uv.getY(i) * Math.max(h, d)); return this.add(g, mat, x, y, z, rx, ry, 0); }
  cil(r1, r2, h, mat, x, y, z, seg = 18) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z); }
  toro(r, t, mat, x, y, z, rx = 0, ry = 0, seg = 16) { return this.add(new THREE.TorusGeometry(r, t, 8, seg), mat, x, y, z, rx, ry, 0); }
  fecha(sombra = true, recebe = true) {
    for (const [mat, gs] of this.mapa) {
      const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)), false); if (!g) continue;
      const m = new THREE.Mesh(g, mat); m.castShadow = sombra; m.receiveShadow = recebe; this.cena.add(m);
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
// Folha de planta (desenhada num canvas): recorte com alphaTest, nervura central e gradiente de verde.
function texturaFolha() {
  const W = 256, H = 512; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  const g = x.createLinearGradient(0, H, 0, 0); g.addColorStop(0, '#2e6b34'); g.addColorStop(0.5, '#3f8f45'); g.addColorStop(1, '#6fb866');
  x.fillStyle = g; x.beginPath(); x.moveTo(W / 2, H - 6);
  x.bezierCurveTo(W * 0.02, H * 0.72, W * 0.04, H * 0.22, W / 2, 8); x.bezierCurveTo(W * 0.96, H * 0.22, W * 0.98, H * 0.72, W / 2, H - 6); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(230,245,200,.55)'; x.lineWidth = 5; x.beginPath(); x.moveTo(W / 2, H - 10); x.lineTo(W / 2, 30); x.stroke();
  x.lineWidth = 2; x.strokeStyle = 'rgba(230,245,200,.35)';
  for (let i = 1; i < 9; i++) { const y = 40 + i * 50; x.beginPath(); x.moveTo(W / 2, y); x.quadraticCurveTo(W * 0.3, y - 10, W * 0.12, y - 44); x.moveTo(W / 2, y); x.quadraticCurveTo(W * 0.7, y - 10, W * 0.88, y - 44); x.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

// ---------- o prédio: piso, fachada de vidro, paredes de maquete, divisórias, placa, mural, TV ----------
function constroiPredio(cena) {
  const M = materiais(); const { X, Z, H } = SALA;
  const pisoG = new THREE.PlaneGeometry(X * 2, Z * 2); const uv = pisoG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * X * 2, uv.getY(i) * Z * 2);
  const piso = new THREE.Mesh(pisoG, pbr('piso-carvalho', { cor: 0xffffff, rough: 0.5, relevo: 0.55, escala: 1.6, env: 0.6 }));
  piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena.add(piso);
  const laje = new THREE.Mesh(uvMundo(new THREE.BoxGeometry(X * 2 + 0.6, 0.6, Z * 2 + 0.6), X * 2 + 0.6, 0.6, Z * 2 + 0.6), M.pedraEscura); laje.position.y = -0.32; cena.add(laje); // topo abaixo do piso: evita z-fighting ao aproximar
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
  // paredes laterais e da frente, cortadas na altura de uma maquete (1,05 m), com a borda clara e rodapé
  const hC = 1.05;
  L.caixa(0.22, hC, Z * 2, M.parede, -X - 0.11, hC / 2, 0); L.caixa(0.22, hC, Z * 2, M.parede, X + 0.11, hC / 2, 0);
  L.caixa(0.26, 0.05, Z * 2 + 0.04, M.paredeCorte, -X - 0.11, hC + 0.02, 0); L.caixa(0.26, 0.05, Z * 2 + 0.04, M.paredeCorte, X + 0.11, hC + 0.02, 0);
  L.caixa(0.03, 0.1, Z * 2, M.preto, -X + 0.015, 0.05, 0); L.caixa(0.03, 0.1, Z * 2, M.preto, X - 0.015, 0.05, 0);
  for (const [a, b] of [[-X - 0.22, -0.9], [0.9, X + 0.22]]) { L.caixa(b - a, hC, 0.22, M.parede, (a + b) / 2, hC / 2, Z + 0.11); L.caixa(b - a, 0.05, 0.26, M.paredeCorte, (a + b) / 2, hC + 0.02, Z + 0.11); L.caixa(b - a, 0.1, 0.03, M.preto, (a + b) / 2, 0.05, Z - 0.015); }
  for (const [a, b] of pil) L.caixa(b - a, 0.1, 0.03, M.preto, (a + b) / 2, 0.05, -Z + 0.115);
  // porta de entrada: batente alto com vidro e puxadores
  L.caixa(0.12, 2.35, 0.3, M.aluminio, -0.95, 1.175, Z + 0.11); L.caixa(0.12, 2.35, 0.3, M.aluminio, 0.95, 1.175, Z + 0.11); L.caixa(2.0, 0.12, 0.3, M.aluminio, 0, 2.36, Z + 0.11);
  const porta = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 2.26), M.vidro); porta.position.set(0, 1.17, Z + 0.11); cena.add(porta);
  L.cil(0.015, 0.015, 1.0, M.aco, -0.2, 1.05, Z + 0.25, 8); L.cil(0.015, 0.015, 1.0, M.aco, 0.2, 1.05, Z + 0.25, 8);
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
  // lugares clicáveis: caixa invisível na frente de cada um (mural → oportunidades, TV → painel da diretoria,
  // placa do salão → CRM). Clique simples abre a tela real do sistema dentro do escritório.
  E.cliques = [];
  for (const [lugar, x, y, l, a] of [['mural', -10.3, 1.9, 2.5, 1.5], ['tv', 10.3, 2.0, 2.9, 1.8], ['placa', 0, 2.05, 3.4, 1.6]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(l, a, 0.5), MAT.hit);
    c.position.set(x, y, -Z + 0.35); c.userData = { tipo: 'lugar', lugar }; cena.add(c); E.cliques.push(c);
  }
  for (const [lugar, w, h, d] of [['recepcao', 1.9, 1.1, 0.7], ['impressora', 0.8, 1.1, 0.7], ['cafe', 1.9, 1.3, 0.7], ['sofa', 2, 0.9, 1], ['reuniao', 2, 1, 2]]) {
    const [x, z] = LUGAR_TELA[lugar].cam;
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.hit);
    c.position.set(x, h / 2, z); c.userData = { tipo: 'lugar', lugar }; cena.add(c); E.cliques.push(c);
  }
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
  if (E.tvFotos) {
    x.fillStyle = '#15181d'; x.fillRect(32, 25, 600, 78);
    x.fillStyle = '#7fe0c8'; x.textAlign = 'left'; x.font = '700 28px system-ui'; x.fillText(t('entraramHoje'), 56, 64);
    if (!E.entraram?.length) { x.fillStyle = '#b7c0ca'; x.font = '28px system-ui'; x.fillText(t('semImoveisHoje'), 56, 290); }
    (E.entraram || []).forEach((im, i) => {
      const cx = 56 + i * 312, cy = 150, img = E.tvImagens?.get(im.capa);
      x.fillStyle = '#29333c'; x.fillRect(cx, cy, 288, 260);
      if (img?.complete && img.naturalWidth) {
        const k = Math.max(288 / img.naturalWidth, 260 / img.naturalHeight), w = 288 / k, h = 260 / k;
        x.drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, cx, cy, 288, 260);
      } else { x.fillStyle = '#b7c0ca'; x.font = '22px system-ui'; x.fillText(t('semFoto'), cx + 22, cy + 130); }
      x.fillStyle = '#fff'; x.font = '600 28px system-ui'; x.fillText(String(im.codigo), cx, 450, 288);
      x.fillStyle = '#b7c0ca'; x.font = '23px system-ui'; x.fillText(String(im.tipo || ''), cx, 488, 288);
    });
    E.tv.tx.needsUpdate = true; return;
  }
  const itens = [[`${tt.no_ar ?? 0}/9`, t('noar')], [tt.conversas ?? 0, t('conversas')], [tt.enviadas ?? 0, t('enviadas')], [tt.aprovar ?? 0, t('aprovar')]];
  itens.forEach(([v, l], i) => {
    const cx = 56 + (i % 2) * 470, cy = 150 + Math.floor(i / 2) * 200;
    x.fillStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.roundRect(cx, cy, 440, 170, 18); x.fill();
    x.textAlign = 'left'; x.fillStyle = i === 3 && tt.aprovar > 0 ? '#e8c36a' : '#ffffff'; x.font = '600 84px "JetBrains Mono", ui-monospace, monospace'; x.fillText(String(v), cx + 28, cy + 70);
    x.fillStyle = '#b7c0ca'; x.font = '500 28px "DM Sans", system-ui, sans-serif'; x.fillText(l, cx + 30, cy + 132);
  });
  E.tv.tx.needsUpdate = true;
}
function tvImoveis(lista) {
  E.entraram = lista.slice(0, 3); E.tvImagens ||= new Map(); const meu = E;
  const capas = new Set(E.entraram.map((i) => i.capa).filter((id) => Number.isSafeInteger(id) && id > 0));
  for (const id of E.tvImagens.keys()) if (!capas.has(id)) E.tvImagens.delete(id);
  for (const id of capas) if (!E.tvImagens.has(id)) {
    const img = new Image(); E.tvImagens.set(id, img);
    img.onload = () => { if (E === meu) tvPinta(); }; img.src = `/api/arquivos/${id}`;
  }
}

// ---------- mobília ----------
// cadeira de escritório: assento e encosto estofados com cantos redondos, braços, pistão, base de 5 pés com rodízios
function cadeira(L, M, x, z, ry = 0, k = 1) {
  const c = Math.cos(ry), s = Math.sin(ry); const P = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  L.cil(0.03 * k, 0.03 * k, 0.3 * k, M.aco, x, 0.27 * k, z, 12); L.cil(0.06 * k, 0.05 * k, 0.04 * k, M.preto, x, 0.43 * k, z, 12);
  for (let i = 0; i < 5; i++) { const a = ry + (i / 5) * Math.PI * 2; const [bx, bz] = [x + Math.sin(a) * 0.17 * k, z + Math.cos(a) * 0.17 * k]; L.add(new THREE.BoxGeometry(0.04 * k, 0.03 * k, 0.32 * k), M.preto, bx, 0.06 * k, bz, 0, a, 0); L.add(new THREE.SphereGeometry(0.025 * k, 8, 6), M.plasticoEscuro, x + Math.sin(a) * 0.32 * k, 0.025 * k, z + Math.cos(a) * 0.32 * k); }
  L.redonda(0.5 * k, 0.09 * k, 0.5 * k, 0.04 * k, M.tecido, x, 0.49 * k, z, ry);
  const [ex, ez] = P(0, 0.23 * k); L.redonda(0.48 * k, 0.56 * k, 0.07 * k, 0.035 * k, M.tecido, ex, 0.84 * k, ez, ry, -0.08);
  for (const dx of [-0.26, 0.26]) { const [ax, az] = P(dx * k, 0.02 * k); L.caixa(0.05 * k, 0.03 * k, 0.3 * k, M.plasticoEscuro, ax, 0.72 * k, az, ry); const [px, pz] = P(dx * k, 0.08 * k); L.caixa(0.03 * k, 0.2 * k, 0.03 * k, M.plasticoEscuro, px, 0.62 * k, pz, ry); }
}
function constroiMobilia(cena) {
  const M = materiais(); const { Z } = SALA; const L = new Lote(cena);
  // mesas (tampo em carvalho com borda arredondada, pés em aço preto), monitores, teclado, caneca
  for (const [slug, [x, z]] of Object.entries(MESAS)) {
    L.redonda(1.6, 0.04, 0.8, 0.012, M.madeiraClara, x, 0.74, z);
    L.caixa(0.05, 0.72, 0.7, M.preto, x - 0.74, 0.36, z); L.caixa(0.05, 0.72, 0.7, M.preto, x + 0.74, 0.36, z); L.caixa(1.48, 0.04, 0.05, M.preto, x, 0.08, z - 0.3); L.caixa(1.48, 0.03, 0.05, M.preto, x, 0.68, z - 0.33);
    L.caixa(1.5, 0.32, 0.02, M.vidroFosco, x, 0.92, z - 0.39); L.caixa(1.5, 0.02, 0.03, M.aluminio, x, 1.08, z - 0.39); // painel de privacidade (acrílico jateado)
    L.cil(0.14, 0.17, 0.02, M.preto, x, 0.77, z - 0.18, 24); L.caixa(0.04, 0.26, 0.04, M.preto, x, 0.9, z - 0.2); // base e haste do monitor
    L.redonda(0.62, 0.4, 0.028, 0.006, M.preto, x, 1.17, z - 0.17); // moldura fina
    L.redonda(0.42, 0.012, 0.14, 0.004, M.plasticoEscuro, x, 0.766, z + 0.24); // teclado
    for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) L.caixa(0.024, 0.004, 0.022, M.preto, x - 0.19 + c * 0.0315, 0.774, z + 0.19 + r * 0.03);
    L.add(new THREE.CapsuleGeometry(0.025, 0.04, 4, 10), M.plasticoEscuro, x + 0.32, 0.78, z + 0.26, Math.PI / 2, 0, 0); // mouse
    L.add(new THREE.BoxGeometry(0.22, 0.012, 0.3), M.papel, x - 0.5, 0.766, z + 0.05, 0, -0.3, 0); // papel
    L.cil(0.04, 0.035, 0.09, M.ceramica, x + 0.55, 0.805, z + 0.02, 14); L.toro(0.03, 0.008, M.ceramica, x + 0.595, 0.81, z + 0.02, 0, Math.PI / 2, 12); L.cil(0.034, 0.034, 0.004, M.cafe, x + 0.55, 0.848, z + 0.02, 12); // caneca
    cadeira(L, M, x, z + SENTA + 0.08, 0);
    sombraContato(cena, x, z, 2.4, 1.5, 0.45); sombraContato(cena, x, z + SENTA + 0.08, 1.0, 1.0, 0.4);
    // luminária de mesa (acende à noite)
    L.cil(0.06, 0.07, 0.015, M.preto, x + 0.6, 0.76, z - 0.25, 12); L.add(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8), M.preto, x + 0.6, 0.93, z - 0.25, 0, 0, 0.25); L.add(new THREE.ConeGeometry(0.06, 0.09, 14, 1, true), M.preto, x + 0.64, 1.1, z - 0.25, 0, 0, 1.1);
  }
  // café (canto da frente, à esquerda): balcão de nogueira com tampo de mármore, máquina de espresso, xícaras
  L.caixa(1.8, 0.9, 0.6, M.madeira, -4.6, 0.45, Z - 0.42); L.redonda(1.88, 0.04, 0.68, 0.01, M.marmore, -4.6, 0.92, Z - 0.42);
  L.redonda(0.34, 0.42, 0.36, 0.02, M.aco, -5.0, 1.15, Z - 0.42); L.caixa(0.28, 0.1, 0.02, M.plasticoEscuro, -5.0, 1.25, Z - 0.61); L.caixa(0.3, 0.04, 0.3, M.preto, -5.0, 1.38, Z - 0.42);
  for (let i = 0; i < 4; i++) L.cil(0.04, 0.035, 0.08, M.ceramica, -4.35 + i * 0.14, 0.98, Z - 0.45 + (i % 2) * 0.12, 10);
  L.redonda(0.5, 0.26, 0.3, 0.02, M.cinzaClaro, -3.95, 1.07, Z - 0.42);
  sombraContato(cena, -4.6, Z - 0.5, 2.6, 1.3, 0.4);
  // balcão de recepção / plantão (frente à porta, à esquerda): nogueira com tampo de mármore e friso de LED
  L.caixa(1.7, 1.05, 0.5, M.madeira, -2.2, 0.525, Z - 1.6); L.redonda(1.8, 0.04, 0.6, 0.01, M.marmore, -2.2, 1.07, Z - 1.6);
  const friso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 0.02), M.led); friso.position.set(-2.2, 0.98, Z - 1.35); cena.add(friso); E.leds.push(friso);
  L.caixa(0.5, 0.012, 0.35, M.papel, -2.2, 1.095, Z - 1.6); L.cil(0.04, 0.04, 0.16, M.dourado, -1.6, 1.17, Z - 1.6, 12);
  sombraContato(cena, -2.2, Z - 1.6, 2.4, 1.2, 0.45);
  // sofá com almofadas (direita da porta) sobre tapete, mesinha de centro em nogueira
  L.caixa(2.6, 0.015, 1.9, M.tapete, 3.2, 0.008, Z - 1.5);
  L.redonda(1.9, 0.3, 0.85, 0.04, M.tecidoSofa, 3.2, 0.2, Z - 0.75);
  for (const dx of [-0.6, 0, 0.6]) { L.redonda(0.58, 0.14, 0.78, 0.05, M.tecidoSofa, 3.2 + dx, 0.42, Z - 0.75); L.redonda(0.56, 0.44, 0.16, 0.05, M.tecidoSofa, 3.2 + dx, 0.72, Z - 0.4, 0, -0.1); }
  L.redonda(0.2, 0.36, 0.85, 0.04, M.tecidoSofa, 2.25, 0.6, Z - 0.75); L.redonda(0.2, 0.36, 0.85, 0.04, M.tecidoSofa, 4.15, 0.6, Z - 0.75);
  for (const dx of [-0.8, 0.8]) L.caixa(0.06, 0.08, 0.7, M.preto, 3.2 + dx, 0.04, Z - 0.75);
  L.redonda(0.9, 0.03, 0.5, 0.01, M.madeira, 3.2, 0.4, Z - 1.9); for (const [dx, dz] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]]) L.cil(0.012, 0.012, 0.4, M.aco, 3.2 + dx, 0.2, Z - 1.9 + dz, 8);
  L.cil(0.05, 0.04, 0.12, M.ceramica, 3.0, 0.46, Z - 1.9, 12); L.redonda(0.3, 0.025, 0.22, 0.004, M.papel, 3.45, 0.43, Z - 1.85, 0.2);
  sombraContato(cena, 3.2, Z - 0.8, 2.6, 1.3, 0.45);
  // impressora (esquerda, junto à parede)
  L.redonda(0.6, 0.5, 0.5, 0.02, M.cinzaClaro, -11.3, 0.9, 2.4); L.redonda(0.7, 0.65, 0.6, 0.02, M.branco, -11.3, 0.325, 2.4); L.caixa(0.4, 0.01, 0.3, M.papel, -11.3, 1.16, 2.5); L.caixa(0.3, 0.02, 0.1, M.preto, -11.3, 1.16, 2.2);
  sombraContato(cena, -11.3, 2.4, 1.2, 1.1, 0.4);
  // mesa de reunião redonda (diretoria, na frente) em nogueira com 4 cadeiras
  L.cil(0.8, 0.8, 0.04, M.madeira, 8.7, 0.74, 5.2, 48); L.cil(0.06, 0.1, 0.72, M.preto, 8.7, 0.36, 5.2, 12); L.cil(0.4, 0.4, 0.02, M.preto, 8.7, 0.01, 5.2, 24);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; cadeira(L, M, 8.7 + Math.cos(a) * 1.15, 5.2 + Math.sin(a) * 1.15, -a + Math.PI / 2, 0.95); }
  L.cil(0.05, 0.04, 0.12, M.ceramica, 8.5, 0.82, 5.0, 12); L.redonda(0.3, 0.02, 0.22, 0.004, M.papel, 8.95, 0.77, 5.35, 0.3);
  sombraContato(cena, 8.7, 5.2, 3.2, 3.2, 0.4);
  // plantas em vasos (folhas de verdade)
  for (const [x, z, k] of [[-11.2, 6.1, 1.1], [-6.4, -6.2, 1.0], [4.3, -6.2, 1.0], [11.2, 6.1, 1.1], [-11.2, -1.0, 0.8], [6.2, 0.6, 0.85]]) planta(L, x, z, k);
  // luminárias de piso (arco) — a cúpula acende à noite
  const cupulas = [];
  for (const [x, z] of [[-11.0, -4.4], [-1.6, 4.6], [11.0, -4.4], [5.9, 6.2]]) { L.cil(0.18, 0.18, 0.02, M.preto, x, 0.01, z, 16); L.cil(0.02, 0.02, 1.9, M.aco, x, 0.96, z, 8); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 24, 1, true), M.cupula.clone()); c.position.set(x, 1.98, z); cena.add(c); cupulas.push(c); }
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
// Planta: vaso de cerâmica com terra e um tufo de folhas recortadas (planos com alphaTest), como uma costela-de-adão.
function planta(L, x, z, k = 1) {
  const M = materiais();
  L.cil(0.2 * k, 0.16 * k, 0.42 * k, M.vaso, x, 0.21 * k, z, 24); L.cil(0.17 * k, 0.17 * k, 0.02, M.terra, x, 0.42 * k, z, 18);
  let s = Math.round(x * 13 + z * 7) & 0xffff; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const folha = new THREE.PlaneGeometry(0.28, 0.56); folha.translate(0, 0.28, 0);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.5; const inc = 0.55 + rnd() * 0.6; const h = (0.35 + rnd() * 0.3) * k; const esc = (0.8 + rnd() * 0.5) * k;
    const g = folha.clone(); g.scale(esc, esc, esc);
    L.add(g, M.folha, x + Math.cos(a) * 0.08 * k, h, z + Math.sin(a) * 0.08 * k, -inc * 0.6, -a + Math.PI / 2, 0);
    L.cil(0.006 * k, 0.006 * k, h - 0.4 * k, M.verde, x + Math.cos(a) * 0.05 * k, 0.42 * k + (h - 0.4 * k) / 2, z + Math.sin(a) * 0.05 * k, 6);
  }
  sombraContato(E.cena, x, z, 1.2 * k, 1.2 * k, 0.4);
}

// ---------- a cidade lá fora: céu físico com sol, panorama fotográfico (dia / tarde / noite), prédios próximos, estrelas ----------
function constroiCidade(cena) {
  // céu físico (Preetham) — o sol vai com a hora
  const ceu = new Sky(); ceu.scale.setScalar(480); ceu.renderOrder = -3; cena.add(ceu); E.ceu = ceu.material;
  Object.assign(E.ceu.uniforms.turbidity, { value: 6 }); E.ceu.uniforms.rayleigh.value = 1.6; E.ceu.uniforms.mieCoefficient.value = 0.006; E.ceu.uniforms.mieDirectionalG.value = 0.8;
  // estrelas
  const n = 700; const pos = new Float32Array(n * 3); let s = 5; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3; pos[i * 3] = Math.cos(a) * Math.cos(e) * 380; pos[i * 3 + 1] = Math.sin(e) * 380; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380; }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const estrelas = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })); cena.add(estrelas); E.estrelas = estrelas;
  // panoramas fotográficos (gerados pelo Flux) num cilindro atrás da fachada, com a borda de cima esfumada no céu
  const R = 300, ARCO = 2.75, ALT = R * ARCO / (2048 / 768);
  const geo = new THREE.CylinderGeometry(R, R, ALT, 96, 1, true, Math.PI - ARCO / 2, ARCO);
  const alfa = document.createElement('canvas'); alfa.width = alfa.height = 256; const ax = alfa.getContext('2d');
  const grad = ax.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, '#000'); grad.addColorStop(0.2, '#fff'); grad.addColorStop(0.93, '#fff'); grad.addColorStop(1, '#000'); ax.fillStyle = grad; ax.fillRect(0, 0, 256, 256);
  // Nas órbitas laterais a fotografia também se dissolve no céu, sem corte vertical.
  const bordas = ax.createLinearGradient(0, 0, 256, 0); bordas.addColorStop(0, '#000'); bordas.addColorStop(0.06, '#fff'); bordas.addColorStop(0.94, '#fff'); bordas.addColorStop(1, '#000');
  ax.globalCompositeOperation = 'multiply'; ax.fillStyle = bordas; ax.fillRect(0, 0, 256, 256);
  const alfaTx = new THREE.CanvasTexture(alfa);
  E.panoramas = {};
  for (const nome of ['dia', 'tarde', 'noite']) {
    const mapa = tex('cidade-' + nome, { repeat: [-1, 1] }); mapa.offset.x = 1;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mapa, alphaMap: alfaTx, transparent: true, opacity: nome === 'dia' ? 1 : 0, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: true }));
    m.position.y = -8; m.renderOrder = -2; cena.add(m); E.panoramas[nome] = m;
  }
  // prédios próximos (parallax em frente ao panorama): janelas desenhadas num canvas; emissivo só à noite
  const jan = document.createElement('canvas'); jan.width = 256; jan.height = 512; const x = jan.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 512);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 4; c++) { if (rnd() < 0.48) { const q = 0.5 + rnd() * 0.5; x.fillStyle = rnd() < 0.8 ? `rgba(${Math.round(255 * q)},${Math.round((190 + rnd() * 40) * q)},${Math.round((110 + rnd() * 70) * q)},1)` : `rgba(${Math.round(190 * q)},${Math.round(215 * q)},${Math.round(255 * q)},1)`; x.fillRect(c * 64 + 14, r * 32 + 9, 36, 17); } }
  const janTx = new THREE.CanvasTexture(jan); janTx.wrapS = janTx.wrapT = THREE.RepeatWrapping; janTx.colorSpace = THREE.SRGBColorSpace;
  const dia = document.createElement('canvas'); dia.width = 256; dia.height = 512; const y = dia.getContext('2d');
  y.fillStyle = '#b9c2cc'; y.fillRect(0, 0, 256, 512); for (let r = 0; r < 16; r++) for (let c = 0; c < 4; c++) { y.fillStyle = rnd() < 0.5 ? '#6f879f' : '#88a0b8'; y.fillRect(c * 64 + 14, r * 32 + 9, 36, 17); y.fillStyle = 'rgba(255,255,255,.35)'; y.fillRect(c * 64 + 14, r * 32 + 9, 36, 3); }
  const diaTx = new THREE.CanvasTexture(dia); diaTx.wrapS = diaTx.wrapT = THREE.RepeatWrapping; diaTx.colorSpace = THREE.SRGBColorSpace;
  const geos = [];
  for (let i = 0; i < 32; i++) {
    const lado = rnd(); let px, pz;
    if (lado < 0.7) { px = -170 + rnd() * 340; pz = -55 - rnd() * 150; } else { px = (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 100); pz = -70 + rnd() * 100; }
    if (Math.abs(px) < 34 && pz > -55) continue;
    // Volumes baixos dão parallax; o horizonte e os prédios altos vêm da fotografia.
    const w = 8 + rnd() * 13, d = 8 + rnd() * 13, topo = -48 + rnd() * 28 - rnd() * 16;
    const base = -170, h = topo - base;
    const g = new THREE.BoxGeometry(w, h, d); g.translate(px, base + h / 2, pz);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 7), uv.getY(k) * (h / 14));
    geos.push(g);
  }
  const predios = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: diaTx, color: 0xffffff, emissive: 0xffffff, emissiveMap: janTx, emissiveIntensity: 0, roughness: 0.6, metalness: 0.15 }));
  cena.add(predios); E.predios = predios;
  // o chão da cidade, bem lá embaixo
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3b414b, roughness: 1 })); chao.rotation.x = -Math.PI / 2; chao.position.y = -170; cena.add(chao); E.chaoCidade = chao; // abaixo da borda do panorama, sem cortar a fotografia
}
// Alvo da iluminação pela hora: dia, fim de tarde, noite (interpola suave no quadro).
function climaAlvo(h, agora) {
  if (!E || !E.clima) return;
  const C = (hex) => new THREE.Color(hex);
  let a;
  if (h >= 6.5 && h < 16.5) a = { solI: 2.2, hemiI: 0.7, exp: 0.95, pratI: 0, cidade: 0, estrelas: 0, sol: C(0xfff3e0), hemiCeu: C(0xcfe0f5), hemiChao: C(0xa68a66), solPos: new THREE.Vector3(-9, 16, -13), fog: C(0xd9e8f4), ceuSol: new THREE.Vector3(-0.35, 0.62, -0.7), turb: 5, ray: 1.4 };
  else if ((h >= 16.5 && h < 19) || (h >= 5.5 && h < 6.5)) a = { solI: 2.4, hemiI: 0.55, exp: 1.05, pratI: 14, cidade: 0.3, estrelas: 0, sol: C(0xffb36e), hemiCeu: C(0xf5c9a0), hemiChao: C(0x8a6a4e), solPos: new THREE.Vector3(16, 4.5, -13), fog: C(0xf1c2a0), ceuSol: new THREE.Vector3(0.75, 0.08, -0.65), turb: 9, ray: 3.2 };
  else a = { solI: 0.25, hemiI: 0.4, exp: 1.0, pratI: 18, cidade: 0.75, estrelas: 0.9, sol: C(0x8ea4ff), hemiCeu: C(0x303c5e), hemiChao: C(0x2a1c12), solPos: new THREE.Vector3(-6, 14, -10), fog: C(0x141a2c), ceuSol: new THREE.Vector3(-0.3, -0.12, -0.9), turb: 2, ray: 0.2 };
  E.alvo = a; E.modoCeu = a.estrelas > 0.5 ? 'noite' : a.cidade > 0 ? 'tarde' : 'dia';
  if (agora) { for (const k of Object.keys(a)) { if (a[k] && a[k].isColor) E.clima[k].copy(a[k]); else if (a[k] && a[k].isVector3) E.clima[k].copy(a[k]); else E.clima[k] = a[k]; } aplicaClima(); }
}
const suaveDegrau = (a, b, x) => { const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
function aplicaClima() {
  const c = E.clima;
  E.sol.intensity = c.solI; E.sol.color.copy(c.sol); E.sol.position.copy(c.solPos);
  E.hemi.intensity = c.hemiI; E.hemi.color.copy(c.hemiCeu); E.hemi.groundColor.copy(c.hemiChao);
  E.exposicao = c.exp;
  E.praticas.forEach((l) => { l.intensity = c.pratI; });
  E.cupulas.forEach((m) => { m.material.emissiveIntensity = c.pratI / 25; });
  if (E.ceu && E.ceu.uniforms) { E.ceu.uniforms.sunPosition.value.copy(c.ceuSol); E.ceu.uniforms.turbidity.value = c.turb; E.ceu.uniforms.rayleigh.value = c.ray; }
  E.cena.fog.color.copy(c.fog);
  E.predios.material.emissiveIntensity = c.cidade; E.predios.material.color.setScalar(1 - c.cidade * 0.75);
  E.estrelas.material.opacity = c.estrelas;
  if (E.panoramas) { const x = c.cidade; E.panoramas.dia.material.opacity = 1 - suaveDegrau(0, 0.3, x); E.panoramas.tarde.material.opacity = suaveDegrau(0, 0.3, x) * (1 - suaveDegrau(0.3, 0.75, x)); E.panoramas.noite.material.opacity = suaveDegrau(0.3, 0.75, x); }
  E.leds.forEach((m) => { m.material.emissiveIntensity = 0.6 + c.pratI / 30; });
  E.placa.material.emissiveIntensity = 0;
}
function interpolaClima(dt) {
  const c = E.clima, a = E.alvo; if (!a || !a.sol) return;
  const k = Math.min(1, dt * 0.9);
  for (const n of ['solI', 'hemiI', 'exp', 'pratI', 'cidade', 'estrelas', 'turb', 'ray']) c[n] = lerp(c[n], a[n], k);
  for (const n of ['sol', 'hemiCeu', 'hemiChao', 'fog']) c[n].lerp(a[n], k);
  c.solPos.lerp(a.solPos, k); c.ceuSol.lerp(a.ceuSol, k);
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
    const im = new Image(); im.onload = () => { x.clearRect(0, 0, tam, tam); x.save(); x.beginPath(); x.arc(tam / 2, tam / 2, tam / 2 - 8, 0, Math.PI * 2); x.clip(); x.drawImage(im, 0, 0, tam, tam); x.restore(); anel(); }; im.src = FOTO(slug);
  }
  return tx;
}

// ---------- humanos 3D (GLB + esqueleto) ----------
const PESSOA_CACHE = {}; // url -> Promise<gltf>
let GLTF = null;
function carregaGltf(url) {
  GLTF = GLTF || new GLTFLoader();
  return (PESSOA_CACHE[url] = PESSOA_CACHE[url] || GLTF.loadAsync(url));
}
// Esqueleto Biped do Rocketbox (nomes como o GLTFLoader os deixa): o que é "parte de baixo" ao sentar.
const OSSO_BAIXO = /Pelvis|Spine$|Thigh|Calf|Foot|Toe/;
// Pessoa de verdade: corpo com esqueleto, animações por nome, misturador com transição suave entre elas.
async function fazPessoa(slug, cor) {
  const g = PESSOA_GENERO[slug] || 'm';
  const [modelo, anims] = await Promise.all([carregaGltf(`${PESSOAS_URL}${slug}.glb`), carregaGltf(`${PESSOAS_URL}anim-${g}.glb`)]);
  if (!vivo()) throw new Error('cena fechada');
  const corpo = clonaEsqueleto(modelo.scene); // cópia com esqueleto próprio (o GLB carregado fica intacto no cache)
  const grp = new THREE.Group(); grp.userData = { slug, tipo: 'agente' }; grp.add(corpo);
  const mats = [];
  corpo.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.userData = { slug, tipo: 'agente' };
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); // materiais próprios (opacidade, inativo)
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      m.envMapIntensity = 0.55;
      if (m.transparent || /opacity/i.test(m.name)) { m.transparent = false; m.alphaTest = 0.45; m.depthWrite = true; m.side = THREE.DoubleSide; }
      m.userData.corBase = m.color.clone(); mats.push(m);
    }
  });
  const clips = {}; for (const c of anims.animations) clips[c.name] = c;
  if (clips.sentado && clips.digita && !clips.digitaSentado) clips.digitaSentado = clips.sentado; // digitar sentado = sentado + mãos no teclado (procedural)
  const mixer = new THREE.AnimationMixer(corpo);
  const acoes = {}; for (const [n, c] of Object.entries(clips)) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; acoes[n] = a; }
  const osso = (n) => corpo.getObjectByName(n);
  const b = { glb: true, g: grp, corpo, mixer, acoes, mats, atual: null, sentado: false,
    cabeca: osso('Bip01_Head'), pescoco: osso('Bip01_Neck'),
    antebracos: [osso('Bip01_L_Forearm'), osso('Bip01_R_Forearm')], maos: [osso('Bip01_L_Hand'), osso('Bip01_R_Hand')], teclando: 0 };
  // toca(nome): troca a animação com transição; velocidade opcional
  b.toca = (nome, tempo = 0.35, vel = 1) => {
    const a = b.acoes[nome] || b.acoes.idle; if (!a) return;
    a.timeScale = vel;
    if (b.atual === a) return;
    if (b.atual) { a.reset().play(); b.atual.crossFadeTo(a, tempo, true); } else { a.reset().play(); }
    b.atual = a;
  };
  // dessincroniza as pessoas (não respiram todas juntas)
  b.fase = Math.random() * 3;
  return b;
}
// Depois do misturador: mãos no teclado e dedos mexendo (as animações sentadas do Rocketbox deixam as mãos no tampo).
const _q = new THREE.Quaternion(); const _ax = new THREE.Vector3(0, 1, 0); const _ax2 = new THREE.Vector3(1, 0, 0);
function maosNoTeclado(b, k, t) {
  if (k <= 0.001) return;
  for (let i = 0; i < 2; i++) {
    const fa = b.antebracos[i], ma = b.maos[i]; if (!fa || !ma) continue;
    fa.quaternion.multiply(_q.setFromAxisAngle(_ax, (0.55 + Math.sin(t * 17 + i * 1.7) * 0.04) * k));
    ma.quaternion.multiply(_q.setFromAxisAngle(_ax2, Math.sin(t * 19 + i * 2.1) * 0.14 * k));
  }
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
  b.sentado = true;
  if (b.glb) { b.toca('sentado', 0.45); return; }
  b.corpo.position.y = -0.39;
  b.coxas.forEach((c) => { c.rotation.x = Math.PI / 2; }); b.canelas.forEach((c) => { c.rotation.x = -Math.PI / 2 + 0.1; });
  b.bracos.forEach(({ br, ante }) => { br.rotation.x = 0.55; ante.rotation.x = 0.95; });
}
function levantaBoneco(b) {
  b.sentado = false;
  if (b.glb) { b.toca('idle', 0.3); return; }
  b.corpo.position.y = 0;
  b.coxas.forEach((c) => { c.rotation.x = 0; }); b.canelas.forEach((c) => { c.rotation.x = 0; });
  b.bracos.forEach(({ br, ante }) => { br.rotation.x = 0; ante.rotation.x = 0.15; });
}
function montaAgentes(lista) {
  for (const a of lista) {
    const m = MESAS[a.slug]; if (!m) continue;
    // o boneco estilizado entra na hora; a pessoa de verdade (GLB) troca de lugar com ele assim que carrega
    const b = fazBoneco(a.cor, texturaRosto(a.slug, a.nome, a.cor), a.slug);
    const ag = { slug: a.slug, nome: a.nome, cor: a.cor, dados: a, b, mesa: m, x: m[0], z: m[1] + SENTA, rot: Math.PI, rotAlvo: Math.PI, ocupado: false, andando: false, digita: 0, faz: 0, estica: 0, dorme: !a.ativo, tela: E.monitores[a.slug] };
    b.g.position.set(ag.x, 0, ag.z); b.g.rotation.y = Math.PI; // de frente para as janelas (olhando para -z)
    b.g.visible = false; // só aparece se o humano 3D falhar
    sentaBoneco(b); E.cena.add(b.g);
    // etiquetas HTML: nome e balões
    const ovl = $('#j3-ovl');
    const nome = document.createElement('div'); nome.className = 'j3-nome'; nome.style.setProperty('--c', a.cor); ovl.appendChild(nome);
    const baloes = document.createElement('div'); baloes.className = 'j3-baloes'; baloes.style.setProperty('--c', a.cor); ovl.appendChild(baloes);
    ag.elNome = nome; ag.elBaloes = baloes;
    E.agentes[a.slug] = ag;
    etiquetaNome(ag); telaPinta(ag);
    trocaPorPessoa(ag);
  }
  zonasTexto();
  atualizaAgentes(lista);
}
// Carrega o humano 3D e põe no lugar do boneco, herdando posição, estado e pose.
async function trocaPorPessoa(ag) {
  const meu = E;
  let p;
  try { p = await fazPessoa(ag.slug, ag.cor); }
  catch (e) { console.warn('humano 3D indisponível para', ag.slug, e); if (E === meu && ag.b) ag.b.g.visible = true; return; }
  if (E !== meu || !vivo()) return;
  const velho = ag.b;
  p.g.position.copy(velho.g.position); p.g.rotation.y = velho.g.rotation.y;
  E.cena.remove(velho.g);
  ag.b = p; E.cena.add(p.g);
  if (velho.sentado) sentaBoneco(p); else levantaBoneco(p);
  p.mixer.update(p.fase); // começa num ponto diferente da animação
  if (E.agentes[ag.slug] === ag) atualizaAgentes([ag.dados]);
}
function etiquetaNome(ag) {
  ag.elNome.innerHTML = `<i class="st"></i>${esc(ag.nome)}${ag.dorme ? `<small class="zz">z<small>z</small></small>` : ''}`;
  ag.elNome.classList.toggle('dorme', !!ag.dorme);
}
function zonasTexto() {
  const ovl = $('#j3-ovl'); if (!ovl) return;
  ovl.querySelectorAll('.j3-zona').forEach((z) => z.remove());
  E.zonas = ZONAS.map(([k, x]) => { const el = document.createElement('div'); el.className = 'j3-zona'; el.textContent = t(k); ovl.appendChild(el); return { el, pos: new THREE.Vector3(x, 3.05, -SALA.Z + 0.1) }; });
  const lugares = [['entrada', 0, 2.55, SALA.Z + 0.1], ['cafe', -4.6, 1.75, SALA.Z - 0.4, 'cafe'], ['recepcao', -2.2, 1.55, SALA.Z - 1.6, 'recepcao'], ['reuniao', 8.7, 1.3, 5.2, 'reuniao'], ['sofa', 3.2, 1.3, 6.2, 'sofa'],
    ['mural', -10.3, 2.75, -SALA.Z + 0.2, 'mural'], ['impressora', -11.3, 1.5, 2.4, 'impressora'], ['painel', 10.3, 2.95, -SALA.Z + 0.2, 'tv'], ['crm', 0, 1.22, -SALA.Z + 0.2, 'placa']];
  E.lugares = lugares.map(([k, x, y, z, lugar]) => {
    const el = document.createElement('div'); el.className = 'j3-zona j3-lugar';
    if (lugar) { el.classList.add('clicavel'); el.dataset.act = 'j3-lugar'; el.dataset.lugar = lugar; el.title = t('cliqueAbrir'); el.tabIndex = 0; el.setAttribute('role', 'button'); el.innerHTML = `${esc(LUGAR_TELA[lugar].icone)} ${esc(t(k))}<small>${esc(t('cliqueAbrir'))}</small>`; el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abreLugar(lugar); } }; }
    else el.textContent = t(k);
    ovl.appendChild(el); return { el, pos: new THREE.Vector3(x, y, z) };
  });
}
function atualizaAgentes(lista) {
  for (const a of lista) {
    const ag = E.agentes[a.slug]; if (!ag) continue;
    ag.dados = a; ag.nome = a.nome; ag.estado = a.estado;
    ag.dorme = !a.ativo;
    if (ag.b.glb) {
      ag.b.mats.forEach((m) => { if (m.alphaTest) return; m.transparent = ag.dorme; m.opacity = ag.dorme ? 0.6 : 1; m.color.copy(m.userData.corBase); if (ag.dorme) m.color.multiplyScalar(0.55); m.needsUpdate = true; });
    } else {
      ag.b.mats.forEach((m) => { m.transparent = ag.dorme; m.opacity = ag.dorme ? 0.55 : 1; m.color.set(a.cor); if (ag.dorme) m.color.lerp(new THREE.Color(0x888888), 0.5); });
      ag.b.rosto.material.opacity = ag.dorme ? 0.6 : 1;
      ag.b.cabeca.rotation.z = ag.dorme ? 0.25 : 0;
    }
    if (!ag.tela.externa) telaPinta(ag);
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
  if (ag.dados.ultimas?.length) {
    ag.dados.ultimas.slice(-3).forEach((m, i) => {
      const saida = m.direcao === 'saida', bx = saida ? 108 : 40, by = 80 + i * 64;
      x.fillStyle = saida ? '#195c4c' : '#303c49'; x.beginPath(); x.roundRect(bx, by, 364, 58, 9); x.fill();
      x.textAlign = 'left'; x.fillStyle = '#c6d5d0'; x.font = '11px system-ui'; x.fillText(saida ? ag.nome : t('cliente'), bx + 10, by + 10);
      const texto = String(m.texto).slice(0, 60); x.fillStyle = '#fff'; x.font = '14px system-ui';
      x.fillText(texto.slice(0, 34), bx + 10, by + 27, 342); x.fillText(texto.slice(34), bx + 10, by + 44, 285);
      x.textAlign = 'right'; x.fillStyle = '#b2c8c1'; x.font = '10px system-ui'; x.fillText(String(m.hora), bx + 354, by + 47);
    });
    m.tx.needsUpdate = true; return;
  }
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
  for (const c of E.cliques || []) alvos.push(c);
  const hits = E.ray.intersectObjects(alvos, true);
  for (const h of hits) {
    let o = h.object; while (o && !(o.userData && (o.userData.slug || o.userData.lugar))) o = o.parent;
    if (o && o.userData.lugar) return { lugar: o.userData.lugar, tipo: 'lugar' };
    if (o) return { slug: o.userData.slug, tipo: h.object.userData.tipo || o.userData.tipo };
  }
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
  const foto = AVATARES.includes(slug) ? `<img src="${FOTO(slug)}" alt="">` : `<span class="j3-ini" style="background:${esc(ag.cor)}">${esc(ag.nome.slice(0, 2))}</span>`;
  c.innerHTML = `<button class="j3-x" data-act="j3-fecha-card" title="${esc(t('fechar'))}">×</button>
    <div class="j3-card-topo">${foto}<div><b>${esc(ag.nome)}</b><span>${esc(a.cargo || '')}</span><small><i class="st" data-estado="${esc(a.estado || '')}"></i>${esc(a.estado === 'conectado' ? 'WhatsApp ' + t('vivo') : a.estado || '')}${ag.dorme ? ` · ${esc(t('inativo'))}` : ''}</small></div></div>
    <div class="j3-card-nums"><div><b>${a.conversas ?? 0}</b><span>${esc(t('conversas'))}</span></div><div><b>${a.enviadas ?? 0}</b><span>${esc(t('enviadas'))}</span></div><div class="${a.aprovar > 0 ? 'q' : ''}"><b>${a.aprovar ?? 0}</b><span>${esc(t('aprovar'))}</span></div></div>
    <a class="btn pri" href="#/whats/agente/${esc(slug)}">${esc(t('abrir'))} →</a>`;
  c.style.setProperty('--c', ag.cor); c.hidden = false;
}
function fechaCard() { const c = $('#j3-card'); if (c) { c.hidden = true; } if (E) E.cardSlug = null; }

// ---------- lugares clicáveis: a tela real do sistema dentro do escritório ----------
// mural → oportunidades (radar) · TV da diretoria → painel de hoje · placa do salão → CRM (leads)
function abreLugar(k) {
  const l = LUGAR_TELA[k]; if (!l) return;
  if (E && E.camera && l.cam && !E.andando) {      // voo curto até o lugar, como no clique num agente
    const [x, z] = l.cam;
    E.voo = { t0: performance.now(), dur: reduz() ? 1 : 900, p0: E.camera.position.clone(), a0: E.controls.target.clone(),
      p1: new THREE.Vector3(x * 0.55, 3.2, z + 7.5), a1: new THREE.Vector3(x, 1.9, z) };
    acordou();
  }
  painelLugar(l, t);
}
window.jg3dAbreLugar = abreLugar;   // o modo "andar" (escritorio-andar.js) usa o mesmo painel
ACT['j3-lugar'] = (el) => abreLugar(el.dataset.lugar);

// ====================================================================== quadro a quadro
const _v = new THREE.Vector3(); const _c = new THREE.Vector3();
function quadro(agoraMs) {
  if (!vivo()) return para();
  const dt = Math.min(0.05, (agoraMs - (E.ultimo || agoraMs)) / 1000); E.ultimo = agoraMs; E.tempo += dt;
  interpolaClima(dt);
  // andando dentro do escritório: o módulo cuida do personagem e da câmera
  if (E.andando && E.andar) {
    E.andar.quadro(dt);
    for (const ag of Object.values(E.agentes)) animaAgente(ag, dt);
    if (E.visitante && E.visitante.b) animaAgente(E.visitante, dt);
    if (E.querHover) { E.querHover = false; E.tela.style.cursor = 'grab'; }
    E.renderer.toneMappingExposure = E.exposicao;
    E.composer.render(dt);
    medeDesempenho(agoraMs);
    projeta();
    return;
  }
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
  if (E.visitante && E.visitante.b) animaAgente(E.visitante, dt);
  // bonecos estilizados (só se o humano 3D não carregou): rosto sempre um pouco à frente da cabeça, do lado da câmera
  for (const ag of Object.values(E.agentes).concat(E.visitante && E.visitante.b ? [E.visitante] : [])) {
    const b = ag.b; if (b.glb || !b.rosto) continue;
    b.cabeca.getWorldPosition(_v); _c.copy(E.camera.position).sub(_v).normalize().multiplyScalar(0.13);
    b.rosto.position.copy(b.cabeca.position).add(b.corpo.worldToLocal(_c.add(_v)).sub(b.cabeca.position).multiplyScalar(1));
  }
  // hover
  if (E.querHover) { E.querHover = false; const h = acerta(); E.tela.style.cursor = h ? 'pointer' : ''; }
  E.renderer.toneMappingExposure = E.exposicao;
  E.composer.render(dt);
  medeDesempenho(agoraMs);
  projeta();
}
function animaAgente(ag, dt) {
  const b = ag.b; const g = b.g;
  // andar até o alvo
  if (ag.alvo) {
    const dx = ag.alvo[0] - ag.x, dz = ag.alvo[1] - ag.z; const d = Math.hypot(dx, dz); const vel = ag.b.glb ? 1.2 : 1.35;
    if (d < 0.03 || reduz()) { ag.x = ag.alvo[0]; ag.z = ag.alvo[1]; const r = ag.alvo; ag.alvo = null; if (ag.resolve) { const f = ag.resolve; ag.resolve = null; f(r); } }
    else { const p = Math.min(d, vel * dt); ag.x += (dx / d) * p; ag.z += (dz / d) * p; ag.rotAlvo = Math.atan2(dx, dz); ag.passo = (ag.passo || 0) + dt * 7.5; }
  }
  g.position.x = ag.x; g.position.z = ag.z;
  // vira suave
  let dr = ag.rotAlvo - ag.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); ag.rot += dr * Math.min(1, dt * 9); g.rotation.y = ag.rot;
  if (b.glb) return animaPessoa(ag, b, dt);
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
// Humano 3D: escolhe a animação pelo estado (andando, parado fazendo algo, sentado digitando/pensando/dormindo) e avança o misturador.
function animaPessoa(ag, b, dt) {
  let alvo, vel = 1;
  if (ag.andando && !b.sentado) alvo = 'anda';
  else if (!b.sentado) {
    if (ag.faz > 0) { ag.faz -= dt; alvo = ag.fazAnim || 'papel'; } else alvo = ag.parado || 'idle';
  } else if (ag.dorme) { alvo = 'respira'; vel = 0.6; }
  else if (ag.digita > 0) { ag.digita -= dt; alvo = 'digitaSentado'; }
  else if (ag.estica > 0) { ag.estica -= dt; alvo = 'pensa'; }
  else alvo = 'sentado';
  b.toca(alvo, alvo === 'anda' ? 0.25 : 0.4, alvo === 'anda' ? 1.1 : vel);
  b.mixer.update(dt);
  // sentado, o corpo desce para os pés tocarem o chão (as animações sentadas assumem uma cadeira alta)
  b.corpo.position.y = lerp(b.corpo.position.y, b.sentado ? PESSOA_Y : 0, Math.min(1, dt * 5));
  // mãos no teclado (suave para entrar e sair)
  const quer = alvo === 'digitaSentado' ? 1 : 0; b.teclando = lerp(b.teclando, quer, Math.min(1, dt * 6));
  maosNoTeclado(b, b.teclando, E.tempo + b.fase);
  // inativo: cabeça pende um pouco
  if (ag.dorme && b.pescoco) b.pescoco.quaternion.multiply(_q.setFromAxisAngle(_ax2, 0.28 + Math.sin(E.tempo * 0.8 + b.fase) * 0.03));
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
  for (const ag of Object.values(E.agentes).concat(E.visitante && E.visitante.b ? [E.visitante] : [])) {
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
// O shell entrega apenas mensagens das conversas do usuário autenticado.
window.jg3dChatBalao = (slug, texto) => { if (vivo()) balao(E.agentes[slug], '💬', String(texto || '').slice(0, 160)); };
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
    ag.fazAnim = GESTO_DO_LUGAR[it.vai] || 'papel';
    ag.faz = 3.2; await espera(3400); ag.faz = 0;
    await volta(ag);
  } finally { ag.ocupado = false; }
}
// gesto do humano 3D em cada lugar: ler o papel no mural/impressora, falar na porta/recepção, café, celular
const GESTO_DO_LUGAR = { mural: 'papel', impressora: 'papel', porta: 'fala', recepcao: 'fala', tv: 'olhar', cafe: 'bebe', reuniao: 'fala', sofa: 'celular', plantao: 'fala' };
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
  E.visitante = true; // reserva a vaga enquanto carrega
  let b;
  try { b = await fazPessoa('visitante', '#8a8f98'); } catch { if (!vivo()) { E && (E.visitante = null); return; } b = fazBoneco('#8a8f98', texturaRostoEmoji('👤'), 'visitante'); }
  if (!vivo()) { E && (E.visitante = null); return; }
  b.g.userData.visitante = true;
  const ovl = $('#j3-ovl'); const baloes = document.createElement('div'); baloes.className = 'j3-baloes'; baloes.style.setProperty('--c', '#8a8f98'); ovl.appendChild(baloes);
  const p = { slug: 'visitante', b, x: 0, z: SALA.Z + 1.6, rot: Math.PI, rotAlvo: Math.PI, andando: true, elBaloes: baloes, elNome: null, mesa: [0, 0], faz: 0 };
  b.g.position.set(p.x, 0, p.z); levantaBoneco(b); E.cena.add(b.g); E.visitante = p;
  try {
    await passo(p, LUGAR.porta[0], LUGAR.porta[1] - 0.3); await passo(p, LUGAR.recepcao[0], LUGAR.recepcao[1]);
    p.andando = false; p.rotAlvo = -Math.PI / 2;
    p.fazAnim = 'acena'; p.faz = 1.8; balao(p, it.emoji, it.texto); await espera(1900); p.fazAnim = 'fala'; p.faz = 2.0; await espera(1900);
    p.andando = true; await passo(p, LUGAR.sofa[0] + 1.2, SALA.CORREDOR); await passo(p, 6.2, SALA.CORREDOR);
    p.andando = false;
    const vis = b.mats.filter((m) => !m.alphaTest); vis.forEach((m) => { m.transparent = true; m.needsUpdate = true; });
    for (let i = 0; i < 10; i++) { await espera(60); vis.forEach((m) => { m.opacity = 1 - i / 10; }); if (b.rosto) b.rosto.material.opacity = 1 - i / 10; }
  } finally {
    E && E.cena.remove(b.g); baloes.remove(); if (b.rosto) b.rosto.material.map.dispose(); if (E) E.visitante = null;
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
    (async () => { try { await anda(ag, [LUGAR.cafe[0] + (Math.random() * 0.8 - 0.4), LUGAR.cafe[1]]); ag.rotAlvo = 0; balao(ag, '☕', '', 'leve'); ag.fazAnim = 'bebe'; ag.faz = 3.6; await espera(3800); ag.faz = 0; await volta(ag); } finally { ag.ocupado = false; } })();
  } else if (r < 0.6) digita(ag);
  else if (r < 0.75) ag.estica = 1.6;
  else if (r < 0.85) balao(ag, ['📱', '💭', '📋', '🙂'][Math.floor(Math.random() * 4)], '', 'leve');
}
