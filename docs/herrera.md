# Herrera · assistente de nova imobiliária (painel do gestor)

Em `/gestor`, **+ Nova imobiliária com o Herrera** abre a tela cheia com o avatar falando (voz clonada do Thiago,
"Thiago herrera 3 · energética") e o passo a passo ao lado. "Cadastro rápido" continua existindo (a janela antiga).
Imobiliária já criada e ainda não configurada mostra o selo "Configuração 6/11" e o botão **Continuar com o Herrera**.

## Passos (cada um tem um vídeo)

| # | Passo | O que o sistema confere |
|---|---|---|
| 01 | Boas-vindas | — |
| 02 | Dados (marca, razão social, plano) | — |
| 03 | Administrador (e-mail, senha inicial ≥ 8) | — |
| 04 | Publicar | cria pelo `POST /imobiliarias` e espera o link responder com imóveis |
| 05 | Marca (logo, cores) | — |
| 06 | Chave do Gemini | testa a chave na API do Google antes de salvar; grava cifrada (`escritorio_ia`) |
| 07 | Chave do Google Maps | testa Map Tiles (3D) e Street View com o Referer do link; grava `google_maps_chave` |
| 08 | Facebook e Instagram | conta conectada em Redes e publicações (OAuth "Conectar"; **nunca senha**) |
| 09 | Google Meu Negócio | conta conectada (OAuth) |
| 10 | WhatsApp dos agentes | linhas conectadas |
| 11 | Pronto | resumo do que está ok e do que falta |
| 12/13 | reações "deu certo" / "não deu" | — |

Endpoints (gestor): `GET /imobiliarias/:id/assistente`, `POST .../assistente/passo`, `POST .../assistente/conferir/:passo`,
`POST .../assistente/gemini`, `POST .../assistente/maps`. Banco: `sql/plataforma-herrera.sql`
(`imobiliarias.onboarding`, `plataforma.definir_config` só aceita `escritorio_ia` e `google_maps_chave`,
`plataforma.configurado` devolve só sim/não, nunca as chaves).

## Vídeos (feitos no PC, RTX 4090)

Pasta `C:\Users\user\herrera-avatar`:

1. `roteiros.json` — falas de cada clipe e qual imagem do personagem usa (palco, holograma, mesa).
2. `tts_herrera.py` — voz no OmniVoice/VoiceStudio (perfil 2af6be27) → `audio\<id>.wav` + tempos das frases.
3. `confere_audio.py` — transcreve (faster-whisper) e compara com o roteiro → `audio\conferencia.json`.
4. `herrera_fila_avatar.py` — sincronia labial no ComfyUI (InfiniteTalk/Wan 2.1, 832×480) → `video\<id>.mp4`.
   Pausa os robôs de fotos enquanto usa a GPU. `--so 08-facebook-instagram` refaz só um; `--refazer` refaz todos.
5. `prepara_web.py` — comprime (mp4 + pôster webp), monta `herrera.json` e envia para o ramo `plataforma/herrera-videos`.
   Depois os arquivos vão para `public/gestor/herrera/`.

Para mudar uma fala: edite `roteiros.json`, rode 2 → 3 → 4 com `--so <id>` → 5.
Sem vídeo, a tela usa a foto do personagem com a legenda (funciona igual).
