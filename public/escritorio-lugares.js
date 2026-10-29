// O painel embutido original do 3D, compartilhado com o 2D sem carregar three.js.
export const LUGAR_TELA = {
  mural: { rota: '#/radar', titulo: 'mural', nome: 'Mural de oportunidades', icone: '📌', cam: [-10.3, -6.7] },
  tv: { rota: '#/painel', titulo: 'painel', nome: 'TV da diretoria', icone: '📺', cam: [10.3, -6.7] },
  placa: { rota: '#/leads', titulo: 'crm', nome: 'CRM e funil', icone: '📈', cam: [0, -6.7] },
  recepcao: { rota: '#/visitas', titulo: 'recepcao', nome: 'Recepção', icone: '🔔', cam: [-2.2, 5.4] },
  impressora: { rota: '#/imoveis?autorizacoes=1', titulo: 'impressora', nome: 'Impressora · autorizações', icone: '🖨️', cam: [-11.3, 2.4] },
  sofa: { rota: '#/leads?aguardando=1', titulo: 'sofa', nome: 'Sofá · aguardando resposta', icone: '🛋️', cam: [3.2, 6.2] },
  cafe: { rota: '#/avisos', titulo: 'cafe', nome: 'Café · avisos da equipe', icone: '☕', cam: [-4.6, 6.6] },
  reuniao: { rota: '#/chat', titulo: 'reuniao', nome: 'Mesa de reunião', icone: '💬', cam: [8.7, 5.2], aviso: 'salaEmBreve' },
};
const PADRAO = { abrir: 'Abrir tela inteira', fechar: 'Fechar', salaEmBreve: 'Sala de reunião ao vivo em breve' };
let PAINEL_ESC = null, focoAnterior = null;
export function painelLugar(l, t = (k) => PADRAO[k] || Object.values(LUGAR_TELA).find((v) => v.titulo === k)?.nome || k) {
  fechaPainelLugar();
  focoAnterior = document.activeElement;
  const el = document.createElement('div'); el.id = 'j3-painel'; el.className = 'j3p-fundo';
  el.innerHTML = `<div class="j3p-quadro" role="dialog" aria-modal="true" aria-label="${esc(t(l.titulo))}">
    <header class="j3p-topo"><span class="j3p-i" aria-hidden="true">${esc(l.icone)}</span><b>${esc(t(l.titulo))}</b><span class="sp"></span>
      <button class="j3p-bt" data-act="j3-lugar-abre" data-r="${esc(l.rota)}" title="${esc(t('abrir'))}">↗</button>
      <button class="j3p-bt" data-act="j3-lugar-fecha" title="${esc(t('fechar'))}">✕</button></header>
    ${l.aviso ? `<p class="j3p-aviso" role="status">${esc(t(l.aviso))}</p>` : ''}
    <div class="j3p-corpo"><iframe src="/app.html?embutido=1${esc(l.rota)}" title="${esc(t(l.titulo))}" loading="eager"></iframe></div></div>`;
  (document.fullscreenElement || document.body).appendChild(el);
  el.addEventListener('pointerdown', (ev) => { if (ev.target === el) fechaPainelLugar(); });
  PAINEL_ESC = (ev) => { if (ev.key === 'Escape') { ev.stopImmediatePropagation(); fechaPainelLugar(); } };
  document.addEventListener('keydown', PAINEL_ESC, true);
  // O foco pode estar no iframe: ESC continua fechando o mesmo painel.
  el.querySelector('iframe').addEventListener('load', (ev) => {
    try { ev.target.contentDocument.addEventListener('keydown', PAINEL_ESC, true); } catch {}
  });
  el.querySelector('[data-act="j3-lugar-fecha"]').focus();
}
export function fechaPainelLugar() {
  const el = $('#j3-painel'); if (el) el.remove();
  if (PAINEL_ESC) { document.removeEventListener('keydown', PAINEL_ESC, true); PAINEL_ESC = null; }
  if (focoAnterior?.isConnected) focoAnterior.focus(); focoAnterior = null;
}
window.jg3dFechaLugar = fechaPainelLugar;
ACT['j3-lugar-fecha'] = () => fechaPainelLugar();
ACT['j3-lugar-abre'] = (el) => { const r = el.dataset.r; fechaPainelLugar(); location.hash = r.replace(/^#/, ''); };
window.addEventListener('hashchange', fechaPainelLugar);
