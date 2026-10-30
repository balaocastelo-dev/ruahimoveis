// Chaves de API: entrada de robôs e IAs no sistema, sem sessão e sem navegador.
// A chave sempre pertence a um usuário do sistema (nunca cria permissão nova):
// o perfil é o do usuário e os escopos só diminuem o que ele já podia fazer.
const crypto = require('crypto');
const { one, all, run } = require('../db');
const { falha, txt } = require('../util');

const PREFIXO = 'hh';                 // toda chave começa com hh_<prefixo>_<segredo>
const ESCOPOS = [
  'imoveis',      // carteira, arquivos, autorizações, links off-market
  'crm',          // leads, visitas, WhatsApp do CRM, chat interno
  'captacao',     // radar, fisguei, mercado, vitrines da base
  'condominios',  // base de condomínios, prédios e 3D
  'conteudo',     // blog, portal, bairros, redes e publicações
  'escritorio',   // agentes robôs, PCs virtuais, estação
  'painel',       // painéis, números, auditoria
  'config',       // usuários, integrações, LGPD, chaves de API, configurações
  'plataforma',   // painel do gestor (só para quem é gestor da plataforma)
  'sql',          // consulta de leitura ao banco (/api/ia/consulta)
];

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---- qual escopo cada caminho usa ----
const MAPA = [
  [/^\/api\/ia\/(consulta|esquema)/, 'sql'],
  [/^\/api\/ia\//, 'painel'],
  [/^\/api\/imoveis/, 'imoveis'],
  [/^\/api\/(arquivos|drive)/, 'imoveis'],
  [/^\/api\/(leads|visitas|whats|chat)/, 'crm'],
  [/^\/api\/(radar|fisguei|captacao|mercado|fachada|pedidos|creditos|mapas)/, 'captacao'],
  [/^\/api\/condominios/, 'condominios'],
  [/^\/api\/(blog|portal|bairros|social|links)/, 'conteudo'],
  [/^\/api\/(escritorio|estacao)/, 'escritorio'],
  [/^\/api\/(painel|auditoria|me)/, 'painel'],
  [/^\/api\/(usuarios|integracoes|setup|lgpd|chaves|config)/, 'config'],
  [/^\/gestor-api\//, 'plataforma'],
];
function escopoDe(caminho) {
  for (const [re, esc] of MAPA) if (re.test(caminho)) return esc;
  return 'painel';
}

// ---- criar, listar, revogar ----
function criar({ nome, usuarioId, escopos, somente_leitura, limite_min, ips, dias, criadaPor }) {
  const u = one('SELECT id,perfil,ativo FROM usuarios WHERE id=?', usuarioId);
  if (!u || !u.ativo) falha(400, 'Escolha um usuário ativo para a chave.');
  const lista = normalizaEscopos(escopos);
  const prefixo = crypto.randomBytes(4).toString('hex');
  const segredo = crypto.randomBytes(24).toString('base64url');
  const chave = `${PREFIXO}_${prefixo}_${segredo}`;
  const expira = dias ? new Date(Date.now() + Number(dias) * 86400e3).toISOString().slice(0, 19).replace('T', ' ') : null;
  const r = run(`INSERT INTO api_chaves(nome,prefixo,chave_hash,usuario_id,escopos,somente_leitura,limite_min,ips,expira_em,criada_por)
                 VALUES(?,?,?,?,?,?,?,?,?,?)`,
    txt(nome, 80) || 'Chave de IA', prefixo, sha256(chave), u.id, lista.join(','),
    somente_leitura ? 1 : 0, Math.max(10, Math.min(3000, Number(limite_min) || 300)),
    txt((Array.isArray(ips) ? ips.join(',') : ips), 300), expira, criadaPor || null);
  return { id: Number(r.lastInsertRowid), chave, prefixo, escopos: lista };
}

function normalizaEscopos(e) {
  if (!e || e === '*' || (Array.isArray(e) && (e.includes('*') || !e.length))) return ['*'];
  const lista = (Array.isArray(e) ? e : String(e).split(',')).map((s) => String(s).trim()).filter((s) => ESCOPOS.includes(s));
  if (!lista.length) falha(400, `Escopos válidos: ${ESCOPOS.join(', ')} (ou "*" para todos).`);
  return [...new Set(lista)];
}

const lista = () => all(`SELECT c.id,c.nome,c.prefixo,c.escopos,c.somente_leitura,c.limite_min,c.ips,c.expira_em,c.ativo,
                                c.usos,c.ultimo_uso,c.ultimo_ip,c.criada_em,c.usuario_id,u.nome AS usuario,u.perfil
                         FROM api_chaves c LEFT JOIN usuarios u ON u.id=c.usuario_id ORDER BY c.id DESC`);

function revogar(id) {
  const c = one('SELECT id FROM api_chaves WHERE id=?', id);
  if (!c) falha(404, 'Chave não encontrada.');
  run('UPDATE api_chaves SET ativo=0 WHERE id=?', id);
  return { ok: true };
}

// ---- conferir a chave que chegou ----
function porChave(chave) {
  const m = String(chave || '').match(/^hh_([0-9a-f]{8})_[A-Za-z0-9_-]{10,}$/);
  if (!m) return null;
  const c = one('SELECT * FROM api_chaves WHERE prefixo=? AND ativo=1', m[1]);
  if (!c) return null;
  const h = sha256(chave);
  if (h.length !== String(c.chave_hash).length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(c.chave_hash)))) return null;
  if (c.expira_em && new Date(String(c.expira_em).replace(' ', 'T')) < new Date()) return null;
  const u = one('SELECT id,nome,email,perfil,telefone FROM usuarios WHERE id=? AND ativo=1', c.usuario_id);
  if (!u) return null;
  return { chave: c, usuario: u };
}

// ---- limite por minuto (na memória do processo) ----
const janelas = new Map();
function dentroDoLimite(id, limite) {
  const agora = Date.now(), min = Math.floor(agora / 60000);
  const j = janelas.get(id);
  if (!j || j.min !== min) { janelas.set(id, { min, n: 1 }); return true; }
  j.n += 1;
  if (janelas.size > 5000) for (const [k, v] of janelas) if (v.min < min) janelas.delete(k);
  return j.n <= limite;
}

function registraUso(chaveId, { metodo, caminho, status, ms, ip, acao, erro }) {
  try {
    run('UPDATE api_chaves SET usos=usos+1, ultimo_uso=?, ultimo_ip=? WHERE id=?',
      new Date().toISOString().slice(0, 19).replace('T', ' '), String(ip || '').slice(0, 60), chaveId);
    run('INSERT INTO api_log(chave_id,metodo,caminho,status,ms,ip,acao,erro) VALUES(?,?,?,?,?,?,?,?)',
      chaveId, metodo, String(caminho).slice(0, 300), status, ms, String(ip || '').slice(0, 60),
      acao ? String(acao).slice(0, 80) : null, erro ? String(erro).slice(0, 300) : null);
  } catch { /* o registro nunca pode derrubar a chamada */ }
}
const log = (n = 100, chaveId = null) => all(
  `SELECT l.*, c.nome AS chave FROM api_log l LEFT JOIN api_chaves c ON c.id=l.chave_id
   ${chaveId ? 'WHERE l.chave_id=?' : ''} ORDER BY l.id DESC LIMIT ?`, ...(chaveId ? [chaveId, n] : [n]));

module.exports = { ESCOPOS, escopoDe, criar, lista, revogar, porChave, dentroDoLimite, registraUso, log, sha256, normalizaEscopos };
