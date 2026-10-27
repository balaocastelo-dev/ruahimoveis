// Condomínios · utilidades de texto e de mapa (sem dependências).
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Nome sem as palavras genéricas, para comparar "Cond. Ed. Solar das Acácias" com "Edifício Solar das Acácias".
const GENERICAS = /\b(CONDOMINIO|COND|EDIFICIO|EDIF|ED|RESIDENCIAL|RESID|RES|CONJUNTO|PREDIO|TORRE|TORRES|BLOCO|DO|DA|DE|DOS|DAS|E|O|A)\b/g;
const nucleo = (s) => chave(s).replace(GENERICAS, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const numero = (s) => { const m = String(s || '').match(/\d+/); return m ? String(parseInt(m[0], 10)) : null; };

function distancia(aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Ponto dentro do polígono ([[lat,lon],...]).
function dentro(lat, lon, poly) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > lat) !== (yj > lat)) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

// Semelhança de nomes (0 a 1) por palavras em comum.
function semelhanca(a, b) {
  const A = new Set(nucleo(a).split(' ').filter((w) => w.length > 1));
  const B = new Set(nucleo(b).split(' ').filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return (2 * n) / (A.size + B.size);
}

// Andar pela unidade: "142" → 14º andar, "1203 Torre B" → 12º, "52" → 5º, "Térreo"/"1" → 0.
// conv 'nn' = andar + 2 dígitos (101 = 1º andar); padrão = andar + 1 dígito (142 = 14º andar). Vem do Censo (numeracao).
function andarDaUnidade(u, conv) {
  const s = String(u || '');
  if (/t[ée]rreo/i.test(s)) return { andar: 0, final: null, torre: torreDe(s) };
  const m = s.match(/(\d{2,4})/);
  if (!m) return { andar: null, final: null, torre: torreDe(s) };
  const d = m[1];
  if (d.length === 4 || (conv === 'nn' && d.length === 3)) return { andar: parseInt(d.slice(0, -2), 10), final: parseInt(d.slice(-2), 10), torre: torreDe(s) };
  return { andar: parseInt(d.slice(0, -1), 10), final: parseInt(d.slice(-1), 10), torre: torreDe(s) };
}
function torreDe(s) {
  const m = String(s || '').match(/\b(?:torre|bloco|tr|bl)\.?\s*([A-Z0-9]{1,3})\b/i);
  return m ? m[1].toUpperCase() : null;
}

module.exports = { semAcento, chave, nucleo, slug, soDigitos, numero, distancia, dentro, semelhanca, andarDaUnidade };
