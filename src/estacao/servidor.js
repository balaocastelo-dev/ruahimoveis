// PCs virtuais dos agentes — lado do sistema (roda no link de cada imobiliária e no PC).
// A ESTAÇÃO (src/estacao/pc, na RTX ou num servidor) mantém um Chrome de verdade por agente, sempre ligado.
// Ela fala com cada imobiliária por /estacao-api (chave da estação) e a tela do escritório fala com ela direto
// (WebSocket pelo túnel), com um passe assinado que vale poucos minutos.
const crypto = require('crypto');
const express = require('express');
const A = require('../auth');
const cfg = require('../config');
const { one, all, run, audit, getConfig, setConfig } = require('../db');
const { falha, txt } = require('../util');
const B = require('../agentes/base');
const IA = require('../agentes/ia');
const C = require('../plataforma/central');

const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const agora = () => new Date().toISOString();
// A chave da estação pode vir de três lugares, e TODAS valem ao mesmo tempo (a estação pode estar
// configurada de qualquer uma das formas, e trocar de forma não pode derrubar o PC de ninguém):
//   1. a própria da imobiliária, gerada na tela (cifrada no banco, em config.estacao);
//   2. a variável do projeto (ESTACAO_ID + ESTACAO_CHAVE);
//   3. a CENTRAL da plataforma (plataforma.config 'estacao_chave'): o Thiago mantém uma só e toda
//      imobiliária usa de graça, como a chave de IA. Nesse caso o id é o próprio schema.
// Qual delas a estação usa de fato só se sabe quando ela bate aqui: a batida guarda a reconhecida em
// ULTIMA, e é com essa que assinamos o passe da tela — senão a tela abriria o PC com a chave errada.
let ULTIMA = null;
function chavesEstacao() {
  const l = [];
  const e = json(getConfig('estacao'), {});
  if (e.chave) { const k = IA.decifra(e.chave); if (k) l.push({ k, info: e }); }
  if (process.env.ESTACAO_CHAVE) l.push({ k: process.env.ESTACAO_CHAVE, info: { id: process.env.ESTACAO_ID || 'imob', env: true } });
  const c = C.estacaoChave();
  if (c) l.push({ k: c, info: { id: C.euSync(), central: true } });
  return l;
}
const combina = (a, b) => !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escolhida = () => {
  const l = chavesEstacao();
  if (ULTIMA && l.some((x) => x.k === ULTIMA.k)) return ULTIMA;   // a que a estação está usando mesmo
  return l[0] || null;
};
const estacao = () => (escolhida() ? escolhida().info : json(getConfig('estacao'), {}));
const chaveEstacao = () => (escolhida() ? escolhida().k : null);
const status = () => json(getConfig('estacao_status'), {});
const online = (s = status()) => !!(s.em && Date.now() - new Date(s.em).getTime() < 60e3);

