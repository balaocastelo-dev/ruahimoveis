/* Herrera HOUSE IA — Apartamentos, Casas, Terrenos e Salas comerciais/barracões: imóveis à venda em Campinas já na base (Fisguei), por Bairro → Rua → Imóvel (carregado depois do fisguei.js) */
'use strict';
// As quatro vitrines da base (Apartamentos, Casas, Terrenos, Salas comerciais e barracões) + o atalho para Condomínios.
const MK_CATS = [
  ['apartamentos', 'Apartamentos', 'Os apartamentos e coberturas à venda em Campinas que já estão na base. Para ver por prédio, use Condomínios.'],
  ['casas', 'Casas', 'Casas, sobrados, casas em condomínio e chácaras à venda em Campinas que já estão na base.'],
  ['terrenos', 'Terrenos', 'Terrenos e lotes à venda em Campinas, residenciais e comerciais. Metragem e R$/m² pela área do terreno.'],
  ['comerciais', 'Salas comerciais e barracões', 'Galpões, barracões, salas, lojas, prédios e casas de uso comercial à venda em Campinas.'],
];
const MK_FAIXAS = [['0', 'qualquer valor'], ['500000', 'a partir de R$ 500 mil'], ['1000000', 'a partir de R$ 1 mi'], ['2000000', 'a partir de R$ 2 mi'], ['3000000', 'a partir de R$ 3 mi'], ['5000000', 'a partir de R$ 5 mi']];
const MK_MIN = { apartamentos: '0', casas: '1000000', terrenos: '1000000', comerciais: '1000000' };
const mkMi = (v) => (v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : brl(v));
const mkArea = (v) => (v ? Math.round(v).toLocaleString('pt-BR') + ' m²' : '');
let MAPAS = null;
const mapasCfg = () => (MAPAS ? Promise.resolve(MAPAS) : api('GET', '/api/mapas/config').then((c) => (MAPAS = c)).catch(() => (MAPAS = {})));
// foto do anúncio primeiro; se não abrir, a fachada do Google; se não houver, o quadro "Foto em breve"
const mkFoto = (x, cfg, alt) => fotoCadeia([x.foto, cfg.fachada && x.lat ? (x.origem === 'op' ? (x.condominio_id ? `/api/fachada?ref=cd${x.condominio_id}` : null) : `/api/fachada?ref=fg${x.id}`) : null], alt);

// abas das vitrines + Condomínios (com a contagem de cada vitrine quando já se sabe)
function mkAbas(on, cats) {
  const n = (k) => (cats && cats[k] ? ` <span class="mk-ab-n">${(cats[k].n || 0).toLocaleString('pt-BR')}</span>` : '');
  return `<div class="tabs mk-abas"><a href="#/condominios" class="${on === 'condominios' ? 'on' : ''}">Condomínios</a>${MK_CATS.map(([k, t]) => `<a href="#/${k}" class="${k === on ? 'on' : ''}">${esc(t)}${n(k)}</a>`).join('')}
    <a href="#/fisguei" class="${on === 'fisguei' ? 'on' : ''}" title="Sinais nos anúncios: queda de preço, particular, abaixo do bairro">Leitura da IA</a><a href="#/radar" class="${on === 'radar' ? 'on' : ''}" title="Anúncios que chegaram pelos portais">Portais</a>${on === 'aprovacoes' ? '<a href="#/radar/aprovacoes" class="on">Aprovações</a>' : ''}</div>`;
}

// ---------- ordenar: bairros, ruas e imóveis (menor → maior e vice-versa) ----------
const MK_ORD_GRUPO = [['n', 'Quantidade', (g) => g.n], ['mediana', 'Preço', (g) => g.mediana], ['min', 'Menor preço', (g) => g.min], ['area', 'Área', (g) => g.area], ['m2', 'R$/m²', (g) => g.m2], ['nome', 'Nome', (g) => g.nome, true]];
const MK_ORD_IM = [['numero', 'Número', (x) => { const n = parseInt(x.numero, 10); return Number.isFinite(n) ? n : null; }], ['valor', 'Preço', (x) => x.valor], ['area', 'Área', (x) => x.area_util],
  ['m2', 'R$/m²', (x) => (x.valor && x.area_util ? x.valor / x.area_util : null)], ['quartos', 'Quartos', (x) => x.quartos], ['data', 'Data do anúncio', (x) => dataNum(x.publicado_em)], ['anuncios', 'Vezes anunciado', (x) => x.anuncios || 1]];
