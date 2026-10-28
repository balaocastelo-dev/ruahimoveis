# Migração da produção para a plataforma multi-imobiliária (fase 1)

Hoje tudo mora no schema `ruah`. Depois da migração:

- **privadas** (trabalho da imobiliária) continuam em `ruah` — a RUAH é a imobiliária `ruah`;
- **comuns** (prédios, mapa, bairros, anúncios dos portais, tentativas de login) vão para `base`.

A lista de qual tabela é o quê está em `src/tabelas.js`. Os scripts usam `psql` com um papel **administrador**
(no Supabase: `postgres`), nunca o `ruah_app`. Nada aqui copia dados: `ALTER TABLE ... SET SCHEMA` só mexe no catálogo.

Ensaio completo, num Postgres temporário desta máquina: `bash scripts/ensaio-migracao.sh` (precisa dar **0 falha(s)**).

```bash
URL_ADMIN='postgres://postgres:...@.../postgres'   # conexão direta (porta 5432), não o pooler em modo transação
```

## Passos

| # | O quê | Comando | Tempo esperado | Sistema |
|---|-------|---------|----------------|---------|
| 0 | Backup | ver abaixo | minutos | no ar |
| 1 | Preparar | `01-preparar.sql` | < 1 s | no ar |
| 2 | Mover as comuns | `02-mover-comuns.sql` | < 1 s (trava de até 3 s) | no ar |
| 3 | Tabelas novas da plataforma | `sql/plataforma.sql`, `sql/plataforma-mistas.sql` | segundos | no ar |
| 4 | Publicar código com `MULTI=1` | Vercel + PC | deploy | troca |
| 5 | Modo estrito | `MULTI_ESTRITO=1` e search_path enxuto | — | depois |

No ensaio (39 tabelas, poucas linhas): 01 ≈ 50 ms, 02 ≈ 55 ms, 09 ≈ 50 ms. Na produção o tempo **não cresce com o
número de linhas** (só catálogo); o que pode demorar é esperar uma consulta longa soltar a tabela — por isso o
`lock_timeout` de 3 s.

### 0. Backup
- Supabase: confirmar que há backup diário recente ou PITR ligado (Database → Backups). Anotar a hora.
- Cópia lógica do schema: `pg_dump "$URL_ADMIN" -n ruah -Fc -f ruah-antes-da-migracao.dump`
- Conferir o papel do app: `SELECT rolname, setdatabase, setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole WHERE rolname='ruah_app';`
  (o 01 recusa seguir se houver search_path **por banco** para o papel.)

### 1. Preparar
```bash
psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -v app_role=ruah_app -f sql/migracao/01-preparar.sql
```
Cria o schema `base` vazio, `base.agora()`, os GRANTs para o `ruah_app` (inclusive para tabelas futuras) e
`ALTER ROLE ruah_app SET search_path = ruah, base, extensions`, para o código antigo continuar achando as tabelas que
mudarem de schema. Guarda o search_path anterior em `base._migracao_fase1` e **derruba as conexões abertas do
`ruah_app`** para elas voltarem com o search_path novo (`-v derrubar=0` pula; aí reinicie o app antes do passo 2).

**Verificar:** `SHOW search_path` numa conexão nova do app mostra `ruah, base, extensions`; o sistema segue normal.
**Desfazer:** `09-rollback.sql`.

### 2. Mover as comuns
```bash
psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -f sql/migracao/02-mover-comuns.sql
```
Uma transação com `lock_timeout = 3s`: move as 11 comuns que existem (`condominios`, `condominio_cache`, `predios3d`,
`mapa3d`, `pois`, `fachadas`, `bairro_commons`, `bairros`, `fisguei_anuncios`, `fisguei_precos`, `tentativas_login`).
Se der `lock timeout`, **nada** foi movido: rode de novo (de preferência fora do horário do radar/Fisgar).

- Remove as FKs **comum → privada**: `fisguei_anuncios.oportunidade_id → oportunidades` e
  `fisguei_anuncios.imovel_id → imoveis` (a definição fica em `base._migracao_fase1`; o rollback recria).
  O código não apaga oportunidades/imóveis, então o `ON DELETE SET NULL` delas não estava em uso.
- FKs **privada → comum** (`imoveis.condominio_id`, `fisguei_pessoas.anuncio_id`, ...) continuam valendo entre schemas.
- `DEFAULT ruah.agora()` das comuns vira `base.agora()`.

**Verificar:**
```sql
SELECT schemaname, count(*) FROM pg_tables WHERE schemaname IN ('ruah','base') GROUP BY 1;  -- ruah 28, base 12 (11 + _migracao_fase1)
SELECT count(*) FROM base.fisguei_anuncios;  -- igual ao de antes
```
E no sistema: abrir Radar, Mapa/condomínios, Bairros e o Fisguei; fazer login.
**Desfazer:** `09-rollback.sql`.

### 3. Tabelas novas da plataforma
```bash
psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -f sql/plataforma.sql
psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -f sql/plataforma-mistas.sql
```
(Feitos nas frentes `fase1-auth` e `fase1-mistas`.) Rodar com o mesmo papel administrador do passo 1, para os
`ALTER DEFAULT PRIVILEGES` darem acesso automático ao `ruah_app`.
**Desfazer:** o rollback de cada um desses arquivos (das outras frentes) e só depois o `09-rollback.sql` — o 09
não apaga tabelas que não criou e mantém o schema `base` se ainda houver algo nele.

### 4. Publicar o código
Variáveis na Vercel e no `.env` do PC: `MULTI=1` e `IMOBILIARIA_PADRAO=ruah`. Publicar o código da fase 1.
Com `MULTI=1` o código passa a escrever `base.x` / `"ruah".x` e não depende mais do search_path.
**Verificar:** login, painel, Radar, Fisguei, mapa e bairros na Vercel e no PC.
**Desfazer:** voltar `MULTI=0` (ou o deploy anterior). O banco migrado continua servindo o código antigo por causa do
search_path do passo 1.

### 5. Modo estrito (depois de uns dias estável)
- `MULTI_ESTRITO=1`: tabela fora do mapa ou privada sem imobiliária no contexto vira erro.
- Tirar a muleta: `ALTER ROLE ruah_app SET search_path = extensions;` (o ensaio já roda os testes assim).
**Desfazer:** `MULTI_ESTRITO=0` e `ALTER ROLE ruah_app SET search_path = ruah, base, extensions;`.

## Rollback
```bash
psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -v app_role=ruah_app -f sql/migracao/09-rollback.sql
```
Desfaz 02 e 01, nesta ordem: devolve as comuns para `ruah` (com `DEFAULT ruah.agora()`), recria as FKs removidas
(se algum dado novo não bater, ela fica `NOT VALID` e avisa), volta o search_path do `ruah_app` ao valor anterior e
apaga `base` se estiver vazio. Idempotente: pode rodar de novo, ou depois só do 01. Antes dele, voltar o código para
`MULTI=0` — com `MULTI=1` o código procura `base.x`.

Último recurso: restaurar o backup/PITR do passo 0 (ou `pg_restore` do dump de `ruah`).
