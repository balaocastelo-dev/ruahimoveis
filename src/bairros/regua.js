// Bairros · a régua da página do bairro, em forma de código.
//
// Ninguém lê a página antes de ela ir ao ar. A régua é aplicada no comando de
// publicar E de novo pelo site: se não passa, a página não aparece.
// `erros` reprovam; `avisos` são recomendações.
//
//   avaliarPagina(pagina, bairro, { modo })
//     bairro = { slug, nome, apelidos: [], fotosImoveis: [ids das fotos de imóveis da RUAH à venda no bairro] }
//     modo   = 'publicar' (confere as fotos de imóvel) | 'site' (foto de imóvel vendido não derruba a página)

const { contarPalavras, textoPuro, linksDoTexto, semAcento } = require('../blog/texto');

const PALAVRAS = { minimo: 900, teto: 2600 };

function textosDoBloco(b) {
  switch (b.tipo) {
    case 'paragrafo': return [textoPuro(b.texto)];
    case 'titulo': return [b.texto];
    case 'lista': case 'resumo': return [b.titulo || '', ...b.itens.map(textoPuro)];
    case 'destaque': return [b.titulo || '', textoPuro(b.texto)];
    default: return [];
  }
}
const textosComLink = (b) => (b.tipo === 'paragrafo' || b.tipo === 'destaque' ? [b.texto] : b.tipo === 'lista' || b.tipo === 'resumo' ? b.itens : []);
const palavrasDaPagina = (p) => p.blocos.flatMap(textosDoBloco).reduce((s, t) => s + contarPalavras(t), 0)
  + p.perguntas.reduce((s, q) => s + contarPalavras(q.pergunta) + contarPalavras(q.resposta), 0);

const L = '\\p{L}*';
const PROIBIDOS = [
  { padrao: /R\$\s?\d|\b\d[\d.]*(?:,\d+)?\s*(?:mil|milh[õo]es?)?(?:\s+de)?\s+reais\b/iu, nome: 'valor em reais (preço muda; os imóveis à venda aparecem com o valor ao vivo, ao lado do texto)' },
  { padrao: new RegExp(`valoriza${L}\\s+garantid${L}|retorno\\s+garantid${L}|lucro\\s+garantid${L}|sem\\s+risco|investimento\\s+(?:100%\\s+)?seguro|garantimos|n[ãa]o\\s+tem\\s+como\\s+perder|vai\\s+valorizar|sempre\\s+valoriza`, 'iu'), nome: 'promessa de ganho ou de segurança' },
  { padrao: /imperd[íi]vel|oportunidade\s+[úu]nica|n[ãa]o\s+perca|\bcorra\b|[úu]ltimas\s+unidades/iu, nome: 'apelo de urgência' },
  { padrao: /\b\d{5}-?\d{3}\b/, nome: 'CEP' },
  { padrao: /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b|@[a-z0-9.-]+\.[a-z]{2,}|https?:|www\./iu, nome: 'telefone, e-mail ou endereço de site no texto (as fontes vão na lista "fontes"; o contato é o formulário da página)' },
  { padrao: /(?<![\p{L}])(visitamos|estivemos\s+(?:no|na|em)|conhecemos\s+pessoalmente|andamos\s+pelo|em\s+nossa\s+visita|caminhamos)(?![\p{L}])/iu, nome: 'experiência própria que a rotina não teve (ela pesquisou, não esteve lá)' },
];

const contem = (texto, nome) => semAcento(texto).includes(semAcento(nome));

