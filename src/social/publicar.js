// Redes e publicações · o ciclo (chamado pelo agendador do Supabase a cada 10 minutos e pela tela):
//   1. planeja o calendário (no máximo uma vez por hora);
//   2. publica o que chegou a hora, em cada rede conectada.
// Sem conta conectada (ou portal de demonstração), o post fica "pronto para postar": a tela mostra as
// artes e a legenda para baixar e copiar. Post que falha tenta de novo (até 3 vezes, a cada 15 min).
const crypto = require('crypto');
const cfg = require('../config');
const { one, all, run, getConfig, setConfig, audit } = require('../db');
const tempo = require('./tempo');
const planos = require('./planos');
const gerar = require('./gerar');
const C = require('./conteudo');
const R = require('./redes');

const MAX_POR_CICLO = 3;
const TENTATIVAS = 3;

// ------------------------------------------------------------------ endereços públicos
const base = () => String(cfg.PUBLIC_URL || cfg.LINK_ONLINE || cfg.BASE_URL || '').replace(/\/+$/, '');
const assinatura = (id, versao) => crypto.createHmac('sha256', crypto.createHash('sha256').update('herrera-arte:' + (process.env.DATABASE_URL || cfg.DATABASE_URL || cfg.SECRET_KEY)).digest()).update(`${id}:${versao}`).digest('hex').slice(0, 16);
const confereAssinatura = (id, versao, s) => { const e = assinatura(id, versao); return typeof s === 'string' && s.length === e.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e)); };
/** Endereço público da arte (a Meta e o Google buscam a imagem nele). */
const arteUrl = (post, n, formato = 'feed', completo = true) => `${completo ? base() : ''}/social/arte/${post.id}/${n}.jpg?f=${formato}&v=${post.versao}&s=${assinatura(post.id, post.versao)}`;
/** Link rastreado (conta o clique e marca a origem do cliente): /r/<id><letra da rede>. */
const LETRA = { instagram: 'i', facebook: 'f', google: 'g' };
const linkRastreado = (post, rede) => `${base()}/r/${post.id}${LETRA[rede] || ''}`;

