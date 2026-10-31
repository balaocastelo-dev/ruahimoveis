#!/usr/bin/env node
/**
 * Banco de matérias do blog (plataforma Herrera HOUSE IA) · a ÚNICA porta de entrada de uma matéria no banco.
 *
 *   node scripts/banco-materias.mjs preparar               estoque, consumo, quanto escrever e temas já usados
 *   node scripts/banco-materias.mjs conferir materia.json  confere sem gravar
 *   node scripts/banco-materias.mjs adicionar materia.json grava no ramo e pede a capa ao PC
 *   node scripts/banco-materias.mjs listar                 tudo o que está no ramo (e a situação)
 *   node scripts/banco-materias.mjs pendentes              capas que o PC ainda vai fazer
 *   node scripts/banco-materias.mjs capa <slug> foto.jpg [--alt "…"]   (PC) prende a foto: matéria "pronta"
 *   node scripts/banco-materias.mjs retirar <slug>         tira do ramo (só se ainda não foi entregue)
 *
 * Como funciona:
 *   - Quem escreve (rotina do Claude) usa {{cliente}} onde entraria o nome da imobiliária. Na entrega,
 *     o banco troca pelo nome de quem recebe. Nome de imobiliária escrito por extenso é recusado.
 *   - Cada matéria tem um "tema" (o assunto em poucas palavras). Tema repetido ou título parecido com
 *     outro do banco é recusado: assim nenhuma imobiliária recebe dois textos sobre a mesma coisa.
 *   - Links internos: só /blog e /blog/categoria/<categoria> (cada imobiliária tem outros textos).
 *   - A capa é pedida em "capa": { "alt", "pedido" } e feita no PC da RTX 4090 (scripts/capa_blog_banco.py).
 *     Só matéria com capa fica "pronta"; o painel da plataforma traz as prontas para o banco e a entrega
 *     diária distribui (sql/plataforma-banco-materias.sql). Uma matéria vai para UMA imobiliária só.
 *
 * Grava no ramo plataforma/banco-materias deste repositório (main não é tocado). Precisa do Node 22+ e do git.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
process.env.CLIENTE_NOME = process.env.CLIENTE_NOME || 'Imobiliária Modelo';
const { conferirMateria, normTema } = require('../src/plataforma/banco.js');
const { minutosDeLeitura, semAcento } = require('../src/blog/texto.js');
const { RAMO_DO_BANCO: RAMO, ENDERECO_DO_BANCO } = require('../src/blog/categorias.js');

const SITUACAO_URL = process.env.BANCO_SITUACAO_URL || 'https://corretordofuturo.app/banco-materias/situacao.json';
const NOMES_CONHECIDOS = ['Onde morar', 'ONDEMORAR', 'Cadê meu AP', 'Casa Prado', 'Lumen', 'Herrera HOUSE'];
const META_DIAS = 14;          // estoque que a rotina procura manter
const POR_RODADA = 3;          // o máximo que uma rodada escreve

function git(args, opcoes = {}) {
  return execFileSync('git', args, { cwd: opcoes.cwd ?? RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
class Saida extends Error {}
function sair(mensagem) { throw new Saida(mensagem); }

// ----------------------------------------------------------------- o ramo
function abrirRamo() {
  try { git(['fetch', '--quiet', 'origin', `+refs/heads/${RAMO}:refs/remotes/origin/${RAMO}`]); } catch (erro) {
    sair(`Não consegui buscar o ramo ${RAMO}: ${String(erro.stderr || erro.message).trim()}`);
  }
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'banco-materias-'));
  git(['worktree', 'add', '--quiet', '--detach', pasta, `origin/${RAMO}`]);
  return pasta;
}
function fecharRamo(pasta) {
  try { git(['worktree', 'remove', '--force', pasta]); } catch { fs.rmSync(pasta, { recursive: true, force: true }); }
}
function lerIndice(pasta) {
  const arq = path.join(pasta, 'indice.json');
  if (!fs.existsSync(arq)) return { versao: 1, materias: [] };
  const i = JSON.parse(fs.readFileSync(arq, 'utf8'));
  return { versao: 1, materias: Array.isArray(i.materias) ? i.materias : [] };
}
function gravarIndice(pasta, indice) {
  indice.materias.sort((a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm));
  indice.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(pasta, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);
}
function lerPendentes(pasta) {
  const arq = path.join(pasta, 'capas', 'pendentes.json');
  if (!fs.existsSync(arq)) return [];
  try { const l = JSON.parse(fs.readFileSync(arq, 'utf8')); return Array.isArray(l.pendentes) ? l.pendentes : []; } catch { return []; }
}
function gravarPendentes(pasta, pendentes) {
  fs.mkdirSync(path.join(pasta, 'capas'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'capas', 'pendentes.json'), `${JSON.stringify({ versao: 1, pendentes }, null, 2)}\n`);
}
function enviar(pasta, mensagem) {
  git(['add', '-A'], { cwd: pasta });
  const id = [];
  try { git(['config', 'user.email'], { cwd: pasta }); } catch { id.push('-c', 'user.name=Banco de matérias', '-c', 'user.email=balaocastelo@gmail.com'); }
  const rodape = process.env.BLOG_RODAPE_DO_COMMIT ? `\n\n${process.env.BLOG_RODAPE_DO_COMMIT}` : '';
  git([...id, 'commit', '--quiet', '-m', `${mensagem}${rodape}`], { cwd: pasta });
  for (let t = 1; ; t += 1) {
    try { git(['push', '--quiet', 'origin', `HEAD:refs/heads/${RAMO}`], { cwd: pasta }); return; } catch (erro) {
      if (t >= 3) sair(`O envio ao GitHub falhou. Nada foi gravado.\n${String(erro.stderr || erro.message).trim()}`);
      try {
        git(['fetch', '--quiet', 'origin', `+refs/heads/${RAMO}:refs/remotes/origin/${RAMO}`], { cwd: pasta });
        git(['rebase', '--quiet', `origin/${RAMO}`], { cwd: pasta });
      } catch (e2) { sair(`O envio falhou e não deu para juntar com o que chegou antes.\n${String(e2.stderr || e2.message).trim()}`); }
    }
  }
}

// ------------------------------------------------------------ conferências
const palavras = (t) => new Set(semAcento(String(t || '')).toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length > 3));
function parecido(a, b) {
  const x = palavras(a), y = palavras(b);
  if (!x.size || !y.size) return false;
  const comuns = [...x].filter((p) => y.has(p)).length;
  return comuns >= 3 && comuns / Math.min(x.size, y.size) >= 0.7;
}

async function situacaoOnline() {
  try {
    const r = await fetch(SITUACAO_URL, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.json();
  } catch { /* sem rede: segue só com o ramo */ }
  return null;
}