const mkOrd = (nivel) => ordLer('mk.' + nivel, nivel === 'im' ? { k: 'numero', d: 1 } : { k: 'n', d: -1 });
ACT['mk-ord'] = (el) => {
  const nivel = el.closest('[data-nivel]').dataset.nivel;
  ordGravar('mk.' + nivel, ordProximo(mkOrd(nivel), el.dataset.k));
  if (nivel === 'im') mkDesenhaCards(); else mkDesenhaGrupos(nivel);
};
function mkDesenhaGrupos(nivel) {
  const box = $('#mk-grupos'); if (!box) return;
  const at = mkOrd(nivel), l = ordLista(nivel === 'bairros' ? MK.bairros : MK.ruas, MK_ORD_GRUPO, at);
  const m2txt = (v) => (v ? `R$ ${v.toLocaleString('pt-BR')}/m²` : '');
  const capa = (g) => fotoCadeia([g.foto], g.nome, { vazio: g.nome });
  const bar = `<div data-nivel="${nivel}">${ordBarra('mk-ord', MK_ORD_GRUPO, at)}</div>`;
  if (nivel === 'bairros') {
    box.innerHTML = bar + `<div class="mk-grade">${l.map((b) => `<a class="mk-card" href="${MK.link({ bairro: b.chave, rua: '' })}">
      <div class="mk-capa">${capa(b)}<span class="mk-capa-n">${b.n} imóve${b.n > 1 ? 'is' : 'l'}</span></div>
      <div class="mk-card-c"><b class="mk-card-nome">${esc(b.nome)}</b>
      <div class="mk-num">${mkMi(b.mediana)}</div><div class="muted small">mediana${b.m2 ? ' · ' + m2txt(b.m2) : ''}${b.area ? ' · ' + mkArea(b.area) : ''}</div>
      <div class="muted small">${mkMi(b.min)} a ${mkMi(b.max)}${b.particulares ? ` · ${b.particulares} de particular` : ''}</div></div></a>`).join('')}</div>`;
  } else {
    box.innerHTML = bar + `<div class="mk-lista">${l.map((r) => `<a class="mk-linha" href="${MK.link({ rua: r.chave })}"><span class="mk-mini">${capa(r)}</span><div style="flex:1;min-width:0"><b>${esc(r.nome)}</b><div class="muted small">${mkMi(r.min)}${r.max !== r.min ? ' a ' + mkMi(r.max) : ''}${r.m2 ? ' · ' + m2txt(r.m2) : ''}${r.area ? ' · ' + mkArea(r.area) : ''}</div></div><span class="pill ok">${r.n} imóve${r.n > 1 ? 'is' : 'l'}</span><span class="muted">›</span></a>`).join('') || '<div class="empty">Nenhuma rua.</div>'}</div>`;
  }
}

