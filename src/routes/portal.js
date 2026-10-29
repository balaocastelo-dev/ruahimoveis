// Portal do cliente (a imobiliária) · rotas públicas (sem login).
//   /imoveis                    vitrine com busca e filtros
//   /imoveis/favoritos          favoritos do visitante (guardados no aparelho)
//   /imoveis/<endereço>         a página única do imóvel  (/imoveis/AP0029 leva até ela)
//   /imoveis/foto/<id>          foto de imóvel à venda
//   /imoveis/dados.json         a ficha e as fotos de cada imóvel à venda, para a rotina que escreve as páginas
//   POST /api/publico/portal/interesse   "Tenho interesse" / "Agendar visita" → lead no CRM
const express = require('express');
const { one, run, audit } = require('../db');
const { txt } = require('../util');
const fonte = require('../portal/fonte');
const dados = require('../portal/dados');
const paginas = require('../portal/paginas');
const versoes = require('../portal/versoes');
const clube = require('../portal/clube');
const { SLUG, CODIGO } = require('../portal/config');
const { normTel } = require('../services/whatsapp');
const og = require('../og');
const cfg = require('../config');
// Origens dos leads do portal: "Portal " + nome do cliente (com a config padrão, "Portal RUAH" como sempre).
const ORIGEM_PORTAL = `Portal ${cfg.CLIENTE_NOME}`;
const ORIGEM_SIGNATURE = `${cfg.CLIENTE_NOME} Signature`;

const router = express.Router();

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function html(res, corpo, status = 200, { privado = false, csp = CSP } = {}) {
  res.status(status);
  res.setHeader('Content-Security-Policy', csp);
  if (privado) { // páginas da Signature: mudam com o cookie do Clube, nunca ficam no cache da Vercel
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('Referrer-Policy', 'same-origin');
    return res.type('html').send(corpo);
  }
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // A Vercel guarda a página por 2 minutos; o preço e o status vêm do banco a cada renovação.
  res.setHeader('Cache-Control', status === 200 ? 'public, max-age=60, s-maxage=120, stale-while-revalidate=600' : 'no-store');
  res.type('html').send(corpo);
}

/** O guia do bairro (se já estiver no ar) para ligar o imóvel e a vitrine filtrada à página do bairro. */
async function guiaDoBairro(nome) {
  if (!nome) return null;
  try {
    const s = require('../bairros/dados').slugDoTexto(nome);
    const x = s && await require('../bairros/fonte').porSlug(s);
    return x ? { slug: x.bairro.slug, nome: x.bairro.nome } : null;
  } catch { return null; }
}

router.get('/imoveis', async (req, res) => html(res, paginas.paginaVitrine(req, await fonte.noAr(), await guiaDoBairro(req.query && req.query.bairro))));
// A revista mostra as capas do blog Sopro, que moram no GitHub.
const CSP_REVISTA = CSP.replace("img-src 'self' data:", "img-src 'self' data: https://raw.githubusercontent.com");
router.get('/imoveis/revista', async (req, res) => {
  const artigos = await require('../blog/diario').listar().catch(() => []);
  html(res, versoes.paginaRevista(req, await fonte.noAr(), artigos), 200, { csp: CSP_REVISTA });
});
router.get('/imoveis/signature', (req, res) => html(res, versoes.paginaSignature(req, dados.imoveisAVenda(), clube.membro(req)), 200, { privado: true }));
router.get('/imoveis/signature/:codigo', (req, res, next) => {
  const cod = String(req.params.codigo).toUpperCase();
  if (!CODIGO.test(cod)) return next();
  const pg = versoes.paginaSignatureImovel(req, dados.imoveisAVenda(), cod, clube.membro(req));
  if (!pg) return html(res, paginas.paginaNaoAchada(req), 404, { privado: true });
  html(res, pg, 200, { privado: true });
});
router.get('/imoveis/favoritos', async (req, res) => html(res, paginas.paginaFavoritos(req, await fonte.noAr())));

