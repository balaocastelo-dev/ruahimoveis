# Redes e publicações

Tela: **Conteúdo › Redes e publicações** (`#/redes`). Cada imobiliária gerencia as próprias redes e publicações.

## O que faz

- Gera sozinho os posts do **Instagram**, **Facebook** e **Google Meu Negócio** com o que já está público:
  - imóveis do portal (rodízio: quem nunca saiu primeiro; o mesmo imóvel só volta depois de alguns dias);
  - textos do blog (cada um uma vez, depois de publicado no blog);
  - **revista da semana** (sábado, 10h): capa com 4 imóveis + um slide por imóvel + convite final;
  - guias de bairro (o mesmo bairro só volta depois de 4 semanas).
- Calendário mensal: abrir o post, mudar dia/hora, editar legenda e hashtags, escolher as redes, trocar o imóvel,
  tirar do calendário, aprovar, publicar agora, baixar as artes.
- Aba **Escolher imóveis**: post extra para imóveis escolhidos (lançamento, baixa de preço…).
- **Modo**: "saem sozinhas" (padrão) ou "aprovar antes" (cada post espera o gestor; "Aprovar o mês").

## Cadência (pelo plano da plataforma)

| Plano | Imóveis | Blog | Bairro | Revista |
|---|---|---|---|---|
| Essencial | seg, qua, sex 12h | ter, qui 9h | — | sáb 10h |
| Profissional | todo dia 12h | seg a sex 9h | qua 18h30 | sáb 10h |
| Rede / Fundador | todo dia 12h e 19h | todo dia 9h | ter e sex 18h30 | sáb 10h |

O plano vem de `plataforma.imobiliarias.plano` pela função `plataforma.meu_plano()`. Sem ela, vale `PLANO` (padrão profissional).
Código: `src/social/planos.js`.

## Artes

`src/social/arte.js` monta JPEGs com sharp: foto + logo e cores do tema (`public/temas/<TEMA>`) + texto em curvas
(fontes DM Sans e Cormorant em `src/social/fontes`, licença OFL; a Vercel não tem fontes instaladas).
Feed 1080×1350 (4:5) e Google 1200×900 (4:3). Valor e números vêm do banco na hora de desenhar.
Signature (≥ R$ 10 mi) sai sem valor. Nunca endereço, dono ou CRM. Fotos internas nunca entram.
Portal de demonstração (`PORTAL_DEMONSTRACAO=1`): carimbo "Imagem ilustrativa" e nada vai para redes de verdade.

Endereço público assinado: `/social/arte/<id>/<n>.jpg?f=feed|google&v=<versão>&s=<assinatura>`.

## Publicação

- Ciclo: `POST /social-ciclo` com o cabeçalho `x-social-ciclo` = `config.social_ciclo_token` (criado junto com a imobiliária em `plataforma.criar_imobiliaria`, ou pelo próprio ciclo).
- Imobiliária nova já nasce com tudo: as tabelas vêm da RUAH (o molde), o usuário de banco ganha `plataforma.meu_plano()` e o token do ciclo. Quando ela fica ativa e publicada, o calendário se monta sozinho na rodada seguinte.
  O Supabase chama a cada 10 min (`plataforma.social_ciclo()`, pg_cron `plataforma-social-ciclo`) todas as imobiliárias ativas e publicadas.
- O ciclo planeja os próximos 35 dias (no máximo 1 vez por hora) e publica o que chegou a hora (até 3 por rodada).
- Sem conta conectada: o post fica **pronto para postar** (baixar artes, copiar legenda, "Já postei à mão").
- Falha numa rede: "saiu em parte" e tenta de novo só nela (até 3 vezes, a cada 15 min). Mais de 24 h atrasado não sai sozinho.
- Imóvel vendido/retirado: o post sai do calendário e o horário volta para o rodízio.

### Contas (`src/social/redes.js`)

- **Facebook + Instagram**: app da plataforma na Meta. Variáveis `META_APP_ID`, `META_APP_SECRET` (e opcional `META_GRAPH_VERSION`, padrão v24.0)
  em cada projeto da Vercel. Endereço de retorno a cadastrar no app: `https://<imobiliária>/redes/retorno/meta`.
  Permissões: pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish
  (exigem a revisão do app e a verificação da empresa na Meta). O Instagram precisa ser conta profissional ligada à Página.
- **Google Meu Negócio**: o mesmo projeto do Google do Drive (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), escopo business.manage
  (o Google precisa liberar o acesso às APIs do Business Profile). Retorno: `https://<imobiliária>/redes/retorno/google`.
- Tokens cifrados no banco (chave derivada do DATABASE_URL, igual no PC e no link). Uma conta ativa por rede.

## Visibilidade e retorno

- Link rastreado `/r/<id><i|f|g|l>`: conta o clique (`social_cliques`), guarda a origem por 30 dias e leva à página com UTM.
  O cliente que pedir visita no portal entra no CRM como "Portal <cliente> · redes (Instagram/Facebook/Google/link na bio)".
- **Link na bio**: `/links` mostra as últimas publicações, cada uma levando à página certa (o visitante não sai do site).
- Painel do gestor: posts nas redes no mês e contas conectadas de cada imobiliária.

## Banco

`social_posts`, `social_contas`, `social_cliques` (`sql/social.sql`, aplicado em todos os schemas; a RUAH é o molde para as próximas).
Teste: `node test/social.js`.