// ---------- cérebro dos PCs: quem opera o navegador ----------
const PROVEDORES = {
  gemini: { nome: 'Google Gemini', modelo: 'gemini-flash-latest' },
  anthropic: { nome: 'Anthropic Claude', modelo: 'claude-sonnet-5-5' },
  openai: { nome: 'Compatível com OpenAI (OpenRouter, Groq, OpenCode…)', modelo: 'qwen/qwen2.5-vl-72b-instruct:free', base_url: 'https://openrouter.ai/api/v1' },
  ollama: { nome: 'IA local do PC (Ollama, grátis)', modelo: 'qwen2.5vl:7b', base_url: 'http://127.0.0.1:11434' },
};
function iaBruta() { return json(getConfig('estacao_ia'), {}); }
function iaChave() { const b = iaBruta(); if (b.chave) return IA.decifra(b.chave) || ''; return ''; }
function iaAjustes() {
  const b = iaBruta();
  // sem nada escolhido: usa o Gemini do escritório se houver chave; senão a IA local do PC
  const provedor = PROVEDORES[b.provedor] ? b.provedor : IA.chave() ? 'gemini' : 'ollama';
  const p = PROVEDORES[provedor];
  const k = iaChave() || (provedor === 'gemini' ? IA.chave() : '');
  return { provedor, provedor_nome: p.nome, modelo: b.modelo || p.modelo, base_url: b.base_url || p.base_url || null,
    tem_chave: !!k, chave_final: k ? k.slice(-4) : null, usa_chave_do_escritorio: provedor === 'gemini' && !iaChave() && !!IA.chave(),
    precisa_chave: provedor !== 'ollama', testado_em: b.testado_em || null, teste_ok: b.teste_ok ?? null, teste_msg: b.teste_msg || null };
}
function iaParaEstacao() {
  const a = iaAjustes();
  return { provedor: a.provedor, modelo: a.modelo, base_url: a.base_url, chave: iaChave() || (a.provedor === 'gemini' ? IA.chave() : '') };
}
function iaSalva(b = {}, quem) {
  const a = iaBruta();
  if (b.provedor !== undefined) { if (!PROVEDORES[b.provedor]) falha(400, 'Escolha um provedor da lista.'); if (b.provedor !== a.provedor) { a.modelo = undefined; a.base_url = undefined; } a.provedor = b.provedor; }
  if (b.modelo !== undefined) a.modelo = String(b.modelo || '').trim().slice(0, 120) || undefined;
  if (b.base_url !== undefined) { const u = String(b.base_url || '').trim(); if (u && !/^https?:\/\/[^\s]+$/.test(u)) falha(400, 'Endereço da API inválido.'); a.base_url = u || undefined; }
  if (b.chave !== undefined) { const k = String(b.chave || '').trim(); if (k && !/^[\w\-.:]{12,300}$/.test(k)) falha(400, 'Essa chave não parece válida (sem espaços, só letras, números e - _ .).'); a.chave = k ? IA.cifra(k) : undefined; }
  a.teste_ok = null; a.teste_msg = null; a.por = quem || null; a.em = agora();
  setConfig('estacao_ia', JSON.stringify(a));
  return iaAjustes();
}

// ---------- passe para a tela abrir o PC do agente (assinado com a chave da estação) ----------
function passe(agente, u) {
  const k = chaveEstacao(); if (!k) return null;
  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const corpo = `${estacao().id}.${agente}.${exp}.${u.id}.${A.veTudo(u) ? 'c' : 'v'}`;
  const sig = crypto.createHmac('sha256', k).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}

// ---------- tarefas ----------
const resumoTarefa = (t) => t && ({ id: t.id, agente: t.agente, pedido: t.pedido, para_telefone: t.para_telefone, para_nome: t.para_nome, status: t.status,
  resultado: t.resultado, erro: t.erro, n_passos: t.n_passos, passos: json(t.passos, []).slice(-25), criado_em: t.criado_em, atualizado_em: t.atualizado_em, concluido_em: t.concluido_em });

// ==================== rotas da tela (/api/estacao, com login) ====================
const api = express.Router();
const gestor = A.exigePerfil('adm', 'gestor');

