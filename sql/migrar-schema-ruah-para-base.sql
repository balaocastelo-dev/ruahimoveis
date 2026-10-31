-- Herrera HOUSE IA · renomeia o schema da base comum de "ruah" para "base".
--
-- O schema guardava, no mesmo lugar, a base compartilhada (condomínios, prédios 3D,
-- mapa, pontos de interesse, fachadas e anúncios de mercado de Campinas) e as tabelas
-- operacionais da instalação que nasceu com esse nome. Esta migração SÓ RENOMEIA.
-- Não apaga schema, tabela, linha, papel de banco nem cadastro em plataforma.imobiliarias.
--
-- Rode DEPOIS de publicar o código desta mudança, no SQL editor do Postgres (Supabase).
-- Se o schema já se chama base, o arquivo não faz nada. Não rode contra um banco que
-- já tenha um schema "base" diferente: ele aborta.
-- Para desfazer: sql/migrar-schema-ruah-para-base-rollback.sql

BEGIN;

CREATE TEMP TABLE _mig_estado (aplicada boolean) ON COMMIT DROP;
INSERT INTO _mig_estado VALUES (false);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'base')
     AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ruah') THEN
    RAISE NOTICE 'schema base já existe e ruah não: migração já aplicada, nada a fazer';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ruah') THEN
    RAISE EXCEPTION 'schema ruah não existe; abortando sem mudar nada';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'base') THEN
    RAISE EXCEPTION 'schema base já existe junto com ruah; abortando para não misturar dados';
  END IF;
  UPDATE _mig_estado SET aplicada = true;
END $$;

-- Views de outros schemas que ainda citam ruah.*, fotografadas antes do rename.
CREATE TEMP TABLE _mig_views ON COMMIT DROP AS
SELECT n.nspname AS sch, c.relname AS nome, pg_get_viewdef(c.oid, true) AS def
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname <> 'ruah'
  AND pg_get_viewdef(c.oid, true) ~ 'ruah\.'
  AND EXISTS (SELECT 1 FROM _mig_estado WHERE aplicada);

-- Corpo das funções que citam o nome antigo (o texto não acompanha o ALTER SCHEMA).
CREATE TEMP TABLE _mig_funcoes ON COMMIT DROP AS
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_get_functiondef(p.oid) ~ 'ruah'
  AND EXISTS (SELECT 1 FROM _mig_estado WHERE aplicada);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _mig_estado WHERE aplicada) THEN
    RETURN;
  END IF;
  ALTER SCHEMA ruah RENAME TO base;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ruah_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'base_app') THEN
    ALTER ROLE ruah_app RENAME TO base_app;
  END IF;
END $$;

DO $$
DECLARE r record; f record; v record; def text; caminho text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _mig_estado WHERE aplicada) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'base_app') THEN
    EXECUTE 'ALTER ROLE base_app SET search_path TO base, extensions';
    EXECUTE 'GRANT USAGE ON SCHEMA base TO base_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA base TO base_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA base TO base_app';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA base TO base_app';
  END IF;

  FOR r IN
    SELECT rolname, cfg FROM (
      SELECT rolname, unnest(rolconfig) AS cfg FROM pg_roles WHERE rolconfig IS NOT NULL
    ) s
    WHERE cfg LIKE 'search_path=%ruah%'
  LOOP
    caminho := replace(replace(split_part(r.cfg, '=', 2), 'ruah_app', 'base_app'), 'ruah', 'base');
    EXECUTE format('ALTER ROLE %I SET search_path TO %s', r.rolname, caminho);
  END LOOP;

  FOR f IN SELECT def FROM _mig_funcoes LOOP
    def := replace(f.def, 'ruah_app', 'base_app');
    def := replace(def, 'ruah.', 'base.');
    def := replace(def, '''ruah''', '''base''');
    -- O slug antigo sai da lista de reservados no replace; volta junto com "base".
    def := replace(def, 'IN (''base'',''plataforma''', 'IN (''base'',''ruah'',''plataforma''');
    IF position('CREATE OR REPLACE FUNCTION' in def) = 0 THEN
      def := replace(def, 'CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
    END IF;
    EXECUTE def;
  END LOOP;

  FOR v IN SELECT sch, nome, def FROM _mig_views LOOP
    def := replace(replace(v.def, 'ruah_app', 'base_app'), 'ruah.', 'base.');
    EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s', v.sch, v.nome, def);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v.sch || '_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO %I', v.sch, v.nome, v.sch || '_app');
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'base' AND table_name = 'condominios' AND column_name = 'fontes'
  ) THEN
    UPDATE base.condominios
       SET fontes = regexp_replace(fontes, '(^|,)ruah(,|$)', '\1cadastro\2', 'g')
     WHERE fontes ~ '(^|,)ruah(,|$)';
  END IF;

  -- O código novo aceita o cabeçalho antigo (x-ruah-ciclo) e o novo (x-hh-ciclo).
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    EXECUTE $q$UPDATE cron.job
                 SET command = replace(replace(replace(command, 'ruah_app', 'base_app'), 'ruah.', 'base.'), 'x-ruah-ciclo', 'x-hh-ciclo')
               WHERE command ~ 'ruah'$q$;
  END IF;
END $$;

COMMIT;
