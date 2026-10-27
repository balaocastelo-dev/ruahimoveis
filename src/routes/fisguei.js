// Fisguei: a página /fisguei do sistema e o recebimento do que a extensão do Chrome captura no Fisgar.
const express = require('express');
const crypto = require('crypto');
const A = require('../auth');
const { one, all, run, getConfig, setConfig, audit } = require('../db');
const { falha, txt } = require('../util');
const F = require('../fisguei/base');
const normaliza = require('../fisguei/normaliza');
const P = require('../fisguei/pedidos');
const I = require('../fisguei/inteligencia');

// ---------- recebimento (extensão do Chrome) ----------
// Fica fora de /api: a extensão não tem a sessão do sistema, ela se identifica com a chave gerada na tela do Fisguei.
const receber = express.Router();
receber.use(express.json({ limit: '4mb' }));
const chaveConfere = (k) => {
  const h = getConfig('fisguei_chave_hash');
  if (!h || !k) return false;
  const a = Buffer.from(A.sha256(String(k))), b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
receber.use((req, res, next) => {
  // a extensão chama de chrome-extension://…; não há cookie nem sessão, só a chave
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fisguei-Chave');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!chaveConfere(req.headers['x-fisguei-chave'])) return res.status(401).json({ erro: 'Chave da extensão inválida. Gere uma nova na tela Fisguei do sistema.' });
  next();
});
receber.get('/ping', (req, res) => res.json({ ok: true, robo: F.ROBO }));
// Robô "Buscar dados": a extensão pergunta se há busca a fazer no Fisgar e devolve o resultado.
receber.get('/pedidos/proximo', async (req, res) => {
  const aberto = req.query.fisgar === '1';
  P.marcaExtensao(aberto);
  if (!aberto) return res.json({ pedido: null, motivo: 'Fisgar fechado' });
  res.json(await P.proximo());
});
receber.post('/pedidos/:id/resultado', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ erro: 'Pedido inválido.' });
  const r = P.resultado(id, req.body || {});
  setConfig('fisguei_ultimo_recebimento', new Date().toISOString());
  res.status(r.erro ? 409 : 200).json(r);
});
// saldo de créditos que a extensão leu numa resposta do próprio Fisgar
receber.post('/creditos', (req, res) => {
  const b = req.body || {};
  const c = I.gravaSaldo(b.saldo, { fonte: 'fisgar', plano: b.plano, chave: [b.url, b.chave].filter(Boolean).join(' · ') });
  if (!c) return res.status(400).json({ erro: 'Saldo inválido.' });
  res.json({ ok: true, saldo: c.saldo });
});
receber.post('/receber', (req, res) => {
  const lote = Array.isArray(req.body && req.body.itens) ? req.body.itens.slice(0, 50) : [req.body];
  const tot = { anuncios: 0, pessoas: 0, telefones: 0, ignorados: 0 };
  for (const it of lote) {
    if (!it || !it.url || it.json === undefined) { tot.ignorados++; continue; }
    let r;
    try { r = normaliza.processa(String(it.url), it.json, it.pedido); } catch (e) { console.error('[fisguei] recebimento', e.message); tot.ignorados++; continue; }
    tot.anuncios += r.anuncios; tot.pessoas += r.pessoas; tot.telefones += r.telefones;
    if (!r.anuncios && !r.pessoas) tot.ignorados++;
  }
  setConfig('fisguei_ultimo_recebimento', new Date().toISOString());
  if (tot.anuncios) require('./mercado').esqueceBase(); // anúncios novos aparecem nas vitrines na hora
  res.json(tot);
});

// ---------- tela do sistema (com login) ----------
const r = express.Router();
// Express 5 não aceita regex no caminho: :id e :pid que não forem número seguem para a próxima rota.
r.param('id', (req, res, next, v) => (/^\d+$/.test(v) ? next() : next('route')));
r.param('pid', (req, res, next, v) => (/^\d+$/.test(v) ? next() : next('route')));
// qualquer mudança feita pela tela recalcula a leitura inteligente na próxima consulta
r.use((req, res, next) => { if (req.method !== 'GET' && /^\/fisguei/.test(req.path)) I.invalida(); next(); });
const STATUS = ['novo', 'abordando', 'respondeu', 'confirmado', 'sem_interesse', 'sem_dono', 'captado', 'descartado'];

