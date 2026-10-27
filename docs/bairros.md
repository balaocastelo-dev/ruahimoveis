# Guias de bairro — uma página de SEO para cada bairro de Campinas

Público, sem login: `/bairros` (lista por região) e `/bairros/<bairro>` (o guia). Online: https://ruahimoveis.vercel.app/bairros.
Montado em 27/10/2026 no mesmo esquema do blog Sopro e do portal de imóveis.

Cada guia é um texto completo (900 a 2.600 palavras) pesquisado em fontes públicas, com fotos reais, e feito para o
Google e para as IAs: título e resumo com o nome do bairro, abertura que responde "como é o bairro", resumo em itens,
perguntas frequentes, fontes, dados estruturados (`Article` + `Place` com coordenadas, `FAQPage`, `BreadcrumbList`,
`ItemList` dos imóveis), sitemap e `/llms.txt`.

## O que é escrito e o que é ao vivo

| Parte | De onde vem |
|---|---|
| Texto, fotos escolhidas, perguntas, fontes | ramo `claude/bairros-conteudo` (escrito pela tarefa agendada, conferido pela régua) |
| "<Bairro> em números" | banco, ao vivo: imóveis da RUAH à venda, prédios e condomínios (Receita + Censo 2022), o que tem perto (Overture/OSM) |
| Imóveis da RUAH no bairro | portal, ao vivo; a foto do cartão é a da **fachada/condomínio** (ambiente da galeria do imóvel) |
| O que tem perto | tabela `pois`, num raio de 1,5 km do centro do bairro (média dos prédios, ou o centro manual) |
| Prédios e condomínios | base de condomínios; com `CONDOMINIOS_PUBLICOS=1` os nomes viram link para a página pública de cada um |
| Formulário | lead no CRM, origem **Portal RUAH · bairro**, com o bairro em "bairros" e o motivo (comprar, vender, dúvida) |

## As fotos

- **Imóveis da RUAH**: fotos de fachada/condomínio dos imóveis à venda no bairro (`/imoveis/foto/<n>`). Se o imóvel
  sair de venda, a foto some da página sozinha.
- **Lugares do bairro**: Wikimedia Commons, **só licença livre** (domínio público, CC0, CC BY, CC BY-SA; nada de NC/ND,
  nada menor que 800 px). A licença e o autor são lidos no próprio Commons (tabela `bairro_commons`, revista a cada
  30 dias) e aparecem embaixo de cada foto e nos créditos. A imagem não é guardada no banco: o site serve por
  `/bairros/<bairro>/foto/<n>` e a Vercel guarda em cache por 30 dias.
- A nuvem do Claude não alcança o Commons; por isso a busca e a pré-visualização passam pelo site
  (`/bairros/commons/busca.json`, `/info.json`, `/ver`), com limite por IP e só para arquivos de imagem.

## As peças

| Peça | Onde |
|---|---|
| Lista de bairros | tabela `bairros` (nome, região, apelidos, prioridade, oculto, notas, pedido de reescrita, centro). Semeada com `src/bairros/catalogo.js` (54 bairros) na primeira leitura |
| Reconhecer o bairro | `chaveBairro()` no catálogo: sem acento, "JD" = Jardim, "Sto" = Santo, sem "II"/"Continuação". Imóveis e prédios entram no bairro pelo nome ou por um apelido |
| Páginas | `src/routes/bairros.js`, `src/bairros/paginas.js` (HTML no servidor), estilos `b-*` no fim de `public/portal-assets/portal.css` |
| Junta tudo | `src/bairros/fonte.js` (lê o ramo a cada 10 min; cópia em `data/bairros-cache`) |
| Formato e régua | `src/bairros/validar.js`, `src/bairros/regua.js` (no comando e no site) |
| Comando | `scripts/bairros-publicar.mjs`: `preparar`, `fotos`, `conferir`, `publicar`, `listar`, `retirar` |
| Para quem escreve | `/bairros/dados.json` (a fila em ordem, números ao vivo, fotos dos imóveis com o ambiente, notas da RUAH) |
| Regras de quem escreve | `ROTINA.md` no ramo `claude/bairros-conteudo` |
| Tarefa agendada | "Bairros RUAH - guias dos bairros" (texto em `docs/bairros-tarefa.md`) |
| Tela | Conteúdo › Páginas de bairros (`public/bairros.js`) |

## A tela "Páginas de bairros"

Adm e gestor editam; corretor só vê.

- Situação de cada bairro: **no ar**, **na fila**, **no ar · reescrita pedida**, **no ar · será revista** (mais de um ano),
  **fora do ar · será refeita** (reprovada), **oculto**. Mostra a posição na fila, imóveis da RUAH e prédios do bairro.
- **Prioridade** (− / +): muda a ordem da fila.
- **Editar**: nome, região, "também conhecido como" (apelidos), **notas para quem escreve** (o que a página deve contar),
  centro do bairro.
- **Reescrever**: o bairro vai para o começo da fila; a página atual fica no ar até a nova sair.
- **Ocultar / Mostrar**: tira do ar e da fila na hora (nada é apagado).
- **+ Adicionar bairro** e a lista **"Bairros dos cadastros que não estão na lista"**: adicionar como bairro novo ou ligar
  a um bairro existente (vira apelido e os imóveis e prédios passam a contar lá).
- **Copiar legenda** para postar o guia nas redes. **Atualizar agora**: relê o ramo sem esperar 10 minutos.

## Ordem da fila

Reescrita pedida → sem página / reprovada → página com mais de um ano; dentro de cada grupo: prioridade, imóveis da
RUAH no bairro, número de prédios, nome.

## Configuração

```
BAIRROS=true             # false tira todos os guias do ar sem apagar nada
CONDOMINIOS_PUBLICOS=1   # nomes dos prédios viram link para /condominios/<slug> (decisão pendente)
```

## Teste

`node test/bairros.js` — banco temporário e ramos falsos: normalização dos nomes, catálogo, régua (aprova e barra),
página com números ao vivo, foto de imóvel com a fachada, foto com licença recusada fora, créditos, JSON-LD, lista,
404, ligação imóvel → guia, sitemap, robots, llms.txt, dados.json e a fila, formulário → lead, tela (editar,
prioridade, notas, adicionar, apelido, reescrever, ocultar; corretor não edita) e página reprovada saindo do ar.
