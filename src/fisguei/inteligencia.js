// Fisguei inteligente: lê a base inteira de anúncios e aponta onde estão as oportunidades de captação.
// Tudo é calculado aqui, com regras claras e explicadas para o corretor (nada de "caixa-preta"):
//   queda de preço · anúncio novo · anúncio antigo (encalhado) · abaixo/acima do m² do bairro · particular ·
//   mesmo imóvel anunciado várias vezes · proprietário já achado · resposta do dono.
// Também guarda e calcula o saldo de créditos do Fisgar.
const { one, all, run, getConfig, setConfig } = require('../db');
const F = require('./base');

const DIA = 864e5;
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const dias = (d) => (d ? Math.floor((Date.parse(hojeSP() + 'T12:00:00') - Date.parse(String(d).slice(0, 10) + 'T12:00:00')) / DIA) : null);
const mediana = (l) => { const s = l.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => (a && b ? Math.round(((a - b) / b) * 1000) / 10 : null);
const mi = (v) => (v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : `R$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} mil`);
// só as primeiras fotos (o texto pode vir cortado no meio): pega os endereços completos que couberem
const fotosDe = (f) => [...String(f || '').matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]).slice(0, 8);

// ---------- créditos do Fisgar ----------
const PLANO_PADRAO = 2200; // plano "Corretor Individual Mensal Plus"
const agoraLocal = () => one(`SELECT datetime('now','localtime') AS t`).t;
function leitura() { try { const l = JSON.parse(getConfig('fisguei_saldo') || 'null'); return l && Number.isFinite(l.saldo) ? l : null; } catch { return null; } }
// créditos gastos depois de um momento: o que o robô gastou + consultas feitas à mão no Fisgar (a extensão vê cada uma)
function gastoDesde(t) {
  const ped = one(`SELECT coalesce(sum(creditos),0) AS c, coalesce(sum(consultadas),0) AS q FROM fisguei_pedidos WHERE coalesce(concluido_em,criado_em) > ?`, t);
  const pes = one('SELECT count(*) AS n FROM fisguei_pessoas WHERE consultado=1 AND consultado_em > ?', t).n;
  return ped.c + Math.max(0, pes - ped.q);
}
function creditos() {
  const plano = parseInt(getConfig('fisguei_plano_creditos'), 10) || PLANO_PADRAO;
  const hoje = hojeSP(), mes = hoje.slice(0, 7) + '-01 00:00:00';
  const gastoMes = gastoDesde(mes), gastoHoje = gastoDesde(hoje + ' 00:00:00');
  const lim = require('./pedidos').limites();
  const l = leitura();
  let saldo, fonte, desde = null;
  // leitura do próprio Fisgar (ou informada à mão) vale até virar o mês; depois dela desconta o que foi gasto
  if (l && String(l.em).slice(0, 7) === hoje.slice(0, 7)) { const g = gastoDesde(l.em); saldo = Math.max(0, l.saldo - g); fonte = l.fonte || 'fisgar'; desde = { em: l.em, saldo: l.saldo, gasto: g, chave: l.chave || null }; }
  else { saldo = Math.max(0, plano - gastoMes); fonte = 'estimado'; }
  const [a, m] = hoje.split('-').map(Number);
  const fimMes = new Date(a, m, 0).getDate(), diaHoje = +hoje.slice(8, 10);
  const diasRestantes = fimMes - diaHoje + 1;
  return {
    plano, saldo, fonte, leitura: desde, gasto_mes: gastoMes, gasto_hoje: gastoHoje, limite_dia: lim.creditos_dia,
    restante_hoje: Math.max(0, lim.creditos_dia - require('./pedidos').creditosHoje()),
    dias_restantes: diasRestantes, por_dia_disponivel: Math.floor(saldo / Math.max(diasRestantes, 1)),
    pct_usado: Math.min(100, Math.round(((plano - saldo) / plano) * 100)),
  };
}
function gravaSaldo(saldo, o = {}) {
  const s = parseInt(saldo, 10);
  if (!Number.isFinite(s) || s < 0 || s > 1e6) return null;
  setConfig('fisguei_saldo', JSON.stringify({ saldo: s, em: agoraLocal(), fonte: o.fonte || 'fisgar', chave: o.chave ? String(o.chave).slice(0, 80) : null }));
  if (o.plano && Number.isFinite(+o.plano) && +o.plano > 0 && +o.plano < 1e6) setConfig('fisguei_plano_creditos', String(Math.round(+o.plano)));
  return creditos();
}
function gravaPlano(plano) { const p = parseInt(plano, 10); if (Number.isFinite(p) && p > 0 && p < 1e6) setConfig('fisguei_plano_creditos', String(p)); return creditos(); }

