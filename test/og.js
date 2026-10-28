// Prévia do link interno (/v/<token>) e da página pública do imóvel.
// O robô do WhatsApp não executa JavaScript e não pode contar como acesso.
const os = require('os'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-og-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL;
delete process.env.PUBLIC_URL;
delete process.env.PORTAL_URL;
delete process.env.BLOG_URL;

const sharp = require('sharp');
const og = require('../src/og');
const cfg = require('../src/config');
const { run, one } = require('../src/db');

assert.equal(og.ehPreview('WhatsApp/2.23.20.0 A'), true);
assert.equal(og.ehPreview('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'), true);
assert.equal(og.ehPreview('TelegramBot (like TwitterBot)'), true);
assert.equal(og.ehPreview('Twitterbot/1.0'), true);
assert.equal(og.ehPreview('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'), true);
assert.equal(og.ehPreview('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'), true);
assert.equal(og.ehPreview('LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'), true);
assert.equal(og.ehPreview('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0'), true);
// Quem abre o link dentro do WhatsApp é visita, não robô de prévia.
assert.equal(og.ehPreview('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.20.0'), false);
assert.equal(og.ehPreview('Mozilla/5.0 Chrome/120'), false);
assert.equal(og.ehPreview(''), false);
assert.equal(og.origemPublica({ protocol: 'http', get: () => 'ruahimoveis.vercel.app' }), 'https://ruahimoveis.vercel.app');
assert.equal(og.origemPublica({ protocol: 'http', get: () => '127.0.0.1:3333' }), 'http://127.0.0.1:3333');
assert.equal(og.origemPublica({ protocol: 'http', get: () => 'evil host"><script>' }), '');
assert.deepEqual(og.dimensoesSaida(2000, 1400), { width: 1200, height: 840 });
assert.ok(og.dimensoesSaida(1, 1).width >= 300 && og.dimensoesSaida(1, 1).height >= 300);
console.log('ok · robô de prévia, URL https e tamanho da capa');

(async () => {
  const pasta = path.join(cfg.DATA_DIR, 'teste-og');
  fs.mkdirSync(pasta, { recursive: true });
  const png = await sharp({ create: { width: 2000, height: 1400, channels: 3, background: { r: 32, g: 84, b: 130 } } }).png().toBuffer();
  assert.equal(og.dimensoesImagem(png).width, 2000);
  assert.equal(og.dimensoesImagem(png).height, 1400);
  const ruido = crypto.randomBytes(1600 * 1000 * 3);
  const grande = await sharp(ruido, { raw: { width: 1600, height: 1000, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(path.join(pasta, 'capa.png'), png);
  fs.writeFileSync(path.join(pasta, 'ruido.jpg'), grande);

  const dono = Number(run(`INSERT INTO proprietarios(nome, cpf, telefone) VALUES('Zulmira Proprietaria Oculta','11144477735','19988887777')`).lastInsertRowid);
  const im = Number(run(`INSERT INTO imoveis(codigo,tipo,status,logradouro,numero,unidade,bairro,cidade,uf,quartos,suites,vagas,area_util,valor,descricao,proprietario_id)
    VALUES('CA0036','Casa em condomínio','off_market','Rua das Acácias Secretas','9871','Casa 4','Quinta da Baroneza','Itatiba','SP',4,3,4,420,4500000,?,?)`,
    'Texto longo da Zulmira Proprietaria Oculta na Rua das Acácias Secretas.', dono).lastInsertRowid);
  run(`INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?)`,
    im, 'Documentos do proprietário', 'segredo-matricula.pdf', 'application/pdf', 20, null);
  const relPng = path.relative(cfg.DATA_DIR, path.join(pasta, 'capa.png'));
  const fotoId = Number(run(`INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?)`,
    im, 'Fotos', 'capa.png', 'image/png', png.length, relPng).lastInsertRowid);
  run(`INSERT INTO links_internos(token,imovel_id,mostrar_endereco,expira_em) VALUES(?,?,0,datetime('now','localtime','+7 day'))`, 'token-og-privado', im);
  run(`INSERT INTO links_internos(token,imovel_id,mostrar_endereco,expira_em) VALUES(?,?,1,datetime('now','localtime','+7 day'))`, 'token-og-endereco', im);
  const linkA = one('SELECT id FROM links_internos WHERE token=?', 'token-og-privado').id;

  const im2 = Number(run(`INSERT INTO imoveis(codigo,tipo,status,bairro,cidade,quartos,area_util,valor) VALUES('CA0037','Casa','off_market','Nova Campinas','Campinas',3,180,1200000)`).lastInsertRowid);
  const relJpg = path.relative(cfg.DATA_DIR, path.join(pasta, 'ruido.jpg'));
  run(`INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?)`,
    im2, 'Fotos', 'ruido.jpg', 'image/jpeg', grande.length, relJpg);
  run(`INSERT INTO links_internos(token,imovel_id,mostrar_endereco,expira_em) VALUES(?,?,0,datetime('now','localtime','+7 day'))`, 'token-og-grande', im2);

  const app = require('../server');
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const acessos = (id) => one('SELECT count(*) n FROM links_acessos WHERE link_id=?', id).n;
  const head = (html) => html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  try {
    const r = await fetch(`${base}/v/token-og-privado`, { headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' } });
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(r.headers.get('cache-control'), /no-store/);
    const hd = head(html);
    console.log(hd.split('\n').filter((l) => /<title>|og:|twitter:|robots/.test(l)).join('\n'));
    assert.ok(hd.includes('property="og:title" content="Casa em condomínio · Quinta da Baroneza · CA0036"'), hd);
    assert.ok(hd.includes('property="og:description" content="R$ 4.500.000 · 420 m² · 4 quartos · 3 suítes · 4 vagas"'), hd);
    assert.ok(hd.includes('property="og:site_name" content="RUAH"'));
    assert.ok(hd.includes('property="og:type" content="website"'));
    assert.ok(hd.includes(`property="og:url" content="${base}/v/token-og-privado"`));
    assert.ok(hd.includes('name="twitter:card" content="summary_large_image"'));
    assert.ok(hd.includes('property="og:image:width" content="1200"'), hd);
    assert.ok(hd.includes('property="og:image:height" content="840"'), hd);
    assert.ok(hd.includes('name="robots" content="noindex"'));
    assert.ok(html.includes('/imovel.js') && html.includes('Carregando'), 'a página do visitante continua a mesma');
    assert.ok(!html.includes('Zulmira') && !html.includes('Acácias') && !html.includes('9871') && !html.includes('Casa 4') && !html.includes('segredo-matricula'));
    assert.equal(acessos(linkA), 0, 'buscar o HTML não conta acesso');

    const imgUrl = /property="og:image" content="([^"]+)"/.exec(hd)[1].replace(/&amp;/g, '&');
    assert.ok(imgUrl.startsWith(`${base}/v/token-og-privado/og.jpg`), imgUrl);
    const img = await fetch(imgUrl, { headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' } });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    const buf = Buffer.from(await img.arrayBuffer());
    assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8);
    assert.ok(buf.length <= 600 * 1024, buf.length);
    const dim = og.dimensoesImagem(buf);
    assert.equal(dim.width, 1200); assert.equal(dim.height, 840);
    assert.ok(dim.width >= 300 && dim.height >= 300);
    assert.equal(acessos(linkA), 0, 'buscar a capa não conta acesso');
    assert.equal((await fetch(`${base}/imoveis/foto/${fotoId}`)).status, 404, 'foto off-market não entra no portal');
    console.log('ok · HTML com Open Graph e JPEG', dim.width + 'x' + dim.height, buf.length, 'bytes');

    const robos = [
      'WhatsApp/2.23.20.0 A',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'TelegramBot (like TwitterBot)',
      'Twitterbot/1.0',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'LinkedInBot/1.0',
    ];
    for (const ua of robos) {
      const j = await fetch(`${base}/api/publico/imovel/token-og-privado`, { headers: { 'User-Agent': ua } });
      assert.equal(j.status, 200, ua);
      const corpo = await j.json();
      assert.equal(corpo.codigo, 'CA0036');
      assert.equal(corpo.endereco, null);
      assert.ok(!('proprietario' in corpo));
    }
    assert.equal(acessos(linkA), 0, 'robô de prévia não entra no contador');
    const inApp = await fetch(`${base}/api/publico/imovel/token-og-privado`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.20.0' } });
    assert.equal((await inApp.json()).codigo, 'CA0036');
    assert.equal(acessos(linkA), 1, 'abrir dentro do WhatsApp conta');
    await (await fetch(`${base}/api/publico/imovel/token-og-privado`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' } })).json();
    assert.equal(acessos(linkA), 2);
    await fetch(`${base}/v/token-og-privado`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' } });
    assert.equal(acessos(linkA), 2, 'abrir a página no navegador não conta de novo');
    console.log('ok · contador ignora robô e conta visita');

    const comEnd = await (await fetch(`${base}/v/token-og-endereco`, { headers: { 'User-Agent': 'WhatsApp/2.23' } })).text();
    assert.ok(comEnd.includes('Rua das Acácias Secretas, 9871'));
    assert.ok(!comEnd.includes('Zulmira') && !comEnd.includes('11144477735') && !comEnd.includes('Casa 4'));
    const apiEnd = await (await fetch(`${base}/api/publico/imovel/token-og-endereco`)).json();
    assert.equal(apiEnd.endereco, 'Rua das Acácias Secretas, 9871');
    console.log('ok · rua só com mostrar_endereco; dono nunca aparece');

    assert.ok(grande.length > 600 * 1024, `fixture ${grande.length} deveria passar de 600 KB`);
    const g = await fetch(`${base}/v/token-og-grande/og.jpg`, { headers: { 'User-Agent': 'WhatsApp/2.23' } });
    const gb = Buffer.from(await g.arrayBuffer());
    assert.equal(g.status, 200);
    assert.equal(g.headers.get('content-type'), 'image/jpeg');
    assert.ok(gb.length <= 600 * 1024, gb.length);
    const gd = og.dimensoesImagem(gb);
    assert.ok(gd.width >= 300 && gd.height >= 300, `${gd.width}x${gd.height}`);
    console.log('ok · foto grande vira JPEG de', gd.width + 'x' + gd.height, gb.length, 'bytes (origem', grande.length + ')');

    const antes = acessos(linkA);
    run(`UPDATE links_internos SET expira_em=datetime('now','localtime','-2 minute') WHERE token=?`, 'token-og-privado');
    const exp = await (await fetch(`${base}/v/token-og-privado`, { headers: { 'User-Agent': 'WhatsApp/2.23' } })).text();
    assert.ok(exp.includes('property="og:title" content="Imóvel · RUAH"'));
    assert.ok(exp.includes('property="og:site_name" content="RUAH"'));
    assert.ok(exp.includes('name="twitter:card" content="summary"'));
    assert.ok(!exp.includes('CA0036') && !exp.includes('Quinta da Baroneza') && !exp.includes('4.500.000') && !exp.includes('property="og:image"'));
    assert.equal((await fetch(`${base}/v/token-og-privado/og.jpg`)).status, 404);
    assert.equal((await fetch(`${base}/api/publico/imovel/token-og-privado`)).status, 404);
    assert.equal(acessos(linkA), antes);
    console.log('ok · link expirado ou revogado não vaza o imóvel');

    const inv = await (await fetch(`${base}/v/nao-existe-xyz`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } })).text();
    assert.ok(inv.includes('Imóvel · RUAH') && !inv.includes('CA0036') && !inv.includes('Quinta'));
    const xss = await (await fetch(`${base}/v/${encodeURIComponent('"><script>alert(1)</script>')}`, { headers: { 'User-Agent': 'WhatsApp/2.23' } })).text();
    assert.ok(!xss.includes('alert(1)') && xss.includes('Imóvel · RUAH'));
    console.log('ok · token inválido fica genérico');

    run(`UPDATE imoveis SET status='vendido' WHERE id=?`, im);
    const ven = await (await fetch(`${base}/v/token-og-endereco`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } })).text();
    assert.ok(!ven.includes('CA0036') && !ven.includes('Acácias') && !ven.includes('Zulmira'));
    assert.equal((await fetch(`${base}/v/token-og-endereco/og.jpg`)).status, 404);
    run(`UPDATE imoveis SET status='suspenso' WHERE id=?`, im2);
    assert.equal((await fetch(`${base}/v/token-og-grande/og.jpg`)).status, 404);
    const sus = await (await fetch(`${base}/v/token-og-grande`, { headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' } })).text();
    assert.ok(!sus.includes('CA0037') && !sus.includes('Nova Campinas'));
    console.log('ok · vendido ou suspenso não vaza');

    console.log('\nOG OK');
  } finally {
    srv.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
