// Herrera HOUSE IA · processos do PC por imobiliária (fase 1, etapas 9 e 11).
//
// No PC rodam serviços que são DE UMA imobiliária (robô do WhatsApp do Fisguei, linhas dos agentes, leitor de alertas
// por e-mail, monitor de portais) e rotinas da BASE COMUM (ligar anúncios a condomínios). Este módulo:
//  - diz quais imobiliárias rodam neste PC: IMOBILIARIAS_PC="ruah,outra" (padrão: IMOBILIARIA_PADRAO, hoje 'ruah');
//  - sobe cada serviço da imobiliária dentro do contexto dela (tenant.comImobiliaria) e as rotinas comuns uma vez só;
//  - dá a pasta de dados de cada imobiliária: a RUAH continua em data/ (data/whatsapp-thiago, data/whatsapp-agente-<x>),
//    as novas ficam em data/<slug>/ (data/<slug>/whatsapp-thiago, ...);
//  - prende o contexto da imobiliária aos callbacks de eventos (Baileys, sockets, IMAP): liga(fn);
//  - guarda estado em memória separado por imobiliária: estadoPor(fabrica);
//  - lê --imobiliaria <slug> dos scripts (argImobiliaria / entra).
// Não depende do banco (pode ser carregado antes dele, inclusive pelos scripts).
const path = require('path');
const { AsyncResource } = require('node:async_hooks');
const cfg = require('./config');
const tenant = require('./tenant');

// Imobiliária cujas pastas ficam na raiz de data/ (as que já existiam antes da plataforma). Não muda com IMOBILIARIA_PADRAO.
const slugRaiz = () => (process.env.IMOBILIARIA_PASTA_RAIZ || 'ruah').trim().toLowerCase();
const ehRaiz = (slug) => String(slug || '').toLowerCase() === slugRaiz();
const atualOuPadrao = () => tenant.atual() || tenant.padrao();

// ---- quais imobiliárias rodam neste PC ----
// Slugs inválidos são ignorados (com aviso) para não derrubar quem já funciona. Sem MULTI=1 o SQL não separa as
// imobiliárias (todas escreveriam nas mesmas tabelas): aí só a padrão sobe, mesmo que a lista tenha mais.
function slugsPc({ avisa = (m) => console.error('[PC]', m) } = {}) {
  const bruto = String(process.env.IMOBILIARIAS_PC || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const lista = [];
  for (const s of bruto.length ? bruto : [tenant.padrao().slug]) {
    try { const c = tenant.contexto(s); if (!lista.includes(c.slug)) lista.push(c.slug); } catch (e) { avisa(`IMOBILIARIAS_PC: ${e.message} (ignorada)`); }
  }
  if (!lista.length) lista.push(tenant.padrao().slug);
  if (lista.length > 1 && !tenant.multi()) {
    avisa(`IMOBILIARIAS_PC tem ${lista.length} imobiliárias, mas MULTI não está ligado: sobe só a padrão (${tenant.padrao().slug}).`);
    return [tenant.padrao().slug];
  }
  return lista;
}

// ---- pasta de dados da imobiliária do contexto ----
function pastaDe(slug, ...partes) {
  const s = tenant.contexto(slug).slug;
  return ehRaiz(s) ? path.join(cfg.DATA_DIR, ...partes) : path.join(cfg.DATA_DIR, s, ...partes);
}
const pastaDados = (...partes) => pastaDe(atualOuPadrao().slug, ...partes);

// ---- configuração dos serviços do PC por imobiliária ----
// A imobiliária da raiz (RUAH) lê como sempre: cfg.X (getter por contexto quando X já é por imobiliária em config.js).
// As outras: X_<SLUG> do ambiente (ex.: RADAR_EMAIL_OUTRA); sem isso, se X já é por imobiliária em config.js (ex.:
// RADAR_BAIRROS, que vem do cadastro em base.imobiliarias), o valor do cadastro; senão o padrão dado aqui. Nunca o .env
// da RUAH: uma imobiliária nova nunca lê o Gmail nem vigia os bairros de outra por engano.
// TODO(fase1 · etapa plataforma): credenciais (RADAR_EMAIL/SENHA) em base.chaves_integracao.
const porImobiliaria = (chave) => { const d = Object.getOwnPropertyDescriptor(cfg, chave); return !!(d && d.get); };
function cfgDa(chave, padraoOutras = '') {
  const c = atualOuPadrao();
  if (ehRaiz(c.slug)) return cfg[chave];
  const v = process.env[`${chave}_${c.slug.toUpperCase()}`];
  if (v !== undefined) return String(v).trim();
  if (porImobiliaria(chave) && tenant.atual()) { const x = cfg[chave]; if (x !== undefined && x !== null && String(x).trim() !== '') return String(x).trim(); }
  return padraoOutras;
}

// ---- contexto preso a callbacks ----
// Eventos de bibliotecas (Baileys, sockets, IMAP) podem disparar a partir de um recurso criado em outro contexto
// (cache, pool ou timer da biblioteca): o callback ligado volta sempre para a imobiliária de quando foi registrado.
const liga = (fn) => AsyncResource.bind(fn);

// ---- estado em memória por imobiliária ----
// const EST = estadoPor(() => ({ timer: null })); EST() devolve o objeto da imobiliária do contexto (cria na 1ª vez).
function estadoPor(fabrica) {
  const mapa = new Map();
  const f = () => {
    const slug = atualOuPadrao().slug;
    if (!mapa.has(slug)) mapa.set(slug, fabrica(slug));
    return mapa.get(slug);
  };
  f.todos = mapa;
  return f;
}

// ---- arranque dos serviços do PC ----
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '[PC]', ...a);

