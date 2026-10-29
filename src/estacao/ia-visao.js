// Uma pergunta (com ou sem imagem) ao cérebro escolhido para os PCs virtuais. Usado pela estação a cada passo
// de uma tarefa e pelo sistema no "Testar a chave". Devolve o texto da resposta (o pedido é sempre de JSON).
// ia = { provedor: 'gemini'|'anthropic'|'openai'|'ollama', modelo, chave, base_url }
async function perguntar(ia, sistema, texto, imagemB64 = null, timeout = 60000) {
  const sinal = AbortSignal.timeout(timeout);
  const erroHttp = async (r, quem) => {
    const j = await r.json().catch(() => ({}));
    const msg = (j.error && (j.error.message || j.error)) || j.message || `HTTP ${r.status}`;
    const e = new Error(r.status === 401 || r.status === 403 ? `${quem} recusou a chave (${String(msg).slice(0, 140)})` : r.status === 429 ? `${quem}: limite de uso atingido agora (${String(msg).slice(0, 140)})` : `${quem}: ${String(msg).slice(0, 200)}`);
    e.status = r.status; return e;
  };
  if (ia.provedor === 'gemini') {
    const parts = [{ text: texto }];
    if (imagemB64) parts.unshift({ inline_data: { mime_type: 'image/jpeg', data: imagemB64 } });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ia.modelo)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ia.chave }, signal: sinal,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' } }) });
    if (!r.ok) throw await erroHttp(r, 'O Gemini');
    const j = await r.json(); const c = j.candidates && j.candidates[0];
    return (c && c.content && c.content.parts || []).map((p) => p.text || '').join('').trim();
  }
  if (ia.provedor === 'anthropic') {
    const content = [{ type: 'text', text: texto }];
    if (imagemB64) content.unshift({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagemB64 } });
    const r = await fetch((ia.base_url || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST', signal: sinal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': ia.chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ia.modelo, max_tokens: 2000, temperature: 0.2, system: sistema, messages: [{ role: 'user', content }] }) });
    if (!r.ok) throw await erroHttp(r, 'O Claude');
    const j = await r.json();
    return (j.content || []).map((p) => p.text || '').join('').trim();
  }
  if (ia.provedor === 'openai') {
    const content = [{ type: 'text', text: texto }];
    if (imagemB64) content.unshift({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imagemB64 } });
    const r = await fetch(String(ia.base_url || 'https://openrouter.ai/api/v1').replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', signal: sinal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ia.chave, 'HTTP-Referer': 'https://corretordofuturo.app', 'X-Title': 'Herrera HOUSE IA' },
      body: JSON.stringify({ model: ia.modelo, temperature: 0.2, max_tokens: 2000, messages: [{ role: 'system', content: sistema }, { role: 'user', content }] }) });
    if (!r.ok) throw await erroHttp(r, 'A API');
    const j = await r.json();
    return String(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
  }
  if (ia.provedor === 'ollama') {
    const msg = { role: 'user', content: texto };
    if (imagemB64) msg.images = [imagemB64];
    const r = await fetch(String(ia.base_url || 'http://127.0.0.1:11434').replace(/\/$/, '') + '/api/chat', {
      method: 'POST', signal: sinal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ia.modelo, stream: false, format: 'json', think: false, messages: [{ role: 'system', content: sistema }, msg], options: { temperature: 0.2, num_ctx: 16384 } }) });
    if (!r.ok) throw new Error(`IA local respondeu ${r.status} (confira o Ollama e o modelo ${ia.modelo}).`);
    const j = await r.json();
    return String(j.message && j.message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  throw new Error('Provedor de IA desconhecido.');
}

// Tira o JSON da resposta (alguns modelos cercam com ```json ... ```).
function lerJson(t) {
  const s = String(t || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

module.exports = { perguntar, lerJson };
