# Estação dos PCs virtuais dos agentes: liga se não estiver rodando (a tarefa do Windows chama a cada 5 min).
# Instalar a tarefa: powershell -ExecutionPolicy Bypass -File scripts\estacao-manter.ps1 -Instalar
param([switch]$Instalar)
$pasta = Split-Path -Parent $PSScriptRoot
if ($Instalar) {
  $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  # sem gatilho "ao entrar" (pede administrador); a cada 5 min já religa depois de reiniciar o computador
  $gatilhos = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
  Register-ScheduledTask -TaskPath '\HerreraHouse\' -TaskName 'Estacao dos agentes' -Action $acao -Trigger $gatilhos -Settings $cfg -Force | Out-Null
  Write-Output 'Tarefa \HerreraHouse\Estacao dos agentes instalada.'
}
# já está rodando? (alguém ouvindo na porta da estação)
$porta = 3434
try { $c = Get-Content (Join-Path $pasta 'data\estacao.json') -Raw | ConvertFrom-Json; if ($c.porta) { $porta = $c.porta } } catch {}
if (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue) { exit 0 }
$log = Join-Path $pasta 'data\estacao.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 20MB) { Move-Item $log "$log.antigo" -Force }
Start-Process -FilePath 'node' -ArgumentList '--disable-warning=ExperimentalWarning', 'src\estacao\pc\index.js' -WorkingDirectory $pasta -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
