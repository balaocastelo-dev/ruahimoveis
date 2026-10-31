// Portal do cliente (a imobiliária) · o texto das versões "Revista" e "Signature" da vitrine.
//
// Revista (/imoveis/revista): ensaios no estilo do blog, com os imóveis
// do portal entre os textos. Os ensaios falam de modos de morar, nunca de um
// imóvel específico: os imóveis entram por filtro (tipo) e aparecem com o
// título e o resumo da própria página aprovada. Assim o texto não fica
// desatualizado quando a carteira muda.
//
// Signature (/imoveis/signature): a seleção de imóveis acima de R$ 10 milhões.
// Cada residência tem uma curadoria escrita aqui (título, frase, detalhes e as
// fotos escolhidas a dedo, com legenda). Os números (área, suítes, vagas e o
// valor) vêm do banco, ao vivo. Imóvel acima do limite sem curadoria entra
// mesmo assim, com as primeiras fotos e a ficha.
// Regras: nunca rua, número, unidade ou CEP; nada de foto aérea com contorno
// (mostra onde fica); perspectiva de obra sempre marcada como ilustrativa.
// O nome da imobiliária entra pela configuração (cfg.CLIENTE_NOME), nunca escrito no texto.

const cfg = require('../config');
const CLIENTE = cfg.CLIENTE_NOME;

const CASAS = ['Casa', 'Casa em condomínio', 'Sobrado', 'Chácara', 'Sítio'];
const APARTAMENTOS = ['Apartamento', 'Cobertura', 'Flat'];
const COMPACTOS = ['Studio', 'Kitnet'];
const TERRENOS = ['Terreno'];

const CAPITULOS = [
  {
    id: 'a-casa-que-respira',
    chapeu: 'Ensaio de abertura',
    titulo: 'A casa que respira',
    linhaFina: 'Talvez a melhor definição do que se procura numa casa seja esta: um lugar onde o ar circula, a luz entra sem pedir licença e o tempo desacelera.',
    paragrafos: [
      'Há casas que se entendem pela planta e há casas que se entendem pelo corpo. As primeiras impressionam no papel; as segundas, na primeira manhã. O que separa uma da outra raramente está no número de metros quadrados. Está no modo como a janela enquadra a árvore, na sombra que o beiral desenha na varanda às quatro da tarde, no silêncio que sobra quando a porta se fecha.',
      'No interior paulista, de verão longo e inverno seco, a casa que respira é quase uma questão de bom senso: ventilação cruzada, pé-direito generoso, varandas profundas, um jardim que refresca o chão em volta. Não é tendência de revista. É o jeito antigo, e ainda o mais inteligente, de morar bem por aqui.',
      `Nesta edição, a ${CLIENTE} reuniu imóveis da sua carteira em torno dessa ideia simples. Não são listas de atributos. São convites para imaginar como seria a vida dentro de cada um.`,
    ],
    citacao: 'O luxo verdadeiro é o espaço que sobra entre as coisas.',
    vitrine: 'Casas desta edição',
    tipos: CASAS,
  },
  {
    id: 'altura-luz-e-horizonte',
    chapeu: 'Vida vertical',
    titulo: 'Altura, luz e o horizonte como paisagem',
    linhaFina: 'Morar no alto é trocar o quintal pelo céu. Em troca, a cidade vira paisagem e o fim de tarde passa a fazer parte da decoração.',
    paragrafos: [
      'O apartamento bem resolvido não tenta imitar uma casa. Ele assume o que tem de melhor: a vista, a praticidade, a tranquilidade de quem pode viajar sem pensar duas vezes. A varanda deixa de ser corredor externo e vira sala; a cozinha se abre para o living; os quartos ficam do lado do silêncio.',
      `Na hora de escolher, vale olhar além do acabamento. A orientação solar define a luz de cada cômodo ao longo do dia. O andar muda a relação com o barulho da rua. A planta diz como a família vai se encontrar, ou se recolher, dentro de casa. São perguntas que o corretor da ${CLIENTE} responde com calma, na visita.`,
    ],
    citacao: 'Uma boa janela vale mais do que um metro a mais de sala.',
    vitrine: 'Apartamentos desta edição',
    tipos: APARTAMENTOS,
  },
  {
    id: 'o-essencial-bem-desenhado',
    chapeu: 'Pequenos e inteiros',
    titulo: 'O essencial, bem desenhado',
    linhaFina: 'Studios e plantas compactas não são uma versão menor da casa. São outra ideia de morar: leve, central, sem excesso.',
    paragrafos: [
      'Quem escolhe um studio costuma saber o que quer: estar perto do trabalho, da universidade, dos restaurantes, e gastar o tempo livre fora de casa, e não cuidando dela. Para isso, cada centímetro precisa trabalhar. Marcenaria sob medida, cozinha linear, uma janela que faça o ambiente parecer maior do que é.',
      'Para quem pensa em investir, a lógica é parecida: o que conta é a região, o prédio e as regras do condomínio. Vale conferir tudo isso com calma antes de decidir, e é para isso que a visita existe.',
    ],
    citacao: 'Menos metros, mais vida em volta.',
    vitrine: 'Compactos desta edição',
    tipos: COMPACTOS,
  },
  {
    id: 'o-terreno-antes-da-casa',
    chapeu: 'Página em branco',
    titulo: 'O terreno, antes da casa',
    linhaFina: 'Todo projeto começa no chão. Comprar um terreno é comprar a chance de desenhar a vida do jeito que ela é, e não do jeito que alguém imaginou.',
    paragrafos: [
      'Escolher um lote é um exercício de imaginação e de método. Imaginação para ver a casa onde hoje só há grama; método para conferir o que importa antes: o desenho do terreno, a orientação, o que o zoneamento permite construir, as regras do condomínio, a infraestrutura que já chegou até a calçada.',
      'Um terreno com a frente voltada para o norte recebe sol na fachada principal o ano inteiro, um detalhe que muda o projeto todo. Um declive bem aproveitado pode render um pavimento a mais com vista. Arquitetos costumam dizer que o melhor projeto é o que conversa com o terreno, e não o que briga com ele.',
    ],
    citacao: 'A casa certa começa no lote certo.',
    vitrine: 'Terrenos desta edição',
    tipos: TERRENOS,
  },
];

