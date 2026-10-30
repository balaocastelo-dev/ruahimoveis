#!/usr/bin/env node
// Servidor MCP do Herrera HOUSE IA: dá ao Claude (Desktop, Code) e a qualquer cliente MCP
// todas as ações do sistema como ferramentas. Sem dependências: JSON-RPC por stdin/stdout.
//
//   HERRERA_URL=https://minhaimobiliaria.corretordofuturo.app HERRERA_CHAVE=hh_... node scripts/mcp-herrera.mjs
//
// No Claude Desktop (claude_desktop_config.json):
//   { "mcpServers": { "herrera": { "command": "node", "args": ["C:/.../scripts/mcp-herrera.mjs"],
//     "env": { "HERRERA_URL": "...", "HERRERA_CHAVE": "hh_..." } } } }
const URL_BASE = (process.env.HERRERA_URL || 'http://localhost:3333').replace(/\/$/, '');
const CHAVE = process.env.HERRERA_CHAVE || '';
const SO = (process.env.HERRERA_ESCOPOS || '').split(',').map((s) => s.trim()).filter(Boolean);

const chamar = async (metodo, caminho, { corpo, query } = {}) => {
  const qs = query && Object.keys(query).length ? '?' + new URLSearchParams(query) : '';
  const r = await fetch(URL_BASE + caminho + qs, {
    method: metodo,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${CHAVE}` },
    body: corpo && metodo !== 'GET' ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  try { return { status: r.status, dados: JSON.parse(t) }; } catch { return { status: r.status, dados: t.slice(0, 20000) }; }
};

let ACOES = [];
const carregar = async () => {
  const r = await chamar('GET', '/api/ia/acoes');
  if (r.status !== 200) throw new Error(`Não consegui ler o catálogo (${r.status}): ${JSON.stringify(r.dados).slice(0, 300)}`);
  ACOES = r.dados.filter((a) => a.auth === 'chave' && (!SO.length || SO.includes(a.escopo)));
};
const TIPO = { numero: 'number', 'sim/nao': 'boolean', lista: 'array', texto: 'string' };
const ferramenta = (a) => {
  const props = {}, req = [];
  for (const p of a.parametros) { props[p] = { type: 'string', description: `:${p} do caminho` }; req.push(p); }
  for (const [k, v] of Object.entries({ ...a.query, ...a.corpo })) {
    props[k] = v.tipo === 'lista' ? { type: 'array', items: { type: 'string' } } : { type: TIPO[v.tipo] || 'string' };
    if (v.obrigatorio) req.push(k);
  }
  return { name: a.nome.replace(/\./g, '_'), description: `${a.resumo} (${a.metodo} ${a.caminho})`,
           inputSchema: { type: 'object', properties: props, required: [...new Set(req)] } };
};

const escreve = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const resposta = (id, result) => escreve({ jsonrpc: '2.0', id, result });
const erro = (id, msg) => escreve({ jsonrpc: '2.0', id, error: { code: -32000, message: msg } });

async function trata(m) {
  const { id, method, params } = m;
  if (method === 'initialize') return resposta(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} },
    serverInfo: { name: 'herrera-house-ia', version: '1.0.0' } });
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    if (!ACOES.length) await carregar();
    return resposta(id, { tools: ACOES.map(ferramenta) });
  }
  if (method === 'tools/call') {
    if (!ACOES.length) await carregar();
    const a = ACOES.find((x) => x.nome.replace(/\./g, '_') === params.name);
    if (!a) return erro(id, `Ferramenta desconhecida: ${params.name}`);
    const d = { ...(params.arguments || {}) };
    let caminho = a.caminho;
    for (const p of a.parametros) { caminho = caminho.replace(`:${p}`, encodeURIComponent(d[p] ?? '')); delete d[p]; }
    const r = await chamar(a.metodo, caminho, a.metodo === 'GET' ? { query: d } : { corpo: d });
    return resposta(id, { content: [{ type: 'text', text: JSON.stringify(r.dados).slice(0, 180000) }], isError: r.status >= 400 });
  }
  if (method === 'ping') return resposta(id, {});
  erro(id, `Método não suportado: ${method}`);
}

let resto = '';
process.stdin.setEncoding('utf8').on('data', async (p) => {
  resto += p;
  const linhas = resto.split('\n'); resto = linhas.pop();
  for (const l of linhas) {
    if (!l.trim()) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    try { await trata(m); } catch (e) { if (m.id !== undefined) erro(m.id, e.message); }
  }
});
process.stderr.write(`[MCP] Herrera HOUSE IA · ${URL_BASE}${CHAVE ? '' : ' (sem HERRERA_CHAVE!)'}\n`);
