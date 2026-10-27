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
      (SELECT max(em) FROM oportunidade_eventos e WHERE e.oportunidade_id=o.id) ultimo_evento FROM oportunidades o
      ${tudo ? '' : 'WHERE o.corretor_id=? OR o.corretor_id IS NULL'}`, ...(tudo ? [] : [u.id]));
  const fg = all(`SELECT id, status, bairro, portal, anunciante_tipo, valor, tipo, finalidade, cidade, criado_em, oportunidade_id, imovel_id FROM fisguei_anuncios`);
  const comDono = one('SELECT count(DISTINCT anuncio_id) n FROM fisguei_pessoas WHERE consultado=1').n;
  const pessoasSt = conta(all('SELECT status FROM fisguei_pessoas WHERE consultado=1'), (x) => x.status);
  const envios = all(`SELECT enviado_em FROM fisguei_contatos WHERE envio IN ('enviado','respondeu') AND enviado_em IS NOT NULL`);
  const respostas = all(`SELECT criado_em FROM fisguei_mensagens WHERE direcao='entrada' AND criado_em >= ?`, ini);
  const respondeuEnvio = one(`SELECT count(*) n FROM fisguei_contatos WHERE envio='respondeu'`).n;
  const fila = one(`SELECT count(*) n FROM fisguei_contatos WHERE tipo='tel' AND envio='fila'`).n;
  const gasto = one('SELECT coalesce(sum(custo),0) v FROM oportunidade_eventos').v;
  const creditos = all(`SELECT creditos, criado_em, status FROM fisguei_pedidos`);
  const aprov = one("SELECT count(*) n FROM aprovacoes WHERE status='pendente'").n;

  // ---------- funil ----------
  const stOp = conta(ops, (x) => x.status), stFg = conta(fg, (x) => x.status);
  const enviados = envios.length;
  const confirmados = pessoasSt.confirmou || 0;
  const ativas = ATIVAS.reduce((t, s) => t + (stOp[s] || 0), 0);
  const captadas = stOp.captada || 0;
  const funil = [
    { rotulo: 'Anúncios na base (Fisguei)', n: fg.length, href: '#/fisguei' },
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
  const particularesSemDono = fg.filter((a) => a.anunciante_tipo === 'particular' && a.status === 'novo').length;
  const pedidosErro = creditos.filter((p) => p.status === 'erro').length;
  const pedidosFila = creditos.filter((p) => ['fila', 'buscando'].includes(p.status)).length;
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
    fisguei: porDia(fg.map((a) => dia(a.criado_em))),
    radar: porDia(ops.map((o) => dia(o.criado_em))),
    abordagens: porDia(envios.map((e) => dia(e.enviado_em))),
    respostas: porDia(respostas.map((m) => dia(m.criado_em))),
  };

  // ---------- bairros (juntando grafias), vitrines e portais ----------
  const bairros = new Map();
  const somaBairro = (nome, k) => { const c = G.chave(nome); if (!c) return; if (!bairros.has(c)) bairros.set(c, { nomes: {}, fisguei: 0, radar: 0 }); const b = bairros.get(c); b[k]++; b.nomes[nome] = (b.nomes[nome] || 0) + 1; };
  for (const a of fg) if (a.status !== 'descartado') somaBairro(a.bairro, 'fisguei');
  for (const o of ops) if (o.status !== 'descartada') somaBairro(o.bairro, 'radar');
  const topBairros = [...bairros.values()].map((b) => ({ nome: Object.entries(b.nomes).sort((x, y) => y[1] - x[1])[0][0], fisguei: b.fisguei, radar: b.radar, n: b.fisguei + b.radar }))
    .sort((a, b) => b.n - a.n).slice(0, 10);
  const vit = conta(fg.filter((a) => a.status !== 'descartado' && /^campinas/i.test(a.cidade || 'campinas')), (a) => M.categoria(a));
  const vitrines = Object.entries(VITRINE).map(([k, nome]) => ({ chave: k, rotulo: nome, n: vit[k] || 0, href: '#/' + k }));
  const portais = conta([...fg, ...ops], (x) => x.portal || 'Outro');
  const quem = { particular: fg.filter((a) => a.anunciante_tipo === 'particular').length + ops.filter((o) => o.anunciante_tipo === 'particular').length,
    imobiliaria: fg.filter((a) => a.anunciante_tipo === 'imobiliaria').length + ops.filter((o) => o.anunciante_tipo === 'imobiliaria').length };

  // ---------- mais novos, com foto ----------
  const novosFg = all(`SELECT id, tipo, finalidade, bairro, logradouro, numero, valor, quartos, area_util, area_total, anunciante_tipo, status, fotos, criado_em, lat
      FROM fisguei_anuncios WHERE status NOT IN ('descartado') ORDER BY CASE WHEN anunciante_tipo='particular' THEN 0 ELSE 1 END, id DESC LIMIT 8`)
    .map(({ fotos, ...a }) => ({ ...a, ref: 'FG-' + String(a.id).padStart(5, '0'), foto: capaFg(fotos), subtipo: M.subtipo(a) }));
  const novasOp = all(`SELECT o.id, o.titulo, o.tipo, o.bairro, o.logradouro, o.numero, o.valor, o.status, o.anunciante_tipo, o.portal, o.criado_em, o.imovel_id, o.foto op_foto,
      (SELECT f.fotos FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id ORDER BY f.id LIMIT 1) fotos,
      (SELECT f.id FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id ORDER BY f.id LIMIT 1) fg_id,
      (SELECT min(a.id) FROM arquivos a WHERE a.imovel_id=o.imovel_id AND a.categoria='Fotos') capa
      FROM oportunidades o WHERE o.status NOT IN ('descartada') ${tudo ? '' : 'AND (o.corretor_id=? OR o.corretor_id IS NULL)'} ORDER BY o.id DESC LIMIT 6`, ...(tudo ? [] : [u.id]))
    .map(({ fotos, op_foto, ...o }) => ({ ...o, ref: 'OP-' + String(o.id).padStart(4, '0'), foto: o.capa ? `/api/arquivos/${o.capa}` : op_foto || capaFg(fotos) }));

  const creditosMes = creditos.filter((p) => dia(p.criado_em).slice(0, 7) === hoje.slice(0, 7)).reduce((t, p) => t + (p.creditos || 0), 0);
  res.json({
    kpis: {
      base: fg.length, hoje: fg.filter((a) => dia(a.criado_em) === hoje).length + ops.filter((o) => dia(o.criado_em) === hoje).length,
      particulares: quem.particular, imobiliarias: quem.imobiliaria, comDono, abordagens: enviados, fila,
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
