// Estação central dos PCs virtuais (29/10/2026).
// Decisão do Thiago, igual à da chave de IA: UMA chave só, da plataforma, e toda imobiliária usa de graça,
// sem configurar nada. Este script cria/garante essa chave no cofre central (plataforma.config 'estacao_chave')
// e deixa a estação deste computador atendendo todas as imobiliárias ativas e publicadas.
//
// Roda no PC porque é aqui que estão as senhas do banco (.env) e a configuração da estação (data/estacao.json).
// A chave nunca é impressa: só os 4 últimos dígitos.
//
//   node scripts/estacao-central.js            -> mostra o que vai fazer (não grava nada)
//   node scripts/estacao-central.js --gravar   -> grava a chave central e atualiza data/estacao.json
//   node scripts/estacao-central.js --gravar --nova-chave   -> troca a chave central (as imobiliárias
//                                                              pegam a nova em até 5 min; a estação precisa
//                                                              reiniciar para usar a nova)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raiz = path.resolve(__dirname, '..');
process.chdir(raiz);
require(path.join(raiz, 'src/config')); // lê o .env

const gravar = process.argv.includes('--gravar');
const nova = process.argv.includes('--nova-chave');
const CFG = process.env.ESTACAO_CONFIG || path.join(raiz, 'data', 'estacao.json');
const fim = (k) => '…' + String(k).slice(-4);
const host = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return String(u || '').toLowerCase(); } };

(async () => {
  const url = process.env.PLATAFORMA_DATABASE_URL;
  if (!url) { console.log('Falta PLATAFORMA_DATABASE_URL no .env — é o banco do painel do gestor.'); process.exit(2); }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 1 });
  try {
    const atual = (await pool.query("SELECT valor FROM config WHERE chave='estacao_chave'")).rows[0];
    console.log('cofre central hoje   :', atual ? `chave ${fim(atual.valor)}` : 'sem chave de estação');

    const imobs = (await pool.query(
      "SELECT slug, nome, link FROM imobiliarias WHERE situacao='ativa' AND publicada=1 AND coalesce(link,'') <> '' ORDER BY id")).rows;
    console.log('imobiliárias no ar   :', imobs.map((i) => i.slug).join(', ') || '(nenhuma)');

    let conf = {};
    try { conf = JSON.parse(fs.readFileSync(CFG, 'utf8').replace(/^﻿/, '')); }
    catch (e) { console.log(`\nSem ${CFG} ainda (${e.code || e.message}): vou criar o básico.`); }
    const lista = Array.isArray(conf.imobiliarias) ? conf.imobiliarias : [];
    const jaTem = new Set(lista.map((i) => host(i.base)));

    const chave = nova || !atual ? 'est_' + crypto.randomBytes(24).toString('base64url') : atual.valor;
    const faltam = imobs.filter((i) => !jaTem.has(host(i.link)));

    console.log('\nestação deste PC:');
    for (const i of lista) {
      const q = imobs.find((x) => host(x.link) === host(i.base));
      console.log(`  já atende  ${(q ? q.slug : i.id).padEnd(12)} ${i.base}  chave ${fim(i.chave)} (própria)`);
    }
    for (const i of faltam) console.log(`  vai atender ${i.slug.padEnd(11)} ${i.link}  chave ${fim(chave)} (central)`);
    if (!faltam.length) console.log('  (nada a acrescentar)');

    if (!gravar) {
      console.log('\nNada foi gravado. Rode de novo com --gravar.');
      return;
    }

    if (nova || !atual) {
      const r = await pool.query('SELECT plataforma.definir_estacao_central($1) AS fim', [chave]);
      console.log(`\nchave central gravada: ${r.rows[0].fim}`);
    }

    if (faltam.length) {
      conf.porta = conf.porta || 3434;
      conf.imobiliarias = lista.concat(faltam.map((i) => ({ id: i.slug, base: i.link, chave })));
      if (fs.existsSync(CFG)) fs.copyFileSync(CFG, CFG + '.antes-central');
      fs.mkdirSync(path.dirname(CFG), { recursive: true });
      fs.writeFileSync(CFG, JSON.stringify(conf, null, 2));
      console.log(`${CFG} atualizado: ${conf.imobiliarias.length} imobiliária(s).`);
    }
    console.log('\nFalta reiniciar a estação para ela ler a configuração nova:');
    console.log('  powershell -ExecutionPolicy Bypass -File scripts\\estacao-manter.ps1');
    console.log('(mate antes o node da estação, se estiver rodando; a tarefa do Windows religa sozinha em 5 min)');
  } finally { await pool.end().catch(() => {}); }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(3); });
