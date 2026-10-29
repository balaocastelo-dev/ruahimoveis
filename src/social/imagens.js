// Redes e publicações · de onde vêm as fotos das artes.
//   foto:<n>        foto própria de um imóvel à venda (pasta "Fotos"; as internas nunca entram)
//   blog:<url>      capa de um texto do blog (https)
//   commons:<arq>   foto do Wikimedia Commons usada num guia de bairro (licença livre conferida)
// Guarda as últimas em memória: a mesma foto costuma aparecer em vários slides e redes.
const dados = require('../portal/dados');
const conteudo = require('../services/conteudo');

const MEMO = new Map();
const MAX = 60;
function guarda(k, v) { if (MEMO.size >= MAX) MEMO.delete(MEMO.keys().next().value); MEMO.set(k, v); return v; }

async function baixar(url) {
  if (!/^https:\/\/[^\s"'<>]+$/i.test(String(url || ''))) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'HerreraHouseIA/1.0 (artes das redes sociais)' } });
  const tipo = r.headers.get('content-type') || '';
  if (!r.ok || !/^image\//.test(tipo)) throw new Error(`a imagem respondeu ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Bytes de uma foto própria de imóvel à venda (ou null se não é pública). */
async function foto(id) {
  const k = `foto:${id}`;
  if (MEMO.has(k)) return MEMO.get(k);
  const f = dados.fotoPublica(id);
  if (!f) return null;
  const buf = f.url_externa ? await baixar(f.url_externa).catch(() => null) : conteudo.ler(f);
  return buf ? guarda(k, buf) : null;
}

/** Capa de texto do blog (endereço https). */
async function url(u) {
  const k = `url:${u}`;
  if (MEMO.has(k)) return MEMO.get(k);
  const buf = await baixar(u).catch(() => null);
  return buf ? guarda(k, buf) : null;
}

/** Foto do Commons (só arquivo com licença aceita) + o crédito que precisa aparecer junto. */
async function commons(titulo) {
  const k = `commons:${titulo}`;
  if (MEMO.has(k)) return MEMO.get(k);
  const c = require('../bairros/commons');
  const im = await c.imagem(titulo, 1280).catch(() => null);
  if (!im) return null;
  return guarda(k, { buf: im.buf, credito: c.credito(im.info) });
}

module.exports = { foto, url, commons };