function avaliarPagina(p, bairro, { modo = 'site' } = {}) {
  const erros = [];
  const avisos = [];
  if (!bairro) return { aprovado: false, erros: ['O bairro não existe no sistema (ou está oculto).'], avisos, medidas: {} };
  const nomes = [bairro.nome, ...(bairro.apelidos || [])];
  const blocos = p.blocos;

  const paragrafos = blocos.filter((b) => b.tipo === 'paragrafo');
  const tamanhos = paragrafos.map((b) => contarPalavras(textoPuro(b.texto)));
  const secoes = blocos.filter((b) => b.tipo === 'titulo' && b.nivel === 2);
  const chamadas = blocos.filter((b) => b.tipo === 'chamada');
  const resumos = blocos.filter((b) => b.tipo === 'resumo');
  const blocosDeFoto = blocos.filter((b) => b.tipo === 'fotos');
  const palavras = palavrasDaPagina(p);
  const commons = p.fotos.filter((f) => f.commons);
  const deImovel = p.fotos.filter((f) => f.imovel_foto);
  const medidas = { palavras, secoes: secoes.length, fotos: p.fotos.length, commons: commons.length, deImovel: deImovel.length, fotosNoTexto: blocosDeFoto.reduce((s, b) => s + b.fotos.length, 0), perguntas: p.perguntas.length, fontes: p.fontes.length, chamadas: chamadas.length };

  // ---- Identidade e busca
  if (p.slug !== bairro.slug) erros.push(`A página é do bairro "${p.slug}", mas o slug do bairro é "${bairro.slug}".`);
  if (p.titulo.length < 30 || p.titulo.length > 80) erros.push(`Título com ${p.titulo.length} caracteres; o intervalo é de 30 a 80.`);
  if (!nomes.some((n) => contem(p.titulo, n))) erros.push(`O título precisa ter o nome do bairro ("${bairro.nome}"): é o que se busca.`);
  if (!contem(p.titulo, 'Campinas') && !(p.seo && contem(p.seo.titulo, 'Campinas'))) avisos.push('Nem o título nem o seo.titulo dizem "Campinas": quem busca o bairro quase sempre escreve a cidade.');
  const noGoogle = (p.seo && p.seo.titulo) || p.titulo;
  if (noGoogle.length > 62) avisos.push(`Título com ${noGoogle.length} caracteres será cortado no Google; defina seo.titulo com até 60.`);
  if (p.resumo.length < 110 || p.resumo.length > 165) erros.push(`Resumo com ${p.resumo.length} caracteres; o intervalo é de 110 a 165.`);
  if (!nomes.some((n) => contem(p.resumo, n))) avisos.push('O resumo (a descrição no Google) não diz o nome do bairro.');

  // ---- Tamanho e estrutura
  if (palavras < PALAVRAS.minimo) erros.push(`A página tem ${palavras} palavras; o mínimo é ${PALAVRAS.minimo} (é um guia completo do bairro).`);
  if (palavras > PALAVRAS.teto) erros.push(`A página tem ${palavras} palavras; o teto é ${PALAVRAS.teto}.`);
  if (secoes.length < 4) erros.push(`A página tem ${secoes.length} seções (títulos de nível 2); o mínimo é 4.`);
  if (secoes.length > 12) erros.push(`${secoes.length} seções é demais; o teto é 12.`);
  const primeiroTitulo = blocos.findIndex((b) => b.tipo === 'titulo');
  const abertura = blocos.slice(0, primeiroTitulo === -1 ? blocos.length : primeiroTitulo).filter((b) => b.tipo === 'paragrafo');
  if (!abertura.length) erros.push('A página abre com um parágrafo que apresenta o bairro, antes do primeiro título.');
  else if (!nomes.some((n) => contem(abertura[0].texto, n))) erros.push('O primeiro parágrafo precisa dizer o nome do bairro (é o trecho que buscadores e IAs mais citam).');
  else if (!contem(abertura.map((b) => b.texto).join(' '), 'Campinas')) avisos.push('A abertura não diz "Campinas".');
  if (tamanhos.length && Math.max(...tamanhos) > 120) erros.push(`Há um parágrafo com ${Math.max(...tamanhos)} palavras; quebre em dois (o teto é 120).`);
  if (resumos.length !== 1) erros.push('A página leva um (e só um) bloco "resumo" com o bairro em poucas linhas.');
  else if (resumos[0].itens.length < 4 || resumos[0].itens.length > 8) erros.push(`O resumo leva de 4 a 8 itens (tem ${resumos[0].itens.length}).`);
  const vistos = new Set();
  for (const b of blocos) if (b.tipo === 'titulo') { const k = semAcento(b.texto.trim()); if (vistos.has(k)) erros.push(`Título repetido: ${b.texto}.`); vistos.add(k); }
  if (p.perguntas.length < 4 || p.perguntas.length > 8) erros.push(`A página leva de 4 a 8 perguntas frequentes (tem ${p.perguntas.length}).`);
  if (p.fontes.length < 2) erros.push(`A página leva ao menos 2 fontes (tem ${p.fontes.length}): de onde vieram os fatos sobre o bairro.`);

  // ---- Chamadas
  if (chamadas.length === 0) erros.push('Falta ao menos uma chamada (bloco "chamada" com tema).');
  if (chamadas.length > 3) erros.push(`${chamadas.length} chamadas é panfleto; o teto é 3.`);
  const primeira = blocos.findIndex((b) => b.tipo === 'chamada');
  if (primeira !== -1 && primeira < blocos.length * 0.25) erros.push('A primeira chamada aparece cedo demais: o leitor conhece o bairro antes do convite.');
  for (let i = 1; i < blocos.length; i += 1) if (blocos[i].tipo === 'chamada' && blocos[i - 1].tipo === 'chamada') erros.push('Duas chamadas seguidas.');

  // ---- Links: o leitor não sai do site da RUAH
  const links = blocos.flatMap((b) => textosComLink(b).flatMap(linksDoTexto));
  if (links.length) erros.push(`A página não leva links no texto (${links.join(', ')}): fontes vão na lista "fontes", pelo nome.`);

  // ---- Fotos
  const ids = new Set(p.fotos.map((f) => f.id));
  if (p.fotos.length < 3) erros.push(`A página leva ao menos 3 fotos reais (tem ${p.fotos.length}).`);
  if (p.fotos.length > 24) erros.push(`${p.fotos.length} fotos é demais; o teto é 24.`);
  if (!ids.has(p.capa.foto)) erros.push(`A capa (${p.capa.foto}) não está na lista de fotos.`);
  const citadas = blocosDeFoto.flatMap((b) => b.fotos);
  for (const id of citadas) if (!ids.has(id)) erros.push(`O bloco de fotos cita ${id}, que não está na lista de fotos.`);
  if (blocosDeFoto.length < 2 && p.fotos.length >= 4) erros.push('Com 4 fotos ou mais, a página leva ao menos 2 blocos "fotos" no meio do texto, junto das seções que falam delas.');
  for (const f of p.fotos) {
    if (f.legenda.length < 3 || f.legenda.length > 140) erros.push(`Legenda da foto ${f.id} com ${f.legenda.length} caracteres; o intervalo é de 3 a 140.`);
    if (f.alt.length < 12) erros.push(`O texto alternativo da foto ${f.id} é curto demais: diga o que ela mostra.`);
  }
  if (!commons.length) avisos.push('Nenhuma foto de lugar do bairro (Wikimedia Commons): parques, praças, ruas e prédios conhecidos fazem a página.');
  const permitidas = new Set(bairro.fotosImoveis || []);
  if (modo === 'publicar') {
    const fora = deImovel.filter((f) => !permitidas.has(f.imovel_foto)).map((f) => f.imovel_foto);
    if (fora.length) erros.push(`Foto(s) de imóvel que não são de imóveis da RUAH à venda neste bairro: ${fora.join(', ')}. Use só os números listados no dados.json do bairro.`);
  }

  // ---- Honestidade
  const tudo = [p.titulo, p.resumo, ...blocos.flatMap(textosDoBloco), ...p.perguntas.flatMap((q) => [q.pergunta, q.resposta]), ...p.fotos.flatMap((f) => [f.legenda, f.alt]), p.redes ? p.redes.legenda : ''].join('\n');
  for (const { padrao, nome } of PROIBIDOS) {
    const a = padrao.exec(tudo);
    if (a) erros.push(`O texto traz ${nome}: "${a[0]}".`);
  }
  if (/\b(o melhor|a melhor|os melhores|as melhores|perfeit[oa]s?|dos sonhos|o mais desejad[oa])\b/i.test(semAcento(tudo))) avisos.push('Superlativo de anúncio ("o melhor", "perfeito", "dos sonhos"): troque pelo fato que mostra isso.');
  if (/\b(seguranc|violenc|crime|assalto|perigos)/i.test(semAcento(tudo))) avisos.push('O texto fala de segurança ou violência: só o que uma fonte citada sustenta, sem rótulo ("bairro seguro", "bairro perigoso").');

  // ---- Redes
  if (p.redes) {
    if (p.redes.legenda.length < 80 || p.redes.legenda.length > 700) erros.push(`A legenda das redes tem ${p.redes.legenda.length} caracteres; o intervalo é de 80 a 700.`);
    if (p.redes.hashtags.length < 4 || p.redes.hashtags.length > 12 || p.redes.hashtags.some((h) => !/^[\p{L}\p{N}]{2,30}$/u.test(h))) erros.push('As redes levam de 4 a 12 hashtags, só letras e números, sem #.');
  } else avisos.push('Sem o campo "redes" (legenda para postar o guia do bairro no Instagram).');

  return { aprovado: erros.length === 0, erros: [...new Set(erros)], avisos: [...new Set(avisos)], medidas };
}

module.exports = { avaliarPagina, palavrasDaPagina, textosDoBloco };
