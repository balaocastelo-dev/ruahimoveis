// Teste do Escritório virtual: setores, alma (.soul), mensagem do cliente → IA (simulada) → ações → aprovação → envio,
// transferência entre agentes, gerente dos corretores ("feito N"), conversa de teste e relatório do dono.
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-escritorio-'));
process.env.RUAH_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'z'.repeat(48); process.env.IA_MODO = 'desligado';

// IA local de mentira: devolve a próxima resposta da fila
const respostas = [];
const ia = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }] }));
    const pedido = JSON.parse(corpo || '{}');
    ia.ultimo = pedido.messages && pedido.messages[0].content;
    res.end(JSON.stringify({ message: { content: JSON.stringify(respostas.shift() || { mensagem: 'Certo!', acoes: [] }) } }));
  });
});

(async () => {
  await new Promise((r) => ia.listen(0, r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${ia.address().port}`;
  const app = require('../server');
  const { one, all, run, setConfig } = require('../src/db');
  const B = require('../src/agentes/base');
  const E = require('../src/agentes/escritorio');
  const linhas = require('../src/agentes/linhas');
  const enviadas = [];
  linhas.conectada = () => true;
  linhas.enviar = async (linha, telefone, texto) => { enviadas.push({ linha, telefone, texto }); return 'wa' + enviadas.length; };
  const envelhece = () => run(`UPDATE agente_mensagens SET criado_em=datetime('now','localtime','-1 minute') WHERE processada=0`);

  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j; try { j = await r.json(); } catch { j = null; }
    if (r.status >= 400) { console.error('FALHOU', m, url, r.status, j); process.exit(1); }
    return j;
  };
  const ok = (cond, msg) => { assert.ok(cond, msg); console.log('ok ·', msg); };

  await req('POST', '/api/setup', { nome: 'Gestor', email: 'g@r.com', senha: 'Teste1234', exemplo: true });

  // 1) escritório com 9 agentes e almas padrão
  const esc = await req('GET', '/api/escritorio');
  ok(esc.agentes.length === 9, '9 agentes na planta');
  ok(esc.agentes.every((a) => B.alma(a.slug).length > 500), 'todas as almas padrão (.soul) carregadas');

  // 2) setores
  ok(B.setorDoImovel({ tipo: 'Apartamento', valor: 900000, status: 'publicado' }) === 'apartamentos', 'apartamento → Ana');
  ok(B.setorDoImovel({ tipo: 'Apartamento', valor: 3500000, status: 'publicado' }) === 'alto-padrao', 'apartamento de luxo → Helena');
  ok(B.setorDoImovel({ tipo: 'Casa em condomínio', valor: 1800000, status: 'publicado' }) === 'casas', 'casa até 2 mi → Clara');
  ok(B.setorDoImovel({ tipo: 'Sobrado', valor: 2600000, status: 'publicado' }) === 'alto-padrao', 'casa acima de 2 mi → Helena');
  ok(B.setorDoImovel({ tipo: 'Terreno em condomínio', valor: 500000, status: 'publicado' }) === 'terrenos', 'terreno → Teo');
  ok(B.setorDoImovel({ tipo: 'Galpão', valor: 5e6, status: 'publicado' }) === 'comerciais', 'galpão → Bruno');
  ok(B.setorDoImovel({ tipo: 'Casa em condomínio', valor: 3.9e6, status: 'off_market' }) === 'offmarket', 'off-market → Vicente');

  // 3) alma editada na tela, baixar e voltar ao padrão
  await req('PUT', '/api/escritorio/apartamentos/alma', { alma: '---\nagente: apartamentos\n---\n# Quem eu sou\nSou a Ana, teste de alma editada com mais de quarenta caracteres.' });
  ok((await req('GET', '/api/escritorio/apartamentos')).alma.includes('teste de alma editada'), 'alma editada salva');
  await req('POST', '/api/escritorio/apartamentos/alma/restaurar');
  ok((await req('GET', '/api/escritorio/apartamentos')).alma === B.almaPadrao('apartamentos'), 'alma voltou ao padrão');

  // 4) cliente escreve no WhatsApp da Ana → IA responde com ações → fica para aprovar
  respostas.push({ mensagem: 'Oi, Paula! Tenho o AP0001, 4 quartos nas Mansões Santo Antônio. Quer visitar amanhã às 15h?',
    acoes: [{ tipo: 'atualizar_perfil', tipo_imovel: 'Apartamento', quartos_min: 4, valor_max: 2400000, bairros: 'Mansões Santo Antônio', temperatura: 'quente', resumo: 'Apto 4 quartos até 2,4 mi' },
      { tipo: 'agendar_visita', codigo: 'AP0001', quando: '2099-01-10 15:00' }, { tipo: 'agendar_visita', codigo: 'CC0001', quando: '2099-01-10 16:00' }] });
  await E.entrada({ linha: 'apartamentos', telefone: '19981112222', nome: 'Paula', texto: 'Oi, procuro apartamento de 4 quartos' });
  let lead = one(`SELECT * FROM leads WHERE telefone='5519981112222'`);
  ok(lead && lead.agente === 'apartamentos', 'lead criado e ligado à Ana');
  ok(one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='entrada'`, lead.id), 'mensagem aparece nas Conversas do CRM');
  envelhece(); await E.processaEntradas();
  ok(ia.ultimo.includes('AP0001') && !ia.ultimo.includes('CC0001'), 'IA viu o catálogo do setor (sem o off-market)');
  ok(ia.ultimo.includes('Sou a Ana'), 'IA recebeu a alma');
  lead = one('SELECT * FROM leads WHERE id=?', lead.id);
  ok(lead.quartos_min === 4 && lead.valor_max === 2400000 && lead.temperatura === 'quente', 'perfil do lead atualizado pela ação');
  ok(one(`SELECT 1 FROM visitas WHERE lead_id=? AND data_hora='2099-01-10 15:00'`, lead.id), 'visita marcada no imóvel do setor');
  ok(!one(`SELECT 1 FROM visitas v JOIN imoveis i ON i.id=v.imovel_id WHERE v.lead_id=? AND i.codigo='CC0001'`, lead.id), 'visita em imóvel de outro setor recusada');
  const sug = one(`SELECT * FROM agente_mensagens WHERE lead_id=? AND direcao='saida' AND agente='apartamentos'`, lead.id);
  ok(sug && sug.status === 'aprovar', 'resposta ficou para aprovação (modo sugerir)');
  ok(one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, lead.id), 'sugestão aparece na conversa do CRM');
  ok(one(`SELECT 1 FROM agente_mensagens WHERE agente='gerente-corretores' AND direcao='saida' AND texto LIKE '%Visita marcada pelo robô%'`), 'Marta avisa o corretor da visita');

  // 5) aprovação e envio pela linha da Ana
  await req('POST', `/api/escritorio/saidas/${sug.id}/aprovar`, { texto: sug.texto + ' 😊' });
  await E.enviaSaidas();
  ok(enviadas.some((m) => m.linha === 'apartamentos' && m.texto.endsWith('😊')), 'aprovada e enviada pelo WhatsApp da Ana');
  ok(one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='saida'`, lead.id) && !one(`SELECT 1 FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, lead.id), 'envio registrado no CRM');

  // 6) transferência: cliente quer terreno → Teo assume
  respostas.push({ mensagem: 'Para terrenos, quem cuida é o Teo. Ele já vai falar com você!', acoes: [{ tipo: 'transferir', para: 'terrenos', motivo: 'quer terreno em Sousas' }] });
  respostas.push({ mensagem: 'Oi Paula, aqui é o Teo, de terrenos da RUAH. Qual o tamanho que você procura?', acoes: [] });
  await E.entrada({ linha: 'apartamentos', telefone: '19981112222', nome: 'Paula', texto: 'Na verdade quero um terreno em Sousas' });
  envelhece(); await E.processaEntradas(); await E.processaEntradas();
  ok(one('SELECT agente FROM leads WHERE id=?', lead.id).agente === 'terrenos', 'lead passou para o Teo');
  ok(one(`SELECT 1 FROM agente_mensagens WHERE agente='terrenos' AND telefone='5519981112222' AND direcao='saida' AND texto LIKE '%Teo%'`), 'Teo se apresentou');

  // 7) PARAR
  await E.entrada({ linha: 'apartamentos', telefone: '19981112222', nome: 'Paula', texto: 'PARAR' });
  ok(one('SELECT nao_contatar FROM leads WHERE id=?', lead.id).nao_contatar === 1, 'PARAR bloqueia o cliente');

  // 8) gerente dos corretores: corretor responde "feito N"
  const marina = one(`SELECT id FROM usuarios WHERE nome LIKE 'Marina%'`);
  const af = (await req('POST', '/api/escritorio/afazeres', { texto: 'Ligar para a Paula', corretor_id: marina.id })).id;
  await E.entrada({ linha: 'gerente-corretores', telefone: '19999990000', nome: 'Marina', texto: `feito ${af}` });
  envelhece(); await E.processaEntradas();
  ok(one('SELECT feito FROM agente_afazeres WHERE id=?', af).feito === 1, '"feito N" fecha o afazer');

  // 9) dono fala com o Augusto; relatório
  await req('PUT', '/api/escritorio/geral', { dono_nome: 'Thiago', dono_telefone: '(19) 98888-7777' });
  await E.entrada({ linha: 'gerente', telefone: '19988887777', nome: 'Thiago', texto: 'relatório' });
  envelhece(); await E.processaEntradas();
  ok(one(`SELECT 1 FROM agente_mensagens WHERE agente='gerente' AND direcao='saida' AND telefone='5519988887777' AND texto LIKE '%Relatório do dia%'`), 'dono pede e recebe o relatório');
  ok((await req('GET', '/api/escritorio/relatorio')).texto.includes('Comercial'), 'prévia do relatório');

  // 10) conversa de teste na tela (nada sai, ações só simuladas)
  respostas.push({ mensagem: 'Olá! Procura casa em qual região?', acoes: [{ tipo: 'agendar_visita', codigo: 'AP0001', quando: '2099-02-01 10:00' }] });
  await req('POST', '/api/escritorio/casas/teste', { texto: 'Oi, quero uma casa' });
  await E.processaEntradas();
  const t = await req('GET', '/api/escritorio/casas/teste');
  ok(t.mensagens.some((m) => m.direcao === 'saida' && m.status === 'teste'), 'conversa de teste respondida');
  ok(t.acoes.length >= 1 && !one(`SELECT 1 FROM visitas WHERE data_hora='2099-02-01 10:00'`), 'ação do teste só simulada');

  // 11) linhas e ajustes
  await req('PUT', '/api/escritorio/offmarket', { linha: 'alto-padrao', modo: 'automatico' });
  ok(B.linhaDe('offmarket') === 'alto-padrao' && B.ajustes('offmarket').modo === 'automatico', 'agente usando a linha de outro');
  const mesa = await req('GET', '/api/escritorio/gerente-corretores');
  ok(mesa.equipe.length >= 2, 'mesa da Marta mostra a equipe');
  await req('GET', '/api/escritorio/captador');

  srv.close(); ia.close();
  console.log('\nEscritório virtual: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
