// Teste do Fisguei: extensão manda dados do Fisgar → base → fila do robô → respostas → Radar.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-fisguei-'));
process.env.RUAH_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'z'.repeat(48); process.env.IA_MODO = 'desligado';
const app = require('../server');
const F = require('../src/fisguei/base');
const { one, all, run } = require('../src/db');

const URL_FISGAR = 'https://router.fisgar.com.br/api123/v1/api/region/sp';
const lista = { data: [
  { id: 325321672, city: 'Campinas', street: 'Rua dos Maracatins', district: 'Vila Costa E Silva', zipcode: '13081440', number: 402, longlat: { x: -22.87, y: -47.05 },
    announcer: 'rede provectum - unidade realize 2', bedroom: 2, suites: 2, bathroom: 3, parking_slots: 1, total_area: 113, useable_area: 72, condo_price: 364, buy_price: 660000, rental_price: 0,
    private: 0, property_type: 'Casa Padrão', finality: 0, images: ['https://www.chavesnamao.com.br/imn/1.jpg'], postedAt: '2026-10-26T12:00:00.000Z' },
  { id: 999, city: 'Campinas', street: 'Rua Só Aluguel', district: 'Centro', zipcode: '13010000', number: 1, buy_price: 0, rental_price: 3500, private: 1, property_type: 'Apartamento' },
  { id: 1000, city: 'Campinas', street: 'Rua Particular', district: 'Cambuí', zipcode: '13025150', number: 536, buy_price: 1200000, private: 1, property_type: 'Apartamento Padrão', longlat: { x: -22.89, y: -47.05 } },
] };
const pessoas = { data: { searchId: 'x', totalElements: 2, totalPages: 1, people: [
  { document: '12345678909', name: 'ANDRE LUIS ARRUDA', birthDate: '', type: 'PESSOA_FISICA', addresses: [{ street: 'Rua dos Maracatins', number: 402, extra: 'CASA 02', zipcode: 13081440, iptuMatch: true }] },
  { document: '98765432100', name: 'PATRICIA GORNO', birthDate: '', type: 'PESSOA_FISICA', addresses: [{ street: 'Rua dos Maracatins', number: 402, extra: 'CASA 01', zipcode: 13081440, iptuMatch: true }] },
] } };
const pedidoPessoas = JSON.stringify({ announce_id: '325321672', search: { type: 'IPTU_ADDRESS', key: { number: 402, zipcode: '13081440', city: 'Campinas', district: 'Vila Costa E Silva', street: 'Rua dos Maracatins' } } });
const consulta = (doc, nome, extra, fones) => ({
  pedido: JSON.stringify({ announce_id: '325321672', search: { key: { type: 'DOCUMENT', document: doc, addresses: [{ number: 402, extra, zipcode: 13081440, iptuMatch: true }], name: nome } } }),
  json: { data: { people: [{ document: doc, name: nome, birthDate: '1975-03-02', type: 'PESSOA_FISICA', addresses: [{ number: 402, extra, zipcode: 13081440, iptuMatch: true }],
    phones: fones, emails: [{ email: 'teste@exemplo.com', score: 1 }] }] } },
});

