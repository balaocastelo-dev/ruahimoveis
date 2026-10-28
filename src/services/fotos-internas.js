// Fotos internas: as fotos do anúncio de origem (Fisgar/Radar) que acompanham o imóvel na carteira.
// - Ficam na pasta "Fotos internas" (arquivos.categoria), só como endereço (url_externa): não ocupam o banco.
// - Aparecem na carteira e na ficha com o selo "interna", para nenhum imóvel ficar sem foto.
// - NUNCA vão para o portal, link off-market, blog, Drive ou redes: tudo que é público lê só a pasta "Fotos".
const { one, all, run } = require('../db');

const CATEGORIA = 'Fotos internas';
const MAX = 20;

const lista = (j) => { try { const v = typeof j === 'string' ? JSON.parse(j) : j; return Array.isArray(v) ? v : []; } catch { return []; } };
const urlOk = (u) => typeof u === 'string' && (/^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\/api\/fachada\?ref=(fg|cd)\d+$/.test(u));

// Endereços de foto conhecidos para o imóvel: anúncios do Fisguei ligados a ele, oportunidades do Radar e, por último, a fachada do Google.
function urlsDoImovel(imovelId, extra = {}) {
  const urls = [];
  const fg = all('SELECT id, fotos, lat FROM fisguei_anuncios WHERE imovel_id=? ORDER BY id', imovelId);
  if (extra.anuncioId && !fg.some((a) => a.id === extra.anuncioId)) {
    const a = one('SELECT id, fotos, lat FROM fisguei_anuncios WHERE id=?', extra.anuncioId); if (a) fg.unshift(a);
  }
  for (const a of fg) for (const u of lista(a.fotos)) urls.push(typeof u === 'string' ? u : u && (u.url || u.src));
  const ops = all('SELECT foto FROM oportunidades WHERE imovel_id=? AND foto IS NOT NULL', imovelId);
  if (extra.oportunidadeId) { const o = one('SELECT foto FROM oportunidades WHERE id=?', extra.oportunidadeId); if (o && o.foto) ops.unshift(o); }
  for (const o of ops) urls.push(o.foto);
  const boas = [...new Set(urls.filter(urlOk))].slice(0, MAX);
  if (!boas.length) {
    const im = one('SELECT condominio_id FROM imoveis WHERE id=?', imovelId);
    const comGeo = fg.find((a) => a.lat);
    if (comGeo) boas.push(`/api/fachada?ref=fg${comGeo.id}`);
    else if (im && im.condominio_id) boas.push(`/api/fachada?ref=cd${im.condominio_id}`);
  }
  return boas;
}

// Copia as fotos internas que faltam. Não mexe em nada se o imóvel já tem as fotos próprias.
function garante(imovelId, extra = {}) {
  const proprias = one("SELECT count(*) n FROM arquivos WHERE imovel_id=? AND categoria='Fotos' AND mime LIKE 'image/%'", imovelId).n;
  if (proprias && !extra.forcar) return 0;
  const ja = new Set(all('SELECT url_externa FROM arquivos WHERE imovel_id=? AND categoria=?', imovelId, CATEGORIA).map((x) => x.url_externa));
  let n = 0;
  for (const u of urlsDoImovel(imovelId, extra)) {
    if (ja.has(u) || ja.size + n >= MAX) continue;
    const nome = u.startsWith('/api/fachada') ? 'Fachada (Google Street View) - interna' : `Foto do anúncio ${ja.size + n + 1} - interna`;
    run('INSERT INTO arquivos(imovel_id,categoria,nome,mime,url_externa) VALUES(?,?,?,?,?)', imovelId, CATEGORIA, nome, 'image/jpeg', u);
    n++;
  }
  return n;
}

// Todos os imóveis sem nenhuma foto (própria ou interna) recebem as internas que existirem.
function completaCarteira() {
  const sem = all(`SELECT i.id FROM imoveis i WHERE NOT EXISTS (SELECT 1 FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria IN ('Fotos','${CATEGORIA}'))`);
  let imoveis = 0, fotos = 0;
  for (const { id } of sem) { const n = garante(id); if (n) { imoveis++; fotos += n; } }
  return { sem_foto_antes: sem.length, completados: imoveis, fotos };
}

// SQL da capa para telas INTERNAS: foto própria primeiro, senão a interna. (Telas públicas não usam isto.)
const capaSQL = (alias = 'i') => `(SELECT f.id FROM arquivos f WHERE f.imovel_id=${alias}.id AND f.categoria IN ('Fotos','${CATEGORIA}') AND f.mime LIKE 'image/%' ORDER BY CASE WHEN f.categoria='Fotos' THEN 0 ELSE 1 END, f.id LIMIT 1)`;

module.exports = { CATEGORIA, garante, completaCarteira, urlsDoImovel, capaSQL, urlOk };
