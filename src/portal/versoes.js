// Portal RUAH · as outras duas formas de ver os imóveis, além da vitrine:
//   /imoveis/revista              a vitrine em forma de revista (ensaios + imóveis entre os textos)
//   /imoveis/signature            RUAH Signature: a seleção acima de R$ 10 milhões, discreta
//   /imoveis/signature/<código>   uma residência da seleção
// Os textos ficam em ./edicoes.js; os números e o valor vêm do banco, ao vivo.

const { CAPITULOS, CARTA, SIGNATURE } = require('./edicoes');
const { casca, cartao, fotoUrl, urlBase } = require('./paginas');
const { cortar, dataPorExtenso } = require('../blog/texto');
const { nomeDaCategoria } = require('../blog/categorias');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reais = (v) => (v ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : null);
const metros = (v) => (v ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : null);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const lugar = (im) => [im.bairro, im.cidade].filter(Boolean).join(', ');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Fotos com versão em alta definição (ampliadas a partir da original, em public/portal-assets/signature/<id>-1920.jpg e -2560.jpg).
const HD = new Set([]);
/** A imagem de fundo do topo: alta definição quando existe, senão a foto do banco. */
function fundo(foto) {
  const src = fotoUrl(foto);
  const hd = HD.has(foto) ? `/portal-assets/signature/${foto}` : null;
  return `<div class="s-hero-fundo" aria-hidden="true"><img src="${hd ? `${hd}-1920.jpg` : src}"${hd ? ` srcset="${hd}-1920.jpg 1920w, ${hd}-2560.jpg 2560w" sizes="100vw" width="2560" height="1706"` : ' width="1280" height="853"'} alt="" fetchpriority="high" decoding="async"></div>`;
}

const ehSignature = (im) => !!(im && im.valor && im.valor >= SIGNATURE.limite);
const RESIDENCIAIS = new Set(['Casa', 'Casa em condomínio', 'Sobrado', 'Chácara', 'Sítio', 'Fazenda', 'Apartamento', 'Cobertura', 'Flat']);
const residencia = (im) => RESIDENCIAIS.has(im.tipo);

/** As três formas de ver os imóveis, no topo de cada uma. */
function seletor(atual) {
  const v = [['vitrine', '/imoveis', 'Vitrine'], ['revista', '/imoveis/revista', 'Revista'], ['signature', '/imoveis/signature', 'Signature']];
  return `<nav class="p-versoes" aria-label="Formas de ver os imóveis">${v.map(([k, href, nome]) => `<a href="${href}"${k === atual ? ' aria-current="page"' : ''}${k === 'signature' ? ' class="p-versoes-sig"' : ''}>${nome}</a>`).join('')}</nav>`;
}

function specs(im) {
  const s = [];
  const area = im.area_util || im.area_total;
  if (area) s.push(metros(area));
  if (im.quartos) s.push(plural(im.quartos, 'quarto', 'quartos'));
  if (im.suites) s.push(plural(im.suites, 'suíte', 'suítes'));
  if (im.vagas) s.push(plural(im.vagas, 'vaga', 'vagas'));
  return s;
}

// ===================================================================== REVISTA
function destaque(x, n) {
  const { imovel: im, pagina: p } = x;
  return `<article class="r-dest${n % 2 ? ' r-dest-inv' : ''}" data-revelar>
<a class="r-dest-img" href="/imoveis/${p.slug}"><img src="${fotoUrl(p.capa.foto)}" alt="${esc(p.capa.alt)}" width="1280" height="853" loading="lazy" decoding="async"></a>
<div class="r-dest-t">
<p class="r-chapeu">${esc(im.tipo)} · ${esc(lugar(im))}</p>
<h3><a href="/imoveis/${p.slug}">${esc(p.titulo)}</a></h3>
<p class="r-dest-resumo">${esc(p.resumo)}</p>
<p class="r-dest-specs">${specs(im).map(esc).join('<span aria-hidden="true"> · </span>')}</p>
<p class="r-dest-preco">${im.valor ? esc(reais(im.valor)) : 'Valor sob consulta'}</p>
<a class="r-ler" href="/imoveis/${p.slug}">Conhecer o imóvel <span aria-hidden="true">→</span></a>
</div></article>`;
}

