// Rotinas dos gerentes (rodam no PC a cada minuto):
// Augusto (gerente) → dono: resumo da manhã, relatório do fim do dia, alertas na hora.
// Marta (gerente dos corretores) → cada corretor: agenda da manhã, lembrete antes da visita, lead novo, afazer vencendo.
const { one, all, run } = require('../db');
const cfg = require('../config');
const B = require('./base');
const X = require('./contexto');
const { avisaCorretor, avisaDono, urlBase } = require('./cerebro');

const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const hm = (s) => s.slice(11, 16);
const nomeAg = (s) => (B.POR_SLUG[s] ? B.ajustes(s).nome : s);
const passou = (agora, hora) => hora && agora.hora >= hora && agora.hora < somaHoras(hora, 3);
function somaHoras(h, n) { const [a, b] = h.split(':').map(Number); return `${String(Math.min(23, a + n)).padStart(2, '0')}:${String(b).padStart(2, '0')}`; }
const diaUtil = (agora) => new Date(agora.data + 'T12:00:00Z').getUTCDay() !== 0;
const horarioEquipe = (agora) => agora.hora >= '07:00' && agora.hora < '21:00';

function relatorioDoDia() {
  const d = X.numerosDoDia();
  const g = B.geral();
  const nLeads = d.leads.reduce((s, x) => s + x.n, 0);
  const L = [`📊 *Relatório do dia · ${cfg.CLIENTE_NOME}* (${dm(X.agoraSP().texto)})`, ''];
  const decidir = [];
  if (d.aprovar) decidir.push(`${d.aprovar} resposta(s) dos robôs esperando aprovação`);
  if (d.semResposta) decidir.push(`${d.semResposta} cliente(s) sem resposta há mais de 2 h`);
  const parados = d.linhas.filter((l) => l.ativo && ['desconectado', 'erro', 'qr'].includes(l.estado));
  if (parados.length) decidir.push(`WhatsApp caiu: ${parados.map((l) => l.nome).join(', ')} (leia o QR code de novo)`);
  if (decidir.length) { L.push('*Precisa de você*'); decidir.forEach((x) => L.push(`• ${x}`)); L.push(''); }
  L.push('*Comercial*');
  L.push(`• Leads novos: ${nLeads}${d.leads.length ? ' (' + d.leads.slice(0, 4).map((x) => `${x.origem} ${x.n}`).join(', ') + ')' : ''}`);
  L.push(`• Visitas hoje: ${d.visitasHoje.length} · amanhã: ${d.visitasAmanha} · marcadas hoje: ${d.visitasMarcadas}`);
  L.push(`• Em proposta: ${d.propostas}`);
  L.push('', '*Captação*');
  L.push(`• TH-IA-GO abordou ${d.fg.abordados} dono(s), ${d.fg.respostas} responderam, ${d.fg.confirmados} confirmaram`);
  L.push(`• Fotos originais recebidas: ${d.fotos} · oportunidades novas: ${d.opNovas} · captados: ${d.captados.length}`);
  if (d.porAgente.length) { L.push('', '*Escritório virtual*'); d.porAgente.forEach((x) => L.push(`• ${nomeAg(x.agente)}: ${x.pessoas} conversa(s), ${x.enviadas} mensagem(ns) enviadas`)); }
  if (d.chamados.length) { L.push('', '*Chamaram um corretor*'); d.chamados.slice(0, 5).forEach((c) => L.push(`• ${nomeAg(c.agente)}: ${c.texto}`)); }
  L.push('', `Painel completo: ${urlBase()}/#/painel`);
  if (g.dono_nome) L.unshift(`Boa noite, ${g.dono_nome.split(' ')[0]}!`);
  return L.join('\n');
}
function resumoDaManha() {
  const d = X.numerosDoDia();
  const g = B.geral();
  const L = [`☀️ Bom dia${g.dono_nome ? ', ' + g.dono_nome.split(' ')[0] : ''}! Agenda da ${cfg.CLIENTE_NOME} para hoje:`];
  L.push(d.visitasHoje.length ? d.visitasHoje.map((v) => `• ${hm(v.data_hora)} ${v.codigo} · ${v.cliente} · ${v.corretor || 'sem corretor'} (${v.status})`).join('\n') : '• Nenhuma visita marcada para hoje.');
  const pend = [];
  if (d.aprovar) pend.push(`${d.aprovar} resposta(s) dos robôs para aprovar`);
  if (d.semResposta) pend.push(`${d.semResposta} cliente(s) esperando resposta`);
  if (d.afazeresAbertos) pend.push(`${d.afazeresAbertos} afazer(es) da equipe em aberto`);
  if (pend.length) L.push('', 'Ficou de ontem: ' + pend.join('; ') + '.');
  return L.join('\n');
}
function agendaDaManha(u) {
  const a = X.agendaDoCorretor(u.id);
  const hojeVis = a.visitas.filter((v) => v.data_hora.slice(0, 10) === X.agoraSP().data);
  if (!hojeVis.length && !a.afazeres.length && !a.quentes.length) return null;
  const L = [`Bom dia, ${u.nome.split(' ')[0]}! ☀️ Sua agenda de hoje:`];
  L.push(hojeVis.length ? hojeVis.map((v) => `• ${hm(v.data_hora)} visita ${v.codigo} (${v.bairro || ''}) com ${v.cliente} (${X.fimTel(v.telefone)}) · ${v.status}`).join('\n') : '• Sem visitas hoje.');
  if (a.afazeres.length) { L.push('', 'Afazeres:'); a.afazeres.slice(0, 8).forEach((f) => L.push(`• #${f.id} ${f.texto}${f.quando ? ' (até ' + dm(f.quando) + ' ' + hm(f.quando) + ')' : ''}`)); }
  if (a.quentes.length) { L.push('', 'Leads quentes esperando contato:'); a.quentes.forEach((l) => L.push(`• ${l.nome} (${X.fimTel(l.telefone)})`)); }
  L.push('', 'Responda "feito 12" quando concluir um afazer.');
  return L.join('\n');
}

