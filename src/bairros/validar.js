// Bairros · confere o FORMATO da página de um bairro que chega do ramo de
// conteúdo. Devolve a página íntegra ou a lista do que está errado; nunca uma
// página pela metade. O CONTEÚDO quem julga é a régua (regua.js).
//
// Página = lista de blocos tipados, nunca HTML:
//   paragrafo · titulo (nivel 2|3) · resumo · lista · destaque · fotos · chamada
// e a lista de fotos da página, cada uma com id (f1, f2…), legenda e texto
// alternativo, vindas do Wikimedia Commons ("commons") ou de um imóvel do cliente
// à venda no bairro ("imovel_foto", o número da foto no sistema).

const { TEMAS, SLUG, ARQUIVO_COMMONS, ID_FOTO } = require('./config');
const { CLIENTE_NOME } = require('../config'); // nome da imobiliária, da configuração

const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const lista = (v) => Array.isArray(v);
const objeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const textos = (v) => lista(v) && v.length > 0 && v.every(texto);
const data = (v) => texto(v) && Number.isFinite(Date.parse(v));

function lerBloco(v, i, erros) {
  const onde = `bloco ${i + 1}`;
  if (!objeto(v) || !texto(v.tipo)) { erros.push(`${onde}: sem o campo "tipo".`); return null; }
  const falha = (m) => { erros.push(`${onde} (${String(v.tipo)}): ${m}`); return null; };
  switch (v.tipo) {
    case 'paragrafo':
      return texto(v.texto) ? { tipo: 'paragrafo', texto: v.texto.trim() } : falha('falta o texto.');
    case 'titulo':
      if (!texto(v.texto)) return falha('falta o texto.');
      if (v.nivel !== 2 && v.nivel !== 3) return falha('nivel deve ser 2 ou 3.');
      return { tipo: 'titulo', nivel: v.nivel, texto: v.texto.trim() };
    case 'lista':
      return textos(v.itens) ? { tipo: 'lista', itens: v.itens.map((x) => x.trim()) } : falha('itens deve ser uma lista de textos.');
    case 'resumo':
      return textos(v.itens) ? { tipo: 'resumo', itens: v.itens.map((x) => x.trim()), ...(texto(v.titulo) ? { titulo: v.titulo.trim() } : {}) } : falha('itens deve ser uma lista de textos.');
    case 'destaque':
      if (!['dica', 'nota'].includes(v.tom)) return falha('tom deve ser "dica" ou "nota".');
      return texto(v.texto) ? { tipo: 'destaque', tom: v.tom, texto: v.texto.trim(), ...(texto(v.titulo) ? { titulo: v.titulo.trim() } : {}) } : falha('falta o texto.');
    case 'fotos':
      if (!lista(v.fotos) || v.fotos.length < 1 || v.fotos.length > 3 || !v.fotos.every((f) => texto(f) && ID_FOTO.test(f))) return falha('fotos deve ser uma lista de 1 a 3 ids de foto da página (ex.: ["f2", "f3"]).');
      return { tipo: 'fotos', fotos: [...v.fotos] };
    case 'chamada':
      if (!texto(v.tema) || !TEMAS.has(v.tema)) return falha(`tema deve ser um destes: ${[...TEMAS].join(', ')}.`);
      if (v.titulo || v.texto || v.rotulo || v.href) return falha('a chamada leva só o tema: o texto já está escrito no sistema.');
      return { tipo: 'chamada', tema: v.tema };
    default:
      return falha('tipo de bloco desconhecido (use paragrafo, titulo, resumo, lista, destaque, fotos ou chamada).');
  }
}

function lerFoto(f, i, erros) {
  const onde = `fotos, item ${i + 1}`;
  if (!objeto(f) || !texto(f.id) || !ID_FOTO.test(f.id)) { erros.push(`${onde}: "id" deve ser f1, f2, f3…`); return null; }
  if (!texto(f.legenda) || !texto(f.alt)) { erros.push(`${onde} (${f.id}): precisa de "legenda" (o que aparece embaixo) e "alt" (o que a foto mostra, para quem não vê).`); return null; }
  const base = { id: f.id, legenda: f.legenda.trim(), alt: f.alt.trim() };
  if (texto(f.commons) && f.imovel_foto === undefined) {
    const t = f.commons.trim().replace(/^Arquivo:/i, 'File:').replace(/_/g, ' ');
    if (!ARQUIVO_COMMONS.test(t)) { erros.push(`${onde} (${f.id}): "commons" deve ser o nome do arquivo no Commons, como "File:Lagoa do Taquaral.jpg".`); return null; }
    return { ...base, commons: t };
  }
  if (Number.isInteger(f.imovel_foto) && f.imovel_foto > 0 && f.commons === undefined) return { ...base, imovel_foto: f.imovel_foto };
  erros.push(`${onde} (${f.id}): diga a origem com "commons" (arquivo do Wikimedia Commons) OU "imovel_foto" (o número da foto de um imóvel da ${CLIENTE_NOME} no bairro).`);
  return null;
}

