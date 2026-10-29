// Herrera HOUSE IA · condomínio em 3D: o prédio, o andar do apartamento e o entorno (prédios, ruas, verde, satélite e o que tem perto).
import * as THREE from '/vendor/three/three.module.min.js';
import { OrbitControls } from '/vendor/three/OrbitControls.js';
import { mergeGeometries } from '/vendor/three/BufferGeometryUtils.js';
// Junta geometrias mesmo quando umas têm índice e outras não (ou atributos diferentes): sem isso o 3D travava em "Carregando".
function unir(lista) {
  const ok = lista.filter(Boolean);
  if (!ok.length) return null;
  const comIndice = ok.some((g) => g.index), todasComIndice = ok.every((g) => g.index);
  let gs = comIndice && !todasComIndice ? ok.map((g) => (g.index ? g.toNonIndexed() : g)) : ok;
  const nomes = Object.keys(gs[0].attributes).filter((n) => gs.every((g) => g.attributes[n]));
  gs = gs.map((g) => { for (const n of Object.keys(g.attributes)) if (!nomes.includes(n)) g.deleteAttribute(n); g.morphAttributes = {}; return g; });
  return mergeGeometries(gs) || null;
}

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Marca (/marca.js): o 3D também abre pelo portal público, então o topo mostra a imobiliária (cliente).
const MARCA = Object.assign({ sistema: 'Herrera HOUSE IA', cliente: 'RUAH' }, window.MARCA || {});
if ($('#marca-cliente')) $('#marca-cliente').textContent = MARCA.cliente;
const qs = new URLSearchParams(location.search);
const ID = qs.get('id'), IMOVEL = qs.get('imovel'), SLUG = qs.get('slug'), FG = qs.get('fg');
const PUBLICO = !!SLUG;
const URL_DADOS = FG ? `/api/mercado/3d/${encodeURIComponent(FG)}` : PUBLICO ? `/api/publico/condominios/${encodeURIComponent(SLUG)}/3d` : `/api/condominios/${encodeURIComponent(ID)}/3d${IMOVEL ? `?imovel=${encodeURIComponent(IMOVEL)}` : ''}`;
const URL_PERTO = FG ? `/api/mercado/perto/${encodeURIComponent(FG)}` : PUBLICO ? `/api/publico/condominios/${encodeURIComponent(SLUG)}/perto` : `/api/condominios/${encodeURIComponent(ID)}/perto`;
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const celular = matchMedia('(max-width: 720px)').matches;

let D, cena, alvo, ANDAR_H = 3;

// ------------------------------------------------------------------ dados
async function carregar() {
  const r = await fetch(URL_DADOS, { credentials: 'same-origin' });
  let j = null; try { j = await r.json(); } catch {}
  if (r.status === 401) throw new Error(`Entre no ${MARCA.sistema} nesta mesma janela do navegador e abra o 3D de novo.`);
  if (!r.ok) throw new Error((j && j.erro) || `Erro ${r.status}`);
  return j;
}

// ------------------------------------------------------------------ cena
const palco = $('#palco');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, celular ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !celular;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
palco.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 6000);
camera.position.set(600, 500, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 8;
controls.autoRotateSpeed = 0.6;

const hemi = new THREE.HemisphereLight(0xdfeaff, 0x5b5346, 1.1);
scene.add(hemi);
const sol = new THREE.DirectionalLight(0xffffff, 2.4);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.6;
scene.add(sol, sol.target);

// céu em degradê
const ceuGeo = new THREE.SphereGeometry(4000, 32, 16);
const ceuMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { cTopo: { value: new THREE.Color(0x4f86c6) }, cMeio: { value: new THREE.Color(0xbcd6ee) }, cBaixo: { value: new THREE.Color(0xe9eef2) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 cTopo; uniform vec3 cMeio; uniform vec3 cBaixo; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(cMeio, cTopo, pow(h, 0.55)) : mix(cMeio, cBaixo, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }',
});
const ceu = new THREE.Mesh(ceuGeo, ceuMat);
scene.add(ceu);
scene.fog = new THREE.Fog(0xbcd6ee, 700, 2600);

// ------------------------------------------------------------------ texturas de janelas
function texturaJanelas({ parede = '#e9e4da', vidro = '#5d6f80', moldura = '#d3ccbf', acesas = false, ouro = false }) {
  const N = 8, T = 64, cv = document.createElement('canvas');
  cv.width = cv.height = N * T;
  const g = cv.getContext('2d');
  g.fillStyle = acesas ? '#000' : parede; g.fillRect(0, 0, cv.width, cv.height);
  let semente = ouro ? 7 : 3; const rnd = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * T, y = j * T;
    if (acesas) {
      if (rnd() < (ouro ? 0.75 : 0.42)) { const q = 0.6 + rnd() * 0.4; g.fillStyle = `rgba(255,${Math.round(200 + 30 * q)},${Math.round(130 + 50 * q)},${q})`; g.fillRect(x + 10, y + 16, T - 20, T - 26); }
    } else {
      g.fillStyle = moldura; g.fillRect(x + 7, y + 13, T - 14, T - 20);
      const gr = g.createLinearGradient(x, y + 16, x + T, y + T - 10);
      gr.addColorStop(0, vidro); gr.addColorStop(1, ouro ? '#8a7650' : '#2f3c48');
      g.fillStyle = gr; g.fillRect(x + 10, y + 16, T - 20, T - 26);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 10, y + 16, (T - 20) / 2.4, T - 26);
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, y + T - 4, T, 4);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / (N * 3), 1 / (N * 3)); // cada janela = 3 m x 3 m (um andar)
  t.offset.set(0, -1 / (N * 3));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

