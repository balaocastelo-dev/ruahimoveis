#!/usr/bin/env node
// Banco de DEMONSTRAÇÃO para as capturas de tela da página de vendas (corretordofuturo.app).
// Cria um SQLite NOVO com uma imobiliária fictícia ("Casa Prado Imóveis", Campinas-SP).
// Tudo aqui é inventado: pessoas, telefones (19 9xxxx-0000), e-mails @exemplo.com.br, ruas e condomínios.
// Nenhum dado de cliente real, do Fisgar ou de portais. Nunca rode apontando para o banco de produção.
//
// Uso: node scripts/demo-vitrine.js /caminho/demo.db
// Depois: CLIENTE_NOME="Casa Prado" EMPRESA="Casa Prado Imóveis" HOUSE_DB=/caminho/demo.db SECRET_KEY=... \
//         FISGUEI_ROBO=0 ESCRITORIO=0 RADAR_PORTAIS=0 IA_MODO=desligado node server.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const destino = process.argv[2];
if (!destino) { console.error('Uso: node scripts/demo-vitrine.js /caminho/demo.db'); process.exit(1); }
const abs = path.resolve(destino);
if (/ruah\.db$/i.test(abs) || abs.startsWith(path.resolve(__dirname, '..', 'data'))) {
  console.error('Recusado: escolha um arquivo fora de data/ (este script cria um banco de demonstração do zero).'); process.exit(1);
}
for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(abs + s); } catch {} }
fs.mkdirSync(path.dirname(abs), { recursive: true });

// Sempre SQLite local, nunca o banco online.
delete process.env.DATABASE_URL;
process.env.DATABASE_URL = '';
process.env.HOUSE_DB = abs;
process.env.TZ = 'America/Sao_Paulo';
process.env.CLIENTE_NOME = process.env.CLIENTE_NOME || 'Casa Prado';
process.env.EMPRESA = process.env.EMPRESA || 'Casa Prado Imóveis';
process.env.SECRET_KEY = process.env.SECRET_KEY || 'demo-' + crypto.randomBytes(32).toString('hex');

const { db, run, setConfig } = require('../src/db-sqlite');
const { hashSenha } = require('../src/auth');