const semTelefone = (t) => String(t || '').replace(/(\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/g, '').replace(/[ \t]+\n/g, '\n');

/** A legenda de cada rede. */
function legendas(post, legenda, tags) {
  const site = `${base().replace(/^https?:\/\//, '')}/links`;
  const ig = `${legenda}\n\nMais fotos e todos os detalhes: link na bio (${site}).\n\n${tags}`.trim().slice(0, 2150);
  const curtas = tags.split(' ').slice(0, 6).join(' ');
  const fb = `${legenda}\n\n${post.tipo === 'blog' ? 'Leia o texto completo' : post.tipo === 'revista' ? 'Leia a revista' : post.tipo === 'bairro' ? 'Veja o guia completo' : 'Veja todas as fotos e agende a visita'}: ${linkRastreado(post, 'facebook')}\n\n${curtas}`.trim();
  const google = semTelefone(legenda).replace(/#\S+/g, '').trim();
  return { instagram: ig, facebook: fb, google };
}

const resultadoDe = (p) => { try { return JSON.parse(p.resultado || '{}'); } catch { return {}; } };
const redesDe = (p) => { try { return JSON.parse(p.redes || '[]'); } catch { return []; } };
const slidesDe = (p) => { try { return JSON.parse(p.slides || '[]'); } catch { return []; } };

/**
 * Publica um post agora (o ciclo chama quando chega a hora; a tela, no "Publicar agora").
 * Devolve o post atualizado.
 */
async function publicar(post, { forcar = false } = {}) {
  // pega o post para si (outra rodada pode estar no mesmo post)
  const pegou = run(`UPDATE social_posts SET status='publicando', atualizado_em=datetime('now','localtime') WHERE id=? AND status IN ('agendado','erro','parcial','pronto_manual'${forcar ? ",'aguardando'" : ''})`, post.id);
  if (!pegou.changes) return one('SELECT * FROM social_posts WHERE id=?', post.id);
  const voltar = (status, extra = {}) => {
    run(`UPDATE social_posts SET status=?, resultado=?, motivo=?, publicado_em=coalesce(?, publicado_em), legenda=coalesce(?, legenda), hashtags=coalesce(?, hashtags), atualizado_em=datetime('now','localtime') WHERE id=?`,
      status, JSON.stringify(extra.resultado || resultadoDe(post)), extra.motivo ?? null, extra.publicado_em || null, extra.legenda || null, extra.hashtags || null, post.id);
    return one('SELECT * FROM social_posts WHERE id=?', post.id);
  };
  try {
    const v = await C.vivo(post);
    if (!v) { gerar.liberar(post, post.tipo === 'imovel' ? 'O imóvel saiu do portal (vendido, retirado ou sem foto).' : 'O conteúdo saiu do ar.'); return one('SELECT * FROM social_posts WHERE id=?', post.id); }
    const legenda = post.editado ? post.legenda : v.legenda;
    const tags = post.editado ? (post.hashtags || '') : v.hashtags;
    const n = Math.max(1, v.slides.length);
    const imagens = Array.from({ length: n }, (_, i) => arteUrl(post, i, 'feed'));
    const L = legendas(post, legenda, tags);
    const aj = planos.ajustes();
    const res = resultadoDe(post);
    const alvo = redesDe(post).filter((r) => aj.redes[r] !== false);
    const comConta = R.disponivel().demonstracao ? [] : alvo.map((r) => [r, R.contaAtiva(r)]).filter(([, c]) => c);
    if (!comConta.length) return voltar('pronto_manual', { motivo: R.disponivel().demonstracao ? 'Portal de demonstração: nada vai para as redes de verdade.' : 'Nenhuma conta conectada: baixe as artes e poste à mão.', legenda: post.editado ? null : legenda, hashtags: post.editado ? null : tags });
    for (const [rede, conta] of comConta) {
      if (res[rede] && res[rede].ok) continue;
      const tent = ((res[rede] && res[rede].tentativas) || 0) + 1;
      try {
        let r;
        if (rede === 'instagram') r = await R.publicarInstagram(conta, { imagens, legenda: L.instagram });
        else if (rede === 'facebook') r = await R.publicarFacebook(conta, { imagens, legenda: L.facebook });
        else r = await R.publicarGoogle(conta, { imagem: arteUrl(post, 0, 'google'), resumo: L.google, link: linkRastreado(post, 'google') });
        res[rede] = { ok: true, id: r.id, url: r.url, em: tempo.local(), conta: conta.nome };
        run('UPDATE social_contas SET ultimo_erro=NULL WHERE id=?', conta.id);
      } catch (e) {
        res[rede] = { ok: false, erro: e.message, em: tempo.local(), tentativas: tent };
        run('UPDATE social_contas SET ultimo_erro=? WHERE id=?', `${tempo.local()} · ${e.message}`.slice(0, 400), conta.id);
      }
    }
    const tentadas = comConta.map(([r]) => r);
    const oks = tentadas.filter((r) => res[r] && res[r].ok);
    const status = oks.length === tentadas.length ? 'publicado' : oks.length ? 'parcial' : 'erro';
    const desistiu = status !== 'publicado' && tentadas.every((r) => (res[r] && res[r].ok) || ((res[r] && res[r].tentativas) || 0) >= TENTATIVAS);
    const final = voltar(desistiu && status === 'erro' ? 'erro' : status, { resultado: res, publicado_em: oks.length ? tempo.local() : null, legenda: post.editado ? null : legenda, hashtags: post.editado ? null : tags,
      motivo: status === 'publicado' ? null : tentadas.filter((r) => !(res[r] && res[r].ok)).map((r) => `${r}: ${res[r].erro}`).join(' | ') });
    audit(null, 'social_publicacao', `#${post.id} ${post.tipo} ${post.ref || ''} → ${status} (${tentadas.map((r) => `${r} ${res[r] && res[r].ok ? 'ok' : 'erro'}`).join(', ')})`);
    return final;
  } catch (e) {
    return voltar('erro', { motivo: e.message });
  }
}

/** O ciclo inteiro. */
async function ciclo({ forcarPlano = false, agora = tempo.local() } = {}) {
  const saida = { em: agora, planejado: null, publicados: [], pausado: false };
  if (getConfig('plataforma_suspensa') === '1') return { ...saida, suspensa: true };
  const ult = getConfig('social_planejado_em');
  if (forcarPlano || !ult || tempo.instante(agora) - tempo.instante(ult) > 50 * 60e3) {
    try { saida.planejado = await gerar.planejar({ agora }); } catch (e) { saida.erroPlano = e.message; console.error('[redes] planejar', e); }
  }
  const aj = planos.ajustes();
  if (aj.pausado) return { ...saida, pausado: true };
  // passou mais de 24 h sem sair (sistema parado, conta suspensa…): não publica atrasado, fica para postar à mão
  run(`UPDATE social_posts SET status='pronto_manual', motivo='Passou do horário sem publicar (mais de 24 h).' WHERE status='agendado' AND agendado_para < ?`, tempo.local(new Date(tempo.instante(agora).getTime() - 24 * 3600e3)));
  const devidos = all(`SELECT * FROM social_posts WHERE agendado_para <= ? AND (status='agendado' OR (status IN ('erro','parcial') AND atualizado_em <= ?)) ORDER BY agendado_para LIMIT 20`,
    agora, tempo.local(new Date(tempo.instante(agora).getTime() - 15 * 60e3)).replace(/(\d{2}:\d{2})$/, '$1:00'));
  for (const p of devidos) {
    if (saida.publicados.length >= MAX_POR_CICLO) break;
    if (p.status !== 'agendado') {
      const res = resultadoDe(p);
      const faltam = redesDe(p).filter((r) => !(res[r] && res[r].ok) && ((res[r] && res[r].tentativas) || 0) < TENTATIVAS);
      if (!faltam.length) continue;
    }
    const r = await publicar(p);
    saida.publicados.push({ id: p.id, status: r && r.status });
  }
  setConfig('social_ciclo_em', agora);
  return saida;
}

module.exports = { ciclo, publicar, arteUrl, linkRastreado, legendas, confereAssinatura, base, slidesDe, redesDe, resultadoDe };