router.get('/imoveis/dados.json', async (req, res) => {
  const e = await fonte.obterEstado();
  const base = paginas.urlBase(req);
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  res.json({
    geradoEm: new Date().toISOString(),
    imoveis: e.imoveis.map((im) => {
      const s = e.situacao.get(im.codigo) || {};
      return {
        codigo: im.codigo, versao: im.versao, tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, uf: im.uf,
        condominio: im.condominio, lazer_do_condominio: im.lazer,
        quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, area_total: im.area_total,
        descricao_do_anuncio: im.descricao,
        fotos: im.fotos.map((id) => ({ foto: id, url: `${base}${paginas.fotoUrl(id)}` })),
        pagina: { estado: s.estado || 'sem-pagina', ...(s.slug ? { slug: s.slug } : {}), ...(s.erros ? { erros: s.erros } : {}) },
      };
    }),
  });
});

// Foto pública guardada só como endereço (não ocupa o banco). O site busca a imagem no servidor e entrega
// ele mesmo, com cache longo na Vercel: o navegador do visitante nunca precisa alcançar o endereço de origem
// (raw.githubusercontent.com é bloqueado em algumas redes e navegadores).
const fotosExternas = new Map();
async function buscarExterna(url, avisar = true) {
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) return null;
  let item = fotosExternas.get(url);
  if (item) return item;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const tipo = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(tipo)) throw new Error(`origem respondeu ${r.status} ${tipo}`);
    item = { tipo, buf: Buffer.from(await r.arrayBuffer()) };
    if (fotosExternas.size > 120) fotosExternas.delete(fotosExternas.keys().next().value);
    fotosExternas.set(url, item);
    return item;
  } catch (e) {
    if (avisar) console.error('[portal] foto externa', e.message);
    return null;
  }
}
function enviarExterna(res, item, cache = 'public, max-age=604800, s-maxage=2592000, immutable') {
  if (!item) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(502); }
  res.setHeader('Content-Type', item.tipo);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(item.buf);
}
async function fotoExterna(res, f) {
  const url = String(f.url_externa || '');
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  return enviarExterna(res, await buscarExterna(url));
}
// Capa (topo da página Signature e do imóvel): a versão em alta e sem carimbo (<id>-<n>c.jpg), quando existe.
// Enquanto ela não existe, entrega a foto normal com cache curto, para a capa nova aparecer assim que publicada.
router.get('/imoveis/foto/:id/capa', async (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return res.sendStatus(404);
  const f = dados.fotoPublica(req.params.id);
  if (!f) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  if (!f.url_externa) return res.redirect(302, `/imoveis/foto/${f.id}?v=2`);
  const url = String(f.url_externa);
  const limpa = /h\.jpg$/i.test(url) ? await buscarExterna(url.replace(/h\.jpg$/i, 'c.jpg'), false) : null;
  if (limpa) return enviarExterna(res, limpa);
  return enviarExterna(res, await buscarExterna(url), 'public, max-age=300, s-maxage=300');
});
router.get('/imoveis/foto/:id/og.jpg', async (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return res.sendStatus(404);
  const f = dados.fotoPublica(req.params.id);
  if (!f) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  if (f.url_externa) return fotoExterna(res, f); // foto guardada fora do banco (ex.: imagens ilustrativas da demonstração)
  await og.enviarJpeg(res, f, { publico: true });
});
router.get('/imoveis/foto/:id', (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return res.sendStatus(404);
  const f = dados.fotoPublica(req.params.id);
  if (f && f.url_externa) return fotoExterna(res, f);
  const buf = f && require('../services/conteudo').ler(f);
  if (!buf) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  res.setHeader('Content-Type', f.mime);
  // O número da foto nunca muda de conteúdo: pode ficar em cache por muito tempo.
  res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buf);
});

