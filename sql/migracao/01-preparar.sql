-- Herrera HOUSE IA · migração fase 1 (multi-imobiliária) · PASSO 1: preparar.
-- Cria o schema compartilhado "base" (vazio), dá acesso ao papel do app, copia agora() e amplia o search_path do papel.
-- Não move nada e não trava tabela nenhuma: pode rodar com o sistema no ar. Idempotente (rodar 2x não muda nada).
--
-- Uso:  psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -v app_role=ruah_app -f sql/migracao/01-preparar.sql
-- Desfazer: sql/migracao/09-rollback.sql
\set ON_ERROR_STOP on
\if :{?app_role}
\else
  \echo 'Faltou -v app_role=<papel do app> (produção: ruah_app)'
  SELECT 1/0 AS faltou_app_role;
\endif
SELECT set_config('migracao.app_role', :'app_role', false);

BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE SCHEMA IF NOT EXISTS base;
COMMENT ON SCHEMA base IS 'Herrera HOUSE IA: tabelas comuns a todas as imobiliárias (src/tabelas.js → comum)';

-- Estado da migração (search_path antigo do papel e FKs removidas no passo 2), lido pelo rollback.
CREATE TABLE IF NOT EXISTS base._migracao_fase1 (
  chave text PRIMARY KEY,
  valor text,
  em timestamptz NOT NULL DEFAULT now()
);

-- Guarda o search_path atual do papel UMA vez (num segundo 01 o valor já seria o novo).
INSERT INTO base._migracao_fase1(chave, valor)
SELECT 'search_path_antigo',
       (SELECT substr(c, length('search_path=') + 1)
          FROM pg_db_role_setting s
          JOIN pg_roles r ON r.oid = s.setrole AND r.rolname = current_setting('migracao.app_role')
          CROSS JOIN LATERAL unnest(s.setconfig) c
         WHERE s.setdatabase = 0 AND c LIKE 'search\_path=%')
ON CONFLICT (chave) DO NOTHING;
INSERT INTO base._migracao_fase1(chave, valor) VALUES ('preparado_em', now()::text)
ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, em = now();

-- Ajuste por banco (ALTER ROLE ... IN DATABASE ... SET search_path) vence o do papel: se existir, este passo não basta.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
              WHERE r.rolname = current_setting('migracao.app_role') AND s.setdatabase <> 0
                AND EXISTS (SELECT 1 FROM unnest(s.setconfig) c WHERE c LIKE 'search\_path=%')) THEN
    RAISE EXCEPTION 'O papel % tem search_path por banco (ALTER ROLE ... IN DATABASE): ajuste esse também, ou remova-o, antes de seguir.',
      current_setting('migracao.app_role');
  END IF;
END $$;

-- Mesma função de data do schema ruah (texto 'AAAA-MM-DD HH:MM:SS', horário de Brasília).
CREATE OR REPLACE FUNCTION base.agora() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') $$;

-- Acesso do app: igual ao que ele já tem no schema ruah (DML, sem DDL).
GRANT USAGE ON SCHEMA base TO :"app_role";
GRANT EXECUTE ON FUNCTION base.agora() TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA base TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA base TO :"app_role";
-- O app não lê a tabela de estado da migração.
REVOKE ALL ON base._migracao_fase1 FROM :"app_role";
-- Tabelas criadas depois (passo 3, pelo mesmo papel administrador) já nascem com acesso para o app.
ALTER DEFAULT PRIVILEGES IN SCHEMA base GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA base GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- Compatibilidade: código antigo (MULTI desligado, nomes sem schema) continua achando as tabelas que vão para "base".
-- Vale só para conexões NOVAS: logo abaixo derrubamos as conexões do app abertas antes deste passo.
ALTER ROLE :"app_role" SET search_path = ruah, base, extensions;

COMMIT;

-- Conexões do app abertas ANTES deste passo ainda têm o search_path antigo (ruah, extensions) e, depois do passo 2,
-- não achariam as tabelas movidas. Derruba essas conexões agora; o pool/pooler reabre com o search_path novo.
-- (Precisa de superusuário ou de pg_signal_backend; no Supabase o papel postgres tem. Pule com -v derrubar=0.)
\if :{?derrubar}
\else
  \set derrubar 1
\endif
SELECT set_config('migracao.derrubar', :'derrubar', false);
DO $$
DECLARE n int := 0;
BEGIN
  IF current_setting('migracao.derrubar') <> '1' THEN RAISE NOTICE 'derrubar=0: conexões do app mantidas'; RETURN; END IF;
  SELECT count(*) FILTER (WHERE pg_terminate_backend(pid)) INTO n
    FROM pg_stat_activity
   WHERE usename = current_setting('migracao.app_role') AND pid <> pg_backend_pid() AND datname = current_database();
  RAISE NOTICE 'conexões do app derrubadas para pegar o search_path novo: %', n;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'sem permissão para derrubar conexões do app: reinicie o app (ou espere o pool renovar) antes do passo 2';
END $$;

\echo '== 01-preparar: ok'
SELECT chave, valor FROM base._migracao_fase1 ORDER BY chave;
