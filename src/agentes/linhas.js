// Linhas de WhatsApp dos agentes (QR code / aparelho conectado), uma sessão por agente. Roda só no PC.
// O TH-IA-GO (captador) usa a linha do robô do Fisguei (src/fisguei/robo.js); os outros 8 ficam aqui.
// Cada linha só liga depois que alguém clica em "Conectar" na mesa do agente (ou se já tem sessão salva).
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { getConfig, setConfig } = require('../db');
const C = require('./catalogo');
const pc = require('../pc');

// Multi-imobiliária: o processo das linhas (src/agentes/servico.js) roda uma imobiliária só, mas o estado fica
// separado por imobiliária mesmo assim (seguro se um dia rodarem duas no mesmo processo). Sessão da RUAH continua em
// data/whatsapp-agente-<agente>; das novas em data/<slug>/whatsapp-agente-<agente> (src/pc.js).
const EST = pc.estadoPor(() => ({ linhas: {}, aoReceber: null })); // LINHAS: agente → { sock, st, reconectando }
let B = null;
let carregaBaileys = () => import('baileys'); // trocado nos testes (test/pc-multi.js)
const pasta = (slug) => pc.pastaDados(`whatsapp-agente-${slug}`);
const temSessao = (slug) => fs.existsSync(path.join(pasta(slug), 'creds.json'));
const log = (slug, ...a) => console.log(new Date().toLocaleTimeString('pt-BR'), `[agente ${slug}]`, ...a);
const telDoJid = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const normTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };

function publica(slug) {
  const l = EST().linhas[slug];
  const st = l ? l.st : { estado: 'parada' };
  try { setConfig('agente_wa:' + slug, JSON.stringify({ estado: st.estado, qr: st.qr || null, numero: st.numero || null, erro: st.erro || null, em: new Date().toISOString(), ultimo_envio: st.ultimoEnvio || null })); }
  catch (e) { log(slug, 'não consegui gravar o estado:', e.message); }
}

async function conecta(slug) {
  if (!B) B = await carregaBaileys();
  const pino = (await import('pino')).default;
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B;
  const l = EST().linhas[slug] || (EST().linhas[slug] = { st: { estado: 'iniciando' }, reconectando: false, parar: false });
  // nunca duas conexões na mesma sessão (o WhatsApp derruba as duas e o QR code não conecta)
  if (l.abrindo) return;
  l.abrindo = true;
  if (l.sock) { try { l.sock.ev.removeAllListeners(); l.sock.end(); } catch {} l.sock = null; }
  l.parar = false;
  l.st = { ...l.st, estado: 'iniciando', erro: null }; publica(slug);
  fs.mkdirSync(pasta(slug), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(pasta(slug));
  let version; try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* versão embutida */ }
  l.abrindo = false;
  const sock = makeWASocket({ auth: state, version, logger: pino({ level: 'silent' }), browser: Browsers.windows(`${cfg.CLIENTE_NOME} ${C.POR_SLUG[slug].nome}`), markOnlineOnConnect: false, syncFullHistory: false });
  l.sock = sock;
  // pc.liga: os eventos do Baileys voltam sempre para a imobiliária desta linha
  sock.ev.on('creds.update', pc.liga(saveCreds));
  sock.ev.on('connection.update', pc.liga(async (u) => {
    if (l.sock !== sock) return;
    if (u.qr) {
      l.st = { ...l.st, estado: 'qr', erro: null };
      try { l.st.qr = await require('qrcode').toDataURL(u.qr, { margin: 1, width: 320 }); } catch { l.st.qr = null; }
      publica(slug);
    }
    if (u.connection === 'open') { l.st = { ...l.st, estado: 'conectado', qr: null, erro: null, numero: telDoJid(sock.user && sock.user.id) }; publica(slug); log(slug, 'conectado como', l.st.numero); }
    if (u.connection === 'close') {
      if (l.sock !== sock) return; // conexão antiga, já substituída
      const codigo = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      const saiu = codigo === DisconnectReason.loggedOut;
      l.sock = null;
      if (saiu) fs.rmSync(pasta(slug), { recursive: true, force: true });
      if (l.parar || saiu) { l.st = { estado: saiu ? 'desconectado' : 'parada', erro: saiu ? 'O aparelho foi desconectado no celular. Clique em Conectar e leia o QR code de novo.' : null }; publica(slug); return; }
      l.st = { ...l.st, estado: 'reconectando', qr: null }; publica(slug);
      if (!l.reconectando) { l.reconectando = true; setTimeout(() => { l.reconectando = false; conecta(slug).catch((e) => falhou(slug, e)); }, 8e3); }
    }
  }));
  sock.ev.on('messages.upsert', pc.liga(async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const jid = m.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;
        let pn = m.key.remoteJidAlt && !String(m.key.remoteJidAlt).endsWith('@lid') ? m.key.remoteJidAlt : null;
        if (!pn && jid.endsWith('@lid')) { try { pn = await sock.signalRepository.lidMapping.getPNForLID(jid); } catch {} }
        if (!pn && !jid.endsWith('@lid')) pn = jid;
        if (!pn) continue;
        const msg = m.message.ephemeralMessage ? m.message.ephemeralMessage.message : m.message;
        const texto = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text)
          || (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedDisplayText)
          || (msg.imageMessage ? `[foto] ${msg.imageMessage.caption || ''}`.trim() : msg.audioMessage ? '[áudio — o cliente mandou um áudio; peça para escrever ou diga que o corretor ouve]' : msg.documentMessage ? '[documento]' : msg.locationMessage ? '[localização]' : '[mensagem]');
        const aoReceber = EST().aoReceber;
        if (aoReceber) await aoReceber({ linha: slug, telefone: telDoJid(pn), nome: m.pushName || null, texto, wa_id: m.key.id });
      } catch (e) { log(slug, 'erro ao ler mensagem:', e.message); }
    }
  }));
}
function falhou(slug, e) {
  const l = EST().linhas[slug] || (EST().linhas[slug] = { st: {} });
  l.abrindo = false;
  l.st = { estado: 'erro', erro: String(e && e.message || e).slice(0, 200) }; publica(slug); log(slug, 'falha:', l.st.erro);
  if (!l.reconectando && !l.parar) { l.reconectando = true; setTimeout(() => { l.reconectando = false; conecta(slug).catch((x) => falhou(slug, x)); }, 30e3); }
}

