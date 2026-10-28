// Herrera HOUSE IA · plataforma multi-imobiliária (fase 1): classificação de TODAS as tabelas do sistema.
//   'comum'   → fica no schema compartilhado (Postgres: base.x; SQLite com MULTI=1: x, sem prefixo)
//   'privada' → uma cópia por imobiliária (Postgres: "<schema da imobiliária>".x; SQLite com MULTI=1: <schema>__x)
// Regra para tabela nova: dado de anúncio/prédio/mapa público = comum; trabalho/cliente/pessoa da imobiliária = privada.
// O teste test/catalogo-tabelas.js garante que toda tabela criada em src/db-sqlite.js e em sql/*.sql está aqui.

const COMUNS = [
  // prédios, mapa e bairros (dado público, igual para todas as imobiliárias)
  'condominios', 'condominio_cache', 'predios3d', 'mapa3d', 'pois', 'fachadas', 'bairro_commons', 'bairros',
  // anúncios vindos dos portais (Fisgar) e o histórico de preço deles
  // TODO(fase1 · tabelas mistas): fisguei_anuncios tem oportunidade_id/imovel_id/status/observacoes/pausado, que são
  // trabalho da imobiliária ("andamento do anúncio"); separar numa tabela privada antes de abrir para a 2ª imobiliária.
  'fisguei_anuncios', 'fisguei_precos',
  // proteção contra força bruta no login (chave = e-mail/IP, vale para a plataforma toda)
  'tentativas_login',
  // plataforma: cadastro das imobiliárias, domínios, índice de login (e-mail → imobiliária), gestores e auditoria
  'imobiliarias', 'dominios', 'login_indice', 'gestores', 'auditoria_plataforma',
  // sessões de login: comuns, com imobiliaria_id (e gestor_id para o gestor da plataforma). Cookie ruah_sessao.
  'sessoes',
  // prevista (ainda não criada): chaves de integração por imobiliária
  'chaves_integracao',
];

const PRIVADAS = [
  'usuarios', 'proprietarios', 'imoveis', 'arquivos', 'arquivos_dados', 'links_internos', 'links_acessos', 'assinaturas',
  'leads', 'interacoes', 'visitas', 'mensagens',
  'oportunidades', 'oportunidade_eventos', 'aprovacoes',
  'fisguei_pessoas', 'fisguei_contatos', 'fisguei_mensagens', 'fisguei_pedidos', 'fisguei_bloqueios',
  'agente_mensagens', 'agente_eventos', 'agente_afazeres', 'agente_midias',
  'condominio_alertas', 'config', 'auditoria',
];

const MAPA = Object.freeze(Object.fromEntries([...COMUNS.map((t) => [t, 'comum']), ...PRIVADAS.map((t) => [t, 'privada'])]));

// 'comum' | 'privada' | null (fora do mapa)
function classe(nome) {
  return Object.prototype.hasOwnProperty.call(MAPA, String(nome).toLowerCase()) ? MAPA[String(nome).toLowerCase()] : null;
}
// Lança erro se a tabela não estiver classificada (usado pelo modo estrito e pelos testes).
function checa(nome) {
  const c = classe(nome);
  if (!c) { const e = new Error(`Tabela fora do mapa de classificação (src/tabelas.js): ${nome}`); e.code = 'TABELA_FORA_DO_MAPA'; throw e; }
  return c;
}

module.exports = { MAPA, COMUNS: new Set(COMUNS), PRIVADAS: new Set(PRIVADAS), classe, checa };
