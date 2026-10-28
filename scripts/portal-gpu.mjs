#!/usr/bin/env node
/**
 * Portal RUAH · páginas dos imóveis escritas pela placa de vídeo do PC (Ollama).
 *
 *   node scripts/portal-gpu.mjs [--quantos 999] [--so AP0022,CA0010] [--lote 5] [--sem-publicar] [--fase fotos|texto|tudo]
 *
 * Para cada imóvel da fila (sem página, desatualizada, reprovada):
 *   1. o modelo de visão (PORTAL_GPU_VISAO, padrão qwen2.5vl:7b) olha CADA foto e diz
 *      o ambiente, uma legenda e o que se vê (fica em data/portal-gpu/<CÓDIGO>/fotos.json);
 *   2. o modelo de texto (PORTAL_GPU_TEXTO, padrão qwen3:14b) escreve a página a partir
 *      da ficha + o que as fotos mostram, seguindo o ROTINA.md;
 *   3. o código monta os blocos (abertura, destaques, seções, fotos, chamada, perguntas)
 *      e passa pela MESMA régua do site (src/portal/validar.js + regua.js); reprovou,
 *      volta para o modelo com os erros (até 4 tentativas);
 *   4. a cada --lote páginas aprovadas, publica com scripts/portal-publicar.mjs.
 * Pode parar e rodar de novo: o que as fotos mostram fica guardado.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { lerPagina } = require('../src/portal/validar.js');
const { avaliarPagina } = require('../src/portal/regua.js');

const OLLAMA = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const VISAO = process.env.PORTAL_GPU_VISAO || 'qwen2.5vl:7b';
const TEXTO = process.env.PORTAL_GPU_TEXTO || 'qwen3:14b';
const PORTAL = (process.env.PORTAL_URL || 'https://ruahimoveis.vercel.app').replace(/\/+$/, '');
const FOTOS_DE = (process.env.PORTAL_GPU_FOTOS || 'http://localhost:3333').replace(/\/+$/, '');
const PASTA = path.join(RAIZ, 'data', 'portal-gpu');

const args = process.argv.slice(2);
const valor = (n, p) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : p; };
const QUANTOS = parseInt(valor('--quantos', '999'), 10);
const SO = valor('--so', '') ? valor('--so', '').toUpperCase().split(',') : null;
const LOTE = parseInt(valor('--lote', '5'), 10);
const PUBLICAR = !args.includes('--sem-publicar');

const AMB = ['fachada', 'sala', 'cozinha', 'quarto', 'suite', 'banheiro', 'varanda', 'gourmet', 'piscina', 'lazer', 'jardim', 'garagem', 'escritorio', 'servico', 'vista', 'condominio', 'terreno', 'planta', 'outro'];
const ORDEM = ['fachada', 'vista', 'terreno', 'sala', 'varanda', 'gourmet', 'cozinha', 'servico', 'escritorio', 'quarto', 'suite', 'banheiro', 'jardim', 'piscina', 'lazer', 'garagem', 'condominio', 'planta', 'outro'];

const log = (...m) => console.log(new Date().toLocaleTimeString('pt-BR'), ...m);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function ollama(corpo, tentativas = 3) {
  for (let t = 1; ; t += 1) {
    try {
      const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stream: false, keep_alive: '15m', ...corpo }) });
      if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      return j.message.content;
    } catch (e) { if (t >= tentativas) throw e; await new Promise((ok) => setTimeout(ok, 3000 * t)); }
  }
}
const jsonDe = (s) => { const t = String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim(); const a = t.indexOf('{'); const b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); };

// ------------------------------------------------------------ 1. as fotos
const PEDIDO_FOTO = `Você é um fotógrafo de imóveis descrevendo UMA foto de um anúncio de venda no Brasil. Responda em português, em JSON:
{"ambiente": um destes: ${AMB.join(', ')},
 "legenda": "de 15 a 90 caracteres: o que a foto mostra, como legenda de galeria (ex.: \\"Sala de estar integrada à varanda\\")",
 "detalhes": ["de 2 a 6 coisas concretas que se VEEM na foto"],
 "qualidade": "boa" | "escura" | "ilustracao" | "planta" | "fraca"}
Regras: descreva só o que se vê. Não diga marca, não diga metragem, não conte quartos nem vagas, não invente material: se não tiver certeza, diga "piso claro", "bancada escura". Se for perspectiva 3D, maquete ou desenho, "qualidade" = "ilustracao". Planta baixa: ambiente "planta". Foto aérea ou de drone do lote: "terreno" ou "vista". Áreas comuns do prédio (piscina do condomínio, salão, portaria): "condominio", "piscina" ou "lazer".`;

async function olharFotos(im, dir) {
  const arq = path.join(dir, 'fotos.json');
  const feito = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : {};
  for (const f of im.fotos) {
    if (feito[f.foto]) continue;
    let b64;
    try {
      const r = await fetch(`${FOTOS_DE}/imoveis/foto/${f.foto}`).catch(() => null);
      const resp = r && r.ok ? r : await fetch(f.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      b64 = Buffer.from(await resp.arrayBuffer()).toString('base64');
    } catch (e) { log(`  foto ${f.foto} não baixou (${e.message})`); feito[f.foto] = { ambiente: 'outro', legenda: 'Foto do imóvel', detalhes: [], qualidade: 'fraca' }; continue; }
    try {
      const resp = await ollama({ model: VISAO, format: 'json', options: { temperature: 0.1, num_ctx: 6144 }, messages: [{ role: 'user', content: PEDIDO_FOTO, images: [b64] }] });
      const j = jsonDe(resp);
      feito[f.foto] = {
        ambiente: AMB.includes(j.ambiente) ? j.ambiente : 'outro',
        legenda: limparLegenda(j.legenda),
        detalhes: (Array.isArray(j.detalhes) ? j.detalhes : []).map(String).slice(0, 6),
        qualidade: String(j.qualidade || 'boa'),
      };
    } catch (e) { log(`  foto ${f.foto}: o modelo de visão falhou (${e.message})`); feito[f.foto] = { ambiente: 'outro', legenda: 'Foto do imóvel', detalhes: [], qualidade: 'fraca' }; }
    fs.writeFileSync(arq, JSON.stringify(feito, null, 1));
  }
  return feito;
}

/** Legenda nunca carrega número de cômodo, metragem, marca d'água ou endereço. */
function limparLegenda(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(\d{1,2}|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis)\s+(quartos?|dormit[óo]rios?|su[íi]tes?|vagas?|banheiros?)\b/giu, '$2');
  t = t.replace(/\s*,?\s*\b(?:de\s+|com\s+o\s+|com\s+)?(?:n[º°o]\.?|n[úu]mero)\s*\d+[A-Za-z]?\b/giu, '');
  t = t.replace(/\d+[.,]?\d*\s*(m²|m2|metros( quadrados)?)/giu, '').replace(/https?:\S+|www\.\S+/giu, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length > 105) t = `${t.slice(0, 102).replace(/\s+\S*$/, '')}`;
  return t.length >= 3 ? t : 'Foto do imóvel';
}