function lerArquivo(arquivo) {
  if (!arquivo || !fs.existsSync(arquivo)) sair(`Arquivo não encontrado: ${arquivo ?? '(nenhum)'}`);
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { sair(`O arquivo não é um JSON válido: ${e.message}`); }
}

function conferir(bruto, indice, online) {
  const erros = [];
  const capa = bruto && bruto.capa;
  let pedidoCapa = null;
  if (!capa || typeof capa !== 'object') erros.push('Falta "capa": { "alt": "o que a foto mostra", "pedido": "a cena em inglês" }.');
  else {
    const alt = String(capa.alt || '').trim(), pedido = String(capa.pedido || '').replace(/\s+/g, ' ').trim();
    if (alt.length < 12) erros.push('A capa precisa dizer o que a foto mostra ("alt").');
    if (pedido.length < 60 || pedido.length > 900) erros.push(`O pedido da foto ("pedido", em inglês) precisa ter de 60 a 900 caracteres; tem ${pedido.length}.`);
    if (/https?:|www\./i.test(pedido)) erros.push('O pedido da foto não leva endereço de site.');
    if (/\b(person|people|woman|man|girl|boy|family|couple|child|realtor|agent)\b/i.test(pedido)) erros.push('O pedido da foto não leva pessoas.');
    pedidoCapa = { alt, pedido };
  }
  // Para a régua: capa provisória no endereço do banco (a de verdade chega do PC).
  const prova = JSON.parse(JSON.stringify(bruto || {}));
  if (prova.capa) prova.capa = { src: `${ENDERECO_DO_BANCO}/capas/${prova.slug}-00000000.jpg`, alt: String(capa.alt || ''), largura: 1600, altura: 900 };
  const c = conferirMateria(prova);
  erros.push(...c.erros);

  const texto = JSON.stringify(bruto);
  const nomes = new Set([...NOMES_CONHECIDOS, ...((online && online.nomes) || [])]);
  for (const n of nomes) {
    const limpo = semAcento(n).replace(/[^a-z0-9 ]/gi, ' ').trim();
    if (limpo.length >= 3 && new RegExp(`(?<![\\p{L}\\d])${limpo.replace(/\s+/g, '\\s*\\W*\\s*')}(?![\\p{L}\\d])`, 'iu').test(semAcento(texto))) {
      erros.push(`O texto cita "${n}" pelo nome: use {{cliente}} (o banco troca pelo nome de quem recebe).`);
    }
  }
  if (!/\{\{cliente\}\}/.test(texto)) erros.push('Use {{cliente}} ao menos uma vez (no fim do texto ou numa chamada), no lugar do nome da imobiliária.');

  const tema = normTema(bruto && bruto.tema);
  const usados = [...indice.materias.map((m) => ({ tema: m.tema, titulo: m.titulo, slug: m.slug })), ...((online && online.temas) || [])];
  for (const u of usados) {
    if (!u || u.slug === bruto.slug) continue;
    if (u.tema && normTema(u.tema) === tema) erros.push(`O tema "${tema}" já existe no banco ("${u.titulo}"). Escolha outro assunto.`);
    else if (u.titulo && parecido(u.titulo, bruto.titulo)) erros.push(`O título repete o assunto de "${u.titulo}". Escolha outro tema.`);
    else if (u.tema && parecido(u.tema, tema) && palavras(tema).size >= 3) erros.push(`O tema "${tema}" é quase o mesmo de "${u.tema}". Escolha outro assunto.`);
  }
  if (indice.materias.some((m) => m.slug === bruto.slug)) erros.push(`Já existe matéria com o endereço ${bruto.slug}.`);
  return { erros: [...new Set(erros)], artigo: c.artigo, tipo: c.tipo, tema, pedidoCapa };
}

