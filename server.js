// Sistema RUAH · Fase 1 — servidor local.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cfg = require('./src/config');

if (!cfg.SECRET_KEY || cfg.SECRET_KEY.length < 32) {
  console.error('\n[ERRO] SECRET_KEY ausente no arquivo .env. Rode o INICIAR-RUAH.ps1 para gerar a configuração.\n');
  process.exit(1);
}

const { mesmaOrigem, exigeLogin } = require('./src/auth');
const publico = require('./src/routes/publico');

const app = express();
app.disable('x-powered-by');
// IP real do visitante: atrás da Vercel (link online) ou de túnel local (cloudflared).
app.set('trust proxy', process.env.VERCEL ? 1 : 'loopback');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https:; frame-src https://www.google.com https://maps.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  next();
});

// Webhook do WhatsApp precisa do corpo bruto: vem antes do parser JSON.
app.use('/webhook/whatsapp', publico.webhook);

// Escritório virtual: ciclo do cérebro na nuvem (agendador do Supabase a cada minuto + aviso do PC quando chega mensagem).
app.post('/escritorio-ciclo', require('./src/routes/escritorio').ciclo);

// Extensão do Chrome "Fisguei → RUAH": entra com a chave própria (fora de /api, sem sessão).
app.use('/fisguei-api', require('./src/routes/fisguei').receber);

app.use(express.json({ limit: '1mb' }));
app.use('/api', mesmaOrigem);
app.use('/api/publico/portal', require('./src/routes/portal').api);
app.use('/api/publico/blog', require('./src/routes/blog').api);
app.use('/api/publico/condominios', require('./src/condominios/publico').api);
app.use('/api/publico/bairros', require('./src/routes/bairros').api);
app.use('/api/publico', publico);
const ABERTAS = new Set(['/setup', '/login', '/logout', '/drive/callback']);
app.use('/api', (req, res, next) => (ABERTAS.has(req.path) ? next() : exigeLogin(req, res, next)));
app.use('/api', require('./src/routes/arquivos'));
app.use('/api/imoveis', require('./src/routes/imoveis'));
app.use('/api', require('./src/routes/leads'));
app.use('/api', require('./src/routes/radar'));
app.use('/api', require('./src/routes/fisguei').api);
app.use('/api', require('./src/routes/dashboard'));
app.use('/api', require('./src/routes/base'));
app.use('/api', require('./src/routes/condominios'));
app.use('/api', require('./src/routes/mercado'));
app.use('/api', require('./src/routes/captacao'));
// Escritório virtual: os 9 agentes robôs (#/whats), cada um com alma (.soul) e WhatsApp próprio.
app.use('/api', require('./src/routes/escritorio'));
// Páginas de bairros: a lista, a situação de cada página e o que a RUAH quer em cada uma.
app.use('/api', require('./src/routes/bairros').tela);
// Blog: a situação (agendados, esperando foto) para a tela do sistema.
app.get('/api/blog', async (req, res) => res.json(await require('./src/blog/diario').situacao()));
app.get('/api/blog/:slug/redes', async (req, res) => {
  const r = await require('./src/blog/diario').redes(req.params.slug);
  if (!r) return res.status(404).json({ erro: 'Texto não encontrado.' });
  res.json(r);
});
// Portal: a situação da página de cada imóvel, para a tela do sistema.
app.get('/api/portal', async (req, res) => res.json(await require('./src/portal/fonte').situacao()));
app.get('/api/portal/:codigo/redes', async (req, res) => {
  const x = await require('./src/portal/fonte').porCodigo(String(req.params.codigo).toUpperCase());
  if (!x || !x.pagina.redes) return res.status(404).json({ erro: 'Página não encontrada.' });
  res.json({ legenda: `${x.pagina.redes.legenda}\n\n${require('./src/portal/paginas').urlBase(req)}/imoveis/${x.pagina.slug}`, hashtags: x.pagina.redes.hashtags.map((h) => `#${h}`).join(' ') });
});
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

