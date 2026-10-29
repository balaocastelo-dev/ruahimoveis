-- Estação central dos PCs virtuais (29/10/2026). Mesma ideia da chave de IA central: o Thiago mantém UMA
-- chave da estação na plataforma e toda imobiliária usa de graça, sem configurar nada. Aplicar uma vez.
--
-- A chave fica em plataforma.config ('estacao_chave'), lida pelo plataforma_app que toda imobiliária já usa
-- (PLATAFORMA_DATABASE_URL). Nunca sai numa rota: a tela do escritório só diz se a estação está ligada.
-- Quem já tem chave própria (gerada na tela) continua com a dela — a própria tem prioridade.
BEGIN;
SET LOCAL search_path = plataforma;

CREATE OR REPLACE FUNCTION plataforma.definir_estacao_central(p_chave text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'plataforma'
AS $function$
DECLARE v_chave text := nullif(btrim(p_chave), '');
BEGIN
  IF v_chave IS NOT NULL AND v_chave !~ '^est_[A-Za-z0-9_-]{20,200}$' THEN
    RAISE EXCEPTION 'isso nao parece uma chave de estacao (est_...)';
  END IF;
  IF v_chave IS NULL THEN
    DELETE FROM config WHERE chave = 'estacao_chave';
  ELSE
    INSERT INTO config (chave, valor) VALUES ('estacao_chave', v_chave)
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
  END IF;
  RETURN coalesce('...' || right(v_chave, 4), 'removida');
END $function$;

REVOKE ALL ON FUNCTION plataforma.definir_estacao_central(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION plataforma.definir_estacao_central(text) TO plataforma_app;

COMMIT;

-- Como a imobiliária enxerga esta chave: pelo PLATAFORMA_DATABASE_URL quando o projeto tem essa variável
-- (hoje só "ruahimoveis") ou, sem ela, pela própria conexão, por plataforma.cofre_central() —
-- ver sql/plataforma-cofre-central.sql. Nenhuma variável nova é necessária nos projetos.
