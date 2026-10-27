// Mercado: os imóveis à venda em Campinas que já estão na base (Fisguei), navegando por Bairro → Rua → Imóvel.
// A ficha de cada imóvel é a do Fisguei, com a fachada (Street View) e o 3D da rua.
const express = require('express');
const { one, all, run } = require('../db');
const { falha, int } = require('../util');
const G = require('../condominios/geo');
const { cena3d } = require('../condominios/cena3d');

const r = express.Router();
const FORA = "('descartado')";

// ---------- as quatro vitrines: Apartamentos, Casas, Terrenos e Salas comerciais / barracões ----------
// A categoria sai do tipo do anúncio e da finalidade que o portal informa (Residencial/Comercial).
const CATS = {
  apartamentos: { nome: 'Apartamentos', min: 0 },
  casas: { nome: 'Casas', min: 1000000 },
  terrenos: { nome: 'Terrenos', min: 1000000 },
  comerciais: { nome: 'Salas comerciais e barracões', min: 1000000 },
};
const sem = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function categoria(x) {
  const t = sem(x.tipo), f = sem(x.finalidade);
  if (/terreno|lote|\barea\b/.test(t)) return 'terrenos';
  if (/galp|barrac|loja|sala|comercial|predio|ponto|hotel|industrial|armaz|deposito|escritorio|conjunto/.test(t) || f === 'comercial') return 'comerciais';
  if (/apart|cobertura|flat|studio|kitnet|loft|duplex|triplex/.test(t)) return 'apartamentos';
  return 'casas';
}
function subtipo(x, cat = categoria(x)) {
  const t = sem(x.tipo), f = sem(x.finalidade);
  if (cat === 'terrenos') return /condom/.test(t + sem(x.titulo)) ? 'Terreno em condomínio' : f === 'comercial' ? 'Terreno comercial' : 'Terreno residencial';
  if (cat === 'comerciais') return /galp|barrac|armaz|deposito|industrial/.test(t) ? 'Galpão / barracão' : /sala|escritorio|conjunto/.test(t) ? 'Sala comercial'
    : /loja|ponto/.test(t) ? 'Loja / ponto' : /predio|hotel/.test(t) ? 'Prédio comercial' : /casa|sobrado/.test(t) ? 'Casa comercial' : 'Outros comerciais';
  if (cat === 'apartamentos') return /cobertura/.test(t) ? 'Cobertura' : 'Apartamento';
  return /condom/.test(t) ? 'Casa em condomínio' : /sobrado/.test(t) ? 'Sobrado' : /chacara|sitio/.test(t) ? 'Chácara' : 'Casa';
}
// metragem que importa em cada vitrine: terreno pela área total, o resto pela área útil
const area = (x, cat) => (cat === 'terrenos' ? x.area_total || x.area_util : x.area_util || x.area_total) || null;
const catDe = (q) => (CATS[q.cat] ? q.cat : null);

