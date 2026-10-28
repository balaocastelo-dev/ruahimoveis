// Robô TH-IA-GO CORRETOR: WhatsApp ligado pelo QR code (aparelho conectado), roda só no PC da imobiliária (cliente).
// - mostra o QR code na tela /fisguei (gravado no banco, então aparece também no link online);
// - aborda os números da fila do Fisguei, um de cada vez, com intervalo, horário comercial e limite por dia;
// - lê as respostas e passa para o Fisguei (SIM vira oportunidade no Radar, NÃO e PARAR saem da fila).
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { getConfig, setConfig } = require('../db');
const F = require('./base');
const pc = require('../pc');

// Multi-imobiliária: um robô por imobiliária do PC (src/pc.js). Estado, sessão e timers ficam separados por imobiliária;
// a sessão da RUAH continua em data/whatsapp-thiago e a das novas em data/<slug>/whatsapp-thiago.
const pasta = () => pc.pastaDados('whatsapp-thiago');
const TICK_MS = 20e3;
const R = pc.estadoPor((slug) => ({ slug, st: { estado: 'iniciando', qr: null, numero: null, erro: null, ultimoEnvio: 0, proximoEm: 0, enviando: false }, sock: null, timer: null, reconectando: false }));
let B = null;
let carregaBaileys = () => import('baileys'); // trocado nos testes (test/pc-multi.js)

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), `[TH-IA-GO${pc.ehRaiz(R().slug) ? '' : ' ' + R().slug}]`, ...a);
function publica() {
  const { st } = R();
  try {
    setConfig('fisguei_robo', JSON.stringify({ estado: st.estado, qr: st.qr, numero: st.numero, erro: st.erro, em: new Date().toISOString(),
      ultimo_envio: st.ultimoEnvio ? new Date(st.ultimoEnvio).toISOString() : null, proximo_em: st.proximoEm ? new Date(st.proximoEm).toISOString() : null }));
  } catch (e) { log('não consegui gravar o estado no banco:', e.message); }
}

const telDoJid = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const jidDoTel = (t) => `${F.normTel(t)}@s.whatsapp.net`;

async function conecta() {
  const r = R(), { st } = r;
  if (!B) B = await carregaBaileys();
  const pino = (await import('pino')).default;
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B;
  const PASTA = pasta();
  fs.mkdirSync(PASTA, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(PASTA);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* usa a versão embutida */ }
  const sock = r.sock = makeWASocket({ auth: state, version, logger: pino({ level: 'silent' }), browser: Browsers.windows(`${cfg.CLIENTE_NOME} TH-IA-GO`), markOnlineOnConnect: false, syncFullHistory: false });
  // pc.liga: os eventos do Baileys voltam sempre para a imobiliária deste robô (o SQL vai para o schema certo)
  sock.ev.on('creds.update', pc.liga(saveCreds));
  sock.ev.on('connection.update', pc.liga(async (u) => {
    if (u.qr) {
      st.estado = 'qr'; st.erro = null;
      try { st.qr = await require('qrcode').toDataURL(u.qr, { margin: 1, width: 320 }); } catch { st.qr = null; }
      publica(); log(`QR code novo: abra a tela Fisguei e leia com o WhatsApp da ${cfg.CLIENTE_NOME} (Aparelhos conectados).`);
    }
    if (u.connection === 'open') {
      st.estado = 'conectado'; st.qr = null; st.erro = null; st.numero = telDoJid(sock.user && sock.user.id);
      publica(); log('conectado como', st.numero);
    }
    if (u.connection === 'close') {
      const codigo = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      const saiu = codigo === DisconnectReason.loggedOut;
      st.estado = saiu ? 'desconectado' : 'reconectando'; st.qr = null;
      st.erro = saiu ? 'O aparelho foi desconectado no celular. Leia o QR code de novo.' : null;
      publica(); log('conexão fechada', codigo || '', saiu ? '(saiu da conta)' : '');
      if (saiu) fs.rmSync(PASTA, { recursive: true, force: true });
      if (!r.reconectando) { r.reconectando = true; setTimeout(() => { r.reconectando = false; conecta().catch(falhou); }, saiu ? 3e3 : 8e3); }
    }
  }));
  sock.ev.on('messages.upsert', pc.liga(async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const jid = m.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;
        // contas novas do WhatsApp vêm com "lid" no lugar do número: pega o número verdadeiro
        let pn = m.key.remoteJidAlt && !String(m.key.remoteJidAlt).endsWith('@lid') ? m.key.remoteJidAlt : null;
        if (!pn && jid.endsWith('@lid')) { try { pn = await sock.signalRepository.lidMapping.getPNForLID(jid); } catch {} }
        if (!pn && !jid.endsWith('@lid')) pn = jid;
        if (!pn) continue;
        const msg = m.message.ephemeralMessage ? m.message.ephemeralMessage.message : m.message;
        const texto = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text)
          || (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedDisplayText)
          || (msg.imageMessage ? `[foto] ${msg.imageMessage.caption || ''}` : msg.audioMessage ? `[áudio — ouça no celular da ${cfg.CLIENTE_NOME}]` : msg.documentMessage ? '[documento]' : '[mensagem]');
        const r = F.recebida({ telefone: telDoJid(pn), texto, wa_id: m.key.id });
        if (!r.ignorado) log('resposta de', telDoJid(pn).slice(-4), '→', r.tipo);
        // Escritório virtual: fotos originais do dono ficam guardadas; conversa depois da 1ª resposta vai para o agente TH-IA-GO
        if (r.pessoa_id && msg.imageMessage) {
          try {
            const buf = await B.downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            require('../agentes/midias').guarda({ agente: 'captador', telefone: r.telefone, pessoa_id: r.pessoa_id, anuncio_id: r.anuncio_id, mime: msg.imageMessage.mimetype || 'image/jpeg', legenda: msg.imageMessage.caption || null, dados: buf });
            log('foto recebida do dono (final', String(r.telefone).slice(-4) + ')');
          } catch (e) { log('não consegui baixar a foto:', e.message); }
        }
        if (r.pessoa_id && ['conversa', 'outro'].includes(r.tipo)) {
          try { require('../agentes/escritorio').captadorEntrada({ telefone: r.telefone, texto, pessoa_id: r.pessoa_id, wa_id: m.key.id }); } catch (e) { log('escritório:', e.message); }
        }
      } catch (e) { log('erro ao ler mensagem:', e.message); }
    }
  }));
}
function falhou(e) {
  const r = R(), { st } = r;
  st.estado = 'erro'; st.erro = String(e && e.message || e).slice(0, 200); publica(); log('falha:', st.erro);
  if (!r.reconectando) { r.reconectando = true; setTimeout(() => { r.reconectando = false; conecta().catch(falhou); }, 30e3); }
}