function capitulo(c, n, imoveis) {
  const [primeiro, ...outros] = imoveis;
  return `<section class="r-cap" id="${c.id}" aria-labelledby="${c.id}-t">
<header class="r-cap-cab" data-revelar>
<p class="r-num">${String(n).padStart(2, '0')}</p>
<p class="r-chapeu">${esc(c.chapeu)}</p>
<h2 id="${c.id}-t">${esc(c.titulo)}</h2>
<p class="r-linha-fina">${esc(c.linhaFina)}</p>
</header>
<div class="r-ensaio" data-revelar>${c.paragrafos.map((t, i) => `<p${i === 0 ? ' class="r-capitular"' : ''}>${esc(t)}</p>`).join('')}</div>
<blockquote class="r-citacao" data-revelar><p>${esc(c.citacao)}</p></blockquote>
<div class="r-vitrine">
<p class="r-vitrine-t">${esc(c.vitrine)}</p>
${destaque(primeiro, n)}
${outros.length ? `<div class="p-grade r-grade">${outros.map((y) => cartao(y)).join('')}</div>` : ''}
</div>
</section>`;
}

function leituras(artigos) {
  if (!artigos.length) return '';
  return `<section class="r-sopro" aria-labelledby="sopro-t" data-revelar>
<p class="r-chapeu">Do blog Sopro</p>
<h2 id="sopro-t">Leituras para a casa</h2>
<div class="r-sopro-grade">${artigos.map((a) => `<article class="r-art">
<a href="/blog/${esc(a.slug)}" class="r-art-img">${a.capa && a.capa.src ? `<img src="${esc(a.capa.src)}" alt="${esc(a.capa.alt || '')}" width="1600" height="900" loading="lazy" decoding="async">` : ''}</a>
<p class="r-chapeu">${esc(nomeDaCategoria(a.categoria))}</p>
<h3><a href="/blog/${esc(a.slug)}">${esc(a.titulo)}</a></h3>
<p>${esc(cortar(a.resumo || '', 140))}</p>
<p class="r-art-meta">${esc(dataPorExtenso(a.publicadoEm))}${a.minutos ? `, ${a.minutos} min de leitura` : ''}</p>
</article>`).join('')}</div>
<a class="r-ler" href="/blog">Todos os textos do Sopro <span aria-hidden="true">→</span></a>
</section>`;
}

function chamadaSignature() {
  return `<section class="r-sig" aria-labelledby="r-sig-t" data-revelar>
<p class="r-sig-marca">RUAH <span>Signature</span></p>
<h2 id="r-sig-t">Para o que não se anuncia</h2>
<p>Uma seleção reservada de residências acima de R$ 10 milhões, apresentadas com poucas fotos e muita intenção. Os valores ficam com os membros do Clube Signature.</p>
<a class="p-botao" href="/imoveis/signature">Conhecer a Signature</a>
</section>`;
}