function base(q) {
  const w = [`a.status NOT IN ${FORA}`, "lower(coalesce(a.cidade,'campinas')) LIKE 'campinas%'"], p = [];
  const cat = catDe(q);
  const min = q.min === undefined ? (cat ? CATS[cat].min : 1000000) : Number(q.min) || 0;
  if (min) { w.push('a.valor >= ?'); p.push(min); }
  const max = Number(q.max) || 0; if (max) { w.push('a.valor <= ?'); p.push(max); }
  if (q.tipo) { w.push('a.tipo LIKE ?'); p.push(`%${String(q.tipo).slice(0, 30)}%`); }
  if (q.quartos && cat !== 'terrenos' && cat !== 'comerciais') { w.push('a.quartos >= ?'); p.push(int(q.quartos)); }
  if (q.particular === '1') w.push("a.anunciante_tipo='particular'");
  return { w: w.join(' AND '), p };
}
// ---------- o Radar também abastece as vitrines ----------
// Oportunidades que vieram dos portais (Chaves na Mão, alertas de e-mail) e ainda não estão no Fisguei. Mesmo formato das
// linhas do Fisguei; o id fica negativo (-id da oportunidade) para não colidir, e origem='op' leva o cartão para o Radar.
// A posição no mapa vem do condomínio ligado. Filtros aplicados aqui (são poucas linhas).
function doRadar(q) {
  const cat = catDe(q);
  const min = q.min === undefined || q.min === '' ? (cat ? CATS[cat].min : 1000000) : Number(q.min) || 0;
  const max = Number(q.max) || 0, qt = cat === 'terrenos' || cat === 'comerciais' ? 0 : int(q.quartos || 0);
  const tipo = q.tipo ? sem(String(q.tipo).slice(0, 30)) : '';
  return all(`SELECT -o.id AS id, o.id AS oid, 'op' AS origem, o.tipo, NULL AS finalidade, o.titulo, o.logradouro, o.numero, o.unidade AS complemento, o.bairro,
      o.valor, o.quartos, NULL AS suites, o.vagas, o.area AS area_util, NULL AS area_total, c.lat, c.lon, o.anunciante_tipo, o.anunciante_nome, o.status,
      o.foto AS fotos, o.condominio_id, coalesce(o.publicado_em, substr(o.criado_em,1,10)) AS publicado_em, o.portal
    FROM oportunidades o LEFT JOIN condominios c ON c.id=o.condominio_id
    WHERE o.status <> 'descartada' AND lower(coalesce(o.cidade,'campinas')) LIKE 'campinas%'
      AND NOT EXISTS (SELECT 1 FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id)`)
    .filter((x) => (x.valor || 0) >= min && (!max || x.valor <= max) && (!qt || (x.quartos || 0) >= qt) && (!tipo || sem(x.tipo).includes(tipo))
      && (q.particular !== '1' || x.anunciante_tipo === 'particular'));
}
const comRadar = (linhas, q) => [...linhas, ...doRadar(q)];
const fotosDe = (f) => { if (!f) return []; if (String(f).trim().startsWith('[')) { try { return JSON.parse(f) || []; } catch { return []; } } return [f]; };