// Escritório virtual: um processo das linhas por imobiliária (src/agentes/servico.js <slug>), reaberto se cair.
// Processo separado por imobiliária: o estado em memória do escritório (fila, travas) nunca se mistura.
function abreEscritorio(slug, { fork = require('child_process').fork, raiz = path.join(__dirname, '..') } = {}) {
  const abre = () => {
    const p = fork(path.join(raiz, 'src/agentes/servico.js'), [slug], { execArgv: ['--disable-warning=ExperimentalWarning'] });
    p.on('exit', (c) => { console.error(new Date().toLocaleTimeString('pt-BR'), `[escritório ${slug}] processo das linhas saiu (código`, c + '); reabrindo em 10 s'); setTimeout(abre, 10e3); });
    abre.atual = p;
  };
  process.on('exit', () => { try { abre.atual && abre.atual.kill(); } catch {} });
  abre();
  return abre;
}

// Serviços que são da imobiliária: rodam uma vez para cada slug, dentro do contexto dele.
const SERVICOS_IMOBILIARIA = {
  // Radar automático (alertas por e-mail e monitor dos portais); com o banco online o que ele acha aparece também na Vercel.
  alertas: () => require('./services/alertas').iniciar(),
  portais: () => require('./services/portais').iniciar(),
  // Robô TH-IA-GO CORRETOR (WhatsApp pelo QR code).
  robo: () => require('./fisguei/robo').iniciar(),
  // Linhas de WhatsApp dos agentes, num processo à parte (o site pesado não trava o WhatsApp).
  escritorio: (slug) => { if (cfg.ESCRITORIO !== '0') abreEscritorio(slug); },
};

// Rotinas da base comum: agendadas uma vez só (no contexto da imobiliária padrão).
// A renovação da vitrine (routes/mercado.js) já se agenda sozinha ao carregar o módulo, também uma vez.
// vincula: um timer só, mas cada rodada passa por TODAS as imobiliárias do PC, uma de cada vez e no contexto de cada uma:
// desde a separação das tabelas mistas, condominios/base.vincular() grava em privadas (imoveis.condominio_id,
// oportunidades, condominio_alertas a partir de condominio_alvos). Rodando só na padrão, a carteira e o Radar das outras
// nunca seriam ligados aos prédios. A conferência dos anúncios do Fisgar (cond_checado) é comum: quem passa primeiro marca.
function rodadaVincula(slugs, vincular = (...a) => require('./condominios/base').vincular(...a)) {
  const out = {};
  for (const slug of slugs) {
    tenant.comImobiliaria(slug, () => {
      try { const r = out[slug] = vincular(); if (r && (r.radar || r.fisguei || r.imoveis)) console.log(`[condomínios${ehRaiz(slug) ? '' : ' ' + slug}]`, r); }
      catch (e) { out[slug] = { erro: e.message }; console.error(`[condomínios${ehRaiz(slug) ? '' : ' ' + slug}]`, e.message); }
    });
  }
  return out;
}
const SERVICOS_BASE = {
  // Condomínios: liga anúncios novos do Radar/Fisguei aos prédios e avisa dos prédios-alvo (a cada 10 min).
  vincula: (_slug, slugs = slugsPc({ avisa: () => {} })) => {
    const vincula = () => rodadaVincula(slugs);
    setTimeout(vincula, 60e3); setInterval(vincula, 10 * 60e3);
  },
};

