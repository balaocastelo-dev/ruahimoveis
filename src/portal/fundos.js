// Papel de parede do portal (foto de fundo do topo de /imoveis): um lugar-símbolo de Campinas para cada imobiliária.
// Fotos com licença livre do Wikimedia Commons (licença e autor conferidos no próprio Commons), guardadas em
// public/portal-assets/fundos/; o crédito aparece embaixo da foto, como pede a licença. "castelo" é foto própria da RUAH.
// Cada imobiliária escolhe pela variável PORTAL_FUNDO; sem ela, a RUAH fica com o Castelo e as outras ganham uma
// foto fixa sorteada pelo nome (sempre a mesma para a mesma imobiliária).

const FUNDOS = {
  castelo: { lugar: 'Torre do Castelo, Campinas', src: '/portal-assets/hero-castelo.jpg?v=2', srcset: '/portal-assets/hero-castelo-1280.jpg?v=2 1280w, /portal-assets/hero-castelo.jpg?v=2 1920w', largura: 1920, altura: 1080, posicao: '62% 30%', propria: true },
  taquaral: { lugar: 'Lagoa do Taquaral, Campinas', arquivo: 'File:Lagoa do Taquaral - panoramio (28).jpg', autor: 'enioprado', licenca: 'CC BY-SA 3.0', largura: 1280, altura: 842, posicao: '50% 45%' },
  skyline: { lugar: 'Prédios do Centro e do Cambuí, Campinas', arquivo: 'File:Campinas skyline.jpg', autor: 'Elson Júnior', licenca: 'CC BY 2.0', largura: 1280, altura: 937, posicao: '50% 60%' },
  jequitibas: { lugar: 'Bosque dos Jequitibás, Campinas', arquivo: 'File:Bosque dos Jequitibás.jpg', autor: 'Prefeitura de Campinas', licenca: 'domínio público', largura: 1280, altura: 773, posicao: '50% 50%' },
  noite: { lugar: 'Campinas à noite', arquivo: 'File:Campinas at night.jpg', autor: 'João Carlos Medau', licenca: 'CC BY 2.0', largura: 1280, altura: 853, posicao: '50% 40%' },
  catedral: { lugar: 'Catedral Metropolitana, Campinas', arquivo: 'File:Catedral Metropolitana de Campinas - 29.05.2021 01.jpg', autor: 'Parzeus', licenca: 'CC BY-SA 4.0', largura: 1280, altura: 957, posicao: '50% 25%' },
  estacao: { lugar: 'Estação Cultura, Campinas', arquivo: 'File:Estação Cultura Campinas.jpg', autor: 'Edison Marcon', licenca: 'CC BY-SA 4.0', largura: 1280, altura: 853, posicao: '50% 50%' },
  cambui: { lugar: 'Cambuí visto do alto, Campinas', arquivo: 'File:Bosque dos Jequitibas Campinas.jpg', autor: 'Leandro R. M. de Marco', licenca: 'CC BY-SA 3.0', largura: 1280, altura: 853, posicao: '50% 55%' },
};
// ordem em que as novas imobiliárias recebem uma foto (o Castelo é da RUAH)
const SEQUENCIA = ['taquaral', 'skyline', 'jequitibas', 'noite', 'catedral', 'estacao', 'cambui'];

function sorteiaPorNome(nome) {
  let h = 0; for (const c of String(nome || '')) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return SEQUENCIA[h % SEQUENCIA.length];
}

/** O papel de parede desta imobiliária: { id, lugar, src, srcset, largura, altura, posicao, credito, link }. */
function fundoDe(id, cliente) {
  const chave = FUNDOS[id] ? id : (/^ruah\b/i.test(String(cliente || '').trim()) ? 'castelo' : sorteiaPorNome(cliente));
  const f = FUNDOS[chave];
  const src = f.src || `/portal-assets/fundos/${chave}.jpg?v=1`;
  return {
    id: chave, lugar: f.lugar, src, srcset: f.srcset || '', largura: f.largura, altura: f.altura, posicao: f.posicao,
    credito: f.propria ? '' : `Foto: ${f.autor} · ${f.licenca} · Wikimedia Commons`,
    link: f.arquivo ? `https://commons.wikimedia.org/wiki/${encodeURI(f.arquivo.replace(/ /g, '_'))}` : '',
  };
}

/** Próxima foto para uma imobiliária nova: a primeira da sequência que nenhuma outra usa (ou a menos usada). */
function proximoFundo(emUso = []) {
  const conta = new Map(SEQUENCIA.map((k) => [k, 0]));
  for (const k of emUso) if (conta.has(k)) conta.set(k, conta.get(k) + 1);
  return SEQUENCIA.reduce((melhor, k) => (conta.get(k) < conta.get(melhor) ? k : melhor), SEQUENCIA[0]);
}

module.exports = { FUNDOS, SEQUENCIA, fundoDe, proximoFundo };