// ---------- utilidades ----------
let semente = 20261028;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const pega = (l) => l[Math.floor(rnd() * l.length)];
const p2 = (n) => String(n).padStart(2, '0');
// 'AAAA-MM-DD HH:MM:SS' local, dias atrás (negativo = futuro), com hora/minuto opcionais
function quando(diasAtras, h, m) {
  const d = new Date(Date.now() - diasAtras * 864e5);
  if (h !== undefined) d.setHours(h, m || 0, 0, 0);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
const minAtras = (min) => quando(min / 1440);
const somaMin = (s, min) => { const d = new Date(s.replace(' ', 'T')); d.setMinutes(d.getMinutes() + min); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const hojeMenos = (minutos) => minAtras(minutos);
const id = (r) => Number(r.lastInsertRowid);
// telefones obviamente fictícios: 55 19 9xxxx 0000
const fone = (xxxx) => `55199${String(xxxx).padStart(4, '0')}0000`;

db.exec('BEGIN');

// ---------- equipe ----------
const SENHA_ADM = 'CasaPrado2026demo';
const usuario = (nome, email, perfil, tel, dias) => id(run('INSERT INTO usuarios(nome,email,perfil,senha_hash,telefone,criado_em) VALUES(?,?,?,?,?,?)',
  nome, email, perfil, hashSenha(perfil === 'adm' ? SENHA_ADM : 'Demo' + crypto.randomBytes(6).toString('hex')), tel, quando(dias, 9)));
const ADM = usuario('Marcelo Prado', 'marcelo@exemplo.com.br', 'adm', fone(8100), 400);
const PAT = usuario('Patrícia Nogueira', 'patricia@exemplo.com.br', 'corretor', fone(8211), 380);
const ROD = usuario('Rodrigo Sales', 'rodrigo@exemplo.com.br', 'corretor', fone(8322), 360);
const CAM = usuario('Camila Duarte', 'camila@exemplo.com.br', 'corretor', fone(8433), 300);
const FEL = usuario('Felipe Andrade', 'felipe@exemplo.com.br', 'corretor', fone(8544), 210);
const CORR = [PAT, ROD, CAM, FEL];
const NOME_U = { [ADM]: 'Marcelo Prado', [PAT]: 'Patrícia Nogueira', [ROD]: 'Rodrigo Sales', [CAM]: 'Camila Duarte', [FEL]: 'Felipe Andrade' };

// ---------- condomínios (nomes inventados) ----------
const cond = (nome, log, n, bairro, cep, ano, lazer, adm) => id(run(`INSERT INTO condominios(nome,cep,logradouro,numero,bairro,cidade,uf,ano_construcao,lazer,administradora,tipo)
  VALUES(?,?,?,?,?,'Campinas','SP',?,?,?,'residencial')`, nome, cep, log, n, bairro, ano, lazer, adm));
const C = {
  paineiras: cond('Residencial Vila das Paineiras', 'Rua das Paineiras Floridas', '410', 'Cambuí', '13025100', '2014', 'Piscina, academia, salão de festas, espaço gourmet', 'Administradora Exemplo'),
  ipes: cond('Edifício Alto dos Ipês', 'Alameda dos Ipês Amarelos', '88', 'Cambuí', '13025220', '2019', 'Piscina aquecida, academia, coworking, pet place', 'Gestão Condominial Modelo'),
  lagoa: cond('Residencial Mirante da Lagoa', 'Rua do Mirante Azul', '1200', 'Taquaral', '13076100', '2011', 'Piscina, quadra, playground, churrasqueira', 'Administradora Exemplo'),
  jequitibas: cond('Condomínio Bosque dos Jequitibás', 'Estrada dos Jequitibás', '3500', 'Sousas', '13106300', '2008', 'Clube, trilhas, quadras de tênis, lago', 'Gestão Condominial Modelo'),
  aurora: cond('Residencial Aurora Parque', 'Avenida Aurora do Parque', '777', 'Alphaville', '13098400', '2016', 'Clube, piscina, academia, segurança 24 h', 'Administradora Exemplo'),
  manaca: cond('Edifício Jardim dos Manacás', 'Rua dos Manacás', '215', 'Nova Campinas', '13092100', '2012', 'Piscina, sauna, salão de festas', 'Gestão Condominial Modelo'),
  campus: cond('Residencial Campus Verde', 'Rua do Campus Verde', '60', 'Barão Geraldo', '13084200', '2018', 'Piscina, academia, bicicletário, horta', 'Administradora Exemplo'),
  gramado: cond('Condomínio Recanto do Gramado', 'Alameda Recanto Verde', '900', 'Gramado', '13101500', '2010', 'Clube, piscina, campo de futebol, segurança 24 h', 'Gestão Condominial Modelo'),
};

// ---------- proprietários (inventados) ----------
let donoSeq = 0;
const dono = (nome, origem) => id(run('INSERT INTO proprietarios(nome,telefone,email,origem_dado,criado_em) VALUES(?,?,?,?,?)',
  nome, fone(6100 + (++donoSeq) * 13), nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.dono@exemplo.com.br', origem, quando(120 - donoSeq, 10)));
const INFORMADO = 'Informado pelo proprietário';
const FISGAR = 'Fisgar · endereço do anúncio';

// ---------- imóveis ----------
const DESC = (tipo, bairro, q, area, extra) => `${tipo} de ${area} m² no ${bairro}, com ${q} quartos e acabamento cuidado. ${extra} Planta bem distribuída, boa luz natural e fácil acesso a comércio, escolas e às principais avenidas de Campinas. Documentação em ordem, pronto para financiamento.`;
const PREF = { 'Apartamento': 'AP', 'Cobertura': 'CB', 'Casa': 'CA', 'Casa em condomínio': 'CC', 'Sobrado': 'SO', 'Sala comercial': 'SL', 'Galpão': 'GA', 'Terreno': 'TE', 'Chácara': 'CH' };
const seqCod = {};
const codigo = (tipo) => { const p = PREF[tipo] || 'IM'; seqCod[p] = (seqCod[p] || 0) + 1; return p + String(seqCod[p] + 100).padStart(4, '0'); };
// [tipo, bairro, cond, rua, n, q, s, v, area, valor, etapa, corretor, exclusivo, criadoDias, donoNome]
const IM = [
  ['Apartamento', 'Cambuí', 'paineiras', null, null, 3, 1, 2, 118, 1290000, 'publicado', PAT, 1, 64, 'Heloísa Braga'],
  ['Apartamento', 'Cambuí', 'ipes', null, null, 2, 1, 1, 74, 860000, 'publicado', PAT, 0, 52, 'Otávio Guimarães'],
  ['Cobertura', 'Cambuí', 'ipes', null, null, 4, 3, 3, 236, 3450000, 'publicado', ROD, 1, 80, 'Lúcia Fagundes'],
  ['Apartamento', 'Taquaral', 'lagoa', null, null, 3, 1, 2, 96, 780000, 'publicado', CAM, 0, 45, 'Vítor Alencar'],
  ['Casa em condomínio', 'Sousas', 'jequitibas', null, null, 4, 4, 4, 380, 2950000, 'publicado', ROD, 1, 90, 'Beatriz Lemos'],
  ['Casa em condomínio', 'Alphaville', 'aurora', null, null, 4, 3, 4, 320, 2380000, 'publicado', FEL, 1, 38, 'Gustavo Pimentel'],
  ['Apartamento', 'Nova Campinas', 'manaca', null, null, 3, 2, 2, 132, 1150000, 'publicado', CAM, 0, 70, 'Renata Siqueira'],
  ['Casa', 'Nova Campinas', null, 'Rua das Hortênsias Brancas', '145', 4, 2, 3, 290, 1890000, 'publicado', PAT, 0, 110, 'Antônio Carvalhal'],
  ['Apartamento', 'Barão Geraldo', 'campus', null, null, 2, 1, 1, 68, 520000, 'publicado', FEL, 0, 33, 'Sílvia Monteiro'],
  ['Casa em condomínio', 'Gramado', 'gramado', null, null, 3, 3, 3, 240, 1680000, 'publicado', CAM, 1, 58, 'Eduardo Tavares'],
  ['Casa em condomínio', 'Alphaville', 'aurora', null, null, 5, 5, 6, 520, 4900000, 'off_market', ROD, 1, 75, 'Marina Valadares'],
  ['Apartamento', 'Cambuí', 'paineiras', null, null, 4, 3, 3, 182, 2150000, 'off_market', PAT, 1, 26, 'Fernando Arruda'],
  ['Sala comercial', 'Cambuí', null, 'Avenida dos Comerciários', '1530', null, null, 2, 64, 640000, 'publicado', FEL, 0, 41, 'Cláudio Bastos'],
  ['Terreno', 'Sousas', null, 'Estrada do Vale Sereno', 's/n', null, null, null, 1000, 690000, 'publicado', ROD, 0, 47, 'Paulo Ramires'],
  // vendidos
  ['Apartamento', 'Taquaral', 'lagoa', null, null, 3, 1, 2, 89, 735000, 'vendido', CAM, 0, 120, 'Rosana Prates'],
  ['Casa', 'Barão Geraldo', null, 'Rua dos Pesquisadores', '320', 3, 1, 2, 210, 1120000, 'vendido', FEL, 1, 140, 'Márcio Lacerda'],
  ['Apartamento', 'Cambuí', 'ipes', null, null, 2, 2, 2, 82, 990000, 'vendido', PAT, 1, 100, 'Débora Cunha'],
  ['Casa em condomínio', 'Gramado', 'gramado', null, null, 4, 4, 4, 310, 2240000, 'vendido', ROD, 1, 150, 'Ricardo Falcão'],
  ['Apartamento', 'Nova Campinas', 'manaca', null, null, 3, 1, 2, 110, 960000, 'vendido', CAM, 0, 160, 'Tereza Antunes'],
  // autorizados (autorização assinada, publicação em preparo)
  ['Apartamento', 'Cambuí', 'paineiras', null, null, 3, 1, 2, 112, 1240000, 'autorizado', PAT, 1, 12, 'Henrique Sampaio'],
  ['Casa em condomínio', 'Sousas', 'jequitibas', null, null, 4, 2, 4, 345, 2650000, 'autorizado', ROD, 1, 18, 'Alice Matarazzo'],
  ['Apartamento', 'Barão Geraldo', 'campus', null, null, 3, 1, 2, 84, 640000, 'autorizado', FEL, 0, 9, 'Caio Rezende'],
  // dono confirmou
  ['Casa', 'Taquaral', null, 'Rua do Lago Sereno', '78', 3, 1, 2, 180, 1080000, 'confirmado', CAM, 0, 7, 'Neusa Albuquerque'],
  ['Apartamento', 'Nova Campinas', 'manaca', null, null, 2, 1, 1, 76, 720000, 'confirmado', PAT, 0, 15, 'Jorge Bittencourt'],
  ['Casa em condomínio', 'Alphaville', 'aurora', null, null, 4, 4, 4, 360, 3100000, 'confirmado', ROD, 0, 5, 'Isabela Fontes'],
  ['Chácara', 'Sousas', null, 'Estrada das Mangueiras', '2100', 4, 2, 6, 640, 1750000, 'confirmado', FEL, 0, 20, 'Wagner Peixoto'],
  // em contato
  ['Apartamento', 'Cambuí', 'ipes', null, null, 3, 2, 2, 104, 1180000, 'em_contato', PAT, 0, 11, 'Regina Pacheco'],
  ['Casa', 'Gramado', null, 'Alameda das Seringueiras', '410', 4, 3, 4, 300, 1950000, 'em_contato', CAM, 0, 14, 'Sérgio Aranha'],
  ['Apartamento', 'Taquaral', 'lagoa', null, null, 2, 1, 1, 70, 590000, 'em_contato', FEL, 0, 4, 'Mirela Assunção'],
  // dono localizado
  ['Apartamento', 'Cambuí', 'paineiras', null, null, 3, 1, 2, 120, 1320000, 'localizado', ROD, 0, 3, 'Clóvis Andrade Neto'],
  ['Casa', 'Barão Geraldo', null, 'Rua da Universidade Livre', '55', 3, 2, 3, 230, 1240000, 'localizado', FEL, 0, 2, 'Valéria Rios'],
  ['Cobertura', 'Taquaral', 'lagoa', null, null, 3, 3, 3, 190, 1560000, 'localizado', CAM, 0, 6, 'Leandro Queiroz'],
  // sem dono (cadastro iniciado pela equipe)
  ['Terreno', 'Alphaville', null, 'Alameda dos Coqueiros', 'Lote 18', null, null, null, 600, 980000, 'sem_dono', ROD, 0, 1, null],
  ['Apartamento', 'Barão Geraldo', 'campus', null, null, 2, 1, 1, 62, 480000, 'sem_dono', FEL, 0, 8, null],
];
const STATUS_DE = { publicado: 'publicado', off_market: 'off_market', vendido: 'vendido', autorizado: 'aguardando_autorizacao', confirmado: 'captacao', em_contato: 'aguardando_autorizacao', localizado: 'captacao', sem_dono: 'captacao' };
const imoveis = [];
for (const [tipo, bairro, ck, rua, num, q, s, v, area, valor, etapa, corr, excl, dias, donoNome] of IM) {
  const c = ck ? C[ck] : null;
  const condRow = c ? db.prepare('SELECT * FROM condominios WHERE id=?').get(c) : null;
  const cod = codigo(tipo);
  const donoId = donoNome ? dono(donoNome, ['localizado', 'em_contato'].includes(etapa) ? FISGAR : INFORMADO) : null;
  const status = STATUS_DE[etapa];
  const unidade = c && /Apart|Cober/.test(tipo) ? `Apto ${Math.floor(rnd() * 18 + 2)}${pega(['1', '2', '3', '4'])}` : null;
  const temDesc = ['publicado', 'off_market', 'vendido', 'autorizado'].includes(etapa) || (etapa === 'confirmado' && rnd() > 0.5);
  const descricao = temDesc ? DESC(tipo, bairro, q || 0, area, condRow ? `Condomínio ${condRow.nome} com ${String(condRow.lazer).toLowerCase()}.` : (tipo === 'Terreno' ? 'Terreno plano, rua tranquila e arborizada.' : 'Rua tranquila e arborizada, quintal amplo e garagem coberta.')) : null;
  const criado = quando(dias, 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
  const exclAte = excl ? quando(-(40 + Math.floor(rnd() * 120))).slice(0, 10) : null;
  const iid = id(run(`INSERT INTO imoveis(codigo,tipo,status,cep,logradouro,numero,unidade,bairro,cidade,uf,condominio_id,quartos,suites,vagas,area_util,area_total,valor,valor_condominio,iptu,descricao,exclusivo,exclusivo_ate,corretor_id,proprietario_id,criado_em,atualizado_em)
    VALUES(?,?,?,?,?,?,?,?,'Campinas','SP',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    cod, tipo, status, etapa === 'sem_dono' && tipo === 'Terreno' ? null : (condRow ? condRow.cep : '13' + String(Math.floor(rnd() * 900000) + 20000).padStart(6, '0')),
    condRow ? condRow.logradouro : rua, condRow ? condRow.numero : num, unidade, bairro, c, q, s, v, tipo === 'Terreno' ? null : area, tipo === 'Terreno' ? area : Math.round(area * 1.25),
    valor, c ? Math.round(area * (8 + rnd() * 6)) : null, Math.round(valor * 0.0011), descricao, excl, exclAte, corr, donoId, criado,
    etapa === 'vendido' ? criado : quando(Math.max(0, Math.min(dias, Math.floor(rnd() * 12))), 10, 30)));
  imoveis.push({ id: iid, codigo: cod, tipo, bairro, etapa, status, valor, corretor: corr, dias, cond: condRow ? condRow.nome : null, quartos: q });
}
const porEtapa = (e) => imoveis.filter((i) => i.etapa === e);
const aVenda = imoveis.filter((i) => ['publicado', 'off_market'].includes(i.status));

// ---------- autorizações de venda ----------
const assinatura = (im, status, criadoDias, assinadoDias) => run(`INSERT INTO assinaturas(token,imovel_id,conteudo,conteudo_hash,prazo_dias,comissao_pct,exclusivo,status,assinante_nome,assinado_em,criado_por,criado_em)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, crypto.randomBytes(16).toString('hex'), im.id, `Autorização de venda do imóvel ${im.codigo} (documento de demonstração).`,
  crypto.createHash('sha256').update(im.codigo).digest('hex'), 180, 6, 1, status, status === 'assinado' ? 'Proprietário (demonstração)' : null,
  assinadoDias === null ? null : quando(assinadoDias, 15, 20), im.corretor, quando(criadoDias, 11));
for (const im of [...porEtapa('publicado'), ...porEtapa('off_market')]) assinatura(im, 'assinado', im.dias - 2, Math.max(im.dias - 4, 35));
porEtapa('autorizado').forEach((im, k) => assinatura(im, 'assinado', im.dias, [6, 13, 3][k]));
porEtapa('em_contato').forEach((im, k) => { if (k < 2) assinatura(im, 'pendente', [9, 3][k], null); });

// ---------- auditoria: vendas no período e atividade recente ----------
const aud = (uid, acao, detalhe, em) => run('INSERT INTO auditoria(usuario_id,acao,detalhe,em) VALUES(?,?,?,?)', uid, acao, detalhe, em);
const vendidos = porEtapa('vendido');
[4, 11, 19, 38, 52].forEach((d, k) => aud(vendidos[k].corretor, 'imovel_status', `${vendidos[k].codigo} → vendido`, quando(d, 17, 10)));
for (const im of imoveis) aud(im.corretor, 'imovel_criado', im.codigo, quando(im.dias, 9, 5));
// atividade de hoje e ontem (aparece no painel)
const atv = [
  [PAT, 'autorizacao_gerada', porEtapa('em_contato')[1].codigo, 1, 16, 40],
  [null, 'portal_interesse', `${aVenda[3].codigo} · Larissa Monteiro`, 1, 18, 5],
  [CAM, 'imovel_alterado', porEtapa('confirmado')[0].codigo, 0, 8, 12],
  [null, 'autorizacao_assinada', `${porEtapa('autorizado')[2].codigo} · proprietário`, 0, 8, 47],
  [FEL, 'imovel_criado', porEtapa('sem_dono')[1].codigo, 0, 9, 3],
  [ROD, 'imovel_status', `${aVenda[4].codigo} → publicado`, 0, 9, 20],
  [ADM, 'radar_aprovado', 'matrícula · OP-00012', 0, 9, 34],
  [null, 'portal_interesse', `${aVenda[0].codigo} · Thaís Arantes`, 0, 9, 51],
  [PAT, 'imovel_alterado', aVenda[1].codigo, 0, 10, 2],
];
for (const [u, a, d, dd, h, m] of atv) {
  const em = quando(dd, h, m);
  if (em <= quando(0)) aud(u, a, d, em);
}

// ---------- leads ----------
// [nome, origem, etapa, temp, corretor, busca, tipo, quartos, vagas, valor_max, bairros, criadoDias, agente]
const PORTAL = 'Portal Casa Prado', BLOG = 'Blog Casa Prado';
const LEADS = [
  ['Larissa Monteiro', PORTAL, 'novo', 'quente', PAT, '3 quartos no Cambuí, perto do Centro de Convivência', 'Apartamento', 3, 2, 1400000, 'Cambuí', 0.2, 'apartamentos'],
  ['Thaís Arantes', PORTAL, 'novo', 'quente', PAT, 'Apartamento com varanda gourmet, até 1,3 mi', 'Apartamento', 3, 2, 1300000, 'Cambuí, Nova Campinas', 0.1, 'apartamentos'],
  ['Henrique Vasconcelos', 'WhatsApp', 'novo', 'morno', FEL, 'Casa em condomínio para família com pets', 'Casa em condomínio', 3, 3, 1800000, 'Alphaville, Gramado', 1, 'casas'],
  ['Natália Brandão', BLOG, 'novo', 'morno', CAM, 'Primeiro apartamento, aceita financiamento', 'Apartamento', 2, 1, 600000, 'Taquaral, Barão Geraldo', 2, 'apartamentos'],
  ['Otávio Rangel', 'Instagram', 'novo', 'frio', ROD, 'Terreno para construir', 'Terreno', null, null, 900000, 'Sousas', 3, 'terrenos'],
  ['Simone Carrara', PORTAL, 'novo', 'morno', CAM, 'Casa térrea com quintal', 'Casa', 3, 2, 1200000, 'Taquaral', 4, 'casas'],
  ['Diego Marçal', BLOG, 'novo', 'frio', null, 'Sala comercial para consultório', 'Sala comercial', null, 1, 700000, 'Cambuí', 1.5, 'comerciais'],
  ['Aline Peçanha', 'WhatsApp', 'novo', 'quente', FEL, 'Apartamento perto da Unicamp para a filha', 'Apartamento', 2, 1, 560000, 'Barão Geraldo', 0.4, 'apartamentos'],
  ['Mauro Teixeira', PORTAL, 'qualificado', 'quente', ROD, 'Cobertura com vista, alto padrão', 'Cobertura', 4, 3, 3600000, 'Cambuí', 6, 'alto-padrao'],
  ['Cristina Lobo', 'Indicação', 'qualificado', 'morno', PAT, '3 quartos com 2 vagas, prédio com lazer', 'Apartamento', 3, 2, 1250000, 'Cambuí, Nova Campinas', 9, 'apartamentos'],
  ['Rafaela Guedes', BLOG, 'qualificado', 'morno', CAM, 'Casa em condomínio fechado, até 1,8 mi', 'Casa em condomínio', 3, 2, 1800000, 'Gramado', 12, 'casas'],
  ['Leonardo Pires', PORTAL, 'qualificado', 'quente', FEL, 'Casa em condomínio, 4 suítes', 'Casa em condomínio', 4, 4, 2500000, 'Alphaville', 8, 'alto-padrao'],
  ['Juliano Freitas', 'WhatsApp', 'qualificado', 'frio', ROD, 'Chácara para fim de semana', 'Chácara', 3, 4, 1900000, 'Sousas', 20, 'casas'],
  ['Priscila Amaral', PORTAL, 'qualificado', 'morno', CAM, 'Apartamento 3 quartos no Taquaral', 'Apartamento', 3, 2, 850000, 'Taquaral', 15, 'apartamentos'],
  ['Fábio Nunes', 'Instagram', 'qualificado', 'morno', PAT, 'Apartamento compacto para investir', 'Apartamento', 2, 1, 900000, 'Cambuí', 26, 'apartamentos'],
  ['Elaine Rocha', 'Indicação', 'qualificado', 'quente', ROD, 'Casa grande em condomínio em Sousas', 'Casa em condomínio', 4, 4, 3100000, 'Sousas', 5, 'alto-padrao'],
  ['Marcos Viana', BLOG, 'qualificado', 'frio', FEL, 'Terreno em condomínio', 'Terreno', null, null, 1000000, 'Alphaville', 33, 'terrenos'],
  ['Bianca Salles', PORTAL, 'visita', 'quente', PAT, 'Apartamento 3 quartos no Cambuí', 'Apartamento', 3, 2, 1350000, 'Cambuí', 18, 'apartamentos'],
  ['Gustavo Lemes', 'WhatsApp', 'visita', 'quente', ROD, 'Casa no Jequitibás ou parecido', 'Casa em condomínio', 4, 4, 3000000, 'Sousas', 22, 'alto-padrao'],
  ['Vanessa Toledo', PORTAL, 'visita', 'morno', CAM, 'Apartamento perto da Lagoa do Taquaral', 'Apartamento', 3, 2, 820000, 'Taquaral', 25, 'apartamentos'],
  ['Roberto Galvão', 'Indicação', 'visita', 'quente', FEL, 'Casa em condomínio em Alphaville', 'Casa em condomínio', 4, 3, 2450000, 'Alphaville', 16, 'alto-padrao'],
  ['Carolina Bueno', BLOG, 'visita', 'morno', CAM, 'Casa em condomínio no Gramado', 'Casa em condomínio', 3, 3, 1750000, 'Gramado', 29, 'casas'],
  ['André Moraes', PORTAL, 'visita', 'morno', PAT, 'Apartamento 2 quartos, até 900 mil', 'Apartamento', 2, 1, 900000, 'Cambuí', 31, 'apartamentos'],
  ['Letícia Prado', 'Instagram', 'visita', 'quente', FEL, 'Apartamento perto da Unicamp', 'Apartamento', 2, 1, 560000, 'Barão Geraldo', 13, 'apartamentos'],
  ['Paulo Henrique Dias', 'WhatsApp', 'visita', 'morno', CAM, 'Apartamento 3 quartos com suíte', 'Apartamento', 3, 2, 1200000, 'Nova Campinas', 37, 'apartamentos'],
  ['Sabrina Costa', PORTAL, 'proposta', 'quente', PAT, 'Apartamento no Alto dos Ipês', 'Apartamento', 2, 1, 900000, 'Cambuí', 34, 'apartamentos'],
  ['Eduardo Brito', 'Indicação', 'proposta', 'quente', ROD, 'Cobertura no Cambuí', 'Cobertura', 4, 3, 3500000, 'Cambuí', 41, 'alto-padrao'],
  ['Mônica Ferraz', PORTAL, 'proposta', 'quente', CAM, 'Casa em condomínio no Gramado', 'Casa em condomínio', 3, 3, 1700000, 'Gramado', 27, 'casas'],
  ['Ricardo Assis', BLOG, 'proposta', 'morno', FEL, 'Sala comercial no Cambuí', 'Sala comercial', null, 2, 680000, 'Cambuí', 44, 'comerciais'],
  ['Tatiane Moura', 'WhatsApp', 'proposta', 'quente', ROD, 'Casa em condomínio em Sousas', 'Casa em condomínio', 4, 4, 3000000, 'Sousas', 30, 'alto-padrao'],
  ['Felipe Cordeiro', PORTAL, 'escritura', 'quente', CAM, 'Apartamento no Taquaral', 'Apartamento', 3, 2, 760000, 'Taquaral', 70, 'apartamentos'],
  ['Juliana Barros', 'Indicação', 'escritura', 'quente', FEL, 'Casa em Barão Geraldo', 'Casa', 3, 2, 1150000, 'Barão Geraldo', 62, 'casas'],
  ['Maurício Leal', PORTAL, 'escritura', 'quente', PAT, 'Apartamento 2 suítes no Cambuí', 'Apartamento', 2, 2, 1000000, 'Cambuí', 55, 'apartamentos'],
  ['Viviane Campos', BLOG, 'escritura', 'quente', ROD, 'Casa em condomínio no Gramado', 'Casa em condomínio', 4, 4, 2300000, 'Gramado', 80, 'alto-padrao'],
  ['Rogério Pontes', PORTAL, 'perdido', 'frio', PAT, 'Apartamento 3 quartos até 700 mil', 'Apartamento', 3, 2, 700000, 'Cambuí', 48, 'apartamentos'],
  ['Daniela Rezende', 'Instagram', 'perdido', 'frio', CAM, 'Casa térrea', 'Casa', 3, 2, 900000, 'Taquaral', 58, 'casas'],
  ['Wellington Souza', 'WhatsApp', 'perdido', 'frio', FEL, 'Terreno barato', 'Terreno', null, null, 300000, 'Barão Geraldo', 66, 'terrenos'],
  ['Kátia Mendonça', PORTAL, 'perdido', 'frio', ROD, 'Casa em condomínio', 'Casa em condomínio', 4, 3, 2000000, 'Alphaville', 74, 'casas'],
  ['Sérgio Lins', BLOG, 'perdido', 'frio', CAM, 'Apartamento para alugar', 'Apartamento', 2, 1, 400000, 'Taquaral', 39, 'apartamentos'],
  ['Cíntia Araújo', 'Indicação', 'perdido', 'frio', PAT, 'Apartamento grande no Cambuí', 'Apartamento', 4, 3, 1800000, 'Cambuí', 77, 'apartamentos'],
  // mais leads recentes e antigos para os gráficos de semana
  ['Vinícius Barreto', PORTAL, 'qualificado', 'morno', FEL, 'Casa em condomínio em Barão Geraldo', 'Casa em condomínio', 3, 2, 1300000, 'Barão Geraldo', 10, 'casas'],
  ['Lorena Cardoso', BLOG, 'novo', 'morno', PAT, 'Apartamento com 2 vagas', 'Apartamento', 3, 2, 1100000, 'Nova Campinas', 5, 'apartamentos'],
];
const leads = [];
LEADS.forEach(([nome, origem, etapa, temp, corr, busca, tipo, q, v, valor, bairros, dias, agente], k) => {
  const criado = quando(dias, 8 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
  const contato = ['escritura', 'perdido'].includes(etapa) ? quando(Math.max(0, dias - 20), 15) : quando(Math.min(dias, rnd() * 1.6), 9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60));
  const email = nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.' + nome.split(' ').slice(-1)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@exemplo.com.br';
  const lid = id(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,corretor_id,busca,tipo_desejado,quartos_min,vagas_min,valor_max,bairros,ultimo_contato,criado_em,agente)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, nome, fone(7000 + k * 17), email, origem, etapa, temp, corr, busca, tipo, q, v, valor, bairros, contato > quando(0) ? quando(0) : contato, criado, agente));
  leads.push({ id: lid, nome, etapa, temp, corr, dias, tel: fone(7000 + k * 17), tipo, agente, criado });
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id,criado_em) VALUES(?,?,?,?,?)', lid, 'sistema', origem.startsWith('Portal') ? `Veio pelo portal: interesse em imóvel no ${bairros.split(',')[0]}.` : `Lead cadastrado (origem: ${origem}).`, corr, criado);
  if (etapa !== 'novo') run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id,criado_em) VALUES(?,?,?,?,?)', lid, 'nota', pega(['Ligação feita: confirmou o perfil e a verba.', 'Prefere visitas no fim da tarde.', 'Vai vender o imóvel atual para dar entrada.', 'Aprovado no financiamento, carta de crédito em mãos.', 'Quer escola perto e lazer completo.']), corr, somaMin(criado, 90));
});
const L = (nome) => leads.find((l) => l.nome === nome);

// ---------- visitas ----------
const visita = (lead, im, dh, status, avaliacao) => run('INSERT INTO visitas(lead_id,imovel_id,corretor_id,data_hora,status,avaliacao,criado_em) VALUES(?,?,?,?,?,?,?)',
  lead.id, im.id, lead.corr || im.corretor, dh, status, avaliacao || null, somaMin(dh, -60 * 48));
const vendaveis = [...aVenda, ...porEtapa('vendido')];
const imDoLead = (l) => { const ok = vendaveis.filter((i) => i.tipo === l.tipo || (l.tipo === 'Cobertura' && i.tipo === 'Apartamento')); return ok.length ? pega(ok) : pega(aVenda); };
const AVAL = ['Gostou, quer fazer proposta', 'Gostou, vai pensar', 'Achou caro', 'Gostou, vai pensar — quer voltar com a família', 'Não gostou do imóvel'];
// realizadas e canceladas nas últimas 12 semanas (mais nas recentes)
const passadas = leads.filter((l) => ['visita', 'proposta', 'escritura', 'perdido', 'qualificado'].includes(l.etapa));
let nv = 0;
for (const l of passadas) {
  const vezes = l.etapa === 'qualificado' ? (rnd() > 0.6 ? 1 : 0) : 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < vezes; k++) {
    const d = Math.max(1, Math.min(80, Math.floor(rnd() * Math.min(l.dias, 80)) + 1));
    const st = rnd() < 0.1 ? 'cancelada' : 'realizada';
    visita(l, imDoLead(l), quando(d, pega([10, 11, 14, 15, 16, 17, 18]), pega([0, 30])), st, st === 'realizada' ? pega(AVAL) : null);
    nv++;
  }
}
// extras recentes para encorpar as semanas
for (let k = 0; k < 14; k++) { const l = pega(passadas); visita(l, imDoLead(l), quando(1 + Math.floor(rnd() * 27), pega([10, 14, 16, 17]), 0), 'realizada', pega(AVAL)); }
// período anterior (31 a 60 dias atrás), para a comparação não ficar desproporcional
for (let k = 0; k < 24; k++) { const l = pega(passadas); visita(l, imDoLead(l), quando(31 + Math.floor(rnd() * 29), pega([10, 14, 16, 17]), 0), rnd() < 0.12 ? 'cancelada' : 'realizada', pega(AVAL)); }
// próximas visitas
const futuras = [
  ['Bianca Salles', 0, 17, 30, 'confirmada'], ['Vanessa Toledo', -1, 10, 0, 'agendada'], ['Gustavo Lemes', -1, 15, 0, 'confirmada'],
  ['Roberto Galvão', -2, 11, 0, 'confirmada'], ['Letícia Prado', -2, 16, 30, 'agendada'], ['Mauro Teixeira', -3, 10, 30, 'confirmada'],
  ['Carolina Bueno', -4, 14, 0, 'agendada'], ['Elaine Rocha', -5, 9, 30, 'confirmada'], ['Leonardo Pires', -6, 11, 0, 'agendada'],
];
for (const [n, d, h, m, st] of futuras) { const l = L(n); visita(l, imDoLead(l), quando(d, h, m), st); }

// ---------- mensagens do WhatsApp (CRM) ----------
const msg = (l, direcao, texto, em, autor, status) => run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,autor,criado_em) VALUES(?,?,?,?,?,?,?)',
  l.id, l.tel, direcao, texto, status || (direcao === 'saida' ? 'lida' : direcao === 'entrada' ? 'recebida' : null), autor, em);
