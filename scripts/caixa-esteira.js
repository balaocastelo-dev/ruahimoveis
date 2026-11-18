#!/usr/bin/env node
// Esteira diária da Caixa, num comando só. A mesma ordem do job do ProLiant:
//   importar o CSV -> fotos -> prazos -> geocode -> vizinhança -> carteira do CRM
//
//   DATABASE_URL='postgres://DONO@HOST/postgres' node scripts/caixa-esteira.js
//
// A URL é a do dono do banco. O papel oportunidades_app não cria tabela nem grava
// a foto. Não aponte para o Postgres do ProLiant: o site fica na Vercel e o
// banco de produção é o do Supabase.
//
// Prova local, sem falar com a Caixa nem com o Nominatim:
//   node scripts/caixa-esteira.js --arquivo test/fixtures/caixa-amostra.csv --pasta ./fotos --sem-rede
//
// --sem-rede pula prazos, geocode e vizinhança. As fotos só rodam junto se
// --pasta apontar para {numero}.jpg já baixados. Sem pasta e sem rede, o CRM
// só leva quem já tinha foto guardada.

const { spawnSync } = require('child_process');
const path = require('path');

const DIR = __dirname;

function args(argv) {
  const o = { uf: 'SP', imobiliaria: 'oportunidades', arquivo: '', pasta: '', semRede: false, ajuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ajuda' || a === '-h') o.ajuda = true;
    else if (a === '--sem-rede') o.semRede = true;
    else if (a === '--uf') o.uf = String(argv[++i] || '');
    else if (a === '--imobiliaria') o.imobiliaria = String(argv[++i] || '');
    else if (a === '--arquivo') o.arquivo = String(argv[++i] || '');
    else if (a === '--pasta') o.pasta = String(argv[++i] || '');
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(o.imobiliaria)) throw new Error('Imobiliária inválida.');
  if (!/^[A-Za-z]{2}$/.test(o.uf)) throw new Error('UF inválida.');
  return o;
}

function ajuda() {
  console.log(`Uso: node scripts/caixa-esteira.js [--uf SP] [--imobiliaria oportunidades] [--arquivo lista.csv] [--pasta dir] [--sem-rede]

Lê DATABASE_URL do ambiente (dono do banco). Não imprime a URL.
Ordem: caixa-importar, caixa-fotos, caixa-prazos --revalidar, caixa-geocodificar, caixa-vizinhanca, caixa-para-crm.`);
}

function passo(script, argumentos) {
  console.log(`\n== ${script} ==`);
  const r = spawnSync(process.execPath, [path.join(DIR, script), ...argumentos], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`${script} saiu com código ${r.status == null ? 'sem status' : r.status}`);
    process.exit(r.status || 1);
  }
}

function main() {
  const o = args(process.argv.slice(2));
  if (o.ajuda) { ajuda(); return; }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (dono do banco). Nada foi importado.');
    process.exit(1);
  }
  const imp = ['--uf', o.uf.toUpperCase()];
  if (o.arquivo) imp.push('--arquivo', o.arquivo);
  passo('caixa-importar.js', imp);

  if (o.semRede && !o.pasta) {
    console.log('\n== caixa-fotos.js ==\npulado (--sem-rede e sem --pasta): quem não tem foto continua fora do CRM');
  } else {
    const fotos = [];
    if (o.pasta) fotos.push('--pasta', o.pasta);
    passo('caixa-fotos.js', fotos);
  }

  if (o.semRede) {
    console.log('\n== caixa-prazos.js ==\npulado (--sem-rede)');
    console.log('\n== caixa-geocodificar.js ==\npulado (--sem-rede)');
    console.log('\n== caixa-vizinhanca.js ==\npulado (--sem-rede)');
  } else {
    passo('caixa-prazos.js', ['--revalidar']);
    passo('caixa-geocodificar.js', []);
    passo('caixa-vizinhanca.js', []);
  }

  passo('caixa-para-crm.js', ['--imobiliaria', o.imobiliaria]);
  console.log('\nEsteira concluída.');
}

try { main(); }
catch (e) { console.error(e.message || e); process.exit(1); }
