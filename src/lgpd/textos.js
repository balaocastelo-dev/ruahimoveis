// Textos jurídicos (28/10/2026): Sobre nós, Termos de uso e Política de privacidade da plataforma
// (corretordofuturo.app) e Política de privacidade e Termos do portal de cada imobiliária.
// Base: LGPD (Lei 13.709/2018), Marco Civil da Internet (Lei 12.965/2014), Lei 6.530/1978 e Resolução COFECI 1.065/2007
// (corretagem e publicidade), Lei 9.610/1998 (fotos), CDC (Lei 8.078/1990), guia de legítimo interesse da ANPD (2024)
// e a política LGPD do Fisgar (que se declara operadora e põe o assinante como controlador).
// Rascunho técnico: deve ser revisado por advogado antes de ser tratado como versão final (aviso no fim de cada página).
// Regra de quem edita: o texto descreve o que o sistema FAZ. Mudou o sistema, muda o texto (e a VERSAO em ./index.js).
const { VERSAO, PLATAFORMA: P, CLIENTE: C, TIPOS } = require('./index');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBr = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const VIGENCIA = dataBr(VERSAO);

function quemEPlataforma() {
  const partes = [esc(P.razao || `${P.responsavel}, responsável pelo ${P.nome}`)];
  if (P.cnpj) partes.push(`CNPJ ${esc(P.cnpj)}`);
  partes.push(`com sede em ${esc(P.cidade)}`);
  return partes.join(', ');
}
function quemECliente() {
  const partes = [esc(C.empresa)];
  if (C.cnpj) partes.push(`CNPJ ${esc(C.cnpj)}`);
  if (C.creci) partes.push(`CRECI ${esc(C.creci)}`);
  partes.push(`com atuação em ${esc(C.cidade)}`);
  return partes.join(', ');
}

// ----------------------------------------------------------------------------------- plataforma
const DIREITOS = `<ul>
<li>confirmar se tratamos dados seus e ter acesso a eles;</li>
<li>corrigir dados incompletos, errados ou desatualizados;</li>
<li>pedir anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;</li>
<li>pedir a portabilidade a outro fornecedor;</li>
<li>saber com quem compartilhamos os seus dados;</li>
<li>revogar o consentimento, quando o tratamento depender dele;</li>
<li>se opor a um tratamento feito com base no legítimo interesse, como o contato de captação de imóveis.</li>
</ul>`;