api.get('/estacao', async (req, res) => {
  await C.carregar();
  const s = status(); const e = estacao();
  res.json({ configurada: !!chaveEstacao(), online: online(s), em: s.em || null, versao: s.versao || null, url: online(s) ? s.url || null : null,
    maquina: s.maquina || null, agentes: s.agentes || {}, ia: A.veTudo(req.usuario) ? iaAjustes() : undefined, provedores: PROVEDORES,
    pode_editar: A.veTudo(req.usuario), id: A.veTudo(req.usuario) ? e.id || null : undefined,
    tarefas: all(`SELECT * FROM agente_tarefas ORDER BY id DESC LIMIT 30`).map(resumoTarefa) });
});
api.post('/estacao/passe', async (req, res) => {
  await C.carregar();
  const ag = String((req.body || {}).agente || '');
  if (!B.POR_SLUG[ag]) falha(404, 'Agente não encontrado.');
  const s = status();
  if (!chaveEstacao()) falha(409, 'A estação dos PCs virtuais ainda não foi ligada a esta imobiliária.');
  if (!online(s) || !s.url) falha(503, 'A estação dos PCs virtuais está desligada agora. Ela volta sozinha quando o computador ligar.');
  res.json({ url: s.url, passe: passe(ag, req.usuario), controle: A.veTudo(req.usuario) });
});
// Gera (ou troca) a chave da estação. A chave inteira só aparece agora; depois, só os 4 últimos.
api.post('/estacao/chave', gestor, (req, res) => {
  const chave = 'est_' + crypto.randomBytes(24).toString('base64url');
  const e = estacao();
  const id = e.id || (cfg.CLIENTE_NOME || 'imob').normalize('NFD').replace(/[^\w]/g, '').toLowerCase().slice(0, 20) + '-' + crypto.randomBytes(3).toString('hex');
  setConfig('estacao', JSON.stringify({ id, chave: IA.cifra(chave), criada_em: agora(), por: req.usuario.nome }));
  audit(req.usuario.id, 'estacao.chave', `chave nova da estação (${id})`);
  res.json({ id, chave, base: cfg.PUBLIC_URL || null });
});
api.put('/estacao/ia', gestor, (req, res) => {
  const a = iaSalva(req.body || {}, req.usuario.nome);
  audit(req.usuario.id, 'estacao.ia', `${a.provedor} ${a.modelo}`);
  res.json(a);
});
// Teste da chave: uma pergunta curta (a estação faz o resto; aqui só confere se a chave responde).
api.post('/estacao/ia/testar', gestor, async (req, res) => {
  const ia = iaParaEstacao(); const b = iaBruta(); const inicio = Date.now();
  try {
    if (ia.provedor === 'ollama') { b.teste_ok = null; b.teste_msg = 'A IA local é testada pela própria estação, no PC.'; }
    else {
      const t = await require('./ia-visao').perguntar(ia, 'Responda só JSON.', 'Devolva {"ok":true,"frase":"uma frase curta dizendo que o PC virtual está pronto"}', null, 20000);
      let frase = ''; try { frase = JSON.parse(t).frase || ''; } catch { frase = String(t).slice(0, 160); }
      b.teste_ok = true; b.teste_msg = `${frase} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`;
    }
  } catch (e) { b.teste_ok = false; b.teste_msg = e.message.slice(0, 300); }
  b.testado_em = agora(); setConfig('estacao_ia', JSON.stringify(b));
  res.json(iaAjustes());
});
api.post('/estacao/tarefas', (req, res) => {
  const b = req.body || {};
  const ag = String(b.agente || '');
  if (!B.POR_SLUG[ag]) falha(404, 'Agente não encontrado.');
  const pedido = txt(b.pedido, 3000);
  if (!pedido || pedido.length < 8) falha(400, 'Escreva a tarefa com um pouco mais de detalhe.');
  let para = b.para_telefone ? B.normTel(b.para_telefone) : '';
  if (para && !/^55\d{10,11}$/.test(para)) falha(400, 'Confira o WhatsApp para receber o resultado, com DDD.');
  if (!para) { const u = one('SELECT telefone FROM usuarios WHERE id=?', req.usuario.id); para = u && u.telefone ? B.normTel(u.telefone) : B.geral().dono_telefone || ''; }
  const id = Number(run('INSERT INTO agente_tarefas(agente,pedido,para_telefone,para_nome,criado_por) VALUES(?,?,?,?,?)', ag, pedido, para || null, req.usuario.nome, req.usuario.id).lastInsertRowid);
  B.evento(ag, 'tarefa', `Recebeu uma tarefa de ${req.usuario.nome.split(' ')[0]}: ${pedido.slice(0, 90)}`);
  audit(req.usuario.id, 'estacao.tarefa', `#${id} ${ag}`);
  res.json(resumoTarefa(one('SELECT * FROM agente_tarefas WHERE id=?', id)));
});
api.get('/estacao/tarefas/:id', (req, res) => res.json(resumoTarefa(one('SELECT * FROM agente_tarefas WHERE id=?', +req.params.id) || falha(404, 'Tarefa não encontrada.'))));
api.post('/estacao/tarefas/:id/cancelar', (req, res) => {
  run(`UPDATE agente_tarefas SET status='cancelada', atualizado_em=datetime('now','localtime') WHERE id=? AND status IN ('fila','rodando')`, +req.params.id);
  res.json({ ok: true });
});
// Comandos para a estação (ligar o PC do agente, reiniciar, ler as conversas não lidas, sair do WhatsApp)
const COMANDOS = ['ligar', 'reiniciar', 'desligar', 'ler_whatsapp', 'sair_whatsapp', 'abrir_whatsapp'];
api.post('/estacao/comando', gestor, (req, res) => {
  const b = req.body || {};
  if (!B.POR_SLUG[b.agente] || !COMANDOS.includes(b.comando)) falha(400, 'Comando inválido.');
  const l = json(getConfig('estacao_cmd'), []); l.push({ agente: b.agente, comando: b.comando, em: agora() });
  setConfig('estacao_cmd', JSON.stringify(l.slice(-40)));
  audit(req.usuario.id, 'estacao.comando', `${b.agente} ${b.comando}`);
  res.json({ ok: true });
});

