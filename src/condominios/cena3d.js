// Condomínios · cena 3D do prédio e do entorno (prédios, ruas, verde e água do OpenStreetMap).
// Coordenadas em metros a partir do centro do condomínio: x = leste, y = norte.
const O = require('./overpass');

const ALTURA_ANDAR = 3;

function projetor(lat0, lon0) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110540;
  return (lat, lon) => [Math.round((lon - lon0) * kx * 10) / 10, Math.round((lat - lat0) * ky * 10) / 10];
}

function areaPoligono(p) { // p = [x0,y0,x1,y1,...]
  let s = 0; for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; s += p[i] * p[j + 1] - p[j] * p[i + 1]; }
  return Math.abs(s / 2);
}
function centroide(p) { let x = 0, y = 0; const n = p.length / 2; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; } return [x / n, y / n]; }
function contem(p, x, y) {
  let ok = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

function altura(t, area) {
  const h = parseFloat(String(t.height || '').replace(',', '.'));
  if (h > 0 && h < 400) return { h, est: 0 };
  const lv = parseFloat(t['building:levels']);
  if (lv > 0 && lv < 120) return { h: lv * ALTURA_ANDAR + (t['roof:levels'] ? 1.5 : 0.6), est: 0, andares: lv };
  const b = t.building;
  if (b === 'apartments') return { h: area > 250 ? 30 : 12, est: 1 };
  if (['house', 'detached', 'residential', 'semidetached_house', 'terrace', 'bungalow'].includes(b)) return { h: area > 400 ? 9 : 6, est: 1 };
  if (['garage', 'garages', 'shed', 'roof', 'carport', 'hut'].includes(b)) return { h: 3, est: 1 };
  if (['commercial', 'retail', 'office', 'industrial', 'warehouse', 'school', 'university', 'hospital', 'church'].includes(b)) return { h: area > 2000 ? 14 : 9, est: 1 };
  return { h: area > 1500 ? 12 : area > 300 ? 8 : 6, est: 1 };
}

const LARGURA = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9, residential: 7, unclassified: 7, living_street: 6, service: 4.5, pedestrian: 5, footway: 2, path: 1.5, cycleway: 2.5, steps: 2 };

async function gerar(c, raio) {
  const { lat, lon } = c;
  const P = projetor(lat, lon);
  const a = `(around:${raio},${lat},${lon})`;
  // contornos dos prédios: base própria (Overture + Censo) quando houver; senão, o OpenStreetMap
  const daBase = require('./predios3d').prediosNoRaio(lat, lon, raio, P);
  let j = { elements: [] }, aviso = null;
  try {
    j = await O.overpass(`[out:json][timeout:25];(
    ${daBase ? '' : `way["building"]${a}; relation["building"]${a};`}
    way["highway"]${a};
    way["leisure"~"^(park|garden|pitch|playground|swimming_pool|golf_course)$"]${a};
    way["landuse"~"^(grass|forest|recreation_ground|meadow|village_green|cemetery)$"]${a};
    way["natural"~"^(water|wood|scrub|grassland)$"]${a};
    way["waterway"~"^(river|stream|canal)$"]${a};
  );out tags geom;`, 28000);
  } catch (e) { if (!daBase) throw e; aviso = 'Ruas e áreas verdes indisponíveis agora (mapa aberto fora do ar).'; }

  const predios = [], vias = [], verdes = [], agua = [], piscinas = [];
  const linha = (geom) => geom.flatMap((g) => P(g.lat, g.lon));
  for (const e of j.elements || []) {
    const t = e.tags || {};
    let geoms = [];
    if (e.type === 'way' && e.geometry) geoms = [e.geometry];
    else if (e.type === 'relation' && e.members) geoms = e.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry);
    for (const g of geoms) {
      const p = linha(g);
      if (p.length < 4) continue;
      const fechado = g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
      const pf = fechado ? p.slice(0, -2) : p;
      if (t.building && fechado) {
        const ar = areaPoligono(pf);
        if (ar < 8) continue;
        const al = altura(t, ar);
        predios.push({ p: pf, h: Math.round(al.h * 10) / 10, est: al.est, andares: al.andares || null, nome: t.name || null, tipo: t.building, ref: `${e.type}/${e.id}`, ar: Math.round(ar) });
      } else if (t.highway) {
        if (['proposed', 'construction', 'platform', 'elevator', 'corridor'].includes(t.highway)) continue;
        vias.push({ p, l: LARGURA[t.highway] || 5, t: t.highway, nome: t.name || null });
      } else if (t.leisure === 'swimming_pool' && fechado) piscinas.push({ p: pf });
      else if ((t.natural === 'water' || t.waterway) ) agua.push({ p: fechado ? pf : p, linha: !fechado || !!t.waterway, l: t.waterway === 'river' ? 14 : 4 });
      else if (fechado) verdes.push({ p: pf, t: t.leisure || t.landuse || t.natural });
    }
  }
  if (daBase) daBase.forEach((b, i) => predios.push({ p: b.p, h: Math.round(b.h * 10) / 10, est: b.est, censo: b.censo, andares: b.andares, nome: null, tipo: b.h >= 11 ? 'apartments' : 'yes', ref: `b${i}`, ar: Math.round(areaPoligono(b.p)) }));
  return { centro: { lat, lon }, raio, predios, vias, verdes, agua, piscinas, fonte: daBase ? 'base' : 'osm', aviso, gerado: new Date().toISOString() };
}

