// A home (/) da Oportunidades anunciava /temas/oportunidades/logo.png, que não
// existe. O arquivo do tema é og.png, 1200×630. Outro tema continua no logo.png.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const { spawnSync } = require('child_process');
const sharp = require('sharp');
const pasta = path.join(__dirname, '..', 'public', 'temas', 'oportunidades', 'og.png');

assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'temas', 'l7inteligencia', 'og.png')), false);

(async () => {
const medida = await sharp(pasta).metadata();
assert.equal(medida.width, 1200);
assert.equal(medida.height, 630);
assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'temas', 'oportunidades', 'logo.png')), false);
assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'temas', 'l7inteligencia', 'og.png')), false);
console.log('ok · og.png da Oportunidades é 1200×630 e não há logo.png nesse tema');

function sobe(tema, nome) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-og-'));
  const script = `
    process.env.HOUSE_DB = ${JSON.stringify(path.join(tmp, 't.db'))};
    process.env.SECRET_KEY = ${JSON.stringify('x'.repeat(48))};
    process.env.IA_MODO = 'desligado';
    process.env.BLOG_DIARIO = 'false';
    process.env.ESCRITORIO = '0';
    process.env.RADAR_PORTAIS = '0';
    process.env.TEMA = ${JSON.stringify(tema)};
    process.env.CLIENTE_NOME = ${JSON.stringify(nome)};
    process.env.EMPRESA = ${JSON.stringify(nome)};
    delete process.env.DATABASE_URL;
    const raiz = ${JSON.stringify(path.join(__dirname, '..'))};
    process.chdir(raiz);
    const { run } = require(raiz + '/src/db');
    run("INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES('Adm','adm@teste.local','adm','x')");
    const app = require(raiz + '/server');
    const srv = app.listen(0, '127.0.0.1', async () => {
      const base = 'http://127.0.0.1:' + srv.address().port;
      try {
        const home = await (await fetch(base + '/')).text();
        const lista = await (await fetch(base + '/imoveis')).text();
        process.stdout.write(JSON.stringify({ home, lista }));
      } finally { srv.close(); }
    });
  `;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const i = r.stdout.indexOf('{');
  return JSON.parse(r.stdout.slice(i));
}

  const oc = sobe('oportunidades', 'Oportunidades Caixa');
  assert.match(oc.home, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/temas\/oportunidades\/og\.png"/);
  assert.match(oc.home, /name="twitter:image" content="http:\/\/127\.0\.0\.1:\d+\/temas\/oportunidades\/og\.png"/);
  assert.ok(oc.home.includes('content="1200"'));
  assert.ok(oc.home.includes('content="630"'));
  assert.ok(!oc.home.includes('logo.png'));
  assert.match(oc.lista, /\/temas\/oportunidades\/og\.png/);
  assert.match(oc.lista, /name="twitter:image"/);
  console.log('ok · home e /imoveis da Oportunidades apontam og e twitter para og.png');

  const l7 = sobe('l7inteligencia', 'L7 Inteligência Imobiliária');
  assert.match(l7.home, /\/temas\/l7inteligencia\/logo\.png/);
  assert.ok(!l7.home.includes('/temas/l7inteligencia/og.png'));
  assert.match(l7.home, /name="twitter:image" content="http:\/\/127\.0\.0\.1:\d+\/temas\/l7inteligencia\/logo\.png"/);
  console.log('ok · a L7 continua com o logo.png no og:image');
})().catch((e) => { console.error(e); process.exit(1); });
