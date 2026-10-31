// Painel do gestor · Investor Dashboard (simulação ao vivo).
// /gestor/dashboard toca do mês 1 até "hoje" (fim do ano de história); /gestor/projecao toca de hoje até o fim da projeção.
// Tudo é calculado no navegador a partir das premissas (guardadas neste aparelho). Nada vem do banco.
// Modelo: a plataforma ganha a mensalidade de cada imobiliária + uma parte da comissão de cada venda
// (valor do imóvel × comissão da imobiliária × parte da plataforma).
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAGINA = document.body.dataset.pagina || 'dashboard';
  const NOMES = ['Horizonte', 'Onde morar?', 'Cadê meu AP?', 'Casa Prado', 'Lumen'];
  const BAIRROS = ['Cambuí', 'Nova Campinas', 'Taquaral', 'Barão Geraldo', 'Sousas', 'Guanabara', 'Alphaville', 'Swiss Park', 'Gramado', 'Bosque', 'Castelo', 'Jardim das Paineiras', 'Mansões Santo Antônio', 'Parque Prado', 'Chácara Primavera'];
  const PADRAO = { anos_historia: 5, anos_projecao: 10, novas_por_ano: 1, rampa: '4, 8, 12, 24, 48', crescimento_depois: 0,
    ticket: 1000000, comissao: 6, parte: 20, mensalidade: 797, multiplo: 6 };
  const CENARIOS = {
    'Conservador': { novas_por_ano: 1, ticket: 600000, parte: 15, mensalidade: 497 },
    'Base': { novas_por_ano: 6, ticket: 800000, parte: 20, mensalidade: 797 },
    'Escala': { novas_por_ano: 24, ticket: 900000, parte: 20, mensalidade: 997 },
    'Nacional': { novas_por_ano: 52, ticket: 750000, parte: 20, mensalidade: 1497 },
  };
  const CHAVE = 'gestor.simulacao.v1';
  let P;
  try { P = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch { P = { ...PADRAO }; }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(P)); } catch {} };
  const calmo = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- formatos ----------
  const brl = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const curto = (v) => {
    const a = Math.abs(v), f = (x, c) => x.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    if (a >= 1e9) return 'R$ ' + f(v / 1e9, 2) + ' bi';
    if (a >= 1e6) return 'R$ ' + f(v / 1e6, a >= 1e8 ? 0 : 1) + ' mi';
    if (a >= 1e3) return 'R$ ' + f(v / 1e3, 0) + ' mil';
    return brl(v);
  };
  const int = (v) => Math.round(v).toLocaleString('pt-BR');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rotMes = (m) => `${MESES[m % 12]} · ano ${Math.floor(m / 12) + 1}`;

  // ---------- o modelo ----------
  const rampa = () => String(P.rampa).split(/[,;\s]+/).map(Number).filter((n) => n >= 0);
  function vendasNoAno(idade) {
    const r = rampa(); if (!r.length || idade < 1) return 0;
    if (idade <= r.length) return r[idade - 1];
    return r[r.length - 1] * Math.pow(1 + Number(P.crescimento_depois) / 100, idade - r.length);
  }
  const porVenda = () => Number(P.ticket) * Number(P.comissao) / 100 * Number(P.parte) / 100;
  const nPorAno = () => Math.max(1, Math.round(Number(P.novas_por_ano)));
  const anoDeEntrada = (k) => Math.ceil(k / nPorAno());
  const nomeDa = (k) => NOMES[k - 1] || `Imobiliária ${k}`;
  const HIST = () => Math.max(1, Number(P.anos_historia)) * 12;
  const TOTAL = () => (Math.max(1, Number(P.anos_historia)) + Math.max(0, Number(P.anos_projecao))) * 12;

  let M = [];          // meses
  function calcula() {
    M = [];
    const anos = TOTAL() / 12, n = nPorAno();
    let acum = 0;
    for (let m = 0; m < anos * 12; m++) {
      const ano = Math.floor(m / 12) + 1;
      let imobs = 0, vendas = 0; const coortes = new Array(anos).fill(0);
      for (let s = 1; s <= ano; s++) {            // cada safra (ano de entrada) tem n imobiliárias iguais
        const v = vendasNoAno(ano - s + 1) / 12;
        imobs += n; vendas += v * n; coortes[s - 1] += n * (v * porVenda() + Number(P.mensalidade));
      }
      const mensal = imobs * Number(P.mensalidade), comissao = vendas * porVenda(), total = mensal + comissao;
      acum += total;
      M.push({ m, ano, imobs, vendas, mensal, comissao, total, acum, vgv: vendas * Number(P.ticket), coortes });
    }
  }
  const anual = (ano) => M.filter((x) => x.ano === ano).reduce((a, x) => ({ total: a.total + x.total, vendas: a.vendas + x.vendas, mensal: a.mensal + x.mensal, comissao: a.comissao + x.comissao, vgv: a.vgv + x.vgv, imobs: Math.max(a.imobs, x.imobs) }), { total: 0, vendas: 0, mensal: 0, comissao: 0, vgv: 0, imobs: 0 });

  // ---------- estado da reprodução ----------
  let atual = 0, tocando = false, vel = 1, ultimoT = 0, acumuladoMs = 0, alvoParada = null;
  const MS_POR_MES = 260;

  // ---------- tela ----------
  function casca() {
    const link = (h, t, k) => `<a class="bi-aba ${PAGINA === k ? 'on' : ''}" href="${h}">${t}</a>`;
    return `<div class="bi">
    <header class="bi-topo">
      <div class="bi-marca"><span class="bi-logo">H</span><div><b>Herrera HOUSE IA</b><small>Investor dashboard</small></div></div>
      <nav class="bi-abas">${link('/gestor', 'Imobiliárias', 'imobs')}${link('/gestor/cerebro', 'Cérebro', 'cerebro')}${link('/gestor/dashboard', 'Dashboard', 'dashboard')}${link('/gestor/projecao', 'Projeção', 'projecao')}</nav>
      <div class="bi-ao-vivo"><i></i>simulação ao vivo</div>
      <div class="bi-sp"></div>
      <button class="bi-btn" id="b-premissas" title="Premissas">⚙ Premissas</button>
      <button class="bi-btn" id="b-tela" title="Tela cheia">⛶ Apresentar</button>
    </header>
    <section class="bi-cenarios"><span>Cenário</span>${Object.keys(CENARIOS).map((c) => `<button class="bi-chip" data-cen="${esc(c)}">${esc(c)}</button>`).join('')}<span class="bi-dica" id="dica-cen"></span></section>
    <section class="bi-kpis" id="kpis"></section>
    <section class="bi-grade">
      <div class="bi-painel bi-g8"><div class="bi-cab"><h3>Faturamento mês a mês</h3><span class="bi-leg"><i class="c1"></i>total <i class="c2"></i>mensalidades <i class="c3"></i>caminho projetado</span></div><div id="area" class="bi-area"></div></div>
      <div class="bi-painel bi-g4"><div class="bi-cab"><h3>De onde vem o dinheiro</h3><span class="bi-sub" id="ano-mix"></span></div><div id="donut" class="bi-donut"></div>
        <div class="bi-relogio"><small>A plataforma fatura</small><b id="por-hora">–</b><small id="por-hora-sub">por hora, 24 h por dia</small></div></div>
      <div class="bi-painel bi-g6"><div class="bi-cab"><h3>Rede de imobiliárias</h3><span class="bi-sub" id="rede-sub"></span></div><canvas id="rede" class="bi-rede"></canvas><div class="bi-leg2"><span><i class="d1"></i>acabou de entrar</span><span><i class="d2"></i>vendendo</span><span><i class="d3"></i>venda acontecendo</span></div></div>
      <div class="bi-painel bi-g6"><div class="bi-cab"><h3>Safras: quanto rende cada turma de imobiliárias</h3><span class="bi-sub">cor = ano em que entrou</span></div><div id="coortes" class="bi-coortes"></div></div>
      <div class="bi-painel bi-g4"><div class="bi-cab"><h3>Vendas acontecendo</h3><span class="bi-sub" id="feed-sub"></span></div><ul id="feed" class="bi-feed"></ul></div>
      <div class="bi-painel bi-g8"><div class="bi-cab"><h3>Ano a ano</h3><span class="bi-sub">o ano em curso fica aceso</span></div><div id="tabela" class="bi-tab"></div></div>
    </section>
    <footer class="bi-tempo">
      <button class="bi-play" id="b-play" aria-label="Tocar ou pausar">▶</button>
      <div class="bi-trilho"><input type="range" id="t" min="0" max="${TOTAL() - 1}" value="0" aria-label="Linha do tempo"><div class="bi-marcos" id="marcos"></div></div>
      <div class="bi-quando" id="quando"></div>
      <div class="bi-vel">${[1, 2, 4].map((v) => `<button data-v="${v}" class="${v === vel ? 'on' : ''}">${v}×</button>`).join('')}</div>
    </footer>
    <aside class="bi-gaveta" id="gaveta" hidden><div class="bi-cab"><h3>Premissas</h3><button class="bi-btn" id="b-fecha" aria-label="Fechar">✕</button></div>
      <form id="f-sim">${[
        ['novas_por_ano', 'Imobiliárias novas por ano'], ['ticket', 'Valor médio do imóvel (R$)'], ['comissao', 'Comissão da imobiliária (%)'],
        ['parte', 'Parte da plataforma na comissão (%)'], ['mensalidade', 'Mensalidade (R$)'], ['rampa', 'Vendas por ano de cada imobiliária (1º, 2º, 3º...)'],
        ['crescimento_depois', 'Crescimento depois da rampa (% ao ano)'], ['anos_historia', 'Anos até hoje'], ['anos_projecao', 'Anos de projeção'],
        ['multiplo', 'Múltiplo de valor (× receita anual)']].map(([k, r]) => `<label><span>${r}</span><input name="${k}" value="${esc(P[k])}"></label>`).join('')}
        <button class="bi-btn" type="button" id="b-padrao">Voltar ao padrão</button>
        <p class="bi-nota">Simulação: os números vêm destas premissas, não do banco. O valor da empresa é só a receita anualizada × o múltiplo escolhido.</p></form></aside>
    </div>`;
  }

  // ---------- KPIs ----------
  const KPIS = [
    { k: 'mes', rot: 'Faturamento no mês', f: curto, v: (x) => x.total },
    { k: 'arr', rot: 'Receita anualizada (ARR)', f: curto, v: (x) => x.total * 12 },
    { k: 'acum', rot: 'Acumulado', f: curto, v: (x) => x.acum },
    { k: 'imobs', rot: 'Imobiliárias ativas', f: int, v: (x) => x.imobs },
    { k: 'vendas', rot: 'Vendas no mês', f: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 }), v: (x) => x.vendas },
    { k: 'valor', rot: 'Valor estimado da empresa', f: curto, v: (x) => x.total * 12 * Number(P.multiplo), nota: () => `${P.multiplo}× a receita anual` },
  ];
  const mostrado = {};
  function montaKpis() {
    $('#kpis').innerHTML = KPIS.map((k) => `<div class="bi-kpi" data-k="${k.k}"><small>${k.rot}</small><b>–</b><div class="bi-kpi-pe"><span class="bi-delta"></span><svg class="bi-spark" viewBox="0 0 120 32" preserveAspectRatio="none"><path class="a"/><path class="l"/></svg></div></div>`).join('');
  }
  function atualizaKpis(salto) {
    const x = M[atual], antes = M[Math.max(0, atual - 12)];
    for (const k of KPIS) {
      const el = $(`.bi-kpi[data-k="${k.k}"]`); if (!el) continue;
      const alvo = k.v(x);
      const de = salto || mostrado[k.k] == null ? alvo : mostrado[k.k];
      let novo = de + (alvo - de) * (calmo() ? 1 : 0.18);
      if (Math.abs(novo - alvo) <= Math.abs(alvo) * 0.001 + 0.01) novo = alvo;
      mostrado[k.k] = novo;
      $('b', el).textContent = k.f(novo);
      const base = k.v(antes), d = atual >= 12 && base > 0 ? (alvo / base - 1) * 100 : null;
      const dl = $('.bi-delta', el);
      dl.textContent = k.nota ? k.nota() : d == null ? 'primeiro ano' : `${d >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(d)).toLocaleString('pt-BR')}% em 12 meses`;
      dl.className = 'bi-delta ' + (d == null || k.nota ? '' : d >= 0 ? 'sobe' : 'desce');
      const ini = Math.max(0, atual - 23), pts = M.slice(ini, atual + 1).map(k.v);
      const mx = Math.max(...pts, 1), mn = Math.min(...pts, 0);
      const xy = pts.map((v, i) => [pts.length === 1 ? 120 : (i / (pts.length - 1)) * 120, 30 - ((v - mn) / (mx - mn || 1)) * 26]);
      const d1 = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      $('.bi-spark .l', el).setAttribute('d', d1);
      $('.bi-spark .a', el).setAttribute('d', d1 + `L120 32L${xy[0][0].toFixed(1)} 32Z`);
    }
  }

  // ---------- gráfico principal ----------
  function area() {
    const el = $('#area'), W = Math.max(320, el.clientWidth || 800), H = Math.max(220, el.clientHeight || 300), pad = { l: 64, r: 14, t: 18, b: 26 };
    const n = M.length, max = Math.max(...M.map((x) => x.total), 1) * 1.08;
    const X = (i) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const vis = M.slice(0, atual + 1);
    const linha = (arr, f) => arr.map((x, i) => `${i ? 'L' : 'M'}${X(x.m).toFixed(1)} ${Y(f(x)).toFixed(1)}`).join('');
    const fundo = (arr, f) => linha(arr, f) + `L${X(arr[arr.length - 1].m).toFixed(1)} ${Y(0)}L${X(arr[0].m).toFixed(1)} ${Y(0)}Z`;
    const grade = [0.25, 0.5, 0.75, 1].map((p) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(max * p)}" y2="${Y(max * p)}" class="gr"/><text x="${pad.l - 8}" y="${Y(max * p) + 4}" text-anchor="end" class="ex">${esc(curto(max * p))}</text>`).join('');
    const anos = []; const passo = n / 12 > 10 ? 2 : 1;
    for (let a = 0; a < n / 12; a += passo) anos.push(`<text x="${X(a * 12 + 6)}" y="${H - 8}" text-anchor="middle" class="ex">ano ${a + 1}</text>`);
    const xh = X(HIST() - 1), cur = M[atual];
    const bx = Math.min(X(atual) + 12, W - 176), by = Math.max(Y(cur.total) - 52, pad.t);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22D3EE" stop-opacity=".5"/><stop offset="1" stop-color="#22D3EE" stop-opacity=".02"/></linearGradient>
      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A78BFA" stop-opacity=".75"/><stop offset="1" stop-color="#A78BFA" stop-opacity=".06"/></linearGradient>
      <filter id="brilho" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      ${grade}${anos.join('')}
      ${HIST() < n ? `<rect x="${xh}" y="${pad.t}" width="${W - pad.r - xh}" height="${H - pad.t - pad.b}" class="proj"/>
      <line x1="${xh}" x2="${xh}" y1="${pad.t}" y2="${H - pad.b}" class="hoje"/><text x="${xh + 6}" y="${pad.t + 12}" class="hoje-t">HOJE</text>` : ''}
      <path d="${linha(M, (x) => x.total)}" class="fantasma"/>
      ${vis.length > 1 ? `<path d="${fundo(vis, (x) => x.total)}" fill="url(#ga)"/><path d="${fundo(vis, (x) => x.mensal)}" fill="url(#gb)"/>
      <path d="${linha(vis, (x) => x.total)}" class="lt" filter="url(#brilho)"/>` : ''}
      <line x1="${X(atual)}" x2="${X(atual)}" y1="${pad.t}" y2="${H - pad.b}" class="cursor"/>
      <circle cx="${X(atual)}" cy="${Y(cur.total)}" r="12" class="ponto-onda"/><circle cx="${X(atual)}" cy="${Y(cur.total)}" r="5" class="ponto"/>
      <g transform="translate(${bx} ${by})"><rect width="164" height="40" rx="8" class="balao"/>
      <text x="10" y="16" class="balao-t">${esc(rotMes(atual))}</text><text x="10" y="32" class="balao-v">${esc(curto(cur.total))} no mês</text></g>
    </svg>`;
  }

  // ---------- rosca ----------
  function donut() {
    const a = anual(M[atual].ano), tot = a.total || 1, fV = a.comissao / tot;
    const R = 70, C = 2 * Math.PI * R;
    $('#ano-mix').textContent = `ano ${M[atual].ano}`;
    $('#donut').innerHTML = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="${R}" class="dn-fundo"/>
      <circle cx="100" cy="100" r="${R}" class="dn-m" transform="rotate(-90 100 100)"/>
      <circle cx="100" cy="100" r="${R}" class="dn-v" stroke-dasharray="${(fV * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 100 100)"/>
      <text x="100" y="96" text-anchor="middle" class="dn-n">${Math.round(fV * 100)}%</text><text x="100" y="114" text-anchor="middle" class="dn-r">vem das vendas</text>
      <text x="100" y="132" text-anchor="middle" class="dn-r2">${esc(curto(a.total))} no ano</text></svg>`;
    const hora = M[atual].total * 12 / 8760;
    $('#por-hora').textContent = curto(hora);
    $('#por-hora-sub').textContent = `por hora, 24 h por dia · ${curto(hora / 60)} por minuto`;
  }

  // ---------- safras ----------
  const CORES = ['#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#F472B6', '#60A5FA', '#F87171', '#2DD4BF', '#C084FC', '#FB923C', '#4ADE80', '#E879F9', '#38BDF8', '#FACC15', '#818CF8'];
  function coortes() {
    const anos = TOTAL() / 12, ateAno = M[atual].ano;
    const totAno = new Array(anos).fill(0); M.forEach((x) => { totAno[x.ano - 1] += x.total; });
    const max = Math.max(...totAno, 1);
    const el = $('#coortes'), W = Math.max(300, el.clientWidth || 520), H = Math.max(200, el.clientHeight || 240), pb = 22, bw = (W - 20) / anos;
    let g = '';
    for (let a = 1; a <= anos; a++) {
      const s = new Array(anos).fill(0);
      M.forEach((x) => { if (x.ano === a && x.m <= atual) x.coortes.forEach((v, i) => { s[i] += v; }); });
      let y = H - pb;
      s.forEach((v, c) => { if (v <= 0) return; const h = (v / max) * (H - pb - 10); y -= h; g += `<rect x="${(10 + (a - 1) * bw + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="${CORES[c % CORES.length]}" opacity="${a === ateAno ? 1 : 0.8}"><title>Ano ${a} · imobiliárias que entraram no ano ${c + 1}: ${brl(v)}</title></rect>`; });
      g += `<text x="${(10 + (a - 1) * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ex">${a}</text>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
  }

  // ---------- rede de imobiliárias (canvas) ----------
  const rede = { pts: [], faiscas: [], ctx: null, W: 0, H: 0 };
  const MAX_PONTOS = 900;
  function preparaRede() {
    const c = $('#rede'), dpr = window.devicePixelRatio || 1;
    rede.W = c.clientWidth || 500; rede.H = c.clientHeight || 260; c.width = rede.W * dpr; c.height = rede.H * dpr;
    rede.ctx = c.getContext('2d'); rede.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const total = nPorAno() * TOTAL() / 12, n = Math.min(total, MAX_PONTOS); rede.escala = total / n; rede.pts = [];
    const cx = rede.W / 2, cy = rede.H / 2, esp = Math.min(rede.W / 1.35, rede.H) / 2 / Math.sqrt(n + 6);
    for (let i = 1; i <= n; i++) {
      const k = Math.round(i * rede.escala), ang = i * 2.39996, r = esp * Math.sqrt(i + 6);
      rede.pts.push({ k, x: cx + Math.cos(ang) * r * 1.35, y: cy + Math.sin(ang) * r, ent: (anoDeEntrada(k) - 1) * 12 });
    }
  }
  function desenhaRede(t) {
    const { ctx, W, H } = rede; if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const ativos = rede.pts.filter((p) => p.ent <= atual);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(34,211,238,0.07)';
    ctx.beginPath(); for (const p of ativos) { ctx.moveTo(W / 2, H / 2); ctx.lineTo(p.x, p.y); } ctx.stroke();
    const pul = 1 + Math.sin(t / 400) * 0.1;
    ctx.fillStyle = 'rgba(167,139,250,0.16)'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 24 * pul, 0, 7); ctx.fill();
    ctx.fillStyle = '#A78BFA'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 9, 0, 7); ctx.fill();
    for (const p of ativos) {
      const idade = Math.floor((atual - p.ent) / 12) + 1, novo = atual - p.ent < 6;
      const r = 2 + Math.min(4.5, Math.sqrt(vendasNoAno(idade)) * 0.6);
      ctx.fillStyle = novo ? '#34D399' : '#22D3EE';
      ctx.globalAlpha = novo ? 0.55 + 0.45 * Math.abs(Math.sin(t / 250 + p.k)) : 0.85;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    rede.faiscas = rede.faiscas.filter((f) => t - f.t0 < 900);
    for (const f of rede.faiscas) { if (t < f.t0) continue; const e = (t - f.t0) / 900; ctx.strokeStyle = `rgba(251,191,36,${(1 - e).toFixed(2)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + e * 18, 0, 7); ctx.stroke(); }
    const nAtivas = M[atual].imobs, nTotal = nPorAno() * TOTAL() / 12;
    $('#rede-sub').textContent = `${int(nAtivas)} no sistema · ${int(nTotal - nAtivas)} a captar${rede.escala > 1 ? ` · cada ponto ≈ ${int(rede.escala)}` : ''}`;
  }

  // ---------- feed de vendas ----------
  let feedMes = -1;
  function feed(t) {
    if (feedMes === atual) return;
    feedMes = atual;
    const x = M[atual], ul = $('#feed');
    const ativos = rede.pts.filter((p) => p.ent <= atual);
    const n = Math.min(4, Math.max(1, Math.round(x.vendas))), itens = [];
    for (let i = 0; i < n && ativos.length; i++) {
      const p = ativos[Math.floor(Math.random() * ativos.length)];
      const valor = Number(P.ticket) * (0.55 + Math.random() * 0.9);
      itens.push(`<li><b>${esc(nomeDa(p.k))}</b> vendeu no ${esc(BAIRROS[Math.floor(Math.random() * BAIRROS.length)])}<span>${esc(curto(valor))} · <em>+${esc(brl(valor * Number(P.comissao) / 100 * Number(P.parte) / 100))}</em> para a plataforma</span></li>`);
      rede.faiscas.push({ x: p.x, y: p.y, t0: t + i * 140 });
    }
    ul.insertAdjacentHTML('afterbegin', itens.join(''));
    while (ul.children.length > 8) ul.lastElementChild.remove();
    $('#feed-sub').textContent = `${x.vendas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vendas em ${MESES[atual % 12]}`;
  }

  // ---------- tabela ----------
  function tabela() {
    const ateAno = M[atual].ano, anos = TOTAL() / 12; let acum = 0, h = '';
    for (let a = 1; a <= anos; a++) {
      const s = anual(a); acum += s.total;
      const cls = a === ateAno ? 'agora' : a > ateAno ? 'fut' : '';
      h += `<tr class="${cls}"><td>Ano ${a}${a * 12 > HIST() ? ' <i>projeção</i>' : ''}</td><td>${int(s.imobs)}</td><td>${int(s.vendas)}</td><td>${esc(curto(s.vgv))}</td><td>${esc(curto(s.comissao))}</td><td>${esc(curto(s.mensal))}</td><td><b>${esc(curto(s.total))}</b></td><td>${esc(curto(acum))}</td></tr>`;
    }
    $('#tabela').innerHTML = `<table><thead><tr><th>Ano</th><th>Imobiliárias</th><th>Vendas</th><th>VGV</th><th>Parte das vendas</th><th>Mensalidades</th><th>Faturamento</th><th>Acumulado</th></tr></thead><tbody>${h}</tbody></table>`;
  }

  function quadro(salto) {
    atualizaKpis(salto); area(); donut(); coortes(); tabela();
    $('#t').value = atual;
    $('#quando').innerHTML = `<b>${esc(rotMes(atual))}</b><small>${atual < HIST() ? 'história' : 'projeção'} · ${int(M[atual].imobs)} imobiliárias</small>`;
  }
  function marcos() {
    const tot = TOTAL(); let h = ''; const passo = tot / 12 > 10 ? 2 : 1;
    for (let a = 0; a < tot / 12; a += passo) h += `<span style="left:${(a * 12) / (tot - 1) * 100}%">${a + 1}</span>`;
    if (HIST() < tot) h += `<span class="hoje" style="left:${(HIST() - 1) / (tot - 1) * 100}%">hoje</span>`;
    $('#marcos').innerHTML = h;
  }

  function laco(t) {
    if (!ultimoT) ultimoT = t;
    const dt = Math.min(100, t - ultimoT); ultimoT = t;
    if (tocando) {
      acumuladoMs += dt * vel;
      while (acumuladoMs >= MS_POR_MES) {
        acumuladoMs -= MS_POR_MES;
        if (atual < M.length - 1 && (alvoParada == null || atual < alvoParada)) { atual++; quadro(false); feed(t); }
        else { tocando = false; alvoParada = null; $('#b-play').textContent = '▶'; break; }
      }
    }
    if (KPIS.some((k) => mostrado[k.k] !== k.v(M[atual]))) atualizaKpis(false);
    desenhaRede(t);
    requestAnimationFrame(laco);
  }
  function toca(ate) { tocando = true; alvoParada = ate ?? null; acumuladoMs = 0; $('#b-play').textContent = '❚❚'; }
  function pausa() { tocando = false; $('#b-play').textContent = '▶'; }

  function reinicia(mantemPosicao) {
    calcula();
    $('#t').max = M.length - 1;
    if (!mantemPosicao) atual = 0;
    atual = Math.min(atual, M.length - 1);
    preparaRede(); marcos(); feedMes = -1; quadro(true);
    document.querySelectorAll('.bi-chip').forEach((b) => b.classList.toggle('on', Object.entries(CENARIOS[b.dataset.cen]).every(([k, v]) => Number(P[k]) === v)));
  }

  function liga() {
    $('#b-play').onclick = () => { if (tocando) pausa(); else { if (atual >= M.length - 1) atual = 0; toca(); } };
    $('#t').oninput = (e) => { atual = Number(e.target.value); pausa(); quadro(true); feed(performance.now()); };
    document.querySelectorAll('.bi-vel button').forEach((b) => { b.onclick = () => { vel = Number(b.dataset.v); document.querySelectorAll('.bi-vel button').forEach((x) => x.classList.toggle('on', x === b)); }; });
    $('#b-tela').onclick = () => { const r = document.documentElement; if (!document.fullscreenElement && r.requestFullscreen) r.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); };
    $('#b-premissas').onclick = () => { $('#gaveta').hidden = !$('#gaveta').hidden; };
    $('#b-fecha').onclick = () => { $('#gaveta').hidden = true; };
    $('#f-sim').addEventListener('change', (e) => {
      const k = e.target.name; let v = e.target.value.trim();
      if (k !== 'rampa') { v = Number(v.replace(/\./g, '').replace(',', '.')); if (!Number.isFinite(v) || v < 0) return; }
      if ((k === 'anos_historia' || k === 'anos_projecao') && v > 30) v = 30;
      P[k] = v; salvar(); reinicia(true);
    });
    const recomeca = () => { reinicia(false); if (PAGINA === 'projecao') { atual = HIST() - 1; quadro(true); toca(); } else toca(HIST() - 1); };
    $('#b-padrao').onclick = () => { P = { ...PADRAO }; salvar(); document.querySelectorAll('#f-sim input').forEach((i) => { i.value = P[i.name]; }); $('#dica-cen').textContent = ''; recomeca(); };
    document.querySelectorAll('.bi-chip').forEach((b) => {
      b.onclick = () => {
        Object.assign(P, CENARIOS[b.dataset.cen]); salvar();
        document.querySelectorAll('#f-sim input').forEach((i) => { i.value = P[i.name]; });
        $('#dica-cen').textContent = `${P.novas_por_ano} imobiliária(s) nova(s) por ano · imóvel de ${curto(P.ticket)} · ${P.parte}% da comissão · ${brl(P.mensalidade)}/mês`;
        recomeca();
      };
    });
    document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); $('#b-play').click(); } });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { preparaRede(); quadro(true); }, 150); });
  }

  function inicia() {
    document.body.classList.add('bi-corpo');
    document.body.innerHTML = casca();
    montaKpis(); liga(); reinicia(false);
    if (PAGINA === 'projecao') { atual = HIST() - 1; quadro(true); }
    if (calmo()) { atual = PAGINA === 'projecao' ? M.length - 1 : HIST() - 1; quadro(true); }
    else setTimeout(() => toca(PAGINA === 'dashboard' ? HIST() - 1 : null), 700);
    requestAnimationFrame(laco);
  }

  fetch('/gestor-api/eu', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null), () => null).then((eu) => {
    if (!eu) { location.href = '/gestor'; return; }
    inicia();
  });
})();
