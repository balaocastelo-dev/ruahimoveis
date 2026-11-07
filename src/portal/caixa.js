// Oportunidades Caixa no portal publico.
//
//   /oportunidades            a vitrine dos imoveis retomados da regiao
//   /oportunidades/<numero>   a pagina de cada um, escrita como materia
//
// Duas regras governam este arquivo:
//
// 1. O preco da Caixa e o preco da Caixa. Quem vende o imovel e ela: o comprador
//    da lance no sistema dela, paga boleto dela e assina contrato com ela. Entao o
//    valor aparece como ela publica, e a assessoria da casa aparece como linha
//    separada, com o percentual escrito. Remarcar o imovel alheio e anunciar preco
//    que ninguem vai cobrar.
//
// 2. Prazo so quando existe. Leilao, licitacao e venda online tem data de verdade,
//    lida da pagina da Caixa (scripts/caixa-prazos.js). Venda direta nao tem prazo
//    nenhum -- ali a pagina diz isso, em vez de inventar um relogio correndo.
const cfg = require('../config');
const P = require('./paginas');

const CLIENTE = cfg.CLIENTE_NOME;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reais = (v) => (v || v === 0 ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : null);
const metros = (v) => (v ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²` : null);
const pct = (v) => (v ? `${Number(v).toFixed(0)}%` : null);

// Quanto a casa cobra para achar, conferir o edital e acompanhar a disputa.
const TAXA = (() => {
  const v = Number(String(process.env.CAIXA_ASSESSORIA || '12').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 12;
})();

const titulo = (i) => `${i.tipo || 'Imóvel'} em ${capitalizar(i.bairro || i.cidade)}`;
const caminho = (i) => `/oportunidades/${encodeURIComponent(i.numero)}`;

const ROMANO = /^(?:i{1,3}|i[vx]|vi{0,3}|ix|xi{0,3})$/;
function capitalizar(s) {
  return String(s || '').toLowerCase().split(/(\s+)/)
    .map((p) => (ROMANO.test(p) ? p.toUpperCase() : p.replace(/(^|['])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase())))
    .join('');
}

// ------------------------------------------------------------------ dinheiro
function conta(i) {
  const caixa = Number(i.preco) || 0;
  const assessoria = Math.round(caixa * (TAXA / 100));
  const total = caixa + assessoria;
  const avaliacao = Number(i.avaliacao) || 0;
  return {
    caixa, assessoria, total, avaliacao,
    // o argumento honesto: mesmo somando a assessoria, ainda esta abaixo da avaliacao
    abaixoAindaAssim: avaliacao > total ? avaliacao - total : 0,
    pctAindaAssim: avaliacao > total ? ((avaliacao - total) / avaliacao) * 100 : 0,
  };
}

function blocoPreco(i, { detalhado = false } = {}) {
  const c = conta(i);
  if (!c.caixa) return '';
  return `<div class="oc-preco${detalhado ? ' oc-preco-g' : ''}">
    <dl>
      <div><dt>Valor na Caixa</dt><dd>${esc(reais(c.caixa))}</dd></div>
      <div><dt>Assessoria ${esc(CLIENTE)} · ${TAXA}%</dt><dd>${esc(reais(c.assessoria))}</dd></div>
      <div class="oc-total"><dt>Total da operação</dt><dd>${esc(reais(c.total))}</dd></div>
    </dl>
    ${c.abaixoAindaAssim ? `<p class="oc-ganho">A Caixa avalia o imóvel em ${esc(reais(c.avaliacao))}.
      Mesmo com a assessoria, são <strong>${esc(reais(c.abaixoAindaAssim))} abaixo da avaliação</strong>
      (${esc(pct(c.pctAindaAssim))}).</p>` : ''}
    ${detalhado ? `<p class="oc-nota">O imóvel é comprado direto da Caixa, pelo valor dela: o lance, o boleto e o
      contrato são com a Caixa. A assessoria é o trabalho da ${esc(CLIENTE)} &mdash; achar o imóvel, ler o edital,
      conferir dívidas e ocupação, e acompanhar você da proposta até a escritura &mdash; e é contratada à parte.</p>` : ''}
  </div>`;
}

// -------------------------------------------------------------------- prazo
const QUANDO = {
  leilao: { rotulo: 'Leilão', chamada: 'Leilão em' },
  licitacao: { rotulo: 'Licitação', chamada: 'Licitação encerra em' },
  venda_online: { rotulo: 'Venda online', chamada: 'Encerra em' },
};

/** Devolve a data que ainda vale: no leilao, a 2a praça depois que a 1a passa. */
function prazoValido(i) {
  const agora = Date.now();
  const d1 = i.prazo_em ? Date.parse(i.prazo_em) : NaN;
  const d2 = i.prazo2_em ? Date.parse(i.prazo2_em) : NaN;
  if (Number.isFinite(d1) && d1 > agora) return { quando: i.prazo_em, praca: d2 ? 1 : 0 };
  if (Number.isFinite(d2) && d2 > agora) return { quando: i.prazo2_em, praca: 2 };
  if (Number.isFinite(d1) || Number.isFinite(d2)) return { passou: true, quando: i.prazo2_em || i.prazo_em };
  return null;
}

const dataBr = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')
    : '';
};

function blocoPrazo(i, { grande = false } = {}) {
  const q = QUANDO[i.prazo_tipo];
  const p = prazoValido(i);
  const classe = `oc-prazo${grande ? ' oc-prazo-g' : ''}`;

  if (!q || !p) {
    // Venda direta: nao existe prazo, e isso e argumento de venda, nao defeito.
    return `<p class="${classe} oc-prazo-livre"><span class="oc-prazo-r">Sem prazo</span>
      Fica à venda enquanto estiver na lista da Caixa &mdash; dá tempo de aprovar o financiamento sem correr.</p>`;
  }
  if (p.passou) {
    return `<p class="${classe} oc-prazo-fim"><span class="oc-prazo-r">${esc(q.rotulo)} já realizado</span>
      Foi em ${esc(dataBr(p.quando))}. Ainda aparece na lista da Caixa; consulte o resultado antes de contar com ele.</p>`;
  }
  return `<p class="${classe}" data-prazo="${esc(p.quando)}">
    <span class="oc-prazo-r">${esc(q.chamada)}${p.praca === 2 ? ' (2ª praça)' : ''}</span>
    <span class="oc-conta" data-conta>${esc(dataBr(p.quando))}</span>
    <span class="oc-prazo-d">${esc(dataBr(p.quando))}</span></p>`;
}

// ------------------------------------------------------------------ cartoes
function cartao(i) {
  const c = conta(i);
  const financia = i.financiamento === 'Sim';
  const ficha = [i.quartos ? `${i.quartos} ${i.quartos > 1 ? 'quartos' : 'quarto'}` : null,
    i.vagas ? `${i.vagas} ${i.vagas > 1 ? 'vagas' : 'vaga'}` : null,
    metros(i.area_util)].filter(Boolean);
  return `<article class="oc-card${financia ? ' oc-financia' : ''}">
    <a class="oc-foto" href="${esc(caminho(i))}" aria-label="${esc(titulo(i))}">
      <img src="/oportunidades/${esc(i.numero)}/foto" alt="${esc(titulo(i))}" loading="lazy" decoding="async" onerror="this.remove()">
      ${financia ? '<span class="oc-selo">Aceita financiamento</span>' : ''}
      ${i.desconto > 0 ? `<span class="oc-desc">${esc(pct(i.desconto))} abaixo da avaliação</span>` : ''}
    </a>
    <div class="oc-corpo">
      <p class="oc-tipo">${esc(i.tipo || 'Imóvel')} · ${esc(capitalizar(i.cidade))}</p>
      <h3><a href="${esc(caminho(i))}">${esc(capitalizar(i.bairro || i.cidade))}</a></h3>
      ${ficha.length ? `<p class="oc-ficha">${esc(ficha.join(' · '))}</p>` : ''}
      <p class="oc-valor">${esc(reais(c.total))}<span>total com assessoria</span></p>
      <p class="oc-valor-c">${esc(reais(c.caixa))} na Caixa + ${TAXA}% de assessoria</p>
      ${blocoPrazo(i)}
      <a class="oc-btn" href="${esc(caminho(i))}">Ver a ficha completa</a>
    </div>
  </article>`;
}

module.exports = { TAXA, conta, capitalizar, caminho, titulo, blocoPreco, blocoPrazo, cartao, reais, metros, pct, esc, dataBr, prazoValido, QUANDO };