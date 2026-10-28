// Bairros · junta as páginas escritas (ramo do GitHub) com a lista de bairros
// (banco) e decide o que está no ar.
//
// Publicar uma página não reinstala o sistema: é um arquivo novo no ramo
// `claude/bairros-conteudo`. O sistema relê o ramo a cada 10 minutos e guarda a
// última cópia boa em data/bairros-cache: se o GitHub cair, as páginas continuam.
//
// No ar = bairro na lista e não oculto + página no ramo + formato certo + régua aprovada.

const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { ENDERECO_DO_RAMO } = require('./config');
const { lerPagina, lerLinha } = require('./validar');
const { avaliarPagina } = require('./regua');
const dados = require('./dados');

const INTERVALO_MS = 10 * 60 * 1000;
const ESTADO_MS = 2 * 60 * 1000;
const ANTIGA_DIAS = 365;
const PASTA = path.join(cfg.DATA_DIR, 'bairros-cache');
const base = () => (process.env.BAIRROS_CONTEUDO_URL || ENDERECO_DO_RAMO).replace(/\/+$/, '');
const ligado = () => process.env.BAIRROS !== 'false';

const memoria = new Map();

// multi-imobiliária: cada imobiliária tem o seu conteúdo (o endereço do ramo passa a ser configuração dela), então a memória
// e a cópia em disco são separadas por imobiliária. A padrão continua na pasta de sempre.
const tenant = require('../tenant');
const chaveMem = (c) => `${tenant.chaveCache()}|${c}`;
const pastaDe = () => (tenant.chaveCache() === tenant.padrao().slug ? PASTA : path.join(PASTA, tenant.chaveCache()));
const limpaMemoria = () => { const p = `${tenant.chaveCache()}|`; for (const k of [...memoria.keys()]) if (k.startsWith(p)) memoria.delete(k); };
const arquivoDeCache = (c) => path.join(pastaDe(), c.replace(/[^a-z0-9.-]+/gi, '_'));

