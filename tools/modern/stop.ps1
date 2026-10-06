$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $base '.local\pids.json'
if (-not (Test-Path $pidFile)) { Write-Output 'Nenhum runner local registrado.'; exit }
$saved = Get-Content $pidFile -Raw | ConvertFrom-Json
$items = Get-CimInstance Win32_Process | Where-Object { @($saved.launcher,$saved.backend) -contains $_.ProcessId }
foreach ($item in $items) {
    if ($item.ProcessId -eq $saved.launcher -and $item.CommandLine -notlike '*tools\modern\local-server.cjs*') { throw 'Launcher PID reutilizado; não encerrar.' }
    if ($item.ProcessId -eq $saved.backend -and $item.CommandLine -notlike '*tools\modern\backend-local.cjs*') { throw 'Backend PID reutilizado; não encerrar.' }
}
foreach ($item in $items) { Stop-Process -Id $item.ProcessId -ErrorAction Stop }
Write-Output 'Runner local encerrado. Saves e logs preservados em tools/modern/.local.'
