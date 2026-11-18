// O que cada imobiliária pode mostrar no portal, no blog e nas listas públicas.
// O Cadê meu AP? só publica apartamento (e os tipos que o próprio portal já agrupa como apartamento).
const cfg = require('./config');
const { porSlug } = require('./imobiliarias');

const TIPOS_APARTAMENTO = ['Apartamento', 'Cobertura', 'Flat', 'Studio', 'Kitnet', 'Loft', 'Kitinete'];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const limpa = (s) => String(s || '').replace(/\s+([?!.,])/g, '$1').replace(/[ \t]+/g, ' ').trim();

const PARA = new Set(['meu', 'minha', 'seu', 'sua', 'das', 'dos', 'uma', 'uns', 'para', 'pela', 'pelo']);
function tokens(s) {
  return semAcento(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !PARA.has(t));
}
function menciona(texto, marca) {
  const chaves = tokens(marca);
  const t = semAcento(texto);
  if (!chaves.length) return t.includes(semAcento(marca));
  return chaves.some((k) => t.includes(k));
}

function somenteApartamentos() {
  const flag = String(process.env.PORTAL_SOMENTE || '').trim().toLowerCase();
  if (['1', 'sim', 'true', 'apartamento', 'apartamentos'].includes(flag)) return true;
  if (['0', 'nao', 'não', 'false'].includes(flag)) return false;
  const tema = String(process.env.TEMA || cfg.TEMA || '').toLowerCase();
  if (tema === 'cademeuap') return true;
  const nome = semAcento(process.env.CLIENTE_NOME || cfg.CLIENTE_NOME || '').replace(/[^a-z0-9]+/g, ' ');
  if (/cad.? meu ap/.test(nome)) return true;
  const casa = porSlug(tema);
  return !!(casa && casa.somenteApartamentos);
}

function aceitaTipo(tipo) {
  if (!somenteApartamentos()) return true;
  const t = semAcento(tipo).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!t) return false;
  if (t.startsWith('apart')) return true;
  return TIPOS_APARTAMENTO.some((a) => semAcento(a) === t.replace(/ /g, ''));
}

/** Trecho SQL (parâmetros `?`) para esconder o que não é apartamento. Coluna tem de ser identificador fixo do código. */
function filtroTipoSql(coluna) {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(coluna)) throw new Error('coluna inválida');
  if (!somenteApartamentos()) return { sql: '', params: [] };
  const params = TIPOS_APARTAMENTO.map((t) => semAcento(t));
  return {
    sql: ` AND (lower(${coluna}) LIKE 'apart%' OR lower(${coluna}) IN (${params.map(() => '?').join(',')}))`,
    params,
  };
}

/** O mesmo filtro, já com literais, para as consultas da Caixa (os tipos vêm da lista fixa daqui). */
function sqlSomenteApartamento(coluna = 'tipo') {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(coluna) || !somenteApartamentos()) return '';
  const lista = TIPOS_APARTAMENTO.map((t) => `'${semAcento(t)}'`).join(',');
  return ` AND (lower(${coluna}) LIKE 'apart%' OR lower(${coluna}) IN (${lista}))`;
}

function clienteVisivel() { return limpa(process.env.CLIENTE_NOME || cfg.CLIENTE_NOME) || 'Imobiliária'; }

/** Empresa errada (não cita a marca) não aparece no site. O caso real: "imobiliária inteligência" no lugar de Cadê meu AP?. */
function empresaVisivel() {
  const cliente = clienteVisivel();
  const empresa = limpa(process.env.EMPRESA || cfg.EMPRESA);
  if (empresa && menciona(empresa, cliente)) return empresa;
  return cliente;
}

function legendaDoBlog() {
  const cliente = clienteVisivel();
  const env = limpa(process.env.BLOG_LEGENDA || '');
  if (env && menciona(env, cliente)) return env;
  if (somenteApartamentos()) return `Apartamentos em Campinas, pela ${cliente}`;
  if (!env) return `Casa, arquitetura e bem-estar, pela ${cliente}`;
  return `Casa, bairro e jeito de morar, pela ${cliente}`;
}

module.exports = {
  TIPOS_APARTAMENTO, semAcento, limpa, menciona, somenteApartamentos, aceitaTipo,
  filtroTipoSql, sqlSomenteApartamento, clienteVisivel, empresaVisivel, legendaDoBlog,
};
