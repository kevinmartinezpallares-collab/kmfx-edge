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

From the repository root:

```powershell
scripts\build_windows_launcher.ps1
```

or:

```cmd
scripts\build_windows_launcher.bat
```

## Output

The Windows build intentionally uses PyInstaller `onedir` for better pywebview/resource reliability:

```text
dist\KMFX Launcher\KMFX Launcher.exe
```

The executable is windowed (`console=False`), uses the KMFX icon, and includes:

- `launcher/ui/*`
- `assets/logos/kmfx-edge-icon-1024.png`
- `assets/logos/kmfx-edge-icon-512.svg`
- `assets/logos/mt5-logo.png`
- `KMFXConnector.mq5`
- `KMFXConnector.ex5` when present at repository root

## Installer note

The next distribution step should wrap `dist\KMFX Launcher\` with a Windows installer such as Inno Setup or WiX. Do that after validating the generated `.exe` on a clean Windows machine.
