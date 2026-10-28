// Bairros · rotas públicas (sem login) e da tela do sistema.
//   /bairros                         os bairros com guia, por região
//   /bairros/<bairro>                o guia do bairro
//   /bairros/<bairro>/foto/<n>       foto do Commons usada na página (licença conferida; cache longo)
//   /bairros/dados.json              a fila e tudo que quem escreve precisa (números ao vivo, fotos de imóveis, notas)
//   /bairros/commons/busca.json      ponte de busca no Wikimedia Commons, para quem escreve
//   /bairros/commons/info.json       licença e autor de um arquivo do Commons
//   /bairros/commons/ver             pré-visualização de um arquivo do Commons (só licença aceita)
//   POST /api/publico/bairros/contato        formulário da página → lead no CRM
//   /api/bairros…                    a tela Conteúdo › Páginas de bairros (com login)
const express = require('express');
const A = require('../auth');
const { one, run, audit } = require('../db');
const { txt, falha } = require('../util');
const cfg = require('../config');
// Origem dos leads das páginas de bairro: "Portal " + nome do cliente + " · bairro" (padrão: "Portal RUAH · bairro").
const ORIGEM_BAIRRO = () => `Portal ${cfg.CLIENTE_NOME} · bairro`; // da imobiliária atendida, lido na hora
const coord = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const { normTel } = require('../services/whatsapp');
const fonte = require('../bairros/fonte');
const dados = require('../bairros/dados');
const paginas = require('../bairros/paginas');
const commons = require('../bairros/commons');
const { SLUG } = require('../bairros/config');
const { slugDe, chaveBairro } = require('../bairros/catalogo');
const portalFonte = require('../portal/fonte');
const portalDados = require('../portal/dados');
const portalPaginas = require('../portal/paginas');

const router = express.Router();
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function html(res, corpo, status = 200) {
  res.status(status);
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', status === 200 ? 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600' : 'no-store');
  res.type('html').send(corpo);
}