function sobre() {
  return [
    ['quem-somos', 'Quem somos', `
<p>O ${esc(P.nome)} é um <strong>software independente</strong> para imobiliárias e corretores de imóveis. Foi criado em Campinas (SP) e é mantido por ${P.razao ? quemEPlataforma() : esc(P.responsavel)}.</p>
<p>Nós fazemos tecnologia: carteira de imóveis, CRM, agentes de inteligência artificial no WhatsApp, leitura do mercado, prédios em 3D, portal e blog com a marca de cada cliente. <strong>Não somos imobiliária</strong>, não intermediamos compra, venda ou locação, não recebemos comissão do comprador ou do vendedor e não falamos em nome de nenhum proprietário. Quem anuncia, capta e negocia é sempre a imobiliária ou o corretor cliente, com o próprio CRECI e sob a própria responsabilidade profissional.</p>`],
    ['independente', 'Sem vínculo com portais ou fornecedores', `
<p>O ${esc(P.nome)} <strong>não tem vínculo, parceria, patrocínio ou autorização</strong> de portais de anúncios (como ZAP Imóveis, Viva Real, OLX, Imovelweb, Chaves na Mão ou QuintoAndar) nem de bases de dados imobiliárias (como Fisgar ou Captei). Os nomes aparecem aqui só para dizer de onde vem cada informação; as marcas pertencem aos seus donos.</p>
<p>Quando uma imobiliária usa um desses serviços dentro do sistema, ela usa a <strong>conta dela</strong>, nas condições que ela contratou com o fornecedor.</p>`],
    ['brasil', 'Para imobiliárias de todo o Brasil', `
<p>O sistema funciona pela internet para imobiliárias e corretores de qualquer cidade do país. A base de mercado (anúncios, prédios em 3D e guias de bairro) começou por Campinas (SP) e ganha novas cidades com o tempo, conforme chegam clientes em cada região.</p>`],
    ['de-onde-vem', 'De onde vêm os dados', `
<p>Cada informação do sistema tem uma origem conhecida. Nada vem de vazamento, de compra de listas ou de invasão.</p>
<table class="legal-tabela"><thead><tr><th>Origem</th><th>O que entra</th><th>Como entra</th></tr></thead><tbody>
<tr><td>Anúncios publicados abertamente na internet</td><td>Dados do imóvel anunciado: tipo, bairro, rua, preço, área, quartos, data e fotos do anúncio</td><td>Só páginas e índices que o próprio site libera para leitura automática (regras do robots.txt). Não entramos em área com senha, não contornamos bloqueio nem CAPTCHA. Site que bloqueia robôs não é lido.</td></tr>
<tr><td>Bases de dados imobiliárias contratadas pela imobiliária cliente (ex.: Fisgar)</td><td>Anúncios com endereço e, quando a imobiliária consulta, nomes e telefones de possíveis proprietários</td><td>Pela conta e pelos créditos da própria imobiliária. Cada consulta fica só com a imobiliária que a fez. Número de CPF ou CNPJ não é guardado.</td></tr>
<tr><td>Dados públicos oficiais e abertos</td><td>CNPJ de condomínios (Receita Federal), endereços e prédios do Censo 2022 (IBGE, sem dado pessoal), mapas (OpenStreetMap, Overture Maps), fotos com licença livre (Wikimedia Commons, com autor e licença indicados)</td><td>Bases abertas, usadas nas condições de cada licença</td></tr>
<tr><td>Serviços licenciados</td><td>Mapas, 3D e foto da fachada (Google Maps Platform)</td><td>Chave paga, nos termos do Google</td></tr>
<tr><td>A própria imobiliária e os seus clientes</td><td>Imóveis da carteira, proprietários, contratos, clientes e conversas</td><td>Cadastro feito pela equipe e formulários dos portais</td></tr>
</tbody></table>`],
    ['o-que-nao-fazemos', 'O que nunca fazemos', `
<ul>
<li>Não vendemos, alugamos nem cedemos dados pessoais a ninguém.</li>
<li>Não publicamos nome, telefone ou endereço exato de proprietário em portal, blog ou rede social.</li>
<li>Foto tirada de anúncio de outra empresa fica só para consulta interna da equipe e nunca vai para portal, link, rede social ou material de divulgação. No portal só entra foto própria da imobiliária ou autorizada pelo dono.</li>
<li>Não mostramos a uma imobiliária os proprietários, clientes ou conversas de outra.</li>
<li>Não contornamos proteção de sites nem usamos senhas de terceiros.</li>
<li>Mensagem automática de captação só sai em horário comercial, com limite por dia, dizendo quem fala, de onde veio o contato e como parar. Quem responde PARAR, ou pede pelos canais abaixo, entra numa lista que vale para todas as imobiliárias do sistema.</li>
</ul>`],
    ['responsabilidades', 'Quem responde por quê', `
<p>Pela Lei Geral de Proteção de Dados (LGPD), cada imobiliária cliente é a <strong>controladora</strong> dos dados que ela trata: ela decide quem contatar, o que anunciar e com quem negociar. O ${esc(P.nome)} é <strong>operador</strong> desses dados, guardando e processando por conta dela, e é controlador apenas dos dados das contas de acesso e da base comum de mercado.</p>
<p>Os fornecedores de bases de dados respondem pelos dados que coletam e entregam. O Fisgar, por exemplo, declara na sua política de privacidade que atua como operador e que o assinante é o controlador; por isso a imobiliária que usa o Fisgar responde pelo uso que faz do resultado de cada consulta. Os detalhes estão nos <a href="/termos">Termos de uso</a> e na <a href="/privacidade">Política de privacidade</a>.</p>`],
    ['contato', 'Fale com a gente', `
<p>Dúvidas, pedidos sobre dados pessoais ou denúncias de uso indevido: <a href="mailto:${esc(P.email)}">${esc(P.email)}</a>, ou pelo <a href="/privacidade#pedido">formulário de pedido do titular</a>. Respondemos em até 15 dias.</p>`],
  ];
}