// ==================== rotas da estação (/estacao-api, com a chave da estação) ====================
const est = express.Router();
est.use(express.json({ limit: '2mb' }));
est.use(async (req, res, next) => {
  await C.carregar();
  const v = String(req.get('x-estacao') || '');
  const achou = chavesEstacao().find((x) => combina(v, x.k));
  if (!achou) return res.status(401).json({ erro: 'Chave da estação inválida.' });
  ULTIMA = achou;
  next();
});
function agentesParaEstacao() {
  return B.AGENTES.map((a) => { const aj = B.ajustes(a.slug);
    return { slug: a.slug, n: a.n, nome: aj.nome, cargo: a.cargo, cor: a.cor, tipo: a.tipo, ativo: aj.ativo, canal: aj.canal, wa_filtro: aj.wa_filtro, linha: B.linhaDe(a.slug), resumo: a.resumo }; });
}
est.get('/config', (req, res) => res.json({ id: estacao().id, cliente: cfg.CLIENTE_NOME, empresa: cfg.EMPRESA, sistema: cfg.SISTEMA_NOME, site: cfg.PUBLIC_URL || null,
  agentes: agentesParaEstacao(), ia: iaParaEstacao() }));

// Batida a cada ~8 s: a estação conta como estão os PCs e leva tarefas, mensagens para mandar e comandos.
est.post('/batida', (req, res) => {
  const b = req.body || {};
  const ag = b.agentes && typeof b.agentes === 'object' ? b.agentes : {};
  setConfig('estacao_status', JSON.stringify({ em: agora(), url: /^(https:\/\/[\w.-]+|http:\/\/(127\.0\.0\.1|localhost):\d+)$/.test(b.url || '') ? b.url : null, versao: String(b.versao || '').slice(0, 20), maquina: String(b.maquina || '').slice(0, 60), agentes: ag }));
  for (const [slug, s] of Object.entries(ag)) {
    if (!B.POR_SLUG[slug] || !s || !s.wa) continue;
    const w = s.wa; const antes = json(getConfig('estacao_wa:' + slug), {});
    setConfig('estacao_wa:' + slug, JSON.stringify({ em: agora(), estado: String(w.estado || 'parada').slice(0, 20), numero: w.numero ? B.normTel(w.numero) : antes.numero || null, qr: w.qr && /^data:image\/(png|jpeg);base64,/.test(w.qr) ? String(w.qr).slice(0, 30000) : null, erro: w.erro ? String(w.erro).slice(0, 200) : null }));
  }
  // tarefa que ficou "fazendo agora" sem notícia há 10 min: a estação caiu no meio
  for (const t of all(`SELECT id,agente FROM agente_tarefas WHERE status='rodando' AND coalesce(atualizado_em,criado_em) < datetime('now','localtime','-10 minutes')`)) {
    run(`UPDATE agente_tarefas SET status='erro', erro='O PC do agente reiniciou no meio da tarefa. Mande de novo.', concluido_em=datetime('now','localtime') WHERE id=?`, t.id);
  }
  // tarefas na fila (cada uma vai para a estação uma vez só)
  const tarefas = [];
  for (const t of all(`SELECT * FROM agente_tarefas WHERE status='fila' ORDER BY id LIMIT 5`)) {
    if (run(`UPDATE agente_tarefas SET status='rodando', atualizado_em=datetime('now','localtime') WHERE id=? AND status='fila'`, t.id).changes) tarefas.push({ id: t.id, agente: t.agente, pedido: t.pedido, alma: B.alma(t.agente), nome: B.ajustes(t.agente).nome });
  }
  // tarefas canceladas na tela enquanto rodavam
  const canceladas = all(`SELECT id FROM agente_tarefas WHERE status='cancelada' AND concluido_em IS NULL`).map((t) => t.id);
  if (canceladas.length) run(`UPDATE agente_tarefas SET concluido_em=datetime('now','localtime') WHERE status='cancelada' AND concluido_em IS NULL`);
  // mensagens que saem pelo WhatsApp Web do PC do agente
  const E = require('../agentes/escritorio');
  const saidas = [];
  for (const m of all(`SELECT * FROM agente_mensagens WHERE direcao='saida' AND status='fila' ORDER BY id LIMIT 15`)) {
    const linha = B.linhaDe(m.agente);
    if (B.ajustes(linha).canal !== 'web') continue;
    const barra = E.barraSaida(m); if (barra) { E.marcaSaida(m, 'descartada', barra); continue; }
    if (run(`UPDATE agente_mensagens SET status='enviando', motivo=NULL WHERE id=? AND status='fila'`, m.id).changes) saidas.push({ id: m.id, linha, telefone: m.telefone, texto: m.texto });
  }
  // mensagens presas em "enviando" há mais de 5 min voltam para a fila
  run(`UPDATE agente_mensagens SET status='fila', motivo='estação não confirmou o envio' WHERE direcao='saida' AND status='enviando' AND criado_em < datetime('now','localtime','-5 minutes') AND enviado_em IS NULL AND (motivo IS NULL OR motivo <> 'estação não confirmou o envio')`);
  const cmds = json(getConfig('estacao_cmd'), []); if (cmds.length) setConfig('estacao_cmd', '[]');
  res.json({ tarefas, canceladas, saidas, comandos: cmds, agentes: agentesParaEstacao(), ia_em: iaBruta().em || null, ligado: B.geral().ligado });
});
// Chegou mensagem no WhatsApp Web do PC do agente.
est.post('/wa-entrada', async (req, res) => {
  const b = req.body || {};
  const linha = String(b.linha || ''); const tel = B.normTel(b.telefone); const texto = txt(b.texto, 4000);
  if (!B.POR_SLUG[linha] || !/^\d{10,15}$/.test(tel) || !texto) falha(400, 'Mensagem inválida.');
  const E = require('../agentes/escritorio');
  if (linha === 'captador') {
    // TH-IA-GO: resposta de proprietário (liga à pessoa do Fisguei pelo número)
    const c = all(`SELECT pessoa_id, valor FROM fisguei_contatos WHERE valor LIKE ?`, '%' + tel.slice(-8)).find((x) => B.mesmoTel(x.valor, tel));
    B.registraEntrada({ agente: 'captador', linha: 'captador', telefone: tel, nome: b.nome || null, texto, wa_id: b.wa_id ? 'web:' + b.wa_id : null, pessoa_id: c ? c.pessoa_id : null });
  } else await E.entrada({ linha, telefone: tel, nome: txt(b.nome, 80) || null, texto, wa_id: b.wa_id ? 'web:' + b.wa_id : null });
  res.json({ ok: true });
});
est.post('/wa-saida/:id', (req, res) => {
  const m = one(`SELECT * FROM agente_mensagens WHERE id=? AND direcao='saida'`, +req.params.id) || falha(404, 'Mensagem não encontrada.');
  const E = require('../agentes/escritorio'); const b = req.body || {};
  if (b.ok) E.registraEnviada(m, b.wa_id ? 'web:' + String(b.wa_id).slice(0, 120) : null);
  else E.marcaSaida(m, /sem WhatsApp|não existe/i.test(b.erro || '') ? 'erro' : 'fila', String(b.erro || 'falhou').slice(0, 200));
  res.json({ ok: true });
});
// Ciclo do cérebro do escritório puxado pela estação (as imobiliárias sem agendador próprio respondem por aqui).
est.post('/ciclo', async (req, res) => {
  if (!IA.naNuvem()) return res.json({ sem_cerebro: true });
  res.json(await require('../agentes/escritorio').cicloCerebro({ prazo: 40e3 }));
});
// Andamento de uma tarefa: passo a passo, evento no escritório e o resultado (vai pelo WhatsApp de quem pediu).
est.post('/tarefa/:id', (req, res) => {
  const t = one('SELECT * FROM agente_tarefas WHERE id=?', +req.params.id) || falha(404, 'Tarefa não encontrada.');
  const b = req.body || {};
  if (t.status === 'cancelada') return res.json({ cancelada: true });
  if (b.passo) {
    const passos = json(t.passos, []);
    passos.push({ n: +b.passo.n || passos.length + 1, acao: String(b.passo.acao || '').slice(0, 40), detalhe: String(b.passo.detalhe || '').slice(0, 300), pensamento: String(b.passo.pensamento || '').slice(0, 400), url: String(b.passo.url || '').slice(0, 300), em: agora() });
    run(`UPDATE agente_tarefas SET passos=?, n_passos=?, atualizado_em=datetime('now','localtime') WHERE id=?`, JSON.stringify(passos.slice(-80)), passos.length, t.id);
  }
  if (b.evento) B.evento(t.agente, 'tarefa', String(b.evento).slice(0, 200));
  if (b.concluir) {
    const r = String(b.concluir.resultado || '').trim().slice(0, 3500) || 'Tarefa concluída.';
    run(`UPDATE agente_tarefas SET status='feita', resultado=?, concluido_em=datetime('now','localtime'), atualizado_em=datetime('now','localtime') WHERE id=?`, r, t.id);
    B.evento(t.agente, 'feito', `Terminou a tarefa: ${t.pedido.slice(0, 70)}`);
    if (t.para_telefone) B.enfileiraSaida({ agente: t.agente, telefone: t.para_telefone, nome: t.para_nome, aprovar: false,
      texto: `✅ *Tarefa concluída* — ${B.ajustes(t.agente).nome}\n\n_Pedido:_ ${t.pedido.slice(0, 300)}\n\n${r}` });
  }
  if (b.erro) {
    run(`UPDATE agente_tarefas SET status='erro', erro=?, concluido_em=datetime('now','localtime'), atualizado_em=datetime('now','localtime') WHERE id=?`, String(b.erro).slice(0, 500), t.id);
    B.evento(t.agente, 'alerta', `Não conseguiu terminar a tarefa: ${String(b.erro).slice(0, 120)}`);
    if (t.para_telefone) B.enfileiraSaida({ agente: t.agente, telefone: t.para_telefone, nome: t.para_nome, aprovar: false,
      texto: `⚠️ ${B.ajustes(t.agente).nome} não conseguiu terminar a tarefa "${t.pedido.slice(0, 160)}".\nMotivo: ${String(b.erro).slice(0, 300)}` });
  }
  res.json({ ok: true });
});

module.exports = { api, est, iaAjustes, iaParaEstacao, passe, online, PROVEDORES };
