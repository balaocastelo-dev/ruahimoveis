// Fisguei → RUAH · envia ao Sistema RUAH o que a página do Fisgar recebeu (em lotes, com nova tentativa se falhar).
const PADRAO = 'https://ruahimoveis.vercel.app';
let fila = [];
let enviando = false;
const st = { erro: null, anuncios: 0, pessoas: 0, dia: '' };

const hoje = () => new Date().toLocaleDateString('sv-SE');
async function config() { const c = await chrome.storage.local.get(['url', 'chave', 'cont']); return { url: (c.url || PADRAO).replace(/\/+$/, ''), chave: c.chave || '', cont: c.cont || {} }; }
async function estado() {
  const c = await config();
  const k = c.cont[hoje()] || { anuncios: 0, pessoas: 0 };
  return { configurada: !!c.chave, erro: st.erro, anuncios: k.anuncios, pessoas: k.pessoas, fila: fila.length };
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
chrome.runtime.onMessage.addListener((m, quem, responde) => {
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
