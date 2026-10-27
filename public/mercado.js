/* Sistema RUAH — Apartamentos, Casas, Terrenos e Salas comerciais/barracões: imóveis à venda em Campinas já na base (Fisguei), por Bairro → Rua → Imóvel (carregado depois do fisguei.js) */
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
const mkFoto = (x, cfg, alt) => fotoCadeia([x.foto, cfg.fachada && x.lat ? `/api/fachada?ref=fg${x.id}` : null], alt);

async function telaMercado(qs, cat = 'casas') {
  const C = MK_CATS.find((c) => c[0] === cat) || MK_CATS[1];
  const ehLote = cat === 'terrenos', ehCom = cat === 'comerciais';
  const f = { min: qs.get('min') ?? MK_MIN[cat], sub: qs.get('sub') || '', quartos: qs.get('quartos') || '', particular: qs.get('particular') || '', bairro: qs.get('bairro') || '', rua: qs.get('rua') || '' };
  const filtros = Object.fromEntries(Object.entries({ cat, min: f.min, sub: f.sub, quartos: ehLote || ehCom ? '' : f.quartos, particular: f.particular }).filter(([, v]) => v !== ''));
  const link = (o) => `#/${cat}?` + new URLSearchParams(Object.fromEntries(Object.entries({ ...f, ...o }).filter(([, v]) => v !== '' && v !== null && v !== undefined)));
  const qf = new URLSearchParams(filtros);
  const [res, cfg] = await Promise.all([api('GET', '/api/mercado/resumo?' + qf), mapasCfg()]);
  const bairroAt = f.bairro && res.bairros.find((b) => b.chave === f.bairro);
  const m2txt = (v) => (v ? `R$ ${v.toLocaleString('pt-BR')}/m²` : '');
  const capa = (g) => fotoCadeia([g.foto], g.nome, { vazio: g.nome });
  let corpo = '';
  if (!f.bairro) {
    corpo = res.bairros.length ? `<div class="mk-grade">${res.bairros.map((b) => `<a class="mk-card" href="${link({ bairro: b.chave, rua: '' })}">
      <div class="mk-capa">${capa(b)}<span class="mk-capa-n">${b.n} imóve${b.n > 1 ? 'is' : 'l'}</span></div>
      <div class="mk-card-c"><b class="mk-card-nome">${esc(b.nome)}</b>
      <div class="mk-num">${mkMi(b.mediana)}</div><div class="muted small">mediana${b.m2 ? ' · ' + m2txt(b.m2) : ''}</div>
      <div class="muted small">${mkMi(b.min)} a ${mkMi(b.max)}${b.particulares ? ` · ${b.particulares} de particular` : ''}</div></div></a>`).join('')}</div>`
      : `<div class="empty">Nenhum imóvel nesta vitrine com esse filtro. Experimente "qualquer valor" ou puxe mais anúncios do Fisgar pela extensão (botão "Puxar a lista filtrada").</div>`;
  } else if (!f.rua) {
    const ruas = await api('GET', '/api/mercado/ruas?' + new URLSearchParams({ ...filtros, bairro: f.bairro }));
    corpo = `<div class="mk-lista">${ruas.map((r) => `<a class="mk-linha" href="${link({ rua: r.chave })}"><span class="mk-mini">${capa(r)}</span><div style="flex:1;min-width:0"><b>${esc(r.nome)}</b><div class="muted small">${mkMi(r.min)}${r.max !== r.min ? ' a ' + mkMi(r.max) : ''}${r.m2 ? ' · ' + m2txt(r.m2) : ''}</div></div><span class="pill ok">${r.n} imóve${r.n > 1 ? 'is' : 'l'}</span><span class="muted">›</span></a>`).join('') || '<div class="empty">Nenhuma rua.</div>'}</div>`;
  } else {
    const l = await api('GET', '/api/mercado/imoveis?' + new URLSearchParams({ ...filtros, bairro: f.bairro, rua: f.rua }));
    corpo = `<div class="imcards">${l.map((x) => {
      const specs = ehLote ? [x.area_util && `${mkArea(x.area_util)} de terreno`, x.valor && x.area_util ? m2txt(Math.round(x.valor / x.area_util)) : '']
        : [x.quartos && `${x.quartos} quartos`, x.suites && `${x.suites} suítes`, x.vagas && `${x.vagas} vagas`, x.area_util && mkArea(x.area_util)];
      return `<div class="imcardw"><a class="imcard" href="#/fisguei/${x.id}">
      <div class="imfoto">${mkFoto(x, cfg, `${x.subtipo || x.tipo || 'Imóvel'} na ${x.logradouro || ''}`)}
        <span class="imst">${x.anunciante_tipo === 'particular' ? '<span class="pill ok">particular</span>' : '<span class="pill info">imobiliária</span>'}</span>${x.subtipo ? `<span class="imbadge"><span class="pill gold">${esc(x.subtipo)}</span></span>` : ''}</div>
      <div class="imcorpo"><div class="row" style="justify-content:space-between"><span class="mono small muted">${esc(x.ref)}</span><span class="small muted">${esc(x.publicado_em ? new Date(x.publicado_em + 'T12:00').toLocaleDateString('pt-BR') : '')}</span></div>
        <div class="imtit">${esc(x.subtipo || x.tipo || 'Imóvel')} · nº ${esc(x.numero || 's/n')}</div><div class="muted small">${esc(x.complemento || x.anunciante_nome || '')}</div>
        <div class="imspecs">${specs.filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
        <div class="imvalor">${brl(x.valor)}</div>
        ${x.anuncios > 1 ? `<div class="mk-rep" title="${esc(x.outros.map((o) => `${brl(o.valor)} · ${o.anunciante || o.portal || ''}`).join('\n'))}">Anunciado ${x.anuncios} vezes${x.anunciantes > 1 ? ` por ${x.anunciantes} anunciantes` : ''}${x.valor_min !== x.valor_max ? ` · ${mkMi(x.valor_min)} a ${mkMi(x.valor_max)}` : ''}</div>` : ''}</div></a></div>`;
    }).join('')}</div>`;
  }
  const migalha = `<div class="mk-migalha"><a href="${link({ bairro: '', rua: '' })}">${esc(C[1])} em Campinas</a>${bairroAt ? ` › <a href="${link({ rua: '' })}">${esc(bairroAt.nome)}</a>` : ''}${f.rua ? ` › <b>${esc(f.rua.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</b>` : ''}</div>`;
  const abas = `<div class="tabs mk-abas">${MK_CATS.map(([k, t]) => `<a href="#/${k}" class="${k === cat ? 'on' : ''}">${esc(t)} <span class="mk-ab-n">${(res.categorias[k] && res.categorias[k].n || 0).toLocaleString('pt-BR')}</span></a>`).join('')}<a href="#/condominios">Condomínios</a></div>`;
  $('#main').innerHTML = `<div class="eyebrow">Imóveis da base · Campinas</div><h1>${esc(C[1])}</h1>
  ${abas}
  <p class="lead">${esc(C[2])} Escolha o bairro, a rua e o imóvel: a ficha abre com as fotos, a fachada, o 3D da rua e os proprietários.</p>
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
    mk.bindTooltip(`${rot} · ${mkMi(mil * 1000)}`); mk.on('click', () => navega(`#/fisguei/${id}`));
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