function robo() {
  let st = {}; try { st = JSON.parse(getConfig('fisguei_robo') || '{}'); } catch {}
  const vivo = st.em && Date.now() - new Date(st.em).getTime() < 3 * 60e3;
  return { ...st, vivo, estado: vivo ? st.estado : 'desligado', qr: vivo && st.estado === 'qr' ? st.qr : null };
}

// Uma consulta para as contagens e uma para as configurações (antes eram ~28 idas ao banco; com o banco online
// longe, a tela e o selo do menu esperavam ~6 s e o servidor ficava parado nesse tempo).
r.get('/fisguei/resumo', (req, res) => {
  const cont = Object.fromEntries(all('SELECT status, count(*) AS n FROM fisguei_anuncios GROUP BY status').map((x) => [x.status, x.n]));
  const c = one(`SELECT
      (SELECT count(DISTINCT anuncio_id) FROM fisguei_pessoas WHERE consultado=1) AS comdono,
      (SELECT count(*) FROM fisguei_pessoas WHERE consultado=1) AS pessoas,
      (SELECT count(*) FROM fisguei_contatos WHERE tipo='tel' AND envio='fila') AS fila,
      (SELECT count(*) FROM fisguei_contatos WHERE envio IN ('enviado','respondeu')) AS enviadas,
      (SELECT count(*) FROM fisguei_contatos WHERE envio IN ('enviado','respondeu') AND substr(enviado_em,1,10)=date('now','localtime')) AS hoje,
      (SELECT count(*) FROM fisguei_pessoas WHERE status NOT IN ('pendente','abordando')) AS responderam,
      (SELECT count(*) FROM fisguei_bloqueios) AS bloqueios`);
  const cfgs = Object.fromEntries(all("SELECT chave, valor FROM config WHERE chave LIKE 'fisguei%'").map((x) => [x.chave, x.valor]));
  const ler = (k) => (k in cfgs ? cfgs[k] : null);
  const aj = F.ajustes(ler);
  let st = {}; try { st = JSON.parse(ler('fisguei_robo') || '{}'); } catch {}
  const vivo = st.em && Date.now() - new Date(st.em).getTime() < 3 * 60e3;
  res.json({
    porStatus: cont,
    anuncios: Object.values(cont).reduce((t, n) => t + Number(n), 0),
    comDono: c.comdono, pessoas: c.pessoas, fila: c.fila, enviadas: c.enviadas, hoje: c.hoje, responderam: c.responderam,
    precisaCorretor: (cont.respondeu || 0) + (cont.confirmado || 0),
    bloqueios: c.bloqueios,
    ultimoRecebimento: ler('fisguei_ultimo_recebimento'),
    chave: !!ler('fisguei_chave_hash'),
    ajustes: aj,
    horario: F.dentroDoHorario(aj),
    robo: { ...st, vivo, estado: vivo ? st.estado : 'desligado', qr: vivo && st.estado === 'qr' ? st.qr : null },
  });
});

