// Condomínios · o que tem perto (escolas, mercados, parques, saúde, transporte…), do OpenStreetMap.
const O = require('./overpass');
const { distancia } = require('./geo');

const CATEGORIAS = [
  { id: 'escolas', nome: 'Escolas', icone: '🎓', filtro: (t) => ['school', 'kindergarten', 'college', 'university'].includes(t.amenity) },
  { id: 'mercados', nome: 'Mercados e padarias', icone: '🛒', filtro: (t) => ['supermarket', 'convenience', 'bakery', 'greengrocer', 'butcher'].includes(t.shop) },
  { id: 'saude', nome: 'Saúde', icone: '🏥', filtro: (t) => ['hospital', 'clinic', 'pharmacy', 'doctors'].includes(t.amenity) },
  { id: 'parques', nome: 'Parques e esporte', icone: '🌳', filtro: (t) => ['park', 'sports_centre', 'fitness_centre', 'garden', 'nature_reserve'].includes(t.leisure) },
  { id: 'comer', nome: 'Restaurantes e cafés', icone: '🍽️', filtro: (t) => ['restaurant', 'cafe', 'ice_cream'].includes(t.amenity) },
  { id: 'compras', nome: 'Shoppings', icone: '🛍️', filtro: (t) => t.shop === 'mall' || t.shop === 'department_store' },
  { id: 'transporte', nome: 'Transporte', icone: '🚌', filtro: (t) => t.highway === 'bus_stop' || t.amenity === 'bus_station' || t.railway === 'station' },
  { id: 'servicos', nome: 'Bancos e serviços', icone: '🏦', filtro: (t) => ['bank', 'post_office', 'fuel'].includes(t.amenity) },
];

async function gerar(lat, lon, raio = 1200) {
  const a = `(around:${raio},${lat},${lon})`;
  const j = await O.overpass(`[out:json][timeout:25];(
    nwr["amenity"~"^(school|kindergarten|college|university|hospital|clinic|pharmacy|doctors|restaurant|cafe|ice_cream|bus_station|bank|post_office|fuel)$"]${a};
    nwr["shop"~"^(supermarket|convenience|bakery|greengrocer|butcher|mall|department_store)$"]${a};
    nwr["leisure"~"^(park|sports_centre|fitness_centre|garden|nature_reserve)$"]${a};
    node["highway"="bus_stop"](around:500,${lat},${lon});
    nwr["railway"="station"]${a};
  );out tags center;`);
  const out = CATEGORIAS.map((c) => ({ id: c.id, nome: c.nome, icone: c.icone, total: 0, itens: [] }));
  for (const e of j.elements || []) {
    const t = e.tags || {}; const p = e.center || e;
    if (!p.lat) continue;
    const i = CATEGORIAS.findIndex((c) => c.filtro(t));
    if (i < 0) continue;
    const m = Math.round(distancia(lat, lon, p.lat, p.lon));
    out[i].total++;
    if (!t.name && out[i].id !== 'transporte') continue;
    out[i].itens.push({ nome: t.name || 'Ponto de ônibus', m, min: Math.max(1, Math.round(m / 80)), lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5, tipo: t.amenity || t.shop || t.leisure || t.highway || t.railway });
  }
  for (const c of out) {
    const vistos = new Set();
    c.itens = c.itens.sort((a, b) => a.m - b.m).filter((x) => (vistos.has(x.nome) ? false : vistos.add(x.nome))).slice(0, c.id === 'transporte' ? 3 : 6);
  }
  return { raio, categorias: out, fonte: 'OpenStreetMap (colaborativo; pode faltar algum lugar)' };
}

const perto = (c) => (c.lat ? O.comCache(c.id, 'perto', 30, () => gerar(c.lat, c.lon)) : null);

module.exports = { perto, CATEGORIAS };
