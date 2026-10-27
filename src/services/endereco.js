// Cadastro inteligente: CEP (ViaCEP), localização (OpenStreetMap) e condomínio já conhecido pelo endereço.
const { CIDADE_PADRAO, UF_PADRAO } = require('../config');

const UA = 'SistemaRUAH/1.0 (cadastro de imoveis)';
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

async function getJson(url, ms = 7000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function viaCep(cep) {
  const c = soDigitos(cep);
  if (c.length !== 8) return null;
  const j = await getJson(`https://viacep.com.br/ws/${c}/json/`);
  if (j.erro) return null;
  return { cep: c, logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf };
}

// Sem CEP: procura o CEP pela rua (ViaCEP aceita UF/Cidade/Rua).
async function cepPorRua(logradouro, cidade, uf) {
  if (!logradouro || logradouro.trim().length < 3) return null;
  const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(logradouro.trim())}/json/`;
  const lista = await getJson(url);
  if (!Array.isArray(lista) || !lista.length) return null;
  const j = lista[0];
  return { cep: soDigitos(j.cep), logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf, variacoes: lista.length };
}

// OpenStreetMap: coordenadas e, quando o prédio está mapeado com nome, o nome do condomínio.
async function osm(logradouro, numero, cidade, uf) {
  const p = new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', namedetails: '1', limit: '3',
    street: `${numero || ''} ${logradouro}`.trim(), city: cidade, state: uf, country: 'Brasil',
  });
  const lista = await getJson(`https://nominatim.openstreetmap.org/search?${p}`, 8000);
  if (!Array.isArray(lista) || !lista.length) return null;
  const r = lista[0];
  const nome = r.name && !/^\d+$/.test(r.name) && !String(logradouro).toLowerCase().includes(String(r.name).toLowerCase()) ? r.name : null;
  return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), nome_predio: nome, bairro: r.address && (r.address.suburb || r.address.neighbourhood) };
}

// Junta tudo e diz de onde veio cada dado (o corretor confere os campos marcados como automáticos).
async function pesquisar({ cep, logradouro, numero, cidade, uf }) {
  cidade = cidade || CIDADE_PADRAO; uf = uf || UF_PADRAO;
  const out = { campos: {}, fontes: {}, avisos: [] };
  const set = (k, v, fonte) => { if (v !== undefined && v !== null && v !== '') { out.campos[k] = v; out.fontes[k] = fonte; } };

  let base = null;
  try { base = cep ? await viaCep(cep) : await cepPorRua(logradouro, cidade, uf); }
  catch { out.avisos.push('Não consegui consultar os Correios agora (ViaCEP). Preencha o endereço manualmente.'); }
  if (base) {
    set('cep', base.cep, 'Correios'); set('logradouro', base.logradouro, 'Correios');
    set('bairro', base.bairro, 'Correios'); set('cidade', base.cidade, 'Correios'); set('uf', base.uf, 'Correios');
    if (base.variacoes > 1) out.avisos.push('A rua tem mais de um CEP. Confira o CEP pelo número.');
  } else if (cep) out.avisos.push('CEP não encontrado.');

  const L = out.campos.logradouro || logradouro, C = out.campos.cidade || cidade, U = out.campos.uf || uf;
  let g = null;
  if (L && numero) {
    try {
      g = await osm(L, numero, C, U);
      if (g) {
        set('lat', g.lat, 'OpenStreetMap'); set('lon', g.lon, 'OpenStreetMap');
        if (!out.campos.bairro && g.bairro) set('bairro', g.bairro, 'OpenStreetMap');
      }
    } catch { out.avisos.push('Mapa indisponível agora; a localização fica para depois.'); }
  }
  // Base de condomínios de Campinas (CNPJ + mapa + cadastros da RUAH): pelo CEP e número, pela rua ou pelo ponto no mapa.
  const x = require('../condominios/base').reconhecer({ cep: out.campos.cep || cep, numero, logradouro: L, lat: g && g.lat, lon: g && g.lon, bairro: out.campos.bairro });
  const cond = x.condominio;
  if (cond) {
    out.condominio = { id: cond.id, nome: cond.nome, tipo: cond.tipo, como: x.como, confianca: x.confianca, unidades: cond.unidades, andares: cond.andares };
    set('condominio_id', cond.id, 'Base de condomínios');
    set('condominio_nome', cond.nome, `Base de condomínios · ${x.como}`);
    set('ano_construcao', cond.ano_construcao || (cond.abertura ? cond.abertura.slice(0, 4) : null), cond.ano_construcao ? 'Cadastro RUAH' : 'CNPJ do condomínio (abertura)');
    set('lazer', cond.lazer, 'Cadastro RUAH');
    set('administradora', cond.administradora, 'Cadastro RUAH');
    if (cond.lat && !out.campos.lat) { set('lat', cond.lat, 'Base de condomínios'); set('lon', cond.lon, 'Base de condomínios'); }
    if (x.confianca !== 'alta') out.avisos.push(`Condomínio sugerido (${x.como}). Confira o nome antes de salvar.`);
  } else if (g && g.nome_predio) set('condominio_nome', g.nome_predio, 'OpenStreetMap');
  out.alternativas = x.alternativas || [];
  if (!out.campos.condominio_nome && numero) out.avisos.push('Condomínio ainda não conhecido neste endereço. Ao salvar, ele fica gravado e os próximos cadastros no mesmo número saem automáticos.');
  return out;
}

module.exports = { pesquisar, viaCep, soDigitos };