function paginaRevista(req, lista, artigos = []) {
  const agora = new Date();
  const edicao = `Edição de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`;
  const comuns = lista.filter((x) => !ehSignature(x.imovel));
  const usados = new Set();
  const caps = CAPITULOS.map((c) => {
    // Os mais fotogênicos primeiro (mais fotos), depois o de maior valor.
    const ims = comuns.filter((x) => c.tipos.includes(x.imovel.tipo) && !usados.has(x.imovel.codigo))
      .sort((a, b) => Math.min(b.imovel.fotos.length, 20) - Math.min(a.imovel.fotos.length, 20) || (b.imovel.valor || 0) - (a.imovel.valor || 0)).slice(0, 3);
    ims.forEach((x) => usados.add(x.imovel.codigo));
    return { c, ims };
  }).filter((k) => k.ims.length);
  const capa = caps.map((k) => k.ims[0]).sort((a, b) => Math.min(b.imovel.fotos.length, 20) - Math.min(a.imovel.fotos.length, 20) || (b.imovel.valor || 0) - (a.imovel.valor || 0))[0] || comuns[0];
  const blog = artigos.slice(0, 3);
  const restantes = comuns.length - usados.size;

  const partes = [];
  caps.forEach((k, i) => {
    partes.push(capitulo(k.c, i + 1, k.ims));
    if (i === 1) partes.push(leituras(blog));
    if (i === 2) partes.push(chamadaSignature());
  });
  if (caps.length < 2) partes.push(leituras(blog));
  if (caps.length < 3) partes.push(chamadaSignature());

  const corpo = `
${seletor('revista')}
<header class="r-mastro">
  <p class="r-mastro-ed">${esc(edicao)}</p>
  <h1>Revista <i>RUAH</i></h1>
  <p class="r-mastro-l">Casa, arquitetura e bem-estar em Campinas e região, com os imóveis da RUAH entre os textos.</p>
</header>
${capa ? `<section class="r-capa" aria-label="Capa da edição">
  <a class="r-capa-img" href="/imoveis/${capa.pagina.slug}"><img src="${fotoUrl(capa.pagina.capa.foto)}" alt="${esc(capa.pagina.capa.alt)}" width="1280" height="853" fetchpriority="high" decoding="async"></a>
  <div class="r-capa-t">
    <p class="r-chapeu">Nesta edição</p>
    <ol class="r-indice">${caps.map((k, i) => `<li><a href="#${k.c.id}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(k.c.titulo)}</a></li>`).join('')}${blog.length ? '<li><a href="#sopro-t"><span>+</span>Leituras do Sopro</a></li>' : ''}<li><a href="#r-sig-t"><span>✦</span>RUAH Signature</a></li></ol>
    <p class="r-capa-cred">Na capa: <a href="/imoveis/${capa.pagina.slug}">${esc(capa.pagina.titulo)}</a></p>
  </div>
</section>` : ''}
${partes.join('\n')}
<section class="r-carta" aria-labelledby="carta-t" data-revelar>
  <h2 id="carta-t">${esc(CARTA.titulo)}</h2>
  ${CARTA.paragrafos.map((t) => `<p>${esc(t)}</p>`).join('')}
  <p class="r-carta-ass">Equipe RUAH</p>
  <div class="r-carta-acoes"><a class="p-botao" href="/imoveis">Ver ${restantes > 0 ? `os ${comuns.length} imóveis` : 'todos os imóveis'} na vitrine</a><a class="p-botao sec" href="/bairros">Guias dos bairros</a></div>
</section>`;

  const base = urlBase(req);
  const destaques = caps.flatMap((k) => k.ims);
  const ld = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Revista RUAH · ${edicao}`, url: `${base}/imoveis/revista`,
    description: 'Ensaios sobre casa, arquitetura e bem-estar, com os imóveis à venda da RUAH em Campinas e região entre os textos.',
    mainEntity: { '@type': 'ItemList', itemListElement: destaques.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/imoveis/${x.pagina.slug}`, name: x.pagina.titulo })) },
  }];
  return casca(req, {
    titulo: 'Revista RUAH · casas, apartamentos e terrenos à venda em Campinas',
    descricao: 'A vitrine da RUAH em forma de revista: ensaios sobre como morar bem em Campinas, com casas, apartamentos e terrenos à venda entre os textos.',
    caminho: '/imoveis/revista', imagem: capa && fotoUrl(capa.pagina.capa.foto), ld, corpo, classe: 'p-vitrine p-revista',
  });
}

// =================================================================== SIGNATURE
/** Os imóveis da seleção (todos os à venda acima do limite), do mais valioso para o menos. */
function selecao(imoveis) {
  return imoveis.filter(ehSignature).sort((a, b) => b.valor - a.valor).map((im) => {
    const c = SIGNATURE.curadoria[im.codigo] || {};
    const existe = new Set(im.fotos);
    let fotos = (c.fotos || []).filter(([id]) => existe.has(id)).map(([foto, legenda]) => ({ foto, legenda }));
    if (!fotos.length && residencia(im)) fotos = im.fotos.slice(0, 4).map((foto) => ({ foto, legenda: `${im.tipo} · ${im.bairro || im.cidade}` }));
    return {
      im, fotos,
      titulo: c.titulo || `${im.tipo}${im.bairro ? ` · ${im.bairro}` : ''}`,
      local: c.local || lugar(im),
      frase: c.frase || '',
      detalhes: c.detalhes || [],
      residencia: residencia(im),
      href: `/imoveis/signature/${im.codigo.toLowerCase()}`,
    };
  });
}

