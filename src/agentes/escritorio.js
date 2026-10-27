// Escritório virtual (roda no PC): liga as linhas de WhatsApp, recebe mensagens, decide qual agente atende,
// pede a resposta à IA local, aplica as ações no sistema, manda o que está na fila e roda as rotinas dos gerentes.
const cfg = require('../config');
const { one, all, run, getConfig, setConfig } = require('../db');
const B = require('./base');
const X = require('./contexto');
const cerebro = require('./cerebro');
const linhas = require('./linhas');
const rotinas = require('./rotinas');

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '[escritório]', ...a);
let ocupado = false, ultimaRotina = 0, ultimaAtribuicao = 0, iaOk = null;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function status(extra = {}) {
  try { setConfig('escritorio_status', JSON.stringify({ em: new Date().toISOString(), ia: iaOk, modelo: cfg.OLLAMA_MODEL, ...extra })); } catch {}
}

// ---------- chegou mensagem numa linha ----------
const PARAR = /^\s*(parar|pare|sair|stop|descadastrar)\s*[.!]*\s*$/i;
async function entrada({ linha, telefone, nome, texto, wa_id }) {
  const q = B.quemAtende(linha, telefone);
  const ag = B.POR_SLUG[q.agente];
  if (ag.tipo === 'cliente') {
    const lead = B.leadDoCliente(telefone, nome, q.agente);
    if (wa_id && one('SELECT 1 FROM agente_mensagens WHERE wa_id=?', wa_id)) return;
    run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', lead.id, B.normTel(telefone), 'entrada', texto, 'recebida', wa_id || null, nome || lead.nome);
    run(`UPDATE leads SET ultimo_contato=datetime('now','localtime') WHERE id=?`, lead.id);
    const id = B.registraEntrada({ agente: lead.agente && B.linhaDe(lead.agente) === linha ? lead.agente : q.agente, linha, telefone, nome, texto, wa_id, lead_id: lead.id });
    if (PARAR.test(texto)) {
      run('UPDATE leads SET nao_contatar=1 WHERE id=?', lead.id);
      run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', 'Cliente pediu PARAR no WhatsApp: incluído na lista não contatar.');
      run('UPDATE agente_mensagens SET processada=1 WHERE id=?', id);
      B.enfileiraSaida({ agente: q.agente, telefone, texto: 'Pronto, você não vai mais receber mensagens da RUAH neste número. Desculpe o incômodo.', lead_id: lead.id, aprovar: false });
    }
    return;
  }
  B.registraEntrada({ agente: q.agente, linha, telefone, nome: q.usuario ? q.usuario.nome : nome, texto, wa_id });
}

// TH-IA-GO: resposta do proprietário depois da primeira abordagem (o robô do Fisguei avisa aqui).
function captadorEntrada({ telefone, texto, pessoa_id, wa_id }) {
  if (!pessoa_id || !B.ajustes('captador').ativo) return;
  B.registraEntrada({ agente: 'captador', linha: 'captador', telefone, texto, wa_id: wa_id ? 'fg:' + wa_id : null, pessoa_id });
}