// ------------------------------------------------------------ 2. o texto
const REGRAS = `Você escreve a PÁGINA de um imóvel à venda no portal da RUAH Investimentos Imobiliários (Campinas, SP).
Escreva SÓ o que a ficha diz e o que as fotos mostram (a lista "fotos" traz o que cada foto mostra). Nada de suposição, nada sobre o bairro além da ficha e do anúncio.
Do "descricao_do_anuncio" pode usar os FATOS com palavras suas; nunca copie frases e nunca repita exageros de anúncio.

PROIBIDO (a página é reprovada automaticamente):
- qualquer valor em reais, parcela, entrada, desconto, permuta, financiamento, FGTS;
- promessa ou urgência: "valorização", "vai valorizar", "investimento seguro", "imperdível", "oportunidade única", "não perca", "corra", "abaixo do valor de mercado";
- rua, número, CEP, número do apartamento/unidade; telefone, e-mail, site, links;
- "visitamos", "estivemos", "conhecemos pessoalmente", "medimos";
- número de quartos, suítes ou vagas MAIOR que o da ficha, ou qualquer número desses se a ficha for null; metragem em m² que não seja exatamente area_util ou area_total da ficha (nada de "cozinha de 12 m²");
- "oportunidade", "privilegiada", "futuro proprietário", "valorização"; falar do proprietário ou dos moradores; superlativos ("o melhor", "perfeito", "dos sonhos", "magnífico").
As descrições das fotos vêm de um robô e podem errar o material: diga "piso claro", "bancada escura", nunca "mármore", "granito", "porcelanato", "madeira" sem a ficha ou o anúncio dizerem. Se as fotos parecem de apartamento decorado ou perspectiva e a ficha/anúncio fala em contrapiso ou planta, diga que são imagens ilustrativas/decorado.\nMaterial, marca, orientação solar, andar e vista só se a ficha ou o anúncio disserem.

USO DAS FOTOS: as descrições das fotos são anotações de trabalho. Use só o que importa a quem compra (luz, integração dos ambientes, varanda, bancada, armários, área verde, lazer). NUNCA cite miudezas (tomada, furo, tampa do vaso, válvula, interruptor, lâmpada), nunca escreva palavras em inglês, nunca diga 'a foto mostra'/'as fotos mostram' mais de uma vez na página, e nunca descreva o mesmo ambiente duas vezes.\n\nTOM: segunda pessoa ("você"), frases curtas, como um corretor que conhece o imóvel e não precisa exagerar. O fato vende mais que o adjetivo. Detalhe concreto tirado das fotos em quase toda seção. Fotos poucas ou ruins: escreva menos e mais seco.

Responda SÓ com este JSON:
{
 "titulo": "30 a 75 caracteres, COMEÇANDO pelo tipo do imóvel (ex.: 'Apartamento de 3 quartos com varanda gourmet no Bonfim')",
 "slug": "palavras-da-busca-tipo-quartos-diferencial-bairro-cidade (minúsculas e hífens, sem o código; até 60 caracteres)",
 "resumo": "ENTRE 120 E 160 CARACTERES: o tipo, onde fica e o que tem de melhor",
 "capa": {"foto": número da melhor foto para abrir (fachada, sala ou vista boa; nunca planta), "alt": "o que ela mostra (mín. 15 caracteres)"},
 "abertura": ["1 ou 2 parágrafos de 40 a 80 palavras: o que é, onde fica, para quem serve, o que chama atenção nas fotos"],
 "destaques": ["4 a 6 destaques curtos (até 12 palavras cada)"],
 "secoes": [ {"titulo": "título da seção", "paragrafos": ["1 a 3 parágrafos de 40 a 90 palavras"], "fotos": [1 a 3 números de fotos que ilustram ESTA seção]} ],
 "fechamento": {"titulo": "ex.: 'Para quem este imóvel faz sentido'", "paragrafos": ["1 parágrafo de 40 a 80 palavras"], "dica": {"titulo": "O que perguntar ao corretor", "texto": "30 a 60 palavras: documentação, condomínio, o que não aparece nas fotos"}},
 "perguntas": [ {"pergunta": "…?", "resposta": "resposta só com a ficha e as fotos"} ],
 "redes": {"legenda": "150 a 450 caracteres para Instagram, sem preço e sem site", "hashtags": ["5 a 8 hashtags só letras e números, sem #"]}
}
"secoes": de 2 a 4 seções seguindo a visita (área social; cozinha e serviço; quartos; lazer e condomínio; localização só com o que a ficha e o anúncio dizem). Terreno: o lote, o entorno visível nas fotos, o condomínio/loteamento. Comercial: o espaço, o acesso, o uso.
"perguntas": 3 ou 4 (ex.: "Quantas vagas tem?", "Tem área gourmet?", "Como marcar a visita?" → responda que é pelo formulário desta página).
TAMANHO TOTAL: 450 a 750 palavras somando todos os parágrafos. Não passe de 900.`;

