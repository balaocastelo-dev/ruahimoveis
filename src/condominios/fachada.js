// Foto da fachada pelo Google Street View Static (precisa de GOOGLE_MAPS_KEY com a Street View Static API ligada).
// 1) metadados (grátis) acham o panorama de rua mais perto; 2) a foto é tirada desse ponto olhando para o imóvel.
// Cada foto fica guardada na tabela fachadas: o mesmo endereço não é pago de novo.
const { one, run } = require('../db');

// a chave vem da variável GOOGLE_MAPS_KEY ou, sem ela, da configuração da imobiliária (gravada pelo assistente do gestor)
let memoChave = { em: 0, v: '' };
const chave = () => {
  const env = (process.env.GOOGLE_MAPS_KEY || '').trim();
  if (env) return env;
  if (Date.now() - memoChave.em > 5 * 60e3) {
    let v = '';
    try { v = String(require('../db').getConfig('google_maps_chave') || '').trim(); } catch { /* sem banco */ }
    memoChave = { em: Date.now(), v };
  }
  return memoChave.v;
};
// a chave é restrita aos sites do cliente no Google: a chamada do servidor se apresenta como o site
const CAB = { Referer: (process.env.PUBLIC_URL || require('../config').BASE_URL || 'https://corretordofuturo.app').replace(/\/?$/, '/') };
const ligado = () => !!chave();
const rumo = (la1, lo1, la2, lo2) => {
  const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
  const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};

async function foto(ref, lat, lon) {
  const ja = one('SELECT img FROM fachadas WHERE ref=?', ref);
  if (ja) return ja.img ? Buffer.from(ja.img) : null;
  if (!ligado()) return null;
  const k = encodeURIComponent(chave());
  // prefere o Street View do próprio Google (fotos 360° de terceiros costumam ter propaganda ou ser de dentro de terrenos)
  let meta = null;
  for (const raio of [50, 120]) {
    const m = await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&radius=${raio}&source=outdoor&key=${k}`, { headers: CAB, signal: AbortSignal.timeout(10000) })).json();
    if (m.status === 'OK' && /google/i.test(m.copyright || '')) { meta = m; break; }
    if (m.status !== 'OK' && m.status !== 'ZERO_RESULTS') throw new Error(`Google Street View: ${m.status}${m.error_message ? ' — ' + m.error_message : ''}`);
  }
  if (!meta) { run('INSERT INTO fachadas(ref,img) VALUES(?,NULL) ON CONFLICT(ref) DO NOTHING', ref); return null; }
  const pl = meta.location.lat, po = meta.location.lng;
  const h = Math.round(rumo(pl, po, lat, lon));
  const r = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=640x420&scale=2&pano=${encodeURIComponent(meta.pano_id)}&heading=${h}&pitch=12&fov=75&source=outdoor&key=${k}`, { headers: CAB, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Street View respondeu ${r.status}`);
  const img = Buffer.from(await r.arrayBuffer());
  run('INSERT INTO fachadas(ref,img,pano_lat,pano_lon,rumo,data_foto) VALUES(?,?,?,?,?,?) ON CONFLICT(ref) DO UPDATE SET img=excluded.img', ref, img, pl, po, h, meta.date || null);
  return img;
}

module.exports = { chave, foto, ligado };
