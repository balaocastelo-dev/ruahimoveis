// Oportunidades Caixa: o script do tenant não grava sem --apply, a esteira lê
// uma amostra de CSV e a vitrine lista só o imóvel da região que tem foto.
//
// A integração sobe um Postgres temporário (initdb). Sem o binário, ficam só
// as checagens que não precisam de banco — e o teste diz isso.
const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const node = process.execPath;
const senhaDono = 'dono-nao-imprimir-77';
const senhaPapel = 'papel-nao-imprimir-88';
const senhaAdmin = 'admin-nao-imprimir-99';

function roda(script, args, env) {
  return spawnSync(node, [path.join(raiz, script), ...args], {
    encoding: 'utf8',
    cwd: raiz,
    env: { ...process.env, ...env },
  });
}
function saida(r) { return `${r.stdout || ''}\n${r.stderr || ''}`; }

const semUrl = roda('scripts/criar-tenant-oportunidades.mjs', [], { DATABASE_URL: '' });
assert.notEqual(semUrl.status, 0);
assert.match(saida(semUrl), /DATABASE_URL/);
assert.doesNotMatch(saida(semUrl), /postgres:\/\//);
const recusado = roda('scripts/criar-tenant-oportunidades.mjs', ['--apaga'], { DATABASE_URL: '' });
assert.notEqual(recusado.status, 0);
assert.match(saida(recusado), /desconhecido/);
const esteiraSem = roda('scripts/caixa-esteira.js', ['--ajuda']);
assert.equal(esteiraSem.status, 0);
assert.match(esteiraSem.stdout, /caixa-importar/);
const esteiraVazia = roda('scripts/caixa-esteira.js', [], { DATABASE_URL: '' });
assert.notEqual(esteiraVazia.status, 0);
assert.match(saida(esteiraVazia), /DATABASE_URL/);
assert.doesNotMatch(saida(esteiraVazia), new RegExp(senhaDono));
console.log('ok · tenant e esteira não rodam sem DATABASE_URL e não imprimem URL');

function pgBin() {
  const dirs = [process.env.PG_BIN, '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'].filter(Boolean);
  return dirs.find((d) => fs.existsSync(path.join(d, 'initdb'))) || null;
}

const bin = pgBin();
if (!bin) {
  console.log('ok · integração pulada: não achei initdb (defina PG_BIN para rodar o Postgres de teste)');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-oc-'));
const dados = path.join(tmp, 'data');
const porta = 20000 + Math.floor(Math.random() * 20000);
const init = spawnSync(path.join(bin, 'initdb'), ['-D', dados, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C'], { encoding: 'utf8' });
assert.equal(init.status, 0, init.stderr);
const ctl = spawnSync(path.join(bin, 'pg_ctl'), ['-D', dados, '-l', path.join(tmp, 'pg.log'), '-o', `-p ${porta} -k ${tmp} -c listen_addresses=127.0.0.1`, 'start'], { encoding: 'utf8' });
assert.equal(ctl.status, 0, ctl.stderr || ctl.stdout);
const urlDono = `postgres://postgres:${senhaDono}@127.0.0.1:${porta}/postgres`;

function psql(sql) {
  const r = spawnSync(path.join(bin, 'psql'), ['-h', '127.0.0.1', '-p', String(porta), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
}
function sqlArquivo(arquivo) {
  const r = spawnSync(path.join(bin, 'psql'), ['-h', '127.0.0.1', '-p', String(porta), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', arquivo], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${arquivo}\n${r.stderr || r.stdout}`);
}

(async () => {
let servidor;
try {
  psql('SELECT 1');
  psql('CREATE SCHEMA IF NOT EXISTS extensions');
  const compartilhado = ['ru', 'ah'].join('');
  const molde = fs.readFileSync(path.join(raiz, 'sql', 'schema.sql'), 'utf8').replace(/\bbase\b/g, compartilhado);
  const arqMolde = path.join(tmp, 'schema-compartilhado.sql');
  fs.writeFileSync(arqMolde, molde);
  sqlArquivo(arqMolde);
  sqlArquivo(path.join(raiz, 'sql', 'plataforma.sql'));
  const um = (sql) => {
    const r = spawnSync(path.join(bin, 'psql'), ['-h', '127.0.0.1', '-p', String(porta), '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    return r.stdout.trim();
  };
  assert.equal(um("SELECT count(*) FROM pg_namespace WHERE nspname = 'base'"), '0');
  assert.equal(um(`SELECT count(*) FROM pg_namespace WHERE nspname = '${compartilhado}'`), '1');
  for (const s of ['l7inteligencia', 'cademeuap', 'ondemorar', 'casaprado', 'lumen']) {
    psql(`CREATE SCHEMA ${s}`);
    psql(`CREATE TABLE ${s}.imoveis (id integer)`);
    psql(`CREATE ROLE ${s}_app LOGIN PASSWORD 'teste-papel-88'`);
  }
  console.log('ok · só o schema compartilhado de produção e a plataforma; base não existe');

  const envDono = {
    DATABASE_URL: urlDono,
    OPORTUNIDADES_APP_SENHA: senhaPapel,
    OPORTUNIDADES_ADMIN_SENHA: senhaAdmin,
  };
  const seco = roda('scripts/criar-tenant-oportunidades.mjs', [], envDono);
  assert.equal(seco.status, 0, saida(seco));
  assert.match(seco.stdout, /Dry-run/);
  assert.match(seco.stdout, new RegExp(compartilhado));
  assert.doesNotMatch(seco.stdout, /CREATE SCHEMA base|criei o schema base/i);
  assert.doesNotMatch(saida(seco), new RegExp(senhaDono));
  assert.doesNotMatch(saida(seco), new RegExp(senhaPapel));
  assert.doesNotMatch(saida(seco), new RegExp(senhaAdmin));
  assert.equal(psql("SELECT count(*) FROM plataforma.imobiliarias WHERE slug = 'oportunidades'").includes('0'), true);
  console.log('ok · dry-run mostra o plano e não grava');

  const aplicar = roda('scripts/criar-tenant-oportunidades.mjs', ['--apply'], envDono);
  assert.equal(aplicar.status, 0, saida(aplicar));
  assert.match(aplicar.stdout, /Aplicado/);
  assert.doesNotMatch(saida(aplicar), new RegExp(senhaDono));
  assert.doesNotMatch(saida(aplicar), new RegExp(senhaPapel));
  assert.doesNotMatch(saida(aplicar), new RegExp(senhaAdmin));
  const deNovo = roda('scripts/criar-tenant-oportunidades.mjs', ['--apply'], envDono);
  assert.equal(deNovo.status, 0, saida(deNovo));
  assert.match(psql("SELECT nome FROM plataforma.imobiliarias WHERE slug = 'oportunidades'"), /Oportunidades Caixa/);
  assert.match(psql("SELECT count(*) FROM pg_roles WHERE rolname = 'oportunidades_app'"), /\n\s*1/);
  assert.match(psql('SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = \'oportunidades\' AND c.relname = \'caixa_imoveis\''), /v/);
  assert.match(psql('SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = \'oportunidades\' AND c.relname = \'fachadas\''), /v/);
  assert.equal(um(`SELECT to_regclass('${compartilhado}.fachadas')`), `${compartilhado}.fachadas`);
  assert.equal(um(`SELECT to_regclass('${compartilhado}.caixa_imoveis')`), `${compartilhado}.caixa_imoveis`);
  assert.equal(um(`SELECT to_regclass('${compartilhado}.caixa_vizinhanca')`), `${compartilhado}.caixa_vizinhanca`);
  assert.equal(um("SELECT count(*) FROM pg_namespace WHERE nspname = 'base'"), '0');
  for (const s of ['oportunidades', 'l7inteligencia', 'cademeuap', 'ondemorar', 'casaprado', 'lumen']) {
    assert.equal(um(`SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${s}' AND c.relname = 'caixa_imoveis'`), 'v', s);
    assert.ok(um(`SELECT pg_get_viewdef('${s}.caixa_imoveis'::regclass, true)`).includes(compartilhado), s);
    assert.equal(um(`SELECT has_table_privilege('${s}_app', '${s}.caixa_imoveis', 'SELECT')`), 't', s);
  }
  const corrige = roda('scripts/corrigir-schema-tenants.mjs', ['--apply'], envDono);
  assert.equal(corrige.status, 0, saida(corrige));
  assert.equal(um("SELECT count(*) FROM pg_namespace WHERE nspname = 'base'"), '0');
  assert.match(psql("SELECT count(*) FROM oportunidades.usuarios"), /\n\s*1/);
  console.log('ok · --apply cria o tenant, é idempotente e não imprime senha');

  const fotos = path.join(tmp, 'fotos');
  fs.mkdirSync(fotos);
  const sharp = require('sharp');
  async function jpeg(nome, cor, rotulo) {
    const svg = `<svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="800" fill="${cor}"/>
      <rect x="160" y="250" width="960" height="430" fill="#f7f4ee"/>
      <rect x="230" y="320" width="200" height="150" fill="${cor}"/>
      <rect x="500" y="320" width="200" height="150" fill="${cor}"/>
      <rect x="770" y="320" width="200" height="150" fill="${cor}"/>
      <rect x="560" y="500" width="160" height="180" fill="#6b5323"/>
      <text x="640" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="#1f1b16">${rotulo}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(path.join(fotos, nome));
    assert.ok(fs.statSync(path.join(fotos, nome)).size > 1500, nome);
  }
  await jpeg('8444431067520.jpg', '#c4a46a', 'Apartamento · Cambui');
  await jpeg('1444418696260.jpg', '#8aa08a', 'Casa · Jardim Prova');
  await jpeg('0000000001002.jpg', '#8d8a84', 'Fora da regiao');

  const est = roda('scripts/caixa-esteira.js', [
    '--arquivo', path.join(raiz, 'test', 'fixtures', 'caixa-amostra.csv'),
    '--pasta', fotos,
    '--sem-rede',
    '--imobiliaria', 'oportunidades',
  ], envDono);
  assert.equal(est.status, 0, saida(est));
  assert.match(est.stdout, new RegExp(compartilhado));
  assert.equal(um(`SELECT count(*)::int FROM ${compartilhado}.caixa_imoveis`), '4');
  assert.equal(um("SELECT count(*) FROM pg_namespace WHERE nspname = 'base'"), '0');
  assert.match(est.stdout, /ficaram de fora por nao ter foto/);
  assert.doesNotMatch(saida(est), new RegExp(senhaDono));
  const carteira = psql("SELECT codigo || ' ' || origem || ' ' || origem_ref || ' ' || status FROM oportunidades.imoveis ORDER BY codigo");
  assert.match(carteira, /CX0001 caixa 1444418696260 publicado/);
  assert.match(carteira, /CX0002 caixa 8444431067520 publicado/);
  assert.doesNotMatch(carteira, /0000000001001/);
  assert.doesNotMatch(carteira, /0000000001002/);
  console.log('ok · esteira leva para a carteira só a RMC com foto');

  // O worker do app desliga SSL quando a URL diz "localhost". 127.0.0.1 cairia
  // no caminho com SSL, e este Postgres de teste não fala SSL.
  process.env.DATABASE_URL = `postgres://oportunidades_app:${senhaPapel}@localhost:${porta}/postgres`;
  process.env.SECRET_KEY = 'x'.repeat(48);
  process.env.TEMA = 'oportunidades';
  process.env.CLIENTE_NOME = 'Oportunidades Caixa';
  process.env.EMPRESA = 'Oportunidades Caixa';
  process.env.IA_MODO = 'desligado';
  process.env.ESCRITORIO = '0';
  process.env.RADAR_PORTAIS = '0';
  process.env.BLOG_DIARIO = 'false';
  process.env.BAIRROS = 'false';
  process.env.PORTAL_CONTEUDO_URL = 'http://127.0.0.1:9/nenhum';
  process.env.PORT = '0';
  const app = require(path.join(raiz, 'server.js'));
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const home = await fetch(base + '/');
  const homeHtml = await home.text();
  assert.equal(home.status, 200);
  assert.match(homeHtml, /Oportunidades Caixa/);
  assert.match(homeHtml, /\/imoveis/);

  const lista = await fetch(base + '/imoveis');
  const listaHtml = await lista.text();
  assert.equal(lista.status, 200, listaHtml.slice(0, 300));
  assert.match(listaHtml, /Oportunidades Caixa/);
  assert.match(listaHtml, /CX0001|CX0002/);
  assert.match(listaHtml, /\/imoveis\/foto\/\d+/);
  assert.match(listaHtml, /Cambui|Valinhos/);

  const dadosJson = await (await fetch(base + '/imoveis/dados.json')).json();
  assert.equal(dadosJson.imoveis.length, 2);
  assert.ok(dadosJson.imoveis.every((i) => i.fotos.length >= 1));
  const primeiro = dadosJson.imoveis.find((i) => i.codigo === 'CX0002');
  assert.ok(primeiro, 'o apartamento de Campinas com foto entra na vitrine');

  const slug = (listaHtml.match(/class="p-cartao-img" href="\/imoveis\/([^"]+)"/) || [])[1];
  assert.ok(slug, 'a vitrine não apontou a página de um imóvel');
  const ficha = await fetch(`${base}/imoveis/${slug}`);
  const fichaHtml = await ficha.text();
  assert.equal(ficha.status, 200, fichaHtml.slice(0, 240));
  const fotoId = (fichaHtml.match(/\/imoveis\/foto\/(\d+)/) || [])[1];
  assert.ok(fotoId, 'a página do imóvel aponta para a foto');
  const foto = await fetch(base + '/imoveis/foto/' + fotoId);
  const tipo = foto.headers.get('content-type') || '';
  const bytes = Buffer.from(await foto.arrayBuffer());
  assert.equal(foto.status, 200);
  assert.match(tipo, /image\/jpeg/);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);

  const oc = await fetch(base + '/oportunidades');
  const ocHtml = await oc.text();
  assert.equal(oc.status, 200, ocHtml.slice(0, 240));
  assert.match(ocHtml, /8444431067520/);
  assert.match(ocHtml, /43\.534/);
  assert.match(ocHtml, /na Caixa/);
  const ocFoto = await fetch(base + '/oportunidades/8444431067520/foto');
  const ocBytes = Buffer.from(await ocFoto.arrayBuffer());
  assert.equal(ocFoto.status, 200);
  assert.match(ocFoto.headers.get('content-type') || '', /image\/jpeg/);
  assert.equal(ocBytes[0], 0xff);
  console.log('ok · home, /imoveis, ficha e /oportunidades servem o imóvel com foto');

  console.log('FICHA /imoveis/' + slug);
  if (process.argv.includes('--servir')) {
    console.log('SERVIDOR ' + base);
    console.log('TMP ' + tmp);
    console.log('PORTA ' + porta);
    await new Promise(() => {});
  }
} finally {
  if (!process.argv.includes('--servir')) {
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    spawnSync(path.join(bin, 'pg_ctl'), ['-D', dados, 'stop', '-m', 'fast'], { encoding: 'utf8' });
  }
}
})().catch((e) => {
  console.error(e);
  try { spawnSync(path.join(bin, 'pg_ctl'), ['-D', dados, 'stop', '-m', 'fast'], { encoding: 'utf8' }); } catch {}
  process.exit(1);
});