function fichaParaModelo(im, fotos) {
  const anuncio = String(im.descricao_do_anuncio || '').split('\n').filter((l) => !/https?:|ruahimobiliaria|c[óo]digo\s+[A-Z]{2}\d/i.test(l)).join('\n').trim();
  return {
    codigo: im.codigo, tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, uf: im.uf, condominio: im.condominio,
    lazer_do_condominio: im.lazer_do_condominio, quartos: im.quartos, suites: im.suites, vagas: im.vagas,
    area_util_m2: im.area_util, area_total_m2: im.area_total, descricao_do_anuncio: anuncio || null,
    fotos: im.fotos.map((f) => ({ foto: f.foto, ...(fotos[f.foto] || {}) })),
  };
}

const slugify = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const texto = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const ANUNCIO = [
  [/\b(?:uma\s+)?(?:excelente|ótima|grande|rara|boa)\s+oportunidade(?:\s+(?:para|de)\b)?/giu, 'uma opção para'],
  [/\bpel[oa]\s+futur[oa]\s+propriet[áa]ri[oa]\b/giu, 'por quem comprar'], [/\bd[oa]\s+futur[oa]\s+propriet[áa]ri[oa]\b/giu, 'de quem comprar'],
  [/\ba[oa]?\s+futur[oa]\s+propriet[áa]ri[oa]\b/giu, 'a quem comprar'], [/\b[oa]\s+futur[oa]\s+propriet[áa]ri[oa]\b/giu, 'quem comprar'],
  [/\bfutur[oa]s?\s+propriet[áa]ri[oa]s?\b/giu, 'quem comprar'], [/\bpropriet[áa]ri[oa]s?\b/giu, 'comprador'],
  [/\blocaliza[çc][ãa]o\s+privilegiada\b/giu, 'boa localização'], [/\s*\b(?:muito\s+)?privilegiad[ao]s?\b/giu, ''], [/\bpotencial\s+de\s+valoriza[çc][ãa]o\b/giu, ''],
  [/,?\s*(?:e\s+)?(?:com\s+)?(?:grande\s+)?valoriza[çc][ãa]o\b/giu, ''], [/\b(?:magn[íi]fic|maravilhos|incr[íi]ve|espetacular|deslumbrante)\w*/giu, 'amplo'],
  [/\bdos\s+sonhos\b/giu, ''], [/\bperfeit[ao]s?\b/giu, 'adequado'],
];
const ENDERECO = /\s*,?\s*\b(?:de\s+|com\s+o\s+|com\s+)?(?:n[º°o]\.?|n[úu]mero)\s*\d+[A-Za-z]?\b/giu;
const semLinks = (s) => { let t = texto(s).replace(ENDERECO, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+|www\.\S+/g, ''); for (const [re, por] of ANUNCIO) t = t.replace(re, por); return t.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim(); };
/** Resumo entre 110 e 165: corta no fim de frase ou de palavra. */
function ajustarResumo(r) {
  let t = semLinks(r);
  if (t.length <= 165) return t;
  const frases = t.match(/[^.!?]+[.!?]/g) || [];
  let acc = ''; for (const f of frases) { if ((acc + f).trim().length > 165) break; acc = (acc + f); }
  acc = acc.trim(); if (acc.length >= 110) return acc;
  return `${t.slice(0, 162).replace(/[\s,;:]+\S*$/, '')}.`;
}

