$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "infra\livekit\livekit.yaml"
$runtimeConfigPath = Join-Path $repoRoot "infra\livekit\livekit.runtime.yaml"

if (-not (Test-Path $configPath)) {
  Write-Error "LiveKit config not found at $configPath"
}

$command = Get-Command livekit-server -ErrorAction SilentlyContinue
if (-not $command) {
  Write-Host "LiveKit server binary was not found in PATH." -ForegroundColor Yellow
  Write-Host "Install livekit-server on Windows, then run this script again." -ForegroundColor Yellow
  Write-Host "Expected command: livekit-server --config `"$configPath`"" -ForegroundColor Cyan
  exit 1
}

function Get-DefaultRouteIPv4 {
  $routeOutput = route print -4
  $candidates = @()

  foreach ($line in $routeOutput) {
    if ($line -match '^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(?<gateway>\S+)\s+(?<interface>\S+)\s+(?<metric>\d+)\s*$') {
      $interfaceIp = $matches["interface"]
      if ($interfaceIp -notlike "127.*" -and $interfaceIp -notlike "169.254.*") {
        $candidates += [pscustomobject]@{
          InterfaceIp = $interfaceIp
          Metric = [int]$matches["metric"]
        }
      }
    }
  }

  return $candidates |
    Sort-Object Metric |
    Select-Object -First 1 -ExpandProperty InterfaceIp
}

$hostIp = Get-DefaultRouteIPv4

if (-not $hostIp) {
  $hostIp = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object {
      $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
      $_.IPAddressToString -notlike "127.*"
    } |
    Select-Object -First 1 -ExpandProperty IPAddressToString
}

if (-not $hostIp) {
  Write-Error "Could not determine a reachable IPv4 address for this machine."
}

$content = Get-Content $configPath -Raw
$runtimeContent = $content -replace 'node_ip:\s*"[^"]+"', "node_ip: `"$hostIp`""
Set-Content -Path $runtimeConfigPath -Value $runtimeContent -Encoding UTF8

Write-Host "Starting LiveKit with node IP: $hostIp" -ForegroundColor Green
Write-Host "Runtime config: $runtimeConfigPath" -ForegroundColor Cyan
& $command.Source --config $runtimeConfigPath
