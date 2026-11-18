// A capa do blog fica no ramo de conteúdo. O navegador do visitante não busca esse
// ramo: a página aponta para /blog/capa/<arquivo> e o servidor entrega a imagem.
// Sem capa, ou se a imagem for a sala que saiu do ar, entra um retângulo neutro.
const { ramoDoBlog, ENDERECO_DO_BANCO, ENDERECO_DO_RAMO } = require('./categorias');

const NOME = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([0-9a-f]{8})\.(jpe?g|png)$/;
const SEM_FOTO = 'sem-foto.svg';
// dHash da sala com armário ripado, mesa redonda preta e piso geométrico (18/11/2026).
const SALA = '0011010000111110101001100011001000111010000011000000001100010001';
const PERTO = 8;

const VAZIO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="Sem foto">
<rect width="1600" height="900" fill="#E7E4DE"/>
<rect x="80" y="80" width="1440" height="740" fill="none" stroke="#C9C4BA" stroke-width="2"/>
</svg>`;

const cache = new Map();

function urlPublica(capa) {
  const src = capa && typeof capa === 'object' ? capa.src : capa;
  if (typeof src !== 'string' || !src.trim()) return `/blog/capa/${SEM_FOTO}`;
  if (src.startsWith('/blog/capa/')) {
    const nome = src.slice('/blog/capa/'.length).split('?')[0];
    return nome === SEM_FOTO || NOME.test(nome) ? `/blog/capa/${nome}` : `/blog/capa/${SEM_FOTO}`;
  }
  const m = src.match(/\/capas\/([a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}\.(?:jpe?g|png))(?:\?.*)?$/i);
  return m ? `/blog/capa/${m[1].toLowerCase()}` : `/blog/capa/${SEM_FOTO}`;
}

function semFoto(src) {
  return urlPublica(src).endsWith(SEM_FOTO);
}

function origens(nome) {
  if (!NOME.test(nome)) return [];
  const bases = [ramoDoBlog(), ENDERECO_DO_BANCO, ENDERECO_DO_RAMO];
  const vistos = new Set();
  const lista = [];
  for (const base of bases) {
    let u;
    try { u = new URL(`${String(base).replace(/\/+$/, '')}/capas/${nome}`); } catch { continue; }
    const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    const remoto = u.protocol === 'https:' && u.hostname === 'raw.githubusercontent.com';
    if (!local && !remoto) continue;
    if (vistos.has(u.href)) continue;
    vistos.add(u.href);
    lista.push(u.href);
  }
  return lista;
}

async function dhash(buf) {
  const raw = await require('sharp')(buf, { failOn: 'none' }).rotate().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += raw[y * 9 + x] < raw[y * 9 + x + 1] ? '1' : '0';
  return bits;
}

function distancia(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

async function ehASala(buf, tipo) {
  if (!/^image\/(jpe?g|png)$/.test(tipo)) return false;
  try { return distancia(SALA, await dhash(buf)) <= PERTO; } catch { return false; }
}

async function baixar(nome) {
  if (cache.has(nome)) return cache.get(nome);
  let item = null;
  for (const url of origens(nome)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const tipo = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!r.ok || !/^image\/(jpe?g|png)$/.test(tipo)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || await ehASala(buf, tipo)) continue;
      item = { tipo, buf };
      break;
    } catch { /* tenta o próximo ramo */ }
  }
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(nome, item);
  return item;
}

function limparCache() { cache.clear(); }

module.exports = { NOME, SEM_FOTO, VAZIO, urlPublica, semFoto, origens, baixar, limparCache };