function numeros(im) {
  const n = [];
  if (im.area_util) n.push([metros(im.area_util), 'construídos']);
  if (im.area_total && im.area_total !== im.area_util) n.push([metros(im.area_total), im.area_util ? 'de terreno' : 'de área']);
  if (im.suites) n.push([im.suites, im.suites === 1 ? 'suíte' : 'suítes']);
  else if (im.quartos) n.push([im.quartos, im.quartos === 1 ? 'quarto' : 'quartos']);
  if (im.vagas) n.push([im.vagas, im.vagas === 1 ? 'vaga' : 'vagas']);
  return n;
}

function preco(s, membro) {
  if (membro) return `<p class="s-preco"><span>Valor</span>${s.im.valor ? esc(reais(s.im.valor)) : 'Sob consulta'}</p>`;
  return `<p class="s-preco s-preco-fechado"><span>Valor</span><a href="#clube">Reservado aos membros do Clube Signature</a></p>`;
}

function formClube(codigo = '') {
  return `<form class="p-form s-form" data-clube novalidate>
  ${codigo ? `<input type="hidden" name="codigo" value="${esc(codigo)}">` : ''}
  <label class="p-armadilha" aria-hidden="true">Empresa<input name="empresa" tabindex="-1" autocomplete="off"></label>
  <label class="p-campo"><span>Nome</span><input name="nome" required autocomplete="name" maxlength="120"></label>
  <label class="p-campo"><span>WhatsApp ou telefone</span><input name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(19) 99999-9999"></label>
  <label class="p-campo p-largo"><span>E-mail <i>(opcional)</i></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
  <label class="p-check p-largo"><input type="checkbox" name="aceite" value="1" required> Concordo que a RUAH use estes dados só para falar comigo sobre imóveis. Posso pedir para sair a qualquer momento.</label>
  <button class="p-botao p-largo" type="submit">Entrar para o Clube Signature</button>
  <p class="p-form-msg p-largo" role="status" aria-live="polite" hidden></p>
</form>`;
}