// ---------- localizar proprietário (gasta crédito do Fisgar) ----------
let MK = { l: [], sel: new Set(), cfg: {}, ehLote: false, cred: null, ext: null, porBusca: 4 };
const MK_SITU = {
  fila: ['warn', 'Na fila do Fisgar'], buscando: ['warn', 'Buscando no Fisgar…'], sem_resultado: ['bad', 'O Fisgar não achou dono'],
  concluido: ['info', 'Fisgar respondeu'], erro: ['bad', 'A busca falhou'],
};
function mkAcoes(x) {
  const s = x.situ || { estado: 'livre' };
  if (s.estado === 'carteira') return `<a class="btn sm mk-cart" href="#/imoveis/${s.imovel_id}">✓ Na carteira · ${esc(s.codigo)}</a>`;
  if (s.estado === 'escolher') return `<a class="btn sm" href="#/fisguei/${s.anuncio_id}">Prédio: escolher quem consultar</a>`;
  if (s.estado === 'sem_endereco') return '<span class="muted small">Sem número no anúncio: o Fisgar precisa de rua e número.</span>';
  if (s.estado === 'livre' || s.estado === 'erro' || s.estado === 'sem_resultado') {
    const [c, t] = MK_SITU[s.estado] || [];
    return `${t ? `<span class="pill ${c}">${t}</span>` : ''}<button type="button" class="btn sm pri" data-act="mk-loc" data-id="${x.id}" title="Busca o dono no Fisgar: até ${MK.porBusca} créditos">${s.estado === 'livre' ? 'Localizar proprietário' : 'Tentar de novo'}</button>`;
  }
  if (s.estado === 'concluido') return `<a class="btn sm" href="#/fisguei/${s.anuncio_id}">Ver o que o Fisgar trouxe</a>`;
  const [c, t] = MK_SITU[s.estado] || ['info', s.estado];
  return `<span class="pill ${c}">${t}</span>`;
}
const mkLivre = (x) => !x.situ || ['livre', 'erro', 'sem_resultado'].includes(x.situ.estado);
function mkCartao(x) {
  const m2txt = (v) => (v ? `R$ ${v.toLocaleString('pt-BR')}/m²` : '');
  const specs = MK.ehLote ? [x.area_util && `${mkArea(x.area_util)} de terreno`, x.valor && x.area_util ? m2txt(Math.round(x.valor / x.area_util)) : '']
    : [x.quartos && `${x.quartos} quartos`, x.suites && `${x.suites} suítes`, x.vagas && `${x.vagas} vagas`, x.area_util && mkArea(x.area_util)];
  const livre = mkLivre(x) && x.situ && x.situ.estado !== 'sem_endereco';
  return `<div class="imcardw com-acoes${MK.sel.has(x.id) ? ' mk-on' : ''}" data-mkid="${x.id}">${livre ? `<label class="mk-chk" title="Selecionar para localizar o dono"><input type="checkbox" data-mksel="${x.id}" ${MK.sel.has(x.id) ? 'checked' : ''} aria-label="Selecionar ${esc(x.ref)}"></label>` : ''}<a class="imcard" href="${x.href || '#/fisguei/' + x.id}">
    <div class="imfoto">${mkFoto(x, MK.cfg, `${x.subtipo || x.tipo || 'Imóvel'} na ${x.logradouro || ''}`)}
      <span class="imst">${x.anunciante_tipo === 'particular' ? '<span class="pill ok">particular</span>' : x.anunciante_tipo === 'imobiliaria' ? '<span class="pill info">imobiliária</span>' : ''}${x.origem === 'op' ? '<span class="pill warn" title="Veio do Radar (portais)">Radar</span>' : ''}</span>${x.subtipo ? `<span class="imbadge"><span class="pill gold">${esc(x.subtipo)}</span></span>` : ''}</div>
    <div class="imcorpo"><div class="row" style="justify-content:space-between"><span class="mono small muted">${esc(x.ref)}</span><span class="small muted">${esc(x.publicado_em ? new Date(x.publicado_em + 'T12:00').toLocaleDateString('pt-BR') : '')}</span></div>
      <div class="imtit">${esc(x.subtipo || x.tipo || 'Imóvel')} · nº ${esc(x.numero || 's/n')}</div><div class="muted small">${esc(x.complemento || x.anunciante_nome || '')}</div>
      <div class="imspecs">${specs.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="imvalor">${brl(x.valor)}</div>
      ${x.anuncios > 1 ? `<div class="mk-rep" title="${esc(x.outros.map((o) => `${brl(o.valor)} · ${o.anunciante || o.portal || ''}`).join('\n'))}">Anunciado ${x.anuncios} vezes${x.anunciantes > 1 ? ` por ${x.anunciantes} anunciantes` : ''}${x.valor_min !== x.valor_max ? ` · ${mkMi(x.valor_min)} a ${mkMi(x.valor_max)}` : ''}</div>` : ''}</div></a>
    <div class="imacoes">${mkAcoes(x)}</div></div>`;
}
function mkDesenhaCards() {
  const box = $('#mk-cards'); if (!box) return;
  const livres = MK.l.filter((x) => mkLivre(x) && x.situ && x.situ.estado !== 'sem_endereco');
  const naCart = MK.l.filter((x) => x.situ && x.situ.estado === 'carteira').length;
  box.innerHTML = `<div class="row mk-selbar-top">${livres.length ? `<button type="button" class="btn sm" data-act="mk-todos">${livres.every((x) => MK.sel.has(x.id)) ? 'Desmarcar todos' : `Selecionar os ${livres.length} sem dono`}</button>` : ''}
      <span class="muted small">${MK.l.length} imóve${MK.l.length > 1 ? 'is' : 'l'} nesta rua${naCart ? ` · ${naCart} já na carteira` : ''}</span></div>
    <div data-nivel="im">${ordBarra('mk-ord', MK_ORD_IM.filter((o) => !(MK.ehLote && o[0] === 'quartos')), mkOrd('im'))}</div>
    <div class="imcards">${ordLista(MK.l, MK_ORD_IM, mkOrd('im')).map(mkCartao).join('')}</div>`;
  mkBarra();
}
function mkBarra() {
  let b = $('#mk-sel');
  if (!MK.sel.size) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'mk-sel'; b.className = 'mk-sel'; $('#main').appendChild(b); }
  const n = MK.sel.size, max = n * MK.porBusca;
  b.innerHTML = `<b>${n} selecionado${n > 1 ? 's' : ''}</b><span class="muted small">até ${max.toLocaleString('pt-BR')} crédito${max > 1 ? 's' : ''}${MK.cred ? ` · saldo ${MK.cred.saldo.toLocaleString('pt-BR')}` : ''}</span>
    <button type="button" class="btn sm" data-act="mk-limpa">Limpar</button><button type="button" class="btn pri" data-act="mk-loc-sel">Localizar proprietário</button>`;
}
function mkTopo() {
  const c = MK.cred, e = MK.ext || {};
  const ex = !e.vivo ? ['bad', 'Extensão sem contato'] : !e.fisgar_aberto ? ['warn', 'Abra o Fisgar no Chrome'] : ['ok', 'Fisgar aberto'];
  return `<a class="mk-cred" href="#/robos" title="Créditos e robôs"><span class="mk-cred-n">${c ? c.saldo.toLocaleString('pt-BR') : '—'}</span><span>créditos no Fisgar${c ? ` · ${c.gasto_hoje} hoje` : ''}</span><span class="fx-s ${ex[0]}"><i></i>${ex[1]}</span></a>`;
}
async function mkLocaliza(ids) {
  if (!ids.length) return;
  const max = ids.length * MK.porBusca;
  if (ids.length > 1 && !confirm(`Localizar o proprietário de ${ids.length} imóveis? Pode gastar até ${max} créditos do Fisgar (1 pela lista de pessoas do endereço e até ${MK.porBusca - 1} por pessoa consultada). Quem o Fisgar achar entra na carteira sozinho.`)) return;
  const r = await api('POST', '/api/fisguei/localizar', { ids });
  MK.porBusca = r.por_busca || MK.porBusca; MK.cred = r.creditos || MK.cred; MK.ext = r.extensao || MK.ext;
  const partes = [r.criados && `${r.criados} busca(s) na fila do Fisgar`, r.ja && `${r.ja} já estava(m) na fila`, r.na_carteira && `${r.na_carteira} já na carteira`, r.sem_endereco && `${r.sem_endereco} sem número`].filter(Boolean);
  toast(partes.join(' · ') + (r.criados ? '. Quando o dono voltar, o imóvel entra na carteira.' : ''));
  if (r.criados && !(r.extensao && r.extensao.vivo && r.extensao.fisgar_aberto)) toast('A busca acontece quando o Fisgar estiver aberto no Chrome com a extensão.', true);
  ids.forEach((id) => MK.sel.delete(id));
  for (const x of MK.l) if (ids.includes(x.id) && mkLivre(x) && x.situ.estado !== 'sem_endereco') x.situ = { estado: 'fila' };
  mkDesenhaCards();
  const t = $('#mk-topo'); if (t) t.innerHTML = mkTopo();
}
ACT['mk-loc'] = (el) => mkLocaliza([+el.dataset.id]);
ACT['mk-loc-sel'] = () => mkLocaliza([...MK.sel]);
ACT['mk-limpa'] = () => { MK.sel.clear(); mkDesenhaCards(); };
ACT['mk-todos'] = () => {
  const livres = MK.l.filter((x) => mkLivre(x) && x.situ && x.situ.estado !== 'sem_endereco');
  if (livres.every((x) => MK.sel.has(x.id))) livres.forEach((x) => MK.sel.delete(x.id)); else livres.forEach((x) => MK.sel.add(x.id));
  mkDesenhaCards();
};
document.addEventListener('change', (e) => {
  const id = e.target && e.target.dataset && e.target.dataset.mksel; if (!id) return;
  if (e.target.checked) MK.sel.add(+id); else MK.sel.delete(+id);
  const w = e.target.closest('.imcardw'); if (w) w.classList.toggle('mk-on', e.target.checked);
  mkBarra();
});

