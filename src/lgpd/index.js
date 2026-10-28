// LGPD (28/10/2026): quem é quem, pedidos dos titulares e a lista "não contatar" comum a toda a plataforma.
//
// Papéis (escritos nos Termos e na Política, src/lgpd/textos.js):
//  - Cada imobiliária cliente é CONTROLADORA dos dados que ela trata: clientes, proprietários, conversas, consultas
//    que ela pede a fornecedores (ex.: Fisgar, que se declara operadora e põe o assinante como controlador).
//  - A Herrera HOUSE IA é OPERADORA desses dados (guarda e processa por conta da imobiliária) e CONTROLADORA só
//    dos dados das próprias contas (usuários, cobrança) e da base comum de anúncios, prédios e bairros.
//
// Pedido do titular: feito no portal de uma imobiliária → tabela titular_pedidos dela (ela responde, prazo 15 dias);
// feito em corretordofuturo.app → plataforma.titular_pedidos (painel do gestor).
// Oposição ("não quero ser contatado") ou eliminação com telefone → hash do telefone em plataforma.nao_contatar,
// que vale para TODAS as imobiliárias (a base de anúncios é comum). O robô pergunta lgpd.pode_contatar() antes de enviar.
const crypto = require('crypto');
const cfg = require('../config');

const env = (k, d = '') => String(process.env[k] ?? d).trim();
const VERSAO = '2026-10-28'; // versão dos Termos/Política (mudou o texto de forma relevante → trocar e pedir novo aceite)

// Quem é a plataforma. Razão social e CNPJ entram por variável assim que o Thiago informar.
const PLATAFORMA = {
  get nome() { return cfg.SISTEMA_NOME; },
  get razao() { return env('PLATAFORMA_RAZAO_SOCIAL'); },
  get cnpj() { return env('PLATAFORMA_CNPJ'); },
  get responsavel() { return env('PLATAFORMA_RESPONSAVEL', 'Thiago Herrera'); },
  get cidade() { return env('PLATAFORMA_CIDADE', 'Campinas, SP'); },
  get email() { return env('PLATAFORMA_EMAIL_PRIVACIDADE') || env('PLATAFORMA_EMAIL', 'tiagaskan@gmail.com'); },
  get encarregado() { return env('PLATAFORMA_ENCARREGADO') || this.responsavel; },
  site: 'https://corretordofuturo.app',
};

// Quem é a imobiliária desta instalação (controladora do portal dela).
const CLIENTE = {
  get nome() { return cfg.CLIENTE_NOME; },
  get empresa() { return cfg.EMPRESA; },
  get cnpj() { return env('CLIENTE_CNPJ'); },
  get creci() { return env('CLIENTE_CRECI') || env('BLOG_CRECI'); },
  get cidade() { return env('CLIENTE_CIDADE') || `${cfg.CIDADE_PADRAO}, ${cfg.UF_PADRAO}`; },
  get email() { return env('CLIENTE_EMAIL_PRIVACIDADE') || env('CLIENTE_EMAIL'); },
  get encarregado() { return env('CLIENTE_ENCARREGADO'); },
  get demonstracao() { return env('PORTAL_DEMONSTRACAO') === '1'; },
};