function clube(membro, codigo = '') {
  const c = SIGNATURE.clube;
  return `<section class="s-clube" id="clube" aria-labelledby="clube-t">
<div class="s-clube-txt">
<p class="s-sobre">Por convite</p>
<h2 id="clube-t">${esc(c.titulo)}</h2>
${membro ? '<p>Você é membro do Clube Signature. Os valores aparecem em todas as residências da seleção, neste aparelho.</p><p>Para visitar uma residência, abra a página dela e escolha o melhor período: a RUAH confirma pessoalmente.</p>'
    : `<p>${esc(c.texto)}</p><ul class="s-beneficios">${c.beneficios.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`}
</div>
${membro ? '' : formClube(codigo)}
</section>`;
}

function paginaSignature(req, imoveis, membro) {
  const sel = selecao(imoveis);
  const casas = sel.filter((s) => s.residencia && s.fotos.length);
  const ativos = sel.filter((s) => !(s.residencia && s.fotos.length));
  // A capa: a foto escolhida em alta definição (SIGNATURE.capa), se a residência ainda está na seleção.
  const capa = casas.flatMap((c) => c.fotos).find((f) => f.foto === SIGNATURE.capa) || (casas[0] && casas[0].fotos[0]);
  const corpo = `
${seletor('signature')}
<section class="s-hero">
  ${capa ? fundo(capa.foto) : ''}
  <div class="s-hero-txt">
    <p class="s-marca">RUAH <span>Signature</span></p>
    <h1>${esc(SIGNATURE.titulo)}</h1>
    <p class="s-hero-l">${esc(SIGNATURE.linhaFina)}</p>
    ${membro ? '<p class="s-status">✦ Membro do Clube Signature</p>' : '<a class="s-convite" href="#clube">Solicitar acesso ao Clube</a>'}
  </div>
</section>
<section class="s-manifesto" data-revelar>${SIGNATURE.manifesto.map((t) => `<p>${esc(t)}</p>`).join('')}</section>
${casas.length ? `<section class="s-residencias" aria-label="Residências da seleção">
${casas.map((s, i) => `<article class="s-res${i % 2 ? ' s-res-inv' : ''}" data-revelar>
  <a class="s-res-fotos s-res-fotos-${Math.min(s.fotos.length, 3)}" href="${s.href}" aria-label="${esc(s.titulo)}">${s.fotos.slice(0, 3).map((f, k) => `<img src="${fotoUrl(f.foto)}" alt="${esc(f.legenda)}" width="1280" height="853" loading="${i === 0 && k === 0 ? 'eager' : 'lazy'}" decoding="async">`).join('')}</a>
  <div class="s-res-t">
    <p class="s-num">Nº ${String(i + 1).padStart(2, '0')}</p>
    <p class="s-sobre">${esc(s.local)}</p>
    <h2><a href="${s.href}">${esc(s.titulo)}</a></h2>
    ${s.frase ? `<p class="s-frase">${esc(s.frase)}</p>` : ''}
    <p class="s-specs">${numeros(s.im).map(([v, r]) => `${esc(v)} ${esc(r)}`).join('<span aria-hidden="true"> · </span>')}</p>
    ${preco(s, membro)}
    <a class="s-ler" href="${s.href}">Conhecer a residência <span aria-hidden="true">→</span></a>
  </div>
</article>`).join('')}
</section>` : '<p class="s-vazio">A seleção Signature está sendo preparada.</p>'}
${ativos.length ? `<section class="s-ativos" aria-labelledby="ativos-t" data-revelar>
  <p class="s-sobre">Patrimônio Signature</p>
  <h2 id="ativos-t">Áreas e ativos</h2>
  <p class="s-ativos-l">Terrenos e imóveis corporativos de grande porte, apresentados apenas para membros e investidores. Fotos, documentos e estudos de viabilidade, em conversa reservada.</p>
  <div class="s-ativos-grade">${ativos.map((s) => `<article class="s-ativo">
    <p class="s-sobre">${esc(s.im.tipo)} · ${esc(s.local)}</p>
    <h3>${esc(s.titulo)}</h3>
    <p class="s-ativo-area">${esc(metros(s.im.area_total || s.im.area_util) || '')}</p>
    ${s.frase ? `<p>${esc(s.frase)}</p>` : ''}
    ${preco(s, membro)}
    <a class="s-ler" href="${s.href}">Detalhes <span aria-hidden="true">→</span></a>
  </article>`).join('')}</div>
</section>` : ''}
${clube(membro)}`;
  return casca(req, {
    titulo: 'RUAH Signature · residências de altíssimo padrão',
    descricao: 'RUAH Signature: uma seleção reservada de residências acima de R$ 10 milhões em Campinas e região, com valores e visitas para membros do Clube Signature.',
    caminho: '/imoveis/signature', imagem: capa && (HD.has(capa.foto) ? `/portal-assets/signature/${capa.foto}-1920.jpg` : fotoUrl(capa.foto)), corpo, classe: 'p-sig',
  });
}

function paginaSignatureImovel(req, imoveis, codigo, membro) {
  const s = selecao(imoveis).find((x) => x.im.codigo === String(codigo).toUpperCase());
  if (!s) return null;
  const { im } = s;
  const [primeira, ...resto] = s.fotos;
  const pares = [];
  for (let i = 0; i < resto.length; i += 3) pares.push(resto.slice(i, i + 3));
  const corpo = `
${seletor('signature')}
<nav class="p-trilha s-trilha" aria-label="Você está em"><a href="/imoveis/signature">RUAH Signature</a> <span aria-hidden="true">›</span> <span>${esc(s.titulo)}</span></nav>
<section class="s-hero s-hero-im">
  ${primeira ? fundo(primeira.foto) : ''}
  <div class="s-hero-txt">
    <p class="s-marca">RUAH <span>Signature</span></p>
    <p class="s-sobre">${esc(im.tipo)} · ${esc(s.local)}</p>
    <h1>${esc(s.titulo)}</h1>
    ${s.frase ? `<p class="s-hero-l">${esc(s.frase)}</p>` : ''}
  </div>
</section>
${primeira ? `<p class="s-legenda-capa">${esc(primeira.legenda)}</p>` : ''}
<div class="s-im-corpo">
  <section class="s-im-ficha" data-revelar>
    <ul class="s-numeros">${numeros(im).map(([v, r]) => `<li><b>${esc(v)}</b><span>${esc(r)}</span></li>`).join('')}</ul>
    ${s.detalhes.length ? `<h2>Detalhes que fazem a diferença</h2><ul class="s-detalhes">${s.detalhes.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
  </section>
  <aside class="s-im-lado">
    ${preco(s, membro)}
    <p class="s-cod">Cód. ${esc(im.codigo)}</p>
    ${membro ? '<a class="p-botao" href="#contato" data-contato="visita">Agendar visita privada</a>' : '<a class="p-botao" href="#clube">Solicitar acesso</a>'}
  </aside>
</div>
${pares.length ? `<section class="s-galeria" aria-label="Fotos" data-galeria='${esc(JSON.stringify(s.fotos.map((f) => ({ src: fotoUrl(f.foto), legenda: f.legenda }))))}'>
${pares.map((g) => `<div class="s-galeria-l s-galeria-${g.length}" data-revelar>${g.map((f) => `<figure><button type="button" data-ver="${f.foto}" aria-label="Ampliar: ${esc(f.legenda)}"><img src="${fotoUrl(f.foto)}" alt="${esc(f.legenda)}" width="1280" height="853" loading="lazy" decoding="async"></button><figcaption>${esc(f.legenda)}</figcaption></figure>`).join('')}</div>`).join('')}
</section>` : ''}
<p class="s-mais">As demais fotos, a planta e a documentação são apresentadas pessoalmente, na visita.</p>
${membro ? `<section class="p-contato s-contato" id="contato" aria-labelledby="contato-t">
<div class="p-contato-txt"><h2 id="contato-t">Visita privada</h2><p>Escolha o melhor período. A RUAH confirma o dia e o horário pessoalmente, com toda a discrição.</p></div>
<form class="p-form" data-interesse novalidate>
  <input type="hidden" name="codigo" value="${esc(im.codigo)}">
  <label class="p-armadilha" aria-hidden="true">Empresa<input name="empresa" tabindex="-1" autocomplete="off"></label>
  <label class="p-campo"><span>Nome</span><input name="nome" required autocomplete="name" maxlength="120"></label>
  <label class="p-campo"><span>WhatsApp ou telefone</span><input name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(19) 99999-9999"></label>
  <label class="p-campo p-largo"><span>Mensagem <i>(opcional)</i></span><textarea name="mensagem" rows="2" maxlength="1000">Visita privada · RUAH Signature · ${esc(s.titulo)}</textarea></label>
  <label class="p-check p-largo" hidden><input type="checkbox" name="visita" value="1" data-visita checked> Visita</label>
  <div class="p-largo p-visita" data-visita-campos>
    <label class="p-campo"><span>Melhor dia</span><input type="date" name="dia"></label>
    <label class="p-campo"><span>Período</span><select name="periodo"><option value="">Tanto faz</option><option>Manhã</option><option>Tarde</option><option>Fim de semana</option></select></label>
  </div>
  <label class="p-check p-largo"><input type="checkbox" name="aceite" value="1" required> Concordo que a RUAH use estes dados só para falar comigo sobre imóveis.</label>
  <button class="p-botao p-largo" type="submit">Pedir a visita</button>
  <p class="p-form-msg p-largo" role="status" aria-live="polite" hidden></p>
</form></section>` : clube(false, im.codigo)}
<p class="s-voltar"><a class="s-ler" href="/imoveis/signature"><span aria-hidden="true">←</span> Toda a seleção Signature</a></p>`;
  return casca(req, {
    titulo: `${s.titulo} · RUAH Signature`, descricao: `${s.titulo}. ${s.frase}`.trim(),
    caminho: s.href, imagem: primeira && fotoUrl(primeira.foto), corpo, classe: 'p-sig p-sig-im', semIndice: true,
  });
}

module.exports = { paginaRevista, paginaSignature, paginaSignatureImovel, selecao, ehSignature, seletor };