const MAT = {
  paredeAlta: new THREE.MeshStandardMaterial({ map: texturaJanelas({}), emissiveMap: texturaJanelas({ acesas: true }), emissive: 0x000000, roughness: 0.75, metalness: 0.08 }),
  paredeBaixa: new THREE.MeshStandardMaterial({ color: 0xebe5da, roughness: 0.95 }),
  teto: new THREE.MeshStandardMaterial({ color: 0xc9c1b3, roughness: 0.9 }),
  telhado: new THREE.MeshStandardMaterial({ color: 0xb4785c, roughness: 0.85 }),
  paredeAlvo: new THREE.MeshStandardMaterial({ map: texturaJanelas({ parede: '#f3e4c4', moldura: '#e0c78f', vidro: '#6e7f8e', ouro: true }), emissiveMap: texturaJanelas({ acesas: true, ouro: true }), color: 0xffffff, emissive: 0x1a1206, roughness: 0.55, metalness: 0.15 }),
  tetoAlvo: new THREE.MeshStandardMaterial({ color: 0xd2ab62, roughness: 0.5, metalness: 0.3 }),
  via: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.95, transparent: true, opacity: 0.25, polygonOffset: true, polygonOffsetFactor: -2 }),
  verde: new THREE.MeshStandardMaterial({ color: 0x6f9a55, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
  agua: new THREE.MeshStandardMaterial({ color: 0x3f7fb5, roughness: 0.25, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3 }),
  chao: new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 1 }),
  copa: new THREE.MeshStandardMaterial({ color: 0x4e7a3c, roughness: 0.9, flatShading: true }),
  tronco: new THREE.MeshStandardMaterial({ color: 0x6b4f37, roughness: 1 }),
  faixa: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb43c, emissiveIntensity: 1.2, transparent: true, opacity: 0.88 }),
  contorno: new THREE.LineBasicMaterial({ color: 0xd2ab62, transparent: true, opacity: 0.95 }),
};

