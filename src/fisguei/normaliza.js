// Traduz as respostas da API do Fisgar (capturadas pela extensão do Chrome) para a base do Fisguei.
// Formato conferido em 26/10/2026 no painel.fisgar.com.br:
//   POST …/properties/getAll                       → { data: [anúncio, …] }            (lista da Base de Anúncios)
//   GET  …/properties/announce/getAllInfoById/:id  → { data: anúncio }                  (ficha do anúncio)
//   POST …/owners/GetPeople                        → { data: { people: [pessoa, …] } }  (aba Proprietários; corpo traz announce_id e o endereço)
//   POST …/owners/GetPersonInfo                    → { data: { people: [pessoa com phones e emails] } } (botão Consultar)
// O CPF/CNPJ que o Fisgar devolve NUNCA é gravado: vira só uma impressão (hash) para reconhecer a mesma pessoa.
const crypto = require('crypto');
const cfg = require('../config');
const { one } = require('../db');
const F = require('./base');

const hashDoc = (doc) => (doc ? crypto.createHmac('sha256', cfg.SECRET_KEY || 'ruah').update(String(doc).replace(/\D/g, '')).digest('hex').slice(0, 24) : null);
const numOu = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const intOu = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };
const cepTxt = (z) => { const d = String(z ?? '').replace(/\D/g, ''); return d ? d.padStart(8, '0').slice(-8) : null; };
const dataSP = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : null; };
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s(-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).trim() || null;

function portalDasFotos(imgs) {
  const u = (imgs || []).find(Boolean) || '';
  if (/chavesnamao/i.test(u)) return 'Chaves na Mão';
  if (/vivareal|vivareal/i.test(u)) return 'Viva Real';
  if (/zapimoveis|zap\./i.test(u)) return 'ZAP Imóveis';
  if (/olx/i.test(u)) return 'OLX';
  if (/imovelweb/i.test(u)) return 'Imovelweb';
  if (/grupozap|resizedimgs/i.test(u)) return 'ZAP / Viva Real';
  return null;
}

