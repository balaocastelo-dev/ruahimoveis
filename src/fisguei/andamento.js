// Andamento do anúncio: o que CADA imobiliária faz com um anúncio da base comum (fisguei_anuncios).
// O anúncio (portal, endereço, preço, fotos, condomínio) é igual para todas; status, pausado, oportunidade_id,
// imovel_id e observacoes são trabalho da imobiliária e ficam na tabela privada anuncio_andamento.
// Sem linha no andamento = anúncio 'novo', não pausado, sem oportunidade nem imóvel.
//
// Leitura: FROM fisguei_anuncios a ${JOIN} … usando ${STATUS}, ${PAUSADO}, d.oportunidade_id, d.imovel_id.
// Escrita: muda(id, 'status=?', ['captado']) — cria a linha se faltar e atualiza.
const { one, run } = require('../db');

const JOIN = 'LEFT JOIN anuncio_andamento d ON d.anuncio_id=a.id';
const STATUS = "coalesce(d.status,'novo')";
const PAUSADO = 'coalesce(d.pausado,0)';
// quando mexeu por último: no anúncio (chegou do Fisgar) ou no andamento (trabalho da imobiliária). Sem greatest/max:
// funciona igual no SQLite e no Postgres (NULL na comparação cai no do anúncio).
const ATUALIZADO = 'CASE WHEN d.atualizado_em > a.atualizado_em THEN d.atualizado_em ELSE a.atualizado_em END';
const COLS = `${STATUS} AS status, ${PAUSADO} AS pausado, d.oportunidade_id, d.imovel_id, d.observacoes`;
// colunas do anúncio comum (sem as antigas colunas de trabalho, que ficaram sem uso)
const COMUNS = ['id', 'fisgar_id', 'portal', 'link', 'titulo', 'tipo', 'negocio', 'finalidade', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep',
  'lat', 'lon', 'valor', 'valor_condominio', 'iptu', 'quartos', 'suites', 'banheiros', 'vagas', 'area_util', 'area_total', 'anunciante_nome', 'anunciante_tipo',
  'publicado_em', 'fotos', 'criado_em', 'cond_checado', 'condominio_id', 'anunciado_desde'];
// equivalente a "SELECT * FROM fisguei_anuncios", já com o andamento da imobiliária
const TUDO = `${COMUNS.map((c) => 'a.' + c).join(', ')}, ${COLS}, ${ATUALIZADO} AS atualizado_em`;

const um = (id) => one(`SELECT ${TUDO} FROM fisguei_anuncios a ${JOIN} WHERE a.id=?`, id);

// Atualiza o andamento (cria a linha antes, se ainda não existir). sets: "status=?, pausado=?" (pode ser vazio, só
// marca atualizado_em); onde: condição extra sobre a linha do andamento (ex.: "AND status IN ('abordando')").
function muda(anuncioId, sets = '', params = [], onde = '', paramsOnde = []) {
  run('INSERT INTO anuncio_andamento(anuncio_id) VALUES(?) ON CONFLICT(anuncio_id) DO NOTHING', anuncioId);
  return run(`UPDATE anuncio_andamento SET ${sets ? sets + ', ' : ''}atualizado_em=datetime('now','localtime') WHERE anuncio_id=? ${onde}`, ...params, anuncioId, ...paramsOnde);
}

module.exports = { JOIN, STATUS, PAUSADO, ATUALIZADO, COLS, COMUNS, TUDO, um, muda };
