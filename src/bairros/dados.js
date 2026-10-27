// Bairros · a lista de bairros (tabela `bairros`) e os números AO VIVO de cada
// um: imóveis da RUAH à venda, prédios e condomínios da base, e o que tem perto.
//
// O texto da página vem do ramo de conteúdo; estes números vêm do banco a cada
// renovação da página e nunca são escritos à mão.

const { one, all, run } = require('../db');
const { CATALOGO, chaveBairro, slugDe } = require('./catalogo');
const { distancia } = require('../condominios/geo');

// ------------------------------------------------------------------ a lista
let semeado = false;
/** Na primeira leitura, o catálogo inicial entra na tabela (o que já existe não é tocado). */
function semear() {
  if (semeado) return;
  const n = one("SELECT count(*) n FROM bairros WHERE origem='catalogo'").n;
  if (Number(n) < CATALOGO.length) {
    for (const b of CATALOGO) {
      run(`INSERT INTO bairros(slug,nome,regiao,apelidos,origem) VALUES(?,?,?,?,'catalogo') ON CONFLICT(slug) DO NOTHING`, slugDe(b.nome), b.nome, b.regiao, b.apelidos.join('\n'));
    }
  }
  semeado = true;
}

const lerLinha = (b) => ({
  slug: b.slug, nome: b.nome, regiao: b.regiao || null,
  apelidos: String(b.apelidos || '').split(/\n|;/).map((x) => x.trim()).filter(Boolean),
  prioridade: Number(b.prioridade) || 0, oculto: !!Number(b.oculto), notas: b.notas || '', pedidoEm: b.pedido_em || null,
  origem: b.origem || 'manual', lat: b.lat ?? null, lon: b.lon ?? null, atualizadoEm: b.atualizado_em || null,
});

let cacheLista = null;
function listar({ ocultos = true } = {}) {
  semear();
  if (!cacheLista || Date.now() - cacheLista.quando > 60e3) cacheLista = { quando: Date.now(), valor: all('SELECT * FROM bairros ORDER BY nome').map(lerLinha) };
  return ocultos ? cacheLista.valor : cacheLista.valor.filter((b) => !b.oculto);
}
const porSlug = (slug) => listar().find((b) => b.slug === slug) || null;
function limpar() { cacheLista = null; cacheCond = null; cachePerto.clear(); }

/** chave do nome (e de cada apelido) → slug. Bairro oculto continua reconhecido (não vira "sugestão"). */
function mapaDeChaves() {
  const m = new Map();
  for (const b of listar()) for (const n of [b.nome, ...b.apelidos]) { const k = chaveBairro(n); if (k && !m.has(k)) m.set(k, b.slug); }
  return m;
}
const slugDoTexto = (texto, mapa = mapaDeChaves()) => (texto ? mapa.get(chaveBairro(texto)) || null : null);

// ------------------------------------------------------------------ condomínios e prédios (base Receita + IBGE + mapa)
let cacheCond = null;
function condominiosPorBairro() {
  if (cacheCond && Date.now() - cacheCond.quando < 10 * 60e3) return cacheCond.valor;
  const mapa = mapaDeChaves();
  const grupos = new Map();
  const soltos = new Map(); // nomes de bairro que não estão na lista (para as sugestões)
  for (const c of all("SELECT id, nome, bairro, tipo, andares, torres, unidades, lat, lon, sem_nome, slug FROM condominios WHERE coalesce(tipo,'') <> 'comercial' AND bairro IS NOT NULL")) {
    const s = mapa.get(chaveBairro(c.bairro));
    if (!s) { const k = chaveBairro(c.bairro); if (k) { const x = soltos.get(k) || { nome: c.bairro, n: 0 }; x.n++; soltos.set(k, x); } continue; }
    if (!grupos.has(s)) grupos.set(s, []);
    grupos.get(s).push(c);
  }
  cacheCond = { quando: Date.now(), valor: { grupos, soltos } };
  return cacheCond.valor;
}

/** O centro do bairro: média dos prédios, sem os pontos que fogem demais (erro de cadastro). */
function centroDe(pontos) {
  const p = pontos.filter((x) => Number(x.lat) && Number(x.lon));
  if (!p.length) return null;
  const media = (l) => ({ lat: l.reduce((s, x) => s + x.lat, 0) / l.length, lon: l.reduce((s, x) => s + x.lon, 0) / l.length });
  let c = media(p);
  const perto = p.filter((x) => distancia(c.lat, c.lon, x.lat, x.lon) < 2500);
  if (perto.length >= 3) c = media(perto);
  return { lat: Math.round(c.lat * 1e5) / 1e5, lon: Math.round(c.lon * 1e5) / 1e5 };
}

