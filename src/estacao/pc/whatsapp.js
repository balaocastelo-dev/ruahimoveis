// WhatsApp Web aberto no PC virtual do agente: lê mensagens novas (vão para o cérebro do escritório, como numa linha
// por QR) e manda o que estiver na fila. Usa a biblioteca aberta WA-JS (WPPConnect) dentro da própria página do WhatsApp.
// Atenção: automatizar o WhatsApp Web vai contra as regras do WhatsApp; o número pode ser bloqueado. Quem liga assume isso.
const QR = require('qrcode');
const fs = require('fs');
const WAJS = require.resolve('@wppconnect/wa-js');
let CODIGO_WAJS = null;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '[whatsapp]', ...a);
const URL_WA = 'https://web.whatsapp.com/';

class WhatsAppWeb {
  constructor(pc, aoReceber) {
    this.pc = pc; this.aoReceber = aoReceber; this.pagina = null; this.estado = 'iniciando'; this.numero = null; this.qr = null; this.erro = null;
    this.filtro = 'nao_salvos'; this.abrindo = null; this.ultimoEnvio = 0; this.qrCodigo = null;
  }
  info() { return { estado: this.estado, numero: this.numero, qr: this.estado === 'qr' ? this.qr : null, erro: this.erro }; }

  async garante() {
    if (this.abrindo) return this.abrindo;
    if (this.pagina && !this.pagina.isClosed() && this.pagina.url().startsWith(URL_WA)) return;
    this.abrindo = this.abre().catch((e) => { this.estado = 'erro'; this.erro = e.message.slice(0, 160); log(this.pc.chave, e.message); }).finally(() => { this.abrindo = null; });
    return this.abrindo;
  }
  async abre() {
    await this.pc.liga();
    const ctx = this.pc.ctx;
    this.pagina = this.pc.paginas().find((p) => p.url().startsWith(URL_WA)) || null;
    if (!this.pagina) {
      this.pagina = await this.pc.novaAba();
      // a tela continua na aba em que a pessoa estava; o WhatsApp fica numa aba própria
      await this.pagina.goto(URL_WA, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    const p = this.pagina;
    await p.exposeBinding('__hhMsg', (src, m) => this.chegou(m)).catch(() => {});
    p.on('load', () => this.injeta().catch(() => {}));
    p.on('close', () => { this.pagina = null; this.estado = 'desconectado'; });
    await this.injeta();
  }
  async injeta() {
    const p = this.pagina; if (!p || p.isClosed()) return;
    // o WhatsApp Web não deixa <script> de fora (CSP): o código entra direto pela ferramenta do navegador
    if (!(await p.evaluate(() => !!window.WPP).catch(() => false))) await p.evaluate(CODIGO_WAJS || (CODIGO_WAJS = fs.readFileSync(WAJS, 'utf8')));
    await p.waitForFunction(() => window.WPP && window.WPP.isReady, null, { timeout: 90000 });
    await p.evaluate(() => {
      if (window.__hhLigado) return; window.__hhLigado = true;
      WPP.on('chat.new_message', async (m) => {
        try {
          if (!m || (m.id && m.id.fromMe) || m.isGroupMsg || m.type !== 'chat' || !m.body) return;
          const de = (m.from && m.from._serialized) || String(m.from || '');
          if (!/@(c\.us|lid)$/.test(de)) return;
          let tel = de.endsWith('@c.us') ? de.split('@')[0] : '';
          if (!tel) { try { const e = await WPP.contact.getPnLidEntry(de); tel = e && e.phoneNumber ? String(e.phoneNumber._serialized || e.phoneNumber.id || '').split('@')[0] : ''; } catch {} }
          let salvo = false; try { const c = WPP.contact.get(de); salvo = !!(c && c.isMyContact); } catch {}
          window.__hhMsg({ id: m.id && m.id._serialized, de, tel, texto: m.body, nome: m.notifyName || (m.sender && m.sender.pushname) || '', salvo });
        } catch (e) {}
      });
    });
  }
  async chegou(m) {
    if (!m || !m.tel || !m.texto) return;
    if (this.filtro !== 'todos' && m.salvo) return; // número pessoal: só quem não está salvo na agenda vira cliente
    try { await this.aoReceber({ telefone: m.tel, nome: m.nome, texto: m.texto, wa_id: m.id }); }
    catch (e) { log(this.pc.chave, 'não consegui passar a mensagem para o escritório:', e.message); }
  }
  // Situação a cada batida (QR, conectado, número)
  async confere() {
    const p = this.pagina;
    if (!p || p.isClosed()) { this.estado = 'desconectado'; return this.info(); }
    try {
      const s = await p.evaluate(async () => {
        if (!window.WPP || !WPP.isReady) return { pronto: false };
        const auth = WPP.conn.isAuthenticated();
        let codigo = null; if (!auth) { try { const c = await WPP.conn.getAuthCode(); codigo = c && c.fullCode; } catch {} }
        let eu = null; try { const w = WPP.conn.getMyUserId(); eu = w && (w._serialized || w.user); } catch {}
        return { pronto: true, auth, codigo, eu, main: WPP.conn.isMainReady() };
      });
      if (!s.pronto) { this.estado = 'iniciando'; return this.info(); }
      if (!s.auth) {
        this.estado = 'qr';
        if (s.codigo && s.codigo !== this.qrCodigo) { this.qrCodigo = s.codigo; this.qr = await QR.toDataURL(s.codigo, { margin: 1, width: 240 }); }
      } else { this.estado = s.main ? 'conectado' : 'iniciando'; this.numero = s.eu ? String(s.eu).split('@')[0].replace(/\D/g, '') : this.numero; this.qr = null; this.erro = null; }
    } catch (e) { this.estado = 'erro'; this.erro = e.message.slice(0, 160); }
    return this.info();
  }
  async envia(telefone, texto) {
    if (this.estado !== 'conectado') throw new Error('WhatsApp Web não está conectado');
    // espaçamento humano entre mensagens
    const falta = 4000 + Math.random() * 4000 - (Date.now() - this.ultimoEnvio); if (falta > 0) await espera(falta);
    const r = await this.pagina.evaluate(async ({ tel, texto }) => {
      const id = tel + '@c.us';
      const existe = await WPP.contact.queryExists(id).catch(() => null);
      if (!existe) return { erro: 'número sem WhatsApp' };
      const destino = (existe.wid && existe.wid._serialized) || id;
      try { await WPP.chat.markIsComposing(destino, Math.min(6000, 900 + texto.length * 35)); } catch {}
      await new Promise((r) => setTimeout(r, Math.min(6000, 900 + texto.length * 35)));
      const m = await WPP.chat.sendTextMessage(destino, texto, { createChat: true });
      return { id: m && m.id };
    }, { tel: String(telefone).replace(/\D/g, ''), texto: String(texto) });
    this.ultimoEnvio = Date.now();
    if (r.erro) throw new Error(r.erro);
    return r.id || null;
  }
  // "Ler as não lidas": passa para o escritório as conversas que chegaram antes de o WhatsApp abrir aqui.
  async lerNaoLidas() {
    if (this.estado !== 'conectado') return 0;
    const l = await this.pagina.evaluate(async () => {
      const out = [];
      const chats = await WPP.chat.list({ onlyUsers: true, onlyWithUnreadMessage: true });
      for (const c of chats.slice(0, 40)) {
        const id = c.id._serialized; const n = Math.min(10, c.unreadCount || 1);
        const msgs = await WPP.chat.getMessages(id, { count: n }).catch(() => []);
        let tel = id.endsWith('@c.us') ? id.split('@')[0] : '';
        if (!tel) { try { const e = await WPP.contact.getPnLidEntry(id); tel = e && e.phoneNumber ? String(e.phoneNumber._serialized || '').split('@')[0] : ''; } catch {} }
        const salvo = !!(c.contact && c.contact.isMyContact);
        for (const m of msgs) if (!m.id.fromMe && m.type === 'chat' && m.body) out.push({ id: m.id._serialized, tel, texto: m.body, nome: m.notifyName || (c.contact && c.contact.pushname) || '', salvo });
      }
      return out;
    });
    for (const m of l) await this.chegou(m);
    return l.length;
  }
  async sair() { try { await this.pagina.evaluate(() => WPP.conn.logout()); } catch {} this.estado = 'qr'; this.numero = null; }
}

module.exports = { WhatsAppWeb };