function filtros(query) {
  const f = String(query.filtro || '');
  const q = F.norm(query.q || '');
  const where = [], p = [];
  if (f === 'precisa') where.push("a.status IN ('respondeu','confirmado')");
  else if (f === 'com_dono') where.push('EXISTS (SELECT 1 FROM fisguei_pessoas x WHERE x.anuncio_id=a.id AND x.consultado=1)');
  else if (f === 'sem_dono') where.push('NOT EXISTS (SELECT 1 FROM fisguei_pessoas x WHERE x.anuncio_id=a.id AND x.consultado=1)');
  else if (f === 'particular') where.push("a.anunciante_tipo='particular'");
  else if (STATUS.includes(f)) { where.push('a.status=?'); p.push(f); }
  if (q) { where.push('(lower(a.logradouro) LIKE ? OR lower(a.bairro) LIKE ? OR lower(a.anunciante_nome) LIKE ? OR a.cep LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q.replace(/\D/g, '') || q}%`); }
  const vmin = Number(query.vmin) || 0, vmax = Number(query.vmax) || 0;
  if (vmin) { where.push('a.valor >= ?'); p.push(vmin); }
  if (vmax) { where.push('a.valor <= ?'); p.push(vmax); }
  return { w: where.length ? 'WHERE ' + where.join(' AND ') : '', p };
}
const POR_PAG = 48;
// Quantos anúncios cada filtro mostra (para os números nas abas), respeitando a busca digitada.
function contagem(q) {
  const out = {};
  for (const f of ['', 'precisa', 'com_dono', 'abordando', 'confirmado', 'sem_dono', 'particular', 'sem_interesse', 'captado']) {
    const { w, p } = filtros({ filtro: f, q });
    out[f || 'todos'] = one(`SELECT count(*) AS n FROM fisguei_anuncios a ${w}`, ...p).n;
  }
  return out;
}
// ---------- Fisguei inteligente: cartões, filtros, sinais e leitura da base ----------
r.get('/fisguei/explorar', (req, res) => {
  const q = {}; for (const k of ['q', 'dono', 'sinais', 'cat', 'bairro', 'anunciante', 'vmin', 'vmax', 'quartos', 'amin', 'foto', 'numero', 'etapa', 'ordem', 'pagina']) if (req.query[k] !== undefined) q[k] = String(req.query[k]).slice(0, 400);
  res.json(I.explorar(q));
});
r.get('/fisguei/explorar/mapa', (req, res) => {
  const q = {}; for (const k of ['q', 'dono', 'sinais', 'cat', 'bairro', 'anunciante', 'vmin', 'vmax', 'quartos', 'amin', 'foto', 'numero', 'etapa']) if (req.query[k] !== undefined) q[k] = String(req.query[k]).slice(0, 400);
  res.json(I.pontos(q));
});
r.get('/fisguei/creditos', (req, res) => res.json(I.creditos()));
r.post('/fisguei/creditos', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor corrigem o saldo de créditos.');
  const b = req.body || {};
  let c = null;
  if (b.plano !== undefined && b.plano !== '') c = I.gravaPlano(b.plano);
  if (b.saldo !== undefined && b.saldo !== '') { c = I.gravaSaldo(b.saldo, { fonte: 'manual', chave: 'informado por ' + req.usuario.nome }); if (!c) falha(400, 'Saldo inválido.'); }
  audit(req.usuario.id, 'fisguei.creditos', JSON.stringify(b));
  res.json(c || I.creditos());
});
r.get('/fisguei/mapa', (req, res) => {
  const { w, p } = filtros(req.query);
  res.json(all(`SELECT a.id, a.lat, a.lon, a.valor, a.status, a.tipo, a.logradouro, a.numero, a.bairro, a.anunciante_tipo FROM fisguei_anuncios a
    ${w ? w + ' AND' : 'WHERE'} a.lat IS NOT NULL AND a.lon IS NOT NULL ORDER BY a.id DESC LIMIT 3000`, ...p));
});
r.get('/fisguei', (req, res) => {
  const pag = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const { w, p } = filtros(req.query);
  const total = one(`SELECT count(*) AS n FROM fisguei_anuncios a ${w}`, ...p).n;
  const itens = all(`SELECT a.id, a.fisgar_id, a.tipo, a.negocio, a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.cep, a.valor, a.quartos, a.suites, a.vagas, a.area_util,
      a.anunciante_nome, a.anunciante_tipo, a.status, a.pausado, a.oportunidade_id, a.fotos, a.atualizado_em, a.criado_em,
      (SELECT count(*) FROM fisguei_pessoas x WHERE x.anuncio_id=a.id) AS pessoas,
      (SELECT count(*) FROM fisguei_pessoas x WHERE x.anuncio_id=a.id AND x.consultado=1) AS consultadas,
      (SELECT count(*) FROM fisguei_contatos c JOIN fisguei_pessoas x ON x.id=c.pessoa_id WHERE x.anuncio_id=a.id AND c.tipo='tel' AND c.envio='fila') AS na_fila,
      (SELECT count(*) FROM fisguei_contatos c JOIN fisguei_pessoas x ON x.id=c.pessoa_id WHERE x.anuncio_id=a.id AND c.envio IN ('enviado','respondeu')) AS enviadas,
      (SELECT d.status FROM fisguei_pedidos d WHERE d.anuncio_id=a.id ORDER BY d.id DESC LIMIT 1) AS pedido,
      (SELECT count(*) FROM fisguei_pessoas x WHERE x.anuncio_id=a.id AND x.status='confirmou') AS confirmados
    FROM fisguei_anuncios a ${w} ORDER BY CASE WHEN a.status IN ('respondeu','confirmado') THEN 0 ELSE 1 END, a.atualizado_em DESC, a.id DESC LIMIT ${POR_PAG} OFFSET ?`, ...p, (pag - 1) * POR_PAG);
  for (const i of itens) { let f0 = null; try { f0 = (JSON.parse(i.fotos || '[]') || [])[0] || null; } catch {} i.foto = f0; delete i.fotos; i.ref = F.ref(i.id); }
  res.json({ total, pagina: pag, paginas: Math.max(Math.ceil(total / POR_PAG), 1), itens, contagem: contagem(req.query.q) });
});

function anuncio(id) {
  const a = one('SELECT * FROM fisguei_anuncios WHERE id=?', id);
  if (!a) falha(404, 'Anúncio não encontrado no Fisguei.');
  return a;
}
r.get('/fisguei/:id', (req, res) => {
  const a = anuncio(+req.params.id);
  try { a.fotos = JSON.parse(a.fotos || '[]'); } catch { a.fotos = []; }
  a.ref = F.ref(a.id);
  { const M = require('./mercado'); a.categoria = M.categoria(a); a.subtipo = M.subtipo(a, a.categoria); }
  const pessoas = all('SELECT * FROM fisguei_pessoas WHERE anuncio_id=? ORDER BY CASE WHEN relacao LIKE ? THEN 0 ELSE 1 END, id', a.id, '%ropriet%');
  for (const p of pessoas) {
    p.contatos = all('SELECT id, tipo, valor, envio, enviado_em, erro FROM fisguei_contatos WHERE pessoa_id=? ORDER BY tipo DESC, id', p.id);
    p.mensagens = all('SELECT direcao, texto, status, autor, criado_em FROM fisguei_mensagens WHERE pessoa_id=? ORDER BY id', p.id);
  }
  const op = a.oportunidade_id ? one('SELECT id, status FROM oportunidades WHERE id=?', a.oportunidade_id) : null;
  const imovel = a.imovel_id ? one('SELECT id, codigo, status FROM imoveis WHERE id=?', a.imovel_id) : null;
  const pedidos = all('SELECT id, tipo, pessoa_id, status, creditos, pessoas, consultadas, erro, criado_em, concluido_em FROM fisguei_pedidos WHERE anuncio_id=? ORDER BY id DESC LIMIT 10', a.id);
  res.json({ anuncio: a, pessoas, oportunidade: op, imovel, pedidos, previa: pessoas[0] ? F.montaTexto(F.ajustes().modelo, pessoas[0], a) : null });
});

r.post('/fisguei/:id/pausar', (req, res) => {
  const a = anuncio(+req.params.id);
  run(`UPDATE fisguei_anuncios SET pausado=?, atualizado_em=datetime('now','localtime') WHERE id=?`, req.body && req.body.pausado ? 1 : 0, a.id);
  audit(req.usuario.id, 'fisguei.pausar', `${F.ref(a.id)} ${req.body && req.body.pausado ? 'pausado' : 'retomado'}`);
  res.json({ ok: true });
});
r.post('/fisguei/:id/descartar', (req, res) => {
  const a = anuncio(+req.params.id);
  run(`UPDATE fisguei_anuncios SET status='descartado', atualizado_em=datetime('now','localtime') WHERE id=?`, a.id);
  F.pulaRestoDoEndereco(a.id, 'Endereço descartado pelo corretor');
  audit(req.usuario.id, 'fisguei.descartar', F.ref(a.id));
  res.json({ ok: true });
});
// Transforma o anúncio em oportunidade do Radar (mesmo sem confirmação pelo robô).
r.post('/fisguei/:id/captar', (req, res) => {
  const a = anuncio(+req.params.id);
  const p = one(`SELECT p.*, (SELECT c.valor FROM fisguei_contatos c WHERE c.pessoa_id=p.id AND c.tipo='tel' ORDER BY CASE c.envio WHEN 'respondeu' THEN 0 ELSE 1 END, c.id LIMIT 1) AS tel
    FROM fisguei_pessoas p WHERE p.anuncio_id=? ORDER BY CASE p.status WHEN 'confirmou' THEN 0 WHEN 'respondeu' THEN 1 ELSE 2 END, p.id LIMIT 1`, a.id) || { nome: null, tel: null };
  const opId = F.criaOportunidade(a, { nome: p.nome || 'A confirmar', unidade: p.unidade }, p.tel || null);
  run(`UPDATE oportunidades SET corretor_id=coalesce(corretor_id,?) WHERE id=?`, req.usuario.perfil === 'corretor' ? req.usuario.id : null, opId);
  run(`UPDATE fisguei_anuncios SET status='captado', atualizado_em=datetime('now','localtime') WHERE id=?`, a.id);
  F.pulaRestoDoEndereco(a.id, 'Já está no Radar com o corretor');
  audit(req.usuario.id, 'fisguei.captar', `${F.ref(a.id)} → OP-${String(opId).padStart(4, '0')}`);
  res.json({ oportunidade_id: opId });
});

function pessoa(id) {
  const p = one('SELECT * FROM fisguei_pessoas WHERE id=?', id);
  if (!p) falha(404, 'Pessoa não encontrada.');
  return p;
}
r.post('/fisguei/pessoas/:pid/status', (req, res) => {
  const p = pessoa(+req.params.pid);
  const st = String(req.body && req.body.status || '');
  if (!['confirmou', 'negou', 'sem_interesse', 'parar'].includes(st)) falha(400, 'Situação inválida.');
  run('UPDATE fisguei_pessoas SET status=? WHERE id=?', st, p.id);
  const a = anuncio(p.anuncio_id);
  if (st === 'parar') for (const c of all(`SELECT valor FROM fisguei_contatos WHERE pessoa_id=? AND tipo='tel'`, p.id)) F.bloqueia(c.valor, 'marcado pelo corretor');
  if (st === 'negou' || st === 'parar') { run(`UPDATE fisguei_contatos SET envio='pulado', erro='Marcado pelo corretor' WHERE pessoa_id=? AND envio='fila'`, p.id); F.fechaSeAcabou(a.id); }
  if (st === 'confirmou') {
    run(`UPDATE fisguei_anuncios SET status='confirmado', atualizado_em=datetime('now','localtime') WHERE id=?`, a.id);
    F.pulaRestoDoEndereco(a.id, 'O dono já confirmou');
    const tel = one(`SELECT valor FROM fisguei_contatos WHERE pessoa_id=? AND tipo='tel' ORDER BY CASE envio WHEN 'respondeu' THEN 0 ELSE 1 END LIMIT 1`, p.id);
    F.criaOportunidade(a, p, tel && tel.valor);
  }
  if (st === 'sem_interesse') { run(`UPDATE fisguei_anuncios SET status='sem_interesse' WHERE id=?`, a.id); F.pulaRestoDoEndereco(a.id, 'O dono não tem interesse'); }
  audit(req.usuario.id, 'fisguei.pessoa', `${F.ref(a.id)} pessoa #${p.id} → ${st}`);
  res.json({ ok: true });
});
// O corretor responde pela mesma linha do robô (sai na próxima volta, em até 1 minuto).
r.post('/fisguei/pessoas/:pid/mensagem', (req, res) => {
  const p = pessoa(+req.params.pid);
  const texto = txt(req.body && req.body.texto, 2000);
  if (!texto) falha(400, 'Escreva a mensagem.');
  const c = one(`SELECT valor FROM fisguei_contatos WHERE pessoa_id=? AND tipo='tel' AND envio IN ('respondeu','enviado') ORDER BY CASE envio WHEN 'respondeu' THEN 0 ELSE 1 END, enviado_em DESC LIMIT 1`, p.id);
  if (!c) falha(400, 'O robô ainda não falou com essa pessoa. Responda só depois da primeira mensagem.');
  if (F.bloqueado(c.valor)) falha(400, 'Esse número está na lista não contatar.');
  F.enfileiraResposta(p.id, c.valor, texto, req.usuario.nome);
  res.json({ ok: true });
});


// ---------- robô "Buscar dados" no Fisgar ----------
r.post('/fisguei/buscar', (req, res) => {
  const ids = (Array.isArray(req.body && req.body.oportunidade_ids) ? req.body.oportunidade_ids : []).map((x) => parseInt(x, 10)).filter(Number.isFinite).slice(0, 1000);
  if (!ids.length) falha(400, 'Escolha ao menos uma oportunidade.');
  const out = P.pedeOportunidades(ids, req.usuario.id);
  audit(req.usuario.id, 'fisguei.buscar', `${out.criados} busca(s) na fila do Fisgar (${out.ja} já estavam, ${out.sem_endereco} sem endereço)`);
  res.json({ ...out, anuncio_id: out.anuncios.length === 1 ? out.anuncios[0] : null });
});
// "Buscar dono" de vários cartões de uma vez (cada endereço gasta crédito quando o robô executar no Fisgar)
r.post('/fisguei/buscar-anuncios', (req, res) => {
  const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map((x) => parseInt(x, 10)).filter(Number.isFinite).slice(0, 200);
  if (!ids.length) falha(400, 'Escolha ao menos um imóvel.');
  const out = { criados: 0, ja: 0, sem_endereco: 0 };
  for (const id of ids) { const p = P.pedeEndereco(id, req.usuario.id); if (p.erro) out.sem_endereco++; else if (p.ja) out.ja++; else out.criados++; }
  audit(req.usuario.id, 'fisguei.buscar', `${out.criados} busca(s) pela tela de cartões`);
  res.json({ ...out, creditos: I.creditos() });
});
r.post('/fisguei/:id/buscar', (req, res) => {
  const a = anuncio(+req.params.id);
  const out = P.pedeEndereco(a.id, req.usuario.id);
  if (out.erro) falha(400, 'Este anúncio não tem rua e número: o Fisgar só acha o dono com o endereço completo.');
  audit(req.usuario.id, 'fisguei.buscar', F.ref(a.id));
  res.json(out);
});
r.post('/fisguei/pessoas/:pid/consultar', (req, res) => {
  const p = pessoa(+req.params.pid);
  const out = P.pedePessoa(p.id, req.usuario.id);
  if (out.erro) falha(400, out.erro);
  audit(req.usuario.id, 'fisguei.consultar', `${F.ref(p.anuncio_id)} pessoa #${p.id}`);
  res.json(out);
});
r.get('/fisguei/pedidos', (req, res) => res.json(P.resumo()));
r.post('/fisguei/pedidos/limites', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor mudam o limite de créditos.');
  const l = P.salvaLimites(req.body || {});
  audit(req.usuario.id, 'fisguei.limites', JSON.stringify(l));
  res.json(l);
});
r.get('/fisguei/radar', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite).slice(0, 1000);
  res.json(P.situacaoOportunidades(ids));
});
// Leva o anúncio fisgado para a carteira como imóvel em captação (sem as fotos do anúncio original, que são de terceiros).
r.post('/fisguei/:id/importar', (req, res) => {
  const a = anuncio(+req.params.id);
  const { proximoCodigo } = require('./imoveis').ajudantes;
  const out = P.importa(a.id, req.usuario, proximoCodigo);
  if (!out.ja) audit(req.usuario.id, 'imovel_criado', `${out.codigo} (importado do Fisguei ${F.ref(a.id)})`);
  res.json(out);
});

