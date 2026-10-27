// O que o sistema mostra a cada agente antes de ele responder: catálogo do setor, ficha do cliente,
// histórico da conversa, números do dia (gerentes) e o formato da resposta (ações que ele pode usar).
const { one, all } = require('../db');
const B = require('./base');

const brl = (v) => (v ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : 'valor sob consulta');
const fimTel = (t) => (t ? 'final ' + String(t).replace(/\D/g, '').slice(-4) : 'sem telefone');
function agoraSP() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, texto: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaSemana = () => DIAS[new Date(agoraSP().data + 'T12:00:00Z').getUTCDay()];

// ---------- catálogo do setor ----------
async function linksPortal() {
  try { const l = await require('../portal/fonte').noAr(); return Object.fromEntries(l.map((x) => [x.imovel.codigo, x.pagina.slug])); } catch { return {}; }
}
function catalogoDoSetor(slug, lead, g = B.geral()) {
  const status = slug === 'offmarket' ? ['off_market'] : ['publicado'];
  const ims = all(`SELECT i.id,i.codigo,i.tipo,i.status,i.bairro,i.quartos,i.suites,i.vagas,i.area_util,i.area_total,i.valor,i.valor_condominio,i.descricao,i.exclusivo,c.nome cond
    FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id WHERE i.status IN (${status.map(() => '?').join(',')}) ORDER BY i.atualizado_em DESC LIMIT 400`, ...status)
    .filter((i) => B.setorDoImovel(i, g) === slug);
  // ordena pelo que combina com o cliente (bairro, quartos, valor)
  const bairros = String(lead && lead.bairros || '').toLowerCase();
  const nota = (i) => (bairros && i.bairro && bairros.includes(String(i.bairro).toLowerCase()) ? 3 : 0)
    + (lead && lead.quartos_min && i.quartos >= lead.quartos_min ? 1 : 0)
    + (lead && lead.valor_max && i.valor && i.valor <= lead.valor_max * 1.1 ? 2 : lead && lead.valor_max && i.valor > lead.valor_max * 1.3 ? -3 : 0);
  return ims.sort((a, b) => nota(b) - nota(a)).slice(0, 25);
}
function linhaImovel(i, links, off) {
  const area = i.area_util || i.area_total;
  const desc = String(i.descricao || '').replace(/\s+/g, ' ').slice(0, 220);
  return `- ${i.codigo}: ${i.tipo}${!off && i.cond ? ' no ' + i.cond : ''}${i.bairro ? `, ${off ? 'região de ' : ''}${i.bairro}` : ''}; `
    + `${i.quartos ? i.quartos + ' quartos' : ''}${i.suites ? ` (${i.suites} suítes)` : ''}${i.vagas ? `, ${i.vagas} vagas` : ''}${area ? `, ${Math.round(area)} m²` : ''}; ${brl(i.valor)}`
    + `${i.valor_condominio ? `; condomínio ${brl(i.valor_condominio)}/mês` : ''}${i.exclusivo ? '; exclusividade RUAH' : ''}`
    + `${!off && links[i.codigo] ? '; tem página no portal' : ''}${desc ? `\n    Descrição: ${desc}` : ''}`;
}

// ---------- histórico ----------
function historico(agente, telefone, n = 14) {
  return all(`SELECT direcao,texto,status,autor,criado_em FROM agente_mensagens WHERE agente=? AND telefone=? AND (direcao IN ('entrada','nota') OR status IN ('enviada','teste','fila'))
    ORDER BY id DESC LIMIT ?`, agente, telefone, n).reverse();
}

// ---------- números do dia (gerente) ----------
function numerosDoDia() {
  const hoje = "substr(%s,1,10)=date('now','localtime')";
  const H = (c) => hoje.replace('%s', c);
  const n = (sql, ...p) => (one(sql, ...p) || {}).n || 0;
  const leads = all(`SELECT coalesce(origem,'sem origem') origem, count(*) n FROM leads WHERE ${H('criado_em')} GROUP BY 1 ORDER BY 2 DESC`);
  const visitasHoje = all(`SELECT v.data_hora,v.status,i.codigo,l.nome cliente,u.nome corretor FROM visitas v JOIN imoveis i ON i.id=v.imovel_id JOIN leads l ON l.id=v.lead_id
    LEFT JOIN usuarios u ON u.id=v.corretor_id WHERE substr(v.data_hora,1,10)=date('now','localtime') AND v.status!='cancelada' ORDER BY v.data_hora`);
  const visitasAmanha = n(`SELECT count(*) n FROM visitas WHERE substr(data_hora,1,10)=date('now','localtime','+1 day') AND status!='cancelada'`);
  const visitasMarcadas = n(`SELECT count(*) n FROM visitas WHERE ${H('criado_em')}`);
  const porAgente = all(`SELECT agente, sum(CASE WHEN direcao='entrada' THEN 1 ELSE 0 END) recebidas, sum(CASE WHEN direcao='saida' AND status='enviada' THEN 1 ELSE 0 END) enviadas,
    count(DISTINCT telefone) pessoas FROM agente_mensagens WHERE ${H('criado_em')} AND telefone NOT LIKE 'teste-%' GROUP BY agente`);
  const aprovar = n(`SELECT count(*) n FROM agente_mensagens WHERE direcao='saida' AND status='aprovar'`);
  const fg = {
    abordados: n(`SELECT count(*) n FROM fisguei_contatos WHERE ${H('enviado_em')}`),
    respostas: n(`SELECT count(*) n FROM fisguei_mensagens WHERE direcao='entrada' AND ${H('criado_em')}`),
    confirmados: n(`SELECT count(*) n FROM oportunidades WHERE portal='Fisgar' AND ${H('criado_em')}`),
  };
  const fotos = n(`SELECT count(*) n FROM agente_midias WHERE ${H('criado_em')}`);
  const captados = all(`SELECT o.id,o.titulo,i.codigo FROM oportunidades o LEFT JOIN imoveis i ON i.id=o.imovel_id WHERE o.status='captada' AND ${H('o.atualizado_em')}`);
  const opNovas = n(`SELECT count(*) n FROM oportunidades WHERE ${H('criado_em')}`);
  const propostas = n(`SELECT count(*) n FROM leads WHERE etapa='proposta'`);
  const semResposta = n(`SELECT count(DISTINCT l.id) n FROM leads l JOIN mensagens m ON m.id=(SELECT max(id) FROM mensagens WHERE lead_id=l.id AND direcao!='sugestao')
    WHERE m.direcao='entrada' AND m.criado_em < datetime('now','localtime','-2 hour') AND l.nao_contatar=0`);
  const chamados = all(`SELECT agente,texto FROM agente_eventos WHERE tipo='chamou_corretor' AND ${H('criado_em')} ORDER BY id DESC LIMIT 8`);
  const afazeresAbertos = n(`SELECT count(*) n FROM agente_afazeres WHERE feito=0`);
  const linhas = B.AGENTES.map((a) => ({ slug: a.slug, nome: B.ajustes(a.slug).nome, ...B.estadoLinha(B.linhaDe(a.slug)), ativo: B.ajustes(a.slug).ativo }));
  return { leads, visitasHoje, visitasAmanha, visitasMarcadas, porAgente, aprovar, fg, fotos, captados, opNovas, propostas, semResposta, chamados, afazeresAbertos, linhas };
}
function textoNumeros(d) {
  const nome = (s) => (B.POR_SLUG[s] ? B.ajustes(s).nome : s);
  const L = [];
  L.push(`Leads novos hoje: ${d.leads.reduce((s, x) => s + x.n, 0)}${d.leads.length ? ' (' + d.leads.map((x) => `${x.origem}: ${x.n}`).join('; ') + ')' : ''}.`);
  L.push(`Visitas hoje: ${d.visitasHoje.length}${d.visitasHoje.length ? ' — ' + d.visitasHoje.map((v) => `${v.data_hora.slice(11, 16)} ${v.codigo} com ${v.cliente} (${v.corretor || 'sem corretor'}, ${v.status})`).join('; ') : ''}. Amanhã: ${d.visitasAmanha}. Marcadas hoje: ${d.visitasMarcadas}.`);
  L.push(`Conversas dos agentes hoje: ${d.porAgente.length ? d.porAgente.map((x) => `${nome(x.agente)} ${x.pessoas} pessoa(s), ${x.recebidas} recebidas, ${x.enviadas} enviadas`).join('; ') : 'nenhuma'}.`);
  L.push(`Captação (TH-IA-GO): ${d.fg.abordados} donos abordados, ${d.fg.respostas} respostas, ${d.fg.confirmados} confirmaram e foram para o Radar; ${d.fotos} foto(s) recebida(s). Oportunidades novas no Radar: ${d.opNovas}.`);
  L.push(`Captados hoje: ${d.captados.length}${d.captados.length ? ' — ' + d.captados.map((c) => c.codigo || c.titulo).join(', ') : ''}. Leads em proposta: ${d.propostas}.`);
  L.push(`Pendências: ${d.aprovar} resposta(s) dos robôs esperando aprovação; ${d.semResposta} cliente(s) sem resposta há mais de 2 h; ${d.afazeresAbertos} afazer(es) abertos.`);
  if (d.chamados.length) L.push(`Agentes que chamaram um corretor hoje: ${d.chamados.map((c) => `${nome(c.agente)}: ${c.texto}`).join(' | ')}.`);
  const parados = d.linhas.filter((l) => l.ativo && l.estado !== 'conectado');
  L.push(`WhatsApp dos agentes: ${d.linhas.filter((l) => l.estado === 'conectado').length} de ${d.linhas.length} conectados${parados.length ? ` (sem linha: ${parados.map((l) => l.nome).join(', ')})` : ''}.`);
  return L.join('\n');
}

