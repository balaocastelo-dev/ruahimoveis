// Imóveis: cadastro inteligente, proprietário, arquivos, Drive, link interno e autorização de venda.
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const A = require('../auth');
const cfg = require('../config');
const { one, all, run, audit } = require('../db');
const { falha, num, int, txt, imovelPermitido, cpfValido, fmtCpf, brl } = require('../util');
const endereco = require('../services/endereco');
const drive = require('../services/drive');
const match = require('../services/match');
const carteira = require('../services/carteira');

const r = express.Router();
r.use(A.exigeLogin);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 30, fields: 30, fieldNameSize: 100, fieldSize: 100000, parts: 70 } });

const PREFIXO = { 'Apartamento': 'AP', 'Cobertura': 'CB', 'Casa': 'CA', 'Casa em condomínio': 'CC', 'Sobrado': 'SO', 'Sala comercial': 'SL', 'Loja': 'LJ', 'Ponto comercial': 'PT', 'Prédio': 'PR', 'Hotel': 'HO', 'Galpão': 'GA', 'Terreno': 'TE', 'Chácara': 'CH' };
const TIPOS = Object.keys(PREFIXO);
const STATUS = ['captacao', 'aguardando_autorizacao', 'publicado', 'off_market', 'vendido', 'alugado', 'suspenso'];
const FINALIDADES = ['venda', 'locacao', 'venda_locacao'];

function proximoCodigo(tipo) {
  const p = PREFIXO[tipo] || 'IM';
  const r0 = one("SELECT max(CAST(substr(codigo,3) AS INTEGER)) n FROM imoveis WHERE codigo LIKE ?", p + '%');
  return p + String((r0.n || 0) + 1).padStart(4, '0');
}

const SELECT = `SELECT i.*, c.nome condominio_nome, c.ano_construcao, c.lazer, c.administradora, u.nome corretor_nome
  FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id LEFT JOIN usuarios u ON u.id=i.corretor_id`;

r.get('/tipos', (req, res) => res.json({ tipos: TIPOS, status: STATUS, finalidades: FINALIDADES, etapas: carteira.ETAPAS, origens: carteira.ORIGENS }));

r.get('/endereco', async (req, res) => res.json(await endereco.pesquisar(req.query)));

r.get('/', (req, res) => {
  const u = req.usuario; const p = []; let w = 'WHERE 1=1';
  if (!A.veTudo(u)) { w += ' AND i.corretor_id=?'; p.push(u.id); }
  if (req.query.status) { w += ' AND i.status=?'; p.push(req.query.status); }
  if (req.query.neg === 'locacao') w += " AND i.finalidade IN ('locacao','venda_locacao')";
  else if (req.query.neg === 'venda') w += " AND i.finalidade IN ('venda','venda_locacao')";
  if (req.query.q) {
    // código, condomínio, rua, bairro, nome ou telefone do dono (o da ficha e quem a consulta trouxe para o endereço)
    const t = String(req.query.q).trim().slice(0, 80), q = `%${t}%`, qs = `%${require('../condominios/geo').semAcento(t)}%`;
    const d = t.replace(/\D/g, ''), tel = /^[\d\s().+-]+$/.test(t) && d.length >= 5 ? `%${d.replace(/^55(?=\d{10,11}$)/, '').slice(-9)}%` : null;
    const telSQL = (col) => `replace(replace(replace(replace(replace(coalesce(${col},''),'(',''),')',''),' ',''),'-',''),'+','')`;
    w += ` AND (i.codigo LIKE ? OR c.nome LIKE ? OR i.bairro LIKE ? OR i.logradouro LIKE ? OR i.unidade LIKE ?
      OR i.proprietario_id IN (SELECT pr.id FROM proprietarios pr WHERE pr.nome LIKE ? OR pr.nome LIKE ?${tel ? ` OR ${telSQL('pr.telefone')} LIKE ?` : ''})
      OR i.id IN (SELECT a.imovel_id FROM fisguei_anuncios a JOIN fisguei_pessoas x ON x.anuncio_id=a.id WHERE a.imovel_id IS NOT NULL AND (x.nome LIKE ? OR x.nome LIKE ?))
      ${tel ? `OR i.id IN (SELECT a.imovel_id FROM fisguei_anuncios a JOIN fisguei_pessoas x ON x.anuncio_id=a.id JOIN fisguei_contatos ct ON ct.pessoa_id=x.id WHERE a.imovel_id IS NOT NULL AND ${telSQL('ct.valor')} LIKE ?)` : ''})`;
    p.push(q, q, q, q, q, q, qs, ...(tel ? [tel] : []), q, qs, ...(tel ? [tel] : []));
  }
  const fotos = `${require('../services/fotos-internas').capaSQL('i')} capa,
    (SELECT count(*) FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria='Fotos' AND f.mime LIKE 'image/%') n_fotos`;
  res.json(carteira.enriquece(all(`${SELECT.replace('SELECT i.*,', 'SELECT i.*, ' + fotos + ',')} ${w} ORDER BY i.atualizado_em DESC LIMIT 3000`, ...p).map(semDono)).map(({ descricao, ...i }) => i));
});
const semDono = ({ drive_subpastas, ...i }) => i;

