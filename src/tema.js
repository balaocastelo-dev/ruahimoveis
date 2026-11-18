// Tema da imobiliária (cliente desta instalação): CSS e logo extras no portal, no blog e nas telas.
const cfg = require('./config');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** <link>s do tema para o <head> (vazio sem tema) */
function head() {
  if (!cfg.TEMA) return '';
  const ico = require('fs').existsSync(require('path').join(__dirname, '..', 'public', 'temas', cfg.TEMA, 'favicon.ico'))
    ? `<link rel="icon" href="/temas/${cfg.TEMA}/favicon.ico?v=2" sizes="any">` : '';
  return `<link rel="stylesheet" href="/temas/${cfg.TEMA}/tema.css">${ico}${cfg.ICONE_URL ? `<link rel="icon" href="${esc(cfg.ICONE_URL)}?v=2" type="image/svg+xml">` : ''}`;
}
/** logo no lugar do nome escrito (ou o nome, sem logo) */
const logo = (alt, classe = 'marca-logo') => (cfg.LOGO_URL ? `<img class="${classe}" src="${esc(cfg.LOGO_URL)}" alt="${esc(alt)}">` : '');
module.exports = { head, logo };