async function comandos() {
  for (const a of C.AGENTES) {
    if (a.slug === 'captador') continue;
    const c = getConfig('agente_cmd:' + a.slug);
    if (!c) continue;
    setConfig('agente_cmd:' + a.slug, null);
    log(a.slug, 'comando:', c);
    const l = EST().linhas[a.slug];
    if (c === 'conectar') { if (!l || !l.sock) conecta(a.slug).catch((e) => falhou(a.slug, e)); }
    if (c === 'reiniciar') conecta(a.slug).catch((e) => falhou(a.slug, e));
    if (c === 'desconectar') {
      if (l) { l.parar = true; try { await l.sock.logout(); } catch {} try { l.sock && l.sock.end(); } catch {} l.sock = null; l.st = { estado: 'parada' }; }
      fs.rmSync(pasta(a.slug), { recursive: true, force: true });
      publica(a.slug);
    }
  }
}

const conectada = (slug) => !!(EST().linhas[slug] && EST().linhas[slug].sock && EST().linhas[slug].st.estado === 'conectado');
async function enviar(slug, telefone, texto) {
  const l = EST().linhas[slug];
  if (!conectada(slug)) throw new Error('linha desconectada');
  const [w] = await l.sock.onWhatsApp(normTel(telefone)).catch(() => [null]);
  const jid = w && w.exists ? w.jid : `${normTel(telefone)}@s.whatsapp.net`;
  if (w && w.exists === false) throw new Error('número sem WhatsApp');
  const r = await l.sock.sendMessage(jid, { text: texto });
  l.st.ultimoEnvio = new Date().toISOString();
  return r && r.key && r.key.id;
}

function iniciar(receber) {
  EST().aoReceber = receber;
  for (const a of C.AGENTES) {
    if (a.slug === 'captador') continue;
    if (temSessao(a.slug)) conecta(a.slug).catch((e) => falhou(a.slug, e));
    else publica(a.slug);
  }
  setInterval(() => C.AGENTES.forEach((a) => a.slug !== 'captador' && publica(a.slug)), 60e3);
}

// só para os testes: troca o Baileys por um simulado
const _teste = { usaBaileys(fn) { carregaBaileys = fn; B = null; }, pasta, EST, conecta };

module.exports = { iniciar, comandos, enviar, conectada, _teste };
