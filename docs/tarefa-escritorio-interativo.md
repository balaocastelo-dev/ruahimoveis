# Tarefa: lugares clicáveis no Escritório ao vivo 3D (abrem telas reais do sistema sem sair do 3D)

Pedido do Thiago (29/10/2026): no escritório 3D (`public/escritorio-3d.js`, #/whats/ao-vivo), clicar no **Mural de
oportunidades** abre o mural com as oportunidades reais do sistema; clicar na **TV da diretoria** abre os dados da
diretoria; clicar na **placa do Salão de vendas** abre o CRM da imobiliária — tudo dentro do escritório, como já
acontece com o "PC de <agente>" ao dar duplo clique num agente (ver `public/estacao-pc.js`, `window.abrePcDoAgente`).

## Como fazer
- Os objetos já existem em `constroiPredio()`: mural (caixas em x≈-10,3 no pilar da esquerda), placa (`E.placa`) e TV (`E.tv`).
  Dar `userData = { tipo: 'lugar', lugar: 'mural' | 'placa' | 'tv' }` neles (e nas caixas invisíveis de clique, se precisar,
  como `MAT.hit` faz nas mesas) e incluir esses alvos em `acerta()`; clique simples (não só duplo) abre; hover muda o cursor
  e acende o objeto (emissive leve) e a etiqueta HTML do lugar (`.j3-lugar`) ganha o estado "clicável" com a dica
  "Clique para abrir".
- Ao clicar: voo curto da câmera até o lugar (como `vaiAoAgente`) e abre um **painel embutido** por cima do 3D
  (`.j3-painel`, mesmo estilo do PC virtual: cabeçalho com nome do lugar, botão fechar/ESC, tela cheia) com um
  `<iframe src="/app.html#/<rota>?embutido=1">`. Em `public/app.js`, com `embutido=1` no hash/query, o shell esconde o
  menu lateral e o cabeçalho (só o conteúdo da tela), para caber no painel. A sessão (cookie) é a mesma, então a tela
  carrega normalmente.
- Mapeamento: mural → `#/radar` (oportunidades captadas / radar de captação; se existir uma lista "oportunidades"
  mais direta, usar ela); TV da diretoria → `#/painel` (versão da diretoria, `/painel/adm` para adm/gestor; para quem
  não é gestor, o painel comum); placa do Salão de vendas → `#/leads` (CRM e funil). Extras baratos se sobrar tempo:
  recepção → `#/visitas`; impressora → documentos/autorizações do sistema; mesa de reunião → mostra aviso
  "Sala de reunião ao vivo: em breve" (fica para a etapa das chamadas do chat).
- Modo 2D (`public/escritorio-jogo.js`): mesmos cliques nos mesmos lugares, abrindo o mesmo painel.
- Tudo com `esc()`; nada de biblioteca nova; não quebrar o modo apresentação, os humanos 3D nem o PC virtual.
  Testar no harness headless (`docs/wip/servidor-teste.cjs` + `shot3d.cjs`, já ajustados para Windows) e com
  `npm test`. Documentar em `docs/escritorio.md`.

## Prompt pronto para o Codex
> Leia docs/tarefa-escritorio-interativo.md e os arquivos citados e implemente tudo. Não mude a aparência do
> escritório 3D além do destaque de hover. Rode npm test antes de subir. Commits pequenos em main, em português.

## Resultado (29/10/2026 — feito pelo Claude, não refazer)

Entregue em `main`: caixas invisíveis de clique (`E.cliques`) no mural, na TV e na placa, `acerta()` ampliado, cursor e
etiqueta "Abrir", painel `.j3p-*` com `<iframe src="/app.html?embutido=1#/rota">` (mural → `#/radar`, TV → `#/painel`,
placa → `#/leads`, mais recepção/impressora/café/reunião pelo modo andar), modo embutido em `public/app.js` (`EMBUTIDO`),
CSP com `frame-src 'self'`/`frame-ancestors 'self'` e `X-Frame-Options: SAMEORIGIN`. Testes no `test/escritorio-3d.cjs`
(clique nos três lugares, ESC, modo andar) e documentação em `docs/escritorio.md`.

Concluído no lote 2: os mesmos cliques no modo 2D (`public/escritorio-jogo.js`) usam o painel compartilhado
de `public/escritorio-lugares.js`, inclusive sem WebGL. Entrega no commit `86cd02e` e teste em
`test/escritorio-2d.cjs`; detalhes em [tarefa-melhorias-escritorio.md](tarefa-melhorias-escritorio.md#resultado).
