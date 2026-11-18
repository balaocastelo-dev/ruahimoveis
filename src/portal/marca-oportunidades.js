// Identidade e aviso do tenant Oportunidades Caixa. Só aparece quando
// TEMA=oportunidades. As outras imobiliárias não herdam este texto.
const cfg = require('../config');

const AVISO = 'Oportunidades Caixa é uma assessoria imobiliária independente e não é a Caixa Econômica Federal nem tem vínculo com ela. Os imóveis são da Caixa e as informações vêm da lista pública do site venda-imoveis.caixa.gov.br; confirme condições e valores no edital oficial.';
const SELO = 'Imóvel da Caixa';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function eh() { return cfg.TEMA === 'oportunidades'; }

function avisoRodape() {
  if (!eh()) return '';
  return `<p class="oc-aviso" role="note">${esc(AVISO)}</p>`;
}

function avisoImovel() {
  if (!eh()) return '';
  return `<aside class="oc-aviso oc-aviso-imovel" role="note"><p>${esc(AVISO)}</p></aside>`;
}

function selo(origem) {
  if (!eh() || origem !== 'caixa') return '';
  return `<p class="oc-selo-caixa">${esc(SELO)}</p>`;
}

function imagemPadrao() {
  if (!eh()) return null;
  return { imagem: '/temas/oportunidades/og.png', imagemLargura: 1200, imagemAltura: 630, imagemTipo: 'image/png' };
}

module.exports = { AVISO, SELO, eh, avisoRodape, avisoImovel, selo, imagemPadrao };
