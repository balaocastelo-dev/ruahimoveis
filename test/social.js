// Teste de Redes e publicações: o planejador (cadência do plano, rodízio, sem duplicar), as artes (tamanhos,
// assinatura, Signature sem preço), a edição/aprovação/troca na tela, a publicação nas redes (Meta e Google
// simulados), "pronto para postar" sem conta, o link rastreado que marca a origem do lead e a página /links.
//   node test/social.js
const os = require('os'), path = require('path'), fs = require('fs');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-social-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.PLANO = 'profissional';
process.env.PORTAL_CONTEUDO_URL = 'http://127.0.0.1:9/nada';   // sem ramo: o portal usa as páginas automáticas
process.env.BLOG_DIARIO_URL = 'http://127.0.0.1:9/nada';       // o blog vive só do banco
process.env.BAIRROS_CONTEUDO_URL = 'http://127.0.0.1:9/nada';
process.env.META_APP_ID = '123'; process.env.META_APP_SECRET = 'segredo';
delete process.env.DATABASE_URL;
delete process.env.PORTAL_DEMONSTRACAO;

const sharp = require('sharp');
const cfg = require('../src/config');
const { run, one, all } = require('../src/db');

// ---- Meta e Google simulados
const fetchReal = global.fetch;
const chamadas = [];
global.fetch = async (url, op = {}) => {
  const u = String(url);
  if (u.startsWith('https://graph.facebook.com/')) {
    chamadas.push({ u, corpo: op.body ? String(op.body) : '' });
    if (/\/media\?/.test(u) || /\/media$/.test(u)) return new Response(JSON.stringify({ id: `c${chamadas.length}` }));
    if (/fields=status_code/.test(u)) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    if (/media_publish/.test(u)) return new Response(JSON.stringify({ id: 'ig999' }));
    if (/fields=permalink/.test(u)) return new Response(JSON.stringify({ permalink: 'https://instagram.com/p/xyz' }));
    if (/\/photos/.test(u)) return new Response(JSON.stringify({ id: `fbfoto${chamadas.length}` }));
    if (/\/feed/.test(u)) return new Response(JSON.stringify({ id: 'pg_123' }));
    return new Response(JSON.stringify({ error: { message: 'rota simulada desconhecida' } }), { status: 400 });
  }
  if (u.startsWith('https://oauth2.googleapis.com/token')) { chamadas.push({ u }); return new Response(JSON.stringify({ access_token: 'gtk' })); }
  if (u.startsWith('https://mybusiness.googleapis.com/')) { chamadas.push({ u, corpo: String(op.body || '') }); return new Response(JSON.stringify({ name: 'accounts/1/locations/2/localPosts/9', searchUrl: 'https://g.page/x' })); }
  if (u.startsWith('https://raw.githubusercontent.com/')) return new Response('', { status: 404 });
  return fetchReal(url, op);
};

