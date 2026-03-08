$ErrorActionPreference = 'Stop'
$log = 'C:\NxtLvl\horizon\runtime\logs\ops-start-horizon.log'
New-Item -ItemType Directory -Path (Split-Path $log -Parent) -Force | Out-Null
"[$(Get-Date -Format o)] start-horizon begin" | Out-File -FilePath $log -Append -Encoding utf8

$appRoot = 'C:\NxtLvl\horizon\console'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory $appRoot -WindowStyle Hidden

"[$(Get-Date -Format o)] start-horizon launched" | Out-File -FilePath $log -Append -Encoding utf8
exit 0
