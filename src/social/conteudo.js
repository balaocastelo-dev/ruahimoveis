// Redes e publicações · o que pode virar post (imóveis no portal, textos do blog, revista da semana,
// guias de bairro), as legendas e o desenho de cada slide. Tudo vem do que JÁ está público no portal
// e no blog: a mesma régua que decide o que aparece no site decide o que vai para as redes.
const cfg = require('../config');
const arte = require('./arte');
const tempo = require('./tempo');

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const tag = (s) => semAcento(s).replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
const hashtags = (lista) => [...new Set(lista.map(tag).filter((t) => t.length >= 3 && t.length <= 30))].slice(0, 12).map((t) => `#${t}`).join(' ');

// ------------------------------------------------------------------ fontes
async function imoveis() {
  try { return await require('../portal/fonte').noAr(); } catch { return []; }
}
async function blog() {
  try {
    const l = await require('../blog/diario').listar({ todos: true });
    return l.filter((a) => a.capa && a.capa.src);
  } catch { return []; }
}
async function bairros() {
  try { return await require('../bairros/fonte').noAr(); } catch { return []; }
}
async function imovel(codigo) { try { return await require('../portal/fonte').porCodigo(codigo); } catch { return null; } }
async function artigo(slug) {
  try {
    const a = await require('../blog/diario').obter(slug);
    if (!a) return null;
    let categoriaNome = null;
    try { categoriaNome = require('../blog/categorias').nomeDaCategoria(a.categoria); } catch { /* sem nome */ }
    return { ...a, categoriaNome };
  } catch { return null; }
}
async function bairro(slug) { try { return await require('../bairros/fonte').porSlug(slug); } catch { return null; } }
const ehSignature = (im) => arte.signature(im);

// ------------------------------------------------------------------ slides de cada tipo
/** Os slides de um imóvel: a capa, até 5 fotos com legenda do ambiente e o convite final. */
function slidesImovel(x) {
  const fotos = (x.pagina.galeria && x.pagina.galeria.length ? x.pagina.galeria : x.imovel.fotos.map((foto) => ({ foto, legenda: '' })))
    .filter((g) => g.foto !== x.pagina.capa.foto).slice(0, 5);
  return [{ k: 'capa' }, ...fotos.map((g) => ({ k: 'foto', foto: g.foto, legenda: g.legenda || '' })), { k: 'fim' }];
}
function slidesRevista(itens) {
  return [{ k: 'revista' }, ...itens.map((x) => ({ k: 'item', codigo: x.imovel.codigo })), { k: 'fim' }];
}

// ------------------------------------------------------------------ legendas
const site = () => arte.dominio();
function legendaImovel(x) {
  const { imovel: im, pagina: p } = x;
  const tags = hashtags([im.tipo, im.bairro, im.cidade, 'imoveis', 'imovelavenda', `imoveis${im.cidade || ''}`, cfg.CLIENTE_NOME, ...(p.redes ? p.redes.hashtags : [])]);
  if (p.redes && p.redes.legenda) {
    return { legenda: `${p.redes.legenda.trim()}\n\n${ehSignature(im) ? `${cfg.CLIENTE_NOME} Signature · valor para membros` : im.valor ? `Valor: ${arte.precoTexto(im)}` : ''}\nCódigo ${im.codigo}`.trim(), hashtags: tags };
  }
  const s = arte.specs(im).replace(/ {2}· {2}/g, ' · ');
  const linhas = [
    p.titulo,
    '',
    p.resumo || '',
    '',
    s ? `• ${s}` : '',
    `• ${ehSignature(im) ? `${cfg.CLIENTE_NOME} Signature · valor para membros` : arte.precoTexto(im)}`,
    '',
    `Código ${im.codigo}. Quer ver de perto? A equipe ${cfg.CLIENTE_NOME} agenda a visita para você.`,
  ];
  return { legenda: linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim(), hashtags: tags };
}
function legendaBlog(a) {
  const tags = hashtags([...(a.redes ? a.redes.hashtags : []), ...(a.etiquetas || []), 'casa', 'morarbem', cfg.CLIENTE_NOME]);
  if (a.redes && a.redes.legenda) return { legenda: a.redes.legenda.trim(), hashtags: tags };
  return { legenda: `${a.titulo}\n\n${a.resumo || ''}\n\nO texto completo está no ${cfg.BLOG_NOME}.`.trim(), hashtags: tags };
}
function legendaRevista(itens, rotulo) {
  const linhas = [
    `Revista ${cfg.CLIENTE_NOME} · ${rotulo}`,
    '',
    'Casa, arquitetura e bem-estar, com os imóveis desta semana:',
    ...itens.map((x) => `• ${x.pagina.titulo}${x.imovel.bairro ? ` (${x.imovel.bairro})` : ''}`),
    '',
    'Arraste para o lado para ver cada um. A revista completa está no nosso site.',
  ];
  return { legenda: linhas.join('\n'), hashtags: hashtags(['revista', 'arquitetura', 'decoracao', 'morarbem', 'imoveis', cfg.CIDADE_PADRAO, cfg.CLIENTE_NOME]) };
}
function legendaBairro(x) {
  const p = x.pagina;
  const resumo = p.resumo || p.descricao || '';
  return {
    legenda: `${p.titulo}\n\n${resumo}\n\nO guia completo de ${x.bairro.nome}, com escolas, parques, comércio e o que mais tem perto, está no nosso site.`.trim(),
    hashtags: hashtags([x.bairro.nome, cfg.CIDADE_PADRAO, 'bairro', 'guiadobairro', 'morarbem', cfg.CLIENTE_NOME]),
  };
}

