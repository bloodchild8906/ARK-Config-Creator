<#
    ARK Config Creator - installer launcher
    ---------------------------------------
    Finds the newest setup file in dist\ and runs it.

        .\install.ps1            open the setup wizard (welcome, terms, folder, finish)
        .\install.ps1 -Silent    install in the background with default options
        .\install.ps1 -Run       launch the app once the install finishes

    If no installer exists yet, build one first with:  .\setup.ps1
#>
[CmdletBinding()]
param(
    [switch]$Silent,
    [switch]$Run
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$setup = Get-ChildItem (Join-Path $root 'dist') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
    Write-Host ''
    Write-Host '  No installer found in dist\.' -ForegroundColor Red
    Write-Host '  Build one first:  .\setup.ps1' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host ("  Installer : {0}" -f $setup.Name) -ForegroundColor White
Write-Host ("  Built     : {0:yyyy-MM-dd HH:mm}   ({1:N1} MB)" -f $setup.LastWriteTime, ($setup.Length / 1MB)) -ForegroundColor DarkGray

# an installer cannot replace files that are in use
$running = Get-Process -Name 'ARK Config Creator' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host '  A copy of ARK Config Creator is running - closing it first.' -ForegroundColor Yellow
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

if ($Silent) {
    Write-Host '  Installing silently...' -ForegroundColor Cyan
    $proc = Start-Process -FilePath $setup.FullName -ArgumentList '/S' -PassThru -Wait
} else {
    Write-Host '  Starting the setup wizard - follow the on-screen steps.' -ForegroundColor Cyan
    $proc = Start-Process -FilePath $setup.FullName -PassThru -Wait
}
if ($proc.ExitCode -ne 0) {
    Write-Host ''
    Write-Host ("  Setup exited with code {0} (a cancelled wizard also reports non-zero)." -f $proc.ExitCode) -ForegroundColor Yellow
    Write-Host ''
    exit $proc.ExitCode
}

function Resolve-InstalledExe {
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

$installed = Resolve-InstalledExe
if ($installed) {
    Write-Host ''
    Write-Host '  Installed successfully.' -ForegroundColor Green
    Write-Host ("  Location : {0}" -f (Split-Path $installed)) -ForegroundColor DarkGray
    Write-Host '  Shortcuts: Start menu and desktop' -ForegroundColor DarkGray
    if ($Run) {
        Start-Process -FilePath $installed
        Write-Host '  Launching ARK Config Creator...' -ForegroundColor Green
    }
} else {
    Write-Host '  Setup finished, but the app was not found in the usual folders.' -ForegroundColor Yellow
}
Write-Host ''
