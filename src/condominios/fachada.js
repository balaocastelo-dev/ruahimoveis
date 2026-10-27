// Foto da fachada pelo Google Street View Static (precisa de GOOGLE_MAPS_KEY com a Street View Static API ligada).
// 1) metadados (grátis) acham o panorama de rua mais perto; 2) a foto é tirada desse ponto olhando para o imóvel.
// Cada foto fica guardada na tabela fachadas: o mesmo endereço não é pago de novo.
const { one, run } = require('../db');

const chave = () => (process.env.GOOGLE_MAPS_KEY || '').trim();
// a chave é restrita aos sites da RUAH no Google: a chamada do servidor se apresenta como o site
const CAB = { Referer: (process.env.PUBLIC_URL || 'https://ruahimoveis.vercel.app').replace(/\/?$/, '/') };
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
  const meta = await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&radius=60&source=outdoor&key=${k}`, { headers: CAB, signal: AbortSignal.timeout(10000) })).json();
  if (meta.status === 'ZERO_RESULTS') { run('INSERT INTO fachadas(ref,img) VALUES(?,NULL) ON CONFLICT(ref) DO NOTHING', ref); return null; }
  if (meta.status !== 'OK') throw new Error(`Google Street View: ${meta.status}${meta.error_message ? ' — ' + meta.error_message : ''}`);
  const pl = meta.location.lat, po = meta.location.lng;
  const h = Math.round(rumo(pl, po, lat, lon));
  const r = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=640x420&scale=2&pano=${encodeURIComponent(meta.pano_id)}&heading=${h}&pitch=12&fov=75&source=outdoor&key=${k}`, { headers: CAB, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Street View respondeu ${r.status}`);
  const img = Buffer.from(await r.arrayBuffer());
  run('INSERT INTO fachadas(ref,img,pano_lat,pano_lon,rumo,data_foto) VALUES(?,?,?,?,?,?) ON CONFLICT(ref) DO UPDATE SET img=excluded.img', ref, img, pl, po, h, meta.date || null);
  return img;
}

module.exports = { foto, ligado };
