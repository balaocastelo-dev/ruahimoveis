// Privacidade e LGPD dentro do sistema (28/10/2026).
//  - lgpdConfere(): na entrada, cada usuário aceita a versão atual dos Termos de uso e da Política de privacidade.
//  - telaPrivacidade(): #/privacidade — pedidos dos titulares (prazo de 15 dias), lista "não contatar" e as regras de uso dos dados.

async function lgpdConfere() {
  let a; try { a = await api('GET', '/api/lgpd/aceite'); } catch { return; }
  lgpdBadge();
  if (a.aceito || document.getElementById('lgpd-aceite')) return;
  const d = document.createElement('div');
  d.id = 'lgpd-aceite'; d.className = 'lgpd-veu';
  d.innerHTML = `<div class="lgpd-caixa" role="dialog" aria-modal="true" aria-labelledby="lgpd-t">
    <h2 id="lgpd-t">Termos de uso e privacidade</h2><div class="eyebrow depois">Antes de continuar</div>
    <p>O ${esc(MARCA.sistema)} é um software independente, sem vínculo com portais de anúncios ou bases de dados de terceiros. Os dados de proprietários e clientes que você vê aqui são da imobiliária, que responde pelo uso deles (LGPD).</p>
    <ul class="lgpd-regras">
      <li>Use nome e telefone de proprietário só para falar do imóvel daquela pessoa. Nada de repassar, vender ou fazer lista de transmissão.</li>
      <li>Quem pedir para parar sai da lista na hora, e o pedido vale para toda a plataforma.</li>
      <li>Anuncie só com autorização escrita do proprietário e com o CRECI no anúncio.</li>
      <li>Fotos de anúncios de outras empresas são só para consulta interna: nunca vão para o portal, redes ou clientes.</li>
      <li>Pedidos de titulares (ver, corrigir, apagar dados) são respondidos em até 15 dias, na tela Privacidade e LGPD.</li>
    </ul>
    <p class="small">Leia na íntegra: <a href="${esc(a.termos)}" target="_blank" rel="noopener">Termos de uso</a> · <a href="${esc(a.privacidade)}" target="_blank" rel="noopener">Política de privacidade</a> (versão de ${esc(a.versao.split('-').reverse().join('/'))}).</p>
    <label class="chk"><input type="checkbox" id="lgpd-ok"> Li e aceito os Termos de uso e a Política de privacidade.</label>
    <div class="row"><button class="btn" type="button" id="lgpd-sair">Sair</button><span class="sp"></span><button class="btn pri" type="button" id="lgpd-btn" disabled>Aceitar e continuar</button></div>
  </div>`;
  document.body.appendChild(d);
  const ok = d.querySelector('#lgpd-ok'), b = d.querySelector('#lgpd-btn');
  ok.addEventListener('change', () => { b.disabled = !ok.checked; });
  d.querySelector('#lgpd-sair').addEventListener('click', () => { d.remove(); ACT.sair(); });
  b.addEventListener('click', () => comBotao(b, async () => { await api('POST', '/api/lgpd/aceite', { aceito: true }); d.remove(); toast('Obrigado. Aceite registrado.'); }));
  ok.focus();
}

function lgpdBadge() {
  api('GET', '/api/lgpd/resumo').then((x) => {
    const b = document.getElementById('badge-lgpd'); if (!b) return;
    b.textContent = x.vencendo ? '!' : x.abertos; b.hidden = !x.abertos;
    b.title = x.vencendo ? 'Pedido de titular perto do prazo de 15 dias' : 'Pedidos de titulares esperando resposta';
    if (typeof topoAtualiza === 'function') topoAtualiza();
  }).catch(() => {});
}