// --------------------------------------------------------------- capa (PC)
function medirImagem(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { extensao: 'png', largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const mk = bytes[i + 1];
      if (mk === 0xff) { i += 1; continue; }
      const tam = bytes.readUInt16BE(i + 2);
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { extensao: 'jpg', largura: bytes.readUInt16BE(i + 7), altura: bytes.readUInt16BE(i + 5) };
      i += 2 + tam;
    }
  }
  return null;
}

// ---------------------------------------------------------------- comandos
const [comando, alvo, ...resto] = process.argv.slice(2);
const args = [alvo, ...resto].filter((a) => typeof a === 'string');
function opcao(nome) { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; }

const TIPO = { principal: 'artigo', noticia: 'notícia', dica: 'dica' };

async function principal() {
if (comando === 'preparar') {
  const online = await situacaoOnline();
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const esperando = indice.materias.filter((m) => m.situacao === 'esperando-capa').length;
    console.log('BANCO DE MATÉRIAS');
    if (online) {
      const l = online.livres || {};
      console.log(`Estoque no banco (prontas, ainda não entregues): ${online.total_livres} · artigos ${l.principal || 0} · notícias ${l.noticia || 0} · dicas ${l.dica || 0}`);
      console.log(`Consumo: ${online.consumo_dia} por dia (imobiliárias ativas, pelo plano) · estoque para ${online.dias_de_estoque ?? '—'} dia(s)`);
    } else console.log('(não consegui ler o estoque online; seguindo só com o ramo)');
    console.log(`Esperando a capa do PC: ${esperando}`);
    const consumo = online ? Number(online.consumo_dia) || 0 : 7;
    const estoque = (online ? Number(online.total_livres) || 0 : 0) + esperando;
    const falta = Math.max(0, consumo * META_DIAS - estoque);
    const escrever = Math.min(POR_RODADA, falta);
    console.log(`\nMeta: ${META_DIAS} dias de estoque (${consumo * META_DIAS} matérias). Faltam ${falta}. ESCREVER NESTA RODADA: ${escrever}.`);
    if (online && online.livres) {
      const l = online.livres;
      const menor = ['principal', 'noticia', 'dica'].sort((a, b) => (l[a] || 0) - (l[b] || 0))[0];
      console.log(`Tipo com menos estoque: ${TIPO[menor]} (prefira esse).`);
    }
    const temas = [...indice.materias.map((m) => `${m.tema} — ${m.titulo}`), ...((online && online.temas) || []).map((t) => `${t.tema} — ${t.titulo}`)];
    const unicos = [...new Set(temas)];
    console.log(`\nTemas já usados (${unicos.length}) — NÃO repetir assunto:`);
    for (const t of unicos) console.log(`- ${t}`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'conferir' || comando === 'adicionar') {
  const bruto = lerArquivo(alvo);
  const online = await situacaoOnline();
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const r = conferir(bruto, indice, online);
    if (r.artigo) console.log(`\n${r.artigo.titulo}\n${TIPO[r.tipo]} · ${r.artigo.categoria} · tema "${r.tema}" · ${minutosDeLeitura(r.artigo)} min`);
    if (r.erros.length) sair(`Reprovada:\n- ${r.erros.join('\n- ')}`);
    if (comando === 'conferir') { console.log('\n✓ Passou. Para gravar: adicionar.'); return; }
    const agora = new Date().toISOString();
    const guardar = { ...bruto, tema: r.tema, capa: { alt: r.pedidoCapa.alt } };
    delete guardar.publicadoEm;
    fs.mkdirSync(path.join(pasta, 'materias'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'materias', `${bruto.slug}.json`), `${JSON.stringify(guardar, null, 2)}\n`);
    indice.materias.push({ slug: bruto.slug, titulo: bruto.titulo, tema: r.tema, tipo: r.tipo, categoria: bruto.categoria, criadaEm: agora, situacao: 'esperando-capa' });
    gravarIndice(pasta, indice);
    const pend = lerPendentes(pasta).filter((p) => p.slug !== bruto.slug);
    pend.push({ slug: bruto.slug, alt: r.pedidoCapa.alt, pedido: r.pedidoCapa.pedido, categoria: bruto.categoria, pedidoEm: agora });
    gravarPendentes(pasta, pend);
    enviar(pasta, `Banco de matérias: ${bruto.titulo}`);
    console.log(`\n✓ Gravada no banco (${TIPO[r.tipo]}). A capa sai no PC da RTX 4090; depois disso ela fica pronta para entrega.`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'listar' || comando === 'pendentes') {
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    if (comando === 'pendentes') { for (const p of lerPendentes(pasta)) console.log(`- ${p.slug}: ${p.pedido}`); }
    else for (const m of indice.materias) console.log(`- ${m.criadaEm.slice(0, 10)} · ${TIPO[m.tipo] || m.tipo} · ${m.situacao} · ${m.titulo} (${m.slug})`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'capa') {
  const slug = alvo, arquivo = resto[0];
  if (!slug || !arquivo || !fs.existsSync(arquivo)) sair('Use: capa <slug> foto.jpg [--alt "…"]');
  const bytes = fs.readFileSync(arquivo);
  const medida = medirImagem(bytes);
  if (!medida) sair('A foto precisa ser JPEG ou PNG.');
  if (bytes.length > 900 * 1024) sair(`A foto tem ${Math.round(bytes.length / 1024)} KB; o máximo é 900 KB.`);
  if (medida.largura < 1200) sair(`A foto tem ${medida.largura} px de largura; o mínimo é 1200.`);
  const prop = medida.largura / medida.altura;
  if (prop < 1.5 || prop > 2) sair('A foto precisa ser deitada, perto de 16:9.');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const item = indice.materias.find((m) => m.slug === slug);
    if (!item) sair(`Não há matéria ${slug} no banco.`);
    const arqMat = path.join(pasta, 'materias', `${slug}.json`);
    const mat = JSON.parse(fs.readFileSync(arqMat, 'utf8'));
    if (mat.capa && mat.capa.src) { console.log('já tem foto de capa'); return; }
    const marca = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
    const nome = `${slug}-${marca}.${medida.extensao}`;
    fs.mkdirSync(path.join(pasta, 'capas'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'capas', nome), bytes);
    mat.capa = { src: `${ENDERECO_DO_BANCO}/capas/${nome}`, alt: opcao('--alt') || mat.capa?.alt || '', largura: medida.largura, altura: medida.altura };
    fs.writeFileSync(arqMat, `${JSON.stringify(mat, null, 2)}\n`);
    item.situacao = 'pronta';
    gravarIndice(pasta, indice);
    gravarPendentes(pasta, lerPendentes(pasta).filter((p) => p.slug !== slug));
    enviar(pasta, `Banco de matérias: capa de ${slug}`);
    console.log(`✓ Capa presa: ${slug} está pronta para entrega.`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'retirar') {
  const online = await situacaoOnline();
  if (online && (online.temas || []).some((t) => t.slug === alvo)) sair('Essa matéria já entrou no banco online; peça a retirada pelo painel do gestor.');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    if (!indice.materias.some((m) => m.slug === alvo)) sair(`Não há matéria ${alvo} no ramo.`);
    indice.materias = indice.materias.filter((m) => m.slug !== alvo);
    gravarIndice(pasta, indice);
    gravarPendentes(pasta, lerPendentes(pasta).filter((p) => p.slug !== alvo));
    fs.rmSync(path.join(pasta, 'materias', `${alvo}.json`), { force: true });
    for (const n of fs.existsSync(path.join(pasta, 'capas')) ? fs.readdirSync(path.join(pasta, 'capas')) : []) if (n.startsWith(`${alvo}-`)) fs.rmSync(path.join(pasta, 'capas', n));
    enviar(pasta, `Banco de matérias: retirada ${alvo}`);
    console.log(`✓ ${alvo} saiu do banco.`);
  } finally { fecharRamo(pasta); }
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 9).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
}
}

try { await principal(); } catch (erro) {
  if (!(erro instanceof Saida)) throw erro;
  console.error(`\n✗ ${erro.message}`);
  process.exitCode = 1;
}