function termos() {
  return [
    ['aceite', '1. Aceite', `
<p>Estes Termos regem o uso do ${esc(P.nome)} (o "sistema"), oferecido por ${quemEPlataforma()} (a "plataforma"), por imobiliárias, corretores e suas equipes (o "cliente" e os "usuários"). Ao contratar ou entrar no sistema, o cliente e cada usuário aceitam estes Termos e a <a href="/privacidade">Política de privacidade</a>. Versão de ${VIGENCIA}.</p>`],
    ['servico', '2. O que é o serviço', `
<p>O sistema é um software acessado pela internet (SaaS) com carteira de imóveis, CRM, agenda, assinatura eletrônica de autorizações, agentes de inteligência artificial, leitura de mercado, mapas e 3D, portal e blog com a marca do cliente. A plataforma <strong>não presta serviço de corretagem</strong>, não intermedeia negócios e não garante resultado de venda, locação ou captação.</p>`],
    ['independencia', '3. Independência', `
<p>A plataforma não tem vínculo com portais de anúncios nem com bases de dados de terceiros. Quando o cliente liga ao sistema um serviço contratado por ele (por exemplo Fisgar, WhatsApp, Google), o uso desse serviço segue o contrato entre o cliente e o fornecedor, e o cliente se compromete a respeitar os termos desse fornecedor.</p>`],
    ['contas', '4. Contas e acessos', `
<p>Cada usuário tem login pessoal e intransferível. O administrador do cliente cria e desativa usuários e define os perfis (administrador, gestor, corretor). O cliente responde pelo que os seus usuários fazem no sistema e deve avisar a plataforma de qualquer acesso suspeito.</p>`],
    ['lgpd', '5. Proteção de dados: papéis', `
<ul>
<li><strong>Cliente = controlador</strong> dos dados pessoais que trata no sistema: proprietários, clientes, leads, visitas, conversas, documentos e resultados de consultas a bases contratadas por ele.</li>
<li><strong>Plataforma = operadora</strong> desses dados: trata só para prestar o serviço, conforme as instruções do cliente, e não os usa para outra finalidade.</li>
<li><strong>Plataforma = controladora</strong> dos dados das contas de acesso, da cobrança e da base comum de mercado (anúncios, prédios, bairros), que todos os clientes enxergam.</li>
</ul>
<p>O cliente garante que tem base legal para cada tratamento que faz (por exemplo, legítimo interesse para a primeira abordagem de captação, execução de contrato para clientes) e que informa os titulares, como pedem os artigos 7º, 9º e 10 da LGPD.</p>`],
    ['obrigacoes', '6. Compromissos do cliente', `
<ul>
<li>Manter inscrição regular no CRECI e cumprir a Lei 6.530/1978 e as resoluções do COFECI, inclusive o número do CRECI na publicidade (Resolução COFECI 1.065/2007).</li>
<li>Só divulgar imóvel com autorização escrita do proprietário (Lei 6.530/1978, art. 20, III). O sistema guarda a autorização assinada, mas quem decide publicar é o cliente.</li>
<li>Usar nomes e telefones de proprietários <strong>só para falar do imóvel daquela pessoa</strong>, sem repasse a terceiros, sem lista de transmissão e sem venda de dados.</li>
<li>Parar o contato na hora com quem pedir, não reabrir contato com quem está na lista "não contatar" e responder os pedidos de titulares em até 15 dias (LGPD, art. 18 e 19).</li>
<li>Não usar o sistema para spam, propaganda eleitoral, golpe, cobrança, discriminação ou qualquer finalidade alheia à atividade imobiliária, e respeitar as regras de uso do WhatsApp.</li>
<li>Publicar só fotos e textos próprios ou autorizados (Lei 9.610/1998). Fotos de anúncios de outras empresas que aparecem no sistema são para consulta interna e não podem ser publicadas nem enviadas a clientes.</li>
<li>Conferir valores, áreas e condições antes de divulgar (Código de Defesa do Consumidor).</li>
</ul>`],
    ['ia', '7. Inteligência artificial', `
<p>Os agentes e textos de IA podem errar. Por padrão, as respostas dos agentes ficam esperando aprovação. Quando o cliente liga a resposta automática de um agente, assume a revisão desse conteúdo. Textos do portal e do blog passam por regras automáticas (sem promessas, sem dados de proprietário, sem links para fora), mas a responsabilidade pelo que é publicado em nome do cliente é do cliente.</p>`],
    ['base', '8. Base comum de mercado', `
<p>A base de anúncios, prédios e bairros é informação de mercado, reunida de fontes públicas e de serviços contratados, e pode ter erros, repetições e dados desatualizados. Ela não é oferta, não substitui a vistoria e a documentação do imóvel e não pode ser revendida ou extraída em massa pelo cliente.</p>`],
    ['disponibilidade', '9. Disponibilidade e suporte', `
<p>A plataforma trabalha para manter o sistema no ar e com cópias de segurança, mas não garante funcionamento sem interrupções, que podem acontecer por manutenção ou por falha de fornecedores (hospedagem, banco de dados, WhatsApp, mapas). Avisamos com antecedência as manutenções programadas sempre que possível.</p>`],
    ['pagamento', '10. Pagamento, suspensão e fim do contrato', `
<p>Os valores e o plano estão na proposta aceita pelo cliente. Atraso pode levar à suspensão do acesso depois de aviso. Uso que viole estes Termos ou a lei pode levar à suspensão imediata. No fim do contrato, o cliente pode pedir a exportação dos seus dados em até 30 dias; depois disso, os dados do cliente são apagados, salvo o que a lei obriga a guardar (por exemplo, registros de acesso por 6 meses, Marco Civil da Internet, art. 15).</p>`],
    ['responsabilidade', '11. Responsabilidade', `
<p>A plataforma responde pelos danos que causar por falha do sistema, nos limites da lei. Não responde por negócios feitos entre o cliente e terceiros, por conteúdo publicado pelo cliente, por mensagens que o cliente mandar ou aprovar, nem pelo uso de dados que o cliente obteve de fornecedores contratados por ele.</p>`],
    ['mudancas', '12. Mudanças', `
<p>Estes Termos podem mudar. Mudança relevante é avisada no sistema e pede novo aceite.</p>`],
    ['foro', '13. Lei e foro', `
<p>Vale a lei brasileira. Fica eleito o foro da Comarca de Campinas (SP), salvo regra legal em contrário.</p>`],
  ];
}

