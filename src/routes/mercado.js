// Mercado: os imóveis à venda em Campinas que já estão na base (Fisguei), navegando por Bairro → Rua → Imóvel.
// A ficha de cada imóvel é a do Fisguei, com a fachada (Street View) e o 3D da rua.
const express = require('express');
const { one, all, run } = require('../db');
const { falha, int } = require('../util');
const G = require('../condominios/geo');
const { cena3d } = require('../condominios/cena3d');

const r = express.Router();
const FORA = "('descartado')";

function base(q) {
  const w = [`a.status NOT IN ${FORA}`, "lower(coalesce(a.cidade,'campinas')) LIKE 'campinas%'"], p = [];
  const min = q.min === undefined ? 1000000 : Number(q.min) || 0;
  if (min) { w.push('a.valor >= ?'); p.push(min); }
  const max = Number(q.max) || 0; if (max) { w.push('a.valor <= ?'); p.push(max); }
  if (q.tipo) { w.push('a.tipo LIKE ?'); p.push(`%${String(q.tipo).slice(0, 30)}%`); }
  if (q.quartos) { w.push('a.quartos >= ?'); p.push(int(q.quartos)); }
  if (q.particular === '1') w.push("a.anunciante_tipo='particular'");
  return { w: w.join(' AND '), p };
}
const med = (l) => { const s = l.filter((x) => x > 0).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// agrupa variações de grafia ("Cambuí", "CAMBUI") e mostra a mais comum
function agrupa(linhas, campo) {
  const g = new Map();
  for (const x of linhas) {
    const k = G.chave(x[campo]) || '—';
    if (!g.has(k)) g.set(k, { chave: k, nomes: {}, itens: [] });
    const o = g.get(k); o.itens.push(x); o.nomes[x[campo] || 'Sem nome'] = (o.nomes[x[campo] || 'Sem nome'] || 0) + 1;
  }
  return [...g.values()].map((o) => {
    const v = o.itens.map((x) => x.valor), m2 = o.itens.filter((x) => x.valor && x.area_util > 20).map((x) => x.valor / x.area_util);
    const geo = o.itens.filter((x) => x.lat);
    return { chave: o.chave, nome: Object.entries(o.nomes).sort((a, b) => b[1] - a[1])[0][0], n: o.itens.length, mediana: med(v), m2: med(m2) && Math.round(med(m2)),
      min: Math.min(...v.filter(Boolean)), max: Math.max(...v.filter(Boolean)), particulares: o.itens.filter((x) => x.anunciante_tipo === 'particular').length,
      lat: geo.length ? geo.reduce((s, x) => s + x.lat, 0) / geo.length : null, lon: geo.length ? geo.reduce((s, x) => s + x.lon, 0) / geo.length : null };
  });
}
const COLS = 'a.id, a.tipo, a.logradouro, a.numero, a.complemento, a.bairro, a.valor, a.quartos, a.suites, a.vagas, a.area_util, a.lat, a.lon, a.anunciante_tipo, a.anunciante_nome, a.status, a.fotos, a.condominio_id, a.publicado_em';
const cartao = (x) => { let f = null; try { f = (JSON.parse(x.fotos || '[]') || [])[0] || null; } catch {} const { fotos, ...y } = x; return { ...y, foto: f, ref: 'FG-' + String(x.id).padStart(5, '0') }; };

r.get('/mercado/resumo', (req, res) => {
  const { w, p } = base(req.query);
  const l = all(`SELECT a.valor, a.area_util, a.anunciante_tipo, a.bairro, a.lat, a.lon FROM fisguei_anuncios a WHERE ${w}`, ...p);
  const bairros = agrupa(l, 'bairro').sort((a, b) => b.n - a.n);
  const total = one('SELECT count(*) n FROM fisguei_anuncios').n;
  res.json({ total: l.length, base: total, mediana: med(l.map((x) => x.valor)), particulares: l.filter((x) => x.anunciante_tipo === 'particular').length, bairros });
});
r.get('/mercado/ruas', (req, res) => {
  const { w, p } = base(req.query);
  const k = G.chave(req.query.bairro || '');
  const l = all(`SELECT a.valor, a.area_util, a.anunciante_tipo, a.bairro, a.logradouro, a.lat, a.lon FROM fisguei_anuncios a WHERE ${w}`, ...p).filter((x) => G.chave(x.bairro) === k);
  res.json(agrupa(l, 'logradouro').sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)));
});
r.get('/mercado/imoveis', (req, res) => {
  const { w, p } = base(req.query);
  const kb = G.chave(req.query.bairro || ''), kr = G.chave(req.query.rua || '');
  let l = all(`SELECT ${COLS} FROM fisguei_anuncios a WHERE ${w} ORDER BY a.valor DESC LIMIT 4000`, ...p);
  if (kb) l = l.filter((x) => G.chave(x.bairro) === kb);
  if (kr) l = l.filter((x) => G.chave(x.logradouro) === kr);
  l.sort((a, b) => (parseInt(a.numero, 10) || 0) - (parseInt(b.numero, 10) || 0) || (b.valor || 0) - (a.valor || 0));
  res.json(l.slice(0, 600).map(cartao));
});
r.get('/mercado/mapa', (req, res) => {
  const { w, p } = base(req.query);
  res.json(all(`SELECT a.id, a.lat, a.lon, a.valor, a.tipo, a.bairro, a.logradouro, a.numero, a.anunciante_tipo FROM fisguei_anuncios a WHERE ${w} AND a.lat IS NOT NULL LIMIT 6000`, ...p)
    .map((x) => [x.id, Math.round(x.lat * 1e5) / 1e5, Math.round(x.lon * 1e5) / 1e5, Math.round((x.valor || 0) / 1000), x.anunciante_tipo === 'particular' ? 1 : 0, `${x.tipo || 'Imóvel'} · ${[x.logradouro, x.numero].filter(Boolean).join(', ')}`]));
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
