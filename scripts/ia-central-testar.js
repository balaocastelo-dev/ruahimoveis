// Confere o cérebro central da plataforma de ponta a ponta (29/10/2026).
// Mostra o que tem no cofre (Claude e Gemini), faz UMA pergunta de verdade pelo caminho real do sistema
// (IA.perguntar) e lista o consumo por imobiliária. Roda no PC, onde estão as senhas do banco (.env).
// As chaves nunca são impressas: só os 4 últimos dígitos.
//
//   node scripts/ia-central-testar.js
const path = require('path');
const raiz = path.resolve(__dirname, '..');
process.chdir(raiz);
require(path.join(raiz, 'src/config'));
const central = require(path.join(raiz, 'src/plataforma/central'));
const IA = require(path.join(raiz, 'src/agentes/ia'));

const fim = (k) => (k ? '…' + String(k).slice(-4) : 'nenhuma');

(async () => {
  await central.carregar();
  const e = central.estado();
  console.log('cofre central');
  console.log('  Claude   :', fim(central.anthropic()), '| modelo:', central.anthropicModelo() || '(padrão)');
  console.log('  Gemini   :', fim(central.chave()), '| modelo:', e.modelo || '(padrão)');
  console.log('  estação  :', e.tem_estacao ? 'chave ok' : 'sem chave', '| preferido:', e.preferido || '(Claude primeiro)');
  console.log('  leitura  :', e.erro ? 'ERRO: ' + e.erro : 'ok', '| imobiliária:', central.euSync());

  const a = IA.ajustes();
  console.log('\nquem atende aqui:', a.provedor, '| modelo:', a.modelo, '| chave', fim(a.chave_final ? 'xxxx' + a.chave_final : ''));
  if (a.provedor === 'ollama') { console.log('Sem chave nenhuma: nada a testar na nuvem.'); process.exit(1); }

  const t0 = Date.now();
  let ok = false;
  try {
    const t = await IA.perguntar('Você é um teste de conexão do escritório.',
      'Devolva {"ok":true,"frase":"uma frase curta em português dizendo que o cérebro central está no ar"}', { timeout: 40000 });
    let frase = ''; try { frase = JSON.parse(t).frase || ''; } catch { frase = String(t).slice(0, 160); }
    console.log(`resposta (${Date.now() - t0} ms):`, frase);
    ok = true;
  } catch (x) { console.log('FALHOU:', x.message); }

  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 1 });
    try {
      const { rows } = await pool.query('SELECT imobiliaria, dia, modelo, chamadas, tokens_entrada, tokens_saida, erros FROM ia_uso ORDER BY atualizado_em DESC LIMIT 10');
      console.log('\nconsumo do cérebro central (plataforma.ia_uso):');
      if (!rows.length) console.log('  ainda nada.');
      for (const x of rows) console.log(`  ${x.dia} ${String(x.imobiliaria).padEnd(10)} ${String(x.modelo).padEnd(20)} ${x.chamadas} chamada(s), ${x.tokens_entrada}+${x.tokens_saida} tokens, ${x.erros} erro(s)`);
    } finally { await pool.end().catch(() => {}); }
  }
  process.exit(ok ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(3); });
