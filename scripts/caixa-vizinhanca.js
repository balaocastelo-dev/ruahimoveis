#!/usr/bin/env node
// O que existe em volta de cada imovel da Caixa, pelo OpenStreetMap.
//
// "Detalhes da vizinhanca" so vale se for verdade. Em vez de escrever texto generico
// sobre o bairro, aqui se pergunta ao mapa o que realmente existe a pe do endereco:
// escola, mercado, farmacia, saude, ponto de onibus, praca. Sai numero e distancia,
// nao adjetivo.
//
// A tabela de bairros do sistema so cobre Campinas, e a maioria destes imoveis esta
// em Sumare, Santa Barbara e Monte Mor -- por isso a vizinhanca vem do mapa, que
// cobre a regiao inteira.
//
// Fonte: Overpass (OpenStreetMap), gratuito. Em troca pede parcimonia: uma consulta
// por vez, com intervalo, e User-Agent dizendo quem chama.
//
// Uso:  node scripts/caixa-vizinhanca.js [--todos] [--limite 300] [--raio 1200]

const { Client } = require('pg');

const TODOS = process.argv.includes('--todos');
const LIMITE = Number(process.argv[process.argv.indexOf('--limite') + 1]) || 100000;
const RAIO = Number(process.argv[process.argv.indexOf('--raio') + 1]) || 1200;
const UA = { 'User-Agent': 'HerreraHouseIA/1.0 (+https://corretordofuturo.app)', 'Accept': 'application/json' };
const ESPERA = 2500; // o Overpass e um servico comunitario: sem pressa
// Os dois espelhos mais conhecidos do Overpass nao sao alcancaveis desta rede (um
// recusa o TLS, o outro nao responde). O da Suica atende em menos de um segundo,
// entao vai na frente; os outros ficam de reserva para o dia em que voltarem.
const ESPELHOS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// O que interessa a quem vai morar, agrupado como a pessoa pensa, nao como o
// OpenStreetMap etiqueta.
const GRUPOS = [
  ['escola', (t) => ['school', 'kindergarten', 'college', 'university'].includes(t.amenity)],
  ['mercado', (t) => ['supermarket', 'convenience', 'greengrocer', 'butcher'].includes(t.shop)],
  ['padaria', (t) => t.shop === 'bakery'],
  ['farmacia', (t) => t.amenity === 'pharmacy'],
  ['saude', (t) => ['hospital', 'clinic', 'doctors', 'dentist'].includes(t.amenity)],
  ['onibus', (t) => t.highway === 'bus_stop' || t.amenity === 'bus_station' || t.public_transport === 'platform'],
  ['praca', (t) => ['park', 'playground', 'pitch', 'sports_centre'].includes(t.leisure) || t.landuse === 'recreation_ground'],
  ['banco', (t) => ['bank', 'atm'].includes(t.amenity)],
];

const ROTULOS = {
  escola: ['escola', 'escolas'], mercado: ['mercado', 'mercados'], padaria: ['padaria', 'padarias'],
  farmacia: ['farmácia', 'farmácias'], saude: ['posto ou clínica', 'postos e clínicas'],
  onibus: ['ponto de ônibus', 'pontos de ônibus'], praca: ['praça ou quadra', 'praças e quadras'],
  banco: ['banco', 'bancos'],
};

function distM(aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

function consulta(lat, lon) {
  return `[out:json][timeout:25];
(
  node(around:${RAIO},${lat},${lon})["amenity"~"^(school|kindergarten|college|university|pharmacy|hospital|clinic|doctors|dentist|bank|atm|bus_station)$"];
  node(around:${RAIO},${lat},${lon})["shop"~"^(supermarket|convenience|greengrocer|butcher|bakery)$"];
  node(around:${Math.min(RAIO, 900)},${lat},${lon})["highway"="bus_stop"];
  way(around:${RAIO},${lat},${lon})["leisure"~"^(park|playground|pitch|sports_centre)$"];
);
out center tags 120;`;
}

async function perguntar(lat, lon) {
  let ultimoErro = null;
  for (const url of ESPELHOS) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { ...UA, 'Content-Type': 'text/plain' },
        body: consulta(lat, lon), signal: AbortSignal.timeout(20000),
      });
      if (r.status === 429 || r.status === 504) { ultimoErro = new Error(`espelho ocupado (${r.status})`); await dorme(6000); continue; }
      if (!r.ok) { ultimoErro = new Error(`Overpass respondeu ${r.status}`); continue; }
      return (await r.json()).elements || [];
    } catch (e) { ultimoErro = e; }
  }
  throw ultimoErro || new Error('Overpass não respondeu');
}

/** Transforma a resposta crua em algo que cabe numa frase: contagem e o mais perto. */
function resumir(elementos, lat, lon) {
  const achados = {};
  for (const e of elementos) {
    const t = e.tags || {};
    const p = e.center || e;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const grupo = GRUPOS.find(([, cabe]) => cabe(t));
    if (!grupo) continue;
    const g = grupo[0];
    const d = distM(lat, lon, p.lat, p.lon);
    if (d > RAIO) continue;
    achados[g] = achados[g] || { n: 0, perto: null };
    achados[g].n++;
    const nome = t.name || null;
    if (!achados[g].perto || d < achados[g].perto.dist) achados[g].perto = { nome, dist: d };
  }
  const itens = Object.entries(achados)
    .map(([g, v]) => ({ grupo: g, n: v.n, rotulo: ROTULOS[g][v.n === 1 ? 0 : 1], perto: v.perto }))
    .sort((a, b) => b.n - a.n);
  return { raio: RAIO, itens, total: itens.reduce((s, i) => s + i.n, 0) };
}

const DDL = `
create table if not exists base.caixa_vizinhanca (
  numero text primary key,
  dados jsonb not null,
  visto_em text not null
);
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
    `select i.numero, i.lat, i.lon from base.caixa_imoveis i
      left join base.caixa_vizinhanca v on v.numero = i.numero
      where i.saiu_em is null and i.lat is not null and v.numero is null
        and i.geo_precisao in ('numero','rua') ${TODOS ? '' : 'and i.na_rmc'}
      order by i.na_rmc desc, i.desconto desc nulls last limit $1`, [LIMITE]);

  console.log(`${rows.length} imóveis sem vizinhança levantada`);
  if (!rows.length) { await cli.end(); return; }
  console.log(`isso leva uns ${Math.ceil((rows.length * ESPERA) / 60000)} min: o Overpass é serviço comunitário e se pede com calma\n`);

  const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 19);
  let ok = 0, vazios = 0, erros = 0;
  for (let i = 0; i < rows.length; i++) {
    const im = rows[i];
    let r = null;
    try { r = resumir(await perguntar(im.lat, im.lon), im.lat, im.lon); }
    catch (e) { erros++; console.log(`\n  ${im.numero}: ${e.message}`); await dorme(5000); continue; }
    if (r.total) ok++; else vazios++;
    await cli.query(
      `insert into base.caixa_vizinhanca(numero, dados, visto_em) values ($1,$2,$3)
       on conflict (numero) do update set dados = excluded.dados, visto_em = excluded.visto_em`,
      [im.numero, JSON.stringify(r), agora()]);
    await dorme(ESPERA);
    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${rows.length}  ·  ${ok} com vizinhança, ${vazios} sem nada por perto, ${erros} erro`);
    }
  }
  console.log('\n');
  console.log(`com vizinhança: ${ok}`);
  console.log(`sem nada mapeado por perto: ${vazios}`);
  if (erros) console.log(`falharam: ${erros} (rode de novo)`);
  await cli.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });