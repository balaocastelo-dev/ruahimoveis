/* Painel do gestor · Herrera HOUSE IA (sem frameworks; tudo passa por esc() antes de virar HTML) */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const mi = (v) => { v = Number(v) || 0; return v >= 1e9 ? 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi' : v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : brl(v); };
const n = (v) => (Number(v) || 0).toLocaleString('pt-BR');
const quando = (s) => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); const min = Math.round((Date.now() - d.getTime()) / 60000); if (min < 2) return 'agora'; if (min < 60) return `há ${min} min`; const h = Math.round(min / 60); if (h < 24) return `há ${h} h`; const dd = Math.round(h / 24); return dd < 30 ? `há ${dd} dia${dd > 1 ? 's' : ''}` : d.toLocaleDateString('pt-BR'); };
const SITU = { ativa: 'Ativa', suspensa: 'Suspensa', implantacao: 'Em implantação' };
const ACAO = { criou: 'cadastrou', editou: 'editou', suspendeu: 'suspendeu', reativou: 'reativou', viu_instalacao: 'viu os dados de instalação de', publicada: 'marcou como publicada', senha: 'trocou a senha do painel' };

async function api(metodo, url, corpo) {
  const r = await fetch('/gestor-api' + url, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-Gestor': '1' }, body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/login') { telaEntrada(); throw new Error(j.erro || 'Entre de novo.'); }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}
function aviso(t, ruim) { const a = document.createElement('div'); a.className = 'aviso' + (ruim ? ' ruim' : ''); a.setAttribute('role', 'status'); a.textContent = t; document.body.appendChild(a); setTimeout(() => a.remove(), 4200); }
const comBotao = async (b, fn) => { b.disabled = true; try { await fn(); } catch (e) { aviso(e.message, true); } finally { b.disabled = false; } };

// ---------- entrada ----------
function telaEntrada() {
  $('#raiz').innerHTML = `<div class="entrada"><form id="f-entrar" autocomplete="on">
    <div class="marca">Herrera HOUSE IA<span>Painel do gestor</span></div>
    <p class="muted pequeno">As imobiliárias da plataforma, os números de cada uma e os valores do mês.</p>
    <label class="c">E-mail<input name="email" type="email" required autocomplete="username"></label>
    <label class="c">Senha<input name="senha" type="password" required autocomplete="current-password"></label>
    <button class="btn pri" type="submit">Entrar</button><p class="erro" id="e-entrar" hidden></p></form></div>`;
  $('#f-entrar').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, b = $('button', f);
    b.disabled = true; $('#e-entrar').hidden = true;
    try { await api('POST', '/login', { email: f.email.value, senha: f.senha.value }); iniciar(); }
    catch (err) { $('#e-entrar').textContent = err.message; $('#e-entrar').hidden = false; b.disabled = false; }
  });
}

