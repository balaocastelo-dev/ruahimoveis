/* Assistente "Nova imobiliária" com o Herrera · painel do gestor (Herrera HOUSE IA).
   O Herrera é o avatar de treinamento: um vídeo pré-gravado por passo (voz clonada do Thiago + sincronia labial na RTX 4090),
   com a legenda frase a frase. O assistente explica, a pessoa faz, e o painel confere de verdade (site no ar, chave testada,
   redes conectadas). Usa $, esc, api, aviso, carregar, DADOS e PLANOS do gestor.js. */
'use strict';
(() => {
  const BASE = '/gestor/herrera/';
  const PASSOS = [
    { id: 'boas-vindas', clip: '01-boas-vindas', titulo: 'Boas-vindas', curto: 'Início' },
    { id: 'dados', clip: '02-dados', titulo: 'Dados e plano', curto: 'Dados' },
    { id: 'administrador', clip: '03-administrador', titulo: 'Administrador', curto: 'Admin' },
    { id: 'publicar', clip: '04-publicar', titulo: 'Criar e publicar', curto: 'No ar' },
    { id: 'marca', clip: '05-marca', titulo: 'Marca e cores', curto: 'Marca' },
    { id: 'gemini', clip: '06-gemini', titulo: 'Chave do Gemini (IA)', curto: 'IA' },
    { id: 'google-maps', clip: '07-google-maps', titulo: 'Chave do Google Maps', curto: 'Mapas' },
    { id: 'facebook-instagram', clip: '08-facebook-instagram', titulo: 'Facebook e Instagram', curto: 'Redes' },
    { id: 'google-meu-negocio', clip: '09-google-meu-negocio', titulo: 'Google Meu Negócio', curto: 'Google' },
    { id: 'whatsapp', clip: '10-whatsapp', titulo: 'WhatsApp dos agentes', curto: 'WhatsApp' },
    { id: 'pronto', clip: '11-pronto', titulo: 'Tudo pronto', curto: 'Pronto' },
  ];
  const NUCLEO = PASSOS.slice(1, -1).map((p) => p.id); // os 9 passos que contam no "Configuração 6/9"
  const PLANO_INFO = {
    essencial: 'Blog 1 matéria/dia · 3 imóveis por semana nas redes · revista no sábado',
    profissional: 'Blog 2 matérias/dia · 1 imóvel por dia nas redes · guia de bairro semanal · revista',
    premium: 'Como o Profissional, com mais consultas de proprietário',
    rede: 'Blog 3 matérias/dia · 2 imóveis por dia nas redes · 2 guias de bairro por semana · revista',
    fundador: 'Tudo do Rede, condição de fundador',
  };
  let MANIFESTO = null;
  const manifesto = () => (MANIFESTO ? Promise.resolve(MANIFESTO) : fetch(BASE + 'herrera.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { clips: {} })).catch(() => ({ clips: {} })).then((m) => (MANIFESTO = m)));

  // ---------- estado do assistente ----------
  let S = null; // { im, info, passo, form, dlg, legendas, som }
  const feito = (id) => !!(S && S.info && S.info.onboarding && S.info.onboarding[id] && S.info.onboarding[id].feito);
  const progresso = (onb) => NUCLEO.filter((id) => onb && onb[id] && onb[id].feito).length;

  // ---------- o palco do Herrera (vídeo + legenda frase a frase) ----------
  function palco() {
    return `<div class="hz-palco">
      <div class="hz-tela" id="hz-tela"><div class="hz-aura" aria-hidden="true"></div>
        <video id="hz-video" playsinline preload="auto" aria-label="Herrera explicando este passo"></video>
        <img id="hz-poster" alt="" hidden>
        <div class="hz-cracha"><b>Herrera</b><span>seu guia na Herrera HOUSE IA</span></div>
        <div class="hz-fala" id="hz-fala" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <button type="button" class="hz-play" id="hz-play" aria-label="Ouvir o Herrera">▶</button>
      </div>
      <p class="hz-legenda" id="hz-legenda" aria-live="polite"></p>
      <div class="hz-ctl" role="group" aria-label="Controles do Herrera">
        <button type="button" class="btn sm" id="hz-de-novo">↺ Ouvir de novo</button>
        <button type="button" class="btn sm" id="hz-pausa">❚❚ Pausar</button>
        <button type="button" class="btn sm" id="hz-som" aria-pressed="false">🔊 Som</button>
        <button type="button" class="btn sm" id="hz-leg" aria-pressed="true">Legenda</button>
      </div></div>`;
  }
  let clipAtual = null, aoTerminar = null;
  async function falar(clipId, depois) {
    const m = await manifesto();
    const c = m.clips && m.clips[clipId];
    const v = $('#hz-video'), p = $('#hz-poster'), leg = $('#hz-legenda');
    if (!v) return;
    clipAtual = c ? { id: clipId, ...c } : { id: clipId, frases: [] };
    aoTerminar = depois || null;
    leg.textContent = '';
    if (!c || !c.video) { // vídeo ainda não gerado: a imagem do personagem e o texto do passo
      v.hidden = true; p.hidden = false; p.src = BASE + 'herrera-' + (c && c.imagem || 'mesa') + '.webp';
      leg.textContent = c && c.texto ? c.texto : '';
      $('#hz-play').hidden = true; return;
    }
    p.hidden = true; v.hidden = false;
    v.poster = c.poster || ''; v.src = c.video; v.muted = !S.som; v.currentTime = 0;
    const tenta = v.play();
    if (tenta && tenta.catch) tenta.catch(() => { $('#hz-play').hidden = false; });
  }
  function ligaPalco() {
    const v = $('#hz-video'), tela = $('#hz-tela');
    v.addEventListener('play', () => { tela.classList.add('falando'); $('#hz-play').hidden = true; $('#hz-pausa').textContent = '❚❚ Pausar'; });
    v.addEventListener('pause', () => { tela.classList.remove('falando'); $('#hz-pausa').textContent = '▶ Continuar'; });
    v.addEventListener('ended', () => { tela.classList.remove('falando'); const f = aoTerminar; aoTerminar = null; if (f) f(); });
    v.addEventListener('timeupdate', () => {
      if (!clipAtual || !S.legendas) return;
      const t = v.currentTime, fr = (clipAtual.frases || []).find((x) => t >= x.inicio - 0.05 && t <= x.fim + 0.25);
      const leg = $('#hz-legenda'); const novo = fr ? fr.texto : '';
      if (leg.textContent !== novo) { leg.textContent = novo; leg.classList.remove('entra'); void leg.offsetWidth; leg.classList.add('entra'); }
    });
    $('#hz-play').onclick = () => { v.muted = !S.som; v.play(); };
    $('#hz-de-novo').onclick = () => { if (clipAtual) { v.currentTime = 0; v.muted = !S.som; v.play(); } };
    $('#hz-pausa').onclick = () => (v.paused ? v.play() : v.pause());
    const som = $('#hz-som');
    const marcaSom = () => { som.setAttribute('aria-pressed', S.som); som.textContent = S.som ? '🔊 Som' : '🔇 Sem som'; v.muted = !S.som; };
    som.onclick = () => { S.som = !S.som; try { localStorage.setItem('herrera.som', S.som ? '1' : '0'); } catch {} marcaSom(); if (S.som && v.paused && clipAtual) v.play(); };
    marcaSom();
    const lg = $('#hz-leg');
    lg.onclick = () => { S.legendas = !S.legendas; lg.setAttribute('aria-pressed', S.legendas); $('#hz-legenda').hidden = !S.legendas; };
  }

  // ---------- a trilha ----------
  function trilha() {
    return `<ol class="hz-trilha">${PASSOS.map((p, i) => `<li class="${p.id === S.passo ? 'atual' : ''} ${feito(p.id) ? 'feito' : ''}">
      <button type="button" data-ir="${p.id}" ${!S.im && i > 3 ? 'disabled' : ''} aria-current="${p.id === S.passo ? 'step' : 'false'}"><span class="hz-n">${feito(p.id) ? '✓' : i}</span><span class="hz-t">${esc(p.curto)}</span></button></li>`).join('')}</ol>`;
  }
  const lista = (itens) => `<ol class="hz-lista">${itens.map((t) => `<li>${t}</li>`).join('')}</ol>`;
  const campo = (nome, rotulo, valor = '', extra = '') => `<label class="c">${esc(rotulo)}<input name="${nome}" value="${esc(valor ?? '')}" ${extra}></label>`;
  const statusPasso = (id) => (feito(id) ? `<p class="hz-ok">✓ Feito${S.info.onboarding[id].detalhe ? ` · ${esc(S.info.onboarding[id].detalhe)}` : ''}</p>` : '');
  const linkSistema = (hash, txt) => (S.im && S.im.link ? `<a class="btn" href="${esc(S.im.link + '/' + hash)}" target="_blank" rel="noopener">${esc(txt)} ↗</a>` : '');

  const CONTEUDO = {
    'boas-vindas': () => `<h2>Vamos colocar uma imobiliária no ar</h2>
      <p class="muted">São 9 passos curtos. Em cada um eu explico o que fazer, você faz e o painel confere na hora.</p>
      ${lista(['Dados, plano e administrador', 'Criar e publicar o sistema, o portal e o blog', 'Marca, chave da IA e chave do Google Maps', 'Facebook, Instagram e Google Meu Negócio', 'WhatsApp dos agentes'])}
      ${DADOS && DADOS.imobiliarias.length ? `<label class="c">Ou continue uma imobiliária que já existe<select id="hz-existente"><option value="">— nova imobiliária —</option>${DADOS.imobiliarias.map((i) => `<option value="${i.id}">${esc(i.nome)} · configuração ${progresso(i.onboarding)}/${NUCLEO.length}</option>`).join('')}</select></label>` : ''}`,
    dados: () => `<h2>Dados e plano</h2><p class="muted">O nome da marca aparece no portal, no blog e nas mensagens. O endereço vai ser <span class="n">${esc((S.form.slug || slugPrevia(S.form.nome) || 'nome'))}.corretordofuturo.app</span>.</p>
      <form id="hz-f" class="campos">${campo('nome', 'Nome da marca', S.form.nome, 'required maxlength="60"')}${campo('empresa', 'Nome completo / razão social', S.form.empresa)}
      ${campo('contato_nome', 'Responsável', S.form.contato_nome)}${campo('contato_telefone', 'Telefone', S.form.contato_telefone, 'inputmode="tel"')}
      ${campo('contato_email', 'E-mail de contato', S.form.contato_email, 'type="email"')}
      <label class="c">Plano<select name="plano">${PLANOS.map((p) => `<option value="${p}" ${p === (S.form.plano || 'profissional') ? 'selected' : ''}>${p}</option>`).join('')}</select><small class="muted" id="hz-plano-info"></small></label>
      ${campo('mensalidade', 'Mensalidade (R$)', S.form.mensalidade, 'inputmode="decimal"')}${campo('creditos_fisgar_mes', 'Consultas de proprietário por mês', S.form.creditos_fisgar_mes ?? 0, 'inputmode="numeric"')}
      ${campo('comissao_pct', '% da comissão para a plataforma', S.form.comissao_pct ?? 20, 'inputmode="decimal"')}${campo('comissao_venda_pct', 'Comissão da imobiliária sobre a venda (%)', S.form.comissao_venda_pct ?? 6, 'inputmode="decimal"')}</form>`,
    administrador: () => `<h2>Administrador</h2><p class="muted">Quem entra primeiro no sistema e cadastra a equipe. A senha inicial é trocada no primeiro acesso.</p>
      <form id="hz-f" class="campos">${campo('admin_nome', 'Nome', S.form.admin_nome)}${campo('admin_email', 'E-mail de entrada', S.form.admin_email, 'type="email" required')}
      <label class="c">Senha inicial (8+ caracteres)<span class="hz-linha"><input name="admin_senha" type="text" value="${esc(S.form.admin_senha || '')}" required minlength="8" autocomplete="off"><button type="button" class="btn sm" id="hz-gera">Gerar senha forte</button></span></label></form>
      <div class="hz-nota">🔒 O sistema nunca pede senha de banco, de Facebook ou de Instagram. As redes são ligadas pelo botão oficial "Conectar", na tela do próprio Facebook e do Google.</div>`,
    publicar: () => S.im ? `<h2>${esc(S.im.nome)} no ar</h2>
      <div class="hz-checks"><p class="${'ok'}">✓ Banco próprio criado, com a base de anúncios, condomínios e 3D</p>
      <p class="${S.info.publicacao.ok ? 'ok' : 'espera'}">${S.info.publicacao.ok ? '✓' : '…'} Sistema, portal e blog em <a href="${esc(S.im.link || '#')}" target="_blank" rel="noopener">${esc((S.im.link || '').replace('https://', ''))}</a>${S.info.publicacao.ok ? '' : ` <span class="muted">(${esc(S.info.publicacao.motivo || 'publicando')})</span>`}</p></div>
      ${S.info.publicacao.ok ? '' : `<p class="muted pequeno">A primeira publicação leva 1 a 2 minutos. ${DADOS.resumo.vercel_automatico ? 'Eu confiro sozinho a cada 10 segundos.' : 'Sem o token da Vercel: abra "Instalação" no cartão da imobiliária, publique e volte aqui.'}</p>
      <button type="button" class="btn" id="hz-conferir">Conferir agora</button>`}${statusPasso('publicar')}`
      : `<h2>Criar e publicar</h2><p class="muted">Confira os dados. Ao criar, a plataforma monta o banco, o administrador e publica tudo.</p>
      <dl class="hz-resumo"><dt>Marca</dt><dd>${esc(S.form.nome || '—')}</dd><dt>Endereço</dt><dd class="n">${esc((S.form.slug || slugPrevia(S.form.nome)) + '.corretordofuturo.app')}</dd><dt>Plano</dt><dd>${esc(S.form.plano || 'profissional')}</dd><dt>Administrador</dt><dd>${esc(S.form.admin_email || '—')}</dd></dl>
      <button type="button" class="btn pri hz-grande" id="hz-criar">Criar e publicar ${esc(S.form.nome || '')}</button><p class="hz-erro" id="hz-erro" hidden></p>`,
    marca: () => `<h2>Marca e cores</h2><p class="muted">Peça à imobiliária e anote aqui. O tema (logo, cores e fonte) entra no portal, no blog e nas artes das redes.</p>
      ${lista(['Logo em boa qualidade, de preferência com fundo transparente (SVG ou PNG)', 'As cores da marca (ex.: #0E8C8C e #FF6B4A)', 'O jeito de falar: mais jovem, mais clássico, mais sofisticado'])}
      <form id="hz-f" class="campos"><label class="c inteiro">Cores, links do logo e observações<textarea name="marca" rows="4">${esc((S.info.onboarding.marca && S.info.onboarding.marca.detalhe) || '')}</textarea></label></form>
      <p class="muted pequeno">Capa do portal: cada imobiliária ganha a foto de um lugar símbolo de Campinas, em 4K.</p>${statusPasso('marca')}`,
    gemini: () => `<h2>Chave do Gemini (inteligência artificial)</h2>
      ${lista(['Abra o <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio ↗</a> com a conta Google da imobiliária', 'Clique em <b>Get API key</b> e depois em <b>Create API key</b>', 'Copie a chave (começa com <span class="n">AIza</span>) e cole abaixo'])}
      <form id="hz-f" class="hz-teste"><label class="c">Chave do Gemini<input name="chave" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" required></label><button class="btn pri" type="submit">Testar e gravar</button></form>
      <p class="muted pequeno">Eu testo no Google e gravo cifrada no sistema da imobiliária. A chave não fica no painel.</p><div id="hz-res"></div>${statusPasso('gemini')}`,
    'google-maps': () => { const dom = (S.im && S.im.link ? S.im.link.replace('https://', '') : 'nome.corretordofuturo.app'); return `<h2>Chave do Google Maps (3D e fachadas)</h2>
      ${lista(['No <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud ↗</a>, crie um projeto (com faturamento ativo; o uso mensal costuma ficar na faixa grátis)', 'Ative a <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" rel="noopener">Map Tiles API ↗</a> e a <a href="https://console.cloud.google.com/apis/library/street-view-image-backend.googleapis.com" target="_blank" rel="noopener">Street View Static API ↗</a>', `Em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credenciais ↗</a>, crie a chave e restrinja a <b>sites</b>: <span class="n">https://${esc(dom)}/*</span>`, 'Cole a chave abaixo'])}
      <form id="hz-f" class="hz-teste"><label class="c">Chave do Google Maps<input name="chave" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" required></label><button class="btn pri" type="submit">Testar e gravar</button></form><div id="hz-res"></div>${statusPasso('google-maps')}`; },
    'facebook-instagram': () => `<h2>Facebook e Instagram</h2>
      ${lista(['O Instagram precisa ser <b>conta profissional</b> (empresa ou criador)', 'Ele precisa estar <b>ligado à Página</b> do Facebook da imobiliária', 'No sistema dela: <b>Redes e publicações › Contas › Conectar com o Facebook</b>', 'A pessoa entra na tela oficial do Facebook e autoriza. Ninguém digita senha no nosso sistema'])}
      <div class="hz-acoes">${linkSistema('#/redes/contas', 'Abrir as contas no sistema dela')}<button type="button" class="btn" id="hz-conferir">Conferir conexão</button></div><div id="hz-res"></div>
      <p class="muted pequeno">Enquanto a conexão não estiver liberada, os posts saem como "prontos para postar" (artes e legenda para copiar).</p>${statusPasso('facebook-instagram')}`,
    'google-meu-negocio': () => `<h2>Google Meu Negócio</h2>
      ${lista(['No sistema dela: <b>Redes e publicações › Contas › Conectar o Google Meu Negócio</b>', 'Entre com a conta Google que administra o perfil da empresa', 'Os imóveis passam a aparecer no perfil, com o botão "Saiba mais"'])}
      <div class="hz-acoes">${linkSistema('#/redes/contas', 'Abrir as contas no sistema dela')}<button type="button" class="btn" id="hz-conferir">Conferir conexão</button></div><div id="hz-res"></div>${statusPasso('google-meu-negocio')}`,
    whatsapp: () => `<h2>WhatsApp dos agentes</h2>
      ${lista(['Separe um chip por setor (captação, apartamentos, casas, alto padrão…)', 'No sistema dela, abra <b>Escritório virtual</b> e a mesa do agente', 'Clique em <b>Conectar</b> e leia o QR code no celular do chip, em <b>Aparelhos conectados</b>'])}
      <div class="hz-acoes">${linkSistema('#/whats', 'Abrir o escritório virtual dela')}<button type="button" class="btn" id="hz-conferir">Conferir números</button></div><div id="hz-res"></div>${statusPasso('whatsapp')}`,
    pronto: () => `<h2>${esc(S.im ? S.im.nome : 'A imobiliária')} está pronta</h2>
      <ul class="hz-final">${PASSOS.slice(1, -1).map((p) => `<li class="${feito(p.id) ? 'ok' : 'falta'}">${feito(p.id) ? '✓' : '○'} ${esc(p.titulo)}</li>`).join('')}</ul>
      ${S.im && S.im.link ? `<div class="hz-acoes"><a class="btn pri" href="${esc(S.im.link)}/entrar" target="_blank" rel="noopener">Abrir o sistema ↗</a><a class="btn" href="${esc(S.im.link)}/imoveis" target="_blank" rel="noopener">Ver o portal ↗</a></div>` : ''}
      <p class="muted pequeno">Entregue ao administrador o endereço e o e-mail de entrada. O que ficou pendente aparece no cartão da imobiliária; é só abrir o Herrera de novo.</p>`,
  };
  const slugPrevia = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.com.*$/, '').replace(/[^a-z0-9]+/g, '').slice(0, 30);

  // ---------- desenhar um passo ----------
  function desenha(id, { semFala = false } = {}) {
    S.passo = id;
    const i = PASSOS.findIndex((p) => p.id === id);
    $('#hz-trilha').innerHTML = trilha();
    $('#hz-corpo').innerHTML = `<div class="hz-cab"><span class="hz-etapa">Passo ${i} de ${PASSOS.length - 1}</span></div>${CONTEUDO[id]()}`;
    const ult = i === PASSOS.length - 1;
    $('#hz-rod').innerHTML = `${i > 0 ? '<button type="button" class="btn" id="hz-volta">← Voltar</button>' : ''}<span class="sp"></span>
      ${!ult && i > 3 && !feito(id) ? '<button type="button" class="btn" id="hz-pula">Pular por enquanto</button>' : ''}
      ${ult ? '<button type="button" class="btn pri" id="hz-fim">Concluir</button>' : id === 'publicar' && !S.im ? '' : `<button type="button" class="btn pri" id="hz-prox">${i === 0 ? 'Começar' : 'Próximo →'}</button>`}`;
    document.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => irPara(b.dataset.ir));
    liga(id);
    if (!semFala) falar(PASSOS[i].clip);
    const c = $('#hz-corpo'); c.classList.remove('entra'); void c.offsetWidth; c.classList.add('entra'); c.scrollTop = 0;
  }
  function guardaForm() { const f = $('#hz-f'); if (f && (S.passo === 'dados' || S.passo === 'administrador')) Object.assign(S.form, Object.fromEntries(new FormData(f).entries())); }
  function irPara(id) { guardaForm(); desenha(id); }
  const proximo = () => { const i = PASSOS.findIndex((p) => p.id === S.passo); irPara(PASSOS[Math.min(i + 1, PASSOS.length - 1)].id); };
  async function recarregaInfo() { if (S.im) { S.info = await api('GET', `/imobiliarias/${S.im.id}/assistente`); S.im = S.info.imobiliaria; } }
  async function marca(id, feitoSim = true, detalhe) { if (!S.im) return; await api('POST', `/imobiliarias/${S.im.id}/assistente/passo`, { passo: id, feito: feitoSim, detalhe }); await recarregaInfo(); }
  function resultado(r) {
    const el = $('#hz-res'); if (!el) return;
    el.innerHTML = r.ok ? `<p class="hz-ok">✓ ${esc(r.motivo || 'Tudo certo.')}</p>${r.testes ? `<p class="muted pequeno">3D realista: ${esc(r.testes.map_tiles)} · Fachadas: ${esc(r.testes.street_view)}</p>` : ''}`
      : `<p class="hz-erro">${esc(r.motivo || 'Não funcionou.')}</p>`;
    falar(r.ok ? '12-deu-certo' : '13-nao-deu');
  }

  function liga(id) {
    const vai = $('#hz-prox');
    if (vai) vai.onclick = async () => {
      if (id === 'dados') { const f = $('#hz-f'); if (!f.reportValidity()) return; guardaForm(); }
      if (id === 'administrador') { const f = $('#hz-f'); if (!f.reportValidity()) return; guardaForm(); }
      if (id === 'marca') { const t = $('#hz-f textarea').value.trim(); if (t) await marca('marca', true, t).catch(() => {}); }
      if (id === 'boas-vindas') { const sel = $('#hz-existente'); if (sel && sel.value) { await abrirExistente(+sel.value); return; } }
      proximo();
    };
    const volta = $('#hz-volta'); if (volta) volta.onclick = () => { const i = PASSOS.findIndex((p) => p.id === S.passo); irPara(PASSOS[Math.max(0, i - 1)].id); };
    const pula = $('#hz-pula'); if (pula) pula.onclick = proximo;
    const fim = $('#hz-fim'); if (fim) fim.onclick = async () => { await marca('pronto', true).catch(() => {}); fechar(); };
    const gera = $('#hz-gera'); if (gera) gera.onclick = () => { const a = new Uint32Array(4); crypto.getRandomValues(a); $('input[name=admin_senha]').value = 'Casa' + Array.from(a, (x) => x.toString(36)).join('').slice(0, 12) + '!'; };
    if (id === 'dados') { const sel = $('select[name=plano]'); const info = () => { $('#hz-plano-info').textContent = PLANO_INFO[sel.value] || ''; }; sel.onchange = info; info();
      $('input[name=nome]').addEventListener('input', (e) => { const n = document.querySelector('.hz-corpo .n'); if (n) n.textContent = (slugPrevia(e.target.value) || 'nome') + '.corretordofuturo.app'; }); }
    const criar = $('#hz-criar'); if (criar) criar.onclick = () => criarImobiliaria(criar);
    const conf = $('#hz-conferir'); if (conf) conf.onclick = async () => {
      conf.disabled = true;
      try { const r = await api('POST', `/imobiliarias/${S.im.id}/assistente/conferir/${id}`); await recarregaInfo(); if (id === 'publicar') desenha('publicar', { semFala: true }); else { resultado(r); $('#hz-trilha').innerHTML = trilha(); document.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => irPara(b.dataset.ir)); } if (r.ok && id === 'publicar') falar('12-deu-certo'); }
      catch (e) { aviso(e.message, true); } finally { conf.disabled = false; }
    };
    const teste = (id === 'gemini' || id === 'google-maps') && $('#hz-f');
    if (teste) teste.addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', teste); b.disabled = true; b.textContent = 'Testando…';
      try {
        const r = await api('POST', `/imobiliarias/${S.im.id}/assistente/${id === 'gemini' ? 'gemini' : 'maps'}`, { chave: teste.chave.value });
        if (r.ok && id === 'gemini') r.motivo = r.gravado ? `Chave válida e gravada no sistema da imobiliária (modelo ${r.modelo}).` : r.motivo;
        teste.chave.value = ''; await recarregaInfo(); resultado(r); $('#hz-trilha').innerHTML = trilha(); document.querySelectorAll('[data-ir]').forEach((x) => x.onclick = () => irPara(x.dataset.ir));
      } catch (er) { resultado({ ok: false, motivo: er.message }); } finally { b.disabled = false; b.textContent = 'Testar e gravar'; }
    });
    if (id === 'publicar' && S.im && !S.info.publicacao.ok) espiaPublicacao();
  }
  let espia = null;
  function espiaPublicacao() {
    clearTimeout(espia);
    let n = 0;
    const roda = async () => {
      if (!S || S.passo !== 'publicar' || !S.im) return;
      try { const r = await api('POST', `/imobiliarias/${S.im.id}/assistente/conferir/publicar`); if (r.ok) { await recarregaInfo(); desenha('publicar', { semFala: true }); falar('12-deu-certo'); return; } } catch {}
      if (++n < 24) espia = setTimeout(roda, 10000);
    };
    espia = setTimeout(roda, 8000);
  }
  async function criarImobiliaria(b) {
    b.disabled = true; b.textContent = 'Criando o banco e publicando…';
    try {
      const r = await api('POST', '/imobiliarias', S.form);
      await carregar();
      S.im = DADOS.imobiliarias.find((i) => i.id === r.id) || { id: r.id };
      await marca('dados', true); await marca('administrador', true, S.form.admin_email);
      if (r.aviso) aviso('Criada. A publicação automática falhou: ' + r.aviso, true);
      desenha('publicar', { semFala: true }); falar('12-deu-certo');
    } catch (e) { const er = $('#hz-erro'); er.textContent = e.message; er.hidden = false; b.disabled = false; b.textContent = 'Criar e publicar'; falar('13-nao-deu'); }
  }
  async function abrirExistente(id) {
    S.im = { id }; await recarregaInfo();
    const prox = PASSOS.find((p) => !['boas-vindas', 'dados', 'administrador'].includes(p.id) && !feito(p.id));
    desenha(prox ? prox.id : 'pronto');
  }

  // ---------- abrir / fechar ----------
  function fechar() {
    clearTimeout(espia);
    const v = $('#hz-video'); if (v) v.pause();
    if (S && S.dlg) S.dlg.close();
    S = null; carregar();
  }
  async function abrir(im) {
    let som = true; try { som = localStorage.getItem('herrera.som') !== '0'; } catch {}
    S = { im: null, info: { onboarding: {}, publicacao: {} }, passo: 'boas-vindas', form: { plano: 'profissional' }, legendas: true, som };
    const d = document.createElement('dialog'); d.className = 'hz-dlg';
    d.innerHTML = `<div class="hz"><header class="hz-topo"><div class="marca">Herrera HOUSE IA<span>Assistente · nova imobiliária</span></div><div class="sp"></div><button type="button" class="btn sm" id="hz-fechar">Fechar</button></header>
      <nav id="hz-trilha" aria-label="Passos"></nav>
      <div class="hz-grade">${palco()}<section class="hz-passo"><div class="hz-corpo" id="hz-corpo"></div><footer class="hz-rod" id="hz-rod"></footer></section></div></div>`;
    document.body.appendChild(d); S.dlg = d;
    d.addEventListener('close', () => { d.remove(); if (S) { S = null; carregar(); } });
    d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
    d.showModal();
    $('#hz-fechar').onclick = fechar;
    ligaPalco();
    await manifesto();
    if (im) { S.im = im; await recarregaInfo(); const prox = PASSOS.find((p) => !['boas-vindas', 'dados', 'administrador'].includes(p.id) && !feito(p.id)); desenha(prox ? prox.id : 'pronto'); }
    else desenha('boas-vindas');
  }
  window.Herrera = { abrir, progresso, NUCLEO };
})();
