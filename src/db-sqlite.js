// Banco SQLite embutido no Node (node:sqlite). Nenhum programa extra para instalar.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./config');
const tenant = require('./tenant');
const { traduzSqlite, nomeSqlite } = require('./sql-pg');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(process.env.RUAH_DB || path.join(DATA_DIR, 'ruah.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Multi-imobiliária: toda a estrutura passa pelo tradutor. Com MULTI desligado (padrão) o SQL sai idêntico;
// com MULTI=1 as tabelas privadas ganham o prefixo da imobiliária (ruah__imoveis) e as comuns ficam sem prefixo.
const ex = (sql) => db.exec(traduzSqlite(sql));

function estrutura() {
ex(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  telefone TEXT,
  perfil TEXT NOT NULL CHECK (perfil IN ('adm','gestor','corretor')),
  senha_hash TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tentativas_login (
  chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL, bloqueado_ate INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);

CREATE TABLE IF NOT EXISTS condominios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cep TEXT, logradouro TEXT, numero TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  ano_construcao TEXT, lazer TEXT, administradora TEXT,
  lat REAL, lon REAL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cond_end ON condominios(cep, numero);

CREATE TABLE IF NOT EXISTS proprietarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL, cpf TEXT, telefone TEXT, email TEXT,
  origem_dado TEXT NOT NULL DEFAULT 'Informado pelo proprietário',
  nao_contatar INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS imoveis (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'captacao'
    CHECK (status IN ('captacao','aguardando_autorizacao','publicado','off_market','vendido','suspenso')),
  cep TEXT, logradouro TEXT, numero TEXT, unidade TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  lat REAL, lon REAL,
  condominio_id INTEGER REFERENCES condominios(id),
  quartos INTEGER, suites INTEGER, vagas INTEGER,
  area_util REAL, area_total REAL,
  valor REAL, valor_condominio REAL, iptu REAL,
  descricao TEXT,
  exclusivo INTEGER NOT NULL DEFAULT 0, exclusivo_ate TEXT,
  corretor_id INTEGER REFERENCES usuarios(id),
  proprietario_id INTEGER REFERENCES proprietarios(id),
  drive_pasta_id TEXT,
  drive_subpastas TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS arquivos (
  id INTEGER PRIMARY KEY,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  mime TEXT, tamanho INTEGER,
  caminho_local TEXT,
  drive_id TEXT, drive_link TEXT,
  enviado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS links_internos (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  mostrar_endereco INTEGER NOT NULL DEFAULT 0,
  expira_em TEXT NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS links_acessos (
  id INTEGER PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES links_internos(id) ON DELETE CASCADE,
  ip TEXT, user_agent TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT, email TEXT,
  origem TEXT,
  etapa TEXT NOT NULL DEFAULT 'novo'
    CHECK (etapa IN ('novo','qualificado','visita','proposta','escritura','perdido')),
  temperatura TEXT NOT NULL DEFAULT 'morno' CHECK (temperatura IN ('quente','morno','frio')),
  corretor_id INTEGER REFERENCES usuarios(id),
  busca TEXT,
  tipo_desejado TEXT, quartos_min INTEGER, vagas_min INTEGER, valor_max REAL, bairros TEXT,
  nao_contatar INTEGER NOT NULL DEFAULT 0,
  ultimo_contato TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_leads_tel ON leads(telefone);

CREATE TABLE IF NOT EXISTS interacoes (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  texto TEXT,
  autor_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  corretor_id INTEGER REFERENCES usuarios(id),
  data_hora TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','confirmada','realizada','cancelada')),
  avaliacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada','saida','sugestao')),
  texto TEXT NOT NULL,
  status TEXT,
  wa_id TEXT,
  autor TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_msg_lead ON mensagens(lead_id);

CREATE TABLE IF NOT EXISTS assinaturas (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'autorizacao_venda',
  conteudo TEXT NOT NULL,
  conteudo_hash TEXT NOT NULL,
  prazo_dias INTEGER, comissao_pct REAL, exclusivo INTEGER,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','assinado','cancelado')),
  assinante_nome TEXT, assinante_cpf TEXT,
  assinatura_png TEXT,
  ip TEXT, user_agent TEXT, assinado_em TEXT,
  pdf_arquivo_id INTEGER REFERENCES arquivos(id),
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== Fase 2: radar de captação =====
CREATE TABLE IF NOT EXISTS oportunidades (
  id INTEGER PRIMARY KEY,
  portal TEXT, link TEXT, titulo TEXT,
  tipo TEXT, bairro TEXT, logradouro TEXT, numero TEXT, unidade TEXT, condominio_nome TEXT, cidade TEXT,
  quartos INTEGER, vagas INTEGER, area REAL,
  valor REAL, valor_anterior REAL,
  anunciante_tipo TEXT NOT NULL DEFAULT 'particular' CHECK (anunciante_tipo IN ('particular','imobiliaria','desconhecido')),
  anunciante_nome TEXT, telefone_anuncio TEXT,
  publicado_em TEXT,
  status TEXT NOT NULL DEFAULT 'nova'
    CHECK (status IN ('nova','em_contato','carta_enviada','aguardando_aprovacao','captada','descartada')),
  motivo_descarte TEXT,
  corretor_id INTEGER REFERENCES usuarios(id),
  titular_nome TEXT, titular_telefone TEXT, titular_origem TEXT,
  matricula_numero TEXT, cartorio TEXT,
  carta_enviada_em TEXT,
  observacoes TEXT,
  imovel_id INTEGER REFERENCES imoveis(id),
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_op_status ON oportunidades(status);
CREATE TABLE IF NOT EXISTS oportunidade_eventos (
  id INTEGER PRIMARY KEY,
  oportunidade_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL,
  texto TEXT,
  custo REAL NOT NULL DEFAULT 0,
  autor_id INTEGER REFERENCES usuarios(id),
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS aprovacoes (
  id INTEGER PRIMARY KEY,
  oportunidade_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('matricula','biro')),
  custo_estimado REAL,
  justificativa TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','negada')),
  solicitado_por INTEGER REFERENCES usuarios(id),
  decidido_por INTEGER REFERENCES usuarios(id),
  decidido_em TEXT, motivo TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== Fisguei: anúncios e proprietários vindos do Fisgar + robô TH-IA-GO =====
CREATE TABLE IF NOT EXISTS fisguei_anuncios (
  id INTEGER PRIMARY KEY,
  fisgar_id TEXT NOT NULL UNIQUE,
  portal TEXT, link TEXT, titulo TEXT,
  tipo TEXT, negocio TEXT, finalidade TEXT,
  logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT, cep TEXT,
  lat REAL, lon REAL,
  valor REAL, valor_condominio REAL, iptu REAL,
  quartos INTEGER, suites INTEGER, banheiros INTEGER, vagas INTEGER,
  area_util REAL, area_total REAL,
  anunciante_nome TEXT, anunciante_tipo TEXT NOT NULL DEFAULT 'desconhecido',
  publicado_em TEXT,
  fotos TEXT,
  -- SEM USO desde a plataforma multi-imobiliária: status/pausado/oportunidade_id/imovel_id/observacoes de cada
  -- imobiliária ficam em anuncio_andamento (privada). As colunas ficam aqui só para permitir voltar a versão.
  status TEXT NOT NULL DEFAULT 'novo',
  pausado INTEGER NOT NULL DEFAULT 0,
  oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  imovel_id INTEGER REFERENCES imoveis(id) ON DELETE SET NULL,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_fa_status ON fisguei_anuncios(status);
-- pessoas e pedidos são da imobiliária (privadas) e apontam para o anúncio comum: RESTRICT, para apagar um anúncio
-- comum nunca destruir dado privado (bancos antigos do PC mantêm o CASCADE de antes; ninguém apaga anúncio no sistema).
CREATE TABLE IF NOT EXISTS fisguei_pessoas (
  id INTEGER PRIMARY KEY,
  anuncio_id INTEGER NOT NULL REFERENCES fisguei_anuncios(id) ON DELETE RESTRICT,
  chave TEXT NOT NULL,
  fisgar_pessoa_id TEXT,
  nome TEXT NOT NULL,
  relacao TEXT, unidade TEXT, idade INTEGER,
  consultado INTEGER NOT NULL DEFAULT 0,
  consultado_em TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (anuncio_id, chave)
);
CREATE TABLE IF NOT EXISTS fisguei_contatos (
  id INTEGER PRIMARY KEY,
  pessoa_id INTEGER NOT NULL REFERENCES fisguei_pessoas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  valor TEXT NOT NULL,
  envio TEXT NOT NULL DEFAULT 'fila',
  enviado_em TEXT, erro TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (pessoa_id, tipo, valor)
);
CREATE INDEX IF NOT EXISTS ix_fc_envio ON fisguei_contatos(envio);
CREATE INDEX IF NOT EXISTS ix_fc_valor ON fisguei_contatos(valor);
CREATE TABLE IF NOT EXISTS fisguei_mensagens (
  id INTEGER PRIMARY KEY,
  pessoa_id INTEGER REFERENCES fisguei_pessoas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL,
  texto TEXT NOT NULL,
  status TEXT,
  wa_id TEXT,
  autor TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_fm_tel ON fisguei_mensagens(telefone);
CREATE TABLE IF NOT EXISTS fisguei_pedidos (
  id INTEGER PRIMARY KEY,
  anuncio_id INTEGER NOT NULL REFERENCES fisguei_anuncios(id) ON DELETE RESTRICT,
  pessoa_id INTEGER REFERENCES fisguei_pessoas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'endereco',
  status TEXT NOT NULL DEFAULT 'fila',
  creditos INTEGER NOT NULL DEFAULT 0,
  pessoas INTEGER, consultadas INTEGER,
  erro TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  iniciado_em TEXT, concluido_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_fp_status ON fisguei_pedidos(status);
CREATE TABLE IF NOT EXISTS fisguei_bloqueios (
  telefone TEXT PRIMARY KEY,
  motivo TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER, acao TEXT NOT NULL, detalhe TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

// Colunas novas em tabelas que já existiam no PC.
for (const [t, c, def] of [['fisguei_anuncios', 'imovel_id', 'INTEGER REFERENCES imoveis(id) ON DELETE SET NULL'],
  ['condominios', 'tipo', 'TEXT'],
  ['condominios', 'cnpj', 'TEXT'],
  ['condominios', 'razao_social', 'TEXT'],
  ['condominios', 'situacao', 'TEXT'],
  ['condominios', 'abertura', 'TEXT'],
  ['condominios', 'complemento', 'TEXT'],
  ['condominios', 'fontes', 'TEXT'],
  ['condominios', 'osm_ref', 'TEXT'],
  ['condominios', 'andares', 'INTEGER'],
  ['condominios', 'torres', 'INTEGER'],
  ['condominios', 'unidades', 'INTEGER'],
  ['condominios', 'unidades_fonte', 'TEXT'],
  ['condominios', 'contorno', 'TEXT'],
  ['condominios', 'construtora', 'TEXT'],
  ['condominios', 'slug', 'TEXT'],
  ['condominios', 'alvo', 'INTEGER NOT NULL DEFAULT 0'], // sem uso: o prédio-alvo de cada imobiliária está em condominio_alvos
  ['condominios', 'nome_busca', 'TEXT'],
  ['condominios', 'geo_fonte', 'TEXT'],
  ['condominios', 'atualizado_em', 'TEXT'],
  ['condominios', 'numeracao', 'TEXT'],
  ['condominios', 'sem_nome', 'INTEGER NOT NULL DEFAULT 0'],
  ['oportunidades', 'cond_checado', 'INTEGER NOT NULL DEFAULT 0'],
  ['oportunidades', 'foto', 'TEXT'],
  ['fisguei_anuncios', 'cond_checado', 'INTEGER NOT NULL DEFAULT 0'],
  ['oportunidades', 'condominio_id', 'INTEGER REFERENCES condominios(id) ON DELETE SET NULL'],
  ['fisguei_anuncios', 'condominio_id', 'INTEGER REFERENCES condominios(id) ON DELETE SET NULL'],
  ['fisguei_anuncios', 'anunciado_desde', 'TEXT'],
  ['leads', 'agente', 'TEXT']]) {
  if (!db.prepare(`PRAGMA table_info(${nomeSqlite(t)})`).all().some((x) => x.name === c)) ex(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
}

ex(`CREATE TABLE IF NOT EXISTS condominio_cache (
  condominio_id INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, json TEXT NOT NULL, gerado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (condominio_id, tipo));
CREATE UNIQUE INDEX IF NOT EXISTS ux_cond_cnpj ON condominios(cnpj) WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cond_slug ON condominios(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_op_cond ON oportunidades(condominio_id);
CREATE TABLE IF NOT EXISTS condominio_alertas (
  id INTEGER PRIMARY KEY, condominio_id INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
  origem TEXT NOT NULL, ref_id INTEGER NOT NULL, texto TEXT, visto INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')), UNIQUE (origem, ref_id));
CREATE TABLE IF NOT EXISTS fachadas (ref TEXT PRIMARY KEY, img BLOB, pano_lat REAL, pano_lon REAL, rumo REAL, data_foto TEXT, gerado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS mapa3d (tile TEXT PRIMARY KEY, dados BLOB NOT NULL, atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS pois (id INTEGER PRIMARY KEY, cat TEXT NOT NULL, nome TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL);
CREATE TABLE IF NOT EXISTS predios3d (tile TEXT PRIMARY KEY, dados BLOB NOT NULL, atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS ix_fa_cond ON fisguei_anuncios(condominio_id);
CREATE INDEX IF NOT EXISTS ix_fa_oport ON fisguei_anuncios(oportunidade_id) WHERE oportunidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fa_checado ON fisguei_anuncios(cond_checado) WHERE cond_checado = 0;
CREATE INDEX IF NOT EXISTS ix_fa_criado ON fisguei_anuncios(criado_em);
CREATE INDEX IF NOT EXISTS ix_fa_imovel ON fisguei_anuncios(imovel_id) WHERE imovel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_oe_oport ON oportunidade_eventos(oportunidade_id);
CREATE INDEX IF NOT EXISTS ix_fc_pessoa ON fisguei_contatos(pessoa_id);
CREATE INDEX IF NOT EXISTS ix_fm_pessoa ON fisguei_mensagens(pessoa_id);
CREATE INDEX IF NOT EXISTS ix_op_checado ON oportunidades(cond_checado) WHERE cond_checado = 0;
CREATE TABLE IF NOT EXISTS fisguei_precos (
  id INTEGER PRIMARY KEY, anuncio_id INTEGER NOT NULL REFERENCES fisguei_anuncios(id) ON DELETE CASCADE,
  valor REAL NOT NULL, em TEXT NOT NULL DEFAULT (datetime('now','localtime')), fonte TEXT);
CREATE INDEX IF NOT EXISTS ix_fpr_anuncio ON fisguei_precos(anuncio_id);
-- bairros: o catálogo é comum; prioridade/oculto/notas/pedido_em ficaram SEM USO (a escolha de cada imobiliária
-- está em bairro_ajustes) e só continuam aqui para permitir voltar a versão.
CREATE TABLE IF NOT EXISTS bairros (
  slug TEXT PRIMARY KEY, nome TEXT NOT NULL, regiao TEXT, apelidos TEXT, prioridade INTEGER NOT NULL DEFAULT 0,
  oculto INTEGER NOT NULL DEFAULT 0, notas TEXT, pedido_em TEXT, origem TEXT, lat REAL, lon REAL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')), atualizado_em TEXT);
CREATE TABLE IF NOT EXISTS bairro_commons (
  titulo TEXT PRIMARY KEY, url TEXT, thumb TEXT, largura INTEGER, altura INTEGER, autor TEXT, licenca TEXT, descricao TEXT,
  ok INTEGER NOT NULL DEFAULT 0, motivo TEXT, verificado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);

// Escritório virtual: conversas, eventos, afazeres e fotos dos agentes robôs.
ex(`CREATE TABLE IF NOT EXISTS agente_mensagens (
  id INTEGER PRIMARY KEY, agente TEXT NOT NULL, linha TEXT, telefone TEXT NOT NULL, nome TEXT,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada','saida','nota')), texto TEXT NOT NULL, status TEXT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, pessoa_id INTEGER REFERENCES fisguei_pessoas(id) ON DELETE SET NULL,
  wa_id TEXT, autor TEXT, processada INTEGER NOT NULL DEFAULT 0, motivo TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')), enviado_em TEXT);
CREATE INDEX IF NOT EXISTS ix_am_agente ON agente_mensagens(agente, telefone);
CREATE INDEX IF NOT EXISTS ix_am_proc ON agente_mensagens(processada, direcao);
CREATE INDEX IF NOT EXISTS ix_am_status ON agente_mensagens(direcao, status);
CREATE INDEX IF NOT EXISTS ix_am_wa ON agente_mensagens(wa_id);
CREATE TABLE IF NOT EXISTS agente_eventos (
  id INTEGER PRIMARY KEY, agente TEXT NOT NULL, tipo TEXT NOT NULL, texto TEXT, ref TEXT, chave TEXT UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS ix_ae_agente ON agente_eventos(agente, id);
CREATE TABLE IF NOT EXISTS agente_afazeres (
  id INTEGER PRIMARY KEY, corretor_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, texto TEXT NOT NULL, quando TEXT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, imovel_id INTEGER REFERENCES imoveis(id) ON DELETE SET NULL, origem TEXT,
  feito INTEGER NOT NULL DEFAULT 0, feito_em TEXT, lembrado_em TEXT, criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS ix_af_corretor ON agente_afazeres(corretor_id, feito);
CREATE TABLE IF NOT EXISTS agente_midias (
  id INTEGER PRIMARY KEY, agente TEXT NOT NULL, telefone TEXT, pessoa_id INTEGER REFERENCES fisguei_pessoas(id) ON DELETE SET NULL,
  anuncio_id INTEGER REFERENCES fisguei_anuncios(id) ON DELETE SET NULL, oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, mime TEXT, nome TEXT, tamanho INTEGER, legenda TEXT, dados BLOB NOT NULL,
  imovel_arquivo_id INTEGER, criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);

// Multi-imobiliária · tabelas mistas: o que cada imobiliária decide sobre um dado comum (anúncio, prédio, bairro).
// Sem linha aqui = valor padrão (anúncio 'novo' e não pausado, prédio que não é alvo, bairro sem ajuste).
ex(`CREATE TABLE IF NOT EXISTS anuncio_andamento (
  anuncio_id INTEGER PRIMARY KEY REFERENCES fisguei_anuncios(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'novo',
  pausado INTEGER NOT NULL DEFAULT 0,
  oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  imovel_id INTEGER REFERENCES imoveis(id) ON DELETE SET NULL,
  observacoes TEXT,
  atualizado_em TEXT);
CREATE INDEX IF NOT EXISTS ix_and_status ON anuncio_andamento(status);
CREATE INDEX IF NOT EXISTS ix_and_oport ON anuncio_andamento(oportunidade_id) WHERE oportunidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_and_imovel ON anuncio_andamento(imovel_id) WHERE imovel_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS condominio_alvos (
  condominio_id INTEGER PRIMARY KEY REFERENCES condominios(id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS bairro_ajustes (
  slug TEXT PRIMARY KEY REFERENCES bairros(slug) ON DELETE RESTRICT,
  prioridade INTEGER NOT NULL DEFAULT 0, oculto INTEGER NOT NULL DEFAULT 0, notas TEXT, pedido_em TEXT, atualizado_em TEXT);`);
migraMistas();
}

// Uma vez só, e só na imobiliária padrão (a RUAH, dona dos dados que já estavam nas colunas antigas): copia o trabalho
// que estava nas tabelas comuns para as privadas. Imobiliária nova começa vazia (nada da RUAH vaza para ela).
// No Postgres o equivalente é sql/plataforma-mistas.sql.
function migraMistas() {
  if (tenant.multi() && tenant.atual() && tenant.atual().slug !== tenant.padrao().slug) return;
  const q = (sql, ...p) => db.prepare(traduzSqlite(sql)).all(...p);
  if (q("SELECT 1 FROM config WHERE chave='plataforma_mistas_v1'").length) return;
  q(`INSERT INTO anuncio_andamento(anuncio_id,status,pausado,oportunidade_id,imovel_id,observacoes,atualizado_em)
    SELECT id, coalesce(status,'novo'), coalesce(pausado,0), oportunidade_id, imovel_id, observacoes, atualizado_em FROM fisguei_anuncios
    WHERE (coalesce(status,'novo') <> 'novo' OR coalesce(pausado,0) <> 0 OR oportunidade_id IS NOT NULL OR imovel_id IS NOT NULL OR observacoes IS NOT NULL)
      AND id NOT IN (SELECT anuncio_id FROM anuncio_andamento)`);
  q(`INSERT INTO condominio_alvos(condominio_id) SELECT id FROM condominios WHERE alvo=1 AND id NOT IN (SELECT condominio_id FROM condominio_alvos)`);
  q(`INSERT INTO bairro_ajustes(slug,prioridade,oculto,notas,pedido_em,atualizado_em)
    SELECT slug, prioridade, oculto, notas, pedido_em, atualizado_em FROM bairros
    WHERE (prioridade <> 0 OR oculto <> 0 OR notas IS NOT NULL OR pedido_em IS NOT NULL) AND slug NOT IN (SELECT slug FROM bairro_ajustes)`);
  q("INSERT INTO config(chave,valor) VALUES('plataforma_mistas_v1', datetime('now','localtime'))");
}

// Sem MULTI: a estrutura de sempre. Com MULTI=1: a da imobiliária padrão (as outras entram com criaImobiliaria).
if (tenant.multi()) tenant.comImobiliaria(tenant.atual() || tenant.padrao(), estrutura);
else estrutura();

// Cria (ou completa) as tabelas privadas de uma imobiliária no SQLite (só com MULTI=1).
// TODO(fase1 · migração): no Postgres isso vira o script que cria o schema da imobiliária a partir do modelo.
function criaImobiliaria(slug) {
  if (!tenant.multi()) throw new Error('criaImobiliaria só funciona com MULTI=1.');
  tenant.comImobiliaria(slug, estrutura);
}

const T = traduzSqlite;
const one = (sql, ...p) => db.prepare(T(sql)).get(...p);
const all = (sql, ...p) => db.prepare(T(sql)).all(...p);
const run = (sql, ...p) => db.prepare(T(sql)).run(...p);

function getConfig(k) { const r = one('SELECT valor FROM config WHERE chave=?', k); return r ? r.valor : null; }
function setConfig(k, v) {
  if (v === null || v === undefined) return run('DELETE FROM config WHERE chave=?', k);
  run('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', k, String(v));
}
function audit(usuarioId, acao, detalhe) {
  run('INSERT INTO auditoria(usuario_id,acao,detalhe) VALUES(?,?,?)', usuarioId ?? null, acao, detalhe ? String(detalhe).slice(0, 1000) : null);
}

module.exports = { db, one, all, run, getConfig, setConfig, audit, criaImobiliaria, PG: false };
