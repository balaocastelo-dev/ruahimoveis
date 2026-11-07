// Papel de parede do portal (foto de fundo do topo de /imoveis): um lugar-símbolo de Campinas para cada imobiliária.
// Fotos com licença livre do Wikimedia Commons (licença e autor conferidos no próprio Commons), guardadas em
// public/portal-assets/fundos/; o crédito aparece embaixo da foto, como pede a licença. "castelo" é foto da Torre do Castelo.
// Cada imobiliária escolhe pela variável PORTAL_FUNDO; sem ela, ganha uma foto fixa sorteada pelo nome
// (sempre a mesma para a mesma imobiliária).

const FUNDOS = {
  castelo: { lugar: 'Torre do Castelo, Campinas', src: '/portal-assets/hero-castelo.jpg?v=3', srcset: '/portal-assets/hero-castelo-1280.jpg?v=2 1280w, /portal-assets/hero-castelo.jpg?v=3 1920w, /portal-assets/hero-castelo-3840.webp?v=1 3840w', largura: 3840, altura: 2160, posicao: '62% 30%', propria: true },
  taquaral: { lugar: 'Lagoa do Taquaral, Campinas', arquivo: 'File:Lagoa do Taquaral - panoramio (28).jpg', autor: 'enioprado', licenca: 'CC BY-SA 3.0', largura: 3840, altura: 2526, quatroK: true, posicao: '50% 45%' },
  skyline: { lugar: 'Prédios do Centro e do Cambuí, Campinas', arquivo: 'File:Campinas skyline.jpg', autor: 'Elson Júnior', licenca: 'CC BY 2.0', largura: 3840, altura: 2812, quatroK: true, posicao: '50% 60%' },
  jequitibas: { lugar: 'Bosque dos Jequitibás, Campinas', arquivo: 'File:Bosque dos Jequitibás.jpg', autor: 'Prefeitura de Campinas', licenca: 'domínio público', largura: 3840, altura: 2318, quatroK: true, posicao: '50% 50%' },
  noite: { lugar: 'Campinas à noite', arquivo: 'File:Campinas at night.jpg', autor: 'João Carlos Medau', licenca: 'CC BY 2.0', largura: 3840, altura: 2560, quatroK: true, posicao: '50% 40%' },
  catedral: { lugar: 'Catedral Metropolitana, Campinas', arquivo: 'File:Catedral Metropolitana de Campinas - 29.05.2021 01.jpg', autor: 'Parzeus', licenca: 'CC BY-SA 4.0', largura: 3840, altura: 2872, quatroK: true, posicao: '50% 25%' },
  estacao: { lugar: 'Estação Cultura, Campinas', arquivo: 'File:Estação Cultura Campinas.jpg', autor: 'Edison Marcon', licenca: 'CC BY-SA 4.0', largura: 3840, altura: 2560, quatroK: true, posicao: '50% 50%' },
  cambui: { lugar: 'Cambuí visto do alto, Campinas', arquivo: 'File:Bosque dos Jequitibas Campinas.jpg', autor: 'Leandro R. M. de Marco', licenca: 'CC BY-SA 3.0', largura: 3840, altura: 2560, quatroK: true, posicao: '50% 55%' },
  carlosgomes: { lugar: 'Praça Carlos Gomes, Campinas', arquivo: 'File:Praça Carlos Gomes - Campinas - 20250913112922.JPG', autor: 'EdgardMC79', licenca: 'CC BY-SA 4.0', largura: 3840, altura: 2564, quatroK: true, original4k: true, posicao: '50% 45%' },
  convivencia: { lugar: 'Centro de Convivência, Campinas', arquivo: 'File:Centro de Convivência - Campinas - 20250913115244.JPG', autor: 'EdgardMC79', licenca: 'CC BY-SA 4.0', largura: 3840, altura: 2564, quatroK: true, original4k: true, posicao: '50% 50%' },
  bentoquirino: { lugar: 'Creche Bento Quirino, Campinas', arquivo: 'File:Creche Bento Quirino - Campinas - 20220821095730.jpg', autor: 'Thiagoca', licenca: 'CC BY-SA 4.0', largura: 3840, altura: 1918, quatroK: true, original4k: true, posicao: '50% 50%' },
};
// ordem em que as novas imobiliárias recebem uma foto (o Castelo entra só se PORTAL_FUNDO=castelo)
const SEQUENCIA = ['taquaral', 'skyline', 'jequitibas', 'noite', 'catedral', 'estacao', 'cambui', 'carlosgomes', 'convivencia', 'bentoquirino'];