// O que o Fisgar trouxe sobre o dono deste imóvel (pessoas, telefones e a conversa do robô)
r.get('/:id/fisgar', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  const an = all('SELECT id, status, anunciante_nome, anunciante_tipo, portal FROM fisguei_anuncios WHERE imovel_id=? ORDER BY id', req.params.id);
  const ids = an.map((a) => a.id);
  const pessoas = ids.length ? all(`SELECT p.id, p.anuncio_id, p.nome, p.relacao, p.unidade, p.idade, p.consultado, p.status FROM fisguei_pessoas p WHERE p.anuncio_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.consultado DESC, p.id`, ...ids) : [];
  const pids = pessoas.map((p) => p.id);
  const contatos = pids.length ? all(`SELECT pessoa_id, tipo, valor, envio FROM fisguei_contatos WHERE pessoa_id IN (${pids.map(() => '?').join(',')}) ORDER BY id`, ...pids) : [];
  const pedidos = ids.length ? all(`SELECT anuncio_id, status, creditos, erro, coalesce(concluido_em, criado_em) AS em FROM fisguei_pedidos WHERE anuncio_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 5`, ...ids) : [];
  const ref = (id) => 'FG-' + String(id).padStart(5, '0');
  res.json({
    anuncios: an.map((a) => ({ ...a, ref: ref(a.id) })), pedidos,
    pessoas: pessoas.map((p) => ({ ...p, contatos: contatos.filter((c) => c.pessoa_id === p.id).map(({ pessoa_id, ...c }) => c) })),
  });
});

// "Localizar proprietário" direto da carteira: o imóvel já está em operação, então não precisa voltar às vitrines da base.
// Usa o anúncio da base ligado ao imóvel; se não houver, cria um registro só com o endereço (sem valor nem fotos: não aparece
// nas vitrines) e põe a busca na fila do Fisgar. Quando o Fisgar responde, o dono vai para a ficha (proprietário digitado
// pela equipe nunca é trocado).
function localizarDono(im, usuario) {
  if (!im.logradouro || !im.numero) return { erro: 'sem_endereco' };
  const P = require('../fisguei/pedidos');
  let an = one('SELECT id FROM fisguei_anuncios WHERE imovel_id=? ORDER BY id LIMIT 1', im.id);
  if (!an) {
    const F = require('../fisguei/base');
    const slug = String(cfg.CLIENTE_NOME || 'cliente').normalize('NFD').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const id = F.salvaAnuncio({ fisgar_id: `im:${slug}:${im.id}`, portal: 'Carteira', tipo: im.tipo, negocio: im.finalidade === 'locacao' ? 'Locação' : 'Venda',
      logradouro: im.logradouro, numero: im.numero, complemento: im.unidade || null, bairro: im.bairro, cidade: im.cidade || cfg.CIDADE_PADRAO, uf: im.uf || 'SP', cep: im.cep || null,
      lat: im.lat, lon: im.lon, quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, area_total: im.area_total, anunciante_tipo: 'desconhecido' });
    run(`UPDATE fisguei_anuncios SET imovel_id=?, atualizado_em=datetime('now','localtime') WHERE id=?`, im.id, id);
    an = { id };
  }
  const out = P.pedeEndereco(an.id, usuario.id);
  if (out.erro) return { erro: 'sem_endereco' };
  return { ...out, anuncio_id: an.id };
}
const extrasFisgar = () => { const P = require('../fisguei/pedidos'); return { por_busca: 1 + P.limites().max_consultas, creditos: require('../fisguei/inteligencia').creditos(), extensao: P.resumo().extensao }; };
const SEM_END = 'Preencha a rua e o número do imóvel: a consulta de proprietários acha o dono pelo endereço.';
r.post('/localizar-dono', (req, res) => {
  const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map((x) => parseInt(x, 10)).filter(Number.isFinite).slice(0, 200);
  if (!ids.length) falha(400, 'Escolha ao menos um imóvel.');
  const out = { criados: 0, ja: 0, sem_endereco: 0 };
  for (const id of ids) {
    try { imovelPermitido(req.usuario, id); } catch { continue; }
    const im = one('SELECT * FROM imoveis WHERE id=?', id); if (!im) continue;
    const r0 = localizarDono(im, req.usuario);
    if (r0.erro) out.sem_endereco++; else if (r0.ja) out.ja++; else out.criados++;
  }
  audit(req.usuario.id, 'fisguei.buscar', `${out.criados} busca(s) de proprietário pela carteira`);
  res.json({ ...out, ...extrasFisgar() });
});
r.post('/:id/localizar-dono', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  const im = one('SELECT * FROM imoveis WHERE id=?', req.params.id);
  const out = localizarDono(im, req.usuario);
  if (out.erro) falha(400, SEM_END);
  audit(req.usuario.id, 'fisguei.buscar', `${im.codigo}: localizar proprietário pela carteira`);
  res.json({ ...out, criados: out.ja ? 0 : 1, ...extrasFisgar() });
});

