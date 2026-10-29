// Escritório virtual: banco, ajustes, almas, roteamento e fila de mensagens dos agentes.
// Tudo aqui funciona no PC e no link online (o banco é o mesmo); quem conversa no WhatsApp é o PC.
const { one, all, run, getConfig, setConfig } = require('../db');
const C = require('./catalogo');

const normTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };
// O WhatsApp às vezes devolve o celular sem o 9: compara DDD + últimos 8 dígitos.
const mesmoTel = (a, b) => { const x = normTel(a), y = normTel(b); if (!x || !y) return false; return x === y || (x.slice(-8) === y.slice(-8) && x.slice(2, 4) === y.slice(2, 4)); };
const padraoTel = (t) => { const d = normTel(t); return d.length >= 12 ? d.slice(0, 4) + '%' + d.slice(-8) : d; };
const ehTeste = (t) => String(t || '').startsWith('teste-');
const ehChat = (t) => /^chat-[1-9]\d*-[a-z-]+$/.test(String(t || ''));
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

// ---------- ajustes ----------
const GERAL_PADRAO = {
  ligado: true, dono_nome: '', dono_telefone: '',
  limite_casas: 2000000, limite_alto_apto: 3000000,
  hora_manha: '08:00', hora_relatorio: '19:00', hora_agenda: '08:00', lembrete_visita_min: 60,
  puxar_conversa: true, alertas_dono: true,
};
function geral() { return { ...GERAL_PADRAO, ...json(getConfig('escritorio'), {}) }; }
function salvaGeral(b = {}) {
  const g = geral();
  const hora = (v, d) => (v === '' ? '' : /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : d);
  const n = { ...g,
    ligado: b.ligado === undefined ? g.ligado : !!b.ligado,
    dono_nome: b.dono_nome === undefined ? g.dono_nome : String(b.dono_nome).slice(0, 80).trim(),
    dono_telefone: b.dono_telefone === undefined ? g.dono_telefone : normTel(b.dono_telefone),
    limite_casas: Math.max(200000, Number(b.limite_casas) || g.limite_casas),
    limite_alto_apto: Math.max(200000, Number(b.limite_alto_apto) || g.limite_alto_apto),
    hora_manha: hora(b.hora_manha, g.hora_manha), hora_relatorio: hora(b.hora_relatorio, g.hora_relatorio), hora_agenda: hora(b.hora_agenda, g.hora_agenda),
    lembrete_visita_min: Math.min(240, Math.max(0, parseInt(b.lembrete_visita_min ?? g.lembrete_visita_min, 10) || 0)),
    puxar_conversa: b.puxar_conversa === undefined ? g.puxar_conversa : !!b.puxar_conversa,
    alertas_dono: b.alertas_dono === undefined ? g.alertas_dono : !!b.alertas_dono };
  if (n.dono_telefone && !/^55\d{10,11}$/.test(n.dono_telefone)) { const e = new Error('Confira o celular do dono, com DDD.'); e.status = 400; throw e; }
  setConfig('escritorio', JSON.stringify(n));
  return n;
}

