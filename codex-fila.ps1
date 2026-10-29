# Fila de tarefas para o Codex (passagem do Claude, 29/10/2026): chat ao vivo (etapa 1) e lugares clicáveis no 3D.
# Cada tarefa roda num `codex exec` próprio; o log fica em codex-<tarefa>.log. Depois de cada uma, o Codex já dá push em main.
$ErrorActionPreference = 'Continue'
Set-Location C:\Users\user\ruahimoveis
$tarefas = @(
  @{ nome = 'chat'; prompt = 'Leia docs/tarefa-chat.md e os arquivos que ele indica neste repositório e implemente a etapa 1 completa (banco SQLite + sql/chat.sql, API em src/routes/chat.js, tela public/chat.js com #/chat, sininho e toasts no shell, robôs como contatos respondendo pelo cérebro existente, test/chat.js, docs/chat.md). Não mexa na API do escritório além de reaproveitar funções; não mexa no 3D além do balão. Rode npm test antes de subir. Ao terminar, faça commit e git push origin main (mensagens em português) e escreva um resumo em docs/tarefa-chat.md, seção "Resultado".' },
  @{ nome = 'interativo'; prompt = 'Leia docs/tarefa-escritorio-interativo.md e os arquivos citados e implemente tudo (mural, TV da diretoria e placa do salão clicáveis no escritório 3D, abrindo radar, painel e CRM num painel embutido; mesmo no modo 2D). Não mude a aparência do escritório 3D além do destaque de hover. Rode npm test antes de subir. Ao terminar, faça commit e git push origin main (mensagens em português) e escreva um resumo em docs/tarefa-escritorio-interativo.md, seção "Resultado".' }
)
foreach ($t in $tarefas) {
  git pull -q origin main
  "=== $(Get-Date -Format 'HH:mm') começando: $($t.nome)" | Tee-Object -FilePath "codex-$($t.nome).log" -Append
  codex exec --approve-for-me -c sandbox_workspace_write.network_access=true -C C:\Users\user\ruahimoveis $t.prompt 2>&1 | Tee-Object -FilePath "codex-$($t.nome).log" -Append
  # garante que nada ficou sem subir (o Codex às vezes termina o turno antes do commit)
  git add -A; git reset -q -- claude codex-chat.log codex-interativo.log codex-cenario.log 2>$null
  git -c user.name="Thiago Herrera" -c user.email="balaocastelo@gmail.com" commit -q -m "Codex: $($t.nome) (fechamento automático da tarefa)" 2>$null
  git push -q origin main 2>&1 | Out-String
  "=== $(Get-Date -Format 'HH:mm') terminou: $($t.nome)" | Tee-Object -FilePath "codex-$($t.nome).log" -Append
}
