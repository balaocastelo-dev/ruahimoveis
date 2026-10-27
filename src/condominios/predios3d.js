// Condomínios · contornos dos prédios de Campinas para o 3D (Overture Maps: Google, Microsoft e OSM),
// com altura pelo Censo 2022 (IBGE CNEFE) onde há apartamentos. Guardados em blocos de 0,005° na tabela predios3d.
const zlib = require('zlib');
const { all } = require('../db');

const PASSO = 0.005;
const cache = new Map();

function decodifica(buf, ty, tx) {
  const b = zlib.gunzipSync(buf);
  const cy = (ty + 0.5) * PASSO, cx = (tx + 0.5) * PASSO;
  const kx = Math.cos((cy * Math.PI) / 180) * 111320;
  const n = b.readUInt32LE(0); let o = 4;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const nv = b.readUInt16LE(o), h = b.readUInt16LE(o + 2) / 2, andares = b.readUInt8(o + 4), flag = b.readUInt8(o + 5); o += 6;
    const ll = new Float64Array(nv * 2);
    for (let k = 0; k < nv; k++) { ll[k * 2] = cx + b.readInt16LE(o) / 10 / kx; ll[k * 2 + 1] = cy + b.readInt16LE(o + 2) / 10 / 110540; o += 4; }
    out[i] = { ll, h, andares, est: flag & 1 ? 1 : 0, censo: flag & 2 ? 1 : 0 };
  }
  return out;
}

function bloco(ty, tx, linha) {
  const k = `${ty}_${tx}`;
  if (cache.has(k)) return cache.get(k);
  const v = linha ? decodifica(Buffer.from(linha.dados), ty, tx) : [];
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}

/** Prédios num raio (m) em volta de lat/lon, já em metros locais. Devolve null se a tabela estiver vazia. */
function prediosNoRaio(lat, lon, raio, projetar) {
  const dLat = raio / 110540, dLon = raio / (Math.cos((lat * Math.PI) / 180) * 111320);
  const y0 = Math.floor((lat - dLat) / PASSO), y1 = Math.floor((lat + dLat) / PASSO);
  const x0 = Math.floor((lon - dLon) / PASSO), x1 = Math.floor((lon + dLon) / PASSO);
  const chaves = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) chaves.push(`${y}_${x}`);
  const faltam = chaves.filter((k) => !cache.has(k));
  const linhas = faltam.length ? all(`SELECT tile, dados FROM predios3d WHERE tile IN (${faltam.map(() => '?').join(',')})`, ...faltam) : [];
  if (faltam.length === chaves.length && !linhas.length) return null;
  const porChave = new Map(linhas.map((l) => [l.tile, l]));
  const out = [];
  for (const k of chaves) {
    const [ty, tx] = k.split('_').map(Number);
    for (const p of bloco(ty, tx, porChave.get(k))) {
      const pts = [];
      let dentro = false;
      for (let i = 0; i < p.ll.length; i += 2) {
        const [x, y] = projetar(p.ll[i + 1], p.ll[i]);
        pts.push(x, y);
        if (!dentro && x * x + y * y <= raio * raio) dentro = true;
      }
      if (dentro) out.push({ p: pts, h: p.h, andares: p.andares || null, est: p.est, censo: p.censo });
    }
  }
  return out;
}

module.exports = { prediosNoRaio, PASSO, _decodifica: decodifica };
