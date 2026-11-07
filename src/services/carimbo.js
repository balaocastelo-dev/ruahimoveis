// Carimbo da imobiliária sobre as fotos ilustrativas do acervo de demonstração.
// Cada foto do acervo existe em duas versões no mesmo endereço: <id>-<n>h.jpg (já carimbada com a marca do
// sistema) e <id>-<n>c.jpg (limpa). Aqui a limpa é baixada e recebe o logo desta imobiliária em branco,
// no meio da foto, para cada portal mostrar a marca dele.
// O carimbo é o logo do tema (public/temas/<TEMA>/logo.svg), não um texto: fonte de sistema não existe no
// servidor da Vercel e sairia quadradinho. Sem tema, sem logo ou sem o sharp, devolve null e a foto segue
// como está. O resultado fica guardado em memória enquanto o servidor estiver de pé.
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const CACHE = new Map();
const LIMITE = 80;
const OPACIDADE = 0.72;        // quanto o branco aparece sobre a foto
const LARGURA = 0.10;          // o logo ocupa esta fração da largura da foto (carimbo pequeno, no centro)

let LOGO;
let LOGO_LIDO = false;
function logoSvg() {
  if (LOGO_LIDO) return LOGO;
  LOGO_LIDO = true;
  LOGO = null;
  try {
    // O carimbo prefere um carimbo.svg do tema quando existe. Motivo: aqui todo o alfa do
    // arquivo vira branco, então um fio fino de outra cor no logo colorido viraria uma
    // segunda linha branca encostada na forma e sujaria a marca a 10% da largura da foto.
    // Sem carimbo.svg, cai no logo.svg de sempre e nada muda.
    const candidatos = [];
    if (cfg.TEMA) candidatos.push(`/temas/${cfg.TEMA}/carimbo.svg`);
    if (cfg.LOGO_URL) candidatos.push(cfg.LOGO_URL);
    for (const url of candidatos) {
      if (!url || !url.startsWith('/')) continue;
      const arq = path.join(__dirname, '..', '..', 'public', url.replace(/^\//, '').split('?')[0]);
      if (fs.existsSync(arq)) { LOGO = fs.readFileSync(arq); break; }
    }
  } catch { LOGO = null; }
  return LOGO;
}

async function carimbar(buf) {
  const svg = logoSvg();
  if (!svg) return null;
  const sharp = require('sharp');
  const meta = await sharp(buf).metadata();
  const w = meta.width || 1200;
  const h = meta.height || 800;

  const logo = await sharp(svg, { density: 400 }).resize({ width: Math.round(w * LARGURA) }).ensureAlpha().png().toBuffer();
  const m2 = await sharp(logo).metadata();
  // Silhueta branca: a forma do logo vira o recorte e o recheio é branco, com a opacidade do carimbo.
  const alfa = await sharp(logo).extractChannel('alpha').linear(OPACIDADE, 0).toBuffer();
  const branco = await sharp({ create: { width: m2.width, height: m2.height, channels: 3, background: '#ffffff' } })
    .joinChannel(alfa).png().toBuffer();

  return sharp(buf).composite([{
    input: branco,
    top: Math.round((h - m2.height) / 2),
    left: Math.round((w - m2.width) / 2),
  }]).jpeg({ quality: 86 }).toBuffer();
}

/** Foto carimbada com a marca desta imobiliária, ou null quando não dá para carimbar. */
async function daCasa(url, buscar) {
  const u = String(url);
  if (!/\.jpe?g$/i.test(u)) return null;                   // só as fotos do acervo
  if (!logoSvg()) return null;                             // imobiliária sem logo: a foto segue como está
  if (CACHE.has(u)) return CACHE.get(u);
  let saida = null;
  try {
    // Quando existe a versão limpa (<n>c.jpg), é ela que recebe a marca da casa, para não ficar
    // um carimbo por cima do outro. As demais fotos do acervo são carimbadas como estão.
    const limpa = /h\.jpg$/i.test(u) ? await buscar(u.replace(/h\.jpg$/i, 'c.jpg'), false) : null;
    const base = limpa || await buscar(u, false);
    if (base && base.buf) { const b = await carimbar(base.buf); if (b) saida = { tipo: 'image/jpeg', buf: b }; }
  } catch { saida = null; }
  if (CACHE.size >= LIMITE) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(u, saida);
  return saida;
}

module.exports = { daCasa };
