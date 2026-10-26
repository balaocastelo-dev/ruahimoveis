// Teste do painel do administrador: node test/painel.js
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-pn-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
const app = require('../server');
const assert = require('assert');
(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie, origin: base }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { s: r.status, j: await r.json().catch(() => null) };
  };
  const st = await req('POST', '/api/setup', { nome: 'Thiago Adm', email: 'adm@ruah.com', senha: 'Teste1234', exemplo: true });
  assert.equal(st.s, 200);
  for (const dias of [7, 30, 90, 365]) {
    const r = await req('GET', '/api/painel/adm?dias=' + dias);
    assert.equal(r.s, 200, JSON.stringify(r.j));
    const d = r.j;
    assert.equal(d.dias, dias);
    assert.ok(d.carteira.ativos >= 3 && d.carteira.vgv > 0, 'carteira');
    assert.equal(d.leads.funil.length, 6); assert.equal(d.leads.semanas.length, 12);
    assert.ok(Array.isArray(d.equipe) && d.equipe.length >= 2, 'equipe');
    assert.ok(Array.isArray(d.pendencias));
    console.log(`ok · painel ${dias} dias: VGV ${d.carteira.vgv}, ${d.leads.ativos} leads, ${d.equipe.length} na equipe, ${d.pendencias.length} pendências`);
  }
  // corretor não vê o painel da imobiliária
  const c = st.j.exemplo.corretores[0];
  await req('POST', '/api/logout'); cookie = '';
  await req('POST', '/api/login', { email: c.email, senha: c.senha });
  assert.equal((await req('GET', '/api/painel/adm')).s, 403); console.log('ok · corretor bloqueado');
  assert.equal((await req('GET', '/api/painel')).s, 200); console.log('ok · corretor mantém o painel dele');
  console.log('\nPAINEL: TODOS OS TESTES PASSARAM'); srv.close(); process.exit(0);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
