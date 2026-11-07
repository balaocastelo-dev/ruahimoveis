// Paginas publicas das Oportunidades Caixa. Separado de caixa.js so para o arquivo
// nao ficar gigante: aqui mora o texto, la moram as contas.
const cfg = require('../config');
const P = require('./paginas');
const C = require('./caixa');

const CLIENTE = cfg.CLIENTE_NOME;
const { esc, reais, metros, pct, capitalizar, caminho, titulo, conta, blocoPreco, blocoPrazo, cartao, dataBr } = C;

// O que cada modalidade significa, em portugues de gente. Sai da cartilha "Como
// comprar imoveis Caixa" e das regras da Venda Online.
const MODALIDADES = {
  'Leilão SFI - Edital Único': {
    curto: 'leilão',
    como: `Vai a leilão público, com data marcada e lance mínimo. Acontece em duas praças: se ninguém arrematar na
      primeira, o imóvel volta na segunda, normalmente por um valor menor. Quem der o maior lance acima do mínimo leva.`,
    atencao: `Leilão costuma aceitar menos financiamento que as outras modalidades &mdash; confira na ficha se este aceita.`,
  },
  'Licitação Aberta': {
    curto: 'licitação aberta',
    como: `As propostas são recebidas até a data da licitação e abertas de uma vez. Ganha a maior proposta acima do
      valor mínimo. Em caso de empate, a Caixa desempata pelos critérios do edital.`,
    atencao: `A proposta é feita pelo site da Caixa e vale até a abertura. Depois disso não dá para mudar.`,
  },
  'Venda Direta Online': {
    curto: 'venda direta',
    como: `Compra direta pelo site da Caixa, sem disputa e sem data: a proposta é analisada e, se aceita, o negócio
      segue. Normalmente é a modalidade mais tranquila para quem vai financiar.`,
    atencao: `Sem prazo não quer dizer para sempre: o imóvel sai da lista quando alguém compra.`,
  },
  'Venda Online': {
    curto: 'venda online',
    como: `Disputa pela internet, com hora para encerrar. Dá para acompanhar os lances e cobrir até o fim do prazo.`,
    atencao: `Encerramento com hora marcada: quem deixa para o último minuto costuma perder para quem já tinha o
      crédito aprovado.`,
  },
};

// Valem para qualquer imovel da Caixa, em qualquer modalidade. Tirado da cartilha
// oficial (itens de pagamento e de responsabilidade do comprador) e conferido na
// pagina de cada imovel.
const REGRAS = [
  ['Entrada de 5%, sempre', `A entrada mínima de 5% do valor da proposta vale para <strong>qualquer</strong> imóvel da
    Caixa, inclusive na compra à vista, e é paga por boleto em até dois dias úteis depois da homologação. Só cai em
    evento promocional.`],
  ['Crédito aprovado antes, não depois', `Se a proposta for com financiamento ou FGTS, a aprovação prévia do crédito é
    obrigatória. Proposta vencedora sem crédito aprovado pode ser cancelada <strong>com multa de 5% sobre o valor
    proposto</strong>. É o jeito mais comum de essa compra dar errado.`],
  ['Dívida de condomínio até 10%', `Condomínio atrasado fica por conta do comprador até o limite de 10% do valor de
    avaliação; o que passar disso a Caixa paga. Esse é um dos números que a gente levanta antes de você propor.`],
  ['Tributos por conta do comprador', `IPTU e demais tributos em aberto são responsabilidade de quem compra, nas
    condições que o edital daquele imóvel descrever.`],
  ['O imóvel pode estar ocupado', `Parte do estoque é vendida ocupada, e a desocupação corre por conta do comprador.
    O edital diz qual é o caso. Conferir isso antes é metade do nosso trabalho.`],
];

// ------------------------------------------------------------- a vizinhanca
// O que existe a pe do endereco, levantado no OpenStreetMap (scripts/caixa-vizinhanca.js).
// Distancia vale mais que contagem: "ponto de onibus a 56 m" diz algo, "6 pontos de
// onibus" nao. A contagem fica como detalhe.
//
// So aparece quando a posicao e confiavel, e diz de onde veio. Com o endereco achado
// so pela rua, o texto avisa que o ponto e aproximado -- numero redondo mentiroso
// seria pior que bloco nenhum.
const METROS = (d) => (d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : d + ' m');
// O nome no singular de cada grupo. Derivar tirando o "s" do plural produzia
// "Pontos de onibu".
const NO_SINGULAR = {
  escola: 'Escola', mercado: 'Mercado', padaria: 'Padaria', farmacia: 'Farmácia',
  saude: 'Posto ou clínica', onibus: 'Ponto de ônibus', praca: 'Praça ou quadra', banco: 'Banco',
};

