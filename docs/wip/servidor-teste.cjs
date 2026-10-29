// Serve public/ do projeto + uma página de teste do escritório 3D com a API simulada.
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.resolve(__dirname, '../../public');
const AG = [['captador','TH-IA-GO','Captador de oportunidades','#a8823c'],['apartamentos','Ana','Corretora de apartamentos','#2f5f8a'],['comerciais','Bruno','Corretor de galpões e salas','#5b6470'],['terrenos','Teo','Corretor de terrenos','#6f7d3a'],['casas','Clara','Corretora de casas até R$ 2 mi','#2f7d4f'],['alto-padrao','Helena','Corretora de alto padrão','#7a4b8c'],['offmarket','Vicente','Corretor Off-market Exclusive','#22252a'],['gerente','Augusto','Gerente geral','#a63d32'],['gerente-corretores','Marta','Gerente dos corretores','#9a6a10']];
const dados = (q) => ({ ev: 10, au: 5, eventos: q.full ? [{ id: 1, agente: 'apartamentos', tipo: 'visita', texto: 'Marcou visita no AP-1203 para sábado, 10h', criado_em: '2026-10-29 06:40:00' }, { id: 2, agente: 'captador', tipo: 'captacao', texto: 'Casa nova no Cambuí entrou na carteira', criado_em: '2026-10-29 06:41:00' }, { id: 3, agente: 'gerente', tipo: 'relatorio', texto: 'Relatório da manhã enviado ao dono', criado_em: '2026-10-29 06:42:00' }] : [], sistema: q.full ? [] : [], agora: new Date().toISOString(),
  agentes: AG.map(([slug, nome, cargo, cor], i) => ({ slug, n: i + 1, nome, cargo, cor, tipo: 'cliente', ativo: slug !== 'offmarket', modo: 'auto', estado: i % 3 ? 'conectado' : 'desconectado', conversas: i * 2, enviadas: i * 5, aprovar: i === 1 ? 2 : 0 })),
  totais: { conversas: 14, enviadas: 38, aprovar: 2, no_ar: 6, acoes: 21 } });
const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  if (p === '/api/publico/clima') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ temperature_2m: 24, weather_code: 0, is_day: 1 })); }
  if (p.startsWith('/api/escritorio/ao-vivo')) { res.setHeader('Content-Type', 'application/json'); const d = dados({ full: u.searchParams.get('full') }); if (u.searchParams.has('quiet') || req.headers.referer?.includes('quiet=1')) d.eventos = []; return res.end(JSON.stringify(d)); }
  if (p === '/favicon.ico') { res.statusCode = 204; return res.end(); }
  if (p === '/teste-3d.html') {
    const altura = Math.max(320, Math.min(1200, Number(u.searchParams.get('h')) || 620));
    res.setHeader('Content-Type', 'text/html'); return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><style>html,body{margin:0;background:#141518}#main{padding:0}.j3{height:${altura}px}</style></head><body><div id="root"></div><div id="toast" class="toast" hidden></div><div id="modal" class="modal-bg" hidden></div>
<script>window.MARCA={sistema:'Herrera HOUSE IA',cliente:'Onde morar?',empresa:'Onde morar? Imóveis'};</script>
<script src="/app.js"></script><script src="/escritorio.js"></script><script src="/escritorio-jogo.js"></script>
<script>document.removeEventListener('DOMContentLoaded', inicio); rota = () => telaEscritorioJogo();</script>
<script type="module">
  document.getElementById('root').innerHTML = '<main id="main"></main>'; const m = await import('/escritorio-3d.js'); window.__m = m; await telaEscritorioJogo();
  if (new URLSearchParams(location.search).has('quiet')) { const e = window.jg3dEstado(); clearInterval(e.vida); clearInterval(e.relogio); e.idleDesde = 1e12; }
  window.__aberto = true;
</script></body></html>`);
  }
  const f = path.resolve(PUB, '.' + (p === '/' ? '/app.html' : p));
  if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404 ' + p); }
  const ext = path.extname(f); res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'application/octet-stream');
  // Instrumentação só no servidor local: não acrescenta controles de teste à produção.
  if (p === '/escritorio-3d.js') return res.end(fs.readFileSync(f, 'utf8') + '\nwindow.__clima = climaAlvo; window.__tempo = (d, h = 12) => { E.tempoReal = d; relogio(); climaAlvo(h, true); };\n');
  fs.createReadStream(f).pipe(res);
});
if (require.main === module) servidor.listen(Number(process.env.PORT) || 8766, '127.0.0.1', () => console.log('ok ' + servidor.address().port));
module.exports = servidor;