async function telaPrivacidade() {
  if (!veTudo()) {
    $('#main').innerHTML = `<h1>Privacidade e LGPD</h1>
    <p class="lead">Os pedidos de titulares ficam com o administrativo e o gestor. Leia os <a href="/termos" target="_blank" rel="noopener">Termos</a> e a <a href="/privacidade" target="_blank" rel="noopener">Política de privacidade</a> do portal.</p>`;
    return;
  }
  const d = await api('GET', '/api/lgpd/pedidos');
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const abertos = d.pedidos.filter((p) => p.situacao === 'aberto');
  const prazoPill = (p) => {
    if (p.situacao !== 'aberto') return `<span class="pill ok">respondido ${esc(dataBR(p.atendido_em || ''))}</span>`;
    const dias = Math.round((new Date(p.prazo + 'T12:00') - new Date(hoje + 'T12:00')) / 864e5);
    return `<span class="pill ${dias < 0 ? 'bad' : dias <= 3 ? 'warn' : 'info'}">${dias < 0 ? `atrasado ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`}</span>`;
  };
  const falta = [!d.cliente.cnpj && 'CNPJ (CLIENTE_CNPJ)', !d.cliente.creci && 'CRECI (CLIENTE_CRECI)', !d.cliente.email && 'e-mail de privacidade (CLIENTE_EMAIL_PRIVACIDADE)'].filter(Boolean);
  $('#main').innerHTML = `<h1>Privacidade e LGPD</h1>
  <p class="lead">A ${esc(d.cliente.empresa)} é a controladora dos dados tratados aqui; o ${esc(MARCA.sistema)} é o operador. Os pedidos feitos em <a href="/privacidade" target="_blank" rel="noopener">/privacidade</a> do portal chegam nesta tela e precisam de resposta em até 15 dias (LGPD, art. 19).</p>
  ${falta.length ? `<div class="card" style="border-color:var(--gold);margin-bottom:16px"><b>Falta completar na página de privacidade do portal:</b> ${falta.map(esc).join(', ')}. Peça ao suporte para preencher.</div>` : ''}
  <div class="row" style="flex-wrap:wrap;margin-bottom:16px"><span class="pill ${abertos.length ? 'warn' : 'ok'}">${abertos.length} aberto(s)</span><span class="pill info">${d.pedidos.length - abertos.length} respondido(s)</span><span class="sp"></span>
    <a class="btn" href="/privacidade" target="_blank" rel="noopener">Ver a página do portal</a><button class="btn" data-act="lgpd-bloquear">Incluir número em "não contatar"</button></div>
  ${d.pedidos.length ? `<div class="grid" style="gap:12px">${d.pedidos.map((p) => `<div class="card">
    <div class="row" style="flex-wrap:wrap;gap:8px"><b class="mono">${esc(p.protocolo)}</b><span class="pill">${esc(d.tipos[p.tipo] || p.tipo)}</span>${prazoPill(p)}<span class="sp"></span><span class="muted small">${esc(dataBR(p.criado_em))}</span></div>
    <p style="margin:10px 0 4px"><b>${esc(p.nome || '')}</b>${p.telefone ? ` · ${esc(p.telefone)}` : ''}${p.email ? ` · ${esc(p.email)}` : ''}</p>
    ${p.mensagem ? `<p class="small" style="white-space:pre-wrap;margin:4px 0">${esc(p.mensagem)}</p>` : ''}
    ${['oposicao', 'eliminar'].includes(p.tipo) ? '<p class="small muted" style="margin:4px 0">O telefone já entrou na lista "não contatar" desta imobiliária e da plataforma.</p>' : ''}
    ${p.situacao === 'aberto' ? `<div class="row"><span class="sp"></span><button class="btn pri sm" data-act="lgpd-atender" data-id="${p.id}" data-prot="${esc(p.protocolo)}">Registrar resposta</button></div>` : `<p class="small" style="margin:6px 0 0"><b>Resposta:</b> ${esc(p.resposta || '')}</p>`}
  </div>`).join('')}</div>` : '<div class="empty">Nenhum pedido de titular até agora.</div>'}
  <div class="card" style="margin-top:22px"><h3 style="margin-top:0">Como responder</h3>
    <ul class="small" style="line-height:1.7;margin:0;padding-left:20px">
      <li><b>Ver ou confirmar dados:</b> procure o telefone e o nome no CRM, na Carteira e em Robôs e consultas; mande ao titular o que existe e de onde veio.</li>
      <li><b>Corrigir:</b> corrija na ficha e responda dizendo o que mudou.</li>
      <li><b>Apagar:</b> apague o lead/proprietário que não tenha contrato em andamento; dados com obrigação legal (contrato, autorização assinada) ficam guardados e você explica o motivo.</li>
      <li><b>Não ser contatado:</b> já está bloqueado; responda confirmando.</li>
      <li>Responda pelo e-mail ou telefone informado e registre aqui o que foi feito: isso é a sua prova.</li>
    </ul></div>`;
}
ACT['lgpd-atender'] = (el) => modal(`<h2>Responder ${esc(el.dataset.prot)}</h2>
  <form data-form="lgpd-atender" data-id="${esc(el.dataset.id)}" class="grid" style="gap:12px">
  <label class="f">O que foi feito e o que foi respondido ao titular<textarea name="resposta" rows="5" required placeholder="Ex.: confirmamos por e-mail em 30/10 que os dados foram apagados do CRM; o telefone segue na lista não contatar."></textarea></label>
  <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Registrar</button></div></form>`);
FORM['lgpd-atender'] = async (f) => { await api('POST', `/api/lgpd/pedidos/${f.dataset.id}/atender`, formJSON(f)); fechaModal(); toast('Resposta registrada'); lgpdBadge(); rota(); };
ACT['lgpd-bloquear'] = () => modal(`<h2>Incluir em "não contatar"</h2>
  <p class="small muted">Use quando alguém pedir por telefone, e-mail ou pessoalmente para não receber mais mensagens. O número fica bloqueado nesta imobiliária e em toda a plataforma.</p>
  <form data-form="lgpd-bloquear" class="grid" style="gap:12px"><label class="f">Telefone com DDD<input name="telefone" required inputmode="tel"></label>
  <label class="f">Motivo (opcional)<input name="motivo" maxlength="200" placeholder="Pediu por telefone em 30/10"></label>
  <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Cancelar</button><button class="btn pri" type="submit">Bloquear</button></div></form>`);
FORM['lgpd-bloquear'] = async (f) => { await api('POST', '/api/lgpd/nao-contatar', formJSON(f)); fechaModal(); toast('Número incluído em "não contatar"'); };