// ---------- corretor (gerente dos corretores) ----------
function agendaDoCorretor(uid) {
  const visitas = all(`SELECT v.id,v.data_hora,v.status,i.codigo,i.bairro,l.nome cliente,l.telefone FROM visitas v JOIN imoveis i ON i.id=v.imovel_id JOIN leads l ON l.id=v.lead_id
    WHERE v.corretor_id=? AND v.status IN ('agendada','confirmada') AND substr(v.data_hora,1,10) BETWEEN date('now','localtime') AND date('now','localtime','+1 day') ORDER BY v.data_hora`, uid);
  const afazeres = all(`SELECT id,texto,quando FROM agente_afazeres WHERE corretor_id=? AND feito=0 ORDER BY coalesce(quando,'9999'), id LIMIT 15`, uid);
  const quentes = all(`SELECT id,nome,telefone,ultimo_contato FROM leads WHERE corretor_id=? AND temperatura='quente' AND etapa NOT IN ('escritura','perdido')
    AND (ultimo_contato IS NULL OR ultimo_contato < datetime('now','localtime','-2 day')) ORDER BY ultimo_contato LIMIT 8`, uid);
  return { visitas, afazeres, quentes };
}
function textoAgenda(a) {
  const L = [];
  L.push(a.visitas.length ? `Visitas (hoje e amanhã): ${a.visitas.map((v) => `[${v.data_hora.slice(0, 16)}] ${v.codigo} ${v.bairro || ''} com ${v.cliente} (${fimTel(v.telefone)}), ${v.status}`).join('; ')}.` : 'Sem visitas hoje e amanhã.');
  L.push(a.afazeres.length ? `Afazeres abertos: ${a.afazeres.map((f) => `#${f.id} ${f.texto}${f.quando ? ' (até ' + f.quando.slice(0, 16) + ')' : ''}`).join('; ')}.` : 'Sem afazeres abertos.');
  if (a.quentes.length) L.push(`Leads quentes sem contato há 2+ dias: ${a.quentes.map((l) => `${l.nome} (${fimTel(l.telefone)})`).join('; ')}.`);
  return L.join('\n');
}

// ---------- formato da resposta ----------
const ACOES = {
  cliente: `- {"tipo":"atualizar_perfil","tipo_imovel":"Apartamento","quartos_min":3,"vagas_min":2,"valor_max":900000,"bairros":"Cambuí, Taquaral","temperatura":"quente|morno|frio","resumo":"o que o cliente procura, em uma frase"}
- {"tipo":"agendar_visita","codigo":"AP0029","quando":"AAAA-MM-DD HH:MM","observacao":"..."}  (só imóvel do catálogo e só depois de o cliente aceitar o horário)
- {"tipo":"enviar_link","codigo":"AP0029"}  (manda a página do imóvel; no off-market, o link privado, que passa pelo corretor)
- {"tipo":"transferir","para":"<agente>","motivo":"..."}  (cliente procura algo de outro setor)
- {"tipo":"chamar_corretor","motivo":"..."}`,
  captacao: `- {"tipo":"registrar_captacao","interesse":"sim|nao|talvez","fotos":"pedidas|recebidas|autorizadas|nao_quer","melhor_horario":"...","resumo":"..."}
- {"tipo":"chamar_corretor","motivo":"..."}`,
  gerente: `- {"tipo":"criar_afazer","corretor":"nome do corretor","texto":"...","quando":"AAAA-MM-DD HH:MM"}`,
  'gerente-corretores': `- {"tipo":"criar_afazer","texto":"...","quando":"AAAA-MM-DD HH:MM"}  (afazer para o próprio corretor que está falando)
- {"tipo":"marcar_feito","id":12}`,
};
function formato(tipoAcoes) {
  return `FORMATO DA SUA RESPOSTA (obrigatório): devolva SÓ um JSON, sem nada antes ou depois:
{"mensagem":"o texto que vai no WhatsApp (pode ser vazio se não for o caso de responder)","acoes":[ ... ]}
Ações que você pode usar (zero, uma ou mais):
${ACOES[tipoAcoes]}
Não invente códigos de imóvel, números, datas ou nomes. Se não souber, diga que o corretor confirma.`;
}

// Monta tudo o que o agente precisa para a mensagem desta pessoa.
async function montar(slug, telefone, extra = {}) {
  const a = B.POR_SLUG[slug];
  const aj = B.ajustes(slug);
  const g = B.geral();
  const agora = agoraSP();
  const partes = [`Agora: ${diaSemana()}, ${agora.texto} (horário de Brasília). Você está no WhatsApp ${B.ehTeste(telefone) ? '(CONVERSA DE TESTE feita pela equipe RUAH na tela do sistema; responda como se fosse real)' : ''}.`];
  partes.push(`Seu nome: ${aj.nome}. Seu cargo: ${a.cargo}.`);
  let tipoAcoes = a.tipo === 'interno' ? slug : a.tipo;

  if (a.tipo === 'cliente') {
    const lead = extra.lead || (B.ehTeste(telefone) ? null : one('SELECT * FROM leads WHERE telefone LIKE ? ORDER BY id DESC', B.padraoTel(telefone)));
    const links = await linksPortal();
    const cat = catalogoDoSetor(slug, lead, g);
    partes.push(`LIMITES DOS SETORES: casas até ${brl(g.limite_casas)} são da Clara; acima disso, Helena (alto padrão). Apartamentos a partir de ${brl(g.limite_alto_apto)} são da Helena; abaixo, Ana.`);
    partes.push(`OUTROS AGENTES (para "transferir"): ${B.AGENTES.filter((x) => x.tipo === 'cliente' && x.slug !== slug).map((x) => `"${x.slug}" = ${B.ajustes(x.slug).nome}, ${x.setor}`).join('; ')}.`);
    partes.push(`CATÁLOGO DO SEU SETOR (${cat.length} imóvel(is) da RUAH; só estes existem para você):\n${cat.length ? cat.map((i) => linhaImovel(i, links, slug === 'offmarket')).join('\n') : '(nenhum imóvel no seu setor agora: anote o perfil e diga que o corretor avisa quando entrar algo)'}`);
    if (lead) {
      const visitas = all(`SELECT v.data_hora,v.status,i.codigo FROM visitas v JOIN imoveis i ON i.id=v.imovel_id WHERE v.lead_id=? AND v.status IN ('agendada','confirmada') ORDER BY v.data_hora`, lead.id);
      const corretor = lead.corretor_id ? one('SELECT nome FROM usuarios WHERE id=?', lead.corretor_id) : null;
      partes.push(`FICHA DO CLIENTE: ${lead.nome}; etapa ${lead.etapa}; temperatura ${lead.temperatura}; corretor ${corretor ? corretor.nome : 'ainda sem corretor'}; origem ${lead.origem || '—'}.`
        + ` Procura: ${[lead.tipo_desejado, lead.quartos_min && lead.quartos_min + '+ quartos', lead.vagas_min && lead.vagas_min + '+ vagas', lead.valor_max && 'até ' + brl(lead.valor_max), lead.bairros].filter(Boolean).join(', ') || 'ainda não disse'}.`
        + `${lead.busca ? ` Anotação: ${lead.busca}.` : ''}${visitas.length ? ` Visitas marcadas: ${visitas.map((v) => `${v.codigo} em ${v.data_hora} (${v.status})`).join('; ')}.` : ''}`);
      const portal = one(`SELECT texto FROM interacoes WHERE lead_id=? AND tipo='portal' ORDER BY id DESC`, lead.id);
      if (portal) partes.push(`O QUE ELE PEDIU NO PORTAL: ${portal.texto}`);
    } else partes.push('FICHA DO CLIENTE: cliente novo, ainda sem ficha.');
  }

  if (a.tipo === 'captacao') {
    const p = extra.pessoa || null; const an = extra.anuncio || null;
    if (an) partes.push(`IMÓVEL: ${an.tipo || 'imóvel'} na ${[an.logradouro, an.numero].filter(Boolean).join(', ')}${an.complemento ? ' ' + an.complemento : ''}, ${an.bairro || ''}; anunciado por ${brl(an.valor)}${an.area_util ? `, ${Math.round(an.area_util)} m²` : ''}. Referência FG-${String(an.id).padStart(5, '0')}.`);
    if (p) partes.push(`PESSOA: ${p.nome}${p.unidade ? ' (unidade ' + p.unidade + ')' : ''}; situação: ${p.status}.`);
    if (an && an.oportunidade_id) partes.push(`Já é a oportunidade OP-${String(an.oportunidade_id).padStart(4, '0')} no Radar.`);
    const fotos = extra.pessoa ? (one('SELECT count(*) n FROM agente_midias WHERE pessoa_id=?', extra.pessoa.id) || {}).n : 0;
    partes.push(`Fotos que essa pessoa já mandou: ${fotos || 0}.`);
    const conv = extra.pessoa ? all(`SELECT direcao,texto FROM fisguei_mensagens WHERE pessoa_id=? ORDER BY id DESC LIMIT 14`, extra.pessoa.id).reverse() : [];
    if (conv.length) partes.push(`CONVERSA ATÉ AGORA:\n${conv.map((m) => `${m.direcao === 'entrada' ? 'PESSOA' : 'VOCÊ'}: ${m.texto}`).join('\n')}`);
  }

  if (slug === 'gerente') {
    partes.push(`DONO DO PORTAL: ${g.dono_nome || 'o dono'}. Quem está falando com você: ${extra.quem === 'dono' ? 'O DONO' : 'outra pessoa (não é o dono: diga com educação que este é um canal interno)'}.`);
    if (extra.quem === 'dono' || B.ehTeste(telefone)) partes.push(`NÚMEROS DE HOJE (do sistema, ao vivo):\n${textoNumeros(numerosDoDia())}`);
    partes.push(`CORRETORES: ${all("SELECT nome FROM usuarios WHERE ativo=1 AND perfil='corretor' ORDER BY nome").map((u) => u.nome).join(', ') || 'nenhum cadastrado'}.`);
  }
  if (slug === 'gerente-corretores') {
    const u = extra.usuario || (B.ehTeste(telefone) ? one("SELECT id,nome FROM usuarios WHERE ativo=1 AND perfil='corretor' ORDER BY id LIMIT 1") : null);
    if (u) partes.push(`QUEM ESTÁ FALANDO: o corretor ${u.nome}.\nAGENDA DELE (do sistema):\n${textoAgenda(agendaDoCorretor(u.id))}`);
    else partes.push('QUEM ESTÁ FALANDO: não é um corretor cadastrado com este celular. Diga com educação que este é um canal interno da equipe RUAH.');
    tipoAcoes = 'gerente-corretores';
  }

  const hist = historico(slug, telefone);
  if (a.tipo !== 'captacao' && hist.length) partes.push(`CONVERSA ATÉ AGORA:\n${hist.map((m) => `${m.direcao === 'entrada' ? 'PESSOA' : m.direcao === 'nota' ? 'SISTEMA' : 'VOCÊ'}: ${m.texto}`).join('\n')}`);
  partes.push(formato(tipoAcoes));
  return partes.join('\n\n');
}

module.exports = { montar, numerosDoDia, textoNumeros, agendaDoCorretor, textoAgenda, catalogoDoSetor, agoraSP, linksPortal, brl, fimTel };
