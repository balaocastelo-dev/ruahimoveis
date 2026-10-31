# Fila de tarefas para o Codex (passagem do Claude). Espera o limite de uso voltar e tenta de novo sozinha.
# Logs: codex-<tarefa>.log. Cada tarefa termina com commit + push em main (a Vercel publica sozinha).
# 29/10/2026: as tarefas 'chat' e 'interativo' (lugares clicaveis) ja foram entregues - sairam da fila.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$tarefas = @(
  @{ nome = 'melhorias'; prompt = 'Leia docs/tarefa-melhorias-escritorio.md e implemente os 7 itens na ordem. ATENCAO: o painel embutido dos lugares JA EXISTE em public/escritorio-3d.js (abreLugar/painelLugar, classes .j3p-*, iframe /app.html?embutido=1#/rota) e o modo andar JA EXISTE em public/escritorio-andar.js; reaproveite e nao mude o que ja funciona. Falta ligar os mesmos cliques no modo 2D (public/escritorio-jogo.js). Siga as regras do arquivo: nenhuma biblioteca nova, npm test antes de subir, render headless nos tres horarios. Commits pequenos em main, mensagens em portugues, resumo na secao Resultado do proprio arquivo.' },
  @{ nome = 'chatfim'; prompt = 'A etapa 1 do chat (docs/tarefa-chat.md) foi implementada mas faltaram duas coisas: test/chat.js (no estilo dos outros testes, cobrindo conversa direta, sala, nao lidas, long polling, permissao negada a quem nao participa e resposta de robo) e docs/chat.md (tabelas, API, fluxo do robo, como aplicar sql/chat.sql em cada schema). Faca as duas, adicione o teste ao npm test, rode npm test e suba com commit e push em main, mensagens em portugues. Nao altere o comportamento ja implementado; so corrija o que o teste revelar de errado.' },
  @{ nome = 'cerebro'; prompt = 'Leia docs/tarefa-cerebro-plataforma.md e implemente a tela Cerebro no painel do gestor da plataforma (src/plataforma/gestor.js): chave central, modelo e consumo por imobiliaria a partir de plataforma.ia_uso. Use a funcao plataforma.definir_ia_central para gravar a chave; ela nunca pode voltar para o navegador, so os 4 ultimos digitos. Rode npm test antes de subir, commit e push em main, mensagens em portugues, resumo na secao Resultado do proprio arquivo.' }
)
foreach ($t in $tarefas) {
  $feito = $false
  for ($tentativa = 1; $tentativa -le 10 -and -not $feito; $tentativa++) {
    git stash -q -u 2>$null
    git pull -q origin main
    "=== $(Get-Date -Format 'HH:mm') tentativa $tentativa de $($t.nome)" | Tee-Object -FilePath "codex-$($t.nome).log" -Append
    $saida = codex exec --approve-for-me -c sandbox_workspace_write.network_access=true -C $PSScriptRoot $t.prompt 2>&1
    $saida | Tee-Object -FilePath "codex-$($t.nome).log" -Append | Out-Null
    if ($saida -match 'hit your usage limit|usage limit') {
      "=== $(Get-Date -Format 'HH:mm') limite do Codex: esperando 35 min" | Tee-Object -FilePath "codex-$($t.nome).log" -Append
      Start-Sleep -Seconds 2100
    } else { $feito = $true }
  }
  git add -A
  git reset -q -- codex-chat.log codex-interativo.log codex-melhorias.log codex-chatfim.log codex-cerebro.log codex-cenario.log codex-fila.ps1 codex-tarefa.ps1 codex-interativo-descartado.patch codex-interativo-teste-descartado.cjs claude data 2>$null
  git -c user.name="Thiago Herrera" -c user.email="balaocastelo@gmail.com" commit -q -m "Codex: $($t.nome) (fechamento automatico da tarefa)" 2>$null
  git push -q origin main 2>&1 | Out-String | Out-Null
  "=== $(Get-Date -Format 'HH:mm') terminou: $($t.nome)" | Tee-Object -FilePath "codex-$($t.nome).log" -Append
}
"=== $(Get-Date -Format 'HH:mm') FILA COMPLETA" | Tee-Object -FilePath "codex-fila.log" -Append
