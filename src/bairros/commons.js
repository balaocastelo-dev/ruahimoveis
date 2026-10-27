// Bairros · fotos reais de lugares do bairro, do Wikimedia Commons.
//
// Só entra foto com licença livre (domínio público, CC0, CC BY, CC BY-SA). A
// licença e o autor são lidos do PRÓPRIO Commons (não do que a página diz) e
// guardados na tabela bairro_commons; a página mostra o crédito embaixo da foto.
// A imagem não é guardada no banco: o site a busca no Commons e a Vercel guarda
// em cache por 30 dias.
//
// O sistema também serve de ponte para quem escreve as páginas: a nuvem do
// Claude não alcança o Commons, então a busca e a pré-visualização passam por
// /bairros/commons/… (só arquivos de imagem do Commons, nada mais).

const { one, run } = require('../db');
const { licencaAceita, ARQUIVO_COMMONS } = require('./config');

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'RUAH-Imoveis/1.0 (guias de bairro de Campinas; imoveisruah@gmail.com)';
const RENOVAR_DIAS = 30;
const LARGURAS = [330, 500, 960, 1280, 1920];

const semTags = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const normalizar = (t) => String(t || '').trim().replace(/^Arquivo:/i, 'File:').replace(/_/g, ' ');

async function chamar(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`o Commons respondeu ${r.status}`);
  return r.json();
}

/** Lê o que importa de uma página de arquivo do Commons. */
function lerArquivo(pg) {
  const ii = pg && pg.imageinfo && pg.imageinfo[0];
  if (!ii) return null;
  const m = ii.extmetadata || {};
  const v = (k) => (m[k] && m[k].value) || '';
  const licenca = semTags(v('LicenseShortName')) || (/^(?:pd|public)/i.test(v('License')) ? 'Public domain' : '');
  const autor = semTags(v('Artist')).slice(0, 160) || semTags(v('Credit')).slice(0, 160);
  const imagem = /^image\/(jpeg|png|webp|tiff)$/.test(ii.mime || '');
  let motivo = null;
  if (!imagem) motivo = `formato ${ii.mime || 'desconhecido'}`;
  else if (!licencaAceita(licenca)) motivo = `licença não aceita (${licenca || 'sem licença informada'})`;
  else if (!autor && !/public domain|^pd|cc0/i.test(licenca)) motivo = 'sem autor informado';
  else if ((ii.width || 0) < 800) motivo = `pequena demais (${ii.width}px de largura)`;
  return {
    titulo: normalizar(pg.title), url: ii.url, thumb: ii.thumburl || ii.url, largura: ii.width || null, altura: ii.height || null,
    autor: autor || null, licenca: licenca || null, descricao: semTags(v('ImageDescription')).slice(0, 300) || null,
    data: semTags(v('DateTimeOriginal')).slice(0, 40) || null, ok: motivo ? 0 : 1, motivo,
  };
}

/** Busca imagens no Commons (para quem escreve as páginas). */
async function buscar(q, limite = 24) {
  const termo = String(q || '').replace(/[^\p{L}\p{N} '.-]/gu, ' ').trim().slice(0, 80);
  if (termo.length < 3) return [];
  const j = await chamar({ action: 'query', generator: 'search', gsrsearch: `${termo} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(Math.min(40, limite)),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500', iiextmetadatafilter: 'LicenseShortName|License|Artist|Credit|ImageDescription|DateTimeOriginal' });
  const paginas = (j.query && j.query.pages) || [];
  return paginas.sort((a, b) => (a.index || 0) - (b.index || 0)).map(lerArquivo).filter(Boolean);
}

/** A ficha de um arquivo (licença, autor, tamanho), com cache no banco. */
async function info(titulo, { forcar = false } = {}) {
  const t = normalizar(titulo);
  if (!ARQUIVO_COMMONS.test(t)) return null;
  const c = one('SELECT * FROM bairro_commons WHERE titulo=?', t);
  if (c && !forcar && Date.now() - Date.parse(String(c.verificado_em).replace(' ', 'T')) < RENOVAR_DIAS * 864e5) return c;
  let x;
  try {
    const j = await chamar({ action: 'query', titles: t, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
      iiextmetadatafilter: 'LicenseShortName|License|Artist|Credit|ImageDescription|DateTimeOriginal' });
    const pg = j.query && j.query.pages && j.query.pages[0];
    x = pg && !pg.missing ? lerArquivo(pg) : { titulo: t, ok: 0, motivo: 'arquivo não existe no Commons' };
  } catch (e) {
    if (c) return c; // sem rede: fica com o que já foi conferido
    throw e;
  }
  run(`INSERT INTO bairro_commons(titulo,url,thumb,largura,altura,autor,licenca,descricao,ok,motivo,verificado_em) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
    ON CONFLICT(titulo) DO UPDATE SET url=excluded.url, thumb=excluded.thumb, largura=excluded.largura, altura=excluded.altura, autor=excluded.autor,
    licenca=excluded.licenca, descricao=excluded.descricao, ok=excluded.ok, motivo=excluded.motivo, verificado_em=excluded.verificado_em`,
  t, x.url || null, x.thumb || null, x.largura || null, x.altura || null, x.autor || null, x.licenca || null, x.descricao || null, x.ok, x.motivo || null);
  return one('SELECT * FROM bairro_commons WHERE titulo=?', t);
}

/** O endereço da miniatura numa das larguras padrão do Commons. */
function urlNaLargura(c, largura) {
  const alvo = LARGURAS.find((l) => l >= largura) || LARGURAS[LARGURAS.length - 1];
  if (!c.thumb || !/\/thumb\//.test(c.thumb) || (c.largura && c.largura <= alvo)) return c.url;
  return c.thumb.replace(/\/(?:lossless-|lossy-)?\d+px-([^/]+)$/, `/${alvo}px-$1`);
}

/** Os bytes da imagem (só arquivo conferido e aceito). */
async function imagem(titulo, largura = 1280) {
  const c = await info(titulo);
  if (!c || !c.ok) return null;
  const r = await fetch(urlNaLargura(c, largura), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`o Commons respondeu ${r.status} para a imagem`);
  return { buf: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') || 'image/jpeg', info: c };
}

/** "Foto: Fulano · CC BY-SA 4.0 · Wikimedia Commons" */
const credito = (c) => [c.autor ? `Foto: ${c.autor}` : 'Foto: autor não identificado', c.licenca, 'Wikimedia Commons'].filter(Boolean).join(' · ');

module.exports = { buscar, info, imagem, credito, normalizar, UA };