// filtra pela vitrine (e pelo subtipo) e põe a metragem certa em area_util para as contas de R$/m²
function naVitrine(linhas, q) {
  const cat = catDe(q); if (!cat) return linhas;
  const sub = String(q.sub || '');
  return linhas.filter((x) => categoria(x) === cat && (!sub || subtipo(x, cat) === sub)).map((x) => ({ ...x, area_util: area(x, cat), subtipo: subtipo(x, cat) }));
}
// foto de capa de cada bairro/rua: entre os imóveis mais valiosos do grupo, o anúncio com mais fotos
// (anúncio caprichado costuma abrir com a fachada ou a sala, não com propaganda). Uma consulta só para todos.
function capas(grupos) {
  const todos = [...new Set(grupos.flatMap((g) => g.tops || []))];
  const fotos = new Map();
  for (const [tab, col, ids] of [['fisguei_anuncios', 'fotos', todos.filter((i) => i > 0)], ['oportunidades', 'foto', todos.filter((i) => i < 0).map((i) => -i)]]) {
    for (let i = 0; i < ids.length; i += 400) {
      const parte = ids.slice(i, i + 400);
      for (const x of all(`SELECT id, ${col} f FROM ${tab} WHERE id IN (${parte.map(() => '?').join(',')})`, ...parte)) {
        const f = fotosDe(x.f); if (f[0]) fotos.set(tab === 'oportunidades' ? -x.id : x.id, f);
      }
    }
  }
  return grupos.map(({ tops = [], ...g }) => {
    const melhor = tops.filter((id) => fotos.has(id)).sort((a, b) => fotos.get(b).length - fotos.get(a).length)[0];
    return { ...g, foto: melhor ? fotos.get(melhor)[0] : null };
  });
}
const med = (l) => { const s = l.filter((x) => x > 0).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// agrupa variações de grafia ("Cambuí", "CAMBUI") e mostra a mais comum
function agrupa(linhas, campo, kf = G.chave) {
  const g = new Map();
  for (const x of linhas) {
    const k = kf(x[campo]) || '—';
    if (!g.has(k)) g.set(k, { chave: k, nomes: {}, itens: [] });
    const o = g.get(k); o.itens.push(x); for (const y of x.iguais || [x]) o.nomes[y[campo] || 'Sem nome'] = (o.nomes[y[campo] || 'Sem nome'] || 0) + 1;
  }
  return [...g.values()].map((o) => {
    const v = o.itens.map((x) => x.valor), m2 = o.itens.filter((x) => x.valor && x.area_util > 20).map((x) => x.valor / x.area_util);
    const geo = o.itens.filter((x) => x.lat);
    const tops = [...o.itens].sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 4).map((x) => x.id);
    return { chave: o.chave, tops, nome: Object.entries(o.nomes).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0], n: o.itens.length, mediana: med(v), m2: med(m2) && Math.round(med(m2)),
      min: Math.min(...v.filter(Boolean)), max: Math.max(...v.filter(Boolean)), particulares: o.itens.filter((x) => x.anunciante_tipo === 'particular').length,
      lat: geo.length ? geo.reduce((s, x) => s + x.lat, 0) / geo.length : null, lon: geo.length ? geo.reduce((s, x) => s + x.lon, 0) / geo.length : null };
  });
}
// ---------- o mesmo imóvel anunciado várias vezes (outro portal, outra imobiliária, republicado com preço novo) ----------
// Junta num cartão só: mesma rua e número, mesma família de tipo e mesma metragem (±2%) e quartos;
// sem metragem, só junta se o preço também for igual (lotes diferentes no mesmo endereço continuam separados).
const familia = (t) => (/apart|cobertura|flat|studio|kitnet|loft|duplex|triplex/i.test(t || '') ? 'ap' : /terreno|lote|[áa]rea/i.test(t || '') ? 'te' : /casa|sobrado|ch[áa]cara|s[íi]tio/i.test(t || '') ? 'ca' : 'ou');
const TIPO_RUA = /^(RUA|R|AVENIDA|AV|AVN|ALAMEDA|AL|TRAVESSA|TV|ESTRADA|EST|RODOVIA|ROD|PRACA|PC|LARGO|VIA|VIELA)\b\s*/;
const ruaChave = (s) => G.nucleo(s).replace(TIPO_RUA, '').trim();
function mesmo(a, b) {
  if (a.area_util > 0 && b.area_util > 0) {
    if (Math.abs(a.area_util - b.area_util) > Math.max(2, 0.02 * Math.max(a.area_util, b.area_util))) return false;
    return !a.quartos || !b.quartos || a.quartos === b.quartos || a.valor === b.valor;
  }
  return a.valor === b.valor;
}
const recente = (a, b) => String(b.publicado_em || '').localeCompare(String(a.publicado_em || '')) || (a.valor || 0) - (b.valor || 0) || a.id - b.id;
function unicos(linhas) {
  const baldes = new Map(), out = [];
  for (const x of [...linhas].sort(recente)) {
    const num = G.numero(x.numero);
    if (!num || num === '0' || !x.logradouro) { out.push({ ...x, iguais: [x] }); continue; }
    const k = `${ruaChave(x.logradouro)}|${num}|${familia(x.tipo)}`;
    if (!baldes.has(k)) baldes.set(k, []);
    const gs = baldes.get(k), g = gs.find((y) => mesmo(y, x));
    if (g) g.iguais.push(x); else { const n = { ...x, iguais: [x] }; gs.push(n); out.push(n); }
  }
  for (const g of out) {
    const v = g.iguais.map((y) => y.valor).filter(Boolean);
    g.anuncios = g.iguais.length; g.valor_min = Math.min(...v); g.valor_max = Math.max(...v);
    if (g.iguais.some((y) => y.anunciante_tipo === 'particular')) g.anunciante_tipo = 'particular';
    g.anunciantes = [...new Set(g.iguais.map((y) => (y.anunciante_nome || '').trim()).filter(Boolean))].length;
  }
  return out;
}
const CHAVE = 'a.id, a.tipo, a.finalidade, a.titulo, a.logradouro, a.numero, a.area_util, a.area_total, a.quartos, a.valor, a.publicado_em, a.anunciante_tipo, a.anunciante_nome';