const CONVERSAS = [
  ['Mauro Teixeira', 2.1, [['e', 'Boa tarde! A cobertura do Alto dos Ipês ainda está disponível?'], ['s', 'Boa tarde, Mauro! Está sim. São 236 m², 4 quartos e 3 vagas. Quer que eu reserve um horário para visitar?', 6], ['e', 'Quero. Pode ser sábado de manhã?'], ['s', 'Fechado: sábado às 10h30. Te mando a localização no dia.', 9]]],
  ['Sabrina Costa', 1.4, [['e', 'Oi! Fiz as contas com o banco, consigo dar 40% de entrada.'], ['s', 'Ótimo, Sabrina! Com isso a proposta fica bem forte. Posso apresentar ao proprietário hoje?', 12], ['e', 'Pode sim, obrigada!']]],
  ['Gustavo Lemes', 3.2, [['e', 'Olá, vi a casa no Bosque dos Jequitibás no portal.'], ['s', 'Olá, Gustavo! É uma casa linda, com 4 suítes e área de lazer completa. Prefere visitar durante a semana ou no sábado?', 4], ['e', 'Durante a semana, à tarde.'], ['s', 'Marquei para amanhã às 15h. Combinado?', 7], ['e', 'Combinado!']]],
  ['Bianca Salles', 0.9, [['e', 'Oi Patrícia, posso levar meu marido na visita de hoje?'], ['s', 'Claro, Bianca! Esperamos vocês às 17h30 na portaria do Vila das Paineiras.', 5]]],
  ['Leonardo Pires', 5.5, [['e', 'Bom dia, tem casas em Alphaville com 4 suítes até 2,5 mi?'], ['s', 'Bom dia, Leonardo! Tenho uma no Aurora Parque com 320 m² por R$ 2.380.000. Te mando as informações?', 18], ['e', 'Manda sim.'], ['s', 'Enviado! Qualquer dúvida estou por aqui.', 3]]],
  ['Elaine Rocha', 4.3, [['e', 'Oi, a casa em Sousas aceita permuta?'], ['s', 'Oi, Elaine! O proprietário avalia permuta por apartamento no Cambuí. Qual imóvel você teria?', 22]]],
  ['Roberto Galvão', 6.1, [['e', 'Olá! Gostaria de agendar uma visita em Alphaville.'], ['s', 'Olá, Roberto! Tenho horários na sexta e no sábado. Qual fica melhor?', 8], ['e', 'Sexta às 11h.'], ['s', 'Agendado para sexta às 11h.', 2]]],
  ['Cristina Lobo', 8.2, [['e', 'Oi, a Patrícia me indicou vocês. Procuro 3 quartos no Cambuí.'], ['s', 'Oi, Cristina! Que bom. Separei três opções com lazer completo. Posso te enviar agora?', 14], ['e', 'Pode!']]],
  ['Priscila Amaral', 12.4, [['e', 'Boa noite, o apartamento do Mirante da Lagoa tem varanda?'], ['s', 'Boa noite, Priscila! Tem sim, varanda com churrasqueira. Quer agendar uma visita?', 25]]],
  ['Tatiane Moura', 10.2, [['e', 'Recebi a contraproposta. Podemos fechar em 2,9?'], ['s', 'Vou levar ao proprietário agora e te retorno ainda hoje, Tatiane.', 11]]],
  ['Mônica Ferraz', 7.4, [['e', 'Oi Camila! A casa do Recanto do Gramado tem energia solar?'], ['s', 'Oi, Mônica! Tem sim, placas instaladas em 2023. A conta de luz fica bem baixa.', 9]]],
  ['Vanessa Toledo', 9.2, [['e', 'Quero visitar o apartamento do Taquaral.'], ['s', 'Perfeito, Vanessa! Que tal amanhã às 10h?', 16], ['e', 'Ótimo.']]],
  ['Fábio Nunes', 18.3, [['e', 'Qual a rentabilidade média de aluguel no Cambuí?'], ['s', 'Fábio, para compactos no Cambuí fica em torno de 0,45% ao mês. Posso te mostrar duas opções?', 31]]],
  ['Rafaela Guedes', 15.1, [['e', 'Vocês têm casas no Gramado até 1,8 mi?'], ['s', 'Temos sim, Rafaela! Uma no Recanto do Gramado por R$ 1.680.000.', 19]]],
  ['Paulo Henrique Dias', 22.2, [['e', 'Bom dia, o apartamento do Jardim dos Manacás tem 2 vagas?'], ['s', 'Bom dia, Paulo! Tem sim, 2 vagas cobertas.', 13]]],
  ['Letícia Prado', 1.1, [['e', 'Oi! O apartamento do Campus Verde é perto da Unicamp?'], ['s', 'Oi, Letícia! Fica a 5 minutos de bicicleta do campus.', 7], ['e', 'Perfeito, quero visitar.'], ['s', 'Marquei para quinta às 16h30. Confirmo um dia antes!', 6]]],
  ['André Moraes', 26.2, [['e', 'Ainda tem o apartamento de 2 quartos no Cambuí?'], ['s', 'Tem sim, André! 74 m², 1 vaga, R$ 860.000.', 21]]],
  ['Carolina Bueno', 13.3, [['e', 'Oi, posso levar minha mãe na visita?'], ['s', 'Claro, Carolina! Será um prazer.', 10]]],
];
for (const [n, diasAtras, falas] of CONVERSAS) {
  const l = L(n); let t = quando(diasAtras);
  for (const [d, texto, gap] of falas) {
    if (d === 's') t = somaMin(t, gap || 10);
    msg(l, d === 'e' ? 'entrada' : 'saida', texto, t, d === 'e' ? l.nome.split(' ')[0] : NOME_U[l.corr] || 'Equipe');
    t = somaMin(t, 30 + Math.floor(rnd() * 120));
  }
  // conversa antiga termina com a resposta do corretor (ninguém esquecido há mais de um dia)
  if (falas[falas.length - 1][0] === 'e' && diasAtras > 0.8) msg(l, 'saida', 'Combinado! Qualquer novidade te aviso por aqui.', somaMin(t, 8), NOME_U[l.corr] || 'Equipe');
}
// esperando resposta agora (última mensagem é do cliente)
msg(L('Larissa Monteiro'), 'entrada', 'Oi! Vi o apartamento do Vila das Paineiras no portal. Aceita financiamento?', hojeMenos(18), 'Larissa');
msg(L('Thaís Arantes'), 'entrada', 'Boa tarde, ainda está disponível o apartamento com varanda gourmet?', hojeMenos(42), 'Thaís');
msg(L('Aline Peçanha'), 'entrada', 'Olá, tem horário para visitar no sábado?', hojeMenos(75), 'Aline');
// sugestões da IA esperando aprovação
msg(L('Larissa Monteiro'), 'sugestao', 'Oi, Larissa! Aceita sim. O apartamento tem 118 m², 3 quartos e 2 vagas, por R$ 1.290.000. Quer que eu simule o financiamento ou agende uma visita?', hojeMenos(16), 'IA Herrera HOUSE IA');
msg(L('Aline Peçanha'), 'sugestao', 'Olá, Aline! Tenho sábado às 10h ou às 14h no Campus Verde. Qual fica melhor para você?', hojeMenos(72), 'IA Herrera HOUSE IA');