/** Rótulo da revista de uma semana: "semana de 2 de novembro". */
function rotuloSemana(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return `semana de ${d.getUTCDate()} de ${tempo.MESES[d.getUTCMonth()]}`;
}

/**
 * Monta o conteúdo AO VIVO de um post (para desenhar e para publicar). null = não existe mais
 * (imóvel vendido ou retirado, texto fora do ar…).
 */
async function vivo(post) {
  const slides = JSON.parse(post.slides || '[]');
  if (post.tipo === 'imovel') {
    const x = await imovel(post.ref);
    if (!x) return null;
    return { tipo: 'imovel', x, slides, link: `/imoveis/${x.pagina.slug}`, ...legendaImovel(x) };
  }
  if (post.tipo === 'blog') {
    const a = await artigo(post.ref);
    if (!a) return null;
    return { tipo: 'blog', a, slides, link: `/blog/${a.slug}`, ...legendaBlog(a) };
  }
  if (post.tipo === 'revista') {
    const itens = [];
    for (const s of slides.filter((y) => y.k === 'item')) { const x = await imovel(s.codigo); if (x && !ehSignature(x.imovel)) itens.push(x); }
    if (!itens.length) return null;
    const dia = String(post.agendado_para).slice(0, 10);
    const rotulo = rotuloSemana(dia);
    return { tipo: 'revista', itens, rotulo, slides: [{ k: 'revista' }, ...itens.map((x) => ({ k: 'item', codigo: x.imovel.codigo })), { k: 'fim' }], link: '/imoveis/revista', ...legendaRevista(itens, rotulo) };
  }
  if (post.tipo === 'bairro') {
    const x = await bairro(post.ref);
    if (!x) return null;
    return { tipo: 'bairro', x, slides, link: `/bairros/${x.bairro.slug}`, ...legendaBairro(x) };
  }
  return null;
}

/** Desenha o slide n de um post (JPEG). formato: feed | google. */
async function desenhar(post, n, formato = 'feed') {
  const [W, H] = arte.FORMATOS[formato] || arte.FORMATOS.feed;
  const v = await vivo(post);
  if (!v) return null;
  const s = v.slides[n];
  if (!s) return null;
  if (v.tipo === 'imovel') {
    if (s.k === 'capa') return arte.capaImovel(v.x, W, H);
    if (s.k === 'foto') return arte.fotoImovel(v.x, s.foto, s.legenda, W, H);
    if (s.k === 'fim') return arte.fim(W, H, 'Agende sua visita', null, v.link.length < 34 ? v.link : '/imoveis');
  }
  if (v.tipo === 'blog') return arte.capaBlog(v.a, W, H);
  if (v.tipo === 'bairro') return arte.capaBairro(v.x, W, H);
  if (v.tipo === 'revista') {
    if (s.k === 'revista') return arte.capaRevista(v.itens, v.rotulo, W, H);
    if (s.k === 'item') { const x = v.itens.find((y) => y.imovel.codigo === s.codigo); return x ? arte.capaImovel(x, W, H, { etiqueta: `Revista ${cfg.CLIENTE_NOME}`, rodape: 'revista no link da bio' }) : null; }
    if (s.k === 'fim') return arte.fim(W, H, 'Leia a revista completa', `Os ensaios da semana sobre como morar bem e todos os imóveis da ${cfg.CLIENTE_NOME}.`, '/imoveis/revista');
  }
  return null;
}

module.exports = { imoveis, blog, bairros, imovel, artigo, bairro, slidesImovel, slidesRevista, legendaImovel, legendaBlog, legendaRevista, legendaBairro, rotuloSemana, vivo, desenhar, ehSignature, hashtags };
