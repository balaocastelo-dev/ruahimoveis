// Bairros · as páginas públicas, montadas no servidor (Google e IAs leem o texto,
// os números e os dados estruturados direto do HTML, sem JavaScript).
//
//   /bairros            os bairros de Campinas com página, por região
//   /bairros/<bairro>   o guia do bairro: texto pesquisado, fotos reais, números ao vivo,
//                       imóveis da RUAH no bairro, o que tem perto, prédios e perguntas

const { CHAMADAS } = require('./config');
const { lerTextoRico, montarSumario, dataPorExtenso } = require('../blog/texto');
const portal = require('../portal/paginas');
const commons = require('./commons');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const reais = (v) => (v ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : null);
const mil = (n) => Number(n || 0).toLocaleString('pt-BR');
const plural = (n, um, varios) => `${mil(n)} ${n === 1 ? um : varios}`;
const REGIOES = ['Região central', 'Leste', 'Norte', 'Barão Geraldo', 'Sousas e Joaquim Egídio', 'Sul', 'Oeste e Sudoeste'];

function rico(texto) {
  const desenhar = (t) => t.map((x) => (x.tipo === 'texto' ? esc(x.valor) : x.tipo === 'negrito' ? `<strong>${desenhar(x.filhos)}</strong>`
    : x.tipo === 'italico' ? `<em>${desenhar(x.filhos)}</em>` : desenhar(x.filhos))).join('');
  return desenhar(lerTextoRico(texto));
}

const numDaFoto = (id) => id.slice(1);
const urlFotoCommons = (slug, id, largura) => `/bairros/${slug}/foto/${numDaFoto(id)}${largura ? `?l=${largura}` : ''}`;

/**
 * As fotos da página que podem aparecer agora: as do Commons com licença conferida
 * e as de imóveis da RUAH que continuam à venda. Cada uma com src e crédito.
 */
async function fotosValidas(x, fotosPublicas) {
  const saida = new Map();
  await Promise.all(x.pagina.fotos.map(async (f) => {
    if (f.imovel_foto) {
      if (fotosPublicas.has(f.imovel_foto)) saida.set(f.id, { ...f, src: portal.fotoUrl(f.imovel_foto), credito: 'Foto: RUAH Investimentos Imobiliários', ver: String(f.imovel_foto) });
      return;
    }
    let c = null;
    try { c = await commons.info(f.commons); } catch { c = null; }
    if (c && c.ok) saida.set(f.id, { ...f, src: urlFotoCommons(x.bairro.slug, f.id), srcPequena: urlFotoCommons(x.bairro.slug, f.id, 500), credito: commons.credito(c), autor: c.autor, licenca: c.licenca, largura: c.largura, altura: c.altura, ver: numDaFoto(f.id) });
  }));
  return x.pagina.fotos.map((f) => saida.get(f.id)).filter(Boolean);
}

function figura(f, { eager = false } = {}) {
  return `<figure><button type="button" data-ver="${esc(f.ver)}" aria-label="Ampliar: ${esc(f.legenda)}"><img src="${esc(f.src)}" alt="${esc(f.alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="1280" height="853"></button><figcaption>${esc(f.legenda)}<span class="b-credito">${esc(f.credito)}</span></figcaption></figure>`;
}

function chamada(tema, temImoveis) {
  const c = CHAMADAS[tema];
  const href = tema === 'imoveis' ? (temImoveis ? '#imoveis' : '/imoveis') : '#contato';
  return `<aside class="p-chamada"><div><p class="p-chamada-t">${esc(c.titulo)}</p><p>${esc(c.texto)}</p></div>
<a class="p-botao" href="${href}"${tema === 'imoveis' ? '' : ` data-motivo="${tema === 'vender' ? 'vender' : 'comprar'}"`}>${esc(c.rotulo)}</a></aside>`;
}

