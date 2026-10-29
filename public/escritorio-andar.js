/* Herrera HOUSE IA — Andar dentro do escritório 3D (#/whats/ao-vivo > botão "Entrar no escritório").
   O usuário vira um personagem em terceira pessoa e caminha pelo escritório como num jogo: WASD ou setas
   para andar, Shift para correr, mouse (ou arrastar) para olhar, E para interagir com quem/com o que
   estiver perto. No celular, alavanca na esquerda e arrastar na direita.
   Mora num arquivo próprio para não disputar o escritorio-3d.js com outras mudanças; recebe tudo o que
   precisa em ligaAndar(ctx) e devolve { entra, sai, ativo, quadro, desmonta }. */

const RAIO = 0.30;            // "corpo" do jogador, em metros
const VEL = 2.6;              // andando (m/s)
const VEL_CORRIDA = 4.4;
const ALCANCE = 2.0;          // distância para poder interagir
const CAM_DIST = 3.3, CAM_ALT = 1.75, OLHO = 1.45;

export function ligaAndar(ctx) {
  const { THREE, E, fazPessoa, SALA, MESAS, LUGAR, SENTA, reduz, $, esc } = ctx;
  const T = ctx.textos || {};
  const tx = (k, padrao) => T[k] || padrao;

  // ---------- obstáculos: caixas (x,z,largura,fundo) e círculos (x,z,raio) no plano do chão ----------
  const caixas = [], circulos = [];
  const caixa = (x, z, w, d) => caixas.push({ x, z, w: w / 2 + RAIO, d: d / 2 + RAIO });
  const circulo = (x, z, r) => circulos.push({ x, z, r: r + RAIO });
  // mesas, painel de privacidade e cadeira de cada agente
  for (const [x, z] of Object.values(MESAS)) {
    caixa(x, z - 0.1, 1.62, 1.02);
    circulo(x, z + SENTA + 0.08, 0.34);
  }
  // divisórias de vidro (do fundo até o corredor) e os pilares da fachada
  for (const vx of SALA.VIDRO) { const comp = SALA.Z + SALA.CORREDOR - 0.7; caixa(vx, -SALA.Z + comp / 2, 0.14, comp); }
  // móveis
  caixa(-4.6, SALA.Z - 0.42, 1.86, 0.66);     // balcão do café
  caixa(-2.2, SALA.Z - 1.6, 1.8, 0.6);        // recepção
  caixa(3.2, SALA.Z - 0.75, 1.95, 0.9);       // sofá
  caixa(3.2, SALA.Z - 1.9, 0.92, 0.52);       // mesinha
  caixa(-11.3, 2.4, 0.72, 0.62);              // impressora
  circulo(8.7, 5.2, 1.0);                     // mesa de reunião
  for (const [x, z] of [[-11.2, 6.1], [-6.4, -6.2], [4.3, -6.2], [11.2, 6.1], [-11.2, -1.0], [6.2, 0.6]]) circulo(x, z, 0.26);
  for (const [x, z] of [[-11.0, -4.4], [-1.6, 4.6], [11.0, -4.4], [5.9, 6.2]]) circulo(x, z, 0.2);

  /** Empurra a posição para fora de tudo o que ela invadiu (desliza pela parede em vez de travar). */
  function resolve(p) {
    for (let v = 0; v < 3; v++) {
      let bateu = false;
      for (const c of caixas) {
        const dx = p.x - c.x, dz = p.z - c.z;
        if (Math.abs(dx) < c.w && Math.abs(dz) < c.d) {
          bateu = true;
          const px = c.w - Math.abs(dx), pz = c.d - Math.abs(dz);
          if (px < pz) p.x = c.x + Math.sign(dx || 1) * c.w; else p.z = c.z + Math.sign(dz || 1) * c.d;
        }
      }
      for (const c of circulos) {
        const dx = p.x - c.x, dz = p.z - c.z; const d = Math.hypot(dx, dz);
        if (d < c.r) { bateu = true; const k = d || 0.001; p.x = c.x + (dx / k) * c.r; p.z = c.z + (dz / k) * c.r; }
      }
      if (!bateu) break;
    }
    // paredes da sala; a porta da frente (|x| < 0.85) deixa sair um pouquinho
    const lim = SALA.X - RAIO - 0.12;
    p.x = Math.min(lim, Math.max(-lim, p.x));
    p.z = Math.max(-SALA.Z + RAIO + 0.2, p.z);
    const frente = SALA.Z - RAIO - 0.12;
    if (p.z > frente && Math.abs(p.x) > 0.85) p.z = frente;
    p.z = Math.min(SALA.Z + 1.2, p.z);
    return p;
  }

  // ---------- coisas com que dá para interagir ----------
  function alvos() {
    const l = [];
    for (const [slug, [x, z]] of Object.entries(MESAS)) {
      const ag = E.agentes[slug];
      l.push({ tipo: 'agente', slug, x, z: z + SENTA + 0.08, nome: ag ? ag.nome : slug, acao: tx('falarCom', 'Falar com') });
    }
    l.push({ tipo: 'lugar', lugar: 'mural', x: LUGAR.mural[0], z: LUGAR.mural[1] + 0.9, nome: tx('mural', 'Mural de oportunidades'), acao: tx('abrir', 'Abrir') });
    l.push({ tipo: 'lugar', lugar: 'tv', x: LUGAR.tv[0], z: LUGAR.tv[1] + 0.9, nome: tx('tv', 'Painel da diretoria'), acao: tx('abrir', 'Abrir') });
    l.push({ tipo: 'lugar', lugar: 'placa', x: 0, z: -SALA.Z + 1.0, nome: tx('crm', 'CRM e funil'), acao: tx('abrir', 'Abrir') });
    l.push({ tipo: 'lugar', lugar: 'recepcao', x: LUGAR.recepcao[0], z: LUGAR.recepcao[1] - 0.9, nome: tx('recepcao', 'Recepção'), acao: tx('abrir', 'Abrir') });
    l.push({ tipo: 'lugar', lugar: 'impressora', x: LUGAR.impressora[0] + 0.9, z: LUGAR.impressora[1], nome: tx('impressora', 'Impressora'), acao: tx('abrir', 'Abrir') });
    l.push({ tipo: 'lugar', lugar: 'cafe', x: LUGAR.cafe[0], z: LUGAR.cafe[1] - 1.0, nome: tx('cafe', 'Café'), acao: tx('abrir', 'Abrir') });
    l.push({ tipo: 'lugar', lugar: 'reuniao', x: LUGAR.reuniao[0], z: LUGAR.reuniao[1] - 1.6, nome: tx('reuniao', 'Sala de reunião'), acao: tx('abrir', 'Abrir') });
    return l;
  }
  const LISTA = alvos();

  // ---------- estado ----------
  const S = {
    ativo: false, b: null, pos: new THREE.Vector3(0, 0, SALA.Z - 1.4), rot: Math.PI,
    giro: Math.PI, inclina: 0.12, teclas: new Set(), perto: null, correndo: false,
    el: null, prompt: null, alavanca: null, toque: { mover: null, olhar: null },
    camPos: new THREE.Vector3(), escutas: [], carregando: false,
  };

  // ---------- interface por cima da cena ----------
  function montaHtml() {
    const raiz = E.raiz;
    const el = document.createElement('div'); el.className = 'j3-andar';
    el.innerHTML = `<div class="j3a-ajuda"><b>${esc(tx('ajuda', 'WASD ou setas para andar · Shift corre · mouse olha · E interage · Esc sai'))}</b></div>
      <div class="j3a-prompt" hidden></div>
      <button class="j3a-sair" type="button">${esc(tx('sair', 'Sair do escritório'))} ✕</button>
      <div class="j3a-alavanca" hidden><i></i></div>`;
    raiz.appendChild(el); S.el = el;
    S.prompt = el.querySelector('.j3a-prompt');
    S.alavanca = el.querySelector('.j3a-alavanca');
    el.querySelector('.j3a-sair').addEventListener('click', () => sai());
    if (matchMedia('(pointer: coarse)').matches) S.alavanca.hidden = false;
  }

  function escuta(alvo, tipo, fn, op) { alvo.addEventListener(tipo, fn, op); S.escutas.push([alvo, tipo, fn]); }

  function ligaControles() {
    const tela = E.tela;
    escuta(window, 'keydown', (ev) => {
      if (!S.ativo) return;
      if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName || '')) return;
      const k = ev.key.toLowerCase();
      if (k === 'escape') { ev.preventDefault(); return sai(); }
      if (k === 'e') { ev.preventDefault(); return interage(); }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { ev.preventDefault(); S.teclas.add(k); }
    });
    escuta(window, 'keyup', (ev) => S.teclas.delete(ev.key.toLowerCase()));
    escuta(window, 'blur', () => S.teclas.clear());
    // olhar: arrastar com o mouse (sem prender o cursor, para não assustar quem está só olhando)
    let arrastando = false, ux = 0, uy = 0;
    escuta(tela, 'pointerdown', (ev) => { if (!S.ativo || ev.pointerType === 'touch') return; arrastando = true; ux = ev.clientX; uy = ev.clientY; tela.style.cursor = 'grabbing'; });
    escuta(window, 'pointerup', () => { arrastando = false; if (S.ativo) tela.style.cursor = 'grab'; });
    escuta(window, 'pointermove', (ev) => {
      if (!S.ativo || !arrastando) return;
      S.giro -= (ev.clientX - ux) * 0.005; S.inclina = Math.max(-0.35, Math.min(0.9, S.inclina + (ev.clientY - uy) * 0.004));
      ux = ev.clientX; uy = ev.clientY;
    });
    // celular: alavanca à esquerda, olhar à direita
    escuta(tela, 'touchstart', (ev) => {
      if (!S.ativo) return;
      for (const t of ev.changedTouches) {
        if (t.clientX < innerWidth / 2 && !S.toque.mover) S.toque.mover = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
        else if (!S.toque.olhar) S.toque.olhar = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    escuta(tela, 'touchmove', (ev) => {
      if (!S.ativo) return;
      for (const t of ev.changedTouches) {
        if (S.toque.mover && t.identifier === S.toque.mover.id) {
          S.toque.mover.dx = Math.max(-1, Math.min(1, (t.clientX - S.toque.mover.x0) / 60));
          S.toque.mover.dy = Math.max(-1, Math.min(1, (t.clientY - S.toque.mover.y0) / 60));
        } else if (S.toque.olhar && t.identifier === S.toque.olhar.id) {
          S.giro -= (t.clientX - S.toque.olhar.x) * 0.006;
          S.inclina = Math.max(-0.35, Math.min(0.9, S.inclina + (t.clientY - S.toque.olhar.y) * 0.004));
          S.toque.olhar.x = t.clientX; S.toque.olhar.y = t.clientY;
        }
      }
    }, { passive: true });
    const solta = (ev) => {
      for (const t of ev.changedTouches) {
        if (S.toque.mover && t.identifier === S.toque.mover.id) S.toque.mover = null;
        if (S.toque.olhar && t.identifier === S.toque.olhar.id) S.toque.olhar = null;
      }
    };
    escuta(tela, 'touchend', solta, { passive: true });
    escuta(tela, 'touchcancel', solta, { passive: true });
    // tocar no aviso de interação também interage (celular)
    escuta(S.prompt, 'click', () => interage());
  }

  // ---------- entrar e sair ----------
  async function entra() {
    if (S.ativo || S.carregando) return;
    S.carregando = true;
    try {
      if (!S.b) {
        S.b = await fazPessoa('visitante', '#8a8f98');
        S.b.g.userData = { tipo: 'jogador' };
        E.cena.add(S.b.g);
      }
      S.pos.set(0, 0, SALA.Z - 1.6); S.giro = Math.PI; S.rot = Math.PI; S.inclina = 0.12;
      S.b.g.visible = true; S.b.g.position.set(S.pos.x, 0, S.pos.z); S.b.g.rotation.y = S.rot;
      S.b.toca('idle', 0.2);
      if (!S.el) montaHtml(); else S.el.hidden = false;
      S.ativo = true;
      E.andando = true; E.apres = false; E.voo = null; E.idleDesde = 1e12;
      if (E.controls) E.controls.enabled = false;
      E.tela.style.cursor = 'grab';
      E.raiz.classList.add('j3-com-andar');
      if (!S.escutas.length) ligaControles();
      atualizaBotao();
    } catch (e) {
      console.warn('não deu para entrar no escritório:', e);
      if (window.toast) window.toast('Não deu para entrar no escritório agora.', true);
    } finally { S.carregando = false; }
  }

  function sai() {
    if (!S.ativo) return;
    S.ativo = false; E.andando = false; S.teclas.clear();
    if (S.b) S.b.g.visible = false;
    if (S.el) S.el.hidden = true;
    if (E.controls) { E.controls.enabled = true; E.controls.target.set(0, 0.8, -0.5); }
    E.tela.style.cursor = '';
    E.raiz.classList.remove('j3-com-andar');
    E.idleDesde = performance.now();
    atualizaBotao();
  }

  function atualizaBotao() {
    const b = $('#j3-hud .j3-andar-bt'); if (!b) return;
    b.classList.toggle('on', S.ativo);
    b.title = S.ativo ? tx('sair', 'Sair do escritório') : tx('entrar', 'Entrar no escritório');
  }

  // ---------- interação ----------
  function interage() {
    const a = S.perto; if (!a) return;
    if (a.tipo === 'agente') {
      if (typeof window.jg3dFalarCom === 'function') return window.jg3dFalarCom(a.slug);
      if (typeof window.abrePcDoAgente === 'function') return window.abrePcDoAgente(a.slug);
      location.hash = '#/chat';
      return;
    }
    if (typeof window.jg3dAbreLugar === 'function') return window.jg3dAbreLugar(a.lugar);
    const rotas = { mural: '#/radar', tv: '#/painel', placa: '#/leads', recepcao: '#/visitas', impressora: '#/imoveis', cafe: '#/whats', reuniao: '#/chat' };
    location.hash = rotas[a.lugar] || '#/painel';
  }

  // ---------- quadro a quadro (chamado pelo escritorio-3d.js) ----------
  const _d = new THREE.Vector3(), _alvoCam = new THREE.Vector3();
  function quadro(dt) {
    if (!S.ativo || !S.b) return;
    // direção pedida pelo teclado/alavanca, relativa a para onde a câmera olha
    let fr = 0, lat = 0;
    const k = S.teclas;
    if (k.has('w') || k.has('arrowup')) fr += 1;
    if (k.has('s') || k.has('arrowdown')) fr -= 1;
    // com a câmera atrás, a esquerda do personagem é o +x do mundo girado: A anda para a esquerda da tela
    if (k.has('a') || k.has('arrowleft')) lat += 1;
    if (k.has('d') || k.has('arrowright')) lat -= 1;
    if (S.toque.mover) { fr -= S.toque.mover.dy; lat -= S.toque.mover.dx; }
    S.correndo = k.has('shift');
    const forca = Math.min(1, Math.hypot(fr, lat));
    if (forca > 0.05) {
      const ang = S.giro + Math.atan2(lat, fr);
      const v = (S.correndo ? VEL_CORRIDA : VEL) * forca * (reduz() ? 0.6 : 1);
      _d.set(Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(v * dt);
      S.pos.x += _d.x; S.pos.z += _d.z;
      resolve(S.pos);
      S.rot = ang;
      S.b.toca('anda', 0.18, S.correndo ? 1.5 : 1.05);
    } else {
      S.b.toca('idle', 0.25, 1);
    }
    // o corpo gira suave até a direção do passo
    let dr = S.rot - S.b.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    S.b.g.rotation.y += dr * Math.min(1, dt * 12);
    S.b.g.position.set(S.pos.x, 0, S.pos.z);
    S.b.corpo.position.y = 0;
    S.b.mixer.update(dt);

    // câmera atrás do personagem, sem atravessar a parede do fundo
    const dist = CAM_DIST * (1 - S.inclina * 0.25);
    _alvoCam.set(S.pos.x - Math.sin(S.giro) * dist, CAM_ALT + S.inclina * 2.2, S.pos.z - Math.cos(S.giro) * dist);
    _alvoCam.x = Math.max(-SALA.X + 0.3, Math.min(SALA.X - 0.3, _alvoCam.x));
    _alvoCam.z = Math.max(-SALA.Z + 0.3, Math.min(SALA.Z + 2.2, _alvoCam.z));
    _alvoCam.y = Math.max(0.75, _alvoCam.y);
    E.camera.position.lerp(_alvoCam, Math.min(1, dt * 9));
    E.camera.lookAt(S.pos.x, OLHO + S.inclina * 0.3, S.pos.z);

    // o que está perto o bastante para interagir
    let melhor = null, menor = ALCANCE;
    for (const a of LISTA) {
      const d = Math.hypot(a.x - S.pos.x, a.z - S.pos.z);
      if (d < menor) { menor = d; melhor = a; }
    }
    if (melhor !== S.perto) {
      S.perto = melhor;
      if (melhor) { S.prompt.innerHTML = `<b>E</b> ${esc(melhor.acao)} <span>${esc(melhor.nome)}</span>`; S.prompt.hidden = false; }
      else S.prompt.hidden = true;
    }
  }

  function desmonta() {
    sai();
    for (const [alvo, tipo, fn] of S.escutas) alvo.removeEventListener(tipo, fn);
    S.escutas.length = 0;
    if (S.el) S.el.remove();
    if (S.b && S.b.g.parent) S.b.g.parent.remove(S.b.g);
    S.b = null; S.el = null;
  }

  return { entra, sai, quadro, desmonta, alterna: () => (S.ativo ? sai() : entra()), get ativo() { return S.ativo; } };
}
