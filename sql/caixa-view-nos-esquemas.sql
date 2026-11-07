-- As tabelas da Caixa sao comuns a todas as imobiliarias, igual aos condominios e as
-- fachadas: moram em "base" e cada esquema enxerga por uma view.
--
-- A view e refeita toda vez, de proposito: view com SELECT * congela a lista de
-- colunas no momento em que nasce, entao quando a tabela de base ganha coluna a view
-- fica para tras e a tela quebra. Rodar este arquivo de novo e o conserto.
DO $m$
DECLARE s record; tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['caixa_imoveis','caixa_vizinhanca'] LOOP
    IF to_regclass('base.' || tab) IS NULL THEN
      RAISE NOTICE 'base.% ainda nao existe: rode os scripts da Caixa antes', tab;
      CONTINUE;
    END IF;
    FOR s IN SELECT nspname FROM pg_namespace
             WHERE nspname !~ '^(pg_|information_schema|public|base|plataforma|extensions|auth|storage|realtime|graphql|vault|net|cron)'
               AND EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = pg_namespace.oid AND c.relname = 'imoveis')
    LOOP
      EXECUTE format('DROP VIEW IF EXISTS %I.%I', s.nspname, tab);
      EXECUTE format('CREATE VIEW %I.%I AS SELECT * FROM base.%I', s.nspname, tab, tab);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = s.nspname || '_app') THEN
        EXECUTE format('GRANT SELECT ON %I.%I TO %I', s.nspname, tab, s.nspname || '_app');
      END IF;
      RAISE NOTICE 'view % refeita em %', tab, s.nspname;
    END LOOP;
  END LOOP;
END $m$;