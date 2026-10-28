// Painel do gestor · Dashboard de faturamento (simulação) e Projeção de 10 anos.
// Tudo é calculado aqui, no navegador, a partir das premissas da tela (guardadas neste aparelho).
// Modelo: a plataforma ganha a mensalidade de cada imobiliária + uma parte da comissão de cada venda
// (valor do imóvel × comissão da imobiliária × parte da plataforma).
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAGINA = document.body.dataset.pagina || 'dashboard';
  const NOMES = ['RUAH', 'Onde morar?', 'Cadê meu AP?', 'Casa Prado', 'Lumen'];
  const PADRAO = {
    anos_historia: 5, novas_por_ano: 1, rampa: '4, 8, 12, 24, 48', crescimento_depois: 0,
    ticket: 1000000, comissao: 6, parte: 20, mensalidade: 797, anos_projecao: 10,
  };
  const CHAVE = 'gestor.simulacao.v1';
  let P;
  try { P = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch { P = { ...PADRAO }; }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(P)); } catch {} };

  const brl = (v, casas = 0) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const curto = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi';
    if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
    if (a >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return brl(v);
  };
  const int = (v) => Math.round(v).toLocaleString('pt-BR');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // ---------- o modelo ----------
  function rampa() { return String(P.rampa).split(/[,;\s]+/).map(Number).filter((n) => n >= 0); }
  // vendas por ano de uma imobiliária no seu ano de vida "idade" (1, 2, 3...)
  function vendasNoAno(idade) {
    const r = rampa(); if (!r.length || idade < 1) return 0;
    if (idade <= r.length) return r[idade - 1];
    return r[r.length - 1] * Math.pow(1 + Number(P.crescimento_depois) / 100, idade - r.length);
  }
  const ganhoPorVenda = () => Number(P.ticket) * Number(P.comissao) / 100 * Number(P.parte) / 100;
  // imobiliária k (1..n) entra no começo do ano ceil(k / novas_por_ano)
  function anoDeEntrada(k) { return Math.ceil(k / Math.max(1, Number(P.novas_por_ano))); }
  function nomeDa(k) { return NOMES[k - 1] || `Imobiliária ${k}`; }

  // série mês a mês, do mês 1 do ano 1 até o fim do último ano pedido
  function serie(anos) {
    const meses = [];
    const totalImobs = Math.max(1, Number(P.novas_por_ano)) * anos;
    for (let m = 0; m < anos * 12; m++) {
      const ano = Math.floor(m / 12) + 1;
      let imobs = 0, vendas = 0;
      const porImob = [];
      for (let k = 1; k <= totalImobs; k++) {
        const ent = anoDeEntrada(k); if (ent > ano) { porImob.push(null); continue; }
        imobs++;
        const v = vendasNoAno(ano - ent + 1) / 12;
        vendas += v; porImob.push(v);
      }
      const mensal = imobs * Number(P.mensalidade);
      const comissao = vendas * ganhoPorVenda();
      meses.push({ m, ano, mes: m % 12, imobs, vendas, mensal, comissao, total: mensal + comissao, vgv: vendas * Number(P.ticket), porImob });
    }
    return meses;
  }
  function porAno(meses) {
    const anos = [];
    for (const x of meses) {
      const a = anos[x.ano - 1] || (anos[x.ano - 1] = { ano: x.ano, imobs: 0, vendas: 0, mensal: 0, comissao: 0, total: 0, vgv: 0 });
      a.imobs = Math.max(a.imobs, x.imobs); a.vendas += x.vendas; a.mensal += x.mensal; a.comissao += x.comissao; a.total += x.total; a.vgv += x.vgv;
    }
    let acum = 0; for (const a of anos) { acum += a.total; a.acumulado = acum; }
    return anos;
  }

  // ---------- gráficos (SVG feitos à mão) ----------
  function barras(dados, { altura = 260, largBarra = 34, gap = 14, rotulo, dica, valorTopo = true, empilha = true }) {
    const max = Math.max(1, ...dados.map((d) => d.mensal + d.comissao));
    const largura = dados.length * (largBarra + gap) + gap + 8;
    const area = altura - 46;
    const y = (v) => 18 + area - (v / max) * area;
    const linhas = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="0" x2="${largura}" y1="${y(max * f)}" y2="${y(max * f)}" class="g-grade"/><text x="4" y="${y(max * f) - 4}" class="g-eixo">${esc(curto(max * f))}</text>`).join('');
    const bs = dados.map((d, i) => {
      const x = gap + i * (largBarra + gap) + 8;
      const hM = (d.mensal / max) * area, hC = (d.comissao / max) * area;
      const base = 18 + area;
      return `<g class="g-barra"><title>${esc(dica(d))}</title>
        <rect x="${x}" y="${base - hM}" width="${largBarra}" height="${Math.max(0, hM)}" class="g-mensal" rx="2"/>
        <rect x="${x}" y="${base - hM - hC}" width="${largBarra}" height="${Math.max(0, hC)}" class="g-comissao" rx="2"/>
        ${valorTopo ? `<text x="${x + largBarra / 2}" y="${base - hM - hC - 6}" class="g-valor" text-anchor="middle">${esc(curto(d.mensal + d.comissao))}</text>` : ''}
        <text x="${x + largBarra / 2}" y="${altura - 8}" class="g-eixo" text-anchor="middle">${esc(rotulo(d, i))}</text></g>`;
    }).join('');
    return `<svg class="grafico" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Faturamento">${linhas}${bs}</svg>`;
  }

  // ---------- tela ----------
  const campo = (k, rot, extra = '') => `<label class="sim-campo"><span>${rot}</span><input name="${k}" value="${esc(P[k])}" ${extra}></label>`;
  function premissas() {
    return `<details class="sim-premissas" ${PAGINA === 'dashboard' ? '' : ''}><summary>Premissas da simulação</summary>
      <form id="f-sim" class="sim-grade">
        ${campo('ticket', 'Valor médio do imóvel vendido (R$)', 'inputmode="numeric"')}
        ${campo('comissao', 'Comissão da imobiliária (%)', 'inputmode="decimal"')}
        ${campo('parte', 'Parte da plataforma na comissão (%)', 'inputmode="decimal"')}
        ${campo('mensalidade', 'Mensalidade por imobiliária (R$)', 'inputmode="decimal"')}
        ${campo('novas_por_ano', 'Imobiliárias novas por ano', 'inputmode="numeric"')}
        ${campo('rampa', 'Vendas por ano de cada imobiliária (1º, 2º, 3º... ano)')}
        ${campo('crescimento_depois', 'Crescimento das vendas depois da rampa (% ao ano)', 'inputmode="decimal"')}
        <div class="sim-acoes"><button class="btn sm" type="button" id="b-padrao">Voltar ao padrão</button></div>
      </form></details>`;
  }
  function topo(eu) {
    const link = (h, t, k) => `<a class="btn sm ${PAGINA === k ? 'pri' : ''}" href="${h}">${t}</a>`;
    return `<header class="topo"><div class="topo-in"><div class="marca">Herrera HOUSE IA<span>Painel do gestor</span></div>
      <nav class="sim-nav">${link('/gestor', 'Imobiliárias', 'imobs')}${link('/gestor/dashboard', 'Dashboard', 'dashboard')}${link('/gestor/projecao', 'Projeção 10 anos', 'projecao')}</nav>
      <div class="sp"></div><span class="muted pequeno">${esc(eu.nome || '')}</span></div></header>`;
  }
  const kpi = (rot, val, sub = '') => `<div class="sim-kpi"><span class="muted pequeno">${rot}</span><b class="n">${val}</b>${sub ? `<span class="muted pequeno">${sub}</span>` : ''}</div>`;

  function dashboard() {
    const anos = Number(P.anos_historia);
    const meses = serie(anos), A = porAno(meses);
    const ultimo = A[A.length - 1], penultimo = A[A.length - 2];
    const total = A.reduce((s, a) => s + a.total, 0), vendas = A.reduce((s, a) => s + a.vendas, 0);
    const ultMes = meses[meses.length - 1];
    const cresc = penultimo ? (ultimo.total / penultimo.total - 1) * 100 : 0;
    const imobs = [];
    for (let k = 1; k <= Math.max(1, Number(P.novas_por_ano)) * anos; k++) {
      const ent = anoDeEntrada(k);
      const linhas = [];
      let tot = 0, vend = 0;
      for (let ano = ent; ano <= anos; ano++) {
        const v = vendasNoAno(ano - ent + 1); vend += v;
        const r = v * ganhoPorVenda() + 12 * Number(P.mensalidade); tot += r; linhas.push(v);
      }
      imobs.push({ k, nome: nomeDa(k), ent, vend, tot, ultimoAno: vendasNoAno(anos - ent + 1) });
    }
    return `<main>
      <p class="sim-selo">Simulação · ${int(imobs.length)} imobiliárias em ${anos} anos, ${int(P.novas_por_ano)} nova(s) por ano</p>
      <h1>Faturamento da plataforma</h1>
      <p class="muted">Como estaria o caixa da Herrera HOUSE IA hoje, ${anos} anos depois da primeira imobiliária. Cada venda rende ${brl(ganhoPorVenda())} à plataforma (${brl(P.ticket)} × ${P.comissao}% × ${P.parte}%), mais ${brl(P.mensalidade)} por mês de cada imobiliária.</p>
      ${premissas()}
      <section class="sim-kpis">
        ${kpi(`Faturamento no ano ${anos}`, curto(ultimo.total), penultimo ? `${cresc >= 0 ? '+' : ''}${cresc.toFixed(0)}% sobre o ano ${anos - 1}` : '')}
        ${kpi('Faturamento acumulado', curto(total), `${anos} anos`)}
        ${kpi('Receita por mês hoje', curto(ultMes.total), `${curto(ultMes.mensal)} de mensalidades`)}
        ${kpi(`Vendas no ano ${anos}`, int(ultimo.vendas), `${int(vendas)} no total`)}
        ${kpi(`VGV intermediado no ano ${anos}`, curto(ultimo.vgv), 'valor dos imóveis vendidos')}
        ${kpi('Imobiliárias ativas', int(ultMes.imobs), `${brl(ultMes.total / Math.max(1, ultMes.imobs))} por mês cada`)}
      </section>
      <section class="sim-bloco"><div class="sim-cab"><h2>Faturamento por ano</h2><span class="sim-leg"><i class="l-comissao"></i>parte das vendas <i class="l-mensal"></i>mensalidades</span></div>
        <div class="sim-rolagem">${barras(A, { largBarra: 72, gap: 40, rotulo: (d) => `Ano ${d.ano}`, dica: (d) => `Ano ${d.ano}: ${brl(d.total)} (vendas ${brl(d.comissao)} + mensalidades ${brl(d.mensal)}), ${int(d.vendas)} vendas, ${d.imobs} imobiliárias` })}</div></section>
      <section class="sim-bloco"><div class="sim-cab"><h2>Mês a mês</h2><span class="muted pequeno">${anos * 12} meses · role para o lado</span></div>
        <div class="sim-rolagem">${barras(meses, { altura: 220, largBarra: 12, gap: 5, valorTopo: false, rotulo: (d) => d.mes === 0 ? `Ano ${d.ano}` : '', dica: (d) => `Ano ${d.ano}, ${MESES[d.mes]}: ${brl(d.total)} · ${d.vendas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vendas · ${d.imobs} imobiliárias` })}</div></section>
      <section class="sim-bloco"><h2>Ano a ano</h2>${tabelaAnos(A)}</section>
      <section class="sim-bloco"><h2>Por imobiliária</h2><div class="sim-tab"><table><thead><tr><th>Imobiliária</th><th>Entrou</th><th>Vendas no ano ${anos}</th><th>Vendas no total</th><th>Rendeu à plataforma</th></tr></thead><tbody>
        ${imobs.map((i) => `<tr><td>${esc(i.nome)}</td><td>ano ${i.ent}</td><td class="n">${int(i.ultimoAno)}</td><td class="n">${int(i.vend)}</td><td class="n">${brl(i.tot)}</td></tr>`).join('')}
      </tbody></table></div><p class="muted pequeno">Nomes apenas para ilustrar a ordem de entrada; os números são da simulação, não do banco.</p></section>
    </main>`;
  }
  function tabelaAnos(A, desde = 1) {
    return `<div class="sim-tab"><table><thead><tr><th>Ano</th><th>Imobiliárias</th><th>Vendas</th><th>VGV</th><th>Parte das vendas</th><th>Mensalidades</th><th>Faturamento</th><th>Acumulado</th></tr></thead><tbody>
      ${A.filter((a) => a.ano >= desde).map((a) => `<tr><td>Ano ${a.ano}</td><td class="n">${a.imobs}</td><td class="n">${int(a.vendas)}</td><td class="n">${curto(a.vgv)}</td><td class="n">${brl(a.comissao)}</td><td class="n">${brl(a.mensal)}</td><td class="n"><b>${brl(a.total)}</b></td><td class="n">${brl(a.acumulado)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function projecao() {
    const hist = Number(P.anos_historia), proj = Number(P.anos_projecao);
    const meses = serie(hist + proj), A = porAno(meses);
    const futuros = A.filter((a) => a.ano > hist), mesesF = meses.filter((x) => x.ano > hist);
    const soma = futuros.reduce((s, a) => s + a.total, 0);
    const ult = futuros[futuros.length - 1], prim = futuros[0];
    const imobsFim = ult.imobs;
    return `<main>
      <p class="sim-selo">Simulação · próximos ${proj} anos (anos ${hist + 1} a ${hist + proj})</p>
      <h1>Projeção de faturamento</h1>
      <p class="muted">Continua o mesmo ritmo: ${int(P.novas_por_ano)} imobiliária(s) nova(s) por ano, cada uma seguindo a rampa de vendas (${esc(rampa().join(', '))}) e, depois dela, ${Number(P.crescimento_depois)}% ao ano.</p>
      ${premissas()}
      <section class="sim-kpis">
        ${kpi(`Faturamento nos próximos ${proj} anos`, curto(soma), `${int(futuros.reduce((s, a) => s + a.vendas, 0))} vendas`)}
        ${kpi(`Ano ${prim.ano}`, curto(prim.total), `${prim.imobs} imobiliárias`)}
        ${kpi(`Ano ${ult.ano}`, curto(ult.total), `${imobsFim} imobiliárias`)}
        ${kpi(`Receita por mês no fim do ano ${ult.ano}`, curto(mesesF[mesesF.length - 1].total), `${curto(mesesF[mesesF.length - 1].mensal)} de mensalidades`)}
        ${kpi(`VGV intermediado no ano ${ult.ano}`, curto(ult.vgv), `${int(ult.vendas)} vendas no ano`)}
        ${kpi('Acumulado desde o ano 1', curto(ult.acumulado), `${hist + proj} anos`)}
      </section>
      <section class="sim-bloco"><div class="sim-cab"><h2>Por ano</h2><span class="sim-leg"><i class="l-comissao"></i>parte das vendas <i class="l-mensal"></i>mensalidades</span></div>
        <div class="sim-rolagem">${barras(futuros, { largBarra: 64, gap: 30, rotulo: (d) => `Ano ${d.ano}`, dica: (d) => `Ano ${d.ano}: ${brl(d.total)} · ${int(d.vendas)} vendas · ${d.imobs} imobiliárias` })}</div></section>
      <section class="sim-bloco"><div class="sim-cab"><h2>Mês a mês</h2><span class="muted pequeno">${proj * 12} meses · role para o lado</span></div>
        <div class="sim-rolagem" id="rolagem-meses">${barras(mesesF, { altura: 280, largBarra: 16, gap: 6, valorTopo: false, rotulo: (d) => d.mes === 0 ? `Ano ${d.ano}` : (d.mes === 6 ? 'jul' : ''), dica: (d) => `Ano ${d.ano}, ${MESES[d.mes]}: ${brl(d.total)} · ${d.imobs} imobiliárias` })}</div></section>
      <section class="sim-bloco"><h2>Ano a ano</h2>${tabelaAnos(A, hist + 1)}</section>
    </main>`;
  }

  function desenha(eu) {
    document.body.innerHTML = topo(eu) + (PAGINA === 'projecao' ? projecao() : dashboard());
    const f = $('#f-sim');
    const det = $('.sim-premissas'); try { if (sessionStorage.getItem('sim.aberto') === '1') det.open = true; } catch {}
    det.addEventListener('toggle', () => { try { sessionStorage.setItem('sim.aberto', det.open ? '1' : '0'); } catch {} });
    f.addEventListener('change', (e) => {
      const k = e.target.name; let v = e.target.value.trim();
      if (k !== 'rampa') v = Number(v.replace(/\./g, '').replace(',', '.'));
      if (k !== 'rampa' && !Number.isFinite(v)) return;
      P[k] = v; salvar(); const y = window.scrollY; desenha(eu); window.scrollTo(0, y);
    });
    $('#b-padrao').onclick = () => { P = { ...PADRAO }; salvar(); desenha(eu); };
  }

  fetch('/gestor-api/eu', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((eu) => {
    if (!eu) { location.href = '/gestor'; return; }
    desenha(eu);
  }).catch(() => { location.href = '/gestor'; });
})();
