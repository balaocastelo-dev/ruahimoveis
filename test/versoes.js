// Teste das versões Revista e Signature do portal: banco temporário com um imóvel
// comum (com página aprovada) e uma residência acima de R$ 10 milhões (sem página),
// um ramo de conteúdo falso, o Clube Signature (lead + cookie assinado) e o valor
// reservado nas páginas comuns.
//   node test/versoes.js
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-versoes-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL;

const cfg = require('../src/config');
const { run, one, all } = require('../src/db');

const PASTA = path.join(cfg.DATA_DIR, 'teste-versoes');
fs.mkdirSync(PASTA, { recursive: true });
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA3/9k=', 'base64');
function imovel(codigo, tipo, valor, fotos, extra = '') {
  const id = Number(run(`INSERT INTO imoveis(codigo,tipo,status,logradouro,numero,bairro,cidade,uf,quartos,suites,vagas,area_util,area_total,valor,descricao)
    VALUES(?,?,'publicado','Rua Secreta','77','Jardim Exemplo','Campinas','SP',3,3,2,240,450,?,?)`, codigo, tipo, valor, `Descrição ${extra}`).lastInsertRowid);
  for (const f of fotos) {
    fs.writeFileSync(path.join(PASTA, `f${f}.jpg`), jpg);
    run('INSERT INTO arquivos(id,imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?,?)', f, id, 'Fotos', `f${f}.jpg`, 'image/jpeg', jpg.length, `teste-versoes/f${f}.jpg`);
  }
  return id;
}
const comumId = imovel('CA9001', 'Casa em condomínio', 1890000, [9101, 9102, 9103, 9104, 9105, 9106, 9107]);
imovel('SG9001', 'Casa em condomínio', 12500000, [9201, 9202, 9203, 9204]);
imovel('AR9001', 'Terreno', 18000000, [9301]);