async function telaMercado(qs, cat = 'casas') {
  const C = MK_CATS.find((c) => c[0] === cat) || MK_CATS[1];
  const ehLote = cat === 'terrenos', ehCom = cat === 'comerciais';
  const f = { min: qs.get('min') ?? MK_MIN[cat], sub: qs.get('sub') || '', quartos: qs.get('quartos') || '', particular: qs.get('particular') || '', bairro: qs.get('bairro') || '', rua: qs.get('rua') || '' };
  const filtros = Object.fromEntries(Object.entries({ cat, min: f.min, sub: f.sub, quartos: ehLote || ehCom ? '' : f.quartos, particular: f.particular }).filter(([, v]) => v !== ''));
  const link = (o) => `#/${cat}?` + new URLSearchParams(Object.fromEntries(Object.entries({ ...f, ...o }).filter(([, v]) => v !== '' && v !== null && v !== undefined)));
  const qf = new URLSearchParams(filtros);
  const [res, cfg, cred, pd] = await Promise.all([api('GET', '/api/mercado/resumo?' + qf), mapasCfg(), api('GET', '/api/fisguei/creditos').catch(() => null), api('GET', '/api/fisguei/pedidos').catch(() => null)]);
  MK.cfg = cfg; MK.ehLote = ehLote; MK.cred = cred; MK.ext = pd && pd.extensao; if (pd && pd.limites) MK.porBusca = 1 + pd.limites.max_consultas;
  const bairroAt = f.bairro && res.bairros.find((b) => b.chave === f.bairro);
  const m2txt = (v) => (v ? `R$ ${v.toLocaleString('pt-BR')}/m²` : '');
  const capa = (g) => fotoCadeia([g.foto], g.nome, { vazio: g.nome });
  let corpo = '';
  MK.link = link;
  if (!f.bairro) {
    MK.bairros = res.bairros;
    corpo = res.bairros.length ? '<div id="mk-grupos"></div>'
      : `<div class="empty">Nenhum imóvel nesta vitrine com esse filtro. Experimente "qualquer valor" ou puxe mais anúncios do Fisgar pela extensão (botão "Puxar a lista filtrada").</div>`;
  } else if (!f.rua) {
    MK.ruas = await api('GET', '/api/mercado/ruas?' + new URLSearchParams({ ...filtros, bairro: f.bairro }));
    corpo = MK.ruas.length ? '<div id="mk-grupos"></div>' : '<div class="empty">Nenhuma rua.</div>';
  } else {
    MK.l = await api('GET', '/api/mercado/imoveis?' + new URLSearchParams({ ...filtros, bairro: f.bairro, rua: f.rua }));
    MK.sel = new Set(); MK.qs = new URLSearchParams({ ...filtros, bairro: f.bairro, rua: f.rua });
    corpo = '<div id="mk-cards"></div>';
  }
  const migalha = `<div class="mk-migalha"><a href="${link({ bairro: '', rua: '' })}">${esc(C[1])} em Campinas</a>${bairroAt ? ` › <a href="${link({ rua: '' })}">${esc(bairroAt.nome)}</a>` : ''}${f.rua ? ` › <b>${esc(f.rua.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</b>` : ''}</div>`;
  const abas = mkAbas(cat, res.categorias);
  $('#main').innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px"><div><div class="eyebrow">Imóveis da base · Campinas</div><h1>${esc(C[1])}</h1></div><div id="mk-topo">${mkTopo()}</div></div>
  ${abas}
  <p class="lead">${esc(C[2])} Escolha o bairro e a rua. Nos imóveis que interessam, clique em <b>Localizar proprietário</b> (ou selecione vários): o Fisgar busca o dono e o imóvel entra sozinho na <a href="#/imoveis">carteira</a>.</p>
  <div class="grid g4 cd-kpis">${cdKpi(res.total.toLocaleString('pt-BR'), ehLote ? 'terrenos neste filtro' : 'imóveis neste filtro', res.repetidos ? `${res.anuncios.toLocaleString('pt-BR')} anúncios · ${res.repetidos.toLocaleString('pt-BR')} repetidos juntados` : `de ${res.base.toLocaleString('pt-BR')} na base`)}${cdKpi(mkMi(res.mediana), 'valor mediano', res.m2 ? 'mediana ' + m2txt(res.m2) : '')}${cdKpi(res.bairros.length, 'bairros', res.area ? `${ehLote ? 'terreno' : 'área'} mediana ${mkArea(res.area)}` : '')}${cdKpi(res.particulares, 'de particular', res.total ? Math.round((res.particulares / res.total) * 100) + '% do total' : '')}</div>
  <form class="row cd-filtros" data-form="mk-filtro" data-cat="${cat}">
    <select name="min" aria-label="Valor mínimo">${MK_FAIXAS.map(([v, t]) => `<option value="${v}" ${f.min === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select name="sub" aria-label="Tipo"><option value="">Todos os tipos</option>${res.subtipos.map((t) => `<option value="${esc(t.nome)}" ${f.sub === t.nome ? 'selected' : ''}>${esc(t.nome)} (${t.n})</option>`).join('')}${f.sub && !res.subtipos.some((t) => t.nome === f.sub) ? `<option selected value="${esc(f.sub)}">${esc(f.sub)}</option>` : ''}</select>
    ${ehLote || ehCom ? '' : `<select name="quartos" aria-label="Quartos"><option value="">Quartos</option>${[1, 2, 3, 4, 5].map((q) => `<option value="${q}" ${f.quartos === String(q) ? 'selected' : ''}>${q}+ quartos</option>`).join('')}</select>`}
    <label class="chk"><input type="checkbox" name="particular" ${f.particular ? 'checked' : ''}> Só particular</label>
    <input type="hidden" name="bairro" value="${esc(f.bairro)}"><input type="hidden" name="rua" value="${esc(f.rua)}">
    <button class="btn pri" type="submit">Filtrar</button>
  </form>
  ${migalha}
  <div class="cd-split"><div>${corpo}</div><div class="cd-mapa-w"><div id="mk-mapa" class="cd-mapa"></div>
    <p class="small muted" style="margin:6px 2px 0"><span class="cd-dot" style="background:#2e7d4f"></span> particular <span class="cd-dot" style="background:#3b6ea8"></span> imobiliária · clique no ponto para abrir</p></div></div>`;
  mapaMercado(qf, f, bairroAt);
  if ($('#mk-grupos')) mkDesenhaGrupos(f.bairro ? 'ruas' : 'bairros');
  if ($('#mk-cards')) {
    mkDesenhaCards();
    // enquanto houver busca andando, atualiza a situação dos cartões
    poll = setInterval(async () => {
      if (!$('#mk-cards') || !MK.l.some((x) => x.situ && ['fila', 'buscando'].includes(x.situ.estado))) return;
      try {
        const novo = await api('GET', '/api/mercado/imoveis?' + MK.qs);
        const mapa = new Map(novo.map((x) => [x.id, x.situ]));
        let mudou = false;
        for (const x of MK.l) { const s2 = mapa.get(x.id); if (s2 && JSON.stringify(s2) !== JSON.stringify(x.situ)) { x.situ = s2; mudou = true; } }
        if (mudou) mkDesenhaCards();
      } catch {}
    }, 15000);
  }
}
FORM['mk-filtro'] = async (fm) => { const d = formJSON(fm); navega(`#/${fm.dataset.cat || 'casas'}?` + new URLSearchParams(Object.fromEntries(Object.entries({ ...d, particular: d.particular ? '1' : '' }).filter(([, v]) => v !== '' && v !== undefined)))); };

async function mapaMercado(qf, f, bairroAt) {
  const [pts] = await Promise.all([api('GET', '/api/mercado/mapa?' + qf), carregaLeaflet()]);
  const el = $('#mk-mapa'); if (!el) return;
  const m = L.map(el, { preferCanvas: true }).setView([-22.9056, -47.0608], 12);
  camadaMapa(m);
  const destaque = [];
  const chaveRua = (t) => t.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [id, lat, lon, mil, part, rot] of pts) {
    const mk = L.circleMarker([lat, lon], { radius: 5.5, color: '#fff', weight: 1, fillColor: part ? '#2e7d4f' : '#3b6ea8', fillOpacity: 0.85 }).addTo(m);
    mk.bindTooltip(`${rot} · ${mkMi(mil * 1000)}`); mk.on('click', () => navega(id < 0 ? `#/radar/${-id}` : `#/fisguei/${id}`));
    if (f.rua && chaveRua(rot).includes(f.rua.split(' ').slice(-1)[0])) destaque.push([lat, lon]);
  }
  if (destaque.length) m.fitBounds(destaque, { padding: [40, 40], maxZoom: 17 });
  else if (bairroAt && bairroAt.lat) m.setView([bairroAt.lat, bairroAt.lon], 15);
}

// ---------- ficha do Fisguei: fachada do Google e botão do 3D ----------
async function fgFachada(id, a) {
  const cfg = await mapasCfg();
  const box = $('#fg-fachada'); if (!box) return;
  const temGeo = a.lat && a.lon;
  box.innerHTML = `<div class="fg-hero">
    <div class="fg-hero-foto">${cfg.fachada && temGeo ? `<img src="/api/fachada?ref=fg${id}" alt="Fachada do imóvel (Google Street View)" id="fg-fach-img"><span class="fg-hero-cred">Fachada: Google Street View</span>` : temGeo ? `<iframe title="Street View" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?layer=c&cbll=${encodeURIComponent(a.lat + ',' + a.lon)}&cbp=11,0,0,0,0&hl=pt-BR&output=svembed"></iframe>` : '<div class="noimg">Sem localização</div>'}</div>
    <div class="fg-hero-3d">${temGeo ? `<a class="cd-btn3d btn pri" href="/condominio-3d.html?fg=${id}" target="_blank" rel="noopener"><span aria-hidden="true">◈</span> Ver a rua em 3D</a>
      <p class="muted small">O imóvel aparece destacado entre os prédios e casas da rua, com a foto de satélite no chão.</p>
      ${a.condominio_id ? `<a class="btn" href="#/condominios/${a.condominio_id}">Abrir o condomínio</a>` : ''}` : ''}</div></div>`;
  api('GET', `/api/mercado/iguais/${id}`).then((l) => {
    if (!l.length || !$('#fg-fachada')) return;
    const d = document.createElement('div'); d.className = 'card mk-iguais';
    d.innerHTML = `<b>O mesmo imóvel em mais ${l.length} anúncio${l.length > 1 ? 's' : ''}</b>
      <div class="mk-lista">${l.map((o) => `<a class="mk-linha" href="#/fisguei/${o.id}"><span class="mono small muted">FG-${String(o.id).padStart(5, '0')}</span><div style="flex:1;min-width:0">${esc(o.anunciante || 'Sem nome')}<div class="muted small">${esc([o.portal, o.publicado_em && new Date(o.publicado_em + 'T12:00').toLocaleDateString('pt-BR')].filter(Boolean).join(' · '))}</div></div>${o.anunciante_tipo === 'particular' ? '<span class="pill ok">particular</span>' : ''}<b>${brl(o.valor)}</b></a>`).join('')}</div>`;
    $('#fg-fachada').after(d);
  }).catch(() => {});
  const img = $('#fg-fach-img');
  if (img) img.addEventListener('error', () => { img.parentElement.innerHTML = `<iframe title="Street View" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?layer=c&cbll=${encodeURIComponent(a.lat + ',' + a.lon)}&cbp=11,0,0,0,0&hl=pt-BR&output=svembed"></iframe>`; }, { once: true });
}