r.get('/:id', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  const im = one(`${SELECT} WHERE i.id=?`, req.params.id);
  const dono = im.proprietario_id ? one('SELECT * FROM proprietarios WHERE id=?', im.proprietario_id) : null;
  const proprias = all("SELECT id,nome FROM arquivos WHERE imovel_id=? AND categoria='Fotos' AND mime LIKE 'image/%' ORDER BY id", im.id);
  // sem foto própria: as fotos internas (do anúncio de origem) aparecem com o selo "interna"; nunca saem do sistema
  const internas = all("SELECT id,nome FROM arquivos WHERE imovel_id=? AND categoria='Fotos internas' ORDER BY id", im.id).map((f) => ({ ...f, interna: true }));
  const fotos = [...proprias, ...internas];
  const [extra] = carteira.enriquece([{ ...im, n_fotos: proprias.length }]);
  res.json({ ...semDono(im), etapa: extra.etapa, origem: extra.origem, ficha: extra.ficha, fisguei_ids: extra.fisguei_ids, busca_dono: extra.busca_dono, proprietario: dono, fotos, drive_link: im.drive_pasta_id && A.veTudo(req.usuario) ? `https://drive.google.com/drive/folders/${im.drive_pasta_id}` : null });
});

function salvarCondominio(b) {
  const G = require('../condominios/geo');
  const { FONTE_CASA, fonteDaCasa } = require('../condominios/fonte');
  // Reconhecido pela base de condomínios (pesquisa de endereço): usa direto e só completa o que faltar.
  const escolhido = int(b.condominio_id);
  if (escolhido && one('SELECT id FROM condominios WHERE id=?', escolhido)) {
    run('UPDATE condominios SET ano_construcao=coalesce(ano_construcao,?), lazer=coalesce(lazer,?), administradora=coalesce(administradora,?), lat=coalesce(lat,?), lon=coalesce(lon,?) WHERE id=?',
      txt(b.ano_construcao, 10), txt(b.lazer, 300), txt(b.administradora, 120), num(b.lat), num(b.lon), escolhido);
    return escolhido;
  }
  const nome = txt(b.condominio_nome, 120);
  if (!nome) return null;
  const cep = endereco.soDigitos(b.cep) || null, numero = txt(b.numero, 20);
  const existe = cep && numero ? one('SELECT id, fontes FROM condominios WHERE cep=? AND numero=?', cep, numero) : one('SELECT id, fontes FROM condominios WHERE lower(nome)=lower(?)', nome);
  if (existe) {
    const daBase = existe.fontes && !fonteDaCasa(existe.fontes); // nome oficial (CNPJ/mapa) não é trocado pelo cadastro
    run(`UPDATE condominios SET ${daBase ? '' : 'nome=?, nome_busca=?, '}ano_construcao=coalesce(?,ano_construcao), lazer=coalesce(?,lazer), administradora=coalesce(?,administradora), lat=coalesce(lat,?), lon=coalesce(lon,?) WHERE id=?`,
      ...(daBase ? [] : [nome, G.chave(nome)]), txt(b.ano_construcao, 10), txt(b.lazer, 300), txt(b.administradora, 120), num(b.lat), num(b.lon), existe.id);
    return existe.id;
  }
  let sl = G.slug(nome); if (one('SELECT 1 FROM condominios WHERE slug=?', sl)) sl = `${sl}-${Date.now().toString(36)}`;
  const id = Number(run(`INSERT INTO condominios(nome,cep,logradouro,numero,bairro,cidade,uf,ano_construcao,lazer,administradora,lat,lon,nome_busca,slug,fontes,tipo,geo_fonte)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  nome, cep, txt(b.logradouro, 150), numero, txt(b.bairro, 80), txt(b.cidade, 80), txt(b.uf, 2), txt(b.ano_construcao, 10), txt(b.lazer, 300), txt(b.administradora, 120), num(b.lat), num(b.lon),
  G.chave(nome), sl, FONTE_CASA, /casa|sobrado|ch[áa]cara|terreno/i.test(b.tipo || '') ? 'horizontal' : 'vertical', num(b.lat) ? 'cadastro' : null).lastInsertRowid);
  require('../condominios/base').limpaCache();
  return id;
}

function salvarProprietario(p, atualId) {
  if (!p || !txt(p.nome)) return atualId || null;
  if (p.cpf && !cpfValido(p.cpf)) falha(400, 'CPF do proprietário inválido.');
  const vals = [txt(p.nome, 120), p.cpf ? fmtCpf(p.cpf) : null, txt(p.telefone, 30), txt(p.email, 120), txt(p.origem_dado, 120) || 'Informado pelo proprietário', p.nao_contatar ? 1 : 0];
  if (atualId) { run('UPDATE proprietarios SET nome=?,cpf=?,telefone=?,email=?,origem_dado=?,nao_contatar=? WHERE id=?', ...vals, atualId); return atualId; }
  return Number(run('INSERT INTO proprietarios(nome,cpf,telefone,email,origem_dado,nao_contatar) VALUES(?,?,?,?,?,?)', ...vals).lastInsertRowid);
}

function campos(b, u) {
  if (b.tipo && !TIPOS.includes(b.tipo)) falha(400, 'Tipo de imóvel inválido.');
  if (b.status && !STATUS.includes(b.status)) falha(400, 'Status inválido.');
  if (b.finalidade === 'locacao' && !num(b.valor_locacao) && b.status === 'publicado') falha(400, 'Informe o valor do aluguel.');
  const corretor = A.veTudo(u) ? (int(b.corretor_id) || u.id) : u.id;
  return {
    tipo: b.tipo, status: b.status || 'captacao', cep: endereco.soDigitos(b.cep) || null, logradouro: txt(b.logradouro, 150), numero: txt(b.numero, 20), unidade: txt(b.unidade, 40),
    bairro: txt(b.bairro, 80), cidade: txt(b.cidade, 80) || cfg.CIDADE_PADRAO, uf: txt(b.uf, 2) || cfg.UF_PADRAO, lat: num(b.lat), lon: num(b.lon),
    quartos: int(b.quartos), suites: int(b.suites), vagas: int(b.vagas), area_util: num(b.area_util), area_total: num(b.area_total),
    finalidade: FINALIDADES.includes(b.finalidade) ? b.finalidade : 'venda', valor_locacao: num(b.valor_locacao),
    valor: num(b.valor), valor_condominio: num(b.valor_condominio), iptu: num(b.iptu), descricao: txt(b.descricao, 5000),
    exclusivo: b.exclusivo ? 1 : 0, exclusivo_ate: txt(b.exclusivo_ate, 10), corretor_id: corretor,
  };
}

r.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.tipo) falha(400, 'Escolha o tipo do imóvel.');
  const c = campos(b, req.usuario);
  c.condominio_id = salvarCondominio(b);
  c.proprietario_id = salvarProprietario(b.proprietario);
  c.codigo = proximoCodigo(c.tipo);
  const cols = Object.keys(c);
  const id = Number(run(`INSERT INTO imoveis(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...cols.map((k) => c[k])).lastInsertRowid);
  audit(req.usuario.id, 'imovel_criado', c.codigo);
  let aviso = null;
  if (drive.conectado()) { try { await drive.garantePastaImovel(id); } catch (e) { aviso = 'Imóvel salvo, mas a pasta no Drive não foi criada: ' + e.message; } }
  res.json({ id, codigo: c.codigo, aviso, compradores: match.leadsParaImovel(id, 5) });
});