// ---------- leitura da base ----------
const SINAIS = {
  queda: { rotulo: 'Baixou o preço', icone: '↓', cor: 'bad' },
  novo: { rotulo: 'Anúncio novo', icone: '✦', cor: 'info' },
  antigo: { rotulo: 'Anunciado há muito tempo', icone: '⌛', cor: 'warn' },
  abaixo: { rotulo: 'Abaixo do m² do bairro', icone: '◆', cor: 'ok' },
  acima: { rotulo: 'Acima do m² do bairro', icone: '▲', cor: 'gold' },
  particular: { rotulo: 'Dono anuncia direto', icone: '☺', cor: 'ok' },
  repetido: { rotulo: 'Anunciado várias vezes', icone: '⧉', cor: 'gold' },
  subiu: { rotulo: 'Subiu o preço', icone: '↑', cor: 'gold' },
};
const FORA = new Set(['descartado']);

let CACHE = { em: 0, chave: '', base: null };
function carregaBase() {
  // a base muda devagar (a extensão manda lotes): guarda 45 s para a navegação ficar instantânea
  const marca = one('SELECT count(*) AS n, max(atualizado_em) AS m FROM fisguei_anuncios');
  const marcaP = one('SELECT count(*) AS n, max(consultado_em) AS m FROM fisguei_pessoas');
  const chave = `${marca.n}|${marca.m}|${marcaP.n}|${marcaP.m}`;
  if (CACHE.base && CACHE.chave === chave && Date.now() - CACHE.em < 45000) return CACHE.base;

  const M = require('../routes/mercado');
  const linhas = all(`SELECT a.id, a.fisgar_id, a.portal, a.tipo, a.finalidade, a.titulo, a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.cep, a.lat, a.lon,
      a.valor, a.valor_condominio, a.iptu, a.quartos, a.suites, a.banheiros, a.vagas, a.area_util, a.area_total, a.anunciante_nome, a.anunciante_tipo,
      a.publicado_em, a.anunciado_desde, substr(a.fotos,1,900) AS fotos, (length(coalesce(a.fotos,'')) - length(replace(coalesce(a.fotos,''),'"http','')))/5 AS fotos_total, a.status, a.pausado, a.oportunidade_id, a.imovel_id, a.condominio_id, a.criado_em, a.atualizado_em
    FROM fisguei_anuncios a`);
  const pes = new Map(all(`SELECT anuncio_id, count(*) AS n, coalesce(sum(consultado),0) AS cons, coalesce(sum(CASE WHEN status='confirmou' THEN 1 ELSE 0 END),0) AS conf,
      coalesce(sum(CASE WHEN status='respondeu' THEN 1 ELSE 0 END),0) AS resp FROM fisguei_pessoas GROUP BY anuncio_id`).map((x) => [x.anuncio_id, x]));
  const fila = new Map(all(`SELECT x.anuncio_id, count(*) AS n FROM fisguei_contatos c JOIN fisguei_pessoas x ON x.id=c.pessoa_id WHERE c.tipo='tel' AND c.envio='fila' GROUP BY x.anuncio_id`).map((x) => [x.anuncio_id, x.n]));
  const ped = new Map(all(`SELECT anuncio_id, status FROM fisguei_pedidos WHERE id IN (SELECT max(id) FROM fisguei_pedidos GROUP BY anuncio_id)`).map((x) => [x.anuncio_id, x.status]));
  const precos = new Map();
  for (const p of all('SELECT anuncio_id, valor, em FROM fisguei_precos ORDER BY anuncio_id, em, id')) { if (!precos.has(p.anuncio_id)) precos.set(p.anuncio_id, []); precos.get(p.anuncio_id).push(p); }

  // nome do bairro: a grafia mais comum entre os anúncios (Cambuí = CAMBUI = cambui)
  const grafias = new Map();
  for (const x of linhas) { const k = F.norm(x.bairro); if (!k) continue; if (!grafias.has(k)) grafias.set(k, new Map()); const g = grafias.get(k); g.set(x.bairro, (g.get(x.bairro) || 0) + 1); }
  const nomeBairro = (b) => { const g = grafias.get(F.norm(b)); if (!g) return b || null; const [nome] = [...g.entries()].sort((a, c) => c[1] - a[1] || (/[a-zà-ú]/.test(c[0]) - /[a-zà-ú]/.test(a[0])))[0]; return nome; };

  const itens = linhas.map((x) => {
    const cat = M.categoria(x);
    const area = (cat === 'terrenos' ? x.area_total || x.area_util : x.area_util || x.area_total) || null;
    const fotos = fotosDe(x.fotos);
    return { ...x, fotos, fotos_n: Math.max(fotos.length, x.fotos_total || 0), categoria: cat, subtipo: M.subtipo(x, cat), area, m2: x.valor && area && area >= 15 ? x.valor / area : null,
      bairro_nome: nomeBairro(x.bairro), bairro_k: F.norm(x.bairro), ref: F.ref(x.id),
      pes: pes.get(x.id) || { n: 0, cons: 0, conf: 0, resp: 0 }, na_fila: fila.get(x.id) || 0, pedido: ped.get(x.id) || null, hist: precos.get(x.id) || [] };
  });
  const ativos = itens.filter((x) => !FORA.has(x.status));

  // m² de referência: mesmo bairro e mesmo subtipo (casa em condomínio não se compara com casa de rua), com 5 anúncios ou mais;
  // senão bairro + vitrine (8+); senão a cidade no subtipo. Áreas absurdas (m² fora de 1/6 a 6x da cidade) ficam fora da conta.
  const porSub = new Map();
  for (const x of ativos) if (x.m2) { if (!porSub.has(x.subtipo)) porSub.set(x.subtipo, []); porSub.get(x.subtipo).push(x.m2); }
  const cidadeSub = new Map([...porSub].map(([k, l]) => [k, mediana(l)]));
  for (const x of itens) { const c = cidadeSub.get(x.subtipo); if (x.m2 && c && (x.m2 < c / 6 || x.m2 > c * 6)) { x.m2_estranho = true; } }
  const junta = (chave, min) => {
    const g = new Map();
    for (const x of ativos) { if (!x.m2 || x.m2_estranho) continue; const k = chave(x); if (!k) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(x.m2); }
    return new Map([...g].filter(([, l]) => l.length >= min).map(([k, l]) => [k, { m2: mediana(l), n: l.length }]));
  };
  const ref = junta((x) => x.bairro_k && `${x.bairro_k}|${x.subtipo}`, 5);
  const refCat = junta((x) => x.bairro_k && `${x.bairro_k}|${x.categoria}`, 8);
  const refCidade = junta((x) => x.subtipo, 8);

  // mesmo imóvel em vários anúncios (mesma rua, número e tipo, área parecida)
  const grupoDe = new Map();
  for (const g of M.unicos(ativos)) if (g.iguais.length > 1) for (const y of g.iguais) grupoDe.set(y.id, g);

  for (const x of itens) analisa(x, { ref, refCat, refCidade, grupoDe });
  const base = { itens, ativos, ref, geradoEm: new Date().toISOString() };
  CACHE = { em: Date.now(), chave, base };
  return base;
}

