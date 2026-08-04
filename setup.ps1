<#
    ARK Config Creator - setup & build script
    -----------------------------------------
    Takes a fresh copy of the source to a finished Windows installer.

        .\setup.ps1                 install dependencies, verify, build installer
        .\setup.ps1 -Install        ...and install it on this PC afterwards
        .\setup.ps1 -Install -Run   ...and launch the app when done
        .\setup.ps1 -SkipBuild      only prepare the dev environment
        .\setup.ps1 -Clean          delete dist/ and node_modules/ first

    Runs on Windows PowerShell 5.1 and PowerShell 7.
    Everything is local: no accounts, no publishing, nothing uploaded.
#>
[CmdletBinding()]
param(
    [switch]$SkipDeps,
    [switch]$SkipSmoke,
    [switch]$SkipBuild,
    [switch]$Install,
    [switch]$Run,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$step = 0
function Write-Step([string]$text) {
    $script:step++
    Write-Host ''
    Write-Host ("  [{0}] {1}" -f $script:step, $text) -ForegroundColor Cyan
}
function Write-Ok([string]$text)    { Write-Host "      $text" -ForegroundColor Green }
function Write-Info([string]$text)  { Write-Host "      $text" -ForegroundColor DarkGray }
function Write-Warn2([string]$text) { Write-Host "      $text" -ForegroundColor Yellow }
function Fail([string]$text) {
    Write-Host ''
    Write-Host "  SETUP FAILED: $text" -ForegroundColor Red
    Write-Host ''
    exit 1
}

# Native tools (npm, node, electron) write progress to stderr. With
# $ErrorActionPreference = 'Stop', piping that stderr back into PowerShell 5.1
# turns the first line into a terminating NativeCommandError and kills the
# script, so every external call goes through this helper instead.
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$File,
        [string[]]$Arguments = @(),
        [switch]$Quiet
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $File @Arguments 2>&1 | ForEach-Object {
            $line = $_.ToString()
            if (-not $Quiet) { Write-Info $line }
            $line
        }
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
    } finally {
        $ErrorActionPreference = $previous
    }
}

Write-Host ''
Write-Host '  ===============================================================' -ForegroundColor DarkCyan
Write-Host '    ARK CONFIG CREATOR - SETUP' -ForegroundColor White
Write-Host '    ARK: Survival Ascended server config tool' -ForegroundColor DarkGray
Write-Host '  ===============================================================' -ForegroundColor DarkCyan

# ---------------------------------------------------------------- prerequisites
Write-Step 'Checking prerequisites'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js was not found. Install the LTS build from https://nodejs.org and run this script again.'
}
$nodeVersion = (& node --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 18) {
    Fail "Node.js $nodeVersion is too old - version 18 or newer is required."
}
Write-Ok "Node.js $nodeVersion"

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) { Fail 'npm was not found alongside Node.js.' }
Write-Ok ("npm " + (& npm --version))

if (-not (Test-Path (Join-Path $root 'package.json'))) {
    Fail 'package.json not found - run this script from the ARK Config Creator source folder.'
}

if ($Clean) {
    Write-Step 'Cleaning previous build output'
    foreach ($dir in @('dist', 'node_modules')) {
        $p = Join-Path $root $dir
        if (Test-Path $p) { Remove-Item $p -Recurse -Force; Write-Ok "removed $dir" }
    }
}

# ---------------------------------------------------------------- dependencies
if (-not $SkipDeps) {
    Write-Step 'Installing dependencies'
    $npmResult = Invoke-Native -File $npmCmd.Source -Arguments @('install', '--no-audit', '--no-fund')
    # npm's own Electron download may fail behind a proxy; that is recovered in
    # the next step, so only a missing dependency tree is fatal here.
    if (-not (Test-Path (Join-Path $root 'node_modules\electron-builder'))) {
        Fail "npm install failed (exit $($npmResult.ExitCode)) - node_modules\electron-builder is missing."
    }
    Write-Ok 'dependencies installed'
} else {
    Write-Step 'Skipping dependency install (-SkipDeps)'
}

# ------------------------------------------------- electron runtime (binary)
Write-Step 'Verifying the Electron runtime'

$electronDir = Join-Path $root 'node_modules\electron'
$electronExe = Join-Path $electronDir 'dist\electron.exe'
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Fail 'node_modules\electron is missing - run without -SkipDeps.'
}
$electronVersion = (Get-Content (Join-Path $electronDir 'package.json') -Raw | ConvertFrom-Json).version

