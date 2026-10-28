// Fisguei → Herrera HOUSE IA · envia ao Herrera HOUSE IA o que a página do Fisgar recebeu (em lotes, com nova tentativa se falhar).
const PADRAO = 'https://ruahimoveis.vercel.app';
let fila = [];
let enviando = false;
const st = { erro: null, anuncios: 0, pessoas: 0, dia: '' };

const hoje = () => new Date().toLocaleDateString('sv-SE');
async function config() { const c = await chrome.storage.local.get(['url', 'chave', 'cont']); return { url: (c.url || PADRAO).replace(/\/+$/, ''), chave: c.chave || '', cont: c.cont || {} }; }
async function estado() {
  const c = await config();
  const k = c.cont[hoje()] || { anuncios: 0, pessoas: 0 };
  return { configurada: !!c.chave, erro: st.erro, anuncios: k.anuncios, pessoas: k.pessoas, fila: fila.length, buscas: st.buscas || 0, robo: st.robo || null };
}
async function conta(r) {
  const c = await config(); const d = hoje();
  const k = c.cont[d] || { anuncios: 0, pessoas: 0 };
  k.anuncios += r.anuncios || 0; k.pessoas += r.pessoas || 0;
  await chrome.storage.local.set({ cont: { [d]: k } });
}
async function envia() {
  if (enviando || !fila.length) return;
  const c = await config();
  if (!c.chave) { st.erro = null; return; }
  enviando = true;
  const lote = fila.slice(0, 20);
  try {
    const r = await fetch(c.url + '/fisguei-api/receber', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fisguei-Chave': c.chave }, body: JSON.stringify({ itens: lote }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { st.erro = 'chave inválida — gere outra no sistema'; return; }
    if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
    fila = fila.slice(lote.length);
    st.erro = null;
    await conta(j);
  } catch (e) {
    st.erro = 'sem conexão com o sistema (tento de novo)';
  } finally { enviando = false; }
  if (fila.length && !st.erro) setTimeout(envia, 500);
}
// saldo de créditos lido no Fisgar: manda no máximo uma vez por minuto (ou quando muda)
let ultimoSaldo = { v: null, em: 0 };
async function enviaSaldo(m) {
  const c = await config();
  if (!c.chave || !Number.isFinite(m.saldo)) return;
  if (m.saldo === ultimoSaldo.v && Date.now() - ultimoSaldo.em < 60000) return;
  ultimoSaldo = { v: m.saldo, em: Date.now() };
  try { await fetch(c.url + '/fisguei-api/creditos', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fisguei-Chave': c.chave }, body: JSON.stringify({ saldo: m.saldo, plano: m.plano, chave: m.chave, url: m.url }) }); } catch {}
}
chrome.runtime.onMessage.addListener((m, quem, responde) => {
  if (m && m.tipo === 'credito') { enviaSaldo(m); return false; }
  if (m && m.tipo === 'captura' && m.item) {
    fila.push(m.item);
    if (fila.length > 300) fila = fila.slice(-300);
    setTimeout(envia, 800);
  }
  if (m && m.tipo === 'testar') {
    (async () => {
      const c = await config();
      try {
        const r = await fetch(c.url + '/fisguei-api/ping', { headers: { 'X-Fisguei-Chave': c.chave } });
        const j = await r.json().catch(() => ({}));
        responde(r.ok ? { ok: true } : { ok: false, erro: j.erro || `erro ${r.status}` });
        if (r.ok) { st.erro = null; envia(); }
      } catch (e) { responde({ ok: false, erro: 'Não consegui falar com ' + c.url }); }
    })();
    return true;
  }
  if (m && (m.tipo === 'estado' || m.tipo === 'captura')) { estado().then(responde); return true; }
  return false;
});
setInterval(envia, 15000);

// ---------- robô "Buscar dados" ----------
// Com o Fisgar aberto em alguma aba, pergunta ao sistema se há busca na fila e manda a aba executar.
let buscando = false;
async function buscaPedidos() {
  if (buscando) return;
  const c = await config();
  if (!c.chave) return;
  buscando = true;
  try {
    const abas = await chrome.tabs.query({ url: 'https://painel.fisgar.com.br/*' });
    const aba = abas.find((t) => !/\/entrar/.test(t.url || '')) || null;
    const r = await fetch(`${c.url}/fisguei-api/pedidos/proximo?fisgar=${aba ? 1 : 0}`, { headers: { 'X-Fisguei-Chave': c.chave } });
    if (!r.ok) return;
    const j = await r.json();
    st.robo = j.motivo || null;
    if (!j.pedido || !aba) return;
    let res;
    try { res = await chrome.tabs.sendMessage(aba.id, { tipo: 'executar', pedido: j.pedido }); }
    catch { res = { ok: false, erro: 'Recarregue a aba do Fisgar (F5) para o robô funcionar.', volta: true }; }
    const corpo = res && res.ok ? res.resultado : { erro: (res && res.erro) || 'Falhou no Fisgar.', erro_volta: !!(res && res.volta) };
    await fetch(`${c.url}/fisguei-api/pedidos/${j.pedido.id}/resultado`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fisguei-Chave': c.chave }, body: JSON.stringify(corpo) });
    st.buscas = (st.buscas || 0) + 1;
    if (res && res.ok) setTimeout(buscaPedidos, 4000 + Math.random() * 4000); // tem mais na fila? segue, com calma
  } catch { /* sem conexão: tenta na próxima volta */ }
  finally { buscando = false; }
}
chrome.alarms.create('fisguei-busca', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'fisguei-busca') buscaPedidos(); });
setInterval(buscaPedidos, 20000);