function bloco(b, ids, ctx) {
  switch (b.tipo) {
    case 'paragrafo': return `<p>${rico(b.texto)}</p>`;
    case 'titulo': return `<h${b.nivel} id="${esc(ids.get(b))}">${esc(b.texto)}</h${b.nivel}>`;
    case 'resumo': return `<section class="p-destaques" aria-label="${esc(b.titulo || 'O bairro em poucas linhas')}"><p class="p-destaques-t">${esc(b.titulo || 'O bairro em poucas linhas')}</p><ul>${b.itens.map((i) => `<li>${rico(i)}</li>`).join('')}</ul></section>`;
    case 'lista': return `<ul class="p-lista">${b.itens.map((i) => `<li>${rico(i)}</li>`).join('')}</ul>`;
    case 'destaque': return `<div class="p-nota ${esc(b.tom)}">${b.titulo ? `<p class="p-nota-t">${esc(b.titulo)}</p>` : ''}<p>${rico(b.texto)}</p></div>`;
    case 'fotos': {
      const fotos = b.fotos.map((id) => ctx.fotos.get(id)).filter(Boolean);
      return fotos.length ? `<div class="p-fotos p-fotos-${fotos.length}">${fotos.map((f) => figura(f)).join('')}</div>` : '';
    }
    case 'chamada': return chamada(b.tema, ctx.temImoveis);
    default: return '';
  }
}

// ------------------------------------------------------------------ partes ao vivo
function numeros(b, v) {
  const itens = [];
  if (v.carteira.total) itens.push([mil(v.carteira.total), v.carteira.total === 1 ? 'imóvel da RUAH à venda' : 'imóveis da RUAH à venda']);
  if (v.condominios.verticais) itens.push([mil(v.condominios.verticais), v.condominios.verticais === 1 ? 'prédio residencial' : 'prédios residenciais']);
  if (v.condominios.horizontais) itens.push([mil(v.condominios.horizontais), v.condominios.horizontais === 1 ? 'condomínio de casas' : 'condomínios de casas']);
  if (v.condominios.unidades >= 50) itens.push([mil(v.condominios.unidades), 'unidades nesses prédios (Censo 2022)']);
  if (v.condominios.maisAlto >= 4) itens.push([`${v.condominios.maisAlto}`, 'andares no prédio mais alto']);
  const cat = (id) => v.perto && v.perto.categorias.find((c) => c.id === id);
  for (const [id, um, varios] of [['escolas', 'escola', 'escolas'], ['parques', 'parque ou área de esporte', 'parques e áreas de esporte'], ['mercados', 'mercado ou padaria', 'mercados e padarias'], ['saude', 'serviço de saúde', 'serviços de saúde']]) {
    const c = cat(id); if (c && c.total) itens.push([mil(c.total), varios && c.total !== 1 ? `${varios} perto` : `${um} perto`]);
  }
  if (!itens.length) return '';
  return `<section class="b-numeros" aria-labelledby="numeros-t"><h2 id="numeros-t" class="b-rot">${esc(b.nome)} em números</h2><ul>${itens.slice(0, 8).map(([n, t]) => `<li><b>${esc(n)}</b><span>${esc(t)}</span></li>`).join('')}</ul>
<p class="b-nota-viva">Atualizado sozinho a partir da carteira da RUAH, da base de condomínios (Receita Federal e IBGE) e de mapas abertos (Overture e OpenStreetMap), num raio de 1,5 km do centro do bairro.</p></section>`;
}

function imoveis(b, lista) {
  if (!lista.length) return '';
  return `<section class="p-cd-sec" id="imoveis" aria-labelledby="imoveis-t"><h2 id="imoveis-t">Imóveis da RUAH à venda no ${esc(b.nome)}</h2>
<p class="p-cd-sub">A foto de cada cartão mostra o prédio ou a casa por fora. Valores atualizados na ficha de cada imóvel.</p>
<div class="p-grade">${lista.map((x) => `<article class="p-cartao" data-codigo="${esc(x.imovel.codigo)}">
<a class="p-cartao-img" href="/imoveis/${esc(x.pagina.slug)}"><img src="${portal.fotoUrl(x.fotoDoPredio.foto)}" alt="${esc(x.fotoDoPredio.legenda)}" width="1280" height="853" loading="lazy" decoding="async"><span class="p-cartao-n">${x.imovel.fotos.length} fotos</span></a>
<div class="p-cartao-t"><p class="p-cartao-tipo">${esc(x.imovel.tipo)}${x.imovel.condominio ? ` · ${esc(x.imovel.condominio)}` : ''}</p>
<h3><a href="/imoveis/${esc(x.pagina.slug)}">${esc(x.pagina.titulo)}</a></h3>
<p class="p-preco">${x.imovel.valor ? esc(reais(x.imovel.valor)) : 'Valor sob consulta'}</p></div></article>`).join('')}</div></section>`;
}

