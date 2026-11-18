#!/usr/bin/env node
// Leva os imoveis de fonte publica para a carteira do CRM.
//
// O imovel continua sendo da Caixa: o que entra no CRM e o registro de que a casa
// esta assessorando aquela compra. Por isso ele entra SEM proprietario e SEM
// corretor -- esses campos sao de captacao de verdade, e preenche-los seria
// inventar relacao que nao existe. A origem fica marcada em origem/origem_ref,
// que e tambem como este script reencontra o mesmo imovel amanha.
//
// Regras:
//   - so entra com foto guardada (regra do Thiago: todo imovel tem foto)
//   - valor = o que a pessoa paga, ja com a assessoria; a conta aberta vai na descricao
//   - saiu da lista da Caixa -> status off_market, nao apaga: o historico fica
//
// Uso:  node scripts/caixa-para-crm.js [--imobiliaria oportunidades] [--seco]
//
// DATABASE_URL e a do dono do banco (grava no schema da imobiliaria e le base).
// Nao use o papel oportunidades_app: ele nao cria coluna e nao grava em base.

const { Client } = require('pg');

const arg = (n, padrao) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : padrao; };
const SLUG = arg('--imobiliaria', 'oportunidades');
const SECO = process.argv.includes('--seco');
const TAXA = Number(process.env.CAIXA_ASSESSORIA || 12);

if (!/^[a-z][a-z0-9_]{2,30}$/.test(SLUG)) {
  console.error('imobiliaria invalida');
  process.exit(1);
}

// Os tipos da Caixa nos nomes que o CRM conhece.
const TIPO = {
  'Apartamento': 'Apartamento', 'Casa': 'Casa', 'Sobrado': 'Sobrado', 'Terreno': 'Terreno',
  'Gleba': 'Terreno', 'Sala': 'Sala comercial', 'Loja': 'Loja', 'Predio': 'Prédio',
  'Prédio': 'Prédio', 'Chacara': 'Chácara', 'Chácara': 'Chácara', 'Galpao': 'Galpão', 'Galpão': 'Galpão',
};
const reais = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

function cliente(url) {
  return new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('falta DATABASE_URL');
  const cli = cliente(url);
  await cli.connect();
  await cli.query('SELECT set_config($1, $2, false)', ['search_path', `${SLUG}, base, public`]);

  const schema = await cli.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [SLUG]);
  if (!schema.rows.length) throw new Error(`schema ${SLUG} nao existe: rode scripts/criar-tenant-oportunidades.mjs --apply`);

  const { rows: vivos } = await cli.query(`
    SELECT i.numero, i.tipo, i.cidade, i.bairro, i.endereco, i.preco, i.avaliacao, i.desconto,
           i.quartos, i.vagas, i.area_util, i.area_terreno, i.lat, i.lon, i.modalidade, i.financiamento, i.descricao
      FROM base.caixa_imoveis i
     WHERE i.saiu_em IS NULL AND i.na_rmc
       AND EXISTS (SELECT 1 FROM base.fachadas f WHERE f.ref = 'caixa:' || i.numero AND f.img IS NOT NULL)
     ORDER BY i.numero`);

  const { rows: jaTem } = await cli.query(
    `SELECT id, codigo, origem_ref, status FROM imoveis WHERE origem = 'caixa'`);
  const porRef = new Map(jaTem.map((x) => [x.origem_ref, x]));

  const { rows: [{ n: maior }] } = await cli.query(
    `SELECT coalesce(max(CAST(substr(codigo,3) AS INTEGER)), 0) n FROM imoveis WHERE codigo LIKE 'CX%'`);
  let seq = Number(maior);

  let novos = 0, mexidos = 0, saidos = 0, semFoto = 0;
  const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace('T', ' ');

  for (const c of vivos) {
    const total = Math.round(Number(c.preco || 0) * (1 + TAXA / 100) * 100) / 100;
    const assessoria = Math.round((total - Number(c.preco || 0)) * 100) / 100;
    const tipo = TIPO[c.tipo] || 'Apartamento';
    const desc = [
      `Imóvel retomado pela Caixa, número ${c.numero}. Venda por ${c.modalidade || 'modalidade a confirmar'}.`,
      `Valor na Caixa ${reais(c.preco)} + assessoria ${TAXA}% ${reais(assessoria)} = ${reais(total)}.`,
      c.avaliacao ? `Avaliação da Caixa ${reais(c.avaliacao)}${c.desconto > 0 ? ` (${Math.round(c.desconto)}% abaixo)` : ''}.` : '',
      `Aceita financiamento: ${c.financiamento === 'Sim' ? 'sim' : 'não'}.`,
      c.descricao ? `Como a Caixa descreve: ${c.descricao}` : '',
    ].filter(Boolean).join(' ');

    const campos = {
      tipo, status: 'publicado', finalidade: 'venda',
      logradouro: c.endereco || null, bairro: c.bairro || null, cidade: c.cidade || null, uf: 'SP',
      lat: c.lat, lon: c.lon, quartos: c.quartos, vagas: c.vagas,
      area_util: c.area_util, area_total: c.area_terreno,
      valor: total, descricao: desc, exclusivo: 0,
      origem: 'caixa', origem_ref: String(c.numero), atualizado_em: agora(),
    };

    const achado = porRef.get(String(c.numero));
    if (achado) {
      if (SECO) { mexidos++; continue; }
      const cols = Object.keys(campos);
      await cli.query(`UPDATE imoveis SET ${cols.map((k, n) => `${k}=$${n + 1}`).join(', ')} WHERE id=$${cols.length + 1}`,
        [...cols.map((k) => campos[k]), achado.id]);
      mexidos++;
      porRef.delete(String(c.numero));
    } else {
      if (SECO) { novos++; continue; }
      seq += 1;
      campos.codigo = 'CX' + String(seq).padStart(4, '0');
      campos.criado_em = agora();
      const cols = Object.keys(campos);
      const { rows: [novo] } = await cli.query(
        `INSERT INTO imoveis(${cols.join(',')}) VALUES(${cols.map((_, n) => `$${n + 1}`).join(',')}) RETURNING id`,
        cols.map((k) => campos[k]));
      // A foto aponta para a ja carimbada que o portal serve: nada e duplicado.
      await cli.query(
        `INSERT INTO arquivos(imovel_id, categoria, nome, mime, url_externa, criado_em)
         VALUES($1, 'Fotos', $2, 'image/jpeg', $3, $4)`,
        [novo.id, `caixa-${c.numero}.jpg`, `/oportunidades/${c.numero}/foto`, agora()]);
      novos++;
    }
  }

  // O que sobrou no mapa saiu da lista da Caixa.
  for (const [, x] of porRef) {
    if (x.status === 'off_market') continue;
    if (!SECO) await cli.query(`UPDATE imoveis SET status='off_market', atualizado_em=$1 WHERE id=$2`, [agora(), x.id]);
    saidos++;
  }

  const { rows: [{ n: fora }] } = await cli.query(
    `SELECT count(*) n FROM base.caixa_imoveis i WHERE i.saiu_em IS NULL AND i.na_rmc
       AND NOT EXISTS (SELECT 1 FROM base.fachadas f WHERE f.ref = 'caixa:' || i.numero AND f.img IS NOT NULL)`);
  semFoto = Number(fora);

  console.log(`${SECO ? '[seco] ' : ''}carteira ${SLUG}: ${novos} novo(s), ${mexidos} atualizado(s), ${saidos} para off_market`);
  if (semFoto) console.log(`${semFoto} imovel(is) ficaram de fora por nao ter foto guardada`);
  await cli.end();
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });
