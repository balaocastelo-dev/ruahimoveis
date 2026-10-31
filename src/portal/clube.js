// Clube Signature · o acesso aos valores dos imóveis da seleção Signature do cliente ("<cliente> Signature").
//
// O visitante pede para entrar (nome, telefone, e-mail opcional e o aceite):
// vira lead QUENTE no CRM com origem "<cliente> Signature" e o aparelho dele recebe
// um cookie assinado (HMAC com a SECRET_KEY) que libera os valores por 180 dias.
// O cookie só guarda o número do lead e a validade; nada pessoal.
// As páginas que leem o cookie nunca ficam no cache da Vercel (private, no-store).

const crypto = require('crypto');
const { SECRET_KEY } = require('../config');

const NOME = 'hh_signature';
// ruah_signature: cookies já liberados antes da troca de nome. Ler os dois; gravar só o novo.
const DIAS = 180;
const SEGURO = process.env.VERCEL ? '; Secure' : '';

const chave = () => crypto.createHash('sha256').update(`clube-signature:${SECRET_KEY || ''}`).digest();
const assinar = (texto) => crypto.createHmac('sha256', chave()).update(texto).digest('base64url').slice(0, 32);

function cookieDe(leadId) {
  const vence = Date.now() + DIAS * 864e5;
  const valor = `${Number(leadId)}.${vence}`;
  return `${NOME}=${valor}.${assinar(valor)}; Path=/; Max-Age=${DIAS * 86400}; HttpOnly; SameSite=Lax${SEGURO}`;
}

/** O número do lead se o aparelho é de um membro com acesso válido; senão null. */
function membro(req) {
  const c = String((req.headers && req.headers.cookie) || '');
  for (const nome of [NOME, 'ruah_signature']) {
    const m = new RegExp(`(?:^|;\\s*)${nome}=(\\d{1,12})\\.(\\d{13})\\.([A-Za-z0-9_-]{32})`).exec(c);
    if (!m) continue;
    const valor = `${m[1]}.${m[2]}`;
    const esperado = Buffer.from(assinar(valor));
    const recebido = Buffer.from(m[3]);
    if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
    if (Number(m[2]) < Date.now()) return null;
    return Number(m[1]);
  }
  return null;
}

const sair = () => `${NOME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${SEGURO}`;

module.exports = { cookieDe, membro, sair, NOME };