// Marca os prédios do condomínio e ajusta a altura pelo número de andares cadastrado.
function marcarAlvo(cena, c) {
  const P = projetor(cena.centro.lat, cena.centro.lon);
  const alvos = [];
  let contorno = null;
  try { contorno = c.contorno ? JSON.parse(c.contorno).flatMap(([la, lo]) => P(la, lo)) : null; } catch { contorno = null; }
  const [cx, cy] = c.lat ? P(c.lat, c.lon) : [0, 0];
  for (const b of cena.predios) {
    b.alvo = 0;
    const [x, y] = centroide(b.p);
    if (c.osm_ref && b.ref === c.osm_ref) b.alvo = 1;
    else if (contorno && contorno.length > 4 && contem(contorno, x, y)) b.alvo = 1;
  }
  if (!cena.predios.some((b) => b.alvo) && c.tipo !== 'horizontal') {
    const cand = cena.predios.map((b) => ({ b, d: contem(b.p, cx, cy) ? 0 : Math.hypot(centroide(b.p)[0] - cx, centroide(b.p)[1] - cy) }))
      .filter((x) => x.d <= 45 && x.b.ar >= 120).sort((a, b) => a.d - b.d || b.b.h - a.b.h);
    const n = Math.max(1, Math.min(c.torres || 1, 6));
    cand.slice(0, n).forEach((x) => { x.b.alvo = 1; });
  }
  for (const b of cena.predios) if (b.alvo) alvos.push(b);
  let sintetico = false;
  if (!alvos.length && c.tipo !== 'horizontal') {
    // o mapa não tem o contorno do prédio: desenha uma torre aproximada no ponto do endereço
    const w = 13, d = 10;
    const b = { p: [cx - w, cy - d, cx + w, cy - d, cx + w, cy + d, cx - w, cy + d], h: 36.6, est: 1, nome: c.nome, tipo: 'apartments', ref: null, ar: 4 * w * d, alvo: 1, sintetico: 1 };
    cena.predios.push(b); alvos.push(b); sintetico = true;
  }
  const andares = c.andares || alvos.map((b) => b.andares).find(Boolean) || null;
  if (c.tipo !== 'horizontal') for (const b of alvos) {
    if (andares) { b.h = andares * ALTURA_ANDAR + 3; b.est = 0; b.andares = andares; }
    else if (b.est) { b.andares = Math.max(4, Math.round((b.h - 3) / ALTURA_ANDAR)); }
    else b.andares = b.andares || Math.max(1, Math.round((b.h - 3) / ALTURA_ANDAR));
  }
  cena.alvo = { andares: andares || (alvos[0] && alvos[0].andares) || null, estimado: !andares, sintetico, quantos: alvos.length, alturaAndar: ALTURA_ANDAR, ponto: [cx, cy], contorno };
  return cena;
}

async function cena3d(c, { renovar = false } = {}) {
  if (!c.lat) { const e = new Error('Este condomínio ainda não tem posição no mapa. Ajuste a posição na ficha para ver o 3D.'); e.status = 409; throw e; }
  const raio = c.tipo === 'horizontal' ? 450 : 300;
  const base = await O.comCache(c.id, '3d', renovar ? -1 : 60, () => gerar(c, raio));
  return marcarAlvo(JSON.parse(JSON.stringify(base)), c);
}

module.exports = { cena3d, projetor, ALTURA_ANDAR, _gerar: gerar, _marcarAlvo: marcarAlvo };