const modelo = JSON.parse(fs.readFileSync(path.join(__dirname, 'portal-exemplo.json'), 'utf8'));
const pagina = { ...modelo, versao: 'qualquer', publicadoEm: new Date(Date.now() - 3600e3).toISOString() };
const ramo = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const corpo = p === '/indice.json' ? { paginas: [{ codigo: pagina.codigo, slug: pagina.slug, titulo: pagina.titulo, resumo: pagina.resumo, capa: pagina.capa, versao: pagina.versao, publicadoEm: pagina.publicadoEm }] }
    : p === '/paginas/CA9001.json' ? pagina : null;
  if (!corpo) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(corpo));
}).listen(0, async () => {
  process.env.PORTAL_CONTEUDO_URL = `http://127.0.0.1:${ramo.address().port}`;
  process.env.BLOG_DIARIO_URL = `http://127.0.0.1:${ramo.address().port}/blog`;
  const app = require('../server');
  const fonte = require('../src/portal/fonte');
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p, cookie) => { const r = await fetch(url + p, { redirect: 'manual', headers: cookie ? { cookie } : {} }); return { s: r.status, t: await r.text(), h: r.headers }; };
  const post = async (p, b) => { const r = await fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json(), h: r.headers }; };
  try {
    // ---- o seletor nas três formas
    const vit = await get('/imoveis');
    assert.equal(vit.s, 200);
    assert.ok(vit.t.includes('href="/imoveis/revista"') && vit.t.includes('href="/imoveis/signature"')); console.log('ok · vitrine com o seletor Vitrine · Revista · Signature');

    // ---- revista
    const rev = await get('/imoveis/revista');
    assert.equal(rev.s, 200);
    assert.ok(rev.t.includes('A casa que respira') && rev.t.includes(modelo.titulo.slice(0, 30)), 'ensaio + imóvel da página aprovada');
    assert.ok(!rev.t.includes('Altura, luz e o horizonte'), 'capítulo sem imóvel não aparece');
    assert.ok(!rev.t.includes('SG9001') && !rev.t.includes('Rua Secreta'), 'sem Signature e sem endereço');
    assert.ok(rev.t.includes('CollectionPage') && rev.t.includes('/imoveis/signature'));
    assert.match(rev.h.get('content-security-policy'), /raw\.githubusercontent\.com/); console.log('ok · revista: ensaios com os imóveis entre os textos, capítulos vazios saem');

    // ---- signature sem ser membro
    const sig = await get('/imoveis/signature');
    assert.equal(sig.s, 200);
    assert.match(sig.h.get('cache-control'), /private/); assert.match(sig.h.get('cache-control'), /no-store/);
    assert.ok(sig.t.includes('/imoveis/foto/9201') && sig.t.includes('Áreas e ativos'));
    assert.ok(!sig.t.includes('12.500.000') && !sig.t.includes('18.000.000'), 'valor escondido');
    assert.ok(!sig.t.includes('CA9001') && !sig.t.includes('Rua Secreta') && !sig.t.includes('/imoveis/foto/9301'), 'só acima do limite, sem endereço, ativo sem foto');
    assert.ok(sig.t.includes('data-clube')); console.log('ok · Signature: só acima de R$ 10 mi, valores fechados, nunca em cache');
    const res1 = await get('/imoveis/signature/sg9001');
    assert.equal(res1.s, 200); assert.ok(res1.t.includes('noindex') && !res1.t.includes('12.500.000') && res1.t.includes('name="codigo" value="SG9001"'));
    assert.equal((await get('/imoveis/signature/ca9001')).s, 404); console.log('ok · página da residência, sem valor; imóvel comum não entra');

    // ---- clube
    assert.equal((await post('/api/publico/portal/signature', { nome: 'Rui', telefone: '1', aceite: true })).s, 400);
    const r = await post('/api/publico/portal/signature', { nome: 'Rui Investidor', telefone: '(19) 99111-2222', email: 'rui@exemplo.com', codigo: 'SG9001', aceite: true });
    assert.equal(r.s, 200, JSON.stringify(r.j));
    const cookie = (r.h.get('set-cookie') || '').split(';')[0];
    assert.match(cookie, /^ruah_signature=\d+\.\d{13}\.[A-Za-z0-9_-]{32}$/);
    const lead = one("SELECT * FROM leads WHERE telefone='5519991112222'");
    assert.ok(lead && lead.origem === 'RUAH Signature' && lead.temperatura === 'quente' && /SG9001/.test(lead.busca));
    assert.ok(all('SELECT * FROM interacoes WHERE lead_id=?', lead.id).some((i) => /Clube Signature/.test(i.texto))); console.log('ok · pedido de acesso vira lead quente "RUAH Signature" e devolve o cookie');
    const sigM = await get('/imoveis/signature', cookie);
    assert.ok(sigM.t.includes('R$ 12.500.000') && sigM.t.includes('R$ 18.000.000') && sigM.t.includes('Membro do Clube Signature'));
    const resM = await get('/imoveis/signature/sg9001', cookie);
    assert.ok(resM.t.includes('R$ 12.500.000') && resM.t.includes('data-interesse')); console.log('ok · membro vê os valores e pede visita privada');
    const falso = cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    assert.ok(!(await get('/imoveis/signature', falso)).t.includes('12.500.000'));
    const vencido = `ruah_signature=${lead.id}.${Date.now() - 1000}.${'a'.repeat(32)}`;
    assert.ok(!(await get('/imoveis/signature', vencido)).t.includes('12.500.000')); console.log('ok · cookie alterado ou vencido não libera nada');

    // ---- visita privada pela página da residência (sem página no portal comum)
    const v = await post('/api/publico/portal/interesse', { codigo: 'SG9001', nome: 'Rui Investidor', telefone: '(19) 99111-2222', visita: true, periodo: 'Tarde', aceite: true });
    assert.equal(v.s, 200, JSON.stringify(v.j)); console.log('ok · pedido de visita da Signature chega ao CRM');

    // ---- página comum de imóvel acima do limite: valor reservado
    run('UPDATE imoveis SET valor=15000000 WHERE id=?', comumId); fonte.limparCache();
    const pg = await get(`/imoveis/${modelo.slug}`);
    assert.equal(pg.s, 200);
    assert.ok(!pg.t.includes('15.000.000') && pg.t.includes('RUAH Signature') && !pg.t.includes('"price"'));
    const vit2 = await get('/imoveis');
    assert.ok(!vit2.t.includes('15.000.000') && vit2.t.includes('/imoveis/signature/ca9001'));
    assert.ok(!(await get('/imoveis?de=10000000')).t.includes(modelo.titulo.slice(0, 30)), 'filtro de valor não denuncia o valor');
    const rev2 = await get('/imoveis/revista');
    assert.ok(!rev2.t.includes(modelo.titulo.slice(0, 30)), 'revista não mostra imóvel da Signature');
    assert.ok((await get('/imoveis/signature', cookie)).t.includes('R$ 15.000.000')); console.log('ok · acima de R$ 10 mi o valor some do portal comum e vai para a Signature');

    console.log('\nVersões OK');
  } finally { srv.close(); ramo.close(); }
  process.exit(0);
});
