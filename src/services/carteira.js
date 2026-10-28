// Carteira (imóveis em operação): em que etapa cada imóvel está, de onde veio e o que falta na ficha.
// Tudo é calculado a partir dos dados que já existem (proprietário, robô do Fisguei, assinatura, status), então não há
// coluna nova para manter em dia: o imóvel muda de etapa sozinho quando algo acontece.
const { all } = require('../db');
const cfg = require('../config');

const ETAPAS = [
  ['sem_dono', 'Sem dono'],
  ['localizado', 'Dono localizado'],
  ['em_contato', 'Em contato'],
  ['confirmado', 'Dono confirmou'],
  ['autorizado', 'Autorização assinada'],
  ['publicado', 'Publicado'],
  ['vendido', 'Vendido / alugado'],
];
const ORIGENS = [['fisgar', 'Fisgar'], ['radar', 'Portais (Radar)'], ['cadastro', 'Site / cadastro da equipe']];

function porIds(sql, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 400) {
    const parte = ids.slice(i, i + 400);
    out.push(...all(sql.replace('(?)', `(${parte.map(() => '?').join(',')})`), ...parte));
  }
  return out;
}
const descPropria = (d) => { const t = String(d || '').trim(); return t.length >= 120 && !/^(Veio da base|Importado do Fisguei)/.test(t); };

// lista: linhas de imoveis (com n_fotos quando houver). Devolve as mesmas linhas com etapa, origem, dono e ficha.
function enriquece(lista) {
  if (!lista.length) return lista;
  const ids = lista.map((i) => i.id);
  const donoIds = [...new Set(lista.map((i) => i.proprietario_id).filter(Boolean))];
  const donos = new Map(donoIds.length ? porIds('SELECT id, nome, telefone, origem_dado, nao_contatar FROM proprietarios WHERE id IN (?)', donoIds).map((d) => [d.id, d]) : []);
  const assin = new Map();
  for (const a of porIds('SELECT imovel_id, status FROM assinaturas WHERE imovel_id IN (?)', ids)) {
    const v = assin.get(a.imovel_id); if (a.status === 'assinado' || !v) assin.set(a.imovel_id, a.status);
  }
  const fg = new Map();
  for (const a of porIds(`SELECT a.imovel_id, a.id, a.fisgar_id,
      (SELECT count(*) FROM fisguei_pessoas p WHERE p.anuncio_id=a.id AND p.status='confirmou') AS conf,
      (SELECT count(*) FROM fisguei_pessoas p WHERE p.anuncio_id=a.id AND p.consultado=1) AS consultadas,
      (SELECT count(*) FROM fisguei_contatos c JOIN fisguei_pessoas p ON p.id=c.pessoa_id WHERE p.anuncio_id=a.id AND c.envio IN ('enviado','respondeu')) AS contato,
      (SELECT d.status FROM fisguei_pedidos d WHERE d.anuncio_id=a.id ORDER BY d.id DESC LIMIT 1) AS pedido
    FROM fisguei_anuncios a WHERE a.imovel_id IN (?)`, ids)) {
    const v = fg.get(a.imovel_id) || { ids: [], conf: 0, consultadas: 0, contato: 0, radar: false };
    v.ids.push(a.id); v.conf += Number(a.conf) || 0; v.consultadas += Number(a.consultadas) || 0; v.contato += Number(a.contato) || 0;
    if (String(a.fisgar_id || '').startsWith('op:')) v.radar = true;
    if (String(a.fisgar_id || '').startsWith('im:')) v.daCarteira = true; // registro criado só para buscar o dono pela carteira
    // busca de dono no Fisgar: a mais "viva" entre os anúncios do imóvel
    const PESO = { buscando: 5, fila: 4, escolher: 3, sem_resultado: 2, erro: 1, concluido: 0 };
    if (a.pedido && (!v.pedido || (PESO[a.pedido] ?? 0) > (PESO[v.pedido.status] ?? 0))) v.pedido = { status: a.pedido, anuncio_id: a.id };
    fg.set(a.imovel_id, v);
  }
  const op = new Set(porIds('SELECT imovel_id FROM oportunidades WHERE imovel_id IN (?)', ids).map((o) => o.imovel_id));

  return lista.map((i) => {
    const d = i.proprietario_id ? donos.get(i.proprietario_id) : null;
    const f = fg.get(i.id);
    const doFisgar = d && String(d.origem_dado || '').startsWith('Fisgar');
    const as = assin.get(i.id);
    let etapa = 'sem_dono';
    if (i.status === 'vendido' || i.status === 'alugado') etapa = 'vendido';
    else if (i.status === 'publicado' || i.status === 'off_market') etapa = 'publicado';
    else if (as === 'assinado') etapa = 'autorizado';
    else if ((f && f.conf) || (d && !doFisgar)) etapa = 'confirmado';
    else if ((f && f.contato) || i.status === 'aguardando_autorizacao' || as === 'pendente') etapa = 'em_contato';
    else if (d) etapa = 'localizado';
    const origem = f && !(f.daCarteira && f.ids.length === 1) ? (f.radar && !f.consultadas ? 'radar' : 'fisgar') : op.has(i.id) ? 'radar' : 'cadastro';
    const nFotos = i.n_fotos ?? (i.fotos ? i.fotos.length : 0);
    const itens = [
      ['fotos', 'Fotos próprias', nFotos > 0],
      ['dono', 'Proprietário', !!d],
      ['telefone', 'Telefone do dono', !!(d && d.telefone)],
      ['endereco', 'Endereço completo (rua, número, CEP)', !!(i.logradouro && i.numero && i.cep)],
      ['valor', i.finalidade === 'locacao' ? 'Valor do aluguel' : 'Valor', i.finalidade === 'locacao' ? !!i.valor_locacao : i.finalidade === 'venda_locacao' ? !!(i.valor && i.valor_locacao) : !!i.valor],
      ['area', 'Área', !!(i.area_util || i.area_total)],
      ['descricao', `Descrição da ${cfg.CLIENTE_NOME}`, descPropria(i.descricao)],
      ['autorizacao', 'Autorização assinada', as === 'assinado'],
      ['corretor', 'Corretor responsável', !!i.corretor_id],
    ];
    const ok = itens.filter((x) => x[2]).length;
    return {
      ...i, etapa, origem,
      dono: d ? { nome: d.nome, telefone: d.telefone, origem: d.origem_dado, confirmado: !doFisgar || !!(f && f.conf), nao_contatar: !!d.nao_contatar } : null,
      fisguei_ids: f ? f.ids : [], busca_dono: f && f.pedido ? f.pedido : null,
      ficha: { pct: Math.round((ok / itens.length) * 100), falta: itens.filter((x) => !x[2]).map((x) => x[1]) },
    };
  });
}

module.exports = { ETAPAS, ORIGENS, enriquece };
