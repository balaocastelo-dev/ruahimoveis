// Redes e publicações · cadência pelo plano da imobiliária e os ajustes da tela.
//
// O plano vem do cadastro da plataforma (plataforma.imobiliarias.plano), lido pela função
// plataforma.meu_plano(), que só devolve o plano de quem pergunta. Sem a função (banco local, testes)
// vale a variável PLANO e, por fim, "profissional".
//
//   Essencial      imóveis seg/qua/sex · blog ter/qui · revista sábado
//   Profissional   imóvel todo dia · blog seg a sex · bairro quarta · revista sábado
//   Rede/Fundador  2 imóveis por dia · blog todo dia · bairros terça e sexta · revista sábado
//
// Dia da semana como no JavaScript: 0 = domingo … 6 = sábado. Horário de Campinas.

const { one, getConfig, setConfig, PG } = require('../db');

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const PLANOS = {
  essencial: {
    nome: 'Essencial',
    imoveis: { dias: [1, 3, 5], horas: ['12:00'] },
    blog: { dias: [2, 4], horas: ['09:00'] },
    bairro: { dias: [], horas: ['18:30'] },
    revista: { dias: [6], horas: ['10:00'] },
  },
  profissional: {
    nome: 'Profissional',
    imoveis: { dias: TODOS, horas: ['12:00'] },
    blog: { dias: [1, 2, 3, 4, 5], horas: ['09:00'] },
    bairro: { dias: [3], horas: ['18:30'] },
    revista: { dias: [6], horas: ['10:00'] },
  },
  rede: {
    nome: 'Rede',
    imoveis: { dias: TODOS, horas: ['12:00', '19:00'] },
    blog: { dias: TODOS, horas: ['09:00'] },
    bairro: { dias: [2, 5], horas: ['18:30'] },
    revista: { dias: [6], horas: ['10:00'] },
  },
};
PLANOS.fundador = { ...PLANOS.rede, nome: 'Fundador' };

let cachePlano = { em: 0, valor: null };
/** O plano desta imobiliária (essencial, profissional, rede ou fundador). */
function plano() {
  if (Date.now() - cachePlano.em < 10 * 60e3 && cachePlano.valor) return cachePlano.valor;
  let p = null;
  if (PG) {
    try { const r = one('SELECT plataforma.meu_plano() AS p'); p = r && r.p; } catch { /* função ainda não instalada */ }
  }
  p = String(p || process.env.PLANO || 'profissional').toLowerCase().trim();
  if (!PLANOS[p]) p = 'profissional';
  cachePlano = { em: Date.now(), valor: p };
  return p;
}

const REDES = ['instagram', 'facebook', 'google'];
const PADRAO = { modo: 'automatico', pausado: false, redes: { instagram: true, facebook: true, google: true }, tipos: { imovel: true, blog: true, revista: true, bairro: true } };

/** Ajustes da tela (modo de aprovação, pausa, redes e tipos ligados). */
function ajustes() {
  let a = {};
  try { a = JSON.parse(getConfig('social_ajustes') || '{}'); } catch { a = {}; }
  return {
    modo: a.modo === 'aprovar' ? 'aprovar' : 'automatico',
    pausado: !!a.pausado,
    redes: { ...PADRAO.redes, ...(a.redes || {}) },
    tipos: { ...PADRAO.tipos, ...(a.tipos || {}) },
  };
}
function salvaAjustes(b = {}) {
  const a = ajustes();
  if (b.modo !== undefined) a.modo = b.modo === 'aprovar' ? 'aprovar' : 'automatico';
  if (b.pausado !== undefined) a.pausado = !!b.pausado;
  if (b.redes && typeof b.redes === 'object') for (const r of REDES) if (b.redes[r] !== undefined) a.redes[r] = !!b.redes[r];
  if (b.tipos && typeof b.tipos === 'object') for (const t of Object.keys(PADRAO.tipos)) if (b.tipos[t] !== undefined) a.tipos[t] = !!b.tipos[t];
  setConfig('social_ajustes', JSON.stringify(a));
  return a;
}

/** A cadência em vigor (do plano), com os tipos desligados nos ajustes zerados. */
function cadencia() {
  const p = plano();
  const base = PLANOS[p];
  const aj = ajustes();
  const c = {};
  for (const t of ['imoveis', 'blog', 'bairro', 'revista']) {
    const chaveTipo = t === 'imoveis' ? 'imovel' : t;
    c[t] = aj.tipos[chaveTipo] === false ? { dias: [], horas: base[t].horas } : base[t];
  }
  const porSemana = (x) => x.dias.length * x.horas.length;
  return { plano: p, nome: base.nome, ...c, resumo: { imoveis: porSemana(c.imoveis), blog: porSemana(c.blog), bairro: porSemana(c.bairro), revista: porSemana(c.revista) } };
}

module.exports = { PLANOS, REDES, plano, ajustes, salvaAjustes, cadencia, limpar: () => { cachePlano = { em: 0, valor: null }; } };
