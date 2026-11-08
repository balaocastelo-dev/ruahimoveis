// A pagina inicial do portal -- segunda versao.
//
// A primeira abria com o painel da Caixa e empurrava a busca para baixo, com o
// argumento de que ninguem procura no vazio. O Thiago pediu o contrario, e esta
// certo: a lista da Caixa e um produto a parte e ja tem pagina propria; quem
// chega numa casa de alto padrao quer dizer onde quer morar, nao receber um
// leilao na cara.
//
// O desenho gasta ousadia num lugar so: a pergunta. Ela e o campo de busca sao
// a mesma coisa -- mesma serifa, tamanho de manchete, um fio dourado por baixo.
// Nao ha caixa de filtro com cinco cortinas: isso e cara de portal de anuncio.
// Os refinamentos ficam miudos sob o fio. O resto da pagina e fio, espaco e
// silencio: nenhum cartao com sombra, nenhuma foto de banco de imagem.
//
// O fundo da abertura nao e preto: e verde-tinta. Campinas e cidade de arvore, e
// ouro sobre verde e mais esta casa do que ouro sobre creme, que e o que todo
// site de alto padrao faz.

const cfg = require('../config');
const C = require('./caixa');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLIENTE = cfg.CLIENTE_NOME;
const TEL = String(process.env.WHATSAPP_CLIENTE || '').replace(/\D/g, '');
const telBonito = (n) => (n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n);
const num = (n) => Number(n || 0).toLocaleString('pt-BR');

/** A pergunta. O unico elemento grande da pagina: titulo e campo sao a mesma voz. */
function pergunta(f, conhece) {
  const { q = {}, grupos = [], bairros = [], faixas = [], reais } = f || {};
  const sel = (v, atual) => (String(v) === String(atual || '') ? ' selected' : '');
  const tipo = grupos.map((g) => `<option value="${esc(g.slug)}"${sel(g.slug, q.tipo)}>${esc(g.nome)}</option>`).join('');
  const bai = bairros.map(([b, n]) => `<option value="${esc(b)}"${sel(b, q.bairro)}>${esc(b)} (${n})</option>`).join('');
  const qua = [1, 2, 3, 4].map((n) => `<option value="${n}"${sel(n, q.quartos)}>${n} ou mais</option>`).join('');
  const ate = (faixas || []).map((v) => `<option value="${v}"${sel(v, q.ate)}>${esc(reais ? reais(v) : v)}</option>`).join('');

  const sabe = [];
  if (conhece && conhece.condominios) sabe.push(`${num(conhece.condominios)} condomínios`);
  if (conhece && conhece.bairros) sabe.push(`${num(conhece.bairros)} bairros`);

  return `<section class="v-abrir">
  <div class="v-abrir-dentro">
    <h1 class="v-titulo">Onde você quer morar?</h1>
    <form class="v-busca" method="get" action="/imoveis" role="search">
      <div class="v-linha-busca">
        <label class="v-campo">
          <span class="oculto">Bairro, condomínio ou código do imóvel</span>
          <input type="search" name="q" value="${esc(q.q || '')}" placeholder="Cambuí, Sensia Parque Prado, AP-1042" autocomplete="off" enterkeyhint="search" spellcheck="false">
        </label>
        <button class="v-ir" type="submit">Procurar</button>
      </div>
      <div class="v-refino">
        <label><span>Tipo</span><select name="tipo"><option value="">Todos</option>${tipo}</select></label>
        <label><span>Bairro</span><select name="bairro"><option value="">Todos</option>${bai}</select></label>
        <label><span>Quartos</span><select name="quartos"><option value="">Qualquer</option>${qua}</select></label>
        <label><span>Até</span><select name="ate"><option value="">Qualquer valor</option>${ate}</select></label>
      </div>
    </form>
    ${sabe.length ? `<p class="v-sabe">${esc(sabe.join(' e '))} de Campinas e região, levantados um a um.</p>` : ''}
  </div>
</section>`;
}
/** O que a busca achou fora da carteira: bairro que a casa escreveu, predio que
 *  ela mapeou. E o que faz a busca valer alguma coisa enquanto a carteira enche. */
function alem(a) {
  if (!a) return '';
  const bs = a.bairros || [], cs = a.condominios || [];
  if (!bs.length && !cs.length) return '';
  const bloco = (titulo, itens) => itens.length ? `<div class="v-alem-bloco">
      <h3>${esc(titulo)}</h3>
      <ul class="v-alem-lista">${itens.join('')}</ul>
    </div>` : '';

  const lb = bs.slice(0, 6).map((b) => `<li><a href="/bairros/${esc(b.slug)}">
      <b>${esc(b.nome)}</b><span>${esc(b.resumo || 'Guia do bairro')}</span></a></li>`);
  const lc = cs.slice(0, 8).map((c) => `<li><a href="/condominio-3d.html?id=${esc(c.id)}">
      <b>${esc(c.nome)}</b><span>${esc([c.bairro, c.cidade].filter(Boolean).join(' · ') || 'Campinas')}</span></a></li>`);

  return `<section class="v-alem">
    <p class="v-alem-nota">Na carteira não há nada com esse nome ainda — mas a casa conhece estes:</p>
    ${bloco('Bairros', lb)}
    ${bloco('Prédios e condomínios', lc)}
  </section>`;
}

