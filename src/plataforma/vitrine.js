// Domínio da plataforma (corretordofuturo.app): é a página de vendas do produto Herrera HOUSE IA,
// nunca o sistema nem o portal de um cliente. Nada de cliente (RUAH ou outro) aparece aqui.
const cfg = require('../config');

const HOSTS = new Set(String(process.env.PLATAFORMA_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
// Contato da plataforma (não é o da imobiliária cliente).
const EMAIL = process.env.PLATAFORMA_EMAIL || 'tiagaskan@gmail.com';
const WHATSAPP = String(process.env.PLATAFORMA_WHATSAPP || '5519984515960').replace(/\D/g, '');

// Entrada do sistema para as imobiliárias clientes (login). Só o sistema: nenhum portal/blog de cliente aparece aqui.
const APP_HOSTS = new Set(String(process.env.PLATAFORMA_APP_HOSTS || 'app.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const APP_URL = process.env.PLATAFORMA_APP_URL || 'https://app.corretordofuturo.app/';
// Páginas públicas que são do cliente (portal, blog, bairros, condomínios): ficam no domínio dele, nunca na entrada da plataforma.
const PUBLICAS_DO_CLIENTE = /^\/(imoveis|blog|bairros|condominios)(\/|$)|^\/(llms\.txt|sitemap\.xml|feed|rss)/;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telBonito = (n) => { const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n; };

// Cômodos da planta = partes do sistema. x, y, w, h na planta (viewBox 600 x 470).
const COMODOS = [
  { k: 'captacao', nome: 'Captação', x: 20, y: 20, w: 200, h: 150, area: 'anúncios e donos',
    texto: 'Os anúncios da sua região chegam organizados por bairro, rua e prédio. O sistema aponta queda de preço, anúncio novo e venda direta do dono, e localiza o proprietário com um clique, com a consulta paga sob controle.' },
  { k: 'carteira', nome: 'Carteira', x: 220, y: 20, w: 180, h: 150, area: 'seus imóveis',
    texto: 'Cada imóvel anda sozinho pelas etapas, do dono localizado até vendido. A ficha mostra o que falta, guarda fotos e documentos e gera a autorização de venda com assinatura eletrônica.' },
  { k: 'painel', nome: 'Painel', x: 400, y: 20, w: 180, h: 110, area: 'o dia de hoje',
    texto: 'Os números do negócio e o que precisa de você hoje: cliente esperando resposta, visita sem confirmar, autorização parada, imóvel sem foto.' },
  { k: 'condominios', nome: 'Condomínios 3D', x: 400, y: 130, w: 180, h: 140, area: 'prédios e entorno',
    texto: 'Uma base de prédios e condomínios com andares, unidades, preço do metro e o que tem perto. Mostre ao cliente o andar do apartamento e a vista em 3D.' },
  { k: 'escritorio', nome: 'Escritório virtual', x: 20, y: 170, w: 230, h: 140, area: 'agentes no WhatsApp',
    texto: 'Agentes de inteligência artificial no WhatsApp, cada um cuidando de um tipo de imóvel. Respondem, qualificam, marcam visitas e chamam o corretor. Por padrão, sugerem a resposta e esperam a sua aprovação.' },
  { k: 'crm', nome: 'CRM e visitas', x: 250, y: 170, w: 150, h: 140, area: 'clientes',
    texto: 'Funil de vendas, histórico de cada cliente, cruzamento entre o que o comprador procura e os imóveis da carteira, e a agenda de visitas da equipe.' },
  { k: 'portal', nome: 'Portal', x: 20, y: 310, w: 190, h: 110, area: 'sua vitrine',
    texto: 'Uma vitrine com a sua marca e no seu domínio, com uma página escrita para cada imóvel a partir das fotos e da ficha. Quem se interessa vira cliente no seu CRM.' },
  { k: 'blog', nome: 'Blog e bairros', x: 210, y: 310, w: 190, h: 110, area: 'Google e IAs',
    texto: 'Textos publicados sozinhos e um guia para cada bairro onde você atua, feitos para o seu nome aparecer quando alguém pesquisa a região.' },
];

function plantaSvg() {
  const sala = (c) => {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    return `<g class="comodo" data-comodo="${c.k}" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(c.nome)}: ver o que faz">
  <rect x="${c.x + 4}" y="${c.y + 4}" width="${c.w - 8}" height="${c.h - 8}" rx="2"/>
  <text x="${cx}" y="${cy - 2}" text-anchor="middle">${esc(c.nome)}</text>
  <text class="area" x="${cx}" y="${cy + 16}" text-anchor="middle">${esc(c.area)}</text></g>`;
  };
  return `<svg class="planta" viewBox="0 0 600 470" role="group" aria-label="Planta do sistema: cada cômodo é uma parte do Herrera HOUSE IA">
  <g class="divisoria-g">
    <path class="divisoria" d="M220 20V170 M400 20V420 M400 130H580 M20 170H400 M250 170V310 M20 310H400 M210 310V420 M400 270H580"/>
  </g>
  <path class="parede" d="M20 20H580V420H20Z"/>
  <!-- vãos de porta e folhas -->
  <line class="vao" x1="140" y1="170" x2="176" y2="170"/><path class="porta" d="M140 170A36 36 0 0 1 176 206"/>
  <line class="vao" x1="300" y1="170" x2="336" y2="170"/><path class="porta" d="M336 170A36 36 0 0 0 300 134"/>
  <line class="vao" x1="400" y1="200" x2="400" y2="236"/><path class="porta" d="M400 236A36 36 0 0 1 436 200"/>
  <line class="vao" x1="90" y1="310" x2="126" y2="310"/><path class="porta" d="M126 310A36 36 0 0 0 90 274"/>
  <line class="vao" x1="290" y1="310" x2="326" y2="310"/><path class="porta" d="M290 310A36 36 0 0 1 326 346"/>
  <line class="vao" x1="472" y1="420" x2="520" y2="420"/><path class="porta" d="M472 420A48 48 0 0 1 520 372"/>
  ${COMODOS.map(sala).join('\n  ')}
  <g class="comodo entrada" data-comodo="entrada" role="button" tabindex="0" aria-label="Entrada: falar com a gente">
    <rect x="404" y="274" width="172" height="142" rx="2"/>
    <text x="490" y="338" text-anchor="middle">Entrada</text>
    <text class="area" x="490" y="356" text-anchor="middle">fale com a gente</text></g>
  <!-- cota -->
  <path class="cota" d="M20 446H580 M20 440V452 M580 440V452"/>
  <text class="cota-txt" x="300" y="463" text-anchor="middle">tudo num sistema só</text>
</svg>`;
}

// Capturas do sistema com a imobiliária de demonstração "Casa Prado" (dados fictícios; scripts/demo-vitrine.js).
const TELAS = [
  { k: 'painel', nome: 'Painel', h: 1800, alt: 'Painel da imobiliária com a lista do que precisa de atenção e os números do negócio', legenda: 'O que precisa de você hoje e os números do mês, comparados ao mês anterior.' },
  { k: 'carteira', nome: 'Carteira', h: 1800, alt: 'Carteira de imóveis com as etapas, do dono localizado ao vendido, e a ficha de cada imóvel', legenda: 'Cada imóvel em uma etapa, com o dono, o corretor e quanto da ficha está completa.' },
  { k: 'crm', nome: 'CRM', h: 1800, alt: 'Funil de vendas com clientes nas etapas novo, qualificado, visita, proposta e escritura', legenda: 'O funil de vendas: de onde veio cada cliente, o que procura e quanto pode pagar.' },
  { k: 'escritorio', nome: 'Escritório virtual', h: 1800, alt: 'Escritório virtual com os agentes de inteligência artificial e o movimento do dia', legenda: 'Os agentes de IA no WhatsApp, cada um no seu setor, com as respostas esperando aprovação.' },
  { k: 'ficha', nome: 'Ficha do imóvel', h: 2062, alt: 'Ficha de uma casa com a etapa, o proprietário e o que falta completar', legenda: 'A ficha mostra a etapa do imóvel e o que falta para publicar.' },
  { k: 'visitas', nome: 'Visitas', h: 1800, alt: 'Agenda de visitas com horários, imóveis, clientes e corretores', legenda: 'A agenda de visitas da equipe, com a avaliação de cada cliente.' },
];

const PERGUNTAS = [
  ['Preciso trocar o meu site?', 'Não. O portal e o blog ficam no seu domínio, com a sua marca. Se ainda não tiver um domínio, a gente ajuda a registrar.'],
  ['Os dados da minha carteira são só meus?', 'Sim. Imóveis, clientes, proprietários e conversas de cada corretor ou imobiliária ficam separados e ninguém mais vê. A base de anúncios e de condomínios da região é a parte comum.'],
  ['Funciona na minha cidade?', 'Começamos por Campinas (SP) e a base de anúncios, prédios e bairros cresce por região. Fale com a gente para saber como está a sua cidade.'],
  ['A inteligência artificial manda mensagem sem eu ver?', 'Por padrão, não: o agente sugere a resposta e você aprova antes de enviar. Você escolhe quais agentes podem responder sozinhos.'],
  ['Preciso de um número de WhatsApp para cada agente?', 'Não para começar. Dá para iniciar com um número e separar os agentes depois, conforme o movimento crescer.'],
  ['Quanto custa?', 'Há planos para corretor autônomo e para imobiliária. Fale com a gente e montamos a proposta para o seu tamanho.'],
];

function pagina() {
  const nome = esc(cfg.SISTEMA_NOME);
  const email = esc(EMAIL);
  const wa = esc(WHATSAPP);
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: cfg.SISTEMA_NOME, applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
    description: 'Sistema imobiliário com inteligência artificial para corretores e imobiliárias: captação, carteira, CRM, agentes no WhatsApp, portal e blog próprios.',
    url: 'https://corretordofuturo.app/', inLanguage: 'pt-BR' };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PERGUNTAS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome} · sistema imobiliário com inteligência artificial</title>
<meta name="description" content="Captação, carteira, CRM, agentes de IA no WhatsApp, portal e blog com a sua marca. Para corretores autônomos e imobiliárias.">
<link rel="canonical" href="https://corretordofuturo.app/">
<meta property="og:title" content="${nome}"><meta property="og:description" content="O sistema imobiliário com inteligência artificial para corretores e imobiliárias."><meta property="og:url" content="https://corretordofuturo.app/"><meta property="og:type" content="website">
<meta name="theme-color" content="#e8eae5">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="/plataforma/site.css">
<script type="application/ld+json">${json(ld)}</script><script type="application/ld+json">${json(faq)}</script>
</head><body>
<div class="cx">
<header class="topo">
  <a class="marca" href="/" aria-label="${nome}, início"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 12 13 4l10 8v11H3Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 23v-7h6v7" fill="none" stroke="currentColor" stroke-width="2"/></svg>${nome}</a>
  <nav aria-label="Seções"><a href="#por-dentro">Por dentro</a><a href="#comodos">O que tem dentro</a><a href="#para-quem">Para quem</a><a href="#perguntas">Perguntas</a><a class="entrar" href="${APP_URL}">Entrar</a><a class="btn" href="#contato">Fale com a gente</a></nav>
</header>

<main>
<div class="abre">
  <div>
    <h1>O sistema imobiliário que trabalha enquanto você atende.</h1>
    <p class="sub">Captação, carteira, atendimento no WhatsApp, portal e blog com a sua marca. Inteligência artificial em cada cômodo, para corretores e imobiliárias.</p>
    <div class="acoes"><a class="btn pri" href="#contato">Fale com a gente</a><a class="btn" href="#comodos">Ver o que tem dentro</a></div>
  </div>
  <div class="planta-cx">
    ${plantaSvg()}
    <p class="planta-dica">Toque num cômodo para ver o que ele faz.</p>
    <div class="ficha" id="ficha" aria-live="polite"></div>
  </div>
</div>

<section id="por-dentro" aria-labelledby="t-dentro">
  <h2 id="t-dentro">Por dentro do sistema</h2>
  <p class="lead">Telas reais do ${nome}, com uma imobiliária de demonstração: os nomes, telefones e imóveis abaixo são fictícios.</p>
  <div class="telas" data-telas>
    <div class="telas-abas" role="tablist" aria-label="Telas do sistema">
      ${TELAS.map((t, i) => `<button type="button" role="tab" id="aba-${t.k}" aria-controls="tela-${t.k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.nome)}</button>`).join('')}
    </div>
    ${TELAS.map((t, i) => `<figure class="tela" role="tabpanel" id="tela-${t.k}" aria-labelledby="aba-${t.k}"${i === 0 ? '' : ' hidden'}>
      <img src="/plataforma/telas/${t.k}.webp" width="2880" height="${t.h}" alt="${esc(t.alt)}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">
      <figcaption>${esc(t.legenda)}</figcaption></figure>`).join('\n    ')}
  </div>
  <div class="celular-cx"><img src="/plataforma/telas/celular.webp" width="1170" height="2532" alt="O painel do sistema aberto no celular" loading="lazy" decoding="async"><p>Funciona no computador, no tablet e no celular, para o corretor acompanhar tudo da rua.</p></div>
</section>

<section id="comodos" aria-labelledby="t-comodos">
  <h2 id="t-comodos">Tudo o que uma imobiliária usa, numa casa só</h2>
  <p class="lead">Cada parte conversa com as outras: o anúncio captado vira imóvel na carteira, o imóvel vira página no portal, quem pergunta pelo portal vira cliente no CRM e é atendido pelos agentes no WhatsApp.</p>
  <ul class="legenda">
    ${COMODOS.map((c) => `<li id="comodo-${c.k}" data-comodo="${c.k}"><h3>${esc(c.nome)}</h3><p>${esc(c.texto)}</p></li>`).join('\n    ')}
  </ul>
</section>

<section id="para-quem" aria-labelledby="t-quem">
  <h2 id="t-quem">Do corretor que trabalha sozinho à imobiliária com equipe</h2>
  <p class="lead">O mesmo sistema, ajustado ao tamanho de quem usa.</p>
  <div class="dois">
    <div class="perfil"><h3>Corretor autônomo</h3><p>Você sozinho, com a estrutura de uma imobiliária por trás.</p>
      <ul><li>Agentes que atendem no WhatsApp enquanto você está em visita</li><li>Portal e blog com o seu nome</li><li>Captação na sua região sem planilha</li></ul></div>
    <div class="perfil forte"><h3>Imobiliária</h3><p>A equipe toda no mesmo lugar, cada um vendo o que é seu.</p>
      <ul><li>Perfis de administrador, gestor e corretor</li><li>Carteira em etapas e painel do dono</li><li>Agentes por tipo de imóvel e relatório diário</li></ul></div>
  </div>
</section>

<section aria-labelledby="t-comeca">
  <h2 id="t-comeca">Como começa</h2>
  <p class="lead">Do primeiro contato ao sistema no ar com a sua marca.</p>
  <ol class="passos">
    <li><h3>Conversa</h3><p>Entendemos a sua região, a sua carteira e como a sua equipe trabalha.</p></li>
    <li><h3>Montagem</h3><p>Trazemos os seus imóveis, ligamos o seu domínio e os números de WhatsApp.</p></li>
    <li><h3>No ar</h3><p>Portal, blog e agentes funcionando com a sua marca, e você acompanhando pelo painel.</p></li>
  </ol>
</section>

<section aria-labelledby="t-planos">
  <div class="planos">
    <div><h2 id="t-planos">Planos para corretor e para imobiliária</h2><p>O valor depende do tamanho da equipe e da região. Conte como você trabalha e montamos a proposta.</p></div>
    <div><a class="btn" href="#contato">Pedir uma proposta</a></div>
  </div>
</section>

<section id="perguntas" aria-labelledby="t-perguntas">
  <h2 id="t-perguntas">Perguntas</h2>
  <div class="perguntas">
    ${PERGUNTAS.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
  </div>
</section>

<section id="contato" aria-labelledby="t-contato">
  <div class="contato">
    <div>
      <h2 id="t-contato">Fale com a gente</h2>
      <p class="lead" style="margin-bottom:0">Conte um pouco sobre você e respondemos pelo WhatsApp.</p>
      <div class="direto">
        <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ${esc(telBonito(WHATSAPP))}</a>
        <a href="mailto:${email}">${email}</a>
      </div>
    </div>
    <form class="fale" data-whatsapp="${wa}">
      <label>Seu nome<input name="nome" required autocomplete="name"></label>
      <label>Cidade<input name="cidade" required autocomplete="address-level2"></label>
      <label class="largo">Você é<select name="perfil" required><option value="">Escolha</option><option>Corretor autônomo</option><option>Imobiliária</option><option>Outro</option></select></label>
      <label class="largo">Mensagem (opcional)<textarea name="mensagem" placeholder="Quantos corretores, quantos imóveis, o que mais incomoda hoje"></textarea></label>
      <p class="nota">Ao enviar, o WhatsApp abre com a sua mensagem pronta. Nada fica gravado nesta página.</p>
      <div class="largo"><button class="btn pri" type="submit">Enviar pelo WhatsApp</button></div>
    </form>
  </div>
</section>
</main>

<footer class="rodape"><span>${nome} · <a href="${APP_URL}">Entrar no sistema</a></span><span>© <span id="ano">${new Date().getFullYear()}</span> · <a href="mailto:${email}">${email}</a></span></footer>
</div>
<script src="/plataforma/site.js" defer></script>
</body></html>`;
}

let cache = null;
function vitrine(req, res, next) {
  const host = String(req.hostname || '').toLowerCase();
  if (APP_HOSTS.has(host)) {
    if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    if (PUBLICAS_DO_CLIENTE.test(req.path)) return res.status(404).type('text/plain').send('Não encontrado.');
    res.setHeader('X-Robots-Tag', 'noindex');
    return next();
  }
  if (!HOSTS.has(String(req.hostname || '').toLowerCase())) return next();
  if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://corretordofuturo.app/sitemap.xml\n');
  if (req.path === '/sitemap.xml') return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://corretordofuturo.app/</loc></url></urlset>');
  if (req.path.startsWith('/plataforma/') || req.path.startsWith('/gestor/')) return next(); // CSS e JS da própria página e do painel do gestor
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ erro: 'Não encontrado.' });
  if (req.path !== '/') return res.redirect(302, '/');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(cache || (cache = pagina()));
}

module.exports = { vitrine, HOSTS, APP_HOSTS, pagina };
