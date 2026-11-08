// Carimbo da casa nas fotos que o portal serve.
//
// A foto de um imovel retomado e da origem (a Caixa, o banco, o leiloeiro), nao
// nossa. Entao o carimbo e uma TARJA DE CREDITO, nao uma marca d'agua por cima
// da imagem: a marca da casa de um lado, quem fez a foto do outro. Isso assina o
// anuncio sem fingir que a fotografia e nossa, e sobrevive a um print de tela,
// que e o que interessa quando a foto roda no WhatsApp.
//
// Feito com sharp, uma vez por foto, guardado em memoria: a mesma foto e pedida
// muitas vezes e redesenhar a tarja a cada pedido e desperdicio.

const sharp = require('sharp');

const MARCA = 'HERRERA HOUSE';
const LIMITE = 400;            // fotos na memoria; cada uma tem poucas dezenas de KB
const guardadas = new Map();

const escXml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function tarja(largura, altura, credito) {
  // A tarja cresce com a foto, mas nunca engole a imagem nem some num print.
  const h = Math.max(34, Math.min(74, Math.round(altura * 0.115)));
  const base = h * 0.40;
  const marca = Math.max(11, Math.round(base * 1.06));
  const miudo = Math.max(9, Math.round(base * 0.72));
  const margem = Math.round(h * 0.34);
  const linha = altura - Math.round(h * 0.37);
  const linha2 = altura - Math.round(h * 0.37) + miudo + 3;
  const temCredito = !!credito;

  return Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="v" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#0E1A16" stop-opacity="0.86"/>
      <stop offset="1" stop-color="#0E1A16" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${altura - h * 1.7}" width="${largura}" height="${h * 1.7}" fill="url(#v)"/>
  <text x="${margem}" y="${temCredito ? linha - miudo - 2 : linha}" fill="#F7F5F0"
        font-family="Georgia, 'Times New Roman', serif" font-size="${marca}"
        letter-spacing="${(marca * 0.17).toFixed(2)}" font-weight="500">${escXml(MARCA)}</text>
  ${temCredito ? `<text x="${margem}" y="${linha2 - miudo - 2}" fill="#C9A867" fill-opacity="0.92"
        font-family="Segoe UI, Arial, sans-serif" font-size="${miudo}">${escXml(credito)}</text>` : ''}
</svg>`);
}

/** Recebe o JPEG da origem, devolve o JPEG com a tarja. Se der qualquer erro,
 *  devolve a foto original: foto sem carimbo e melhor do que anuncio sem foto. */
async function carimbar(original, { chave, credito } = {}) {
  if (!original || !original.length) return original;
  if (chave && guardadas.has(chave)) return guardadas.get(chave);
  let saida = original;
  try {
    const img = sharp(original, { failOn: 'none' });
    const { width, height } = await img.metadata();
    if (width && height && height > 80) {
      saida = await img
        .composite([{ input: tarja(width, height, credito), top: 0, left: 0 }])
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();
    }
  } catch { saida = original; }
  if (chave) {
    if (guardadas.size >= LIMITE) guardadas.delete(guardadas.keys().next().value);
    guardadas.set(chave, saida);
  }
  return saida;
}

function esquecer(chave) { if (chave) guardadas.delete(chave); else guardadas.clear(); }

module.exports = { carimbar, esquecer, MARCA };