# Roda o Codex na tarefa do cenÃ¡rio 3D (passagem do Claude, 29/10/2026). Log em codex-cenario.log.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
git pull -q origin main
$prompt = @"
Leia docs/tarefa-cenario-3d.md e docs/escritorio.md deste repositÃ³rio e execute os "Passos" 1 a 6 da tarefa do cenÃ¡rio 3D do EscritÃ³rio ao vivo.
As texturas PNG geradas pelo Flux estÃ£o em C:\Users\user\demo-herrera\cenario (piso-carvalho, parede-reboco, concreto, tecido-cadeira, tecido-sofa, tampo-carvalho, nogueira, marmore, tapete em 1024x1024; cidade-dia, cidade-tarde, cidade-noite em 2048x768).
Regras: nÃ£o mexa nos humanos 3D (public/plataforma/pessoas) nem na API (src/); o rascunho do cÃ³digo novo estÃ¡ em docs/wip/escritorio-3d-cenario-novo.js e substitui o bloco indicado de public/escritorio-3d.js; teste com render headless (Playwright, docs/wip/servidor-teste.cjs + shot3d.cjs, ajustando caminhos) nos trÃªs horÃ¡rios (dia, tarde, noite) antes de subir; se algo nÃ£o ficar bom, prefira manter o que jÃ¡ funciona.
FaÃ§a commits pequenos em main (git push origin main) com mensagens em portuguÃªs; a Vercel publica sozinha. Ao terminar, escreva um resumo do que foi feito e do que ficou pendente em docs/tarefa-cenario-3d.md (seÃ§Ã£o "Resultado").
"@
codex exec --approve-for-me -c sandbox_workspace_write.network_access=true -C $PSScriptRoot $prompt 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot 'codex-cenario.log')


