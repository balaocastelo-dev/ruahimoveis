# Banco de matérias do blog — rotina de quem escreve

Este ramo (`plataforma/banco-materias`) é o **banco de matérias** da plataforma
Herrera HOUSE IA. Daqui saem as matérias dos blogs de **todas** as imobiliárias
clientes. Todo dia, a entrega automática pega matérias prontas do banco e manda
para cada imobiliária ativa, conforme o plano (1, 2 ou 3 por dia).

**Regra de ouro: cada matéria vai para UMA imobiliária só.** Nenhum texto aparece
em dois blogs. Por isso o banco precisa de muitas matérias, sempre diferentes,
e você escreve várias por rodada.

## O que você faz numa rodada

1. `node scripts/banco-materias.mjs preparar` — mostra o estoque, quantas
   imobiliárias consomem por dia, **QUANTAS ESCREVER NESTA RODADA** (até 3), o
   tipo com menos estoque e todos os **temas já usados**. Se disser 0, encerre.
2. Para cada matéria a escrever:
   1. Escolha um assunto que **não** está na lista de temas (pauta em
      `pauta.md`; quando acabar, use os critérios abaixo). Prefira o tipo com
      menos estoque. Varie a categoria.
   2. Pesquise: de três a seis páginas boas, lidas de verdade.
   3. Escreva em `/tmp/materia-N.json` (fora do repositório), com `tema` e
      `{{cliente}}` (veja abaixo).
   4. `node scripts/banco-materias.mjs conferir /tmp/materia-N.json` — corrija
      até passar. Releia como leitor; confira cada número contra a fonte.
   5. `node scripts/banco-materias.mjs adicionar /tmp/materia-N.json`.
3. Relate em poucas linhas: títulos, tipos, temas, fontes e dúvidas.

## O que pode e o que não pode

**Pode:** pesquisar na internet, escrever arquivos JSON fora do repositório e
usar `node scripts/banco-materias.mjs`.

**Não pode, em nenhuma hipótese:** mexer no código do sistema; enviar algo para
outro ramo; editar à mão `indice.json`, `materias/` ou `capas/`; contornar a
conferência; mandar mensagem a alguém ou publicar em rede social; falar de um
imóvel específico, cliente, proprietário ou valor de imóvel de uma carteira.
Se algo impedir (GitHub fora, erro que não é da matéria), **pare e relate**.

## Os três tipos

| Tipo | Como marcar | Tamanho |
|---|---|---|
| **Artigo** | categoria `alto-padrao`, `construcao`, `interiores`, `bem-estar` ou `campinas` | 1.200 palavras ou mais, 4 seções, "Em resumo", 2 entre tabela e prós e contras, 3 a 6 perguntas |
| **Notícia** | `"categoria": "noticias"` | 350 a 750 palavras, 2 seções, seção "O que isso muda para você" |
| **Dica** | `"formato": "dica"` + categoria de artigo | 450 a 950 palavras, 2 seções, "Em resumo", lista/tabela/prós e contras, 2 ou 3 perguntas |

**Notícia vence em 5 dias**: se não for entregue até lá, sai do estoque. Por isso
escreva notícia só com fato **dos últimos sete dias**, confirmado por duas fontes
abertas nesta sessão (uma delas a origem: Banco Central, Caixa, IBGE, FipeZap,
Secovi-SP, Abrainc, CBIC, Prefeitura de Campinas, Diário Oficial). Duas notícias
não podem contar o mesmo fato: cada imobiliária recebe a sua. Se não houver fato
novo confirmado, escreva artigo ou dica no lugar.

**Dica:** uma pergunta só, daquelas que o curioso faz; abre respondendo.

## Como escolher o assunto

Um bom assunto é **algo que a pessoa curiosa pesquisa ou salva no Instagram**:
uma ideia para a casa, uma dúvida antes de comprar, um jeito de viver melhor.

Não serve: locação, dica jurídica ou tributária para caso concreto, "os X imóveis
mais caros", listas de produtos com preço, ranking de bairro "melhor/pior", e
**tema que já está no banco** (o comando recusa tema e título parecidos).
Assunto amplo pode render vários temas diferentes ("iluminação da cozinha",
"iluminação do banheiro"), desde que cada texto seja de fato outro.