async function enviaTexto(numero, texto) {
  const jid = jidDoTel(numero);
  const r = await R().sock.sendMessage(jid, { text: texto });
  return r && r.key && r.key.id;
}

async function comando() {
  const c = getConfig('fisguei_robo_cmd');
  if (!c) return;
  setConfig('fisguei_robo_cmd', null);
  log('comando:', c);
  const { sock } = R();
  if (c === 'desconectar') { try { await sock.logout(); } catch {} fs.rmSync(pasta(), { recursive: true, force: true }); }
  if (c === 'reiniciar') { try { sock.end(); } catch {} }
}

async function volta() {
  const r = R(), { st } = r;
  if (st.enviando) return;
  st.enviando = true;
  try {
    await comando();
    if (st.estado !== 'conectado') return publica();
    // 1) respostas automáticas e mensagens do corretor (conversa já aberta: saem na hora)
    for (const m of F.pendentes()) {
      try { const id = await enviaTexto(m.telefone, m.texto); F.marcaPendente(m.id, 'enviada', id); }
      catch (e) { F.marcaPendente(m.id, 'erro: ' + String(e.message).slice(0, 80)); }
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
    }
    // 2) abordagem nova: só no horário, dentro do limite do dia e respeitando o intervalo
    const a = F.ajustes();
    const agora = Date.now();
    if (a.pausado || !F.dentroDoHorario(a) || F.enviadasHoje() >= a.limite_dia || agora < st.proximoEm) return publica();
    const p = F.proximo();
    if (!p) return publica();
    const sock = r.sock;
    const [w] = await sock.onWhatsApp(p.contato.valor).catch(() => [null]);
    if (!w || !w.exists) { F.marcaErro(p.contato.id, 'Número sem WhatsApp', 'sem_whatsapp'); st.proximoEm = agora + 5e3; return publica(); }
    try {
      const id = await sock.sendMessage(w.jid, { text: p.texto }).then((r) => r && r.key && r.key.id);
      F.marcaEnviado(p.contato.id, p.texto, id);
      st.ultimoEnvio = Date.now();
      log(`abordou ${F.ref(p.anuncio.id)} · ${p.contato.nome.split(' ')[0]} · final ${p.contato.valor.slice(-4)}`);
    } catch (e) { F.marcaErro(p.contato.id, e.message); log('envio falhou:', e.message); }
    // intervalo com variação (parece menos com robô e protege o número)
    st.proximoEm = Date.now() + a.intervalo_s * 1000 * (1 + Math.random() * 0.6);
    publica();
  } catch (e) { log('erro na volta:', e.message); }
  finally { st.enviando = false; }
}

// Chamado dentro do contexto da imobiliária (src/pc.js); uma vez por imobiliária.
function iniciar() {
  if (process.env.VERCEL || cfg.FISGUEI_ROBO === '0') return;
  const r = R();
  if (r.timer) return;
  log('iniciando (a tela Fisguei mostra o QR code se precisar conectar)');
  conecta().catch(falhou);
  r.timer = setInterval(volta, TICK_MS);
  r.timerPublica = setInterval(publica, 60e3);
}

// só para os testes: troca o Baileys por um simulado e para os timers
const _teste = { usaBaileys(fn) { carregaBaileys = fn; B = null; }, para() { for (const r of R.todos.values()) { clearInterval(r.timer); clearInterval(r.timerPublica); r.timer = null; } }, pasta, R };

module.exports = { iniciar, estado: () => ({ ...R().st }), _teste };
