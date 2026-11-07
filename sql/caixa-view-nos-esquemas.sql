-- A lista da Caixa e comum a todas as imobiliarias, igual aos condominios e as
-- fachadas: mora em "base" e cada esquema enxerga por uma view.
--
-- A view e refeita toda vez, de proposito: view com SELECT * congela a lista de
-- colunas no momento em que nasce, entao quando a tabela de base ganha coluna
-- (foi o que aconteceu com lat/lon) a view fica para tras e a tela quebra.
-- Rodar este arquivo de novo e o conserto.
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
    EXECUTE format('DROP VIEW IF EXISTS %I.caixa_imoveis', s.nspname);
    EXECUTE format('CREATE VIEW %I.caixa_imoveis AS SELECT * FROM base.caixa_imoveis', s.nspname);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = s.nspname || '_app') THEN
      EXECUTE format('GRANT SELECT ON %I.caixa_imoveis TO %I', s.nspname, s.nspname || '_app');
    END IF;
    RAISE NOTICE 'view refeita em %', s.nspname;
  END LOOP;
END $m$;