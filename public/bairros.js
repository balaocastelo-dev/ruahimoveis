/* Sistema RUAH — Conteúdo › Páginas de bairros: a lista de bairros, a fila de quem escreve e o que a RUAH quer em cada página. */
'use strict';

const BR_ESTADO = {
  'no-ar': ['ok', 'no ar'], antiga: ['info', 'no ar · será revista'], pedida: ['info', 'no ar · reescrita pedida'],
  'sem-pagina': ['warn', 'na fila'], reprovada: ['bad', 'fora do ar · será refeita'], 'sem-arquivo': ['bad', 'fora do ar'], oculto: ['', 'oculto'],
};
const BR_REGIOES = ['Região central', 'Leste', 'Norte', 'Barão Geraldo', 'Sousas e Joaquim Egídio', 'Sul', 'Oeste e Sudoeste'];
const BR_NOAR = ['no-ar', 'antiga', 'pedida'];
let BR = null;

async function telaBairros(q) {
  BR = await api('GET', '/api/bairros');
  const filtro = q.get('f') || 'todos', busca = (q.get('q') || '').toLowerCase();
  const l = BR.bairros;
  const n = (fn) => l.filter(fn).length;
  const naFila = (b) => ['sem-pagina', 'reprovada', 'sem-arquivo', 'pedida', 'antiga'].includes(b.estado);
  // a mesma ordem que a tarefa usa para escolher o próximo bairro
  const PESO = { pedida: 0, 'sem-pagina': 1, reprovada: 1, 'sem-arquivo': 1, antiga: 2, 'no-ar': 9, oculto: 99 };
  const fila = l.filter((b) => !b.oculto && naFila(b)).sort((a, b) => (PESO[a.estado] - PESO[b.estado]) || b.prioridade - a.prioridade || b.imoveis - a.imoveis || b.condominios - a.condominios || a.nome.localeCompare(b.nome));
  const posicao = new Map(fila.map((b, i) => [b.slug, i + 1]));
  let vis = l.filter((b) => (filtro === 'noar' ? BR_NOAR.includes(b.estado) : filtro === 'fila' ? !b.oculto && naFila(b) : filtro === 'ocultos' ? b.oculto : true));
  if (busca) vis = vis.filter((b) => (b.nome + ' ' + b.apelidos.join(' ') + ' ' + (b.regiao || '')).toLowerCase().includes(busca));
  vis.sort((a, b) => (filtro === 'fila' ? (posicao.get(a.slug) || 999) - (posicao.get(b.slug) || 999) : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const pode = BR.podeEditar;
  const aba = (f, t) => `<a class="btn sm ${filtro === f ? 'pri' : ''}" href="#/bairros?f=${f}">${t}</a>`;

  $('#main').innerHTML = `<div class="eyebrow">Conteúdo</div><h1>Páginas de bairros</h1>
  <p class="lead">Um guia completo para cada bairro de Campinas, feito para ser encontrado no Google e citado pelas IAs. Uma tarefa automática pesquisa o bairro, escolhe fotos reais (de imóveis da RUAH no bairro e de lugares do bairro, com licença livre) e escreve a página; a régua confere antes de publicar. Os números da página (imóveis da RUAH à venda, prédios, o que tem perto) são atualizados sozinhos. Aqui você decide quais bairros entram, a ordem da fila e o que a página deve dizer.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:16px">
    <div class="card kpi"><div class="n">${n((b) => BR_NOAR.includes(b.estado))}</div><div class="l">páginas no ar</div></div>
    <div class="card kpi"><div class="n">${fila.length}</div><div class="l">na fila para escrever</div></div>
    <div class="card kpi"><div class="n">${l.filter((b) => !b.oculto).length}</div><div class="l">bairros na lista</div></div>
    <div class="card kpi"><div class="n">${n((b) => b.oculto)}</div><div class="l">ocultos</div></div>
  </div>
  <div class="row" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <a class="btn pri" href="/bairros" target="_blank" rel="noopener">Abrir os guias</a>
    ${pode ? '<button class="btn" data-act="br-novo">+ Adicionar bairro</button><button class="btn" data-act="br-atualizar" title="Relê as páginas publicadas agora, sem esperar os 10 minutos">Atualizar agora</button>' : ''}
    <span class="sp"></span>${aba('todos', 'Todos')}${aba('noar', 'No ar')}${aba('fila', 'Fila')}${aba('ocultos', 'Ocultos')}
    <form data-form="br-busca" style="display:flex;gap:6px"><input name="q" value="${esc(q.get('q') || '')}" placeholder="Procurar bairro" style="width:180px"><input type="hidden" name="f" value="${esc(filtro)}"></form>
  </div>
  ${fila.length ? `<p class="muted small" style="margin:0 0 12px">Próximos da fila: ${fila.slice(0, 5).map((b, i) => `<b>${i + 1}. ${esc(b.nome)}</b>`).join(' · ')}. A ordem segue: reescrita pedida, depois prioridade, imóveis da RUAH no bairro e número de prédios.</p>` : ''}
  <div class="card tbl"><table><thead><tr><th>Bairro</th><th>Região</th><th title="Imóveis da RUAH à venda no bairro">Imóveis</th><th title="Condomínios e prédios na base">Prédios</th><th>Página</th><th>Prioridade</th><th></th></tr></thead><tbody>
  ${vis.map((b) => {
    const [c, t] = BR_ESTADO[b.estado] || ['info', b.estado];
    const noar = BR_NOAR.includes(b.estado);
    return `<tr>
      <td><b>${noar ? `<a href="/bairros/${esc(b.slug)}" target="_blank" rel="noopener">${esc(b.nome)}</a>` : esc(b.nome)}</b>${b.apelidos.length ? `<div class="muted small" title="${esc(b.apelidos.join(', '))}">também: ${esc(b.apelidos.slice(0, 3).join(', '))}${b.apelidos.length > 3 ? '…' : ''}</div>` : ''}${b.notas ? '<div class="muted small">📝 tem notas para quem escreve</div>' : ''}</td>
      <td>${esc(b.regiao || '—')}</td>
      <td>${b.imoveis || '—'}</td>
      <td>${b.condominios || '—'}</td>
      <td><span class="pill ${c}">${t}</span>${posicao.get(b.slug) ? ` <span class="muted small">#${posicao.get(b.slug)} da fila</span>` : ''}${noar && b.palavras ? `<div class="muted small">${b.palavras} palavras · ${esc(dataBR(b.atualizadoEm || b.publicadoEm)).split(',')[0]}</div>` : ''}${b.erros ? `<div class="muted small" title="${esc(b.erros.join(' | '))}">${esc(b.erros[0])}</div>` : ''}</td>
      <td style="white-space:nowrap">${pode ? `<button class="btn sm" data-act="br-prio" data-slug="${esc(b.slug)}" data-d="-1" title="Mais para o fim da fila">−</button> <b style="display:inline-block;min-width:18px;text-align:center">${b.prioridade}</b> <button class="btn sm" data-act="br-prio" data-slug="${esc(b.slug)}" data-d="1" title="Mais para o começo da fila">+</button>` : b.prioridade}</td>
      <td style="white-space:nowrap">${pode ? `<button class="btn sm" data-act="br-editar" data-slug="${esc(b.slug)}">Editar</button>
        ${noar ? `<button class="btn sm" data-act="br-reescrever" data-slug="${esc(b.slug)}" title="Entra no começo da fila; a página atual continua no ar até a nova sair">Reescrever</button>` : ''}
        <button class="btn sm" data-act="br-ocultar" data-slug="${esc(b.slug)}" data-oculto="${b.oculto ? 0 : 1}">${b.oculto ? 'Mostrar' : 'Ocultar'}</button>` : ''}
        ${noar ? `<button class="btn sm" data-act="br-legenda" data-slug="${esc(b.slug)}">Copiar legenda</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">Nenhum bairro com esse filtro.</td></tr>'}
  </tbody></table></div>
  ${pode && BR.sugestoes.length ? `<div class="card" style="margin-top:16px"><h2 style="margin-top:0">Bairros dos cadastros que não estão na lista</h2>
  <p class="muted small">Nomes de bairro dos imóveis da carteira e da base de condomínios que não batem com nenhum bairro da lista. Adicione como bairro novo ou diga de qual bairro é (vira um "também conhecido como" e os imóveis e prédios passam a contar lá).</p>
  <div class="list">${BR.sugestoes.map((s) => `<div class="item" style="flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:200px"><div class="t">${esc(s.nome)}</div><div class="muted small">${s.imoveis ? `${s.imoveis} imóvel(is) da RUAH` : ''}${s.imoveis && s.condominios ? ' · ' : ''}${s.condominios ? `${s.condominios} condomínio(s) na base` : ''}</div></div>
    <button class="btn sm" data-act="br-sug-novo" data-nome="${esc(s.nome)}">Adicionar como bairro</button>
    <select data-sug="${esc(s.nome)}" style="max-width:200px"><option value="">É do bairro…</option>${l.map((b) => `<option value="${esc(b.slug)}">${esc(b.nome)}</option>`).join('')}</select><button class="btn sm" data-act="br-sug-apelido" data-nome="${esc(s.nome)}">Ligar</button></div>`).join('')}</div></div>` : ''}`;
}

FORM['br-busca'] = async (f) => { const d = formJSON(f); navega('#/bairros?' + new URLSearchParams(Object.fromEntries(Object.entries(d).filter(([, v]) => v)))); };
const brAchar = (slug) => BR.bairros.find((b) => b.slug === slug);

ACT['br-prio'] = async (el) => { const b = brAchar(el.dataset.slug); await api('PUT', `/api/bairros/${b.slug}`, { prioridade: b.prioridade + Number(el.dataset.d) }); rota(); };
ACT['br-ocultar'] = async (el) => {
  const oculto = el.dataset.oculto === '1';
  if (oculto && !confirm('Ocultar este bairro? Se a página estiver no ar, ela sai do ar em até 2 minutos (nada é apagado; dá para mostrar de novo).')) return;
  await api('PUT', `/api/bairros/${el.dataset.slug}`, { oculto }); toast(oculto ? 'Bairro ocultado' : 'Bairro de volta na lista'); rota();
};
ACT['br-reescrever'] = async (el) => { await api('POST', `/api/bairros/${el.dataset.slug}/reescrever`); toast('Pedido feito: o bairro foi para o começo da fila'); rota(); };
ACT['br-atualizar'] = (el) => comBotao(el, async () => { await api('POST', '/api/bairros/atualizar'); toast('Páginas relidas'); rota(); });
ACT['br-legenda'] = async (el) => {
  const r = await api('GET', `/api/bairros/${encodeURIComponent(el.dataset.slug)}/redes`);
  const texto = `${r.legenda}\n\n${r.hashtags}`;
  try { await navigator.clipboard.writeText(texto); el.textContent = 'Legenda copiada'; } catch { window.prompt('Copie a legenda:', texto); }
  setTimeout(() => { el.textContent = 'Copiar legenda'; }, 2000);
};
ACT['br-sug-novo'] = async (el) => { await api('POST', '/api/bairros', { nome: el.dataset.nome }); toast('Bairro adicionado à lista'); rota(); };
ACT['br-sug-apelido'] = async (el) => {
  const sel = $(`select[data-sug="${CSS.escape(el.dataset.nome)}"]`);
  if (!sel || !sel.value) return toast('Escolha o bairro na lista ao lado.', true);
  await api('POST', `/api/bairros/${sel.value}/apelido`, { texto: el.dataset.nome }); toast('Ligado'); rota();
};

const brRegioes = (atual) => `<option value="">Sem região</option>${[...new Set([...BR_REGIOES, ...BR.bairros.map((b) => b.regiao).filter(Boolean)])].map((r) => `<option ${r === atual ? 'selected' : ''}>${esc(r)}</option>`).join('')}`;

ACT['br-novo'] = () => modal(`<h2>Adicionar bairro</h2><form data-form="br-novo" class="grid" style="gap:12px">
  <label class="f">Nome do bairro<input name="nome" required maxlength="80" placeholder="Ex.: Jardim Planalto"></label>
  <label class="f">Região<select name="regiao">${brRegioes('')}</select></label>
  <label class="f">Notas para quem escreve <span class="muted small">(opcional)</span><textarea name="notas" rows="3" maxlength="2000" placeholder="Ex.: falar da feira de domingo na praça; o público é de famílias com filhos"></textarea></label>
  <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Adicionar</button></div></form>`);
FORM['br-novo'] = async (f) => { await api('POST', '/api/bairros', formJSON(f)); fechaModal(); toast('Bairro adicionado à fila'); rota(); };

ACT['br-editar'] = (el) => {
  const b = brAchar(el.dataset.slug);
  modal(`<h2>${esc(b.nome)}</h2><form data-form="br-editar" data-slug="${esc(b.slug)}" class="grid" style="gap:12px">
  <label class="f">Nome<input name="nome" required maxlength="80" value="${esc(b.nome)}"></label>
  <label class="f">Região<select name="regiao">${brRegioes(b.regiao)}</select></label>
  <label class="f">Também conhecido como <span class="muted small">(um por linha: outras grafias e loteamentos do bairro; é por eles que os imóveis e prédios entram na conta)</span><textarea name="apelidos" rows="4">${esc(b.apelidos.join('\n'))}</textarea></label>
  <label class="f">Notas para quem escreve <span class="muted small">(o que a página deve contar, o que evitar; vale na próxima vez que ela for escrita)</span><textarea name="notas" rows="4" maxlength="2000">${esc(b.notas)}</textarea></label>
  <div class="row" style="gap:12px"><label class="f" style="flex:1">Prioridade na fila<input name="prioridade" type="number" min="-9" max="9" value="${b.prioridade}"></label>
  <label class="f" style="flex:1">Centro: latitude<input name="lat" value="${b.lat ?? ''}" placeholder="automático"></label><label class="f" style="flex:1">longitude<input name="lon" value="${b.lon ?? ''}" placeholder="automático"></label></div>
  <p class="muted small" style="margin:0">O centro é calculado pelos prédios do bairro; preencha só se "o que tem perto" estiver saindo de outro lugar. Endereço da página: /bairros/${esc(b.slug)}${b.estado && BR_NOAR.includes(b.estado) ? ' (no ar)' : ''}.</p>
  <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`);
};
FORM['br-editar'] = async (f) => { await api('PUT', `/api/bairros/${f.dataset.slug}`, formJSON(f)); fechaModal(); toast('Bairro salvo'); rota(); };