function montar(im, fotos, j) {
  const ids = new Set(im.fotos.map((f) => f.foto));
  const legenda = (id) => limparLegenda((fotos[id] && fotos[id].legenda) || 'Foto do imóvel');
  const galeria = im.fotos.map((f) => ({ foto: f.foto, legenda: legenda(f.foto), ambiente: (fotos[f.foto] && fotos[f.foto].ambiente) || 'outro' }))
    .sort((a, b) => ORDEM.indexOf(a.ambiente) - ORDEM.indexOf(b.ambiente));
  let capa = Number(j.capa && j.capa.foto);
  if (!ids.has(capa) || (fotos[capa] && fotos[capa].ambiente === 'planta')) capa = (galeria.find((g) => g.ambiente !== 'planta' && (fotos[g.foto] || {}).qualidade === 'boa') || galeria[0]).foto;

  const blocos = [];
  for (const p of [].concat(j.abertura || []).slice(0, 2)) if (texto(p)) blocos.push({ tipo: 'paragrafo', texto: semLinks(p) });
  blocos.push({ tipo: 'resumo', titulo: 'Destaques', itens: [].concat(j.destaques || []).map(semLinks).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).slice(0, 7) });
  const usadas = new Set();
  const secoes = [].concat(j.secoes || []).filter((s) => s && texto(s.titulo)).slice(0, 4);
  for (const s of secoes) {
    blocos.push({ tipo: 'titulo', nivel: 2, texto: texto(s.titulo) });
    for (const p of [].concat(s.paragrafos || [])) if (texto(p)) blocos.push({ tipo: 'paragrafo', texto: semLinks(p) });
    const fs_ = [].concat(s.fotos || []).map(Number).filter((id) => ids.has(id) && !usadas.has(id) && id !== capa).slice(0, 3);
    fs_.forEach((id) => usadas.add(id));
    if (fs_.length) blocos.push({ tipo: 'fotos', fotos: fs_.map((id) => ({ foto: id, legenda: legenda(id) })) });
  }
  if (im.fotos.length >= 6 && !blocos.some((b) => b.tipo === 'fotos')) {
    const extra = galeria.filter((g) => g.foto !== capa && g.ambiente !== 'planta').slice(1, 3);
    const i = blocos.findIndex((b) => b.tipo === 'titulo');
    if (extra.length) blocos.splice(i + 2, 0, { tipo: 'fotos', fotos: extra.map((g) => ({ foto: g.foto, legenda: g.legenda })) });
  }
  const f = j.fechamento || {};
  blocos.push({ tipo: 'chamada', tema: 'visita' });
  blocos.push({ tipo: 'titulo', nivel: 2, texto: texto(f.titulo) || 'Para quem este imóvel faz sentido' });
  for (const p of [].concat(f.paragrafos || [])) if (texto(p)) blocos.push({ tipo: 'paragrafo', texto: semLinks(p) });
  if (f.dica && texto(f.dica.texto)) blocos.push({ tipo: 'destaque', tom: 'dica', titulo: texto(f.dica.titulo) || 'O que perguntar ao corretor', texto: semLinks(f.dica.texto) });
  // títulos repetidos não passam
  const vistos = new Set();
  for (const b of blocos) if (b.tipo === 'titulo') { let k = b.texto.toLowerCase(); while (vistos.has(k)) { b.texto += ' em detalhe'; k = b.texto.toLowerCase(); } vistos.add(k); }

  let slug = slugify(j.slug || j.titulo || `${im.tipo} ${im.bairro} ${im.cidade}`).replace(new RegExp(`-?${im.codigo.toLowerCase()}$`), '').slice(0, 70).replace(/-+$/, '');
  slug = `${slug}-${im.codigo.toLowerCase()}`;
  return {
    codigo: im.codigo, slug, titulo: semLinks(j.titulo), resumo: ajustarResumo(j.resumo),
    capa: { foto: capa, alt: semLinks(j.capa && j.capa.alt).length >= 12 ? semLinks(j.capa.alt) : legenda(capa) },
    blocos, galeria,
    perguntas: [].concat(j.perguntas || []).filter((q) => q && texto(q.pergunta) && texto(q.resposta)).slice(0, 5).map((q) => ({ pergunta: texto(q.pergunta), resposta: semLinks(q.resposta) })),
    redes: { legenda: semLinks(j.redes && j.redes.legenda).replace(/#\S+/g, '').trim(), hashtags: [].concat((j.redes && j.redes.hashtags) || []).map((h) => String(h).replace(/[^\p{L}\p{N}]/gu, '')).filter((h) => h.length >= 2 && h.length <= 30).slice(0, 10) },
  };
}

function avaliar(pg, im) {
  const lido = lerPagina(pg);
  if (!lido.ok) return { ok: false, erros: lido.erros.map((e) => `formato: ${e}`) };
  const ficha = { codigo: im.codigo, tipo: im.tipo, quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, area_total: im.area_total, fotos: im.fotos.map((f) => f.foto) };
  const av = avaliarPagina(lido.valor, ficha, { modo: 'publicar' });
  return { ok: av.aprovado, erros: av.erros, avisos: av.avisos, medidas: av.medidas };
}

async function escrever(im, fotos, dir) {
  const msgs = [{ role: 'system', content: REGRAS }, { role: 'user', content: `Ficha do imóvel e o que cada foto mostra:\n${JSON.stringify(fichaParaModelo(im, fotos), null, 1)}\n\nEscreva a página. Só o JSON.` }];
  let ultimo = null;
  for (let t = 1; t <= 4; t += 1) {
    const resp = await ollama({ model: TEXTO, think: false, format: 'json', options: { temperature: t === 1 ? 0.6 : 0.4, num_ctx: 10240, num_predict: 3500 }, messages: msgs });
    let j;
    try { j = jsonDe(resp); } catch { msgs.push({ role: 'assistant', content: resp }, { role: 'user', content: 'Isso não é um JSON válido. Devolva só o JSON completo.' }); continue; }
    const pg = montar(im, fotos, j);
    const av = avaliar(pg, im);
    ultimo = { pg, av };
    fs.writeFileSync(path.join(dir, `tentativa-${t}.json`), JSON.stringify({ pg, av }, null, 1));
    if (av.ok) return ultimo;
    log(`  ${im.codigo} tentativa ${t} reprovada: ${av.erros.join(' | ').slice(0, 400)}`);
    msgs.push({ role: 'assistant', content: JSON.stringify(j) }, { role: 'user', content: `A régua reprovou a página:\n- ${av.erros.join('\n- ')}\n(Medidas: ${JSON.stringify(av.medidas || {})}.) Corrija SÓ o que foi apontado e devolva o JSON completo, no mesmo formato.` });
  }
  return { ...ultimo, falhou: true };
}

// ------------------------------------------------------------ 3. publicar
function publicar(arquivos) {
  if (!arquivos.length) return;
  try {
    const out = execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'portal-publicar.mjs'), 'publicar', ...arquivos], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    log(`PUBLICADAS ${arquivos.length}:${out.split('\n').filter((l) => l.includes('✓')).map((l) => `\n   ${l.trim()}`).join('')}`);
  } catch (e) {
    log(`Falhou ao publicar o lote (${String(e.stderr || e.message).trim().slice(0, 600)}); publicando um a um.`);
    if (arquivos.length > 1) for (const a of arquivos) publicar([a]);
  }
}

