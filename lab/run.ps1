param(
  [ValidateSet('Build','Up','Probe','Stop','Status')][string]$Action = 'Status',
  [string]$DockerPath = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot
$upstreamRoot = Join-Path (Split-Path $repoRoot) 'dispatchseo-lab-upstream'
if (-not $DockerPath) {
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if ($dockerCommand) { $DockerPath = $dockerCommand.Source }
  else { $DockerPath = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
}
if (-not (Test-Path -LiteralPath $DockerPath)) { throw 'Docker executable not found; pass -DockerPath.' }
$expectedCommit = 'fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26'
if ($Action -in @('Build','Up','Probe')) {
  $actualCommit = & git -C $upstreamRoot rev-parse HEAD
  if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $expectedCommit) { throw 'Upstream checkout does not match the evaluated commit.' }
  $upstreamChanges = & git -C $upstreamRoot status --porcelain
  if ($upstreamChanges) { throw 'Upstream checkout must be clean.' }
}
$envPath = Join-Path $repoRoot '.env.lab'
if (-not (Test-Path -LiteralPath $envPath)) {
  if ($Action -notin @('Build','Up')) { throw 'Missing .env.lab; run Build first.' }
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rows = foreach ($key in @('LAB_DB_PASSWORD','LAB_CRON_SECRET','LAB_DASHBOARD_PASSWORD')) {
      $bytes = New-Object byte[] 32
      $rng.GetBytes($bytes)
      $key + '=' + ([BitConverter]::ToString($bytes).Replace('-','').ToLower())
    }
    [System.IO.File]::WriteAllLines($envPath, $rows)
  } finally { $rng.Dispose() }
}
$composeArgs = @('compose','--env-file',$envPath,'-f',(Join-Path $PSScriptRoot 'compose.yaml'))
switch ($Action) {
  'Build' { & $DockerPath @composeArgs build app }
  'Up' { & $DockerPath @composeArgs up -d --no-build }
  'Stop' { & $DockerPath @composeArgs stop }
  'Status' { & $DockerPath @composeArgs ps -a }
  'Probe' {
    $result = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'probe.mjs') | & $DockerPath @composeArgs exec -T app node --input-type=module
    $probeExit = $LASTEXITCODE
    $parsed = ($result -join "`n") | ConvertFrom-Json
    $resultPath = Join-Path $repoRoot 'docs/spikes/dispatchseo-lab-results.json'
    [System.IO.File]::WriteAllText($resultPath, ($result -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
    $parsed.tests | Select-Object id,status,label | Format-Table -AutoSize
    if ($parsed.fatal -or $probeExit -ne 0) { throw 'Laboratory probe failed; inspect the sanitized result file.' }
    return
  }
}
if ($LASTEXITCODE -ne 0) { throw "Docker action $Action failed." }
