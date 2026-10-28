// Tema da imobiliária (cliente desta instalação): CSS e logo extras no portal, no blog e nas telas.
const cfg = require('./config');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** <link>s do tema para o <head> (vazio sem tema) */
function head() {
  if (!cfg.TEMA) return '';
  return `<link rel="stylesheet" href="/temas/${cfg.TEMA}/tema.css">${cfg.ICONE_URL ? `<link rel="icon" href="${esc(cfg.ICONE_URL)}" type="image/svg+xml">` : ''}`;
}
/** logo no lugar do nome escrito (ou o nome, sem logo) */
const logo = (alt, classe = 'marca-logo') => (cfg.LOGO_URL ? `<img class="${classe}" src="${esc(cfg.LOGO_URL)}" alt="${esc(alt)}">` : '');
module.exports = { head, logo };