function analisa(x, ctx) {
  const s = [];
  // preço: último movimento registrado
  const h = x.hist;
  if (h.length >= 2) {
    const ant = h[h.length - 2].valor, atual = h[h.length - 1].valor, quando = dias(h[h.length - 1].em);
    const pi = pct(h[0].valor, atual) === null ? null : pct(atual, h[0].valor);
    const p = pct(atual, ant);
    if (p !== null && p <= -2) {
      const brusca = p <= -8 || (pi !== null && pi <= -12);
      s.push({ id: 'queda', forca: Math.min(1, -p / 15), brusca, pct: p, de: ant, para: atual, dias: quando,
        texto: `${brusca ? 'Queda forte' : 'Baixou'} ${Math.abs(p).toLocaleString('pt-BR')}%: de ${mi(ant)} para ${mi(atual)}${quando !== null ? (quando <= 0 ? ' (hoje)' : ` há ${quando} dia${quando > 1 ? 's' : ''}`) : ''}${h.length > 2 && pi !== null && pi < p ? `. Desde o primeiro preço, ${Math.abs(pi).toLocaleString('pt-BR')}% a menos` : ''}.` });
    } else if (p !== null && p >= 2) s.push({ id: 'subiu', forca: 0.2, pct: p, texto: `Subiu ${p.toLocaleString('pt-BR')}% (de ${mi(ant)} para ${mi(atual)}).` });
  }
  // tempo de anúncio (o mais antigo entre o que o portal informa e o dia em que entrou na base)
  const desde = [x.anunciado_desde, x.publicado_em, String(x.criado_em || '').slice(0, 10)].filter(Boolean).sort()[0] || null;
  const idade = dias(desde), naBase = dias(x.criado_em);
  x.desde = desde; x.idade = idade; x.na_base_dias = naBase;
  if (idade !== null && idade <= 3) s.push({ id: 'novo', forca: idade <= 1 ? 1 : 0.6, dias: idade, texto: idade <= 0 ? 'Saiu hoje nos portais.' : `Anunciado há ${idade} dia${idade > 1 ? 's' : ''}: quem chega primeiro tem mais chance com o dono.` });
  else if (idade !== null && idade >= 90) s.push({ id: 'antigo', forca: Math.min(1, idade / 240), dias: idade, texto: `Anunciado há ${idade} dias sem vender: o dono pode estar cansado da imobiliária atual.` });
  // m² comparado com o bairro
  if (x.m2 && !x.m2_estranho) {
    const r = ctx.ref.get(`${x.bairro_k}|${x.subtipo}`) || ctx.refCat.get(`${x.bairro_k}|${x.categoria}`), rc = ctx.refCidade.get(x.subtipo);
    const base = r || (rc ? { ...rc, cidade: true } : null);
    if (base) {
      const d = pct(x.m2, base.m2);
      x.m2_ref = Math.round(base.m2); x.m2_dif = d; x.m2_ref_n = base.n; x.m2_ref_cidade = !!base.cidade;
      const onde = base.cidade ? `Campinas para ${String(x.subtipo || 'esse tipo').toLowerCase()} (${base.n} anúncios)` : `${x.bairro_nome} (${base.n} anúncios comparáveis)`;
      // só sinaliza comparando com o próprio bairro (a mediana da cidade mistura regiões muito diferentes)
      if (d <= -30 && !base.cidade) s.push({ id: 'abaixo', forca: Math.min(1, (-d - 20) / 35), pct: d, texto: `R$ ${Math.round(x.m2).toLocaleString('pt-BR')}/m², ${Math.abs(d).toLocaleString('pt-BR')}% abaixo da mediana de ${onde}: preço para vender rápido (confira a área no anúncio).` });
      else if (d >= 50 && !base.cidade) s.push({ id: 'acima', forca: 0.2, pct: d, texto: `R$ ${Math.round(x.m2).toLocaleString('pt-BR')}/m², ${d.toLocaleString('pt-BR')}% acima da mediana de ${onde}: tende a encalhar; bom argumento para uma avaliação da RUAH.` });
    }
  }
  if (x.anunciante_tipo === 'particular') s.push({ id: 'particular', forca: 1, texto: 'Anúncio de particular, sem imobiliária no meio: o caminho mais curto até a exclusividade.' });
  const g = ctx.grupoDe.get(x.id);
  if (g) {
    // o mesmo anúncio da mesma imobiliária em vários portais não conta: precisa de anunciantes diferentes
    const anun = new Set(g.iguais.map((y) => F.norm(y.anunciante_nome) || (y.anunciante_tipo === 'particular' ? 'particular' : '')).filter(Boolean));
    if (anun.size >= 2) {
      x.repetido = { n: g.iguais.length, anunciantes: anun.size, min: g.valor_min, max: g.valor_max, ids: g.iguais.map((y) => y.id).filter((i) => i !== x.id).slice(0, 8) };
      s.push({ id: 'repetido', forca: 0.4, n: anun.size, texto: `O mesmo imóvel aparece com ${anun.size} anunciantes diferentes${g.valor_max > g.valor_min ? `, de ${mi(g.valor_min)} a ${mi(g.valor_max)}` : ''}: ninguém tem exclusividade.` });
    }
  }
  x.sinais = s;
  // nota de 0 a 100: o que mais aproxima de uma captação boa e rápida
  const tem = (id) => s.find((z) => z.id === id);
  let n = 20;
  if (tem('particular')) n += 22;
  if (tem('queda')) n += 12 + 14 * tem('queda').forca + (tem('queda').brusca ? 6 : 0);
  if (tem('abaixo')) n += 8 + 10 * tem('abaixo').forca;
  if (tem('antigo')) n += 6 + 8 * tem('antigo').forca;
  if (tem('novo')) n += 6 * tem('novo').forca;
  if (tem('repetido')) n += 5;
  if (x.pes.cons) n += 8;
  if (x.pes.conf || x.status === 'confirmado') n += 18;
  if (x.status === 'respondeu') n += 10;
  if (!x.logradouro || !x.numero) n -= 10; // sem número o Fisgar não acha o dono
  if (!x.fotos_n) n -= 4;
  if (['sem_interesse', 'sem_dono'].includes(x.status)) n -= 25;
  if (x.status === 'descartado') n = 0;
  x.nota = Math.max(0, Math.min(100, Math.round(n)));
  // situação do proprietário (o filtro "dono")
  x.dono = x.pes.conf || x.status === 'confirmado' || x.status === 'captado' ? 'confirmado' : x.pes.cons ? 'consultado' : x.pes.n ? 'lista' : 'nenhum';
  // próximo passo sugerido
  x.passo = x.status === 'descartado' ? null
    : x.dono === 'confirmado' ? (x.oportunidade_id ? 'Abrir no Radar e marcar a visita de captação' : 'Levar para o Radar: o dono já confirmou')
    : x.status === 'respondeu' ? 'Responder a pessoa que falou com o robô'
    : x.dono === 'consultado' ? (x.na_fila ? 'Robô vai chamar no WhatsApp' : 'Ver os telefones e falar com o dono')
    : x.pedido && ['fila', 'buscando'].includes(x.pedido) ? 'Busca do dono na fila do Fisgar'
    : x.logradouro && x.numero ? 'Buscar o proprietário no Fisgar (1 crédito)' : 'Falta o número: confirmar o endereço no anúncio';
}