## Pesquisa e honestidade

1. **Fato só de página aberta nesta sessão.** Norma, lei, taxa, índice, data,
   nome de programa: tudo sai de uma página que você abriu agora, e ela vai em
   `fontes`. Sua memória serve para explicar como as coisas funcionam; não
   serve para número, data, norma nem regra vigente.
2. **Prefira a origem.** Lei no Planalto, norma na ABNT, regra no Banco
   Central ou na Caixa, dado no IBGE, pesquisa no próprio instituto, plano na
   Prefeitura. Depois, jornais e revistas conhecidas (de arquitetura, de
   economia). Fórum, blog de corretor e vídeo não são fonte.
3. **Nada de frase atribuída a alguém** entre aspas.
4. **A rotina não visitou nem testou nada.** Não escreva "visitamos",
   "testamos", "nossos clientes", "nossa equipe avaliou".
5. **Faixa e contexto, não número solto.**
6. **Texto próprio.** Nunca copie nem parafraseie de perto. Leia, entenda,
   feche a página e escreva.
7. **Nada de preço de imóvel, parcela, desconto ou promessa.** Nada de
   "valorização garantida", "investimento seguro", "não tem como perder". Fora
   da notícia, nada de valor em reais. A régua reprova.
8. **Lei e imposto:** explique a regra geral com a fonte e diga que cada caso
   pede um advogado, contador ou o cartório. Nunca "você não precisa pagar".
9. **Saúde e bem-estar:** fale de conforto, luz, silêncio, ventilação e verde
   com base em fonte séria; não prometa efeito em doença.

## A foto de capa

Toda matéria sai com uma foto de capa: uma fotografia simulada do assunto.
**Quem faz a foto é o PC da RTX 4090**, de madrugada. Você escreve o pedido; o
`adicionar` grava a matéria e deixa o pedido numa fila; o PC gera a foto, um
modelo de visão confere (texto, marca, rosto, deformação, cena errada) e a foto
entra na matéria sozinha. Só então ela fica "pronta" e pode ser entregue. Não
use ferramenta de imagem nenhuma e não baixe foto de lugar nenhum.

```json
"capa": {
  "alt": "Sala de estar ampla com pé-direito duplo, sofá claro e grandes janelas para um jardim",
  "pedido": "A spacious modern living room with a double-height ceiling and floor-to-ceiling windows opening onto a lush tropical garden. A low light-gray linen sofa, a solid wood coffee table and a large wool rug. Warm afternoon sunlight, wide-angle architectural photography, eye level."
}
```

- `alt`: em português, 12 caracteres ou mais — o que a foto mostra.
- `pedido`: **em inglês**, de 60 a 900 caracteres. Uma cena só, concreta: o
  ambiente, os objetos, os materiais, o ângulo, a luz. De três a cinco frases.

**Como escrever um bom pedido:**

- Ambientes, fachadas, materiais e jardins saem muito bem: "architectural
  photography", "interior design photography", luz natural.
- **Sem pessoas.** Rosto reprova; mão sai deformada. Nem de costas.
- **Sem texto:** nada de placa "vende-se", número de casa, quadro com
  escrita, livro com título visível, tela de TV ligada (peça a TV desligada).
- **Sem marca nem peça de design famosa pelo nome.** Não escreva o nome de
  designer, de fábrica ou de modelo de móvel ("Eames", "Barcelona chair"):
  descreva o material e a forma ("a lounge chair in walnut and black leather").
- Nada que passe por foto de um imóvel real da {{cliente}}, de condomínio conhecido
  de Campinas ou de um lugar identificável. Ambiente genérico e bonito.
- Construção: canteiro limpo, estrutura, materiais, plantas de arquitetura
  enroladas sobre uma mesa (sem texto legível), sem operários.
- Bem-estar: luz, plantas, água, madeira, tecidos; nada de remédio.

O "sem texto, sem logotipo, sem rosto" o PC acrescenta sozinho.

