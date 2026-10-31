# Tarefa: cenário realista do Escritório ao vivo em 3D (passagem para o Codex / próxima sessão)

Estado em 29/10/2026 07:50. O que JÁ está no ar (commits 2878e01 … 5ad3685, main): humanos 3D de verdade
(Rocketbox) no lugar dos bonecos e retratos fotorrealistas dos 9 agentes. Leia `docs/escritorio.md` (seção
"Escritório ao vivo em 3D") e `public/plataforma/pessoas/LICENSE.md` antes de mexer.

## Objetivo

Deixar o CENÁRIO de `public/escritorio-3d.js` (#/whats/ao-vivo) tão realista quanto as pessoas: texturas
fotográficas, móveis bem modelados, céu físico com sol, panorama fotográfico da cidade (dia/tarde/noite),
oclusão de ambiente e brilho nos monitores/LEDs. Sem quebrar nada do que existe (câmera, HUD, balões, PCs
virtuais, modo 2D, os humanos 3D, duplo clique no agente).

## O que já está preparado (neste commit)

1. **Rascunho do código novo**: `docs/wip/escritorio-3d-cenario-novo.js`. É o bloco que SUBSTITUI, em
   `public/escritorio-3d.js`, tudo entre a linha `// ---------- materiais e geometria compartilhados ----------`
   e a linha `// ====================================================================== agentes`
   (materiais, Lote, texturas, constroiPredio, texturaPlaca, tvPinta, constroiMobilia, cadeira, planta,
   constroiCidade, climaAlvo, aplicaClima, interpolaClima). Está escrito, mas NUNCA foi executado — espere
   erros pequenos. Ele precisa destes imports no topo do arquivo:
   ```js
   import { RoundedBoxGeometry } from '/vendor/three/RoundedBoxGeometry.js';
   import { Sky } from '/vendor/three/pos/Sky.js';
   ```
   e usa `E.leds` antes de `constroiMobilia` (já é criado em constroiPredio — manter a ordem predio → mobilia → cidade).
2. **Pós-processamento vendorizado** (three r170, imports já ajustados): `public/vendor/three/pos/`
   (EffectComposer, RenderPass, ShaderPass, GTAOPass, UnrealBloomPass, OutputPass, Pass, MaskPass, CopyShader,
   GTAOShader, PoissonDenoiseShader, LuminosityHighPassShader, OutputShader, SimplexNoise, Sky) e
   `public/vendor/three/RoundedBoxGeometry.js`.
3. **Texturas pelo Flux** (RTX 4090 do Thiago): script `C:\Users\user\demo-herrera\cenario.py` gera em
   `C:\Users\user\demo-herrera\cenario\` os PNG: piso-carvalho, parede-reboco, concreto, tecido-cadeira,
   tecido-sofa, tampo-carvalho, nogueira, marmore, tapete (1024²) e cidade-dia, cidade-tarde, cidade-noite
   (2048×768, panorama visto de um 12º andar em Campinas). Log em `cenario.log`. Se faltar algum:
   `python cenario.py <nome>`; `VARIANTE=1` muda a semente. Estava rodando às 07:50 (uns 12 min no total).

## Passos

1. **Preparar as texturas** (Python + Pillow + numpy, no PC): para cada textura 1024²:
   - deixar repetível (seamless): deslocar meia imagem (`np.roll` em x e y) e misturar a emenda com máscara
     suave de ~96 px, ou espelhar; conferir repetindo 2×2.
   - gerar mapa de relevo `<nome>-n.jpg` (normal map tangente, 512 px) a partir da luminância desfocada
     (gradiente Sobel → normal; intensidade moderada).
   - salvar cor como `<nome>.jpg` (q 86) em `public/plataforma/cenario/`; panoramas como `cidade-<x>.jpg`
     (2048×768, q 84). Meta: tudo < 4 MB. Adicionar `plataforma/cenario` à lista de pastas com cache de 7 dias
     em `server.js` (já existe o `for` com pessoas/agentes/vendor).
2. **Colar o bloco novo** em `public/escritorio-3d.js` (ver item 1 acima) e adicionar os imports.
3. **Composer** em `montaCena()`: `RenderPass → GTAOPass → UnrealBloomPass (threshold 0.9, strength 0.3,
   radius 0.4) → OutputPass`; render target com `samples: 4` (MSAA); `renderer.toneMapping` continua ACES
   mas a exposição passa a ser aplicada em `E.exposicao` (o rascunho já grava isso em aplicaClima) —
   `OutputPass` usa `renderer.toneMappingExposure`, então basta `E.renderer.toneMappingExposure = E.exposicao`
   antes de `E.composer.render()` em `quadro()`; `redimensiona()` chama `composer.setSize` e
   `gtao.setSize`; `para()` descarta composer/passes. Em celular (`celular()`) ou GPU fraca: sem GTAO
   (bloom + output só). Dica: medir fps nos primeiros 3 s; se < 25, desligar o GTAO sozinho.
   Sombra do sol: `mapSize 4096` em desktop.
4. **Testar sem subir**: `node test/escritorio.js` (servidor) e um render headless. Há um harness pronto
   nesta passagem: servir `public/` com a API `/api/escritorio/ao-vivo` simulada (ver `docs/wip/` —
   `servidor-teste.cjs` e `shot3d.cjs` abaixo) e tirar prints com Playwright (`--use-gl=angle
   --use-angle=swiftshader`). Conferir: dia, tarde (`climaAlvo(17.5, true)`) e noite (`climaAlvo(21, true)`),
   o panorama alinhado com a fachada (-z), sem emendas visíveis, pessoas ainda sentadas direito.
5. **Subir**: commit em main → a Vercel publica nas 4 imobiliárias. Conferir no ar em
   https://ondemorar.corretordofuturo.app/#/whats/ao-vivo (login do Thiago salvo no Chrome dele).
   ATENÇÃO CSP (server.js): `connect-src` já tem `blob:`; texturas jpg são `img-src 'self'` (ok).
6. Atualizar `docs/escritorio.md` e o doc do projeto Claude (`claude/escritorio-ao-vivo.md`).

## Próxima grande tarefa pedida pelo Thiago (29/10, 07:40) — ainda NÃO começada

"Andar dentro do escritório igual Roblox" + chat ao vivo entre os usuários do sistema. Plano combinado:
1. Chat de texto com caixa de entrada (tabelas `conversas`, `participantes`, `mensagens` no Postgres/Supabase),
   1‑para‑1 e "sala de reunião" (grupo privado); entrega em tempo real pelo Supabase Realtime; sininho +
   toast no painel pessoal de cada usuário + Web Push; os 9 robôs são contatos: mensagem para um robô vira
   instrução (cérebro `.soul` + Gemini já existentes) e ele responde na mesma conversa (substitui o
   "Dar uma tarefa" do PC virtual); `@Ana` numa sala.
2. Voz gravada (MediaRecorder → Supabase Storage) e anexos.
3. Chamada de voz/vídeo 1‑para‑1 e sala de reunião até ~6 pessoas: WebRTC ponto a ponto, sinalização pelo
   Realtime, STUN do Google + TURN da Cloudflare (grátis até 1 TB/mês). Mais gente: SFU (Cloudflare Calls/LiveKit).
4. Andar no escritório: avatar próprio (um dos personagens Rocketbox), WASD/setas + mouse (joystick no
   celular), colisão com móveis, câmera atrás; outros usuários online aparecem (presença + posição pelo
   Realtime ~10 Hz); perto de um robô + E abre o chat; área da mesa de reunião = entra na sala ao vivo; voz
   por proximidade. Decisões pendentes do Thiago: tamanho das salas (6 P2P ou SFU), quem fala com quem
   (mesma imobiliária; gestor da plataforma fala com todas?), começar pelo chat ou pelo andar.

## Prompt pronto para o Codex

> Leia docs/tarefa-cenario-3d.md e docs/escritorio.md deste repositório e execute os
> "Passos" 1 a 6 da tarefa do cenário 3D. As texturas PNG estão em C:\Users\user\demo-herrera\cenario.
> Não mexa nos humanos 3D (public/plataforma/pessoas) nem na API. Teste com render headless antes de subir.
> Commits pequenos em main, mensagens em português.