function privacidade() {
  return [
    ['controlador', 'Quem somos e como falar com a gente', `
<p>Esta política explica como ${quemEPlataforma()} trata dados pessoais no ${esc(P.nome)} e no site corretordofuturo.app. Versão de ${VIGENCIA}.</p>
<p>Encarregado pelo tratamento de dados (LGPD, art. 41): ${esc(P.encarregado)}, <a href="mailto:${esc(P.email)}">${esc(P.email)}</a>. Pedidos também pelo <a href="#pedido">formulário no fim desta página</a>.</p>`],
    ['papeis', 'Dois papéis', `
<p><strong>Somos controladores</strong> dos dados das contas de acesso ao sistema, da cobrança, dos contatos feitos com a plataforma e da base comum de mercado.</p>
<p><strong>Somos operadores</strong> dos dados que cada imobiliária cliente trata no sistema (proprietários, clientes, conversas, documentos). Nesses casos, quem decide é a imobiliária, e é com ela que o titular deve falar primeiro; se você não souber qual imobiliária tem os seus dados, fale com a gente e encaminhamos o pedido.</p>`],
    ['quais-dados', 'Quais dados, para quê e com qual base legal', `
<table class="legal-tabela"><thead><tr><th>Quem</th><th>Dados</th><th>Para quê</th><th>Base legal (LGPD)</th></tr></thead><tbody>
<tr><td>Usuários das imobiliárias</td><td>Nome, e-mail, perfil, celular, registros de acesso e de ações no sistema</td><td>Dar acesso, segurança, suporte, auditoria</td><td>Execução de contrato (art. 7º, V); cumprimento de obrigação legal para registros de acesso (art. 7º, II; Marco Civil, art. 15)</td></tr>
<tr><td>Visitantes de corretordofuturo.app</td><td>Nenhum dado é gravado. O formulário abre o WhatsApp com a sua mensagem; não usamos cookies de rastreamento nem anúncios</td><td>Contato comercial</td><td>Procedimentos preliminares a pedido do titular (art. 7º, V)</td></tr>
<tr><td>Pessoas citadas em anúncios publicados (por exemplo, anunciante pessoa física ou corretor)</td><td>Nome ou nome comercial, CRECI e dados do anúncio, quando constam no próprio anúncio</td><td>Informação de mercado para profissionais do setor imobiliário</td><td>Legítimo interesse (art. 7º, IX e art. 10), com dados tornados públicos pelo próprio titular (art. 7º, §§ 4º e 7º), respeitando a finalidade da publicação</td></tr>
<tr><td>Proprietários, clientes e leads das imobiliárias</td><td>O que a imobiliária cadastra ou recebe</td><td>Atividade da imobiliária</td><td>Definida pela imobiliária, que é a controladora; nós só operamos</td></tr>
<tr><td>Quem faz um pedido de titular</td><td>Nome, contato, pedido e protocolo</td><td>Responder e provar que respondemos</td><td>Obrigação legal (art. 7º, II e art. 18)</td></tr>
</tbody></table>
<p>Não tratamos dados sensíveis de propósito e não guardamos número de CPF ou CNPJ vindo de bases de terceiros (é guardado só um código irreversível, para evitar repetição).</p>`],
    ['legitimo-interesse', 'Legítimo interesse e o seu direito de dizer não', `
<p>A primeira abordagem de captação (perguntar ao dono de um imóvel anunciado se ele quer ajuda para vender ou alugar) se apoia no legítimo interesse da imobiliária. Para isso o sistema segue salvaguardas: só fala do imóvel que está anunciado, só em horário comercial e com limite diário, diz quem fala e de onde veio o contato, e para na primeira resposta PARAR. Quem pede para não ser contatado entra numa lista comum: nenhuma imobiliária do sistema volta a mandar mensagem automática para aquele número.</p>`],
    ['compartilhamento', 'Com quem os dados são compartilhados', `
<p>Só com fornecedores necessários para o sistema funcionar, que tratam os dados por nossa conta:</p>
<ul>
<li>Supabase (banco de dados) e Vercel (hospedagem), com servidores nos Estados Unidos;</li>
<li>Google (mapas, 3D, fachada e, quando a imobiliária liga, a inteligência artificial Gemini);</li>
<li>Meta / WhatsApp (envio e recebimento de mensagens, quando a imobiliária conecta um número);</li>
<li>bases de dados imobiliárias contratadas pela própria imobiliária (por exemplo, Fisgar), só nas consultas que ela pede.</li>
</ul>
<p>Os dados podem ser guardados fora do Brasil por esses fornecedores, com as garantias do art. 33 da LGPD e da regulamentação da ANPD. Autoridades recebem dados só por obrigação legal ou ordem judicial. Não vendemos dados.</p>`],
    ['seguranca', 'Segurança', `
<p>Cada imobiliária tem um banco de dados separado, com usuário próprio que não enxerga os das outras. Senhas são guardadas com hash, as conexões são cifradas, chaves de serviços ficam cifradas no banco e as ações importantes ficam registradas. Se houver um incidente de segurança com risco aos titulares, avisaremos as imobiliárias, os titulares afetados e a ANPD, como manda o art. 48 da LGPD.</p>`],
    ['prazo', 'Por quanto tempo', `
<ul>
<li>Contas de acesso: enquanto durar o contrato, e depois o necessário para cumprir a lei;</li>
<li>Registros de acesso: 6 meses (Marco Civil, art. 15);</li>
<li>Dados das imobiliárias: até 30 dias depois do fim do contrato, para exportação, e depois apagados;</li>
<li>Anúncios da base comum: enquanto forem úteis como histórico de preços e de mercado; quem aparece num anúncio pode pedir a retirada dos seus dados pessoais a qualquer momento;</li>
<li>Lista "não contatar": guardada enquanto existir o sistema, porque é ela que garante o seu pedido.</li>
</ul>`],
    ['direitos', 'Seus direitos', `
<p>Pela LGPD (art. 18) você pode, a qualquer momento e sem custo:</p>${DIREITOS}
<p>Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), pelo site gov.br/anpd.</p>`],
    ['cookies', 'Cookies', `
<p>Usamos só o cookie de sessão de quem entra no sistema (necessário para o login funcionar). O site de vendas não usa cookies de rastreamento nem publicidade.</p>`],
    ['mudancas', 'Mudanças', `
<p>Esta política pode mudar. A data da versão fica no início; mudança relevante é avisada no sistema.</p>`],
  ];
}