function sorteiaPorNome(nome) {
  let h = 0; for (const c of String(nome || '')) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return SEQUENCIA[h % SEQUENCIA.length];
}

/** O papel de parede desta imobiliária: { id, lugar, src, srcset, largura, altura, posicao, credito, link }. */
function fundoDe(id, cliente) {
  const chave = FUNDOS[id] ? id : sorteiaPorNome(cliente);
  const f = FUNDOS[chave];
  // versões 4K ampliadas com IA (SeedVR2): 1280, 1920 e 3840 px
  const src = f.src || (f.quatroK ? `/portal-assets/fundos/${chave}-1920.jpg?v=1` : `/portal-assets/fundos/${chave}.jpg?v=1`);
  const srcset4k = f.quatroK ? `/portal-assets/fundos/${chave}-1280.jpg?v=1 1280w, /portal-assets/fundos/${chave}-1920.jpg?v=1 1920w, /portal-assets/fundos/${chave}-3840.webp?v=1 3840w` : '';
  return {
    id: chave, lugar: f.lugar, src, srcset: f.srcset || srcset4k, largura: f.largura, altura: f.altura, posicao: f.posicao,
    credito: f.propria ? '' : `Foto: ${f.autor} · ${f.licenca} · Wikimedia Commons${f.quatroK && !f.original4k ? ' · ampliada com IA' : ''}`,
    link: f.arquivo ? `https://commons.wikimedia.org/wiki/${encodeURI(f.arquivo.replace(/ /g, '_'))}` : '',
  };
}

/** Próxima foto para uma imobiliária nova: a primeira da sequência que nenhuma outra usa (ou a menos usada). */
function proximoFundo(emUso = []) {
  const conta = new Map(SEQUENCIA.map((k) => [k, 0]));
  for (const k of emUso) if (conta.has(k)) conta.set(k, conta.get(k) + 1);
  return SEQUENCIA.reduce((melhor, k) => (conta.get(k) < conta.get(melhor) ? k : melhor), SEQUENCIA[0]);
}

// De quantos em quantos minutos o papel de parede troca. 0 ou PORTAL_FUNDO definido = foto fixa.
const MINUTOS = Number.isFinite(Number(process.env.PORTAL_FUNDO_MINUTOS)) ? Number(process.env.PORTAL_FUNDO_MINUTOS) : 30;

/**
 * O papel de parede de agora. Roda pela SEQUENCIA conforme o relógio, começando
 * numa posição sorteada pelo nome da imobiliária, para que duas imobiliárias não
 * mostrem a mesma foto no mesmo minuto. Com PORTAL_FUNDO definido a foto continua
 * fixa: quem escolheu uma escolheu de propósito.
 */
function fundoAgora(id, cliente, agora = Date.now()) {
  if (id && FUNDOS[id]) return fundoDe(id, cliente);
  if (!(MINUTOS > 0)) return fundoDe(null, cliente);
  let h = 0; for (const c of String(cliente || '')) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const passo = Math.floor(agora / (MINUTOS * 60000));
  return fundoDe(SEQUENCIA[(h + passo) % SEQUENCIA.length], cliente);
}

module.exports = { FUNDOS, SEQUENCIA, MINUTOS, fundoDe, fundoAgora, proximoFundo };