function anuncio(x) {
  if (!x || typeof x !== 'object') return null;
  const id = x.announce_id || x.id;
  if (!id || !(x.street || x.district || x.zipcode)) return null;
  const venda = numOu(x.buy_price), aluguel = numOu(x.rental_price);
  if (!venda && aluguel) return { locacao: true }; // a RUAH só trabalha com venda
  const imgs = Array.isArray(x.images) ? x.images.filter((u) => typeof u === 'string' && /^https:\/\//.test(u)) : [];
  const ll = x.longlat || {};
  return {
    fisgar_id: String(id),
    portal: portalDasFotos(imgs) || (x.source && x.source !== 'Não definido' ? x.source : null),
    titulo: [x.property_type, x.district].filter(Boolean).join(' · ') || null,
    tipo: x.property_type || null,
    negocio: venda ? 'Venda' : null,
    finalidade: x.finality === 0 ? 'Residencial' : x.finality === 1 ? 'Comercial' : null,
    logradouro: x.street || null,
    numero: x.number !== undefined && x.number !== null && String(x.number) !== '0' ? String(x.number) : null,
    complemento: x.condo_name || null,
    bairro: x.district || null, cidade: x.city || null, uf: 'SP', cep: cepTxt(x.zipcode),
    lat: numOu(Math.abs(x.latitude ?? ll.x)) ? Number(x.latitude ?? ll.x) : null,
    lon: numOu(Math.abs(x.longitude ?? ll.y)) ? Number(x.longitude ?? ll.y) : null,
    valor: venda, valor_condominio: numOu(x.condo_price), iptu: numOu(x.iptu),
    quartos: intOu(x.bedroom), suites: intOu(x.suites), banheiros: intOu(x.bathroom), vagas: intOu(x.parking_slots),
    area_util: numOu(x.useable_area), area_total: numOu(x.total_area),
    anunciante_nome: titulo(x.announcer),
    anunciante_tipo: x.private === 1 || x.private === true ? 'particular' : x.private === 0 || x.private === false ? 'imobiliaria' : 'desconhecido',
    publicado_em: dataSP(x.postedAt),
    fotos: imgs.length ? imgs : undefined,
  };
}

// Pessoa pesquisada sem anúncio (tela "Pesquisar Proprietários"): o endereço vira um anúncio "de endereço".
function anuncioDoEndereco(announceId, key) {
  if (announceId) {
    const ja = one('SELECT id FROM fisguei_anuncios WHERE fisgar_id=?', String(announceId));
    if (ja) return ja.id;
  }
  if (!key || !(key.street || key.zipcode)) return null;
  const fid = announceId ? String(announceId) : `end:${cepTxt(key.zipcode) || F.norm(key.street)}-${key.number || 's/n'}`;
  return F.salvaAnuncio({
    fisgar_id: fid, titulo: announceId ? null : 'Endereço pesquisado no Fisgar',
    logradouro: key.street || null, numero: key.number ? String(key.number) : null, bairro: key.district || null,
    cidade: key.city || null, uf: key.state || 'SP', cep: cepTxt(key.zipcode),
  });
}

function idade(birth) {
  const d = birth ? new Date(birth) : null;
  if (!d || isNaN(d)) return null;
  const a = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
  return a > 0 && a < 120 ? a : null;
}
// Endereço da pessoa que bate com o imóvel: dá a unidade (CASA 02, AP 31…).
function enderecoNoImovel(p, key) {
  const ends = Array.isArray(p.addresses) ? p.addresses : [];
  const cep = key ? cepTxt(key.zipcode) : null, num = key ? String(key.number ?? '') : '';
  return ends.find((e) => e.iptuMatch && (!cep || cepTxt(e.zipcode || e.zipCode) === cep))
    || ends.find((e) => cep && cepTxt(e.zipcode || e.zipCode) === cep && String(e.number ?? '') === num)
    || (ends.length === 1 ? ends[0] : null);
}
function pessoa(p, key) {
  if (!p || !p.name) return null;
  const e = enderecoNoImovel(p, key);
  const empresa = /JURIDICA/i.test(p.type || '') || String(p.document || '').replace(/\D/g, '').length === 14;
  return {
    fisgar_pessoa_id: hashDoc(p.document),
    nome: titulo(p.name),
    relacao: empresa ? 'Empresa ligada ao endereço' : e && e.iptuMatch ? 'Possível proprietário (IPTU)' : 'Pessoa relacionada ao endereço',
    unidade: e && e.extra ? String(e.extra).trim().toUpperCase() : null,
    idade: idade(p.birthDate),
    telefones: (Array.isArray(p.phones) ? p.phones : []).map((t) => ({ numero: t.phone, movel: t.type ? /MOBILE|CEL/i.test(t.type) : String(t.phone || '').replace(/\D/g, '').length === 11, whatsapp: !!t.whatsApp, score: t.score })),
    emails: (Array.isArray(p.emails) ? p.emails : []).map((m) => m.email).filter(Boolean),
  };
}

function corpo(req) { if (!req) return {}; if (typeof req === 'object') return req; try { return JSON.parse(req); } catch { return {}; } }

// url: endereço da chamada; json: resposta; pedido: corpo enviado (para saber de qual anúncio e endereço é a pessoa)
function processa(url, json, pedido) {
  const r = { anuncios: 0, pessoas: 0, telefones: 0 };
  const caminho = String(url).split('?')[0];
  const dados = json && json.data;
  if (/\/properties\/getAll$/i.test(caminho) && Array.isArray(dados)) {
    for (const x of dados) { const a = anuncio(x); if (a && !a.locacao && F.salvaAnuncio(a)) r.anuncios++; }
    return r;
  }
  if (/\/getAllInfoById\//i.test(caminho) && dados && typeof dados === 'object') {
    const a = anuncio(dados); if (a && !a.locacao && F.salvaAnuncio(a)) r.anuncios++;
    return r;
  }
  if (/\/owners\/GetPe(ople|rsonInfo)$/i.test(caminho) && dados && Array.isArray(dados.people)) {
    const b = corpo(pedido);
    const search = b.search || {}; const key = search.key || {};
    // Em GetPeople a chave é o endereço; em GetPersonInfo é a pessoa (com os endereços dela).
    const endKey = key.street || key.zipcode ? key : (enderecoNoImovel(key, null) || (key.addresses || [])[0] || null);
    const anuncioId = anuncioDoEndereco(b.announce_id, endKey);
    if (!anuncioId) return r;
    const ref = one('SELECT logradouro AS street, numero AS number, cep AS zipcode FROM fisguei_anuncios WHERE id=?', anuncioId);
    for (const p of dados.people) {
      const pe = pessoa(p, ref);
      if (!pe) continue;
      const s = F.salvaPessoa(anuncioId, pe);
      if (s) { r.pessoas++; r.telefones += s.novos; }
    }
    return r;
  }
  return r;
}

module.exports = { processa, anuncio, pessoa, hashDoc };