// Sobe tudo. Devolve { slugs, iniciados: [{ slug, servico }], falhas: [...] } (usado pelos testes).
function arranca({ slugs = slugsPc(), imobiliaria = SERVICOS_IMOBILIARIA, base = SERVICOS_BASE } = {}) {
  const out = { slugs, iniciados: [], falhas: [], avisos: [] };
  const roda = (slug, nome, fn) => {
    try { fn(slug); out.iniciados.push({ slug, servico: nome }); }
    catch (e) { out.falhas.push({ slug, servico: nome, erro: e.message }); console.error(`[PC] ${nome} (${slug}) não subiu:`, e.message); }
  };
  if (slugs.length > 1 || !ehRaiz(slugs[0])) log(`imobiliárias neste PC: ${slugs.join(', ')}`);
  for (const slug of slugs) tenant.comImobiliaria(slug, () => {
    // sem cadastro em base.imobiliarias, config.js devolve o .env (que é da imobiliária padrão): nome errado nas mensagens
    if (tenant.multi() && slug !== tenant.padrao().slug && !tenant.imobiliaria()) out.avisos.push(`imobiliária "${slug}" sem cadastro na plataforma: nome e textos sairiam com os dados do .env.`);
    for (const [nome, fn] of Object.entries(imobiliaria)) roda(slug, nome, fn);
  });
  for (const a of out.avisos) console.error('[PC] atenção:', a);
  const padrao = tenant.padrao().slug;
  tenant.comImobiliaria(padrao, () => { for (const [nome, fn] of Object.entries(base)) roda(padrao, nome, (s) => fn(s, slugs)); });
  return out;
}

// ---- scripts: --imobiliaria <slug> ----
// Tira --imobiliaria <slug> (ou --imobiliaria=<slug>) da lista de argumentos, para o resto do script ler como antes.
// Padrão: IMOBILIARIA_PADRAO || 'ruah'. Slug inválido → { erro }.
function argImobiliaria(args) {
  const resto = [];
  let slug = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--imobiliaria') { slug = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : ''; continue; }
    if (a.startsWith('--imobiliaria=')) { slug = a.slice('--imobiliaria='.length); continue; }
    resto.push(a);
  }
  if (slug === '') return { erro: 'Diga a imobiliária: --imobiliaria <slug>', args: resto };
  try { return { slug: tenant.contexto(slug || tenant.padrao().slug).slug, args: resto }; }
  catch (e) { return { erro: e.message, args: resto }; }
}

// Para os scripts: lê --imobiliaria e faz o resto do script (inclusive depois de await) rodar dentro dela.
// Equivale a envolver o script inteiro em comImobiliaria. Sai com código 2 se o slug for inválido.
function entra(argv = process.argv.slice(2)) {
  const r = argImobiliaria(argv);
  if (r.erro) { console.error(`\n✗ ${r.erro}`); process.exit(2); }
  tenant.als.enterWith(tenant.contexto(r.slug));
  return { slug: r.slug, args: r.args, raiz: ehRaiz(r.slug) };
}

// Publicação de conteúdo (portal/blog/bairros) só tem ramo e endereço da RUAH por enquanto.
// Para outra imobiliária: comandos de `escreve` (que mexem no ramo de conteúdo) são recusados; os de leitura só rodam
// com o endereço do site dela explícito em `urlEnv` (sem isso leriam o site da RUAH). Devolve a mensagem de recusa ou null.
function travaOutra({ slug, comando, escreve = [], urlEnv }) {
  if (ehRaiz(slug) || !comando) return null;
  if (escreve.includes(comando)) return `"${comando}" ainda usa só o ramo de conteúdo da ${slugRaiz().toUpperCase()}; para a imobiliária "${slug}" o ramo próprio entra na etapa da plataforma. Nada foi feito.`;
  if (urlEnv && !process.env[urlEnv]) return `Para a imobiliária "${slug}", diga o endereço do site dela em ${urlEnv} (sem isso eu leria os dados da ${slugRaiz().toUpperCase()}). Nada foi feito.`;
  return null;
}

module.exports = { slugsPc, slugRaiz, ehRaiz, pastaDe, pastaDados, cfgDa, liga, estadoPor, arranca, rodadaVincula, abreEscritorio, SERVICOS_IMOBILIARIA, SERVICOS_BASE, argImobiliaria, entra, travaOutra };