function blocoVizinhanca(i, viz) {
  if (!viz || !viz.itens || !viz.itens.length) return '';
  const aproximado = i.geo_precisao === 'rua';
  const linhas = viz.itens
    .filter((x) => x.perto)
    .sort((a, b) => a.perto.dist - b.perto.dist)
    .map((x) => {
      const nome = x.perto.nome ? ` &mdash; ${esc(x.perto.nome)}` : '';
      const titulo = NO_SINGULAR[x.grupo] || x.rotulo;
      return `<li><strong>${esc(titulo)}</strong> a ${METROS(x.perto.dist)}${nome}
        ${x.n > 1 ? `<span>${x.n} num raio de ${METROS(viz.raio)}</span>` : ''}</li>`;
    });
  if (!linhas.length) return '';

  const mapa = i.lat && i.lon
    ? `<p class="oc-viz-mapa"><a href="https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lon}#map=17/${i.lat}/${i.lon}"
        target="_blank" rel="noopener noreferrer">Ver o endereço no mapa ↗</a></p>` : '';

  return `<h2>O que tem por perto</h2>
    <ul class="oc-viz">${linhas.join('')}</ul>
    <p class="oc-viz-nota">Levantado no OpenStreetMap a partir ${aproximado
      ? 'da rua do imóvel &mdash; o ponto é aproximado, porque o número não foi localizado no mapa'
      : 'do endereço do imóvel'}. O mapa é mantido por voluntários: pode faltar coisa que existe.</p>
    ${mapa}`;
}


function ldImovel(req, i) {
  const c = conta(i);
  return {
    '@context': 'https://schema.org', '@type': 'Product',
    name: titulo(i),
    description: `${i.tipo || 'Imóvel'} da Caixa em ${capitalizar(i.bairro || i.cidade)}, ${capitalizar(i.cidade)}.`,
    sku: String(i.numero),
    offers: { '@type': 'Offer', priceCurrency: 'BRL', price: c.total, availability: 'https://schema.org/InStock',
      url: P.urlBase(req) + caminho(i) },
  };
}

// ------------------------------------------------------------------- vitrine
function paginaOportunidades(req, lista, resumo) {
  const financiam = lista.filter((i) => i.financiamento === 'Sim').length;
  const corpo = `<section class="oc-capa">
    <p class="p-destaque">Oportunidades Caixa</p>
    <h1>Imóveis retomados pela Caixa na região de Campinas</h1>
    <p class="oc-lead">A Caixa republica todo dia a lista dos imóveis que retomou, com desconto sobre a avaliação dela
      mesma. São ${lista.length} na região agora${financiam ? `, e ${financiam} aceitam financiamento` : ''}.
      Cada um tem prazo, regra e pegadinha própria &mdash; é aí que a gente entra.</p>
    <p class="oc-lead oc-lead-2">O imóvel é comprado da Caixa, pelo valor que ela publica. A ${esc(CLIENTE)} cobra
      ${C.TAXA}% de assessoria para achar, ler o edital, conferir dívida e ocupação e acompanhar a disputa.
      Os dois valores aparecem separados em cada ficha.</p>
  </section>
  ${resumo && resumo.safra ? `<p class="oc-safra">Lista da Caixa de ${esc(String(resumo.safra).slice(0, 10).split('-').reverse().join('/'))}</p>` : ''}
  <section class="oc-grade">${lista.map(cartao).join('')}</section>
  ${lista.length ? '' : '<p class="oc-vazio">Nenhum imóvel da Caixa na região neste momento. A lista é conferida todo dia.</p>'}`;

  return P.casca(req, {
    titulo: `Imóveis da Caixa em Campinas e região · ${esc(CLIENTE)}`,
    descricao: `${lista.length} imóveis retomados pela Caixa na região de Campinas, com desconto sobre a avaliação. Leilão, licitação e venda direta, com assessoria da ${CLIENTE}.`,
    caminho: '/oportunidades',
    classe: 'p-oc',
    corpo,
  });
}

