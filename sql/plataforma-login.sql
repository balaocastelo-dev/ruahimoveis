-- Entrada única da plataforma (app.corretordofuturo.app): a pessoa digita e-mail e senha uma vez,
-- o servidor descobre de qual imobiliária ela é e a manda já logada para o sistema dela.
-- O usuário plataforma_app continua sem ler as tabelas das imobiliárias: só chama estas duas funções.
-- Só entram imobiliárias ativas e publicadas (suspensa ou fora do ar não aparece).

CREATE OR REPLACE FUNCTION plataforma.login_busca(p_email text)
RETURNS TABLE(imobiliaria_id int, slug text, nome text, link text, usuario_id int, usuario_nome text, senha_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, plataforma AS $$
DECLARE r record;
BEGIN
  IF p_email IS NULL OR length(p_email) > 200 OR position('@' IN p_email) = 0 THEN RETURN; END IF;
  FOR r IN SELECT i.id, i.slug, i.nome, i.link FROM plataforma.imobiliarias i
           WHERE i.situacao = 'ativa' AND i.publicada = 1 AND i.link ~ '^https://'
             AND EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = i.slug) ORDER BY i.id LOOP
    RETURN QUERY EXECUTE format(
      'SELECT $1::int, $2::text, $3::text, $4::text, u.id::int, u.nome::text, u.senha_hash::text
         FROM %I.usuarios u WHERE lower(u.email::text) = lower($5) AND u.ativo = 1', r.slug)
      USING r.id, r.slug, r.nome, r.link, p_email;
  END LOOP;
END $$;

-- Passe de entrada de 2 minutos na imobiliária escolhida; o sistema dela troca por uma sessão normal em /entrar-pela-plataforma.
CREATE OR REPLACE FUNCTION plataforma.login_entrega(p_imobiliaria_id int, p_usuario_id int, p_token_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, plataforma AS $$
DECLARE s text; ok int;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  SELECT i.slug INTO s FROM plataforma.imobiliarias i WHERE i.id = p_imobiliaria_id AND i.situacao = 'ativa' AND i.publicada = 1;
  IF s IS NULL THEN RETURN false; END IF;
  EXECUTE format('SELECT count(*) FROM %I.usuarios WHERE id = $1 AND ativo = 1', s) INTO ok USING p_usuario_id;
  IF ok <> 1 THEN RETURN false; END IF;
  EXECUTE format('INSERT INTO %I.sessoes(token_hash, usuario_id, expira_em) VALUES ($1, $2, $3)', s)
    USING 'passe:' || p_token_hash, p_usuario_id, (extract(epoch FROM now()) * 1000)::bigint + 120000;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION plataforma.login_busca(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION plataforma.login_entrega(int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.login_busca(text) TO plataforma_app;
GRANT EXECUTE ON FUNCTION plataforma.login_entrega(int, int, text) TO plataforma_app;
