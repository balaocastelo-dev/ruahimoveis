// Campinas: consulta única em andamento, cache em memória e falha silenciosa.
const URL_CLIMA = 'https://api.open-meteo.com/v1/forecast?latitude=-22.905&longitude=-47.06&current=temperature_2m,weather_code,is_day';
function criaConsulta({ buscar = (...args) => fetch(...args), agora = () => Date.now() } = {}) {
  let valor = {}, expira = 0, pendente = null;
  return async function clima() {
    if (agora() < expira) return valor;
    if (pendente) return pendente;
    pendente = (async () => {
      let novo = {};
      try {
        const r = await buscar(URL_CLIMA, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const c = (await r.json()).current;
          if (c && Number.isFinite(c.temperature_2m) && Number.isInteger(c.weather_code) && [0, 1].includes(c.is_day)) {
            novo = { temperature_2m: c.temperature_2m, weather_code: c.weather_code, is_day: c.is_day };
          }
        }
      } catch {}
      valor = novo; expira = agora() + 15 * 60e3;
      return valor;
    })();
    try { return await pendente; } finally { pendente = null; }
  };
}
module.exports = { clima: criaConsulta(), criaConsulta };
