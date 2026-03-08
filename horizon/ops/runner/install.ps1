param(
  [string]$ServiceName = 'horizon-ops-runner',
  [string]$NssmPath = 'C:\\tools\\nssm\\nssm.exe',
  [string]$NodeExe = 'C:\\Program Files\\nodejs\\node.exe',
  [string]$RunnerScript = 'C:\\NxtLvl\\horizon\\ops\\runner\\ops-runner.js',
  [string]$ConfigPath = 'C:\\NxtLvl\\horizon\\ops\\runner\\config.json',
  [string]$AppDirectory = 'C:\\NxtLvl\\horizon'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $NssmPath)) {
  throw "NSSM not found at $NssmPath"
}

& $NssmPath install $ServiceName $NodeExe "$RunnerScript $ConfigPath"
& $NssmPath set $ServiceName AppDirectory $AppDirectory
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout "C:\\NxtLvl\\horizon\\runtime\\logs\\ops-runner-service.out.log"
& $NssmPath set $ServiceName AppStderr "C:\\NxtLvl\\horizon\\runtime\\logs\\ops-runner-service.err.log"

Write-Host "Installed service $ServiceName"
Write-Host "Set env var OPS_SECRET at the machine/user scope before starting the service."
