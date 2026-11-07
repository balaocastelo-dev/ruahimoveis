-- A lista da Caixa e comum a todas as imobiliarias, igual aos condominios e as fachadas:
-- mora em "base" e cada esquema enxerga por uma view. Esta migracao cria a view nos
-- esquemas que foram criados antes de a tabela existir. Rodar quantas vezes quiser.
DO $m$
DECLARE s record;
BEGIN
  IF to_regclass('base.caixa_imoveis') IS NULL THEN
    RAISE NOTICE 'base.caixa_imoveis ainda nao existe: rode scripts/caixa-importar.js antes';
    RETURN;
  END IF;
  FOR s IN SELECT nspname FROM pg_namespace
           WHERE nspname !~ '^(pg_|information_schema|public|base|plataforma|extensions|auth|storage|realtime|graphql|vault|net|cron)'
             AND EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = pg_namespace.oid AND c.relname = 'imoveis')
  LOOP
    IF to_regclass(s.nspname || '.caixa_imoveis') IS NULL THEN
      EXECUTE format('CREATE VIEW %I.caixa_imoveis AS SELECT * FROM base.caixa_imoveis', s.nspname);
      RAISE NOTICE 'view criada em %', s.nspname;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = s.nspname || '_app') THEN
      EXECUTE format('GRANT SELECT ON %I.caixa_imoveis TO %I', s.nspname, s.nspname || '_app');
    END IF;
  END LOOP;
END $m$;
