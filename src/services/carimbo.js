// Carimbo da imobiliária sobre as fotos ilustrativas do acervo de demonstração.
// Cada foto do acervo existe em duas versões no mesmo endereço: <id>-<n>h.jpg (já carimbada com a marca do
// sistema) e <id>-<n>c.jpg (limpa). Aqui a limpa é baixada e carimbada na hora com o nome desta imobiliária,
// para cada portal mostrar a marca dele. Sem a versão limpa, ou sem o sharp, devolve null e a foto segue como
// está. O resultado fica guardado em memória enquanto o servidor estiver de pé.
const cfg = require('../config');

const CACHE = new Map();
const LIMITE = 80;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function carimbar(buf) {
  const sharp = require('sharp');
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1200;
  const h = meta.height || 800;
  const texto = String(cfg.CLIENTE_NOME || '').toUpperCase().trim();
  if (!texto) return null;

  // A palavra é desenhada solta, num tamanho de referência, para o sharp medir a largura real dela:
  // assim um nome curto e um nome longo cabem igual, sem conta de largura por letra (que erra com acento).
  const REF = 120;
  const svgTexto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(texto.length * REF * 1.3)}" height="${REF * 2}">
  <text x="0" y="${REF * 1.2}" font-family="Helvetica, Arial, sans-serif" font-size="${REF}" font-weight="600" letter-spacing="${Math.round(REF * 0.26)}" fill="#ffffff">${esc(texto)}</text></svg>`);
  const png = await sharp(svgTexto).trim().png().toBuffer();
  const m2 = await sharp(png).metadata();

  // Reduzida para ocupar no máximo 62% da largura da foto, sempre centralizada.
  const larg = Math.min(Math.round(w * 0.62), m2.width);
  const alt = Math.max(1, Math.round((m2.height * larg) / m2.width));
  const palavra = await sharp(png).resize(larg, alt)
    .composite([{ input: Buffer.from([255, 255, 255, 191]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .png().toBuffer();

  // Um risco fino atravessa a foto atrás da palavra, como no carimbo do acervo.
  const y = Math.round(h / 2);
  const linha = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <line x1="${Math.round(w * 0.06)}" y1="${y}" x2="${Math.round(w * 0.94)}" y2="${y}" stroke="#ffffff" stroke-opacity="0.45" stroke-width="${Math.max(1, Math.round(w / 1100))}"/></svg>`);

  return sharp(buf).composite([
    { input: linha, top: 0, left: 0 },
    { input: palavra, top: y - Math.round(alt / 2), left: Math.round((w - larg) / 2) },
  ]).jpeg({ quality: 86 }).toBuffer();
}

/** Foto carimbada com a marca desta imobiliária, ou null quando não dá para carimbar. */
async function daCasa(url, buscar) {
  if (!/h\.jpg$/i.test(String(url))) return null;          // só as fotos do acervo têm versão limpa
  if (CACHE.has(url)) return CACHE.get(url);
  let saida = null;
  try {
    const limpa = await buscar(String(url).replace(/h\.jpg$/i, 'c.jpg'), false);
    if (limpa && limpa.buf) { const b = await carimbar(limpa.buf); if (b) saida = { tipo: 'image/jpeg', buf: b }; }
  } catch { saida = null; }
  if (CACHE.size >= LIMITE) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(url, saida);
  return saida;
}

module.exports = { daCasa };
