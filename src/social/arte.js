// Redes e publicações · as artes de cada post (JPEG), montadas no servidor com a foto, o logo e as
// cores da imobiliária. O texto vira desenho (curvas) com as fontes que vêm junto do sistema
// (src/social/fontes): a Vercel não tem fontes instaladas, então nada depende do servidor.
//
// Formatos: "feed" 1080×1350 (Instagram e Facebook, 4:5) e "google" 1200×900 (Google Meu Negócio, 4:3).
// O valor e os números do imóvel vêm do banco na hora de desenhar (a arte nunca mostra preço velho).
// Imóvel da seleção Signature não mostra o valor. Nunca aparece endereço, dono ou nada do CRM.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');
const cfg = require('../config');
const imagens = require('./imagens');

const RAIZ = path.join(__dirname, '..', '..');
const DEMONSTRACAO = () => /^(1|sim|true)$/i.test(String(process.env.PORTAL_DEMONSTRACAO || '').trim());
const FORMATOS = { feed: [1080, 1350], google: [1200, 900] };

// ------------------------------------------------------------------ fontes e texto em curvas
const FONTES = {};
function fonte(nome) {
  if (!FONTES[nome]) {
    const arq = { texto: 'dm-sans-latin-400-normal.woff', media: 'dm-sans-latin-600-normal.woff', forte: 'dm-sans-latin-700-normal.woff',
      titulo: 'cormorant-garamond-latin-600-normal.woff', italico: 'cormorant-garamond-latin-600-italic.woff' }[nome];
    FONTES[nome] = opentype.loadSync(path.join(__dirname, 'fontes', arq));
  }
  return FONTES[nome];
}
const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// a fonte "latin" cobre o português; troca o que ela não desenha (aspas curvas e travessões ficam)
const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').replace(/[^ -ÿ–—‘’“”•…²·]/g, '').trim();

function largura(f, texto, tam, ls = 0) { return fonte(f).getAdvanceWidth(texto, tam, { letterSpacing: ls }); }

/** Quebra o texto em linhas que cabem em `max` px (até `limite` linhas; a última ganha "…"). */
function quebra(f, texto, tam, max, limite = 3) {
  const palavras = limpo(texto).split(' ').filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const t = atual ? `${atual} ${p}` : p;
    if (largura(f, t, tam) <= max || !atual) atual = t;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > limite) {
    const corte = linhas.slice(0, limite);
    let ult = corte[limite - 1];
    while (ult.length > 1 && largura(f, `${ult}…`, tam) > max) ult = ult.replace(/\s*\S+$/, '') || ult.slice(0, -1);
    corte[limite - 1] = `${ult.replace(/[,.;:\-–—]$/, '')}…`;
    return corte;
  }
  return linhas;
}

/** <path> com o texto desenhado. ancora: start | middle | end. */
function texto(f, t, x, y, tam, cor, { ancora = 'start', ls = 0, opacidade = 1 } = {}) {
  const s = limpo(t);
  if (!s) return '';
  const w = largura(f, s, tam, ls);
  const x0 = ancora === 'middle' ? x - w / 2 : ancora === 'end' ? x - w : x;
  const d = fonte(f).getPath(s, x0, y, tam, { letterSpacing: ls }).toPathData(1);
  return `<path d="${d}" fill="${cor}"${opacidade < 1 ? ` fill-opacity="${opacidade}"` : ''}/>`;
}
/** Um bloco de linhas; devolve { svg, altura }. */
function paragrafo(f, t, x, y, tam, cor, max, limite, { entre = 1.12, ancora = 'start', opacidade = 1 } = {}) {
  const ls = quebra(f, t, tam, max, limite);
  return { svg: ls.map((l, i) => texto(f, l, x, y + i * tam * entre, tam, cor, { ancora, opacidade })).join(''), altura: ls.length * tam * entre, linhas: ls.length };
}