router.get('/imoveis/:slug', async (req, res, next) => {
  const s = req.params.slug;
  if (CODIGO.test(s.toUpperCase()) && !s.includes('--')) {
    const x = await fonte.porCodigo(s.toUpperCase());
    if (x) return res.redirect(301, `/imoveis/${x.pagina.slug}`);
  }
  if (!SLUG.test(s)) return next();
  const x = await fonte.porSlug(s);
  if (!x) return html(res, paginas.paginaNaoAchada(req), 404);
  html(res, paginas.paginaImovel(req, { ...x, guiaDoBairro: await guiaDoBairro(x.imovel.bairro) }, await fonte.noAr()));
});
router.get('/imoveis/', (req, res) => res.redirect(301, '/imoveis'));

// ------------------------------------------------------------- privacidade e termos (LGPD, 28/10/2026)
// A imobiliária é a controladora; a plataforma, operadora. Textos em src/lgpd/textos.js.
function paginaLegal(req, tipo, { aviso = '' } = {}) {
  const T = require('../lgpd/textos');
  const secoes = tipo === 'privacidade' ? T.privacidadeCliente() : T.termosCliente();
  const titulo = tipo === 'privacidade' ? 'Privacidade e seus dados' : 'Termos de uso do site';
  const lista = tipo === 'privacidade' ? [...secoes, ['pedido', 'Fazer um pedido']] : secoes;
  const corpo = `<div class="p-legal">
<p class="p-legal-k">${T.esc(cfg.CLIENTE_NOME)}</p>
<h1>${titulo}</h1>
<p class="p-legal-v">Versão de ${T.VIGENCIA}. ${T.esc(T.AVISO_REVISAO)}</p>
<nav class="p-legal-abas" aria-label="Institucional"><a href="/privacidade"${tipo === 'privacidade' ? ' aria-current="page"' : ''}>Privacidade</a><a href="/termos"${tipo === 'termos' ? ' aria-current="page"' : ''}>Termos de uso</a></nav>
<div class="p-legal-grade">${T.indice(lista)}<div class="p-legal-texto">${aviso}${T.corpo(secoes)}${tipo === 'privacidade' ? T.formulario('/privacidade/pedido') : ''}</div></div>
</div>`;
  return paginas.casca(req, { titulo: `${titulo} · ${cfg.EMPRESA}`, descricao: `${titulo} de ${cfg.EMPRESA}: dados tratados, bases legais da LGPD e os seus direitos.`, caminho: `/${tipo}`, corpo, classe: 'p-pagina-legal' });
}
router.get('/privacidade', (req, res) => html(res, paginaLegal(req, 'privacidade')));
router.get('/termos', (req, res) => html(res, paginaLegal(req, 'termos')));
router.post('/privacidade/pedido', express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
  const T = require('../lgpd/textos');
  const b = req.body || {};
  const falha = (status, msg) => { html(res, paginaLegal(req, 'privacidade', { aviso: `<p class="p-legal-ok p-legal-erro" role="alert">${T.esc(msg)}</p>` }), status); };
  if (b.empresa) return html(res, paginas.casca(req, { titulo: 'Pedido recebido', descricao: 'Pedido recebido.', caminho: '/privacidade', corpo: '<div class="p-legal"><p class="p-legal-ok" role="status">Pedido recebido.</p></div>', semIndice: true }), 200, { privado: true });
  if (limite(req, 5)) return falha(429, 'Muitos pedidos seguidos. Tente de novo em alguns minutos.');
  try {
    const r = require('../lgpd').registrar({ ...b, declaro: b.declaro === '1' }, 'portal');
    html(res, paginas.casca(req, { titulo: 'Pedido recebido', descricao: 'Pedido do titular recebido.', caminho: '/privacidade', semIndice: true, classe: 'p-pagina-legal', corpo: `<div class="p-legal"><div class="p-legal-ok" role="status"><strong>Pedido recebido.</strong> Protocolo <b>${T.esc(r.protocolo)}</b>. A ${T.esc(cfg.EMPRESA)} responde até ${T.esc(r.prazo.split('-').reverse().join('/'))}.${['oposicao', 'eliminar'].includes(r.tipo) ? '<br>O telefone informado já entrou na lista "não contatar" desta imobiliária e de todas as que usam o mesmo sistema.' : ''}</div><p><a href="/privacidade">Voltar</a> · <a href="/imoveis">Ver imóveis</a></p></div>` }), 200, { privado: true });
  } catch (e) {
    if (!e.status) console.error('[lgpd] pedido no portal:', e.message);
    falha(e.status || 500, e.status ? e.message : 'Não foi possível registrar agora. Tente de novo em instantes.');
  }
});

