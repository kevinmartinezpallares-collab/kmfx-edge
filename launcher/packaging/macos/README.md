# KMFX Launcher macOS packaging

This folder contains the PyInstaller packaging setup for the native macOS app bundle.

## Prerequisites

- macOS with `sips`, `iconutil`, and `hdiutil`
- Python with the runtime requirements installed
- PyInstaller from `requirements-build.txt`

Install dependencies:

```bash
python3 -m pip install -r requirements.txt -r requirements-build.txt
```

## Build the app

```bash
scripts/build_macos_launcher.sh
```

Output:

```text
dist/KMFX Launcher.app
```

## Build the app and DMG

```bash
scripts/build_macos_launcher.sh --dmg
```

Output:

```text
dist/KMFX Launcher.app
dist/KMFX Launcher.dmg
```

## Web distribution artifact

The dashboard download points to:

```text
downloads/KMFX-Launcher-macOS.zip
```

That ZIP is created from the final app bundle:

```bash
ditto -c -k --sequesterRsrc --keepParent "dist/KMFX Launcher.app" downloads/KMFX-Launcher-macOS.zip
(cd downloads && shasum -a 256 KMFX-Launcher-macOS.zip > KMFX-Launcher-macOS.zip.sha256)
```

Keep the DMG for manual/local packaging checks. The public dashboard artifact is the ZIP because it stays small enough for static hosting and still preserves the `.app` bundle, the `kmfx-launcher://` URL scheme, and the packaged `KMFXConnector.ex5`.

## Included resources

- `launcher/ui/*`
- `assets/logos/kmfx-edge-glass-mark-1024.png`
- `assets/logos/kmfx-edge-glass-mark-512.png`
- `assets/logos/kmfx-edge-glass-mark-192.png`
- `assets/logos/kmfx-edge-icon-1024.png`
- `assets/logos/kmfx-edge-icon-512.svg`
- `assets/logos/mt5-logo.png`
- `KMFXConnector.mq5`
- `KMFXConnector.ex5` when present at repository root

The bundle name, Finder/Dock display name, and app title are all `KMFX Launcher`.

The macOS bundle registers the `kmfx-launcher://` URL scheme through `CFBundleURLTypes`, so dashboard buttons such as `Abrir Launcher` can open the installed app instead of downloading it again.

The build script clears extended attributes and applies an ad-hoc signature for local testing. Use a Developer ID certificate plus notarization before public distribution.
