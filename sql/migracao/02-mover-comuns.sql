-- Herrera HOUSE IA · migração fase 1 · PASSO 2: mover as tabelas COMUNS de "ruah" para "base".
-- Lista = COMUNS de src/tabelas.js que existem hoje no schema ruah (as da plataforma ainda não existem e são puladas).
-- ALTER TABLE ... SET SCHEMA só mexe no catálogo: não copia dados, leva junto índices, sequências (identity),
-- constraints, GRANTs e as FKs de quem aponta para a tabela. Leva milissegundos, mas pede ACCESS EXCLUSIVE em cada
-- tabela: com lock_timeout de 3 s, se alguma consulta longa estiver segurando, NADA é feito (rode de novo).
--
-- FKs de tabela comum → tabela privada (ex.: fisguei_anuncios.oportunidade_id → ruah.oportunidades) são removidas:
-- quando houver 2ª imobiliária, a linha comum não pode apontar para o schema de uma só. A definição de cada uma fica
-- guardada em base._migracao_fase1 e o 09-rollback a recria. (O código não apaga oportunidades/imóveis, então o
-- "ON DELETE SET NULL" dessas FKs não está em uso; as colunas em si saem na frente fase1-mistas → anuncio_andamento.)
-- FKs privada → comum (imoveis.condominio_id, fisguei_pessoas.anuncio_id, ...) continuam: elas funcionam entre schemas.
--
-- Pré-requisito: 01-preparar.sql. Idempotente: tabela que já está em base é pulada.
-- Uso:  psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -f sql/migracao/02-mover-comuns.sql
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
-- nomes sempre qualificados nas definições lidas do catálogo (pg_get_expr/pg_get_constraintdef)
SET LOCAL search_path = pg_catalog;

DO $$
DECLARE
  -- mesma lista de src/tabelas.js (COMUNS); ordem: pais antes de filhos só por clareza (SET SCHEMA não depende dela)
  comuns text[] := ARRAY[
    'condominios', 'condominio_cache', 'predios3d', 'mapa3d', 'pois', 'fachadas', 'bairro_commons', 'bairros',
    'fisguei_anuncios', 'fisguei_precos', 'tentativas_login',
    'imobiliarias', 'dominios', 'login_indice', 'gestores', 'chaves_integracao', 'auditoria_plataforma'];
  t text;
  fk record;
  movidas int := 0;
  col record;
BEGIN
  IF to_regnamespace('base') IS NULL OR to_regclass('base._migracao_fase1') IS NULL THEN
    RAISE EXCEPTION 'Rode antes sql/migracao/01-preparar.sql (schema base não está pronto).';
  END IF;

  FOREACH t IN ARRAY comuns LOOP
    IF to_regclass(format('ruah.%I', t)) IS NOT NULL AND to_regclass(format('base.%I', t)) IS NOT NULL THEN
      RAISE EXCEPTION 'Tabela % existe em ruah E em base: resolver à mão antes de seguir.', t;
    END IF;
    IF to_regclass(format('ruah.%I', t)) IS NULL THEN
      RAISE NOTICE 'pulada: % (não está em ruah%)', t, CASE WHEN to_regclass(format('base.%I', t)) IS NOT NULL THEN '; já em base' ELSE '' END;
      CONTINUE;
    END IF;

    -- 1) FKs desta tabela comum que apontam para tabela que vai continuar privada (fora da lista): guarda e remove.
    FOR fk IN
      SELECT c.conname, pg_get_constraintdef(c.oid) AS def, rt.relname AS ref
        FROM pg_constraint c
        JOIN pg_class ft ON ft.oid = c.conrelid
        JOIN pg_namespace fn ON fn.oid = ft.relnamespace
        JOIN pg_class rt ON rt.oid = c.confrelid
        JOIN pg_namespace rn ON rn.oid = rt.relnamespace
       WHERE c.contype = 'f' AND fn.nspname = 'ruah' AND ft.relname = t
         AND rn.nspname = 'ruah' AND NOT (rt.relname = ANY (comuns))
    LOOP
      INSERT INTO base._migracao_fase1(chave, valor)
      VALUES (format('fk:%s:%s', t, fk.conname), fk.def)
      ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, em = now();
      EXECUTE format('ALTER TABLE ruah.%I DROP CONSTRAINT %I', t, fk.conname);
      RAISE NOTICE 'FK removida (comum → privada): %.% → ruah.%  [%]', t, fk.conname, fk.ref, fk.def;
    END LOOP;

    -- 2) muda de schema
    EXECUTE format('ALTER TABLE ruah.%I SET SCHEMA base', t);

    -- 3) DEFAULT ruah.agora() → base.agora() (a tabela comum não depende do schema de uma imobiliária)
    FOR col IN
      SELECT a.attname
        FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = format('base.%I', t)::regclass AND NOT a.attisdropped
         AND pg_get_expr(d.adbin, d.adrelid) = 'ruah.agora()'
    LOOP
      EXECUTE format('ALTER TABLE base.%I ALTER COLUMN %I SET DEFAULT base.agora()', t, col.attname);
    END LOOP;

    INSERT INTO base._migracao_fase1(chave, valor) VALUES (format('movida:%s', t), 'ruah')
    ON CONFLICT (chave) DO NOTHING;
    movidas := movidas + 1;
    RAISE NOTICE 'movida: ruah.% → base.%', t, t;
  END LOOP;

  INSERT INTO base._migracao_fase1(chave, valor) VALUES ('movido_em', now()::text)
  ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, em = now();
  RAISE NOTICE '02-mover-comuns: % tabela(s) movida(s) nesta rodada', movidas;
END $$;

COMMIT;

\echo '== 02-mover-comuns: ok. Tabelas em base:'
SELECT c.relname AS tabela, c.reltuples::bigint AS linhas_aprox
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'base' AND c.relkind IN ('r', 'p') ORDER BY 1;
