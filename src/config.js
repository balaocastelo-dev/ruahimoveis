// Carrega o arquivo .env (sem dependências externas) e expõe a configuração.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = (k, d = '') => (process.env[k] ?? d).trim();

const PORT = parseInt(env('PORT', '3333'), 10);

// ---- configuração POR IMOBILIÁRIA (plataforma multi-imobiliária) ----
// Estes valores são da imobiliária atendida agora: com MULTI=1 vêm do cadastro dela (base.imobiliarias,
// pela imobiliária do contexto: tenant.atual()); sem MULTI, ou sem imobiliária no contexto, vêm do .env, como sempre.
// São lidos NA HORA (getters): nunca guarde estes valores numa constante no carregamento do módulo.
const DO_ENV = {
  CLIENTE_NOME: () => env('CLIENTE_NOME', 'RUAH'),                         // nome curto da imobiliária (marca no portal, blog, mensagens)
  EMPRESA: () => env('EMPRESA', 'RUAH Investimentos Imobiliários'),          // razão/nome completo da imobiliária
  CIDADE_PADRAO: () => env('CIDADE_PADRAO', 'Campinas'),
  UF_PADRAO: () => env('UF_PADRAO', 'SP'),
  // Número de WhatsApp da imobiliária impresso no QR code das cartas (com DDD). Vazio = usa o celular do corretor.
  // WHATSAPP_RUAH é o nome antigo da variável e continua valendo.
  WHATSAPP_CLIENTE: () => env('WHATSAPP_CLIENTE') || env('WHATSAPP_RUAH'),
  PUBLIC_URL: () => env('PUBLIC_URL', ''),                                  // URL pública (túnel) para links de assinatura, off-market e webhook
  LINK_ONLINE: () => env('LINK_ONLINE', 'https://ruahimoveis.vercel.app'),  // links das mensagens dos agentes quando não há PUBLIC_URL
  DRIVE_ROOT_NAME: () => env('DRIVE_ROOT_NAME', `${DO_ENV.CLIENTE_NOME()} Imóveis`),
  RADAR_BAIRROS: () => env('RADAR_BAIRROS', ''),                            // bairros vigiados, separados por vírgula (vazio = os 11 bairros padrão do cliente)
  // Blog, portal, site e Instagram da imobiliária (SITE_RUAH / INSTAGRAM_RUAH são os nomes antigos e continuam valendo)
  BLOG_NOME: () => env('BLOG_NOME') || 'Sopro',
  BLOG_LEGENDA: () => env('BLOG_LEGENDA') || `Casa, arquitetura e bem-estar, pela ${DO_ENV.CLIENTE_NOME()}`,
  BLOG_URL: () => env('BLOG_URL'),
  BLOG_CRECI: () => env('BLOG_CRECI'),
  PORTAL_URL: () => env('PORTAL_URL'),
  SITE_CLIENTE: () => env('SITE_CLIENTE') || env('SITE_RUAH') || 'https://www.ruahimobiliaria.com.br',
  INSTAGRAM_CLIENTE: () => env('INSTAGRAM_CLIENTE') || env('INSTAGRAM_RUAH'),
};
// onde cada valor fica no cadastro da imobiliária (linha de base.imobiliarias; config = JSON com o resto)
const DO_CADASTRO = {
  CLIENTE_NOME: (r) => r.nome_curto, EMPRESA: (r) => r.empresa, CIDADE_PADRAO: (r) => r.cidade, UF_PADRAO: (r) => r.uf,
  WHATSAPP_CLIENTE: (r) => r.whatsapp, PUBLIC_URL: (r) => r.public_url, LINK_ONLINE: (r) => r.config && r.config.link_online,
  DRIVE_ROOT_NAME: (r) => r.config && r.config.drive_root_name, RADAR_BAIRROS: (r) => r.radar_bairros,
  BLOG_NOME: (r) => r.blog_nome, BLOG_LEGENDA: (r) => r.blog_legenda, BLOG_URL: (r) => r.blog_url, BLOG_CRECI: (r) => r.creci,
  PORTAL_URL: (r) => r.portal_url, SITE_CLIENTE: (r) => r.site, INSTAGRAM_CLIENTE: (r) => r.instagram,
};
// campo vazio no cadastro de uma imobiliária que NÃO é a padrão: valor neutro (nunca o .env, que é da padrão)
const SEM_VALOR = {
  CLIENTE_NOME: (r) => String(r.slug).toUpperCase(), EMPRESA: (r) => valor('CLIENTE_NOME', r), CIDADE_PADRAO: () => 'Campinas', UF_PADRAO: () => 'SP',
  LINK_ONLINE: (r) => r.portal_url || r.public_url || '', DRIVE_ROOT_NAME: (r) => `${valor('CLIENTE_NOME', r)} Imóveis`,
  BLOG_NOME: () => 'Sopro', BLOG_LEGENDA: (r) => `Casa, arquitetura e bem-estar, pela ${valor('CLIENTE_NOME', r)}`,
  SITE_CLIENTE: (r) => r.portal_url || r.public_url || '',
};
const cheio = (v) => v !== undefined && v !== null && String(v).trim() !== '';
function valor(k, r) {
  const v = DO_CADASTRO[k](r);
  if (cheio(v)) return String(v).trim();
  // a imobiliária padrão (a desta instalação) completa o que falta com o .env, como antes da plataforma
  if (r.slug === (process.env.IMOBILIARIA_PADRAO || 'ruah').trim().toLowerCase()) return DO_ENV[k]();
  return SEM_VALOR[k] ? SEM_VALOR[k](r) : '';
}
function daImobiliaria(k) {
  const r = require('./tenant').imobiliaria(); // null sem MULTI ou sem contexto
  return r ? valor(k, r) : DO_ENV[k]();
}
// Os valores do .env (sem olhar imobiliária nenhuma): usado para semear o cadastro da imobiliária padrão.
const doEnv = () => Object.fromEntries(Object.keys(DO_ENV).map((k) => [k, DO_ENV[k]()]));

