// Fisguei: base de anúncios e proprietários vinda do Fisgar e a fila do robô TH-IA-GO CORRETOR.
// Aqui fica tudo que não depende do WhatsApp: gravar o que chega da extensão, montar a fila,
// escolher o próximo número, entender a resposta e transformar o dono confirmado em oportunidade do Radar.
const { one, all, run, getConfig, setConfig } = require('../db');
const cfg = require('../config');

const ROBO = 'TH-IA-GO CORRETOR';
const LIMITE_MAX = 200;       // teto de mensagens novas por dia, por segurança do número
const INTERVALO_MIN_S = 60;   // nunca menos de 1 minuto entre duas abordagens novas

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const normTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };
const telValido = (t) => /^55\d{10,11}$/.test(t);
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
const ref = (id) => 'FG-' + String(id).padStart(5, '0');

// ---------- configuração do robô ----------
const MODELO_PADRAO = `Olá, {nome}! Tudo bem? Aqui é o TH-IA-GO, assistente virtual da ${cfg.EMPRESA}, de Campinas.\n\n`
  + `Vimos que o imóvel da {endereco} ({bairro}) está à venda e temos interesse em divulgá-lo no portal da ${cfg.CLIENTE_NOME} para vendê-lo, recebendo apenas a comissão quando a venda acontecer.\n\n`
  + 'Você é o(a) proprietário(a) desse imóvel? Pode responder SIM ou NÃO.\n'
  + 'Se preferir não receber mensagens, responda PARAR.';
// anúncio só de aluguel (28/10/2026)
const MODELO_LOCACAO_PADRAO = `Olá, {nome}! Tudo bem? Aqui é o TH-IA-GO, assistente virtual da ${cfg.EMPRESA}, de Campinas.\n\n`
  + `Vimos que o imóvel da {endereco} ({bairro}) está para alugar e temos interesse em divulgá-lo no portal da ${cfg.CLIENTE_NOME} e trazer inquilinos, recebendo apenas quando a locação for fechada.\n\n`
  + 'Você é o(a) proprietário(a) desse imóvel? Pode responder SIM ou NÃO.\n'
  + 'Se preferir não receber mensagens, responda PARAR.';

// ler: de onde vêm as configurações (padrão: uma consulta por chave; o resumo passa todas lidas de uma vez)
function ajustes(ler = getConfig) {
  const getConfig = ler;
  const n = (k, d) => { const v = parseInt(getConfig(k), 10); return Number.isFinite(v) ? v : d; };
  return {
    pausado: getConfig('fisguei_pausado') === '1',
    limite_dia: Math.min(Math.max(n('fisguei_limite_dia', 80), 1), LIMITE_MAX),
    intervalo_s: Math.max(n('fisguei_intervalo_s', 90), INTERVALO_MIN_S),
    hora_inicio: Math.min(Math.max(n('fisguei_hora_inicio', 9), 7), 20),
    hora_fim: Math.min(Math.max(n('fisguei_hora_fim', 19), 8), 21),
    sabado: getConfig('fisguei_sabado') !== '0',
    modelo: getConfig('fisguei_modelo') || MODELO_PADRAO,
    modelo_locacao: getConfig('fisguei_modelo_locacao') || MODELO_LOCACAO_PADRAO,
    limite_max: LIMITE_MAX, intervalo_min_s: INTERVALO_MIN_S,
  };
}
function salvaAjustes(b) {
  const int = (v) => (v === '' || v === undefined || v === null ? undefined : parseInt(v, 10));
  if (b.pausado !== undefined) setConfig('fisguei_pausado', b.pausado ? '1' : '0');
  const lim = int(b.limite_dia); if (lim !== undefined) setConfig('fisguei_limite_dia', Math.min(Math.max(lim, 1), LIMITE_MAX));
  const iv = int(b.intervalo_s); if (iv !== undefined) setConfig('fisguei_intervalo_s', Math.max(iv, INTERVALO_MIN_S));
  const hi = int(b.hora_inicio); if (hi !== undefined) setConfig('fisguei_hora_inicio', Math.min(Math.max(hi, 7), 20));
  const hf = int(b.hora_fim); if (hf !== undefined) setConfig('fisguei_hora_fim', Math.min(Math.max(hf, 8), 21));
  if (b.sabado !== undefined) setConfig('fisguei_sabado', b.sabado ? '1' : '0');
  if (b.modelo !== undefined) {
    const m = String(b.modelo || '').trim().slice(0, 1200);
    if (m && !/parar/i.test(m)) { const e = new Error('A mensagem precisa dizer como parar de receber (ex.: "responda PARAR").'); e.status = 400; throw e; }
    setConfig('fisguei_modelo', m || null);
  }
  return ajustes();
}