const TIPOS = {
  oposicao: 'Não quero mais ser contatado(a)',
  confirmar: 'Saber se vocês têm dados meus',
  acessar: 'Ver quais dados vocês têm sobre mim',
  corrigir: 'Corrigir dados errados ou desatualizados',
  eliminar: 'Apagar os meus dados',
  compartilhamento: 'Saber com quem os meus dados foram compartilhados',
  portabilidade: 'Receber os meus dados para levar a outro fornecedor',
  outro: 'Outra dúvida sobre os meus dados',
};

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
function normTel(t) { let d = soDigitos(t); if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
// Mesmo hash em todas as imobiliárias (é o que permite a lista comum sem ninguém ler os telefones dos outros).
const hashTel = (t) => { const n = normTel(t); return n.length >= 12 ? crypto.createHash('sha256').update('lgpd-tel:' + n).digest('hex') : null; };
function protocolo() {
  const d = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  return `LGPD-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
const corta = (s, n) => { const v = String(s ?? '').trim(); return v ? v.slice(0, n) : null; };

/** Confere e limpa o que veio do formulário. Lança erro com status 400 para o visitante ler. */
function valida(b = {}) {
  const tipo = String(b.tipo || '');
  const erro = (m) => { const e = new Error(m); e.status = 400; throw e; };
  if (!TIPOS[tipo]) erro('Escolha o que você quer pedir.');
  const nome = corta(b.nome, 120); if (!nome) erro('Informe o seu nome.');
  const email = corta(b.email, 160);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erro('O e-mail não parece certo.');
  const tel = soDigitos(b.telefone).slice(0, 15);
  if (tel && (tel.length < 10 || tel.length > 13)) erro('O telefone precisa ter DDD e número.');
  if (!email && !tel) erro('Informe um e-mail ou telefone para receber a resposta.');
  if (['oposicao', 'eliminar'].includes(tipo) && !tel) erro('Para parar os contatos, informe o telefone que recebeu a mensagem.');
  if (!b.declaro) erro('Confirme que o pedido é sobre os seus próprios dados (ou que você representa o titular).');
  return { tipo, nome, email, telefone: tel ? normTel(tel) : null, telefone_hash: tel ? hashTel(tel) : null, mensagem: corta(b.mensagem, 2000) };
}

// ---------------------------------------------------------------- lado da imobiliária (banco dela)
function db() { return require('../db'); }

/** Pedido feito no portal desta imobiliária. Oposição/eliminação já bloqueiam o telefone aqui e na plataforma. */
function registrar(b, origem = 'portal') {
  const p = valida(b);
  const { run, audit } = db();
  const prot = protocolo();
  const prazo = new Date(Date.now() - 3 * 3600e3 + 15 * 86400e3).toISOString().slice(0, 10);
  run(`INSERT INTO titular_pedidos(protocolo,tipo,nome,email,telefone,telefone_hash,mensagem,origem,prazo) VALUES(?,?,?,?,?,?,?,?,?)`,
    prot, p.tipo, p.nome, p.email, p.telefone, p.telefone_hash, p.mensagem, origem, prazo);
  if (p.telefone && ['oposicao', 'eliminar'].includes(p.tipo)) naoContatar(p.telefone, `pedido do titular ${prot}`);
  try { audit(null, 'lgpd_pedido', `${prot} · ${p.tipo}`); } catch {}
  return { protocolo: prot, prazo, tipo: p.tipo };
}

/** Bloqueia o telefone nesta imobiliária e na lista comum da plataforma. */
function naoContatar(tel, motivo, origem = cfg.CLIENTE_NOME) {
  const t = normTel(tel); if (t.length < 12) return;
  const { run, one } = db();
  try {
    run('INSERT INTO fisguei_bloqueios(telefone,motivo) VALUES(?,?) ON CONFLICT(telefone) DO UPDATE SET motivo=excluded.motivo', t, String(motivo).slice(0, 200));
    run(`UPDATE fisguei_contatos SET envio='pulado', erro=? WHERE tipo='tel' AND valor=? AND envio='fila'`, 'Na lista não contatar: ' + motivo, t);
  } catch {}
  try { run('UPDATE leads SET nao_contatar=1 WHERE telefone=?', t); } catch {}
  if (db().PG) { try { one('SELECT lgpd.opor(?,?,?) AS x', hashTel(t), String(motivo).slice(0, 200), String(origem).slice(0, 80)); } catch (e) { console.error('[lgpd] opor:', e.message); } }
  CACHE.delete(hashTel(t));
}

// Pode mandar mensagem de prospecção para este telefone? (lista comum da plataforma; no SQLite só vale a lista local)
const CACHE = new Map();
function podeContatar(tel) {
  if (!db().PG) return true;
  const h = hashTel(tel); if (!h) return true;
  const c = CACHE.get(h); if (c && Date.now() - c.em < 10 * 60e3) return c.ok;
  let ok = true;
  try { const r = db().one('SELECT lgpd.pode_contatar(?) AS ok', h); ok = !r || r.ok !== false; } catch (e) { console.error('[lgpd] pode_contatar:', e.message); }
  if (CACHE.size > 20000) CACHE.clear();
  CACHE.set(h, { ok, em: Date.now() });
  return ok;
}

function lista() {
  const { all } = db();
  return all(`SELECT id,protocolo,tipo,nome,email,telefone,mensagem,origem,situacao,resposta,criado_em,prazo,atendido_em FROM titular_pedidos ORDER BY (situacao='aberto') DESC, id DESC LIMIT 300`);
}
function atender(id, resposta, usuarioId) {
  const { run, one, audit } = db();
  const p = one('SELECT * FROM titular_pedidos WHERE id=?', Number(id));
  if (!p) { const e = new Error('Pedido não encontrado.'); e.status = 404; throw e; }
  run(`UPDATE titular_pedidos SET situacao='atendido', resposta=?, atendido_em=datetime('now','localtime'), atendido_por=? WHERE id=?`, corta(resposta, 4000), usuarioId || null, p.id);
  try { audit(usuarioId, 'lgpd_atendido', p.protocolo); } catch {}
  return { ok: true };
}

// ---------------------------------------------------------------- lado da plataforma (usuário plataforma_app)
async function registrarPlataforma(q, b) {
  const p = valida(b);
  const prot = protocolo();
  const r = (await q(`INSERT INTO titular_pedidos(protocolo,tipo,nome,email,telefone,telefone_hash,mensagem,imobiliaria,origem)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'corretordofuturo.app') RETURNING to_char(prazo AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') prazo`,
  [prot, p.tipo, p.nome, p.email, p.telefone, p.telefone_hash, p.mensagem, corta(b.imobiliaria, 120)]))[0];
  if (p.telefone_hash && ['oposicao', 'eliminar'].includes(p.tipo)) {
    await q(`INSERT INTO nao_contatar(telefone_hash, motivo, origem) VALUES ($1,$2,'corretordofuturo.app') ON CONFLICT DO NOTHING`, [p.telefone_hash, `pedido do titular ${prot}`]);
  }
  return { protocolo: prot, prazo: r && r.prazo, tipo: p.tipo };
}

module.exports = { VERSAO, PLATAFORMA, CLIENTE, TIPOS, hashTel, normTel, valida, registrar, naoContatar, podeContatar, lista, atender, registrarPlataforma };