const COLS = 'a.id, a.tipo, a.finalidade, a.titulo, a.area_total, a.logradouro, a.numero, a.complemento, a.bairro, a.valor, a.quartos, a.suites, a.vagas, a.area_util, a.lat, a.lon, a.anunciante_tipo, a.anunciante_nome, a.status, a.fotos, a.condominio_id, a.publicado_em';
const refDe = (x) => (x.origem === 'op' ? 'OP-' + String(x.oid).padStart(4, '0') : 'FG-' + String(x.id).padStart(5, '0'));
const hrefDe = (x) => (x.origem === 'op' ? `#/radar/${x.oid}` : `#/fisguei/${x.id}`);
const cartao = (x) => {
  // foto: a do próprio anúncio; se não tiver, a de outro anúncio do mesmo imóvel
  const f = [x, ...(x.iguais || [])].map((y) => fotosDe(y.fotos)[0]).find(Boolean) || null;
  const { fotos, iguais, ...y } = x;
  return { ...y, origem: x.origem || 'fg', foto: f, ref: refDe(x), href: hrefDe(x),
    outros: (iguais || []).slice(1).map((o) => ({ id: o.id, ref: refDe(o), href: hrefDe(o), valor: o.valor, anunciante: o.anunciante_nome, portal: o.portal, publicado_em: o.publicado_em })) };
};

// ---------- base das vitrines em memória ----------
// Uma leitura só de todos os anúncios de Campinas (Fisguei + Radar, sem as fotos) fica guardada por 3 minutos;
// resumo, ruas, imóveis e mapa filtram em memória. Com dezenas de milhares de anúncios, reler o banco a cada clique
// deixava a tela lenta (principalmente na Vercel, onde cada consulta é uma ida ao banco online).
const BASE_MS = Number(process.env.MERCADO_CACHE_S ?? 180) * 1000;
let BASE = null;
function baseVitrine() {
  if (BASE && Date.now() - BASE.em < BASE_MS) return BASE.linhas;
  const b0 = base({ min: '0' });
  const linhas = comRadar(all(`SELECT ${CHAVE}, a.bairro, a.lat, a.lon FROM fisguei_anuncios a WHERE ${b0.w}`, ...b0.p), { min: '0' });
  for (const x of linhas) { x._cat = categoria(x); x._bairro = G.chave(x.bairro); x._rua = ruaChave(x.logradouro); }
  BASE = { em: Date.now(), linhas, memo: new Map() };
  return linhas;
}
// chegou anúncio: a base é relida em até 30 s (numa puxada do Fisgar chega página a cada poucos segundos)
const esqueceBase = () => { if (BASE) BASE.em = Math.min(BASE.em, Date.now() - BASE_MS + 30000); };
// respostas prontas, guardadas enquanto a base não muda
function memo(req, fn) {
  baseVitrine();
  const k = req.path + '?' + new URLSearchParams(req.query).toString();
  const m = BASE.memo;
  if (m.has(k)) return m.get(k);
  const v = fn();
  if (BASE_MS > 0) { if (m.size > 300) m.clear(); m.set(k, v); }
  return v;
}
// os filtros da tela (valor mínimo e máximo, quartos, tipo, só particular), aplicados em memória
function filtra(linhas, q, cat = catDe(q)) {
  const min = q.min !== undefined && q.min !== '' ? Number(q.min) || 0 : cat ? CATS[cat].min : 1000000;
  const max = Number(q.max) || 0, qt = cat === 'terrenos' || cat === 'comerciais' ? 0 : int(q.quartos || 0);
  const tipo = q.tipo ? sem(String(q.tipo).slice(0, 30)) : '', part = q.particular === '1';
  return linhas.filter((x) => (!cat || x._cat === cat) && (x.valor || 0) >= min && (!max || x.valor <= max) && (!qt || (x.quartos || 0) >= qt)
    && (!tipo || sem(x.tipo).includes(tipo)) && (!part || x.anunciante_tipo === 'particular'));
}