const config = {
  ROOT,
  // Na Vercel só /tmp aceita gravação (cache temporário); no PC continua em data/.
  DATA_DIR: process.env.VERCEL ? '/tmp/ruah-data' : path.join(ROOT, 'data'),
  DATABASE_URL: env('DATABASE_URL'), // Postgres online (Supabase). Vazio = banco local SQLite.
  PORT,
  BASE_URL: env('BASE_URL', process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${PORT}`),
  SECRET_KEY: env('SECRET_KEY'),
  // Nome do sistema (o produto): global, igual para todas as imobiliárias.
  SISTEMA_NOME: env('SISTEMA_NOME', 'Herrera HOUSE IA'),
  get WHATSAPP_RUAH() { return this.WHATSAPP_CLIENTE; },
  get SITE_RUAH() { return this.SITE_CLIENTE; },
  get INSTAGRAM_RUAH() { return this.INSTAGRAM_CLIENTE; },
  doEnv,

  // Google Drive
  GOOGLE_CLIENT_ID: env('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: env('GOOGLE_CLIENT_SECRET'),
  DRIVE_ROOT_FOLDER_ID: env('DRIVE_ROOT_FOLDER_ID'), // opcional: ID de uma pasta ou Drive compartilhado

  // WhatsApp Cloud API (oficial)
  WA_TOKEN: env('WA_TOKEN'),
  WA_PHONE_ID: env('WA_PHONE_ID'),
  WA_VERIFY_TOKEN: env('WA_VERIFY_TOKEN'),
  WA_APP_SECRET: env('WA_APP_SECRET'),
  CUSTO_MATRICULA: parseFloat(env('CUSTO_MATRICULA', '0')) || 0,
  CUSTO_BIRO: parseFloat(env('CUSTO_BIRO', '0')) || 0,

  // Radar automático: e-mail que recebe os alertas de busca dos portais (Gmail com senha de app)
  RADAR_EMAIL: env('RADAR_EMAIL'),
  RADAR_EMAIL_SENHA: env('RADAR_EMAIL_SENHA'),
  RADAR_EMAIL_PASTA: env('RADAR_EMAIL_PASTA', 'INBOX'),
  RADAR_INTERVALO_MIN: env('RADAR_INTERVALO_MIN', '10'),
  RADAR_ALERTA_MAX_HORAS: env('RADAR_ALERTA_MAX_HORAS', '24'),
  RADAR_PORTAIS: env('RADAR_PORTAIS', '1'),            // monitor direto dos portais (0 desliga)
  RADAR_PORTAIS_MIN: env('RADAR_PORTAIS_MIN', '60'),   // de quantos em quantos minutos (mínimo 30)

  // Fisguei: robô TH-IA-GO CORRETOR (WhatsApp pelo QR code). Roda só no PC; 0 desliga.
  FISGUEI_ROBO: env('FISGUEI_ROBO', '1'),

  // Escritório virtual (9 agentes robôs com WhatsApp próprio). Roda só no PC; 0 desliga.
  ESCRITORIO: env('ESCRITORIO', '1'),

  // IA local (Ollama)
  OLLAMA_URL: env('OLLAMA_URL', 'http://127.0.0.1:11434'),
  OLLAMA_MODEL: env('OLLAMA_MODEL', 'qwen3:14b'),
  IA_MODO: env('IA_MODO', 'sugerir'), // desligado | sugerir | automatico
};
for (const k of Object.keys(DO_ENV)) Object.defineProperty(config, k, { get: () => daImobiliaria(k), enumerable: true, configurable: true });

module.exports = config;