// ------------------------------------------------------------------ contato
const hits = new Map();
function limite(req, max) {
  const agora = Date.now();
  const h = (hits.get(req.ip) || []).filter((t) => agora - t < 10 * 60e3);
  h.push(agora); hits.set(req.ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

const api = express.Router();
api.post('/interesse', async (req, res) => {
  const b = req.body || {};
  if (b.empresa) return res.json({ ok: true }); // armadilha para robô: finge que deu certo
  if (limite(req, 6)) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde alguns minutos ou fale pelo WhatsApp.' });
  if (b.condominio && !b.codigo) return interesseCondominio(req, res, b);
  const codigo = String(b.codigo || '').toUpperCase();
  if (!CODIGO.test(codigo)) return res.status(400).json({ erro: 'Imóvel inválido.' });
  const im = dados.imovelAVenda(codigo);
  if (!im) return res.status(404).json({ erro: 'Este imóvel não está mais à venda.' });
  const nome = txt(b.nome, 120);
  if (!nome || nome.length < 2) return res.status(400).json({ erro: 'Diga seu nome.' });
  const tel = normTel(b.telefone);
  if (!/^55\d{10,11}$/.test(tel)) return res.status(400).json({ erro: 'Confira o telefone, com DDD.' });
  const email = txt(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: 'Confira o e-mail (ou deixe em branco).' });
  if (!b.aceite) return res.status(400).json({ erro: 'Marque que concorda com o uso dos dados para o contato.' });
  const mensagem = txt(b.mensagem, 1000);
  const visita = !!b.visita;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dia || '')) ? String(b.dia).split('-').reverse().join('/') : null;
  const periodo = ['Manhã', 'Tarde', 'Fim de semana'].includes(b.periodo) ? b.periodo : null;

  const x = await fonte.porCodigo(codigo);
  const linhas = [
    `${visita ? 'Pediu VISITA' : 'Interesse'} pelo portal no imóvel ${im.codigo} (${im.tipo}, ${[im.bairro, im.cidade].filter(Boolean).join(', ')})${x ? ` — /imoveis/${x.pagina.slug}` : ''}.`,
    visita ? `Preferência: ${[dia, periodo].filter(Boolean).join(', ') || 'qualquer dia'}.` : '',
    mensagem ? `Mensagem: ${mensagem}` : '',
    email ? `E-mail: ${email}` : '',
  ].filter(Boolean).join('\n');

  const existente = one('SELECT * FROM leads WHERE telefone=?', tel);
  let leadId;
  if (existente) {
    leadId = existente.id;
    run(`UPDATE leads SET ultimo_contato=datetime('now','localtime'), temperatura='quente', email=coalesce(email,?) WHERE id=?`, email, leadId);
  } else {
    leadId = Number(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,corretor_id,tipo_desejado,bairros,busca,ultimo_contato)
      VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
    nome, tel, email, ORIGEM_PORTAL, visita ? 'visita' : 'novo', 'quente', one('SELECT corretor_id FROM imoveis WHERE id=?', im.id).corretor_id || null,
    im.tipo, im.bairro, `Veio pelo portal: ${im.codigo}`).lastInsertRowid);
  }
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', leadId, 'portal', linhas, null);
  audit(null, 'portal_interesse', `${im.codigo} · lead ${leadId}${existente ? ' (já existia)' : ''}${visita ? ' · visita' : ''}`);
  res.json({ ok: true });
});

