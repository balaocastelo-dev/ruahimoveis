// A pagina inicial do portal.
//
// Mora aqui, e nao dentro de paginas.js, porque o corpo dela e quase todo texto
// e ficava impossivel de ler no meio do resto.
//
// A ideia: o produto desta casa e uma lista que vence. Entao a pagina abre com o
// estado dela -- o que fecha primeiro, com o relogio correndo -- como um painel de
// embarque. A foto da cidade, que antes era uma parede de 770 pixels antes de
// qualquer coisa util, virou uma faixa de assinatura entre secoes.
//
// Tres regras guiaram o desenho:
//   1. Numero e manchete. Preco e desconto tem tamanho de titulo, porque numa lista
//      dessas sao eles a noticia.
//   2. Relogio so onde ha prazo de verdade. Os da venda direta dizem que nao tem.
//   3. As duas metades do preco sempre visiveis: o da Caixa e a assessoria da casa.
//      Honestidade como regra de leiaute, nao como aviso no rodape.
const cfg = require('../config');
const C = require('./caixa');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLIENTE = cfg.CLIENTE_NOME;
const TEL = String(process.env.WHATSAPP_CLIENTE || '').replace(/\D/g, '');
const telBonito = (n) => (n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n);

/** O painel de embarque: o que fecha primeiro.
 *  Agrupado por data, porque dezenas de imoveis dividem o mesmo encerramento --
 *  repetir o mesmo relogio linha a linha enche a tela e nao informa nada. */
function quadro(oc) {
  const grupos = [];
  for (const i of oc.fecham) {
    const p = C.prazoValido(i) || {};
    if (!p.quando) continue;
    const q = C.QUANDO[i.prazo_tipo] || {};
    const chave = p.quando + '|' + (i.prazo_tipo || '');
    let g = grupos.find((x) => x.chave === chave);
    if (!g) { g = { chave, quando: p.quando, chamada: q.chamada || 'Encerra em', itens: [] }; grupos.push(g); }
    g.itens.push(i);
  }

  const corpoGrupos = grupos.map((g) => {
    const linhas = g.itens.map((i) => {
      const c = C.conta(i);
      const ficha = [i.quartos ? `${i.quartos} q` : null, C.metros(i.area_util)].filter(Boolean).join(' · ');
      return `<a class="v-linha" href="/oportunidades/${esc(i.numero)}">
        <span class="v-onde"><b>${esc(C.capitalizar(i.bairro || i.cidade))}</b><span>${esc(C.capitalizar(i.cidade))}${ficha ? ' · ' + esc(ficha) : ''}</span></span>
        <span class="v-valor"><b>${esc(C.reais(c.total))}</b>${i.desconto > 0 ? `<span class="v-abaixo">${esc(C.pct(i.desconto))} abaixo</span>` : ''}</span>
      </a>`;
    }).join('');
    return `<div class="v-grupo">
      <p class="v-prazo" data-prazo="${esc(g.quando)}"><span>${esc(g.chamada)}</span> <b data-conta>—</b></p>
      ${linhas}
    </div>`;
  }).join('');

  const safra = oc.safra ? String(oc.safra).slice(0, 10).split('-').reverse().join('/') : null;
  const semPrazo = oc.semPrazo
    ? `<p class="v-sem-prazo">E ${oc.semPrazo} de venda direta, sem data marcada: ficam à venda enquanto estiverem na lista.</p>`
    : '';
  return `<aside class="v-quadro" aria-labelledby="v-quadro-t">
    <div class="v-quadro-cab">
      <h2 id="v-quadro-t">Fecha primeiro</h2>
      <p>${oc.total} à venda na região${safra ? ` · lista de ${safra}` : ''}</p>
    </div>
    ${corpoGrupos || '<p class="v-quadro-vazio">Nenhum com data marcada agora.</p>'}
    ${semPrazo}
    <a class="v-quadro-mais" href="/oportunidades">Ver todas as ${oc.total}</a>
  </aside>`;
}
/** A foto da cidade: faixa de assinatura, com o credito de quem fez. */
function faixaFoto(f) {
  if (!f || !f.src) return '';
  return `<figure class="v-faixa">
    <img src="${esc(f.src)}"${f.srcset ? ` srcset="${esc(f.srcset)}" sizes="100vw"` : ''} alt=""${f.largura ? ` width="${f.largura}" height="${f.altura}"` : ''} loading="lazy" decoding="async">
    <figcaption>${esc(f.lugar)}${f.credito ? ` · <a href="${esc(f.link)}" target="_blank" rel="noopener nofollow">${esc(f.credito)}</a>` : ''}</figcaption>
  </figure>`;
}

