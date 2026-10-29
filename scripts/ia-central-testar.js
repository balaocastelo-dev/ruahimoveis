// Confere o cérebro central da plataforma de ponta a ponta (29/10/2026).
// Lê a chave central do cofre (plataforma.config 'ia_central'), faz UMA chamada de verdade ao Gemini com ela
// e mostra o consumo registrado por imobiliária. Roda no PC, onde estão as senhas do banco (.env).
// A chave nunca é impressa: só os 4 últimos dígitos.
//
//   node scripts/ia-central-testar.js
const path = require('path');
const raiz = path.resolve(__dirname, '..');
process.chdir(raiz);
require(path.join(raiz, 'src/config'));
const central = require(path.join(raiz, 'src/plataforma/central'));

const fim = (k) => '…' + String(k || '').slice(-4);

(async () => {
  const c = await central.carregar();
  const e = central.estado();
  console.log('cofre central  :', e.tem_chave ? `chave ${fim(c.chave)}` : 'SEM CHAVE', '| modelo:', e.modelo || '(padrão)',
    '| estação:', e.tem_estacao ? 'chave central ok' : 'sem chave', e.erro ? `| erro: ${e.erro}` : '');
  if (!e.tem_chave) process.exit(1);

  const modelo = e.modelo || 'gemini-flash-latest';
  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.chave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Você é um teste de conexão. Responda só com JSON.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Devolva {"ok":true,"frase":"uma frase curta dizendo que o cérebro central está no ar"}' }] }],
      // sem "pensar" e com folga de saída: os modelos novos gastam o limite pensando e devolvem vazio
      generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json().catch(() => ({}));
  const texto = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const u = j.usageMetadata || {};
  console.log(`chamada Gemini : ${r.ok ? 'OK' : 'FALHOU ' + r.status} em ${Date.now() - t0} ms`,
    r.ok ? `| tokens ${u.promptTokenCount || 0}+${u.candidatesTokenCount || 0}` : `| ${(j.error && j.error.message || '').slice(0, 160)}`);
  if (r.ok) console.log('resposta       :', texto.replace(/\s+/g, ' ').slice(0, 160));

  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 1 });
    try {
      const { rows } = await pool.query('SELECT imobiliaria, dia, modelo, chamadas, tokens_entrada, tokens_saida, erros FROM ia_uso ORDER BY atualizado_em DESC LIMIT 10');
      console.log('\nconsumo do cérebro central (plataforma.ia_uso):');
      if (!rows.length) console.log('  ainda nada — nenhuma imobiliária acionou os robôs depois que a chave central entrou.');
      for (const x of rows) console.log(`  ${x.dia} ${String(x.imobiliaria).padEnd(10)} ${x.modelo} · ${x.chamadas} chamada(s), ${x.tokens_entrada}+${x.tokens_saida} tokens, ${x.erros} erro(s)`);
    } finally { await pool.end().catch(() => {}); }
  }
  process.exit(r.ok ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(3); });