// ------------------------------------------------------------------ cores e logo da imobiliária
let PALETA = null;
function paleta() {
  if (PALETA) return PALETA;
  let css = '';
  try { css = fs.readFileSync(cfg.TEMA ? path.join(RAIZ, 'public', 'temas', cfg.TEMA, 'tema.css') : path.join(RAIZ, 'public', 'portal-assets', 'portal.css'), 'utf8'); } catch { /* sem tema */ }
  const raiz = (css.match(/:root\s*\{([^}]*)\}/) || [, ''])[1];
  const v = (n, d) => { const m = raiz.match(new RegExp(`--${n}\\s*:\\s*(#[0-9a-fA-F]{3,8})`)); return m ? m[1] : d; };
  PALETA = { escuro: v('grafite', '#23272B'), destaque: v('ouro', '#A8823C'), claro: v('cal', '#FBFAF8'), apoio: v('salvia', '#5E6B5A'), branco: '#FFFFFF' };
  return PALETA;
}
const LOGOS = new Map();
/** O logo da imobiliária num cartão branco arredondado (PNG), na altura pedida. Sem logo: o nome escrito. */
async function selo(altura) {
  if (LOGOS.has(altura)) return LOGOS.get(altura);
  const P = paleta();
  const pad = Math.round(altura * 0.28);
  let logo = null;
  const url = cfg.LOGO_URL;
  if (url && url.startsWith('/')) {
    try { logo = await sharp(fs.readFileSync(path.join(RAIZ, 'public', url.replace(/^\/+/, ''))), { density: 300 }).resize({ height: altura - pad * 2 }).png().toBuffer(); } catch { logo = null; }
  }
  let png;
  if (logo) {
    const m = await sharp(logo).metadata();
    const w = m.width + pad * 2;
    png = await sharp({ create: { width: w, height: altura, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${altura}"><rect width="${w}" height="${altura}" rx="${altura * 0.22}" fill="#FFFFFF" fill-opacity="0.94"/></svg>`) }, { input: logo, left: pad, top: pad }])
      .png().toBuffer();
  } else {
    const tam = altura * 0.5;
    const nome = cfg.CLIENTE_NOME;
    const w = Math.round(largura('titulo', nome, tam, 0.08) + pad * 2.4);
    png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${altura}"><rect width="${w}" height="${altura}" rx="${altura * 0.22}" fill="#FFFFFF" fill-opacity="0.94"/>${texto('titulo', nome, w / 2, altura * 0.66, tam, P.escuro, { ancora: 'middle', ls: 0.08 })}</svg>`)).png().toBuffer();
  }
  LOGOS.set(altura, png);
  return png;
}

// ------------------------------------------------------------------ peças comuns
const reais = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function specs(im) {
  const s = [];
  if (im.quartos) s.push(plural(im.quartos, 'quarto', 'quartos'));
  if (im.suites) s.push(plural(im.suites, 'suíte', 'suítes'));
  const area = im.area_util || im.area_total;
  if (area) s.push(`${Math.round(area).toLocaleString('pt-BR')} m²`);
  if (im.vagas) s.push(plural(im.vagas, 'vaga', 'vagas'));
  return s.join('  ·  ');
}
const signature = (im) => { try { return require('../portal/paginas').reservado(im); } catch { return false; } };
const precoTexto = (im) => (signature(im) ? 'Valor sob consulta' : im.valor ? reais(im.valor) : 'Valor sob consulta');
const dominio = () => { const u = String(cfg.PUBLIC_URL || cfg.LINK_ONLINE || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''); return u || ''; };

async function fundoFoto(buf, W, H) {
  if (!buf) return sharp({ create: { width: W, height: H, channels: 3, background: paleta().escuro } }).png().toBuffer();
  return sharp(buf).rotate().resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).modulate({ brightness: 1.02, saturation: 1.04 }).toBuffer();
}
function degrade(W, H, inicio = 0.38, forca = 0.88, cor = '#000000') {
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="${inicio}" stop-color="${cor}" stop-opacity="0"/><stop offset="1" stop-color="${cor}" stop-opacity="${forca}"/></linearGradient>
  <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".22" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#gt)"/><rect width="${W}" height="${H}" fill="url(#g)"/>`;
}
function etiqueta(t, x, y, cor, fundo, tam = 22, { maiusculas = true } = {}) {
  const s = maiusculas ? limpo(t).toUpperCase() : limpo(t);
  const ls = maiusculas ? 0.14 : 0.02;
  const w = largura('forte', s, tam, ls) + tam * 1.6;
  const h = tam * 2;
  return { svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fundo}"/>${texto('forte', s, x + w / 2, y + h * 0.66, tam, cor, { ancora: 'middle', ls })}`, w, h };
}
function aviso(W, H, credito) {
  const linhas = [];
  if (DEMONSTRACAO()) linhas.push('Imagem ilustrativa');
  if (credito) linhas.push(credito);
  return linhas.map((l, i) => texto('texto', l.slice(0, 110), W - 28, H - 20 - i * 24, 17, '#FFFFFF', { ancora: 'end', opacidade: 0.78 })).join('');
}

async function montar(base, W, H, svg, logos = []) {
  const camadas = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`) }, ...logos];
  return sharp(base).composite(camadas).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
}

// ------------------------------------------------------------------ slides
/** Capa de imóvel: foto, tipo e bairro, título, números e valor. */
async function capaImovel(x, W, H, o = {}) {
  const P = paleta();
  const { imovel: im, pagina: p } = x;
  const base = await fundoFoto(await imagens.foto(p.capa.foto), W, H);
  const m = Math.round(W * 0.065);
  const larg = W - m * 2;
  const sig = signature(im);
  const tag = etiqueta(o.etiqueta || (sig ? `${cfg.CLIENTE_NOME} Signature` : 'À venda'), m, m, sig ? '#EAD9AE' : P.escuro, sig ? '#141414' : '#FFFFFF');
  const tituloTam = Math.round(W * (H > W ? 0.064 : 0.052));
  const titulo = quebra('titulo', p.titulo, tituloTam, larg, 3);
  const linhaSpecs = specs(im);
  const preco = precoTexto(im);
  let y = H - m - 8;
  const partes = [];
  partes.push(texto('texto', `Código ${im.codigo}  ·  ${o.rodape || 'link na bio'}`, m, y, Math.round(W * 0.021), '#FFFFFF', { opacidade: 0.82 }));
  y -= Math.round(W * 0.06);
  partes.push(texto('forte', preco, m, y, Math.round(W * 0.05), '#FFFFFF'));
  y -= Math.round(W * 0.062);
  if (linhaSpecs) { partes.push(texto('media', linhaSpecs, m, y, Math.round(W * 0.027), '#FFFFFF', { opacidade: 0.95 })); y -= Math.round(W * 0.052); }
  for (let i = titulo.length - 1; i >= 0; i--) { partes.push(texto('titulo', titulo[i], m, y, tituloTam, '#FFFFFF')); y -= tituloTam * 1.06; }
  // tipo · bairro numa linha só (nome de loteamento longo é cortado com "…")
  const tamL = Math.round(W * 0.022);
  let lugar = [im.tipo, im.bairro || im.cidade].filter(Boolean).join(' · ').toUpperCase();
  while (lugar.length > 4 && largura('forte', lugar, tamL, 0.16) > larg) lugar = `${lugar.slice(0, -2).trimEnd()}…`;
  partes.push(texto('forte', lugar, m, y - 6, tamL, P.destaque === '#141414' ? '#E9D9B4' : '#FFFFFF', { ls: 0.16, opacidade: 0.92 }));
  const sel = await selo(Math.round(W * 0.085));
  const meta = await sharp(sel).metadata();
  return montar(base, W, H, degrade(W, H, 0.34, 0.9) + tag.svg + partes.join('') + aviso(W, H), [{ input: sel, left: W - m - meta.width, top: m - 6 }]);
}

/** Mais uma foto do imóvel, com a legenda do ambiente e o logo pequeno. */
async function fotoImovel(x, foto, legenda, W, H) {
  const base = await fundoFoto(await imagens.foto(foto), W, H);
  const m = Math.round(W * 0.055);
  const leg = legenda ? paragrafo('media', legenda, m, H - m - Math.round(W * 0.03), Math.round(W * 0.027), '#FFFFFF', W - m * 2 - 160, 2) : { svg: '' };
  const sel = await selo(Math.round(W * 0.062));
  const meta = await sharp(sel).metadata();
  return montar(base, W, H, degrade(W, H, 0.62, 0.75) + leg.svg + aviso(W, H), [{ input: sel, left: W - m - meta.width, top: H - m - meta.height }]);
}

/** Último slide: convite para a visita, nas cores da imobiliária. */
async function fim(W, H, chamada = 'Agende sua visita', apoio = null, destino = '/imoveis') {
  const P = paleta();
  const base = await sharp({ create: { width: W, height: H, channels: 3, background: P.escuro } }).png().toBuffer();
  const sel = await selo(Math.round(W * 0.13));
  const meta = await sharp(sel).metadata();
  const c = paragrafo('titulo', chamada, W / 2, H * 0.47, Math.round(W * 0.085), '#FFFFFF', W * 0.84, 2, { ancora: 'middle', entre: 1.05 });
  const a = paragrafo('texto', apoio || `Fale com a equipe ${cfg.CLIENTE_NOME}. A gente mostra o imóvel, tira as dúvidas e acompanha a negociação com você.`, W / 2, H * 0.47 + c.altura + W * 0.03, Math.round(W * 0.03), '#FFFFFF', W * 0.74, 3, { ancora: 'middle', entre: 1.35, opacidade: 0.84 });
  const site = `${dominio()}${destino}`;
  const pill = etiqueta(site, 0, 0, P.escuro, P.destaque === P.escuro ? '#FFFFFF' : P.destaque, Math.round(W * 0.026), { maiusculas: false });
  const px = (W - pill.w) / 2, py = H * 0.47 + c.altura + a.altura + W * 0.07;
  const pillSvg = pill.svg.replace(/<rect x="0" y="0"/, `<rect x="${px}" y="${py}"`).replace(/<path d="/, `<path transform="translate(${px} ${py})" d="`);
  const linhaFina = `<rect x="${W * 0.44}" y="${H * 0.47 - W * 0.13}" width="${W * 0.12}" height="3" fill="${P.destaque}"/>`;
  return montar(base, W, H, linhaFina + c.svg + a.svg + (dominio() ? pillSvg : '') + aviso(W, H), [{ input: sel, left: Math.round((W - meta.width) / 2), top: Math.round(H * 0.16) }]);
}

/** Capa de texto do blog (ou notícia). */
async function capaBlog(a, W, H) {
  const P = paleta();
  const base = await fundoFoto(a.capa && a.capa.src ? await imagens.url(a.capa.src) : null, W, H);
  const m = Math.round(W * 0.065);
  const tag = etiqueta(a.formato === 'dica' ? 'Dica' : (a.categoriaNome || cfg.BLOG_NOME), m, m, P.escuro, '#FFFFFF');
  const tam = Math.round(W * (H > W ? 0.07 : 0.056));
  let y = H - m - 8;
  const partes = [texto('texto', `Leia no ${cfg.BLOG_NOME}  ·  link na bio`, m, y, Math.round(W * 0.022), '#FFFFFF', { opacidade: 0.85 })];
  y -= Math.round(W * 0.06);
  if (a.resumo) { const r = quebra('texto', a.resumo, Math.round(W * 0.028), W - m * 2, 2); for (let i = r.length - 1; i >= 0; i--) { partes.push(texto('texto', r[i], m, y, Math.round(W * 0.028), '#FFFFFF', { opacidade: 0.92 })); y -= Math.round(W * 0.04); } y -= Math.round(W * 0.02); }
  const t = quebra('titulo', a.titulo, tam, W - m * 2, 4);
  for (let i = t.length - 1; i >= 0; i--) { partes.push(texto('titulo', t[i], m, y, tam, '#FFFFFF')); y -= tam * 1.05; }
  const sel = await selo(Math.round(W * 0.085));
  const meta = await sharp(sel).metadata();
  return montar(base, W, H, degrade(W, H, 0.25, 0.92) + tag.svg + partes.join('') + aviso(W, H, a.capa && a.capa.src ? 'Imagem ilustrativa gerada por IA' : ''), [{ input: sel, left: W - m - meta.width, top: m - 6 }]);
}

/** Capa da revista da semana: o nome da revista e uma grade com as fotos dos imóveis. */
async function capaRevista(itens, rotulo, W, H) {
  const P = paleta();
  const base = await sharp({ create: { width: W, height: H, channels: 3, background: P.claro } }).png().toBuffer();
  const m = Math.round(W * 0.06);
  const topo = Math.round(H * (H > W ? 0.27 : 0.3));
  const fotos = itens.slice(0, 4);
  const gap = Math.round(W * 0.016);
  const cols = fotos.length >= 2 ? 2 : 1, linhas = fotos.length > 2 ? 2 : 1;
  const gw = Math.round((W - m * 2 - gap * (cols - 1)) / cols), gh = Math.round((H - topo - m - gap * (linhas - 1)) / linhas);
  const camadas = [];
  for (let i = 0; i < fotos.length; i++) {
    const buf = await imagens.foto(fotos[i].pagina.capa.foto);
    if (!buf) continue;
    const w = fotos.length === 3 && i === 2 ? W - m * 2 : gw;
    const img = await sharp(buf).rotate().resize(w, gh, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
    camadas.push({ input: img, left: m + (i % 2) * (gw + gap), top: topo + Math.floor(i / 2) * (gh + gap) });
  }
  const sel = await selo(Math.round(W * 0.07));
  const meta = await sharp(sel).metadata();
  const tamT = Math.round(W * 0.11);
  const svg = texto('forte', rotulo.toUpperCase(), m, m + Math.round(W * 0.03), Math.round(W * 0.021), P.apoio, { ls: 0.18 })
    + texto('titulo', 'Revista', m, m + Math.round(W * 0.03) + tamT, tamT, P.escuro)
    + texto('italico', cfg.CLIENTE_NOME, m + largura('titulo', 'Revista ', tamT), m + Math.round(W * 0.03) + tamT, tamT, P.destaque)
    + texto('texto', 'Casa, arquitetura e bem-estar, com os imóveis da semana', m, topo - Math.round(W * 0.03), Math.round(W * 0.027), P.escuro, { opacidade: 0.72 })
    + `<rect x="${m}" y="${topo - Math.round(W * 0.016) - 2}" width="${W - m * 2}" height="2" fill="${P.escuro}" fill-opacity=".14"/>`;
  const comp = await sharp(base).composite(camadas).png().toBuffer();
  return montar(comp, W, H, svg + aviso(W, H), [{ input: sel, left: W - m - meta.width, top: m }]);
}

/** Guia do bairro: a foto real (crédito junto), o nome do bairro e o título do guia. */
async function capaBairro(x, W, H) {
  const P = paleta();
  const f = x.pagina.fotos.find((y) => y.id === x.pagina.capa.foto) || x.pagina.fotos[0];
  let buf = null, credito = '';
  if (f && f.commons) { const c = await imagens.commons(f.commons); if (c) { buf = c.buf; credito = c.credito; } }
  else if (f && f.imovel_foto) buf = await imagens.foto(f.imovel_foto);
  const base = await fundoFoto(buf, W, H);
  const m = Math.round(W * 0.065);
  const tag = etiqueta('Guia do bairro', m, m, P.escuro, '#FFFFFF');
  const tamN = Math.round(W * (H > W ? 0.1 : 0.08));
  let y = H - m - 40;
  const partes = [texto('texto', 'Guia completo no site  ·  link na bio', m, y, Math.round(W * 0.022), '#FFFFFF', { opacidade: 0.85 })];
  y -= Math.round(W * 0.06);
  const t = quebra('texto', x.pagina.titulo, Math.round(W * 0.03), W - m * 2, 2);
  for (let i = t.length - 1; i >= 0; i--) { partes.push(texto('media', t[i], m, y, Math.round(W * 0.03), '#FFFFFF', { opacidade: 0.95 })); y -= Math.round(W * 0.043); }
  y -= Math.round(W * 0.02);
  const n = quebra('titulo', x.bairro.nome, tamN, W - m * 2, 2);
  for (let i = n.length - 1; i >= 0; i--) { partes.push(texto('titulo', n[i], m, y, tamN, '#FFFFFF')); y -= tamN; }
  const sel = await selo(Math.round(W * 0.085));
  const meta = await sharp(sel).metadata();
  return montar(base, W, H, degrade(W, H, 0.3, 0.9) + tag.svg + partes.join('') + aviso(W, H, credito), [{ input: sel, left: W - m - meta.width, top: m - 6 }]);
}

module.exports = { FORMATOS, capaImovel, fotoImovel, fim, capaBlog, capaRevista, capaBairro, paleta, specs, precoTexto, signature, dominio, quebra, limpo };
