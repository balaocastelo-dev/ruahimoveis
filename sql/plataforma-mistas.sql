-- Plataforma multi-imobiliária · tabelas mistas (etapas 4 e 8). NÃO APLICADO: rodar no Supabase junto com a migração
-- da plataforma, com o sistema parado (ou logo antes de publicar a versão que lê estas tabelas).
--
-- O que cada imobiliária faz sobre um dado COMUM vai para uma tabela PRIVADA dela:
--   fisguei_anuncios.status/pausado/oportunidade_id/imovel_id/observacoes → anuncio_andamento
--   condominios.alvo                                                      → condominio_alvos
--   bairros.prioridade/oculto/notas/pedido_em                             → bairro_ajustes
-- As colunas antigas ficam onde estão, sem uso (só para permitir voltar a versão anterior do sistema).
--
-- Hoje tudo mora no schema ruah (RUAH = imobiliária padrão). Depois da migração para o schema "base", as tabelas comuns
-- citadas aqui (fisguei_anuncios, condominios, bairros) passam a ser base.x: troque o search_path para "ruah, base".
-- Para uma imobiliária nova, rode só as partes 1 a 3 com search_path = "<schema dela>", base (ela começa vazia).
SET search_path = ruah, extensions;

-- 1) andamento do anúncio (privada)
CREATE TABLE IF NOT EXISTS anuncio_andamento (
  anuncio_id integer PRIMARY KEY REFERENCES fisguei_anuncios(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'novo',
  pausado integer NOT NULL DEFAULT 0,
  oportunidade_id integer REFERENCES oportunidades(id) ON DELETE SET NULL,
  imovel_id integer REFERENCES imoveis(id) ON DELETE SET NULL,
  observacoes text,
  atualizado_em text
);
CREATE INDEX IF NOT EXISTS ix_and_status ON anuncio_andamento(status);
CREATE INDEX IF NOT EXISTS ix_and_oport ON anuncio_andamento(oportunidade_id) WHERE oportunidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_and_imovel ON anuncio_andamento(imovel_id) WHERE imovel_id IS NOT NULL;

-- 2) prédios-alvo (privada)
CREATE TABLE IF NOT EXISTS condominio_alvos (
  condominio_id integer PRIMARY KEY REFERENCES condominios(id) ON DELETE RESTRICT,
  criado_em text NOT NULL DEFAULT ruah.agora()
);

-- 3) ajustes de bairro (privada)
CREATE TABLE IF NOT EXISTS bairro_ajustes (
  slug text PRIMARY KEY REFERENCES bairros(slug) ON DELETE RESTRICT,
  prioridade integer NOT NULL DEFAULT 0, oculto integer NOT NULL DEFAULT 0, notas text, pedido_em text, atualizado_em text
);

-- 4) só na RUAH (dona dos dados que estão hoje nas colunas antigas): copia o trabalho para as privadas.
--    Sem linha no andamento o sistema entende "novo, não pausado", então só copia o que foge do padrão.
INSERT INTO anuncio_andamento(anuncio_id, status, pausado, oportunidade_id, imovel_id, observacoes, atualizado_em)
SELECT id, coalesce(status, 'novo'), coalesce(pausado, 0), oportunidade_id, imovel_id, observacoes, atualizado_em
FROM fisguei_anuncios
WHERE coalesce(status, 'novo') <> 'novo' OR coalesce(pausado, 0) <> 0 OR oportunidade_id IS NOT NULL OR imovel_id IS NOT NULL OR observacoes IS NOT NULL
ON CONFLICT (anuncio_id) DO NOTHING;

INSERT INTO condominio_alvos(condominio_id) SELECT id FROM condominios WHERE alvo = 1 ON CONFLICT (condominio_id) DO NOTHING;

INSERT INTO bairro_ajustes(slug, prioridade, oculto, notas, pedido_em, atualizado_em)
SELECT slug, prioridade, oculto, notas, pedido_em, atualizado_em FROM bairros
WHERE prioridade <> 0 OR oculto <> 0 OR notas IS NOT NULL OR pedido_em IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

-- o SQLite do PC usa esta marca para não copiar duas vezes; no Postgres fica registrada também
INSERT INTO config(chave, valor) VALUES ('plataforma_mistas_v1', ruah.agora()) ON CONFLICT (chave) DO NOTHING;

-- 5) apagar algo comum nunca destrói dado privado: pessoas e pedidos (privados) deixam de cair em cascata com o anúncio
ALTER TABLE fisguei_pessoas DROP CONSTRAINT IF EXISTS fisguei_pessoas_anuncio_id_fkey;
ALTER TABLE fisguei_pessoas ADD CONSTRAINT fisguei_pessoas_anuncio_id_fkey FOREIGN KEY (anuncio_id) REFERENCES fisguei_anuncios(id) ON DELETE RESTRICT;
ALTER TABLE fisguei_pedidos DROP CONSTRAINT IF EXISTS fisguei_pedidos_anuncio_id_fkey;
ALTER TABLE fisguei_pedidos ADD CONSTRAINT fisguei_pedidos_anuncio_id_fkey FOREIGN KEY (anuncio_id) REFERENCES fisguei_anuncios(id) ON DELETE RESTRICT;
-- (agente_midias.anuncio_id já é ON DELETE SET NULL: não apaga a foto do dono)

-- 6) colunas antigas: sem uso, marcadas para quem olhar o banco
COMMENT ON COLUMN fisguei_anuncios.status IS 'SEM USO desde as tabelas mistas: ver anuncio_andamento (privada). Mantida para voltar a versão.';
COMMENT ON COLUMN fisguei_anuncios.pausado IS 'SEM USO: ver anuncio_andamento.';
COMMENT ON COLUMN fisguei_anuncios.oportunidade_id IS 'SEM USO: ver anuncio_andamento.';
COMMENT ON COLUMN fisguei_anuncios.imovel_id IS 'SEM USO: ver anuncio_andamento.';
COMMENT ON COLUMN fisguei_anuncios.observacoes IS 'SEM USO: ver anuncio_andamento.';
COMMENT ON COLUMN condominios.alvo IS 'SEM USO: ver condominio_alvos (privada).';
COMMENT ON COLUMN bairros.prioridade IS 'SEM USO: ver bairro_ajustes (privada).';
COMMENT ON COLUMN bairros.oculto IS 'SEM USO: ver bairro_ajustes.';
COMMENT ON COLUMN bairros.notas IS 'SEM USO: ver bairro_ajustes.';
COMMENT ON COLUMN bairros.pedido_em IS 'SEM USO: ver bairro_ajustes.';

GRANT SELECT, INSERT, UPDATE, DELETE ON ruah.anuncio_andamento, ruah.condominio_alvos, ruah.bairro_ajustes TO ruah_app;
