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
