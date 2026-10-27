// Bairros · o catálogo inicial dos bairros de Campinas com página própria.
//
// É só o ponto de partida: na primeira leitura ele vai para a tabela `bairros`
// e, dali em diante, quem manda é a tela Conteúdo › Páginas de bairros
// (adicionar bairro, mudar nome, região, apelidos, prioridade, ocultar).
//
// `apelidos` são as outras grafias que aparecem nos cadastros (imóveis da
// carteira, base de condomínios da Receita/IBGE): é por elas que o sistema sabe
// quais imóveis e prédios são de cada bairro. A região é só para agrupar a
// lista pública; o que vale para o texto é o que a pesquisa da página confirmar.

const CATALOGO = [
  // ---- Região central
  { nome: 'Cambuí', regiao: 'Região central', apelidos: ['Cambui'] },
  { nome: 'Centro', regiao: 'Região central', apelidos: ['Centro de Campinas'] },
  { nome: 'Bosque', regiao: 'Região central', apelidos: ['Vila Bosque', 'Bosque dos Jequitibás'] },
  { nome: 'Botafogo', regiao: 'Região central', apelidos: [] },
  { nome: 'Vila Itapura', regiao: 'Região central', apelidos: ['Itapura'] },
  { nome: 'Guanabara', regiao: 'Região central', apelidos: ['Jardim Guanabara', 'Vila Guanabara'] },
  { nome: 'Bonfim', regiao: 'Região central', apelidos: ['Jardim Bonfim', 'Vila Bonfim'] },
  { nome: 'Vila Nova', regiao: 'Região central', apelidos: [] },
  { nome: 'Jardim Chapadão', regiao: 'Região central', apelidos: ['Chapadão'] },
  { nome: 'Jardim Brasil', regiao: 'Região central', apelidos: [] },
  { nome: 'Jardim Nossa Senhora Auxiliadora', regiao: 'Região central', apelidos: ['Nossa Senhora Auxiliadora', 'Jardim N S Auxiliadora'] },
  { nome: 'Jardim Proença', regiao: 'Região central', apelidos: ['Proença', 'Vila Proença'] },
  { nome: 'Vila Lemos', regiao: 'Região central', apelidos: [] },
  // ---- Leste
  { nome: 'Nova Campinas', regiao: 'Leste', apelidos: ['Jardim Nova Campinas'] },
  { nome: 'Taquaral', regiao: 'Leste', apelidos: ['Parque Taquaral', 'Alto Taquaral', 'Jardim Taquaral'] },
  { nome: 'Chácara da Barra', regiao: 'Leste', apelidos: ['Chacara da Barra'] },
  { nome: 'Jardim das Paineiras', regiao: 'Leste', apelidos: ['Paineiras'] },
  { nome: 'Jardim Flamboyant', regiao: 'Leste', apelidos: ['Flamboyant'] },
  { nome: 'Parque Brasília', regiao: 'Leste', apelidos: ['Parque Brasilia'] },
  { nome: 'Jardim Paraíso', regiao: 'Leste', apelidos: ['Vila Paraíso'] },
  { nome: 'Vila Brandina', regiao: 'Leste', apelidos: ['Brandina'] },
  { nome: 'Gramado', regiao: 'Leste', apelidos: ['Sítios de Recreio Gramado', 'Sitios de Recreio Gramado', 'Parque Gramado'] },
  { nome: 'Bairro das Palmeiras', regiao: 'Leste', apelidos: ['Palmeiras', 'Jardim das Palmeiras'] },
  { nome: 'Jardim Boa Esperança', regiao: 'Leste', apelidos: [] },
  { nome: 'São Quirino', regiao: 'Leste', apelidos: ['Fazenda São Quirino', 'Parque São Quirino'] },
  { nome: 'Parque Imperador', regiao: 'Leste', apelidos: [] },
  // ---- Norte
  { nome: 'Mansões Santo Antônio', regiao: 'Norte', apelidos: ['Mansoes Santo Antonio', 'Mansões Sto Antônio', 'Mansões Sto Antonio'] },
  { nome: 'Chácara Primavera', regiao: 'Norte', apelidos: ['Chacara Primavera'] },
  { nome: 'Santa Cândida', regiao: 'Norte', apelidos: ['Parque Rural Fazenda Santa Cândida', 'Fazenda Santa Cândida', 'Parque Santa Cândida'] },
  { nome: 'Alphaville Dom Pedro', regiao: 'Norte', apelidos: ['Alphaville Dom Pedro 2', 'Alphaville Dom Pedro 3'] },
  { nome: 'Alphaville Campinas', regiao: 'Norte', apelidos: ['Alphaville', 'Residencial Alphaville'] },
  // ---- Barão Geraldo
  { nome: 'Barão Geraldo', regiao: 'Barão Geraldo', apelidos: ['Distrito de Barão Geraldo', 'Bosque de Barão Geraldo'] },
  { nome: 'Cidade Universitária', regiao: 'Barão Geraldo', apelidos: ['Cidade Universitaria'] },
  { nome: 'Jardim Santa Genebra', regiao: 'Barão Geraldo', apelidos: ['Santa Genebra', 'Jardim Santa Genebra II'] },
  { nome: 'Parque das Universidades', regiao: 'Barão Geraldo', apelidos: [] },
  { nome: 'Vila Santa Isabel', regiao: 'Barão Geraldo', apelidos: [] },
  // ---- Sousas e Joaquim Egídio
  { nome: 'Sousas', regiao: 'Sousas e Joaquim Egídio', apelidos: ['Souzas', 'Distrito de Sousas'] },
  { nome: 'Joaquim Egídio', regiao: 'Sousas e Joaquim Egídio', apelidos: ['Joaquim Egidio'] },
  // ---- Sul
  { nome: 'Ponte Preta', regiao: 'Sul', apelidos: [] },
  { nome: 'São Bernardo', regiao: 'Sul', apelidos: ['Vila São Bernardo'] },
  { nome: 'Vila Industrial', regiao: 'Sul', apelidos: [] },
  { nome: 'Jardim Nova Europa', regiao: 'Sul', apelidos: ['Nova Europa'] },
  { nome: 'Parque Prado', regiao: 'Sul', apelidos: [] },
  { nome: 'Vila Marieta', regiao: 'Sul', apelidos: [] },
  { nome: 'Jardim do Lago', regiao: 'Sul', apelidos: ['Jardim do Lago Continuação'] },
  { nome: 'Swiss Park', regiao: 'Sul', apelidos: ['Residencial Swiss Park'] },
  { nome: 'Vila João Jorge', regiao: 'Sul', apelidos: [] },
  { nome: 'Jardim Dom Vieira', regiao: 'Sul', apelidos: [] },
  { nome: 'Parque Jambeiro', regiao: 'Sul', apelidos: [] },
  // ---- Oeste e Sudoeste
  { nome: 'Jardim Campos Elíseos', regiao: 'Oeste e Sudoeste', apelidos: ['Campos Elíseos', 'Jardim Novo Campos Elíseos'] },
  { nome: 'Vila Proost de Souza', regiao: 'Oeste e Sudoeste', apelidos: [] },
  { nome: 'Jardim Paulicéia', regiao: 'Oeste e Sudoeste', apelidos: ['Pauliceia'] },
  { nome: 'Parque Industrial', regiao: 'Oeste e Sudoeste', apelidos: [] },
  { nome: 'Ouro Verde', regiao: 'Oeste e Sudoeste', apelidos: ['Vila Ouro Verde'] },
];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugDe = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * A chave de comparação de um nome de bairro: sem acento, maiúsculas, com as
 * abreviações dos cadastros por extenso e sem o "II", "Continuação" etc.
 * "JD. CHAPADAO" = "Jardim Chapadão"; "Mansões Sto Antônio" = "Mansões Santo Antônio".
 */
function chaveBairro(s) {
  let k = semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const troca = [[/\bJD\b|\bJDIM\b/g, 'JARDIM'], [/\bPQ\b|\bPQUE\b/g, 'PARQUE'], [/\bVL\b/g, 'VILA'], [/\bSTO\b/g, 'SANTO'], [/\bSTA\b/g, 'SANTA'],
    [/\bCH\b|\bCHAC\b/g, 'CHACARA'], [/\bRES\b|\bRESID\b/g, 'RESIDENCIAL'], [/\bCOND\b/g, 'CONDOMINIO'], [/\bN S\b|\bNSA\b|\bNOSSA SRA\b/g, 'NOSSA SENHORA'], [/\bSOUZAS\b/g, 'SOUSAS']];
  for (const [re, por] of troca) k = k.replace(re, por);
  k = k.replace(/^(LOTEAMENTO|CONDOMINIO|BAIRRO) /, '').replace(/ CONTINUACAO$/, '').replace(/ (I|II|III|IV|V|VI)$/, '').replace(/ \d$/, '');
  return k.replace(/\s+/g, ' ').trim();
}

module.exports = { CATALOGO, chaveBairro, slugDe, semAcento };