const CARTA = {
  titulo: 'Carta da edição',
  paragrafos: [
    `Esta é a vitrine da ${CLIENTE} em forma de revista: menos filtro, mais leitura. Os imóveis aparecem entre os textos como apareceriam numa conversa sobre casas, cada um com a sua página completa, fotos por ambiente e a ficha conferida.`,
    `Se preferir procurar por bairro, valor ou número de quartos, a vitrine completa continua a um toque daqui. E se quiser conhecer algum imóvel pessoalmente, é só pedir pela página dele: um corretor da ${CLIENTE} confirma a visita com você.`,
  ],
};

// ------------------------------------------------------------------ Signature
const SIGNATURE = {
  limite: 10000000,
  /** A foto da capa da Signature (a varanda da casa de Ricardo Julião, CA0004), em alta definição. */
  capa: 174,
  titulo: 'Residências que não se anunciam',
  linhaFina: 'Uma seleção reservada de propriedades acima de R$ 10 milhões, apresentadas com a discrição que elas pedem. Valores e visitas, só para membros do Clube Signature.',
  manifesto: [
    'Signature não é um filtro de preço. É um modo de apresentar: menos fotos, mais intenção. Cada residência aparece pelos detalhes que a tornam rara, como a assinatura do arquiteto, a pedra escolhida para o piso ou o modo como a casa se abre para o jardim.',
    'O resto se conhece pessoalmente, com hora marcada e sem pressa.',
  ],
  clube: {
    titulo: 'Clube Signature',
    texto: 'Os valores das residências da seleção ficam reservados aos membros. A adesão é sem custo e o acesso é liberado neste aparelho assim que você envia o pedido.',
    beneficios: [
      'Os valores de todas as residências da seleção',
      `Visitas privadas, com hora marcada e atendimento pessoal da ${CLIENTE}`,
      'Aviso quando uma nova residência entrar na seleção',
      `Sigilo: seus dados ficam só com a ${CLIENTE}`,
    ],
  },
  /** A curadoria de cada residência. `fotos`: id da foto + legenda, na ordem em que aparecem. */
  curadoria: {
    CA0036: {
      titulo: 'Villa italiana na Quinta da Baroneza',
      local: 'Quinta da Baroneza · Bragança Paulista',
      frase: 'Arquitetura de Maurizio Manfredi, paisagismo de Gilberto Elkis e travertino natural no piso da casa inteira.',
      detalhes: ['Arquitetura assinada por Maurizio Manfredi', 'Paisagismo de Gilberto Elkis', 'Travertino natural em todos os pisos', 'Biblioteca e sala de lareira', 'Adega no espírito das caves italianas', 'Piscina aquecida e academia privativa'],
      fotos: [
        [84, 'A chegada, entre o gramado e o jardim'],
        [89, 'O living de pé-direito duplo, com a biblioteca ao fundo'],
        [104, 'A piscina vista de dentro da casa'],
        [91, 'Suíte aberta para o verde'],
        [108, 'Pergolado sobre o estar externo'],
        [112, 'A adega'],
      ],
    },
    CA0046: {
      titulo: 'Casa de campo contemporânea na Quinta da Baroneza',
      local: 'Quinta da Baroneza · Bragança Paulista',
      frase: 'Linhas horizontais, madeira e vidro diante de um horizonte aberto, com piscina de borda infinita.',
      detalhes: ['Seis suítes, duas delas master', 'Piscina com prainha, spa e borda infinita', 'Spa com sauna e academia', 'Quadra privativa de beach tennis', 'Home cinema e adega', 'Duas lareiras'],
      fotos: [
        [144, 'A casa e a piscina sob o céu do interior'],
        [145, 'Volumes escuros e madeira na fachada'],
        [148, 'O terraço sobre a paisagem'],
        [156, 'Varanda coberta em madeira'],
        [173, 'O lago do condomínio ao entardecer'],
      ],
    },
    CA0004: {
      titulo: 'Casa assinada por Ricardo Julião, junto ao lago',
      local: 'Quinta da Baroneza · Bragança Paulista',
      frase: 'Rua sem saída, árvores adultas e vista parcial para o campo de golfe, a poucos passos do lago.',
      detalhes: ['Projeto do arquiteto Ricardo Julião', 'Piscina de borda infinita e jacuzzi em granito Itaúnas', 'Quartos com piso de cumaru maciço', 'Pomar formado e ipês roxos e amarelos', 'Elevador privativo da garagem aos quartos', 'Poço artesiano'],
      fotos: [
        [174, 'Varanda aberta para a piscina'],
        [176, 'Portas de correr para o gramado'],
        [182, 'Do alto, a piscina e a copa das árvores'],
        [186, 'A galeria das suítes, voltada para o verde'],
        [192, 'O jardim e o pomar'],
        [194, 'Suíte com piso de cumaru'],
      ],
    },
    CA0027: {
      titulo: 'Residência no Alphaville Campinas',
      local: 'Alphaville · Campinas',
      frase: 'Uma raia de piscina ao longo da casa, panos de vidro do chão ao teto e uma casa inteira pensada para receber sem barreiras.',
      detalhes: ['Casa inteiramente acessível, com elevador', 'Dois escritórios, um deles independente', 'Piscina com jacuzzi e jardim amplo', 'Marcenaria planejada em toda a casa', 'Garagem coberta e vagas extras no driveway'],
      fotos: [
        [224, 'A raia da piscina ao longo do jardim'],
        [243, 'O living, todo em vidro'],
        [220, 'Piscina e varanda'],
        [232, 'O terraço do andar social'],
        [249, 'Cozinha com luz zenital'],
      ],
    },
    CA0003: {
      titulo: 'Residência em obra nas Chácaras do Alto da Nova Campinas',
      local: 'Chácaras do Alto da Nova Campinas · Campinas',
      frase: 'Um projeto ainda em construção, com espaço para escolher acabamentos e um lazer de mais de quatro mil metros quadrados.',
      detalhes: ['Suíte master privativa no pavimento superior, com closets independentes', 'Piscina com prainha e spa', 'Quadra de tênis e quadra de areia', 'Adega, home theater e academia', 'Personalização durante a obra'],
      fotos: [
        [211, 'Perspectiva do projeto: a piscina e a casa (imagem ilustrativa)'],
        [212, 'Perspectiva do projeto: o lazer (imagem ilustrativa)'],
      ],
    },
    // Áreas e ativos: aparecem só em texto, sem foto (as fotos do anúncio mostram onde ficam).
    AR0008: { titulo: 'Área no Taquaral', local: 'Parque Taquaral · Campinas', frase: 'Zona mista, perto de eixos importantes da cidade. Usos e parâmetros a confirmar na prefeitura antes do projeto.' },
    AR0004: { titulo: 'Área em Barão Geraldo', local: 'Barão Geraldo · Campinas', frase: 'Grande área com zoneamento predominantemente residencial, para estudo de loteamento, condomínio ou vila.' },
    TE0004: { titulo: 'Área com projeto aprovado no Taquaral', local: 'Parque Taquaral · Campinas', frase: 'Projeto aprovado para 29 casas, para quem quer encurtar etapas de um condomínio horizontal.' },
    BA0002: { titulo: 'Complexo empresarial no Santa Genebra', local: 'Jardim Santa Genebra · Campinas', frase: 'Três salões, cerca de vinte salas e área ampla de manobra e estacionamento, perto de grandes indústrias.' },
  },
};

module.exports = { CAPITULOS, CARTA, SIGNATURE, CASAS, APARTAMENTOS, COMPACTOS, TERRENOS };
