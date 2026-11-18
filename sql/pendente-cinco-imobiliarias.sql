-- Cinco imobiliárias no ar. NÃO EXECUTAR sem o OK do Thiago.
-- Não apaga imóvel, não apaga schema e não aplica a migração de schema
-- que o dono ainda não autorizou (o arquivo dela continua intocado).
-- É idempotente: rodar de novo não duplica o cadastro da L7.
--
-- O portal voltou a abrir sem este arquivo. /imoveis quebrava porque o código
-- pedia a coluna imoveis.origem, que este banco ainda não tem. O código deixou
-- de pedi-la. sql/imoveis-origem.sql segue disponível para um OK separado,
-- quando o CRM for reconhecer imóvel vindo de fonte pública.
--
-- /oportunidades responde mesmo sem a view. Para a lista da Caixa aparecer
-- de verdade, o passo (ainda pendente, no mesmo OK) é rodar
-- sql/caixa-view-nos-esquemas.sql — ele só recria VIEW, não tabela.

-- 1) Garante o cadastro da L7 Inteligência Imobiliária, se a tabela existir
--    e o slug ainda não estiver lá. Não cria schema nem usuário de banco.
DO $$
BEGIN
  IF to_regclass('plataforma.imobiliarias') IS NULL THEN
    RAISE NOTICE 'plataforma.imobiliarias ainda não existe: nada foi gravado';
    RETURN;
  END IF;
  INSERT INTO plataforma.imobiliarias (slug, nome, empresa, link, dominio, vercel_projeto, plano, situacao, publicada)
  SELECT 'l7inteligencia', 'L7 Inteligência Imobiliária', 'L7 Inteligência Imobiliária',
         'https://l7inteligencia.corretordofuturo.app', 'l7inteligencia.corretordofuturo.app',
         'imob-l7inteligencia', 'essencial', 'ativa', 1
  WHERE NOT EXISTS (SELECT 1 FROM plataforma.imobiliarias WHERE slug = 'l7inteligencia');
END $$;

-- 2) As outras três L7 saem do produto no código. Tirar o projeto da Vercel,
--    o domínio e a linha daqui é outro passo, comentado de propósito.
--    Não rode o bloco abaixo junto com o INSERT sem ler o PR.
--
-- UPDATE plataforma.imobiliarias
--    SET situacao = 'suspensa',
--        notas = trim(coalesce(notas, '') || ' Retirada em 2026-11: ficou uma só L7, a Inteligência Imobiliária.'),
--        atualizado_em = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
--  WHERE slug IN ('l7minhacasa', 'l7loteamentos', 'l7altopadrao');
--
-- Dropar o schema (l7minhacasa, l7loteamentos, l7altopadrao) apaga a carteira
-- daquela linha. Só depois de conferir que não há dado para guardar, e num OK
-- explícito:
--   DROP SCHEMA IF EXISTS l7minhacasa CASCADE;
--   DROP SCHEMA IF EXISTS l7loteamentos CASCADE;
--   DROP SCHEMA IF EXISTS l7altopadrao CASCADE;