r.put('/:id', (req, res) => {
  const atual = imovelPermitido(req.usuario, req.params.id);
  const b = req.body || {};
  const c = campos({ tipo: atual.tipo, finalidade: atual.finalidade, ...b }, req.usuario);
  if (b.valor_locacao === undefined) c.valor_locacao = atual.valor_locacao;
  if (!A.veTudo(req.usuario)) c.corretor_id = atual.corretor_id;
  c.condominio_id = salvarCondominio(b) ?? atual.condominio_id;
  c.proprietario_id = salvarProprietario(b.proprietario, atual.proprietario_id);
  const cols = Object.keys(c);
  run(`UPDATE imoveis SET ${cols.map((k) => k + '=?').join(',')}, atualizado_em=datetime('now','localtime') WHERE id=?`, ...cols.map((k) => c[k]), atual.id);
  audit(req.usuario.id, 'imovel_alterado', atual.codigo);
  res.json({ ok: true });
});

r.patch('/:id/status', (req, res) => {
  const im = imovelPermitido(req.usuario, req.params.id);
  if (!STATUS.includes(req.body.status)) falha(400, 'Status inválido.');
  run("UPDATE imoveis SET status=?, atualizado_em=datetime('now','localtime') WHERE id=?", req.body.status, im.id);
  audit(req.usuario.id, 'imovel_status', `${im.codigo} → ${req.body.status}`);
  res.json({ ok: true });
});