// ------------------------------------------------------------------ geometria
const forma = (p) => { const s = new THREE.Shape(); for (let i = 0; i < p.length; i += 2) (i ? s.lineTo(p[i], p[i + 1]) : s.moveTo(p[i], p[i + 1])); return s; };
function extrudar(p, h, base = 0) {
  const g = new THREE.ExtrudeGeometry(forma(p), { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  if (base) g.translate(0, base, 0);
  return g;
}
// separa tampa (grupo 0) e paredes (grupo 1) da ExtrudeGeometry para juntar com outras
function parte(g, grupo, bid) {
  const gr = g.groups[grupo]; if (!gr) return null;
  const out = new THREE.BufferGeometry();
  for (const nome of ['position', 'normal', 'uv']) {
    const a = g.attributes[nome];
    out.setAttribute(nome, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
  }
  out.setAttribute('bid', new THREE.BufferAttribute(new Float32Array(gr.count).fill(bid), 1));
  return out;
}
const centro = (p) => { let x = 0, y = 0; const n = p.length / 2; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; } return [x / n, y / n]; };
const v3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y); // y do mapa (norte) vira -z

function faixaVia(p, larg) {
  const pos = [];
  for (let i = 0; i < p.length - 2; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * larg / 2, ny = (dx / L) * larg / 2;
    const A = [ax + nx, ay + ny], B = [ax - nx, ay - ny], C = [bx - nx, by - ny], E = [bx + nx, by + ny];
    for (const [x, y] of [A, B, C, A, C, E]) pos.push(x, 0, -y);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
function planoForma(p, y) { const g = new THREE.ShapeGeometry(forma(p)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }
function dentro(p, x, y) { let ok = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]; if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok; } return ok; }
function areaP(p) { let s = 0; for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; s += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(s / 2); }

// ------------------------------------------------------------------ satélite no chão
function tileXY(lat, lon, z) {
  const n = 2 ** z, x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  return [x, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}
function tileLatLon(x, y, z) {
  const n = 2 ** z; const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lat, lon];
}
async function chaoSatelite(c, raio) {
  const z = raio > 380 ? 17 : 18;
  const kx = Math.cos((c.lat * Math.PI) / 180) * 111320, ky = 110540;
  const ext = raio * 1.35;
  const [x0, y0] = tileXY(c.lat + ext / ky, c.lon - ext / kx, z).map(Math.floor);
  const [x1, y1] = tileXY(c.lat - ext / ky, c.lon + ext / kx, z).map(Math.floor);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const cv = document.createElement('canvas'); cv.width = nx * 256; cv.height = ny * 256;
  const g = cv.getContext('2d'); g.fillStyle = '#8c8a7e'; g.fillRect(0, 0, cv.width, cv.height);
  let ok = 0;
  await Promise.all([...Array(nx * ny)].map((_, k) => new Promise((fim) => {
    const tx = x0 + (k % nx), ty = y0 + Math.floor(k / nx);
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => { g.drawImage(im, (tx - x0) * 256, (ty - y0) * 256); ok++; fim(); };
    im.onerror = fim;
    im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
  })));
  if (!ok) return null;
  const [laN, loW] = tileLatLon(x0, y0, z), [laS, loE] = tileLatLon(x1 + 1, y1 + 1, z);
  const oeste = (loW - c.lon) * kx, leste = (loE - c.lon) * kx, norte = (laN - c.lat) * ky, sul = (laS - c.lat) * ky;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.PlaneGeometry(leste - oeste, norte - sul); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  m.position.set((oeste + leste) / 2, 0, -(norte + sul) / 2);
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ rótulos (HTML sobre a cena)
const rotulos = [];
function rotulo(html, cls, pos, extra = {}) {
  const el = document.createElement('div'); el.className = 'rot ' + cls; el.innerHTML = html;
  $('#rotulos').appendChild(el);
  const r = { el, pos, ...extra }; rotulos.push(r); return r;
}
const _v = new THREE.Vector3();
function atualizaRotulos() {
  const w = innerWidth, h = innerHeight;
  for (const r of rotulos) {
    if (r.oculto) { r.el.style.opacity = 0; continue; }
    _v.copy(r.pos).project(camera);
    const dist = camera.position.distanceTo(r.pos);
    const visivel = _v.z < 1 && _v.x > -1.1 && _v.x < 1.1 && _v.y > -1.1 && _v.y < 1.1 && (!r.ate || dist < r.ate);
    r.el.style.opacity = visivel ? (r.ate ? Math.min(1, (r.ate - dist) / (r.ate * 0.3)) : 1) : 0;
    if (visivel) r.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
  }
}

// ------------------------------------------------------------------ montar
let rotAlvo = null, tamanhoAlvo = 40, predios = [], meshAlvo = [], faixa = null, pinoApto = null, chaoSat = null, chaoLiso = null, grupoVias = null, grupoVerde = null, alturaAlvo = 30, topoAlvo = new THREE.Vector3(), baseAlvo = new THREE.Vector3(), poligonoAlvo = null;
const pegaveis = [];

function montar() {
  const raio = cena.raio;
  sol.shadow.camera.left = sol.shadow.camera.bottom = -raio * 1.1;
  sol.shadow.camera.right = sol.shadow.camera.top = raio * 1.1;
  sol.shadow.camera.far = 3000;
  scene.fog.near = raio * 1.7; scene.fog.far = raio * 5;

  chaoLiso = new THREE.Mesh(new THREE.CircleGeometry(raio * 9, 64).rotateX(-Math.PI / 2), MAT.chao);
  chaoLiso.position.y = -0.05; chaoLiso.receiveShadow = true; scene.add(chaoLiso);

  // verde, água, piscinas
  grupoVerde = new THREE.Group();
  const verdes = cena.verdes.filter((v) => v.p.length >= 6).map((v) => planoForma(v.p, 0.04));
  const gVerde = verdes.length ? unir(verdes) : null;
  if (gVerde) { const m = new THREE.Mesh(gVerde, MAT.verde); m.receiveShadow = true; grupoVerde.add(m); }
  const aguas = cena.agua.filter((a) => !a.linha && a.p.length >= 6).map((a) => planoForma(a.p, 0.08));
  const rios = cena.agua.filter((a) => a.linha).map((a) => faixaVia(a.p, a.l)).filter(Boolean);
  const piscinas = (cena.piscinas || []).filter((a) => a.p.length >= 6).map((a) => planoForma(a.p, 0.12));
  const todasAguas = [...aguas, ...rios.map((g) => g.translate(0, 0.08, 0)), ...piscinas];
  const gAgua = todasAguas.length ? unir(todasAguas) : null;
  if (gAgua) scene.add(new THREE.Mesh(gAgua, MAT.agua));
  scene.add(grupoVerde);

  // ruas
  grupoVias = new THREE.Group();
  const vias = cena.vias.map((v) => faixaVia(v.p, v.l)).filter(Boolean).map((g) => g.translate(0, 0.06, 0));
  const gVias = vias.length ? unir(vias) : null;
  if (gVias) { const m = new THREE.Mesh(gVias, MAT.via); m.receiveShadow = true; grupoVias.add(m); }
  scene.add(grupoVias);

  // árvores nas áreas verdes
  const pontos = [];
  let semente = 11; const rnd = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  for (const v of cena.verdes) {
    if (!['park', 'garden', 'forest', 'wood', 'scrub', 'shrub', 'tree', 'recreation_ground', 'village_green', 'grass', 'meadow', 'grassland'].includes(v.t)) continue;
    const xs = [], ys = []; for (let i = 0; i < v.p.length; i += 2) { xs.push(v.p[i]); ys.push(v.p[i + 1]); }
    const [mx, Mx, my, My] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const dens = ['forest', 'wood', 'scrub', 'shrub', 'tree'].includes(v.t) ? 70 : ['grass', 'meadow', 'grassland'].includes(v.t) ? 600 : 180;
    const n = Math.min(160, Math.round(areaP(v.p) / dens));
    for (let k = 0, t = 0; k < n && t < n * 4; t++) { const x = mx + rnd() * (Mx - mx), y = my + rnd() * (My - my); if (dentro(v.p, x, y)) { pontos.push([x, y, 0.7 + rnd() * 0.7]); k++; } }
    if (pontos.length > 1400) break;
  }
  if (pontos.length) {
    const copa = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.2, 0), MAT.copa, pontos.length);
    const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 5), MAT.tronco, pontos.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    pontos.forEach(([x, y, e], i) => {
      M.compose(new THREE.Vector3(x, 3 * e + 2.6 * e, -y), q, s.set(e, e * (0.9 + rnd() * 0.4), e)); copa.setMatrixAt(i, M);
      M.compose(new THREE.Vector3(x, 1.5 * e, -y), q, s.set(e, e, e)); tronco.setMatrixAt(i, M);
    });
    copa.castShadow = true; copa.receiveShadow = true; tronco.castShadow = true;
    scene.add(copa, tronco);
  }

  // prédios
  predios = cena.predios;
  const altas = [], baixas = [], tetos = [], telhados = [];
  predios.forEach((b, i) => {
    if (b.alvo) return;
    const g = extrudar(b.p, b.h);
    const tampa = parte(g, 0, i), lados = parte(g, 1, i);
    (b.h >= 11 ? altas : baixas).push(lados);
    (b.h < 8 && ['house', 'detached', 'residential', 'semidetached_house', 'yes', 'bungalow'].includes(b.tipo) ? telhados : tetos).push(tampa);
    g.dispose();
  });
  const juntar = (lista, mat) => { const g = lista.length ? unir(lista) : null; if (!g) return; const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); pegaveis.push(m); };
  juntar(altas, MAT.paredeAlta); juntar(baixas, MAT.paredeBaixa); juntar(tetos, MAT.teto); juntar(telhados, MAT.telhado);

  // o condomínio
  const box = new THREE.Box3();
  predios.forEach((b, i) => {
    if (!b.alvo) return;
    const g = extrudar(b.p, b.h);
    const m = new THREE.Mesh(g, [MAT.tetoAlvo, b.h >= 8 ? MAT.paredeAlvo : MAT.paredeBaixa]);
    g.setAttribute('bid', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(i), 1));
    m.castShadow = m.receiveShadow = true; scene.add(m); meshAlvo.push(m); pegaveis.push(m);
    box.expandByObject(m);
    // contorno dourado no chão
    const pts = []; for (let k = 0; k < b.p.length; k += 2) pts.push(v3(b.p[k], b.p[k + 1], 0.3)); pts.push(pts[0].clone());
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), MAT.contorno); ln.userData.manter = true; ln.userData.contornoModelo = true; scene.add(ln);
  });
  if (cena.alvo.contorno && cena.alvo.contorno.length > 4) {
    const p = cena.alvo.contorno, pts = []; for (let k = 0; k < p.length; k += 2) pts.push(v3(p[k], p[k + 1], 0.5)); pts.push(pts[0].clone());
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), MAT.contorno); l.userData.manter = true; scene.add(l);
    if (box.isEmpty()) pts.forEach((q) => box.expandByPoint(q));
  }
  if (box.isEmpty()) box.setFromCenterAndSize(v3(cena.alvo.ponto[0], cena.alvo.ponto[1], 10), new THREE.Vector3(30, 20, 30));
  box.getCenter(baseAlvo); baseAlvo.y = 0;
  { const t = new THREE.Vector3(); box.getSize(t); tamanhoAlvo = Math.hypot(t.x, t.z); }
  alturaAlvo = Math.max(6, box.max.y);
  topoAlvo.set(baseAlvo.x, alturaAlvo, baseAlvo.z);
  // a torre do andar: entre as partes do condomínio com a altura máxima (±3 m), a de maior planta
  // (sem isso, um pedaço fino do contorno podia ser o escolhido e a faixa dourada sumia dentro do prédio)
  const alvosP = predios.filter((b) => b.alvo), hMax = Math.max(0, ...alvosP.map((b) => b.h));
  const torre = alvosP.filter((b) => b.h >= hMax - 3).sort((a, b) => areaP(b.p) - areaP(a.p))[0];
  poligonoAlvo = torre ? torre.p : null;

  // rótulo do condomínio
  rotAlvo = rotulo(`${esc(D.condominio.nome)}`, 'alvo', topoAlvo.clone().add(new THREE.Vector3(0, 8, 0)));

  // nomes de ruas (os trechos mais longos de cada rua)
  const porRua = new Map();
  for (const v of cena.vias) {
    if (!v.nome || ['footway', 'path', 'service', 'steps', 'cycleway'].includes(v.t)) continue;
    for (let i = 0; i < v.p.length - 2; i += 2) {
      const L = Math.hypot(v.p[i + 2] - v.p[i], v.p[i + 3] - v.p[i + 1]);
      const atual = porRua.get(v.nome);
      if (!atual || L > atual.L) porRua.set(v.nome, { L, x: (v.p[i] + v.p[i + 2]) / 2, y: (v.p[i + 1] + v.p[i + 3]) / 2 });
    }
  }
  [...porRua.entries()].sort((a, b) => b[1].L - a[1].L).slice(0, 12).forEach(([nome, s]) => rotulo(esc(nome), 'rua', v3(s.x, s.y, 1), { ate: cena.raio * 2.2 }));
}