// Horário de Brasília, sem depender do fuso do computador.
function agoraSP(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hora: parseInt(p.hour, 10) % 24, minuto: parseInt(p.minute, 10) };
}
function dentroDoHorario(a = ajustes(), d = new Date()) {
  const t = agoraSP(d);
  if (t.dia === 0) return false;
  if (t.dia === 6 && !a.sabado) return false;
  return t.hora >= a.hora_inicio && t.hora < a.hora_fim;
}
const enviadasHoje = () => one(`SELECT count(*) AS n FROM fisguei_contatos WHERE envio IN ('enviado','respondeu') AND substr(enviado_em,1,10)=date('now','localtime')`).n;

// ---------- gravar o que chega do Fisgar ----------
const TIPOS_PRIORIDADE = (relacao) => (/propriet/i.test(relacao || '') ? 0 : /conjuge|cônjuge|morador|residente/i.test(relacao || '') ? 1 : 2);

// Data mais antiga entre as que temos (AAAA-MM-DD)
const maisAntiga = (...ds) => ds.filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort()[0] || null;
function salvaAnuncio(a) {
  if (!a || !a.fisgar_id) return null;
  const campos = ['portal', 'link', 'titulo', 'tipo', 'negocio', 'finalidade', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'lat', 'lon',
    'valor', 'valor_condominio', 'iptu', 'quartos', 'suites', 'banheiros', 'vagas', 'area_util', 'area_total', 'anunciante_nome', 'anunciante_tipo', 'publicado_em', 'fotos', 'aluguel'];
  const v = campos.map((k) => (a[k] === undefined || a[k] === '' ? null : k === 'fotos' && Array.isArray(a[k]) ? JSON.stringify(a[k].slice(0, 30)) : a[k]));
  const ja = one('SELECT id, valor, criado_em, anunciado_desde FROM fisguei_anuncios WHERE fisgar_id=?', String(a.fisgar_id));
  let id;
  if (ja) {
    // atualiza só o que veio preenchido (uma tela do Fisgar traz mais dados que outra)
    const sets = [], ps = [];
    campos.forEach((k, i) => { if (v[i] !== null) { sets.push(`${k}=?`); ps.push(v[i]); } });
    if (sets.length) run(`UPDATE fisguei_anuncios SET ${sets.join(', ')}, atualizado_em=datetime('now','localtime') WHERE id=?`, ...ps, ja.id);
    id = ja.id;
    // mudou o preço: guarda no histórico (o primeiro valor conhecido entra com a data em que o anúncio chegou)
    if (a.valor && ja.valor && Math.abs(a.valor - ja.valor) / ja.valor > 0.004) {
      if (!one('SELECT 1 AS x FROM fisguei_precos WHERE anuncio_id=? LIMIT 1', id)) run('INSERT INTO fisguei_precos(anuncio_id,valor,em,fonte) VALUES(?,?,?,?)', id, ja.valor, ja.criado_em, 'base');
      run(`INSERT INTO fisguei_precos(anuncio_id,valor,fonte) VALUES(?,?,'visto')`, id, a.valor);
    }
  } else {
    id = run(`INSERT INTO fisguei_anuncios(fisgar_id,${campos.join(',')}) VALUES(?${',?'.repeat(campos.length)})`, String(a.fisgar_id), ...v).lastInsertRowid;
    if (a.valor) run(`INSERT INTO fisguei_precos(anuncio_id,valor,fonte) VALUES(?,?,'visto')`, id, a.valor);
  }
  // preços antigos que o próprio anúncio informa (quando o portal guarda o histórico)
  for (const h of Array.isArray(a.historico) ? a.historico.slice(0, 30) : []) {
    if (!h || !h.valor || !h.em) continue;
    if (!one('SELECT 1 AS x FROM fisguei_precos WHERE anuncio_id=? AND valor=? AND substr(em,1,10)=?', id, h.valor, h.em.slice(0, 10)))
      run(`INSERT INTO fisguei_precos(anuncio_id,valor,em,fonte) VALUES(?,?,?,'fisgar')`, id, h.valor, h.em.slice(0, 10) + ' 12:00:00');
  }
  const desde = maisAntiga(ja && ja.anunciado_desde, a.desde, a.publicado_em);
  if (desde && desde !== (ja && ja.anunciado_desde)) run('UPDATE fisguei_anuncios SET anunciado_desde=? WHERE id=?', desde, id);
  return id;
}

