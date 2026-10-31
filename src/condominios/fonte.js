// Condomínio lançado no cadastro da imobiliária (não veio do CNPJ nem do mapa).
// 'ruah' é o valor gravado antes da base comum deixar de usar esse nome.
// sql/migrar-schema-ruah-para-base.sql troca o valor antigo por 'cadastro'. Até lá, os dois valem.
const FONTE_CASA = 'cadastro';
const fonteDaCasa = (f) => f === FONTE_CASA || f === 'ruah';

module.exports = { FONTE_CASA, fonteDaCasa };
