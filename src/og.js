// Prévia de link (WhatsApp, Facebook, Telegram, etc.).
//
// O HTML do /v/<token> é montado no servidor, com as metatags, para o robô
// que não executa JavaScript. A foto de capa sai em JPEG menor (o WhatsApp
// ignora imagem grande demais ou com menos de 300 px). Nada daqui grava
// acesso: o contador continua só na ficha JSON, e robô de prévia não conta.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { one, PG } = require('./db');
const conteudo = require('./services/conteudo');
const sharp = require('sharp');

const VERSAO_OG = 1;
const MAX_BYTES = 600 * 1024;
// Robôs de prévia e de indexação. Não inclui o navegador de dentro do WhatsApp
// (Mozilla… WhatsApp/2.x): esse é uma visita de verdade e conta no acesso.
const PREVIEW = /facebookexternalhit|facebot|facebookcatalog|meta-externalagent|meta-externalfetcher|telegrambot|twitterbot|slackbot|slack-imgproxy|linkedinbot|discordbot|pinterestbot|pinterest\/|embedly|quora link preview|showyoubot|outbrain|vkshare|redditbot|skypeuripreview|bingpreview|bingbot|googlebot|google-inspectiontool|adsbot-google|mediapartners-google|duckduckbot|baiduspider|yandexbot|applebot|iframely|snapchat|bytespider|kakaotalk|bitlybot|ahrefsbot|semrushbot|dotbot|petalbot/i;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ehPreview(ua) {
  const s = String(ua || '');
  if (!s) return false;
  if (PREVIEW.test(s)) return true;
  // O coletor do WhatsApp manda só "WhatsApp/2.x". O app, ao abrir o link, manda um Chrome/Safari.
  return /whatsapp/i.test(s) && !/mozilla\//i.test(s);
}

function origemPublica(req) {
  const fixo = String(cfg.PUBLIC_URL || '').replace(/\/+$/, '');
  if (/^https?:\/\/[^/\s]+$/i.test(fixo) || /^https?:\/\/.+/i.test(fixo)) return fixo.replace(/\/+$/, '');
  const host = String((req.get && req.get('host')) || '').trim();
  if (!/^[A-Za-z0-9.\-:[\]]+$/.test(host)) return '';
  let proto = req.protocol || 'http';
  if (proto !== 'https' && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) proto = 'https';
  return `${proto}://${host}`;
}

function plural(n, um, varios) {
  return `${n} ${Number(n) === 1 ? um : varios}`;
}
function reais(v) {
  return `R$ ${Math.round(Number(v)).toLocaleString('pt-BR')}`;
}
function metros(v) {
  return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;
}

/** "Casa em condomínio · Quinta da Baroneza · CA0036" — tipo, bairro ou cidade, código. Sem rua. */
function tituloImovel(i) {
  const lugar = (i.bairro || i.cidade || '').trim();
  return [i.tipo, lugar, i.codigo].filter(Boolean).join(' · ');
}

/** Preço, área, quartos/suítes/vagas. A rua só entra se o link pediu mostrar_endereco. */
function descricaoImovel(i, endereco) {
  const p = [];
  if (Number(i.valor) > 0) p.push(reais(i.valor));
  const area = Number(i.area_util) > 0 ? i.area_util : (Number(i.area_total) > 0 ? i.area_total : null);
  if (area) p.push(metros(area));
  if (Number(i.quartos) > 0) p.push(plural(i.quartos, 'quarto', 'quartos'));
  if (Number(i.suites) > 0) p.push(plural(i.suites, 'suíte', 'suítes'));
  if (Number(i.vagas) > 0) p.push(plural(i.vagas, 'vaga', 'vagas'));
  if (endereco) p.push(endereco);
  const t = p.join(' · ');
  return t.length <= 300 ? t : `${t.slice(0, 299).trimEnd()}…`;
}