function perto(b, v) {
  const cats = ((v.perto && v.perto.categorias) || []).filter((c) => c.itens.length);
  if (!cats.length) return '';
  return `<section class="p-cd-sec" aria-labelledby="perto-t"><h2 id="perto-t">O que tem no ${esc(b.nome)} e em volta</h2>
<p class="p-cd-sub">Os lugares mais próximos do centro do bairro, com o tempo aproximado a pé.</p>
<div class="p-cd-perto">${cats.map((c) => `<div class="p-cd-cat"><h3><span aria-hidden="true">${c.icone}</span> ${esc(c.nome)} <span class="b-total">${mil(c.total)}</span></h3><ul>${c.itens.slice(0, 5).map((x) => `<li><span>${esc(x.nome)}</span><span>${x.min} min</span></li>`).join('')}</ul></div>`).join('')}</div>
<p class="p-cd-sub p-cd-nota">Fonte: ${esc(v.perto.fonte)}.</p></section>`;
}

function predios(b, v) {
  const c = v.condominios;
  if (!c.total) return '';
  const publicos = process.env.CONDOMINIOS_PUBLICOS === '1';
  return `<section class="p-cd-sec" aria-labelledby="predios-t"><h2 id="predios-t">Prédios e condomínios do ${esc(b.nome)}</h2>
<p class="p-cd-sub">${plural(c.total, 'condomínio residencial', 'condomínios residenciais')} na base da RUAH${c.verticais ? `, ${plural(c.verticais, 'prédio', 'prédios')}` : ''}${c.horizontais ? ` e ${plural(c.horizontais, 'condomínio de casas', 'condomínios de casas')}` : ''}. Alguns dos nomes:</p>
${c.nomes.length ? `<ul class="p-cd-chips">${c.nomes.slice(0, 30).map((x) => `<li>${publicos && x.slug ? `<a href="/condominios/${esc(x.slug)}">${esc(x.nome)}</a>` : esc(x.nome)}${x.andares ? ` <span class="b-total">${x.andares} andares</span>` : ''}</li>`).join('')}</ul>` : ''}
<p class="p-cd-sub p-cd-nota">Fonte: cadastro de condomínios da Receita Federal, Censo 2022 (IBGE) e OpenStreetMap. Quer saber se há unidade à venda num deles? <a href="#contato" data-motivo="comprar">Pergunte à RUAH</a>.</p></section>`;
}

function formulario(b) {
  return `<section class="p-contato" id="contato" aria-labelledby="contato-t">
<div class="p-contato-txt"><h2 id="contato-t">Fale com a RUAH sobre o ${esc(b.nome)}</h2>
<p>Procurando imóvel no bairro, querendo vender o seu ou com alguma dúvida sobre a região? Deixe seu contato e um corretor responde em horário comercial.</p></div>
<form class="p-form" data-bairro-contato novalidate>
  <input type="hidden" name="bairro" value="${esc(b.slug)}">
  <label class="p-armadilha" aria-hidden="true">Empresa<input name="empresa" tabindex="-1" autocomplete="off"></label>
  <label class="p-campo p-largo"><span>Você quer</span><select name="motivo"><option value="comprar">Comprar no bairro</option><option value="vender">Vender um imóvel no bairro</option><option value="duvida">Tirar uma dúvida</option></select></label>
  <label class="p-campo"><span>Nome</span><input name="nome" required autocomplete="name" maxlength="120"></label>
  <label class="p-campo"><span>WhatsApp ou telefone</span><input name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(19) 99999-9999"></label>
  <label class="p-campo p-largo"><span>E-mail <i>(opcional)</i></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
  <label class="p-campo p-largo"><span>Mensagem</span><textarea name="mensagem" rows="3" maxlength="1000" placeholder="Ex.: procuro apartamento de 3 quartos perto do parque"></textarea></label>
  <label class="p-check p-largo"><input type="checkbox" name="aceite" value="1" required> Concordo que a RUAH use estes dados só para falar comigo sobre imóveis. Posso pedir para sair a qualquer momento.</label>
  <button class="p-botao p-largo" type="submit">Enviar para a RUAH</button>
  <p class="p-form-msg p-largo" role="status" aria-live="polite" hidden></p>
</form></section>`;
}

