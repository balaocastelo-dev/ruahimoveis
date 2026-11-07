#!/usr/bin/env node
// Busca na pagina da Caixa o prazo real de cada imovel.
//
// O contador da tela so vale se a data for verdadeira. Cada modalidade guarda a data
// em um lugar diferente da pagina:
//
//   Leilao SFI        "Data do 1o Leilao - 30/11/2026 - 10h00" e a do 2o logo depois.
//                     Enquanto o 1o nao passa, ele e o prazo; depois vale o 2o.
//   Licitacao Aberta  "Data da Licitacao Aberta - 06/11/2026 - 10h00".
//   Venda Online      no javascript do contador da propria Caixa:
//                     carregaContador.asp ... "11/11/2026 18:00:00".
//   Venda Direta      nao tem prazo nenhum, e esta certo: fica a venda enquanto
//                     estiver na lista. Aqui isso e gravado como tal, nao inventado.
//
// A data fica guardada com o fuso de Sao Paulo escrito por extenso (-03:00) para o
// navegador nao ter o que adivinhar.
//
// Uso:  node scripts/caixa-prazos.js [--todos] [--limite 300] [--revalidar]

const { Client } = require('pg');

const TODOS = process.argv.includes('--todos');
const REVALIDAR = process.argv.includes('--revalidar');
const LIMITE = Number(process.argv[process.argv.indexOf('--limite') + 1]) || 100000;
const UA = { 'User-Agent': 'HerreraHouseIA/1.0 (+https://corretordofuturo.app)', Accept: 'text/html' };
const ESPERA = 300;

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** "30/11/2026" + "10h00" -> "2026-11-30T10:00:00-03:00" */
function quando(data, hora) {
  const m = String(data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  let hh = '00', mm = '00', ss = '00';
  const h = String(hora || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})(?:\s*[:]\s*(\d{2}))?/);
  if (h) { hh = h[1].padStart(2, '0'); mm = h[2]; ss = h[3] || '00'; }
  return `${m[3]}-${m[2]}-${m[1]}T${hh}:${mm}:${ss}-03:00`;
}

async function pagina(numero) {
  const r = await fetch(`https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${numero}`,
    { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`pagina respondeu ${r.status}`);
  // Pegadinha: o CSV da lista vem em ISO-8859-1, mas esta pagina vem em UTF-8.
  // Decodificar errado transforma "licitacao" em "licitaa§a£o" e nenhum regex casa.
  const cab = String(r.headers.get('content-type') || '');
  const m = cab.match(/charset=\s*"?([\w-]+)/i);
  const codificacao = (m ? m[1] : 'utf-8').toLowerCase();
  return new TextDecoder(codificacao === 'iso-8859-1' ? 'iso-8859-1' : 'utf-8')
    .decode(Buffer.from(await r.arrayBuffer()));
}

function lerPrazos(html) {
  // o contador da Venda Online vive no javascript, antes de qualquer limpeza de tags
  const vo = html.match(/carregaContador[\s\S]{0,250}?"(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})"/i);

  const texto = semAcento(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '));
  const leilao1 = texto.match(/data do 1[^-]{0,12}leilao\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{1,2}h\d{2})/);
  const leilao2 = texto.match(/data do 2[^-]{0,12}leilao\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{1,2}h\d{2})/);
  const licita = texto.match(/data da licitacao aberta\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{1,2}h\d{2})/);

  if (leilao1) return { tipo: 'leilao', em: quando(leilao1[1], leilao1[2]), em2: leilao2 ? quando(leilao2[1], leilao2[2]) : null };
  if (licita) return { tipo: 'licitacao', em: quando(licita[1], licita[2]), em2: null };
  if (vo) return { tipo: 'venda_online', em: quando(vo[1], vo[2]), em2: null };
  return { tipo: null, em: null, em2: null }; // Venda Direta: sem prazo, e esta certo
}

const DDL = `
alter table base.caixa_imoveis add column if not exists prazo_em text;
alter table base.caixa_imoveis add column if not exists prazo2_em text;
alter table base.caixa_imoveis add column if not exists prazo_tipo text;
alter table base.caixa_imoveis add column if not exists prazo_visto_em text;
`;

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('falta DATABASE_URL');
  const cli = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await cli.connect();
  await cli.query(DDL);

  // Revalida quem ja passou do prazo: a Caixa remarca leilao, e prazo vencido na tela
  // e pior que prazo nenhum.
  const quemFalta = REVALIDAR
    ? `(prazo_visto_em is null or (prazo_em is not null and prazo_em < to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')))`
    : 'prazo_visto_em is null';

  const { rows } = await cli.query(
    `select numero, modalidade from base.caixa_imoveis
      where saiu_em is null and ${quemFalta} ${TODOS ? '' : 'and na_rmc'}
      order by na_rmc desc, desconto desc nulls last limit $1`, [LIMITE]);

  console.log(`${rows.length} imóveis sem prazo conferido${TODOS ? '' : ' (só a região)'}`);
  if (!rows.length) { await cli.end(); return; }

  const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 19);
  const conta = { leilao: 0, licitacao: 0, venda_online: 0, sem: 0, erro: 0 };
  for (let i = 0; i < rows.length; i++) {
    const { numero } = rows[i];
    let p = null;
    try { p = lerPrazos(await pagina(numero)); } catch { conta.erro++; await dorme(2000); continue; }
    conta[p.tipo || 'sem']++;
    await cli.query(
      'update base.caixa_imoveis set prazo_em=$1, prazo2_em=$2, prazo_tipo=$3, prazo_visto_em=$4 where numero=$5',
      [p.em, p.em2, p.tipo, agora(), numero]);
    await dorme(ESPERA);
    if ((i + 1) % 20 === 0 || i === rows.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${rows.length}  ·  ${conta.leilao} leilão, ${conta.licitacao} licitação, ${conta.venda_online} venda online, ${conta.sem} sem prazo, ${conta.erro} erro`);
    }
  }
  console.log('\n');
  console.log(`leilão:        ${conta.leilao}  (1ª e 2ª data)`);
  console.log(`licitação:     ${conta.licitacao}`);
  console.log(`venda online:  ${conta.venda_online}`);
  console.log(`sem prazo:     ${conta.sem}  (venda direta: fica enquanto estiver na lista)`);
  if (conta.erro) console.log(`falharam:      ${conta.erro}`);
  await cli.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });