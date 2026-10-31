-- Páginas de bairros (27/10/2026): aplicado no Supabase (schema base) como migração base_bairros.
SET search_path = base, extensions;
CREATE TABLE IF NOT EXISTS bairros (
  slug text PRIMARY KEY, nome text NOT NULL, regiao text, apelidos text, prioridade integer NOT NULL DEFAULT 0,
  oculto integer NOT NULL DEFAULT 0, notas text, pedido_em text, origem text, lat double precision, lon double precision,
  criado_em text NOT NULL DEFAULT base.agora(), atualizado_em text
);
CREATE TABLE IF NOT EXISTS bairro_commons (
  titulo text PRIMARY KEY, url text, thumb text, largura integer, altura integer, autor text, licenca text, descricao text,
  ok integer NOT NULL DEFAULT 0, motivo text, verificado_em text NOT NULL DEFAULT base.agora()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON base.bairros, base.bairro_commons TO base_app;
