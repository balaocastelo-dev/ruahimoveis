// Integração compartilhada pelo HTTP e pelo cérebro; nenhum telefone de cliente sai na API.
const { one, all, run } = require('./db');
const B = require('./agentes/base');
const endereco = (telefone) => String(telefone || '').match(/^chat-([1-9]\d*)-([a-z-]+)$/);
const telefone = (id, slug) => `chat-${id}-${slug}`;
const iniciais = (nome) => String(nome).trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
function contato(usuario_id, agente, nome) {
  return agente ? { agente, usuario_id: null, nome: B.ajustes(agente).nome, foto: `/plataforma/agentes/${agente}.jpg` }
    : { usuario_id, agente: null, nome, foto: null, iniciais: iniciais(nome) };
}
function participantes(id) {
  return all(`SELECT p.usuario_id,p.agente,p.lido_ate,p.silenciado,u.nome FROM chat_participantes p
    LEFT JOIN usuarios u ON u.id=p.usuario_id WHERE p.conversa_id=? ORDER BY p.id`, id)
    .map((p) => ({ ...contato(p.usuario_id, p.agente, p.nome), lido_ate: p.lido_ate, silenciado: p.silenciado }));
}
function total(uid) {
  return one(`SELECT count(*) n FROM chat_mensagens m JOIN chat_participantes p ON p.conversa_id=m.conversa_id
    WHERE p.usuario_id=? AND m.id>p.lido_ate AND (m.de_usuario IS NULL OR m.de_usuario!=?)`, uid, uid).n;
}
function mensagens(sql, ...params) {
  return all(sql, ...params).map((m) => ({ ...m, remetente: contato(m.de_usuario, m.de_agente, m.nome || 'Sistema'), nome: undefined }));
}
const SELECT_MSG = `SELECT m.id,m.conversa_id,m.de_usuario,m.de_agente,m.tipo,m.texto,m.arquivo_id,m.criado_em,u.nome
  FROM chat_mensagens m LEFT JOIN usuarios u ON u.id=m.de_usuario`;
function usuarioEntrada(entrada) {
  const e = endereco(entrada.telefone);
  const id = /^chat-m-(\d+)-[a-z-]+$/.exec(entrada.wa_id || '');
  if (!e || !id || e[2] !== entrada.agente) return null;
  return one(`SELECT u.id,u.nome,u.perfil FROM usuarios u JOIN chat_mensagens m ON m.de_usuario=u.id
    JOIN chat_participantes p ON p.usuario_id=u.id AND p.conversa_id=m.conversa_id
    WHERE u.ativo=1 AND m.id=? AND m.conversa_id=?`, +id[1], +e[1]);
}
function criaTarefa(agente, tel, pedido, usuario) {
  pedido = String(pedido || '').trim().slice(0, 3000);
  if (!usuario || pedido.length < 8) return null;
  const id = Number(run(`INSERT INTO agente_tarefas(agente,pedido,para_telefone,para_nome,criado_por)
    VALUES(?,?,?,?,?)`, agente, pedido, tel, usuario.nome, usuario.id).lastInsertRowid);
  B.evento(agente, 'tarefa', `Recebeu uma tarefa de ${usuario.nome.split(' ')[0]}: ${pedido.slice(0, 90)}`);
  return id;
}
function espelha(uid) {
  // A referência UNIQUE torna o espelhamento idempotente mesmo com várias abas/instâncias.
  const lista = all(`SELECT a.id,a.agente,a.telefone,a.texto FROM agente_mensagens a
    JOIN chat_participantes rob ON rob.agente=a.agente AND a.telefone=('chat-' || rob.conversa_id || '-' || rob.agente)
    WHERE a.direcao='saida' AND a.status IN ('enviada','aprovada') AND a.telefone LIKE 'chat-%'
    ${uid ? 'AND EXISTS (SELECT 1 FROM chat_participantes eu WHERE eu.conversa_id=rob.conversa_id AND eu.usuario_id=?)' : ''}
    AND NOT EXISTS (SELECT 1 FROM chat_mensagens m WHERE m.agente_mensagem_id=a.id)
    ORDER BY a.id LIMIT 200`, ...(uid ? [uid] : []));
  for (const a of lista) {
    const e = endereco(a.telefone);
    if (!e || e[2] !== a.agente || !B.POR_SLUG[a.agente]) continue;
    run(`INSERT INTO chat_mensagens(conversa_id,de_agente,texto,agente_mensagem_id)
      SELECT p.conversa_id,p.agente,?,? FROM chat_participantes p WHERE p.conversa_id=? AND p.agente=?
      ${uid ? 'AND EXISTS (SELECT 1 FROM chat_participantes eu WHERE eu.conversa_id=p.conversa_id AND eu.usuario_id=?)' : ''}
      ON CONFLICT(agente_mensagem_id) DO NOTHING`, a.texto, a.id, +e[1], a.agente, ...(uid ? [uid] : []));
  }
}
function digitando(id) {
  return all(`SELECT DISTINCT p.agente FROM chat_participantes p JOIN agente_mensagens a ON a.agente=p.agente
    WHERE p.conversa_id=? AND a.telefone=('chat-' || p.conversa_id || '-' || p.agente)
    AND a.direcao='entrada' AND a.processada=0`, id).map((p) => p.agente);
}
module.exports = { endereco, telefone, contato, participantes, total, mensagens, SELECT_MSG, usuarioEntrada, criaTarefa, espelha, digitando };
