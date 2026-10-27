// Cérebro dos agentes: junta a alma (.soul) com o que o sistema sabe, pergunta à IA local (Ollama, no PC)
// e transforma a resposta em mensagem + ações no sistema (perfil do lead, visita, link, transferência, corretor, afazer).
const cfg = require('../config');
const { one, all, run } = require('../db');
const B = require('./base');
const X = require('./contexto');

// Link que vai nas mensagens: o endereço público (nunca o localhost do PC).
const urlBase = () => (cfg.PUBLIC_URL || (/localhost|127\.0\.0\.1/.test(cfg.BASE_URL) ? cfg.LINK_ONLINE : cfg.BASE_URL)).replace(/\/$/, '');
const limpa = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function iaDisponivel() {
  try { const r = await fetch(`${cfg.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}

async function perguntaIA(sistema, pedido) {
  const r = await fetch(`${cfg.OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.OLLAMA_MODEL, stream: false, think: false, format: 'json',
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: pedido }],
      options: { temperature: 0.35, num_predict: 500, num_ctx: 12288 } }),
    signal: AbortSignal.timeout(150000),
  });
  if (!r.ok) throw new Error(`IA local respondeu ${r.status} (confira o Ollama e o modelo ${cfg.OLLAMA_MODEL}).`);
  const j = await r.json();
  return String(j.message && j.message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function lerResposta(txt) {
  let o = null;
  try { o = JSON.parse(txt); } catch {
    const m = String(txt).match(/\{[\s\S]*\}/); if (m) { try { o = JSON.parse(m[0]); } catch {} }
  }
  if (!o || typeof o !== 'object') return { mensagem: limpa(txt, 1500), acoes: [] };
  const msg = typeof o.mensagem === 'string' ? o.mensagem : typeof o.resposta === 'string' ? o.resposta : '';
  return { mensagem: msg.trim().slice(0, 1500), acoes: Array.isArray(o.acoes) ? o.acoes.slice(0, 6) : [] };
}

// Monta o pedido completo: alma + sistema. A parte do sistema (contexto e formato) não é editável na tela.
async function pensar(slug, telefone, extra = {}) {
  const alma = require('./catalogo').lerAlma(B.alma(slug)).corpo;
  const contexto = await X.montar(slug, telefone, extra);
  const sistema = `${alma}\n\n=====================================\nO QUE O SISTEMA DA RUAH SABE AGORA (dados reais, não invente nada além disto)\n=====================================\n${contexto}`;
  const pedido = extra.pedido || 'Responda à última mensagem da PESSOA (ou siga a instrução do SISTEMA, se a última for do sistema), seguindo sua alma e o formato JSON.';
  const bruto = await perguntaIA(sistema, pedido);
  return lerResposta(bruto);
}

// ---------- ações ----------
function avisaCorretor(uid, texto, chave) {
  const u = uid ? one('SELECT id,nome,telefone FROM usuarios WHERE id=? AND ativo=1', uid) : null;
  if (!u || !u.telefone) return false;
  if (chave && !B.evento('gerente-corretores', 'aviso', `Aviso para ${u.nome}: ${limpa(texto, 200)}`, `u${u.id}`, chave)) return false;
  B.enfileiraSaida({ agente: 'gerente-corretores', telefone: u.telefone, texto, nome: u.nome });
  return true;
}
function avisaDono(texto, chave) {
  const g = B.geral();
  if (!g.alertas_dono || !g.dono_telefone) return false;
  if (chave && !B.evento('gerente', 'alerta', limpa(texto, 300), null, chave)) return false;
  B.enfileiraSaida({ agente: 'gerente', telefone: g.dono_telefone, texto, nome: g.dono_nome || 'Dono' });
  return true;
}
function dataValida(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const v = `${m[1]} ${m[2].padStart(2, '0')}:${m[3]}`;
  return v > X.agoraSP().texto ? v : null;
}

async function aplicar(slug, telefone, acoes, extra = {}) {
  const feitas = []; const mensagensExtras = []; let precisaAprovar = false;
  const teste = B.ehTeste(telefone);
  const nomeAg = B.ajustes(slug).nome;
  const lead = extra.lead || null;
  const g = B.geral();
  for (const a of acoes || []) {
    if (!a || typeof a !== 'object') continue;
    const tipo = String(a.tipo || '');
    try {
      if (teste) { feitas.push(`(teste) ${tipo}: ${limpa(JSON.stringify(a), 200)}`); B.evento(slug, 'teste', `Na conversa de teste, faria: ${tipo} ${limpa(JSON.stringify(a), 200)}`); continue; }

      if (tipo === 'atualizar_perfil' && lead) {
        const n = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);
        const temp = ['quente', 'morno', 'frio'].includes(a.temperatura) ? a.temperatura : null;
        run(`UPDATE leads SET tipo_desejado=coalesce(?,tipo_desejado), quartos_min=coalesce(?,quartos_min), vagas_min=coalesce(?,vagas_min), valor_max=coalesce(?,valor_max),
          bairros=coalesce(?,bairros), temperatura=coalesce(?,temperatura), busca=coalesce(?,busca) WHERE id=?`,
        limpa(a.tipo_imovel, 60) || null, n(a.quartos_min), n(a.vagas_min), n(a.valor_max), limpa(a.bairros, 200) || null, temp, limpa(a.resumo, 400) || null, lead.id);
        if (lead.etapa === 'novo' && (a.valor_max || a.quartos_min || a.bairros)) run(`UPDATE leads SET etapa='qualificado' WHERE id=? AND etapa='novo'`, lead.id);
        feitas.push('perfil atualizado');
      }

      if (tipo === 'agendar_visita' && lead) {
        const im = one('SELECT * FROM imoveis WHERE codigo=?', String(a.codigo || '').toUpperCase().trim());
        const quando = dataValida(a.quando);
        if (!im || B.setorDoImovel(im, g) !== slug || !['publicado', 'off_market'].includes(im.status)) { feitas.push(`visita ignorada: ${a.codigo} não é do catálogo`); continue; }
        if (!quando) { feitas.push('visita ignorada: data inválida'); continue; }
        if (one(`SELECT 1 FROM visitas WHERE lead_id=? AND imovel_id=? AND data_hora=? AND status!='cancelada'`, lead.id, im.id, quando)) continue;
        const corretor = im.corretor_id || lead.corretor_id || B.proximoCorretor();
        const vid = Number(run('INSERT INTO visitas(lead_id,imovel_id,corretor_id,data_hora,status) VALUES(?,?,?,?,?)', lead.id, im.id, corretor, quando, 'agendada').lastInsertRowid);
        run(`UPDATE leads SET etapa=CASE WHEN etapa IN ('novo','qualificado') THEN 'visita' ELSE etapa END, temperatura='quente', corretor_id=coalesce(corretor_id,?) WHERE id=?`, corretor, lead.id);
        run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'visita', `${nomeAg} (robô) marcou visita ao ${im.codigo} em ${quando}${a.observacao ? ' — ' + limpa(a.observacao, 200) : ''}. O corretor precisa confirmar.`);
        B.evento(slug, 'visita', `Marcou visita: ${lead.nome} no ${im.codigo} em ${quando.slice(8, 10)}/${quando.slice(5, 7)} ${quando.slice(11)}`, `v${vid}`);
        avisaCorretor(corretor, `📅 Visita marcada pelo robô ${nomeAg}\n${quando.slice(8, 10)}/${quando.slice(5, 7)} às ${quando.slice(11)} · ${im.codigo} (${im.bairro || ''})\nCliente: ${lead.nome} (${X.fimTel(lead.telefone)})\nConfirme com o cliente e marque como confirmada no sistema: ${urlBase()}/#/visitas`, `aviso:visita:${vid}`);
        avisaDono(`📅 ${nomeAg} marcou visita: ${lead.nome} no ${im.codigo} em ${quando.slice(8, 10)}/${quando.slice(5, 7)} às ${quando.slice(11)}.`, `dono:visita:${vid}`);
        feitas.push(`visita ${im.codigo} ${quando}`);
      }

      if (tipo === 'enviar_link') {
        const im = one('SELECT * FROM imoveis WHERE codigo=?', String(a.codigo || '').toUpperCase().trim());
        if (!im || B.setorDoImovel(im, g) !== slug) { feitas.push(`link ignorado: ${a.codigo}`); continue; }
        if (im.status === 'off_market') {
          if (!lead) continue;
          const token = require('../auth').tokenAleatorio(12);
          run(`INSERT INTO links_internos(token,imovel_id,lead_id,mostrar_endereco,expira_em,criado_por) VALUES(?,?,?,?,datetime('now','localtime','+7 day'),?)`, token, im.id, lead.id, 0, null);
          run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'link', `${nomeAg} (robô) preparou o link privado do ${im.codigo} (7 dias). Sai só depois da aprovação do corretor.`);
          mensagensExtras.push({ texto: `Aqui está o acesso privado (válido por 7 dias): ${urlBase()}/v/${token}`, aprovar: true });
          precisaAprovar = true; feitas.push(`link privado ${im.codigo} (aprovar)`);
        } else {
          const links = await X.linksPortal();
          if (!links[im.codigo]) { feitas.push(`sem página no portal: ${im.codigo}`); continue; }
          mensagensExtras.push({ texto: `${urlBase()}/imoveis/${links[im.codigo]}` });
          if (lead) run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'link', `${nomeAg} (robô) mandou a página do ${im.codigo} no portal.`);
          feitas.push(`link ${im.codigo}`);
        }
      }

      if (tipo === 'transferir' && lead) {
        const para = String(a.para || '');
        if (!B.CLIENTE.includes(para) || para === slug || !B.ajustes(para).ativo) { feitas.push(`transferência ignorada: ${para}`); continue; }
        run('UPDATE leads SET agente=? WHERE id=?', para, lead.id);
        run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', `${nomeAg} passou o cliente para ${B.ajustes(para).nome} (${B.POR_SLUG[para].setor}): ${limpa(a.motivo, 200)}`);
        B.evento(slug, 'transferiu', `Passou ${lead.nome} para ${B.ajustes(para).nome}: ${limpa(a.motivo, 150)}`, `l${lead.id}`);
        B.registraEntrada({ agente: para, telefone, nome: lead.nome, direcao: 'nota', lead_id: lead.id,
          texto: `${nomeAg} (${B.POR_SLUG[slug].setor}) acabou de passar este cliente para você. Motivo: ${limpa(a.motivo, 300)}. Apresente-se em uma frase e continue o atendimento a partir do que ele procura.` });
        feitas.push(`transferido para ${para}`);
      }

      if (tipo === 'chamar_corretor') {
        const motivo = limpa(a.motivo, 300) || 'pediu atendimento humano';
        if (lead) {
          const corretor = lead.corretor_id || B.proximoCorretor();
          if (corretor && !lead.corretor_id) run('UPDATE leads SET corretor_id=? WHERE id=?', corretor, lead.id);
          run(`UPDATE leads SET temperatura='quente' WHERE id=?`, lead.id);
          run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', `${nomeAg} (robô) chamou o corretor: ${motivo}`);
          const af = Number(run('INSERT INTO agente_afazeres(corretor_id,texto,lead_id,origem,quando) VALUES(?,?,?,?,?)', corretor, `Falar com ${lead.nome} (${X.fimTel(lead.telefone)}): ${motivo}`, lead.id, slug, null).lastInsertRowid);
          B.evento(slug, 'chamou_corretor', `${lead.nome}: ${motivo}`, `l${lead.id}`);
          avisaCorretor(corretor, `🔔 ${nomeAg} precisa de você\nCliente: ${lead.nome} (${X.fimTel(lead.telefone)})\nMotivo: ${motivo}\nConversa: ${urlBase()}/#/whats/${lead.id}\nQuando resolver, responda "feito ${af}".`, `aviso:chamado:${af}`);
        } else if (extra.pessoa) {
          const an = extra.anuncio || {};
          const resp = an.oportunidade_id ? (one('SELECT corretor_id FROM oportunidades WHERE id=?', an.oportunidade_id) || {}).corretor_id : null;
          const af = Number(run('INSERT INTO agente_afazeres(corretor_id,texto,origem) VALUES(?,?,?)', resp || B.proximoCorretor(), `Proprietário ${extra.pessoa.nome} (${X.fimTel(telefone)}) — FG-${String(an.id || 0).padStart(5, '0')}: ${motivo}`, slug).lastInsertRowid);
          B.evento(slug, 'chamou_corretor', `Proprietário ${extra.pessoa.nome}: ${motivo}`, `fg${an.id || ''}`);
          avisaCorretor(resp || B.proximoCorretor(), `🏠 TH-IA-GO precisa de você\nProprietário: ${extra.pessoa.nome} (${X.fimTel(telefone)})\nImóvel: ${[an.logradouro, an.numero].filter(Boolean).join(', ')} · ${an.bairro || ''}\nMotivo: ${motivo}\nVer: ${urlBase()}/#/fisguei/${an.id}\nQuando resolver, responda "feito ${af}".`, `aviso:chamado:${af}`);
        }
        feitas.push('chamou corretor');
      }

      if (tipo === 'registrar_captacao' && extra.pessoa) {
        const an = extra.anuncio || {};
        const txt = [a.interesse && `interesse: ${a.interesse}`, a.fotos && `fotos: ${a.fotos}`, a.melhor_horario && `melhor horário: ${limpa(a.melhor_horario, 80)}`, a.resumo && limpa(a.resumo, 250)].filter(Boolean).join(' · ');
        if (!txt) continue;
        if (an.oportunidade_id) run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto) VALUES(?,?,?)', an.oportunidade_id, 'contato', `TH-IA-GO: ${txt}`);
        B.evento(slug, 'captacao', `${extra.pessoa.nome}: ${txt}`, `fg${an.id || ''}`);
        if (a.interesse === 'sim') avisaDono(`🏠 Proprietário quer vender com a RUAH: ${extra.pessoa.nome} · ${an.tipo || 'imóvel'} no ${an.bairro || ''}${an.valor ? ' · ' + X.brl(an.valor) : ''}.`, `dono:captacao:${extra.pessoa.id}`);
        feitas.push('captação registrada');
      }

      if (tipo === 'criar_afazer') {
        let uid = extra.usuario ? extra.usuario.id : null;
        if (slug === 'gerente' && a.corretor) {
          const nome = limpa(a.corretor, 60).toLowerCase();
          const u = all("SELECT id,nome FROM usuarios WHERE ativo=1").find((x) => x.nome.toLowerCase().includes(nome) || nome.includes(x.nome.toLowerCase().split(' ')[0]));
          uid = u ? u.id : null;
        }
        if (!uid || !limpa(a.texto)) { feitas.push('afazer ignorado (sem corretor)'); continue; }
        const quando = dataValida(a.quando);
        const id = Number(run('INSERT INTO agente_afazeres(corretor_id,texto,quando,origem) VALUES(?,?,?,?)', uid, limpa(a.texto, 300), quando, slug).lastInsertRowid);
        B.evento(slug, 'afazer', `Afazer #${id}: ${limpa(a.texto, 150)}${quando ? ' (' + quando + ')' : ''}`, `u${uid}`);
        if (slug === 'gerente') avisaCorretor(uid, `📌 Novo afazer (pedido do dono): ${limpa(a.texto, 300)}${quando ? `\nAté: ${quando.slice(8, 10)}/${quando.slice(5, 7)} ${quando.slice(11)}` : ''}\nQuando terminar, responda "feito ${id}".`, `aviso:afazer:${id}`);
        feitas.push(`afazer #${id}`);
      }

      if (tipo === 'marcar_feito' && extra.usuario) {
        const id = parseInt(a.id, 10);
        const r = run(`UPDATE agente_afazeres SET feito=1, feito_em=datetime('now','localtime') WHERE id=? AND corretor_id=? AND feito=0`, id, extra.usuario.id);
        if (r.changes) { B.evento(slug, 'feito', `${extra.usuario.nome} concluiu o afazer #${id}`, `u${extra.usuario.id}`); feitas.push(`afazer #${id} feito`); }
      }
    } catch (e) { feitas.push(`erro em ${tipo}: ${e.message}`); }
  }
  return { feitas, mensagensExtras, precisaAprovar };
}

module.exports = { iaDisponivel, pensar, aplicar, lerResposta, avisaCorretor, avisaDono, dataValida, urlBase };
