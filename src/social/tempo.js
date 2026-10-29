// Horas de Campinas (America/Sao_Paulo) como texto "AAAA-MM-DD HH:MM", igual ao resto do banco.
// O servidor da Vercel roda em UTC: nada aqui usa o fuso do servidor.
const TZ = 'America/Sao_Paulo';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "2026-10-28 23:05" em Campinas (agora, ou a data dada). */
function local(d = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
const hoje = () => local().slice(0, 10);

/** Soma dias a "AAAA-MM-DD" (calendário puro, sem fuso). */
function somaDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Dia da semana de "AAAA-MM-DD" (0 = domingo). */
const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** Semana ISO ("2026-S44") de um dia. */
function semanaIso(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3);
  const primeira = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((d - primeira) / 864e5 - 3 + ((primeira.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-S${String(n).padStart(2, '0')}`;
}

/** "2026-10-28 09:00" (Campinas) → Date (instante). Campinas não tem horário de verão desde 2019: UTC-3. */
const instante = (s) => new Date(`${String(s).slice(0, 16).replace(' ', 'T')}:00-03:00`);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

module.exports = { local, hoje, somaDias, diaDaSemana, semanaIso, instante, MESES };
