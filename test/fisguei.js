// Teste do Fisguei: extensão manda dados do Fisgar → base → fila do robô → respostas → Radar.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-fisguei-'));
process.env.RUAH_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'z'.repeat(48); process.env.IA_MODO = 'desligado';
process.env.MERCADO_CACHE_S = '0';
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
  assert.equal(r.anuncios, 3);
  const anLoc = one("SELECT negocio, aluguel, valor FROM fisguei_anuncios WHERE fisgar_id='999'");
  assert.equal(anLoc.negocio, "Locação"); assert.equal(anLoc.aluguel, 3500); assert.equal(anLoc.valor, null); console.log('   locação entra com o aluguel mensal');
  const vLoc = ok(await req('adm', 'GET', '/api/mercado/resumo?cat=apartamentos&neg=locacao&min=0'), 'vitrine de locação');
  const vVen = ok(await req('adm', 'GET', '/api/mercado/resumo?cat=apartamentos&min=0'), 'vitrine de venda');
  assert.equal(vLoc.total, 1); assert.equal(vLoc.mediana, 3500); assert.equal(vVen.total, 1); console.log('   vitrine de locação separada da venda');
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

  // ---------- robô "Buscar dados" (Radar → Fisgar → Fisguei) ----------
  const fetch0 = global.fetch;
  global.fetch = (u, o) => (/viacep\.com\.br/.test(String(u))
    ? Promise.resolve(new Response(JSON.stringify([{ cep: '13098-319', logradouro: 'Rua Sabiú', complemento: '', bairro: 'Loteamento Alphaville Campinas' }, { cep: '13098-000', logradouro: 'Rua Outra Sabiú', complemento: '', bairro: 'X' }]), { headers: { 'Content-Type': 'application/json' } }))
    : fetch0(u, o));
  const op2 = ok(await req('cor', 'POST', '/api/radar', { portal: 'Chaves na Mão', link: 'https://cnm/2', titulo: 'Casa 4q', tipo: 'Casa em condomínio', anunciante_tipo: 'imobiliaria', logradouro: 'Rua Sabiú', numero: '135', bairro: 'Alphaville', valor: '3.800.000', quartos: 4 }), 'oportunidade no Radar');
  const semNum = ok(await req('cor', 'POST', '/api/radar', { portal: 'Chaves na Mão', link: 'https://cnm/3', titulo: 'Apto', tipo: 'Apartamento', logradouro: 'Rua Sem Número', bairro: 'Centro' }), 'oportunidade sem número');
  const bq = ok(await req('cor', 'POST', '/api/fisguei/buscar', { oportunidade_ids: [op2.id, semNum.id] }), 'pede busca no Fisgar');
  assert.equal(bq.criados, 1); assert.equal(bq.sem_endereco, 1);
  assert.equal(ok(await req('cor', 'POST', '/api/fisguei/buscar', { oportunidade_ids: [op2.id] }), 'pede de novo').ja, 1); console.log('   não duplica a busca');
  assert.equal((await req('x', 'GET', '/fisguei-api/pedidos/proximo?fisgar=0', null, H)).j.pedido, null); console.log('ok · sem Fisgar aberto não entrega busca');
  const px = ok(await req('x', 'GET', '/fisguei-api/pedidos/proximo?fisgar=1', null, H), 'extensão pega a busca');
  assert.equal(px.pedido.key.zipcode, '13098319'); assert.equal(px.pedido.key.number, '135'); assert.equal(px.pedido.consultar.modo, 'auto'); console.log('   CEP achado pelo trecho da rua');
  const gente = { data: { searchId: 's', totalElements: 2, totalPages: 1, people: [
    { document: '11122233344', name: 'MARIA DONA', type: 'PESSOA_FISICA', addresses: [{ street: 'Rua Sabiú', number: 135, extra: '', zipcode: 13098319, iptuMatch: true }] },
    { document: '55566677788', name: 'JOAO VIZINHO', type: 'PESSOA_FISICA', addresses: [{ street: 'Rua Sabiú', number: 135, extra: '', zipcode: 13098319, iptuMatch: false }] }] } };
  const info = { data: { people: [{ document: '11122233344', name: 'MARIA DONA', birthDate: '1960-01-01', type: 'PESSOA_FISICA', addresses: [{ number: 135, zipcode: 13098319, iptuMatch: true }], phones: [{ phone: '19955554444', type: 'MOBILE' }], emails: [] }] } };
  const res = ok(await req('x', 'POST', `/fisguei-api/pedidos/${px.pedido.id}/resultado`, {
    pessoas: { pedido: JSON.stringify({ search: { type: 'IPTU_ADDRESS', key: px.pedido.key } }), json: gente, cobrado: true },
    consultas: [{ pedido: JSON.stringify({ search: { key: { type: 'DOCUMENT', document: '11122233344', addresses: [{ number: 135, zipcode: 13098319, iptuMatch: true }], name: 'MARIA DONA' } } }), json: info, cobrado: true }] }, H), 'extensão devolve o resultado');
  assert.equal(res.status, 'concluido'); assert.equal(res.creditos, 2); assert.equal(res.consultadas, 1);
  // dono localizado: o imóvel entra sozinho na carteira, com o proprietário do Fisgar na ficha
  assert.ok(res.imovel && res.imovel.codigo); console.log('ok · dono localizado leva o imóvel para a carteira');
  const naCart = ok(await req('cor', 'GET', '/api/imoveis/' + res.imovel.id), 'ficha do imóvel na carteira');
  assert.equal(naCart.proprietario.nome, 'Maria Dona'); assert.equal(naCart.proprietario.telefone, '5519955554444'); assert.ok(/ainda não confirmou/.test(naCart.proprietario.origem_dado));
  assert.equal(naCart.etapa, 'localizado'); assert.equal(naCart.origem, 'fisgar'); assert.ok(naCart.ficha.falta.includes('Fotos próprias'));
  const lCart = ok(await req('cor', 'GET', '/api/imoveis'), 'lista da carteira');
  assert.equal(lCart.find((i) => i.id === res.imovel.id).etapa, 'localizado'); console.log('   etapa "dono localizado" na lista');
  const fgCart = ok(await req('cor', 'GET', `/api/imoveis/${res.imovel.id}/fisgar`), 'dados do Fisgar na ficha');
  assert.equal(fgCart.pessoas.length, 2); assert.ok(fgCart.pessoas[0].contatos.some((c) => c.valor === '5519955554444'));
  const loc = ok(await req('cor', 'POST', '/api/fisguei/localizar', { ids: [-op2.id] }), 'localizar de novo pela vitrine');
  assert.equal(loc.criados, 0); assert.equal(loc.na_carteira, 1); console.log('   quem já está na carteira não gasta crédito de novo');
  const sit = ok(await req('cor', 'GET', `/api/fisguei/radar?ids=${op2.id}`), 'situação no Radar')[op2.id];
  assert.equal(sit.consultadas, 1); assert.equal(sit.pessoas, 2);
  const ficha3 = ok(await req('cor', 'GET', '/api/fisguei/' + sit.id), 'ficha do endereço buscado');
  assert.equal(ficha3.pedidos[0].status, 'concluido');
  assert.ok(!JSON.stringify(ficha3).includes('11122233344')); console.log('ok · CPF não gravado na busca do robô');
  // fila do TH-IA-GO já tem o celular da Maria
  assert.ok(one(`SELECT 1 FROM fisguei_contatos WHERE valor='5519955554444' AND envio='fila'`)); console.log('ok · telefone na fila do WhatsApp');
  // consultar o vizinho à mão
  const joao = ficha3.pessoas.find((p) => p.nome === 'Joao Vizinho');
  ok(await req('cor', 'POST', `/api/fisguei/pessoas/${joao.id}/consultar`), 'pede consulta de 1 pessoa');
  const px2 = ok(await req('x', 'GET', '/fisguei-api/pedidos/proximo?fisgar=1', null, H), 'extensão pega a consulta');
  assert.equal(px2.pedido.consultar.modo, 'nomes'); assert.equal(px2.pedido.consultar.nomes[0].nome, 'Joao Vizinho');
  ok(await req('x', 'POST', `/fisguei-api/pedidos/${px2.pedido.id}/resultado`, { erro: 'O Fisgar pediu login de novo.', erro_volta: true }, H), 'erro de login devolve para a fila');
  assert.equal(one('SELECT status FROM fisguei_pedidos WHERE id=?', px2.pedido.id).status, 'fila');
  // limite de créditos do dia
  ok(await req('adm', 'POST', '/api/fisguei/pedidos/limites', { creditos_dia: 2 }), 'limite de 2 créditos/dia');
  const px3 = ok(await req('x', 'GET', '/fisguei-api/pedidos/proximo?fisgar=1', null, H), 'limite do dia');
  assert.equal(px3.pedido, null); assert.ok(/limite/.test(px3.motivo)); console.log('   robô para no limite de créditos');
  ok(await req('adm', 'POST', '/api/fisguei/pedidos/limites', { creditos_dia: 70 }), 'volta o limite');
  const rs = ok(await req('cor', 'GET', '/api/fisguei/pedidos'), 'resumo do robô de busca');
  assert.equal(rs.creditos_hoje, 2); assert.equal(rs.extensao.fisgar_aberto, true);
  // importar para a base
  run('UPDATE fisguei_anuncios SET fotos=? WHERE id=?', JSON.stringify(['https://img.exemplo.com/f1.jpg', 'https://img.exemplo.com/f2.jpg']), sit.id);
  const im = ok(await req('cor', 'POST', `/api/fisguei/${sit.id}/importar`), 'importa para a carteira');
  const imv = one('SELECT * FROM imoveis WHERE id=?', im.id);
  assert.equal(imv.tipo, 'Casa em condomínio'); assert.equal(imv.status, 'captacao'); assert.equal(imv.cep, '13098319'); assert.ok(im.codigo.startsWith('CC'));
  assert.equal(ok(await req('cor', 'POST', `/api/fisguei/${sit.id}/importar`), 'importa de novo').ja, true); console.log('   não duplica o imóvel');
  // nenhum imóvel fica sem foto: as do anúncio entram como internas e nunca são públicas
  const fichaIm = ok(await req('cor', 'GET', '/api/imoveis/' + im.id), 'ficha com fotos internas');
  assert.ok(fichaIm.fotos.length === 2 && fichaIm.fotos.every((f) => f.interna), 'fotos internas na ficha');
  const rd = await fetch(`${base}/api/arquivos/${fichaIm.fotos[0].id}`, { redirect: 'manual', headers: { cookie: jar.cor } });
  assert.equal(rd.headers.get('location'), 'https://img.exemplo.com/f1.jpg', 'foto interna abre pelo endereço');
  assert.equal(one("SELECT count(*) n FROM arquivos WHERE imovel_id=? AND categoria='Fotos'", im.id).n, 0, 'nenhuma foto pública');
  const lstIm = ok(await req('cor', 'GET', '/api/imoveis'), 'lista da carteira').find((x) => x.id === im.id);
  assert.ok(lstIm.capa && lstIm.n_fotos === 0, 'capa interna na carteira'); console.log('ok · fotos do anúncio entram como internas (carteira com foto, portal sem)');
  // o dono confirmado vai junto como proprietário
  run("UPDATE fisguei_pessoas SET status='confirmou' WHERE nome='Andre Luis Arruda'");
  const im2 = ok(await req('cor', 'POST', `/api/fisguei/${id}/importar`), 'importa endereço com dono confirmado');
  const pr = one('SELECT p.* FROM imoveis i JOIN proprietarios p ON p.id=i.proprietario_id WHERE i.id=?', im2.id);
  assert.equal(pr.nome, 'Andre Luis Arruda'); assert.ok(/Fisgar/.test(pr.origem_dado)); console.log('ok · dono confirmado vira proprietário (origem do dado anotada)');
  assert.equal(ok(await req('adm', 'GET', '/api/imoveis/' + im2.id), 'etapa do confirmado').etapa, 'confirmado'); console.log('   etapa "dono confirmou"');
  // proprietário digitado pela equipe não é trocado pelo Fisgar
  run("UPDATE proprietarios SET origem_dado='Informado pelo proprietário', nome='Nome Certo' WHERE id=?", pr.id);
  require('../src/fisguei/pedidos').sincronizaDono(id);
  assert.equal(one('SELECT nome FROM proprietarios WHERE id=?', pr.id).nome, 'Nome Certo'); console.log('ok · dono cadastrado à mão fica como está');
  global.fetch = fetch0;

  srv.close();
  console.log('\nFisguei: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