/** As tres duvidas que aparecem em toda conversa sobre imovel retomado. */
function comoFunciona() {
  const itens = [
    ['Por que é mais barato', 'São imóveis que voltaram para a Caixa depois de um financiamento que não foi pago. O banco não quer ser dono de imóvel, e vende abaixo da avaliação que ele mesmo fez.'],
    ['O que vem junto', 'Dívida de condomínio é do comprador até 10% do valor de avaliação, tributos seguem o edital, e parte do estoque é vendida ocupada. Conferir isso antes do lance é metade do nosso trabalho.'],
    ['Dá para financiar', 'Em parte deles, sim. A entrada mínima de 5% vale para qualquer imóvel da Caixa, inclusive à vista, e o crédito precisa estar aprovado <strong>antes</strong> do lance.'],
  ];
  return `<section class="v-como">
    <h2>Comprar da Caixa, sem susto</h2>
    <div class="v-como-grade">${itens.map(([t, d]) => `<div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
    <p class="v-como-mais"><a href="/blog/regras-comprar-imovel-caixa">As cinco regras que decidem o negócio</a></p>
  </section>`;
}

/** As ultimas do blog, no pe da pagina. */
function faixaBlog(posts, cortar) {
  return `<section class="v-blog">
    <div class="v-cab"><h2>No blog</h2><a class="v-mais" href="/blog">Ver tudo</a></div>
    <div class="v-blog-grade">${posts.map((p) => `<a class="v-post" href="/blog/${esc(p.slug)}">
      ${p.capa && p.capa.src ? `<img src="${esc(p.capa.src)}" alt="" loading="lazy" decoding="async">` : ''}
      <h3>${esc(p.titulo)}</h3>
      <p>${esc(cortar(p.resumo, 120))}</p>
    </a>`).join('')}</div>
  </section>`;
}
/**
 * O corpo da pagina inicial.
 * Recebe pronto o que a rota levantou e o que paginas.js sabe desenhar, para nao
 * duplicar nada: o cartao da carteira propria, os filtros e o seletor de versao.
 */
function corpo({ oc, fundo, doBlog, proprios, achados, daPagina, paginas, pagina, filtrado, guiaDoBairro, q, ferramentas }) {
  const { seletor, cartao, cortar, link } = ferramentas;
  const formulario = filtros(ferramentas.filtros);
  const temCaixa = oc.total > 0;
  // A busca da carteira propria so aparece com resultado ou com filtro: ninguem
  // procura num catalogo vazio, e "0 imoveis encontrados" e a pior segunda frase
  // que uma pagina inicial pode dar.
  const mostraResultado = achados.length > 0 || filtrado || !temCaixa;

  return `
${seletor}

<section class="v-abre">
  <div class="v-dizer">
    <h1>Imóveis que a Caixa retomou, na região de Campinas</h1>
    <p class="v-lead">A lista muda todo dia. A gente lê o edital, confere a dívida e a ocupação, e diz se vale o lance &mdash; ou se é melhor deixar passar.</p>
    <p class="v-acao">
      <a class="v-cta" href="/oportunidades">Ver as oportunidades</a>
      ${TEL ? `<a class="v-tel" href="tel:+55${TEL}">${telBonito(TEL)}</a>` : ''}
    </p>
    <p class="v-parte">Você compra direto da Caixa, pelo valor que ela publica. A nossa parte é
      <strong>12% de assessoria</strong> &mdash; achar o imóvel, ler o edital, conferir dívida e ocupação,
      e acompanhar da proposta à escritura. Os dois valores aparecem separados em cada ficha.</p>
  </div>
  ${temCaixa ? quadro(oc) : ''}
</section>

${faixaFoto(fundo)}

${temCaixa ? `<section class="v-vitrine">
  <div class="v-cab">
    <h2>Os maiores descontos de hoje</h2>
    <a class="v-mais" href="/oportunidades">Ver as ${oc.total}</a>
  </div>
  <p class="v-cab-l">O valor da Caixa e a assessoria da casa aparecem separados em cada ficha.${oc.financiam ? ` ${oc.financiam === 1 ? 'Um aceita' : `${oc.financiam} aceitam`} financiamento.` : ''}</p>
  <div class="oc-grade">${oc.destaques.map(C.cartao).join('')}</div>
</section>` : ''}

${mostraResultado ? `<section class="p-resultado" aria-live="polite">
  ${guiaDoBairro ? `<p class="p-guia">Quer conhecer melhor o bairro? <a href="/bairros/${esc(guiaDoBairro.slug)}">Guia do ${esc(guiaDoBairro.nome)}</a>.</p>` : ''}
  <div class="p-resultado-cab"><p><b>${achados.length}</b> ${achados.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}</p>${filtrado ? '<a href="/imoveis">Limpar filtros</a>' : ''}</div>
  ${daPagina.length ? `<div class="p-grade">${daPagina.map((x, i) => cartao(x, { eager: i < 3 })).join('')}</div>` : '<p class="v-nada">Nenhum imóvel da carteira própria com esses filtros.</p>'}
  ${paginas > 1 ? `<nav class="p-paginas" aria-label="Páginas">${pagina > 1 ? `<a href="${esc(link(pagina - 1))}" rel="prev">Anterior</a>` : ''}<span>Página ${pagina} de ${paginas}</span>${pagina < paginas ? `<a href="${esc(link(pagina + 1))}" rel="next">Próxima</a>` : ''}</nav>` : ''}
</section>` : ''}

<section class="v-busca">
  <h2>Procurar na carteira da casa</h2>
  <p class="v-busca-l">Os imóveis que a ${esc(CLIENTE)} representa diretamente.${proprios ? ` São ${proprios} hoje.` : ' Ainda em formação &mdash; enquanto isso, as oportunidades da Caixa estão acima.'}</p>
  ${formulario}
</section>

${comoFunciona()}
${doBlog && doBlog.length ? faixaBlog(doBlog, cortar) : ''}`;
}

/** Os filtros da carteira propria. Montado aqui para paginas.js nao precisar
 *  carregar outro template dentro do dele. */
function filtros({ q, grupos, bairros, faixas, reais }) {
  const sel = (v, atual) => (String(v) === String(atual || '') ? ' selected' : '');
  const opcoes = (lista) => lista.map(([valor, rotulo]) => `<option value="${esc(valor)}"${sel(valor, null)}>${esc(rotulo)}</option>`).join('');
  const tipo = grupos.map((g) => `<option value="${esc(g.slug)}"${sel(g.slug, q.tipo)}>${esc(g.nome)}</option>`).join('');
  const bai = bairros.map(([b, n]) => `<option value="${esc(b)}"${sel(b, q.bairro)}>${esc(b)} (${n})</option>`).join('');
  const qua = [1, 2, 3, 4].map((n) => `<option value="${n}"${sel(n, q.quartos)}>${n} ou mais</option>`).join('');
  const ate = faixas.map((v) => `<option value="${v}"${sel(v, q.ate)}>${esc(reais(v))}</option>`).join('');
  return `<form class="p-filtros" method="get" action="/imoveis" role="search" data-filtros>
    <label class="p-campo p-campo-q"><span>Procurar</span><input type="search" name="q" value="${esc(q.q || '')}" placeholder="Bairro, condomínio, código"></label>
    <label class="p-campo"><span>Tipo</span><select name="tipo"><option value="">Todos</option>${tipo}</select></label>
    <label class="p-campo"><span>Bairro</span><select name="bairro"><option value="">Todos</option>${bai}</select></label>
    <label class="p-campo"><span>Quartos</span><select name="quartos"><option value="">Qualquer</option>${qua}</select></label>
    <label class="p-campo"><span>Até</span><select name="ate"><option value="">Qualquer valor</option>${ate}</select></label>
    <button class="p-botao" type="submit">Buscar</button>
  </form>`;
}

module.exports = { corpo, filtros };