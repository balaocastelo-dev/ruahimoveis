# Escritório ao vivo — contexto do projeto

Atualizado em 29/10/2026. Fonte principal: [docs/escritorio.md](../docs/escritorio.md).
Roteiro original: [docs/tarefa-cenario-3d.md](../docs/tarefa-cenario-3d.md).

## Cenário 3D

`public/escritorio-3d.js`, rota `#/whats/ao-vivo`, three.js r170 vendorizado. O rascunho de
`docs/wip/escritorio-3d-cenario-novo.js` foi integrado e corrigido; o arquivo em `public/` é agora a versão de referência.

- Nove materiais fotográficos em 1024² com normais tangentes em 512², mais panoramas dia/tarde/noite em 2048×768.
  Total: 21 JPGs, 1,73 MB, em `public/plataforma/cenario/`, com cache de 7 dias no Express e nos headers de `vercel.json`.
- Conversão reproduzível: `python scripts/preparar-cenario.py C:/Users/user/demo-herrera/cenario`
  (Pillow/numpy). Usa espelhamento e Sobel; provas 2×2 ficam em `data/cenario-qa/`.
- Móveis com cantos arredondados, cadeiras estofadas, plantas recortadas, luminárias e monitores emissivos.
- Céu físico `Sky`, sol com sombra 4096 no desktop, panorama atrás da fachada `-z`, cidade com parallax, estrelas e luzes noturnas.
- `RenderPass → GTAOPass → UnrealBloomPass → OutputPass`; HDR/MSAA até 4 amostras, ACES, exposição em `E.exposicao`.
  Bloom 0,9/0,3/0,4 (threshold/strength/radius). Ambiente HDR a 0,2 evita excesso de brilho.
- GTAO em meia resolução; ausente no celular, desligado automaticamente se a medição inicial ficar abaixo de 25 fps.
  Caixas invisíveis, vidro e recortes não entram no passe de profundidade do GTAO.
- Redimensionamento e descarte de recursos do composer cobertos; reabertura após o 2D recria os materiais.
- Correções de integração: campos do clima do novo céu, inicialização dos LEDs antes da mobília, laje abaixo do piso,
  chão da cidade abaixo da fotografia e temporizador do balão 2D protegido ao sair da tela.

## O que preservar

Os humanos Rocketbox e os arquivos de `public/plataforma/pessoas/` não foram alterados. Também foram preservados a API,
as animações, as mesas/posições, a câmera, o HUD e os balões. `window.jg3dEstado()`, `window.jg3dTelaDoAgente(slug, imagem)` e
o duplo clique que chama `window.abrePcDoAgente(slug)` continuam disponíveis. A licença está em
`public/plataforma/pessoas/LICENSE.md`.

## Testar e publicar

1. `node test/escritorio.js` — servidor, dados isolados e IA simulada.
2. `node test/escritorio-3d.cjs` — Chrome/Playwright/SwiftShader, API simulada; capturas de dia, tarde (17,5 h), noite (21 h),
   detalhe e celular; nove GLBs, texturas, interações, desempenho adaptativo e ciclo 3D/2D.
3. Revisar `data/cenario-qa/{dia,tarde,noite,detalhe,celular}.png` e `render.json`. Não usar o FPS do software como benchmark de GPU.
4. Commit na `main`, mensagens em português; push aciona a Vercel. Confirmar a versão publicada e abrir
   `https://ondemorar.corretordofuturo.app/#/whats/ao-vivo` com a sessão existente.

O harness é portátil e só escuta em `127.0.0.1`. O controle de horário `window.__clima` existe apenas no harness, não no site.

## Andar no escritório e lugares clicáveis (29/10/2026, tarde) — no ar

- **Andar tipo Roblox**: botão 🚶 no HUD (`public/escritorio-andar.js`, carregado por `import()` só ao entrar).
  Terceira pessoa com o `visitante.glb`, WASD/setas, Shift corre, arrastar o mouse olha, joystick no celular,
  colisão com mesas, cadeiras, sofá, balcão, paredes e vidro. Ao lado de um robô: **E · Falar com <nome>**
  (abre o PC dele); em cima de um lugar: **E · Abrir**. Sai pelo botão ou ESC, e a órbita volta como estava.
- **Mural, TV da diretoria e placa do salão clicáveis**: caixas invisíveis (`E.cliques`) na frente de cada um;
  clique simples abre o **painel do lugar** (`.j3p-*`) com a tela real do sistema num `iframe`
  `/app.html?embutido=1#/rota` — mural → `#/radar`, TV → `#/painel`, placa → `#/leads`; andando, também
  recepção → `#/visitas`, impressora → `#/imoveis`, café → `#/whats`, reunião → `#/chat`. ✕, ESC ou clique fora
  fecham; ↗ abre a tela inteira. Modo embutido em `public/app.js` (`EMBUTIDO`): sem menu, sem barra do topo,
  sem sino e sem o aceite da LGPD. CSP passou a `frame-src 'self'` + `frame-ancestors 'self'`
  (`X-Frame-Options: SAMEORIGIN`): só a própria origem se embute.
- **Liga/desliga de cada PC no painel do robô** (`public/estacao-pc.js`): ⏻ Ligar/Desligar, com Reiniciar e
  "Ler não lidas" só enquanto ligado; o estado vem da batida da estação (8 s). Desligar agora vale: a estação
  guarda `data/estacao-apagados.json` e abrir a janela, o monitor da mesa, o WhatsApp Web ou a volta automática
  **não** religam mais — só Ligar, Reiniciar ou uma tarefa nova (ordem de gente).
- Testes: `test/escritorio-3d.cjs` cobre os três cliques, o ESC e o modo andar (25 verificações, tudo verde);
  `node test/escritorio.js` segue cobrindo a estação, com liga/desliga chegando pela batida.
- A estação no PC da RTX foi atualizada para este código e reiniciada (porta 3434, túnel novo a cada reinício).

## Próxima tarefa, fora desta entrega

- Chat etapas 2–4: voz gravada e anexos, chamadas de voz/vídeo (WebRTC P2P até 6 pessoas, decisão do Thiago) e
  presença multiplayer com voz por proximidade dentro do escritório 3D.
- Lugares clicáveis no modo 2D (`public/escritorio-jogo.js`) — ficou de fora desta entrega.
- **Estação da Onde morar?**: hoje só `casaprado` e `lumen` (as de exemplo) têm chave de estação, por isso os PCs
  dos robôs da Onde morar? não abrem. Falta gerar a chave em *Escritório virtual › Configuração geral › PCs
  virtuais › Gerar chave da estação* (precisa de adm/gestor logado) e acrescentar a imobiliária em
  `data/estacao.json` do PC.