function ajustes(slug) {
  const a = C.POR_SLUG[slug];
  const s = json(getConfig('agente:' + slug), {});
  return {
    ativo: s.ativo === undefined ? true : !!s.ativo,
    modo: ['sugerir', 'automatico'].includes(s.modo) ? s.modo : a.tipo === 'interno' ? 'automatico' : 'sugerir',
    // 'sistema' (padrão) = o número único do sistema, um QR só para todos; 'propria' = número só dele;
    // ou o slug de outro agente. Decisão do Thiago (29/10, noite): ninguém pede QR novo.
    linha: s.linha && (s.linha === 'propria' || s.linha === 'sistema' || C.POR_SLUG[s.linha]) ? s.linha : 'sistema',
    nome: s.nome || a.nome,
    alma: typeof s.alma === 'string' && s.alma.trim() ? s.alma : null,
    alma_em: s.alma_em || null, alma_por: s.alma_por || null,
    // canal do WhatsApp: 'qr' = aparelho conectado no PC (Baileys); 'web' = WhatsApp Web aberto no PC virtual do agente
    canal: s.canal === 'web' ? 'web' : 'qr',
    // no WhatsApp Web: 'nao_salvos' = só conversa com quem não está salvo na agenda do número; 'todos' = todo mundo
    wa_filtro: s.wa_filtro === 'todos' ? 'todos' : 'nao_salvos',
  };
}
function salvaAjustes(slug, b = {}, usuario) {
  if (!C.POR_SLUG[slug]) { const e = new Error('Agente não encontrado.'); e.status = 404; throw e; }
  const atual = json(getConfig('agente:' + slug), {});
  const n = { ...atual };
  if (b.ativo !== undefined) n.ativo = !!b.ativo;
  if (b.modo !== undefined) n.modo = b.modo === 'automatico' ? 'automatico' : 'sugerir';
  if (b.linha !== undefined) {
    if (!['propria', 'sistema'].includes(b.linha) && (!C.POR_SLUG[b.linha] || b.linha === slug)) { const e = new Error('Linha inválida.'); e.status = 400; throw e; }
    if (slug === 'captador' && !['propria', 'sistema'].includes(b.linha)) { const e = new Error('O TH-IA-GO usa sempre a linha do robô do Fisguei.'); e.status = 400; throw e; }
    if (b.linha === 'captador') { const e = new Error('A linha do TH-IA-GO é só da captação (abordagem de proprietários). Escolha outra.'); e.status = 400; throw e; }
    n.linha = b.linha;
  }
  if (b.nome !== undefined) n.nome = String(b.nome).slice(0, 40).trim() || undefined;
  if (b.canal !== undefined) n.canal = b.canal === 'web' ? 'web' : 'qr';
  if (b.wa_filtro !== undefined) n.wa_filtro = b.wa_filtro === 'todos' ? 'todos' : 'nao_salvos';
  if (b.alma !== undefined) {
    const t = String(b.alma || '').replace(/\r\n/g, '\n');
    if (t.length > 20000) { const e = new Error('A alma ficou grande demais (limite 20 mil caracteres).'); e.status = 400; throw e; }
    n.alma = t.trim() ? t : undefined; n.alma_em = new Date().toISOString(); n.alma_por = usuario ? usuario.nome : null;
  }
  setConfig('agente:' + slug, JSON.stringify(n));
  return ajustes(slug);
}
const alma = (slug) => ajustes(slug).alma || C.almaPadrao(slug);

// ---------- linha do sistema: UM número de WhatsApp para todos os agentes ----------
// Pedido do Thiago (29/10/2026, noite): "todos devem usar o mesmo QR do sistema sem depender de um novo".
// Qual agente carrega essa sessão fica em config.linha_sistema (padrão: o gerente geral). O TH-IA-GO é a
// exceção de sempre: ele usa o número do robô do Fisguei, que é só para abordar proprietários.
const LINHA_SISTEMA_PADRAO = 'gerente';
function linhaSistema() {
  const s = getConfig('linha_sistema');
  return s && C.POR_SLUG[s] && s !== 'captador' ? s : LINHA_SISTEMA_PADRAO;
}
// Linha (número de WhatsApp) que o agente usa: a do sistema, a própria ou a de outro agente.
// Resolve em cadeia (quem aponta para alguém que usa o número do sistema também cai no do sistema).
function linhaDe(slug, prof = 0) {
  if (slug === 'captador') return slug;
  const a = ajustes(slug);
  // WhatsApp Web roda no PC virtual do próprio agente: nesse canal a linha é sempre a dele
  if (a.canal === 'web') return slug;
  if (a.linha === 'propria' || prof > 3) return slug;
  const alvo = a.linha === 'sistema' ? linhaSistema() : a.linha;
  if (!C.POR_SLUG[alvo] || alvo === slug || alvo === 'captador') return slug;
  return linhaDe(alvo, prof + 1);
}
/** Linhas (sessões de WhatsApp) que o sistema realmente precisa abrir no PC. */
function linhasEmUso() {
  const l = new Set();
  for (const a of C.AGENTES) {
    if (a.slug === 'captador') continue;          // o robô do Fisguei cuida dessa
    const aj = ajustes(a.slug);
    if (!aj.ativo || aj.canal === 'web') continue; // desligado, ou atende pelo WhatsApp Web do PC virtual
    l.add(linhaDe(a.slug));
  }
  return l;
}

// ---------- estado das linhas (gravado pelo PC, lido pela tela) ----------
function estadoLinha(slug) {
  let st;
  if (ajustes(slug).canal === 'web') {
    // WhatsApp Web no PC virtual do agente (estação na RTX): a estação conta como está a cada batida
    st = json(getConfig('estacao_wa:' + slug), {});
    const vivo = st.em && Date.now() - new Date(st.em).getTime() < 90e3;
    return { ...st, canal: 'web', vivo: !!vivo, estado: vivo ? st.estado || 'parada' : 'desligado', qr: vivo && st.estado === 'qr' ? st.qr : null };
  }
  if (slug === 'captador') st = json(getConfig('fisguei_robo'), {});
  else st = json(getConfig('agente_wa:' + slug), {});
  const vivo = st.em && Date.now() - new Date(st.em).getTime() < 3 * 60e3;
  return { ...st, vivo: !!vivo, estado: vivo ? st.estado || 'parada' : 'desligado', qr: vivo && st.estado === 'qr' ? st.qr : null };
}
function comando(slug, c) {
  if (!['conectar', 'desconectar', 'reiniciar'].includes(c)) { const e = new Error('Comando inválido.'); e.status = 400; throw e; }
  if (slug === 'captador') setConfig('fisguei_robo_cmd', c === 'conectar' ? 'reiniciar' : c);
  else setConfig('agente_cmd:' + slug, c);
}