function condominiosDo(slug) {
  const l = condominiosPorBairro().grupos.get(slug) || [];
  const verticais = l.filter((c) => c.tipo === 'vertical');
  const horizontais = l.filter((c) => c.tipo === 'horizontal');
  const comNome = l.filter((c) => !Number(c.sem_nome) && c.nome && !/^edif[ií]cio na /i.test(c.nome));
  return {
    total: l.length, verticais: verticais.length, horizontais: horizontais.length,
    unidades: l.reduce((s, c) => s + (Number(c.unidades) || 0), 0),
    maisAlto: Math.max(0, ...l.map((c) => Number(c.andares) || 0)) || null,
    nomes: comNome.sort((a, b) => (Number(b.unidades) || 0) - (Number(a.unidades) || 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 40).map((c) => ({ nome: c.nome, tipo: c.tipo || null, andares: c.andares || null, unidades: c.unidades || null, slug: c.slug || null })),
    pontos: l.map((c) => ({ lat: c.lat, lon: c.lon })),
  };
}

// ------------------------------------------------------------------ o que tem perto (Overture/OSM no banco)
const cachePerto = new Map();
function pertoDo(centro, raio = 1500) {
  if (!centro) return null;
  const k = `${centro.lat},${centro.lon},${raio}`;
  const c = cachePerto.get(k);
  if (c && Date.now() - c.quando < 60 * 60e3) return c.valor;
  let v = null;
  try { v = require('../condominios/perto').doBanco(centro.lat, centro.lon, raio); } catch { v = null; }
  if (v) v.categorias = v.categorias.filter((x) => x.total > 0);
  cachePerto.set(k, { quando: Date.now(), valor: v });
  if (cachePerto.size > 300) cachePerto.clear();
  return v;
}

// ------------------------------------------------------------------ imóveis da RUAH
const AMBIENTE_DO_PREDIO = ['fachada', 'condominio', 'vista', 'lazer', 'piscina', 'jardim'];

/** Os imóveis com página no portal, agrupados por bairro. `noAr` vem de portal/fonte. */
function imoveisPorBairro(noAr) {
  const mapa = mapaDeChaves();
  const g = new Map();
  for (const x of noAr || []) {
    const s = slugDoTexto(x.imovel.bairro, mapa);
    if (!s) continue;
    if (!g.has(s)) g.set(s, []);
    // A foto que mostra o prédio ou a casa por fora; sem ela, a capa da página.
    const gal = x.pagina.galeria || [];
    const existe = new Set(x.imovel.fotos);
    const predio = AMBIENTE_DO_PREDIO.map((a) => gal.find((f) => f.ambiente === a && existe.has(f.foto))).find(Boolean);
    const foto = predio ? { foto: predio.foto, legenda: predio.legenda } : { foto: x.pagina.capa.foto, legenda: x.pagina.capa.alt };
    g.get(s).push({ ...x, fotoDoPredio: foto });
  }
  return g;
}

/** Todas as fotos de imóveis da RUAH à venda no bairro (para quem escreve; com o ambiente quando a página do imóvel diz). */
function fotosDeImoveis(slug, imoveisAVenda, noAr) {
  const mapa = mapaDeChaves();
  const paginas = new Map((noAr || []).map((x) => [x.imovel.codigo, x.pagina]));
  return imoveisAVenda.filter((im) => slugDoTexto(im.bairro, mapa) === slug).map((im) => {
    const pg = paginas.get(im.codigo);
    const amb = new Map(((pg && pg.galeria) || []).map((f) => [f.foto, f]));
    return {
      codigo: im.codigo, tipo: im.tipo, condominio: im.condominio, pagina: pg ? `/imoveis/${pg.slug}` : null,
      fotos: im.fotos.map((id) => ({ foto: id, ...(amb.get(id) ? { ambiente: amb.get(id).ambiente, legenda: amb.get(id).legenda } : {}) })),
    };
  });
}

/** Os bairros que aparecem nos cadastros e não estão na lista (a tela oferece "adicionar" ou "é apelido de…"). */
function sugestoes(imoveisAVenda) {
  const mapa = mapaDeChaves();
  const m = new Map();
  for (const [k, x] of condominiosPorBairro().soltos) m.set(k, { nome: x.nome, condominios: x.n, imoveis: 0 });
  for (const im of imoveisAVenda) {
    if (!im.bairro || mapa.get(chaveBairro(im.bairro))) continue;
    if (im.cidade && !/campinas/i.test(im.cidade)) continue;
    const k = chaveBairro(im.bairro);
    const x = m.get(k) || { nome: im.bairro, condominios: 0, imoveis: 0 };
    x.imoveis++; if (!m.has(k)) m.set(k, x);
  }
  return [...m.values()].filter((x) => x.imoveis > 0 || x.condominios >= 8).sort((a, b) => b.imoveis - a.imoveis || b.condominios - a.condominios).slice(0, 60);
}

/** Tudo o que se sabe ao vivo de um bairro. */
function vivo(b, imoveisDoBairro = []) {
  const cond = condominiosDo(b.slug);
  const centro = b.lat && b.lon ? { lat: b.lat, lon: b.lon } : centroDe(cond.pontos);
  const valores = imoveisDoBairro.map((x) => x.imovel.valor).filter(Boolean);
  const tipos = [...imoveisDoBairro.reduce((m, x) => m.set(x.imovel.tipo, (m.get(x.imovel.tipo) || 0) + 1), new Map())].sort((a, c) => c[1] - a[1]);
  const { pontos, ...condominios } = cond;
  return {
    centro, condominios, perto: pertoDo(centro),
    carteira: { total: imoveisDoBairro.length, tipos, menor: valores.length ? Math.min(...valores) : null, maior: valores.length ? Math.max(...valores) : null },
  };
}

module.exports = { listar, porSlug, limpar, mapaDeChaves, slugDoTexto, condominiosDo, imoveisPorBairro, fotosDeImoveis, sugestoes, vivo, centroDe };
