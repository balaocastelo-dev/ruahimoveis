// Blog do cliente (a imobiliária) · categorias, chamadas e o endereço do ramo de conteúdo.
//
// As chamadas (o convite para falar com a imobiliária) têm o texto escrito AQUI, e não
// pela rotina: o artigo automático só escolhe o tema. Assim nenhum texto que
// ninguém revisou fala em nome da imobiliária. Para mudar um convite, mude aqui.
// O nome da imobiliária vem da configuração (cfg.CLIENTE_NOME / cfg.EMPRESA).

const cfg = require('../config');
// lido na hora: com a plataforma multi-imobiliária, cada requisição pode ser de uma imobiliária diferente
const CLIENTE = () => cfg.CLIENTE_NOME;

const CATEGORIAS = [
  { slug: 'alto-padrao', nome: 'Alto padrão', descricao: 'Como avaliar, comprar e viver bem num imóvel de alto padrão.' },
  { slug: 'construcao', nome: 'Construção e casas novas', descricao: 'Obra, projeto, materiais e o que conferir num imóvel novo.' },
  { slug: 'interiores', nome: 'Interiores e mobiliário', descricao: 'Mobiliário de luxo, decoração e materiais que atravessam décadas.' },
  { slug: 'bem-estar', nome: 'Bem-estar em casa', descricao: 'Luz, silêncio, verde e conforto: a casa que faz bem.' },
  { slug: 'campinas', nome: 'Campinas e região', descricao: 'Bairros, condomínios e a vida em Campinas e arredores.' },
  { slug: 'noticias', nome: 'Mercado imobiliário', descricao: 'O que mudou no mercado e o que isso muda para você.' },
];
const SLUGS = new Set(CATEGORIAS.map((c) => c.slug));
const nomeDaCategoria = (slug) => (CATEGORIAS.find((c) => c.slug === slug) || {}).nome || slug;

// Site e Instagram da imobiliária: cfg.SITE_CLIENTE / cfg.INSTAGRAM_CLIENTE (cadastro da imobiliária ou .env;
// SITE_RUAH / INSTAGRAM_RUAH, os nomes antigos, continuam valendo). Exportados abaixo como getters.

/**
 * Temas de chamada. O leitor nunca sai do site da imobiliária (decisão do Thiago, 26/10/2026):
 *   'contato' abre o formulário do próprio blog (vira lead no CRM, com o motivo);
 *   'portal'  leva à vitrine de imóveis à venda (/imoveis);
 *   'blog'    fica no blog.
 */
function chamadas() {
  const CHAMADAS = {
  comprar: {
    titulo: 'Procurando um imóvel em Campinas?',
    texto: `Conte o que você procura e um corretor da ${CLIENTE()} responde. O atendimento é feito por pessoas, do primeiro contato à assinatura.`,
    rotulo: 'Falar com um corretor',
    acao: 'contato',
    motivo: 'comprar',
  },
  vender: {
    titulo: 'Vai vender o seu imóvel?',
    texto: `A ${CLIENTE()} trabalha com a venda de imóveis em Campinas e região. Deixe seu contato e conte o que você tem.`,
    rotulo: 'Quero vender',
    acao: 'contato',
    motivo: 'vender',
  },
  'alto-padrao': {
    titulo: `Veja os imóveis à venda pela ${CLIENTE()}`,
    texto: 'Casas e apartamentos à venda em Campinas, com fotos, ficha completa e contato direto com o corretor.',
    rotulo: 'Ver imóveis',
    acao: 'portal',
  },
  visita: {
    titulo: 'Quer ver um imóvel de perto?',
    texto: `Escolha o imóvel na vitrine da ${CLIENTE()} e peça a visita na página dele: um corretor confirma o dia com você.`,
    rotulo: 'Ver imóveis à venda',
    acao: 'portal',
  },
  blog: {
    titulo: 'Mais ideias para a sua casa',
    texto: 'Textos novos todos os dias, às 6h, 12h e 18h: arquitetura, interiores, bem-estar e Campinas.',
    rotulo: 'Ver mais textos',
    acao: 'blog',
  },
  geral: {
    titulo: `Fale com a ${CLIENTE()}`,
    texto: 'Imobiliária de venda em Campinas. Deixe sua dúvida e um corretor responde.',
    rotulo: 'Enviar minha dúvida',
    acao: 'contato',
    motivo: 'duvida',
  },
};
  // 'instagram' levava o leitor para fora do site; os textos que já usam esse tema mostram a chamada do blog.
  CHAMADAS.instagram = CHAMADAS.blog;
  return CHAMADAS;
}
const TEMAS = new Set(Object.keys(chamadas()));

/** O ramo do GitHub onde a rotina publica. O repositório é público: leitura sem senha. */
const RAMO_DE_CONTEUDO = 'claude/blog-conteudo';
const DONO_REPO = 'balaocastelo-dev/ruah-imoveis';
const ENDERECO_DO_RAMO = `https://raw.githubusercontent.com/${DONO_REPO}/refs/heads/${RAMO_DE_CONTEUDO}`;

const arquivoDaCapa = (slug, marca, ext) => `capas/${slug}-${marca}.${ext}`;
const enderecoDaCapa = (slug, marca, ext) => `${ENDERECO_DO_RAMO}/${arquivoDaCapa(slug, marca, ext)}`;
/** A capa de artigo da rotina só pode ser o arquivo que o comando gravou para ele. */
function capaDaRotina(src, slug) {
  const prefixo = `${ENDERECO_DO_RAMO}/capas/${slug}-`;
  return typeof src === 'string' && src.startsWith(prefixo) && /^[0-9a-f]{8}\.(?:jpg|png)$/.test(src.slice(prefixo.length));
}

module.exports = {
  CATEGORIAS, SLUGS, nomeDaCategoria, chamadas, TEMAS,
  RAMO_DE_CONTEUDO, DONO_REPO, ENDERECO_DO_RAMO, arquivoDaCapa, enderecoDaCapa, capaDaRotina,
};
// valores da imobiliária atual, lidos na hora (não desestruture estes no carregamento do módulo)
for (const [k, de] of [['CHAMADAS', chamadas], ['SITE_CLIENTE', () => cfg.SITE_CLIENTE], ['INSTAGRAM_CLIENTE', () => cfg.INSTAGRAM_CLIENTE],
  ['SITE_RUAH', () => cfg.SITE_CLIENTE], ['INSTAGRAM_RUAH', () => cfg.INSTAGRAM_CLIENTE]]) Object.defineProperty(module.exports, k, { get: de, enumerable: true });
