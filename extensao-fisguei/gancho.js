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
  // ---------- robô "Buscar dados": faz no Fisgar o mesmo que a tela "Pesquisar Proprietários" faz ----------
  // Usa o login que já está aberto nesta aba. Cada busca de endereço e cada "Consultar" gasta crédito do plano,
  // como na tela. O Fisgar avisa antes se a consulta já foi paga (aí não cobra de novo).
  const API = 'https://router.fisgar.com.br/api123/v1/api/';
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  async function chama(caminho, corpo) {
    const tok = localStorage.getItem('token');
    if (!tok) { const e = new Error('O Fisgar está sem login nesta aba. Entre de novo no Fisgar.'); e.volta = true; throw e; }
    const r = await f0.call(window, API + caminho, { method: 'POST', headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json', Authorization: tok }, body: JSON.stringify(corpo) });
    let j = null; try { j = await r.json(); } catch {}
    if (r.status === 401 || r.status === 403) { const e = new Error('O Fisgar pediu login de novo.'); e.volta = true; throw e; }
    if (!r.ok) throw new Error((j && (j.message || j.mensagem)) || `Fisgar respondeu ${r.status}`);
    return j;
  }
  function enderecoDaPessoa(p, key) {
    const ends = Array.isArray(p.addresses) ? p.addresses : [];
    return ends.find((e) => e.iptuMatch && String(e.zipcode || e.zipCode).padStart(8, '0') === key.zipcode) || ends.find((e) => e.iptuMatch) || ends[0] || null;
  }
  async function executa(pedido) {
    const key = pedido.key;
    const corpoPessoas = { search: { type: 'IPTU_ADDRESS', key } };
    const jp = await chama('region/sp/owners/GetPeople', corpoPessoas);
    const gente = (jp && jp.data && Array.isArray(jp.data.people)) ? jp.data.people : [];
    const out = { pessoas: { pedido: JSON.stringify(corpoPessoas), json: jp, cobrado: true }, consultas: [], aviso: jp && jp.notification_alert && jp.notification_alert.message || null };
    // quem consultar
    let escolhidos = [];
    const c = pedido.consultar || {};
    if (c.modo === 'nomes') {
      for (const n of c.nomes || []) {
        const achou = gente.find((p) => semAcento(p.name) === semAcento(n.nome) && (!n.unidade || semAcento((enderecoDaPessoa(p, key) || {}).extra) === semAcento(n.unidade)))
          || gente.find((p) => semAcento(p.name) === semAcento(n.nome));
        if (achou) escolhidos.push(achou);
      }
    } else {
      let cand = gente.filter((p) => (enderecoDaPessoa(p, key) || {}).iptuMatch);
      if (c.unidade) { const u = semAcento(c.unidade).replace(/\D/g, ''); const daUnid = cand.filter((p) => semAcento((enderecoDaPessoa(p, key) || {}).extra).replace(/\D/g, '') === u); if (daUnid.length) cand = daUnid; }
      if (cand.length && cand.length <= (c.limite ?? 3)) escolhidos = cand;
    }
    for (const p of escolhidos) {
      await espera(1500 + Math.random() * 2000);
      const pode = await chama('user/CanUseFeature', { search: { key: { document: p.document, name: '', addresses: [] } }, type: 'get_person_info' });
      if (pode && pode.data === false) { out.sem_credito = true; break; }
      const jaPaga = /n[aã]o ser[aá] cobrada/i.test((pode && pode.message) || '');
      const end = enderecoDaPessoa(p, key);
      const corpo = { search: { key: { type: 'DOCUMENT', document: p.document, document_type: p.type, addresses: end ? [end] : [], name: p.name } } };
      const ji = await chama('region/sp/owners/GetPersonInfo', corpo);
      out.consultas.push({ pedido: JSON.stringify(corpo), json: ji, cobrado: !jaPaga });
    }
    return out;
  }
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.__fisgueiExec !== 1) return;
    const { id, pedido } = e.data;
    try { const resultado = await executa(pedido); window.postMessage({ __fisgueiFeito: 1, id, ok: true, resultado }, location.origin); }
    catch (err) { window.postMessage({ __fisgueiFeito: 1, id, ok: false, erro: String(err && err.message || err), volta: !!(err && err.volta) }, location.origin); }
  });
})();