function rodar() {
  const g = B.geral();
  const agora = X.agoraSP();
  const desde = require('../db').getConfig('escritorio_desde') || agora.texto;

  // ---- Augusto → dono ----
  if (g.dono_telefone && B.ajustes('gerente').ativo) {
    if (diaUtil(agora) && passou(agora, g.hora_manha) && B.evento('gerente', 'manha', 'Mandou o resumo da manhã ao dono', null, `manha:${agora.data}`))
      B.enfileiraSaida({ agente: 'gerente', telefone: g.dono_telefone, texto: resumoDaManha(), nome: g.dono_nome });
    if (passou(agora, g.hora_relatorio) && B.evento('gerente', 'relatorio', 'Mandou o relatório do dia ao dono', null, `relatorio:${agora.data}`))
      B.enfileiraSaida({ agente: 'gerente', telefone: g.dono_telefone, texto: relatorioDoDia(), nome: g.dono_nome });
  }

  // ---- Marta → corretores ----
  if (!B.ajustes('gerente-corretores').ativo || !horarioEquipe(agora)) return;
  const corretores = all("SELECT id,nome,telefone FROM usuarios WHERE ativo=1 AND telefone IS NOT NULL AND telefone!='' AND perfil IN ('corretor','gestor')");
  if (diaUtil(agora) && passou(agora, g.hora_agenda)) {
    for (const u of corretores) {
      const chave = `agenda:${u.id}:${agora.data}`;
      if (B.jaFeito(chave)) continue;
      const t = agendaDaManha(u);
      B.evento('gerente-corretores', 'agenda', t ? `Mandou a agenda do dia para ${u.nome}` : `${u.nome} sem agenda hoje`, `u${u.id}`, chave);
      if (t) B.enfileiraSaida({ agente: 'gerente-corretores', telefone: u.telefone, texto: t, nome: u.nome });
    }
  }
  // lembrete antes da visita
  if (g.lembrete_visita_min) {
    const ate = new Date(Date.now() + g.lembrete_visita_min * 60e3);
    const lim = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ate).replace('T', ' ');
    for (const v of all(`SELECT v.id,v.data_hora,v.status,v.corretor_id,i.codigo,i.bairro,l.nome cliente,l.telefone FROM visitas v JOIN imoveis i ON i.id=v.imovel_id JOIN leads l ON l.id=v.lead_id
      WHERE v.status IN ('agendada','confirmada') AND v.data_hora > ? AND v.data_hora <= ?`, agora.texto, lim)) {
      avisaCorretor(v.corretor_id, `⏰ Visita às ${hm(v.data_hora)}: ${v.codigo} (${v.bairro || ''}) com ${v.cliente} (${X.fimTel(v.telefone)})${v.status === 'agendada' ? '\nAinda não está confirmada: confirme com o cliente.' : ''}`, `lembrete:visita:${v.id}`);
    }
  }
  // lead novo atribuído ao corretor
  for (const l of all(`SELECT id,nome,telefone,origem,busca,corretor_id,agente FROM leads WHERE corretor_id IS NOT NULL AND criado_em >= ? AND criado_em > datetime('now','localtime','-6 hour')`, desde)) {
    const conversa = l.agente ? `\nQuem atende no WhatsApp: ${nomeAg(l.agente)} (robô).` : '';
    avisaCorretor(l.corretor_id, `🆕 Lead novo para você: ${l.nome} (${X.fimTel(l.telefone)})\nOrigem: ${l.origem || '—'}${l.busca ? `\nProcura: ${l.busca}` : ''}${conversa}\nFicha: ${urlBase()}/#/leads/${l.id}`, `aviso:lead:${l.id}`);
  }
  // proprietário confirmou com o TH-IA-GO
  for (const o of all(`SELECT id,titulo,bairro,valor,titular_nome,corretor_id FROM oportunidades WHERE portal='Fisgar' AND criado_em >= ? AND criado_em > datetime('now','localtime','-6 hour')`, desde)) {
    const quem = o.corretor_id || (one("SELECT id FROM usuarios WHERE ativo=1 AND perfil IN ('gestor','adm') AND telefone IS NOT NULL AND telefone!='' ORDER BY perfil='gestor' DESC, id LIMIT 1") || {}).id;
    avisaCorretor(quem, `🏠 Proprietário confirmou com o TH-IA-GO: ${o.titular_nome || 'dono'}\n${o.titulo || ''}${o.valor ? ' · ' + X.brl(o.valor) : ''}\nVer no Radar: ${urlBase()}/#/radar/${o.id}`, `aviso:op:${o.id}`);
    avisaDono(`🏠 Proprietário confirmou com o TH-IA-GO: ${o.titulo || ''}${o.valor ? ' · ' + X.brl(o.valor) : ''}.`, `dono:op:${o.id}`);
  }
  // afazer com hora chegando
  for (const f of all(`SELECT id,corretor_id,texto,quando FROM agente_afazeres WHERE feito=0 AND lembrado_em IS NULL AND quando IS NOT NULL AND quando <= ?`, somaMin(agora.texto, 30))) {
    run(`UPDATE agente_afazeres SET lembrado_em=datetime('now','localtime') WHERE id=?`, f.id);
    avisaCorretor(f.corretor_id, `📌 Lembrete (#${f.id}): ${f.texto}${f.quando ? ` · até ${hm(f.quando)}` : ''}\nResponda "feito ${f.id}" quando concluir.`, `lembrete:afazer:${f.id}`);
  }
}
function somaMin(texto, n) {
  const d = new Date(texto.replace(' ', 'T') + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + n);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

module.exports = { rodar, relatorioDoDia, resumoDaManha, agendaDaManha };
