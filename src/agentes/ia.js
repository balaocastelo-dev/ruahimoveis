// Cérebro dos agentes: Claude (Anthropic) ou Gemini (Google) na nuvem; sem chave nenhuma, a IA local do PC (Ollama).
// As chaves vêm, nesta ordem: a da própria imobiliária (Configuração geral, cifrada no banco dela) →
// as CENTRAIS da plataforma (uma de cada, para todas, de graça para a imobiliária; src/plataforma/central.js)
// → GEMINI_API_KEY / ANTHROPIC_API_KEY do ambiente. A tela só recebe os 4 últimos dígitos.
// Com as duas disponíveis, usa o Claude e cai no Gemini se ele falhar (o contrário se 'ia_central_preferido'
// disser 'gemini'). O consumo de cada imobiliária é somado em plataforma.ia_uso pelo nome do modelo.
const crypto = require('crypto');
const cfg = require('../config');
const { getConfig, setConfig } = require('../db');
const central = require('../plataforma/central');

const MODELO_PADRAO = 'gemini-flash-latest';
const MODELO_CLAUDE_PADRAO = 'claude-sonnet-5-5';
const API = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta'; // a troca de endereço serve só para os testes
const API_ANTHROPIC = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1';

// Chave de cifra comum ao PC e ao link (os dois usam o mesmo banco; o SECRET_KEY pode ser diferente em cada um).
const segredo = () => crypto.createHash('sha256').update('ruah-escritorio-ia:' + (process.env.DATABASE_URL || cfg.DATABASE_URL || cfg.SECRET_KEY)).digest();
function cifra(t) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', segredo(), iv);
  const enc = Buffer.concat([c.update(t, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decifra(p) {
  try { const [iv, tag, enc] = String(p).split('.').map((s) => Buffer.from(s, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', segredo(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch { return null; }
}

function bruto() { try { return JSON.parse(getConfig('escritorio_ia') || '{}'); } catch { return {}; } }
function propria() { const b = bruto(); return (b.chave && decifra(b.chave)) || ''; }
function chave() { return propria() || central.chave() || process.env.GEMINI_API_KEY || ''; }
function origem() { return propria() ? 'propria' : central.chave() ? 'central' : process.env.GEMINI_API_KEY ? 'ambiente' : null; }
/** Claude: a chave é sempre da plataforma (ou do ambiente, no PC) — a imobiliária não configura nada. */
function chaveClaude() { return central.anthropic() || process.env.ANTHROPIC_API_KEY || ''; }
function origemClaude() { return central.anthropic() ? 'central' : process.env.ANTHROPIC_API_KEY ? 'ambiente' : null; }
const modeloClaude = () => central.anthropicModelo() || MODELO_CLAUDE_PADRAO;
/** Quem atende primeiro: 'claude', 'gemini' ou 'ollama'. A chave própria da imobiliária (Gemini) vem antes de tudo. */
function provedor() {
  if (propria()) return 'gemini';
  if (central.preferido() === 'gemini' && chave()) return 'gemini';
  if (chaveClaude()) return 'claude';
  if (chave()) return 'gemini';
  return 'ollama';
}
/** Garante a chave central lida (cache de 5 min). Chamar antes de decidir o cérebro nos caminhos async. */
const carregarCentral = () => central.carregar().catch(() => null);
function ajustes() {
  const b = bruto(); const k = chave(); const o = origem(); const p = provedor();
  const kc = chaveClaude();
  return { provedor: p, modelo: p === 'claude' ? modeloClaude() : b.modelo || central.modelo() || MODELO_PADRAO,
    tem_chave: !!(k || kc), chave_final: (p === 'claude' ? kc : k) ? (p === 'claude' ? kc : k).slice(-4) : null,
    claude: { tem_chave: !!kc, modelo: kc ? modeloClaude() : null, chave_final: kc ? kc.slice(-4) : null, origem: origemClaude() },
    gemini: { tem_chave: !!k, modelo: b.modelo || central.modelo() || MODELO_PADRAO, chave_final: k ? k.slice(-4) : null, origem: o },
    origem: o, central: central.estado(), propria: !!propria(),
    chave_quebrada: !!(b.chave && !decifra(b.chave)), testado_em: b.testado_em || null, teste_ok: b.teste_ok ?? null, teste_msg: b.teste_msg || null,
    ollama_modelo: cfg.OLLAMA_MODEL };
}
const naNuvem = () => !!(chave() || chaveClaude());

function salva(b = {}, quem) {
  const a = bruto();
  if (b.chave !== undefined) {
    const k = String(b.chave || '').trim();
    if (k && !/^[A-Za-z0-9_\-.]{20,200}$/.test(k)) { const e = new Error('Essa não parece uma chave da API do Gemini (começa com "AIza…" ou similar).'); e.status = 400; throw e; }
    a.chave = k ? cifra(k) : undefined; a.teste_ok = null; a.teste_msg = null;
  }
  if (b.modelo !== undefined) a.modelo = String(b.modelo || '').replace(/^models\//, '').trim().slice(0, 80) || MODELO_PADRAO;
  a.por = quem || null; a.em = new Date().toISOString();
  setConfig('escritorio_ia', JSON.stringify(a));
  return ajustes();
}

// O Gemini às vezes responde 503 ("high demand") ou 429 por alguns segundos. Em vez de o robô ficar
// calado, tentamos de novo duas vezes (1,2 s e 3 s) — cabe no orçamento de 40 s do ciclo do escritório.
const ESPERA_NOVA_TENTATIVA = [1200, 3000];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function gemini(sistema, pedido, o = {}) {
  const k = chave(); const modelo = o.modelo || ajustes().modelo;
  let r, j;
  for (let tentativa = 0; ; tentativa++) {
    r = await fetch(`${API}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: pedido }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1200, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(o.timeout || 40000),
    });
    j = await r.json().catch(() => ({}));
    if (origem() === 'central') {
      const u = j.usageMetadata || {};
      central.anota({ modelo, entrada: u.promptTokenCount || 0, saida: u.candidatesTokenCount || 0, erro: !r.ok });
    }
    const vaiTentarDeNovo = !r.ok && (r.status === 429 || r.status >= 500) && tentativa < ESPERA_NOVA_TENTATIVA.length;
    if (!vaiTentarDeNovo) break;
    await dormir(ESPERA_NOVA_TENTATIVA[tentativa]);
  }
  if (!r.ok) {
    const msg = (j.error && j.error.message) || `HTTP ${r.status}`;
    const e = new Error(r.status === 400 && /API key/i.test(msg) ? 'Chave do Gemini recusada pelo Google.' : r.status === 404 ? `O modelo "${modelo}" não existe para essa chave.` : r.status === 429 ? 'Limite de uso do Gemini atingido (tente de novo em alguns minutos ou aumente a cota).' : r.status === 503 ? 'O Gemini está sobrecarregado agora (tentei três vezes). Tente de novo em alguns minutos.' : `Gemini: ${msg}`);
    e.status = r.status; throw e;
  }
  const c = j.candidates && j.candidates[0];
  return (c && c.content && c.content.parts || []).map((p) => p.text || '').join('').trim();
}

// Claude (Anthropic). A API não tem "responseMimeType", então o pedido de JSON vai no texto e as cercas
// de código são tiradas da resposta. Mesma política de tentar de novo em 429/5xx do Gemini.
async function claude(sistema, pedido, o = {}) {
  const k = chaveClaude(); const modelo = o.modelo || modeloClaude();
  let r, j;
  for (let tentativa = 0; ; tentativa++) {
    r = await fetch(`${API_ANTHROPIC}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo, max_tokens: o.max_tokens || 1500, temperature: 0.35,
        system: `${sistema}\n\nResponda SOMENTE com o JSON pedido, sem texto antes ou depois e sem cercas de código.`,
        messages: [{ role: 'user', content: pedido }],
      }),
      signal: AbortSignal.timeout(o.timeout || 40000),
    });
    j = await r.json().catch(() => ({}));
    const u = j.usage || {};
    central.anota({ modelo, entrada: u.input_tokens || 0, saida: u.output_tokens || 0, erro: !r.ok });
    const vaiTentarDeNovo = !r.ok && (r.status === 429 || r.status >= 500) && tentativa < ESPERA_NOVA_TENTATIVA.length;
    if (!vaiTentarDeNovo) break;
    await dormir(ESPERA_NOVA_TENTATIVA[tentativa]);
  }
  if (!r.ok) {
    const msg = (j.error && j.error.message) || `HTTP ${r.status}`;
    const e = new Error(r.status === 401 ? 'Chave da Anthropic recusada.' : r.status === 404 ? `O modelo "${modelo}" não existe para essa chave.`
      : r.status === 429 ? 'Limite de uso da Anthropic atingido (tente de novo em alguns minutos).' : `Claude: ${msg}`);
    e.status = r.status; throw e;
  }
  const txt = (j.content || []).map((c) => c.text || '').join('').trim();
  return txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function ollama(sistema, pedido) {
  const r = await fetch(`${cfg.OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.OLLAMA_MODEL, stream: false, think: false, format: 'json',
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: pedido }],
      options: { temperature: 0.35, num_predict: 500, num_ctx: 12288 } }),
    signal: AbortSignal.timeout(150000),
  });
  if (!r.ok) throw new Error(`IA local respondeu ${r.status} (confira o Ollama e o modelo ${cfg.OLLAMA_MODEL}).`);
  const j = await r.json();
  return String(j.message && j.message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function disponivel() {
  await carregarCentral();
  if (naNuvem()) return true;
  if (process.env.VERCEL) return false; // na nuvem, sem chave não há cérebro
  try { const r = await fetch(`${cfg.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}
async function perguntar(sistema, pedido, opcoes = {}) {
  const p = provedor();
  if (p === 'ollama') return ollama(sistema, pedido);
  if (p === 'claude') {
    try { return await claude(sistema, pedido, opcoes); }
    catch (e) {
      if (!chave()) throw e;                       // sem Gemini de reserva, o erro é o erro
      console.warn('Claude falhou, indo no Gemini:', e.message);
      return gemini(sistema, pedido, opcoes);
    }
  }
  try { return await gemini(sistema, pedido, opcoes); }
  catch (e) {
    if (!chaveClaude()) throw e;
    console.warn('Gemini falhou, indo no Claude:', e.message);
    return claude(sistema, pedido, opcoes);
  }
}

// Lista os modelos da chave (para a tela escolher) e faz uma pergunta curta de teste.
async function testar(modelo) {
  const k = chave();
  if (!k && chaveClaude()) {                       // só Claude configurado: testa o Claude
    const a = bruto(); const inicio = Date.now();
    try {
      const t = await claude('Você é um teste de conexão.', `Devolva {"ok":true,"frase":"uma frase curta em português dizendo que o escritório da ${cfg.CLIENTE_NOME} está pronto"}`, { modelo: modelo || modeloClaude(), timeout: 30000 });
      let frase = ''; try { frase = JSON.parse(t).frase || ''; } catch { frase = t.slice(0, 200); }
      Object.assign(a, { teste_ok: true, teste_msg: `${frase} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`, testado_em: new Date().toISOString() });
    } catch (e) { Object.assign(a, { teste_ok: false, teste_msg: e.message, testado_em: new Date().toISOString() }); }
    setConfig('escritorio_ia', JSON.stringify(a));
    return { ...ajustes(), modelos: [{ id: modeloClaude(), nome: 'Claude ' + modeloClaude() }] };
  }
  if (!k) { const e = new Error('Cole a chave da API do Gemini primeiro.'); e.status = 400; throw e; }
  let modelos = [];
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': k }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (r.ok) modelos = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/embedding|image|tts|audio|live/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), nome: m.displayName || m.name }));
  } catch { /* segue para o teste */ }
  const a = bruto(); const inicio = Date.now();
  try {
    const t = await gemini('Você é um teste de conexão. Responda só com JSON.', `Devolva {"ok":true,"frase":"uma frase curta em português dizendo que o escritório da ${cfg.CLIENTE_NOME} está pronto"}`, { modelo: modelo || ajustes().modelo, timeout: 30000 });
    let frase = ''; try { frase = JSON.parse(t).frase || ''; } catch { frase = t.slice(0, 200); }
    Object.assign(a, { teste_ok: true, teste_msg: `${frase} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`, testado_em: new Date().toISOString() });
  } catch (e) { Object.assign(a, { teste_ok: false, teste_msg: e.message, testado_em: new Date().toISOString() }); }
  setConfig('escritorio_ia', JSON.stringify(a));
  return { ...ajustes(), modelos };
}

module.exports = { ajustes, salva, naNuvem, disponivel, perguntar, testar, MODELO_PADRAO, MODELO_CLAUDE_PADRAO, cifra, decifra, chave, chaveClaude, modeloClaude, provedor, origem, origemClaude, carregarCentral };