// ------------------------------------------------------------------------- portal da imobiliária
function privacidadeCliente() {
  const contato = C.email ? `<a href="mailto:${esc(C.email)}">${esc(C.email)}</a> ou pelo formulário abaixo` : 'pelo formulário abaixo';
  return [
    ['quem', 'Quem trata os seus dados', `
<p>Este site é da ${quemECliente()} (a "imobiliária"), que é a <strong>controladora</strong> dos dados pessoais tratados aqui. Versão de ${VIGENCIA}.</p>
<p>O site e o sistema da imobiliária funcionam no ${esc(P.nome)}, software de outra empresa (${quemEPlataforma()}), que é <strong>operadora</strong>: guarda e processa os dados por conta da imobiliária e não os usa para outra finalidade.</p>
<p>Fale com a imobiliária sobre os seus dados ${contato}.${C.encarregado ? ` Encarregado: ${esc(C.encarregado)}.` : ''}</p>`],
    ['visitante', 'Se você visita o site ou pede informação', `
<table class="legal-tabela"><thead><tr><th>Quando</th><th>Dados</th><th>Para quê</th><th>Base legal (LGPD)</th></tr></thead><tbody>
<tr><td>"Tenho interesse", "Agendar visita", "Fale com a gente"</td><td>Nome, telefone, e-mail (se você der), mensagem, imóvel e data da visita</td><td>Responder, marcar a visita e mostrar imóveis do seu interesse</td><td>Procedimentos preliminares de contrato, a seu pedido (art. 7º, V)</td></tr>
<tr><td>Clube Signature</td><td>Nome, telefone, e-mail e o aceite</td><td>Liberar valores reservados e combinar visita privada</td><td>Consentimento (art. 7º, I), que você pode revogar</td></tr>
<tr><td>Favoritos</td><td>Os imóveis que você guardou</td><td>Lembrar os favoritos</td><td>Ficam só no seu aparelho; nada é enviado</td></tr>
</tbody></table>
<p>O site não usa cookies de publicidade nem de rastreamento. Há só um cookie para quem entra no Clube Signature (para não pedir o cadastro de novo).</p>`],
    ['proprietario', 'Se você é proprietário e recebeu um contato nosso', `
<p>A imobiliária procura imóveis anunciados à venda ou para alugar para oferecer o serviço de corretagem ao dono. O seu contato pode ter vindo de:</p>
<ul>
<li>dados do anúncio do imóvel, publicado na internet;</li>
<li>uma base de dados imobiliária contratada pela imobiliária, que reúne anúncios e possíveis proprietários a partir de informações públicas (por exemplo, o Fisgar, cuja política de privacidade está em fisgar.com.br/lgpd).</li>
</ul>
<p>A base legal é o legítimo interesse (art. 7º, IX e art. 10): a mensagem fala só do imóvel anunciado, diz quem está falando e como parar. Se responder <strong>PARAR</strong>, ou fizer o pedido abaixo, o seu número sai da lista desta imobiliária e de todas as outras que usam o ${esc(P.nome)}. Seu nome e telefone nunca aparecem no site, e o imóvel só é anunciado aqui com a sua autorização por escrito.</p>`],
    ['compartilhamento', 'Com quem compartilhamos', `
<p>Com a operadora (${esc(P.nome)}) e os fornecedores dela (banco de dados e hospedagem nos Estados Unidos, mapas do Google, WhatsApp), só para o atendimento funcionar, com as garantias do art. 33 da LGPD. Não vendemos dados.</p>`],
    ['prazo', 'Por quanto tempo', `
<p>Os dados de atendimento ficam enquanto houver negociação ou relacionamento e pelo tempo que a lei exigir depois disso. Quem pede para não ser contatado fica na lista "não contatar", que é o que garante o pedido.</p>`],
    ['direitos', 'Seus direitos', `<p>Pela LGPD (art. 18) você pode:</p>${DIREITOS}<p>A imobiliária responde em até 15 dias. Você também pode reclamar à ANPD, pelo site gov.br/anpd.</p>`],
  ];
}

