// ---------- materiais e geometria compartilhados ----------
// Texturas fotográficas (geradas pelo Flux na RTX 4090, deixadas repetíveis e com mapa de relevo em escala de cinza):
// public/plataforma/cenario/<nome>.jpg (cor) e <nome>-n.jpg (relevo). O carregamento é assíncrono: a cena abre com as cores base.
const CENARIO_URL = '/plataforma/cenario/';
let TEXLOADER = null;
function tex(nome, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  TEXLOADER = TEXLOADER || new THREE.TextureLoader();
  const tx = TEXLOADER.load(CENARIO_URL + nome + '.jpg');
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat[0], repeat[1]);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = Math.min(aniso, E.renderer.capabilities.getMaxAnisotropy());
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
  const laje = new THREE.Mesh(uvMundo(new THREE.BoxGeometry(X * 2 + 0.6, 0.6, Z * 2 + 0.6), X * 2 + 0.6, 0.6, Z * 2 + 0.6), M.pedraEscura); laje.position.y = -0.3; cena.add(laje);
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
  const ceu = new Sky(); ceu.scale.setScalar(480); cena.add(ceu); E.ceu = ceu.material;
  Object.assign(E.ceu.uniforms.turbidity, { value: 6 }); E.ceu.uniforms.rayleigh.value = 1.6; E.ceu.uniforms.mieCoefficient.value = 0.006; E.ceu.uniforms.mieDirectionalG.value = 0.8;
  // estrelas
  const n = 700; const pos = new Float32Array(n * 3); let s = 5; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3; pos[i * 3] = Math.cos(a) * Math.cos(e) * 380; pos[i * 3 + 1] = Math.sin(e) * 380; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380; }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const estrelas = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })); cena.add(estrelas); E.estrelas = estrelas;
  // panoramas fotográficos (gerados pelo Flux) num cilindro atrás da fachada, com a borda de cima esfumada no céu
  const R = 300, ARCO = 2.75, ALT = R * ARCO / (2048 / 768);
  const geo = new THREE.CylinderGeometry(R, R, ALT, 96, 1, true, Math.PI - ARCO / 2, ARCO);
  const alfa = document.createElement('canvas'); alfa.width = 4; alfa.height = 256; const ax = alfa.getContext('2d');
  const grad = ax.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, '#000'); grad.addColorStop(0.2, '#fff'); grad.addColorStop(0.93, '#fff'); grad.addColorStop(1, '#000'); ax.fillStyle = grad; ax.fillRect(0, 0, 4, 256);
  const alfaTx = new THREE.CanvasTexture(alfa);
  E.panoramas = {};
  for (const nome of ['dia', 'tarde', 'noite']) {
    const mapa = tex('cidade-' + nome, { repeat: [-1, 1] }); mapa.offset.x = 1;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mapa, alphaMap: alfaTx, transparent: true, opacity: nome === 'dia' ? 1 : 0, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: true }));
    m.position.y = -8; m.renderOrder = -1; cena.add(m); E.panoramas[nome] = m;
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
  for (let i = 0; i < 90; i++) {
    const lado = rnd(); let px, pz;
    if (lado < 0.7) { px = -170 + rnd() * 340; pz = -55 - rnd() * 150; } else { px = (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 100); pz = -70 + rnd() * 100; }
    if (Math.abs(px) < 34 && pz > -55) continue;
    const longe = Math.hypot(px, pz);
    const w = 8 + rnd() * 13, d = 8 + rnd() * 13, h = 14 + rnd() * 30 + (longe > 130 && rnd() < 0.35 ? 25 + rnd() * 40 : 0); const base = -62 - rnd() * 16;
    const g = new THREE.BoxGeometry(w, h, d); g.translate(px, base + h / 2, pz);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 7), uv.getY(k) * (h / 14));
    geos.push(g);
  }
  const predios = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: diaTx, color: 0xffffff, emissive: 0xffffff, emissiveMap: janTx, emissiveIntensity: 0, roughness: 0.6, metalness: 0.15 }));
  cena.add(predios); E.predios = predios;
  // o chão da cidade, bem lá embaixo
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3b414b, roughness: 1 })); chao.rotation.x = -Math.PI / 2; chao.position.y = -48; cena.add(chao); E.chaoCidade = chao;
}
// Alvo da iluminação pela hora: dia, fim de tarde, noite (interpola suave no quadro).
function climaAlvo(h, agora) {
  if (!E || !E.clima) return;
  const C = (hex) => new THREE.Color(hex);
  let a;
  if (h >= 6.5 && h < 16.5) a = { solI: 2.2, hemiI: 0.7, exp: 0.95, pratI: 0, cidade: 0, estrelas: 0, sol: C(0xfff3e0), hemiCeu: C(0xcfe0f5), hemiChao: C(0xa68a66), solPos: new THREE.Vector3(-9, 16, -13), fog: C(0xd9e8f4), ceuSol: new THREE.Vector3(-0.35, 0.62, -0.7), turb: 5, ray: 1.4 };
  else if ((h >= 16.5 && h < 19) || (h >= 5.5 && h < 6.5)) a = { solI: 2.4, hemiI: 0.55, exp: 1.05, pratI: 14, cidade: 0.3, estrelas: 0, sol: C(0xffb36e), hemiCeu: C(0xf5c9a0), hemiChao: C(0x8a6a4e), solPos: new THREE.Vector3(16, 4.5, -13), fog: C(0xf1c2a0), ceuSol: new THREE.Vector3(0.75, 0.08, -0.65), turb: 9, ray: 3.2 };
  else a = { solI: 0.25, hemiI: 0.4, exp: 1.0, pratI: 48, cidade: 0.75, estrelas: 0.9, sol: C(0x8ea4ff), hemiCeu: C(0x303c5e), hemiChao: C(0x2a1c12), solPos: new THREE.Vector3(-6, 14, -10), fog: C(0x141a2c), ceuSol: new THREE.Vector3(-0.3, -0.12, -0.9), turb: 2, ray: 0.2 };
  E.alvo = a; E.modoCeu = a.estrelas > 0.5 ? 'noite' : a.cidade > 0 ? 'tarde' : 'dia';
  if (agora) { for (const k of Object.keys(a)) { if (a[k] && a[k].isColor) E.clima[k].copy(a[k]); else if (a[k] && a[k].isVector3) E.clima[k].copy(a[k]); else E.clima[k] = a[k]; } aplicaClima(); }
}
const suaveDegrau = (a, b, x) => { const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
function aplicaClima() {
  const c = E.clima;
  E.sol.intensity = c.solI; E.sol.color.copy(c.sol); E.sol.position.copy(c.solPos);
  E.hemi.intensity = c.hemiI; E.hemi.color.copy(c.hemiCeu); E.hemi.groundColor.copy(c.hemiChao);
  if (E.composer) { E.exposicao = c.exp; } else E.renderer.toneMappingExposure = c.exp;
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