r.get('/mercado/resumo', (req, res) => res.json(memo(req, () => resumo(req))));
function resumo(req) {
  const cat = catDe(req.query);
  const tudo = baseVitrine();
  const categorias = {};
  for (const k of Object.keys(CATS)) categorias[k] = { nome: CATS[k].nome, n: unicos(filtra(tudo, { min: req.query.min, particular: req.query.particular }, k)).length };
  const brutos = filtra(tudo, { ...req.query, cat: '' }, cat);
  const daCat = naVitrine(brutos, { ...req.query, sub: '' });
  const subtipos = Object.entries(daCat.reduce((m, x) => { if (x.subtipo) m[x.subtipo] = (m[x.subtipo] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }));
  const todos = naVitrine(brutos, req.query);
  const l = unicos(todos);
  const bairros = capas(agrupa(l, 'bairro').sort((a, b) => b.n - a.n));
  const total = tudo.length;
  const doRadarN = l.filter((x) => x.origem === 'op').length;
  const m2 = l.filter((x) => x.valor && x.area_util > 20).map((x) => x.valor / x.area_util);
  return { cat, categorias, subtipos, total: l.length, doRadar: doRadarN, anuncios: todos.length, repetidos: todos.length - l.length, base: total, mediana: med(l.map((x) => x.valor)), m2: med(m2) && Math.round(med(m2)),
    area: med(l.map((x) => x.area_util || 0)), particulares: l.filter((x) => x.anunciante_tipo === 'particular').length, bairros };
}
r.get('/mercado/ruas', (req, res) => res.json(memo(req, () => {
  const k = G.chave(req.query.bairro || '');
  const l = unicos(naVitrine(filtra(baseVitrine(), req.query).filter((x) => x._bairro === k), req.query));
  return capas(agrupa(l, 'logradouro', ruaChave).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)));
})));
r.get('/mercado/imoveis', (req, res) => {
  const kb = G.chave(req.query.bairro || ''), kr = ruaChave(req.query.rua || '');
  let sel = filtra(baseVitrine(), req.query);
  if (kb) sel = sel.filter((x) => x._bairro === kb);
  if (kr) sel = sel.filter((x) => x._rua === kr);
  sel = sel.slice(0, 3000);
  // dados completos (fotos, complemento, vagas…) só dos imóveis desta rua
  const fg = sel.filter((x) => x.id > 0).map((x) => x.id), op = new Map(sel.filter((x) => x.id < 0).map((x) => [x.id, x]));
  const cheios = [];
  for (let i = 0; i < fg.length; i += 400) { const parte = fg.slice(i, i + 400); cheios.push(...all(`SELECT ${COLS}, a.portal FROM fisguei_anuncios a WHERE a.id IN (${parte.map(() => '?').join(',')})`, ...parte)); }
  if (op.size) cheios.push(...doRadar({ min: '0' }).filter((x) => op.has(x.id)));
  const l = unicos(naVitrine(cheios, req.query));
  l.sort((a, b) => (parseInt(a.numero, 10) || 0) - (parseInt(b.numero, 10) || 0) || (b.valor || 0) - (a.valor || 0));
  res.json(l.slice(0, 600).map(cartao));
});
r.get('/mercado/mapa', (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.json(memo(req, () => unicos(naVitrine(filtra(baseVitrine(), req.query).filter((x) => x.lat != null), req.query))
    .map((x) => [x.id, Math.round(x.lat * 1e5) / 1e5, Math.round(x.lon * 1e5) / 1e5, Math.round((x.valor || 0) / 1000), x.anunciante_tipo === 'particular' ? 1 : 0, `${x.subtipo || x.tipo || 'Imóvel'} · ${[x.logradouro, x.numero].filter(Boolean).join(', ')}`])));
});

