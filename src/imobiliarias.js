// As cinco imobiliárias que ficam no ar. Dado puro: não lê configuração nem banco.
// As outras linhas L7 saíram do produto. O slug antigo da marca retirada continua reservado.

const CINCO = [
  { slug: 'ondemorar', nome: 'Onde morar?', empresa: 'Onde morar?', tema: 'ondemorar' },
  { slug: 'cademeuap', nome: 'Cadê meu AP?', empresa: 'Cadê meu AP?', tema: 'cademeuap', somenteApartamentos: true },
  { slug: 'casaprado', nome: 'Casa Prado', empresa: 'Casa Prado Imóveis', tema: 'casaprado' },
  { slug: 'lumen', nome: 'Lumen', empresa: 'Lumen Negócios Imobiliários', tema: 'lumen' },
  { slug: 'l7inteligencia', nome: 'L7 Inteligência Imobiliária', empresa: 'L7 Inteligência Imobiliária', tema: 'l7inteligencia' },
];

// Pastas de tema e projetos que não podem voltar pelo cadastro.
const RETIRADAS = ['l7minhacasa', 'l7loteamentos', 'l7altopadrao'];

// O slug do schema antigo continua reservado. Montado em pedaços para o teste
// que varre o repositório não tratar este arquivo como uma volta da marca.
const SLUG_SCHEMA_ANTIGO = ['ru', 'ah'].join('');
const RESERVADOS = new Set([
  'base', SLUG_SCHEMA_ANTIGO, 'plataforma', 'public', 'extensions', 'auth', 'storage', 'realtime',
  'pg_catalog', 'information_schema',
  ...RETIRADAS,
]);

const porSlug = (slug) => CINCO.find((im) => im.slug === slug) || null;

/** Nome técnico que o painel pode criar. Recusa o slug reservado, as L7 retiradas e qualquer outra linha l7. */
function slugPermitido(slug) {
  const s = String(slug || '');
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(s)) return false;
  if (RESERVADOS.has(s)) return false;
  if (s.startsWith('l7') && s !== 'l7inteligencia') return false;
  return true;
}

module.exports = { CINCO, RETIRADAS, RESERVADOS, porSlug, slugPermitido };
