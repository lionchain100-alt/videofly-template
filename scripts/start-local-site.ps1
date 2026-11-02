param([switch]$Stop, [switch]$Restart, [switch]$NoWorkers)
$ErrorActionPreference = 'Stop'
$siteRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$site = Get-Content -LiteralPath (Join-Path $siteRoot 'src/config/site.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$runtime = Join-Path $siteRoot '.local/site-runtime.json'
if ($Stop -or $Restart) {
    if (Test-Path -LiteralPath $runtime) {
        $saved = Get-Content -LiteralPath $runtime -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($entry in $saved.processes) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.pid)" -ErrorAction SilentlyContinue
            if ($process -and $process.CreationDate.ToUniversalTime().ToString('o') -eq $entry.created -and $process.CommandLine -like "*$($entry.marker)*") {
                & taskkill.exe /PID $entry.pid /T /F | Out-Null
            }
        }
        Remove-Item -LiteralPath $runtime
    }
    Write-Output "Stopped site processes for $($site.id). Database and data retained."
    if ($Stop) { exit }
}
Push-Location $siteRoot
try {
    & node --import tsx scripts/check-site.ts
    if ($LASTEXITCODE -ne 0) { throw 'Invalid site configuration' }
    if (Get-NetTCPConnection -LocalPort $site.local.port -State Listen -ErrorAction SilentlyContinue) { throw 'Site HTTP port is already occupied' }
    $nativePath = Join-Path $env:LOCALAPPDATA $site.local.nativeWorkspace
    if (-not (Test-Path -LiteralPath $nativePath)) {
        New-Item -ItemType Directory -Path (Split-Path $nativePath -Parent) -Force | Out-Null
        New-Item -ItemType Junction -Path $nativePath -Target $siteRoot | Out-Null
    }
    & node scripts/local-postgres.mjs status
    if ($LASTEXITCODE -ne 0) {
        if (Get-NetTCPConnection -LocalPort $site.local.databasePort -State Listen -ErrorAction SilentlyContinue) { throw 'Database port is occupied by an unverified server' }
        & node scripts/local-postgres.mjs start
        if ($LASTEXITCODE -ne 0) { throw 'Database startup failed' }
    }
    & node scripts/migrate-admin.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
    & node --import tsx scripts/initialize-ai-policy.ts
    if ($LASTEXITCODE -ne 0) { throw 'AI policy initialization failed' }
    & node scripts/seed-local-admin.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Account initialization failed' }
    $processes = @()
    $entries = @(@{name='web';args=@('node_modules/next/dist/bin/next','dev','--hostname','::','--port',"$($site.local.port)");marker='next/dist/bin/next'})
    if (-not $NoWorkers) {
        foreach ($worker in @('task-worker','video-worker','payment-worker')) {
            $entries += @{name=$worker;args=@('--import','tsx',"scripts/$worker.ts");marker="scripts/$worker.ts"}
        }
    }
    foreach ($entry in $entries) {
        $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $entry.args -WorkingDirectory $siteRoot -RedirectStandardOutput (Join-Path $siteRoot ".local/$($entry.name).stdout.log") -RedirectStandardError (Join-Path $siteRoot ".local/$($entry.name).stderr.log") -WindowStyle Hidden -PassThru
        $native = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
        $processes += @{pid=$process.Id;created=$native.CreationDate.ToUniversalTime().ToString('o');marker=$entry.marker}
        $pidFile = switch ($entry.name) {
            'web' { '.preview-server.pid' }
            'task-worker' { '.local/text-worker.pid' }
            'video-worker' { '.local/video-worker.pid' }
            'payment-worker' { '.local/payment-worker.pid' }
        }
        $process.Id | Set-Content -LiteralPath (Join-Path $siteRoot $pidFile)
    }
    @{site=$site.id;processes=$processes} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $runtime
    Write-Output "Site: $($site.origin) /login /admin /ui-studio. Credentials: .env.local"
} finally { Pop-Location }