function tagsLink({ titulo, descricao, url, imagem, largura, altura }) {
  const linhas = [
    '<meta property="og:site_name" content="RUAH">',
    '<meta property="og:locale" content="pt_BR">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(descricao)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
  ];
  if (imagem) {
    linhas.push(`<meta property="og:image" content="${esc(imagem)}">`);
    if (/^https:\/\//i.test(imagem)) linhas.push(`<meta property="og:image:secure_url" content="${esc(imagem)}">`);
    linhas.push('<meta property="og:image:type" content="image/jpeg">');
    if (largura && altura) {
      linhas.push(`<meta property="og:image:width" content="${largura}">`);
      linhas.push(`<meta property="og:image:height" content="${altura}">`);
    }
    linhas.push(`<meta property="og:image:alt" content="${esc(titulo)}">`);
    linhas.push('<meta name="twitter:card" content="summary_large_image">');
    linhas.push(`<meta name="twitter:image" content="${esc(imagem)}">`);
  } else {
    linhas.push('<meta name="twitter:card" content="summary">');
  }
  linhas.push(`<meta name="twitter:title" content="${esc(titulo)}">`);
  linhas.push(`<meta name="twitter:description" content="${esc(descricao)}">`);
  return linhas.join('\n');
}

function htmlComTags(html, titulo, tags) {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>\n${tags}`);
}

// ---------------------------------------------------------------- dimensões
function u16(buf, o, le) { return le ? buf.readUInt16LE(o) : buf.readUInt16BE(o); }
function u32(buf, o, le) { return le ? buf.readUInt32LE(o) : buf.readUInt32BE(o); }

function orientacaoExif(seg) {
  if (!seg || seg.length < 16 || seg.toString('ascii', 0, 4) !== 'Exif') return 0;
  const t = 6;
  const le = seg.toString('ascii', t, t + 2) === 'II';
  if (!le && seg.toString('ascii', t, t + 2) !== 'MM') return 0;
  if (u16(seg, t + 2, le) !== 42 || t + 8 > seg.length) return 0;
  const ifd0 = t + u32(seg, t + 4, le);
  if (ifd0 + 2 > seg.length) return 0;
  const n = u16(seg, ifd0, le);
  for (let k = 0; k < n; k++) {
    const e = ifd0 + 2 + k * 12;
    if (e + 12 > seg.length) break;
    if (u16(seg, e, le) === 0x0112) {
      const v = u16(seg, e + 8, le);
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}

function dimensoesJpeg(buf) {
  let i = 2, w = 0, h = 0, orientacao = 1;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) break;
    if (i + 4 > buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break;
    if (sof.has(m) && i + 9 <= buf.length) {
      h = buf.readUInt16BE(i + 5);
      w = buf.readUInt16BE(i + 7);
    } else if (m === 0xe1) {
      const o = orientacaoExif(buf.subarray(i + 4, i + 2 + len));
      if (o) orientacao = o;
    }
    i += 2 + len;
  }
  if (!w || !h) return null;
  if (orientacao >= 5 && orientacao <= 8) return { width: h, height: w, orientacao };
  return { width: w, height: h, orientacao };
}

function dimensoesImagem(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.toString('ascii', 12, 16) === 'IHDR' && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), orientacao: 1 };
  }
  if (buf.toString('ascii', 0, 3) === 'GIF' && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), orientacao: 1 };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.length >= 30) {
    const tipo = buf.toString('ascii', 12, 16);
    if (tipo === 'VP8X') return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)), orientacao: 1 };
    if (tipo === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, orientacao: 1 };
    if (tipo === 'VP8L') {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), orientacao: 1 };
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return dimensoesJpeg(buf);
  return null;
}

/** Cabe na prévia: o lado maior fica em até 1200 px e o menor em pelo menos 320, sem cortar a foto. */
function dimensoesSaida(w, h) {
  w = Math.round(Number(w) || 0);
  h = Math.round(Number(h) || 0);
  if (w < 1 || h < 1) return null;
  const min = Math.min(w, h);
  if (min < 300) {
    const s = 320 / min;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const max = Math.max(w, h);
  if (max > 1200) {
    const s = 1200 / max;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

function caminhoSeguro(rel) {
  if (!rel || typeof rel !== 'string') return null;
  const p = path.resolve(cfg.DATA_DIR, rel);
  const raiz = path.resolve(cfg.DATA_DIR);
  if (p !== raiz && !p.startsWith(raiz + path.sep)) return null;
  return p;
}

function cabeca(arquivo) {
  if (!arquivo) return null;
  const p = caminhoSeguro(arquivo.caminho_local);
  if (p && fs.existsSync(p)) {
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(512 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.subarray(0, n);
    } finally { fs.closeSync(fd); }
  }
  if (!PG && !arquivo.caminho_local) return null;
  try {
    const r = one('SELECT substr(dados,1,524288) AS c FROM arquivos_dados WHERE arquivo_id=?', arquivo.id);
    if (!r || r.c == null) return null;
    return Buffer.isBuffer(r.c) ? r.c : Buffer.from(r.c);
  } catch { return null; }
}

function jaProntaParaPreview(arquivo, dim) {
  if (!dim || dim.orientacao !== 1) return false;
  if (!/^image\/jpe?g$/i.test(arquivo.mime || '')) return false;
  if (!arquivo.tamanho || arquivo.tamanho > 550 * 1024) return false;
  if (dim.width < 300 || dim.height < 300) return false;
  if (dim.width > 1600 || dim.height > 1600) return false;
  return true;
}

/** Caminho e tamanho da capa no portal público (/imoveis/foto/…). */
function metaFotoPortal(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { caminho: `/imoveis/foto/${id}` };
  const f = one('SELECT id, mime, tamanho, caminho_local FROM arquivos WHERE id=?', n);
  if (!f) return { caminho: `/imoveis/foto/${n}` };
  const dim = dimensoesImagem(cabeca(f));
  if (!dim) return { caminho: `/imoveis/foto/${n}`, tipo: /^image\/jpe?g$/i.test(f.mime || '') ? 'image/jpeg' : '' };
  if (jaProntaParaPreview(f, dim)) return { caminho: `/imoveis/foto/${n}`, largura: dim.width, altura: dim.height, tipo: 'image/jpeg' };
  const saida = dimensoesSaida(dim.width, dim.height);
  return { caminho: `/imoveis/foto/${n}/og.jpg?v=${VERSAO_OG}`, largura: saida.width, altura: saida.height, tipo: 'image/jpeg' };
}

function metaCapaLink(foto) {
  if (!foto) return {};
  const dim = dimensoesImagem(cabeca(foto));
  const saida = dim && dimensoesSaida(dim.width, dim.height);
  return saida ? { largura: saida.width, altura: saida.height } : {};
}

// ---------------------------------------------------------------- JPEG da prévia
const cache = new Map();
function guardar(chave, valor) {
  cache.set(chave, valor);
  if (cache.size > 30) cache.delete(cache.keys().next().value);
}

function pipelineJpeg(buffer, w, h, quality) {
  const img = () => sharp(buffer, { failOn: 'none', pages: 1, limitInputPixels: 80e6 }).rotate().resize(w, h, { fit: 'fill' });
  return img().jpeg({ quality, mozjpeg: true }).toBuffer().catch(() => img().jpeg({ quality }).toBuffer());
}

async function jpegParaPreview(buffer) {
  const meta = await sharp(buffer, { failOn: 'none', pages: 1 }).metadata();
  let w = meta.width || 0, h = meta.height || 0;
  const o = meta.orientation || 1;
  if (o >= 5 && o <= 8) { const t = w; w = h; h = t; }
  const saida = dimensoesSaida(w, h);
  if (!saida) return null;
  let quality = 82;
  let out = await pipelineJpeg(buffer, saida.width, saida.height, quality);
  while (out.length > MAX_BYTES && quality > 35) {
    quality -= 8;
    out = await pipelineJpeg(buffer, saida.width, saida.height, quality);
  }
  let width = saida.width, height = saida.height;
  if (out.length > MAX_BYTES) {
    const fator = Math.min(1, Math.sqrt(MAX_BYTES / out.length) * 0.9);
    width = Math.max(320, Math.round(saida.width * fator));
    height = Math.max(320, Math.round(saida.height * fator));
    out = await pipelineJpeg(buffer, width, height, 45);
  }
  const fim = await sharp(out).metadata();
  return { buffer: out, width: fim.width || width, height: fim.height || height };
}

async function enviarJpeg(res, arquivo, { publico = false } = {}) {
  const chave = `${arquivo.id}:${arquivo.tamanho || 0}:${VERSAO_OG}`;
  let jpeg = cache.get(chave);
  if (!jpeg) {
    const buf = conteudo.ler(arquivo);
    if (!buf) {
      res.setHeader('Cache-Control', 'no-store');
      return res.sendStatus(404);
    }
    try { jpeg = await jpegParaPreview(buf); }
    catch (e) { jpeg = null; if (!/corrupt|unsupported|Input/i.test(String(e.message))) console.error('[og]', e.message); }
    if (!jpeg) {
      // Arquivo que o decodificador recusa: entrega o original se já for uma imagem pequena.
      if (/^image\/(png|jpe?g|webp|gif)$/i.test(arquivo.mime || '') && buf.length <= MAX_BYTES && buf.length > 32) {
        res.setHeader('Content-Type', arquivo.mime);
        res.setHeader('Cache-Control', publico ? 'public, max-age=86400' : 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.end(buf);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.sendStatus(404);
    }
    guardar(chave, jpeg);
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', jpeg.buffer.length);
  res.setHeader('Cache-Control', publico ? 'public, max-age=86400, s-maxage=604800' : 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(jpeg.buffer);
}

module.exports = {
  VERSAO_OG, MAX_BYTES, esc, ehPreview, origemPublica, tituloImovel, descricaoImovel, tagsLink, htmlComTags,
  dimensoesImagem, dimensoesSaida, metaFotoPortal, metaCapaLink, enviarJpeg,
};