function salvaPessoa(anuncioId, p) {
  if (!anuncioId || !p || !p.nome) return null;
  const chave = p.fisgar_pessoa_id ? 'id:' + p.fisgar_pessoa_id : 'nome:' + norm(p.nome) + '|' + norm(p.unidade);
  let pes = one('SELECT * FROM fisguei_pessoas WHERE anuncio_id=? AND chave=?', anuncioId, chave);
  if (!pes) {
    const r = run('INSERT INTO fisguei_pessoas(anuncio_id,chave,fisgar_pessoa_id,nome,relacao,unidade,idade) VALUES(?,?,?,?,?,?,?)',
      anuncioId, chave, p.fisgar_pessoa_id ? String(p.fisgar_pessoa_id) : null, String(p.nome).slice(0, 150), p.relacao || null, p.unidade || null, p.idade || null);
    pes = one('SELECT * FROM fisguei_pessoas WHERE id=?', r.lastInsertRowid);
  } else {
    run('UPDATE fisguei_pessoas SET relacao=coalesce(?,relacao), unidade=coalesce(?,unidade), idade=coalesce(?,idade) WHERE id=?', p.relacao || null, p.unidade || null, p.idade || null, pes.id);
  }
  let novos = 0;
  // telefone pode vir como texto ou como { numero, movel }; fixo fica guardado, mas o robô só chama celular
  const tels = new Map();
  for (const t of p.telefones || []) {
    const o = typeof t === 'object' && t ? t : { numero: t };
    const n = normTel(o.numero);
    if (!telValido(n)) continue;
    const movel = o.movel !== undefined ? !!o.movel : n.length === 13;
    if (!tels.has(n) || movel) tels.set(n, movel && n.length === 13);
  }
  const emails = [...new Set((p.emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  if (tels.size || emails.length) {
    run(`UPDATE fisguei_pessoas SET consultado=1, consultado_em=coalesce(consultado_em, datetime('now','localtime')) WHERE id=?`, pes.id);
    for (const [t, movel] of tels) {
      const bloq = movel ? bloqueado(t) : null;
      const r = run(`INSERT INTO fisguei_contatos(pessoa_id,tipo,valor,envio,erro) VALUES(?,?,?,?,?) ON CONFLICT(pessoa_id,tipo,valor) DO NOTHING`,
        pes.id, movel ? 'tel' : 'fixo', t, !movel ? 'fixo' : bloq ? 'pulado' : 'fila', bloq);
      if (movel) novos += r.changes || 0;
    }
    for (const e of emails) run(`INSERT INTO fisguei_contatos(pessoa_id,tipo,valor,envio) VALUES(?,?,?,'email') ON CONFLICT(pessoa_id,tipo,valor) DO NOTHING`, pes.id, 'email', e);
    const an = one('SELECT status FROM fisguei_anuncios WHERE id=?', anuncioId);
    if (an && an.status === 'novo') run(`UPDATE fisguei_anuncios SET status='abordando', atualizado_em=datetime('now','localtime') WHERE id=?`, anuncioId);
  }
  return { id: pes.id, novos };
}

// ---------- não contatar ----------
function bloqueado(tel) {
  const t = normTel(tel);
  const b = one('SELECT motivo FROM fisguei_bloqueios WHERE telefone=?', t);
  if (b) return 'Na lista não contatar: ' + (b.motivo || 'pediu para parar');
  if (one('SELECT 1 FROM leads WHERE telefone=? AND nao_contatar=1', t)) return 'Na lista não contatar do CRM';
  if (one("SELECT 1 FROM proprietarios WHERE nao_contatar=1 AND replace(replace(replace(replace(telefone,' ',''),'-',''),'(',''),')','') LIKE ?", '%' + t.slice(-9))) return 'Proprietário marcado como não contatar';
  // lista comum da plataforma (LGPD): quem pediu para parar em qualquer imobiliária não recebe de nenhuma
  if (!require('../lgpd').podeContatar(t)) return 'Pediu para não ser contatado (lista comum da plataforma)';
  return null;
}
function bloqueia(tel, motivo) {
  const t = normTel(tel);
  run('INSERT INTO fisguei_bloqueios(telefone,motivo) VALUES(?,?) ON CONFLICT(telefone) DO UPDATE SET motivo=excluded.motivo', t, motivo);
  run(`UPDATE fisguei_contatos SET envio='pulado', erro=? WHERE tipo='tel' AND valor=? AND envio='fila'`, 'Na lista não contatar: ' + motivo, t);
  if (/parar/i.test(motivo)) require('../lgpd').naoContatar(t, motivo); // PARAR vale para toda a plataforma
}

// ---------- fila ----------
function endereco(a) {
  const rua = [a.logradouro, a.numero].filter(Boolean).join(', ');
  return rua || a.bairro || 'seu imóvel';
}
function montaTexto(modelo, pessoa, anuncio) {
  const nome = primeiroNome(pessoa.nome) || 'tudo bem';
  return String(modelo)
    .replace(/\{nome\}/g, nome)
    .replace(/\{endereco\}/g, endereco(anuncio) + (pessoa.unidade ? ' – ' + pessoa.unidade : ''))
    .replace(/\{bairro\}/g, [anuncio.bairro, anuncio.cidade].filter(Boolean).join(', ') || 'Campinas')
    .replace(/\{valor\}/g, anuncio.valor ? 'R$ ' + Number(anuncio.valor).toLocaleString('pt-BR') : anuncio.aluguel ? 'R$ ' + Number(anuncio.aluguel).toLocaleString('pt-BR') + ' por mês' : '')
    .replace(/\{tipo\}/g, (anuncio.tipo || 'imóvel').toLowerCase())
    .replace(/\{privacidade\}/g, linkPrivacidade());
}
// LGPD (art. 9º e 10, §2º): toda primeira mensagem diz de onde veio o contato e onde ler os direitos.
// Modelo antigo ou editado sem o link ganha a linha no fim.
function linkPrivacidade() { return String(cfg.PUBLIC_URL || cfg.LINK_ONLINE || '').replace(/\/+$/, '') + '/privacidade'; }
const LINHA_ORIGEM = 'Seu contato veio de dados de anúncio do imóvel e de base de dados imobiliária contratada pela imobiliária. Como tratamos os dados e os seus direitos: {privacidade}';
function comTransparencia(texto) {
  if (/\/privacidade\b/.test(texto)) return texto;
  return texto + '\n\n' + LINHA_ORIGEM.replace('{privacidade}', linkPrivacidade());
}

// Próximo número a abordar: endereços mais antigos primeiro; dentro do endereço, quem o Fisgar marca como proprietário primeiro.
function proximo() {
  for (let i = 0; i < 25; i++) {
    const c = one(`SELECT c.id, c.valor, c.pessoa_id, p.nome, p.relacao, p.unidade, a.id AS anuncio_id
      FROM fisguei_contatos c JOIN fisguei_pessoas p ON p.id=c.pessoa_id JOIN fisguei_anuncios a ON a.id=p.anuncio_id
      WHERE c.tipo='tel' AND c.envio='fila' AND a.pausado=0 AND a.status IN ('novo','abordando','respondeu') AND p.status IN ('pendente','abordando')
      ORDER BY a.id, CASE WHEN p.relacao LIKE '%ropriet%' THEN 0 ELSE 1 END, p.id, c.id LIMIT 1`);
    if (!c) return null;
    const bloq = bloqueado(c.valor);
    if (bloq) { run(`UPDATE fisguei_contatos SET envio='pulado', erro=? WHERE id=?`, bloq, c.id); continue; }
    // o mesmo número aparece em vários endereços: uma abordagem a cada 30 dias, no máximo
    const recente = one(`SELECT 1 FROM fisguei_mensagens WHERE telefone=? AND direcao='saida' AND criado_em > datetime('now','localtime','-30 day')`, c.valor);
    if (recente) { run(`UPDATE fisguei_contatos SET envio='pulado', erro='Número já abordado nos últimos 30 dias' WHERE id=?`, c.id); continue; }
    const anuncio = one('SELECT * FROM fisguei_anuncios WHERE id=?', c.anuncio_id);
    const aj = ajustes();
    return { contato: c, anuncio, texto: comTransparencia(montaTexto(anuncio.negocio === 'Locação' ? aj.modelo_locacao : aj.modelo, c, anuncio)) };
  }
  return null;
}

function marcaEnviado(contatoId, texto, waId) {
  const c = one('SELECT * FROM fisguei_contatos WHERE id=?', contatoId);
  run(`UPDATE fisguei_contatos SET envio='enviado', enviado_em=datetime('now','localtime'), erro=NULL WHERE id=?`, contatoId);
  run(`UPDATE fisguei_pessoas SET status=CASE WHEN status='pendente' THEN 'abordando' ELSE status END WHERE id=?`, c.pessoa_id);
  run('INSERT INTO fisguei_mensagens(pessoa_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', c.pessoa_id, c.valor, 'saida', texto, 'enviada', waId || null, ROBO);
}
function marcaErro(contatoId, erro, envio = 'erro') {
  run('UPDATE fisguei_contatos SET envio=?, erro=? WHERE id=?', envio, String(erro).slice(0, 300), contatoId);
}

// Mensagens que o robô manda fora da fila: respostas automáticas e as que o corretor escreve na tela.
function pendentes() {
  return all(`SELECT * FROM fisguei_mensagens WHERE direcao='saida' AND status='pendente' ORDER BY id LIMIT 5`);
}
function enfileiraResposta(pessoaId, telefone, texto, autor = ROBO) {
  run('INSERT INTO fisguei_mensagens(pessoa_id,telefone,direcao,texto,status,autor) VALUES(?,?,?,?,?,?)', pessoaId, normTel(telefone), 'saida', String(texto).slice(0, 2000), 'pendente', autor);
}
function marcaPendente(msgId, status, waId) { run('UPDATE fisguei_mensagens SET status=?, wa_id=coalesce(?,wa_id) WHERE id=?', status, waId || null, msgId); }

// ---------- respostas ----------
function classifica(texto) {
  const t = norm(texto).replace(/[!.?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'outro';
  if (/^(parar|pare|para|sair|stop|descadastrar|nao me mande|nao quero receber|bloquear)\b/.test(t) || /\b(nao me (mande|envie)|pare de (mandar|enviar)|me tira|remova meu numero)\b/.test(t)) return 'parar';
  if (/\b(nao (tenho|temos) interesse|nao quero vender|sem interesse|nao esta a venda|nao (vou|pretendo) vender|ja (foi )?vendid[oa]|ja vendi|ja tenho (corretor|imobiliaria))\b/.test(t)) return 'sem_interesse';
  if (/^(nao|n|no|negativo)$/.test(t) || /\b(nao sou|nao e meu|nao e minha|engano|numero errado|nao conheco|nao moro|nunca (fui|tive)|nao sei do que)\b/.test(t) || /^nao\b/.test(t)) return 'negou';
  if (/^(sim|s|sou|sou eu|isso|isso mesmo|correto|exato|positivo|e meu|e minha|eh meu|sou sim|sim sou)\b/.test(t) || /\bsou (o |a )?(dono|dona|proprietari[oa])\b/.test(t) || /\b(e|eh) (meu|minha|nosso|nossa)\b/.test(t)) return 'confirmou';
  return 'outro';
}

const RESPOSTAS = {
  confirmou: `Que ótimo, obrigado por confirmar! 😊 Um corretor da ${cfg.CLIENTE_NOME} vai falar com você em breve para explicar como funciona a divulgação no nosso portal. Para adiantar: se tiver fotos suas do imóvel (as originais, tiradas por você), pode me mandar por aqui. E me diga o melhor horário para o corretor ligar.`,
  negou: 'Obrigado por avisar e desculpe o incômodo! Não vamos mais enviar mensagens sobre esse imóvel.',
  sem_interesse: `Entendido, obrigado pelo retorno! Não vamos insistir. Se um dia quiser vender ou alugar, a ${cfg.CLIENTE_NOME} fica à disposição.`,
  parar: `Pronto, você não vai mais receber mensagens da ${cfg.CLIENTE_NOME} neste número. Desculpe o incômodo.`,
};

function criaOportunidade(anuncio, pessoa, telefone) {
  if (anuncio.oportunidade_id) return anuncio.oportunidade_id;
  const obs = `Veio do Fisguei (${ref(anuncio.id)}). ${pessoa.nome} confirmou pelo WhatsApp que é o(a) proprietário(a).`
    + (anuncio.anunciante_nome ? ` Anúncio publicado por: ${anuncio.anunciante_nome}${anuncio.anunciante_tipo === 'imobiliaria' ? ' (imobiliária)' : ''}.` : '');
  const r = run(`INSERT INTO oportunidades(portal,link,titulo,tipo,bairro,logradouro,numero,unidade,cidade,quartos,vagas,area,valor,anunciante_tipo,anunciante_nome,
      status,titular_nome,titular_telefone,titular_origem,observacoes,publicado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    'Fisgar', anuncio.link, anuncio.titulo || [anuncio.tipo, anuncio.bairro].filter(Boolean).join(' · '), anuncio.tipo, anuncio.bairro, anuncio.logradouro, anuncio.numero,
    pessoa.unidade || anuncio.complemento, anuncio.cidade || cfg.CIDADE_PADRAO, anuncio.quartos, anuncio.vagas, anuncio.area_util || anuncio.area_total, anuncio.valor,
    'desconhecido', anuncio.anunciante_nome, 'em_contato', pessoa.nome, telefone, 'Confirmou pelo WhatsApp (robô TH-IA-GO)', obs, anuncio.publicado_em);
  const opId = r.lastInsertRowid;
  run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto) VALUES(?,?,?)', opId, 'anuncio', `Proprietário confirmado pelo robô TH-IA-GO no WhatsApp (${telefone}). Origem: Fisgar.`);
  run('UPDATE fisguei_anuncios SET oportunidade_id=? WHERE id=?', opId, anuncio.id);
  return opId;
}

// Uma mensagem chegou no WhatsApp do robô. Devolve o que foi feito (para o registro).
function recebida({ telefone, texto, wa_id }) {
  const telRecebido = normTel(telefone);
  if (wa_id && one('SELECT 1 FROM fisguei_mensagens WHERE wa_id=?', wa_id)) return { ignorado: 'repetida' };
  // o WhatsApp às vezes devolve o celular sem o 9 da frente: compara DDD + últimos 8 dígitos
  const padrao = telRecebido.length >= 12 ? telRecebido.slice(0, 4) + '%' + telRecebido.slice(-8) : telRecebido;
  const c = one(`SELECT c.*, p.anuncio_id FROM fisguei_contatos c JOIN fisguei_pessoas p ON p.id=c.pessoa_id
    WHERE c.tipo='tel' AND c.valor LIKE ? AND c.envio IN ('enviado','respondeu') ORDER BY c.enviado_em DESC LIMIT 1`, padrao);
  if (!c) return { ignorado: 'número que o robô não abordou' };
  const tel = c.valor;
  const pessoa = one('SELECT * FROM fisguei_pessoas WHERE id=?', c.pessoa_id);
  const anuncio = one('SELECT * FROM fisguei_anuncios WHERE id=?', c.anuncio_id);
  run('INSERT INTO fisguei_mensagens(pessoa_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', pessoa.id, tel, 'entrada', String(texto || '').slice(0, 4000), 'recebida', wa_id || null, pessoa.nome);
  run(`UPDATE fisguei_contatos SET envio='respondeu' WHERE id=?`, c.id);

  const tipo = classifica(texto);
  // Depois da primeira resposta, quem conduz é o corretor: o robô só reage a PARAR.
  const jaRespondeu = !['pendente', 'abordando'].includes(pessoa.status);
  if (tipo === 'parar') {
    bloqueia(tel, 'pediu PARAR');
    run(`UPDATE fisguei_pessoas SET status='parar' WHERE id=?`, pessoa.id);
    run(`UPDATE fisguei_contatos SET envio='pulado', erro='A pessoa pediu PARAR' WHERE pessoa_id=? AND envio='fila'`, pessoa.id);
    enfileiraResposta(pessoa.id, tel, RESPOSTAS.parar);
    return { tipo };
  }
  if (jaRespondeu) { run(`UPDATE fisguei_anuncios SET atualizado_em=datetime('now','localtime') WHERE id=?`, anuncio.id); return { tipo: 'conversa', pessoa_id: pessoa.id, anuncio_id: anuncio.id, telefone: tel }; }

  if (tipo === 'confirmou') {
    run(`UPDATE fisguei_pessoas SET status='confirmou' WHERE id=?`, pessoa.id);
    run(`UPDATE fisguei_anuncios SET status='confirmado', atualizado_em=datetime('now','localtime') WHERE id=?`, anuncio.id);
    pulaRestoDoEndereco(anuncio.id, 'O dono já confirmou');
    const opId = criaOportunidade(anuncio, pessoa, tel);
    donoNaCarteira(anuncio.id);
    enfileiraResposta(pessoa.id, tel, RESPOSTAS.confirmou);
    return { tipo, oportunidade_id: opId, pessoa_id: pessoa.id, anuncio_id: anuncio.id, telefone: tel };
  }
  if (tipo === 'sem_interesse') {
    run(`UPDATE fisguei_pessoas SET status='sem_interesse' WHERE id=?`, pessoa.id);
    run(`UPDATE fisguei_anuncios SET status='sem_interesse', atualizado_em=datetime('now','localtime') WHERE id=?`, anuncio.id);
    pulaRestoDoEndereco(anuncio.id, 'O dono disse que não tem interesse');
    enfileiraResposta(pessoa.id, tel, RESPOSTAS.sem_interesse);
    return { tipo };
  }
  if (tipo === 'negou') {
    run(`UPDATE fisguei_pessoas SET status='negou' WHERE id=?`, pessoa.id);
    run(`UPDATE fisguei_contatos SET envio='pulado', erro='A pessoa disse que não é a dona' WHERE pessoa_id=? AND envio='fila'`, pessoa.id);
    enfileiraResposta(pessoa.id, tel, RESPOSTAS.negou);
    fechaSeAcabou(anuncio.id);
    return { tipo };
  }
  // resposta que o robô não entendeu: vai para o corretor
  run(`UPDATE fisguei_pessoas SET status='respondeu' WHERE id=?`, pessoa.id);
  run(`UPDATE fisguei_anuncios SET status=CASE WHEN status IN ('novo','abordando') THEN 'respondeu' ELSE status END, atualizado_em=datetime('now','localtime') WHERE id=?`, anuncio.id);
  return { tipo, pessoa_id: pessoa.id, anuncio_id: anuncio.id, telefone: tel };
}

function pulaRestoDoEndereco(anuncioId, motivo) {
  run(`UPDATE fisguei_contatos SET envio='pulado', erro=? WHERE envio='fila' AND pessoa_id IN (SELECT id FROM fisguei_pessoas WHERE anuncio_id=?)`, motivo, anuncioId);
}
// Todos negaram ou ninguém tem mais número na fila: o endereço sai da abordagem.
function fechaSeAcabou(anuncioId) {
  const fila = one(`SELECT count(*) AS n FROM fisguei_contatos c JOIN fisguei_pessoas p ON p.id=c.pessoa_id WHERE p.anuncio_id=? AND c.envio IN ('fila','enviado')`, anuncioId).n;
  const conversa = one(`SELECT count(*) AS n FROM fisguei_pessoas WHERE anuncio_id=? AND status IN ('respondeu','confirmou')`, anuncioId).n;
  if (!fila && !conversa) run(`UPDATE fisguei_anuncios SET status='sem_dono', atualizado_em=datetime('now','localtime') WHERE id=? AND status IN ('abordando','respondeu')`, anuncioId);
}

// Dono confirmou: o imóvel entra (ou continua) na carteira com ele como proprietário.
function donoNaCarteira(anuncioId) {
  try {
    const P = require('./pedidos');
    const a = one('SELECT imovel_id FROM fisguei_anuncios WHERE id=?', anuncioId);
    if (a && a.imovel_id) return P.sincronizaDono(anuncioId);
    return P.importa(anuncioId, null, require('../routes/imoveis').ajudantes.proximoCodigo);
  } catch (e) { console.error('[fisguei] dono na carteira', e.message); return null; }
}

module.exports = {
  donoNaCarteira,
  ROBO, LIMITE_MAX, INTERVALO_MIN_S, MODELO_PADRAO, MODELO_LOCACAO_PADRAO, RESPOSTAS, ref, norm, normTel, primeiroNome, TIPOS_PRIORIDADE,
  ajustes, salvaAjustes, dentroDoHorario, agoraSP, enviadasHoje,
  salvaAnuncio, salvaPessoa, bloqueado, bloqueia, montaTexto,
  proximo, marcaEnviado, marcaErro, pendentes, enfileiraResposta, marcaPendente,
  classifica, recebida, criaOportunidade, pulaRestoDoEndereco, fechaSeAcabou,
};
