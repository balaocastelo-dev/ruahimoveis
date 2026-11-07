#!/usr/bin/env node
// Importa a lista publica de imoveis da Caixa e mantem a base em dia.
//
// A Caixa publica, todo dia, um CSV com TODOS os imoveis dela a venda em cada
// estado. E uma foto completa do dia, nao um diario de novidades - e e isso que
// torna o modelo de safra possivel: o que estava na safra de ontem e nao esta na
// de hoje saiu da lista, ou seja, foi vendido ou arrematado.
//
// Por isso aqui nao se reabre link de anuncio nenhum: compara-se a lista nova
// com a anterior. Mais leve, mais confiavel e sem depender de link.
//
// Uso:  node scripts/caixa-importar.js [--uf SP] [--seco]
//   --seco  roda sem gravar, so mostra o que faria.

const { Client } = require('pg');
const zlib = require('zlib');

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : null;
}

const UF = (arg('--uf') || 'SP').toUpperCase();
const SECO = process.argv.includes('--seco');
const URL = `https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_${UF}.csv`;

// Municipios da Regiao Metropolitana de Campinas (LC 870/2000 + Morungaba pela LC 1.234/2014).
const RMC = new Set([
  'AMERICANA', 'ARTUR NOGUEIRA', 'CAMPINAS', 'COSMOPOLIS', 'ENGENHEIRO COELHO',
  'HOLAMBRA', 'HORTOLANDIA', 'INDAIATUBA', 'ITATIBA', 'JAGUARIUNA', 'MONTE MOR',
  'MORUNGABA', 'NOVA ODESSA', 'PAULINIA', 'PEDREIRA', 'SANTA BARBARA DOESTE',
  'SANTO ANTONIO DE POSSE', 'SUMARE', 'VALINHOS', 'VINHEDO',
]);

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['`\u00b4]/g, '').toUpperCase().trim();

/** O CSV vem em ISO-8859-1, com ponto e virgula, e algumas linhas de cabecalho antes da tabela. */
async function baixar() {
  const r = await fetch(URL, {
    headers: {
      'User-Agent': 'HerreraHouseIA/1.0 (+https://corretordofuturo.app)',
      Accept: 'text/csv,*/*',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`Caixa devolveu ${r.status} ${r.statusText}`);
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return new TextDecoder('iso-8859-1').decode(buf);
}

function parsear(texto) {
  const linhas = texto.split(/\r?\n/);
  const iCab = linhas.findIndex((l) => /do\s+im[o\u00f3]vel/i.test(l) && l.includes(';'));
  if (iCab < 0) throw new Error('nao achei o cabecalho no CSV da Caixa');
  const cols = linhas[iCab].split(';').map((c) => semAcento(c));
  const col = (nome) => cols.findIndex((c) => c.includes(semAcento(nome)));
  const idx = {
    numero: col('do imovel'), uf: col('UF'), cidade: col('Cidade'), bairro: col('Bairro'),
    endereco: col('Endereco'), preco: col('Preco'), avaliacao: col('Valor de avaliacao'),
    desconto: col('Desconto'), financiamento: col('Financiamento'), descricao: col('Descricao'),
    modalidade: col('Modalidade'), link: col('Link'),
  };
  if (idx.numero < 0) throw new Error('nao achei a coluna do numero do imovel');

  // O CSV da Caixa mistura dois formatos na mesma linha: o preco vem com virgula
  // decimal e ponto de milhar (43.534,28) e o desconto vem com ponto decimal
  // (51.69). Tratar todo ponto como milhar transformava 51.69 em 5169.
  // Regra: havendo virgula, ela e o decimal e o ponto e milhar; sem virgula, o
  // ponto e o decimal.
  const num = (s) => {
    let t = String(s || '').replace(/[^\d,.-]/g, '');
    if (!t) return null;
    t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const pct = (s) => {
    const n = num(s);
    return n === null || n < 0 || n > 100 ? null : n;   // desconto fora de 0-100 e lixo
  };
  const fora = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l || !l.includes(';')) continue;
    const c = l.split(';');
    const numero = String(c[idx.numero] || '').trim();
    if (!numero || !/^\d/.test(numero)) continue;
    fora.push({
      numero,
      uf: (c[idx.uf] || '').trim(),
      cidade: (c[idx.cidade] || '').trim(),
      bairro: (c[idx.bairro] || '').trim(),
      endereco: (c[idx.endereco] || '').trim(),
      preco: num(c[idx.preco]),
      avaliacao: num(c[idx.avaliacao]),
      desconto: pct(c[idx.desconto]),
      financiamento: (c[idx.financiamento] || '').trim(),
      descricao: (c[idx.descricao] || '').trim(),
      modalidade: (c[idx.modalidade] || '').trim(),
      link: (c[idx.link] || '').trim(),
    });
  }
  return fora;
}

/** Tira da descricao o que der: tipo, area e quartos. A Caixa escreve em texto corrido. */
function enriquecer(im) {
  // A Caixa escreve a ficha em texto corrido, com acento, o numero ANTES do rotulo
  // e ponto como decimal: "Casa, 59.03 de area total, 59.03 de area privativa,
  // 220.93 de area do terreno,  1 qto(s), a.serv, WC, 1 sala(s), 1 vaga(s)".
  // Por isso tira-se o acento antes de procurar, e o numero vem na frente.
  const d = semAcento(im.descricao || '').toLowerCase();
  const tipo = /\bcasa\b|sobrado/.test(d) ? 'Casa' : /apartamento|cobertura|kitnet|flat/.test(d) ? 'Apartamento'
    : /terreno|\blote\b|gleba/.test(d) ? 'Terreno'
    : /comercial|\bloja\b|\bsala\b|galp|barrac|predio/.test(d) ? 'Comercial' : null;
  // A Caixa mistura dois formatos na mesma ficha: a area costuma vir com ponto
  // decimal ("220.93"), mas a de quatro digitos aparece como "1.250,00". A regra
  // que atende as duas: se tem virgula, ela e o decimal e o ponto e milhar.
  const n = (s) => {
    if (s === null || s === undefined) return null;
    let x = String(s);
    x = x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x;
    const v = Number(x);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const antes = (rotulo) => {
    const m = d.match(new RegExp('([\\d.,]+)\\s*(?:m2?\\s*)?de\\s*' + rotulo));
    return m ? n(m[1]) : null;
  };
  const inteiro = (re) => { const m = d.match(re); return m ? Number(m[1]) : null; };
  return {
    ...im,
    tipo,
    area_util: antes('area\\s*privativa') || antes('area\\s*total'),
    area_terreno: antes('area\\s*do\\s*terreno'),
    quartos: inteiro(/(\d+)\s*(?:qto|quarto|dormit)/),
    vagas: inteiro(/(\d+)\s*vaga/),
  };
}


const DDL = `
create table if not exists base.caixa_imoveis (
  id integer generated by default as identity primary key,
  numero text not null unique,
  uf text, cidade text, bairro text, endereco text,
  preco numeric, avaliacao numeric, desconto numeric,
  financiamento text, descricao text, modalidade text, link text,
  tipo text, quartos integer, vagas integer, area_util numeric, area_terreno numeric,
  na_rmc boolean not null default false,
  primeira_safra text not null,
  ultima_safra text not null,
  saiu_em text,
  criado_em text not null default to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS'),
  atualizado_em text not null default to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS')
);
alter table base.caixa_imoveis add column if not exists vagas integer;
create index if not exists ix_caixa_cidade on base.caixa_imoveis(cidade) where saiu_em is null;
create index if not exists ix_caixa_rmc on base.caixa_imoveis(na_rmc, desconto desc) where saiu_em is null;
create index if not exists ix_caixa_safra on base.caixa_imoveis(ultima_safra);
`;

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('falta DATABASE_URL');
  const cli = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await cli.connect();

  const safra = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 19);
  console.log(`safra ${safra} - UF ${UF}`);

  console.log('baixando a lista da Caixa...');
  const brutos = parsear(await baixar()).map(enriquecer);
  const rmc = brutos.filter((i) => RMC.has(semAcento(i.cidade)));
  console.log(`  ${brutos.length} imoveis em ${UF}, ${rmc.length} na RMC`);
  if (!brutos.length) throw new Error('lista veio vazia: nao vou mexer na base');

  if (SECO) {
    const porCidade = {};
    for (const i of rmc) porCidade[i.cidade] = (porCidade[i.cidade] || 0) + 1;
    console.log('  RMC por cidade:', porCidade);
    await cli.end();
    return;
  }

  await cli.query(DDL);
  const antes = (await cli.query('select count(*)::int n from base.caixa_imoveis where saiu_em is null')).rows[0].n;

  // Imovel que ja existia tem os dados e a ultima safra atualizados, e volta a lista
  // se tinha saido: a Caixa recoloca imovel que nao foi arrematado.
  const sql = `
    insert into base.caixa_imoveis
      (numero, uf, cidade, bairro, endereco, preco, avaliacao, desconto, financiamento,
       descricao, modalidade, link, tipo, quartos, vagas, area_util, area_terreno, na_rmc,
       primeira_safra, ultima_safra)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
    on conflict (numero) do update set
      uf = excluded.uf, cidade = excluded.cidade, bairro = excluded.bairro,
      endereco = excluded.endereco, preco = excluded.preco, avaliacao = excluded.avaliacao,
      desconto = excluded.desconto, financiamento = excluded.financiamento,
      descricao = excluded.descricao, modalidade = excluded.modalidade, link = excluded.link,
      tipo = excluded.tipo, quartos = excluded.quartos, vagas = excluded.vagas, area_util = excluded.area_util,
      area_terreno = excluded.area_terreno, na_rmc = excluded.na_rmc,
      ultima_safra = excluded.ultima_safra, saiu_em = null,
      atualizado_em = to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS')`;

  await cli.query('begin');
  let n = 0;
  for (const i of brutos) {
    await cli.query(sql, [i.numero, i.uf, i.cidade, i.bairro, i.endereco, i.preco, i.avaliacao,
      i.desconto, i.financiamento, i.descricao, i.modalidade, i.link, i.tipo, i.quartos, i.vagas,
      i.area_util, i.area_terreno, RMC.has(semAcento(i.cidade)), safra]);
    if (++n % 500 === 0) process.stdout.write(`\r  gravados ${n}/${brutos.length}`);
  }
  process.stdout.write(`\r  gravados ${n}/${brutos.length}\n`);

  // Quem nao veio nesta safra saiu da lista: vendido, arrematado ou retirado.
  const saiu = await cli.query(
    `update base.caixa_imoveis set saiu_em = $1,
       atualizado_em = to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS')
     where uf = $2 and ultima_safra <> $1 and saiu_em is null
     returning numero, cidade, preco, na_rmc`, [safra, UF]);
  await cli.query('commit');

  const agora = (await cli.query('select count(*)::int n from base.caixa_imoveis where saiu_em is null')).rows[0].n;
  const naRmc = (await cli.query('select count(*)::int n from base.caixa_imoveis where saiu_em is null and na_rmc')).rows[0].n;
  console.log(`\nativos: ${antes} -> ${agora}  (${naRmc} na RMC)`);
  if (saiu.rowCount) {
    const daRmc = saiu.rows.filter((r) => r.na_rmc);
    console.log(`sairam da lista nesta safra: ${saiu.rowCount}, ${daRmc.length} na RMC`);
    for (const r of daRmc.slice(0, 10)) console.log(`  ${r.numero}  ${r.cidade}  R$ ${r.preco}`);
  } else {
    console.log('nenhum imovel saiu da lista nesta safra');
  }
  await cli.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
