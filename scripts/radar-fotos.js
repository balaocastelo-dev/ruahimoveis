// Completa a foto das oportunidades do Radar que entraram antes de a foto ser guardada.
// 1) se a oportunidade veio do Fisguei, usa a primeira foto do anúncio do Fisguei;
// 2) se é do Chaves na Mão, abre a página pública do anúncio (uma a cada 4 s, como o monitor) e pega a foto principal.
// Uso (no PC): node scripts/radar-fotos.js            → todas as que faltam
//              node scripts/radar-fotos.js --limite 50
'use strict';
const { all, run } = require('../src/db');
const portais = require('../src/services/portais');

const lim = (() => { const i = process.argv.indexOf('--limite'); return i > 0 ? parseInt(process.argv[i + 1], 10) || 0 : 0; })();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1) do Fisguei
  let doFg = 0;
  for (const o of all(`SELECT o.id, (SELECT f.fotos FROM fisguei_anuncios f WHERE f.oportunidade_id=o.id ORDER BY f.id LIMIT 1) fotos FROM oportunidades o WHERE o.foto IS NULL`)) {
    let f = null; try { f = (JSON.parse(o.fotos || '[]') || [])[0] || null; } catch {}
    if (f) { run('UPDATE oportunidades SET foto=? WHERE id=?', f, o.id); doFg++; }
  }
  console.log(`${doFg} foto(s) copiada(s) do Fisguei.`);
  // 2) do Chaves na Mão
  let l = all(`SELECT id, link FROM oportunidades WHERE foto IS NULL AND link LIKE '%chavesnamao.com.br%' AND status <> 'descartada' ORDER BY id DESC`);
  if (lim) l = l.slice(0, lim);
  console.log(`${l.length} oportunidade(s) do Chaves na Mão sem foto.`);
  let ok = 0, falhas = 0;
  for (const [i, o] of l.entries()) {
    try {
      const d = await portais.detalhe(o.link);
      if (d.foto) { run('UPDATE oportunidades SET foto=? WHERE id=?', d.foto, o.id); ok++; }
    } catch (e) {
      falhas++;
      if (e.bloqueio) { console.log('O portal recusou a leitura; parando por aqui.'); break; }
    }
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${l.length} · ${ok} com foto`);
    await espera(4000);
  }
  console.log(`Pronto: ${ok} foto(s) do Chaves na Mão, ${falhas} falha(s).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