## O nome da imobiliária: {{cliente}}

A matéria vai para **uma** imobiliária, que você não sabe qual é. Onde entraria o
nome dela, escreva exatamente `{{cliente}}` — na entrega o banco troca pelo nome
de quem recebe ("Fale com a {{cliente}}" vira "Fale com a Casa Prado").
**Nunca** escreva o nome de uma imobiliária de verdade: o comando recusa.

Só o que se pode dizer da {{cliente}}:

- É uma imobiliária em Campinas (SP).
- Atende quem quer comprar e quem quer vender um imóvel.
- O atendimento é feito por pessoas da equipe.

Não invente bairros atendidos, número de imóveis, anos de mercado, prêmio,
certificação, parceria, prazo de venda, rede social, site nem "garantia". Não
fale de concorrente nem de outra imobiliária. A {{cliente}} aparece **só no fim**
(último parágrafo ou última seção) e nas chamadas. Use `{{cliente}}` ao menos
uma vez.

## Links

Ao menos dois links para dentro do blog, no meio do texto, só destes:

| Endereço | O que é |
|---|---|
| `/blog` | A página inicial do blog |
| `/blog/categoria/alto-padrao` | Alto padrão |
| `/blog/categoria/construcao` | Construção e casas novas |
| `/blog/categoria/interiores` | Interiores e mobiliário |
| `/blog/categoria/bem-estar` | Bem-estar em casa |
| `/blog/categoria/campinas` | Campinas e região |
| `/blog/categoria/noticias` | Mercado imobiliário |

**Não ligue para outra matéria** (`/blog/<endereço>`): cada imobiliária recebe
textos diferentes, o link não existiria. Use `/blog` e as categorias.

**O leitor não sai do site da {{cliente}}.** Nenhum link para fora no texto: nada
de `https://` em parágrafo, lista, tabela ou destaque (a régua reprova). As
fontes vão só no campo `fontes`; o blog as mostra no fim, citadas pelo nome e
pelo site, sem link. No texto, cite a origem pelo nome ("segundo a CBIC").

## Formato do artigo

```json
{
  "slug": "como-avaliar-imovel-de-alto-padrao",
  "tema": "como avaliar imovel de alto padrao antes de comprar",
  "titulo": "Como avaliar um imóvel de alto padrão antes de comprar",
  "resumo": "De 110 a 165 caracteres, respondendo à busca.",
  "categoria": "alto-padrao",
  "etiquetas": ["compra", "alto padrão", "vistoria"],
  "capa": { "alt": "…", "pedido": "…" },
  "seo": { "titulo": "Só se o título passar de 60 caracteres" },
  "redes": {
    "legenda": "O texto do post no Instagram e no Facebook, de 80 a 600 caracteres, sem link. Termina convidando a ler o artigo completo no blog (link na bio).",
    "hashtags": ["altopadrao", "campinas", "arquitetura", "casanova"]
  },
  "blocos": [],
  "perguntas": [{ "pergunta": "…?", "resposta": "Duas ou três frases." }],
  "fontes": [{ "nome": "Nome da página — site", "url": "https://…", "data": "outubro de 2026" }]
}
```

- `slug`: minúsculas, números e hífens; as palavras da busca; até 75 caracteres.
- `categoria`: `alto-padrao`, `construcao`, `interiores`, `bem-estar`,
  `campinas` ou `noticias`.
- `formato`: `"dica"` **só na dica**.
- `publicadoEm` e `autor`: **não preencha** (a entrega marca o dia e a hora).
- `tema`: **obrigatório** — o assunto em 3 a 8 palavras ("piso de madeira ou porcelanato na sala").
  O banco não aceita dois temas iguais.
- `etiquetas`: de duas a seis, em minúsculas; repita as de artigos parecidos.
- `redes`: a legenda que leva o curioso ao blog. Abre com um gancho (uma
  pergunta, um dado curioso), entrega uma ideia útil, e convida a ler o resto
  no blog. Sem link (vai na bio), sem preço, sem promessa. Hashtags só com
  letras e números, sem `#`, de 4 a 10, misturando tema (arquitetura,
  decoracao, casanova…) e lugar (campinas).