function lerPagina(bruto) {
  const erros = [];
  if (!objeto(bruto)) return { ok: false, erros: ['O arquivo não contém uma página.'] };
  if (!texto(bruto.slug) || !SLUG.test(bruto.slug)) erros.push('slug ausente ou fora do formato (o slug do bairro, como aparece no dados.json).');
  if (!texto(bruto.titulo)) erros.push('falta o titulo.');
  if (!texto(bruto.resumo)) erros.push('falta o resumo.');
  if (!lista(bruto.blocos) || bruto.blocos.length === 0) erros.push('falta a lista de blocos.');

  const blocos = [];
  if (lista(bruto.blocos)) bruto.blocos.forEach((b, i) => { const l = lerBloco(b, i, erros); if (l) blocos.push(l); });

  const fotos = [];
  if (!lista(bruto.fotos) || bruto.fotos.length === 0) erros.push('falta a lista "fotos" (as fotos reais da página, com id, origem, legenda e alt).');
  else {
    const ids = new Set();
    const origens = new Set();
    bruto.fotos.forEach((f, i) => {
      const l = lerFoto(f, i, erros);
      if (!l) return;
      if (ids.has(l.id)) { erros.push(`fotos: o id ${l.id} aparece duas vezes.`); return; }
      const origem = l.commons || `imovel:${l.imovel_foto}`;
      if (origens.has(origem)) { erros.push(`fotos: a mesma foto (${l.commons || l.imovel_foto}) aparece duas vezes.`); return; }
      ids.add(l.id); origens.add(origem); fotos.push(l);
    });
  }
  let capa = null;
  if (!objeto(bruto.capa) || !texto(bruto.capa.foto) || !ID_FOTO.test(bruto.capa.foto)) erros.push('capa precisa de "foto": o id de uma das fotos da página (ex.: "f1").');
  else capa = { foto: bruto.capa.foto };

  const perguntas = [];
  if (!lista(bruto.perguntas)) erros.push('falta a lista de perguntas frequentes.');
  else for (const p of bruto.perguntas) {
    if (objeto(p) && texto(p.pergunta) && texto(p.resposta)) perguntas.push({ pergunta: p.pergunta.trim(), resposta: p.resposta.trim() });
    else erros.push('cada pergunta precisa de pergunta e resposta.');
  }
  const fontes = [];
  if (!lista(bruto.fontes)) erros.push('falta a lista de fontes (de onde vieram os fatos sobre o bairro).');
  else for (const f of bruto.fontes) {
    if (objeto(f) && texto(f.nome)) fontes.push({ nome: f.nome.trim(), ...(texto(f.site) ? { site: f.site.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') } : {}) });
    else erros.push('cada fonte precisa de "nome" (e, se tiver, "site", só o domínio, como prefeitura.campinas.sp.gov.br).');
  }
  let redes = null;
  if (bruto.redes !== undefined) {
    if (!objeto(bruto.redes) || !texto(bruto.redes.legenda) || !textos(bruto.redes.hashtags)) erros.push('redes deve ter legenda (texto) e hashtags (lista de textos).');
    else redes = { legenda: bruto.redes.legenda.trim(), hashtags: bruto.redes.hashtags.map((h) => h.replace(/^#/, '').trim()) };
  }
  const seo = objeto(bruto.seo) && texto(bruto.seo.titulo) ? { titulo: bruto.seo.titulo.trim() } : undefined;

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      slug: bruto.slug,
      titulo: bruto.titulo.trim(),
      resumo: bruto.resumo.trim(),
      capa,
      fotos,
      blocos,
      perguntas,
      fontes,
      ...(redes ? { redes } : {}),
      ...(seo ? { seo } : {}),
      ...(data(bruto.publicadoEm) ? { publicadoEm: new Date(bruto.publicadoEm).toISOString() } : {}),
      ...(data(bruto.atualizadoEm) ? { atualizadoEm: new Date(bruto.atualizadoEm).toISOString() } : {}),
    },
  };
}

/** Uma linha do índice: o que a lista pública precisa. */
function lerLinha(b) {
  if (!objeto(b) || !texto(b.slug) || !SLUG.test(b.slug) || !texto(b.titulo) || !texto(b.resumo)) return null;
  return {
    slug: b.slug, titulo: b.titulo.trim(), resumo: b.resumo.trim(),
    publicadoEm: data(b.publicadoEm) ? new Date(b.publicadoEm).toISOString() : null,
    atualizadoEm: data(b.atualizadoEm) ? new Date(b.atualizadoEm).toISOString() : null,
  };
}

module.exports = { lerPagina, lerLinha };