// ------------------------------------------------------------------ andar do apartamento
function andarPos(andar) { return andar * ANDAR_H; } // térreo 0–3 m; 1º andar 3–6 m…
function mostraAndar(andar) {
  if (faixa) { if (faixa.parent) faixa.parent.remove(faixa); faixa.geometry.dispose(); faixa = null; }
  if (!poligonoAlvo || andar === null || andar === undefined) return;
  const [cx, cy] = centro(poligonoAlvo);
  const p = []; for (let i = 0; i < poligonoAlvo.length; i += 2) p.push(cx + (poligonoAlvo[i] - cx) * 1.035, cy + (poligonoAlvo[i + 1] - cy) * 1.035);
  faixa = new THREE.Mesh(extrudar(p, ANDAR_H * 0.86, andarPos(andar) + ANDAR_H * 0.07), MAT.faixa);
  faixa.userData.manter = true;
  if (real && real.ligado) faixa.renderOrder = 10;
  scene.add(faixa);
  const tot = cena.alvo.andares || Math.round(alturaAlvo / ANDAR_H);
  $('#andar-txt').innerHTML = `${andar === 0 ? 'Térreo' : andar + 'º andar'}<small>≈ ${Math.round(andarPos(andar) + 1.5)} m do chão${tot ? ` · de ${tot}` : ''}</small>`;
}

function vistaDoAndar(andar) {
  if (!poligonoAlvo) return;
  const [cx, cy] = centro(poligonoAlvo);
  // fachada voltada para o lado mais aberto (menos prédios altos à frente)
  let melhor = 0, menor = Infinity;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    let bloqueio = 0;
    for (const b of predios) {
      if (b.alvo || b.h < andarPos(andar)) continue;
      const [bx, by] = centro(b.p); const vx = bx - cx, vy = by - cy, d = Math.hypot(vx, vy);
      if (d < 200 && (vx * dx + vy * dy) / (d || 1) > 0.8) bloqueio += 200 - d;
    }
    if (bloqueio < menor) { menor = bloqueio; melhor = a; }
  }
  const dx = Math.cos(melhor), dy = Math.sin(melhor);
  let r = 0; for (let i = 0; i < poligonoAlvo.length; i += 2) r = Math.max(r, Math.hypot(poligonoAlvo[i] - cx, poligonoAlvo[i + 1] - cy));
  const h = andarPos(andar) + 1.6;
  voar(v3(cx + dx * (r + 1.5), cy + dy * (r + 1.5), h), v3(cx + dx * (r + 60), cy + dy * (r + 60), h - 4), 2.2);
  controls.minDistance = 1;
  modoVista(true);
}

// ------------------------------------------------------------------ câmera
let voo = null;
function voar(pos, alvoPos, seg = 1.8) {
  controls.autoRotate = false; $('#b-girar').classList.remove('on');
  if (reduzMovimento) { camera.position.copy(pos); controls.target.copy(alvoPos); return; }
  voo = { de: camera.position.clone(), para: pos, tDe: controls.target.clone(), tPara: alvoPos, t0: performance.now(), dur: seg * 1000 };
}
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function modoVista(on) { if (rotAlvo) rotAlvo.oculto = on; if (pinoApto) pinoApto.oculto = on; }
function vistas(v) {
  controls.minDistance = 8; modoVista(false);
  const alvoMeio = topoAlvo.clone().setY(alturaAlvo * 0.45);
  const dist = Math.max(alturaAlvo * 2.6, tamanhoAlvo * 2.2, 160);
  if (v === 'intro') voar(alvoMeio.clone().add(new THREE.Vector3(-dist * 0.72, dist * 0.55, dist * 0.72)), alvoMeio, 2.6);
  if (v === 'cima') voar(baseAlvo.clone().add(new THREE.Vector3(0.1, cena.raio * 1.7, cena.raio * 0.35)), baseAlvo.clone(), 2);
  // o OrbitControls não deixa olhar de baixo para cima além do horizonte: alvo perto do chão, com leve subida
  if (v === 'rua') { controls.minDistance = 1; voar(baseAlvo.clone().add(new THREE.Vector3(-60, 1.7, 60)), baseAlvo.clone().setY(8), 2); }
}

