#!/usr/bin/env node
// Acha a posicao de cada imovel da Caixa no mapa.
//
// A lista da Caixa traz endereco escrito, nunca coordenada, e sem coordenada nao da
// para pedir a fachada ao Street View. Aqui o endereco vira lat/lon pelo Nominatim
// (OpenStreetMap), que e gratuito -- em troca pede no maximo uma consulta por segundo
// e um User-Agent que diga quem esta chamando. As duas coisas sao respeitadas abaixo.
//
// A precisao fica gravada junto, e ela importa: so com 'numero' a foto da fachada e
// do imovel certo. Com 'rua' ou 'bairro' o Street View mostraria a casa do vizinho,
// entao a tela nao mostra foto nesses casos.
//
// Uso:  node scripts/caixa-geocodificar.js [--todos] [--limite 300]
//   sem --todos, faz so os da regiao metropolitana de Campinas.

const { Client } = require('pg');

const TODOS = process.argv.includes('--todos');
const LIMITE = Number((process.argv[process.argv.indexOf('--limite') + 1]) || 0) || 100000;
const UA = 'HerreraHouseIA/1.0 (+https://corretordofuturo.app)';
const ESPERA = 1100; // o Nominatim pede no maximo 1 por segundo; 1,1s da folga

// Se o Nominatim devolver um ponto longe demais daqui, errou de cidade: melhor nada.
const CENTRO = { lat: -22.9099, lon: -47.0626 }; // Campinas
const RAIO_KM = 90;

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

function distKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** "RUA X, N. 260, Apto 14, BL. 260-A" -> { rua: 'RUA X', numero: '260' } */
function partes(endereco) {
  const bruto = String(endereco || '').trim();
  if (!bruto) return { rua: null, numero: null };
  const campos = bruto.split(',').map((s) => s.trim()).filter(Boolean);
  const rua = campos[0] || null;
  let numero = null;
  for (const c of campos.slice(1)) {
    const m = c.match(/^N\.?\s*(.+)$/i);
    if (m) { const v = m[1].trim(); numero = /^s\/?n$/i.test(v) ? null : (v.match(/\d+/) || [null])[0]; break; }
  }
  return { rua, numero };
}

async function buscar(params) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    format: 'jsonv2', limit: '1', countrycodes: 'br', ...params,
  });
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(20000) });
  if (r.status === 429) { await dorme(5000); return null; }
  if (!r.ok) throw new Error(`Nominatim respondeu ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) && j[0] ? { lat: Number(j[0].lat), lon: Number(j[0].lon) } : null;
}

/** Tenta do mais preciso para o menos: rua+numero, depois rua, depois bairro. */
async function localizar(im) {
  const { rua, numero } = partes(im.endereco);
  const cidade = im.cidade || '';
  const tentativas = [];
  if (rua && numero) tentativas.push(['numero', { street: `${numero} ${rua}`, city: cidade, state: 'São Paulo' }]);
  if (rua) tentativas.push(['rua', { street: rua, city: cidade, state: 'São Paulo' }]);
  if (im.bairro) tentativas.push(['bairro', { q: `${im.bairro}, ${cidade}, São Paulo` }]);

  for (const [precisao, params] of tentativas) {
    let p = null;
    try { p = await buscar(params); } catch (e) { console.log(`    (${e.message})`); }
    await dorme(ESPERA);
    if (!p) continue;
    if (distKm(CENTRO.lat, CENTRO.lon, p.lat, p.lon) > RAIO_KM) continue; // caiu em outra cidade
    return { ...p, precisao };
  }
  return null;
}

const DDL = `
alter table base.caixa_imoveis add column if not exists lat double precision;
alter table base.caixa_imoveis add column if not exists lon double precision;
alter table base.caixa_imoveis add column if not exists geo_precisao text;
alter table base.caixa_imoveis add column if not exists geo_em text;
create index if not exists ix_caixa_geo on base.caixa_imoveis(geo_em) where saiu_em is null;
`;

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('falta DATABASE_URL');
  const cli = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await cli.connect();
  await cli.query(DDL);

  const { rows } = await cli.query(
    `select numero, endereco, bairro, cidade from base.caixa_imoveis
      where saiu_em is null and geo_em is null ${TODOS ? '' : 'and na_rmc'}
      order by na_rmc desc, desconto desc nulls last limit $1`, [LIMITE]);

  console.log(`${rows.length} imóveis sem posição${TODOS ? '' : ' (só a região)'}`);
  if (!rows.length) { await cli.end(); return; }
  console.log(`isso leva uns ${Math.ceil((rows.length * ESPERA * 1.4) / 60000)} min, porque o OpenStreetMap pede 1 consulta por segundo\n`);

  const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 19);
  const conta = { numero: 0, rua: 0, bairro: 0, nada: 0 };
  let i = 0;
  for (const im of rows) {
    i++;
    const p = await localizar(im);
    if (p) {
      conta[p.precisao]++;
      await cli.query(
        'update base.caixa_imoveis set lat=$1, lon=$2, geo_precisao=$3, geo_em=$4 where numero=$5',
        [p.lat, p.lon, p.precisao, agora(), im.numero]);
    } else {
      conta.nada++;
      await cli.query('update base.caixa_imoveis set geo_precisao=null, geo_em=$1 where numero=$2', [agora(), im.numero]);
    }
    if (i % 10 === 0 || i === rows.length) {
      process.stdout.write(`\r  ${i}/${rows.length}  ·  ${conta.numero} no número, ${conta.rua} na rua, ${conta.bairro} no bairro, ${conta.nada} sem achar`);
    }
  }
  console.log('\n');
  console.log(`no número: ${conta.numero}  (são estes que podem mostrar a fachada)`);
  console.log(`na rua:    ${conta.rua}`);
  console.log(`no bairro: ${conta.bairro}`);
  console.log(`sem achar: ${conta.nada}`);
  await cli.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });