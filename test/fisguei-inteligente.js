// Teste do Fisguei inteligente: cartões com sinais (queda de preço, novo, abaixo do m², particular, repetido),
// filtro por proprietário e saldo de créditos do Fisgar (lido pela extensão ou informado à mão).
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-fgi-'));
process.env.HOUSE_DB = process.env.HOUSE_DB || path.join(tmp, 't.db'); process.env.SECRET_KEY = 'z'.repeat(48); process.env.IA_MODO = 'desligado';
const app = require('../server');
const { run } = require('../src/db');

const URL_FISGAR = 'https://router.fisgar.com.br/api123/v1/api/region/sp';
const hoje = new Date().toISOString();
const anuncio = (id, o = {}) => ({ id, city: 'Campinas', street: o.rua || `Rua Teste ${id}`, district: o.bairro || 'Cambuí', zipcode: '13025000', number: o.numero ?? id,
  buy_price: o.valor || 1000000, useable_area: o.area || 100, bedroom: 3, private: o.particular ? 1 : 0, property_type: o.tipo || 'Apartamento Padrão',
  announcer: o.anunciante || `Imobiliária ${id}`, images: ['https://www.chavesnamao.com.br/imn/' + id + '.jpg'], postedAt: o.postado || hoje, longlat: { x: -22.89, y: -47.05 } });

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
  const { chave } = ok(await req('adm', 'POST', '/api/fisguei/chave'), 'gera chave');
  const H = { 'X-Fisguei-Chave': chave };

  // 8 apartamentos parecidos no Cambuí (R$ 10 mil/m²), um bem mais barato, um particular, um repetido, um antigo
  const lista = [];
  for (let i = 1; i <= 8; i++) lista.push(anuncio(100 + i, { valor: 1000000 + i * 1000 }));
  lista.push(anuncio(200, { valor: 650000, rua: 'Rua Barata', numero: 10 }));
  lista.push(anuncio(300, { valor: 1200000, particular: true, rua: 'Rua do Dono', numero: 55 }));
  lista.push(anuncio(400, { valor: 990000, rua: 'Rua Repetida', numero: 7, anunciante: 'Outra Imob' }));
  lista.push(anuncio(401, { valor: 1050000, rua: 'Rua Repetida', numero: 7, anunciante: 'Mais Uma Imob' }));
  lista.push(anuncio(500, { valor: 1000000, rua: 'Rua Velha', numero: 3, postado: '2026-01-10T12:00:00Z' }));
  ok(await req('x', 'POST', '/fisguei-api/receber', { itens: [{ url: URL_FISGAR + '/properties/getAll', json: { data: lista } }] }, H), 'recebe a lista');

  // a mesma lista chega de novo com o preço de um anúncio menor: vira queda de preço
  const queda = lista.map((x) => (x.id === 101 ? { ...x, buy_price: 850000 } : x));
  ok(await req('x', 'POST', '/fisguei-api/receber', { itens: [{ url: URL_FISGAR + '/properties/getAll', json: { data: queda } }] }, H), 'recebe de novo com preço menor');

  let e = ok(await req('cor', 'GET', '/api/fisguei/explorar'), 'explorar');
  assert.equal(e.total, 13);
  const por = (fid) => e.itens.find((x) => x.logradouro === fid) || null;
  const q = e.itens.find((x) => x.sinais.some((s) => s.id === 'queda'));
  assert.ok(q && q.sinais.find((s) => s.id === 'queda').pct <= -15 && q.sinais.find((s) => s.id === 'queda').brusca); console.log('   queda forte de preço detectada');
  assert.ok(por('Rua Barata').sinais.some((s) => s.id === 'abaixo')); console.log('   m² abaixo do bairro detectado');
  assert.ok(por('Rua do Dono').sinais.some((s) => s.id === 'particular'));
  assert.ok(por('Rua Velha').sinais.some((s) => s.id === 'antigo')); console.log('   anúncio antigo detectado');
  assert.ok(por('Rua Repetida').sinais.some((s) => s.id === 'repetido')); console.log('   mesmo imóvel em dois anúncios');
  assert.ok(e.itens.filter((x) => x.sinais.some((s) => s.id === 'novo')).length >= 10);
  assert.ok(e.leitura && e.leitura.frases.length >= 3); console.log('   leitura da IA:', e.leitura.frases.map((f) => f.texto).join(' | ').slice(0, 220));
  assert.ok(e.contagem.sinais.queda === 1 && e.contagem.donos.sem === 13);
  // ordem pela nota: particular e queda vêm primeiro
  assert.ok(['Rua do Dono'].includes(e.itens[0].logradouro) || e.itens[0].sinais.some((s) => s.id === 'queda'));

  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?sinais=queda'), 'filtro queda'); assert.equal(e.total, 1);
  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?sinais=particular,abaixo'), 'dois sinais juntos'); assert.equal(e.total, 0);
  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?q=rua%20velha'), 'busca'); assert.equal(e.total, 1);
  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?ordem=menor&vmax=900000'), 'faixa de preço'); assert.equal(e.total, 2); assert.ok(e.itens[0].valor <= e.itens[1].valor);

  // proprietário: um anúncio com dono consultado sai do filtro "sem" e entra no "com"
  const alvo = por('Rua do Dono') || (await req('cor', 'GET', '/api/fisguei/explorar?q=rua%20do%20dono')).j.itens[0];
  run('INSERT INTO fisguei_pessoas(anuncio_id,chave,nome,consultado,consultado_em) VALUES(?,?,?,1,datetime(\'now\',\'localtime\'))', alvo.id, 'nome:x', 'Fulano');
  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?dono=com'), 'filtro com proprietário'); assert.equal(e.total, 1); assert.equal(e.itens[0].dono, 'consultado');
  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?dono=sem'), 'filtro sem proprietário'); assert.equal(e.total, 12);
  assert.equal(ok(await req('cor', 'GET', '/api/fisguei/explorar/mapa?dono=sem'), 'mapa do filtro').length, 12);

  // créditos: estimado pelo plano até a extensão ler o saldo no Fisgar
  let c = ok(await req('cor', 'GET', '/api/fisguei/creditos'), 'créditos estimados');
  assert.equal(c.fonte, 'estimado'); assert.equal(c.plano, 2200); assert.equal(c.saldo, 2200 - 1); console.log('   consulta feita à mão no Fisgar desconta 1 crédito');
  ok(await req('x', 'POST', '/fisguei-api/creditos', { saldo: 1834, url: '/api/user/me', chave: 'data.credits' }, H), 'extensão manda o saldo do Fisgar');
  c = ok(await req('cor', 'GET', '/api/fisguei/creditos'), 'créditos lidos'); assert.equal(c.fonte, 'fisgar'); assert.equal(c.saldo, 1834);
  run('INSERT INTO fisguei_pedidos(anuncio_id,status,creditos,concluido_em) VALUES(?,?,?,datetime(\'now\',\'localtime\',\'+1 minute\'))', alvo.id, 'concluido', 2);
  c = ok(await req('cor', 'GET', '/api/fisguei/creditos'), 'desconta o gasto depois da leitura'); assert.equal(c.saldo, 1832);
  assert.equal((await req('cor', 'POST', '/api/fisguei/creditos', { saldo: 10 })).s, 403); console.log('ok · corretor não muda o saldo');
  c = ok(await req('adm', 'POST', '/api/fisguei/creditos', { saldo: 1500 }), 'gestor informa o saldo'); assert.equal(c.fonte, 'manual'); assert.equal(c.leitura.saldo, 1500);

  // vários de uma vez para o robô buscar o dono
  const ids = (await req('cor', 'GET', '/api/fisguei/explorar?dono=sem')).j.itens.slice(0, 3).map((x) => x.id);
  const b = ok(await req('cor', 'POST', '/api/fisguei/buscar-anuncios', { ids }), 'buscar dono de vários'); assert.equal(b.criados, 3);
  e = ok(await req('cor', 'GET', '/api/fisguei/explorar?dono=sem'), 'pedidos aparecem no cartão'); assert.equal(e.itens.filter((x) => x.pedido === 'fila').length, 3);

  srv.close();
  console.log('\nFisguei inteligente: tudo certo.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