const PUB = path.join(__dirname, 'public');
// Blog público (sem login): /blog, artigos, categorias, RSS, sitemap e robots.
app.use(require('./src/routes/blog'));
// Portal do visitante (sem login): /imoveis, a página única de cada imóvel, fotos e favoritos.
app.use(require('./src/routes/portal'));
// Guias de bairro (sem login): /bairros e /bairros/<bairro>, com fotos reais e números ao vivo.
app.use(require('./src/routes/bairros'));
// Página pública de cada condomínio (/condominios/<slug>) e o 3D para o visitante.
app.use(require('./src/condominios/publico'));
app.get('/fisguei', (req, res) => res.redirect('/#/fisguei'));
// 3D: o modo realista do Google precisa de WebAssembly (Draco), worker em blob e de falar com tile.googleapis.com.
app.get('/condominio-3d.html', (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data: https://tile.googleapis.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.sendFile(path.join(PUB, 'condominio-3d.html'));
});
app.get('/assinar/:token', (req, res) => res.sendFile(path.join(PUB, 'assinar.html')));
app.get('/v/:token', (req, res) => res.sendFile(path.join(PUB, 'imovel.html')));
app.use(express.static(PUB, { index: 'index.html', maxAge: 0 }));

// Erros: mensagem clara para o usuário, detalhe só no console.
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(new Date().toLocaleString('pt-BR'), req.method, req.originalUrl, err);
  const msg = status === 413 ? 'Arquivo grande demais (limite 25 MB).' : status >= 500 && !err.status ? 'Erro interno. Veja a janela do servidor para detalhes.' : err.message;
  res.status(status).json({ erro: msg });
});

if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  app.listen(cfg.PORT, host, () => {
    const nets = require('os').networkInterfaces();
    const ips = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    console.log('\n  ==============================================');
    console.log('   SISTEMA RUAH  ·  rodando');
    console.log(`   Neste PC:        ${cfg.BASE_URL}`);
    ips.forEach((ip) => console.log(`   Na rede (celular): http://${ip}:${cfg.PORT}`));
    console.log('   Para parar: feche esta janela');
    console.log('  ==============================================\n');
    // Radar automático (alertas por e-mail e monitor dos portais) roda no PC;
    // com o banco online, o que ele encontra aparece também no link da Vercel.
    require('./src/services/alertas').iniciar();
    require('./src/services/portais').iniciar();
    // Robô TH-IA-GO CORRETOR (WhatsApp pelo QR code) roda só no PC.
    require('./src/fisguei/robo').iniciar();
    // Escritório virtual: as linhas de WhatsApp dos agentes rodam num processo à parte (o site pesado não trava o WhatsApp).
    // O cérebro roda na nuvem quando há chave do Gemini; sem chave, roda nesse processo com a IA local.
    if (cfg.ESCRITORIO !== '0') {
      // o processo das linhas fecha sozinho quando o site fecha (canal entre os dois se rompe), então nunca ficam duas cópias
      const abre = () => {
        const p = require('child_process').fork(path.join(__dirname, 'src/agentes/servico.js'), [], { execArgv: ['--disable-warning=ExperimentalWarning'] });
        p.on('exit', (c) => { console.error(new Date().toLocaleTimeString('pt-BR'), '[escritório] processo das linhas saiu (código', c + '); reabrindo em 10 s'); setTimeout(abre, 10e3); });
        abre.atual = p;
      };
      process.on('exit', () => { try { abre.atual && abre.atual.kill(); } catch {} });
      abre();
    }
    // Condomínios: liga anúncios novos do Radar/Fisguei aos prédios e avisa dos prédios-alvo (a cada 10 min).
    const vincula = () => { try { const r = require('./src/condominios/base').vincular(); if (r.radar || r.fisguei) console.log('[condomínios]', r); } catch (e) { console.error('[condomínios]', e.message); } };
    setTimeout(vincula, 60e3); setInterval(vincula, 10 * 60e3);
  });
}

module.exports = app;
