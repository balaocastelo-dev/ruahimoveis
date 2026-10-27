/* Sistema RUAH — Fisguei inteligente: a base de anúncios do Fisgar em cartões, com filtros, sinais de oportunidade,
   saldo de créditos do Fisgar e uma prévia lateral de cada imóvel. Carregado depois do fisguei.js (substitui a tela da lista). */
'use strict';

const FX_SINAIS = {
  queda: ['Baixou o preço', '↓'], queda_forte: ['Queda forte', '⇊'], novo: ['Anúncio novo', '✦'], antigo: ['Anúncio antigo', '⌛'],
  abaixo: ['Barato para o bairro', '◆'], acima: ['Caro para o bairro', '▲'], particular: ['Particular', '☺'], repetido: ['Em vários anúncios', '⧉'], subiu: ['Subiu o preço', '↑'],
};
const FX_ORDEM_SINAIS = ['queda', 'queda_forte', 'particular', 'abaixo', 'novo', 'antigo', 'repetido', 'acima'];
const FX_DONO = [['', 'Todos'], ['sem', 'Sem proprietário'], ['com', 'Com proprietário'], ['confirmado', 'Dono confirmou']];
const FX_CATS = [['', 'Tudo'], ['casas', 'Casas'], ['apartamentos', 'Apartamentos'], ['terrenos', 'Terrenos'], ['comerciais', 'Comerciais']];
const FX_ORDENS = [['nota', 'Melhores oportunidades'], ['recentes', 'Mais recentes'], ['queda', 'Maior queda de preço'], ['m2', 'Menor m² comparado ao bairro'], ['menor', 'Menor preço'], ['maior', 'Maior preço'], ['antigos', 'Há mais tempo anunciados']];
const FX_ETAPAS = [['', 'Em andamento'], ['precisa', 'Precisa do corretor'], ['abordando', 'Robô abordando'], ['confirmado', 'Dono confirmou'], ['captado', 'No Radar'], ['sem_interesse', 'Sem interesse'], ['sem_dono', 'Ninguém confirmou'], ['descartado', 'Descartados']];
const FX_CAMPOS = ['q', 'dono', 'sinais', 'cat', 'bairro', 'anunciante', 'vmin', 'vmax', 'quartos', 'amin', 'foto', 'numero', 'etapa', 'ordem', 'vista'];
const FX_DONO_TXT = { nenhum: ['Sem proprietário', 'fx-d0'], lista: ['Possíveis donos, sem consulta', 'fx-d1'], consultado: ['Proprietário consultado', 'fx-d2'], confirmado: ['Dono confirmou', 'fx-d3'] };

let FX = null; // estado da tela
const fxMi = (v) => (!v ? '—' : v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : `R$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} mil`);
const fxN = (v) => (v || v === 0 ? Number(v).toLocaleString('pt-BR') : '—');
const fxSemMov = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fxQS = (o, semPagina) => { const u = new URLSearchParams(); for (const k of FX_CAMPOS) if (o[k]) u.set(k, o[k]); if (!semPagina && o.pagina > 1) u.set('pagina', o.pagina); return u.toString(); };

// links antigos (#/fisguei?filtro=com_dono…) continuam valendo
function fxDeQS(qs) {
  const f = {}; for (const k of FX_CAMPOS) if (qs.get(k)) f[k] = qs.get(k);
  const ant = qs.get('filtro');
  if (ant === 'com_dono') f.dono = 'com'; else if (ant === 'sem_dono') f.dono = 'sem'; else if (ant === 'particular') f.sinais = 'particular';
  else if (ant) f.etapa = ant;
  return f;
}

async function telaFisguei(qs) {
  FX = { f: fxDeQS(qs), pagina: 1, itens: [], total: 0, paginas: 1, carregando: false, sel: new Set(), dados: null, seq: 0 };
  const [r, pd, cr] = await Promise.all([api('GET', '/api/fisguei/resumo'), api('GET', '/api/fisguei/pedidos'), api('GET', '/api/fisguei/creditos'), typeof mapasCfg === 'function' ? mapasCfg() : null]);
  FX.resumo = r; FX.pedidos = pd; FX.cred = cr;
  $('#main').innerHTML = `<div class="fx">
    <div class="eyebrow">Captação · Radar + Fisguei</div>
    ${typeof capAbas === 'function' ? capAbas('fisguei') : ''}
    <header class="fx-topo">
      <div class="fx-titulo">
        <h1>Imóveis do Fisgar</h1>
        <p>${fxN(r.anuncios)} anúncios de Campinas na base da RUAH. A leitura abaixo aponta onde vale gastar crédito primeiro: quem baixou o preço, quem anuncia sozinho, quem está barato para o bairro.</p>
        <div class="fx-saude" id="fx-saude">${fxSaude(r, pd)}</div>
      </div>
      <div id="fx-cred">${fxCreditos(cr)}</div>
    </header>
    <div id="fx-ferramentas" class="fx-ferr" hidden></div>
    <section class="fx-ia" id="fx-ia" aria-live="polite"><div class="fx-ia-cab"><span class="fx-ia-sim" aria-hidden="true"></span><b>Leitura da base</b><span class="muted small" id="fx-ia-sub">lendo os anúncios…</span></div><div class="fx-ia-l" id="fx-ia-l">${'<span class="fx-sk-l"></span>'.repeat(3)}</div></section>
    <div class="fx-barra" id="fx-barra"></div>
    <div class="fx-b2" id="fx-b2"></div>
    <div id="fx-filtros-mais" class="fx-mais" hidden></div>
    <div id="fx-ativos" class="fx-ativos"></div>
    <div id="fx-corpo"></div>
    <div id="fx-sel" class="fx-sel" hidden></div>
  </div>
  <div class="fx-gaveta-fundo" id="fx-gaveta-fundo" hidden></div>
  <aside class="fx-gaveta" id="fx-gaveta" aria-label="Prévia do imóvel" hidden tabindex="-1"></aside>`;
  fxBarra();
  await fxCarrega(true);
  poll = setInterval(fxAtualizaStatus, 15000);
}