(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const jar = {};
  const req = async (quem, m, url, body, h = {}) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[quem] || '', ...h }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) jar[quem] = sc.split(';')[0];
    let j; try { j = await r.json(); } catch { j = null; }
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };

  const st = ok(await req('adm', 'POST', '/api/setup', { nome: 'Gestor', email: 'g@r.com', senha: 'Teste1234', exemplo: true }), 'setup');
  const cr = st.exemplo.corretores[0];
  ok(await req('cor', 'POST', '/api/login', { email: cr.email, senha: cr.senha }), 'login corretor');

  // chave da extensão
  assert.equal((await req('x', 'POST', '/fisguei-api/receber', { url: 'a', json: {} })).s, 401); console.log('ok · extensão sem chave recusada');
  assert.equal((await req('cor', 'POST', '/api/fisguei/chave')).s, 403); console.log('ok · corretor não gera chave');
  const { chave } = ok(await req('adm', 'POST', '/api/fisguei/chave'), 'gera chave');
  const H = { 'X-Fisguei-Chave': chave, Origin: 'chrome-extension://abc' };
  ok(await req('x', 'GET', '/fisguei-api/ping', null, H), 'ping da extensão');

  // a extensão manda a lista, a aba Proprietários e duas consultas
  let r = ok(await req('x', 'POST', '/fisguei-api/receber', { itens: [{ url: URL_FISGAR + '/properties/getAll', json: lista }] }, H), 'recebe lista');
  assert.equal(r.anuncios, 2); console.log('   locação ficou de fora');
  r = ok(await req('x', 'POST', '/fisguei-api/receber', { url: URL_FISGAR + '/owners/GetPeople', pedido: pedidoPessoas, json: pessoas }, H), 'recebe pessoas');
  assert.equal(r.pessoas, 2);
  const c1 = consulta('12345678909', 'ANDRE LUIS ARRUDA', 'CASA 02', [{ phone: '19991407837', type: 'MOBILE', whatsApp: false, score: 2 }, { phone: '1932321111', type: 'LANDLINE', score: 1 }, { phone: '19988887777', type: 'MOBILE', score: 1 }]);
  r = ok(await req('x', 'POST', '/fisguei-api/receber', { url: URL_FISGAR + '/owners/GetPersonInfo', pedido: c1.pedido, json: c1.json }, H), 'recebe consulta 1');
  assert.equal(r.telefones, 2); console.log('   fixo guardado fora da fila do robô');
  const c2 = consulta('98765432100', 'PATRICIA GORNO', 'CASA 01', [{ phone: '19977776666', type: 'MOBILE', score: 1 }]);
  ok(await req('x', 'POST', '/fisguei-api/receber', { url: URL_FISGAR + '/owners/GetPersonInfo', pedido: c2.pedido, json: c2.json }, H), 'recebe consulta 2');
  assert.ok(!all('SELECT * FROM fisguei_pessoas').some((p) => JSON.stringify(p).includes('12345678909'))); console.log('ok · CPF não foi gravado');

  const lst = ok(await req('cor', 'GET', '/api/fisguei?filtro=com_dono'), 'lista com dono');
  assert.equal(lst.total, 1); const id = lst.itens[0].id;
  assert.equal(lst.itens[0].na_fila, 3);
  const ficha = ok(await req('cor', 'GET', '/api/fisguei/' + id), 'ficha');
  assert.equal(ficha.pessoas.length, 2); assert.equal(ficha.pessoas[0].unidade, 'CASA 02'); assert.ok(ficha.previa.includes('Andre'));
  assert.equal(ok(await req('cor', 'GET', '/api/fisguei/mapa'), 'mapa').length, 2);
  ok(await req('cor', 'GET', '/api/fisguei/resumo'), 'resumo');
  ok(await req('cor', 'GET', '/api/fisguei?filtro=particular&q=cambui'), 'filtro particular + busca');

  // fila: horário e limite
  assert.equal(F.dentroDoHorario(F.ajustes(), new Date('2026-10-27T15:00:00Z')), true);  // terça 12h
  assert.equal(F.dentroDoHorario(F.ajustes(), new Date('2026-10-25T15:00:00Z')), false); // domingo
  assert.equal(F.dentroDoHorario(F.ajustes(), new Date('2026-10-27T23:30:00Z')), false); // terça 20h30
  console.log('ok · horário comercial');
  const aj = ok(await req('adm', 'POST', '/api/fisguei/robo', { limite_dia: 999, intervalo_s: 5 }), 'ajustes do robô');
  assert.equal(aj.ajustes.limite_dia, F.LIMITE_MAX); assert.equal(aj.ajustes.intervalo_s, F.INTERVALO_MIN_S); console.log('   limites de segurança respeitados');
  assert.equal((await req('adm', 'POST', '/api/fisguei/robo', { modelo: 'Oi {nome}, é dono?' })).s, 400); console.log('ok · mensagem sem PARAR recusada');

  // robô: primeiro o possível dono da CASA 02, celular por celular
  const p1 = F.proximo(); assert.equal(p1.contato.valor, '5519991407837'); assert.ok(p1.texto.includes('Rua dos Maracatins, 402 – CASA 02'));
  F.marcaEnviado(p1.contato.id, p1.texto, 'wa1');
  const p2 = F.proximo(); assert.equal(p2.contato.valor, '5519988887777'); F.marcaEnviado(p2.contato.id, p2.texto, 'wa2');
  // o mesmo número em outro endereço não é chamado de novo em 30 dias
  run("INSERT INTO fisguei_contatos(pessoa_id,tipo,valor) VALUES((SELECT id FROM fisguei_pessoas WHERE nome='Patricia Gorno'),'tel','5519991407837')");
  const p3 = F.proximo(); assert.equal(p3.contato.valor, '5519977776666'); console.log('ok · fila na ordem, sem repetir número');
  F.marcaEnviado(p3.contato.id, p3.texto, 'wa3');

  // respostas: Patricia diz que não é; André confirma (pelo número sem o 9)
  assert.equal(F.recebida({ telefone: '5519977776666', texto: 'Não sou eu', wa_id: 'in1' }).tipo, 'negou');
  assert.ok(F.bloqueado('5519977776666') === null); // "não sou o dono" não bloqueia o número para sempre
  const conf = F.recebida({ telefone: '551991407837', texto: 'Sim, sou o proprietário', wa_id: 'in2' });
  assert.equal(conf.tipo, 'confirmou'); assert.ok(conf.oportunidade_id);
  const op = one('SELECT * FROM oportunidades WHERE id=?', conf.oportunidade_id);
  assert.equal(op.titular_nome, 'Andre Luis Arruda'); assert.equal(op.titular_telefone, '5519991407837'); assert.equal(op.status, 'em_contato');
  assert.equal(one('SELECT status FROM fisguei_anuncios WHERE id=?', id).status, 'confirmado');
  assert.equal(F.pendentes().length, 2); console.log('ok · SIM vira oportunidade no Radar e respostas automáticas na fila');
  assert.equal(F.recebida({ telefone: '551991407837', texto: 'Pode me ligar amanhã', wa_id: 'in3' }).tipo, 'conversa'); console.log('ok · depois da 1ª resposta o robô não responde sozinho');
  assert.equal(F.recebida({ telefone: '5511900000000', texto: 'oi', wa_id: 'in4' }).ignorado !== undefined, true); console.log('ok · número desconhecido ignorado');
  assert.equal(F.recebida({ telefone: '551991407837', texto: 'PARAR', wa_id: 'in5' }).tipo, 'parar');
  assert.ok(F.bloqueado('5519991407837')); console.log('ok · PARAR entra na lista não contatar');

  // corretor responde pela linha do robô e leva outro endereço ao Radar
  const fic2 = ok(await req('cor', 'GET', '/api/fisguei/' + id), 'ficha depois das respostas');
  const patricia = fic2.pessoas.find((p) => p.nome === 'Patricia Gorno');
  assert.equal(patricia.status, 'negou');
  assert.equal((await req('cor', 'POST', `/api/fisguei/pessoas/${fic2.pessoas.find((p) => p.nome.startsWith('Andre')).id}/mensagem`, { texto: 'Olá!' })).s, 400); console.log('ok · não manda para quem pediu PARAR');
  const outro = ok(await req('cor', 'GET', '/api/fisguei?q=particular'), 'busca outro').itens[0];
  const cap = ok(await req('cor', 'POST', `/api/fisguei/${outro.id}/captar`), 'leva para o Radar');
  assert.ok(one('SELECT 1 FROM oportunidades WHERE id=?', cap.oportunidade_id));
  ok(await req('cor', 'POST', `/api/fisguei/${id}/pausar`, { pausado: true }), 'pausa endereço');
  ok(await req('cor', 'POST', `/api/fisguei/pessoas/${patricia.id}/status`, { status: 'parar' }), 'corretor marca não contatar');
  assert.ok(F.bloqueado('5519977776666'));

  srv.close();
  console.log('\nFisguei: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
