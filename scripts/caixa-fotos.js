#!/usr/bin/env node
// Guarda as fotos que a Caixa publica dos imoveis dela.
//
// A tela busca sob demanda, mas a primeira visita a cada imovel ficaria esperando o
// site da Caixa. Rodando isto depois da importacao diaria, a foto ja esta no banco
// quando alguem abre a tela.
//
// A foto fica em base.fachadas, a mesma tabela das fachadas de Street View, com a
// referencia "caixa:<numero>". Guardar em vez de apontar para o site tem um motivo
// alem da velocidade: quando o imovel sai da lista a Caixa tira a foto do ar, e e
// justamente ai que ela serve de registro do que foi negociado.
//
// Uso:  node scripts/caixa-fotos.js [--todos] [--limite 500]

const { Client } = require('pg');

const TODOS = process.argv.includes('--todos');
const LIMITE = Number(process.argv[process.argv.indexOf('--limite') + 1]) || 100000;
const UA = { 'User-Agent': 'HerreraHouseIA/1.0 (+https://corretordofuturo.app)', Accept: 'image/*' };
const ESPERA = 250; // sem pressa: e o servidor de um banco publico

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixar(numero) {
  const r = await fetch(`https://venda-imoveis.caixa.gov.br/fotos/F${numero}21.jpg`,
    { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  if (!/^image\//.test(String(r.headers.get('content-type') || ''))) return null;
  const img = Buffer.from(await r.arrayBuffer());
  return img.length > 1500 ? img : null; // imagem minuscula costuma ser "sem foto"
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('falta DATABASE_URL');
  const cli = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await cli.connect();

  const { rows } = await cli.query(
    `select i.numero from base.caixa_imoveis i
      left join base.fachadas f on f.ref = 'caixa:' || i.numero
      where i.saiu_em is null and f.ref is null ${TODOS ? '' : 'and i.na_rmc'}
      order by i.na_rmc desc, i.desconto desc nulls last limit $1`, [LIMITE]);

  console.log(`${rows.length} imóveis sem foto guardada${TODOS ? '' : ' (só a região)'}`);
  if (!rows.length) { await cli.end(); return; }

  let com = 0, sem = 0, erro = 0, bytes = 0;
  for (let i = 0; i < rows.length; i++) {
    const numero = rows[i].numero;
    let img = null;
    try { img = await baixar(numero); } catch { erro++; await dorme(2000); continue; }
    if (img) { com++; bytes += img.length; } else sem++;
    await cli.query(
      `insert into base.fachadas(ref, img) values ($1, $2)
       on conflict (ref) do update set img = excluded.img`, ['caixa:' + numero, img]);
    await dorme(ESPERA);
    if ((i + 1) % 20 === 0 || i === rows.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${rows.length}  ·  ${com} com foto, ${sem} sem, ${erro} erro`);
    }
  }
  console.log('\n');
  console.log(`com foto:  ${com}  (${(bytes / 1048576).toFixed(1)} MB)`);
  console.log(`sem foto:  ${sem}`);
  if (erro) console.log(`falharam:  ${erro}  (rode de novo mais tarde)`);
  await cli.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });