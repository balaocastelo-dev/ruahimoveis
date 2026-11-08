-- Imovel vindo de fonte publica (Caixa, outro banco, edital) precisa ser
-- reconhecivel no CRM: de onde veio e qual e a referencia la na origem. E assim
-- que o sincronizador reencontra o mesmo imovel amanha, e que o painel separa o
-- que a casa captou do que ela so esta assessorando.
ALTER TABLE base.imoveis ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE base.imoveis ADD COLUMN IF NOT EXISTS origem_ref text;

DO $$
DECLARE s text;
BEGIN
  FOR s IN SELECT slug FROM plataforma.imobiliarias LOOP
    EXECUTE format('ALTER TABLE %I.imoveis ADD COLUMN IF NOT EXISTS origem text', s);
    EXECUTE format('ALTER TABLE %I.imoveis ADD COLUMN IF NOT EXISTS origem_ref text', s);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS ux_imoveis_origem ON %I.imoveis(origem, origem_ref) WHERE origem IS NOT NULL', s);
  END LOOP;
END $$;