function Test-ZipFile([string]$path) {
    # a truncated download is still a file; check the PK header and that the
    # central directory can actually be opened
    if (-not (Test-Path $path)) { return $false }
    if ((Get-Item $path).Length -lt 40MB) { return $false }
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
        $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
        $count = $zip.Entries.Count
        $zip.Dispose()
        return ($count -gt 0)
    } catch { return $false }
}

if (-not (Test-Path $electronExe)) {
    Write-Warn2 "Electron $electronVersion binary missing - downloading it (about 130 MB)..."
    $zipName  = "electron-v$electronVersion-win32-x64.zip"
    $baseUrl  = "https://github.com/electron/electron/releases/download/v$electronVersion"
    $zipUrl   = "$baseUrl/$zipName"
    $zipLocal = Join-Path $env:TEMP $zipName
    $zipTmp   = "$zipLocal.partial"

    if ((Test-Path $zipLocal) -and -not (Test-ZipFile $zipLocal)) {
        Write-Warn2 'discarding a corrupt copy left by an earlier interrupted download'
        Remove-Item $zipLocal -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $zipLocal)) {
        try {
            $ProgressPreference = 'SilentlyContinue'
            if (Test-Path $zipTmp) { Remove-Item $zipTmp -Force }
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipTmp -UseBasicParsing
            if (-not (Test-ZipFile $zipTmp)) {
                Remove-Item $zipTmp -Force -ErrorAction SilentlyContinue
                Fail 'the downloaded Electron archive was incomplete or corrupt - check your connection and run setup again.'
            }
            Move-Item $zipTmp $zipLocal -Force     # only publish a verified file
        } catch {
            Remove-Item $zipTmp -Force -ErrorAction SilentlyContinue
            Fail "could not download the Electron runtime: $($_.Exception.Message)"
        }
    }

    try {
        New-Item -ItemType Directory -Force (Join-Path $electronDir 'dist') | Out-Null
        Expand-Archive -Path $zipLocal -DestinationPath (Join-Path $electronDir 'dist') -Force
        Set-Content (Join-Path $electronDir 'path.txt') -Value 'electron.exe' -NoNewline
    } catch {
        Fail "could not unpack the Electron runtime: $($_.Exception.Message)"
    }

    # Seed the download caches so electron-builder does not fetch the same
    # 130 MB again (which would fail on the very machine this repair is for).
    # @electron/get keys its cache on sha256(url without the file name);
    # older paths read the archive straight from the cache root.
    $sha256   = [System.Security.Cryptography.SHA256]::Create()
    $hashHex  = ([BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($baseUrl)))).Replace('-', '').ToLowerInvariant()
    $sha256.Dispose()
    $cacheRoot = Join-Path $env:LOCALAPPDATA 'electron\Cache'
    foreach ($target in @((Join-Path $cacheRoot $hashHex), $cacheRoot, (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\electron'))) {
        try {
            New-Item -ItemType Directory -Force $target | Out-Null
            Copy-Item $zipLocal (Join-Path $target $zipName) -Force
        } catch { Write-Info "could not seed cache at $target" }
    }
    Write-Ok 'Electron runtime downloaded, unpacked and cached'
}
if (-not (Test-Path $electronExe)) { Fail 'the Electron runtime is still missing after the download attempt.' }
Write-Ok "Electron $electronVersion ready"

# ---------------------------------------------------------------- legal docs
Write-Step 'Generating legal documents from legal.js'
$legal = Invoke-Native -File 'node' -Arguments @((Join-Path $root 'tools\gen-legal.js'))
if ($legal.ExitCode -ne 0) {
    Fail "gen-legal.js failed (exit $($legal.ExitCode)) - the installer would ship stale terms."
}
foreach ($doc in @('TERMS.txt', 'PRIVACY.txt', 'LICENSE.txt', 'EULA.txt')) {
    if (-not (Test-Path (Join-Path $root $doc))) { Fail "$doc was not generated." }
}
Write-Ok 'TERMS.txt, PRIVACY.txt, LICENSE.txt, EULA.txt up to date'

# ---------------------------------------------------------------- smoke test
if (-not $SkipSmoke) {
    Write-Step 'Running the application smoke test'
    Write-Info 'launches the app headless: register -> setup wizard -> logout -> log back in'
    $smoke = Invoke-Native -File $electronExe -Arguments @($root, '--smoke') -Quiet
    if ($smoke.Output -notmatch 'SMOKE-OK') {
        Write-Host $smoke.Output -ForegroundColor DarkGray
        Fail 'the smoke test did not pass - the app would not start correctly.'
    }
    Write-Ok 'smoke test passed'
} else {
    Write-Step 'Skipping smoke test (-SkipSmoke)'
}

# ---------------------------------------------------------------- build
if ($SkipBuild) {
    Write-Step 'Skipping installer build (-SkipBuild)'
    Write-Host ''
    Write-Host '  Development environment is ready.  Run the app with:  npm start' -ForegroundColor Green
    Write-Host ''
    exit 0
}

Write-Step 'Building the Windows installer'
Write-Info 'electron-builder - NSIS setup wizard, this takes a minute'
$npxCmd = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npxCmd) { Fail 'npx was not found alongside Node.js.' }
$build = Invoke-Native -File $npxCmd.Source -Arguments @('electron-builder', '--win', 'nsis')
if ($build.ExitCode -ne 0) { Fail "electron-builder exited with code $($build.ExitCode)." }