// ---------- setor: quem cuida de cada imóvel e de cada cliente ----------
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function categoria(tipo) {
  const t = norm(tipo);
  if (/terreno|lote|\barea\b/.test(t)) return 'terreno';
  if (/galp|barrac|sala|loja|ponto|predio|hotel|comercial|conjunto|deposito|industria/.test(t)) return 'comercial';
  if (/apart|cobertura|flat|studio|kitnet|loft|duplex|garden/.test(t)) return 'apartamento';
  if (/casa|sobrado|chacara|sitio|fazenda|residencia/.test(t)) return 'casa';
  return null;
}
function setorDoImovel(im, g = geral()) {
  if (!im) return null;
  if (im.status === 'off_market') return 'offmarket';
  const c = categoria(im.tipo);
  if (c === 'terreno') return 'terrenos';
  if (c === 'comercial') return 'comerciais';
  if (c === 'apartamento') return (im.valor || 0) >= g.limite_alto_apto ? 'alto-padrao' : 'apartamentos';
  if (c === 'casa') return (im.valor || 0) > g.limite_casas ? 'alto-padrao' : 'casas';
  return null;
}
function setorDaBusca(lead, g = geral()) {
  if (!lead) return null;
  const c = categoria(lead.tipo_desejado) || categoria(lead.busca);
  const v = lead.valor_max || 0;
  if (c === 'terreno') return 'terrenos';
  if (c === 'comercial') return 'comerciais';
  if (c === 'apartamento') return v >= g.limite_alto_apto ? 'alto-padrao' : 'apartamentos';
  if (c === 'casa') return v > g.limite_casas ? 'alto-padrao' : 'casas';
  return null;
}
// Imóvel citado no lead (o portal grava "Veio pelo portal: AP0029").
function imovelDoLead(lead) {
  const m = String(lead && lead.busca || '').match(/\b([A-Z]{2,3}-?\d{3,5})\b/);
  if (m) { const im = one('SELECT * FROM imoveis WHERE codigo=?', m[1]); if (im) return im; }
  const it = one(`SELECT texto FROM interacoes WHERE lead_id=? AND tipo='portal' ORDER BY id DESC`, lead.id);
  const m2 = it && it.texto.match(/im[oó]vel\s+([A-Z]{2,3}-?\d{3,5})/i);
  return m2 ? one('SELECT * FROM imoveis WHERE codigo=?', m2[1].toUpperCase()) : null;
}
const setorDoLead = (lead, g = geral()) => setorDoImovel(imovelDoLead(lead), g) || setorDaBusca(lead, g);

// ---------- quem atende quem escreveu numa linha ----------
function corretorPorTelefone(t) {
  return all("SELECT id,nome,telefone,perfil FROM usuarios WHERE ativo=1 AND telefone IS NOT NULL AND telefone!=''").find((u) => mesmoTel(u.telefone, t)) || null;
}
function quemAtende(linha, telefone) {
  const g = geral();
  if (g.dono_telefone && mesmoTel(g.dono_telefone, telefone)) return { agente: 'gerente', quem: 'dono' };
  const u = corretorPorTelefone(telefone);
  if (u) return { agente: 'gerente-corretores', quem: 'corretor', usuario: u };
  const lead = one('SELECT * FROM leads WHERE telefone LIKE ? ORDER BY id DESC', padraoTel(telefone));
  if (lead && lead.agente && C.POR_SLUG[lead.agente] && linhaDe(lead.agente) === linha) return { agente: lead.agente, quem: 'cliente', lead };
  // linha compartilhada: quem é "dono" da linha e é de cliente atende; senão, o primeiro agente de cliente que usa essa linha
  const usam = C.AGENTES.filter((a) => linhaDe(a.slug) === linha && ajustes(a.slug).ativo).map((a) => a.slug);
  const cliente = usam.find((s) => C.POR_SLUG[s].tipo === 'cliente');
  return { agente: C.POR_SLUG[linha].tipo === 'cliente' ? linha : cliente || linha, quem: 'cliente', lead };
}

