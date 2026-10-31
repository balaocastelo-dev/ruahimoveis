-- OPCIONAL e separado da migração da base. NÃO rode isto junto com o deploy.
-- NÃO apaga schema, tabela, condomínio, anúncio, imóvel, lead nem usuário.
--
-- Só tira o CADASTRO da imobiliária cujo slug é ruah em plataforma.imobiliarias
-- e os eventos do painel do gestor ligados a esse id.
--
-- Não dê DROP SCHEMA base. Depois de sql/migrar-schema-ruah-para-base.sql esse
-- schema é a base comum (condomínios, 3D, fachadas, anúncios). As linhas
-- operacionais que nasceram nesse schema foram junto no rename e continuam lá
-- até você decidir, fora deste arquivo.
--
-- Se alguma matéria do banco foi entregue a esse slug, o DELETE do cadastro
-- falha de propósito: plataforma.materias não é apagada.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plataforma.materias WHERE entregue_a = 'ruah') THEN
    RAISE EXCEPTION 'há matérias entregues ao slug ruah; este script não apaga matéria. Nada foi alterado.';
  END IF;
END $$;

DELETE FROM plataforma.eventos
 WHERE imobiliaria_id IN (SELECT id FROM plataforma.imobiliarias WHERE slug = 'ruah');

DELETE FROM plataforma.imobiliarias WHERE slug = 'ruah';

COMMIT;
