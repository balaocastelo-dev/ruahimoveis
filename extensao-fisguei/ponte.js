// Fisguei → RUAH · ponte entre a página do Fisgar e a extensão, mais o selo no canto da tela.
(() => {
  let selo = null;
  const mostra = (st) => {
    if (!document.body) return;
    if (!selo) {
      selo = document.createElement('div');
      selo.setAttribute('style', 'position:fixed;left:12px;bottom:12px;z-index:2147483647;font:600 12px/1.2 system-ui,sans-serif;padding:7px 11px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.25);color:#fff;cursor:default;user-select:none');
      selo.title = 'Fisguei → RUAH: o que você abre aqui vai para o Sistema RUAH';
      document.body.appendChild(selo);
    }
    const cor = st.erro ? '#c0392b' : st.configurada ? '#2e7d4f' : '#8a6d2b';
    selo.style.background = cor;
    selo.textContent = st.erro ? `Fisguei: ${st.erro}` : st.configurada ? `Fisguei ✓ ${st.anuncios} anúncio(s) · ${st.pessoas} pessoa(s) hoje${st.buscas ? ` · ${st.buscas} busca(s) do robô` : ''}${st.robo && /limite/.test(st.robo) ? ' · ' + st.robo : ''}${st.fila ? ` · enviando ${st.fila}` : ''}` : 'Fisguei: abra a extensão e cole a chave';
  };
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__fisguei !== 1) return;
    try { chrome.runtime.sendMessage({ tipo: 'captura', item: { url: e.data.url, pedido: e.data.pedido, json: e.data.json } }, (st) => { if (st) mostra(st); }); } catch {}
  });
  // Robô "Buscar dados": a extensão manda a busca, a página do Fisgar executa e devolve.
  const esperando = new Map();
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__fisgueiFeito !== 1) return;
    const r = esperando.get(e.data.id); if (r) { esperando.delete(e.data.id); r(e.data); }
  });
  chrome.runtime.onMessage.addListener((m, quem, responde) => {
    if (!m || m.tipo !== 'executar') return false;
    const id = Math.random().toString(36).slice(2);
    const t = setTimeout(() => { if (esperando.has(id)) { esperando.delete(id); responde({ ok: false, erro: 'O Fisgar demorou demais para responder.', volta: true }); } }, 120000);
    esperando.set(id, (d) => { clearTimeout(t); responde(d); });
    window.postMessage({ __fisgueiExec: 1, id, pedido: m.pedido }, location.origin);
    if (selo) selo.textContent = `Fisguei: buscando ${m.pedido.ref} no Fisgar…`;
    return true;
  });
  const pede = () => { try { chrome.runtime.sendMessage({ tipo: 'estado' }, (st) => { if (st) mostra(st); }); } catch {} };
  document.addEventListener('DOMContentLoaded', pede);
  setInterval(pede, 5000);
})();
