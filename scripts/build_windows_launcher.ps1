param(
    [switch]$Clean = $true
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$SpecFile = Join-Path $RootDir "launcher\packaging\windows\KMFXLauncher.spec"
$IconFile = Join-Path $RootDir "launcher\packaging\windows\KMFXLauncher.ico"
$OutputExe = Join-Path $RootDir "dist\KMFX Launcher\KMFX Launcher.exe"

Set-Location $RootDir

if (!(Test-Path $IconFile)) {
    Write-Error "[KMFX][BUILD][ERROR] Missing Windows icon: $IconFile"
}

if (!(Test-Path (Join-Path $RootDir "KMFXConnector.ex5"))) {
    Write-Warning "[KMFX][BUILD][WARN] KMFXConnector.ex5 not found; the bundle will include KMFXConnector.mq5 only."
}

$hasPyInstaller = python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "[KMFX][BUILD][ERROR] PyInstaller is missing. Run: python -m pip install -r requirements.txt -r requirements-build.txt"
}

$args = @("-m", "PyInstaller", "--noconfirm", $SpecFile)
if ($Clean) {
    $args = @("-m", "PyInstaller", "--clean", "--noconfirm", $SpecFile)
}

python @args

if (!(Test-Path $OutputExe)) {
    Write-Error "[KMFX][BUILD][ERROR] Expected output not found: $OutputExe"
}

Write-Host "[KMFX][BUILD] launcher ready: $OutputExe"