r.get('/:id/compradores', (req, res) => { imovelPermitido(req.usuario, req.params.id); res.json(match.leadsParaImovel(Number(req.params.id))); });

// ---- arquivos ----
r.get('/:id/arquivos', async (req, res) => {
  const im = imovelPermitido(req.usuario, req.params.id);
  const locais = all('SELECT id,categoria,nome,mime,tamanho,drive_id,drive_link,criado_em FROM arquivos WHERE imovel_id=? ORDER BY categoria, id', im.id);
  let soNoDrive = [], avisoDrive = null;
  if (drive.conectado() && im.drive_subpastas) {
    try {
      const sub = JSON.parse(im.drive_subpastas); const conhecidos = new Set(locais.map((a) => a.drive_id).filter(Boolean));
      for (const [cat, pid] of Object.entries(sub)) {
        for (const f of await drive.listarPasta(pid)) if (!conhecidos.has(f.id)) soNoDrive.push({ categoria: cat, nome: f.name, mime: f.mimeType, tamanho: Number(f.size) || null, drive_id: f.id, drive_link: f.webViewLink, so_drive: true });
      }
    } catch (e) { avisoDrive = e.message; }
  }
  res.json({ subpastas: drive.SUBPASTAS, arquivos: [...locais, ...soNoDrive], drive: drive.status(), aviso: avisoDrive });
});

r.post('/:id/arquivos', upload.array('arquivos', 30), async (req, res) => {
  const im = imovelPermitido(req.usuario, req.params.id);
  const categoria = req.body.categoria;
  if (!drive.SUBPASTAS.includes(categoria)) falha(400, 'Escolha a pasta de destino.');
  if (!req.files || !req.files.length) falha(400, 'Nenhum arquivo enviado.');
  const avisos = [];
  for (const f of req.files) {
    const nome = Buffer.from(f.originalname, 'latin1').toString('utf8');
    const r0 = await drive.salvarArquivo({ imovelId: im.id, categoria, nome, mime: f.mimetype, buffer: f.buffer, usuarioId: req.usuario.id });
    if (r0.aviso) avisos.push(r0.aviso);
  }
  audit(req.usuario.id, 'arquivos_enviados', `${im.codigo} · ${categoria} · ${req.files.length}`);
  res.json({ ok: true, enviados: req.files.length, aviso: avisos[0] || (drive.conectado() ? null : 'Arquivos guardados no PC. Conecte o Google Drive para enviá-los à pasta do imóvel.') });
});

