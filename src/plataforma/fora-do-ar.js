// Imobiliária tirada do ar por completo (FORA_DO_AR=1 nas variáveis do projeto na Vercel).
// Diferente da suspensão (que mostra "<nome> está temporariamente fora do ar"), aqui nada da
// imobiliária aparece: nem nome, nem portal, nem sistema, nem arquivos. Só o domínio da plataforma
// (corretordofuturo.app: página do produto e /gestor) continua respondendo neste projeto.
// Para voltar: apagar FORA_DO_AR (ou pôr 0) e publicar de novo.
const { HOSTS: PLATAFORMA } = require('./vitrine');

const GESTOR = new Set(String(process.env.GESTOR_HOSTS || 'corretordofuturo.app,www.corretordofuturo.app,localhost,127.0.0.1')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

const ligado = () => /^(1|sim|true)$/i.test(String(process.env.FORA_DO_AR || '').trim());

module.exports = function foraDoAr(req, res, next) {
  if (!ligado()) return next();
  const host = String(req.hostname || '').toLowerCase();
  if (PLATAFORMA.has(host) || GESTOR.has(host)) return next();
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  return res.status(404).type('text/plain').send('Não encontrado.');
};
module.exports.ligado = ligado;
