$ErrorActionPreference = 'Stop'
$log = 'C:\NxtLvl\horizon\runtime\logs\ops-reconnect-gateway.log'
New-Item -ItemType Directory -Path (Split-Path $log -Parent) -Force | Out-Null
"[$(Get-Date -Format o)] reconnect-gateway begin" | Out-File -FilePath $log -Append -Encoding utf8

# Example: restart known gateway process or service
Get-Process -Name 'horizon-gateway' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$gatewayRoot = 'C:\NxtLvl\horizon\gateway'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run start' -WorkingDirectory $gatewayRoot -WindowStyle Hidden

"[$(Get-Date -Format o)] reconnect-gateway launched" | Out-File -FilePath $log -Append -Encoding utf8
exit 0
