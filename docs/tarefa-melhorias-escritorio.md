# Tarefa: melhorias do Escritório ao vivo 3D (lote 2)

Thiago aprovou (29/10/2026) todas as sugestões abaixo. Fazer **depois** de `docs/tarefa-escritorio-interativo.md`
(mural/TV/placa clicáveis), reaproveitando o painel embutido criado lá. Ler antes: `docs/escritorio.md`,
`public/escritorio-3d.js`, `public/escritorio-jogo.js`, `public/estacao-pc.js`, `src/routes/escritorio.js`.

## 1. Todos os lugares clicáveis, com propósito
Além de mural → radar, TV → painel, placa → CRM (tarefa anterior), ligar no mesmo painel embutido:
- **recepção** → `#/visitas`; **impressora** → documentos/autorizações (a tela que lista autorizações; se não
  houver rota própria, `#/imoveis` com o filtro de autorizações); **sofá** → leads aguardando resposta
  (`#/leads` com filtro de quem está esperando); **café** → mural de avisos da equipe: uma tela simples
  (`#/avisos`) com os eventos do dia dos agentes (`agente_eventos`) e os afazeres abertos da equipe
  (`agente_afazeres`), só leitura; **mesa de reunião** → por enquanto abre o chat (`#/chat`) com aviso
  "sala de reunião ao vivo em breve".
- Cada lugar com nome, ícone e dica "Clique para abrir" no hover (as etiquetas `.j3-lugar` já existem).

## 2. Monitores com conteúdo real
- A tela de cada mesa (textura por agente em `telaPinta`) mostra a **conversa que o agente está atendendo
  agora**: últimas 3 mensagens da conversa mais recente daquele agente, **sem telefone, sem nome de cliente**
  (usar "Cliente" / iniciais), com o visual de WhatsApp que já existe. Dados: ampliar `/api/escritorio/ao-vivo?full=1`
  com `ultimas` por agente (texto cortado em 60 caracteres, direção, hora) — nada que identifique o cliente,
  e só para adm/gestor (para os outros, continua o protetor de tela atual).
- A **TV da diretoria** alterna a cada 8 s entre os números do dia (atual) e um painel "entraram hoje" com as
  fotos dos últimos imóveis cadastrados (capa via `/api/arquivos/:id` como o resto do sistema).

## 3. Tour guiado (botão "Apresentar")
- Substituir o ▶ atual por um tour com 6 paradas: entrada → sala de captação (TH-IA-GO) → salão de vendas →
  diretoria → mural → TV. Em cada parada a câmera voa, o lugar acende e aparece uma legenda em caixa HTML
  (2–3 linhas) explicando o que acontece ali. Legendas em **PT · EN · 日本語** (usar o `T`/`t()` que já existe).
- Controles: ◀ ▶ para pular parada, ESC sai, e no fim volta à órbita do modo apresentação. Começa no clique,
  nunca sozinho.

## 4. Clima e hora reais de Campinas
- Novo endpoint `GET /api/publico/clima` no servidor (sem chave): Open-Meteo
  `https://api.open-meteo.com/v1/forecast?latitude=-22.905&longitude=-47.06&current=temperature_2m,weather_code,is_day`,
  cache de 15 minutos em memória, tolerante a falha (devolve `{}`). Fetch no servidor porque a CSP do navegador
  só permite `connect-src 'self'`.
- No 3D: código do tempo vira estado do céu (limpo, nublado, chuva) somado ao horário que já existe — nublado
  baixa o sol e esbranquiça o céu; chuva adiciona gotas escorrendo no vidro da fachada (shader simples ou
  textura animada em canvas) e escurece a cidade. Nada pesado: se `prefers-reduced-motion` ou celular, só muda
  a cor. Mostrar a temperatura junto do relógio no HUD.

## 5. Som ambiente opcional
- Botão 🔊 no HUD (desligado por padrão, lembrado em `localStorage jg3d-som`). Sons **gerados por WebAudio**
  (sem arquivos): teclado baixinho contínuo quando há agentes digitando, "ding" curto quando chega ação nova,
  telefone curto quando entra lead, e um acorde suave no confete de venda. Volume baixo, respeitando
  `prefers-reduced-motion` (nesse caso não liga).

## 6. Visitante com nome
- Quando a ação é `login` (já vira "pessoa entrando pela porta"), o visitante recebe o **nome do usuário** numa
  etiqueta como a dos agentes e um personagem fixo por usuário (escolher pelo `id % n` entre os GLB disponíveis,
  usando `visitante.glb` e os personagens não usados). Ao sair do escritório, some como hoje.

## 7. Placa de ocupação
- No pilar central, abaixo da placa da imobiliária, um letreiro discreto: "N pessoas no escritório agora" com
  os primeiros nomes (até 3) de quem está logado nos últimos 5 minutos. Dado: ampliar `/api/escritorio/ao-vivo?full=1`
  com `online: [{nome}]` a partir da auditoria/sessões recentes (ou `usuarios.ultimo_acesso` se existir; se não
  existir, criar coluna atualizada no login). Só adm/gestor vê os nomes; os demais veem só o número.

## Regras
- Nada de biblioteca nova; tudo com `esc()`; CSP inalterada (o clima é buscado pelo servidor).
- Não mexer nos humanos 3D nem na API do escritório além do que está descrito.
- `npm test` antes de subir; render headless (`docs/wip/servidor-teste.cjs` + `shot3d.cjs`) nos três horários.
- Documentar cada item em `docs/escritorio.md` e escrever o resumo em "## Resultado" neste arquivo.