function termosCliente() {
  return [
    ['uso', 'Uso deste site', `
<p>Este site é da ${quemECliente()}. Ao usá-lo, você aceita estes termos e a <a href="/privacidade">Política de privacidade</a>. Versão de ${VIGENCIA}.</p>`],
    ['informacoes', 'Informações dos imóveis', `
<p>Valores, áreas, fotos e condições vêm da ficha de cada imóvel e podem mudar sem aviso. Nada aqui é proposta fechada: confirme tudo com o corretor antes de qualquer decisão. Os textos das páginas foram escritos a partir das fotos e da ficha de cada imóvel e podem ter imprecisões.${C.demonstracao ? ' <strong>Este é um portal de demonstração:</strong> as fotos são imagens ilustrativas e não mostram imóveis reais.' : ''}</p>
<p>O endereço exato é informado pelo corretor, depois do contato.</p>`],
    ['conteudo', 'Textos, fotos e marca', `
<p>Os textos, as fotos e a marca deste site pertencem à imobiliária ou a quem autorizou o uso. Fotos de terceiros, quando houver, trazem o autor e a licença. Não copie para uso comercial sem autorização.</p>`],
    ['software', 'Tecnologia', `
<p>O site funciona no ${esc(P.nome)}, software independente que não tem vínculo com portais de anúncios. Quem anuncia e negocia é a imobiliária.</p>`],
    ['foro', 'Lei aplicável', `<p>Vale a lei brasileira, inclusive o Código de Defesa do Consumidor.</p>`],
  ];
}

