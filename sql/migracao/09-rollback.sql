-- Herrera HOUSE IA · migração fase 1 · ROLLBACK de 02 e 01. Idempotente: pode rodar várias vezes, e também se só o 01 rodou.
--  1) devolve para "ruah" as tabelas que o 02 moveu (as anotadas em base._migracao_fase1; sem anotação, a lista fixa),
--     com o DEFAULT de volta para ruah.agora();
--  2) recria as FKs comum → privada que o 02 removeu (NOT VALID + VALIDATE; se algum dado novo violar, fica NOT VALID
--     e avisa — a FK passa a valer para linhas novas, e as antigas podem ser conferidas depois);
--  3) volta o search_path do papel do app ao valor anterior ao 01;
--  4) apaga base.agora(), a tabela de estado e o schema base, SE estiver vazio. Se o passo 3 (sql/plataforma*.sql) já
--     criou tabelas em base, elas ficam (desfazer o passo 3 primeiro — ver README).
--
-- Uso:  psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -v app_role=ruah_app -f sql/migracao/09-rollback.sql
--       opcional: -v search_path_antigo='ruah, extensions'  (usado só se o 01 não tiver anotado o valor antigo)
\set ON_ERROR_STOP on
\if :{?app_role}
\else
  \echo 'Faltou -v app_role=<papel do app> (produção: ruah_app)'
  SELECT 1/0 AS faltou_app_role;
\endif
\if :{?search_path_antigo}
\else
  \set search_path_antigo 'ruah, extensions'
\endif
SELECT set_config('migracao.app_role', :'app_role', false),
       set_config('migracao.sp_padrao', :'search_path_antigo', false);

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
-- nomes sempre qualificados nas definições lidas do catálogo (pg_get_expr/pg_get_constraintdef)
SET LOCAL search_path = pg_catalog;

DO $$
DECLARE
  -- comuns que existiam em ruah antes da migração (as da plataforma nascem em base e não voltam)
  fixa text[] := ARRAY['condominios', 'condominio_cache', 'predios3d', 'mapa3d', 'pois', 'fachadas', 'bairro_commons',
                       'bairros', 'fisguei_anuncios', 'fisguei_precos', 'tentativas_login'];
  tem_estado boolean := to_regclass('base._migracao_fase1') IS NOT NULL;
  lista text[];
  t text;
  col record;
  fk record;
  sp text;
  sp_tem boolean;
  papel text := current_setting('migracao.app_role');
BEGIN
  IF tem_estado THEN
    EXECUTE $q$SELECT array_agg(substr(chave, 8) ORDER BY chave) FROM base._migracao_fase1 WHERE chave LIKE 'movida:%'$q$ INTO lista;
  END IF;
  lista := COALESCE(lista, '{}') || fixa;  -- anotadas + fixa (repetidas são puladas abaixo)

  -- 1) tabelas de volta para ruah
  FOREACH t IN ARRAY lista LOOP
    IF to_regclass(format('base.%I', t)) IS NULL THEN CONTINUE; END IF;
    IF to_regclass(format('ruah.%I', t)) IS NOT NULL THEN
      RAISE EXCEPTION 'Tabela % existe em base E em ruah: resolver à mão.', t;
    END IF;
    EXECUTE format('ALTER TABLE base.%I SET SCHEMA ruah', t);
    FOR col IN
      SELECT a.attname
        FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = format('ruah.%I', t)::regclass AND NOT a.attisdropped
         AND pg_get_expr(d.adbin, d.adrelid) = 'base.agora()'
    LOOP
      EXECUTE format('ALTER TABLE ruah.%I ALTER COLUMN %I SET DEFAULT ruah.agora()', t, col.attname);
    END LOOP;
    RAISE NOTICE 'voltou: base.% → ruah.%', t, t;
  END LOOP;

  -- 2) FKs removidas pelo 02 (definição guardada como 'fk:<tabela>:<constraint>' → 'FOREIGN KEY (...) REFERENCES ...')
  IF tem_estado THEN
    FOR fk IN EXECUTE $q$SELECT split_part(chave, ':', 2) AS tab, split_part(chave, ':', 3) AS nome, valor AS def
                           FROM base._migracao_fase1 WHERE chave LIKE 'fk:%' ORDER BY chave$q$
    LOOP
      IF to_regclass(format('ruah.%I', fk.tab)) IS NULL THEN
        RAISE WARNING 'FK % não recriada: ruah.% não existe', fk.nome, fk.tab; CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.nome AND conrelid = format('ruah.%I', fk.tab)::regclass) THEN
        CONTINUE;
      END IF;
      -- a definição foi guardada com search_path=pg_catalog, então já vem qualificada (REFERENCES ruah.x(id))
      EXECUTE format('ALTER TABLE ruah.%I ADD CONSTRAINT %I %s NOT VALID', fk.tab, fk.nome, fk.def);
      BEGIN
        EXECUTE format('ALTER TABLE ruah.%I VALIDATE CONSTRAINT %I', fk.tab, fk.nome);
        RAISE NOTICE 'FK recriada: %.% %', fk.tab, fk.nome, fk.def;
      EXCEPTION WHEN foreign_key_violation THEN
        RAISE WARNING 'FK %.% recriada como NOT VALID (há linhas antigas que não batem): %', fk.tab, fk.nome, SQLERRM;
      END;
    END LOOP;
  END IF;

  -- 3) search_path do papel: valor anotado pelo 01 (NULL = papel não tinha search_path → RESET)
  sp_tem := false;
  IF tem_estado THEN  -- SQL dinâmico: sem o schema base a tabela nem existe (rollback repetido)
    EXECUTE $q$SELECT count(*) > 0, max(valor) FROM base._migracao_fase1 WHERE chave = 'search_path_antigo'$q$ INTO sp_tem, sp;
  END IF;
  IF NOT sp_tem THEN sp := current_setting('migracao.sp_padrao'); END IF;
  IF sp IS NULL THEN
    EXECUTE format('ALTER ROLE %I RESET search_path', papel);
    RAISE NOTICE 'search_path de %: RESET (não tinha antes do 01)', papel;
  ELSE
    EXECUTE format('ALTER ROLE %I SET search_path = %s', papel, sp);
    RAISE NOTICE 'search_path de %: % (%)', papel, sp, CASE WHEN sp_tem THEN 'anotado pelo 01' ELSE 'padrão do rollback' END;
  END IF;

  -- 4) limpa o schema base, se não sobrou nada além do que o 01 criou
  IF to_regnamespace('base') IS NOT NULL THEN
    DROP TABLE IF EXISTS base._migracao_fase1;
    IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'base'::regnamespace) THEN
      RAISE WARNING 'schema base mantido: ainda tem objetos (passo 3?). base.agora() também fica.';
    ELSE
      DROP FUNCTION IF EXISTS base.agora();
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA base REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA base REVOKE ALL ON SEQUENCES FROM %I', papel);
      DROP SCHEMA base;  -- RESTRICT: falha se ainda houver algo inesperado
      RAISE NOTICE 'schema base removido';
    END IF;
  END IF;
END $$;

COMMIT;
\echo '== 09-rollback: ok'
