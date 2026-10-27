// Fisguei → RUAH · roda dentro da página do Fisgar.
// Só observa as respostas que o próprio painel recebe (lista de anúncios, ficha, proprietários e consulta)
// e repassa uma cópia para a extensão. Não faz nenhuma chamada nova e não gasta créditos.
(() => {
  if (window.__fisgueiGancho) return;
  window.__fisgueiGancho = true;
  const INTERESSA = /\/(properties\/getAll|properties\/announce\/getAllInfoById\/[^/?]+|owners\/GetPeople|owners\/GetPersonInfo)(\?|$)/i;
  // últimos pedidos da lista (properties/getAll) que a própria tela fez: servem de modelo para "Puxar a lista filtrada"
  const listas = [];
  const guardaLista = (url, corpo) => {
    try {
      if (!/properties\/getAll/i.test(url) || typeof corpo !== 'string') return;
      const j = JSON.parse(corpo);
      listas.push({ url: new URL(url, location.href).href, corpo: j });
      if (listas.length > 6) listas.shift();
    } catch {}
  };
  // ---------- saldo de créditos do plano ----------
  // O painel do Fisgar mostra o saldo do plano; quando alguma resposta traz esse número, a extensão avisa o sistema.
  // Só lê o número que já veio na tela (não faz chamada nova).
  const CHAVE_SALDO = /^(credits?|creditos?|saldo|saldo_?creditos?|balance|remaining_?credits|credits_?remaining|available_?credits|credits_?available|creditsBalance|remainingCredits|availableCredits|qtd_?creditos|quantidade_?creditos)$/i;
  const CHAVE_PLANO = /^(plan_?credits|credits_?plan|total_?credits|credits_?total|monthly_?credits|creditsPerMonth|limite_?creditos)$/i;
  function achaSaldo(o, caminho = '', prof = 0, out = {}) {
    if (!o || typeof o !== 'object' || prof > 6) return out;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6) {
        if (out.saldo === undefined && CHAVE_SALDO.test(k)) { out.saldo = Math.round(v); out.chave = caminho + k; }
        else if (out.plano === undefined && CHAVE_PLANO.test(k)) out.plano = Math.round(v);
      } else if (typeof v === 'string' && out.saldo === undefined && /cr[eé]dito/i.test(v)) {
        const m = v.match(/(?:possui|tem|restam?|saldo(?: de)?|dispon[ií]ve(?:l|is))\D{0,20}(\d[\d.]*)\s*cr[eé]ditos?/i);
        if (m) { out.saldo = parseInt(m[1].replace(/\./g, ''), 10); out.chave = caminho + k + ' (mensagem)'; }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) achaSaldo(v, caminho + k + '.', prof + 1, out);
    }
    return out;
  }
  const olhaSaldo = (u, json) => {
    try {
      if (/properties\/getAll|getAllInfoById/i.test(u.pathname)) return; // lista de anúncios não traz saldo
      const s = achaSaldo(json);
      if (s.saldo !== undefined) window.postMessage({ __fisgueiCredito: 1, saldo: s.saldo, plano: s.plano ?? null, chave: s.chave, url: u.pathname }, location.origin);
    } catch {}
  };
  const repassa = (url, pedido, texto) => {
    try {
      const u = new URL(url, location.href);
      if (!/router\.fisgar\.com\.br$/i.test(u.hostname)) return;
      if (!INTERESSA.test(u.pathname)) { try { olhaSaldo(u, JSON.parse(texto)); } catch {} return; }
      const json = JSON.parse(texto);
      olhaSaldo(u, json);
      window.postMessage({ __fisguei: 1, url: u.origin + u.pathname, pedido: typeof pedido === 'string' ? pedido : null, json }, location.origin);
    } catch { /* resposta que não é JSON: ignora */ }
  };
  const f0 = window.fetch;
  window.fetch = async function (entrada, opcoes) {
    const r = await f0.apply(this, arguments);
    try {
      const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
      if (url && /router\.fisgar/i.test(url) && r.ok) { guardaLista(url, opcoes && opcoes.body); r.clone().text().then((t) => repassa(url, opcoes && opcoes.body, t)).catch(() => {}); }
    } catch {}
    return r;
  };
  const abre = XMLHttpRequest.prototype.open, envia = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__fgUrl = url; return abre.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (corpo) {
    if (this.__fgUrl && /router\.fisgar/i.test(this.__fgUrl)) {
      this.addEventListener('load', () => {
        try { if (this.status >= 200 && this.status < 300 && (this.responseType === '' || this.responseType === 'text')) { guardaLista(this.__fgUrl, corpo); repassa(this.__fgUrl, corpo, this.responseText); } } catch {}
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
    if (j) olhaSaldo(new URL(API + caminho), j);
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
      // casa com até N pessoas e nenhuma marcada pelo IPTU: consulta todas (costuma ser o dono morando lá)
      if (!cand.length && gente.length <= (c.limite ?? 3)) cand = gente.slice();
      if (cand.length && cand.length <= (c.limite ?? 3)) escolhidos = cand;
    }
    for (const p of escolhidos) {
      await espera(1500 + Math.random() * 2000);
      const pode = await chama('user/CanUseFeature', { search: { key: { document: p.document, name: '', addresses: [] } }, type: 'get_person_info' });
      // data=true: já foi paga por alguém do plano (não cobra). data=false: "essa consulta será cobrada" (gasta 1 crédito).
      // Só para por falta de crédito se o Fisgar disser isso com todas as letras.
      const msg = String((pode && pode.message) || '');
      if (/(sem|n[aã]o (possui|tem|h[aá])|insuficiente|esgotad|acabaram|limite).{0,40}(cr[eé]dito|consulta|saldo)/i.test(msg) && !/ser[aá] cobrada/i.test(msg)) { out.sem_credito = true; out.aviso = msg; break; }
      const jaPaga = (pode && pode.data === true) || /n[aã]o ser[aá] cobrada/i.test(msg);
      const end = enderecoDaPessoa(p, key);
      const corpo = { search: { key: { type: 'DOCUMENT', document: p.document, document_type: p.type, addresses: end ? [end] : [], name: p.name } } };
      const ji = await chama('region/sp/owners/GetPersonInfo', corpo);
      out.consultas.push({ pedido: JSON.stringify(corpo), json: ji, cobrado: !jaPaga });
    }
    return out;
  }
  // ---------- "Puxar a lista filtrada": percorre todas as páginas do filtro que está na tela ----------
  // Listar anúncios não gasta crédito no Fisgar (só "Consultar" proprietário gasta). Vai devagar, uma página a cada 3–6 s.
  const PAGINA = /^(page|pagina|currentpage|pagenumber|page_number|pageindex|numpage)$/i, DESLOC = /^(offset|skip|from|start)$/i;
  function achaChaves(o, caminho = [], out = []) {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' && (PAGINA.test(k) || DESLOC.test(k))) out.push({ caminho: [...caminho, k], tipo: PAGINA.test(k) ? 'pagina' : 'desloc', valor: v });
      else if (v && typeof v === 'object' && !Array.isArray(v)) achaChaves(v, [...caminho, k], out);
    }
    return out;
  }
  const pega = (o, c) => c.reduce((a, k) => (a ? a[k] : undefined), o);
  const poe = (o, c, v) => { let a = o; for (const k of c.slice(0, -1)) a = a[k]; a[c[c.length - 1]] = v; };
  let puxando = null;
  async function puxar(maxPaginas) {
    const modelo = listas[listas.length - 1];
    if (!modelo) throw new Error('Abra a Base de Anúncios do Fisgar e aplique o filtro (Campinas, venda, valor mínimo) antes.');
    const chaves = achaChaves(modelo.corpo);
    const chave = chaves.find((c) => c.tipo === 'pagina') || chaves[0];
    if (!chave) throw new Error('Não achei a paginação deste filtro. Vá para a página 2 no Fisgar e tente de novo.');
    const tok = localStorage.getItem('token');
    if (!tok) throw new Error('O Fisgar está sem login nesta aba.');
    puxando = { paginas: 0, anuncios: 0, parar: false };
    let valor = chave.valor, tam = null;
    for (let i = 0; i < maxPaginas && !puxando.parar; i++) {
      valor = chave.tipo === 'pagina' ? (i === 0 ? chave.valor : valor + 1) : (i === 0 ? chave.valor : valor + (tam || 20));
      const corpo = JSON.parse(JSON.stringify(modelo.corpo)); poe(corpo, chave.caminho, valor);
      const r = await f0.call(window, modelo.url, { method: 'POST', headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json', Authorization: tok }, body: JSON.stringify(corpo) });
      if (r.status === 401 || r.status === 403) throw new Error('O Fisgar pediu login de novo.');
      if (!r.ok) throw new Error(`Fisgar respondeu ${r.status} na página ${i + 1}.`);
      const texto = await r.text();
      let lista = []; try { const j = JSON.parse(texto); lista = Array.isArray(j.data) ? j.data : (j.data && Array.isArray(j.data.data) ? j.data.data : []); } catch {}
      if (!lista.length) break;
      tam = lista.length;
      repassa(modelo.url, JSON.stringify(corpo), texto);
      puxando.paginas++; puxando.anuncios += lista.length;
      window.postMessage({ __fisgueiPuxando: 1, paginas: puxando.paginas, anuncios: puxando.anuncios }, location.origin);
      await espera(3000 + Math.random() * 3000);
    }
    const fim = { paginas: puxando.paginas, anuncios: puxando.anuncios, parou: puxando.parar };
    puxando = null;
    return fim;
  }
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__fisgueiPuxar === 1) {
      try { const r = await puxar(e.data.max || 400); window.postMessage({ __fisgueiPuxou: 1, ok: true, ...r }, location.origin); }
      catch (err) { puxando = null; window.postMessage({ __fisgueiPuxou: 1, ok: false, erro: String(err.message || err) }, location.origin); }
    }
    if (e.data.__fisgueiPararPuxar === 1 && puxando) puxando.parar = true;
  });

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.__fisgueiExec !== 1) return;
    const { id, pedido } = e.data;
    try { const resultado = await executa(pedido); window.postMessage({ __fisgueiFeito: 1, id, ok: true, resultado }, location.origin); }
    catch (err) { window.postMessage({ __fisgueiFeito: 1, id, ok: false, erro: String(err && err.message || err), volta: !!(err && err.volta) }, location.origin); }
  });
})();
