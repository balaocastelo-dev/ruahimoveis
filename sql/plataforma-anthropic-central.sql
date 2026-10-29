-- Chave da Anthropic (Claude) no cofre central (29/10/2026, pedido do Thiago: "vamos usar a chave da
-- Anthropic também"). Mesma ideia da chave do Gemini: uma só, da plataforma, de graça para a imobiliária.
--
-- Cofre: plataforma.config — 'ia_central_anthropic' e 'ia_central_anthropic_modelo' (claude-sonnet-5-5).
-- 'ia_central_preferido' ('anthropic' | 'gemini') escolhe quem atende primeiro quando há os dois; vazio
-- significa Claude primeiro, com o Gemini de reserva automática (src/agentes/ia.js).
BEGIN;

CREATE OR REPLACE FUNCTION plataforma.definir_ia_central_anthropic(p_chave text, p_modelo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'plataforma'
AS $function$
DECLARE v_chave text := nullif(btrim(p_chave), '');
BEGIN
  IF v_chave IS NOT NULL AND v_chave !~ '^sk-ant-[A-Za-z0-9_-]{20,250}$' THEN
    RAISE EXCEPTION 'isso nao parece uma chave da Anthropic (sk-ant-...)';
  END IF;
  IF v_chave IS NULL THEN
    DELETE FROM config WHERE chave = 'ia_central_anthropic';
  ELSE
    INSERT INTO config (chave, valor) VALUES ('ia_central_anthropic', v_chave)
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
  END IF;
  IF nullif(btrim(p_modelo), '') IS NOT NULL THEN
    INSERT INTO config (chave, valor) VALUES ('ia_central_anthropic_modelo', btrim(p_modelo))
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
  END IF;
  RETURN coalesce('...' || right(v_chave, 4), 'removida');
END $function$;

REVOKE ALL ON FUNCTION plataforma.definir_ia_central_anthropic(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION plataforma.definir_ia_central_anthropic(text, text) TO plataforma_app;

-- O cofre que as imobiliárias leem passa a entregar também as chaves novas (ver plataforma-cofre-central.sql).
CREATE OR REPLACE FUNCTION plataforma.cofre_central()
RETURNS TABLE (chave text, valor text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'plataforma'
AS $$
  SELECT c.chave, c.valor FROM config c
   WHERE c.chave IN ('ia_central', 'ia_central_modelo', 'estacao_chave',
                     'ia_central_anthropic', 'ia_central_anthropic_modelo', 'ia_central_preferido')
$$;
GRANT EXECUTE ON FUNCTION plataforma.cofre_central() TO ruah_app, ondemorar_app, cademeuap_app, casaprado_app, lumen_app, plataforma_app;

COMMIT;

-- Para trocar a chave depois (do PC, sem ela passar por lugar nenhum além do banco):
--   node -e "require('./src/config');const{Pool}=require('pg');const p=new Pool({connectionString:process.env.PLATAFORMA_DATABASE_URL.replace(/[?&]sslmode=[^&]*/,''),ssl:{rejectUnauthorized:false}});p.query('SELECT plataforma.definir_ia_central_anthropic($1,$2)',[process.argv[1],'claude-sonnet-5-5']).then(r=>console.log(r.rows[0])).finally(()=>p.end())" sk-ant-...