const hits = new Map();
function limite(req, chave, max, janela = 10 * 60e3) {
  const k = `${chave}:${req.ip}`;
  const agora = Date.now();
  const h = (hits.get(k) || []).filter((t) => agora - t < janela);
  h.push(agora); hits.set(k, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

/** A capa pequena de cada bairro no ar (para os cartões). */
async function capas(lista) {
  const m = new Map();
  await Promise.all(lista.map(async (x) => {
    const f = x.pagina.fotos.find((y) => y.id === x.pagina.capa.foto);
    if (!f) return;
    if (f.imovel_foto) { if (portalDados.fotoPublica(f.imovel_foto)) m.set(x.bairro.slug, { src: portalPaginas.fotoUrl(f.imovel_foto), alt: f.alt }); return; }
    try { const c = await commons.info(f.commons); if (c && c.ok) m.set(x.bairro.slug, { src: paginas.urlFotoCommons(x.bairro.slug, f.id, 500), alt: f.alt }); } catch { /* sem capa no cartão */ }
  }));
  return m;
}

async function listaComContagem() {
  const [lista, noArImoveis] = await Promise.all([fonte.noAr(), portalFonte.noAr().catch(() => [])]);
  const porBairro = dados.imoveisPorBairro(noArImoveis);
  return lista.map((x) => ({ ...x, imoveis: (porBairro.get(x.bairro.slug) || []).length }));
}

router.get('/bairros', async (req, res) => {
  const lista = await listaComContagem();
  html(res, paginas.paginaLista(req, lista, await capas(lista)));
});
router.get('/bairros/', (req, res) => res.redirect(301, '/bairros'));

// ------------------------------------------------------------------ para quem escreve
router.get('/bairros/dados.json', async (req, res) => {
  const [e, noArImoveis] = await Promise.all([fonte.obterEstado(), portalFonte.noAr().catch(() => [])]);
  const aVenda = portalDados.imoveisAVenda();
  const porBairro = dados.imoveisPorBairro(noArImoveis);
  const base = portalPaginas.urlBase(req);
  const PESO = { pedida: 0, 'sem-pagina': 1, reprovada: 1, 'sem-arquivo': 1, antiga: 2, 'no-ar': 9, oculto: 99 };
  const bairros = dados.listar({ ocultos: false }).map((b) => {
    const s = e.situacao.get(b.slug) || {};
    const v = dados.vivo(b, porBairro.get(b.slug) || []);
    const fotos = dados.fotosDeImoveis(b.slug, aVenda, noArImoveis).map((im) => ({ ...im, fotos: im.fotos.map((f) => ({ ...f, url: `${base}${portalPaginas.fotoUrl(f.foto)}` })) }));
    // Os nomes de campo com "ruah" (notas_da_ruah, carteira_ruah, imoveis_da_ruah) são o contrato do dados.json
    // lido pelo scripts/bairros-publicar.mjs e pela tarefa agendada: identificadores técnicos, não trocar.
    return {
      slug: b.slug, nome: b.nome, regiao: b.regiao, apelidos: b.apelidos, prioridade: b.prioridade, notas_da_ruah: b.notas || null,
      pagina: { estado: s.estado || 'sem-pagina', ...(s.titulo ? { titulo: s.titulo, endereco: `/bairros/${b.slug}` } : {}), ...(s.publicadoEm ? { publicadoEm: s.publicadoEm } : {}), ...(s.erros ? { erros: s.erros } : {}), ...(b.pedidoEm ? { reescrita_pedida_em: b.pedidoEm } : {}) },
      centro: v.centro, carteira_ruah: { ...v.carteira, tipos: v.carteira.tipos.map(([t, n]) => `${t} (${n})`) },
      condominios: v.condominios, perto: v.perto, imoveis_da_ruah: fotos,
    };
  });
  bairros.sort((a, c) => (PESO[a.pagina.estado] ?? 5) - (PESO[c.pagina.estado] ?? 5) || c.prioridade - a.prioridade
    || c.imoveis_da_ruah.length - a.imoveis_da_ruah.length || c.condominios.total - a.condominios.total || a.nome.localeCompare(c.nome, 'pt-BR'));
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  res.json({ geradoEm: new Date().toISOString(), bairros });
});

router.get('/bairros/commons/busca.json', async (req, res) => {
  if (limite(req, 'commons-busca', 400)) return res.status(429).json({ erro: 'Muitas buscas seguidas. Aguarde alguns minutos.' });
  try {
    const l = await commons.buscar(String(req.query.q || ''), Number(req.query.n) || 24);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    res.json({ resultados: l.map((x) => ({ titulo: x.titulo, largura: x.largura, altura: x.altura, autor: x.autor, licenca: x.licenca, descricao: x.descricao, data: x.data, aceita: !!x.ok, motivo: x.motivo || undefined, ver: x.ok ? `/bairros/commons/ver?t=${encodeURIComponent(x.titulo)}` : undefined })) });
  } catch (err) { res.status(502).json({ erro: `Não consegui buscar no Commons: ${err.message}` }); }
});
router.get('/bairros/commons/info.json', async (req, res) => {
  if (limite(req, 'commons-info', 1000)) return res.status(429).json({ erro: 'Muitas consultas seguidas.' });
  try {
    const c = await commons.info(String(req.query.t || ''), { forcar: req.query.renovar === '1' });
    if (!c) return res.status(404).json({ erro: 'Arquivo inválido (use "File:Nome.jpg").' });
    res.json({ titulo: c.titulo, aceita: !!c.ok, motivo: c.motivo || undefined, autor: c.autor, licenca: c.licenca, largura: c.largura, altura: c.altura, descricao: c.descricao, credito: c.ok ? commons.credito(c) : undefined });
  } catch (err) { res.status(502).json({ erro: `Não consegui consultar o Commons: ${err.message}` }); }
});
router.get('/bairros/commons/ver', async (req, res) => {
  if (limite(req, 'commons-ver', 3000)) return res.sendStatus(429);
  try {
    const im = await commons.imagem(String(req.query.t || ''), Math.min(1280, Number(req.query.l) || 500));
    if (!im) return res.sendStatus(404);
    res.setHeader('Content-Type', im.tipo);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(im.buf);
  } catch { res.sendStatus(502); }
});

// ------------------------------------------------------------------ a foto e a página
router.get('/bairros/:slug/foto/:n', async (req, res) => {
  if (!SLUG.test(req.params.slug) || !/^\d{1,3}$/.test(req.params.n)) return res.sendStatus(404);
  const x = await fonte.porSlug(req.params.slug);
  const f = x && x.pagina.fotos.find((y) => y.id === `f${req.params.n}` && y.commons);
  if (!f) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  try {
    const im = await commons.imagem(f.commons, req.query.l === '500' ? 500 : 1280);
    if (!im) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
    res.setHeader('Content-Type', im.tipo);
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(im.buf);
  } catch { res.setHeader('Cache-Control', 'no-store'); res.sendStatus(502); }
});

router.get('/bairros/:slug', async (req, res, next) => {
  if (!SLUG.test(req.params.slug)) return next();
  let x = await fonte.porSlug(req.params.slug);
  if (!x) {
    // apelido ou grafia antiga → o bairro certo
    const s = dados.slugDoTexto(req.params.slug.replace(/-/g, ' '));
    if (s && s !== req.params.slug && await fonte.porSlug(s)) return res.redirect(301, `/bairros/${s}`);
    return html(res, paginas.paginaNaoAchada(req), 404);
  }
  const [noArImoveis, outros] = await Promise.all([portalFonte.noAr().catch(() => []), listaComContagem()]);
  const lista = dados.imoveisPorBairro(noArImoveis).get(x.bairro.slug) || [];
  const fotosPublicas = new Set(portalDados.imoveisAVenda().flatMap((im) => im.fotos));
  const outrosComCapa = outros.filter((o) => o.bairro.slug !== x.bairro.slug && (o.bairro.regiao === x.bairro.regiao)).slice(0, 6);
  const ctx = { vivo: dados.vivo(x.bairro, lista), imoveis: lista, fotosPublicas, outros: outros, capas: await capas(outrosComCapa.length ? outrosComCapa : outros.slice(0, 6)) };
  html(res, await paginas.paginaBairro(req, x, ctx));
});

// ------------------------------------------------------------------ contato
const MOTIVOS = { comprar: 'Quer comprar no bairro', vender: 'Quer vender no bairro', duvida: 'Dúvida sobre o bairro' };
const api = express.Router();
api.post('/contato', (req, res) => {
  const b = req.body || {};
  if (b.empresa) return res.json({ ok: true }); // armadilha para robô
  if (limite(req, 'contato', 6)) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde alguns minutos.' });
  const bairro = dados.porSlug(String(b.bairro || ''));
  if (!bairro || bairro.oculto) return res.status(404).json({ erro: 'Bairro não encontrado.' });
  const motivo = MOTIVOS[b.motivo] ? b.motivo : 'duvida';
  const nome = txt(b.nome, 120);
  if (!nome || nome.length < 2) return res.status(400).json({ erro: 'Diga seu nome.' });
  const tel = normTel(b.telefone);
  if (!/^55\d{10,11}$/.test(tel)) return res.status(400).json({ erro: 'Confira o telefone, com DDD.' });
  const email = txt(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: 'Confira o e-mail (ou deixe em branco).' });
  if (!b.aceite) return res.status(400).json({ erro: 'Marque que concorda com o uso dos dados para o contato.' });
  const mensagem = txt(b.mensagem, 1000);
  const linhas = [`${MOTIVOS[motivo]}: ${bairro.nome} — contato pela página do bairro (/bairros/${bairro.slug}).`, mensagem ? `Mensagem: ${mensagem}` : '', email ? `E-mail: ${email}` : ''].filter(Boolean).join('\n');
  const existente = one('SELECT * FROM leads WHERE telefone=?', tel);
  let leadId;
  if (existente) {
    leadId = existente.id;
    run(`UPDATE leads SET ultimo_contato=datetime('now','localtime'), email=coalesce(email,?) WHERE id=?`, email, leadId);
  } else {
    leadId = Number(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,bairros,busca,ultimo_contato) VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
      nome, tel, email, ORIGEM_BAIRRO(), 'novo', motivo === 'duvida' ? 'morno' : 'quente', bairro.nome, `${MOTIVOS[motivo]} (${bairro.nome})`).lastInsertRowid);
  }
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', leadId, 'portal', linhas, null);
  audit(null, 'bairro_contato', `${bairro.slug} · ${motivo} · lead ${leadId}${existente ? ' (já existia)' : ''}`);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ a tela do sistema (com login)
const tela = express.Router();
const gestor = A.exigePerfil('adm', 'gestor');

tela.get('/bairros', async (req, res) => {
  const [e, noArImoveis] = await Promise.all([fonte.obterEstado(), portalFonte.noAr().catch(() => [])]);
  const porBairro = dados.imoveisPorBairro(noArImoveis);
  const aVenda = portalDados.imoveisAVenda();
  const lista = dados.listar().map((b) => {
    const s = e.situacao.get(b.slug) || {};
    const cond = dados.condominiosDo(b.slug);
    const carteira = dados.fotosDeImoveis(b.slug, aVenda, noArImoveis).length;
    return { ...b, estado: s.estado || (b.oculto ? 'oculto' : 'sem-pagina'), titulo: s.titulo || null, publicadoEm: s.publicadoEm || null, atualizadoEm: s.atualizadoEm || null, erros: s.erros || null, palavras: s.palavras || null,
      imoveis: carteira, imoveisNoPortal: (porBairro.get(b.slug) || []).length, condominios: cond.total };
  });
  res.json({ bairros: lista, sugestoes: dados.sugestoes(aVenda), podeEditar: A.veTudo(req.usuario) });
});

function salvar(slug, b) {
  const atual = one(`${dados.LISTA_SQL} WHERE b.slug=?`, slug);
  if (!atual) falha(404, 'Bairro não encontrado.');
  const nome = b.nome !== undefined ? txt(b.nome, 80) : atual.nome;
  if (!nome || nome.length < 2) falha(400, 'Diga o nome do bairro.');
  const apelidos = b.apelidos !== undefined ? (Array.isArray(b.apelidos) ? b.apelidos : String(b.apelidos || '').split(/\n|;/)).map((x) => txt(x, 80)).filter(Boolean).slice(0, 30).join('\n') : atual.apelidos;
  const lat = b.lat !== undefined ? (b.lat === null || b.lat === '' ? null : coord(b.lat)) : atual.lat;
  const lon = b.lon !== undefined ? (b.lon === null || b.lon === '' ? null : coord(b.lon)) : atual.lon;
  if ((lat !== null && (lat < -23.2 || lat > -22.6)) || (lon !== null && (lon < -47.4 || lon > -46.8))) falha(400, 'O centro do bairro tem de ficar em Campinas.');
  // catálogo (comum): nome, região, apelidos e centro
  // TODO(fase1 · plataforma): editar o catálogo comum muda para todas as imobiliárias; quando houver a 2ª, restringir a
  // quem administra a plataforma (a imobiliária só mexe nos próprios ajustes).
  run(`UPDATE bairros SET nome=?, regiao=?, apelidos=?, lat=?, lon=?, atualizado_em=datetime('now','localtime') WHERE slug=?`,
    nome, b.regiao !== undefined ? txt(b.regiao, 60) || null : atual.regiao, apelidos, lat, lon, slug);
  // escolhas da imobiliária (privadas): prioridade, oculto e notas
  const aj = {};
  if (b.prioridade !== undefined) aj.prioridade = Math.max(-9, Math.min(9, Number(b.prioridade) || 0));
  if (b.oculto !== undefined) aj.oculto = b.oculto ? 1 : 0;
  if (b.notas !== undefined) aj.notas = txt(b.notas, 2000) || null;
  if (Object.keys(aj).length) dados.ajusta(slug, aj);
  fonte.recalcular({ todas: true });
}

tela.post('/bairros', gestor, (req, res) => {
  const nome = txt((req.body || {}).nome, 80);
  if (!nome || nome.length < 2) falha(400, 'Diga o nome do bairro.');
  const slug = slugDe(nome);
  if (one('SELECT 1 x FROM bairros WHERE slug=?', slug)) falha(409, 'Esse bairro já está na lista.');
  const dono = dados.slugDoTexto(nome);
  if (dono) falha(409, `"${nome}" já é apelido de outro bairro da lista (${dados.porSlug(dono).nome}).`);
  run(`INSERT INTO bairros(slug,nome,regiao,apelidos,origem) VALUES(?,?,?,?,'manual')`, slug, nome, txt(req.body.regiao, 60) || null, '');
  if (txt(req.body.notas, 2000)) dados.ajusta(slug, { notas: txt(req.body.notas, 2000) });
  audit(req.usuario.id, 'bairro_novo', slug);
  fonte.recalcular({ todas: true });
  res.json({ ok: true, slug });
});
tela.put('/bairros/:slug', gestor, (req, res) => {
  salvar(req.params.slug, req.body || {});
  audit(req.usuario.id, 'bairro_editado', req.params.slug);
  res.json({ ok: true });
});
tela.post('/bairros/:slug/apelido', gestor, (req, res) => {
  const b = dados.porSlug(req.params.slug);
  if (!b) falha(404, 'Bairro não encontrado.');
  const t = txt((req.body || {}).texto, 80);
  if (!t) falha(400, 'Diga o nome que é deste bairro.');
  const dono = dados.slugDoTexto(t);
  if (dono && dono !== b.slug) falha(409, `"${t}" já é de outro bairro (${dados.porSlug(dono).nome}).`);
  if (!b.apelidos.some((a) => chaveBairro(a) === chaveBairro(t)) && chaveBairro(b.nome) !== chaveBairro(t)) salvar(b.slug, { apelidos: [...b.apelidos, t] });
  audit(req.usuario.id, 'bairro_apelido', `${b.slug} ← ${t}`);
  res.json({ ok: true });
});
tela.post('/bairros/:slug/reescrever', gestor, (req, res) => {
  if (!dados.porSlug(req.params.slug)) falha(404, 'Bairro não encontrado.');
  dados.ajusta(req.params.slug, {}, { pedido: true });
  audit(req.usuario.id, 'bairro_reescrever', req.params.slug);
  fonte.recalcular();
  res.json({ ok: true });
});
tela.get('/bairros/:slug/redes', async (req, res) => {
  const x = await fonte.porSlug(req.params.slug);
  if (!x || !x.pagina.redes) return res.status(404).json({ erro: 'Página sem legenda para as redes.' });
  res.json({ legenda: `${x.pagina.redes.legenda}\n\n${portalPaginas.urlBase(req)}/bairros/${x.bairro.slug}`, hashtags: x.pagina.redes.hashtags.map((h) => `#${h}`).join(' ') });
});
tela.post('/bairros/atualizar', gestor, (req, res) => { fonte.limparCache(); portalFonte.limparCache(); res.json({ ok: true }); });

module.exports = router;
module.exports.api = api;
module.exports.tela = tela;