### Os blocos

Texto aceita só `**negrito**`, `*itálico*` e `[texto](endereço)`. Nada de HTML.

| Bloco | Campos | Uso |
|---|---|---|
| `paragrafo` | `texto` | Uma ideia por parágrafo, de 40 a 65 palavras; nunca mais de 110 |
| `titulo` | `nivel` (2 ou 3), `texto` | Seção (2) e subseção (3) |
| `resumo` | `itens` | "Em resumo": 3 ou 4 pontos logo depois da abertura (menos na notícia) |
| `lista` | `itens`, `ordenada` | Passos (ordenada) ou itens |
| `tabela` | `titulo`, `colunas`, `linhas`, `colunaDestaque`, `fonte`, `nota` | Opções lado a lado; toda linha com o mesmo número de células |
| `pros-contras` | `titulo`, `pros`, `contras` | O que pesa a favor e contra |
| `destaque` | `tom` (`dica`, `atencao`, `nota`), `titulo`, `texto` | Um alerta ou dica fora do fluxo |
| `chamada` | `tema` | O convite para falar com a {{cliente}}. Só o tema: o texto já está escrito |

Temas de chamada: `comprar` (procura imóvel: abre o contato do blog),
`vender` (vai vender: abre o contato do blog), `alto-padrao` (ver os imóveis
à venda na vitrine da {{cliente}}), `visita` (escolher um imóvel na vitrine e pedir
a visita), `blog` (mais textos do blog) e `geral` (dúvida: abre o contato). Não existe chamada para
Instagram ou outra rede: o leitor não sai do site da {{cliente}}. Escolha o que continua o
assunto do artigo; o comum é uma no meio e outra no fim.

## O que a régua cobra

- Principal: 1.200 palavras ou mais, 4 seções, "Em resumo", 2 entre tabela e
  prós e contras, 3 a 6 perguntas. Notícia: 350 a 750 palavras, 2 seções, a
  seção "O que isso muda para você". Dica: 450 a 950 palavras, 2 seções,
  "Em resumo", uma lista/tabela/prós e contras, 2 ou 3 perguntas.
- Título de 30 a 80 caracteres, com a palavra da busca no começo. Resumo de
  110 a 165.
- Abre com parágrafo (antes de qualquer título) que já responde à busca.
- 1 a 3 chamadas, nenhuma no primeiro quarto, nunca duas seguidas.
- Ao menos 2 links para dentro do blog, da lista acima, e nenhum link para fora.
- Ao menos 2 fontes. Campo `redes` com legenda (80 a 600) e 4 a 10 hashtags.
- Sem parcela, desconto, promessa de ganho; sem reais fora da notícia; sem
  "testamos"/"visitamos".
- Foto de capa descrita (`alt` e `pedido`), sem pessoas no pedido.

## Como o texto soa

- Segunda pessoa ("você"), elegante e acolhedor, frases diretas. Sem gíria e
  sem entusiasmo de anúncio: nada de "incrível", "imperdível", "dos sonhos",
  "sem dúvida".
- Inspira e ensina ao mesmo tempo: a pessoa termina o texto com uma ideia
  clara do que fazer na casa dela ou do que olhar antes de comprar.
- Explique o termo técnico na primeira vez (pé-direito, laje, NBR, ITBI).
- Não prometa: "costuma", "normalmente", "depende de".
- Abertura em dois parágrafos: o primeiro descreve a situação ou o desejo do
  leitor com a palavra da busca; o segundo adianta a resposta.
- Títulos de seção dizem o que o leitor decide ali, não "Introdução".
- Quase toda seção tem um "mas": quando a ideia não vale.
- Em obra e reforma: diga o que exige engenheiro ou arquiteto responsável
  (ART/RRT) e **onde parar** — nunca oriente mexer em estrutura, gás ou
  elétrica por conta própria.
- Última frase: a decisão em uma linha.
- Português do Brasil. Unidades com espaço: 3 m, 120 m², 25 °C.
