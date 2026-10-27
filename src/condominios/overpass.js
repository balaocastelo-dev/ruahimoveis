// Condomínios · consulta ao OpenStreetMap (Overpass) com cache no banco (condominio_cache).
const { one, run } = require('../db');

const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

async function overpass(q, ms = 25000) {
  let ultimo;
  for (const url of SERVIDORES.slice(0, 2)) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'SistemaRUAH/1.0 (imoveisruah@gmail.com)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(ms),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { ultimo = e; }
  }
  const e = new Error('O mapa aberto (OpenStreetMap) não respondeu agora. Tente de novo em instantes.');
  e.status = 503; e.causa = ultimo && ultimo.message;
  throw e;
}

// Lê do cache; se não houver (ou estiver velho), gera e guarda.
async function comCache(condominioId, tipo, dias, gerar) {
  const c = one('SELECT json, gerado_em FROM condominio_cache WHERE condominio_id=? AND tipo=?', condominioId, tipo);
  if (c && (Date.now() - new Date(c.gerado_em.replace(' ', 'T')).getTime()) / 864e5 < dias) return JSON.parse(c.json);
  const dado = await gerar();
  const json = JSON.stringify(dado);
  run(`INSERT INTO condominio_cache(condominio_id,tipo,json,gerado_em) VALUES(?,?,?,datetime('now','localtime'))
    ON CONFLICT(condominio_id,tipo) DO UPDATE SET json=excluded.json, gerado_em=excluded.gerado_em`, condominioId, tipo, json);
  return dado;
}
const apagaCache = (condominioId, tipo) => run('DELETE FROM condominio_cache WHERE condominio_id=?' + (tipo ? ' AND tipo=?' : ''), ...(tipo ? [condominioId, tipo] : [condominioId]));

module.exports = { overpass, comCache, apagaCache };
