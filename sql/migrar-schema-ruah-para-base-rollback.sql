-- Desfaz sql/migrar-schema-ruah-para-base.sql.
-- Renomeia o schema de volta para "ruah" e reescreve views, funções, search_path e grants.
-- Não apaga dados. Se o schema ainda se chama ruah, não faz nada.

BEGIN;

CREATE TEMP TABLE _rb_estado (aplicada boolean) ON COMMIT DROP;
INSERT INTO _rb_estado VALUES (false);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ruah')
     AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'base') THEN
    RAISE NOTICE 'schema ruah já existe e base não: rollback já aplicado, nada a fazer';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'base') THEN
    RAISE EXCEPTION 'schema base não existe; abortando sem mudar nada';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ruah') THEN
    RAISE EXCEPTION 'schema ruah já existe junto com base; abortando para não misturar dados';
  END IF;
  UPDATE _rb_estado SET aplicada = true;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _rb_estado WHERE aplicada) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'base' AND table_name = 'condominios' AND column_name = 'fontes'
  ) THEN
    UPDATE base.condominios
       SET fontes = regexp_replace(fontes, '(^|,)cadastro(,|$)', '\1ruah\2', 'g')
     WHERE fontes ~ '(^|,)cadastro(,|$)';
  END IF;
END $$;

CREATE TEMP TABLE _rb_views ON COMMIT DROP AS
SELECT n.nspname AS sch, c.relname AS nome, pg_get_viewdef(c.oid, true) AS def
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname <> 'base'
  AND pg_get_viewdef(c.oid, true) ~ 'base\.'
  AND EXISTS (SELECT 1 FROM _rb_estado WHERE aplicada);

CREATE TEMP TABLE _rb_funcoes ON COMMIT DROP AS
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_get_functiondef(p.oid) ~ 'base(\.|_app|'')'
  AND EXISTS (SELECT 1 FROM _rb_estado WHERE aplicada);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _rb_estado WHERE aplicada) THEN
    RETURN;
  END IF;
  ALTER SCHEMA base RENAME TO ruah;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'base_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ruah_app') THEN
    ALTER ROLE base_app RENAME TO ruah_app;
  END IF;
END $$;

DO $$
DECLARE r record; f record; v record; def text; caminho text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _rb_estado WHERE aplicada) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ruah_app') THEN
    EXECUTE 'ALTER ROLE ruah_app SET search_path TO ruah, extensions';
    EXECUTE 'GRANT USAGE ON SCHEMA ruah TO ruah_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ruah TO ruah_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ruah TO ruah_app';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ruah TO ruah_app';
  END IF;

  FOR r IN
    SELECT rolname, cfg FROM (
      SELECT rolname, unnest(rolconfig) AS cfg FROM pg_roles WHERE rolconfig IS NOT NULL
    ) s
    WHERE cfg LIKE 'search_path=%base%'
  LOOP
    caminho := replace(replace(split_part(r.cfg, '=', 2), 'base_app', 'ruah_app'), 'base', 'ruah');
    EXECUTE format('ALTER ROLE %I SET search_path TO %s', r.rolname, caminho);
  END LOOP;

  FOR f IN SELECT def FROM _rb_funcoes LOOP
    def := replace(f.def, 'base_app', 'ruah_app');
    def := replace(def, 'base.', 'ruah.');
    def := replace(def, '''base''', '''ruah''');
    def := replace(def, 'IN (''ruah'',''ruah'',''plataforma''', 'IN (''ruah'',''plataforma''');
    IF position('CREATE OR REPLACE FUNCTION' in def) = 0 THEN
      def := replace(def, 'CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
    END IF;
    EXECUTE def;
  END LOOP;

  FOR v IN SELECT sch, nome, def FROM _rb_views LOOP
    def := replace(replace(v.def, 'base_app', 'ruah_app'), 'base.', 'ruah.');
    EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s', v.sch, v.nome, def);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v.sch || '_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO %I', v.sch, v.nome, v.sch || '_app');
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job') THEN
    EXECUTE $q$UPDATE cron.job
                 SET command = replace(replace(replace(command, 'base_app', 'ruah_app'), 'base.', 'ruah.'), 'x-hh-ciclo', 'x-ruah-ciclo')
               WHERE command ~ 'base\.|base_app|x-hh-ciclo'$q$;
  END IF;
END $$;

COMMIT;