// 3D da rua de um imóvel do Fisguei: o mesmo 3D dos condomínios, centrado no imóvel.
r.get('/mercado/3d/:id', async (req, res) => {
  const a = one('SELECT id, tipo, logradouro, numero, complemento, bairro, lat, lon, condominio_id, valor, area_util, quartos FROM fisguei_anuncios WHERE id=?', int(req.params.id));
  if (!a) falha(404, 'Imóvel não encontrado.');
  const c = a.condominio_id ? one('SELECT * FROM condominios WHERE id=?', a.condominio_id) : null;
  const lat = a.lat || (c && c.lat), lon = a.lon || (c && c.lon);
  if (!lat) falha(409, 'Este imóvel ainda não tem posição no mapa.');
  const casa = /casa|sobrado|ch[áa]cara|terreno/i.test(a.tipo || '');
  const ponto = c ? c : { id: null, nome: a.complemento || `${a.tipo || 'Imóvel'} na ${a.logradouro || ''}${a.numero ? ', ' + a.numero : ''}`, lat, lon, tipo: casa ? 'horizontal-ponto' : 'vertical' };
  const cena = await cena3d(ponto, { semCache: !c });
  res.json({
    condominio: { id: c ? c.id : null, nome: c ? c.nome : ponto.nome, tipo: c ? c.tipo : (casa ? 'casa' : 'vertical'), andares: c && c.andares, torres: c && c.torres, unidades: c && c.unidades,
      logradouro: a.logradouro, numero: a.numero, bairro: a.bairro, geo_fonte: c ? c.geo_fonte : 'anuncio' },
    cena, imovel: { id: a.id, codigo: 'FG-' + String(a.id).padStart(5, '0'), tipo: a.tipo, unidade: null, andar: null, valor: a.valor }, unidades: [],
  });
});

// Os outros anúncios do mesmo imóvel (para a ficha do Fisguei)
r.get('/mercado/iguais/:id', (req, res) => {
  const a = one(`SELECT ${CHAVE.replace(/a\./g, '')}, portal FROM fisguei_anuncios WHERE id=?`, int(req.params.id));
  if (!a || !a.logradouro || !G.numero(a.numero)) return res.json([]);
  const l = all(`SELECT ${CHAVE}, a.portal, a.status FROM fisguei_anuncios a WHERE a.numero=? AND a.id<>? AND a.status NOT IN ${FORA}`, a.numero, a.id)
    .filter((x) => ruaChave(x.logradouro) === ruaChave(a.logradouro) && familia(x.tipo) === familia(a.tipo) && mesmo(a, x));
  res.json(l.sort(recente).map((o) => ({ id: o.id, valor: o.valor, anunciante: o.anunciante_nome, anunciante_tipo: o.anunciante_tipo, portal: o.portal, publicado_em: o.publicado_em })));
});

r.get('/mercado/perto/:id', async (req, res) => {
  const a = one('SELECT lat, lon FROM fisguei_anuncios WHERE id=?', int(req.params.id));
  if (!a || !a.lat) return res.json({ categorias: [] });
  const { doBanco } = require('../condominios/perto');
  res.json(doBanco(a.lat, a.lon) || { categorias: [] });
});

// Foto da fachada (Google Street View Static). Só com GOOGLE_MAPS_KEY; cada endereço é pago uma vez e fica guardado.
r.get('/fachada', async (req, res) => {
  const ref = String(req.query.ref || '');
  let lat, lon;
  const m = ref.match(/^(fg|cd)(\d+)$/);
  if (m && m[1] === 'fg') ({ lat, lon } = one('SELECT lat, lon FROM fisguei_anuncios WHERE id=?', +m[2]) || {});
  else if (m) ({ lat, lon } = one('SELECT lat, lon FROM condominios WHERE id=?', +m[2]) || {});
  if (!lat) return res.status(404).json({ erro: 'Sem posição.' });
  const img = await require('../condominios/fachada').foto(ref, lat, lon);
  if (!img) return res.status(404).json({ erro: 'Sem foto de fachada.' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.end(img);
});

r.get('/mapas/config', (req, res) => { const f = require('../condominios/fachada'); res.json({ fachada: f.ligado(), google3d: f.ligado() }); });

module.exports = r;
module.exports.unicos = unicos;
module.exports.esqueceBase = esqueceBase;
module.exports.categoria = categoria;
module.exports.subtipo = subtipo;