// ------------------------------------------------------------------ a página do bairro
async function paginaBairro(req, x, ctx) {
  const { bairro: b, pagina: p } = x;
  const base = portal.urlBase(req);
  const url = `${base}/bairros/${b.slug}`;
  const fotos = await fotosValidas(x, ctx.fotosPublicas);
  const porId = new Map(fotos.map((f) => [f.id, f]));
  const capa = porId.get(p.capa.foto) || fotos[0] || null;
  const v = ctx.vivo;
  const lista = ctx.imoveis;
  const { sumario, ids } = montarSumario(p.blocos);
  const secoes = sumario.filter((s) => s.nivel === 2);
  const data = p.atualizadoEm || p.publicadoEm;
  const vizinhos = ctx.outros.filter((o) => o.bairro.slug !== b.slug).map((o) => ({ o, mesma: o.bairro.regiao && o.bairro.regiao === b.regiao })).sort((a, c) => c.mesma - a.mesma).slice(0, 6).map((a) => a.o);

  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'Article', headline: p.titulo, description: p.resumo, url, inLanguage: 'pt-BR',
      ...(p.publicadoEm ? { datePublished: p.publicadoEm } : {}), ...(data ? { dateModified: data } : {}),
      ...(capa ? { image: fotos.slice(0, 6).map((f) => `${base}${f.src}`) } : {}),
      author: { '@type': 'Organization', name: 'RUAH Investimentos Imobiliários', url: `${base}/imoveis` },
      publisher: { '@type': 'RealEstateAgent', name: 'RUAH Investimentos Imobiliários', url: `${base}/imoveis`, areaServed: 'Campinas, SP' },
      about: {
        '@type': 'Place', name: `${b.nome}, Campinas`, ...(b.apelidos.length ? { alternateName: b.apelidos.slice(0, 5) } : {}),
        address: { '@type': 'PostalAddress', addressLocality: 'Campinas', addressRegion: 'SP', addressCountry: 'BR' },
        containedInPlace: { '@type': 'City', name: 'Campinas', address: { '@type': 'PostalAddress', addressRegion: 'SP', addressCountry: 'BR' } },
        ...(v.centro ? { geo: { '@type': 'GeoCoordinates', latitude: v.centro.lat, longitude: v.centro.lon } } : {}),
        ...(capa ? { photo: { '@type': 'ImageObject', url: `${base}${capa.src}`, caption: capa.legenda, ...(capa.autor ? { creditText: capa.credito, license: capa.licenca } : {}) } } : {}),
      },
      ...(p.fontes.length ? { citation: p.fontes.map((f) => `${f.nome}${f.site ? ` (${f.site})` : ''}`) } : {}),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Imóveis', item: `${base}/imoveis` },
        { '@type': 'ListItem', position: 2, name: 'Bairros de Campinas', item: `${base}/bairros` },
        { '@type': 'ListItem', position: 3, name: b.nome, item: url },
      ],
    },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.perguntas.map((q) => ({ '@type': 'Question', name: q.pergunta, acceptedAnswer: { '@type': 'Answer', text: q.resposta } })) },
  ];
  if (lista.length) ld.push({ '@context': 'https://schema.org', '@type': 'ItemList', name: `Imóveis à venda no ${b.nome}, Campinas`, numberOfItems: lista.length, itemListElement: lista.map((y, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/imoveis/${y.pagina.slug}`, name: y.pagina.titulo })) });

  const galeria = fotos.map((f) => ({ src: f.src, legenda: `${f.legenda} — ${f.credito}` }));
  const corpo = `
<nav class="p-trilha" aria-label="Você está em"><a href="/imoveis">Imóveis</a> <span aria-hidden="true">›</span> <a href="/bairros">Bairros de Campinas</a>${b.regiao ? ` <span aria-hidden="true">›</span> <a href="/bairros#${esc(b.regiao.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'))}">${esc(b.regiao)}</a>` : ''}</nav>
<section class="b-hero" data-galeria='${esc(JSON.stringify(galeria))}'>
  ${capa ? `<button type="button" class="b-hero-foto" data-ver="${esc(capa.ver)}" aria-label="Ampliar: ${esc(capa.legenda)}"><img src="${esc(capa.src)}" alt="${esc(capa.alt)}" fetchpriority="high" decoding="async" width="1280" height="853"></button>` : ''}
  <div class="b-hero-txt">
    <p class="p-sobre">Guia de bairro · Campinas${b.regiao ? ` · ${esc(b.regiao)}` : ''}</p>
    <h1>${esc(p.titulo)}</h1>
    <p class="p-linha-fina">${esc(p.resumo)}</p>
    <p class="b-data">${data ? `Atualizado em ${esc(dataPorExtenso(data))}` : ''}${capa ? `<span>Capa: ${esc(capa.legenda)} (${esc(capa.credito)})</span>` : ''}</p>
  </div>
</section>
${numeros(b, v)}
<div class="p-im-corpo">
<div class="p-im-texto">
  ${secoes.length >= 3 ? `<nav class="p-sumario" aria-label="Nesta página"><span>Nesta página:</span>${secoes.map((s) => `<a href="#${esc(s.id)}">${esc(s.texto)}</a>`).join('')}${lista.length ? '<a href="#imoveis">Imóveis à venda</a>' : ''}<a href="#faq">Perguntas</a></nav>` : ''}
  <div class="p-texto">
  ${p.blocos.map((bl) => bloco(bl, ids, { fotos: porId, temImoveis: lista.length > 0 })).join('\n')}
  </div>
</div>
<aside class="p-lado" aria-label="Imóveis e contato">
  <div class="p-lado-caixa">
    <p class="p-lado-rot">Imóveis da RUAH no bairro</p>
    <p class="p-lado-preco">${v.carteira.total ? mil(v.carteira.total) : 'Sob consulta'}</p>
    ${v.carteira.total && v.carteira.menor ? `<p class="p-lado-taxas">${v.carteira.menor === v.carteira.maior ? `A partir de ${esc(reais(v.carteira.menor))}` : `De ${esc(reais(v.carteira.menor))} a ${esc(reais(v.carteira.maior))}`}</p>` : '<p class="p-lado-taxas">Conte o que procura: a RUAH busca para você.</p>'}
    ${lista.length ? '<a class="p-botao" href="#imoveis">Ver os imóveis</a>' : '<a class="p-botao" href="/imoveis">Ver todos os imóveis</a>'}
    <a class="p-botao sec" href="#contato" data-motivo="comprar">Procuro imóvel aqui</a>
    <a class="p-botao sec" href="#contato" data-motivo="vender">Quero vender no bairro</a>
    <div class="p-lado-acoes"><button class="p-link" type="button" data-compartilhar="${esc(url)}" data-titulo="${esc(p.titulo)}">Compartilhar</button></div>
  </div>
</aside>
</div>
${imoveis(b, lista)}
${perto(b, v)}
${predios(b, v)}
<section class="p-cd-sec p-faq" aria-labelledby="faq"><h2 id="faq">Perguntas frequentes sobre o ${esc(b.nome)}</h2>${p.perguntas.map((q) => `<details><summary>${esc(q.pergunta)}</summary><p>${esc(q.resposta)}</p></details>`).join('')}</section>
${formulario(b)}
${vizinhos.length ? `<section class="p-cd-sec" aria-labelledby="vizinhos-t"><h2 id="vizinhos-t">Outros bairros</h2><div class="b-lista">${vizinhos.map((o) => cartaoBairro(o, ctx.capas.get(o.bairro.slug))).join('')}</div></section>` : ''}
<section class="b-fontes" aria-label="Fontes e créditos">
  <p><b>Fontes consultadas:</b> ${p.fontes.map((f) => `${esc(f.nome)}${f.site ? ` (${esc(f.site)})` : ''}`).join('; ')}.</p>
  <p><b>Fotos:</b> ${fotos.map((f) => `${esc(f.legenda)} — ${esc(f.credito)}`).join('; ')}. As fotos do Wikimedia Commons são usadas conforme a licença indicada, sem alteração.</p>
  <p>Texto escrito pela equipe de conteúdo da RUAH a partir de fontes públicas. Números da seção "em números" e a lista de imóveis são atualizados automaticamente.</p>
</section>`;

  return portal.casca(req, {
    titulo: `${(p.seo && p.seo.titulo) || p.titulo} · RUAH`, descricao: p.resumo, caminho: `/bairros/${b.slug}`,
    imagem: capa ? capa.src : null, ld, corpo, classe: 'p-pagina-imovel b-pagina',
  });
}

// ------------------------------------------------------------------ a lista
function cartaoBairro(x, capa) {
  const n = x.imoveis || 0;
  return `<article class="b-cartao"><a href="/bairros/${esc(x.bairro.slug)}">
<span class="b-cartao-img">${capa ? `<img src="${esc(capa.src)}" alt="${esc(capa.alt)}" loading="lazy" decoding="async" width="640" height="427">` : ''}</span>
<span class="b-cartao-t"><span class="p-cartao-tipo">${esc(x.bairro.regiao || 'Campinas')}${n ? ` · ${plural(n, 'imóvel à venda', 'imóveis à venda')}` : ''}</span>
<span class="b-cartao-n">${esc(x.bairro.nome)}</span><span class="b-cartao-r">${esc(x.pagina.resumo)}</span></span></a></article>`;
}

function paginaLista(req, lista, capas) {
  const base = portal.urlBase(req);
  const grupos = new Map();
  for (const x of lista) { const r = x.bairro.regiao || 'Outros bairros'; if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(x); }
  const ordem = [...grupos.keys()].sort((a, c) => (REGIOES.indexOf(a) + 1 || 99) - (REGIOES.indexOf(c) + 1 || 99));
  const ancora = (r) => r.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  const corpo = `
<section class="p-hero p-hero-curto"><p class="p-sobre">Guias de bairro · RUAH</p><h1>Bairros de Campinas</h1>
<p class="p-hero-l">Como é morar em cada bairro: história, parques, escolas, comércio, acesso, prédios e condomínios, com fotos reais e os imóveis que a RUAH tem à venda em cada um.</p>
${ordem.length > 1 ? `<nav class="b-regioes" aria-label="Regiões">${ordem.map((r) => `<a href="#${ancora(r)}">${esc(r)}</a>`).join('')}</nav>` : ''}</section>
${lista.length ? ordem.map((r) => `<section class="p-cd-sec" id="${ancora(r)}" aria-labelledby="r-${ancora(r)}"><h2 id="r-${ancora(r)}">${esc(r)}</h2><div class="b-lista">${grupos.get(r).map((x) => cartaoBairro(x, capas.get(x.bairro.slug))).join('')}</div></section>`).join('')
    : '<div class="p-vazio"><p>Os guias dos bairros chegam em breve.</p><a class="p-botao" href="/imoveis">Ver os imóveis à venda</a></div>'}`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Bairros de Campinas · guias da RUAH', numberOfItems: lista.length, itemListElement: lista.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/bairros/${x.bairro.slug}`, name: x.pagina.titulo })) }];
  return portal.casca(req, {
    titulo: 'Bairros de Campinas: guia para escolher onde morar · RUAH', caminho: '/bairros', ld, corpo, classe: 'p-vitrine b-pagina',
    descricao: 'Guias completos dos bairros de Campinas: como é morar, parques, escolas, comércio, prédios e os imóveis à venda pela RUAH em cada um.',
    imagem: lista.length && capas.get(lista[0].bairro.slug) ? capas.get(lista[0].bairro.slug).src : null,
  });
}

function paginaNaoAchada(req) {
  return portal.casca(req, {
    titulo: 'Bairro não encontrado · RUAH', descricao: 'Este guia de bairro ainda não existe ou mudou de endereço.', caminho: req.path, semIndice: true, classe: 'b-pagina',
    corpo: '<div class="p-vazio p-vazio-g"><h1>Este bairro ainda não tem guia</h1><p>Os guias dos bairros de Campinas estão sendo escritos aos poucos.</p><a class="p-botao" href="/bairros">Ver os bairros</a></div>',
  });
}

module.exports = { paginaBairro, paginaLista, paginaNaoAchada, fotosValidas, urlFotoCommons };
