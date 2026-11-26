// Contrato L7 na projeção do gestor.
// As 20 primeiras vendas de cada imobiliária pagam R$ 1.000.
// Da 21ª em diante, 5% do lucro bruto (ticket × margem): no padrão, R$ 12.000.
// 3 vendas por semana = 156 no 1º ano, com crescimento composto.
// A rede soma uma leva nova por ano, cada uma na própria curva.
//   node test/contrato-l7.js
const assert = require('assert');
const { contratoL7, tabelaL7, PADRAO_L7 } = require('../public/gestor/simulacao');

assert.equal(PADRAO_L7.l7_ticket, 800000);
assert.equal(PADRAO_L7.l7_margem, 30);
assert.equal(PADRAO_L7.l7_parte, 5);
assert.equal(PADRAO_L7.l7_vendas_semana, 3);
assert.equal(PADRAO_L7.l7_crescimento, 17.5);
assert.equal(PADRAO_L7.l7_novas_por_ano, 1);

const reais = (h, anos) => Math.round(h[anos].total);
const sem = contratoL7({ l7_crescimento: 0 });
assert.equal(reais(sem, 2), 3524000, 'sem crescimento, 2 anos');
assert.equal(reais(sem, 3), 5396000, 'sem crescimento, 3 anos');
assert.equal(reais(sem, 5), 9140000, 'sem crescimento, 5 anos');
assert.equal(reais(sem, 10), 18500000, 'sem crescimento, 10 anos');

const com = contratoL7({ l7_crescimento: 17.5 });
assert.equal(reais(com, 2), 3851600, '17,5%, 2 anos');
assert.equal(reais(com, 3), 6436130, '17,5%, 3 anos');
assert.equal(reais(com, 5), 13041219, '17,5%, 5 anos');
assert.equal(reais(com, 10), 42742337, '17,5%, 10 anos');

function vendas(anos, g) {
  let n = 0;
  for (let y = 0; y < anos; y++) n += 156 * Math.pow(1 + g, y);
  return n;
}
for (const [g, h] of [[0, sem], [0.175, com]]) {
  for (const anos of [2, 3, 5, 10]) {
    const n = vendas(anos, g);
    assert.ok(Math.abs(h[anos].vendas - n) < 1e-6, 'vendas ' + anos);
    assert.equal(Math.round(h[anos].total), Math.round(20000 + (n - 20) * 12000), 'fórmula ' + anos);
  }
}

const tab = tabelaL7();
const linha = (ano) => tab.find((x) => x.ano === ano);
assert.equal(tab.length, 10);
assert.deepEqual(tab.map((x) => x.imobs), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.equal(Math.round(linha(1).receita), 1652000);
assert.equal(Math.round(linha(1).acum), 1652000);
assert.equal(Math.round(linha(2).receita), 3851600);
assert.equal(Math.round(linha(2).acum), 5503600);
assert.equal(Math.round(linha(5).receita), 13041219);
assert.equal(Math.round(linha(5).acum), 34453902);
assert.equal(Math.round(linha(10).receita), 42742337);
assert.equal(Math.round(linha(10).acum), 179289980);
assert.equal(Math.round(linha(1).vendas), 156);
assert.ok(Math.abs(linha(2).vendas - (156 + 156 * 1.175)) < 1e-6);

// Com uma leva por ano, a receita do ano T é a curva acumulada de uma imobiliária em T anos.
for (const anos of [1, 2, 3, 5, 10]) {
  assert.equal(Math.round(linha(anos).receita), reais(contratoL7({ l7_crescimento: 17.5 }, [anos]), anos));
}

// Cada imobiliária tem as próprias 20 vendas a R$ 1.000.
const duas = tabelaL7({ l7_novas_por_ano: 2, l7_crescimento: 17.5 });
assert.equal(duas[0].imobs, 2);
assert.equal(Math.round(duas[0].receita), 1652000 * 2);

// As premissas da rede geral não entram neste acordo.
assert.equal(reais(contratoL7({ ticket: 1, parte: 99, rampa: '4, 8, 12', comissao: 6, l7_crescimento: 0 }), 2), 3524000);

// Abaixo de 20 vendas o piso é R$ 1.000 por venda, sem completar as 20 de uma vez.
const curta = contratoL7({ l7_vendas_semana: 5 / 52, l7_crescimento: 0 });
assert.equal(curta[2].vendas, 10);
assert.equal(curta[2].total, 10000);

console.log('ok · sem crescimento: 3.524.000 / 5.396.000 / 9.140.000 / 18.500.000');
console.log('ok · 17,5%: 3.851.600 / 6.436.130 / 13.041.219 / 42.742.337');
console.log('ok · rede: ano 1 1.652.000 · ano 2 3.851.600 / 5.503.600 · ano 5 13.041.219 / 34.453.902 · ano 10 42.742.337 / 179.289.980');
console.log('CONTRATO L7: TODOS OS TESTES PASSARAM');
