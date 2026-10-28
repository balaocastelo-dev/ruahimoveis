// Captação: Radar + Fisguei numa tela só. Um painel com o funil inteiro (do anúncio na base até o imóvel captado),
// o que espera alguém, a evolução dos últimos 30 dias, bairros, vitrines e portais, e os anúncios mais novos com foto.
// Poucas consultas e as contas aqui (vale igual no SQLite do PC e no Postgres da Vercel).
'use strict';
const express = require('express');
const A = require('../auth');
const { one, all } = require('../db');
const G = require('../condominios/geo');
const M = require('./mercado');

const r = express.Router();

function horaSP(diasAtras = 0) {
  const d = new Date(Date.now() - diasAtras * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
const dia = (s) => String(s || '').slice(0, 10);
const conta = (l, f) => l.reduce((m, x) => { const k = f(x); if (k !== null && k !== undefined && k !== '') m[k] = (m[k] || 0) + 1; return m; }, {});
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const capaFg = (fotos) => { try { return (JSON.parse(fotos || '[]') || [])[0] || null; } catch { return null; } };
const ATIVAS = ['nova', 'em_contato', 'carta_enviada', 'aguardando_aprovacao'];
const VITRINE = { apartamentos: 'Apartamentos', casas: 'Casas', terrenos: 'Terrenos', comerciais: 'Salas e barracões' };

r.get('/captacao/painel', (req, res) => {
  const u = req.usuario, tudo = A.veTudo(u);
  const DIAS = 30, ini = horaSP(DIAS), hoje = horaSP().slice(0, 10), dois = horaSP(2);

  // ---------- consultas ----------
  const ops = all(`SELECT o.id, o.status, o.bairro, o.portal, o.anunciante_tipo, o.valor, o.tipo, o.corretor_id, o.criado_em, o.atualizado_em,
      (SELECT max(em) FROM oportunidade_eventos e WHERE e.oportunidade_id=o.id) ultimo_evento,
      CASE WHEN EXISTS (SELECT 1 FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id) THEN 1 ELSE 0 END lig FROM oportunidades o
      ${tudo ? '' : 'WHERE o.corretor_id=? OR o.corretor_id IS NULL'}`, ...(tudo ? [] : [u.id]));
  // Fisguei: tudo contado no banco numa consulta só (são dezenas de milhares de anúncios; trazer um por um levava segundos)
  const GR = all(`SELECT 'st' k, status a, NULL b, count(*) n FROM fisguei_anuncios GROUP BY status
    UNION ALL SELECT 'ba', bairro, NULL, count(*) FROM fisguei_anuncios WHERE status <> 'descartado' GROUP BY bairro
    UNION ALL SELECT 'po', portal, NULL, count(*) FROM fisguei_anuncios GROUP BY portal
    UNION ALL SELECT 'an', anunciante_tipo, NULL, count(*) FROM fisguei_anuncios GROUP BY anunciante_tipo
    UNION ALL SELECT 'pn', anunciante_tipo, NULL, count(*) FROM fisguei_anuncios WHERE status='novo' GROUP BY anunciante_tipo
    UNION ALL SELECT 'di', substr(criado_em,1,10), NULL, count(*) FROM fisguei_anuncios WHERE criado_em >= ? GROUP BY substr(criado_em,1,10)
    UNION ALL SELECT 'vi', tipo, finalidade, count(*) FROM fisguei_anuncios WHERE status <> 'descartado' AND lower(coalesce(cidade,'campinas')) LIKE 'campinas%' GROUP BY tipo, finalidade`, ini);
  const grupo = (k) => GR.filter((x) => x.k === k);
  const somaG = (k, f = () => true) => grupo(k).filter(f).reduce((t, x) => t + Number(x.n), 0);
  const fgTotal = somaG('st');
  // robô, créditos e aprovações: também numa consulta só
  const X = all(`SELECT 'ps' k, status a, NULL b, count(*) n FROM fisguei_pessoas WHERE consultado=1 GROUP BY status
    UNION ALL SELECT 'en', substr(enviado_em,1,10), NULL, count(*) FROM fisguei_contatos WHERE envio IN ('enviado','respondeu') AND enviado_em IS NOT NULL GROUP BY substr(enviado_em,1,10)
    UNION ALL SELECT 're', substr(criado_em,1,10), NULL, count(*) FROM fisguei_mensagens WHERE direcao='entrada' AND criado_em >= ? GROUP BY substr(criado_em,1,10)
    UNION ALL SELECT 'cr', status, substr(criado_em,1,7), sum(creditos) FROM fisguei_pedidos GROUP BY status, substr(criado_em,1,7)
    UNION ALL SELECT 'cp', status, NULL, count(*) FROM fisguei_pedidos GROUP BY status
    UNION ALL SELECT 'cd', NULL, NULL, count(DISTINCT anuncio_id) FROM fisguei_pessoas WHERE consultado=1
    UNION ALL SELECT 'rs', NULL, NULL, count(*) FROM fisguei_contatos WHERE envio='respondeu'
    UNION ALL SELECT 'fi', NULL, NULL, count(*) FROM fisguei_contatos WHERE tipo='tel' AND envio='fila'
    UNION ALL SELECT 'ga', NULL, NULL, coalesce(sum(custo),0) FROM oportunidade_eventos
    UNION ALL SELECT 'ap', NULL, NULL, count(*) FROM aprovacoes WHERE status='pendente'`, ini);
  const xs = (k) => X.filter((x) => x.k === k), x1 = (k) => Number((xs(k)[0] || {}).n || 0);
  const comDono = x1('cd'), respondeuEnvio = x1('rs'), fila = x1('fi'), gasto = x1('ga'), aprov = x1('ap');
  const pessoasSt = Object.fromEntries(xs('ps').map((x) => [x.a, Number(x.n)]));
  const enviosDia = Object.fromEntries(xs('en').map((x) => [x.a, Number(x.n)])), respostasDia = Object.fromEntries(xs('re').map((x) => [x.a, Number(x.n)]));
  const pedidosSt = Object.fromEntries(xs('cp').map((x) => [x.a, Number(x.n)]));

  // ---------- funil ----------
  const stOp = conta(ops, (x) => x.status), stFg = Object.fromEntries(grupo('st').map((x) => [x.a, Number(x.n)]));
  const enviados = Object.values(enviosDia).reduce((t, n) => t + n, 0);
  const confirmados = pessoasSt.confirmou || 0;
  const ativas = ATIVAS.reduce((t, s) => t + (stOp[s] || 0), 0);
  const captadas = stOp.captada || 0;
  const funil = [
    { rotulo: 'Anúncios na base (Fisguei)', n: fgTotal, href: '#/fisguei' },
    { rotulo: 'Com proprietário consultado', n: comDono, href: '#/fisguei?filtro=com_dono' },
    { rotulo: 'Proprietários abordados pelo robô', n: enviados, href: '#/fisguei?filtro=abordando' },
    { rotulo: 'Responderam', n: respondeuEnvio, href: '#/fisguei?filtro=precisa' },
    { rotulo: 'Donos confirmados', n: confirmados, href: '#/fisguei?filtro=confirmado' },
    { rotulo: 'Oportunidades no Radar', n: ops.filter((o) => o.status !== 'descartada').length, href: '#/radar' },
    { rotulo: 'Em contato ou carta enviada', n: (stOp.em_contato || 0) + (stOp.carta_enviada || 0) + (stOp.aguardando_aprovacao || 0), href: '#/radar?status=em_contato' },
    { rotulo: 'Captadas', n: captadas, href: '#/radar?status=captada' },
  ];

  // ---------- precisa de atenção ----------
  const semContato = ops.filter((o) => o.status === 'nova' && (o.ultimo_evento || o.criado_em) < dois).length;
  const particularesSemDono = somaG('pn', (x) => x.a === 'particular');
  const pedidosErro = pedidosSt.erro || 0;
  const pedidosFila = (pedidosSt.fila || 0) + (pedidosSt.buscando || 0);
  const atencao = [
    { n: stFg.respondeu || 0, txt: 'resposta(s) de proprietário esperando o corretor', href: '#/fisguei?filtro=precisa', nivel: 'bad' },
    { n: stFg.confirmado || 0, txt: 'dono(s) confirmado(s) para levar ao Radar', href: '#/fisguei?filtro=confirmado', nivel: 'ok' },
    tudo && { n: aprov, txt: 'consulta(s) paga(s) esperando aprovação', href: '#/radar/aprovacoes', nivel: 'warn' },
    { n: semContato, txt: 'oportunidade(s) nova(s) sem contato há mais de 2 dias', href: '#/radar?status=nova', nivel: 'warn' },
    { n: particularesSemDono, txt: 'anúncio(s) de particular sem proprietário consultado', href: '#/fisguei?filtro=particular', nivel: 'info' },
    { n: pedidosFila, txt: 'busca(s) no Fisgar na fila (precisa de uma aba do Fisgar aberta)', href: '#/fisguei', nivel: 'info' },
    { n: pedidosErro, txt: 'busca(s) no Fisgar com erro', href: '#/fisguei', nivel: 'bad' },
  ].filter((x) => x && x.n);

  // ---------- últimos 30 dias, por dia ----------
  const dias = [];
  for (let i = DIAS - 1; i >= 0; i--) dias.push(horaSP(i).slice(0, 10));
  const porDia = (datas) => { const c = conta(datas.filter((d) => d >= dias[0]), (d) => d); return dias.map((d) => c[d] || 0); };
  const serie = {
    dias,
    fisguei: dias.map((d) => somaG('di', (x) => x.a === d)),
    radar: porDia(ops.map((o) => dia(o.criado_em))),
    abordagens: dias.map((d) => enviosDia[d] || 0),
    respostas: dias.map((d) => respostasDia[d] || 0),
  };

  // ---------- bairros (juntando grafias), vitrines e portais ----------
  const bairros = new Map();
  const somaBairro = (nome, k) => { const c = G.chave(nome); if (!c) return; if (!bairros.has(c)) bairros.set(c, { nomes: {}, fisguei: 0, radar: 0 }); const b = bairros.get(c); b[k]++; b.nomes[nome] = (b.nomes[nome] || 0) + 1; };
  for (const x of grupo('ba')) for (let i = 0; i < Number(x.n); i++) somaBairro(x.a, 'fisguei');
  for (const o of ops) if (o.status !== 'descartada') somaBairro(o.bairro, 'radar');
  const topBairros = [...bairros.values()].map((b) => ({ nome: Object.entries(b.nomes).sort((x, y) => y[1] - x[1])[0][0], fisguei: b.fisguei, radar: b.radar, n: b.fisguei + b.radar }))
    .sort((a, b) => b.n - a.n).slice(0, 10);
  const vit = conta(ops.filter((o) => o.status !== 'descartada' && !o.lig), (a) => M.categoria(a));
  for (const x of grupo('vi')) { const k = M.categoria({ tipo: x.a, finalidade: x.b }); vit[k] = (vit[k] || 0) + Number(x.n); }
  const vitrines = Object.entries(VITRINE).map(([k, nome]) => ({ chave: k, rotulo: nome, n: vit[k] || 0, href: '#/' + k }));
  const portais = conta(ops, (x) => x.portal || 'Outro');
  for (const x of grupo('po')) portais[x.a || 'Outro'] = (portais[x.a || 'Outro'] || 0) + Number(x.n);
  const quem = { particular: somaG('an', (x) => x.a === 'particular') + ops.filter((o) => o.anunciante_tipo === 'particular').length,
    imobiliaria: somaG('an', (x) => x.a === 'imobiliaria') + ops.filter((o) => o.anunciante_tipo === 'imobiliaria').length };

  // ---------- mais novos, com foto ----------
  const novosFg = all(`SELECT id, tipo, finalidade, bairro, logradouro, numero, valor, quartos, area_util, area_total, anunciante_tipo, status, fotos, criado_em, lat
      FROM fisguei_anuncios WHERE status NOT IN ('descartado') AND fotos LIKE '["%' ORDER BY CASE WHEN anunciante_tipo='particular' THEN 0 ELSE 1 END, id DESC LIMIT 8`)
    .map(({ fotos, ...a }) => ({ ...a, ref: 'FG-' + String(a.id).padStart(5, '0'), foto: capaFg(fotos), subtipo: M.subtipo(a) }));
  const novasOp = all(`SELECT o.id, o.titulo, o.tipo, o.bairro, o.logradouro, o.numero, o.valor, o.status, o.anunciante_tipo, o.portal, o.criado_em, o.imovel_id, o.foto op_foto,
      (SELECT f.fotos FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id ORDER BY f.id LIMIT 1) fotos,
      (SELECT f.id FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id ORDER BY f.id LIMIT 1) fg_id,
      (SELECT a.id FROM arquivos a WHERE a.imovel_id=o.imovel_id AND a.categoria IN ('Fotos','Fotos internas') ORDER BY CASE WHEN a.categoria='Fotos' THEN 0 ELSE 1 END, a.id LIMIT 1) capa
      FROM oportunidades o WHERE o.status NOT IN ('descartada') ${tudo ? '' : 'AND (o.corretor_id=? OR o.corretor_id IS NULL)'} ORDER BY o.id DESC LIMIT 6`, ...(tudo ? [] : [u.id]))
    .map(({ fotos, op_foto, ...o }) => ({ ...o, ref: 'OP-' + String(o.id).padStart(4, '0'), foto: o.capa ? `/api/arquivos/${o.capa}` : op_foto || capaFg(fotos) }));

  const creditosMes = xs('cr').filter((x) => x.b === hoje.slice(0, 7)).reduce((t, x) => t + Number(x.n || 0), 0);
  res.json({
    kpis: {
      base: fgTotal, hoje: somaG('di', (x) => x.a === hoje), opsHoje: ops.filter((o) => dia(o.criado_em) === hoje).length,
      partFg: somaG('an', (x) => x.a === 'particular'), particulares: quem.particular, imobiliarias: quem.imobiliaria, comDono, abordagens: enviados, fila,
      respostas: respondeuEnvio, taxaResposta: pct(respondeuEnvio, enviados), confirmados,
      ativas, captadas, gasto, custoPorCaptacao: captadas ? gasto / captadas : null, creditosMes, aprovacoes: tudo ? aprov : 0,
    },
    funil, atencao, serie, bairros: topBairros, vitrines,
    portais: Object.entries(portais).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rotulo, n]) => ({ rotulo, n })),
    radarStatus: Object.entries({ nova: 'Novas', em_contato: 'Em contato', carta_enviada: 'Carta enviada', aguardando_aprovacao: 'Aguardando aprovação', captada: 'Captadas', descartada: 'Descartadas' })
      .map(([k, rotulo]) => ({ rotulo, n: stOp[k] || 0, href: '#/radar?status=' + k })),
    fisgueiStatus: Object.entries({ novo: 'Sem proprietário', abordando: 'Robô abordando', respondeu: 'Respondeu', confirmado: 'Dono confirmou', captado: 'No Radar', sem_interesse: 'Sem interesse', sem_dono: 'Ninguém confirmou' })
      .map(([k, rotulo]) => ({ rotulo, n: stFg[k] || 0 })),
    novosFg, novasOp,
  });
});

module.exports = r;
