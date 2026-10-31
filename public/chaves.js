// Chaves de API em Sistema › Configurações (#/configuracoes). Só o perfil adm vê a seção.
// A chave completa aparece uma única vez, no modal, e não volta na lista.
const ESCOPOS_CHAVE = [
  ['imoveis', 'Imóveis', 'Carteira, arquivos, autorizações e links'],
  ['crm', 'CRM', 'Leads, visitas, WhatsApp e chat'],
  ['captacao', 'Captação', 'Radar, Fisguei e vitrines da base'],
  ['condominios', 'Condomínios', 'Base de condomínios, prédios e 3D'],
  ['conteudo', 'Conteúdo', 'Portal, blog, bairros e redes'],
  ['escritorio', 'Escritório', 'Agentes, PCs virtuais e estação'],
  ['painel', 'Painel', 'Painéis, números e rotas de IA'],
  ['config', 'Configurações', 'Usuários, integrações e chaves'],
  ['sql', 'Consulta ao banco', 'Leitura do banco desta imobiliária'],
  ['plataforma', 'Plataforma', 'Painel do gestor da plataforma'],
];
const ROTULO_ESCOPO = Object.fromEntries(ESCOPOS_CHAVE);

function quandoChave(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function situacaoChave(c) {
  if (!c.ativo) return ['Revogada', 'bad'];
  if (c.expira_em && new Date(String(c.expira_em).replace(' ', 'T')) < new Date()) return ['Vencida', 'warn'];
  return ['Ativa', 'ok'];
}
function textoEscopos(s) {
  if (!s || s === '*') return 'todos';
  return String(s).split(',').map((e) => ROTULO_ESCOPO[e.trim()] || e.trim()).filter(Boolean).join(', ');
}

function secaoChavesApi(chaves, gestorPlataforma) {
  const caixas = ESCOPOS_CHAVE.filter(([id]) => id !== 'plataforma' || gestorPlataforma);
  const lista = chaves.length ? `<div class="tbl chaves-tbl" style="margin-top:10px"><table><thead><tr>
      <th>Nome</th><th>Situação</th><th>Prefixo</th><th>Escopos</th><th>Só leitura</th><th>Limite/min</th><th>IPs</th><th>Validade</th><th>Último uso</th><th><span class="vis-oculto">Ações</span></th>
    </tr></thead><tbody>${chaves.map((c) => {
      const [sit, cor] = situacaoChave(c);
      const nome = esc(c.nome || '');
      return `<tr><td>${nome}</td><td><span class="pill ${cor}">${sit}</span></td><td class="mono">hh_${esc(c.prefixo)}_…</td><td class="small">${esc(textoEscopos(c.escopos))}</td>
        <td>${c.somente_leitura ? 'sim' : 'não'}</td><td class="num">${esc(c.limite_min)}</td>
        <td class="small mono">${c.ips ? esc(c.ips) : 'qualquer'}</td>
        <td class="small">${c.expira_em ? esc(quandoChave(c.expira_em)) : 'sem prazo'}</td>
        <td class="small">${c.ultimo_uso ? esc(quandoChave(c.ultimo_uso)) : 'nunca'}</td>
        <td style="white-space:nowrap"><button type="button" class="btn sm" data-act="log-chave" data-id="${c.id}" data-nome="${nome}">Chamadas</button>${c.ativo ? ` <button type="button" class="btn sm danger" data-act="revogar-chave" data-id="${c.id}" data-nome="${nome}">Revogar</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty" style="margin-top:10px">Nenhuma chave criada.</div>';
  return `<div class="card" id="chaves-api" style="margin-top:16px"><h2>Chaves de API</h2>
    <p class="small">Chaves para robôs e IAs entrarem no sistema sem a tela. Cada uma empresta o acesso de quem a criou e só diminui o que essa pessoa já pode fazer. A chave completa aparece uma única vez, na criação.</p>
    ${lista}
    <h3 style="margin-top:18px">Nova chave</h3>
    <form data-form="chave-criar" class="grid" style="gap:12px" autocomplete="off">
      <label class="f">Nome<input name="nome" required maxlength="80" placeholder="Ex.: Robô do Instagram"></label>
      <fieldset><legend>Escopos</legend>
        <div class="chaves-escopos">${caixas.map(([id, rotulo, dica]) => `<label class="chk" title="${esc(dica)}"><input type="checkbox" name="escopo" value="${esc(id)}"> ${esc(rotulo)}</label>`).join('')}</div>
        <p class="muted small" style="margin:8px 0 0">Nenhuma marcada: a chave recebe todas as partes que você pode conceder.</p>
      </fieldset>
      <label class="chk"><input type="checkbox" name="somente_leitura"> Somente leitura (bloqueia criar, alterar e apagar)</label>
      <div class="grid g2">
        <label class="f">Limite por minuto<input name="limite_min" type="number" inputmode="numeric" min="10" max="3000" step="1" value="60" required></label>
        <label class="f">Validade (dias)<input name="dias" type="number" inputmode="numeric" min="1" max="3650" step="1" value="90" required></label>
      </div>
      <label class="f">Endereços de IP (opcional)<input name="ips" maxlength="300" placeholder="Opcional, separados por vírgula. Em branco, vale de qualquer IP."></label>
      <div><button class="btn pri" type="submit">Criar chave</button></div>
    </form></div>`;
}

FORM['chave-criar'] = async (f) => {
  const nome = f.nome.value.trim();
  if (!nome) throw new Error('Dê um nome para reconhecer a chave.');
  const limite = Number(f.limite_min.value);
  const dias = Number(f.dias.value);
  if (!Number.isInteger(limite) || limite < 10 || limite > 3000) throw new Error('O limite por minuto fica entre 10 e 3.000.');
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) throw new Error('A validade fica entre 1 e 3.650 dias.');
  const marcados = [...f.querySelectorAll('input[name=escopo]:checked')].map((c) => c.value);
  const todos = [...f.querySelectorAll('input[name=escopo]')].map((c) => c.value);
  const ips = f.ips.value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const r = await api('POST', '/api/chaves', {
    nome, escopos: marcados.length ? marcados : todos, somente_leitura: f.somente_leitura.checked, limite_min: limite, dias, ips,
  });
  if (!r || !r.chave) throw new Error('A chave não veio na resposta.');
  modal(`<h2>Chave criada</h2>
    <p>A chave <b>${esc(nome)}</b> (<span class="mono">hh_${esc(r.prefixo)}_…</span>) está pronta. Copie agora e guarde em local seguro.</p>
    <div class="copybox"><input class="inp mono" readonly spellcheck="false" aria-label="Chave de API" value="${esc(r.chave)}"><button type="button" class="btn pri" data-act="copiar" data-txt="${esc(r.chave)}">Copiar</button></div>
    <p class="banner warn">Guarde agora. Esta chave não aparece de novo. Se perder, revogue e crie outra.</p>
    <div class="row"><span class="sp"></span><button type="button" class="btn" data-fecha>Fechar</button></div>`, { segura: true });
  const campo = $('#modal input'); if (campo) campo.select();
  await rota();
};

ACT['revogar-chave'] = (el) => {
  const nome = el.dataset.nome || 'esta chave';
  if (!confirm(`Revogar a chave "${nome}"? Ela para de funcionar na hora.`)) return;
  comBotao(el, async () => { await api('DELETE', `/api/chaves/${el.dataset.id}`); toast('Chave revogada'); rota(); });
};

ACT['log-chave'] = (el) => comBotao(el, async () => {
  const linhas = await api('GET', `/api/chaves/log?chave_id=${encodeURIComponent(el.dataset.id)}&limite=100`);
  const corpo = linhas.length ? `<div class="tbl" style="max-height:360px;overflow:auto"><table><thead><tr>
      <th>Quando</th><th>Método</th><th>Caminho</th><th>Status</th><th>Tempo</th><th>IP</th>
    </tr></thead><tbody>${linhas.map((l) => {
      const cor = l.status >= 500 ? 'bad' : l.status >= 400 ? 'warn' : 'ok';
      return `<tr><td class="mono">${esc(quandoChave(l.em))}</td><td class="mono">${esc(l.metodo)}</td>
        <td class="small">${esc(l.caminho)}${l.acao ? `<br><span class="muted">${esc(l.acao)}</span>` : ''}${l.erro ? `<br><span class="muted">${esc(l.erro)}</span>` : ''}</td>
        <td><span class="pill ${cor}">${esc(l.status)}</span></td><td class="num">${esc(l.ms)} ms</td><td class="mono small">${esc(l.ip || '')}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma chamada registrada para esta chave.</div>';
  modal(`<h2>Chamadas · ${esc(el.dataset.nome || '')}</h2>${corpo}<div class="row" style="margin-top:12px"><span class="sp"></span><button type="button" class="btn" data-fecha>Fechar</button></div>`);
});