// ---------- painel ----------
let DADOS = null, FILTRO = 'todas', EU = null;
async function iniciar() {
  try { EU = await api('GET', '/eu'); } catch { return; }
  $('#raiz').innerHTML = `<header class="topo"><div class="topo-in"><div class="marca">Herrera HOUSE IA<span>Painel do gestor</span></div><div class="sp"></div>
    <span class="muted pequeno">${esc(EU.nome)}</span><button class="btn sm" id="b-senha">Trocar senha</button><button class="btn sm" id="b-sair">Sair</button></div></header>
    <main><h1>Imobiliárias</h1><p class="muted">Cada imobiliária tem o sistema, o portal e o blog dela, com banco separado. A base de condomínios e o 3D são comuns.</p>
    <div id="kpis" class="kpis"></div>
    <div class="cab"><h2>Clientes</h2><div class="sp"></div>
      <div class="filtros" role="group" aria-label="Filtrar">${['todas', 'ativa', 'implantacao', 'suspensa'].map((k) => `<button type="button" data-f="${k}" aria-pressed="${FILTRO === k}">${k === 'todas' ? 'Todas' : SITU[k]}</button>`).join('')}</div>
      <button class="btn pri" id="b-nova">+ Nova imobiliária</button></div>
    <div id="lista" class="imobs"><div class="vazio">Carregando os números…</div></div>
    <section class="atividade"><h2>Atividade recente</h2><ol id="ativ"></ol></section></main>`;
  $('#b-sair').onclick = async () => { await api('POST', '/logout').catch(() => {}); telaEntrada(); };
  $('#b-senha').onclick = janelaSenha;
  $('#b-nova').onclick = janelaNova;
  document.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { FILTRO = b.dataset.f; document.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b)); desenhaLista(); });
  await carregar();
}
async function carregar() {
  try {
    const [d, ev] = await Promise.all([api('GET', '/imobiliarias'), api('GET', '/eventos')]);
    DADOS = d; desenhaKpis(); desenhaLista();
    $('#ativ').innerHTML = ev.length ? ev.map((e) => `<li><span class="n">${esc(new Date(e.em.replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</span><span>Você ${esc(ACAO[e.acao] || e.acao)} ${e.imobiliaria ? `<b>${esc(e.imobiliaria)}</b>` : ''}${e.acao === 'editou' && e.detalhe ? ` <span class="muted">(${esc(e.detalhe)})</span>` : ''}</span></li>`).join('') : '<li class="muted">Nada ainda.</li>';
  } catch (e) { $('#lista').innerHTML = `<div class="vazio">${esc(e.message)}</div>`; }
}
function desenhaKpis() {
  const r = DADOS.resumo;
  const k = (v, l, cls = '') => `<div class="kpi ${cls}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
  $('#kpis').innerHTML = k(n(r.ativas), `imobiliária${r.ativas === 1 ? '' : 's'} ativa${r.ativas === 1 ? '' : 's'}${r.implantacao ? ` · ${r.implantacao} em implantação` : ''}${r.suspensas ? ` · ${r.suspensas} suspensa${r.suspensas > 1 ? 's' : ''}` : ''}`)
    + k(brl(r.mensalidades), 'mensalidades por mês (ativas)', 'destaque')
    + k(brl(r.comissao_mes), 'sua parte das vendas deste mês (estimada)')
    + k(mi(r.vgv), 'em imóveis nas carteiras')
    + k(n(r.imoveis), 'imóveis cadastrados')
    + k(n(r.leads_30d), 'clientes novos em 30 dias')
    + k(n(r.creditos_mes), 'consultas do Fisgar no mês');
}
function desenhaLista() {
  const l = DADOS.imobiliarias.filter((i) => FILTRO === 'todas' || i.situacao === FILTRO);
  if (!l.length) { $('#lista').innerHTML = '<div class="vazio">Nenhuma imobiliária neste filtro.</div>'; return; }
  $('#lista').innerHTML = l.map((i) => {
    const x = i.numeros || {};
    const met = (v, lb) => `<div class="met"><div class="v">${v}</div><div class="l">${esc(lb)}</div></div>`;
    return `<article class="imob ${i.situacao}" data-id="${i.id}">
      <div><div class="imob-nome">${esc(i.nome)}</div><div class="imob-sub">${esc(i.empresa || '')}${i.link ? ` · <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.link.replace(/^https:\/\//, ''))}</a>` : ' · <span class="muted">sem link ainda</span>'}</div>
        <div class="selos"><span class="selo ${i.situacao}">${esc(SITU[i.situacao] || i.situacao)}</span><span class="selo plano">${esc(i.plano)}</span>${i.mensalidade ? `<span class="selo">${brl(i.mensalidade)}/mês</span>` : ''}<span class="selo">${n(i.comissao_pct)}% da comissão</span></div></div>
      <div class="metricas">${i.numeros ? met(n(x.imoveis), `imóveis · ${n(x.publicados)} publicados`) + met(mi(x.vgv_carteira), 'na carteira') + met(n(x.vendidos) + (x.alugados ? ` + ${n(x.alugados)}` : ''), x.alugados ? 'vendidos + alugados' : 'vendidos')
        + met(brl(i.comissao_mes), 'sua parte no mês') + met(n(x.leads_30d), 'clientes em 30 dias') + met(n(x.visitas_30d), 'visitas em 30 dias') + met(n(x.usuarios), 'usuários')
        + met(n(x.creditos_mes) + (i.creditos_fisgar_mes ? ` / ${n(i.creditos_fisgar_mes)}` : ''), 'consultas Fisgar no mês') + met(quando(x.ultima_atividade), 'última atividade') + met((x.tamanho_mb || 0).toLocaleString('pt-BR') + ' MB', 'no banco')
        : `<span class="muted">${esc(i.erro || 'Banco ainda não criado.')}</span>`}</div>
      <div class="acoes">${i.link ? `<a class="btn sm" href="${esc(i.link)}" target="_blank" rel="noopener">Abrir sistema</a>` : ''}
        <button class="btn sm" data-a="editar">Editar</button>
        ${i.situacao === 'implantacao' || !i.publicada ? '<button class="btn sm" data-a="instalar">Instalação</button>' : ''}
        ${i.situacao === 'suspensa' ? '<button class="btn sm" data-a="reativar">Reativar</button>' : '<button class="btn sm perigo" data-a="suspender">Suspender</button>'}</div></article>`;
  }).join('');
  document.querySelectorAll('.imob [data-a]').forEach((b) => b.onclick = () => {
    const im = DADOS.imobiliarias.find((i) => i.id === +b.closest('.imob').dataset.id);
    ({ editar: janelaEditar, instalar: janelaInstalacao, suspender: janelaSuspender, reativar: (x) => situacao(x, false, b) })[b.dataset.a](im, b);
  });
}

// ---------- janelas ----------
function janela(html, ao) {
  const d = document.createElement('dialog'); d.innerHTML = `<div class="jan">${html}</div>`; document.body.appendChild(d);
  d.addEventListener('close', () => d.remove()); d.querySelectorAll('[data-fecha]').forEach((b) => b.onclick = () => d.close());
  d.showModal(); if (ao) ao(d); return d;
}
const campo = (nome, rotulo, valor = '', extra = '') => `<label class="c${/inteiro/.test(extra) ? ' inteiro' : ''}">${esc(rotulo)}<input name="${nome}" value="${esc(valor ?? '')}" ${extra.replace('inteiro', '')}></label>`;
const PLANOS = ['essencial', 'profissional', 'premium', 'fundador'];
const camposComerciais = (i = {}) => `<label class="c">Plano<select name="plano">${PLANOS.map((p) => `<option ${p === (i.plano || 'essencial') ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
  ${campo('mensalidade', 'Mensalidade (R$)', i.mensalidade ?? '', 'inputmode="decimal"')}
  ${campo('comissao_pct', '% da comissão para a plataforma', i.comissao_pct ?? 20, 'inputmode="decimal"')}
  ${campo('comissao_venda_pct', 'Comissão da imobiliária sobre a venda (%)', i.comissao_venda_pct ?? 6, 'inputmode="decimal"')}
  ${campo('creditos_fisgar_mes', 'Consultas do Fisgar por mês (cota)', i.creditos_fisgar_mes ?? 0, 'inputmode="numeric"')}`;
const lerForm = (f) => Object.fromEntries(new FormData(f).entries());

function janelaNova() {
  janela(`<h2>Nova imobiliária</h2><p class="muted pequeno">Cria o banco próprio, o administrador e o cadastro. ${DADOS.resumo.vercel_automatico ? 'O sistema é publicado na Vercel sozinho.' : 'Depois é só publicar o projeto na Vercel com as variáveis que aparecem em "Instalação".'}</p>
    <form id="f-nova"><fieldset><legend>Imobiliária</legend><div class="campos">${campo('nome', 'Nome (marca)', '', 'required maxlength="60" inteiro')}${campo('empresa', 'Nome completo / razão social')}${campo('slug', 'Nome técnico (opcional)', '', 'pattern="[a-z][a-z0-9_]{2,30}" placeholder="gerado do nome"')}</div></fieldset>
    <fieldset><legend>Contato</legend><div class="campos">${campo('contato_nome', 'Responsável')}${campo('contato_telefone', 'Telefone')}${campo('contato_email', 'E-mail de contato', '', 'type="email" inteiro')}</div></fieldset>
    <fieldset><legend>Administrador do sistema</legend><div class="campos">${campo('admin_nome', 'Nome')}${campo('admin_email', 'E-mail de entrada', '', 'type="email" required')}${campo('admin_senha', 'Senha inicial (8+ caracteres)', '', 'type="password" required minlength="8" autocomplete="new-password" inteiro')}</div></fieldset>
    <fieldset><legend>Valores</legend><div class="campos">${camposComerciais()}</div></fieldset>
    <p class="erro" id="e-nova" hidden></p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Criar imobiliária</button></div></form>`, (d) => {
    $('#f-nova', d).addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true; b.textContent = 'Criando o banco…';
      try {
        const r = await api('POST', '/imobiliarias', lerForm(e.target));
        d.close(); aviso(r.publicada ? 'Imobiliária criada e publicada na Vercel.' : r.aviso ? 'Criada. A publicação na Vercel falhou: ' + r.aviso : 'Imobiliária criada. Falta publicar (veja Instalação).', !!r.aviso);
        await carregar();
        if (!r.publicada) { const im = DADOS.imobiliarias.find((i) => i.id === r.id); if (im) janelaInstalacao(im); }
      } catch (err) { $('#e-nova', d).textContent = err.message; $('#e-nova', d).hidden = false; b.disabled = false; b.textContent = 'Criar imobiliária'; }
    });
  });
}
function janelaEditar(i) {
  janela(`<h2>${esc(i.nome)}</h2><p class="muted pequeno">Nome técnico: <span class="n">${esc(i.slug)}</span> · cliente desde ${esc(new Date(i.criado_em.replace(' ', 'T')).toLocaleDateString('pt-BR'))}</p>
    <form id="f-ed"><div class="campos">${campo('nome', 'Nome (marca)', i.nome, 'required')}${campo('empresa', 'Nome completo', i.empresa)}
    ${campo('link', 'Link do sistema', i.link, 'type="url" placeholder="https://"')}${campo('dominio', 'Domínio próprio', i.dominio)}
    ${campo('contato_nome', 'Responsável', i.contato_nome)}${campo('contato_telefone', 'Telefone', i.contato_telefone)}${campo('contato_email', 'E-mail de contato', i.contato_email, 'type="email" inteiro')}
    ${camposComerciais(i)}<label class="c inteiro">Notas<textarea name="notas">${esc(i.notas || '')}</textarea></label></div>
    <p class="erro" id="e-ed" hidden></p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Salvar</button></div></form>`, (d) => {
    $('#f-ed', d).addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true;
      try { await api('PATCH', '/imobiliarias/' + i.id, lerForm(e.target)); d.close(); aviso('Salvo.'); carregar(); }
      catch (err) { $('#e-ed', d).textContent = err.message; $('#e-ed', d).hidden = false; b.disabled = false; }
    });
  });
}
async function janelaInstalacao(i) {
  let r; try { r = await api('GET', `/imobiliarias/${i.id}/instalacao`); } catch (e) { return aviso(e.message, true); }
  const vars = r.variaveis ? Object.entries(r.variaveis).map(([k, v]) => `${k}=${v}`).join('\n') : null;
  janela(`<h2>Instalação · ${esc(i.nome)}</h2>${vars ? `<p class="muted pequeno">Para publicar: na Vercel, crie um projeto ligado ao repositório <span class="n">${esc(r.repo)}</span> (ramo main), cole estas variáveis em Environment Variables e publique. Depois informe o link abaixo. Guarde isto em lugar seguro: tem a senha do banco.</p>
    <div class="vars" id="vars">${esc(vars)}</div><div class="rod" style="justify-content:flex-start"><button class="btn sm" id="b-copiar" type="button">Copiar variáveis</button></div>` : `<p class="muted">${esc(r.aviso)}</p>`}
    <form id="f-pub"><div class="campos">${campo('link', 'Link depois de publicada', i.link, 'type="url" placeholder="https://…vercel.app"')}${campo('vercel_projeto', 'Nome do projeto na Vercel', i.vercel_projeto)}</div>
    <div class="rod"><button type="button" class="btn" data-fecha>Fechar</button><button class="btn pri" type="submit">Marcar como publicada</button></div></form>`, (d) => {
    const c = $('#b-copiar', d); if (c) c.onclick = () => navigator.clipboard.writeText(vars).then(() => aviso('Variáveis copiadas.'), () => aviso('Não consegui copiar: selecione o texto.', true));
    $('#f-pub', d).addEventListener('submit', async (e) => { e.preventDefault(); const b = $('button[type=submit]', e.target); await comBotao(b, async () => { await api('POST', `/imobiliarias/${i.id}/publicada`, lerForm(e.target)); d.close(); aviso('Marcada como publicada.'); carregar(); }); });
  });
}
function janelaSuspender(i, botao) {
  janela(`<h2>Suspender ${esc(i.nome)}?</h2><p class="muted">O sistema, o portal e o blog dela mostram "temporariamente fora do ar" em até 1 minuto. Nada é apagado: reativar volta tudo como estava.</p>
    <div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button type="button" class="btn pri" id="b-sim" style="background:var(--erro);border-color:var(--erro)">Suspender</button></div>`, (d) => {
    $('#b-sim', d).onclick = () => comBotao($('#b-sim', d), async () => { await situacao(i, true, botao); d.close(); });
  });
}
async function situacao(i, suspensa, b) {
  await comBotao(b, async () => { await api('POST', `/imobiliarias/${i.id}/situacao`, { suspensa }); aviso(suspensa ? `${i.nome} suspensa.` : `${i.nome} reativada.`); await carregar(); });
}
function janelaSenha() {
  janela(`<h2>Trocar a senha do painel</h2><form id="f-s"><div class="campos">${campo('atual', 'Senha atual', '', 'type="password" required autocomplete="current-password" inteiro')}${campo('nova', 'Senha nova (10+ caracteres)', '', 'type="password" required minlength="10" autocomplete="new-password" inteiro')}</div>
    <p class="erro" id="e-s" hidden></p><div class="rod"><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Trocar</button></div></form>`, (d) => {
    $('#f-s', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('POST', '/senha', lerForm(e.target)); d.close(); aviso('Senha trocada.'); }
      catch (err) { $('#e-s', d).textContent = err.message; $('#e-s', d).hidden = false; }
    });
  });
}

iniciar().catch(() => telaEntrada());
