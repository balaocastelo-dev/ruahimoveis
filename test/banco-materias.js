// Banco de matérias do blog: conferência da matéria (nome, links, tema) e leitura no blog da
// imobiliária que recebeu (tabela blog_materias), com o horário de publicação respeitado.
//   node test/banco-materias.js
const os = require('os'), path = require('path'), fs = require('fs');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banco-materias-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
process.env.BLOG_DIARIO_URL = 'http://127.0.0.1:9/nada'; // sem ramo: o blog vive só do banco
process.env.CLIENTE_NOME = 'Casa Prado';

const { ENDERECO_DO_BANCO, capaDaRotina } = require('../src/blog/categorias');
const { conferirMateria, normTema } = require('../src/plataforma/banco');
const { run } = require('../src/db');
const diario = require('../src/blog/diario');

const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'blog-exemplo.json'), 'utf8'));
// A matéria do banco: {{cliente}} no lugar do nome, links só para /blog e categorias, tema e capa do banco.
const texto = JSON.stringify(base).replace(/\]\(\/blog\/(?!categoria)[a-z0-9-]+\)/g, '](/blog)');
const materia = { ...JSON.parse(texto), tema: 'Tema de teste do banco', capa: { src: `${ENDERECO_DO_BANCO}/capas/${base.slug}-0123abcd.jpg`, alt: 'Sala clara com plantas e janela grande', largura: 1600, altura: 900 } };
materia.blocos = [...materia.blocos, { tipo: 'paragrafo', texto: 'Para conversar sobre o seu próximo imóvel em Campinas, a equipe da {{cliente}} pode ajudar com a busca e a visita.' }];

(async () => {
  try {
    // 1. Conferência
    const ok = conferirMateria(materia);
    assert.deepStrictEqual(ok.erros, [], `matéria boa reprovada: ${ok.erros.join(' | ')}`);
    assert.strictEqual(ok.tema, 'tema de teste do banco');
    assert.strictEqual(normTema('Pé-direito ALTO, na sala!'), 'pe direito alto na sala');
    const comLink = JSON.parse(JSON.stringify(materia).replace('](/blog)', '](/blog/outra-materia-qualquer)'));
    assert.ok(conferirMateria(comLink).erros.some((e) => /outra-materia-qualquer/.test(e)), 'link para outra matéria tinha de ser recusado');
    assert.ok(conferirMateria({ ...materia, tema: '' }).erros.some((e) => /tema/.test(e)), 'sem tema tinha de ser recusado');
    assert.ok(capaDaRotina(materia.capa.src, base.slug), 'capa do banco tinha de valer no blog');
    console.log('ok · conferência da matéria do banco');

    // 2. Entregue à imobiliária (como faz plataforma.entregar_materias): nome trocado e horário marcado.
    const entregue = (slug, quando) => {
      const corpo = JSON.stringify({ ...materia, slug, publicadoEm: quando, capa: { ...materia.capa, src: `${ENDERECO_DO_BANCO}/capas/${slug}-0123abcd.jpg` } }).replace(/\{\{cliente\}\}/g, 'Casa Prado');
      run('INSERT INTO blog_materias(slug, titulo, categoria, publicado_em, conteudo) VALUES (?, ?, ?, ?, ?)', slug, materia.titulo, materia.categoria, quando, corpo);
    };
    entregue('materia-do-banco-ja-no-ar', new Date(Date.now() - 3600e3).toISOString());
    entregue('materia-do-banco-para-amanha', new Date(Date.now() + 86400e3).toISOString());
    diario.limparCache();
    const lista = await diario.listar();
    assert.ok(lista.some((a) => a.slug === 'materia-do-banco-ja-no-ar'), 'a matéria entregue tinha de aparecer na lista');
    assert.ok(!lista.some((a) => a.slug === 'materia-do-banco-para-amanha'), 'matéria de amanhã não pode aparecer hoje');
    const a = await diario.obter('materia-do-banco-ja-no-ar');
    assert.ok(a, 'a matéria entregue tinha de abrir ao clicar');
    assert.ok(JSON.stringify(a).includes('Casa Prado') && !JSON.stringify(a).includes('{{cliente}}'), 'o nome da imobiliária tinha de estar no texto');
    assert.strictEqual(await diario.obter('materia-do-banco-para-amanha'), null);
    const todos = await diario.listar({ todos: true });
    assert.ok(todos.some((x) => x.slug === 'materia-do-banco-para-amanha'), 'a tela do sistema mostra também as agendadas');
    console.log('ok · blog da imobiliária lê as matérias recebidas do banco (e respeita o horário)');
    console.log('\nBanco de matérias OK');
    process.exit(0);
  } catch (e) { console.error('FALHOU', e.message); process.exit(1); }
})();
