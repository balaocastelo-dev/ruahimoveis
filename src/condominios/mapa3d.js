// Condomínios · ruas, áreas verdes e água de Campinas para o 3D (Overture Maps), em blocos de 0,005° na tabela mapa3d.
// Mesmo formato que o 3D usava do OpenStreetMap ao vivo, sem depender de um serviço de fora na hora de abrir.
const zlib = require('zlib');
const { all } = require('../db');

const PASSO = 0.005;
const cache = new Map();

function bloco(chave, linha) {
  if (cache.has(chave)) return cache.get(chave);
  const v = linha ? JSON.parse(zlib.gunzipSync(Buffer.from(linha.dados)).toString('utf8')) : { v: [], g: [], a: [] };
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(chave, v);
  return v;
}

/** { vias, verdes, agua } num raio em volta de lat/lon (metros locais), ou null se a tabela estiver vazia. */
function mapaNoRaio(lat, lon, raio, projetar) {
  const dLat = raio / 110540, dLon = raio / (Math.cos((lat * Math.PI) / 180) * 111320);
  const y0 = Math.floor((lat - dLat) / PASSO), y1 = Math.floor((lat + dLat) / PASSO);
  const x0 = Math.floor((lon - dLon) / PASSO), x1 = Math.floor((lon + dLon) / PASSO);
  const chaves = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) chaves.push(`${y}_${x}`);
  const faltam = chaves.filter((k) => !cache.has(k));
  const linhas = faltam.length ? all(`SELECT tile, dados FROM mapa3d WHERE tile IN (${faltam.map(() => '?').join(',')})`, ...faltam) : [];
  if (faltam.length === chaves.length && !linhas.length) return null;
  const porChave = new Map(linhas.map((l) => [l.tile, l]));
  const vias = [], verdes = [], agua = [];
  const R2 = (raio * 1.3) ** 2;
  for (const k of chaves) {
    const [ty, tx] = k.split('_').map(Number);
    const cy = (ty + 0.5) * PASSO, cx = (tx + 0.5) * PASSO;
    const kx = Math.cos((cy * Math.PI) / 180) * 111320;
    const conv = (q) => { const p = []; let perto = false; for (let i = 0; i < q.length; i += 2) { const [x, y] = projetar(cy + q[i + 1] / 10 / 110540, cx + q[i] / 10 / kx); p.push(x, y); if (!perto && x * x + y * y < R2) perto = true; } return perto ? p : null; };
    const b = bloco(k, porChave.get(k));
    for (const [, l, t, nome, q] of b.v) { const p = conv(q); if (p) vias.push({ p, l, t, nome }); }
    for (const [, t, q] of b.g) { const p = conv(q); if (p && p.length >= 6) verdes.push({ p: p.slice(0, -2), t }); }
    for (const [, , q, linha] of b.a) { const p = conv(q); if (p) agua.push(linha ? { p, linha: true, l: 6 } : { p: p.slice(0, -2) }); }
  }
  return { vias, verdes, agua };
}

module.exports = { mapaNoRaio };
