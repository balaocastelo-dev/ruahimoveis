// Bairros · páginas de SEO, uma por bairro de Campinas.
//
// Mesmo esquema do blog Sopro e do portal de imóveis:
//   - a página é um JSON de blocos tipados (nunca HTML), num ramo do GitHub
//     (`claude/bairros-conteudo` do repositório público ruahimoveis);
//   - quem escreve é uma tarefa agendada do Claude, que pesquisa o bairro,
//     escolhe fotos reais e escreve um guia completo;
//   - uma régua em código confere no comando de publicar E de novo no site;
//   - os NÚMEROS ao vivo (imóveis da RUAH, prédios, o que tem perto) não vêm do
//     texto: o site monta essas seções a partir do banco.
//
// As fotos são reais e de duas origens:
//   - fotos de imóveis da RUAH à venda no bairro (fachada, prédio, vista);
//   - fotos de lugares do bairro no Wikimedia Commons, só com licença livre
//     (domínio público, CC0, CC BY, CC BY-SA), com autor e licença na página.
//     A licença é conferida no próprio Commons, não no que a página diz.

/** As chamadas: o texto é escrito AQUI; a página só escolhe o tema. */
const CHAMADAS = {
  imoveis: {
    titulo: 'Quer morar aqui?',
    texto: 'Veja os imóveis que a RUAH tem à venda neste bairro, com fotos e ficha completa.',
    rotulo: 'Ver imóveis no bairro',
  },
  contato: {
    titulo: 'Procurando imóvel nesta região?',
    texto: 'Conte o que você procura e um corretor da RUAH responde com opções, inclusive as que ainda não estão no portal.',
    rotulo: 'Falar com a RUAH',
  },
  vender: {
    titulo: 'Tem um imóvel no bairro?',
    texto: 'A RUAH avalia e vende imóveis nesta região. Deixe seu contato e um corretor explica como funciona.',
    rotulo: 'Quero vender',
  },
};
const TEMAS = new Set(Object.keys(CHAMADAS));

/** Licenças aceitas para as fotos do Commons (o nome curto que o Commons informa). */
const LICENCAS_OK = /^(?:CC0(?:\s1\.0)?|Public domain|PD(?:[- ].*)?|CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)(?:\s[a-z]{2,3})?)$/i;
const licencaAceita = (nome) => LICENCAS_OK.test(String(nome || '').trim()) && !/\bNC\b|\bND\b/i.test(String(nome || ''));

const RAMO_DE_CONTEUDO = 'claude/bairros-conteudo';
const DONO_REPO = 'balaocastelo-dev/ruahimoveis';
const ENDERECO_DO_RAMO = `https://raw.githubusercontent.com/${DONO_REPO}/refs/heads/${RAMO_DE_CONTEUDO}`;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Arquivo do Commons: "File:Nome da foto.jpg". */
const ARQUIVO_COMMONS = /^File:[^#<>[\]|{}\n]{3,240}\.(?:jpe?g|png|webp|tiff?)$/i;
/** Id de foto dentro da página: f1, f2… */
const ID_FOTO = /^f\d{1,3}$/;

module.exports = { CHAMADAS, TEMAS, licencaAceita, RAMO_DE_CONTEUDO, DONO_REPO, ENDERECO_DO_RAMO, SLUG, ARQUIVO_COMMONS, ID_FOTO };
