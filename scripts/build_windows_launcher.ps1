param(
    [switch]$Clean = $true,
    [string]$ArtifactDir = ""
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$SpecFile = Join-Path $RootDir "launcher\packaging\windows\KMFXLauncher.spec"
$IconFile = Join-Path $RootDir "launcher\packaging\windows\KMFXLauncher.ico"
$OutputExe = Join-Path $RootDir "dist\KMFX Launcher\KMFX Launcher.exe"
$OutputDir = Join-Path $RootDir "dist\KMFX Launcher"
if ([string]::IsNullOrWhiteSpace($ArtifactDir)) {
    $ArtifactDir = Join-Path $RootDir "downloads"
}
$OutputZip = Join-Path $ArtifactDir "KMFX-Launcher-Windows.zip"
$OutputSha = "$OutputZip.sha256"

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

New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
Remove-Item -Force -ErrorAction SilentlyContinue $OutputZip, $OutputSha

Compress-Archive -Path $OutputDir -DestinationPath $OutputZip -CompressionLevel Optimal

$hash = (Get-FileHash -Algorithm SHA256 -Path $OutputZip).Hash.ToLowerInvariant()
Set-Content -Encoding ascii -Path $OutputSha -Value "$hash  KMFX-Launcher-Windows.zip"

Write-Host "[KMFX][BUILD] launcher ready: $OutputExe"
Write-Host "[KMFX][BUILD] package ready: $OutputZip"
Write-Host "[KMFX][BUILD] SHA256: $hash"