// ---------- CRM: lead do cliente que falou com um agente ----------
function proximoCorretor() {
  const r = one(`SELECT u.id FROM usuarios u LEFT JOIN leads l ON l.corretor_id=u.id AND l.etapa IN ('novo','qualificado')
                 WHERE u.perfil='corretor' AND u.ativo=1 GROUP BY u.id ORDER BY count(l.id), u.id LIMIT 1`);
  return r ? r.id : null;
}
function leadDoCliente(telefone, nome, agente) {
  const t = normTel(telefone);
  let lead = one('SELECT * FROM leads WHERE telefone LIKE ? ORDER BY id DESC', padraoTel(t));
  if (!lead) {
    const r = run(`INSERT INTO leads(nome,telefone,origem,etapa,temperatura,corretor_id,agente,ultimo_contato) VALUES(?,?,?,?,?,?,?,datetime('now','localtime'))`,
      nome || `WhatsApp ${t.slice(-4)}`, t, `WhatsApp · ${C.POR_SLUG[agente].nome}`, 'novo', 'morno', proximoCorretor(), agente);
    lead = one('SELECT * FROM leads WHERE id=?', r.lastInsertRowid);
    run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', `Lead criado pela primeira mensagem no WhatsApp de ${C.POR_SLUG[agente].nome} (${C.POR_SLUG[agente].cargo}).`);
  } else if (!lead.agente) {
    run('UPDATE leads SET agente=? WHERE id=?', agente, lead.id); lead.agente = agente;
  }
  return lead;
}

// ---------- mensagens ----------
function evento(agente, tipo, texto, ref = null, chave = null) {
  if (chave && one('SELECT 1 FROM agente_eventos WHERE chave=?', chave)) return false;
  run('INSERT INTO agente_eventos(agente,tipo,texto,ref,chave) VALUES(?,?,?,?,?)', agente, tipo, String(texto || '').slice(0, 1000), ref, chave);
  return true;
}
const jaFeito = (chave) => !!one('SELECT 1 FROM agente_eventos WHERE chave=?', chave);

function registraEntrada({ agente, linha, telefone, nome, texto, wa_id, lead_id = null, pessoa_id = null, direcao = 'entrada' }) {
  if (wa_id && one('SELECT 1 FROM agente_mensagens WHERE wa_id=?', wa_id)) return null;
  const r = run(`INSERT INTO agente_mensagens(agente,linha,telefone,nome,direcao,texto,status,lead_id,pessoa_id,wa_id,autor,processada) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)`,
    agente, linha || linhaDe(agente), ehTeste(telefone) || ehChat(telefone) ? telefone : normTel(telefone), nome || null, direcao, String(texto || '').slice(0, 4000), direcao === 'nota' ? 'nota' : 'recebida',
    lead_id, pessoa_id, wa_id || null, direcao === 'nota' ? 'sistema' : nome || 'Cliente');
  return Number(r.lastInsertRowid);
}

// Coloca uma mensagem para sair pela linha do agente. Modo "sugerir": espera aprovação na tela.
function enfileiraSaida({ agente, telefone, texto, lead_id = null, pessoa_id = null, autor = null, aprovar = null, nome = null }) {
  const a = ajustes(agente);
  const teste = ehTeste(telefone);
  const status = ehChat(telefone) ? 'enviada' : teste ? 'teste' : (aprovar === true || (aprovar === null && a.modo !== 'automatico')) ? 'aprovar' : 'fila';
  const r = run(`INSERT INTO agente_mensagens(agente,linha,telefone,nome,direcao,texto,status,lead_id,pessoa_id,autor,processada) VALUES(?,?,?,?,?,?,?,?,?,?,1)`,
    agente, ehChat(telefone) ? 'chat' : linhaDe(agente), teste || ehChat(telefone) ? telefone : normTel(telefone), nome, 'saida', String(texto).slice(0, 4000), status, lead_id, pessoa_id, autor || `${a.nome} (robô)`);
  const id = Number(r.lastInsertRowid);
  // a sugestão aparece também na conversa do CRM (WhatsApp > Conversas), para aprovar por lá
  if (status === 'aprovar' && lead_id) {
    run(`DELETE FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, lead_id);
    run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,autor) VALUES(?,?,?,?,?,?)', lead_id, normTel(telefone), 'sugestao', String(texto).slice(0, 4000), 'aguardando aprovação', `${a.nome} (robô)`);
  }
  return { id, status };
}

module.exports = {
  ...C, normTel, mesmoTel, padraoTel, ehTeste, ehChat, json, geral, salvaGeral, ajustes, salvaAjustes, alma, linhaDe, linhaSistema, linhasEmUso, estadoLinha, comando,
  categoria, setorDoImovel, setorDaBusca, setorDoLead, imovelDoLead, quemAtende, corretorPorTelefone, leadDoCliente, proximoCorretor,
  evento, jaFeito, registraEntrada, enfileiraSaida,
};
