// Rotas reais do gestor, com PostgreSQL e Gemini simulados: nunca usa chaves ou bancos reais.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const CHAVE = 'AIza_CHAVE_FICTICIA_TESTE_1234567890';
const NOVA = 'AIza_OUTRA_CHAVE_FICTICIA_9876543210';
const TOKEN = 'sessao-ficticia-do-gestor';

async function criarServidor() {
  process.env.SECRET_KEY = 'segredo-local-de-teste'.repeat(3);
  process.env.PLATAFORMA_DATABASE_URL = 'postgres://teste:teste@127.0.0.1/teste';
  process.env.GESTOR_HOSTS = '127.0.0.1,localhost';
  const estado = { chave: CHAVE, modelo: 'gemini-flash-latest', em: null, consultas: [], gravacoes: [], medicoes: [], pedidos: [], erroBanco: false, erroGoogle: 0, semTexto: false, falhaRede: false };
  const dias = Array.from({ length: 30 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, '0')}`, chamadas: String(i), tokens_entrada: String(i * 10), tokens_saida: String(i * 2), erros: '0' }));
  const linhas = [
    { slug: 'casaprado', nome: 'Casa Prado', chamadas: '12', tokens_entrada: '9000000000', tokens_saida: '70', erros: '2' },
    { slug: 'ondemorar', nome: 'Onde <morar>?', chamadas: '3', tokens_entrada: '70', tokens_saida: '40', erros: '1' },
    { slug: 'lumen', nome: 'Lumen', chamadas: '0', tokens_entrada: '0', tokens_saida: '0', erros: '0' },
  ];
  class PoolFalso {
    on() {}
    async query(sql, p = []) {
      estado.consultas.push({ sql, p });
      if (sql.includes('FROM sessoes s JOIN gestores')) return { rows: p[0] === crypto.createHash('sha256').update(TOKEN).digest('hex') ? [{ id: 7, nome: 'Gestor de teste' }] : [] };
      if (estado.erroBanco) throw new Error('Erro privado do banco contendo ' + estado.chave);
      if (sql.includes('AS chave_final')) return { rows: [{ chave_final: estado.chave?.slice(-4) || null, modelo: estado.modelo, alterada_em: estado.em }] };
      if (sql.includes('definir_ia_central(')) {
        assert.ok(!/(?:INSERT INTO|UPDATE|DELETE FROM) plataforma\.config/.test(sql));
        assert.match(sql, /INSERT INTO plataforma\.eventos/);
        estado.gravacoes.push(p);
        if (!p[2]) { estado.chave = p[0]; estado.em = '2026-10-30 14:35:00'; }
        if (p[1]) estado.modelo = p[1];
        return { rows: [{ resultado_privado: estado.chave }] }; // Mesmo um retorno indevido não pode ser repassado.
      }
      if (sql.includes('SELECT chave, valor FROM plataforma.config')) return { rows: [{ chave: 'ia_central', valor: estado.chave }, { chave: 'ia_central_modelo', valor: estado.modelo }] };
      if (sql.includes('FULL JOIN uso')) {
        assert.match(sql, /plataforma\.ia_uso/);
        assert.match(sql, /America\/Sao_Paulo/);
        assert.match(sql, /dia >= inicio AND dia < fim/);
        assert.match(sql, /GROUP BY imobiliaria/);
        assert.match(sql, /ORDER BY \(coalesce\(u.tokens_entrada, 0\) \+ coalesce\(u.tokens_saida, 0\)\) DESC/);
        return { rows: structuredClone(p[0] === 'hoje' ? linhas.map((r) => ({ ...r, chamadas: '0', tokens_entrada: '0', tokens_saida: '0', erros: '0' })) : linhas) };
      }
      if (sql.includes('generate_series')) {
        assert.match(sql, /hoje - 29, hoje/);
        assert.match(sql, /LEFT JOIN plataforma\.ia_uso/);
        return { rows: structuredClone(dias) };
      }
      if (sql.includes('INSERT INTO plataforma.ia_uso')) { estado.medicoes.push(p); return { rows: [] }; }
      throw new Error('Consulta inesperada no teste');
    }
  }
  const pg = require('pg'), PoolOriginal = pg.Pool; pg.Pool = PoolFalso;
  const google = express(); google.use(express.json());
  google.use((req, res) => {
    estado.pedidos.push({ url: req.url, chave: req.get('x-goog-api-key'), corpo: req.body });
    if (estado.falhaRede) return req.socket.destroy();
    if (estado.erroGoogle) return res.status(estado.erroGoogle).json({ error: { message: 'Segredo refletido: ' + estado.chave } });
    if (req.path === '/models') {
      return res.json(req.query.pageToken ? { models: [{ name: 'models/gemini-pro-teste', displayName: 'Teste ' + estado.chave, supportedGenerationMethods: ['generateContent'] }] } : {
        models: [
          { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-audio', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] },
        ], nextPageToken: 'pagina-2',
      });
    }
    res.json({ candidates: estado.semTexto ? [] : [{ content: { parts: [{ text: 'OK ' + estado.chave }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 } });
  });
  const gsrv = await new Promise((resolve) => { const s = google.listen(0, '127.0.0.1', () => resolve(s)); });
  process.env.GEMINI_API_URL = `http://127.0.0.1:${gsrv.address().port}`;
  const G = require('../src/plataforma/gestor');
  const app = express(); app.use(G.gestor); app.use(express.static(path.join(__dirname, '..', 'public')));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const fechar = async () => { await Promise.all([new Promise((r) => srv.close(r)), new Promise((r) => gsrv.close(r))]); pg.Pool = PoolOriginal; };
  return { estado, base, fechar };
}

