// Teste do Mercado (Bairro → Rua → Imóvel), do 3D por imóvel do Fisguei e da foto de fachada (Google simulado).
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-mk-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL; delete process.env.GOOGLE_MAPS_KEY;
const assert = require('assert');
const O = require('../src/condominios/overpass');
O.overpass = async () => ({ elements: [] });
const app = require('../server');
const { run } = require('../src/db');

// Google simulado (só as URLs do Street View); o resto passa para o fetch de verdade (o servidor local)
const fetchReal = global.fetch; let chamadasGoogle = 0;
global.fetch = async (url, op) => {
  const u = String(url);
  if (u.includes('streetview/metadata')) { chamadasGoogle++; return new Response(JSON.stringify({ status: 'OK', copyright: '© Google', pano_id: 'abc', location: { lat: -22.90180, lng: -47.07570 }, date: '2025-03' })); }
  if (u.includes('maps.googleapis.com/maps/api/streetview')) { chamadasGoogle++; return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])); }
  return fetchReal(url, op);
};

(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body) => {
    const r = await fetchReal(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };
  ok(await req('POST', '/api/setup', { nome: 'Thiago Adm', email: 'adm@ruah.com', senha: 'Teste1234' }), 'setup');

  const add = (id, bairro, rua, num, valor, area, part, lat, lon, tipo = 'Apartamento') => run(`INSERT INTO fisguei_anuncios(fisgar_id,tipo,logradouro,numero,bairro,cidade,valor,area_util,anunciante_tipo,lat,lon,status,fotos)
    VALUES(?,?,?,?,?,'Campinas',?,?,?,?,?,'novo',?)`, id, tipo, rua, num, bairro, valor, area, part ? 'particular' : 'imobiliaria', lat, lon, JSON.stringify(['https://exemplo.com/f.jpg']));
  add('m1', 'Cambuí', 'Rua Coronel Quirino', '1000', 1500000, 150, 1, -22.90172, -47.07559);
  add('m2', 'CAMBUI', 'Rua Coronel Quirino', '1200', 2500000, 200, 0, -22.9019, -47.0757);
  add('m3', 'Cambuí', 'Rua Maria Monteiro', '50', 1200000, 120, 0, -22.9010, -47.0750);
  add('m4', 'Taquaral', 'Rua Hermantino Coelho', '10', 3000000, 300, 1, -22.87, -47.05, 'Casa');
  add('m5', 'Taquaral', 'Rua X', '1', 800000, 90, 1, -22.87, -47.05);  // abaixo de 1 mi
  // o mesmo imóvel anunciado de novo (outra imobiliária, outro bairro escrito, preço novo e metragem 1 m² diferente)
  add('m7', 'Cambuí', 'R. Coronel Quirino', '1000', 1450000, 151, 0, -22.90172, -47.07559);
  add('m8', 'Taquaral', 'Rua Hermantino Coelho', '10', 3000000, 300, 0, -22.87, -47.05, 'Casa Padrão');
  run("INSERT INTO fisguei_anuncios(fisgar_id,tipo,bairro,cidade,valor,status) VALUES('m6','Apartamento','Centro','Valinhos',5000000,'novo')"); // outra cidade

  const r = ok(await req('GET', '/api/mercado/resumo'), 'resumo (≥ R$ 1 mi, só Campinas)');
  assert.equal(r.total, 4); assert.equal(r.anuncios, 6); assert.equal(r.repetidos, 2); assert.equal(r.bairros.length, 2);
  const camb = r.bairros.find((b) => b.chave === 'CAMBUI'); assert.equal(camb.n, 3, 'junta Cambuí e CAMBUI'); assert.equal(camb.nome, 'Cambuí');
  assert.equal((await req('GET', '/api/mercado/resumo?min=0')).j.total, 5);
  assert.equal((await req('GET', '/api/mercado/resumo?particular=1')).j.total, 2);
  const ruas = ok(await req('GET', '/api/mercado/ruas?bairro=CAMBUI'), 'ruas do bairro'); assert.equal(ruas[0].nome, 'Rua Coronel Quirino'); assert.equal(ruas[0].n, 2);
  const im = ok(await req('GET', '/api/mercado/imoveis?bairro=CAMBUI&rua=RUA%20CORONEL%20QUIRINO'), 'imóveis da rua'); assert.deepEqual(im.map((x) => x.numero), ['1000', '1200']);
  assert.equal(im[0].anuncios, 2); assert.equal(im[0].valor_min, 1450000); assert.equal(im[0].outros.length, 1);
  const ig = ok(await req('GET', `/api/mercado/iguais/${im[0].id}`), 'outros anúncios do mesmo imóvel'); assert.equal(ig.length, 1);
  assert.equal(im[0].foto, 'https://exemplo.com/f.jpg'); assert.match(im[0].ref, /^FG-/);
  assert.equal(ok(await req('GET', '/api/mercado/mapa'), 'mapa').length, 4);
  // lotes diferentes no mesmo endereço, sem metragem e com preços diferentes, continuam separados
  const { unicos } = require('../src/routes/mercado');
  assert.equal(unicos([{ id: 1, tipo: 'Terreno', logradouro: 'Av A', numero: '1', valor: 1e6 }, { id: 2, tipo: 'Terreno', logradouro: 'Avenida A', numero: '1', valor: 1.2e6 }, { id: 3, tipo: 'Terreno', logradouro: 'A', numero: '1', valor: 1e6 }]).length, 2);

  // 3D da rua (prédios da base de blocos do teste dos condomínios)
  for (const arq of ['condominio-predios3d.jsonl', 'condominio-mapa3d.jsonl']) {
    const tab = arq.includes('mapa') ? 'mapa3d' : 'predios3d';
    for (const l of fs.readFileSync(path.join(__dirname, arq), 'utf8').split('\n').filter(Boolean)) { const t = JSON.parse(l); run(`INSERT INTO ${tab}(tile,dados) VALUES(?,?)`, t.t, Buffer.from(t.d, 'base64')); }
  }
  const c3 = ok(await req('GET', `/api/mercado/3d/${im[0].id}`), '3D da rua do imóvel');
  assert.ok(c3.cena.predios.length > 50 && c3.cena.predios.some((b) => b.alvo), 'imóvel destacado'); assert.equal(c3.imovel.codigo, im[0].ref);
  const casa = ok(await req('GET', `/api/mercado/3d/${r.bairros.find((b) => b.chave === 'TAQUARAL') && (await req('GET', '/api/mercado/imoveis?bairro=TAQUARAL')).j[0].id}`), '3D de casa');
  assert.ok(casa.cena.alvo.casa);
  ok(await req('GET', `/api/mercado/perto/${im[0].id}`), 'perto do imóvel');

  // fachada: sem chave não chama o Google; com chave busca uma vez e guarda
  let f = await fetchReal(`${base}/api/fachada?ref=fg${im[0].id}`, { headers: { cookie } }); assert.equal(f.status, 404); assert.equal(chamadasGoogle, 0);
  assert.equal((await req('GET', '/api/mapas/config')).j.fachada, false);
  process.env.GOOGLE_MAPS_KEY = 'teste';
  f = await fetchReal(`${base}/api/fachada?ref=fg${im[0].id}`, { headers: { cookie } }); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/jpeg');
  f = await fetchReal(`${base}/api/fachada?ref=fg${im[0].id}`, { headers: { cookie } }); assert.equal(f.status, 200);
  assert.equal(chamadasGoogle, 2, 'segunda vez sai do banco, sem pagar de novo'); console.log('ok · fachada guardada (paga uma vez)');
  assert.equal((await req('GET', '/api/mapas/config')).j.google3d, true);
  assert.equal((await fetchReal(`${base}/api/fachada?ref=xx1`, { headers: { cookie } })).status, 404);

  // ---------- as quatro vitrines ----------
  const addV = (id, tipo, fin, valor, extra = {}) => run(`INSERT INTO fisguei_anuncios(fisgar_id,tipo,finalidade,logradouro,numero,bairro,cidade,valor,area_util,area_total,anunciante_tipo,lat,lon,status,fotos)
    VALUES(?,?,?,?,?,'Cambuí','Campinas',?,?,?,'particular',-22.9,-47.07,'novo',?)`, id, tipo, fin, extra.rua || 'Rua V', extra.num || id.replace(/\D/g, ''), valor, extra.au || null, extra.at || null, JSON.stringify(['https://exemplo.com/' + id + '.jpg']));
  addV('v1', 'Terreno', 'Residencial', 1200000, { at: 600 });
  addV('v2', 'Terreno', 'Comercial', 2000000, { at: 1000 });
  addV('v3', 'Galpão', 'Comercial', 3000000, { au: 1500 });
  addV('v4', 'Casa Padrão', 'Comercial', 1500000, { au: 300 });
  addV('v5', 'Sala Comercial', 'Comercial', 1100000, { au: 80 });
  addV('v6', 'Apartamento Padrão', 'Residencial', 600000, { au: 70 });
  addV('v7', 'Sobrado', 'Residencial', 1300000, { au: 250 });
  const { categoria, subtipo } = require('../src/routes/mercado');
  assert.equal(categoria({ tipo: 'Galpão', finalidade: 'Comercial' }), 'comerciais');
  assert.equal(categoria({ tipo: 'Casa Padrão', finalidade: 'Comercial' }), 'comerciais');
  assert.equal(categoria({ tipo: 'Terreno', finalidade: 'Comercial' }), 'terrenos');
  assert.equal(categoria({ tipo: 'Apartamento Padrão' }), 'apartamentos');
  assert.equal(categoria({ tipo: 'Outros', finalidade: 'Residencial' }), 'casas');
  assert.equal(subtipo({ tipo: 'Galpão', finalidade: 'Comercial' }), 'Galpão / barracão');
  const rt = ok(await req('GET', '/api/mercado/resumo?cat=terrenos'), 'vitrine Terrenos');
  assert.equal(rt.total, 2); assert.equal(rt.categorias.terrenos.n, 2); assert.equal(rt.categorias.apartamentos.n, 5, 'apartamentos: qualquer valor por padrão');
  assert.deepEqual(rt.subtipos.map((x) => x.nome).sort(), ['Terreno comercial', 'Terreno residencial']);
  assert.equal(rt.m2, Math.round(((1200000 / 600) + (2000000 / 1000)) / 2), 'R$/m² do terreno pela área total');
  assert.ok(rt.bairros[0].foto, 'bairro com foto de capa');
  const rc = ok(await req('GET', '/api/mercado/resumo?cat=comerciais'), 'vitrine Salas e barracões'); assert.equal(rc.total, 3);
  assert.equal((await req('GET', '/api/mercado/resumo?cat=comerciais&sub=' + encodeURIComponent('Galpão / barracão'))).j.total, 1);
  const rca = ok(await req('GET', '/api/mercado/resumo?cat=casas'), 'vitrine Casas'); assert.equal(rca.total, 2, 'casa + sobrado (casa comercial fica fora)');
  const rap = ok(await req('GET', '/api/mercado/resumo?cat=apartamentos'), 'vitrine Apartamentos'); assert.equal(rap.total, 5);
  const ruasT = ok(await req('GET', '/api/mercado/ruas?cat=terrenos&bairro=CAMBUI'), 'ruas dos terrenos'); assert.ok(ruasT[0].foto);
  const imT = ok(await req('GET', '/api/mercado/imoveis?cat=terrenos&bairro=CAMBUI&rua=RUA%20V'), 'terrenos da rua'); assert.equal(imT.length, 2); assert.equal(imT[0].area_util, 600); assert.match(imT[0].subtipo, /Terreno/);
  assert.equal(ok(await req('GET', '/api/mercado/mapa?cat=comerciais'), 'mapa da vitrine').length, 3);

  // ---------- o Radar também entra na vitrine (sem repetir o que já está no Fisguei) ----------
  run("INSERT INTO oportunidades(portal,link,titulo,tipo,bairro,logradouro,numero,area,valor,status,foto,anunciante_tipo) VALUES('Chaves na Mão','https://x/ap','Apto no Cambuí','Apartamento','Cambuí','Rua W','10',120,900000,'nova','https://exemplo.com/apto.jpg','particular')");
  const ap2 = ok(await req('GET', '/api/mercado/resumo?cat=apartamentos'), 'vitrine com o Radar'); assert.equal(ap2.total, 6); assert.equal(ap2.doRadar, 1);
  const imR = ok(await req('GET', '/api/mercado/imoveis?cat=apartamentos&bairro=CAMBUI&rua=RUA%20W'), 'apto do Radar na rua');
  assert.equal(imR.length, 1); assert.equal(imR[0].origem, 'op'); assert.match(imR[0].href, /^#\/radar\/\d+$/); assert.match(imR[0].ref, /^OP-/); assert.equal(imR[0].foto, 'https://exemplo.com/apto.jpg');
  const opId = +imR[0].href.split('/').pop();
  run("INSERT INTO fisguei_anuncios(fisgar_id,tipo,logradouro,numero,bairro,cidade,valor,area_util,status,oportunidade_id) VALUES('w1','Apartamento','Rua W','10','Cambuí','Campinas',900000,120,'captado',?)", opId);
  assert.equal((await req('GET', '/api/mercado/resumo?cat=apartamentos')).j.doRadar, 0, 'já no Fisguei: não repete');

  // ---------- painel de captação (Radar + Fisguei) ----------
  run("INSERT INTO oportunidades(portal,link,titulo,tipo,bairro,valor,status,foto) VALUES('Chaves na Mão','https://x/1','Casa no Cambuí','Casa','Cambuí',2000000,'nova','https://exemplo.com/op.jpg')");
  const cp = ok(await req('GET', '/api/captacao/painel'), 'painel de captação');
  assert.ok(cp.kpis.base >= 14); assert.equal(cp.funil.length, 8); assert.equal(cp.serie.dias.length, 30);
  assert.equal(cp.novasOp[0].foto, 'https://exemplo.com/op.jpg'); assert.ok(cp.novosFg.every((a) => a.foto));
  assert.ok(cp.bairros.some((b) => /Cambu/i.test(b.nome) && b.radar === 2));
  assert.equal(cp.vitrines.find((v) => v.chave === 'terrenos').n, 2);

  srv.close();
  console.log('\nMercado: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