async function buscar(caminho) {
  const m = memoria.get(chaveMem(caminho));
  if (m && Date.now() - m.quando < INTERVALO_MS) return m.valor;
  try {
    const r = await fetch(`${base()}/${caminho}?t=${Math.floor(Date.now() / INTERVALO_MS)}`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) { memoria.set(chaveMem(caminho), { quando: Date.now(), valor: null }); return null; }
    if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`);
    const valor = await r.json();
    memoria.set(chaveMem(caminho), { quando: Date.now(), valor });
    try { fs.mkdirSync(pastaDe(), { recursive: true }); fs.writeFileSync(arquivoDeCache(caminho), JSON.stringify(valor)); } catch { /* conveniência */ }
    return valor;
  } catch (erro) {
    if (m) { memoria.set(chaveMem(caminho), { quando: Date.now() - INTERVALO_MS + 60_000, valor: m.valor }); return m.valor; }
    try {
      const valor = JSON.parse(fs.readFileSync(arquivoDeCache(caminho), 'utf8'));
      memoria.set(chaveMem(caminho), { quando: Date.now() - INTERVALO_MS + 60_000, valor });
      return valor;
    } catch { /* sem cópia */ }
    console.error(new Date().toLocaleString('pt-BR'), `[bairros] não consegui ler ${caminho}: ${erro.message}`);
    throw erro;
  }
}

async function emLotes(itens, n, fn) {
  const saida = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await fn(itens[k]).catch(() => null); }
  }));
  return saida;
}

/** O que a régua precisa de um bairro. */
const bairroParaRegua = (b, fotosImoveis = []) => b && ({ slug: b.slug, nome: b.nome, apelidos: b.apelidos, fotosImoveis });

// estado calculado (o que está no ar), um por imobiliária: { estado: { quando, valor }, calculando }
const ESTADOS = new Map();
const est = () => { const k = tenant.chaveCache(); if (!ESTADOS.has(k)) ESTADOS.set(k, { estado: null, calculando: null }); return ESTADOS.get(k); };

/**
 * noAr:     [{ bairro, pagina }]
 * situacao: por slug, para a tela do sistema e para quem escreve
 */
async function calcular() {
  const bairros = dados.listar();
  const situacao = new Map(bairros.map((b) => [b.slug, { slug: b.slug, nome: b.nome, regiao: b.regiao, oculto: b.oculto, prioridade: b.prioridade, notas: b.notas, pedidoEm: b.pedidoEm, estado: b.oculto ? 'oculto' : 'sem-pagina' }]));
  if (!ligado()) return { noAr: [], situacao };

  let indice = null;
  try { indice = await buscar('indice.json'); } catch { /* sem índice: nenhuma página */ }
  const linhas = (indice && Array.isArray(indice.paginas) ? indice.paginas : []).map(lerLinha).filter(Boolean);
  const porSlug = new Map(bairros.map((b) => [b.slug, b]));
  const usadas = linhas.filter((l) => porSlug.has(l.slug));
  const brutos = await emLotes(usadas, 12, (l) => buscar(`paginas/${l.slug}.json`));

  const noAr = [];
  usadas.forEach((linha, k) => {
    const b = porSlug.get(linha.slug);
    const s = situacao.get(b.slug);
    Object.assign(s, { titulo: linha.titulo, publicadoEm: linha.publicadoEm, atualizadoEm: linha.atualizadoEm });
    const bruto = brutos[k];
    if (!bruto) { if (!b.oculto) s.estado = 'sem-arquivo'; return; }
    const lido = lerPagina(bruto);
    if (!lido.ok) { if (!b.oculto) { s.estado = 'reprovada'; s.erros = lido.erros; } console.error(`[bairros] ${b.slug} fora do ar — arquivo malformado:\n- ${lido.erros.join('\n- ')}`); return; }
    const pg = lido.valor;
    const av = avaliarPagina(pg, bairroParaRegua(b), { modo: 'site' });
    if (!av.aprovado) { if (!b.oculto) { s.estado = 'reprovada'; s.erros = av.erros; } console.error(`[bairros] ${b.slug} fora do ar — reprovada na régua:\n- ${av.erros.join('\n- ')}`); return; }
    s.palavras = av.medidas.palavras;
    if (b.oculto) return;
    const data = Date.parse(pg.atualizadoEm || pg.publicadoEm || 0);
    const pedido = b.pedidoEm ? Date.parse(String(b.pedidoEm).replace(' ', 'T')) : 0;
    s.estado = pedido && pedido > data ? 'pedida' : Date.now() - data > ANTIGA_DIAS * 864e5 ? 'antiga' : 'no-ar';
    noAr.push({ bairro: b, pagina: pg });
  });
  noAr.sort((a, c) => a.bairro.nome.localeCompare(c.bairro.nome, 'pt-BR'));
  return { noAr, situacao };
}

async function obterEstado() {
  const E = est();
  if (E.estado && Date.now() - E.estado.quando < ESTADO_MS) return E.estado.valor;
  if (!E.calculando) E.calculando = calcular().then((v) => { E.estado = { quando: Date.now(), valor: v }; return v; }).finally(() => { E.calculando = null; });
  return E.calculando;
}

const noAr = async () => (await obterEstado()).noAr;
async function porSlug(slug) { return (await noAr()).find((x) => x.bairro.slug === slug) || null; }
async function situacao() { return [...(await obterEstado()).situacao.values()]; }
function limparCache() { limpaMemoria(); est().estado = null; dados.limpar(); }
/** Depois de mudar a lista na tela do sistema: recalcula sem reler o GitHub. */
function recalcular() { est().estado = null; dados.limpar(); }

module.exports = { noAr, porSlug, situacao, obterEstado, limparCache, recalcular, bairroParaRegua };
