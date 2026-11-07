#!/usr/bin/env node
// Escreve as primeiras materias do blog a partir do que a base realmente sabe.
//
// O blog estava vazio e o link no menu levava a lugar nenhum. Em vez de encher de
// texto generico sobre "o mercado imobiliario", estas materias saem dos numeros que
// a gente mesmo levantou da lista da Caixa -- e por isso nenhum concorrente tem.
//
// Cada materia passa pelo validador do blog antes de entrar: artigo mal formado nao
// e publicado.
const path = require('path');
const { Client } = require('pg');
const { lerArtigo } = require(path.join('D:', 'herrera', 'src', 'blog', 'validar.js'));

const hoje = new Date().toISOString();
const br = (v) => 'R$ ' + Math.round(Number(v)).toLocaleString('pt-BR');
const pct = (v) => Number(v).toFixed(0) + '%';
const cap = (s) => String(s || '').toLowerCase().replace(/(^|[\s'])([a-za-u])/g, (_, a, b) => a + b.toUpperCase());

const FONTE_CARTILHA = { nome: 'Caixa - Cartilha Como comprar imoveis Caixa', url: 'https://www.caixa.gov.br/Downloads/habitacao-documentos-gerais/cartilha-como-comprar-imoveis-caixa.pdf' };
const FONTE_REGRAS = { nome: 'Caixa - Regras da Venda Online', url: 'https://venda-imoveis.caixa.gov.br/editais/regras-VOL/comocomprar.pdf' };
const FONTE_LISTA = { nome: 'Caixa - lista publica de imoveis a venda em SP', url: 'https://venda-imoveis.caixa.gov.br/sistema/busca-imovel.asp' };

async function dados(cli) {
  const q = async (sql) => (await cli.query(sql)).rows;
  const [geral] = await q(`select count(*) n, count(*) filter (where financiamento='Sim') fin,
      round(avg(nullif(desconto,0))::numeric,0) medio, max(desconto) maior, min(preco) menor
    from base.caixa_imoveis where saiu_em is null and na_rmc`);
  const [sp] = await q(`select count(*) n, count(*) filter (where financiamento='Sim') fin,
      round(avg(nullif(desconto,0))::numeric,0) medio from base.caixa_imoveis where saiu_em is null`);
  const cidades = await q(`select cidade, count(*) n, round(avg(nullif(desconto,0))::numeric,0) medio,
      min(preco) menor from base.caixa_imoveis where saiu_em is null and na_rmc group by cidade order by n desc`);
  const modal = await q(`select modalidade, count(*) n, count(*) filter (where financiamento='Sim') fin
    from base.caixa_imoveis where saiu_em is null group by modalidade order by n desc`);
  const tipos = await q(`select tipo, count(*) n from base.caixa_imoveis where saiu_em is null and na_rmc and tipo is not null group by tipo order by n desc`);
  return { geral, sp, cidades, modal, tipos };
}

// As capas moram no ramo de conteudo, nao apontando direto para o Wikimedia: a rede
// do escritorio nao alcanca os servidores de imagem deles e a capa aparecia quebrada.
// O credito de cada foto entra nas fontes da materia, que e o que a licenca pede.
const paginaCommons = (arquivo) => 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(arquivo.replace(/ /g, '_'));
const CAPAS = {
  desconto: {
    arquivo: 'Campinas skyline.jpg', autor: 'Elson Júnior', licenca: 'CC BY 2.0',
    src: 'https://raw.githubusercontent.com/balaocastelo-dev/ruahimoveis/plataforma/banco-materias/capas/caixa-desconto-campinas.jpg',
    largura: 1600, altura: 1172,
    alt: 'Prédios do Centro e do Cambuí, em Campinas, vistos de longe ao fim da tarde',
  },
  regras: {
    arquivo: 'Estação Cultura Campinas.jpg', autor: 'Edison Marcon', licenca: 'CC BY-SA 4.0',
    src: 'https://raw.githubusercontent.com/balaocastelo-dev/ruahimoveis/plataforma/banco-materias/capas/caixa-regras-campinas.jpg',
    largura: 1600, altura: 1067,
    alt: 'Fachada da Estação Cultura, antiga estação ferroviária de Campinas, em dia claro',
  },
  financiamento: {
    arquivo: 'Campinas at night.jpg', autor: 'João Carlos Medau', licenca: 'CC BY 2.0',
    src: 'https://raw.githubusercontent.com/balaocastelo-dev/ruahimoveis/plataforma/banco-materias/capas/caixa-financiamento-campinas.jpg',
    largura: 1600, altura: 1067,
    alt: 'Campinas vista do alto à noite, com as luzes da cidade espalhadas até o horizonte',
  },
};
const capaDe = (k) => ({ src: CAPAS[k].src, alt: CAPAS[k].alt, largura: CAPAS[k].largura, altura: CAPAS[k].altura });
const fonteDaCapa = (k) => ({ nome: `Foto da capa: ${CAPAS[k].autor} · ${CAPAS[k].licenca} · Wikimedia Commons`, url: paginaCommons(CAPAS[k].arquivo) });

function artigoDesconto(d) {
  const linhas = d.cidades.filter((c) => c.n >= 2).map((c) => [
    cap(c.cidade), String(c.n), c.medio ? pct(c.medio) : '—', c.menor ? br(c.menor) : '—',
  ]);
  return {
    slug: 'desconto-imoveis-caixa-campinas',
    titulo: 'Quanto desconto a Caixa realmente dá na região de Campinas',
    resumo: `Levantamos os ${d.geral.n} imóveis que a Caixa tem à venda na região metropolitana de Campinas e medimos o desconto cidade por cidade. A média fica em ${pct(d.geral.medio)} sobre a avaliação da própria Caixa.`,
    categoria: 'campinas',
    capa: capaDe('desconto'),
    publicadoEm: hoje,
    etiquetas: ['imóveis da Caixa', 'leilão', 'Campinas'],
    blocos: [
      { tipo: 'resumo', titulo: 'Em uma olhada', itens: [
        `${d.geral.n} imóveis da Caixa à venda na região metropolitana de Campinas`,
        `Desconto médio de ${pct(d.geral.medio)} sobre a avaliação da própria Caixa, chegando a ${pct(d.geral.maior)}`,
        `O mais barato sai por ${br(d.geral.menor)}`,
        `${d.geral.fin} aceitam financiamento; o resto é à vista`,
      ] },
      { tipo: 'paragrafo', texto: 'A Caixa publica todo dia a lista dos imóveis que retomou. São imóveis que voltaram para o banco depois de um financiamento que não foi pago, e que ela revende por leilão, licitação ou venda direta. O preço sai abaixo da avaliação, e a avaliação é feita pela própria Caixa, o que torna o desconto mais fácil de medir do que em qualquer anúncio de portal.' },
      { tipo: 'paragrafo', texto: `Baixamos a lista inteira do estado de São Paulo e separamos a região metropolitana de Campinas. São **${d.geral.n} imóveis** aqui, dentro de **${d.sp.n}** no estado.` },
      { tipo: 'titulo', nivel: 2, texto: 'O desconto, cidade por cidade' },
      { tipo: 'tabela', titulo: 'Imóveis da Caixa na região metropolitana de Campinas',
        colunas: ['Cidade', 'Imóveis', 'Desconto médio', 'Menor preço'],
        linhas, colunaDestaque: 2, fonte: FONTE_LISTA,
        nota: 'O desconto médio considera só os imóveis que têm desconto; parte da lista é vendida pelo valor de avaliação.' },
      { tipo: 'paragrafo', texto: 'Vale reparar numa coisa: desconto grande costuma andar junto com imóvel que precisa de obra, que está ocupado, ou que tem dívida de condomínio pendurada. O número sozinho não decide nada.' },
      { tipo: 'titulo', nivel: 2, texto: 'Por que o desconto existe' },
      { tipo: 'lista', itens: [
        'O banco não quer ser dono de imóvel. Cada mês parado custa condomínio, IPTU e manutenção.',
        'Muitos estão ocupados, e a desocupação corre por conta do comprador.',
        'A maioria é vendida sem visita interna: você compra pelo que está na ficha e na matrícula.',
        'Dívida de condomínio fica com o comprador até o limite de 10% do valor de avaliação.',
      ] },
      { tipo: 'destaque', tom: 'atencao', titulo: 'O desconto não é o lucro',
        texto: 'Antes de somar o abatimento, tire da conta a dívida de condomínio, o IPTU em aberto, a eventual ação de desocupação e a obra. Em imóvel retomado, a conta que importa é a do final.' },
      { tipo: 'titulo', nivel: 2, texto: 'O que tem à venda aqui' },
      { tipo: 'tabela', colunas: ['Tipo', 'Imóveis na região'],
        linhas: d.tipos.map((t) => [t.tipo, String(t.n)]), fonte: FONTE_LISTA },
    ],
    fontes: [FONTE_LISTA, FONTE_CARTILHA, fonteDaCapa('desconto')],
  };
}

function artigoRegras(d) {
  return {
    slug: 'regras-comprar-imovel-caixa',
    titulo: 'Imóvel da Caixa: as cinco regras que decidem o negócio',
    resumo: 'A entrada de 5% vale para todo mundo, inclusive na compra à vista. O crédito precisa estar aprovado antes do lance. E a dívida de condomínio é sua até 10% da avaliação. As regras que a maioria descobre tarde.',
    categoria: 'noticias',
    capa: capaDe('regras'),
    publicadoEm: hoje,
    etiquetas: ['imóveis da Caixa', 'leilão', 'financiamento'],
    blocos: [
      { tipo: 'paragrafo', texto: 'Comprar imóvel retomado da Caixa não é como comprar de um proprietário. O vendedor é um banco, as regras estão num edital, e quase tudo o que dá errado dá errado por desconhecer uma delas. Estas são as cinco que mais pesam.' },
      { tipo: 'titulo', nivel: 2, texto: '1. A entrada de 5% é de todo mundo' },
      { tipo: 'paragrafo', texto: 'Muita gente acha que os 5% são uma condição especial de alguns imóveis. Não são. A cartilha da Caixa diz que a entrada mínima de 5% do valor da proposta é obrigatória para **qualquer** imóvel, inclusive na compra à vista, e só cai em evento promocional. Ela é paga por boleto em até dois dias úteis depois da homologação.' },
      { tipo: 'titulo', nivel: 2, texto: '2. Crédito aprovado antes do lance, não depois' },
      { tipo: 'destaque', tom: 'atencao', titulo: 'É aqui que o negócio costuma morrer',
        texto: 'Se a proposta com financiamento ou FGTS ganhar e o crédito não for aprovado, a proposta pode ser cancelada com multa de 5% sobre o valor proposto. A aprovação prévia é obrigatória, não é recomendação.' },
      { tipo: 'titulo', nivel: 2, texto: '3. Nem todo imóvel aceita financiamento' },
      { tipo: 'paragrafo', texto: `Boa parte do estoque é só à vista. Dos ${d.sp.n} imóveis à venda em São Paulo, ${d.sp.fin} aceitam financiamento, e a proporção muda muito conforme a modalidade.` },
      { tipo: 'tabela', titulo: 'Quantos aceitam financiamento, por modalidade',
        colunas: ['Como é vendido', 'Imóveis em SP', 'Aceitam financiamento'],
        linhas: d.modal.map((m) => [m.modalidade, String(m.n), `${m.fin} (${pct((m.fin / m.n) * 100)})`]),
        colunaDestaque: 2, fonte: FONTE_LISTA },
      { tipo: 'titulo', nivel: 2, texto: '4. A dívida de condomínio vem junto, até um limite' },
      { tipo: 'paragrafo', texto: 'Condomínio atrasado fica por conta do comprador até o limite de 10% do valor de avaliação do imóvel. O que passar disso, a Caixa paga. IPTU e demais tributos em aberto seguem as condições do edital daquele imóvel, e costumam ser do comprador.' },
      { tipo: 'titulo', nivel: 2, texto: '5. O imóvel pode estar ocupado' },
      { tipo: 'paragrafo', texto: 'Parte do estoque é vendida ocupada, e a desocupação corre por conta de quem compra. O edital diz qual é o caso de cada um. É a diferença entre um bom negócio e uma ação judicial de dois anos.' },
      { tipo: 'pros-contras', titulo: 'Comprar imóvel retomado da Caixa',
        pros: [
          'Preço abaixo da avaliação feita pelo próprio banco',
          'Documentação do imóvel conferida pela Caixa antes de ir à venda',
          'Em parte do estoque, dá para financiar pela própria Caixa',
        ],
        contras: [
          'Quase sempre sem visita interna antes da compra',
          'Dívida de condomínio e tributos podem vir junto',
          'Pode estar ocupado, e a desocupação é sua',
          'Prazo curto: leilão e licitação têm data marcada',
        ] },
    ],
    fontes: [FONTE_CARTILHA, FONTE_REGRAS, fonteDaCapa('regras')],
  };
}

function artigoFinanciamento(d) {
  return {
    slug: 'financiamento-imovel-caixa-regiao-campinas',
    titulo: `Financiamento em imóvel da Caixa: só ${d.geral.fin} dos ${d.geral.n} da região aceitam`,
    resumo: 'Quem não tem o valor à vista depende de uma minoria do estoque. Levantamos quantos imóveis da Caixa na região metropolitana de Campinas aceitam financiamento, e o que isso muda na hora de escolher.',
    categoria: 'noticias',
    capa: capaDe('financiamento'),
    publicadoEm: hoje,
    etiquetas: ['imóveis da Caixa', 'financiamento', 'Campinas'],
    blocos: [
      { tipo: 'paragrafo', texto: 'A pergunta que mais aparece sobre imóvel retomado é se dá para financiar. A resposta honesta é: às vezes. E "às vezes" aqui é um número pequeno.' },
      { tipo: 'resumo', itens: [
        `${d.geral.fin} de ${d.geral.n} imóveis da Caixa na região aceitam financiamento`,
        `No estado de São Paulo são ${d.sp.fin} de ${d.sp.n}`,
        'A entrada de 5% existe de qualquer jeito, financiando ou não',
        'O crédito precisa estar aprovado antes de dar o lance',
      ] },
      { tipo: 'titulo', nivel: 2, texto: 'Depende da modalidade, não do imóvel' },
      { tipo: 'paragrafo', texto: 'A chance de encontrar financiamento muda bastante conforme a forma de venda. Leilão quase nunca aceita; venda online aceita com frequência. Os números da lista atual mostram isso com clareza.' },
      { tipo: 'tabela', colunas: ['Como é vendido', 'Imóveis em SP', 'Aceitam financiamento'],
        linhas: d.modal.map((m) => [m.modalidade, String(m.n), `${m.fin} (${pct((m.fin / m.n) * 100)})`]),
        colunaDestaque: 2, fonte: FONTE_LISTA },
      { tipo: 'titulo', nivel: 2, texto: 'Os 5% não são um benefício, são o piso' },
      { tipo: 'paragrafo', texto: 'Vale repetir, porque confunde: a entrada mínima de 5% do valor da proposta vale para qualquer imóvel da Caixa, inclusive na compra à vista. Não é uma condição especial de quem financia. O que muda, para quem financia, é poder pagar o resto a prazo.' },
      { tipo: 'destaque', tom: 'nota', titulo: 'FGTS tem trava própria',
        texto: 'Usar o FGTS exige imóvel residencial urbano, três anos de trabalho sob o regime do fundo, não ter outro imóvel residencial na mesma cidade e não ter financiamento ativo no SFH. A lista da Caixa não diz se o imóvel aceita FGTS: isso se confirma na agência ou no correspondente antes de propor.' },
    ],
    fontes: [FONTE_LISTA, FONTE_CARTILHA, FONTE_REGRAS, fonteDaCapa('financiamento')],
  };
}

(async () => {
  const url = process.env.DATABASE_URL;
  const cli = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: false });
  await cli.connect();
  const d = await dados(cli);
  console.log(`base: ${d.geral.n} na regiao, ${d.sp.n} no estado, desconto medio ${d.geral.medio}%`);
  const artigos = [artigoDesconto(d), artigoRegras(d), artigoFinanciamento(d)];
  let gravados = 0;
  for (const a of artigos) {
    const r = lerArtigo(a);
    if (!r.ok) { console.log('  x ' + a.slug + ': ' + r.erros.join(' | ')); continue; }
    await cli.query(
      `insert into oportunidades.blog_materias(slug, titulo, categoria, publicado_em, conteudo, recebida_em)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (slug) do update set titulo=excluded.titulo, categoria=excluded.categoria,
         publicado_em=excluded.publicado_em, conteudo=excluded.conteudo, recebida_em=excluded.recebida_em`,
      [a.slug, a.titulo, a.categoria, r.valor.publicadoEm, JSON.stringify(r.valor),
       new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 19)]);
    gravados++;
    console.log('  ok ' + a.titulo);
  }
  console.log(gravados + ' de ' + artigos.length + ' materias no blog');
  await cli.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