// ------------------------------------------------------------------ luz do dia
const LUZ = {
  dia: { sol: [0.55, 0.9, 0.35], cor: 0xfff4e2, int: 2.6, hemi: [0xdfeaff, 0x5b5346, 1.1], ceu: [0x3f7ac0, 0xb9d4ee, 0xe9eef2], neblina: 0xb9d4ee, janelas: 0, exp: 1.05 },
  tarde: { sol: [-0.75, 0.22, 0.45], cor: 0xffa860, int: 2.8, hemi: [0xffc9a0, 0x4a3b33, 0.75], ceu: [0x3a4b7d, 0xf2a46a, 0xfbd3a6], neblina: 0xe6a985, janelas: 0.35, exp: 1.0 },
  noite: { sol: [0.4, 0.75, -0.3], cor: 0x8fa8ff, int: 0.35, hemi: [0x30406a, 0x0b0c10, 0.35], ceu: [0x05070d, 0x15203a, 0x2a3350], neblina: 0x141c30, janelas: 1.4, exp: 1.25 },
};
function luz(nome) {
  const L = LUZ[nome];
  const R = cena ? cena.raio : 300;
  sol.position.set(L.sol[0] * R * 2 + baseAlvo.x, L.sol[1] * R * 2, L.sol[2] * R * 2 + baseAlvo.z);
  sol.target.position.copy(baseAlvo);
  sol.color.set(L.cor); sol.intensity = L.int;
  hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
  ceuMat.uniforms.cTopo.value.set(L.ceu[0]); ceuMat.uniforms.cMeio.value.set(L.ceu[1]); ceuMat.uniforms.cBaixo.value.set(L.ceu[2]);
  scene.fog.color.set(L.neblina);
  MAT.paredeAlta.emissive.set(L.janelas ? 0xffd9a0 : 0x000000); MAT.paredeAlta.emissiveIntensity = L.janelas;
  MAT.paredeAlvo.emissive.set(L.janelas ? 0xffe2a8 : 0x1a1206); MAT.paredeAlvo.emissiveIntensity = L.janelas ? L.janelas * 1.3 : 1;
  MAT.tetoAlvo.emissive.set(nome === 'noite' ? 0x6b4c14 : 0x000000);
  // ruas acesas à noite
  MAT.via.emissive.set(nome === 'noite' ? 0xc27a35 : nome === 'tarde' ? 0x3a1f08 : 0x000000);
  MAT.via.emissiveIntensity = nome === 'noite' ? 0.32 : 1;
  MAT.via.opacity = nome === 'noite' ? 0.7 : (chaoSat && chaoSat.visible ? 0.25 : 0.9);
  renderer.toneMappingExposure = L.exp;
  document.querySelectorAll('[data-luz]').forEach((b) => b.classList.toggle('on', b.dataset.luz === nome));
}

// ------------------------------------------------------------------ o que tem perto (no 3D)
let rotPerto = [];
async function perto() {
  try {
    const r = await fetch(URL_PERTO, { credentials: 'same-origin' });
    if (!r.ok) return;
    const p = await r.json();
    const kx = Math.cos((cena.centro.lat * Math.PI) / 180) * 111320, ky = 110540;
    for (const cat of p.categorias || []) {
      let k = 0;
      for (const x of cat.itens.slice(0, cat.id === 'transporte' ? 1 : 2)) {
        const lx = (x.lon - cena.centro.lon) * kx, ly = (x.lat - cena.centro.lat) * ky;
        if (Math.hypot(lx, ly) > cena.raio * 1.25) continue;
        if (Math.hypot(lx - baseAlvo.x, -ly - baseAlvo.z) < 35) continue;
        rotPerto.push(rotulo(`<i>${cat.icone}</i>${esc(x.nome)} <span style="opacity:.6">${x.min} min</span>`, 'poi', v3(lx, ly, 12 + (k++ % 2) * 9), { ate: cena.raio * 3 }));
      }
    }
  } catch {}
}