// -------------------------------------------------------------------- ficha
function paginaOportunidade(req, i, parecidos = [], viz = null) {
  const m = MODALIDADES[i.modalidade] || { curto: 'venda', como: '', atencao: '' };
  const c = conta(i);
  const financia = i.financiamento === 'Sim';
  const ficha = [
    ['Tipo', i.tipo], ['Cidade', capitalizar(i.cidade)], ['Bairro', capitalizar(i.bairro)],
    ['Endereço', i.endereco], ['Quartos', i.quartos], ['Vagas', i.vagas],
    ['Área privativa', metros(i.area_util)], ['Área do terreno', metros(i.area_terreno)],
    ['Avaliação da Caixa', reais(i.avaliacao)], ['Desconto', pct(i.desconto)],
    ['Como é vendido', i.modalidade], ['Aceita financiamento', financia ? 'Sim' : 'Não'],
    ['Número na Caixa', i.numero],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  const zap = P.whatsapp(null, `Olá! Vi o imóvel ${i.numero} (${titulo(i)}) nas Oportunidades Caixa e quero entender como comprar.`);

  const corpo = `<article class="oc-materia">
    <nav class="oc-migalha" aria-label="Onde estou"><a href="/oportunidades">Oportunidades Caixa</a> › <span>${esc(capitalizar(i.cidade))}</span></nav>
    <p class="p-destaque">${esc(i.tipo || 'Imóvel')} · ${esc(m.curto)}</p>
    <h1>${esc(titulo(i))}</h1>
    <p class="oc-sub">${esc(capitalizar(i.cidade))}${i.endereco ? ' · ' + esc(i.endereco) : ''}</p>

    <figure class="oc-foto-g">
      <img src="/oportunidades/${esc(i.numero)}/foto" alt="${esc(titulo(i))}" onerror="this.closest('figure').remove()">
      <figcaption>Foto publicada pela Caixa na ficha deste imóvel.</figcaption>
    </figure>

    ${blocoPrazo(i, { grande: true })}

    <h2>Quanto custa</h2>
    ${blocoPreco(i, { detalhado: true })}
    ${financia ? `<p class="oc-fin">Este imóvel <strong>aceita financiamento da Caixa</strong>, o que é minoria no
      estoque. Vale lembrar que a entrada de 5% existe de qualquer jeito &mdash; o que muda é poder financiar o resto.</p>` : ''}

    <h2>Como se compra</h2>
    <p>${m.como}</p>
    ${m.atencao ? `<p class="oc-atencao">${m.atencao}</p>` : ''}

    <h2>O que conferir antes de propor</h2>
    <dl class="oc-regras">${REGRAS.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${d}</dd></div>`).join('')}</dl>

    ${blocoVizinhanca(i, viz)}

    <h2>A ficha</h2>
    <dl class="oc-ficha-l">${ficha.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${i.descricao ? `<p class="oc-desc-caixa"><strong>Como a Caixa descreve:</strong> ${esc(i.descricao)}</p>` : ''}

    <aside class="oc-cta">
      <h2>Quer este?</h2>
      <p>Antes de qualquer proposta a gente levanta a matrícula, a dívida de condomínio, o IPTU e a situação de
        ocupação, e te diz se vale o lance. Se não valer, a gente fala também.</p>
      ${zap ? `<a class="oc-btn oc-btn-g" href="${esc(zap)}" target="_blank" rel="noopener">Falar no WhatsApp sobre o imóvel ${esc(i.numero)}</a>` : ''}
      ${i.link ? `<p class="oc-link"><a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">Ver este imóvel no site da Caixa ↗</a></p>` : ''}
    </aside>

    ${parecidos.length ? `<section class="oc-parecidos"><h2>Outros na mesma cidade</h2>
      <div class="oc-grade">${parecidos.map(cartao).join('')}</div></section>` : ''}
  </article>`;

  return P.casca(req, {
    titulo: `${titulo(i)} · Imóvel da Caixa em ${capitalizar(i.cidade)}`,
    descricao: `${i.tipo || 'Imóvel'} da Caixa em ${capitalizar(i.bairro || i.cidade)}: ${reais(c.caixa)} na Caixa${i.desconto > 0 ? `, ${pct(i.desconto)} abaixo da avaliação` : ''}. Veja prazo, regras e o que conferir antes de propor.`,
    caminho: caminho(i),
    classe: 'p-oc p-oc-ficha',
    ld: [ldImovel(req, i)],
    corpo,
  });
}

module.exports = { paginaOportunidades, paginaOportunidade, MODALIDADES, REGRAS };