(async () => {
  // ---- três imóveis à venda (um da seleção Signature), cada um com 4 fotos de verdade
  const PASTA = path.join(cfg.DATA_DIR, 'teste-social');
  fs.mkdirSync(PASTA, { recursive: true });
  let fid = 9500;
  const imovel = async (codigo, tipo, bairro, valor, quartos) => {
    const id = Number(run(`INSERT INTO imoveis(codigo,tipo,status,logradouro,numero,bairro,cidade,uf,quartos,suites,vagas,area_util,valor,descricao)
      VALUES(?,?,'publicado','Rua Secreta','77',?,'Campinas','SP',?,1,2,180,?,'')`, codigo, tipo, bairro, quartos, valor).lastInsertRowid);
    for (let k = 0; k < 4; k++) {
      const buf = await sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 40 + k * 40, g: 90, b: 140 } } }).jpeg().toBuffer();
      fs.writeFileSync(path.join(PASTA, `${codigo}-${k}.jpg`), buf);
      run('INSERT INTO arquivos(id,imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?,?)', ++fid, id, 'Fotos', `${codigo}-${k}.jpg`, 'image/jpeg', buf.length, `teste-social/${codigo}-${k}.jpg`);
    }
    return id;
  };
  await imovel('CA9101', 'Casa em condomínio', 'Gramado', 2350000, 4);
  await imovel('AP9102', 'Apartamento', 'Cambuí', 980000, 3);
  await imovel('CA9103', 'Casa', 'Nova Campinas', 14500000, 5); // Signature: valor nunca aparece

  // ---- um texto do blog (já no ar)
  const artigo = JSON.parse(fs.readFileSync(path.join(__dirname, 'blog-exemplo.json'), 'utf8'));
  const quando = new Date(Date.now() - 2 * 3600e3).toISOString();
  run('INSERT INTO blog_materias(slug, titulo, categoria, publicado_em, conteudo) VALUES (?, ?, ?, ?, ?)', artigo.slug, artigo.titulo, artigo.categoria, quando,
    JSON.stringify({ ...artigo, publicadoEm: quando, capa: { src: `${require('../src/blog/categorias').ENDERECO_DO_BANCO}/capas/${artigo.slug}-0123abcd.jpg`, alt: 'Sala clara com plantas', largura: 1600, altura: 900 } }));

  const app = require('../server');
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body, extra = {}) => {
    const r = await fetchReal(base + url, { method: m, redirect: 'manual', headers: { 'Content-Type': 'application/json', cookie, ...extra }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc && /ruah_s|sess/i.test(sc)) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    const corpo = /image\//.test(tipo) ? Buffer.from(await r.arrayBuffer()) : await r.text();
    let j = corpo; if (typeof corpo === 'string') { try { j = JSON.parse(corpo); } catch { j = corpo; } }
    return { s: r.status, j, h: r.headers };
  };
  try {
    const st = await req('POST', '/api/setup', { nome: 'Thiago Adm', email: 'adm@ruah.com', senha: 'Teste1234' });
    assert.ok(st.s < 400, JSON.stringify(st.j));

    // ---------- planejador
    const tempo = require('../src/social/tempo');
    const d = await req('GET', '/api/social');
    assert.equal(d.s, 200, JSON.stringify(d.j));
    assert.equal(d.j.cadencia.plano, 'profissional');
    const todos = all(`SELECT * FROM social_posts WHERE status<>'cancelado'`);
    const porTipo = (t) => todos.filter((p) => p.tipo === t);
    assert.ok(porTipo('imovel').length >= 30, `imóveis por dia no plano Profissional (${porTipo('imovel').length})`);
    assert.ok(porTipo('revista').length >= 4 && porTipo('revista').every((p) => tempo.diaDaSemana(p.agendado_para.slice(0, 10)) === 6), 'revista uma vez por semana, no sábado');
    assert.equal(porTipo('blog').filter((p) => p.ref === artigo.slug).length, 1, 'o texto do blog sai uma vez');
    assert.equal(new Set(porTipo('blog').map((p) => p.ref)).size, porTipo('blog').length, 'cada texto do blog sai uma vez');
    assert.ok(todos.every((p) => p.agendado_para > tempo.local()), 'só planeja o futuro');
    // rodízio: o mesmo imóvel não sai em dois dias seguidos quando há outros
    const ims = porTipo('imovel').sort((a, b) => (a.agendado_para < b.agendado_para ? -1 : 1));
    for (let i = 1; i < ims.length; i++) assert.notEqual(ims[i].ref, ims[i - 1].ref, 'rodízio de imóveis');
    // a revista nunca leva a seleção Signature
    assert.ok(porTipo('revista').every((p) => !p.slides.includes('CA9103')), 'Signature fora da revista');
    const sig = ims.find((p) => p.ref === 'CA9103');
    assert.ok(sig && !/14\.500\.000/.test(sig.legenda) && /Signature/.test(sig.legenda), 'legenda da Signature sem o valor');
    const r2 = await require('../src/social/gerar').planejar();
    assert.equal(r2.criados, 0, 'planejar de novo não duplica');
    console.log('ok · planejador: cadência do plano, rodízio, revista no sábado, blog uma vez, Signature sem preço, sem duplicar');

    // essencial: só seg/qua/sex para imóveis
    process.env.PLANO = 'essencial'; require('../src/social/planos').limpar();
    const cad = require('../src/social/planos').cadencia();
    assert.deepEqual(cad.imoveis.dias, [1, 3, 5]); assert.equal(cad.resumo.imoveis, 3);
    process.env.PLANO = 'profissional'; require('../src/social/planos').limpar();
    console.log('ok · cadência do Essencial (3 imóveis por semana)');

    // ---------- artes
    const p1 = await req('GET', `/api/social/posts/${ims[0].id}`);
    assert.equal(p1.s, 200);
    assert.equal(p1.j.artes.length, 5, 'capa + 3 fotos + convite final');
    const a0 = await req('GET', p1.j.artes[0].url);
    assert.equal(a0.s, 200); assert.equal(a0.h.get('content-type'), 'image/jpeg');
    const m0 = await sharp(a0.j).metadata(); assert.equal(m0.width, 1080); assert.equal(m0.height, 1350);
    const g0 = await req('GET', p1.j.google); const mg = await sharp(g0.j).metadata(); assert.equal(mg.width, 1200); assert.equal(mg.height, 900);
    for (const a of p1.j.artes.slice(1)) assert.equal((await req('GET', a.url)).s, 200, a.url);
    assert.equal((await req('GET', p1.j.artes[0].url.replace(/s=[0-9a-f]+/, 's=0000000000000000'))).s, 404, 'assinatura errada não abre');
    const rev = ims && porTipo('revista')[0];
    const pr = await req('GET', `/api/social/posts/${rev.id}`);
    for (const a of pr.j.artes) assert.equal((await req('GET', a.url)).s, 200, `revista ${a.url}`);
    const pb = await req('GET', `/api/social/posts/${porTipo('blog').find((p) => p.ref === artigo.slug).id}`);
    assert.equal((await req('GET', pb.j.artes[0].url)).s, 200, 'arte do blog (capa fora do ar: fundo da marca)');
    console.log('ok · artes 1080×1350 e 1200×900, revista, blog, assinatura obrigatória');

    // ---------- tela: editar, cancelar, voltar, trocar, aprovar
    const alvo = ims[2];
    let e = await req('PUT', `/api/social/posts/${alvo.id}`, { legenda: 'Legenda escrita pela equipe.', hashtags: 'campinas #casa' });
    assert.equal(e.s, 200); assert.ok(e.j.editado);
    const lido = await req('GET', `/api/social/posts/${alvo.id}`);
    assert.equal(lido.j.legenda, 'Legenda escrita pela equipe.'); assert.equal(lido.j.hashtags, '#campinas #casa');
    assert.equal((await req('POST', `/api/social/posts/${alvo.id}/cancelar`)).j.status, 'cancelado');
    assert.equal((await req('POST', `/api/social/posts/${alvo.id}/restaurar`)).j.status, 'agendado');
    const tr = await req('POST', `/api/social/posts/${ims[3].id}/trocar`);
    assert.equal(tr.s, 200, JSON.stringify(tr.j)); assert.ok(tr.j.novo, 'trocar põe outro imóvel no mesmo horário');
    const novo = one('SELECT * FROM social_posts WHERE id=?', tr.j.novo);
    assert.equal(novo.agendado_para, ims[3].agendado_para); assert.notEqual(novo.ref, ims[3].ref);
    await req('PUT', '/api/social/ajustes', { modo: 'aprovar' });
    assert.ok(one(`SELECT count(*) n FROM social_posts WHERE status='aguardando'`).n > 10, 'modo aprovar: o futuro passa a esperar');
    const ap = await req('POST', '/api/social/aprovar', { mes: ims[5].agendado_para.slice(0, 7) });
    assert.ok(ap.j.aprovados > 0);
    await req('PUT', '/api/social/ajustes', { modo: 'automatico' });
    assert.equal(one(`SELECT count(*) n FROM social_posts WHERE status='aguardando'`).n, 0);
    console.log('ok · editar legenda e hashtags, tirar e voltar, trocar o imóvel, aprovar o mês');

    // ---------- sem conta: pronto para postar
    const P = require('../src/social/publicar');
    let r = await P.publicar(one('SELECT * FROM social_posts WHERE id=?', ims[4].id), { forcar: true });
    assert.equal(r.status, 'pronto_manual', r.motivo);
    console.log('ok · sem conta conectada: fica pronto para postar à mão');

    // ---------- com contas (Meta e Google simulados)
    const R = require('../src/social/redes');
    R.salvarConta({ rede: 'instagram', conta_id: '1784', nome: 'RUAH', usuario: '@ruah', token: 'tk-pagina', ativo: 1 }, 1);
    R.salvarConta({ rede: 'facebook', conta_id: '555', nome: 'RUAH Imóveis', token: 'tk-pagina', ativo: 1 }, 1);
    R.salvarConta({ rede: 'google', conta_id: 'accounts/1/locations/2', nome: 'RUAH', refresh: 'rf', ativo: 1 }, 1);
    assert.ok(!JSON.stringify(all('SELECT token, refresh FROM social_contas')).includes('tk-pagina'), 'token cifrado no banco');
    run(`UPDATE social_posts SET status='agendado' WHERE id=?`, ims[4].id);
    r = await P.publicar(one('SELECT * FROM social_posts WHERE id=?', ims[4].id));
    assert.equal(r.status, 'publicado', r.motivo);
    const res = JSON.parse(r.resultado);
    assert.ok(res.instagram.ok && res.facebook.ok && res.google.ok, JSON.stringify(res));
    assert.equal(res.instagram.url, 'https://instagram.com/p/xyz');
    const carrossel = chamadas.find((c) => /media_type=CAROUSEL/.test(c.corpo));
    assert.ok(carrossel && /children=/.test(carrossel.corpo), 'Instagram em carrossel');
    assert.ok(chamadas.some((c) => /\/feed/.test(c.u) && /attached_media/.test(c.corpo)), 'Facebook com várias fotos');
    const gp = chamadas.find((c) => /localPosts/.test(c.u));
    assert.ok(gp && /LEARN_MORE/.test(gp.corpo) && /\/r\/\d+g/.test(gp.corpo) && /f=google/.test(gp.corpo), 'Google com a arte 4:3 e o link rastreado');
    assert.ok(chamadas.filter((c) => /image_url=/.test(c.corpo)).every((c) => /social%2Farte/.test(c.corpo)), 'a Meta busca as artes no endereço público');
    console.log('ok · publica no Instagram (carrossel), Facebook (várias fotos) e Google (com link rastreado)');

    // erro numa rede: parcial, e tenta de novo só a que falhou
    const antes = global.fetch;
    global.fetch = async (u, o) => (String(u).includes('mybusiness.googleapis.com') ? new Response(JSON.stringify({ error: { message: 'cota' } }), { status: 429 }) : antes(u, o));
    run(`UPDATE social_posts SET status='agendado' WHERE id=?`, ims[6].id);
    r = await P.publicar(one('SELECT * FROM social_posts WHERE id=?', ims[6].id));
    assert.equal(r.status, 'parcial'); assert.ok(/google: cota/.test(r.motivo));
    global.fetch = antes;
    const n0 = chamadas.length;
    r = await P.publicar(one('SELECT * FROM social_posts WHERE id=?', ims[6].id));
    assert.equal(r.status, 'publicado');
    assert.ok(chamadas.slice(n0).every((c) => !c.u.includes('graph.facebook.com')), 'não publica de novo onde já saiu');
    console.log('ok · falha numa rede: parcial e nova tentativa só nela');

    // ---------- ciclo: publica o que chegou a hora
    run(`UPDATE social_posts SET agendado_para=? WHERE id=?`, tempo.local(new Date(Date.now() - 60e3)), ims[7].id);
    const ci = await P.ciclo();
    assert.ok(ci.publicados.some((x) => x.id === ims[7].id && x.status === 'publicado'), JSON.stringify(ci));
    assert.equal((await req('POST', '/social-ciclo')).s, 401);
    const tk = require('../src/db').getConfig('social_ciclo_token');
    assert.equal((await req('POST', '/social-ciclo', null, { 'x-social-ciclo': tk })).s, 200);
    console.log('ok · ciclo do agendador (com token) publica o que chegou a hora');

    // ---------- link rastreado, origem do lead e /links
    const lk = await req('GET', `/r/${ims[4].id}f`);
    assert.equal(lk.s, 302); assert.ok(/\/imoveis\/.+utm_source=facebook/.test(lk.h.get('location')), lk.h.get('location'));
    const ck = (lk.h.get('set-cookie') || '').split(';')[0];
    assert.ok(/^redes_origem=facebook\.\d+$/.test(ck), ck);
    assert.equal(one('SELECT count(*) n FROM social_cliques WHERE post_id=?', ims[4].id).n, 1);
    const lead = await fetchReal(`${base}/api/publico/portal/interesse`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck },
      body: JSON.stringify({ codigo: ims[4].ref, nome: 'Maria Teste', telefone: '19 99876-5432', aceite: true }) });
    assert.equal(lead.status, 200, await lead.text());
    assert.equal(one(`SELECT origem FROM leads WHERE nome='Maria Teste'`).origem, `Portal ${cfg.CLIENTE_NOME} · redes (Facebook)`);
    const pg = await req('GET', '/links');
    assert.equal(pg.s, 200); assert.ok(pg.j.includes(`/r/${ims[4].id}l`) && !pg.j.includes('Rua Secreta'));
    const tela = await req('GET', '/api/social');
    assert.ok(tela.j.numeros.publicados_mes >= 1 || tela.j.mes !== ims[4].agendado_para.slice(0, 7));
    console.log('ok · link rastreado conta o clique e o lead chega com "redes (Facebook)"; página /links');

    // ---------- imóvel que saiu do portal: o post é retirado e o horário volta para o rodízio
    const vendido = ims.find((p) => p.ref === 'AP9102' && one('SELECT status FROM social_posts WHERE id=?', p.id).status === 'agendado');
    run(`UPDATE imoveis SET status='vendido' WHERE codigo='AP9102'`);
    require('../src/portal/fonte').limparCache();
    r = await P.publicar(one('SELECT * FROM social_posts WHERE id=?', vendido.id));
    assert.equal(r.status, 'cancelado'); assert.ok(/saiu do portal/.test(r.motivo));
    console.log('ok · imóvel vendido: o post sai do calendário sozinho');

    // ---------- demonstração: nunca vai para rede de verdade
    process.env.PORTAL_DEMONSTRACAO = '1';
    const outro = all(`SELECT * FROM social_posts WHERE status='agendado' AND tipo='imovel' AND ref<>'AP9102' ORDER BY agendado_para LIMIT 1`)[0];
    const n1 = chamadas.length;
    r = await P.publicar(outro, { forcar: true });
    assert.equal(r.status, 'pronto_manual'); assert.equal(chamadas.length, n1);
    assert.equal((await req('GET', '/api/social/conectar/meta')).s, 400);
    delete process.env.PORTAL_DEMONSTRACAO;
    console.log('ok · portal de demonstração não publica nas redes de verdade');

    console.log('\nRedes e publicações: tudo certo.');
    srv.close(); process.exit(0);
  } catch (err) {
    console.error(err); srv.close(); process.exit(1);
  }
})();
