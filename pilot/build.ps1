$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$upstream = Join-Path (Split-Path $repo) 'dispatchseo-lab-upstream'
$docker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
if ((& git -C $upstream rev-parse HEAD) -ne 'fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26') { throw 'Unexpected upstream version' }
if (& git -C $upstream status --porcelain) { throw 'Upstream must remain clean' }
New-Item -ItemType Directory -Force (Join-Path $repo '.local') | Out-Null
# Preserve upstream's Dockerfile and license; inject only our manual endpoint.
$recipe = (Get-Content -Raw (Join-Path $upstream 'Dockerfile')).Replace('COPY . .', "COPY . .`nCOPY --from=gabi /route.ts ./src/app/api/gabi-sync/route.ts")
$recipePath = Join-Path $repo '.local/pilot.Dockerfile'
[IO.File]::WriteAllText($recipePath, $recipe)
& $docker build --build-context "gabi=$PSScriptRoot" -f $recipePath -t gabi-seo-pilot:fbf28b2 $upstream
if ($LASTEXITCODE -ne 0) { throw 'Pilot image build failed' }
