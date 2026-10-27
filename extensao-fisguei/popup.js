const $ = (id) => document.getElementById(id);
const msg = (t, cls) => { $('msg').textContent = t; $('msg').className = cls || ''; };
(async () => {
  const c = await chrome.storage.local.get(['url', 'chave']);
  $('url').value = c.url || 'https://ruahimoveis.vercel.app';
  $('chave').value = c.chave || '';
  chrome.runtime.sendMessage({ tipo: 'estado' }, (st) => { if (st) $('cont').textContent = `Hoje: ${st.anuncios} anúncio(s) e ${st.pessoas} pessoa(s) enviados${st.fila ? ` · ${st.fila} esperando` : ''}.`; });
})();
$('salvar').addEventListener('click', async () => {
  let url = $('url').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  const chave = $('chave').value.trim();
  if (!chave) return msg('Cole a chave gerada na tela Fisguei do sistema.', 'erro');
  try {
    const origem = new URL(url).origin + '/*';
    const tem = await chrome.permissions.contains({ origins: [origem] });
    if (!tem && !(await chrome.permissions.request({ origins: [origem] }))) return msg('Sem permissão para falar com esse endereço.', 'erro');
  } catch { return msg('Endereço inválido.', 'erro'); }
  await chrome.storage.local.set({ url, chave });
  msg('Testando…');
  chrome.runtime.sendMessage({ tipo: 'testar' }, (r) => {
    if (r && r.ok) msg('Tudo certo! Abra o painel do Fisgar e use normalmente.', 'ok');
    else msg((r && r.erro) || 'Não consegui testar.', 'erro');
  });
});

// ---------- puxar a lista filtrada ----------
async function abaFisgar() {
  const abas = await chrome.tabs.query({ url: 'https://painel.fisgar.com.br/*' });
  return abas.find((t) => t.active) || abas[0] || null;
}
async function atualizaPux() {
  const aba = await abaFisgar();
  if (!aba) { $('pux').textContent = 'Abra o painel do Fisgar numa aba.'; return; }
  try {
    const p = await chrome.tabs.sendMessage(aba.id, { tipo: 'puxada' });
    $('parar').hidden = !(p && p.andando);
    $('puxar').hidden = !!(p && p.andando);
    $('pux').textContent = !p ? '' : p.andando ? `Puxando… página ${p.paginas}, ${p.anuncios} anúncios.` : p.ok ? `Pronto: ${p.paginas} páginas, ${p.anuncios} anúncios enviados.` : (p.erro || '');
  } catch { $('pux').textContent = 'Recarregue a aba do Fisgar (F5).'; }
}
$('puxar').addEventListener('click', async () => {
  const aba = await abaFisgar();
  if (!aba) return ($('pux').textContent = 'Abra o painel do Fisgar numa aba.');
  try { await chrome.tabs.sendMessage(aba.id, { tipo: 'puxar', max: 400 }); } catch { return ($('pux').textContent = 'Recarregue a aba do Fisgar (F5).'); }
  atualizaPux();
});
$('parar').addEventListener('click', async () => { const aba = await abaFisgar(); if (aba) await chrome.tabs.sendMessage(aba.id, { tipo: 'parar-puxar' }); atualizaPux(); });
atualizaPux(); setInterval(atualizaPux, 1500);
