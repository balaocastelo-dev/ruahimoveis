// Robô "Buscar dados": fila de buscas no Fisgar que a extensão do Chrome executa dentro do painel do Fisgar
// (com o login de quem está usando), gastando os créditos do plano. O resultado volta para o Fisguei.
// Também aqui: importar um anúncio fisgado como imóvel da carteira.
const { one, all, run, getConfig, setConfig } = require('../db');
const cfg = require('../config');
const F = require('./base');
const normaliza = require('./normaliza');

const CREDITOS_MAX = 300, CONSULTAS_MAX = 10;
const ABERTOS = ['fila', 'buscando'];

function limites() {
  const n = (k, d) => { const v = parseInt(getConfig(k), 10); return Number.isFinite(v) ? v : d; };
  return {
    creditos_dia: Math.min(Math.max(n('fisguei_creditos_dia', 70), 1), CREDITOS_MAX),
    max_consultas: Math.min(Math.max(n('fisguei_max_consultas', 3), 0), CONSULTAS_MAX),
    creditos_max: CREDITOS_MAX, consultas_max: CONSULTAS_MAX,
  };
}
function salvaLimites(b) {
  const int = (v) => (v === '' || v === undefined || v === null ? undefined : parseInt(v, 10));
  const c = int(b.creditos_dia); if (c !== undefined && Number.isFinite(c)) setConfig('fisguei_creditos_dia', Math.min(Math.max(c, 1), CREDITOS_MAX));
  const m = int(b.max_consultas); if (m !== undefined && Number.isFinite(m)) setConfig('fisguei_max_consultas', Math.min(Math.max(m, 0), CONSULTAS_MAX));
  return limites();
}
const creditosHoje = () => one(`SELECT coalesce(sum(creditos),0) AS n FROM fisguei_pedidos WHERE substr(coalesce(concluido_em,criado_em),1,10)=date('now','localtime')`).n;
const creditosMes = () => one(`SELECT coalesce(sum(creditos),0) AS n FROM fisguei_pedidos WHERE substr(coalesce(concluido_em,criado_em),1,7)=substr(date('now','localtime'),1,7)`).n;

// ---------- criar pedidos ----------
function anuncioDaOportunidade(op) {
  const ja = one('SELECT id FROM fisguei_anuncios WHERE oportunidade_id=? ORDER BY id LIMIT 1', op.id);
  if (ja) return ja.id;
  const id = F.salvaAnuncio({
    fisgar_id: 'op:' + op.id, portal: op.portal, link: op.link, titulo: op.titulo, tipo: op.tipo, negocio: 'Venda',
    logradouro: op.logradouro, numero: op.numero, complemento: op.unidade || op.condominio_nome, bairro: op.bairro, cidade: op.cidade || cfg.CIDADE_PADRAO, uf: 'SP',
    valor: op.valor, quartos: op.quartos, vagas: op.vagas, area_util: op.area, anunciante_nome: op.anunciante_nome, anunciante_tipo: op.anunciante_tipo, publicado_em: op.publicado_em,
  });
  run('UPDATE fisguei_anuncios SET oportunidade_id=? WHERE id=?', op.id, id);
  return id;
}
function pedidoAberto(anuncioId, pessoaId) {
  return one(`SELECT * FROM fisguei_pedidos WHERE anuncio_id=? AND ${pessoaId ? 'pessoa_id=?' : 'pessoa_id IS NULL'} AND status IN ('fila','buscando')`, ...(pessoaId ? [anuncioId, pessoaId] : [anuncioId]));
}
function pedeEndereco(anuncioId, usuarioId) {
  const a = one('SELECT * FROM fisguei_anuncios WHERE id=?', anuncioId);
  if (!a || !a.logradouro || !a.numero) return { erro: 'sem rua e número' };
  const aberto = pedidoAberto(anuncioId, null);
  if (aberto) return { id: aberto.id, ja: true };
  return { id: run('INSERT INTO fisguei_pedidos(anuncio_id,tipo,criado_por) VALUES(?,?,?)', anuncioId, 'endereco', usuarioId || null).lastInsertRowid };
}
function pedeOportunidades(ids, usuarioId) {
  const r = { criados: 0, ja: 0, sem_endereco: 0, anuncios: [] };
  for (const id of ids) {
    const op = one('SELECT * FROM oportunidades WHERE id=?', id);
    if (!op) continue;
    if (!op.logradouro || !op.numero) { r.sem_endereco++; continue; }
    const aid = anuncioDaOportunidade(op);
    const p = pedeEndereco(aid, usuarioId);
    if (p.ja) r.ja++; else if (p.id) r.criados++;
    r.anuncios.push(aid);
  }
  return r;
}
function pedePessoa(pessoaId, usuarioId) {
  const p = one('SELECT * FROM fisguei_pessoas WHERE id=?', pessoaId);
  if (!p) return { erro: 'pessoa não encontrada' };
  const aberto = pedidoAberto(p.anuncio_id, p.id);
  if (aberto) return { id: aberto.id, ja: true };
  return { id: run('INSERT INTO fisguei_pedidos(anuncio_id,pessoa_id,tipo,criado_por) VALUES(?,?,?,?)', p.anuncio_id, p.id, 'pessoa', usuarioId || null).lastInsertRowid };
}

