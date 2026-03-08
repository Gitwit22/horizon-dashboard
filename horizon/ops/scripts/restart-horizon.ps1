$ErrorActionPreference = 'Stop'
$log = 'C:\NxtLvl\horizon\runtime\logs\ops-restart-horizon.log'
New-Item -ItemType Directory -Path (Split-Path $log -Parent) -Force | Out-Null
"[$(Get-Date -Format o)] restart-horizon begin" | Out-File -FilePath $log -Append -Encoding utf8

Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$appRoot = 'C:\NxtLvl\horizon\console'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory $appRoot -WindowStyle Hidden

"[$(Get-Date -Format o)] restart-horizon launched" | Out-File -FilePath $log -Append -Encoding utf8
exit 0
