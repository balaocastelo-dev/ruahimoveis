// Condomínios · baixa do OpenStreetMap os prédios e condomínios de Campinas (roda no PC).
// Gera data/condominios/osm_centros.json (prédios e condomínios com nome/andares, ponto central)
// e data/condominios/osm_areas.json (contorno dos condomínios horizontais, para achar a casa pelo ponto no mapa).
// Uso: node scripts/condominios-osm.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '..', 'data', 'condominios');
fs.mkdirSync(DIR, { recursive: true });
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const AREA = 'area["name"="Campinas"]["admin_level"="8"]["boundary"="administrative"]->.a;';

export async function overpass(q, ms = 300000) {
  let ultimo;
  for (const url of SERVIDORES) {
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'HerreraHOUSEIA/1.0 (imoveisruah@gmail.com)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(ms),
        });
        if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
        return await r.json();
      } catch (e) { ultimo = e; console.log('  tentativa falhou:', e.message); await new Promise((ok) => setTimeout(ok, 8000)); }
    }
  }
  throw ultimo;
}

async function main() {
  console.log('1/2 prédios e condomínios (pontos)…');
  const centros = await overpass(`[out:json][timeout:300];${AREA}(
    nwr["building"]["name"](area.a);
    nwr["building"="apartments"](area.a);
    way["building"]["building:levels"](if: number(t["building:levels"])>=4)(area.a);
    nwr["landuse"="residential"]["name"](area.a);
    nwr["residential"="gated"](area.a);
  );out tags center;`);
  fs.writeFileSync(path.join(DIR, 'osm_centros.json'), JSON.stringify(centros));
  console.log('   ', centros.elements.length, 'elementos');

  console.log('2/2 contornos dos condomínios horizontais…');
  const areas = await overpass(`[out:json][timeout:300];${AREA}(
    way["landuse"="residential"]["name"](area.a);
    way["residential"="gated"](area.a);
    way["barrier"="wall"]["name"](area.a);
  );out tags geom;`);
  fs.writeFileSync(path.join(DIR, 'osm_areas.json'), JSON.stringify(areas));
  console.log('   ', areas.elements.length, 'contornos');
  fs.writeFileSync(path.join(DIR, 'osm_ok.txt'), new Date().toISOString());
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1].endsWith('condominios-osm.mjs')) {
  main().catch((e) => { console.error('ERRO', e.message); fs.writeFileSync(path.join(DIR, 'osm_erro.txt'), String(e.stack)); process.exit(1); });
}
