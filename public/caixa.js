// #/caixa - Imoveis da Caixa.
//
// A Caixa republica todo dia a lista completa dos imoveis que retomou. Como e uma foto
// inteira do dia, nao ha anuncio para reabrir: quem estava ontem e sumiu hoje saiu da
// lista. Por isso esta tela tem duas faces -- o que esta a venda agora e o que saiu --
// e nenhum "verificar link".
//
// Os filtros ficam na propria pagina e viajam na barra de endereco, entao da para
// guardar o link de uma busca ("casa em Sumare acima de 45% de desconto") e voltar nela.

let CX = { uf: 'rmc', saiu: '0', ordem: '', pagina: 1 };
let CX_OPC = null;

const cxNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const cxArea = (v) => (cxNum(v) ? Math.round(Number(v)) + ' m²' : null);
const cxPct = (v) => (cxNum(v) ? Number(v).toFixed(0).replace('.', ',') + '%' : null);
// A Caixa escreve tudo em caixa alta. Vira capitular, menos numero romano:
// "JARDIM TERRAMERICA III" nao pode virar "Jardim Terramerica Iii".
const ROMANO = /^(?:i{1,3}|i[vx]|vi{0,3}|ix|xi{0,3})$/;
const cxCidade = (s) => String(s || '').toLowerCase().split(/(\s+)/)
  .map((p) => (ROMANO.test(p) ? p.toUpperCase() : p.replace(/(^|['])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase())))
  .join('');

function cxQuery() {
  const q = {};
  for (const [k, v] of Object.entries(CX)) if (v !== '' && v !== null && v !== undefined && !(k === 'pagina' && v === 1)) q[k] = v;
  return new URLSearchParams(q);
}
function cxVai(mudanca) {
  Object.assign(CX, mudanca);
  if (!('pagina' in mudanca)) CX.pagina = 1;
  location.hash = '#/caixa?' + cxQuery();
}

async function telaCaixa(qs) {
  CX = { uf: 'rmc', saiu: '0', ordem: '', pagina: 1 };
  for (const k of ['uf', 'saiu', 'cidade', 'tipo', 'modalidade', 'desconto', 'max', 'min', 'quartos', 'q', 'ordem', 'pagina']) {
    const v = qs && qs.get(k);
    if (v) CX[k] = k === 'pagina' ? Number(v) || 1 : v;
  }

  $('#main').innerHTML = `<h1>Imóveis da Caixa</h1>
  <div class="eyebrow depois" id="cx-safra"></div>
  <p class="lead">Os imóveis retomados que a Caixa coloca à venda &mdash; leilão, licitação e venda direta. A lista inteira é republicada todo dia,
  então o que some de um dia para o outro saiu de circulação: foi vendido, arrematado ou retirado. Nada aqui depende de reabrir anúncio.</p>
  <div class="row" style="margin:14px 0 10px;gap:8px">
    <div class="seg" role="group" aria-label="Onde procurar">
      <button type="button" data-act="cx-onde" data-uf="rmc" data-saiu="0">Região de Campinas</button>
      <button type="button" data-act="cx-onde" data-uf="sp" data-saiu="0">São Paulo inteiro</button>
      <button type="button" data-act="cx-onde" data-saiu="1">Saíram da lista</button>
    </div>
  </div>
  <div class="cx-filtros" id="cx-filtros"></div>
  <div class="row" style="margin:10px 0 14px;justify-content:space-between;align-items:baseline">
    <p class="muted small" id="cx-resumo" style="margin:0">Carregando…</p>
    <span id="cx-limpar"></span>
  </div>
  <div id="cx-lista"><p class="muted">Carregando…</p></div>
  <div class="row" id="cx-paginas" style="margin:18px 0;gap:8px;justify-content:center"></div>`;

  marcaSeg();
  await cxOpcoes();
  cxFiltros();
  await cxCarrega();
}

function marcaSeg(saiu) {
  for (const b of document.querySelectorAll('[data-act="cx-onde"]')) {
    const meu = b.dataset.saiu === '1' ? CX.saiu === '1' : CX.saiu !== '1' && b.dataset.uf === CX.uf;
    b.setAttribute('aria-pressed', meu ? 'true' : 'false'); // o .seg da casa marca por aria-pressed
  }
}

async function cxOpcoes() {
  CX_OPC = await api('GET', '/api/caixa/opcoes?' + new URLSearchParams({ uf: CX.uf }));
  const e = $('#cx-safra');
  if (e) {
    const s = CX_OPC.safra ? CX_OPC.safra.slice(0, 10).split('-').reverse().join('/') : null;
    e.textContent = s ? `Lista da Caixa de ${s} · ${CX_OPC.regiao} na região · ${CX_OPC.estado} em São Paulo` : 'Lista ainda não importada';
  }
}

function cxFiltros() {
  const o = CX_OPC || { cidades: [], tipos: [], modalidades: [] };
  const sel = (nome, rotulo, lista, valor, tudo) => `<label class="f">${rotulo}
    <select data-campo="${nome}"><option value="">${tudo}</option>
    ${lista.map((x) => `<option value="${esc(x.nome)}"${String(valor || '') === x.nome ? ' selected' : ''}>${esc(nome === 'cidade' ? cxCidade(x.nome) : x.nome)} (${x.n})</option>`).join('')}
    </select></label>`;
  const op = (v, r, atual) => `<option value="${v}"${String(atual || '') === String(v) ? ' selected' : ''}>${r}</option>`;

  $('#cx-filtros').innerHTML = `
    <label class="f" style="flex:2;min-width:220px">Buscar
      <input class="inp" id="cx-q" type="search" placeholder="Bairro, rua ou número do imóvel" value="${esc(CX.q || '')}"></label>
    ${sel('cidade', 'Cidade', o.cidades, CX.cidade, 'Todas')}
    ${sel('tipo', 'Tipo', o.tipos, CX.tipo, 'Todos')}
    ${sel('modalidade', 'Como é vendido', o.modalidades, CX.modalidade, 'Qualquer')}
    <label class="f">Desconto mínimo
      <select data-campo="desconto">
        ${op('', 'Qualquer', CX.desconto)}${op(20, 'A partir de 20%', CX.desconto)}${op(30, 'A partir de 30%', CX.desconto)}
        ${op(40, 'A partir de 40%', CX.desconto)}${op(50, 'A partir de 50%', CX.desconto)}${op(60, 'A partir de 60%', CX.desconto)}
      </select></label>
    <label class="f">Preço até
      <select data-campo="max">
        ${op('', 'Sem limite', CX.max)}${op(100000, 'R$ 100 mil', CX.max)}${op(200000, 'R$ 200 mil', CX.max)}
        ${op(300000, 'R$ 300 mil', CX.max)}${op(500000, 'R$ 500 mil', CX.max)}${op(1000000, 'R$ 1 milhão', CX.max)}
      </select></label>
    <label class="f">Quartos
      <select data-campo="quartos">
        ${op('', 'Tanto faz', CX.quartos)}${op(1, '1 ou mais', CX.quartos)}${op(2, '2 ou mais', CX.quartos)}${op(3, '3 ou mais', CX.quartos)}${op(4, '4 ou mais', CX.quartos)}
      </select></label>
    <label class="f">Ordenar por
      <select data-campo="ordem">
        ${op('', CX.saiu === '1' ? 'Saída mais recente' : 'Maior desconto', CX.ordem)}
        ${op('barato', 'Menor preço', CX.ordem)}${op('caro', 'Maior preço', CX.ordem)}
        ${op('area', 'Maior área', CX.ordem)}${op('recentes', 'Entrou na lista agora', CX.ordem)}
      </select></label>`;

  // ACT so escuta clique, e clique num select apenas abre a lista: o change e nosso.
  $('#cx-filtros').addEventListener('change', (ev) => {
    const s = ev.target.closest('select[data-campo]');
    if (s) cxVai({ [s.dataset.campo]: s.value });
  });
  let t;
  $('#cx-q').addEventListener('input', (ev) => { clearTimeout(t); const v = ev.target.value; t = setTimeout(() => cxVai({ q: v }), 300); });
}

function cxCartao(i) {
  const desc = cxNum(i.desconto);
  const abate = cxNum(i.avaliacao) && cxNum(i.preco) ? Number(i.avaliacao) - Number(i.preco) : null;
  const ficha = [i.quartos ? i.quartos + (i.quartos > 1 ? ' quartos' : ' quarto') : null,
    i.vagas ? i.vagas + (i.vagas > 1 ? ' vagas' : ' vaga') : null,
    cxArea(i.area_util), cxNum(i.area_terreno) ? cxArea(i.area_terreno) + ' de terreno' : null].filter(Boolean);
  const saiu = i.saiu_em ? i.saiu_em.slice(0, 10).split('-').reverse().join('/') : null;
  return `<article class="cx-card${saiu ? ' cx-saiu' : ''}">
    <header>
      <span class="cx-tipo">${esc(i.tipo || 'Imóvel')}</span>
      ${desc && desc > 0 ? `<span class="cx-desc">${cxPct(desc)} abaixo da avaliação</span>` : ''}
    </header>
    <h3>${esc(i.bairro ? cxCidade(i.bairro) : '—')}</h3>
    <p class="cx-onde">${esc(cxCidade(i.cidade))}${i.endereco ? ' · ' + esc(i.endereco) : ''}</p>
    <p class="cx-preco">${brl(i.preco)}
      ${cxNum(i.avaliacao) && abate > 0 ? `<s>${brl(i.avaliacao)}</s>` : ''}</p>
    ${abate > 0 ? `<p class="cx-abate">${brl(abate)} abaixo da avaliação da Caixa</p>` : ''}
    ${ficha.length ? `<p class="cx-ficha">${esc(ficha.join(' · '))}</p>` : ''}
    <footer>
      <span class="cx-modo">${esc(i.modalidade || '—')}</span>
      ${saiu ? `<span class="cx-fora">Saiu em ${saiu}</span>`
        : i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">Ver na Caixa ↗</a>` : ''}
    </footer>
    <span class="cx-num">${esc(i.numero)}</span>
  </article>`;
}

async function cxCarrega() {
  const d = await api('GET', '/api/caixa?' + cxQuery());
  const r = d.resumo || {};
  const alvo = $('#cx-resumo');
  if (alvo) {
    const partes = [`${d.total.toLocaleString('pt-BR')} ${d.total === 1 ? 'imóvel' : 'imóveis'}`];
    if (cxNum(r.desconto_medio)) {
      const quantos = cxNum(r.com_desconto);
      partes.push(`${quantos} com desconto, média de ${cxPct(r.desconto_medio)}`);
    }
    if (cxNum(r.desconto_maior)) partes.push(`maior desconto ${cxPct(r.desconto_maior)}`);
    if (cxNum(r.menor)) partes.push(`a partir de ${brl(r.menor)}`);
    alvo.textContent = partes.join(' · ');
  }

  const usados = ['cidade', 'tipo', 'modalidade', 'desconto', 'max', 'quartos', 'q'].filter((k) => CX[k]);
  $('#cx-limpar').innerHTML = usados.length
    ? `<button type="button" class="btn sm" data-act="cx-limpar">Limpar ${usados.length} filtro${usados.length > 1 ? 's' : ''}</button>` : '';

  const lista = $('#cx-lista');
  lista.innerHTML = d.itens.length
    ? `<div class="cx-grade">${d.itens.map(cxCartao).join('')}</div>`
    : `<div class="empty">Nenhum imóvel com esses filtros.${usados.length ? ' Tente afrouxar algum deles.' : ''}</div>`;

  const paginas = Math.ceil(d.total / d.por_pagina);
  $('#cx-paginas').innerHTML = paginas > 1
    ? `<button type="button" class="btn sm" data-act="cx-pagina" data-p="${d.pagina - 1}"${d.pagina <= 1 ? ' disabled' : ''}>← Anterior</button>
       <span class="muted small">Página ${d.pagina} de ${paginas}</span>
       <button type="button" class="btn sm" data-act="cx-pagina" data-p="${d.pagina + 1}"${d.pagina >= paginas ? ' disabled' : ''}>Próxima →</button>` : '';
}

ACT['cx-onde'] = (b) => cxVai({ uf: b.dataset.saiu === '1' ? CX.uf : b.dataset.uf, saiu: b.dataset.saiu, ordem: '' });
ACT['cx-limpar'] = () => cxVai({ cidade: '', tipo: '', modalidade: '', desconto: '', max: '', min: '', quartos: '', q: '' });
ACT['cx-pagina'] = (b) => cxVai({ pagina: Number(b.dataset.p) });