// ---------- filtros e ordem ----------
const ORDENS = {
  nota: (a, b) => b.nota - a.nota || b.id - a.id,
  recentes: (a, b) => (b.desde || '').localeCompare(a.desde || '') || b.id - a.id,
  queda: (a, b) => ((a.sinais.find((s) => s.id === 'queda') || { pct: 0 }).pct - (b.sinais.find((s) => s.id === 'queda') || { pct: 0 }).pct) || b.nota - a.nota,
  m2: (a, b) => (a.m2_dif ?? 999) - (b.m2_dif ?? 999),
  menor: (a, b) => (a.valor || 9e12) - (b.valor || 9e12),
  maior: (a, b) => (b.valor || 0) - (a.valor || 0),
  antigos: (a, b) => (b.idade ?? -1) - (a.idade ?? -1),
};
const lista = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
function passa(x, q, ignora = '') {
  const etapa = String(q.etapa || '');
  if (etapa ? x.status !== etapa && !(etapa === 'precisa' && ['respondeu', 'confirmado'].includes(x.status)) : FORA.has(x.status)) return false;
  if (ignora !== 'dono' && q.dono && q.dono !== x.dono && !(q.dono === 'com' && x.dono !== 'nenhum' && x.dono !== 'lista') && !(q.dono === 'sem' && (x.dono === 'nenhum' || x.dono === 'lista'))) return false;
  if (ignora !== 'sinais') { const ss = lista(q.sinais); if (ss.length && !ss.every((id) => (id === 'queda_forte' ? x.sinais.some((s) => s.id === 'queda' && s.brusca) : x.sinais.some((s) => s.id === id)))) return false; }
  if (ignora !== 'cat' && q.cat && x.categoria !== q.cat) return false;
  if (ignora !== 'bairro' && q.bairro && !lista(q.bairro).includes(x.bairro_k)) return false;
  if (q.anunciante && x.anunciante_tipo !== q.anunciante) return false;
  const vmin = Number(q.vmin) || 0, vmax = Number(q.vmax) || 0;
  if (vmin && !(x.valor >= vmin)) return false;
  if (vmax && !(x.valor <= vmax)) return false;
  if (Number(q.quartos) && !((x.quartos || 0) >= Number(q.quartos))) return false;
  if (Number(q.amin) && !((x.area || 0) >= Number(q.amin))) return false;
  if (q.foto === '1' && !x.fotos_n) return false;
  if (q.numero === '1' && !(x.logradouro && x.numero)) return false;
  if (q.q) {
    const t = F.norm(q.q), dig = t.replace(/\D/g, '');
    const alvo = F.norm([x.logradouro, x.numero, x.bairro, x.complemento, x.anunciante_nome, x.tipo, x.ref, x.cep, x.portal].join(' '));
    if (!t.split(' ').every((p) => alvo.includes(p)) && !(dig.length >= 5 && String(x.cep || '').includes(dig))) return false;
  }
  return true;
}