r.post('/:id/drive/pasta', A.exigePerfil('adm', 'gestor'), async (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  if (!drive.conectado()) falha(400, 'Conecte o Google Drive em Configurações primeiro.');
  const p = await drive.garantePastaImovel(Number(req.params.id));
  res.json({ ok: true, link: `https://drive.google.com/drive/folders/${p.pasta}` });
});

// ---- link interno (off-market) ----
r.get('/:id/links', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  res.json(all(`SELECT k.*, l.nome lead, (SELECT count(*) FROM links_acessos a WHERE a.link_id=k.id) acessos,
      (SELECT max(em) FROM links_acessos a WHERE a.link_id=k.id) ultimo_acesso FROM links_internos k LEFT JOIN leads l ON l.id=k.lead_id WHERE k.imovel_id=? ORDER BY k.id DESC`, req.params.id)
    .map((k) => ({ ...k, url: `${cfg.PUBLIC_URL || cfg.BASE_URL}/v/${k.token}` })));
});
r.post('/:id/links', (req, res) => {
  const im = imovelPermitido(req.usuario, req.params.id);
  const dias = Math.min(Math.max(int(req.body.dias) || 7, 1), 60);
  const token = A.tokenAleatorio(12);
  run(`INSERT INTO links_internos(token,imovel_id,lead_id,mostrar_endereco,expira_em,criado_por) VALUES(?,?,?,?,datetime('now','localtime','+${dias} day'),?)`,
    token, im.id, int(req.body.lead_id), req.body.mostrar_endereco ? 1 : 0, req.usuario.id);
  if (int(req.body.lead_id)) run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', int(req.body.lead_id), 'link', `Link interno do ${im.codigo} gerado (${dias} dias).`, req.usuario.id);
  res.json({ url: `${cfg.PUBLIC_URL || cfg.BASE_URL}/v/${token}`, expira_dias: dias });
});
r.delete('/:id/links/:lid', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  run("UPDATE links_internos SET expira_em=datetime('now','localtime','-1 minute') WHERE id=? AND imovel_id=?", req.params.lid, req.params.id);
  res.json({ ok: true });
});

// ---- autorização de venda ----
function textoAutorizacao(im, dono, o) {
  const end = [im.logradouro, im.numero].filter(Boolean).join(', ') + (im.unidade ? `, ${im.unidade}` : '');
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return [
    `AUTORIZAÇÃO DE VENDA ${o.exclusivo ? 'COM EXCLUSIVIDADE' : 'SEM EXCLUSIVIDADE'}`,
    '',
    `PROPRIETÁRIO(A): ${dono.nome}, CPF ${dono.cpf}${dono.telefone ? ', telefone ' + dono.telefone : ''}${dono.email ? ', e-mail ' + dono.email : ''}.`,
    `IMOBILIÁRIA: ${cfg.EMPRESA}.`,
    '',
    `IMÓVEL: ${im.tipo}${im.condominio_nome ? ' no condomínio ' + im.condominio_nome : ''}, situado em ${end}, bairro ${im.bairro || '—'}, ${im.cidade}-${im.uf}, CEP ${im.cep || '—'}${im.area_util ? ', área útil de ' + im.area_util + ' m²' : ''}${im.area_total ? ' e área total de ' + im.area_total + ' m²' : ''}${o.matricula ? ', matrícula nº ' + o.matricula : ''}. Código interno ${im.codigo}.`,
    '',
    `1. O(A) PROPRIETÁRIO(A) autoriza a IMOBILIÁRIA a promover a venda do imóvel acima pelo valor de ${brl(im.valor)}, podendo apresentar propostas em valor diferente para sua análise.`,
    `2. PRAZO: esta autorização vale por ${o.prazo_dias} dias a contar da assinatura${o.exclusivo ? ', período em que a venda será intermediada exclusivamente pela IMOBILIÁRIA, inclusive se realizada diretamente pelo(a) PROPRIETÁRIO(A) a comprador apresentado por qualquer meio' : ''}.`,
    `3. COMISSÃO: pela intermediação, o(a) PROPRIETÁRIO(A) pagará à IMOBILIÁRIA ${String(o.comissao_pct).replace('.', ',')}% sobre o valor efetivo da venda, devidos na assinatura do compromisso de compra e venda ou no recebimento do sinal, o que ocorrer primeiro. A comissão também é devida se a venda for concluída, mesmo após o prazo, com comprador apresentado pela IMOBILIÁRIA durante a vigência desta autorização.`,
    '4. DIVULGAÇÃO: fica autorizada a divulgação do imóvel no site da IMOBILIÁRIA, em portais imobiliários, redes sociais e anúncios pagos, com fotos, vídeos e descrição, sem divulgar o número da unidade.',
    '5. VISITAS: o(a) PROPRIETÁRIO(A) se compromete a facilitar as visitas agendadas pela IMOBILIÁRIA.',
    '6. DECLARAÇÕES: o(a) PROPRIETÁRIO(A) declara ser legítimo(a) titular do imóvel ou representante com poderes para esta autorização, e que as informações prestadas são verdadeiras.',
    '7. DADOS PESSOAIS: os dados pessoais informados serão tratados pela IMOBILIÁRIA somente para a execução desta intermediação e para o cumprimento de obrigações legais, nos termos da Lei 13.709/2018 (LGPD).',
    o.observacoes ? `8. OBSERVAÇÕES: ${o.observacoes}` : null,
    '',
    `${im.cidade}, ${hoje}.`,
  ].filter((l) => l !== null).join('\n');
}

