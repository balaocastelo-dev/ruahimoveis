# Banco de materias do blog (plataforma Herrera HOUSE IA) - tarefa da FOTO DE CAPA (pasta \HerreraHouse\). Criado pelo Claude em 28/10/2026.
# Roda o scripts\capa_blog_banco.py, que usa o gerador do Balao (balao-content-factory\publisher\capa_blog.py) na RTX 4090.
# Horarios fora das rodadas do Balao (22h00 e 5h30): 23h10 e 3h40.
# Para desligar:  Disable-ScheduledTask -TaskPath '\HerreraHouse\' -TaskName 'Capa do banco de materias'
$ErrorActionPreference = 'Stop'
$PYW = 'C:\Users\user\AppData\Local\Programs\Python\Python313\pythonw.exe'
$WD = Join-Path $PSScriptRoot ''
$pasta = '\HerreraHouse\'
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$gatilhos = '23:10', '03:40' | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$act = New-ScheduledTaskAction -Execute $PYW -Argument 'capa_blog_banco.py' -WorkingDirectory $WD
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 150)
Register-ScheduledTask -TaskName 'Capa do banco de materias' -TaskPath $pasta -Action $act -Trigger $gatilhos -Settings $set `
    -Principal $principal -Description 'Banco de materias do blog (Herrera HOUSE IA) - foto de capa (Flux local + conferencia do Ollama), via gerador do Balao' -Force | Out-Null
Get-ScheduledTask -TaskPath $pasta -TaskName 'Capa do banco de materias' | ForEach-Object { "{0,-28} {1}  proxima: {2}" -f $_.TaskName, $_.State, (Get-ScheduledTaskInfo $_).NextRunTime }
