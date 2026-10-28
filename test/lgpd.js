// LGPD: páginas Sobre nós, Termos e Privacidade (plataforma e portal), pedido do titular, "não contatar",
// mensagem do robô com a origem do contato e o aceite dos Termos no sistema.
//   node test/lgpd.js
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-lgpd-'));
process.env.RUAH_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'l'.repeat(48); process.env.IA_MODO = 'desligado';
process.env.PLATAFORMA_HOSTS = 'localhost'; // localhost = corretordofuturo.app; 127.0.0.1 = portal da imobiliária
process.env.EMPRESA = 'Imobiliária Teste Ltda'; process.env.CLIENTE_CRECI = '12345-J';
delete process.env.DATABASE_URL; delete process.env.PLATAFORMA_DATABASE_URL;
const app = require('../server');
const { one, run } = require('../src/db');
const F = require('../src/fisguei/base');
const lgpd = require('../src/lgpd');

(async () => {
  const srv = app.listen(0); const porta = srv.address().port;
  const portal = `http://127.0.0.1:${porta}`, plat = `http://localhost:${porta}`;
  const form = (o) => new URLSearchParams(o).toString();

  // plataforma
  for (const [c, frase] of [['/sobre', 'software independente'], ['/termos', 'não presta serviço de corretagem'], ['/privacidade', 'Encarregado']]) {
    const r = await fetch(plat + c); const t = await r.text();
    assert.equal(r.status, 200, c); assert.ok(t.includes(frase), `${c} sem "${frase}"`);
    assert.ok(/href="\/termos"/.test(t) && /href="\/privacidade"/.test(t), `${c} sem links institucionais`);
  }
  let t = await (await fetch(plat + '/privacidade')).text();
  assert.ok(/action="\/privacidade\/pedido"/.test(t) && /Fisgar|portais/.test(await (await fetch(plat + '/sobre')).text()));
  t = await (await fetch(plat + '/')).text();
  assert.ok(/3 milhões/.test(t) && /Sobre nós/.test(t) && /7 milhões de anúncios/.test(t), 'página de vendas com Brasil e Sobre nós');
  let r = await fetch(plat + '/privacidade/pedido', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ tipo: 'oposicao', nome: 'Ana', telefone: '19999990000', declaro: '1' }) });
  assert.equal(r.status, 503, 'sem banco da plataforma o pedido avisa (não finge que gravou)');
  console.log('ok · plataforma: Sobre nós, Termos, Privacidade e estimativa nacional');

  // portal da imobiliária
  r = await fetch(portal + '/privacidade'); t = await r.text();
  assert.equal(r.status, 200); assert.ok(t.includes('Imobiliária Teste Ltda') && t.includes('CRECI 12345-J') && t.includes('controladora') && t.includes('operadora'));
  assert.ok(/name="tipo"/.test(t) && /name="declaro"/.test(t));
  t = await (await fetch(portal + '/termos')).text(); assert.ok(/Termos de uso do site/.test(t));
  t = await (await fetch(portal + '/imoveis')).text(); assert.ok(/href="\/privacidade"/.test(t) && /href="\/termos"/.test(t), 'rodapé do portal com os links');
  t = await (await fetch(portal + '/blog')).text(); assert.ok(/href="\/privacidade"/.test(t), 'rodapé do blog com o link');
  console.log('ok · portal: privacidade e termos da imobiliária, links no rodapé');

  r = await fetch(portal + '/privacidade/pedido', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ tipo: 'oposicao', nome: 'Ana' }) });
  assert.equal(r.status, 400); assert.ok(/informe o telefone|Confirme/i.test(await r.text()));
  r = await fetch(portal + '/privacidade/pedido', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ tipo: 'oposicao', nome: 'Ana Souza', telefone: '(19) 98888-7777', declaro: '1', mensagem: 'Recebi mensagem' }) });
  t = await r.text(); assert.equal(r.status, 200); const prot = (t.match(/LGPD-\d{8}-[0-9A-F]{6}/) || [])[0]; assert.ok(prot, 'protocolo na tela');
  const p = one('SELECT * FROM titular_pedidos WHERE protocolo=?', prot); assert.equal(p.tipo, 'oposicao'); assert.equal(p.telefone, '5519988887777'); assert.ok(p.prazo);
  assert.ok(one('SELECT 1 FROM fisguei_bloqueios WHERE telefone=?', '5519988887777'), 'telefone bloqueado');
  assert.ok(F.bloqueado('19988887777'), 'robô não chama quem pediu');
  r = await fetch(portal + '/privacidade/pedido', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ tipo: 'acessar', nome: 'Robô', email: 'x@x.com', declaro: '1', empresa: 'spam' }) });
  assert.equal(r.status, 200); assert.equal(one("SELECT count(*) n FROM titular_pedidos WHERE nome='Robô'").n, 0, 'armadilha não grava');
  console.log('ok · pedido do titular: protocolo, prazo de 15 dias e "não contatar"');

  // robô: toda mensagem diz de onde veio o contato e leva à página de privacidade
  const msg = F.montaTexto(F.MODELO_PADRAO, { nome: 'JOSE SILVA' }, { logradouro: 'Rua A', numero: '10', bairro: 'Cambuí', cidade: 'Campinas' });
  assert.ok(/PARAR/.test(msg));
  const fila = require('fs').readFileSync(path.join(__dirname, '..', 'src/fisguei/base.js'), 'utf8');
  assert.ok(/comTransparencia\(montaTexto/.test(fila), 'a fila passa pela linha de origem do contato');
  console.log('ok · mensagem do robô com a origem do contato');

  // sistema: aceite e pedidos
  run("INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES('Adm','adm@t.com','adm',?)", require('../src/auth').hashSenha('Teste1234'));
  const jar = {};
  const req = async (m, url, body) => {
    const x = await fetch(portal + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar.c || '' }, body: body ? JSON.stringify(body) : undefined });
    const sc = x.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
    let j; try { j = await x.json(); } catch { j = null; } return { s: x.status, j };
  };
  assert.equal((await req('POST', '/api/login', { email: 'adm@t.com', senha: 'Teste1234' })).s, 200);
  let a = await req('GET', '/api/lgpd/aceite'); assert.equal(a.j.aceito, false); assert.equal(a.j.versao, lgpd.VERSAO);
  assert.equal((await req('POST', '/api/lgpd/aceite', {})).s, 400);
  assert.equal((await req('POST', '/api/lgpd/aceite', { aceito: true })).s, 200);
  a = await req('GET', '/api/lgpd/aceite'); assert.equal(a.j.aceito, true);
  const l = await req('GET', '/api/lgpd/pedidos'); assert.equal(l.j.pedidos.length, 1);
  assert.equal((await req('GET', '/api/lgpd/resumo')).j.abertos, 1);
  assert.equal((await req('POST', `/api/lgpd/pedidos/${l.j.pedidos[0].id}/atender`, {})).s, 400);
  assert.equal((await req('POST', `/api/lgpd/pedidos/${l.j.pedidos[0].id}/atender`, { resposta: 'Confirmado por WhatsApp.' })).s, 200);
  assert.equal((await req('GET', '/api/lgpd/resumo')).j.abertos, 0);
  assert.equal((await req('POST', '/api/lgpd/nao-contatar', { telefone: '19977776666' })).s, 200);
  assert.ok(F.bloqueado('19977776666'));
  console.log('ok · sistema: aceite dos termos, resposta ao titular e "não contatar" manual');

  srv.close();
  console.log('\nLGPD: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
