// Redes e publicações · o planejador. Preenche o calendário dos próximos dias com posts gerados
// sozinhos, conforme a cadência do plano: imóveis do portal (rodízio: quem nunca saiu primeiro, depois
// quem saiu há mais tempo), textos do blog (cada um uma vez), a revista da semana e os guias de bairro.
//
// Cada horário do calendário tem uma chave (ex.: "imovel:2026-11-03:1"). Rodar de novo não duplica:
// horário que já tem post fica como está, inclusive se alguém tirou o post do calendário.
// Só mexe no futuro: o que já passou fica como foi.
const { one, all, run } = require('../db');
const tempo = require('./tempo');
const planos = require('./planos');
const C = require('./conteudo');

const HORIZONTE = 35; // dias à frente

function statusInicial() { return planos.ajustes().modo === 'aprovar' ? 'aguardando' : 'agendado'; }
function redesPadrao() { const a = planos.ajustes(); return planos.REDES.filter((r) => a.redes[r] !== false); }

function inserir(p) {
  try {
    return run(`INSERT INTO social_posts(chave,tipo,ref,titulo,legenda,hashtags,link,slides,agendado_para,status,redes,origem)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, p.chave, p.tipo, p.ref, p.titulo, p.legenda, p.hashtags, p.link, JSON.stringify(p.slides),
    p.agendado_para, p.status || statusInicial(), JSON.stringify(p.redes || redesPadrao()), p.origem || 'auto').lastInsertRowid;
  } catch (e) {
    if (/UNIQUE|duplicate key|unique constraint/i.test(e.message)) return null; // outra rodada chegou antes
    throw e;
  }
}

/** Quando cada imóvel/bairro sai (passado e futuro): ref → lista de "AAAA-MM-DD HH:MM". */
function usos(tipo) {
  const m = new Map();
  for (const r of all(`SELECT ref, agendado_para FROM social_posts WHERE tipo=? AND status<>'cancelado' AND ref IS NOT NULL`, tipo)) {
    if (!m.has(r.ref)) m.set(r.ref, []);
    m.get(r.ref).push(r.agendado_para);
  }
  return {
    anterior: (ref, quando) => (m.get(ref) || []).filter((q) => q < quando).sort().pop() || '',
    proximo: (ref, quando) => (m.get(ref) || []).filter((q) => q > quando).sort()[0] || '',
    marca: (ref, quando) => { if (!m.has(ref)) m.set(ref, []); m.get(ref).push(quando); },
  };
}
/** Pode sair neste dia? (nenhuma outra vez a menos de `intervalo` dias, antes ou depois) */
const livre = (u, ref, dia, quando, intervalo) => {
  const a = u.anterior(ref, quando), p = u.proximo(ref, quando);
  return (!a || a.slice(0, 10) <= tempo.somaDias(dia, -intervalo)) && (!p || p.slice(0, 10) >= tempo.somaDias(dia, intervalo));
};
/** Imóveis que já apareceram na revista (código → última semana). */
function ultimasRevista() {
  const m = new Map();
  for (const r of all(`SELECT slides, agendado_para FROM social_posts WHERE tipo='revista' AND status<>'cancelado' ORDER BY agendado_para`)) {
    let s = []; try { s = JSON.parse(r.slides); } catch { s = []; }
    for (const y of s) if (y.k === 'item') m.set(y.codigo, r.agendado_para);
  }
  return m;
}

/** Os horários de um tipo num dia (lista de "HH:MM"), pela cadência. */
const horasDoDia = (regra, dia) => (regra.dias.includes(tempo.diaDaSemana(dia)) ? regra.horas : []);

/**
 * Planeja os próximos dias. Devolve { criados, plano, ... }.
 * `dias` limita o horizonte (testes); `agora` troca o relógio (testes).
 */
async function planejar({ dias = HORIZONTE, agora = tempo.local(), evitar = new Set() } = {}) {
  const cad = planos.cadencia();
  const aj = planos.ajustes();
  const hoje = agora.slice(0, 10);
  const existentes = new Set(all('SELECT chave FROM social_posts WHERE agendado_para >= ?', `${hoje} 00:00`).map((r) => r.chave));
  const [ims, artigos, bairros] = await Promise.all([C.imoveis(), C.blog(), C.bairros()]);
  let criados = 0;
  const pulados = [];

  // ---------- imóveis
  const uImovel = usos('imovel');
  const porDia = Math.max(1, cad.imoveis.horas.length);
  const intervaloMin = ims.length >= 10 * porDia ? 7 : ims.length >= 4 * porDia ? 3 : 1; // dias até o mesmo imóvel voltar
  // ---------- revista
  const uRev = ultimasRevista();
  // ---------- blog
  const blogUsados = new Set(all(`SELECT ref FROM social_posts WHERE tipo='blog' AND status<>'cancelado'`).map((r) => r.ref));
  const uBairro = usos('bairro');

  for (let i = 0; i < dias; i++) {
    const dia = tempo.somaDias(hoje, i);

    // imóveis (rodízio)
    horasDoDia(cad.imoveis, dia).forEach((hora, k) => {
      const quando = `${dia} ${hora}`;
      const chave = `imovel:${dia}:${k + 1}`;
      if (quando <= agora || existentes.has(chave) || !ims.length) return;
      const candidatos = ims.filter((x) => !evitar.has(x.imovel.codigo) && livre(uImovel, x.imovel.codigo, dia, quando, intervaloMin))
        .sort((a, b) => {
          const ua = uImovel.anterior(a.imovel.codigo, quando), ub = uImovel.anterior(b.imovel.codigo, quando);
          if (ua !== ub) return ua < ub ? -1 : 1; // nunca saiu (vazio) primeiro, depois o que saiu há mais tempo
          return Date.parse(b.pagina.publicadoEm || 0) - Date.parse(a.pagina.publicadoEm || 0) || b.imovel.fotos.length - a.imovel.fotos.length;
        });
      const x = candidatos[0];
      if (!x) { pulados.push(chave); return; }
      const l = C.legendaImovel(x);
      if (inserir({ chave, tipo: 'imovel', ref: x.imovel.codigo, titulo: x.pagina.titulo, legenda: l.legenda, hashtags: l.hashtags, link: `/imoveis/${x.pagina.slug}`, slides: C.slidesImovel(x), agendado_para: quando })) {
        criados++; uImovel.marca(x.imovel.codigo, quando); existentes.add(chave);
      }
    });

    // blog (cada texto uma vez, o mais novo que já estiver publicado naquele horário)
    horasDoDia(cad.blog, dia).forEach((hora, k) => {
      const quando = `${dia} ${hora}`;
      const chave = `blog:${dia}:${k + 1}`;
      if (quando <= agora || existentes.has(chave)) return;
      const t = tempo.instante(quando).getTime();
      const a = artigos.filter((y) => !blogUsados.has(y.slug) && Date.parse(y.publicadoEm) <= t && Date.parse(y.publicadoEm) > t - 21 * 864e5)
        .sort((p, q) => Date.parse(q.publicadoEm) - Date.parse(p.publicadoEm))[0];
      if (!a) return; // nada novo ainda: a próxima rodada tenta de novo
      const l = C.legendaBlog(a);
      if (inserir({ chave, tipo: 'blog', ref: a.slug, titulo: a.titulo, legenda: l.legenda, hashtags: l.hashtags, link: `/blog/${a.slug}`, slides: [{ k: 'capa' }], agendado_para: quando })) {
        criados++; blogUsados.add(a.slug); existentes.add(chave);
      }
    });

    // guia de bairro (rodízio)
    horasDoDia(cad.bairro, dia).forEach((hora, k) => {
      const quando = `${dia} ${hora}`;
      const chave = `bairro:${dia}:${k + 1}`;
      if (quando <= agora || existentes.has(chave) || !bairros.length) return;
      const x = bairros.filter((y) => livre(uBairro, y.bairro.slug, dia, quando, 28)).sort((a, b) => {
        const ua = uBairro.anterior(a.bairro.slug, quando), ub = uBairro.anterior(b.bairro.slug, quando);
        return ua === ub ? (b.bairro.prioridade || 0) - (a.bairro.prioridade || 0) : ua < ub ? -1 : 1;
      })[0];
      if (!x) return; // o mesmo bairro só volta depois de 4 semanas
      const l = C.legendaBairro(x);
      if (inserir({ chave, tipo: 'bairro', ref: x.bairro.slug, titulo: `Guia do bairro: ${x.bairro.nome}`, legenda: l.legenda, hashtags: l.hashtags, link: `/bairros/${x.bairro.slug}`, slides: [{ k: 'capa' }], agendado_para: quando })) {
        criados++; uBairro.marca(x.bairro.slug, quando); existentes.add(chave);
      }
    });

    // revista da semana (uma por semana, com 4 imóveis que não saíram na revista há mais tempo; nunca a seleção Signature)
    horasDoDia(cad.revista, dia).forEach((hora) => {
      const quando = `${dia} ${hora}`;
      const chave = `revista:${tempo.semanaIso(dia)}`;
      if (quando <= agora || existentes.has(chave)) return;
      const itens = ims.filter((x) => !C.ehSignature(x.imovel))
        .sort((a, b) => {
          const ua = uRev.get(a.imovel.codigo) || '', ub = uRev.get(b.imovel.codigo) || '';
          return ua === ub ? Math.min(b.imovel.fotos.length, 20) - Math.min(a.imovel.fotos.length, 20) : ua < ub ? -1 : 1;
        }).slice(0, 4);
      if (!itens.length) return;
      const rotulo = C.rotuloSemana(dia);
      const l = C.legendaRevista(itens, rotulo);
      if (inserir({ chave, tipo: 'revista', ref: tempo.semanaIso(dia), titulo: `Revista ${require('../config').CLIENTE_NOME} · ${rotulo}`, legenda: l.legenda, hashtags: l.hashtags, link: '/imoveis/revista', slides: C.slidesRevista(itens), agendado_para: quando })) {
        criados++; itens.forEach((x) => uRev.set(x.imovel.codigo, quando)); existentes.add(chave);
      }
    });
  }
  require('../db').setConfig('social_planejado_em', agora);
  return { criados, plano: cad.plano, imoveis: ims.length, textos: artigos.length, bairros: bairros.length, semConteudo: pulados.length, pausado: aj.pausado };
}

/** Post feito à mão a partir de imóveis escolhidos na tela (um por horário, nos dias pedidos). */
async function postsDeImoveis(codigos, { inicio, hora = '12:00', intervaloDias = 1 } = {}) {
  const ims = await C.imoveis();
  const porCodigo = new Map(ims.map((x) => [x.imovel.codigo, x]));
  const agora = tempo.local();
  let dia = inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : tempo.hoje();
  const h = /^\d{2}:\d{2}$/.test(hora) ? hora : '12:00';
  const criados = [], fora = [];
  for (const c of codigos) {
    const x = porCodigo.get(String(c).toUpperCase());
    if (!x) { fora.push(c); continue; }
    let quando = `${dia} ${h}`;
    if (quando <= agora) { dia = tempo.somaDias(dia, 1); quando = `${dia} ${h}`; }
    const l = C.legendaImovel(x);
    const id = inserir({ chave: `manual:${x.imovel.codigo}:${quando}:${Date.now()}`, tipo: 'imovel', ref: x.imovel.codigo, titulo: x.pagina.titulo, legenda: l.legenda, hashtags: l.hashtags, link: `/imoveis/${x.pagina.slug}`, slides: C.slidesImovel(x), agendado_para: quando, origem: 'manual', status: 'agendado' });
    if (id) criados.push(id);
    dia = tempo.somaDias(dia, Math.max(0, intervaloDias));
  }
  return { criados, fora };
}

/** Libera o horário de um post (para o planejador pôr outro conteúdo no lugar). */
function liberar(post, motivo) {
  run(`UPDATE social_posts SET chave=?, status='cancelado', motivo=?, atualizado_em=datetime('now','localtime') WHERE id=?`, `${post.chave}#x${post.id}`, motivo || null, post.id);
}

/** Troca o conteúdo de um post de imóvel pelo próximo do rodízio (mesmo horário). */
async function trocar(post) {
  liberar(post, 'trocado na tela');
  const r = await planejar({ dias: Math.max(1, Math.ceil((tempo.instante(post.agendado_para) - Date.now()) / 864e5) + 1), evitar: new Set([post.ref]) });
  const novo = one('SELECT id FROM social_posts WHERE chave=?', post.chave);
  return { ...r, novo: novo ? novo.id : null };
}

module.exports = { planejar, postsDeImoveis, liberar, trocar, HORIZONTE };