// ---------- robô ----------
r.get('/fisguei/robo', (req, res) => res.json({ robo: robo(), ajustes: F.ajustes(), hoje: F.enviadasHoje(), horario: F.dentroDoHorario() }));
r.post('/fisguei/robo', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor mudam o robô.');
  const aj = F.salvaAjustes(req.body || {});
  audit(req.usuario.id, 'fisguei.robo', JSON.stringify({ pausado: aj.pausado, limite: aj.limite_dia, intervalo: aj.intervalo_s, horas: `${aj.hora_inicio}-${aj.hora_fim}` }));
  res.json({ ajustes: aj });
});
r.post('/fisguei/robo/comando', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor mudam o robô.');
  const c = String(req.body && req.body.comando || '');
  if (!['desconectar', 'reiniciar'].includes(c)) falha(400, 'Comando inválido.');
  setConfig('fisguei_robo_cmd', c);
  audit(req.usuario.id, 'fisguei.robo', 'comando ' + c);
  res.json({ ok: true });
});
r.post('/fisguei/chave', (req, res) => {
  if (!A.veTudo(req.usuario)) falha(403, 'Só o administrativo ou o gestor geram a chave.');
  const k = 'fsg_' + crypto.randomBytes(24).toString('base64url');
  setConfig('fisguei_chave_hash', A.sha256(k));
  audit(req.usuario.id, 'fisguei.chave', 'nova chave da extensão gerada');
  res.json({ chave: k });
});

module.exports = { api: r, receber };
