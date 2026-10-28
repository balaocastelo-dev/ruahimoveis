// Fotos que os donos mandam pelo WhatsApp ao TH-IA-GO (fotos originais, com autorização de uso pedida na conversa).
// Ficam no banco (visíveis no PC e no link) e podem ir para a pasta "Fotos" do imóvel quando ele for captado.
const { one, all, run } = require('../db');

function guarda({ agente, telefone, pessoa_id = null, anuncio_id = null, lead_id = null, mime, legenda, dados }) {
  if (!dados || !dados.length) return null;
  if (dados.length > 12 * 1024 * 1024) throw new Error('foto grande demais');
  const an = anuncio_id ? one('SELECT oportunidade_id FROM anuncio_andamento WHERE anuncio_id=?', anuncio_id) : null;
  const n = (one('SELECT count(*) n FROM agente_midias WHERE pessoa_id=?', pessoa_id) || {}).n || 0;
  const ext = /png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : 'jpg';
  const r = run(`INSERT INTO agente_midias(agente,telefone,pessoa_id,anuncio_id,oportunidade_id,lead_id,mime,nome,tamanho,legenda,dados) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    agente, telefone, pessoa_id, anuncio_id, an ? an.oportunidade_id : null, lead_id, mime, `foto-do-proprietario-${n + 1}.${ext}`, dados.length, legenda ? String(legenda).slice(0, 300) : null, dados);
  require('./base').evento(agente, 'foto', `Recebeu foto original do dono${anuncio_id ? ' (FG-' + String(anuncio_id).padStart(5, '0') + ')' : ''}`, anuncio_id ? `fg${anuncio_id}` : null);
  return Number(r.lastInsertRowid);
}

const lista = (filtro = {}) => all(`SELECT m.id,m.agente,m.telefone,m.pessoa_id,m.anuncio_id,m.oportunidade_id,m.mime,m.nome,m.tamanho,m.legenda,m.imovel_arquivo_id,m.criado_em,
    p.nome pessoa, a.bairro, a.logradouro, a.numero, d.imovel_id, o.imovel_id op_imovel_id, i.codigo
  FROM agente_midias m LEFT JOIN fisguei_pessoas p ON p.id=m.pessoa_id LEFT JOIN fisguei_anuncios a ON a.id=m.anuncio_id LEFT JOIN anuncio_andamento d ON d.anuncio_id=m.anuncio_id
  LEFT JOIN oportunidades o ON o.id=m.oportunidade_id LEFT JOIN imoveis i ON i.id=coalesce(o.imovel_id,d.imovel_id)
  ${filtro.agente ? 'WHERE m.agente=?' : ''} ORDER BY m.id DESC LIMIT 120`, ...(filtro.agente ? [filtro.agente] : []));

const ler = (id) => one('SELECT mime,nome,dados FROM agente_midias WHERE id=?', id);

// Copia a foto para a pasta "Fotos" do imóvel (quando a oportunidade já virou imóvel).
async function paraImovel(id, usuarioId) {
  const m = one(`SELECT m.*, coalesce(o.imovel_id,d.imovel_id) imovel_id FROM agente_midias m LEFT JOIN oportunidades o ON o.id=m.oportunidade_id
    LEFT JOIN anuncio_andamento d ON d.anuncio_id=m.anuncio_id WHERE m.id=?`, id);
  if (!m) { const e = new Error('Foto não encontrada.'); e.status = 404; throw e; }
  if (m.imovel_arquivo_id) return { id: m.imovel_arquivo_id, ja: true };
  if (!m.imovel_id) { const e = new Error('Esta oportunidade ainda não virou imóvel. Use "Captar imóvel" no Radar primeiro.'); e.status = 409; throw e; }
  const r = await require('../services/drive').salvarArquivo({ imovelId: m.imovel_id, categoria: 'Fotos', nome: m.nome, mime: m.mime, buffer: Buffer.from(m.dados), usuarioId });
  run('UPDATE agente_midias SET imovel_arquivo_id=? WHERE id=?', r.id, m.id);
  return { id: r.id, imovel_id: m.imovel_id };
}

module.exports = { guarda, lista, ler, paraImovel };
