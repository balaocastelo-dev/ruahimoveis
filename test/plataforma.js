// Plataforma: painel do gestor (página, API sem banco, travas) e conta suspensa numa imobiliária.
//   node test/plataforma.js
const os = require('os'), path = require('path'), fs = require('fs');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-plataforma-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL; delete process.env.PLATAFORMA_DATABASE_URL;
const { setConfig } = require('../src/db');
const G = require('../src/plataforma/gestor');

(async () => {
  // utilidades
  assert.equal(G.slugDe('ONDEMORAR.COM'), 'ondemorar'); assert.equal(G.slugDe('Imóveis São João'), 'imoveissaojoao');
  assert.equal(G.decifra(G.cifra('postgres://x:y@z/db')), 'postgres://x:y@z/db');
  const h = G.hashSenha('senha-boa-123'); assert.ok(G.confere('senha-boa-123', h)); assert.ok(!G.confere('outra', h));
  console.log('ok · nome técnico, cifra e senha');

  const app = require('../server');
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let r = await fetch(base + '/gestor'); assert.equal(r.status, 200); assert.ok(/Painel do gestor/.test(await r.text())); console.log('ok · página do painel');
  r = await fetch(base + '/gestor-api/eu'); assert.equal(r.status, 401); r = await fetch(base + '/gestor-api/eu', { headers: { cookie: 'gestor_sessao=abc' } }); assert.equal(r.status, 503); console.log('ok · sem sessão 401; sem banco da plataforma 503');
  r = await fetch(base + '/gestor-api/imobiliarias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(r.status, 403); console.log('ok · pedido sem o cabeçalho do painel é recusado');
  r = await fetch(base.replace('127.0.0.1', 'localhost') + '/gestor'); assert.equal(r.status, 200);

  // conta suspensa
  r = await fetch(base + '/imoveis'); assert.notEqual(r.status, 503);
  setConfig('plataforma_suspensa', '1'); require('../src/plataforma/suspensa').limpa();
  r = await fetch(base + '/imoveis'); assert.equal(r.status, 503); assert.ok(/fora do ar/.test(await r.text()));
  r = await fetch(base + '/api/imoveis'); assert.equal(r.status, 423);
  r = await fetch(base + '/style.css'); assert.equal(r.status, 200);
  setConfig('plataforma_suspensa', '0'); require('../src/plataforma/suspensa').limpa();
  r = await fetch(base + '/imoveis'); assert.notEqual(r.status, 503);
  console.log('ok · conta suspensa mostra o aviso e volta ao reativar');
  srv.close();
  console.log('\nPlataforma: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