// ---------- radar de captação (oportunidades fictícias) ----------
const PORTAIS = ['ZAP Imóveis', 'Viva Real', 'OLX', 'Imovelweb', 'Chaves na Mão'];
const OPS = [
  ['Apartamento 3 quartos com varanda', 'Apartamento', 'Cambuí', 3, 2, 115, 1260000, 1340000, 'particular', 'nova', null, 1],
  ['Casa térrea com piscina', 'Casa', 'Taquaral', 3, 3, 220, 1150000, null, 'particular', 'nova', null, 2],
  ['Cobertura duplex', 'Cobertura', 'Nova Campinas', 3, 3, 180, 1690000, 1790000, 'particular', 'em_contato', ROD, 5],
  ['Casa em condomínio 4 suítes', 'Casa em condomínio', 'Alphaville', 4, 4, 340, 2890000, null, 'particular', 'em_contato', FEL, 4],
  ['Apartamento perto da Unicamp', 'Apartamento', 'Barão Geraldo', 2, 1, 66, 495000, null, 'particular', 'carta_enviada', FEL, 12],
  ['Sobrado reformado', 'Sobrado', 'Taquaral', 3, 2, 190, 980000, 1050000, 'particular', 'carta_enviada', CAM, 16],
  ['Casa em condomínio com vista', 'Casa em condomínio', 'Sousas', 4, 3, 300, 2350000, null, 'particular', 'aguardando_aprovacao', ROD, 9],
  ['Apartamento alto padrão', 'Apartamento', 'Cambuí', 4, 3, 190, 2250000, null, 'particular', 'aguardando_aprovacao', PAT, 7],
  ['Apartamento 2 quartos', 'Apartamento', 'Cambuí', 2, 1, 70, 820000, null, 'imobiliaria', 'nova', null, 3],
  ['Terreno plano em condomínio', 'Terreno', 'Alphaville', null, null, 600, 990000, null, 'particular', 'captada', ROD, 28],
  ['Apartamento 3 quartos com suíte', 'Apartamento', 'Taquaral', 3, 2, 70, 590000, 640000, 'particular', 'captada', FEL, 21],
  ['Casa em condomínio fechado', 'Casa em condomínio', 'Gramado', 4, 4, 300, 1950000, null, 'particular', 'captada', CAM, 35],
  ['Casa ampla com edícula', 'Casa', 'Barão Geraldo', 3, 3, 230, 1240000, null, 'particular', 'em_contato', FEL, 6],
  ['Apartamento vista para a Lagoa', 'Apartamento', 'Taquaral', 3, 2, 98, 760000, 790000, 'particular', 'nova', null, 0.3],
  ['Sala comercial mobiliada', 'Sala comercial', 'Cambuí', null, 2, 58, 560000, null, 'imobiliaria', 'descartada', null, 40],
  ['Chácara com pomar', 'Chácara', 'Sousas', 3, 6, 700, 1600000, null, 'particular', 'descartada', ROD, 55],
  ['Apartamento garden', 'Apartamento', 'Nova Campinas', 3, 2, 140, 1350000, null, 'particular', 'nova', null, 1.4],
  ['Casa em condomínio nova', 'Casa em condomínio', 'Alphaville', 3, 3, 250, 1980000, 2100000, 'particular', 'em_contato', ROD, 11],
  ['Studio mobiliado', 'Apartamento', 'Cambuí', 1, 1, 38, 430000, null, 'imobiliaria', 'descartada', null, 63],
  ['Casa térrea', 'Casa', 'Gramado', 3, 2, 170, 890000, null, 'particular', 'carta_enviada', CAM, 24],
  ['Apartamento 4 quartos', 'Apartamento', 'Cambuí', 4, 3, 175, 1980000, null, 'particular', 'nova', null, 47],
  ['Casa em condomínio', 'Casa em condomínio', 'Gramado', 3, 3, 230, 1590000, null, 'particular', 'carta_enviada', CAM, 69],
];
const ops = [];
OPS.forEach(([titulo, tipo, bairro, q, v, area, valor, ant, anun, status, corr, dias], k) => {
  const criado = quando(dias, 7 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
  const captado = status === 'captada' ? porEtapa(['autorizado', 'confirmado', 'em_contato'][k % 3])[k % 2] : null;
  const oid = id(run(`INSERT INTO oportunidades(portal,link,titulo,tipo,bairro,logradouro,cidade,quartos,vagas,area,valor,valor_anterior,anunciante_tipo,anunciante_nome,telefone_anuncio,publicado_em,status,corretor_id,carta_enviada_em,imovel_id,criado_por,criado_em,atualizado_em,motivo_descarte)
    VALUES(?,?,?,?,?,?,'Campinas',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, PORTAIS[k % PORTAIS.length], null, titulo, tipo, bairro, `Rua Exemplo ${['das Flores', 'do Bosque', 'da Colina', 'do Lago', 'das Palmeiras'][k % 5]}`, q, v, area, valor, ant, anun,
    anun === 'imobiliaria' ? 'Imobiliária Modelo' : 'Anunciante particular', fone(5100 + k * 11), criado.slice(0, 10), status, corr,
    ['carta_enviada', 'aguardando_aprovacao', 'captada'].includes(status) ? quando(Math.max(0, dias - 3), 14) : null, captado ? captado.id : null, ADM, criado,
    status === 'nova' ? criado : quando(Math.max(0, dias - 4), 16), status === 'descartada' ? 'Anunciado por imobiliária' : null));
  ops.push({ id: oid, status, dias });
  run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto,custo,autor_id,em) VALUES(?,?,?,?,?,?)', oid, 'nova', 'Encontrada automaticamente nos alertas', 0, null, criado);
  if (['carta_enviada', 'aguardando_aprovacao', 'captada'].includes(status)) run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto,custo,autor_id,em) VALUES(?,?,?,?,?,?)', oid, 'matricula', 'Matrícula consultada', 42, corr, quando(Math.max(0, dias - 2), 11));
  if (status === 'captada') run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto,custo,autor_id,em) VALUES(?,?,?,?,?,?)', oid, 'biro', 'Contato do titular localizado', 18, corr, quando(Math.max(0, dias - 3), 15));
});
for (const o of ops.filter((x) => x.status === 'aguardando_aprovacao')) run(`INSERT INTO aprovacoes(oportunidade_id,tipo,custo_estimado,justificativa,status,solicitado_por,criado_em) VALUES(?,?,?,?,?,?,?)`,
  o.id, 'matricula', 42, 'Particular, preço abaixo da média do prédio. Vale localizar o titular.', 'pendente', PAT, quando(1, 15));
run(`INSERT INTO aprovacoes(oportunidade_id,tipo,custo_estimado,justificativa,status,solicitado_por,decidido_por,decidido_em,criado_em) VALUES(?,?,?,?,?,?,?,?,?)`,
  ops[9].id, 'matricula', 42, 'Terreno de particular em condomínio fechado.', 'aprovada', ROD, ADM, quando(0, 9, 34), quando(1, 10));

// ---------- links internos e acessos ----------
for (const [k, im] of aVenda.slice(0, 8).entries()) {
  const lid = id(run('INSERT INTO links_internos(token,imovel_id,lead_id,expira_em,criado_por,criado_em) VALUES(?,?,?,?,?,?)', crypto.randomBytes(12).toString('hex'), im.id, leads[k + 8].id, quando(-7 + k), im.corretor, quando(10 - k)));
  for (let a = 0; a < 2 + (k % 4); a++) run('INSERT INTO links_acessos(link_id,ip,user_agent,em) VALUES(?,?,?,?)', lid, '0.0.0.0', 'demo', quando(Math.max(0, 9 - k - a * 0.7)));
}

// ---------- escritório virtual (agentes) ----------
const futuro = new Date(Date.now() + 365 * 864e5).toISOString(); // a tela considera "no ar" quem deu sinal nos últimos minutos
setConfig('escritorio_status', JSON.stringify({ em: futuro, ia: true, modelo: 'qwen3:14b', pausado: false }));
setConfig('escritorio', JSON.stringify({ ligado: true, dono_nome: 'Marcelo Prado', dono_telefone: fone(8100) }));
setConfig('fisguei_robo', JSON.stringify({ estado: 'conectado', numero: fone(9010), em: futuro }));
const LINHAS = { apartamentos: 9021, comerciais: 9032, terrenos: null, casas: 9054, 'alto-padrao': 9065, offmarket: 9076, gerente: 9087, 'gerente-corretores': 9098 };
for (const [slug, n] of Object.entries(LINHAS)) setConfig('agente_wa:' + slug, JSON.stringify(n ? { estado: 'conectado', numero: fone(n), em: futuro } : { estado: 'parada', em: futuro }));
setConfig('agente:terrenos', JSON.stringify({ linha: 'comerciais' })); // Teo usa a linha do Bruno

const am = (agente, tel, nome, direcao, texto, min, status, leadId) => run(`INSERT INTO agente_mensagens(agente,linha,telefone,nome,direcao,texto,status,lead_id,autor,processada,criado_em,enviado_em)
  VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`, agente, agente, tel, nome, direcao, texto, status, leadId || null, direcao === 'saida' ? agente : nome, hojeMenos(min), direcao === 'saida' && status === 'enviada' ? hojeMenos(min - 1) : null);
const AGCONV = {
  apartamentos: [['Larissa Monteiro', 'Oi! Vi o apartamento do Vila das Paineiras. Aceita financiamento?', 'Oi, Larissa! Aceita sim. Quer que eu simule as parcelas?'], ['Natália Brandão', 'Tem algo até 600 mil no Taquaral?', 'Tenho sim, Natália! Separei duas opções com 2 quartos.'], ['Aline Peçanha', 'Tem horário sábado?', null], ['Bianca Salles', 'Posso levar meu marido hoje?', 'Claro! Esperamos vocês às 17h30.'], ['Priscila Amaral', 'O Mirante da Lagoa tem varanda?', 'Tem sim, com churrasqueira.'], ['Cliente do portal', 'Qual o valor do condomínio do Alto dos Ipês?', 'Fica em torno de R$ 980 por mês, com IPTU à parte.']],
  casas: [['Henrique Vasconcelos', 'Procuro casa em condomínio que aceite pets.', 'Henrique, os dois condomínios que tenho aceitam pets. Quer ver fotos?'], ['Simone Carrara', 'Tem casa térrea no Taquaral?', null], ['Rafaela Guedes', 'A casa do Gramado tem quintal?', 'Tem sim, quintal gramado e piscina.']],
  'alto-padrao': [['Mauro Teixeira', 'A cobertura ainda está disponível?', 'Está sim, Mauro! Visita marcada para sábado às 10h30.'], ['Elaine Rocha', 'A casa de Sousas aceita permuta?', 'O proprietário avalia permuta por apartamento no Cambuí.'], ['Leonardo Pires', 'Tem 4 suítes em Alphaville até 2,5 mi?', null], ['Gustavo Lemes', 'Confirmado amanhã às 15h?', 'Confirmado, Gustavo! Até amanhã.']],
  comerciais: [['Diego Marçal', 'Tem sala para consultório no Cambuí?', 'Tenho uma de 64 m² com 2 vagas. Quer visitar?'], ['Ricardo Assis', 'O proprietário respondeu a proposta?', 'Ainda não, Ricardo. Te aviso assim que ele responder.']],
  terrenos: [['Otávio Rangel', 'Terreno em Sousas, qual o tamanho?', 'São 1.000 m², plano, por R$ 690.000.']],
  offmarket: [['Investidor indicado', 'Tenho interesse em imóveis exclusivos acima de 4 mi.', 'Posso enviar um link privado com uma opção em Alphaville. Pode ser?']],
};
let mm = 600;
for (const [ag, convs] of Object.entries(AGCONV)) {
  convs.forEach(([nome, pergunta, resposta], k) => {
    const l = leads.find((x) => x.nome === nome);
    const tel = l ? l.tel : fone(4000 + k * 7 + ag.length * 31);
    mm -= 17 + Math.floor(rnd() * 20);
    am(ag, tel, nome, 'entrada', pergunta, Math.max(mm, 5), 'recebida', l && l.id);
    if (resposta) am(ag, tel, nome, 'saida', resposta, Math.max(mm - 3, 2), 'enviada', l && l.id);
  });
}
// respostas sugeridas esperando aprovação (modo "sugerir")
const PARA_APROVAR = [
  ['apartamentos', 'Aline Peçanha', 'Olá, Aline! Tenho sábado às 10h ou às 14h no Campus Verde. Qual fica melhor para você?', 70],
  ['casas', 'Simone Carrara', 'Oi, Simone! Tenho uma casa térrea no Taquaral com 3 quartos e quintal, por R$ 1.080.000. Quer agendar uma visita esta semana?', 48],
  ['alto-padrao', 'Leonardo Pires', 'Leonardo, tenho a casa do Aurora Parque: 320 m², 4 quartos sendo 3 suítes, por R$ 2.380.000. Posso te mandar o link com as informações?', 25],
  ['apartamentos', 'Larissa Monteiro', 'Oi, Larissa! Aceita financiamento sim. Com 30% de entrada, a parcela fica perto de R$ 8.900. Quer agendar uma visita?', 12],
];
for (const [ag, nome, texto, min] of PARA_APROVAR) { const l = leads.find((x) => x.nome === nome); am(ag, l.tel, nome, 'saida', texto, min, 'aprovar', l.id); }
// conversas do captador com donos (fictícios)
am('captador', fone(3011), 'Neusa (proprietária)', 'entrada', 'Sim, sou a proprietária. Pode me ligar à tarde.', 210, 'recebida');
am('captador', fone(3011), 'Neusa (proprietária)', 'saida', 'Obrigado, Neusa! A Camila vai te ligar às 15h. Se puder, mande as fotos originais do imóvel por aqui.', 205, 'enviada');
am('captador', fone(3022), 'Proprietário', 'entrada', 'Tenho interesse em vender, sim.', 95, 'recebida');
am('captador', fone(3022), 'Proprietário', 'saida', 'Ótimo! Qual o melhor horário para um corretor falar com o senhor?', 92, 'enviada');
am('gerente', fone(8100), 'Marcelo Prado', 'saida', 'Bom dia, Marcelo! Ontem: 6 leads novos, 4 visitas realizadas e 1 autorização assinada. Hoje: 3 visitas na agenda.', 150, 'enviada');
am('gerente-corretores', fone(8211), 'Patrícia Nogueira', 'saida', 'Patrícia, visita hoje às 17h30 com Bianca Salles no Vila das Paineiras.', 140, 'enviada');
am('gerente-corretores', fone(8322), 'Rodrigo Sales', 'saida', 'Rodrigo, a Elaine Rocha perguntou sobre permuta. Ligue para ela hoje.', 120, 'enviada');

const ev = (agente, tipo, texto, min) => run('INSERT INTO agente_eventos(agente,tipo,texto,criado_em) VALUES(?,?,?,?)', agente, tipo, texto, hojeMenos(min));
const EVENTOS = [
  ['gerente', 'manha', 'Resumo da manhã enviado ao dono', 150],
  ['gerente-corretores', 'agenda', 'Agenda do dia enviada a 4 corretores', 145],
  ['captador', 'captacao', 'Dona de casa no Taquaral confirmou interesse em vender', 205],
  ['alto-padrao', 'visita', 'Visita marcada: Mauro Teixeira na cobertura do Alto dos Ipês (sábado 10h30)', 130],
  ['apartamentos', 'respondeu', 'Respondeu Natália Brandão sobre apartamentos até 600 mil', 118],
  ['casas', 'respondeu', 'Enviou opções de casas que aceitam pets para Henrique Vasconcelos', 104],
  ['gerente-corretores', 'chamou_corretor', 'Chamou Rodrigo Sales para ligar para Elaine Rocha (permuta)', 120],
  ['comerciais', 'respondeu', 'Respondeu Diego Marçal sobre sala para consultório', 96],
  ['captador', 'captacao', 'Proprietário de apartamento no Cambuí aceitou conversar', 92],
  ['apartamentos', 'visita', 'Visita confirmada: Bianca Salles hoje às 17h30', 80],
  ['alto-padrao', 'transferiu', 'Passou Leonardo Pires para Felipe Andrade', 60],
  ['gerente-corretores', 'lembrete', 'Lembrou Camila Duarte da visita de amanhã às 10h', 45],
  ['casas', 'respondeu', 'Preparou resposta para Simone Carrara (esperando aprovação)', 48],
  ['apartamentos', 'respondeu', 'Preparou resposta para Larissa Monteiro (esperando aprovação)', 12],
  ['offmarket', 'respondeu', 'Ofereceu link privado a investidor indicado', 30],
  ['gerente', 'alerta', 'Avisou o dono: proposta de R$ 2,9 mi em casa de Sousas', 22],
];
for (const e of EVENTOS) ev(...e);
const AFAZ = [
  [PAT, 'Ligar para Larissa Monteiro e simular financiamento', -0.2], [ROD, 'Levar contraproposta de Tatiane Moura ao proprietário', -0.3],
  [CAM, 'Fotografar a casa do Taquaral (dono confirmou)', -1], [FEL, 'Enviar autorização de venda para o apartamento do Campus Verde', -1],
  [ROD, 'Responder Elaine Rocha sobre permuta', -0.1], [PAT, 'Confirmar visita de sábado com Mauro Teixeira', -2],
];
for (const [c, t, d] of AFAZ) run('INSERT INTO agente_afazeres(corretor_id,texto,quando,origem,criado_em) VALUES(?,?,?,?,?)', c, t, quando(d, 18).slice(0, 16), 'Marta', hojeMenos(200));

db.exec('COMMIT');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

const n = (t) => db.prepare(`SELECT count(*) n FROM ${t}`).get().n;
console.log(`Banco de demonstração criado em ${abs}`);
console.log(`  usuários ${n('usuarios')} · imóveis ${n('imoveis')} · leads ${n('leads')} · visitas ${n('visitas')} · mensagens ${n('mensagens')} · oportunidades ${n('oportunidades')} · agentes: ${n('agente_mensagens')} mensagens, ${n('agente_eventos')} eventos`);
console.log(`  login: marcelo@exemplo.com.br  senha: ${SENHA_ADM}`);
