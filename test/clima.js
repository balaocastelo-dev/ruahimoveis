const assert = require('node:assert/strict');
const { criaConsulta } = require('../src/services/clima');
(async () => {
  let agora = 1000, chamadas = 0, resposta = { temperature_2m: 24.5, weather_code: 63, is_day: 1 };
  let falha = false, status = true;
  const consulta = criaConsulta({ agora: () => agora, buscar: async (url, opcoes) => {
    chamadas++;
    assert.equal(new URL(url).hostname, 'api.open-meteo.com');
    assert.equal(new URL(url).searchParams.get('latitude'), '-22.905');
    assert.ok(opcoes.signal instanceof AbortSignal);
    if (falha) throw new Error('Sem rede');
    return { ok: status, json: async () => ({ current: resposta }) };
  } });
  const [a, b] = await Promise.all([consulta(), consulta()]);
  assert.deepEqual(a, resposta); assert.deepEqual(b, a); assert.equal(chamadas, 1);
  agora += 15 * 60e3 - 1; await consulta(); assert.equal(chamadas, 1);
  agora++; await consulta(); assert.equal(chamadas, 2);
  falha = true; agora += 15 * 60e3; assert.deepEqual(await consulta(), {});
  await consulta(); assert.equal(chamadas, 3); // falha também é amortecida
  falha = false; status = false; agora += 15 * 60e3; assert.deepEqual(await consulta(), {});
  status = true; resposta = { temperature_2m: null, weather_code: 0, is_day: 1 };
  agora += 15 * 60e3; assert.deepEqual(await consulta(), {});
  resposta = { temperature_2m: 0, weather_code: 0, is_day: 0 };
  agora += 15 * 60e3; assert.deepEqual(await consulta(), resposta);
  console.log('Clima: cache, concorrência, expiração, recuperação e falhas verificados.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