function cartao(x) {
  return {
    id: x.id, ref: x.ref, tipo: x.tipo, subtipo: x.subtipo, categoria: x.categoria, logradouro: x.logradouro, numero: x.numero, complemento: x.complemento,
    bairro: x.bairro_nome, cep: x.cep, lat: x.lat, lon: x.lon, valor: x.valor, quartos: x.quartos, suites: x.suites, vagas: x.vagas, area: x.area,
    m2: x.m2 ? Math.round(x.m2) : null, m2_ref: x.m2_ref || null, m2_dif: x.m2_dif ?? null, m2_ref_cidade: x.m2_ref_cidade || false,
    anunciante_nome: x.anunciante_nome, anunciante_tipo: x.anunciante_tipo, portal: x.portal, status: x.status, pausado: x.pausado,
    fotos: x.fotos.slice(0, 8), fotos_n: x.fotos_n, nota: x.nota, sinais: x.sinais.map(({ id, texto, pct: p, brusca, dias: d, de, para }) => ({ id, texto, pct: p, brusca, dias: d, de, para })),
    dono: x.dono, pessoas: x.pes.n, consultadas: x.pes.cons, confirmados: x.pes.conf, na_fila: x.na_fila, pedido: x.pedido, passo: x.passo,
    desde: x.desde, idade: x.idade, oportunidade_id: x.oportunidade_id, imovel_id: x.imovel_id, condominio_id: x.condominio_id,
    historico: x.hist.slice(-8).map((h) => ({ valor: h.valor, em: String(h.em).slice(0, 10) })), repetido: x.repetido || null,
  };
}

const POR_PAG = 36;
function explorar(q) {
  const b = carregaBase();
  const filtrados = b.itens.filter((x) => passa(x, q));
  const ordem = ORDENS[q.ordem] ? q.ordem : 'nota';
  filtrados.sort(ORDENS[ordem]);
  const pag = Math.max(parseInt(q.pagina, 10) || 1, 1);
  // contagens para os filtros (cada grupo conta ignorando a própria escolha, como numa loja on-line)
  const semSinais = b.itens.filter((x) => passa(x, q, 'sinais'));
  const sinais = Object.fromEntries([...Object.keys(SINAIS), 'queda_forte'].map((id) => [id, semSinais.filter((x) => (id === 'queda_forte' ? x.sinais.some((s) => s.id === 'queda' && s.brusca) : x.sinais.some((s) => s.id === id))).length]));
  const semDono = b.itens.filter((x) => passa(x, q, 'dono'));
  const donos = { '': semDono.length, com: 0, sem: 0, confirmado: 0, consultado: 0 };
  for (const x of semDono) { if (x.dono === 'nenhum' || x.dono === 'lista') donos.sem++; else donos.com++; if (x.dono === 'confirmado') donos.confirmado++; if (x.dono === 'consultado') donos.consultado++; }
  const semCat = b.itens.filter((x) => passa(x, q, 'cat'));
  const cats = { '': semCat.length }; for (const x of semCat) cats[x.categoria] = (cats[x.categoria] || 0) + 1;
  const semBairro = b.itens.filter((x) => passa(x, q, 'bairro'));
  const bm = new Map(); for (const x of semBairro) { if (!x.bairro_k) continue; const o = bm.get(x.bairro_k) || { k: x.bairro_k, nome: x.bairro_nome, n: 0 }; o.n++; bm.set(x.bairro_k, o); }
  const vals = filtrados.map((x) => x.valor).filter(Boolean), m2s = filtrados.map((x) => x.m2).filter(Boolean);
  return {
    total: filtrados.length, pagina: pag, paginas: Math.max(1, Math.ceil(filtrados.length / POR_PAG)), ordem,
    itens: filtrados.slice((pag - 1) * POR_PAG, pag * POR_PAG).map(cartao),
    contagem: { sinais, donos, cats, bairros: [...bm.values()].sort((a, c) => c.n - a.n).slice(0, 80) },
    resumo: { mediana_valor: mediana(vals), mediana_m2: m2s.length ? Math.round(mediana(m2s)) : null, particulares: filtrados.filter((x) => x.anunciante_tipo === 'particular').length },
    leitura: pag === 1 ? leituraIA(b, filtrados, q) : null,
    gerado_em: b.geradoEm,
  };
}

