// Banco de matérias do blog (plataforma Herrera HOUSE IA).
//
// Fábrica: as matérias são escritas (rotina do Claude) no ramo plataforma/banco-materias; o PC da
// RTX 4090 faz a capa e marca a matéria como "pronta" (scripts/banco-materias.mjs).
// Este módulo, no projeto da plataforma (corretordofuturo.app), faz duas coisas:
//   1. sincronizar(): traz do ramo para plataforma.materias o que está pronto, conferindo de novo
//      formato e régua (o que não passa fica fora);
//   2. ciclo(): sincroniza e roda plataforma.entregar_materias() (hoje e, à noite, amanhã).
// O ciclo é chamado pelo pg_cron do Supabase (POST /banco-ciclo com o token de plataforma.config)
// e pelo botão do painel do gestor. A entrega em si é do banco: uma matéria vai para uma imobiliária só.
const cfg = require('../config');
const { lerArtigo } = require('../blog/validar');
const { avaliarArtigo, tipoDe } = require('../blog/regua');
const { semAcento } = require('../blog/texto');
const { ENDERECO_DO_BANCO } = require('../blog/categorias');

const ramo = () => (process.env.BANCO_MATERIAS_URL || ENDERECO_DO_BANCO).replace(/\/+$/, '');
const DIAS_DA_NOTICIA = 5;

const normTema = (t) => semAcento(String(t || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Troca {{cliente}} por um nome e confere como o blog conferiria. */
function conferirMateria(bruto, nome = cfg.CLIENTE_NOME) {
  const erros = [];
  if (!bruto || typeof bruto !== 'object') return { erros: ['não é um objeto JSON'] };
  const tema = normTema(bruto.tema);
  if (tema.length < 3 || tema.length > 80) erros.push('falta o "tema" (3 a 80 caracteres): o assunto em poucas palavras');
  const texto = JSON.stringify(bruto).replace(/\{\{cliente\}\}/g, nome.replace(/["\\]/g, ''));
  const copia = JSON.parse(texto);
  if (!copia.publicadoEm) copia.publicadoEm = new Date().toISOString();
  const lido = lerArtigo(copia);
  if (!lido.ok) return { erros: [...erros, ...lido.erros] };
  const artigo = lido.valor;
  const av = avaliarArtigo(artigo);
  if (!av.aprovado) erros.push(...av.erros);
  for (const [, slug] of JSON.stringify(artigo.blocos).matchAll(/\]\(\/blog\/([a-z0-9-]+)[)#?]/g)) {
    if (slug !== 'categoria') erros.push(`link para /blog/${slug}: matéria do banco só aponta para /blog e para as categorias (cada imobiliária tem outros textos)`);
  }
  return { erros: [...new Set(erros)], artigo, tema, tipo: tipoDe(artigo) };
}

async function buscarJson(caminho) {
  const r = await fetch(`${ramo()}/${caminho}?t=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} para ${caminho}`);
  return r.json();
}

/** Traz do ramo as matérias prontas (com capa) que ainda não estão no banco. */
async function sincronizar(q) {
  const indice = await buscarJson('indice.json');
  const itens = indice && Array.isArray(indice.materias) ? indice.materias : [];
  const prontas = itens.filter((m) => m && m.situacao === 'pronta' && typeof m.slug === 'string');
  if (!prontas.length) return { novas: 0, recusadas: [] };
  const ja = new Set((await q('SELECT slug FROM materias WHERE slug = ANY($1)', [prontas.map((m) => m.slug)])).map((r) => r.slug));
  let novas = 0; const recusadas = [];
  for (const m of prontas) {
    if (ja.has(m.slug)) continue;
    try {
      const bruto = await buscarJson(`materias/${m.slug}.json`);
      if (!bruto) { recusadas.push({ slug: m.slug, motivo: 'arquivo sumiu do ramo' }); continue; }
      const c = conferirMateria(bruto);
      if (!c.erros.length && !(bruto.capa && bruto.capa.src)) c.erros.push('sem foto de capa');
      if (c.erros.length) { recusadas.push({ slug: m.slug, motivo: c.erros.slice(0, 3).join('; ') }); continue; }
      const { tema: _t, ...guardar } = bruto;
      const criada = Date.parse(m.criadaEm) || Date.now();
      const valido = c.tipo === 'noticia' ? new Date(criada + DIAS_DA_NOTICIA * 86400000).toISOString() : null;
      const r = await q(`INSERT INTO materias(slug, tipo, categoria, titulo, tema, conteudo, criada_em, valido_ate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
      [bruto.slug, c.tipo, bruto.categoria, bruto.titulo, c.tema, JSON.stringify(guardar), new Date(criada).toISOString(), valido]);
      if (r.length) novas += 1; else recusadas.push({ slug: m.slug, motivo: 'tema ou endereço repetido no banco' });
    } catch (e) { recusadas.push({ slug: m.slug, motivo: e.message }); }
  }
  return { novas, recusadas };
}

/** Sincroniza e entrega (hoje; depois das 18h, também amanhã). */
async function ciclo(q) {
  let sinc;
  try { sinc = await sincronizar(q); } catch (e) { sinc = { novas: 0, recusadas: [], erro: e.message }; }
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
  const hoje = (await q(`SELECT entregar_materias() AS r`))[0].r;
  const amanha = hora >= 18 ? (await q(`SELECT entregar_materias(((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1)) AS r`))[0].r : null;
  return { sincronizacao: sinc, hoje, amanha };
}

async function situacao(q) {
  return (await q('SELECT banco_situacao() AS s'))[0].s;
}

module.exports = { sincronizar, ciclo, situacao, conferirMateria, normTema };
