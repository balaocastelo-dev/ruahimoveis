// Página automática do portal: todo imóvel marcado como "publicado" (com foto própria) entra no portal da
// imobiliária na hora, mesmo antes de existir a página escrita. Ela é montada só com a ficha AO VIVO
// (tipo, bairro, quartos, áreas, condomínio) e as fotos próprias; a descrição entra só se for da equipe
// (nunca as notas internas de captação). Endereço, proprietário e dados do CRM nunca entram.
// Quando a página escrita for aprovada, ela toma o lugar desta.
const cfg = require('../config');

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugDe = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const n = (v, um, varios) => `${v} ${v === 1 ? um : varios}`;
const m2 = (v) => `${Math.round(v).toLocaleString('pt-BR')} m²`;
// texto escrito pela equipe? (as notas automáticas de captação começam assim e citam a origem)
const NOTA_INTERNA = /^(Veio da base|Captado pelo radar|Importado do Fisguei)|Fisgar|Anunciado antes por|Anúncio original:/i;
const descricaoPublica = (d) => {
  const t = String(d || '').trim();
  if (t.length < 60 || NOTA_INTERNA.test(t)) return '';
  if (/https?:\/\/|www\.|\b\d{4,5}-?\d{4}\b|@/.test(t)) return ''; // link, telefone ou e-mail: fica de fora
  return t;
};

function paginaAutomatica(im) {
  const onde = [im.bairro, im.cidade].filter(Boolean).join(', ');
  const titulo = `${im.tipo}${im.quartos ? ` com ${n(im.quartos, 'quarto', 'quartos')}` : ''}${im.bairro ? ` no ${im.bairro}` : ''}`;
  const numeros = [
    im.quartos && n(im.quartos, 'quarto', 'quartos') + (im.suites ? `, sendo ${n(im.suites, 'suíte', 'suítes')}` : ''),
    !im.quartos && im.suites && n(im.suites, 'suíte', 'suítes'),
    im.vagas && n(im.vagas, 'vaga de garagem', 'vagas de garagem'),
    im.area_util && `${m2(im.area_util)} de área útil`,
    im.area_total && im.area_total !== im.area_util && `${m2(im.area_total)} de área total`,
    im.condominio && `No ${im.condominio}`,
    im.lazer && `Lazer: ${im.lazer}`,
  ].filter(Boolean);
  const desc = descricaoPublica(im.descricao);
  const abertura = desc ? null : `${im.tipo} à venda${onde ? ` em ${onde}` : ''}${numeros.length ? `, com ${numeros.slice(0, 3).join(', ').toLowerCase()}` : ''}. Veja as fotos e fale com a equipe da ${cfg.CLIENTE_NOME} para agendar uma visita.`;
  const blocos = [
    ...(desc ? desc.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 8).map((texto) => ({ tipo: 'paragrafo', texto })) : [{ tipo: 'paragrafo', texto: abertura }]),
    ...(numeros.length ? [{ tipo: 'resumo', titulo: 'Ficha', itens: numeros }] : []),
    ...(im.fotos.length > 1 ? [{ tipo: 'fotos', fotos: im.fotos.slice(1, 4).map((foto, i) => ({ foto, legenda: `${im.tipo}${im.bairro ? ` no ${im.bairro}` : ''} · foto ${i + 2}` })) }] : []),
    { tipo: 'chamada', tema: 'visita' },
  ];
  return {
    codigo: im.codigo,
    slug: slugDe(`${titulo} ${im.cidade || ''} ${im.codigo}`),
    titulo,
    resumo: (desc ? desc.replace(/\s+/g, ' ').slice(0, 220) : abertura).replace(/\s+\S*$/, (x) => (x.length < 30 ? x : '')).trim(),
    capa: { foto: im.fotos[0], alt: titulo },
    blocos,
    galeria: im.fotos.map((foto, i) => ({ foto, legenda: `${titulo} · foto ${i + 1}`, ambiente: 'outro' })),
    versao: im.versao,
    automatica: true,
    publicadoEm: new Date(String(im.atualizado_em || im.criado_em || Date.now()).replace(' ', 'T') + (String(im.atualizado_em || '').length === 19 ? '-03:00' : '')).toISOString(),
  };
}

module.exports = { paginaAutomatica, descricaoPublica };