/** A faixa da Caixa. A lista inteira mora em /oportunidades: aqui fica so a porta. */
function faixaCaixa(oc) {
  if (!oc || !oc.total) return '';
  const n = [['à venda na região', num(oc.total)]];
  if (oc.maiorDesconto > 0) n.push(['maior abatimento', C.pct(oc.maiorDesconto)]);
  if (oc.financiam > 0) n.push(['aceitam financiamento', num(oc.financiam)]);
  const nums = n.map(([rotulo, valor]) => `<div><dd>${esc(valor)}</dd><dt>${esc(rotulo)}</dt></div>`).join('');

  return `<section class="v-caixa">
    <div class="v-caixa-dizer">
      <h2>Imóveis que a Caixa retomou</h2>
      <p>Uma lista à parte, que muda todo dia e tem prazo para acabar. A casa lê o
      edital, confere dívida e ocupação, e diz se vale o lance — ou se é melhor
      deixar passar. O preço é o da Caixa; a assessoria aparece separada.</p>
      <a class="v-caixa-ir" href="/oportunidades">Ver a lista da região</a>
    </div>
    <dl class="v-caixa-n">${nums}</dl>
  </section>`;
}

/** Os bairros que a casa escreveu. Conhecimento da cidade e o que ela tem de proprio. */
function faixaBairros(lista) {
  if (!lista || !lista.length) return '';
  const itens = lista.slice(0, 6).map((b) => `<a class="v-bairro" href="/bairros/${esc(b.slug)}">
      <b>${esc(b.nome)}</b>
      ${b.resumo ? `<span>${esc(b.resumo)}</span>` : ''}
    </a>`).join('');
  return `<section class="v-bairros">
    <div class="v-cab">
      <h2>Os bairros, por dentro</h2>
      <a class="v-mais" href="/bairros">Todos os bairros</a>
    </div>
    <p class="v-cab-l">O que se ouve da rua, o que custa o metro quadrado, onde ficam escola,
    mercado e parque. Escrito bairro a bairro, não copiado de portal.</p>
    <div class="v-bairros-grade">${itens}</div>
  </section>`;
}
/** As ultimas do blog. */
function faixaBlog(posts, cortar) {
  if (!posts || !posts.length) return '';
  const itens = posts.slice(0, 3).map((p) => `<a class="v-post" href="/blog/${esc(p.slug)}">
      ${p.capa ? `<img src="${esc(p.capa)}" alt="" loading="lazy" decoding="async">` : ''}
      <h3>${esc(p.titulo)}</h3>
      ${p.resumo ? `<p>${esc(cortar ? cortar(p.resumo, 120) : p.resumo)}</p>` : ''}
    </a>`).join('');
  return `<section class="v-blog">
    <div class="v-cab"><h2>Do blog</h2><a class="v-mais" href="/blog">Todas as matérias</a></div>
    <div class="v-blog-grade">${itens}</div>
  </section>`;
}

/** A carteira propria: o resultado da busca, ou o estado honesto de quando nao ha nada. */
function carteira({ achados, daPagina, pagina, paginas, filtrado, proprios, q, ferramentas, alemDaCasa }) {
  const { cartao, link } = ferramentas;

  if (daPagina && daPagina.length) {
    const nav = paginas > 1 ? `<nav class="v-paginas" aria-label="Páginas">
        ${pagina > 1 ? `<a href="${esc(link(pagina - 1))}" rel="prev">Anterior</a>` : ''}
        <span>Página ${pagina} de ${paginas}</span>
        ${pagina < paginas ? `<a href="${esc(link(pagina + 1))}" rel="next">Próxima</a>` : ''}
      </nav>` : '';
    return `<section class="v-carteira" id="resultado">
      <div class="v-cab">
        <h2>${filtrado ? `${num(achados.length)} ${achados.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}` : 'Na carteira'}</h2>
        ${filtrado ? '<a class="v-mais" href="/imoveis">Limpar a busca</a>' : ''}
      </div>
      <div class="p-grade">${daPagina.map((x) => cartao(x)).join('')}</div>
      ${nav}
    </section>`;
  }

  if (filtrado) {
    return `<section class="v-carteira" id="resultado">
      <div class="v-cab"><h2>Nada na carteira com esse pedido</h2><a class="v-mais" href="/imoveis">Limpar a busca</a></div>
      ${alem(alemDaCasa)}
    </section>`;
  }

  if (!proprios) {
    return `<section class="v-carteira" id="resultado">
      <div class="v-cab"><h2>A carteira está sendo montada</h2></div>
      <p class="v-carteira-l">Esta casa é de um corretor só, e cada imóvel entra aqui depois de visitado,
      fotografado e com a documentação conferida — não por importação de anúncio alheio. Enquanto a
      carteira enche, o que ela tem de próprio é o que sabe da cidade: os bairros escritos um a um e a
      base de prédios de Campinas, cada um com a vista do andar em 3D.</p>
      <p class="v-carteira-acao">Tem imóvel para vender ou alugar?
      <a href="tel:+55${esc(TEL)}">${esc(telBonito(TEL))}</a> — falo direto, sem atendente.</p>
    </section>`;
  }
  return '';
}

function corpo(d) {
  const { oc = {}, doBlog = [], proprios = 0, achados = [], daPagina = [], paginas = 1, pagina = 1,
    filtrado = false, q = {}, ferramentas = {}, conhece = {}, bairrosGuia = [], alemDaCasa = null } = d;
  return [
    pergunta(ferramentas.filtros, conhece),
    carteira({ achados, daPagina, pagina, paginas, filtrado, proprios, q, ferramentas, alemDaCasa }),
    filtrado ? '' : faixaBairros(bairrosGuia),
    filtrado ? '' : faixaCaixa(oc),
    filtrado ? '' : faixaBlog(doBlog, ferramentas.cortar),
  ].filter(Boolean).join('\n');
}

module.exports = { corpo, pergunta, filtros: pergunta };