r.get('/:id/autorizacoes', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  res.json(all('SELECT id,token,status,prazo_dias,comissao_pct,exclusivo,assinante_nome,assinado_em,pdf_arquivo_id,criado_em FROM assinaturas WHERE imovel_id=? ORDER BY id DESC', req.params.id)
    .map((a) => ({ ...a, url: a.status === 'pendente' ? `${cfg.PUBLIC_URL || cfg.BASE_URL}/assinar/${a.token}` : null, token: undefined })));
});

r.post('/:id/autorizacao', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  const im = one(`${SELECT} WHERE i.id=?`, req.params.id);
  const dono = im.proprietario_id && one('SELECT * FROM proprietarios WHERE id=?', im.proprietario_id);
  if (!dono || !dono.cpf) falha(400, 'Cadastre o proprietário com nome e CPF antes de gerar a autorização.');
  if (!im.valor) falha(400, 'Informe o valor de venda do imóvel.');
  const o = { prazo_dias: Math.min(Math.max(int(req.body.prazo_dias) || 180, 30), 720), comissao_pct: num(req.body.comissao_pct) || 6, exclusivo: req.body.exclusivo ? 1 : 0, matricula: txt(req.body.matricula, 40), observacoes: txt(req.body.observacoes, 800) };
  const conteudo = textoAutorizacao(im, dono, o);
  const token = A.tokenAleatorio(24);
  run("UPDATE assinaturas SET status='cancelado' WHERE imovel_id=? AND status='pendente'", im.id);
  run('INSERT INTO assinaturas(token,imovel_id,conteudo,conteudo_hash,prazo_dias,comissao_pct,exclusivo,criado_por) VALUES(?,?,?,?,?,?,?,?)',
    token, im.id, conteudo, A.sha256(conteudo), o.prazo_dias, o.comissao_pct, o.exclusivo, req.usuario.id);
  if (im.status === 'captacao') run("UPDATE imoveis SET status='aguardando_autorizacao' WHERE id=?", im.id);
  audit(req.usuario.id, 'autorizacao_gerada', im.codigo);
  res.json({ url: `${cfg.PUBLIC_URL || cfg.BASE_URL}/assinar/${token}`, conteudo, telefone: dono.telefone });
});

r.post('/:id/autorizacoes/:aid/cancelar', (req, res) => {
  imovelPermitido(req.usuario, req.params.id);
  run("UPDATE assinaturas SET status='cancelado' WHERE id=? AND imovel_id=? AND status='pendente'", req.params.aid, req.params.id);
  res.json({ ok: true });
});

module.exports = r;
module.exports.ajudantes = { proximoCodigo, salvarCondominio, TIPOS };
