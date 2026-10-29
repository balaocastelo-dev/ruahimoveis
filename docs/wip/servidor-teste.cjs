// Serve public/ do projeto + uma página de teste do escritório 3D com a API simulada.
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = '/home/claude/ruahimoveis/public';
const AG = [['captador','TH-IA-GO','Captador de oportunidades','#a8823c'],['apartamentos','Ana','Corretora de apartamentos','#2f5f8a'],['comerciais','Bruno','Corretor de galpões e salas','#5b6470'],['terrenos','Teo','Corretor de terrenos','#6f7d3a'],['casas','Clara','Corretora de casas até R$ 2 mi','#2f7d4f'],['alto-padrao','Helena','Corretora de alto padrão','#7a4b8c'],['offmarket','Vicente','Corretor Off-market Exclusive','#22252a'],['gerente','Augusto','Gerente geral','#a63d32'],['gerente-corretores','Marta','Gerente dos corretores','#9a6a10']];
const dados = (q) => ({ ev: 10, au: 5, eventos: q.full ? [{ id: 1, agente: 'apartamentos', tipo: 'visita', texto: 'Marcou visita no AP-1203 para sábado, 10h', criado_em: '2026-10-29 06:40:00' }, { id: 2, agente: 'captador', tipo: 'captacao', texto: 'Casa nova no Cambuí entrou na carteira', criado_em: '2026-10-29 06:41:00' }, { id: 3, agente: 'gerente', tipo: 'relatorio', texto: 'Relatório da manhã enviado ao dono', criado_em: '2026-10-29 06:42:00' }] : [], sistema: q.full ? [] : [], agora: new Date().toISOString(),
  agentes: AG.map(([slug, nome, cargo, cor], i) => ({ slug, n: i + 1, nome, cargo, cor, tipo: 'cliente', ativo: slug !== 'offmarket', modo: 'auto', estado: i % 3 ? 'conectado' : 'desconectado', conversas: i * 2, enviadas: i * 5, aprovar: i === 1 ? 2 : 0 })),
  totais: { conversas: 14, enviadas: 38, aprovar: 2, no_ar: 6, acoes: 21 } });
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  if (p.startsWith('/api/escritorio/ao-vivo')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(dados({ full: u.searchParams.get('full') }))); }
  if (p === '/teste-3d.html') {
    res.setHeader('Content-Type', 'text/html'); return res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>html,body{margin:0;background:#141518}#main{padding:0}.j3{height:${u.searchParams.get('h') || 720}px}</style></head><body><div id="root"></div><div id="toast" class="toast" hidden></div><div id="modal" class="modal-bg" hidden></div>
<script>window.MARCA={sistema:'Herrera HOUSE IA',cliente:'Onde morar?',empresa:'Onde morar? Imóveis'};</script>
<script src="/marca.js"></script><script src="/galeria.js"></script><script src="/app.js"></script><script src="/escritorio.js"></script><script src="/escritorio-jogo.js"></script>
<script type="module">
  document.getElementById('root').innerHTML = '<main id="main"></main>'; const m = await import('/escritorio-3d.js'); window.__m = m; await m.telaEscritorio3D(); window.__aberto = true;
</script></body></html>`);
  }
  let f = path.join(PUB, p === '/' ? 'app.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404 ' + p); }
  const ext = path.extname(f); res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(8766, () => console.log('ok 8766'));