$setupExe = Get-ChildItem (Join-Path $root 'dist') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setupExe) { Fail 'the build finished but no installer was produced in dist\.' }
Write-Ok ("installer: {0} ({1:N1} MB)" -f $setupExe.Name, ($setupExe.Length / 1MB))

# ------------------------------------------------- verify the packaged build
Write-Step 'Verifying the packaged application'
$packagedExe = Join-Path $root 'dist\win-unpacked\ARK Config Creator.exe'
if (Test-Path $packagedExe) {
    $packedSmoke = Invoke-Native -File $packagedExe -Arguments @('--smoke') -Quiet
    if ($packedSmoke.Output -notmatch 'SMOKE-OK') {
        Write-Host $packedSmoke.Output -ForegroundColor DarkGray
        Fail 'the packaged application failed its smoke test - do not ship this build.'
    }
    Write-Ok 'packaged application starts and works'
} else {
    Write-Warn2 'dist\win-unpacked was not found, skipping the packaged check'
}

# ---------------------------------------------------------------- install
function Resolve-InstalledExe {
    # the installer records where it landed; fall back to both default folders
    foreach ($hive in @('HKCU:\Software\ARK Config Creator', 'HKLM:\Software\ARK Config Creator')) {
        try {
            $p = (Get-ItemProperty $hive -ErrorAction Stop).InstallPath
            if ($p -and (Test-Path (Join-Path $p 'ARK Config Creator.exe'))) {
                return (Join-Path $p 'ARK Config Creator.exe')
            }
        } catch { }
    }
    foreach ($p in @((Join-Path $env:LOCALAPPDATA 'Programs\ARK Config Creator'),
                     (Join-Path $env:ProgramFiles 'ARK Config Creator'))) {
        $exe = Join-Path $p 'ARK Config Creator.exe'
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

if ($Install) {
    Write-Step 'Installing on this PC'
    if (Get-Process -Name 'ARK Config Creator' -ErrorAction SilentlyContinue) {
        Write-Warn2 'closing the running copy first'
        Get-Process -Name 'ARK Config Creator' | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
    $proc = Start-Process -FilePath $setupExe.FullName -ArgumentList '/S' -PassThru -Wait
    if ($proc.ExitCode -ne 0) { Fail "the installer exited with code $($proc.ExitCode)." }

    $installed = Resolve-InstalledExe
    if (-not $installed) { Fail 'the installer finished but the app could not be located afterwards.' }
    Write-Ok "installed: $installed"

    if ($Run) {
        Start-Process -FilePath $installed
        Write-Ok 'application launched'
    }
}

# ---------------------------------------------------------------- summary
Write-Host ''
Write-Host '  ===============================================================' -ForegroundColor DarkCyan
Write-Host '    SETUP COMPLETE' -ForegroundColor Green
Write-Host '  ===============================================================' -ForegroundColor DarkCyan
Write-Host ("    Installer : dist\{0}" -f $setupExe.Name) -ForegroundColor White
if (-not $Install) {
    Write-Host '    Install   : run that file, or .\setup.ps1 -Install -Run' -ForegroundColor White
}
Write-Host '    Run dev   : npm start' -ForegroundColor White
Write-Host '    Browser   : double-click index.html (no install needed)' -ForegroundColor White
Write-Host ''
