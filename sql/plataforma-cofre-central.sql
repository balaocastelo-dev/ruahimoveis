-- Cofre central sem variável nova no projeto (29/10/2026).
--
-- Problema: central.js só lia o cofre pelo PLATAFORMA_DATABASE_URL, e essa variável existe só no projeto
-- "o repositório da plataforma". Resultado: nenhuma imobiliária enxergava a chave de IA central nem a chave da estação.
--
-- Solução: todos os schemas moram no mesmo Postgres, então a imobiliária lê o cofre pela PRÓPRIA conexão,
-- por duas funções SECURITY DEFINER que entregam só o necessário:
--   plataforma.cofre_central()  -> as três chaves centrais (e nada mais de plataforma.config)
--   plataforma.anota_ia_uso(..) -> soma o consumo; de quem é o gasto vem do usuário do banco
--                                  (ondemorar_app -> ondemorar), então ninguém lança no nome de outra.
-- A tabela plataforma.config e a plataforma.ia_uso continuam invisíveis para os papéis das imobiliárias.
-- Aplicar uma vez; repetir o GRANT para cada imobiliária nova (ou no painel do gestor, ao criar o schema).
BEGIN;

CREATE OR REPLACE FUNCTION plataforma.cofre_central()
RETURNS TABLE (chave text, valor text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'plataforma'
AS $$
  SELECT c.chave, c.valor FROM config c
   WHERE c.chave IN ('ia_central', 'ia_central_modelo', 'estacao_chave')
$$;

CREATE OR REPLACE FUNCTION plataforma.anota_ia_uso(p_modelo text, p_entrada integer DEFAULT 0, p_saida integer DEFAULT 0, p_erro boolean DEFAULT false, p_imobiliaria text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'plataforma'
AS $function$
DECLARE
  -- Papel de imobiliária (ondemorar_app): de quem é o gasto vem do próprio usuário do banco, sem como mentir.
  -- Conexões da plataforma (plataforma_app) ou do PC (postgres) dizem a imobiliária no parâmetro.
  v_slug text := CASE
    WHEN current_user::text <> 'plataforma_app' AND current_user::text ~ '_app$'
      THEN regexp_replace(current_user::text, '_app$', '')
    ELSE coalesce(nullif(btrim(p_imobiliaria), ''), 'desconhecido') END;
BEGIN
  INSERT INTO ia_uso (imobiliaria, dia, modelo, chamadas, tokens_entrada, tokens_saida, erros)
  VALUES (v_slug, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
          coalesce(nullif(btrim(p_modelo), ''), 'desconhecido'),
          1, greatest(0, coalesce(p_entrada, 0)), greatest(0, coalesce(p_saida, 0)), CASE WHEN p_erro THEN 1 ELSE 0 END)
  ON CONFLICT (imobiliaria, dia, modelo) DO UPDATE SET
    chamadas = ia_uso.chamadas + 1,
    tokens_entrada = ia_uso.tokens_entrada + EXCLUDED.tokens_entrada,
    tokens_saida = ia_uso.tokens_saida + EXCLUDED.tokens_saida,
    erros = ia_uso.erros + EXCLUDED.erros,
    atualizado_em = now();
END $function$;

REVOKE ALL ON FUNCTION plataforma.cofre_central() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION plataforma.anota_ia_uso(text, integer, integer, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA plataforma TO base_app, ondemorar_app, cademeuap_app, casaprado_app, lumen_app;
GRANT EXECUTE ON FUNCTION plataforma.cofre_central() TO base_app, ondemorar_app, cademeuap_app, casaprado_app, lumen_app, plataforma_app;
GRANT EXECUTE ON FUNCTION plataforma.anota_ia_uso(text, integer, integer, boolean, text) TO base_app, ondemorar_app, cademeuap_app, casaprado_app, lumen_app, plataforma_app;

COMMIT;

-- Aplicado em 29/10/2026. Falta só apagar a linha de teste daquele dia (o Supabase pediu confirmação e
-- ninguém respondeu):  DELETE FROM plataforma.ia_uso WHERE modelo = 'teste-cofre';
