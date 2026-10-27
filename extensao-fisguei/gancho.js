// Fisguei → RUAH · roda dentro da página do Fisgar.
// Só observa as respostas que o próprio painel recebe (lista de anúncios, ficha, proprietários e consulta)
// e repassa uma cópia para a extensão. Não faz nenhuma chamada nova e não gasta créditos.
(() => {
  if (window.__fisgueiGancho) return;
  window.__fisgueiGancho = true;
  const INTERESSA = /\/(properties\/getAll|properties\/announce\/getAllInfoById\/[^/?]+|owners\/GetPeople|owners\/GetPersonInfo)(\?|$)/i;
  const repassa = (url, pedido, texto) => {
    try {
      const u = new URL(url, location.href);
      if (!/router\.fisgar\.com\.br$/i.test(u.hostname) || !INTERESSA.test(u.pathname)) return;
      const json = JSON.parse(texto);
      window.postMessage({ __fisguei: 1, url: u.origin + u.pathname, pedido: typeof pedido === 'string' ? pedido : null, json }, location.origin);
    } catch { /* resposta que não é JSON: ignora */ }
  };
  const f0 = window.fetch;
  window.fetch = async function (entrada, opcoes) {
    const r = await f0.apply(this, arguments);
    try {
      const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
      if (url && /router\.fisgar/i.test(url) && r.ok) r.clone().text().then((t) => repassa(url, opcoes && opcoes.body, t)).catch(() => {});
    } catch {}
    return r;
  };
  const abre = XMLHttpRequest.prototype.open, envia = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__fgUrl = url; return abre.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (corpo) {
    if (this.__fgUrl && /router\.fisgar/i.test(this.__fgUrl)) {
      this.addEventListener('load', () => {
        try { if (this.status >= 200 && this.status < 300 && (this.responseType === '' || this.responseType === 'text')) repassa(this.__fgUrl, corpo, this.responseText); } catch {}
      });
    }
    return envia.apply(this, arguments);
  };
})();
