$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$deps = Join-Path $base '.local-deps'
$local = Join-Path $base '.local'
New-Item -ItemType Directory -Force -Path $local | Out-Null
if (-not (Test-Path (Join-Path $deps 'node_modules\ws'))) {
    npm install --prefix $deps --no-save --no-package-lock --no-audit --no-fund ws@8.18.0
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar a dependência local ws.' }
}
$ports = 3337, 8097
$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }
if ($busy) { throw "Porta local ocupada: $($busy.LocalPort -join ', '). Verifique tools/modern/.local/pids.json antes de reiniciar." }
$entry = Join-Path $base 'local-server.cjs'
$proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('"' + $entry + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $local 'launcher.log') -RedirectStandardError (Join-Path $local 'launcher-error.log')
Start-Sleep -Seconds 2
if ($proc.HasExited) { throw "Runner encerrou. Consulte $local\launcher-error.log e backend.log." }
Write-Output "Jogo: http://127.0.0.1:3337/jogar?ws=ws://127.0.0.1:8097"
Write-Output 'Conta local: TesteVal18 / Valadares18!'
Write-Output "Processo: $($proc.Id) | Dados e logs: $local"
