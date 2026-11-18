# Oportunidades Caixa

Imobiliária nova no Herrera HOUSE IA. Slug `oportunidades`, nome na tela **Oportunidades Caixa**, host `oportunidades.corretordofuturo.app`. O tema já está em `public/temas/oportunidades/`.

A vitrine pública mostra o preço da Caixa e a assessoria (12%, `CAIXA_ASSESSORIA`) em linhas separadas. No CRM o valor do imóvel já inclui a taxa. Imóvel sem foto não entra na carteira.

Nada disto foi executado no Postgres de produção. Os comandos abaixo são para o Thiago, com a URL de dono.

## 1. Banco (dono do Supabase, não o papel `_app`)

Em produção **não existe o schema `base`**. O compartilhado continua se chamando `ruah`, e as views dos cinco tenants apontam para `ruah.*`. A migração `sql/migrar-schema-ruah-para-base.sql` está suspensa: não rode.

Os scripts descobrem o schema sozinhos: se `SCHEMA_COMPARTILHADO` estiver definida, usam esse nome (e param se ele não existir); senão usam `base` quando o schema existe; senão usam `ruah`. Não criam schema `base`.

Dry-run, não grava:

```bash
DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/criar-tenant-oportunidades.mjs
```

O plano tem de dizer `Schema compartilhado: ruah`.

Aplicar (pode rodar de novo; não apaga o que já existe):

```bash
DATABASE_URL='postgres://DONO@HOST/postgres' \
OPORTUNIDADES_APP_SENHA='senha-do-papel' \
OPORTUNIDADES_ADMIN_SENHA='senha-do-admin' \
node scripts/criar-tenant-oportunidades.mjs --apply
```

Sem essas duas variáveis, o script gera as senhas e imprime cada uma uma vez. Não as grave no git.

O que entra, se ainda não existir:

- linha em `plataforma.imobiliarias` (slug `oportunidades`, nome Oportunidades Caixa, domínio `oportunidades.corretordofuturo.app`, situação `implantacao`)
- schema `oportunidades`, com as tabelas copiadas de `ruah` (estrutura, sem os dados)
- papel `oportunidades_app` (`search_path` `oportunidades, extensions`)
- `ruah.fachadas`, `ruah.caixa_imoveis`, `ruah.caixa_vizinhanca`
- views `caixa_imoveis`, `fachadas` e `caixa_vizinhanca` em `oportunidades` e nos cinco que já estão no ar (`l7inteligencia`, `cademeuap`, `ondemorar`, `casaprado`, `lumen`), com `GRANT SELECT` para o papel `*_app` de cada um

As colunas `origem`, `origem_ref`, `finalidade`, `valor_locacao` e o índice `ux_imoveis_origem` já estão nos cinco. O script não mexe em `ruah.imoveis`. No tenant novo, essas colunas entram na cópia.

Para repetir só as views dos cinco, o mesmo banco:

```bash
DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/corrigir-schema-tenants.mjs
DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/corrigir-schema-tenants.mjs --apply
```

A URL do projeto na Vercel segue o mesmo formato das outras imobiliárias:

```text
postgres://oportunidades_app.<ref-do-projeto>:<senha>@<pooler>/postgres
```

O pooler e o ref estão em `src/plataforma/gestor.js` (`PLATAFORMA_POOLER`, `PLATAFORMA_PROJETO_DB`). Use o papel `oportunidades_app` no site. A esteira diária usa a URL de **dono**, porque ela cria tabela e grava a foto em `bytea`.

## 2. Primeira carga

```bash
DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/caixa-esteira.js --uf SP --imobiliaria oportunidades
```

A esteira grava em `ruah` (o schema que ela detectar). Não precisa exportar `SCHEMA_COMPARTILHADO` se o banco for o de produção.

Ordem: CSV da Caixa → fotos → prazos → geocode → vizinhança → `oportunidades.imoveis` (`origem=caixa`, código `CX0001`…). A primeira vez baixa a foto de cada imóvel da região (250 ms entre uma e outra). As seguintes só pegam o que entrou.

Prova local, sem rede e sem o banco de produção:

```bash
node test/oportunidades-caixa.js
```

## 3. Projeto na Vercel

O projeto da plataforma continua em `corretordofuturo.app`. A imobiliária ganha um projeto próprio, no mesmo repositório, branch `main`, região `gru1` (o `vercel.json` já pede isso). O nome do repositório é o que `src/plataforma/repo.js` já usa.

1. Criar o projeto (nome sugerido `imob-oportunidades`), ligado a esse repositório, production branch `main`.
2. Domínio `oportunidades.corretordofuturo.app` nesse projeto.
3. Variáveis de produção (as mesmas que o painel grava para as outras; valores desta casa):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | URL do papel `oportunidades_app` |
| `SECRET_KEY` | 32+ caracteres aleatórios, só deste projeto |
| `CLIENTE_NOME` | `Oportunidades Caixa` |
| `EMPRESA` | `Oportunidades Caixa` |
| `TEMA` | `oportunidades` |
| `BLOG_NOME` | `Oportunidades Caixa Blog` |
| `BLOG_LEGENDA` | `Casa, bairro e jeito de morar, pela Oportunidades Caixa` |
| `IA_MODO` | `desligado` |
| `RADAR_PORTAIS` | `0` |
| `FISGUEI_ROBO` | `0` |
| `ESCRITORIO` | `0` |
| `CAIXA_ASSESSORIA` | `12` |
| `PUBLIC_URL` | `https://oportunidades.corretordofuturo.app` |
| `LINK_ONLINE` | `https://oportunidades.corretordofuturo.app` |

4. Publicar a `main` depois do merge deste PR. Sem o merge, o projeto sobe sem a esteira nova; o portal da Caixa que já está na `main` continua valendo.
5. No cadastro, quando o domínio responder, marcar `publicada = 1` e `situacao = ativa`. O script não faz isso sozinho.

## 4. Todo dia

Duas formas. Uma basta.

**GitHub Action** (`.github/workflows/caixa-diario.yml`), 06:47 em São Paulo. Segredo do repositório `DATABASE_URL_CAIXA` = URL de dono. Sem o segredo o job avisa e não importa. Também dá para disparar à mão em Actions → Caixa diário.

**ProLiant**, se a Caixa bloquear o IP da Action (o CDN Azion responde 403 para alguns IPs de nuvem; daqui a lista pública não baixou). O `caixa-diario.ps1` que já roda às 06:47 continua, mas a `DATABASE_URL` passa a ser a de produção, lida do arquivo de senha em `D:\segredos\`, como hoje. Não publique esse arquivo e não abra o Postgres do ProLiant na internet.

## O que veio do ProLiant e o que ficou de fora

Veio `scripts/caixa-para-crm.js` (não estava na `main`): só imóvel da RMC com foto, assessoria no valor do CRM, quem sai da lista vai para `off_market`. A esteira (`scripts/caixa-esteira.js`) e o script do tenant são novos.

O resto da vitrine com foto (importar, fotos, prazos, geocode, vizinhança, rotas `/oportunidades`, carimbo, tema) já estava na `main`, igual aos arquivos que estavam soltos no disco do ProLiant. O diff não commitado daquele clone era contra um `main` de 06/11; a `main` atual já passou daquilo, inclusive o PR #9.

Ficou de fora de propósito: `*.antes-*`, `dbg.js`, `t-ov.js`, `bciclo.js`, `baixa-capas.js`, os `.ps1` (leem senha de arquivo local) e qualquer segredo. `scripts/blog-materias-caixa.js` da `main` só difere nas quebras de linha.
