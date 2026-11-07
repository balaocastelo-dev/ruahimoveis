// Os imoveis da Caixa: a lista publica de imoveis retomados que a Caixa republica todo dia.
// Mora em "base" e cada imobiliaria enxerga por uma view, igual aos condominios.
//
// Nao ha re-leitura de anuncio aqui: a lista da Caixa e uma foto completa do dia, entao
// quem estava na safra de ontem e sumiu hoje saiu da lista -- vendido, arrematado ou
// retirado. O importador marca isso em saiu_em, e esta tela so le o resultado.
const express = require('express');
const { all, one } = require('../db');
const { int } = require('../util');

const r = express.Router();

const POR_PAGINA = 60;
const ORDENS = {
  desconto: 'desconto desc nulls last, preco asc',
  barato: 'preco asc nulls last',
  caro: 'preco desc nulls last',
  area: 'area_util desc nulls last',
  recentes: 'primeira_safra desc, desconto desc nulls last',
  saida: 'saiu_em desc nulls last',
};

/** Monta o WHERE a partir do que veio na barra de filtros. */
function filtro(q) {
  const w = [];
  const p = [];
  // Fora da RMC a lista vira o estado inteiro; por padrao fica so a regiao dele.
  if (q.uf !== 'sp') w.push('na_rmc');
  w.push(q.saiu === '1' ? 'saiu_em is not null' : 'saiu_em is null');
  if (q.cidade) { w.push('cidade = ?'); p.push(String(q.cidade).slice(0, 60)); }
  if (q.tipo) { w.push('tipo = ?'); p.push(String(q.tipo).slice(0, 30)); }
  if (q.modalidade) { w.push('modalidade = ?'); p.push(String(q.modalidade).slice(0, 60)); }
  const desc = Number(q.desconto) || 0;
  if (desc > 0) { w.push('desconto >= ?'); p.push(desc); }
  const max = Number(q.max) || 0;
  if (max > 0) { w.push('preco <= ?'); p.push(max); }
  const min = Number(q.min) || 0;
  if (min > 0) { w.push('preco >= ?'); p.push(min); }
  const quartos = int(q.quartos);
  if (quartos > 0) { w.push('quartos >= ?'); p.push(quartos); }
  const busca = String(q.q || '').trim().slice(0, 60);
  if (busca) {
    w.push('(bairro LIKE ? OR endereco LIKE ? OR numero LIKE ?)');
    p.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  return { onde: w.join(' AND '), p };
}

const CAMPOS = `numero, cidade, bairro, endereco, tipo, quartos, vagas,
  area_util::float8 area_util, area_terreno::float8 area_terreno,
  preco::float8 preco, avaliacao::float8 avaliacao, desconto::float8 desconto,
  modalidade, financiamento, link, descricao, primeira_safra, ultima_safra, saiu_em`;

r.get('/caixa', (req, res) => {
  const q = req.query || {};
  const { onde, p } = filtro(q);
  const ordem = ORDENS[q.ordem] || (q.saiu === '1' ? ORDENS.saida : ORDENS.desconto);
  const pagina = Math.max(1, int(q.pagina) || 1);

  const total = one(`SELECT count(*) n FROM caixa_imoveis WHERE ${onde}`, ...p).n;
  const itens = all(
    `SELECT ${CAMPOS} FROM caixa_imoveis WHERE ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`,
    ...p, POR_PAGINA, (pagina - 1) * POR_PAGINA,
  );

  // O resumo e das linhas filtradas, nao da pagina: e o que responde "vale a pena olhar isso?".
  const resumo = one(
    `SELECT count(*) n, round(avg(nullif(desconto, 0))::numeric, 1)::float8 desconto_medio,
            max(desconto)::float8 desconto_maior, min(preco)::float8 menor,
            count(*) filter (where desconto > 0) com_desconto,
            sum(greatest(coalesce(avaliacao,0) - coalesce(preco,0), 0))::float8 abatimento
       FROM caixa_imoveis WHERE ${onde}`, ...p);

  res.json({ total, pagina, por_pagina: POR_PAGINA, itens, resumo });
});

// As opcoes da barra de filtros saem dos dados, nao de uma lista fixa: cidade que
// nao tem imovel nenhum nao aparece.
r.get('/caixa/opcoes', (req, res) => {
  const rmc = (req.query || {}).uf !== 'sp' ? 'na_rmc AND ' : '';
  const onde = `${rmc}saiu_em is null`;
  res.json({
    cidades: all(`SELECT cidade nome, count(*) n FROM caixa_imoveis WHERE ${onde} AND cidade <> '' GROUP BY cidade ORDER BY n DESC, cidade`),
    tipos: all(`SELECT tipo nome, count(*) n FROM caixa_imoveis WHERE ${onde} AND tipo IS NOT NULL GROUP BY tipo ORDER BY n DESC`),
    modalidades: all(`SELECT modalidade nome, count(*) n FROM caixa_imoveis WHERE ${onde} AND modalidade <> '' GROUP BY modalidade ORDER BY n DESC`),
    estado: one('SELECT count(*) n FROM caixa_imoveis WHERE saiu_em is null').n,
    regiao: one('SELECT count(*) n FROM caixa_imoveis WHERE saiu_em is null AND na_rmc').n,
    sairam: one('SELECT count(*) n FROM caixa_imoveis WHERE saiu_em is not null').n,
    safra: (one('SELECT max(ultima_safra) s FROM caixa_imoveis') || {}).s || null,
  });
});

module.exports = r;