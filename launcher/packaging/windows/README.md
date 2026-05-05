# KMFX Launcher Windows packaging

This folder contains the PyInstaller packaging setup for the Windows launcher build.

## Prerequisites

- Windows 10/11
- Python installed and available as `python`
- Runtime dependencies from `requirements.txt`
- PyInstaller from `requirements-build.txt`
- Microsoft Edge WebView2 Runtime installed on the target machine

Install dependencies:

```powershell
python -m pip install -r requirements.txt -r requirements-build.txt
```

## Build the launcher

### Opcion macOS sin Windows local

Si estas en macOS y no tienes Windows, puedes generar el paquete Windows con el runtime de Wine que trae MetaTrader 5:

```bash
scripts/build_windows_launcher_wine.sh
```

El script descarga una Python embeddable de Windows en `build/windows-toolchain`, instala las dependencias dentro de un `WINEPREFIX` local y genera:

```text
downloads/KMFX-Launcher-Windows.exe
downloads/KMFX-Launcher-Windows.exe.sha256
downloads/KMFX-Launcher-Windows.zip
downloads/KMFX-Launcher-Windows.zip.sha256
```

Vercel sirve la app Windows directamente desde:

```text
https://kmfxedge.com/downloads/KMFX-Launcher-Windows.exe
```

El ZIP se mantiene solo como compatibilidad y contiene el `.exe` en la raiz, no la carpeta interna de PyInstaller.

### Opcion CI en Windows real

El workflow de GitHub Actions `Build Windows Launcher` compila el launcher en `windows-latest`, genera el mismo paquete y lo sube como artifact:

```text
downloads/KMFX-Launcher-Windows.exe
downloads/KMFX-Launcher-Windows.exe.sha256
downloads/KMFX-Launcher-Windows.zip
downloads/KMFX-Launcher-Windows.zip.sha256
```

El workflow valida el build en pull requests. Cuando cambian el launcher, el conector o sus dependencias en `main`, tambien genera el paquete y publica automaticamente la app y sus checksums en `main` para dejar disponible la descarga en:

```text
https://kmfxedge.com/downloads/KMFX-Launcher-Windows.exe
```

Si GitHub bloquea la publicacion directa por proteccion de rama, el workflow deja una rama `automation/windows-launcher-artifact-*` con los artefactos listos para revisar.

### Opcion local en Windows

From the repository root:

```powershell
scripts\build_windows_launcher.ps1
```

or:

```cmd
scripts\build_windows_launcher.bat
```

## Output

The Windows build uses PyInstaller one-file mode so the dashboard can serve a real app download:

```text
dist\KMFX-Launcher-Windows.exe
downloads\KMFX-Launcher-Windows.exe
```

The executable is windowed (`console=False`), uses the KMFX icon, and includes:

- `launcher/ui/*`
- `assets/logos/kmfx-edge-glass-mark-1024.png`
- `assets/logos/kmfx-edge-glass-mark-512.png`
- `assets/logos/kmfx-edge-glass-mark-192.png`
- `assets/logos/kmfx-edge-icon-1024.png`
- `assets/logos/kmfx-edge-icon-512.svg`
- `assets/logos/mt5-logo.png`
- `KMFXConnector.mq5`
- `KMFXConnector.ex5` when present at repository root

## Installer note

The next distribution step can wrap `downloads\KMFX-Launcher-Windows.exe` with a Windows installer such as Inno Setup or WiX. Do that after validating the generated `.exe` on a clean Windows machine.