// ------------------------------------------------------------ principal
const dados = await (await fetch(`${PORTAL}/imoveis/dados.json?t=${Date.now()}`)).json();
const ordemFila = ['sem-pagina', 'desatualizada', 'reprovada', 'sem-arquivo'];
let fila = ordemFila.flatMap((e) => dados.imoveis.filter((im) => im.pagina.estado === e));
if (SO) fila = fila.filter((im) => SO.includes(im.codigo));
fila = fila.slice(0, QUANTOS);
log(`${dados.imoveis.length} imóveis à venda · ${fila.length} na fila desta vez · visão ${VISAO} · texto ${TEXTO}`);
fs.mkdirSync(PASTA, { recursive: true });

let prontos = [];
const resultado = { publicadas: 0, falharam: [] };
const FASE = valor('--fase', 'tudo'); // fotos | texto | tudo
if (FASE !== 'texto') {
  log('Fase 1: o modelo de visão olha as fotos de todos os imóveis da fila.');
  for (const [n, im] of fila.entries()) {
    const dir = path.join(PASTA, im.codigo); fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    try { await olharFotos(im, dir); log(`[fotos ${n + 1}/${fila.length}] ${im.codigo} · ${im.fotos.length} fotos · ${Math.round((Date.now() - t0) / 1000)} s`); }
    catch (e) { log(`  ${im.codigo} fotos: erro ${e.message}`); }
  }
  await ollama({ model: VISAO, keep_alive: 0, messages: [{ role: 'user', content: 'ok' }] }).catch(() => {});
}
if (FASE !== 'fotos') {
  log('Fase 2: o modelo de texto escreve as páginas.');
  for (const [n, im] of fila.entries()) {
    const dir = path.join(PASTA, im.codigo); fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    try {
      log(`[texto ${n + 1}/${fila.length}] ${im.codigo} · ${im.tipo} · ${im.bairro}`);
      const fotos = await olharFotos(im, dir);
      const r = await escrever(im, fotos, dir);
      if (!r || r.falhou || !r.av.ok) { resultado.falharam.push(im.codigo); log(`  ${im.codigo} NÃO passou na régua depois de 4 tentativas.`); continue; }
      const arq = path.join(dir, 'pagina.json');
      fs.writeFileSync(arq, `${JSON.stringify(r.pg, null, 2)}\n`);
      log(`  ${im.codigo} aprovada · ${r.av.medidas.palavras} palavras · ${Math.round((Date.now() - t0) / 1000)} s${r.av.avisos.length ? ` · avisos: ${r.av.avisos.join(' | ').slice(0, 200)}` : ''}`);
      prontos.push(arq);
      if (PUBLICAR && prontos.length >= LOTE) { publicar(prontos); resultado.publicadas += prontos.length; prontos = []; }
    } catch (e) { resultado.falharam.push(im.codigo); log(`  ${im.codigo} erro: ${e.message}`); }
  }
  if (PUBLICAR && prontos.length) { publicar(prontos); resultado.publicadas += prontos.length; }
}
log(`FIM · ${resultado.publicadas} enviadas para publicar · ${resultado.falharam.length} sem página (${resultado.falharam.join(', ') || '—'})`);