// Clube Signature: o pedido de acesso vira lead QUENTE (origem "<cliente> Signature") e o aparelho recebe o cookie que mostra os valores.
api.post('/signature', (req, res) => {
  const b = req.body || {};
  if (b.empresa) return res.json({ ok: true });
  if (limite(req, 6)) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde alguns minutos.' });
  const d = contato(b);
  if (d.erro) return res.status(400).json({ erro: d.erro });
  const codigo = String(b.codigo || '').toUpperCase();
  const im = CODIGO.test(codigo) ? dados.imovelAVenda(codigo) : null;
  const s = im && versoes.selecao([im])[0];
  const texto = [
    `Pediu acesso ao Clube Signature (valores da seleção ${ORIGEM_SIGNATURE})${s ? ` pela residência ${im.codigo} · ${s.titulo} — /imoveis/signature/${im.codigo.toLowerCase()}` : ''}. O acesso aos valores foi liberado no aparelho dele.`,
    d.email ? `E-mail: ${d.email}` : '',
  ].filter(Boolean).join('\n');
  const existente = one('SELECT * FROM leads WHERE telefone=?', d.tel);
  let leadId;
  if (existente) {
    leadId = existente.id;
    run(`UPDATE leads SET ultimo_contato=datetime('now','localtime'), temperatura='quente', email=coalesce(email,?) WHERE id=?`, d.email, leadId);
  } else {
    leadId = Number(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,corretor_id,tipo_desejado,bairros,busca,ultimo_contato)
      VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
    d.nome, d.tel, d.email, ORIGEM_SIGNATURE, 'novo', 'quente', im ? one('SELECT corretor_id FROM imoveis WHERE id=?', im.id).corretor_id || null : null,
    im ? im.tipo : null, im ? im.bairro : null, `Clube Signature${im ? `: ${im.codigo}` : ''} · imóveis acima de R$ 10 milhões`).lastInsertRowid);
  }
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', leadId, 'portal', texto, null);
  audit(null, 'signature_clube', `lead ${leadId}${existente ? ' (já existia)' : ''}${im ? ` · ${im.codigo}` : ''}`);
  res.setHeader('Set-Cookie', clube.cookieDe(leadId));
  res.json({ ok: true });
});

// "Quero morar aqui" na página pública de um condomínio → lead no CRM com o condomínio no perfil de busca.
function contato(b) {
  const nome = txt(b.nome, 120);
  if (!nome || nome.length < 2) return { erro: 'Diga seu nome.' };
  const tel = normTel(b.telefone);
  if (!/^55\d{10,11}$/.test(tel)) return { erro: 'Confira o telefone, com DDD.' };
  const email = txt(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: 'Confira o e-mail (ou deixe em branco).' };
  if (!b.aceite) return { erro: 'Marque que concorda com o uso dos dados para o contato.' };
  return { nome, tel, email, mensagem: txt(b.mensagem, 1000) };
}
function interesseCondominio(req, res, b) {
  const c = require('../condominios/publico').porSlug(String(b.condominio));
  if (!c) return res.status(404).json({ erro: 'Condomínio não encontrado.' });
  const d = contato(b);
  if (d.erro) return res.status(400).json({ erro: d.erro });
  const texto = [`Quer morar no condomínio ${c.nome}${c.bairro ? ` (${c.bairro})` : ''} — pediu aviso quando houver imóvel à venda. Página /condominios/${c.slug}.`, d.mensagem ? `Mensagem: ${d.mensagem}` : '', d.email ? `E-mail: ${d.email}` : ''].filter(Boolean).join('\n');
  const existente = one('SELECT * FROM leads WHERE telefone=?', d.tel);
  let leadId;
  if (existente) { leadId = existente.id; run(`UPDATE leads SET ultimo_contato=datetime('now','localtime'), email=coalesce(email,?) WHERE id=?`, d.email, leadId); }
  else {
    leadId = Number(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,tipo_desejado,bairros,busca,ultimo_contato) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
      d.nome, d.tel, d.email, `${ORIGEM_PORTAL} · condomínio`, 'novo', 'morno', c.tipo === 'horizontal' ? 'Casa em condomínio' : 'Apartamento', c.bairro, `Condomínio ${c.nome}`).lastInsertRowid);
  }
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', leadId, 'portal', texto, null);
  audit(null, 'portal_interesse_condominio', `${c.nome} · lead ${leadId}`);
  res.json({ ok: true });
}

module.exports = router;
module.exports.api = api;
