# Tarefa: chat ao vivo entre os usuários do sistema (+ robôs como contatos) — etapa 1

Decisões do Thiago (29/10/2026): salas de reunião com até 6 pessoas (ponto a ponto, sem servidor de mídia);
cada funcionário fala só com colegas da **mesma imobiliária** (cada imobiliária é um deploy/schema próprio;
o gestor da plataforma tem usuário administrador em cada uma, então já conversa em todas); **começar pelo
chat de texto + robôs**, depois voz gravada, chamadas e o "andar no escritório".

Leia antes: `docs/escritorio.md` (agentes, cérebro, PCs virtuais), `src/routes/escritorio.js` (conversa de teste
= como uma mensagem humana chega ao robô e como ele responde: `B.registraEntrada` + `cicloCerebro({telefone})`),
`src/routes/base.js` (`/painel`), `public/app.js` (SPA por hash, `rota()`, `ACT`, `api()`, `toast`, `$`),
`public/escritorio.js` (tela #/whats), `src/db-sqlite.js` (esquema local criado no boot) e `sql/escritorio.sql`
(esquema Postgres/Supabase, um schema por imobiliária: base é o molde; ondemorar, cademeuap, casaprado, lumen — as
migrações no Supabase são aplicadas à parte, pelo Claude; o Codex entrega o SQL pronto).

## Entrega da etapa 1

### Banco (SQLite no boot em `src/db-sqlite.js` + arquivo `sql/chat.sql` para o Postgres, mesmo estilo de `sql/escritorio.sql`)
- `chat_conversas` (id, tipo 'direta'|'sala', titulo, criado_por → usuarios, criado_em, ultima_em, ultima_texto).
- `chat_participantes` (conversa_id, usuario_id NULL para robô, agente text NULL para pessoa — um dos dois, lido_ate integer (id da última mensagem lida), silenciado 0/1, PK (conversa_id, usuario_id, agente)).
- `chat_mensagens` (id, conversa_id, de_usuario NULL, de_agente NULL, tipo 'texto'|'audio'|'arquivo'|'sistema', texto, arquivo_id → arquivos (reaproveitar a tabela `arquivos`/`agente_midias` existente para áudio e anexos na etapa 2), criado_em). Índices por conversa_id e criado_em.
- Conversa direta pessoa↔pessoa e pessoa↔robô é única por par (criar se não existir). Sala = qualquer conjunto escolhido pelo criador (pode incluir robôs), com título.

### API (`src/routes/chat.js`, montado em `/api` como os outros; sempre com `req.usuario`)
- `GET /chat/caixa` → conversas do usuário com último texto, hora, não lidas (contagem) e participantes (nome, foto: pessoas usam iniciais/avatar do usuário, robôs usam `/plataforma/agentes/<slug>.jpg`), mais a lista de contatos possíveis (usuários ativos da imobiliária + os 9 agentes de `B.AGENTES`/catálogo com nome de `B.ajustes(slug).nome`).
- `POST /chat/conversas` { tipo, com: [usuario_id...|agente...], titulo } → cria (ou devolve a direta existente).
- `GET /chat/conversas/:id?desde=<id>` → mensagens (até 80 por página, mais antigas com `antes=<id>`); marca `lido_ate`.
- `POST /chat/conversas/:id/mensagens` { texto } → grava; atualiza `ultima_*`; se a conversa tem robôs: para cada robô, registrar a entrada como na conversa de teste com telefone `chat-<conversa_id>-<slug>` e nome do remetente, e com Gemini na nuvem (`IA.naNuvem()`) chamar `cicloCerebro({ telefone, prazo: 40e3, rotinas: false, atribuir: false })`; sem Gemini, o PC responde depois (o espelhamento abaixo traz a resposta).
- `GET /chat/novidades?desde=<id global>` → **long polling**: segura até 25 s (a função na Vercel tem 60 s) esperando mensagem nova em qualquer conversa do usuário; devolve { ate, mensagens: [...], nao_lidas_total }. É isso que o painel e a tela do chat usam; nada de Supabase Realtime/anon key nesta etapa (os usuários não são do Supabase Auth; expor a chave abriria as conversas).
- Espelhamento das respostas dos robôs: toda `agente_mensagens` de `direcao='saida'` e `status` enviada/aprovada com telefone `chat-%` ainda não espelhada vira `chat_mensagens` (de_agente = agente) na conversa correspondente (coluna/flag para não repetir). Rodar no `GET /chat/novidades` (barato) e também dentro do ciclo do cérebro se for simples. Instruções do tipo tarefa de PC virtual: se o texto começar com "tarefa:" ou o robô responder com a marca que o cérebro já usa para tarefas, criar `agente_tarefas` como a tela "Dar uma tarefa" faz, e o resultado da tarefa, ao concluir, vira mensagem do robô na conversa.
- Permissões: só participantes leem/escrevem; adm/gestor pode criar salas com qualquer um; usuário comum só com usuários ativos da mesma base. Nunca expor telefone de cliente.

### Tela (`public/chat.js` + estilos no fim de `public/style.css`, mesmo visual das telas do sistema)
- Rota `#/chat` (menu "Operação › Mensagens") com duas colunas: esquerda = caixa de entrada (busca, conversas com foto/iniciais, último texto, hora, bolinha de não lidas; botão "Nova conversa" / "Nova sala de reunião" com seleção de pessoas e robôs), direita = conversa (balões, nome, hora, "visto"; campo de texto com Enter envia, Shift+Enter quebra linha; robôs mostram "digitando…" enquanto o cérebro responde). Celular: uma coluna de cada vez.
- `#/chat/:id` abre direto uma conversa. Da tela `#/whats` e do cartão de cada agente, botão "Conversar" que abre a direta com o robô (substitui, na prática, a "conversa de teste").
- **Notificação no painel pessoal**: sininho no cabeçalho do shell (todas as telas) com contador de não lidas, toast com o nome e o começo do texto quando chega mensagem (não da própria conversa aberta), som curto (um bip gerado por WebAudio, sem arquivo) e `document.title` com "(n)". Usa o mesmo long polling (um só, no shell, compartilhado com a tela do chat).
- Escritório 3D (`public/escritorio-3d.js`): quando chega mensagem de um robô, balão em cima dele (já existe `balao()`); não mexer em mais nada do 3D.

### Testes e qualidade
- `test/chat.js` no estilo dos outros testes (sobe o servidor em SQLite, cria 2 usuários, conversa, mensagem, não lidas, long polling, sala, permissão negada para quem não participa). Adicionar ao `npm test`.
- Nada de bibliotecas novas no front; nenhum pacote novo sem necessidade. Mensagens com `esc()` sempre. CSP: nada externo.
- Documentar em `docs/chat.md` (tabelas, API, fluxo do robô, como aplicar `sql/chat.sql` em cada schema) e deixar as etapas 2–4 listadas como pendentes.

## Etapas seguintes (não fazer agora)
2. Voz gravada (MediaRecorder → `arquivos`/`agente_midias`, player na conversa) e anexos (fotos, PDFs).
3. Chamada de voz/vídeo 1‑para‑1 e sala até 6: WebRTC ponto a ponto, sinalização pelo `chat_mensagens` tipo 'sinal' via long polling, STUN do Google + TURN da Cloudflare; Web Push com VAPID para aba fechada.
4. Andar no escritório (avatar próprio, WASD/joystick, colisão, presença dos outros usuários por long polling 2 Hz, perto do robô + E abre o chat, área da mesa de reunião entra na sala ao vivo, voz por proximidade).

## Prompt pronto para o Codex
> Leia docs/tarefa-chat.md e os arquivos que ele indica neste repositório e implemente a etapa 1 completa (banco SQLite + sql/chat.sql, API em src/routes/chat.js, tela public/chat.js com #/chat, sininho e toasts no shell, robôs como contatos respondendo pelo cérebro existente, test/chat.js, docs/chat.md). Não mexa na API do escritório além de reaproveitar funções; não mexa no 3D além do balão. Rode npm test antes de subir. Commits pequenos em main, mensagens em português.
