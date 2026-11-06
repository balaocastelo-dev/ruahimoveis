// Modelos de contrato que a imobiliária gera para o cliente, no mesmo caminho da autorização de venda:
// o texto sai daqui, vira uma linha em `assinaturas` (com o tipo), ganha link de assinatura e PDF com
// o logo da imobiliária. São modelos iniciais: cada imobiliária deve passar pelo advogado dela.
//
//   locacao       contrato de locação residencial (locador e locatário), Lei 8.245/1991
//   venda         compromisso de compra e venda (vendedor e comprador)
//   intermediacao contrato de prestação de serviço de intermediação (imobiliária e cliente)
const cfg = require('../config');

const brl = (v) => (v || v === 0 ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
const hoje = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const pct = (n) => String(n).replace('.', ',');

/** "Fulano, CPF 000, telefone 19…, e-mail x@y" — a qualificação de cada parte, com o que houver. */
function parte(p) {
  if (!p || !p.nome) return '—';
  const cs = [];
  if (p.cpf) cs.push(`CPF ${p.cpf}`);
  if (p.rg) cs.push(`RG ${p.rg}`);
  if (p.endereco) cs.push(`residente em ${p.endereco}`);
  if (p.telefone) cs.push(`telefone ${p.telefone}`);
  if (p.email) cs.push(`e-mail ${p.email}`);
  return `${p.nome}${cs.length ? ', ' + cs.join(', ') : ''}`;
}

/** O imóvel por extenso, do jeito que vai no corpo do contrato. */
function imovelPorExtenso(im, matricula) {
  const end = [im.logradouro, im.numero].filter(Boolean).join(', ') + (im.unidade ? `, ${im.unidade}` : '');
  const areas = [im.area_util ? `área útil de ${im.area_util} m²` : null, im.area_total ? `área total de ${im.area_total} m²` : null].filter(Boolean);
  return `${im.tipo}${im.condominio_nome ? ' no condomínio ' + im.condominio_nome : ''}, situado em ${end}, bairro ${im.bairro || '—'}, ${im.cidade}-${im.uf}, CEP ${im.cep || '—'}`
    + `${areas.length ? ', ' + areas.join(' e ') : ''}${im.quartos ? `, ${im.quartos} dormitório(s)` : ''}${im.vagas ? `, ${im.vagas} vaga(s) de garagem` : ''}`
    + `${matricula ? `, matrícula nº ${matricula}` : ''}. Código interno ${im.codigo}.`;
}

/** A cláusula de garantia da locação, conforme o art. 37 da Lei 8.245/1991. Só uma por contrato. */
function garantia(o, aluguel) {
  const n = Math.min(Math.max(parseInt(o.caucao_alugueis, 10) || 3, 1), 3);
  switch (o.garantia) {
    case 'fiador':
      return `GARANTIA (FIADOR): ${o.fiador_nome ? parte({ nome: o.fiador_nome, cpf: o.fiador_cpf, endereco: o.fiador_endereco }) : '(fiador a qualificar)'} assina este contrato como FIADOR(A) e principal pagador(a), solidariamente responsável por todas as obrigações do(a) LOCATÁRIO(A) até a efetiva devolução das chaves, inclusive aluguéis, encargos, multas e danos ao imóvel, com renúncia ao benefício de ordem (arts. 827 e 828 do Código Civil). A fiança permanece válida em eventual prorrogação por prazo indeterminado, até a entrega das chaves.`;
    case 'caucao':
      return `GARANTIA (CAUÇÃO EM DINHEIRO): o(a) LOCATÁRIO(A) deposita, a título de caução, o valor equivalente a ${n} (${['um', 'dois', 'três'][n - 1]}) aluguel(éis), hoje ${brl(aluguel * n)}. O valor é depositado em caderneta de poupança indicada pela IMOBILIÁRIA, em conjunto com o(a) LOCADOR(A), e será devolvido ao fim da locação com os rendimentos, descontado o que estiver pendente. Se o aluguel for reajustado, a caução acompanha o novo valor e a diferença é complementada em até 30 dias do reajuste. A caução não substitui o pagamento do aluguel e não pode ser usada pelo(a) LOCATÁRIO(A) para quitar os últimos meses, salvo acordo escrito.`;
    case 'seguro':
      return `GARANTIA (SEGURO-FIANÇA): o(a) LOCATÁRIO(A) contrata, às suas expensas, seguro-fiança locatícia${o.seguradora ? ` junto à ${o.seguradora}` : ''}, com cobertura de aluguéis, encargos e danos ao imóvel, mantendo a apólice vigente durante toda a locação e apresentando a renovação à IMOBILIÁRIA com, no mínimo, 30 dias de antecedência. A falta de renovação é infração contratual.`;
    default:
      return 'GARANTIA: as partes dispensam, de comum acordo, a prestação de garantia locatícia, nos termos do art. 37 da Lei 8.245/1991, ficando o(a) LOCATÁRIO(A) integralmente responsável pelas obrigações assumidas neste contrato.';
  }
}

/** Contrato de locação residencial. */
function textoLocacao(im, locador, locatario, o) {
  const aluguel = Number(o.aluguel) || Number(im.valor_locacao) || 0;
  const meses = Math.min(Math.max(parseInt(o.prazo_meses, 10) || 30, 6), 60);
  const inicio = o.inicio ? new Date(o.inicio + 'T12:00:00').toLocaleDateString('pt-BR') : hoje();
  const encargos = [o.condominio ? `condomínio (hoje ${brl(im.valor_condominio)})` : null, o.iptu ? `IPTU (hoje ${brl(im.iptu)})` : null, 'água, luz, gás e demais consumos do período'].filter(Boolean);
  return [
    'CONTRATO DE LOCAÇÃO RESIDENCIAL',
    '',
    `LOCADOR(A): ${parte(locador)}.`,
    `LOCATÁRIO(A): ${parte(locatario)}.`,
    `IMOBILIÁRIA (administradora): ${cfg.EMPRESA}.`,
    '',
    `IMÓVEL: ${imovelPorExtenso(im, o.matricula)}`,
    '',
    `1. OBJETO: o(a) LOCADOR(A) dá em locação ao(à) LOCATÁRIO(A) o imóvel acima, para fim exclusivamente residencial, vedada a cessão, sublocação ou empréstimo, total ou parcial, sem autorização escrita.`,
    `2. PRAZO: ${meses} meses, com início em ${inicio}. Findo o prazo, não havendo oposição escrita, a locação prorroga-se por prazo indeterminado, podendo o(a) LOCATÁRIO(A) denunciá-la a qualquer tempo mediante aviso de 30 dias.`,
    `3. ALUGUEL: ${brl(aluguel)} por mês, vencendo todo dia ${Math.min(Math.max(parseInt(o.dia_vencimento, 10) || 10, 1), 28)} de cada mês, pago à IMOBILIÁRIA, que repassa ao(à) LOCADOR(A).`,
    `4. REAJUSTE: a cada 12 meses, pela variação acumulada do ${o.indice || 'IPCA/IBGE'}. Extinto o índice, aplica-se o que o substituir legalmente.`,
    `5. ENCARGOS: correm por conta do(a) LOCATÁRIO(A) ${encargos.join(', ')}, com comprovação sempre que solicitada.`,
    `6. ${garantia(o, aluguel)}`,
    `7. ATRASO: o aluguel ou encargo pago com atraso sofre multa de ${pct(o.multa_pct || 2)}% sobre o valor devido, juros de 1% ao mês e correção monetária, sem prejuízo das demais medidas cabíveis.`,
    `8. ENTREGA E CONSERVAÇÃO: o imóvel é entregue nas condições descritas no laudo de vistoria, que integra este contrato, e deve ser devolvido no mesmo estado, salvo o desgaste natural do uso normal. Benfeitorias úteis ou voluptuárias só serão indenizadas se autorizadas por escrito; as necessárias seguem o art. 35 da Lei 8.245/1991.`,
    `9. OBRAS E ALTERAÇÕES: o(a) LOCATÁRIO(A) não pode fazer obras que alterem a estrutura, a fachada ou as instalações sem autorização escrita do(a) LOCADOR(A).`,
    `10. VISTORIAS: a IMOBILIÁRIA pode vistoriar o imóvel mediante aviso prévio de 48 horas, em horário combinado.`,
    `11. VENDA DO IMÓVEL: em caso de venda, fica assegurado ao(à) LOCATÁRIO(A) o direito de preferência, nos termos dos arts. 27 a 34 da Lei 8.245/1991.`,
    `12. RESCISÃO ANTECIPADA: o(a) LOCATÁRIO(A) que devolver o imóvel antes do prazo paga multa equivalente a ${pct(o.multa_rescisao_alugueis || 3)} aluguel(éis), reduzida proporcionalmente ao tempo já cumprido, conforme o art. 4º da Lei 8.245/1991. A multa não é devida se a saída decorrer de transferência de trabalho, comunicada com 30 dias de antecedência e comprovada.`,
    `13. DADOS PESSOAIS: os dados das partes são tratados pela IMOBILIÁRIA apenas para administrar esta locação e cumprir obrigações legais, nos termos da Lei 13.709/2018 (LGPD).`,
    o.observacoes ? `14. OBSERVAÇÕES: ${o.observacoes}` : null,
    `${o.observacoes ? '15' : '14'}. FORO: fica eleito o foro da comarca de ${im.cidade}-${im.uf} para dirimir as questões deste contrato.`,
    '',
    `${im.cidade}, ${hoje()}.`,
  ].filter((l) => l !== null).join('\n');
}

/** Compromisso de compra e venda. */
function textoVenda(im, vendedor, comprador, o) {
  const valor = Number(o.valor) || Number(im.valor) || 0;
  const sinal = Number(o.sinal) || 0;
  const saldo = Math.max(valor - sinal, 0);
  const prazo = Math.min(Math.max(parseInt(o.prazo_escritura_dias, 10) || 60, 15), 365);
  const forma = o.forma_pagamento === 'financiamento'
    ? `O saldo de ${brl(saldo)} será pago por meio de financiamento imobiliário a ser obtido pelo(a) COMPRADOR(A) junto à instituição financeira de sua escolha, comprometendo-se a protocolar o pedido em até 15 dias e a apresentar o resultado à IMOBILIÁRIA. Negado o financiamento, e comprovada a negativa, o presente compromisso fica rescindido e os valores pagos são devolvidos ao(à) COMPRADOR(A), sem multa.`
    : o.forma_pagamento === 'parcelado'
      ? `O saldo de ${brl(saldo)} será pago em ${Math.max(parseInt(o.parcelas, 10) || 1, 1)} parcela(s) mensal(is), corrigidas pelo ${o.indice || 'IPCA/IBGE'}, vencendo a primeira em 30 dias da assinatura.`
      : `O saldo de ${brl(saldo)} será pago à vista, no ato da lavratura da escritura definitiva.`;
  return [
    'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA',
    '',
    `VENDEDOR(A) (PROMITENTE VENDEDOR): ${parte(vendedor)}.`,
    `COMPRADOR(A) (PROMITENTE COMPRADOR): ${parte(comprador)}.`,
    `IMOBILIÁRIA (intermediadora): ${cfg.EMPRESA}.`,
    '',
    `IMÓVEL: ${imovelPorExtenso(im, o.matricula)}`,
    '',
    `1. OBJETO: o(a) VENDEDOR(A) promete vender, e o(a) COMPRADOR(A) promete comprar, o imóvel acima descrito, livre e desembaraçado de ônus, dívidas, hipotecas e ações reais ou pessoais reipersecutórias.`,
    `2. PREÇO: ${brl(valor)}, assim pago: ${sinal ? `${brl(sinal)} a título de sinal e princípio de pagamento, neste ato` : 'sem sinal'}. ${forma}`,
    `3. ESCRITURA: a escritura pública definitiva será lavrada em até ${prazo} dias da assinatura deste instrumento, em cartório escolhido pelo(a) COMPRADOR(A), que arca com as despesas de escritura, ITBI e registro, salvo acordo diverso aqui registrado.`,
    `4. DOCUMENTOS: o(a) VENDEDOR(A) se obriga a entregar, em até 15 dias, a matrícula atualizada, as certidões negativas pessoais e do imóvel, o comprovante de quitação de IPTU e condomínio e o que mais for exigido pelo cartório e pela instituição financeira.`,
    `5. POSSE: a posse do imóvel será transmitida ao(à) COMPRADOR(A) ${o.posse === 'assinatura' ? 'na assinatura deste instrumento' : 'na lavratura da escritura definitiva'}, com o imóvel desocupado e as contas de consumo quitadas.`,
    `6. DESPESAS ATÉ A ENTREGA: IPTU, condomínio e consumos até a data da entrega da posse correm por conta do(a) VENDEDOR(A); a partir dela, do(a) COMPRADOR(A).`,
    `7. ARREPENDIMENTO E MULTA: o descumprimento por qualquer das partes sujeita a parte infratora a multa de ${pct(o.multa_pct || 10)}% sobre o valor do negócio, além das perdas e danos comprovados. Desistindo o(a) COMPRADOR(A) sem justa causa, perde o sinal; desistindo o(a) VENDEDOR(A), devolve o sinal em dobro, nos termos do art. 418 do Código Civil.`,
    `8. COMISSÃO: a comissão de corretagem, no valor de ${pct(o.comissao_pct || 6)}% sobre o preço, é devida à IMOBILIÁRIA por quem a contratou, na forma da autorização de venda, e considera-se ganha com a aproximação útil das partes e a aceitação da proposta.`,
    `9. IRRETRATABILIDADE: este compromisso é firmado em caráter irretratável e irrevogável, obrigando herdeiros e sucessores, e pode ser levado a registro na matrícula do imóvel por iniciativa de qualquer das partes.`,
    `10. DADOS PESSOAIS: os dados das partes são tratados pela IMOBILIÁRIA apenas para esta intermediação e para cumprir obrigações legais, nos termos da Lei 13.709/2018 (LGPD).`,
    o.observacoes ? `11. OBSERVAÇÕES: ${o.observacoes}` : null,
    `${o.observacoes ? '12' : '11'}. FORO: fica eleito o foro da comarca de ${im.cidade}-${im.uf} para dirimir as questões deste contrato.`,
    '',
    `${im.cidade}, ${hoje()}.`,
  ].filter((l) => l !== null).join('\n');
}

/** Prestação de serviço de intermediação, entre a imobiliária e o cliente que procura imóvel. */
function textoIntermediacao(im, cliente, o) {
  const loc = o.negocio === 'locacao';
  const dias = Math.min(Math.max(parseInt(o.prazo_dias, 10) || 90, 15), 365);
  return [
    `CONTRATO DE PRESTAÇÃO DE SERVIÇO DE INTERMEDIAÇÃO ${loc ? 'DE LOCAÇÃO' : 'IMOBILIÁRIA'}`,
    '',
    `CONTRATANTE: ${parte(cliente)}.`,
    `IMOBILIÁRIA (contratada): ${cfg.EMPRESA}.`,
    '',
    `IMÓVEL DE REFERÊNCIA: ${imovelPorExtenso(im, o.matricula)}`,
    '',
    `1. OBJETO: a IMOBILIÁRIA presta ao(à) CONTRATANTE o serviço de intermediação para ${loc ? 'a locação' : 'a aquisição'} do imóvel acima, incluindo apresentação, visitas acompanhadas, negociação de valores e condições, conferência de documentos e apoio até a assinatura do contrato${loc ? '' : ' e a lavratura da escritura'}.`,
    `2. PRAZO: ${dias} dias a contar da assinatura, prorrogável por escrito.`,
    `3. REMUNERAÇÃO: pelo serviço, o(a) CONTRATANTE pagará à IMOBILIÁRIA ${loc ? `o equivalente a ${pct(o.comissao_alugueis || 1)} aluguel(éis) do imóvel` : `${pct(o.comissao_pct || 6)}% sobre o valor do negócio`}, devidos na assinatura do contrato${loc ? ' de locação' : ' de compra e venda ou no recebimento do sinal, o que ocorrer primeiro'}.`,
    `4. RESULTADO ÚTIL: a remuneração é devida quando o negócio se concretiza com imóvel ou parte apresentada pela IMOBILIÁRIA, ainda que a assinatura ocorra após o prazo deste contrato e mesmo que o(a) CONTRATANTE trate diretamente com a outra parte, nos termos do art. 727 do Código Civil.`,
    `5. DEVERES DA IMOBILIÁRIA: prestar informações com clareza e exatidão sobre o imóvel e o negócio, alertar sobre os riscos conhecidos e manter sigilo sobre os dados do(a) CONTRATANTE, respondendo nos termos do art. 723 do Código Civil.`,
    `6. DEVERES DO(A) CONTRATANTE: fornecer documentos e informações verdadeiras para a análise cadastral${loc ? ' e de crédito' : ' e de crédito, quando houver financiamento'} e comunicar à IMOBILIÁRIA qualquer tratativa direta com a outra parte.`,
    `7. EXCLUSIVIDADE: ${o.exclusivo ? 'durante o prazo deste contrato, o(a) CONTRATANTE tratará da busca deste imóvel exclusivamente por meio da IMOBILIÁRIA.' : 'este contrato é firmado sem exclusividade, podendo o(a) CONTRATANTE buscar o imóvel por outros meios, respeitado o resultado útil previsto na cláusula 4.'}`,
    `8. DADOS PESSOAIS: os dados do(a) CONTRATANTE são tratados apenas para esta intermediação e para cumprir obrigações legais, nos termos da Lei 13.709/2018 (LGPD), podendo o(a) titular solicitar acesso, correção ou exclusão.`,
    o.observacoes ? `9. OBSERVAÇÕES: ${o.observacoes}` : null,
    `${o.observacoes ? '10' : '9'}. FORO: fica eleito o foro da comarca de ${im.cidade}-${im.uf} para dirimir as questões deste contrato.`,
    '',
    `${im.cidade}, ${hoje()}.`,
  ].filter((l) => l !== null).join('\n');
}

/** O título que vai no PDF e na tela, por tipo de documento. */
const TITULOS = {
  autorizacao: 'Autorização de venda',
  locacao: 'Contrato de locação',
  venda: 'Compromisso de compra e venda',
  intermediacao: 'Contrato de intermediação',
};

module.exports = { textoLocacao, textoVenda, textoIntermediacao, TITULOS, brl, parte, imovelPorExtenso };