// ------------------------------------------------------------------ passar o mouse / clicar
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let sobre = -1;
function predioSob(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const h = ray.intersectObjects(pegaveis, false)[0];
  if (!h || !h.face) return -1;
  const bid = h.object.geometry.attributes.bid;
  return bid ? bid.getX(h.face.a) : -1;
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!cena || e.buttons) return;
  const i = predioSob(e); const dica = $('#dica');
  if (i < 0) { dica.hidden = true; sobre = -1; renderer.domElement.style.cursor = ''; return; }
  const b = predios[i]; sobre = i;
  const andares = b.andares || Math.max(1, Math.round((b.h - 1) / ANDAR_H));
  dica.innerHTML = `${b.alvo ? `<b>${esc(D.condominio.nome)}</b><br>` : b.nome ? `<b>${esc(b.nome)}</b><br>` : ''}${b.h >= 8 ? `${andares} andar${andares > 1 ? 'es' : ''} · ` : ''}≈ ${Math.round(b.h)} m${b.est ? ' (estimado)' : b.censo ? ' (pelo Censo 2022)' : ''}${!b.alvo && !PUBLICO && ID && b.ref ? '<br><span style="opacity:.7">Clique se este for o prédio do condomínio</span>' : ''}`;
  dica.style.left = e.clientX + 'px'; dica.style.top = e.clientY + 'px'; dica.hidden = false;
  renderer.domElement.style.cursor = !b.alvo && !PUBLICO && ID && b.ref ? 'pointer' : '';
});
let clique0 = null;
renderer.domElement.addEventListener('pointerdown', (e) => { clique0 = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', async (e) => {
  if (!clique0 || Math.hypot(e.clientX - clique0[0], e.clientY - clique0[1]) > 4 || PUBLICO || !ID) return;
  const i = predioSob(e); if (i < 0) return;
  const b = predios[i]; if (b.alvo || !b.ref) return;
  if (!confirm(`Usar este prédio como "${D.condominio.nome}"? A posição e o 3D do condomínio passam a usar este contorno.`)) return;
  const [x, y] = centro(b.p);
  const kx = Math.cos((cena.centro.lat * Math.PI) / 180) * 111320, ky = 110540;
  const r = await fetch(`/api/condominios/${encodeURIComponent(ID)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: cena.centro.lat + y / ky, lon: cena.centro.lon + x / kx, ...(/^(way|relation)\//.test(b.ref) ? { osm_ref: b.ref } : {}) }) });
  if (r.ok) location.reload(); else alert('Não consegui salvar: ' + ((await r.json().catch(() => ({}))).erro || r.status));
});

// ------------------------------------------------------------------ interface
function interface_() {
  const c = D.condominio;
  document.title = `${c.nome} em 3D · ${MARCA.cliente}`;
  $('#nome').textContent = c.nome;
  $('#endereco').textContent = [[c.logradouro, c.numero].filter(Boolean).join(', '), c.bairro, 'Campinas'].filter(Boolean).join(' · ');
  const tot = cena.alvo.andares;
  const chips = [];
  if (FG) { document.querySelector('.marca span').textContent = 'Rua em 3D'; if (D.imovel && D.imovel.valor) chips.push(`<span class="chip ouro">${esc('R$ ' + Math.round(D.imovel.valor).toLocaleString('pt-BR'))}</span>`); }
  if (c.tipo === 'casa') chips.push('<span class="chip ouro">Casa</span>');
  else if (c.tipo === 'horizontal') chips.push('<span class="chip ouro">Condomínio de casas</span>');
  else if (tot) chips.push(`<span class="chip ouro${cena.alvo.estimado ? ' est' : ''}">${tot} andares${cena.alvo.estimado ? ' (estimado)' : ''}</span>`);
  if (c.torres) chips.push(`<span class="chip">${c.torres} torres</span>`);
  if (c.unidades) chips.push(`<span class="chip">${c.unidades} unidades</span>`);
  if (cena.alvo.sintetico) chips.push('<span class="chip est">contorno aproximado</span>');
  if (c.geo_fonte && ['rua', 'cep'].includes(c.geo_fonte)) chips.push('<span class="chip est">posição aproximada</span>');
  $('#chips').innerHTML = chips.join('');
  if (PUBLICO) $('#endereco').insertAdjacentHTML('afterend', `<a class="voltar" href="/condominios/${encodeURIComponent(SLUG)}">← Página do condomínio</a>`);

  const im = D.imovel;
  if (im && im.andar !== null && im.andar !== undefined) {
    $('#apto').hidden = false;
    $('#apto').innerHTML = `<b>${esc(im.codigo)}${im.unidade ? ' · Unidade ' + esc(im.unidade) : ''}</b><div class="s">${im.andar === 0 ? 'Térreo' : im.andar + 'º andar'}${im.torre ? ' · torre ' + esc(im.torre) : ''} · posição no andar aproximada</div>`;
  } else if (im && FG) {
    $('#apto').hidden = false;
    $('#apto').innerHTML = `<b>${esc(im.codigo)} · ${esc(im.tipo || 'Imóvel')}</b><div class="s">Imóvel destacado em dourado · posição pelo endereço do anúncio</div>`;
  } else if (im) {
    $('#apto').hidden = false;
    $('#apto').innerHTML = `<b>${esc(im.codigo)}</b><div class="s">Cadastre a unidade (ex.: 142) para ver o andar no 3D.</div>`;
  }

  if (c.tipo !== 'horizontal' && c.tipo !== 'casa' && poligonoAlvo) {
    $('#lado').hidden = false;
    const max = tot || Math.max(1, Math.round(alturaAlvo / ANDAR_H) - 1);
    const s = $('#andar'); s.max = max;
    const inicial = im && im.andar !== null && im.andar !== undefined ? Math.min(im.andar, max) : Math.round(max / 2);
    s.value = inicial; mostraAndar(inicial);
    s.addEventListener('input', () => mostraAndar(+s.value));
    $('#b-vista').addEventListener('click', () => vistaDoAndar(+s.value));
    const un = (D.unidades || []).filter((u) => u.andar <= max);
    $('#unidades').innerHTML = un.length ? un.map((u) => `<button type="button" data-andar="${u.andar}" class="${im && u.id === im.id ? 'on' : ''}" title="${esc(u.codigo)}">${esc(u.unidade)} · ${esc(u.codigo)}</button>`).join('') : '';
    $('#unidades').addEventListener('click', (e) => { const b = e.target.closest('[data-andar]'); if (!b) return; s.value = b.dataset.andar; mostraAndar(+b.dataset.andar); document.querySelectorAll('#unidades button').forEach((x) => x.classList.toggle('on', x === b)); });
    if (im && im.andar !== null && im.andar !== undefined) {
      pinoApto = rotulo(`${esc(im.unidade || im.codigo)} · ${im.andar === 0 ? 'térreo' : im.andar + 'º'}`, 'apt', new THREE.Vector3());
      const [cx, cy] = centro(poligonoAlvo); let r = 0; for (let i = 0; i < poligonoAlvo.length; i += 2) r = Math.max(r, Math.hypot(poligonoAlvo[i] - cx, poligonoAlvo[i + 1] - cy));
      pinoApto.pos.copy(v3(cx + r * 0.7, cy - r * 0.7, andarPos(im.andar) + ANDAR_H));
    }
  }

  document.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => vistas(b.dataset.v)));
  document.querySelectorAll('[data-luz]').forEach((b) => b.addEventListener('click', () => luz(b.dataset.luz)));
  $('#b-girar').addEventListener('click', (e) => { controls.autoRotate = !controls.autoRotate; e.currentTarget.classList.toggle('on', controls.autoRotate); if (controls.autoRotate) controls.target.copy(topoAlvo.clone().setY(alturaAlvo * 0.45)); });
  $('#b-sat').addEventListener('click', (e) => {
    const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on);
    if (chaoSat) chaoSat.visible = on;
    MAT.via.opacity = document.querySelector('[data-luz=noite].on') ? 0.7 : on ? 0.25 : 0.9; grupoVerde.visible = !on || !chaoSat;
  });
  $('#b-perto').addEventListener('click', (e) => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); rotPerto.forEach((r) => { r.oculto = !on; }); });
}


// ------------------------------------------------------------------ modo realista (Google Photorealistic 3D Tiles)
// Liga quando o sistema tem a chave do Google Maps (Map Tiles API). O modelo próprio fica de reserva no botão "Modelo".
const modelo = new THREE.Group(); scene.add(modelo);
let real = null;
const DEG = Math.PI / 180;
async function chaveGoogle() {
  try { const r = await fetch('/api/publico/condominios/mapas', { credentials: 'same-origin' }); const j = await r.json(); return j.chave || null; } catch { return null; }
}
// raio de cima para baixo só nos blocos VISÍVEIS (os blocos pai, em baixa resolução, ficam carregados escondidos e não têm os prédios)
let visiveis = null, visiveisEm = 0;
function raioBaixo(x, z, maisBaixo = false) {
  if (!real) return null;
  if (!visiveis || performance.now() - visiveisEm > 500) { visiveis = []; real.tiles.group.traverseVisible((o) => { if (o.isMesh) visiveis.push(o); }); visiveisEm = performance.now(); }
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 4000, z), new THREE.Vector3(0, -1, 0), 0, 9000);
  const hs = rc.intersectObjects(visiveis, false);
  // o chão é o último ponto atravessado (blocos grossos e finos podem estar visíveis juntos; o grosso fica por cima)
  const h = maisBaixo ? hs[hs.length - 1] : hs[0];
  return h ? h.point.y : null;
}
async function ligaRealista(chave) {
  const [M, el] = await Promise.all([import('/vendor/three/tiles3d.js'), fetch(`/api/publico/condominios/elevacao?lat=${cena.centro.lat}&lon=${cena.centro.lon}`).then((r) => r.json()).catch(() => ({}))]);
  const altura = Number.isFinite(el.elipsoide) ? el.elipsoide : null;
  const tiles = new M.TilesRenderer();
  tiles.registerPlugin(new M.GoogleCloudAuthPlugin({ apiToken: chave, autoRefreshToken: true }));
  const draco = new M.DRACOLoader(); draco.setDecoderPath('/vendor/draco/');
  tiles.registerPlugin(new M.GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new M.ReorientationPlugin({ lat: cena.centro.lat * DEG, lon: cena.centro.lon * DEG, height: altura ?? 0, recenter: true }));
  tiles.errorTarget = celular ? 22 : 10;
  tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
  // o plugin deixa X para oeste e Z para o norte; o modelo usa X para leste e Z para o sul: meia-volta no eixo Y
  const pai = new THREE.Group(); pai.rotation.y = Math.PI; pai.position.y = altura === null ? -690 : 0; pai.add(tiles.group); scene.add(pai);
  real = { tiles, pai, nivelado: altura === null ? 0 : 2, dem: altura !== null, erro: null, ligado: true };
  if (qs.has('debug')) window.__real = { real, camera, controls, scene, THREE };
  tiles.addEventListener('load-error', (e) => { if (!real.carregou) { real.erro = 'O Google recusou a chave do 3D realista.'; desligaRealista(true); } });
  tiles.addEventListener('load-model', () => { real.carregou = true; });
  aplicaModo();
  // acerta a altura do chão (o Google mede pelo elipsoide) e mede a altura real do prédio
  const nivela = () => {
    if (!real || !real.carregou) return;
    // o chão é medido nas ruas perto do prédio (raio em cima de telhado ou árvore daria chão alto demais)
    const pts = [];
    for (const v of cena.vias) for (let i = 0; i < v.p.length; i += 2) { const x = v.p[i], z = -v.p[i + 1]; const d = Math.hypot(x - baseAlvo.x, z - baseAlvo.z); if (d < 160) pts.push([d, x, z]); }
    pts.sort((a, b) => a[0] - b[0]);
    const alturas = pts.slice(0, 24).map(([, x, z]) => raioBaixo(x, z, true)).filter((h) => h !== null).sort((a, b) => a - b);
    if (!alturas.length) { const h0 = raioBaixo(0, 0, true); if (h0 !== null) alturas.push(h0); }
    if (qs.has('debug')) console.warn('tentativa', pts.length, alturas.length, alturas[0]);
    if (!alturas.length) return;
    // descarta os raios que passaram por um buraco e bateram no globo de baixa resolução lá embaixo
    const med = alturas[Math.floor(alturas.length / 2)];
    const bons = alturas.filter((h) => Math.abs(h - med) < 25);
    const y = bons[Math.floor(bons.length * 0.3)];
    if (real.nivelado >= 2 && Math.abs(y) > (real.dem ? 8 : 150)) return;
    if (Math.abs(y) < 0.3 && real.nivelado >= 2 && real.corrigido) return;
    if (!Number.isFinite(y) || Math.abs(y) > 6000) return;
    pai.position.y -= y; pai.updateMatrixWorld(true); real.nivelado++;
    if (qs.has('debug')) console.warn('nivela', y, alturas.length, pai.position.y);
    if (poligonoAlvo && D.condominio.tipo !== 'horizontal' && D.condominio.tipo !== 'casa' && real.nivelado >= 2) {
      // confere no 3D do Google qual contorno perto do endereço é mesmo o prédio (altura parecida com a esperada)
      const esperada = (cena.alvo.andares || 8) * 3 + 3;
      const [px, py] = cena.alvo.ponto || centro(poligonoAlvo);
      let melhor = null;
      for (const b of predios) {
        if (b.ar < 120) continue;
        const [bx, by] = centro(b.p); const d = Math.hypot(bx - px, by - py);
        if (d > 70 || !b.alvo) continue; // só confere o próprio prédio (trocar de contorno pelo 3D do Google errava em blocos de baixa resolução)
        const topo = raioBaixo(bx, -by);
        if (!topo || topo < 6) continue;
        const nota = -Math.abs(topo - esperada) - d * 0.15 + (b.alvo ? 4 : 0);
        if (!melhor || nota > melhor.nota) melhor = { b, topo, nota };
      }
      if (melhor) {
        real.corrigido = true;
        if (melhor.b.p !== poligonoAlvo) {
          poligonoAlvo = melhor.b.p;
          const [cx, cy] = centro(poligonoAlvo); baseAlvo.set(cx, 0, -cy);
          scene.children.filter((o) => o.userData.contornoModelo).forEach((o) => { o.visible = false; });
          const q = []; for (let k = 0; k < poligonoAlvo.length; k += 2) q.push(v3(poligonoAlvo[k], poligonoAlvo[k + 1], 0.4)); q.push(q[0].clone());
          const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(q), MAT.contorno); ln.userData.manter = true; scene.add(ln);
          if (pinoApto) { let r = 0; for (let k = 0; k < poligonoAlvo.length; k += 2) r = Math.max(r, Math.hypot(poligonoAlvo[k] - cx, poligonoAlvo[k + 1] - cy)); pinoApto.pos.x = cx + r * 0.7; pinoApto.pos.z = -(cy - r * 0.7); }
        }
        const topo = melhor.topo;
        const tot = Math.max(1, (cena.alvo.andares || Math.round(topo / 3)) + 1);
        ANDAR_H = Math.min(3.8, Math.max(2.5, (topo - 1.5) / tot));
        alturaAlvo = topo; topoAlvo.set(baseAlvo.x, topo, baseAlvo.z);
        if (rotAlvo) rotAlvo.pos.copy(topoAlvo).add(new THREE.Vector3(0, 8, 0));
        mostraAndar(+$('#andar').value);
        if (pinoApto) pinoApto.pos.y = andarPos(+$('#andar').value) + ANDAR_H;
      }
    }
  };
  // nivela de novo enquanto os blocos de alta resolução chegam (os primeiros são o globo e o relevo suavizado,
  // que fica acima do chão nos bairros com prédios)
  let n = 0;
  const t = setInterval(() => {
    if (!real) return clearInterval(t);
    let malhas = 0; tiles.group.traverseVisible((o) => { if (o.isMesh) malhas++; });
    if (malhas >= 40 && real.ligado) nivela();
    if (!real.pronto && malhas >= 30) { real.pronto = true; aplicaModo(); }
    if (++n > 90) clearInterval(t);
  }, 2000);
  setInterval(() => {
    if (!real || !real.ligado || real.erro) return;
    const a = (real.tiles.getAttributions ? real.tiles.getAttributions() : []).map((x) => x.value).filter((v) => typeof v === 'string');
    $('#creditos').textContent = `3D: Google${a.length ? ' · ' + a.join(' · ') : ''} · Andar destacado aproximado`;
  }, 3000);
}
function aplicaModo() {
  const on = !!(real && real.ligado);
  // enquanto o 3D do Google não chegou, o modelo continua na tela
  const trocou = on && real.pronto;
  modelo.visible = !trocou;
  for (const m of meshAlvo) m.visible = !trocou;
  pegaveis.forEach((m) => { m.raycast = on ? () => {} : THREE.Mesh.prototype.raycast; });
  if (real) real.pai.visible = on;
  MAT.faixa.depthTest = !on; MAT.faixa.opacity = on ? 0.8 : 0.88; MAT.contorno.depthTest = !on;
  if (faixa) faixa.renderOrder = on ? 10 : 0;
  const b = $('#b-real'); if (b) { b.textContent = on ? 'Realista' : 'Modelo'; b.classList.toggle('on', on); }
  scene.fog.near = cena.raio * (on ? 3 : 1.7); scene.fog.far = cena.raio * (on ? 9 : 5);
  if (on) { $('#b-sat').hidden = true; } else { $('#b-sat').hidden = false; }
}
function desligaRealista(erro) {
  if (!real) return;
  real.ligado = false; aplicaModo();
  if (erro) { const b = $('#b-real'); if (b) b.remove(); $('#creditos').textContent = real.erro; }
}

// ------------------------------------------------------------------ laço
const bussola = document.getElementById('agulha');
function laco(t) {
  requestAnimationFrame(laco);
  if (voo) {
    const k = Math.min(1, (t - voo.t0) / voo.dur), e = suave(k);
    camera.position.lerpVectors(voo.de, voo.para, e); controls.target.lerpVectors(voo.tDe, voo.tPara, e);
    if (k >= 1) voo = null;
  }
  controls.update();
  if (real && real.ligado) { camera.updateMatrixWorld(); real.tiles.update(); }
  if (faixa) faixa.material.opacity = 0.7 + Math.sin(t / 380) * 0.18;
  bussola.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
  renderer.render(scene, camera);
  atualizaRotulos();
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (real) real.tiles.setResolutionFromRenderer(camera, renderer); });

// ------------------------------------------------------------------ início
(async () => {
  try {
    if (!ID && !SLUG && !FG) throw new Error('Abra o 3D pela ficha de um condomínio.');
    D = await carregar();
    cena = D.cena; alvo = cena.alvo; ANDAR_H = alvo.alturaAndar || 3;
    const antes = new Set(scene.children);
    montar();
    luz(new Date().getHours() >= 18 || new Date().getHours() < 6 ? 'noite' : 'dia');
    interface_();
    camera.position.copy(topoAlvo.clone().add(new THREE.Vector3(-cena.raio * 2.2, cena.raio * 1.9, cena.raio * 2.2)));
    controls.target.copy(baseAlvo);
    requestAnimationFrame(laco);
    $('#carregando-txt').textContent = 'Trazendo a foto de satélite…';
    chaoSat = await chaoSatelite(cena.centro, cena.raio).catch(() => null);
    if (chaoSat) { scene.add(chaoSat); grupoVerde.visible = false; } else { $('#b-sat').classList.remove('on'); MAT.via.opacity = 0.9; }
    for (const o of [...scene.children]) if (!antes.has(o) && !o.userData.manter && o !== modelo) modelo.add(o);
    const chave = await chaveGoogle();
    if (chave) {
      $('#controles').insertAdjacentHTML('afterbegin', '<button class="b on" id="b-real" type="button" title="Trocar entre o 3D fotografado pelo Google e o modelo">Realista</button><span class="sep"></span>');
      $('#b-real').addEventListener('click', () => { if (!real) return; real.ligado = !real.ligado; aplicaModo(); });
      $('#carregando-txt').textContent = 'Carregando o 3D realista…';
      ligaRealista(chave).catch((e) => { console.error(e); desligaRealista(true); });
    }
    $('#carregando').classList.add('fim');
    vistas('intro');
    setTimeout(() => { if (!voo && !reduzMovimento) { controls.autoRotate = true; $('#b-girar').classList.add('on'); } }, 3200);
    renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; $('#b-girar').classList.remove('on'); }, { once: true });
    perto();
  } catch (e) {
    $('#carregando-txt').textContent = e.message; $('#carregando .anel').style.display = 'none';
  }
})();
