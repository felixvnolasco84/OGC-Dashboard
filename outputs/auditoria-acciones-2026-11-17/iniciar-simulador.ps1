$ErrorActionPreference = 'Stop'
$auditDirectory = $PSScriptRoot
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$serverScript = Join-Path $auditDirectory 'servir.mjs'
Start-Process -FilePath $nodeCommand -ArgumentList @('"' + $serverScript + '"') -WorkingDirectory $auditDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $auditDirectory 'servidor.out.log') -RedirectStandardError (Join-Path $auditDirectory 'servidor.err.log')
Start-Process 'http://127.0.0.1:5183/'
