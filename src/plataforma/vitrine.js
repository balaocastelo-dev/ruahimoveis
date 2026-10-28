// DomÃ­nio da plataforma (corretordofuturo.app): Ã© a pÃ¡gina de vendas do produto Herrera HOUSE IA,
// nunca o sistema nem o portal de um cliente. Nada de cliente (RUAH ou outro) aparece aqui:
// as telas sÃ£o de uma imobiliÃ¡ria de demonstraÃ§Ã£o ("Casa Prado", dados e fotos fictÃ­cios; scripts/demo-vitrine.js).
const path = require('path');
const express = require('express');
const cfg = require('../config');
// Telas, vÃ­deo, CSS e JS da pÃ¡gina de vendas saem daqui mesmo (nada depois deste middleware interfere, nem conta suspensa).
const estaticos = express.static(path.join(__dirname, '..', '..', 'public', 'plataforma'), { maxAge: '7d', fallthrough: true });

const HOSTS = new Set(String(process.env.PLATAFORMA_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
// Contato da plataforma (nÃ£o Ã© o da imobiliÃ¡ria cliente).
const EMAIL = process.env.PLATAFORMA_EMAIL || 'tiagaskan@gmail.com';
const WHATSAPP = String(process.env.PLATAFORMA_WHATSAPP || '5519984515960').replace(/\D/g, '');

// Entrada do sistema para as imobiliÃ¡rias clientes (login). SÃ³ o sistema: nenhum portal/blog de cliente aparece aqui.
const APP_HOSTS = new Set(String(process.env.PLATAFORMA_APP_HOSTS || 'app.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const APP_URL = process.env.PLATAFORMA_APP_URL || 'https://app.corretordofuturo.app/';
// PÃ¡ginas pÃºblicas que sÃ£o do cliente (portal, blog, bairros, condomÃ­nios): ficam no domÃ­nio dele, nunca na entrada da plataforma.
const PUBLICAS_DO_CLIENTE = /^\/(imoveis|blog|bairros|condominios)(\/|$)|^\/(llms\.txt|sitemap\.xml|feed|rss)/;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telBonito = (n) => { const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n; };
const T = '/plataforma/telas/';
const F = '/plataforma/fotos/';
// "signature" sempre em minÃºsculo, em caligrafia dourada (pedido do Thiago).
const CAL = '<span class="cal">signature</span>';

// SimulaÃ§Ãµes do portal (nÃ£o sÃ£o capturas): montadas aqui com fotos ilustrativas geradas por IA (Flux, RTX 4090).
const MV_CARDS = [
  ['ap-sala', 'R$ 1.290.000', 'Apartamento Â· CambuÃ­', '118 mÂ² Â· 3 quartos Â· 2 vagas'],
  ['casa-fachada', 'R$ 2.380.000', 'Casa em condomÃ­nio Â· Alphaville', '320 mÂ² Â· 4 quartos Â· 4 vagas'],
  ['cob-terraco', 'R$ 3.450.000', 'Cobertura Â· CambuÃ­', '236 mÂ² Â· 4 quartos Â· 3 vagas'],
  ['casa-piscina', 'R$ 2.950.000', 'Casa em condomÃ­nio Â· Sousas', '380 mÂ² Â· 4 suÃ­tes Â· 4 vagas'],
  ['ap-varanda', 'R$ 780.000', 'Apartamento Â· Taquaral', '96 mÂ² Â· 3 quartos Â· 2 vagas'],
  ['casa-terrea', 'R$ 1.890.000', 'Casa Â· Nova Campinas', '290 mÂ² Â· 4 quartos Â· 3 vagas'],
];
function mockVitrine() {
  return `<div class="mock mv" role="img" aria-label="SimulaÃ§Ã£o da Vitrine: busca com filtros e imÃ³veis em cartÃµes com foto, valor e ficha">
    <div class="mv-topo"><b>Casa Prado</b><span>ImÃ³veis</span><span>Revista</span>${CAL}<span class="mv-fav">â™¡ Favoritos</span></div>
    <div class="mv-hero"><img src="${F}sig1-fachada.webp" alt="" loading="lazy"><div><b>ImÃ³veis Ã  venda em Campinas</b><span>15 imÃ³veis com fotos, ficha completa e uma pÃ¡gina para cada um</span></div></div>
    <div class="mv-busca"><span>Apartamento â–¾</span><span>CambuÃ­ â–¾</span><span>3+ quartos â–¾</span><span>AtÃ© R$ 1,5 mi â–¾</span><em>Buscar</em></div>
    <div class="mv-grade">${MV_CARDS.map(([f, v, t, d]) => `<div class="mv-card"><img src="${F}${f}.webp" alt="" loading="lazy"><div><b>${v}</b><i>${t}</i><small>${d}</small></div></div>`).join('')}</div>
  </div>`;
}
function mockRevista() {
  return `<div class="mock mr" role="img" aria-label="SimulaÃ§Ã£o da Revista: capa com o imÃ³vel mais fotogÃªnico, ensaio sobre morar bem e imÃ³veis entre os textos">
    <div class="mr-capa"><img src="${F}sig1-sala.webp" alt="" loading="lazy">
      <div class="mr-mastro"><span>Revista</span><b>Casa Prado</b></div><span class="mr-ed">EdiÃ§Ã£o de outubro Â· nÂº 10</span>
      <div class="mr-chamada"><small>Ensaio de abertura</small><b>A casa que respira</b><span>Luz, ar e tempo: o que se procura numa casa</span></div></div>
    <div class="mr-pag"><span class="mr-cap">02 Â· Altura</span><b class="mr-tit">Luz, altura e o horizonte como paisagem</b>
      <p>Morar no alto Ã© trocar a rua pelo cÃ©u. A cidade vira desenho, o pÃ´r do sol entra na sala e o silÃªncio sobe junto.</p>
      <img src="${F}cob-terraco.webp" alt="" loading="lazy"><span class="mr-leg">Cobertura no CambuÃ­ Â· 4 quartos Â· terraÃ§o com vista</span>
      <p>Nos prÃ©dios mais novos, a varanda virou cÃ´modo: cozinha, mesa e plantas, de frente para o horizonte.</p>
      <div class="mr-duo"><img src="${F}ap-varanda.webp" alt="" loading="lazy"><img src="${F}ap-cozinha.webp" alt="" loading="lazy"></div></div>
  </div>`;
}
function mockSignature(grande) {
  return `<div class="mock ms${grande ? ' ms-g' : ''}" role="img" aria-label="SimulaÃ§Ã£o da linha signature: fundo escuro, caligrafia dourada e residÃªncias acima de dez milhÃµes com valor sÃ³ para membros">
    <img class="ms-fundo" src="${F}sig1-fachada.webp" alt="" loading="lazy">
    <div class="ms-topo"><b>Casa Prado</b>${CAL}<span class="ms-clube">Clube</span></div>
    <div class="ms-capa">${CAL}<b>ResidÃªncias que nÃ£o se anunciam</b><span>Uma seleÃ§Ã£o reservada acima de R$ 10 milhÃµes</span><em>Solicitar acesso ao Clube</em></div>
    <div class="ms-lista">
      <div class="ms-item"><img src="${F}sig1-piscina.webp" alt="" loading="lazy"><div><i>Sousas</i><b>Casa contemporÃ¢nea sobre o vale</b><small>1.450 mÂ² Â· 6 suÃ­tes Â· borda infinita</small><span>â—† valor para membros</span></div></div>
      <div class="ms-item"><img src="${F}sig2-sala.webp" alt="" loading="lazy"><div><i>Alphaville</i><b>Casa Ã  beira do lago</b><small>1.180 mÂ² Â· 5 suÃ­tes Â· forno a lenha</small><span>â—† valor para membros</span></div></div>
      ${grande ? `<div class="ms-item"><img src="${F}sig3-terraco.webp" alt="" loading="lazy"><div><i>CambuÃ­</i><b>Cobertura com vista de 360Â°</b><small>680 mÂ² Â· 4 suÃ­tes Â· piscina no terraÃ§o</small><span>â—† valor para membros</span></div></div>
      <div class="ms-item"><img src="${F}sig4-sede.webp" alt="" loading="lazy"><div><i>Joaquim EgÃ­dio</i><b>Fazenda histÃ³rica restaurada</b><small>48 hectares Â· sede colonial Â· lago</small><span>â—† valor para membros</span></div></div>` : ''}
    </div>
  </div>`;
}

// Uma captura de tela numa moldura de navegador. `nome` = arquivo em /plataforma/telas (hÃ¡ a versÃ£o inteira e a "-m", com metade da largura).
function janela(nome, alt, { url = 'app.corretordofuturo.app', w = 2880, h = 1800, lazy = true } = {}) {
  return `<div class="janela"><div class="janela-barra" aria-hidden="true"><i></i><i></i><i></i><span>${esc(url)}</span></div>`
    + `<img src="${T}${nome}-m.webp" srcset="${T}${nome}-m.webp 1440w, ${T}${nome}.webp 2880w" sizes="(max-width: 1240px) 100vw, 1200px" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async"></div>`;
}

// CÃ´modos da planta = partes do sistema. x, y, w, h na planta (viewBox 600 x 470).
const COMODOS = [
  { k: 'captacao', nome: 'Radar de captaÃ§Ã£o', x: 20, y: 20, w: 200, h: 150, area: 'anÃºncios e donos', ir: '#radar',
    texto: 'Os anÃºncios da regiÃ£o chegam organizados por bairro, rua e prÃ©dio. A leitura da base aponta queda de preÃ§o, anÃºncio novo, imÃ³vel encalhado e venda direta do dono, e o sistema localiza o proprietÃ¡rio com um clique.' },
  { k: 'carteira', nome: 'Carteira', x: 220, y: 20, w: 180, h: 150, area: 'seus imÃ³veis', ir: '#operacao',
    texto: 'Cada imÃ³vel anda pelas etapas, do dono localizado atÃ© vendido. A ficha mostra o que falta, guarda fotos e documentos e gera a autorizaÃ§Ã£o de venda com assinatura eletrÃ´nica.' },
  { k: 'painel', nome: 'Painel', x: 400, y: 20, w: 180, h: 110, area: 'o dia de hoje', ir: '#painel',
    texto: 'Os nÃºmeros do negÃ³cio e o que precisa de vocÃª hoje: cliente esperando resposta, visita sem confirmar, autorizaÃ§Ã£o parada, imÃ³vel sem foto.' },
  { k: 'condominios', nome: 'CondomÃ­nios 3D', x: 400, y: 130, w: 180, h: 140, area: 'prÃ©dios e entorno', ir: '#condominios',
    texto: 'Os prÃ©dios e condomÃ­nios da cidade com andares, unidades, preÃ§o do metro e o que tem perto. Mostre ao cliente o andar do apartamento e a vista em 3D.' },
  { k: 'escritorio', nome: 'EscritÃ³rio virtual', x: 20, y: 170, w: 230, h: 140, area: 'agentes de IA', ir: '#ia',
    texto: 'Nove agentes de inteligÃªncia artificial no WhatsApp, cada um num setor. Respondem, qualificam, marcam visitas e chamam o corretor. Por padrÃ£o, sugerem a resposta e esperam a sua aprovaÃ§Ã£o.' },
  { k: 'crm', nome: 'CRM e visitas', x: 250, y: 170, w: 150, h: 140, area: 'clientes', ir: '#operacao',
    texto: 'Funil de vendas, histÃ³rico de cada cliente, cruzamento entre o que o comprador procura e os imÃ³veis da carteira, e a agenda de visitas da equipe.' },
  { k: 'portal', nome: 'Portal e signature', x: 20, y: 310, w: 190, h: 110, area: 'sua vitrine', ir: '#portal',
    texto: 'Uma vitrine com a sua marca e no seu domÃ­nio, em trÃªs versÃµes: Vitrine, Revista e signature, a linha reservada para imÃ³veis acima de R$ 10 milhÃµes.' },
  { k: 'blog', nome: 'Blog e bairros', x: 210, y: 310, w: 190, h: 110, area: 'Google e IAs', ir: '#conteudo',
    texto: 'Textos publicados sozinhos e um guia para cada bairro onde vocÃª atua, feitos para o seu nome aparecer quando alguÃ©m pesquisa a regiÃ£o, no Google ou numa IA.' },
];

function plantaSvg() {
  const sala = (c) => {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    return `<g class="comodo" data-comodo="${c.k}" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(c.nome)}: ver o que faz">
  <rect x="${c.x + 4}" y="${c.y + 4}" width="${c.w - 8}" height="${c.h - 8}" rx="2"/>
  <text x="${cx}" y="${cy - 2}" text-anchor="middle">${esc(c.nome)}</text>
  <text class="area" x="${cx}" y="${cy + 16}" text-anchor="middle">${esc(c.area)}</text></g>`;
  };
  return `<svg class="planta" viewBox="0 0 600 470" role="group" aria-label="Planta do sistema: cada cÃ´modo Ã© uma parte do Herrera HOUSE IA">
  <g class="divisoria-g"><path class="divisoria" d="M220 20V170 M400 20V420 M400 130H580 M20 170H400 M250 170V310 M20 310H400 M210 310V420 M400 270H580"/></g>
  <path class="parede" d="M20 20H580V420H20Z"/>
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
  <path class="cota" d="M20 446H580 M20 440V452 M580 440V452"/>
  <text class="cota-txt" x="300" y="463" text-anchor="middle">tudo num sistema sÃ³</text>
</svg>`;
}

// NÃºmeros da plataforma (base comum de Campinas), nÃ£o de um cliente.
const NUMEROS = [
  [4691, '', 'condomÃ­nios e prÃ©dios de Campinas, com andares e unidades'],
  [923, ' mil', 'construÃ§Ãµes da cidade no 3D'],
  [92, ' mil', 'anÃºncios da regiÃ£o lidos e organizados'],
  [9, '', 'agentes de inteligÃªncia artificial no WhatsApp'],
  [53, '', 'guias de bairro escritos para o Google e as IAs'],
  [3, '', 'versÃµes do seu portal: Vitrine, Revista e signature'],
];

// O escritÃ³rio virtual: os nove agentes (nomes e limites editÃ¡veis em cada imobiliÃ¡ria).
const AGENTES = [
  ['TH', 'TH-IA-GO', 'CaptaÃ§Ã£o', 'Acha o dono do imÃ³vel anunciado, conversa, pede as fotos originais e a autorizaÃ§Ã£o.', '#5fd4bf'],
  ['An', 'Ana', 'Apartamentos', 'Responde quem procura apartamento, entende o perfil e marca a visita.', '#7fb4ff'],
  ['Cl', 'Clara', 'Casas', 'Atende casas e casas em condomÃ­nio atÃ© R$ 2 milhÃµes, com fotos e link do imÃ³vel.', '#ffb38a'],
  ['He', 'Helena', 'Alto padrÃ£o', 'Cuida de casas acima de R$ 2 milhÃµes e apartamentos acima de R$ 3 milhÃµes, com o tom certo.', '#d8b26a'],
  ['Vi', 'Vicente', 'Off-market', 'Oferece imÃ³veis fora do mercado sÃ³ por link privado, sempre com a sua aprovaÃ§Ã£o.', '#c9a0ff'],
  ['Br', 'Bruno', 'GalpÃµes e salas', 'Atende empresas: salas, lojas e barracÃµes, com metragem e vagas na ponta da lÃ­ngua.', '#9be37a'],
  ['Te', 'Teo', 'Terrenos', 'Responde sobre lotes e terrenos, zoneamento e condomÃ­nios fechados.', '#e3d47a'],
  ['Au', 'Augusto', 'Gerente do dono', 'Manda o resumo das 8h e o relatÃ³rio das 19h, e avisa o dono do que importa.', '#ff8a8a'],
  ['Ma', 'Marta', 'Gerente dos corretores', 'Passa a agenda do dia, lembra a visita 60 minutos antes e cobra o que venceu.', '#8ae0ff'],
];

// Capturas de operaÃ§Ã£o (aba por tela), da imobiliÃ¡ria de demonstraÃ§Ã£o.
const OPERACAO = [
  { k: 'carteira', nome: 'Carteira', alt: 'Carteira de imÃ³veis com as etapas, do dono localizado ao vendido, e a ficha de cada imÃ³vel', legenda: 'Cada imÃ³vel numa etapa, com o dono, o corretor e quanto da ficha estÃ¡ completa.' },
  { k: 'ficha', nome: 'Ficha do imÃ³vel', alt: 'Ficha de um apartamento com as fotos, a etapa, o proprietÃ¡rio e o que falta completar', legenda: 'A ficha mostra a etapa do imÃ³vel, as fotos, o proprietÃ¡rio e o que falta para publicar.' },
  { k: 'crm', nome: 'CRM', alt: 'Funil de vendas com clientes nas etapas novo, qualificado, visita, proposta e escritura', legenda: 'O funil de vendas: de onde veio cada cliente, o que procura e quanto pode pagar.' },
  { k: 'visitas', nome: 'Visitas', alt: 'Agenda de visitas com horÃ¡rios, imÃ³veis, clientes e corretores', legenda: 'A agenda de visitas da equipe, com a avaliaÃ§Ã£o de cada cliente.' },
  { k: 'agente', nome: 'Mesa do agente', alt: 'Mesa de um agente de IA com as conversas do dia e as respostas para aprovar', legenda: 'A mesa de cada agente: conversas, respostas esperando aprovaÃ§Ã£o e o que ele jÃ¡ resolveu.' },
];

const PERGUNTAS = [
  ['Preciso trocar o meu site?', 'NÃ£o. O portal e o blog ficam no seu domÃ­nio, com a sua marca. Se ainda nÃ£o tiver um domÃ­nio, a gente ajuda a registrar.'],
  ['Os dados da minha carteira sÃ£o sÃ³ meus?', 'Sim. ImÃ³veis, clientes, proprietÃ¡rios e conversas de cada corretor ou imobiliÃ¡ria ficam separados e ninguÃ©m mais vÃª. A base de anÃºncios, prÃ©dios e bairros da regiÃ£o Ã© a parte comum.'],
  ['A inteligÃªncia artificial manda mensagem sem eu ver?', 'Por padrÃ£o, nÃ£o: o agente sugere a resposta e vocÃª aprova antes de enviar. VocÃª escolhe quais agentes podem responder sozinhos.'],
  ['De onde vem o 3D dos prÃ©dios?', 'De bases pÃºblicas de mapas e do Censo do IBGE, com a altura de cada prÃ©dio e o nÃºmero de andares. O sistema destaca o andar do apartamento e mostra o entorno, de dia e de noite.'],
  ['O que Ã© a @SIG@?', 'Uma versÃ£o reservada do seu portal para imÃ³veis acima de R$ 10 milhÃµes: poucas fotos, texto discreto e valores sÃ³ para quem entra no Clube @SIG@, que vira cliente quente no seu CRM.'],
  ['Funciona na minha cidade?', 'ComeÃ§amos por Campinas (SP) e a base de anÃºncios, prÃ©dios e bairros cresce por regiÃ£o. Fale com a gente para saber como estÃ¡ a sua cidade.'],
  ['Preciso de um nÃºmero de WhatsApp para cada agente?', 'NÃ£o para comeÃ§ar. DÃ¡ para iniciar com um nÃºmero e separar os agentes depois, conforme o movimento crescer.'],
  ['Quanto custa?', 'HÃ¡ planos para corretor autÃ´nomo e para imobiliÃ¡ria. Fale com a gente e montamos a proposta para o seu tamanho.'],
];

const ICONE = {
  olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  pena: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 4c-8 0-14 6-14 14v2h2c8 0 14-6 14-14V4Z"/><path d="M4 20 14 10"/></svg>',
  balao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 10h8M8 13h5"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>',
  chave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/></svg>',
};

function pagina() {
  const nome = esc(cfg.SISTEMA_NOME);
  const email = esc(EMAIL);
  const wa = esc(WHATSAPP);
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: cfg.SISTEMA_NOME, applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
    description: 'Sistema imobiliÃ¡rio com inteligÃªncia artificial para corretores e imobiliÃ¡rias: radar de captaÃ§Ã£o, condomÃ­nios em 3D, carteira, CRM, nove agentes de IA no WhatsApp, portal com linha signature e blog prÃ³prios.',
    url: 'https://corretordofuturo.app/', inLanguage: 'pt-BR', image: 'https://corretordofuturo.app/plataforma/telas/3d-noite.webp' };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PERGUNTAS.map(([q, a]) => ({ '@type': 'Question', name: q.replace(/@SIG@/g, 'signature'), acceptedAnswer: { '@type': 'Answer', text: a.replace(/@SIG@/g, 'signature') } })) };
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome} Â· o sistema imobiliÃ¡rio com inteligÃªncia artificial</title>
<meta name="description" content="Radar de captaÃ§Ã£o, condomÃ­nios em 3D, nove agentes de IA no WhatsApp, carteira, CRM, portal com a linha signature e blog com a sua marca. Para corretores e imobiliÃ¡rias.">
<link rel="canonical" href="https://corretordofuturo.app/">
<meta property="og:title" content="${nome} Â· o corretor do futuro jÃ¡ tem escritÃ³rio"><meta property="og:description" content="O sistema imobiliÃ¡rio com inteligÃªncia artificial: 3D dos prÃ©dios, radar de captaÃ§Ã£o, agentes no WhatsApp e portal com a sua marca."><meta property="og:url" content="https://corretordofuturo.app/"><meta property="og:type" content="website"><meta property="og:image" content="https://corretordofuturo.app/plataforma/telas/3d-noite.webp"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#070b0f">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Cormorant+Garamond:ital,wght@1,600&family=Pinyon+Script&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="/plataforma/site.css?v=3">
<link rel="preload" as="image" href="${T}3d-poster.webp">
<script type="application/ld+json">${json(ld)}</script><script type="application/ld+json">${json(faq)}</script>
</head><body>
<header class="topo"><div class="cx">
  <a class="marca" href="/" aria-label="${nome}, inÃ­cio"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 12 13 4l10 8v11H3Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 23v-7h6v7" fill="none" stroke="currentColor" stroke-width="2"/></svg>${nome}</a>
  <nav aria-label="SeÃ§Ãµes"><a class="sec" href="#ia">InteligÃªncia artificial</a><a class="sec" href="#radar">Radar</a><a class="sec" href="#condominios">3D</a><a class="sec" href="#portal">Portal e ${CAL}</a><a class="entrar" href="${APP_URL}">Entrar</a><a class="btn pri" href="#contato">Fale com a gente</a></nav>
</div></header>

<main>
<div class="escuro abre"><div class="cx">
  <div class="abre-grade">
    <div>
      <p class="kicker">Sistema imobiliÃ¡rio com inteligÃªncia artificial</p>
      <h1>O corretor do futuro jÃ¡ tem <em>escritÃ³rio</em>.</h1>
      <p class="sub">Nove agentes de IA atendendo no WhatsApp, um radar que lÃª os anÃºncios da cidade e acha o dono, os prÃ©dios em 3D com o andar do apartamento e um portal com a sua marca, da Vitrine Ã  ${CAL}.</p>
      <div class="acoes"><a class="btn pri" href="#contato">Quero ver funcionando</a><a class="btn" href="#ia">Conhecer por dentro</a></div>
      <div class="selo"><span>Para corretor e imobiliÃ¡ria</span><span>Sua marca, seu domÃ­nio</span><span>Computador, tablet e celular</span></div>
    </div>
    <div class="palco">
      <div class="palco-tela">
        <video autoplay muted loop playsinline preload="metadata" poster="${T}3d-poster.webp" aria-label="PrÃ©dio em 3D girando, com o andar do apartamento destacado em dourado">
          <source src="${T}3d.webm" type="video/webm"><source src="${T}3d.mp4" type="video/mp4"></video>
        <div class="palco-legenda"><b>CondomÃ­nio em 3D</b><span>o andar do apartamento em dourado, o entorno de verdade</span></div>
      </div>
      <div class="palco-flutuas">
        <div class="flutua f1"><b><span class="ponto" style="background:#3ddc84"></span>Ana Â· Apartamentos</b><i>Respondeu a Larissa e marcou a visita de sÃ¡bado, 10h.</i></div>
        <div class="flutua f2"><b>Leitura da base</b><i>Um 3 dormitÃ³rios no CambuÃ­ baixou 9% e estÃ¡ abaixo do mÂ² do bairro.</i></div>
        <div class="flutua f3"><b>ProprietÃ¡rio localizado</b><i>O robÃ´ de captaÃ§Ã£o jÃ¡ mandou a primeira mensagem.</i></div>
      </div>
    </div>
  </div>
  <ul class="numeros" aria-label="O sistema em nÃºmeros">
    ${NUMEROS.map(([n, suf, txt]) => `<li><strong data-conta="${n}" data-suf="${esc(suf)}">${n.toLocaleString('pt-BR')}${esc(suf)}</strong><span>${esc(txt)}</span></li>`).join('')}
  </ul>
</div></div>

<section id="ia" class="escuro ia" aria-labelledby="t-ia"><div class="cx">
  <p class="kicker">InteligÃªncias artificiais</p>
  <h2 id="t-ia">Nove agentes que nÃ£o tiram fÃ©rias, nem folga no domingo.</h2>
  <p class="lead">Cada agente cuida de um setor do escritÃ³rio e conversa pelo WhatsApp. Eles respondem na hora, entendem o que o cliente procura, mandam o imÃ³vel certo, marcam a visita e chamam o corretor quando Ã© a vez dele. VocÃª decide quem responde sozinho e quem sugere a resposta para vocÃª aprovar.</p>
  <ul class="agentes revelar">
    ${AGENTES.map(([ini, n, setor, txt, cor]) => `<li class="agente"><span class="avatar" style="background:${cor}" aria-hidden="true">${esc(ini)}</span><div><h3>${esc(n)}</h3><span class="setor">${esc(setor)}</span><p>${esc(txt)}</p></div></li>`).join('\n    ')}
  </ul>

  <div class="duas bloco-ia">
    <figure class="revelar">${janela('escritorio', 'EscritÃ³rio virtual com os agentes nas salas de captaÃ§Ã£o, vendas e diretoria, o movimento do dia e as respostas para aprovar', { url: 'app.corretordofuturo.app/#/whats' })}
      <figcaption>O escritÃ³rio virtual: cada agente na sua sala, o que aconteceu hoje e o que espera a sua aprovaÃ§Ã£o.</figcaption></figure>
    <div class="chat revelar" aria-label="Exemplo de conversa com um agente">
      <div class="chat-topo"><span class="avatar" style="background:#7fb4ff" aria-hidden="true">An</span><div><b>Ana Â· Apartamentos</b>WhatsApp da imobiliÃ¡ria</div></div>
      <p class="msg ent">Oi! Vi o apartamento de 3 quartos no CambuÃ­ no site. Aceita financiamento?</p>
      <p class="msg sug">Oi, Larissa! Aceita sim. SÃ£o 118 mÂ², 3 quartos e 2 vagas. Quer que eu simule as parcelas ou prefere visitar no sÃ¡bado?<small>Resposta sugerida pela Ana Â· esperando aprovaÃ§Ã£o</small></p>
      <div class="chat-acoes"><span>Editar</span><span class="ok">Aprovar e enviar</span></div>
      <p class="msg ent">Quero visitar no sÃ¡bado de manhÃ£.</p>
      <p class="msg sai">Combinado: sÃ¡bado Ã s 10h. A PatrÃ­cia te encontra na portaria. ðŸ˜Š<small>Visita na agenda Â· Marta avisou a corretora</small></p>
    </div>
  </div>

  <ul class="ia-faz">
    <li><h3>${ICONE.lupa}LÃª a cidade inteira</h3><p>Os anÃºncios da regiÃ£o passam por uma leitura que aponta queda de preÃ§o, imÃ³vel novo, encalhado, abaixo do metro do bairro e venda direta do dono, e explica cada sinal.</p></li>
    <li><h3>${ICONE.olho}VÃª as fotos e escreve</h3><p>A IA olha cada foto do imÃ³vel, reconhece os ambientes e escreve a pÃ¡gina do portal a partir das fotos e da ficha, com legenda em cada imagem.</p></li>
    <li><h3>${ICONE.pena}Publica sozinha</h3><p>O blog ganha textos novos todos os dias e cada bairro tem o seu guia, para a sua imobiliÃ¡ria aparecer no Google e nas respostas das IAs.</p></li>
    <li><h3>${ICONE.chave}Capta com vocÃª</h3><p>O robÃ´ de captaÃ§Ã£o fala com o dono do imÃ³vel anunciado, pede as fotos originais e a autorizaÃ§Ã£o, e entrega o imÃ³vel na carteira.</p></li>
    <li><h3>${ICONE.relogio}Cuida da agenda</h3><p>A Marta passa a agenda do dia aos corretores, lembra a visita uma hora antes e cobra o que ficou para trÃ¡s.</p></li>
    <li><h3>${ICONE.balao}Presta contas ao dono</h3><p>O Augusto manda o resumo da manhÃ£ e o relatÃ³rio da noite: clientes novos, visitas, propostas e o que precisa de decisÃ£o.</p></li>
  </ul>
</div></section>

<section id="radar" class="claro" aria-labelledby="t-radar"><div class="cx">
  <p class="kicker">Radar de captaÃ§Ã£o</p>
  <h2 id="t-radar">Os imÃ³veis da cidade, lidos e prontos para captar.</h2>
  <p class="lead">Dezenas de milhares de anÃºncios da regiÃ£o num mapa sÃ³, por bairro, rua e prÃ©dio. O sistema junta o mesmo imÃ³vel anunciado por vÃ¡rias imobiliÃ¡rias, compara com o preÃ§o do metro do bairro e mostra onde estÃ¡ a oportunidade.</p>
  <ul class="sinais" aria-label="Sinais que a leitura aponta">
    <li class="s-q">â†“ <b>Baixou o preÃ§o</b></li><li class="s-n">âœ¦ <b>AnÃºncio novo</b></li><li class="s-a">â—† <b>Abaixo do mÂ² do bairro</b></li>
    <li class="s-p">â˜º <b>Dono anuncia direto</b></li><li class="s-r">âŒ› <b>Anunciado hÃ¡ muito tempo</b></li><li class="s-v">â§‰ <b>VÃ¡rias imobiliÃ¡rias</b></li>
  </ul>
  <figure class="revelar">${janela('radar-ia', 'Leitura da base com o mapa dos anÃºncios coloridos pela situaÃ§Ã£o do proprietÃ¡rio, frases da IA e filtros por sinal', { url: 'app.corretordofuturo.app/#/radar' })}
    <figcaption>A leitura da base: cada ponto Ã© um anÃºncio, a cor diz se o dono jÃ¡ foi achado e as frases levam direto aos filtros.</figcaption></figure>
  <ol class="fluxo">
    <li><h3>O anÃºncio aparece</h3><p>Entra na base com bairro, rua, prÃ©dio, preÃ§o e histÃ³rico.</p></li>
    <li><h3>A leitura aponta</h3><p>Baixou de preÃ§o, estÃ¡ abaixo do bairro, Ã© do prÃ³prio dono.</p></li>
    <li><h3>Um clique localiza o dono</h3><p>Consulta com custo controlado e limite por dia.</p></li>
    <li><h3>O robÃ´ conversa</h3><p>O TH-IA-GO apresenta a imobiliÃ¡ria e pede as fotos originais.</p></li>
    <li><h3>Vira carteira</h3><p>O imÃ³vel entra na carteira na etapa certa, pronto para a autorizaÃ§Ã£o.</p></li>
  </ol>
</div></section>

<section id="condominios" class="escuro c3d" aria-labelledby="t-3d"><div class="cx">
  <p class="kicker">CondomÃ­nios em 3D</p>
  <h2 id="t-3d">Mostre o andar, a vista e a vizinhanÃ§a antes da visita.</h2>
  <p class="lead">Os prÃ©dios e condomÃ­nios da cidade com andares, torres e unidades. Abra o 3D, gire, veja o apartamento destacado no andar certo e troque o dia pela noite. A ficha do prÃ©dio traz o que estÃ¡ Ã  venda, o preÃ§o do metro e o que tem perto.</p>
  <div class="c3d-grade">
    <figure class="revelar">${janela('3d-noite', 'PrÃ©dio em 3D Ã  noite com as janelas acesas e o andar do apartamento destacado em dourado', { url: 'app.corretordofuturo.app/condominio-3d' })}
      <figcaption>Ã€ noite, com as janelas acesas: o andar do apartamento aparece em dourado.</figcaption></figure>
    <div class="c3d-lado">
      <figure class="revelar">${janela('3d-dia', 'O mesmo prÃ©dio em 3D durante o dia, com ruas, Ã¡reas verdes e a foto de satÃ©lite no chÃ£o', { url: 'app.corretordofuturo.app/condominio-3d' })}</figure>
      <figure class="revelar">${janela('cond-ficha', 'Ficha do condomÃ­nio com andares, unidades, preÃ§o do metro, imÃ³veis Ã  venda e o que tem perto', { url: 'app.corretordofuturo.app/#/condominios' })}</figure>
    </div>
  </div>
  <ul class="fatos">
    <li><strong>Andar por andar</strong><span>A unidade 182 acende no 18Âº andar, com a vista daquela altura.</span></li>
    <li><strong>Raio-X do prÃ©dio</strong><span>Andares, torres, unidades, taxa, IPTU e plantas mais comuns.</span></li>
    <li><strong>O que tem perto</strong><span>Escolas, parques, mercados e hospitais, com a distÃ¢ncia a pÃ©.</span></li>
    <li><strong>PrÃ©dio-alvo</strong><span>Marque prÃ©dios e seja avisado quando um apartamento entrar Ã  venda.</span></li>
  </ul>
  <p class="demo-aviso">Telas de uma imobiliÃ¡ria de demonstraÃ§Ã£o: nomes, imÃ³veis e nÃºmeros fictÃ­cios.</p>
</div></section>

<section id="painel" class="claro" aria-labelledby="t-painel"><div class="cx">
  <p class="kicker">Painel do dono</p>
  <h2 id="t-painel">O negÃ³cio inteiro numa tela, e o que precisa de vocÃª hoje.</h2>
  <p class="lead">Valor da carteira, vendas, clientes, visitas e captaÃ§Ã£o, comparados com o perÃ­odo anterior. Em cima de tudo, a lista do que nÃ£o pode esperar.</p>
  <div class="painel-cx revelar">
    ${janela('painel', 'Painel da imobiliÃ¡ria com a lista do que precisa de atenÃ§Ã£o, os nÃºmeros do negÃ³cio e os grÃ¡ficos de clientes e visitas', { url: 'app.corretordofuturo.app/#/painel' })}
    <p class="marcador m1"><b>Precisa de atenÃ§Ã£o</b>Cliente esperando no WhatsApp, visita sem confirmar, autorizaÃ§Ã£o parada.</p>
    <p class="marcador m2"><b>Comparado ao mÃªs anterior</b>Cada nÃºmero mostra se subiu ou caiu.</p>
    <p class="marcador m3"><b>Funil e equipe</b>Do anÃºncio Ã  venda, corretor por corretor.</p>
  </div>
</div></section>

<section id="operacao" class="claro" aria-labelledby="t-op"><div class="cx">
  <p class="kicker">OperaÃ§Ã£o</p>
  <h2 id="t-op">Carteira, ficha, CRM e visitas, conversando entre si.</h2>
  <p class="lead">O anÃºncio captado vira imÃ³vel na carteira, o imÃ³vel vira pÃ¡gina no portal, quem pergunta pelo portal vira cliente no CRM e Ã© atendido pelos agentes no WhatsApp.</p>
  <div class="telas" data-abas>
    <div class="abas" role="tablist" aria-label="Telas do sistema">
      ${OPERACAO.map((t, i) => `<button type="button" role="tab" id="aba-${t.k}" aria-controls="tela-${t.k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.nome)}</button>`).join('')}
    </div>
    ${OPERACAO.map((t, i) => `<figure class="painelaba" role="tabpanel" id="tela-${t.k}" aria-labelledby="aba-${t.k}"${i === 0 ? '' : ' hidden'}>${janela(t.k, t.alt)}
      <figcaption>${esc(t.legenda)}</figcaption></figure>`).join('\n    ')}
  </div>
  <div class="celulares" style="margin-top:64px">
    <figure class="celular"><img src="${T}celular.webp" width="1170" height="2532" alt="O painel do sistema aberto no celular" loading="lazy" decoding="async"><figcaption>O painel no celular</figcaption></figure>
    <figure class="celular alto"><img src="${T}celular-portal.webp" width="1170" height="2532" alt="O portal da imobiliÃ¡ria aberto no celular" loading="lazy" decoding="async"><figcaption>O portal do cliente</figcaption></figure>
    <figure class="celular"><img src="${T}celular-3d.webp?v=2" width="1170" height="2532" alt="O condomÃ­nio em 3D aberto no celular" loading="lazy" decoding="async"><figcaption>O 3D na palma da mÃ£o</figcaption></figure>
  </div>
</div></section>

<section id="portal" class="claro" aria-labelledby="t-portal"><div class="cx">
  <p class="kicker">Portal com a sua marca</p>
  <h2 id="t-portal">Uma vitrine, trÃªs jeitos de apresentar.</h2>
  <p class="lead">O portal fica no seu domÃ­nio, com a sua marca, e cada imÃ³vel ganha uma pÃ¡gina escrita a partir das fotos e da ficha. Quem se interessa vira cliente quente no seu CRM, com o imÃ³vel e o horÃ¡rio da visita.</p>
  <ul class="versoes">
    <li class="versao revelar">${mockVitrine()}<div><span class="tag">Vitrine</span><h3>Para quem busca</h3><p>Busca, filtros por tipo, bairro, quartos e valor, favoritos e uma pÃ¡gina completa para cada imÃ³vel.</p></div></li>
    <li class="versao revelar">${mockRevista()}<div><span class="tag">Revista</span><h3>Para quem sonha</h3><p>Uma ediÃ§Ã£o por mÃªs, com ensaios sobre modos de morar e os imÃ³veis entre os textos, como numa revista de casa.</p></div></li>
    <li class="versao sig revelar">${mockSignature(false)}<div><span class="tag">${CAL}</span><h3>Para poucos</h3><p>ResidÃªncias acima de R$ 10 milhÃµes, com menos fotos e mais intenÃ§Ã£o. Valores sÃ³ para membros do Clube ${CAL}.</p></div></li>
  </ul>
  <p class="demo-aviso">SimulaÃ§Ãµes com imÃ³veis fictÃ­cios e fotos ilustrativas geradas por inteligÃªncia artificial.</p>
  <figure class="pagina-imovel revelar">${janela('portal-imovel', 'PÃ¡gina de um apartamento no portal, com mosaico de fotos, o texto escrito pela IA, a ficha e o botÃ£o de agendar visita', { url: 'casaprado.com.br/imoveis/apartamento-cambui' })}
    <figcaption>A pÃ¡gina de cada imÃ³vel: mosaico de fotos, texto escrito a partir das fotos, ficha ao vivo e â€œAgendar visitaâ€, que cai direto no CRM.</figcaption></figure>
</div></section>

<section class="escuro signature" aria-labelledby="t-sig"><div class="cx">
  <div class="sig-grade">
    <div>
      <p class="kicker ouro-k">A linha</p>
      <p class="cal cal-grande">signature</p>
      <h2 id="t-sig">ResidÃªncias que nÃ£o se anunciam.</h2>
      <p class="lead">ImÃ³vel acima de R$ 10 milhÃµes entra sozinho na ${CAL} e some do portal comum. A apresentaÃ§Ã£o muda de tom: escura, silenciosa, com as fotos escolhidas a dedo.</p>
      <ul class="sig-lista">
        <li>Valores reservados aos membros do Clube ${CAL}</li>
        <li>Cada pedido de acesso vira cliente quente no CRM, com origem â€œ${CAL}â€</li>
        <li>Visita privada com hora marcada, pedida pela prÃ³pria pÃ¡gina</li>
        <li>PÃ¡ginas fora do Google, endereÃ§o nunca aparece</li>
      </ul>
      <a class="btn ouro" href="#contato">Quero a ${CAL} na minha imobiliÃ¡ria</a>
    </div>
    <figure class="revelar">${mockSignature(true)}
      <p class="sig-nota">SimulaÃ§Ã£o com imÃ³veis fictÃ­cios e fotos ilustrativas geradas por inteligÃªncia artificial.</p></figure>
  </div>
</div></section>

<section id="conteudo" class="claro" aria-labelledby="t-conteudo"><div class="cx">
  <p class="kicker">Blog e guias de bairro</p>
  <h2 id="t-conteudo">Seu nome na resposta quando alguÃ©m pesquisa o bairro.</h2>
  <p class="lead">O blog da imobiliÃ¡ria publica sozinho, trÃªs vezes por dia, e cada bairro onde vocÃª atua ganha um guia completo, com fotos reais, fontes e perguntas frequentes. Tudo leva o leitor para os seus imÃ³veis e para o formulÃ¡rio, nunca para fora do seu site.</p>
  <ul class="textos">
    <li class="texto revelar"><span class="quando">Artigo Â· 6h</span><h3>Varanda gourmet: o que avaliar antes de comprar</h3><p>VentilaÃ§Ã£o, ponto de gÃ¡s, carga elÃ©trica e o que o condomÃ­nio permite fechar.</p><div class="busca"><span>â€œvale a pena apartamento com varanda gourmetâ€</span></div></li>
    <li class="texto revelar"><span class="quando">Guia de bairro</span><h3>Morar no CambuÃ­: ruas, escolas, parques e o que custa</h3><p>Um guia completo, com o que tem perto, os prÃ©dios do bairro e os imÃ³veis Ã  venda.</p><div class="busca"><span>â€œcomo Ã© morar no CambuÃ­â€</span></div></li>
    <li class="texto revelar"><span class="quando">Dica Â· 18h</span><h3>Documentos para vender o imÃ³vel sem susto</h3><p>MatrÃ­cula, certidÃµes e o que o comprador vai pedir, em linguagem simples.</p><div class="busca"><span>â€œdocumentos para vender imÃ³velâ€</span></div></li>
  </ul>
</div></section>

<section id="comodos" class="claro" aria-labelledby="t-comodos"><div class="cx">
  <div class="comodos">
    <div>
      <p class="kicker">Tudo numa casa sÃ³</p>
      <h2 id="t-comodos">Cada cÃ´modo Ã© uma parte do sistema.</h2>
      <p class="lead" style="margin-bottom:24px">Toque num cÃ´modo da planta para ver o que ele faz.</p>
      <div class="ficha" id="ficha" aria-live="polite"></div>
    </div>
    <div>${plantaSvg()}<p class="planta-dica">A planta do ${nome}.</p></div>
  </div>
  <ul class="vis-oculto legenda-comodos">
    ${COMODOS.map((c) => `<li data-comodo="${c.k}" data-ir="${c.ir}"><h3>${esc(c.nome)}</h3><p>${esc(c.texto)}</p></li>`).join('\n    ')}
  </ul>
</div></section>

<section id="para-quem" class="claro" aria-labelledby="t-quem"><div class="cx">
  <h2 id="t-quem">Do corretor que trabalha sozinho Ã  imobiliÃ¡ria com equipe.</h2>
  <p class="lead">O mesmo sistema, ajustado ao tamanho de quem usa.</p>
  <div class="dois">
    <div class="perfil"><h3>Corretor parceiro</h3><p>VocÃª sozinho, com a estrutura de uma imobiliÃ¡ria por trÃ¡s.</p>
      <ul><li>Agentes que atendem no WhatsApp enquanto vocÃª estÃ¡ em visita</li><li>Portal, Revista e blog com o seu nome</li><li>Radar de captaÃ§Ã£o na sua regiÃ£o, sem planilha</li><li>3D do prÃ©dio para impressionar o cliente na primeira conversa</li></ul></div>
    <div class="perfil forte"><h3>ImobiliÃ¡ria parceira</h3><p>A equipe toda no mesmo lugar, cada um vendo o que Ã© seu.</p>
      <ul><li>Perfis de administrador, gestor e corretor</li><li>Carteira em etapas e painel do dono</li><li>Nove agentes por setor, com relatÃ³rio diÃ¡rio</li><li>Linha ${CAL} para o alto padrÃ£o</li></ul></div>
  </div>
</div></section>

<section class="claro" aria-labelledby="t-comeca"><div class="cx">
  <h2 id="t-comeca">Como comeÃ§a</h2>
  <p class="lead">Do primeiro contato ao sistema no ar com a sua marca.</p>
  <ol class="passos">
    <li><h3>Conversa</h3><p>Entendemos a sua regiÃ£o, a sua carteira e como a sua equipe trabalha.</p></li>
    <li><h3>Montagem</h3><p>Trazemos os seus imÃ³veis, ligamos o seu domÃ­nio e os nÃºmeros de WhatsApp.</p></li>
    <li><h3>No ar</h3><p>Portal, blog e agentes funcionando com a sua marca, e vocÃª acompanhando pelo painel.</p></li>
  </ol>
  <div class="planos" style="margin-top:72px">
    <div><h2>Planos para corretor e para imobiliÃ¡ria</h2><p>O valor depende do tamanho da equipe e da regiÃ£o. Conte como vocÃª trabalha e montamos a proposta.</p></div>
    <a class="btn" href="#contato">Pedir uma proposta</a>
  </div>
</div></section>

<section id="perguntas" class="claro" aria-labelledby="t-perguntas"><div class="cx">
  <h2 id="t-perguntas">Perguntas</h2>
  <div class="perguntas">
    ${PERGUNTAS.map(([q, a]) => `<details><summary>${esc(q).replace(/@SIG@/g, CAL)}</summary><p>${esc(a).replace(/@SIG@/g, CAL)}</p></details>`).join('\n    ')}
  </div>
</div></section>

<section id="contato" class="escuro" aria-labelledby="t-contato"><div class="cx">
  <div class="contato">
    <div>
      <p class="kicker">Fale com a gente</p>
      <h2 id="t-contato">Vamos montar o seu escritÃ³rio?</h2>
      <p class="lead" style="margin-bottom:0">Conte um pouco sobre vocÃª e respondemos pelo WhatsApp, com uma demonstraÃ§Ã£o ao vivo.</p>
      <div class="direto">
        <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ${esc(telBonito(WHATSAPP))}</a>
        <a href="mailto:${email}">${email}</a>
      </div>
    </div>
    <form class="fale" data-whatsapp="${wa}">
      <label>Seu nome<input name="nome" required autocomplete="name"></label>
      <label>Cidade<input name="cidade" required autocomplete="address-level2"></label>
      <label class="largo">VocÃª Ã©<select name="perfil" required><option value="">Escolha</option><option>Corretor parceiro</option><option>ImobiliÃ¡ria parceira</option><option>Outro</option></select></label>
      <label class="largo">Mensagem (opcional)<textarea name="mensagem" placeholder="Quantos corretores, quantos imÃ³veis, o que mais incomoda hoje"></textarea></label>
      <p class="nota">Ao enviar, o WhatsApp abre com a sua mensagem pronta. Nada fica gravado nesta pÃ¡gina.</p>
      <div class="largo"><button class="btn pri" type="submit">Enviar pelo WhatsApp</button></div>
    </form>
  </div>
</div></section>
</main>

<footer class="rodape"><div class="cx"><span>${nome} Â· <a href="${APP_URL}">Entrar no sistema</a></span><span>Telas de demonstraÃ§Ã£o com dados fictÃ­cios Â· Â© <span id="ano">${new Date().getFullYear()}</span> Â· <a href="mailto:${email}">${email}</a></span></div></footer>
<script src="/plataforma/site.js?v=3" defer></script>
</body></html>`;
}

let cache = null;
function vitrine(req, res, next) {
  const host = String(req.hostname || '').toLowerCase();
  // Entrada Ãºnica da plataforma: login de todas as imobiliÃ¡rias (src/plataforma/entrada.js).
  if (APP_HOSTS.has(host)) return require('./entrada').entrada(req, res, next);
  if (!HOSTS.has(String(req.hostname || '').toLowerCase())) return next();
  if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://corretordofuturo.app/sitemap.xml\n');
  if (req.path === '/sitemap.xml') return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://corretordofuturo.app/</loc></url></urlset>');
  if (req.path.startsWith('/plataforma/')) { const orig = req.url; req.url = req.url.slice('/plataforma'.length) || '/'; return estaticos(req, res, () => { req.url = orig; next(); }); }
  if (req.path.startsWith('/gestor/')) return next(); // painel do gestor
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ erro: 'NÃ£o encontrado.' });
  if (req.path !== '/') return res.redirect(302, '/');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(cache || (cache = pagina()));
}

module.exports = { vitrine, HOSTS, APP_HOSTS, pagina };
