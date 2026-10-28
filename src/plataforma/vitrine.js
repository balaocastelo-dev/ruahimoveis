// Domínio da plataforma (corretordofuturo.app): é a vitrine do produto Herrera HOUSE IA,
// nunca o sistema nem o portal de um cliente. Enquanto a página de vendas não fica pronta,
// qualquer endereço nesse domínio mostra "em breve" (e nada da RUAH ou de outro cliente).
const cfg = require('../config');

const HOSTS = new Set(String(process.env.PLATAFORMA_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina() {
  const nome = esc(cfg.SISTEMA_NOME);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome} · em breve</title><meta name="description" content="${nome}: sistema imobiliário com inteligência artificial para corretores e imobiliárias.">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400;500&display=swap">
<style>
:root{--bg:#f6f3ee;--ink:#1f2228;--muted:#6b6f78;--gold:#a8823c}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--ink:#eceae5;--muted:#a3a6ad;--gold:#c9a25a}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;display:grid;place-items:center;padding:24px}
main{max-width:560px;text-align:center}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(40px,9vw,64px);line-height:1.05;margin:0 0 12px;color:var(--gold);letter-spacing:.01em}
p{font-size:18px;line-height:1.55;margin:0 0 10px;color:var(--muted)}
.tag{display:inline-block;margin-top:18px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);border-top:1px solid var(--gold);padding-top:14px}
</style></head><body><main>
<h1>${nome}</h1>
<p>O sistema imobiliário com inteligência artificial para corretores e imobiliárias.</p>
<p>Captação, carteira, atendimento por robôs, portal e blog próprios, num só lugar.</p>
<span class="tag">Em breve</span>
</main></body></html>`;
}

function vitrine(req, res, next) {
  if (!HOSTS.has(String(req.hostname || '').toLowerCase())) return next();
  if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ erro: 'Não encontrado.' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(req.path === '/' ? 200 : 404).type('html').send(pagina());
}

module.exports = { vitrine, HOSTS };