// ---------- CEP: o Fisgar acha o dono pelo CEP + número ----------
const soDig = (s) => String(s || '').replace(/\D/g, '');
// Ruas longas têm um CEP por trecho ("de 501 a 999 - lado ímpar"): escolhe o trecho do número.
function trechoServe(compl, numero) {
  const n = parseInt(numero, 10); const c = F.norm(compl);
  if (!c || !Number.isFinite(n)) return 0;
  if (/lado impar/.test(c) && n % 2 === 0) return -1;
  if (/lado par/.test(c) && n % 2 === 1) return -1;
  let m = c.match(/de (\d+) (?:a|ao) (\d+)/); if (m) return n >= +m[1] && n <= +m[2] ? 2 : -1;
  m = c.match(/de (\d+) ao fim/); if (m) return n >= +m[1] ? 2 : -1;
  m = c.match(/ate (\d+)/); if (m) return n <= +m[1] ? 2 : -1;
  return 0;
}
async function resolveCep(a) {
  if (a.cep && soDig(a.cep).length === 8) return { cep: soDig(a.cep), bairro: a.bairro };
  const uf = a.uf || 'SP', cidade = a.cidade || cfg.CIDADE_PADRAO;
  const rua = String(a.logradouro || '').replace(/^(rua|r\.|avenida|av\.|alameda|al\.|travessa|estrada|rodovia)\s+/i, '').trim();
  if (rua.length < 3) return null;
  const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(rua)}/json/`;
  const r = await fetch(url, { headers: { 'User-Agent': `${cfg.SISTEMA_NOME.replace(/\s+/g, '')}/1.0` }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const lista = await r.json();
  if (!Array.isArray(lista) || !lista.length) return null;
  const nomeRua = F.norm(a.logradouro).replace(/^(rua|avenida|alameda|travessa|estrada|rodovia) /, '');
  const bairro = F.norm(a.bairro);
  const nota = (x) => (F.norm(x.logradouro).endsWith(nomeRua) ? 4 : 0) + trechoServe(x.complemento, a.numero) * 2 + (bairro && F.norm(x.bairro).includes(bairro.split(' ')[0]) ? 1 : 0);
  const melhor = lista.map((x) => ({ x, n: nota(x) })).filter((y) => y.n >= 0).sort((p, q) => q.n - p.n)[0];
  if (!melhor || melhor.n < 4) return null;
  return { cep: soDig(melhor.x.cep), bairro: melhor.x.bairro || a.bairro, logradouro: melhor.x.logradouro };
}

// ---------- a extensão pede o próximo ----------
async function proximo() {
  const lim = limites();
  if (creditosHoje() >= lim.creditos_dia) return { pedido: null, motivo: `limite de ${lim.creditos_dia} créditos por dia atingido` };
  // pedido preso em "buscando" há mais de 10 min (Fisgar fechado no meio): volta para a fila
  run(`UPDATE fisguei_pedidos SET status='fila' WHERE status='buscando' AND iniciado_em < datetime('now','localtime','-10 minute')`);
  for (let i = 0; i < 10; i++) {
    const p = one(`SELECT * FROM fisguei_pedidos WHERE status='fila' ORDER BY CASE tipo WHEN 'pessoa' THEN 0 ELSE 1 END, id LIMIT 1`);
    if (!p) return { pedido: null };
    const pega = run(`UPDATE fisguei_pedidos SET status='buscando', iniciado_em=datetime('now','localtime') WHERE id=? AND status='fila'`, p.id);
    if (!pega.changes) continue;
    const a = one('SELECT * FROM fisguei_anuncios WHERE id=?', p.anuncio_id);
    let end = null;
    try { end = await resolveCep(a); } catch { end = null; }
    if (!end) { conclui(p.id, 'erro', { erro: 'Não achei o CEP dessa rua e número. Confira o endereço no Radar.' }); continue; }
    if (!a.cep) run('UPDATE fisguei_anuncios SET cep=?, bairro=coalesce(bairro,?) WHERE id=?', end.cep, end.bairro || null, a.id);
    const key = { number: String(a.numero).replace(/\D.*$/, '') || String(a.numero), zipcode: end.cep, extra: '', city: a.cidade || cfg.CIDADE_PADRAO, district: end.bairro || a.bairro || '', state: 'SP', name: null, street: end.logradouro || a.logradouro };
    let consultar;
    if (p.tipo === 'pessoa') {
      const pes = one('SELECT nome, unidade FROM fisguei_pessoas WHERE id=?', p.pessoa_id);
      consultar = { modo: 'nomes', nomes: [{ nome: pes.nome, unidade: pes.unidade }] };
    } else {
      consultar = { modo: 'auto', limite: lim.max_consultas, unidade: a.complemento && /\d/.test(a.complemento) ? a.complemento : null };
    }
    return { pedido: { id: p.id, tipo: p.tipo, ref: F.ref(a.id), key, consultar, creditos_restantes: lim.creditos_dia - creditosHoje() } };
  }
  return { pedido: null };
}

function conclui(id, status, extra = {}) {
  run(`UPDATE fisguei_pedidos SET status=?, erro=?, creditos=creditos+?, pessoas=coalesce(?,pessoas), consultadas=coalesce(?,consultadas), concluido_em=datetime('now','localtime') WHERE id=?`,
    status, extra.erro ? String(extra.erro).slice(0, 300) : null, extra.creditos || 0, extra.pessoas ?? null, extra.consultadas ?? null, id);
}

// Resultado que a extensão devolve: { pessoas: {pedido, json, cobrado}, consultas: [{pedido, json, cobrado}], erro, sem_credito }
function resultado(id, b) {
  const p = one('SELECT * FROM fisguei_pedidos WHERE id=?', id);
  if (!p) return { erro: 'pedido não encontrado' };
  if (p.status !== 'buscando') return { erro: 'pedido já encerrado' };
  if (b.erro && !b.pessoas) { conclui(id, b.erro_volta ? 'fila' : 'erro', { erro: b.erro }); return { ok: true }; }
  const URL = 'https://router.fisgar.com.br/api123/v1/api/region/sp/owners/';
  let creditos = 0, pessoas = 0, consultadas = 0;
  if (b.pessoas && b.pessoas.json) {
    if (b.pessoas.cobrado !== false) creditos++;
    const r = normaliza.processa(URL + 'GetPeople', b.pessoas.json, b.pessoas.pedido, { anuncioId: p.anuncio_id });
    pessoas = r.pessoas;
  }
  for (const c of Array.isArray(b.consultas) ? b.consultas.slice(0, CONSULTAS_MAX) : []) {
    if (!c || !c.json) continue;
    if (c.cobrado) creditos++;
    const r = normaliza.processa(URL + 'GetPersonInfo', c.json, c.pedido, { anuncioId: p.anuncio_id });
    if (r.pessoas) consultadas++;
  }
  const total = b.pessoas && b.pessoas.json && b.pessoas.json.data ? (b.pessoas.json.data.people || []).length : pessoas;
  let status = 'concluido';
  if (p.tipo === 'endereco' && !total) status = 'sem_resultado';
  else if (p.tipo === 'endereco' && total && !consultadas) status = 'escolher';
  if (b.sem_credito) status = consultadas ? 'concluido' : 'erro';
  conclui(id, status, { creditos, pessoas: total, consultadas, erro: b.sem_credito ? 'O Fisgar recusou por falta de crédito: ' + (b.aviso || 'sem créditos no plano') : b.aviso || null });
  if (status === 'sem_resultado') run(`UPDATE fisguei_anuncios SET observacoes=coalesce(observacoes,'') || ? WHERE id=?`, ' O Fisgar não achou dono pelo IPTU neste endereço.', p.anuncio_id);
  const carteira = status === 'concluido' ? entraNaCarteira(id) : null;
  return { ok: true, status, creditos, pessoas: total, consultadas, imovel: carteira };
}

function situacaoOportunidades(ids) {
  if (!ids.length) return {};
  const out = {};
  for (const r of all(`SELECT a.id, a.oportunidade_id, a.status,
      (SELECT count(*) FROM fisguei_pessoas x WHERE x.anuncio_id=a.id) AS pessoas,
      (SELECT count(*) FROM fisguei_pessoas x WHERE x.anuncio_id=a.id AND x.consultado=1) AS consultadas,
      (SELECT p.status FROM fisguei_pedidos p WHERE p.anuncio_id=a.id ORDER BY p.id DESC LIMIT 1) AS pedido
    FROM fisguei_anuncios a WHERE a.oportunidade_id IN (${ids.map(() => '?').join(',')})`, ...ids)) out[r.oportunidade_id] = { ...r, ref: F.ref(r.id) };
  return out;
}

function resumo() {
  const n = (sql) => one(sql).n;
  const visto = getConfig('fisguei_ext_visto');
  let ext = {}; try { ext = JSON.parse(visto || '{}'); } catch {}
  return {
    fila: n(`SELECT count(*) AS n FROM fisguei_pedidos WHERE status='fila'`),
    buscando: n(`SELECT count(*) AS n FROM fisguei_pedidos WHERE status='buscando'`),
    escolher: n(`SELECT count(*) AS n FROM fisguei_pedidos p WHERE status='escolher' AND p.id=(SELECT max(id) FROM fisguei_pedidos q WHERE q.anuncio_id=p.anuncio_id)`),
    creditos_hoje: creditosHoje(), creditos_mes: creditosMes(), limites: limites(),
    extensao: { em: ext.em || null, fisgar_aberto: !!ext.fisgar, vivo: ext.em && Date.now() - new Date(ext.em).getTime() < 2 * 60e3 },
    ultimos: all(`SELECT p.id, p.status, p.tipo, p.creditos, p.pessoas, p.consultadas, p.erro, p.concluido_em, p.anuncio_id, a.logradouro, a.numero, a.bairro
      FROM fisguei_pedidos p JOIN fisguei_anuncios a ON a.id=p.anuncio_id WHERE p.status NOT IN ('fila') ORDER BY coalesce(p.concluido_em,p.iniciado_em) DESC, p.id DESC LIMIT 8`),
  };
}
function marcaExtensao(fisgarAberto) { setConfig('fisguei_ext_visto', JSON.stringify({ em: new Date().toISOString(), fisgar: !!fisgarAberto })); }

// ---------- importar para a carteira ----------
const TIPO_IMOVEL = [[/cobertura/, 'Cobertura'], [/apartamento|apto|flat|studio|kitnet|loft/, 'Apartamento'], [/casa.*condom|condom.*casa/, 'Casa em condomínio'], [/sobrado/, 'Sobrado'],
  [/sala|conjunto|consult/, 'Sala comercial'], [/loja/, 'Loja'], [/ponto/, 'Ponto comercial'], [/predio|edificio/, 'Prédio'], [/galpao|barracao/, 'Galpão'], [/hotel|pousada/, 'Hotel'],
  [/terreno|lote/, 'Terreno'], [/chacara|sitio|fazenda|haras/, 'Chácara'], [/casa/, 'Casa']];
const tipoImovel = (t) => { const n = F.norm(t); const m = TIPO_IMOVEL.find(([re]) => re.test(n)); return m ? m[1] : 'Casa'; };

// Quem fica como proprietário na ficha: quem confirmou pelo WhatsApp; senão o melhor consultado no Fisgar
// (possível proprietário pelo IPTU primeiro, depois cônjuge/morador), sempre com telefone quando houver.
function melhorDono(anuncioId) {
  const l = all(`SELECT p.*, (SELECT c.valor FROM fisguei_contatos c WHERE c.pessoa_id=p.id AND c.tipo='tel' ORDER BY CASE c.envio WHEN 'respondeu' THEN 0 WHEN 'enviado' THEN 1 ELSE 2 END, c.id LIMIT 1) AS tel,
      (SELECT c.valor FROM fisguei_contatos c WHERE c.pessoa_id=p.id AND c.tipo='email' ORDER BY c.id LIMIT 1) AS email
    FROM fisguei_pessoas p WHERE p.anuncio_id=? AND p.status NOT IN ('negou','parar')`, anuncioId);
  if (!l.length) return null;
  const nota = (x) => (x.status === 'confirmou' ? 0 : 10) + (x.consultado ? 0 : 5) + (x.tel ? 0 : 2) + F.TIPOS_PRIORIDADE(x.relacao);
  return l.sort((a, b) => nota(a) - nota(b) || a.id - b.id)[0];
}
const ORIGEM_FISGAR = 'Fisgar';
const origemDono = (d) => (d.status === 'confirmou' ? 'Fisgar (consulta paga) e confirmou pelo WhatsApp que é o dono'
  : `Fisgar (consulta paga): ${d.relacao || 'pessoa ligada ao endereço'}, ainda não confirmou`);

// Liga (ou atualiza) o proprietário da ficha com o que o Fisgar trouxe. Proprietário digitado pela equipe não é trocado.
function sincronizaDono(anuncioId) {
  const a = one('SELECT id, imovel_id FROM fisguei_anuncios WHERE id=?', anuncioId);
  if (!a || !a.imovel_id) return null;
  const im = one('SELECT id, proprietario_id FROM imoveis WHERE id=?', a.imovel_id);
  if (!im) return null;
  const d = melhorDono(a.id);
  if (!d) return null;
  const atual = im.proprietario_id ? one('SELECT * FROM proprietarios WHERE id=?', im.proprietario_id) : null;
  if (atual && !String(atual.origem_dado || '').startsWith(ORIGEM_FISGAR)) return atual.id;
  if (atual) {
    run('UPDATE proprietarios SET nome=?, telefone=coalesce(?,telefone), email=coalesce(?,email), origem_dado=? WHERE id=?', d.nome, d.tel || null, d.email || null, origemDono(d), atual.id);
    return atual.id;
  }
  const pid = Number(run('INSERT INTO proprietarios(nome,telefone,email,origem_dado) VALUES(?,?,?,?)', d.nome, d.tel || null, d.email || null, origemDono(d)).lastInsertRowid);
  run(`UPDATE imoveis SET proprietario_id=?, atualizado_em=datetime('now','localtime') WHERE id=?`, pid, im.id);
  return pid;
}

// Leva o anúncio da base para a carteira (imóveis em operação). Acontece sozinho quando o Fisgar devolve o proprietário
// ("Localizar proprietário" nas vitrines) e também pelo botão na ficha do Fisguei. As fotos do anúncio são de terceiros: não vão.
function importa(anuncioId, usuario, proximoCodigo) {
  const a = one('SELECT * FROM fisguei_anuncios WHERE id=?', anuncioId);
  if (!a) { const e = new Error('Anúncio não encontrado.'); e.status = 404; throw e; }
  if (a.imovel_id && one('SELECT 1 FROM imoveis WHERE id=?', a.imovel_id)) {
    sincronizaDono(a.id);
    require('../services/fotos-internas').garante(a.imovel_id, { anuncioId: a.id });
    return { id: a.imovel_id, ja: true, codigo: one('SELECT codigo FROM imoveis WHERE id=?', a.imovel_id).codigo };
  }
  const tipo = tipoImovel(a.tipo);
  const codigo = proximoCodigo(tipo);
  const descricao = [`Veio da base (${F.ref(a.id)}) em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, com o proprietário localizado no Fisgar.`,
    a.anunciante_nome ? `Anunciado antes por: ${a.anunciante_nome}${a.anunciante_tipo === 'imobiliaria' ? ' (imobiliária)' : ''}.` : '',
    `Fotos: as do anúncio entraram como fotos INTERNAS (só para a equipe; não vão para o portal). Para publicar, tirar fotos próprias da ${cfg.CLIENTE_NOME} ou pedir as originais ao dono.`].filter(Boolean).join('\n');
  const corretor = usuario && usuario.perfil === 'corretor' ? usuario.id : (a.oportunidade_id && one('SELECT corretor_id FROM oportunidades WHERE id=?', a.oportunidade_id) || {}).corretor_id || (usuario && usuario.id) || null;
  const d = melhorDono(a.id);
  const unidade = d && d.unidade ? d.unidade : (a.complemento && /\d/.test(a.complemento) ? a.complemento.slice(0, 40) : null);
  const finalidade = a.valor > 0 && a.aluguel > 0 ? 'venda_locacao' : !(a.valor > 0) && a.aluguel > 0 ? 'locacao' : 'venda';
  const id = Number(run(`INSERT INTO imoveis(codigo,tipo,status,cep,logradouro,numero,unidade,bairro,cidade,uf,lat,lon,condominio_id,quartos,suites,vagas,area_util,area_total,valor,valor_condominio,iptu,descricao,corretor_id,finalidade,valor_locacao)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, codigo, tipo, 'captacao', a.cep, a.logradouro, a.numero, unidade, a.bairro, a.cidade || cfg.CIDADE_PADRAO, a.uf || 'SP', a.lat, a.lon,
    a.condominio_id || null, a.quartos, a.suites, a.vagas, a.area_util, a.area_total, a.valor || null, a.valor_condominio, a.iptu, descricao, corretor, finalidade, a.aluguel || null).lastInsertRowid);
  run(`UPDATE fisguei_anuncios SET imovel_id=?, atualizado_em=datetime('now','localtime') WHERE id=?`, id, a.id);
  if (a.oportunidade_id) run(`UPDATE oportunidades SET imovel_id=coalesce(imovel_id,?) WHERE id=?`, id, a.oportunidade_id);
  sincronizaDono(a.id);
  require('../services/fotos-internas').garante(id, { anuncioId: a.id });
  return { id, codigo };
}
// Depois que o Fisgar respondeu: com alguém consultado (telefone na mão), o imóvel entra na carteira sozinho.
function entraNaCarteira(pedidoId) {
  const p = one('SELECT * FROM fisguei_pedidos WHERE id=?', pedidoId);
  if (!p) return null;
  const tem = one('SELECT count(*) AS n FROM fisguei_pessoas WHERE anuncio_id=? AND consultado=1', p.anuncio_id).n;
  if (!tem) return null;
  const u = p.criado_por ? one('SELECT id, perfil FROM usuarios WHERE id=?', p.criado_por) : null;
  try {
    const { proximoCodigo } = require('../routes/imoveis').ajudantes;
    const out = importa(p.anuncio_id, u, proximoCodigo);
    if (!out.ja) { const { audit } = require('../db'); audit(u ? u.id : null, 'imovel_criado', `${out.codigo} (proprietário localizado no Fisgar, ${F.ref(p.anuncio_id)})`); }
    return out;
  } catch (e) { console.error('[fisguei] levar para a carteira', e.message); return null; }
}

module.exports = { melhorDono, sincronizaDono, entraNaCarteira, limites, salvaLimites, creditosHoje, pedeOportunidades, pedeEndereco, pedePessoa, proximo, resultado, resumo, marcaExtensao, situacaoOportunidades, importa, tipoImovel, resolveCep, trechoServe };