// ---------- topo: saúde dos robôs e créditos ----------
function fxSaude(r, pd) {
  const rb = r.robo || {}, ext = (pd && pd.extensao) || {};
  const robo = { conectado: ['ok', 'Robô do WhatsApp conectado'], qr: ['warn', 'Robô esperando o QR code'], desligado: ['bad', 'Robô do WhatsApp desligado'] }[rb.estado] || ['warn', 'Robô do WhatsApp: ' + (rb.estado || '—')];
  const ex = !ext.vivo ? ['bad', 'Extensão sem contato'] : !ext.fisgar_aberto ? ['warn', 'Abra o Fisgar no Chrome'] : ['ok', 'Fisgar aberto no Chrome'];
  const fila = pd && pd.fila ? ['warn', `${pd.fila} busca(s) de dono na fila`] : ['ok', 'Nenhuma busca na fila'];
  const precisa = r.precisaCorretor ? `<button type="button" class="fx-s bad" data-act="fx-aplica" data-f='${esc(JSON.stringify({ etapa: 'precisa' }))}'><i></i>${r.precisaCorretor} resposta(s) esperando o corretor</button>` : '';
  return `${precisa}${[robo, ex, fila].map(([c, t]) => `<span class="fx-s ${c}"><i></i>${esc(t)}</span>`).join('')}<button type="button" class="btn sm" data-act="fx-ferr" aria-expanded="false">Robôs e extensão</button>`;
}
function fxCreditos(c) {
  const usado = Math.max(0, c.plano - c.saldo), p = Math.min(1, c.saldo / c.plano);
  const R = 46, L = 2 * Math.PI * R;
  const fonte = c.fonte === 'fisgar' && c.leitura ? `Lido no Fisgar ${fxQuando(c.leitura.em)}${c.leitura.gasto ? `, menos ${c.leitura.gasto} gasto(s) depois` : ''}`
    : c.fonte === 'manual' && c.leitura ? `Informado ${fxQuando(c.leitura.em)}${c.leitura.gasto ? `, menos ${c.leitura.gasto} gasto(s) depois` : ''}`
    : `Estimado: plano de ${fxN(c.plano)} menos o que o sistema viu gastar no mês. Abra o Fisgar com a extensão para ler o saldo real.`;
  const baixo = c.saldo < c.plano * 0.15;
  return `<div class="fx-cred ${baixo ? 'baixo' : ''}" role="group" aria-label="Créditos do Fisgar">
    <svg class="fx-anel" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${R}" class="t"/><circle cx="55" cy="55" r="${R}" class="v" style="stroke-dasharray:${L};stroke-dashoffset:${L * (1 - p)}"/></svg>
    <div class="fx-cred-n"><b data-conta="${c.saldo}">${fxN(c.saldo)}</b><span>créditos no Fisgar</span></div>
    <dl class="fx-cred-d">
      <div><dt>Hoje</dt><dd>${fxN(c.gasto_hoje)} gasto(s) · robô pode mais ${fxN(c.restante_hoje)}</dd></div>
      <div><dt>No mês</dt><dd>${fxN(usado)} de ${fxN(c.plano)} usados</dd></div>
      <div><dt>Ritmo</dt><dd>${fxN(c.por_dia_disponivel)} por dia até o fim do mês (${c.dias_restantes} dia${c.dias_restantes > 1 ? 's' : ''})</dd></div>
    </dl>
    <p class="fx-cred-f">${esc(fonte)}</p>
    ${veTudo() ? '<button type="button" class="btn sm" data-act="fx-saldo">Corrigir saldo</button>' : ''}
  </div>`;
}
const fxQuando = (t) => { if (!t) return ''; const d = new Date(String(t).replace(' ', 'T')); const min = Math.round((Date.now() - d) / 60000); return min < 2 ? 'agora há pouco' : min < 60 ? `há ${min} min` : `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`; };
ACT['fx-saldo'] = () => {
  const c = FX.cred;
  modal(`<h2>Créditos do Fisgar</h2><form data-form="fx-saldo">
    <p class="small muted" style="margin-top:0">Veja o saldo no canto do painel do Fisgar e digite aqui. A partir daí o sistema desconta cada busca do robô e cada consulta feita no Fisgar com a extensão ligada. Quando o Fisgar mostrar o saldo numa resposta, a extensão atualiza sozinha.</p>
    <div class="grid g2"><label class="f">Saldo agora<input name="saldo" type="number" min="0" max="999999" value="${c.saldo}" required></label>
    <label class="f">Créditos do plano por mês<input name="plano" type="number" min="1" max="999999" value="${c.plano}"></label></div>
    <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar saldo</button></div></form>`);
};
FORM['fx-saldo'] = async (f) => { FX.cred = await api('POST', '/api/fisguei/creditos', formJSON(f)); $('#fx-cred').innerHTML = fxCreditos(FX.cred); fechaModal(); toast('Saldo salvo'); };
ACT['fx-ferr'] = (el) => {
  const box = $('#fx-ferramentas'); const abre = box.hidden;
  box.hidden = !abre; el.setAttribute('aria-expanded', String(abre));
  if (abre) box.innerHTML = cartaoRobo(FX.resumo) + cartaoBusca(FX.pedidos) + cartaoExtensao(FX.resumo);
};
async function fxAtualizaStatus() {
  if (!FX || !location.hash.startsWith('#/fisguei') || /^#\/fisguei\/\d/.test(location.hash)) return;
  try {
    const [r, pd, cr] = await Promise.all([api('GET', '/api/fisguei/resumo'), api('GET', '/api/fisguei/pedidos'), api('GET', '/api/fisguei/creditos')]);
    FX.resumo = r; FX.pedidos = pd;
    const s = $('#fx-saude'); if (s) { const aberto = !$('#fx-ferramentas').hidden; s.innerHTML = fxSaude(r, pd); if (aberto) { s.querySelector('[data-act="fx-ferr"]').setAttribute('aria-expanded', 'true'); const el = $('#fg-robo'); if (el) el.outerHTML = cartaoRobo(r); } }
    if (cr.saldo !== FX.cred.saldo || cr.gasto_hoje !== FX.cred.gasto_hoje) { FX.cred = cr; $('#fx-cred').innerHTML = fxCreditos(cr); }
  } catch {}
}

// ---------- barra de filtros ----------
function fxBarra() {
  const f = FX.f, c = (FX.dados && FX.dados.contagem) || { sinais: {}, donos: {}, cats: {}, bairros: [] };
  const sinaisOn = new Set((f.sinais || '').split(',').filter(Boolean));
  $('#fx-barra').innerHTML = `
    <div class="fx-b1">
      <form data-form="fx-busca" class="fx-busca" role="search"><input name="q" id="fx-q" value="${esc(f.q || '')}" placeholder="Rua, bairro, CEP, imobiliária ou FG-00123" aria-label="Buscar na base" autocomplete="off"><kbd aria-hidden="true">/</kbd></form>
      <div class="fx-seg" role="group" aria-label="Proprietário">${FX_DONO.map(([k, t]) => `<button type="button" data-act="fx-dono" data-v="${k}" aria-pressed="${(f.dono || '') === k}">${t}<span>${fxN(c.donos[k] ?? '')}</span></button>`).join('')}</div>
      <label class="fx-ordem"><span class="sr">Ordem</span><select data-fx="ordem" aria-label="Ordem">${FX_ORDENS.map(([k, t]) => `<option value="${k}" ${(f.ordem || 'nota') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="fx-seg fx-vista" role="group" aria-label="Ver como"><button type="button" data-act="fx-vista" data-v="" aria-pressed="${f.vista !== 'mapa'}">Cartões</button><button type="button" data-act="fx-vista" data-v="mapa" aria-pressed="${f.vista === 'mapa'}">Mapa</button></div>
    </div>`;
  $('#fx-b2').innerHTML = `
      <div class="fx-chips" role="group" aria-label="Sinais">${FX_ORDEM_SINAIS.map((k) => `<button type="button" class="fx-chip s-${k}" data-act="fx-sinal" data-v="${k}" aria-pressed="${sinaisOn.has(k)}" ${!c.sinais[k] && !sinaisOn.has(k) ? 'data-vazio' : ''}><i aria-hidden="true">${FX_SINAIS[k][1]}</i>${FX_SINAIS[k][0]}<span>${fxN(c.sinais[k] ?? 0)}</span></button>`).join('')}</div>
      <span class="sp"></span>
      <div class="fx-cats" role="group" aria-label="Tipo de imóvel">${FX_CATS.map(([k, t]) => `<button type="button" data-act="fx-cat" data-v="${k}" aria-pressed="${(f.cat || '') === k}">${t}${c.cats[k] ? ` <span>${fxN(c.cats[k])}</span>` : ''}</button>`).join('')}</div>
      <button type="button" class="btn sm fx-mais-bt" data-act="fx-mais" aria-expanded="${!$('#fx-filtros-mais').hidden}">Mais filtros${fxContaExtras() ? ` <b>${fxContaExtras()}</b>` : ''}</button>`;
}
const fxContaExtras = () => ['bairro', 'anunciante', 'vmin', 'vmax', 'quartos', 'amin', 'foto', 'numero', 'etapa'].filter((k) => FX.f[k]).length;
function fxMaisFiltros() {
  const f = FX.f, c = (FX.dados && FX.dados.contagem) || { bairros: [] };
  const bs = new Set((f.bairro || '').split(',').filter(Boolean));
  $('#fx-filtros-mais').innerHTML = `<form data-form="fx-mais" class="fx-mais-g">
    <fieldset class="fx-mais-bairros"><legend>Bairros</legend><input type="search" placeholder="Filtrar bairros" data-fx-bairro aria-label="Filtrar a lista de bairros">
      <div class="fx-bairros">${c.bairros.map((b) => `<label data-nome="${esc(b.nome || '')}"><input type="checkbox" name="b" value="${esc(b.k)}" ${bs.has(b.k) ? 'checked' : ''}>${esc(b.nome || b.k)} <span>${fxN(b.n)}</span></label>`).join('') || '<span class="muted small">Nenhum bairro neste filtro.</span>'}</div></fieldset>
    <div class="fx-mais-c">
      <div class="grid g2"><label class="f">Valor mínimo<input name="vmin" type="number" min="0" step="50000" value="${esc(f.vmin || '')}" placeholder="R$"></label><label class="f">Valor máximo<input name="vmax" type="number" min="0" step="50000" value="${esc(f.vmax || '')}" placeholder="R$"></label></div>
      <div class="grid g2"><label class="f">Quartos (mínimo)<select name="quartos">${['', 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${String(f.quartos || '') === String(n) ? 'selected' : ''}>${n ? n + '+' : 'Qualquer'}</option>`).join('')}</select></label><label class="f">Área mínima (m²)<input name="amin" type="number" min="0" step="10" value="${esc(f.amin || '')}"></label></div>
      <div class="grid g2"><label class="f">Anunciante<select name="anunciante"><option value="">Todos</option><option value="particular" ${f.anunciante === 'particular' ? 'selected' : ''}>Particular</option><option value="imobiliaria" ${f.anunciante === 'imobiliaria' ? 'selected' : ''}>Imobiliária</option></select></label>
        <label class="f">Andamento<select name="etapa">${FX_ETAPAS.map(([k, t]) => `<option value="${k}" ${(f.etapa || '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <label class="fx-ck"><input type="checkbox" name="numero" ${f.numero ? 'checked' : ''}> Só com rua e número (o Fisgar acha o dono)</label>
      <label class="fx-ck"><input type="checkbox" name="foto" ${f.foto ? 'checked' : ''}> Só com foto</label>
      <div class="row"><button type="button" class="btn" data-act="fx-limpa">Limpar tudo</button><span class="sp"></span><button class="btn pri" type="submit">Aplicar filtros</button></div>
    </div></form>`;
  const ib = $('[data-fx-bairro]');
  ib.addEventListener('input', () => { const t = ib.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); $$('.fx-bairros label').forEach((l) => { l.hidden = t && !l.dataset.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t); }); });
}
function fxAtivos() {
  const f = FX.f, out = [];
  const tira = (k, v, t) => out.push(`<button type="button" class="fx-at" data-act="fx-tira" data-k="${k}" data-v="${esc(v || '')}" aria-label="Tirar filtro ${esc(t)}">${esc(t)} <span aria-hidden="true">×</span></button>`);
  if (f.q) tira('q', '', `“${f.q}”`);
  if (f.etapa) tira('etapa', '', (FX_ETAPAS.find((e) => e[0] === f.etapa) || [, f.etapa])[1]);
  if (f.bairro) { const nomes = new Map(((FX.dados && FX.dados.contagem.bairros) || []).map((b) => [b.k, b.nome])); f.bairro.split(',').forEach((b) => tira('bairro', b, nomes.get(b) || b)); }
  if (f.vmin) tira('vmin', '', `a partir de ${fxMi(+f.vmin)}`);
  if (f.vmax) tira('vmax', '', `até ${fxMi(+f.vmax)}`);
  if (f.quartos) tira('quartos', '', `${f.quartos}+ quartos`);
  if (f.amin) tira('amin', '', `${f.amin} m² ou mais`);
  if (f.anunciante) tira('anunciante', '', f.anunciante === 'particular' ? 'só particular' : 'só imobiliária');
  if (f.numero) tira('numero', '', 'com rua e número');
  if (f.foto) tira('foto', '', 'com foto');
  const d = FX.dados;
  $('#fx-ativos').innerHTML = `<span class="fx-tot"><b>${fxN(FX.total)}</b> imóve${FX.total === 1 ? 'l' : 'is'}${d && d.resumo.mediana_valor ? ` · mediana ${fxMi(d.resumo.mediana_valor)}` : ''}${d && d.resumo.mediana_m2 ? ` · R$ ${fxN(d.resumo.mediana_m2)}/m²` : ''}</span>${out.join('')}${out.length || f.sinais || f.dono || f.cat ? '<button type="button" class="fx-at limpa" data-act="fx-limpa">Limpar filtros</button>' : ''}`;
}
function fxMuda(o) {
  Object.assign(FX.f, o);
  for (const k of Object.keys(FX.f)) if (!FX.f[k]) delete FX.f[k];
  history.replaceState(null, '', '#/fisguei' + (fxQS(FX.f, true) ? '?' + fxQS(FX.f, true) : ''));
  fxCarrega(true);
}
ACT['fx-dono'] = (el) => fxMuda({ dono: el.dataset.v });
ACT['fx-cat'] = (el) => fxMuda({ cat: el.dataset.v });
ACT['fx-vista'] = (el) => fxMuda({ vista: el.dataset.v });
ACT['fx-sinal'] = (el) => { const s = new Set((FX.f.sinais || '').split(',').filter(Boolean)); s.has(el.dataset.v) ? s.delete(el.dataset.v) : s.add(el.dataset.v); fxMuda({ sinais: [...s].join(',') }); };
ACT['fx-tira'] = (el) => { const k = el.dataset.k; if (k === 'bairro') fxMuda({ bairro: FX.f.bairro.split(',').filter((b) => b !== el.dataset.v).join(',') }); else fxMuda({ [k]: '' }); };
ACT['fx-limpa'] = () => { FX.f = FX.f.vista ? { vista: FX.f.vista } : {}; const m = $('#fx-filtros-mais'); if (m && !m.hidden) { m.hidden = true; } fxMuda({}); };
ACT['fx-aplica'] = (el) => { let o = {}; try { o = JSON.parse(el.dataset.f || '{}'); } catch {} FX.f = { ...(FX.f.vista ? { vista: FX.f.vista } : {}), ...o }; fxMuda({}); $('#fx-b2').scrollIntoView({ behavior: fxSemMov() ? 'auto' : 'smooth', block: 'start' }); };
ACT['fx-mais'] = (el) => { const m = $('#fx-filtros-mais'); m.hidden = !m.hidden; el.setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) { fxMaisFiltros(); m.scrollIntoView({ behavior: fxSemMov() ? 'auto' : 'smooth', block: 'nearest' }); } };
FORM['fx-busca'] = async (f) => fxMuda({ q: formJSON(f).q.trim() });
FORM['fx-mais'] = async (f) => {
  const o = formJSON(f);
  const bairro = $$('input[name="b"]:checked', f).map((i) => i.value).join(',');
  $('#fx-filtros-mais').hidden = true;
  fxMuda({ bairro, vmin: o.vmin, vmax: o.vmax, quartos: o.quartos, amin: o.amin, anunciante: o.anunciante, etapa: o.etapa, numero: o.numero ? '1' : '', foto: o.foto ? '1' : '' });
};
document.addEventListener('change', (e) => { if (FX && e.target.matches && e.target.matches('[data-fx="ordem"]')) fxMuda({ ordem: e.target.value === 'nota' ? '' : e.target.value }); });
// busca enquanto digita (com pausa) e atalho "/"
document.addEventListener('input', (e) => { if (!FX || e.target.id !== 'fx-q') return; clearTimeout(FX.tq); FX.tq = setTimeout(() => fxMuda({ q: e.target.value.trim() }), 380); });
document.addEventListener('keydown', (e) => {
  if (!FX || !$('.fx')) return;
  const dig = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === '/' && !dig) { e.preventDefault(); $('#fx-q').focus(); $('#fx-q').select(); }
  const g = $('#fx-gaveta');
  if (g && !g.hidden) {
    if (e.key === 'Escape') fxFechaGaveta();
    if (!dig && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); fxVizinho(e.key === 'ArrowRight' ? 1 : -1); }
  }
});

// ---------- carregar ----------
async function fxCarrega(doZero) {
  const seq = ++FX.seq;
  if (doZero) { FX.pagina = 1; FX.itens = []; }
  FX.carregando = true;
  const corpo = $('#fx-corpo');
  if (FX.f.vista === 'mapa') { fxAtivosCarregando(); await fxMapa(seq); return; }
  if (doZero && corpo) corpo.innerHTML = `<div class="fx-grade">${'<div class="fx-card fx-sk"><div class="fx-foto"></div><div class="fx-c"><span></span><span></span><span></span></div></div>'.repeat(8)}</div>`;
  try {
    const d = await api('GET', '/api/fisguei/explorar?' + fxQS({ ...FX.f, pagina: FX.pagina }));
    if (seq !== FX.seq || !$('.fx')) return;
    if (doZero) { FX.dados = d; fxLeitura(d.leitura); }
    FX.total = d.total; FX.paginas = d.paginas;
    const novos = d.itens; FX.itens.push(...novos);
    if (doZero) { fxBarra(); fxAtivos(); }
    fxGrade(novos, doZero);
  } catch (e) { if (corpo) corpo.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  finally { if (seq === FX.seq) FX.carregando = false; }
}
function fxAtivosCarregando() { fxBarra(); }

// ---------- leitura da base ----------
function fxLeitura(l) {
  const box = $('#fx-ia-l'); if (!box || !l) return;
  $('#fx-ia-sub').textContent = `${fxN(l.base)} anúncios lidos agora${l.com_historico ? `, ${fxN(l.com_historico)} com mais de um preço registrado` : ''}`;
  box.innerHTML = l.frases.map((x, i) => `<button type="button" class="fx-frase n-${x.nivel}" data-act="fx-aplica" data-f='${esc(JSON.stringify(x.filtro || {}))}' style="--i:${i}"><span>${esc(x.texto)}</span><em>Ver ${x.filtro && Object.keys(x.filtro).length ? 'esses imóveis' : 'tudo'}</em></button>`).join('');
}

// ---------- cartões ----------
function fxCard(a, i = 0) {
  const fotos = a.fotos.length ? a.fotos : [a.lat && typeof MAPAS !== 'undefined' && MAPAS && MAPAS.fachada ? `/api/fachada?ref=fg${a.id}` : null].filter(Boolean);
  const q = a.sinais.find((s) => s.id === 'queda');
  const dn = FX_DONO_TXT[a.dono] || FX_DONO_TXT.nenhum;
  const sinais = a.sinais.filter((s) => s.id !== 'subiu').map((s) => `<span class="fx-tag s-${s.id === 'queda' && s.brusca ? 'queda_forte' : s.id}" title="${esc(s.texto)}"><i aria-hidden="true">${FX_SINAIS[s.id === 'queda' && s.brusca ? 'queda_forte' : s.id][1]}</i>${esc(s.id === 'queda' ? `${s.pct.toLocaleString('pt-BR')}%` : s.id === 'novo' ? (s.dias <= 0 ? 'Hoje' : `${s.dias}d`) : s.id === 'antigo' ? `${s.dias} dias` : s.id === 'abaixo' ? `${s.pct.toLocaleString('pt-BR')}% m²` : FX_SINAIS[s.id][0])}</span>`).join('');
  const r = 17, L = 2 * Math.PI * r;
  const end = [a.logradouro, a.numero].filter(Boolean).join(', ') || 'Endereço sem número';
  const busca = a.pedido && ['fila', 'buscando'].includes(a.pedido);
  const podeBuscar = a.logradouro && a.numero && a.dono === 'nenhum' && !busca;
  return `<article class="fx-card ${FX.sel.has(a.id) ? 'sel' : ''}" data-id="${a.id}" style="--i:${i % 12}">
    <div class="fx-foto" data-n="${fotos.length}">
      <button type="button" class="fx-abre" data-act="fx-abre" data-id="${a.id}" aria-label="Abrir prévia: ${esc(a.subtipo)}${a.bairro ? ', ' + esc(a.bairro) : ''}">
        <div class="fx-fila" style="--k:0">${fotos.slice(0, 8).map((u, j) => `<img src="${esc(u)}" alt="" ${j ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer" data-cadeia="">`).join('') || SEM_FOTO()}</div>
      </button>
      ${fotos.length > 1 ? `<button type="button" class="fx-seta e" data-act="fx-foto" data-d="-1" aria-label="Foto anterior">‹</button><button type="button" class="fx-seta d" data-act="fx-foto" data-d="1" aria-label="Próxima foto">›</button><span class="fx-pontos">${fotos.slice(0, 8).map((_, j) => `<i class="${j ? '' : 'on'}"></i>`).join('')}</span>` : ''}
      <span class="fx-nota" title="Nota de oportunidade: ${a.nota} de 100"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" class="t"/><circle cx="20" cy="20" r="${r}" class="v" style="stroke-dasharray:${L};stroke-dashoffset:${L * (1 - a.nota / 100)}"/></svg><b>${a.nota}</b></span>
      <label class="fx-marca" title="Selecionar"><input type="checkbox" data-fx-sel="${a.id}" ${FX.sel.has(a.id) ? 'checked' : ''} aria-label="Selecionar ${esc(a.ref)}"><span></span></label>
      <div class="fx-tags">${sinais}</div>
    </div>
    <div class="fx-c" data-act="fx-abre" data-id="${a.id}">
      <div class="fx-l1"><span class="fx-tipo">${esc(a.subtipo || a.tipo || 'Imóvel')}${a.bairro ? `, ${esc(a.bairro)}` : ''}</span><span class="fx-ref">${esc(a.ref)}</span></div>
      <div class="fx-end">${esc(end)}${a.complemento ? ` · ${esc(a.complemento)}` : ''}</div>
      <div class="fx-preco">${q ? `<s>${fxMi(q.de)}</s>` : ''}<b>${brl(a.valor)}</b>${a.m2 ? `<span>R$ ${fxN(a.m2)}/m²</span>` : ''}</div>
      ${a.m2_ref ? fxRegua(a) : ''}
      <div class="fx-specs">${[a.quartos && `${a.quartos} qto${a.quartos > 1 ? 's' : ''}`, a.suites && `${a.suites} suíte${a.suites > 1 ? 's' : ''}`, a.vagas && `${a.vagas} vaga${a.vagas > 1 ? 's' : ''}`, a.area && `${fxN(Math.round(a.area))} m²`].filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      <div class="fx-dono ${dn[1]}"><i></i>${esc(dn[0])}${a.consultadas ? ` · ${a.consultadas} consultado(s)` : a.pessoas ? ` · ${a.pessoas} na lista` : ''}${a.anunciante_tipo === 'particular' ? '' : a.anunciante_nome ? `<span class="fx-anun">${esc(a.anunciante_nome)}</span>` : ''}</div>
    </div>
    <div class="fx-acao">${podeBuscar ? `<button type="button" class="fx-btn ouro" data-act="fx-buscar" data-id="${a.id}">Buscar dono · 1 crédito</button>`
      : busca ? '<span class="fx-btn espera">Buscando o dono no Fisgar…</span>'
      : `<button type="button" class="fx-btn" data-act="fx-abre" data-id="${a.id}">${esc(a.passo || 'Ver detalhes')}</button>`}</div>
  </article>`;
}
// régua do m²: onde o imóvel fica em relação à mediana do bairro (−50% a +50%)
function fxRegua(a) {
  const d = Math.max(-50, Math.min(50, a.m2_dif));
  // marcador verde/âmbar só quando o próprio bairro serve de comparação
  return `<div class="fx-regua" title="Mediana ${a.m2_ref_cidade ? 'da cidade' : 'do bairro'}: R$ ${fxN(a.m2_ref)}/m²"><span class="fx-r-t"><i style="left:${50 + d}%" class="${a.m2_ref_cidade ? '' : d <= -30 ? 'bom' : d >= 50 ? 'alto' : ''}"></i></span><small>${a.m2_dif > 0 ? '+' : ''}${a.m2_dif.toLocaleString('pt-BR')}% vs. ${a.m2_ref_cidade ? 'cidade' : 'bairro'}</small></div>`;
}
function fxGrade(novos, doZero) {
  const corpo = $('#fx-corpo');
  if (doZero) {
    if (!novos.length) {
      corpo.innerHTML = `<div class="fx-vazio"><b>Nenhum imóvel com esses filtros.</b><p>Tire um filtro ou puxe mais anúncios: no Fisgar, aplique o filtro na Base de Anúncios e use “Puxar a lista filtrada” na extensão.</p><button type="button" class="btn" data-act="fx-limpa">Limpar filtros</button></div>`;
      return;
    }
    corpo.innerHTML = `<div class="fx-grade ${FX.animou || fxSemMov() ? '' : 'entra'}" id="fx-grade"></div><div id="fx-fim" class="fx-fim"></div>`;
    FX.animou = true;
  }
  $('#fx-grade').insertAdjacentHTML('beforeend', novos.map((a, i) => fxCard(a, i)).join(''));
  const fim = $('#fx-fim');
  fim.innerHTML = FX.pagina < FX.paginas ? `<button type="button" class="btn" data-act="fx-mais-itens">Mostrar mais (${fxN(FX.total - FX.itens.length)} restantes)</button>` : FX.total > 12 ? `<span class="muted small">Esses são todos os ${fxN(FX.total)}.</span>` : '';
  if ('IntersectionObserver' in window && FX.pagina < FX.paginas) {
    if (FX.obs) FX.obs.disconnect();
    FX.obs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !FX.carregando && FX.pagina < FX.paginas) { FX.pagina++; fxCarrega(false); } }, { rootMargin: '600px' });
    FX.obs.observe(fim);
  }
}
ACT['fx-mais-itens'] = () => { if (!FX.carregando && FX.pagina < FX.paginas) { FX.pagina++; fxCarrega(false); } };
ACT['fx-foto'] = (el, e) => {
  e.stopPropagation();
  const box = el.closest('.fx-foto'), fila = box.querySelector('.fx-fila'), n = Math.min(8, +box.dataset.n);
  const k = ((+fila.style.getPropertyValue('--k') || 0) + +el.dataset.d + n) % n;
  fila.style.setProperty('--k', k);
  box.querySelectorAll('.fx-pontos i').forEach((p, j) => p.classList.toggle('on', j === k));
};
ACT['fx-buscar'] = (el) => comBotao(el, async () => {
  await api('POST', '/api/fisguei/buscar-anuncios', { ids: [+el.dataset.id] });
  const a = FX.itens.find((x) => x.id === +el.dataset.id); if (a) a.pedido = 'fila';
  fxTroca(+el.dataset.id); toast('Na fila: o robô busca o dono no Fisgar em instantes (precisa do Fisgar aberto no Chrome).');
  fxAtualizaStatus();
});
function fxTroca(id) {
  const a = FX.itens.find((x) => x.id === id), el = $(`.fx-card[data-id="${id}"]`);
  if (a && el) { el.outerHTML = fxCard(a); }
  if (FX.aberto === id) fxGaveta(id);
}

// ---------- seleção em lote ----------
document.addEventListener('change', (e) => {
  if (!FX || !e.target.matches || !e.target.matches('[data-fx-sel]')) return;
  const id = +e.target.dataset.fxSel;
  e.target.checked ? FX.sel.add(id) : FX.sel.delete(id);
  e.target.closest('.fx-card').classList.toggle('sel', e.target.checked);
  fxBarraSel();
});
function fxBarraSel() {
  const b = $('#fx-sel'); const n = FX.sel.size;
  b.hidden = !n; if (!n) return;
  const buscaveis = FX.itens.filter((x) => FX.sel.has(x.id) && x.logradouro && x.numero && x.dono === 'nenhum' && !['fila', 'buscando'].includes(x.pedido)).length;
  b.innerHTML = `<b>${n} selecionado${n > 1 ? 's' : ''}</b><button type="button" class="btn sm pri" data-act="fx-sel-buscar" ${buscaveis ? '' : 'disabled'}>Buscar dono de ${buscaveis} · até ${buscaveis * (1 + (FX.pedidos && FX.pedidos.limites ? FX.pedidos.limites.max_consultas : 3))} créditos</button><button type="button" class="btn sm" data-act="fx-sel-limpa">Desmarcar</button>`;
}
ACT['fx-sel-limpa'] = () => { FX.sel.clear(); $$('[data-fx-sel]').forEach((c) => { c.checked = false; c.closest('.fx-card').classList.remove('sel'); }); fxBarraSel(); };
ACT['fx-sel-buscar'] = (el) => comBotao(el, async () => {
  const ids = FX.itens.filter((x) => FX.sel.has(x.id) && x.logradouro && x.numero && x.dono === 'nenhum').map((x) => x.id);
  const r = await api('POST', '/api/fisguei/buscar-anuncios', { ids });
  for (const x of FX.itens) if (ids.includes(x.id)) x.pedido = 'fila';
  FX.sel.clear(); ids.forEach(fxTroca); fxBarraSel();
  FX.cred = r.creditos; $('#fx-cred').innerHTML = fxCreditos(r.creditos);
  toast(`${r.criados} busca(s) na fila do robô${r.ja ? ` · ${r.ja} já estavam` : ''}. O limite diário de créditos continua valendo.`);
});

// ---------- prévia lateral ----------
ACT['fx-abre'] = (el, e) => { if (e && e.target.closest('.fx-marca')) return; fxGaveta(+el.dataset.id); };
ACT['fx-fecha'] = () => fxFechaGaveta();
document.addEventListener('click', (e) => { if (e.target.id === 'fx-gaveta-fundo') fxFechaGaveta(); });
function fxFechaGaveta() {
  const g = $('#fx-gaveta'); if (!g || g.hidden) return;
  g.classList.remove('on'); $('#fx-gaveta-fundo').classList.remove('on');
  setTimeout(() => { g.hidden = true; $('#fx-gaveta-fundo').hidden = true; }, fxSemMov() ? 0 : 220);
  const c = FX.aberto && $(`.fx-card[data-id="${FX.aberto}"] .fx-abre`); FX.aberto = null; if (c) c.focus();
}
function fxVizinho(d) { const i = FX.itens.findIndex((x) => x.id === FX.aberto); const n = FX.itens[i + d]; if (n) fxGaveta(n.id); }
async function fxGaveta(id) {
  const a = FX.itens.find((x) => x.id === id); if (!a) return;
  FX.aberto = id;
  const g = $('#fx-gaveta'), fundo = $('#fx-gaveta-fundo');
  g.hidden = false; fundo.hidden = false; requestAnimationFrame(() => { g.classList.add('on'); fundo.classList.add('on'); });
  const i = FX.itens.findIndex((x) => x.id === id);
  g.innerHTML = fxGavetaHTML(a, null, i); window.__fgFotos = a.fotos;
  g.focus();
  try {
    const d = await api('GET', '/api/fisguei/' + id);
    if (FX.aberto === id) { g.innerHTML = fxGavetaHTML(a, d, i); window.__fgFotos = d.anuncio.fotos; }
  } catch (e) { if (FX.aberto === id) g.querySelector('.fx-g-donos').innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
}
function fxGavetaHTML(a, d, i) {
  const fotos = d ? d.anuncio.fotos : a.fotos;
  const q = a.sinais.find((s) => s.id === 'queda');
  const end = [a.logradouro, a.numero].filter(Boolean).join(', ');
  const pessoas = d ? d.pessoas : null;
  const busca = a.pedido && ['fila', 'buscando'].includes(a.pedido);
  return `<div class="fx-g-cab"><button type="button" class="btn sm" data-act="fx-fecha" aria-label="Fechar prévia">Fechar</button><span class="sp"></span>
      <button type="button" class="btn sm" data-act="fx-viz" data-d="-1" ${i > 0 ? '' : 'disabled'} aria-label="Imóvel anterior">‹</button><span class="small muted">${i + 1} de ${fxN(FX.total)}</span><button type="button" class="btn sm" data-act="fx-viz" data-d="1" ${i < FX.itens.length - 1 ? '' : 'disabled'} aria-label="Próximo imóvel">›</button></div>
    <div class="fx-g-fotos">${fotos.length ? fotos.slice(0, 9).map((u, j) => `<button type="button" data-act="fg-foto" data-i="${j}" class="${j ? '' : 'g'}" aria-label="Ampliar foto ${j + 1}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cadeia=""></button>`).join('') : SEM_FOTO('Anúncio sem fotos')}</div>
    <div class="fx-g-c">
      <div class="small muted">${esc(a.ref)}${a.portal ? ` · ${esc(a.portal)}` : ''}${a.desde ? ` · anunciado desde ${new Date(a.desde + 'T12:00').toLocaleDateString('pt-BR')}` : ''}</div>
      <h2>${esc(a.subtipo || a.tipo || 'Imóvel')}${a.bairro ? `, ${esc(a.bairro)}` : ''}</h2>
      <p class="fx-g-end">${esc(end || 'Endereço sem número')}${a.complemento ? ` · ${esc(a.complemento)}` : ''}${a.cep ? ` · CEP ${esc(a.cep)}` : ''}</p>
      <div class="fx-g-preco">${q ? `<s>${brl(q.de)}</s>` : ''}<b>${brl(a.valor)}</b>${a.m2 ? `<span>R$ ${fxN(a.m2)}/m²${a.m2_ref ? ` · ${a.m2_ref_cidade ? 'cidade' : 'bairro'} R$ ${fxN(a.m2_ref)}/m²` : ''}</span>` : ''}</div>
      ${a.historico && a.historico.length > 1 ? fxHistorico(a.historico) : ''}
      <div class="fx-g-nota"><span class="fx-g-n">${a.nota}</span><div><b>Por que este imóvel aparece aqui</b>${a.sinais.length ? `<ul>${a.sinais.map((s) => `<li class="s-${s.id}">${esc(s.texto)}</li>`).join('')}</ul>` : '<p class="small muted">Nenhum sinal forte: preço dentro do bairro e anunciado por imobiliária.</p>'}</div></div>
      <div class="fx-g-acoes">
        ${a.logradouro && a.numero && a.dono === 'nenhum' && !busca ? `<button type="button" class="btn pri" data-act="fx-buscar" data-id="${a.id}">Buscar dono no Fisgar · 1 crédito</button>` : busca ? '<span class="pill warn">Buscando o dono no Fisgar…</span>' : ''}
        ${a.oportunidade_id ? `<a class="btn" href="#/radar/${a.oportunidade_id}">Abrir no Radar</a>` : `<button type="button" class="btn ${a.dono === 'confirmado' ? 'pri' : ''}" data-act="fx-captar" data-id="${a.id}">Levar para o Radar</button>`}
        ${a.imovel_id ? `<a class="btn" href="#/imoveis/${a.imovel_id}">Na carteira</a>` : ''}
        <a class="btn" href="#/fisguei/${a.id}">Ficha completa</a>
        ${a.lat ? `<a class="btn" href="/condominio-3d.html?fg=${a.id}" target="_blank" rel="noopener">Ver a rua em 3D</a>` : ''}
        <button type="button" class="btn" data-act="fx-descartar" data-id="${a.id}">Descartar</button>
      </div>
      <h3>Proprietários</h3>
      <div class="fx-g-donos">${!pessoas ? '<span class="fx-sk-l"></span><span class="fx-sk-l"></span>' : pessoas.length ? pessoas.map((p) => `<div class="fx-g-p"><div><b>${esc(p.nome)}</b> ${fgPill(p.status, PES_ST)}<div class="small muted">${esc([p.relacao, p.unidade, p.idade ? p.idade + ' anos' : ''].filter(Boolean).join(' · '))}</div>
          <div class="small">${p.contatos.filter((c) => c.tipo === 'tel').map((c) => `<span class="mono">${esc(tel(c.valor))}</span> ${fgPill(c.envio, ENV_ST)}`).join(' &nbsp; ') || (p.consultado ? '<span class="muted">sem telefone</span>' : '<span class="muted">ainda não consultado</span>')}</div></div>
          ${!p.consultado ? `<button type="button" class="btn sm" data-act="fx-consultar" data-id="${p.id}" data-a="${a.id}">Consultar · 1 crédito</button>` : ''}</div>`).join('')
        : `<p class="small muted">${a.logradouro && a.numero ? 'Ninguém buscado ainda. “Buscar dono no Fisgar” traz os possíveis proprietários pelo IPTU e os telefones; o robô TH-IA-GO faz o primeiro contato.' : 'O anúncio não traz o número do imóvel: confirme o endereço no portal antes de buscar o dono.'}</p>`}</div>
      <h3>Ficha</h3>
      <dl class="fx-g-ficha">${[['Quartos', a.quartos], ['Suítes', a.suites], ['Vagas', a.vagas], ['Área', a.area ? fxN(Math.round(a.area)) + ' m²' : null], ['Condomínio', d && d.anuncio.valor_condominio ? brl(d.anuncio.valor_condominio) : null], ['IPTU', d && d.anuncio.iptu ? brl(d.anuncio.iptu) : null], ['Anunciante', a.anunciante_nome], ['Tipo de anunciante', { particular: 'Particular', imobiliaria: 'Imobiliária' }[a.anunciante_tipo]]].filter(([, v]) => v || v === 0).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${a.repetido ? `<h3>Outros anúncios do mesmo imóvel</h3><div class="fx-g-rep">${a.repetido.ids.map((x) => `<a href="#/fisguei/${x}">${esc('FG-' + String(x).padStart(5, '0'))}</a>`).join('')}<span class="small muted">de ${fxMi(a.repetido.min)} a ${fxMi(a.repetido.max)}</span></div>` : ''}
    </div>`;
}
function fxHistorico(h) {
  const vs = h.map((x) => x.valor), min = Math.min(...vs), max = Math.max(...vs), W = 260, H = 54;
  const px = (i) => (h.length === 1 ? W / 2 : (i / (h.length - 1)) * (W - 16) + 8), py = (v) => (max === min ? H / 2 : 8 + (1 - (v - min) / (max - min)) * (H - 16));
  const pts = h.map((x, i) => `${px(i)},${py(x.valor)}`).join(' ');
  return `<figure class="fx-hist"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico de preço: ${esc(h.map((x) => `${fxMi(x.valor)} em ${x.em.slice(8, 10)}/${x.em.slice(5, 7)}`).join(', '))}"><polyline points="${pts}"/>${h.map((x, i) => `<circle cx="${px(i)}" cy="${py(x.valor)}" r="3.5"><title>${fxMi(x.valor)} · ${x.em.slice(8, 10)}/${x.em.slice(5, 7)}</title></circle>`).join('')}</svg>
    <figcaption>${h.map((x) => `<span>${x.em.slice(8, 10)}/${x.em.slice(5, 7)} <b>${fxMi(x.valor)}</b></span>`).join('')}</figcaption></figure>`;
}
ACT['fx-viz'] = (el) => fxVizinho(+el.dataset.d);
ACT['fx-consultar'] = (el) => comBotao(el, async () => { await api('POST', `/api/fisguei/pessoas/${el.dataset.id}/consultar`); toast('Na fila do robô (1 crédito)'); fxGaveta(+el.dataset.a); });
ACT['fx-captar'] = (el) => comBotao(el, async () => { const r = await api('POST', `/api/fisguei/${el.dataset.id}/captar`); toast('Levado para o Radar'); navega('#/radar/' + r.oportunidade_id); });
ACT['fx-descartar'] = (el) => comBotao(el, async () => {
  if (!confirm('Descartar este imóvel? Ele sai da lista e o robô para de chamar as pessoas dele.')) return;
  const id = +el.dataset.id;
  await api('POST', `/api/fisguei/${id}/descartar`);
  const prox = FX.itens[FX.itens.findIndex((x) => x.id === id) + 1];
  FX.itens = FX.itens.filter((x) => x.id !== id); FX.total--;
  const c = $(`.fx-card[data-id="${id}"]`); if (c) c.remove();
  fxAtivos(); toast('Descartado');
  if (prox) fxGaveta(prox.id); else fxFechaGaveta();
});

// ---------- mapa ----------
async function fxMapa(seq) {
  const corpo = $('#fx-corpo');
  corpo.innerHTML = '<div id="fx-mapa" class="fx-mapa"></div><p class="small muted fx-legenda"><span class="fx-d fx-d0"><i></i>sem proprietário</span><span class="fx-d fx-d2"><i></i>proprietário consultado</span><span class="fx-d fx-d3"><i></i>dono confirmou</span> · contorno vermelho: baixou o preço · o tamanho do ponto é a nota de oportunidade · até 3.000 imóveis</p>';
  try {
    const [pts, d] = await Promise.all([api('GET', '/api/fisguei/explorar/mapa?' + fxQS(FX.f, true)), api('GET', '/api/fisguei/explorar?' + fxQS({ ...FX.f, pagina: 1 })), carregaLeaflet()]);
    if (seq !== FX.seq || !$('#fx-mapa')) return;
    FX.dados = d; FX.total = d.total; FX.itens = d.itens; fxLeitura(d.leitura); fxBarra(); fxAtivos();
    const m = L.map('fx-mapa').setView([-22.9056, -47.0608], 12); camadaMapa(m);
    const cor = { nenhum: '#8a8f97', lista: '#c98a1a', consultado: '#3b6ea8', confirmado: '#2e7d4f' };
    const b = [];
    for (const p of pts) {
      const mk = L.circleMarker([p.lat, p.lon], { radius: 4 + p.nota / 14, color: p.sinais.includes('queda') ? '#c0392b' : '#fff', weight: p.sinais.includes('queda') ? 2.5 : 1.2, fillColor: cor[p.dono] || cor.nenhum, fillOpacity: 0.88 }).addTo(m);
      const div = document.createElement('div'); div.className = 'fx-pop';
      div.innerHTML = `${p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">` : ''}<b>${esc(p.tipo || 'Imóvel')}</b> · ${brl(p.valor)}<br>${esc([p.logradouro, p.numero].filter(Boolean).join(', '))}<br><span>${esc(p.bairro || '')} · nota ${p.nota}</span><br><a href="#/fisguei/${p.id}">Abrir ficha</a>`;
      mk.bindPopup(div); b.push([p.lat, p.lon]);
    }
    if (b.length) m.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
    else corpo.insertAdjacentHTML('beforeend', '<div class="empty">Nenhum imóvel com localização neste filtro.</div>');
  } catch (e) { corpo.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  finally { if (seq === FX.seq) FX.carregando = false; }
}