// --------------------------------------------------------------------------- partes comuns de HTML
function indice(secoes) {
  return `<nav class="legal-indice" aria-label="Nesta página"><p>Nesta página</p><ol>${secoes.map(([id, t]) => `<li><a href="#${id}">${esc(t.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></nav>`;
}
function corpo(secoes) {
  return secoes.map(([id, t, h]) => `<section id="${id}" class="legal-sec"><h2>${esc(t)}</h2>${h.trim()}</section>`).join('\n');
}

/** Formulário do titular (POST normal, sem JavaScript: funciona com a CSP do portal). */
function formulario(acao, { extras = '' } = {}) {
  return `<section id="pedido" class="legal-sec legal-pedido"><h2>Fazer um pedido sobre os seus dados</h2>
<p>Use este formulário para pedir qualquer um dos direitos acima ou para não receber mais mensagens. Você recebe um número de protocolo na hora.</p>
<form method="post" action="${acao}" class="legal-form">
<label>O que você quer<select name="tipo" required><option value="">Escolha</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
<label>Seu nome<input name="nome" required maxlength="120" autocomplete="name"></label>
<label>Telefone com DDD<input name="telefone" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="(19) 99999-9999"></label>
<label>E-mail<input name="email" type="email" maxlength="160" autocomplete="email"></label>
${extras}
<label class="largo">Detalhes (opcional)<textarea name="mensagem" maxlength="2000" rows="4" placeholder="Ex.: recebi uma mensagem sobre o imóvel da rua tal"></textarea></label>
<label class="largo legal-check"><input type="checkbox" name="declaro" value="1" required> Declaro que o pedido é sobre os meus próprios dados ou que represento o titular.</label>
<input class="legal-armadilha" name="empresa" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="largo legal-nota">Usamos estes dados só para responder o pedido e guardar a prova da resposta. Para parar mensagens, informe o telefone que as recebeu.</p>
<div class="largo"><button type="submit">Enviar pedido</button></div>
</form></section>`;
}

const AVISO_REVISAO = 'Texto elaborado com base na legislação brasileira; em revisão jurídica.';

module.exports = { sobre, termos, privacidade, privacidadeCliente, termosCliente, indice, corpo, formulario, esc, VIGENCIA, AVISO_REVISAO };