// ---------- pensar e responder ----------
async function processaEntradas() {
  // espera 15 s depois da última mensagem da pessoa (muita gente escreve em várias mensagens seguidas)
  const grupos = all(`SELECT agente, telefone, max(id) ultimo, max(criado_em) quando FROM agente_mensagens WHERE processada=0 AND direcao IN ('entrada','nota')
    GROUP BY agente, telefone ORDER BY max(id) LIMIT 6`);
  const corte = new Date(Date.now() - 15e3);
  for (const gr of grupos) {
    const teste = B.ehTeste(gr.telefone);
    const quando = new Date(String(gr.quando).replace(' ', 'T') + '-03:00');
    const ultDir = (one('SELECT direcao FROM agente_mensagens WHERE id=?', gr.ultimo) || {}).direcao;
    if (!teste && ultDir === 'entrada' && quando > corte) continue;
    const fecha = () => run(`UPDATE agente_mensagens SET processada=1 WHERE agente=? AND telefone=? AND processada=0 AND id<=?`, gr.agente, gr.telefone, gr.ultimo);
    const aj = B.ajustes(gr.agente);
    if (!aj.ativo) { fecha(); continue; }
    const ultima = one('SELECT * FROM agente_mensagens WHERE id=?', gr.ultimo);
    const extra = {};
    const ag = B.POR_SLUG[gr.agente];
    if (ag.tipo === 'cliente' && !teste) {
      extra.lead = ultima.lead_id ? one('SELECT * FROM leads WHERE id=?', ultima.lead_id) : one('SELECT * FROM leads WHERE telefone LIKE ? ORDER BY id DESC', B.padraoTel(gr.telefone));
      if (extra.lead && extra.lead.nao_contatar) { fecha(); continue; }
    }
    if (gr.agente === 'gerente') extra.quem = B.mesmoTel(B.geral().dono_telefone, gr.telefone) ? 'dono' : teste ? 'dono' : 'outro';
    if (gr.agente === 'gerente-corretores') extra.usuario = teste ? one("SELECT id,nome FROM usuarios WHERE ativo=1 AND perfil='corretor' ORDER BY id LIMIT 1") : B.corretorPorTelefone(gr.telefone);
    if (gr.agente === 'captador') {
      const pid = ultima.pessoa_id || (one('SELECT pessoa_id FROM agente_mensagens WHERE agente=? AND telefone=? AND pessoa_id IS NOT NULL ORDER BY id DESC', gr.agente, gr.telefone) || {}).pessoa_id;
      extra.pessoa = pid ? one('SELECT * FROM fisguei_pessoas WHERE id=?', pid) : null;
      extra.anuncio = extra.pessoa ? one('SELECT * FROM fisguei_anuncios WHERE id=?', extra.pessoa.anuncio_id) : null;
      if (!extra.pessoa && !teste) { fecha(); continue; }
      if (extra.pessoa && ['parar', 'negou', 'sem_interesse'].includes(extra.pessoa.status)) { fecha(); continue; }
    }

    // atalhos sem IA: "feito 12" do corretor e "relatório" do dono
    const t = String(ultima.texto || '').trim();
    const feito = t.match(/^(feito|ok|pronto|conclu[ií]do)\s*#?\s*(\d{1,6})\b/i);
    if (gr.agente === 'gerente-corretores' && extra.usuario && feito && ultima.direcao === 'entrada') {
      const r = teste ? { changes: 1 } : run(`UPDATE agente_afazeres SET feito=1, feito_em=datetime('now','localtime') WHERE id=? AND corretor_id=? AND feito=0`, +feito[2], extra.usuario.id);
      if (r.changes && !teste) B.evento('gerente-corretores', 'feito', `${extra.usuario.nome} concluiu o afazer #${feito[2]}`, `u${extra.usuario.id}`);
      B.enfileiraSaida({ agente: gr.agente, telefone: gr.telefone, texto: r.changes ? `✅ Anotado: afazer #${feito[2]} concluído. Obrigada!` : `Não achei o afazer #${feito[2]} aberto no seu nome. Confira o número no sistema: ${cerebro.urlBase()}/#/whats/agente/gerente-corretores`, aprovar: false });
      fecha(); continue;
    }
    if (gr.agente === 'gerente' && extra.quem === 'dono' && /^(relat[oó]rio|resumo|como foi o dia|n[uú]meros)\b/i.test(t)) {
      B.enfileiraSaida({ agente: gr.agente, telefone: gr.telefone, texto: rotinas.relatorioDoDia(), aprovar: false });
      fecha(); continue;
    }
    if (gr.agente === 'gerente-corretores' && extra.usuario && /^(agenda|minha agenda|hoje)\b/i.test(t)) {
      B.enfileiraSaida({ agente: gr.agente, telefone: gr.telefone, texto: rotinas.agendaDaManha(extra.usuario) || 'Você não tem visitas, afazeres nem leads quentes pendentes hoje. 👍', aprovar: false });
      fecha(); continue;
    }

    if (!(await cerebro.iaDisponivel())) { iaOk = false; status(); return; } // tenta de novo na próxima volta
    iaOk = true;
    try {
      const r = await cerebro.pensar(gr.agente, gr.telefone, extra);
      const ap = await cerebro.aplicar(gr.agente, gr.telefone, r.acoes, extra);
      const lead = extra.lead || null;
      if (r.mensagem) B.enfileiraSaida({ agente: gr.agente, telefone: gr.telefone, texto: r.mensagem, lead_id: lead && lead.id, pessoa_id: extra.pessoa && extra.pessoa.id, nome: lead ? lead.nome : extra.pessoa ? extra.pessoa.nome : ultima.nome });
      for (const m of ap.mensagensExtras) B.enfileiraSaida({ agente: gr.agente, telefone: gr.telefone, texto: m.texto, lead_id: lead && lead.id, aprovar: m.aprovar ? true : null });
      if (ap.feitas.length) log(`${B.ajustes(gr.agente).nome} · final ${String(gr.telefone).slice(-4)} → ${ap.feitas.join('; ')}`);
      if (!B.ehTeste(gr.telefone)) B.evento(gr.agente, 'respondeu', `${r.mensagem ? 'Respondeu' : 'Leu'} ${lead ? lead.nome : extra.pessoa ? extra.pessoa.nome : extra.usuario ? extra.usuario.nome : 'final ' + String(gr.telefone).slice(-4)}${ap.feitas.length ? ' · ' + ap.feitas.join('; ') : ''}`);
    } catch (e) {
      log('erro ao responder:', e.message);
      B.evento(gr.agente, 'erro', `Não consegui responder (final ${String(gr.telefone).slice(-4)}): ${e.message}`);
    }
    fecha();
  }
}

// ---------- mandar o que está na fila ----------
async function enviaSaidas() {
  const fila = all(`SELECT * FROM agente_mensagens WHERE direcao='saida' AND status='fila' ORDER BY id LIMIT 12`);
  const F = require('../fisguei/base');
  for (const m of fila) {
    const marca = (status, motivo = null, waId = null) => run(`UPDATE agente_mensagens SET status=?, motivo=?, wa_id=coalesce(?,wa_id), enviado_em=CASE WHEN ?='enviada' THEN datetime('now','localtime') ELSE enviado_em END WHERE id=?`, status, motivo, waId, status, m.id);
    if (m.lead_id) { const l = one('SELECT nao_contatar FROM leads WHERE id=?', m.lead_id); if (l && l.nao_contatar && !/não vai mais receber/.test(m.texto)) { marca('descartada', 'cliente pediu PARAR'); continue; } }
    if (F.bloqueado(m.telefone)) { marca('descartada', 'número bloqueado (PARAR)'); continue; }
    const linha = B.linhaDe(m.agente);
    if (linha === 'captador') {
      if (!m.pessoa_id) { marca('erro', 'sem proprietário ligado'); continue; }
      F.enfileiraResposta(m.pessoa_id, m.telefone, m.texto, m.autor || 'TH-IA-GO'); marca('enviada', 'pela linha do robô do Fisguei'); continue;
    }
    if (!linhas.conectada(linha)) { if (m.motivo !== 'linha desconectada') marca('fila', 'linha desconectada'); continue; }
    try {
      const id = await linhas.enviar(linha, m.telefone, m.texto);
      marca('enviada', null, id);
      if (m.lead_id) {
        run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', m.lead_id, m.telefone, 'saida', m.texto, 'enviada', id || null, m.autor || B.ajustes(m.agente).nome);
        run(`DELETE FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, m.lead_id);
        run(`UPDATE leads SET ultimo_contato=datetime('now','localtime') WHERE id=?`, m.lead_id);
      }
    } catch (e) { marca(/sem WhatsApp/.test(e.message) ? 'erro' : 'fila', e.message.slice(0, 200)); }
    await espera(2500 + Math.random() * 3500);
  }
}

// ---------- lead novo (portal, blog, CRM): qual agente cuida e, se for o caso, puxa a conversa ----------
function atribuiLeads() {
  const g = B.geral();
  const desde = getConfig('escritorio_desde');
  for (const l of all(`SELECT * FROM leads WHERE agente IS NULL AND telefone IS NOT NULL AND nao_contatar=0 AND criado_em > datetime('now','localtime','-3 day') ORDER BY id LIMIT 40`)) {
    const s = B.setorDoLead(l, g);
    if (!s || !B.ajustes(s).ativo) continue;
    run('UPDATE leads SET agente=? WHERE id=? AND agente IS NULL', s, l.id);
    B.evento(s, 'atribuido', `Ficou com o lead ${l.nome} (${l.origem || 'sem origem'})`, `l${l.id}`, `atribuido:${l.id}`);
    const doSite = /^(portal|blog)/i.test(l.origem || '');
    if (g.puxar_conversa && doSite && desde && l.criado_em >= desde && !one('SELECT 1 FROM agente_mensagens WHERE telefone=?', l.telefone)) {
      const pedido = one(`SELECT texto FROM interacoes WHERE lead_id=? AND tipo IN ('portal','blog') ORDER BY id DESC`, l.id);
      B.registraEntrada({ agente: s, telefone: l.telefone, nome: l.nome, direcao: 'nota', lead_id: l.id,
        texto: `Este cliente deixou o contato no ${l.origem}${pedido ? ': ' + pedido.texto.replace(/\s+/g, ' ').slice(0, 400) : ''}. Mande a PRIMEIRA mensagem: cumprimente pelo primeiro nome, diga que é da RUAH e que recebeu o pedido dele no site, e faça uma pergunta para entender o que ele procura.` });
    }
  }
}

async function volta() {
  if (ocupado) return;
  ocupado = true;
  try {
    await linhas.comandos();
    if (!B.geral().ligado) return status({ pausado: true });
    if (Date.now() - ultimaAtribuicao > 120e3) { ultimaAtribuicao = Date.now(); atribuiLeads(); }
    await processaEntradas();
    await enviaSaidas();
    if (Date.now() - ultimaRotina > 60e3) { ultimaRotina = Date.now(); rotinas.rodar(); }
    status();
  } catch (e) { log('erro na volta:', e.message); }
  finally { ocupado = false; }
}

function iniciar() {
  if (process.env.VERCEL || cfg.ESCRITORIO === '0') return;
  if (!getConfig('escritorio_desde')) setConfig('escritorio_desde', X.agoraSP().texto + ':00');
  log('iniciando o escritório virtual (9 agentes)');
  linhas.iniciar((m) => entrada(m).catch((e) => log('erro na entrada:', e.message)));
  setInterval(volta, 10e3);
  setTimeout(volta, 3e3);
}

module.exports = { iniciar, entrada, captadorEntrada, processaEntradas, enviaSaidas, atribuiLeads, volta };
