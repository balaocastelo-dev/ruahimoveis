// Os imoveis da Caixa: a lista publica de imoveis retomados que a Caixa republica todo dia.
// Mora em "base" e cada imobiliaria enxerga por uma view, igual aos condominios.
//
// Nao ha re-leitura de anuncio aqui: a lista da Caixa e uma foto completa do dia, entao
// quem estava na safra de ontem e sumiu hoje saiu da lista -- vendido, arrematado ou
// retirado. O importador marca isso em saiu_em, e esta tela so le o resultado.
const express = require('express');
const { all, one, run } = require('../db');
const fachada = require('../condominios/fachada');
const { int } = require('../util');

const r = express.Router();

const POR_PAGINA = 60;
const ORDENS = {
  desconto: 'desconto desc nulls last, preco asc',
  barato: 'preco asc nulls last',
  caro: 'preco desc nulls last',
  area: 'area_util desc nulls last',
  recentes: 'primeira_safra desc, desconto desc nulls last',
  financia: "(financiamento = 'Sim') desc, desconto desc nulls last",
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
  // A entrada de 5% e obrigatoria para qualquer imovel da Caixa (regras da Venda
  // Online, item 8.2.2), entao ela nao separa nada. O que separa e aceitar
  // financiamento: sao poucos, e sao os unicos vendaveis para quem nao tem o
  // dinheiro na mao.
  if (q.fin === '1') w.push("financiamento = 'Sim'");
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
  modalidade, financiamento, link, descricao, primeira_safra, ultima_safra, saiu_em,
  lat, lon, geo_precisao`;

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
            count(*) filter (where financiamento = 'Sim') financiaveis,
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
    financiaveis: one(`SELECT count(*) n FROM caixa_imoveis WHERE ${onde} AND financiamento = 'Sim'`).n,
    fotos: fachada.ligado(), // sem a chave do Google nao ha fachada: a tela mostra o link do Street View
    safra: (one('SELECT max(ultima_safra) s FROM caixa_imoveis') || {}).s || null,
  });
});

// Foto do imovel.
//
// A propria Caixa publica uma foto de cada imovel, em
// venda-imoveis.caixa.gov.br/fotos/F<numero>21.jpg. E a foto do imovel de verdade,
// nao uma aproximacao, entao vem primeiro. So quando ela nao existe e que entra o
// Street View -- e mesmo assim apenas para quem foi localizado no numero da casa,
// porque com precisao de rua a foto seria a do vizinho, e foto errada e pior que
// foto nenhuma.
//
// Cada imagem e buscada uma vez e fica guardada em base.fachadas, que ja e
// compartilhada por todas as imobiliarias. Guardar (em vez de apontar direto para o
// site da Caixa) tambem faz a foto continuar existindo depois que o imovel sai da
// lista, que e justamente quando ela serve de prova do que foi negociado.
const CAIXA_FOTO = (numero) => `https://venda-imoveis.caixa.gov.br/fotos/F${numero}21.jpg`;
const UA = { 'User-Agent': 'HerreraHouseIA/1.0 (+https://corretordofuturo.app)', Accept: 'image/*' };

async function daCaixa(numero) {
  const r = await fetch(CAIXA_FOTO(numero), { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const tipo = String(r.headers.get('content-type') || '');
  if (!/^image\//.test(tipo)) return null;
  const img = Buffer.from(await r.arrayBuffer());
  return img.length > 1500 ? img : null; // imagem minuscula costuma ser "sem foto"
}

r.get('/caixa/:numero/foto', async (req, res) => {
  const numero = String(req.params.numero || '').replace(/\D/g, '').slice(0, 20);
  if (!numero) return res.status(404).end();
  const envia = (img) => {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=604800');
    res.end(img);
  };

  const ja = one('SELECT img FROM fachadas WHERE ref=?', 'caixa:' + numero);
  if (ja) return ja.img ? envia(Buffer.from(ja.img)) : res.status(404).end();

  const im = one('SELECT numero, lat, lon, geo_precisao FROM caixa_imoveis WHERE numero = ?', numero);
  if (!im) return res.status(404).end();

  let img = null;
  try { img = await daCaixa(numero); } catch { /* site fora do ar: tenta a reserva */ }

  if (!img && im.geo_precisao === 'numero' && im.lat) {
    try { img = await fachada.foto('caixa-sv:' + numero, im.lat, im.lon); } catch { img = null; }
  }

  if (!img) {
    // marca que ja procuramos, para nao bater no site da Caixa a cada visita
    run('INSERT INTO fachadas(ref,img) VALUES(?,NULL) ON CONFLICT(ref) DO NOTHING', 'caixa:' + numero);
    return res.status(404).end();
  }
  run('INSERT INTO fachadas(ref,img) VALUES(?,?) ON CONFLICT(ref) DO UPDATE SET img=excluded.img', 'caixa:' + numero, img);
  envia(img);
});

module.exports = r;