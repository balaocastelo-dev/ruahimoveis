-- Assistente "Nova imobiliária" com o Herrera (avatar de treinamento), 29/10/2026.
--  * plataforma.imobiliarias.onboarding: em que passo da configuração cada imobiliária está (o painel mostra "6/10");
--  * plataforma.definir_config: o assistente grava na configuração da imobiliária só as chaves que ele mesmo testou
--    (a chave do Gemini, já cifrada pelo servidor, e a chave do Google Maps). Nenhuma outra chave pode ser escrita.
--  * plataforma.numeros ganha "social_redes": quais redes a imobiliária já conectou (instagram, facebook, google).

ALTER TABLE plataforma.imobiliarias ADD COLUMN IF NOT EXISTS onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION plataforma.definir_config(p_schema text, p_chave text, p_valor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plataforma.imobiliarias WHERE slug = p_schema) THEN RAISE EXCEPTION 'imobiliária desconhecida'; END IF;
  IF p_chave NOT IN ('escritorio_ia', 'google_maps_chave') THEN RAISE EXCEPTION 'chave não permitida'; END IF;
  IF p_valor IS NULL OR length(p_valor) > 4000 THEN RAISE EXCEPTION 'valor inválido'; END IF;
  EXECUTE format('INSERT INTO %I.config(chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor', p_schema)
    USING p_chave, p_valor;
END $f$;
REVOKE ALL ON FUNCTION plataforma.definir_config(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.definir_config(text, text, text) TO plataforma_app;
GRANT UPDATE (onboarding) ON plataforma.imobiliarias TO plataforma_app;

-- Que configurações a imobiliária já tem (só sim/não: nunca devolve as chaves).
CREATE OR REPLACE FUNCTION plataforma.configurado(p_schema text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plataforma.imobiliarias WHERE slug = p_schema) THEN RAISE EXCEPTION 'imobiliária desconhecida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_schema) THEN RETURN '{}'::jsonb; END IF;
  EXECUTE format($q$SELECT jsonb_build_object(
      'gemini', EXISTS (SELECT 1 FROM %1$I.config WHERE chave = 'escritorio_ia' AND valor LIKE '%%"chave"%%'),
      'google_maps', EXISTS (SELECT 1 FROM %1$I.config WHERE chave = 'google_maps_chave' AND length(valor) > 20),
      'redes', (SELECT coalesce(jsonb_agg(DISTINCT rede), '[]'::jsonb) FROM %1$I.social_contas WHERE ativo = 1),
      'linhas_whatsapp', (SELECT count(*) FROM %1$I.config WHERE (chave LIKE 'agente_wa:%%' OR chave LIKE 'estacao_wa:%%') AND valor LIKE '%%conectad%%'),
      'usuarios', (SELECT count(*) FROM %1$I.usuarios WHERE ativo = 1),
      'imoveis', (SELECT count(*) FROM %1$I.imoveis))$q$, p_schema) INTO r;
  RETURN r;
END $f$;
REVOKE ALL ON FUNCTION plataforma.configurado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.configurado(text) TO plataforma_app;
