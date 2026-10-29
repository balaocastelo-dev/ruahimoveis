// Teste dos PCs virtuais (lado do sistema): chave da estação, batida, tarefa (fila → estação → passos → resultado
// no WhatsApp de quem pediu), WhatsApp Web como linha do agente (entrada, saída, PARAR) e o passe assinado da tela.
const os = require('os'), path = require('path'), fs = require('fs'), crypto = require('crypto'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-estacao-'));
process.env.RUAH_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'y'.repeat(48); process.env.IA_MODO = 'desligado';
process.env.ESTACAO_ID = 'teste-1'; process.env.ESTACAO_CHAVE = 'est_chave_de_teste_1234567890';

(async () => {
  const app = require('../server');
  const { one, run } = require('../src/db');
  const B = require('../src/agentes/base');
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body, h = {}, esperado) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', origin: base, cookie, ...h }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j; try { j = await r.json(); } catch { j = null; }
    if (esperado ? r.status !== esperado : r.status >= 400) { console.error('FALHOU', m, url, r.status, j); process.exit(1); }
    return j;
  };
  const est = (m, url, body) => req(m, url, body, { 'x-estacao': process.env.ESTACAO_CHAVE });
  const ok = (c, msg) => { assert.ok(c, msg); console.log('ok ·', msg); };

  await req('POST', '/api/setup', { nome: 'Gestor', email: 'g@r.com', senha: 'Teste1234' });
  await req('POST', '/api/login', { email: 'g@r.com', senha: 'Teste1234' });
  run(`UPDATE usuarios SET telefone='19999990000' WHERE email='g@r.com'`);

  // 1) chave da estação
  await req('POST', '/estacao-api/batida', {}, { 'x-estacao': 'errada' }, 401);
  ok(true, 'estação com chave errada é recusada');
  const cfgR = await est('GET', '/estacao-api/config');
  ok(cfgR.agentes.length === 9 && cfgR.ia.provedor === 'ollama', 'config da estação: 9 agentes e IA local quando não há chave');

  // 2) batida deixa a estação online e o passe é assinado com a chave
  await est('POST', '/estacao-api/batida', { url: 'https://abc-def.trycloudflare.com', versao: '1.0.0', agentes: { apartamentos: { ligado: true } } });
  const st = await req('GET', '/api/estacao');
  ok(st.online && st.url === 'https://abc-def.trycloudflare.com', 'estação online com o endereço do túnel');
  const p = await req('POST', '/api/estacao/passe', { agente: 'casas' });
  const [id, ag, exp, uid, perm, sig] = p.passe.split('.');
  const certo = crypto.createHmac('sha256', process.env.ESTACAO_CHAVE).update(`${id}.${ag}.${exp}.${uid}.${perm}`).digest('base64url');
  ok(id === 'teste-1' && ag === 'casas' && perm === 'c' && sig === certo && +exp > Date.now() / 1000, 'passe da tela assinado, com validade e permissão de controle');

  // 3) tarefa: fila → estação pega uma vez → passos → resultado vai pelo WhatsApp de quem pediu
  const t = await req('POST', '/api/estacao/tarefas', { agente: 'casas', pedido: 'Procure casas no Cambuí no Facebook e me mande as 3 melhores' });
  ok(t.status === 'fila' && t.para_telefone === '5519999990000', 'tarefa na fila, resultado para o WhatsApp de quem pediu');
  const b1 = await est('POST', '/estacao-api/batida', { agentes: {} });
  const b2 = await est('POST', '/estacao-api/batida', { agentes: {} });
  ok(b1.tarefas.length === 1 && b1.tarefas[0].alma.length > 100 && !b2.tarefas.length, 'a estação recebe a tarefa (com a alma) uma vez só');
  await est('POST', `/estacao-api/tarefa/${t.id}`, { passo: { n: 1, acao: 'ir', detalhe: 'facebook.com', pensamento: 'Abrindo o Marketplace' }, evento: '🖥️ Abrindo o Marketplace' });
  await est('POST', `/estacao-api/tarefa/${t.id}`, { concluir: { resultado: '1. Casa na R. X, R$ 2 mi\n2. ...' } });
  const tf = await req('GET', `/api/estacao/tarefas/${t.id}`);
  const saida = one(`SELECT * FROM agente_mensagens WHERE direcao='saida' AND telefone='5519999990000' ORDER BY id DESC`);
  ok(tf.status === 'feita' && tf.passos.length === 1 && saida && saida.status === 'fila' && /Tarefa concluída/.test(saida.texto), 'tarefa feita: passos guardados e resultado na fila do WhatsApp (sem esperar aprovação)');

  // 4) WhatsApp Web como linha: a saída vai para a estação, não para a linha por QR
  await req('PUT', '/api/escritorio/casas', { canal: 'web', wa_filtro: 'todos' });
  ok(B.ajustes('casas').canal === 'web', 'agente passa a usar o WhatsApp Web do PC virtual');
  const b3 = await est('POST', '/estacao-api/batida', { agentes: { casas: { ligado: true, wa: { estado: 'conectado', numero: '5519988887777' } } } });
  ok(b3.saidas.some((m) => m.id === saida.id && m.linha === 'casas'), 'mensagem da fila vai para o WhatsApp Web da estação');
  ok(B.estadoLinha('casas').estado === 'conectado' && B.estadoLinha('casas').numero === '5519988887777', 'estado da linha web vem da estação');
  await est('POST', `/estacao-api/wa-saida/${saida.id}`, { ok: true, wa_id: 'ABC' });
  ok(one('SELECT status FROM agente_mensagens WHERE id=?', saida.id).status === 'enviada', 'envio confirmado pela estação');

  // 5) entrada pelo WhatsApp Web vira conversa do agente (e PARAR bloqueia)
  await est('POST', '/estacao-api/wa-entrada', { linha: 'casas', telefone: '5519977776666', nome: 'Rita', texto: 'Oi, vi a casa no portal, ainda está à venda?', wa_id: 'm1' });
  await est('POST', '/estacao-api/wa-entrada', { linha: 'casas', telefone: '5519977776666', nome: 'Rita', texto: 'Oi, vi a casa no portal, ainda está à venda?', wa_id: 'm1' });
  const ent = one(`SELECT count(*) n FROM agente_mensagens WHERE direcao='entrada' AND telefone='5519977776666'`);
  ok(ent.n === 1 && one(`SELECT agente FROM leads WHERE telefone LIKE '%77776666'`).agente === 'casas', 'mensagem nova vira entrada da Clara (sem repetir) e lead no CRM');
  await est('POST', '/estacao-api/wa-entrada', { linha: 'casas', telefone: '5519977776666', nome: 'Rita', texto: 'PARAR', wa_id: 'm2' });
  ok(one(`SELECT nao_contatar FROM leads WHERE telefone LIKE '%77776666'`).nao_contatar === 1, 'PARAR pelo WhatsApp Web entra na lista não contatar');

  // 6) comando para a estação e cancelamento
  await req('POST', '/api/estacao/comando', { agente: 'casas', comando: 'ler_whatsapp' });
  const b4 = await est('POST', '/estacao-api/batida', { agentes: {} });
  ok(b4.comandos.some((c) => c.agente === 'casas' && c.comando === 'ler_whatsapp'), 'comando "ler não lidas" chega à estação');
  const t2 = await req('POST', '/api/estacao/tarefas', { agente: 'terrenos', pedido: 'Pesquisar terrenos em Sousas no Google' });
  await est('POST', '/estacao-api/batida', { agentes: {} });
  await req('POST', `/api/estacao/tarefas/${t2.id}/cancelar`);
  const b5 = await est('POST', '/estacao-api/batida', { agentes: {} });
  ok(b5.canceladas.includes(t2.id), 'tarefa cancelada na tela avisa a estação para parar');

  // 7) cérebro dos PCs: provedores e chave cifrada
  const a = await req('PUT', '/api/estacao/ia', { provedor: 'openai', modelo: 'openrouter/free', base_url: 'https://openrouter.ai/api/v1', chave: 'sk-or-v1-teste-1234567890' });
  ok(a.provedor === 'openai' && a.tem_chave && a.chave_final === '7890', 'provedor compatível com OpenAI salvo, chave mascarada');
  ok(!/sk-or-v1/.test(one(`SELECT valor FROM config WHERE chave='estacao_ia'`).valor), 'chave não fica em texto puro no banco');
  const cfg2 = await est('GET', '/estacao-api/config');
  ok(cfg2.ia.chave === 'sk-or-v1-teste-1234567890', 'a estação recebe a chave para operar o navegador');

  srv.close();
  console.log('\nPCs virtuais: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
