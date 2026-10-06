$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $base '.local\pids.json'
if (-not (Test-Path $pidFile)) { Write-Output 'Runner local ainda não iniciado.'; exit 1 }
$saved = Get-Content $pidFile -Raw | ConvertFrom-Json
$items = Get-CimInstance Win32_Process | Where-Object { @($saved.launcher,$saved.backend) -contains $_.ProcessId }
$launcher = $items | Where-Object { $_.ProcessId -eq $saved.launcher -and $_.CommandLine -like '*tools\modern\local-server.cjs*' }
$backend = $items | Where-Object { $_.ProcessId -eq $saved.backend -and $_.CommandLine -like '*tools\modern\backend-local.cjs*' }
if (-not $launcher -or -not $backend) { Write-Output 'Runner local incompleto ou PIDs desatualizados.'; exit 1 }
$web = Invoke-WebRequest -Uri 'http://127.0.0.1:3337/jogar' -Method Head -TimeoutSec 3
$game = Invoke-RestMethod -Uri 'http://127.0.0.1:8097/health' -TimeoutSec 3
if ($web.StatusCode -ne 200 -or -not $game.ok) { throw 'HTTP ou backend não está saudável.' }
Write-Output "Pronto: HTTP 3337 PID $($saved.launcher); WS 8097 PID $($saved.backend); /jogar 200, /health OK"