async function testar() {
  const { estado, base, fechar } = await criarServidor();
  async function req(m, url, body, status = 200, headers = {}) {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: 'gestor_sessao=' + TOKEN, 'X-Gestor': '1', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const texto = await r.text();
    assert.equal(r.status, status, texto);
    for (const segredo of [CHAVE, NOVA]) assert.ok(!texto.includes(segredo), 'Resposta nunca pode incluir a chave completa');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    return JSON.parse(texto);
  }
  try {
    for (const [m, url] of [['GET', '/cerebro'], ['GET', '/cerebro/modelos'], ['POST', '/cerebro/chave'], ['POST', '/cerebro/testar']]) {
      await req(m, '/gestor-api' + url, m === 'POST' ? {} : undefined, 401, { cookie: 'sessao=imobiliaria' });
      await req(m, '/gestor-api' + url, m === 'POST' ? {} : undefined, 401, { cookie: 'gestor_sessao=expirada' });
      if (m === 'POST') await req(m, '/gestor-api' + url, {}, 403, { 'X-Gestor': '' });
    }
    const outroHost = (url) => new Promise((resolve, reject) => {
      require('node:http').get(base + url, { headers: { host: 'imobiliaria.example', cookie: 'gestor_sessao=' + TOKEN } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', reject);
    });
    assert.equal(await outroHost('/gestor/cerebro'), 404);
    assert.equal(await outroHost('/gestor-api/cerebro'), 404);
    console.log('ok · Cérebro exclusivo do host e da sessão do gestor; mutações protegidas');

    const d = await req('GET', '/gestor-api/cerebro');
    assert.deepEqual(d.configuracao, { tem_chave: true, chave_final: '7890', modelo: 'gemini-flash-latest', alterada_em: null });
    assert.deepEqual(d.total, { chamadas: 15, tokens_entrada: 9000000070, tokens_saida: 110, erros: 3 });
    assert.equal(d.dias.length, 30); assert.equal(d.dias[0].chamadas, 0);
    assert.equal((await req('GET', '/gestor-api/cerebro?periodo=hoje')).total.chamadas, 0);
    assert.equal((await req('GET', '/gestor-api/cerebro?periodo=mes_passado')).periodo, 'mes_passado');
    await req('GET', '/gestor-api/cerebro?periodo=invalido', undefined, 400);
    console.log('ok · sufixo da chave, totais numéricos, períodos, imobiliária sem consumo e 30 dias');

    await req('POST', '/gestor-api/cerebro/chave', { chave: NOVA, modelo: 'models/gemini-pro-teste' });
    assert.deepEqual(estado.gravacoes[0].slice(0, 4), [NOVA, 'gemini-pro-teste', false, 7]);
    assert.equal((await req('GET', '/gestor-api/cerebro')).configuracao.alterada_em, '2026-10-30 14:35:00');
    await req('POST', '/gestor-api/cerebro/chave', { modelo: 'gemini-flash-latest' });
    assert.equal(estado.chave, NOVA); assert.equal(estado.gravacoes.at(-1)[2], true);
    for (const body of [{}, { chave: '' }, { chave: 'curta' }, { chave: {} }, { modelo: '../../chave' }]) await req('POST', '/gestor-api/cerebro/chave', body, 400);
    console.log('ok · troca e mudança apenas de modelo usam a função; auditoria sem segredo');

    const modelos = await req('GET', '/gestor-api/cerebro/modelos');
    assert.deepEqual(modelos.modelos.map((m) => m.id), ['gemini-flash-latest', 'gemini-pro-teste']);
    assert.ok(estado.pedidos.every((p) => p.chave === NOVA));
    assert.ok(estado.pedidos.every((p) => !p.url.includes(NOVA)));
    let t = await req('POST', '/gestor-api/cerebro/testar', { modelo: 'gemini-pro-teste' });
    assert.equal(t.ok, true); assert.ok(t.ms >= 0); assert.deepEqual(estado.medicoes.at(-1), ['gemini-pro-teste', 8, 2, 0]);
    assert.match(estado.pedidos.at(-1).url, /gemini-pro-teste:generateContent/);
    assert.equal(estado.modelo, 'gemini-flash-latest', 'teste não muda o modelo gravado');
    estado.semTexto = true;
    assert.equal((await req('POST', '/gestor-api/cerebro/testar', {})).ok, false); estado.semTexto = false;
    for (const status of [403, 404, 429, 503]) {
      estado.erroGoogle = status;
      await req('GET', '/gestor-api/cerebro/modelos', undefined, 502);
      t = await req('POST', '/gestor-api/cerebro/testar', {}); assert.equal(t.ok, false); assert.ok(t.ms >= 0);
      assert.equal(estado.medicoes.at(-1)[3], 1);
    }
    estado.erroGoogle = 0; estado.falhaRede = true;
    assert.equal((await req('POST', '/gestor-api/cerebro/testar', {})).ok, false);
    await req('GET', '/gestor-api/cerebro/modelos', undefined, 502); estado.falhaRede = false;
    console.log('ok · paginação, filtro de modelos, teste real via HTTP, erros seguros e medição separada');

    estado.erroBanco = true;
    for (const [m, u] of [['GET', '/cerebro'], ['GET', '/cerebro/modelos'], ['POST', '/cerebro/chave'], ['POST', '/cerebro/testar']]) await req(m, '/gestor-api' + u, m === 'POST' ? { chave: NOVA } : undefined, 500);
    estado.erroBanco = false;
    // O parser pode refletir apenas o começo do segredo, mesmo sem devolver a chave completa.
    // Rotas do Express ignoram caixa e aceitam barra final; todas devem usar a resposta segura.
    for (const rota of ['/cerebro/chave', '/CEREBRO/CHAVE', '/CeReBrO/testar/', '/CEREBRO']) {
      for (const body of ['{' + NOVA, NOVA, JSON.stringify({ chave: NOVA, excesso: 'x'.repeat(201 * 1024) })]) {
        const invalido = await fetch(base + '/gestor-api' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        assert.equal(invalido.status, body.length > 200 * 1024 ? 413 : 400);
        assert.match(invalido.headers.get('content-type'), /^application\/json/);
        const resposta = await invalido.text();
        assert.ok(!resposta.includes(NOVA) && !resposta.includes(NOVA.slice(0, 10)), 'Erro de JSON não pode incluir nem o início da chave');
        assert.deepEqual(JSON.parse(resposta), { erro: 'Pedido inválido. Confira os campos e tente novamente.' });
      }
    }
    await req('POST', '/gestor-api/cerebro/chave', { chave: null });
    assert.equal(estado.gravacoes.at(-1)[0], null); assert.equal(estado.gravacoes.at(-1)[2], false);
    assert.equal((await req('GET', '/gestor-api/cerebro')).configuracao.tem_chave, false);
    await req('POST', '/gestor-api/cerebro/testar', {}, 400);
    await req('GET', '/gestor-api/cerebro/modelos', undefined, 400);
    assert.ok(estado.gravacoes.every((p) => !JSON.stringify(p.slice(4)).includes(NOVA)));
    console.log('ok · chave ausente/removida e segredo protegido em erros do banco, Google e JSON, inclusive rotas em maiúsculas e corpo excessivo');
  } finally { await fechar(); }
}
module.exports = { criarServidor, CHAVE, NOVA, TOKEN };
if (require.main === module) testar().catch((e) => { console.error(e); process.exitCode = 1; });