// ---------- "Leitura da IA": o que a base mostra hoje, em frases curtas e clicáveis ----------
function leituraIA(b, filtrados, q) {
  const ativos = filtrados.length ? filtrados : b.ativos;
  const com = (id) => ativos.filter((x) => x.sinais.some((s) => s.id === id));
  const out = [];
  const quedas = com('queda').sort((a, c) => a.sinais.find((s) => s.id === 'queda').pct - c.sinais.find((s) => s.id === 'queda').pct);
  if (quedas.length) {
    const top = quedas[0], s = top.sinais.find((z) => z.id === 'queda');
    out.push({ nivel: 'bad', filtro: { sinais: 'queda', ordem: 'queda' }, id: top.id,
      texto: `${quedas.length} imóve${quedas.length > 1 ? 'is baixaram' : 'l baixou'} de preço. O maior corte: ${Math.abs(s.pct).toLocaleString('pt-BR')}% ${/^(casa|cobertura|ch[aá]cara|sala|loja)/i.test(top.subtipo) ? 'numa' : 'num'} ${String(top.subtipo).toLowerCase()} (${[top.bairro_nome, mi(s.para)].filter(Boolean).join(', ')}).` });
  }
  const partSem = ativos.filter((x) => x.anunciante_tipo === 'particular' && (x.dono === 'nenhum' || x.dono === 'lista') && x.logradouro && x.numero);
  if (partSem.length) out.push({ nivel: 'ok', filtro: { sinais: 'particular', dono: 'sem', numero: '1' }, texto: `${partSem.length} particular${partSem.length > 1 ? 'es' : ''} com endereço completo e dono ainda não buscado: comece por eles (1 crédito cada).` });
  const novos = com('novo').filter((x) => x.idade <= 2);
  if (novos.length) {
    const bairros = new Map(); for (const x of novos) bairros.set(x.bairro_nome, (bairros.get(x.bairro_nome) || 0) + 1);
    const [bTop, bN] = [...bairros].sort((a, c) => c[1] - a[1])[0] || [];
    out.push({ nivel: 'info', filtro: { sinais: 'novo', ordem: 'recentes' }, texto: `${novos.length} anúncio${novos.length > 1 ? 's saíram' : ' saiu'} nos últimos 2 dias${bTop && bN > 1 ? `; mais em ${bTop} (${bN})` : ''}.` });
  }
  const abaixo = com('abaixo').filter((x) => x.dono !== 'confirmado');
  if (abaixo.length) { const t = abaixo.sort((a, c) => a.m2_dif - c.m2_dif)[0]; out.push({ nivel: 'ok', filtro: { sinais: 'abaixo', ordem: 'm2' }, id: t.id, texto: `${abaixo.length} imóve${abaixo.length > 1 ? 'is' : 'l'} com m² bem abaixo do bairro. O mais barato está ${Math.abs(t.m2_dif).toLocaleString('pt-BR')}% abaixo${t.bairro_nome ? ` (${t.bairro_nome})` : ''}.` }); }
  const antigos = com('antigo');
  if (antigos.length) out.push({ nivel: 'warn', filtro: { sinais: 'antigo', ordem: 'antigos' }, texto: `${antigos.length} anúncio${antigos.length > 1 ? 's' : ''} parado${antigos.length > 1 ? 's' : ''} há mais de 90 dias: dono costuma aceitar conversa sobre exclusividade.` });
  const rep = com('repetido');
  if (rep.length) out.push({ nivel: 'gold', filtro: { sinais: 'repetido' }, texto: `${rep.length} anúncios são do mesmo imóvel em mais de uma imobiliária: ninguém tem exclusividade.` });
  const resp = ativos.filter((x) => x.status === 'respondeu').length;
  if (resp) out.unshift({ nivel: 'bad', filtro: { etapa: 'precisa' }, texto: `${resp} proprietário${resp > 1 ? 's responderam' : ' respondeu'} o robô e espera${resp > 1 ? 'm' : ''} o corretor.` });
  if (!out.length) out.push({ nivel: 'info', filtro: {}, texto: 'Nada fora do comum neste filtro. As quedas de preço aparecem conforme a extensão vê o mesmo anúncio de novo no Fisgar.' });
  const semHist = b.ativos.filter((x) => x.hist.length < 2).length;
  return { frases: out.slice(0, 6), base: b.ativos.length, com_historico: b.ativos.length - semHist };
}

function pontos(q) {
  const b = carregaBase();
  return b.itens.filter((x) => x.lat && x.lon && passa(x, q)).sort(ORDENS.nota).slice(0, 3000)
    .map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, valor: x.valor, nota: x.nota, dono: x.dono, tipo: x.subtipo, bairro: x.bairro_nome, logradouro: x.logradouro, numero: x.numero,
      foto: x.fotos[0] || null, sinais: x.sinais.map((s) => s.id), particular: x.anunciante_tipo === 'particular' }));
}
function invalida() { CACHE = { em: 0, chave: '', base: null }; }
module.exports = { pontos, creditos, gravaSaldo, gravaPlano, explorar, carregaBase, analisa, invalida, SINAIS };
