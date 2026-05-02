# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


block_cipher = None
ROOT = Path(SPECPATH).resolve().parents[2]
ICON_PATH = ROOT / "launcher" / "packaging" / "windows" / "KMFXLauncher.ico"


datas = [
    (str(ROOT / "launcher" / "ui"), "launcher/ui"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-glass-mark-1024.png"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-glass-mark-512.png"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-glass-mark-192.png"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-icon-1024.png"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-icon-512.svg"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "mt5-logo.png"), "assets/logos"),
    (str(ROOT / "KMFXConnector.mq5"), "."),
]

connector_ex5 = ROOT / "KMFXConnector.ex5"
if connector_ex5.exists():
    datas.append((str(connector_ex5), "."))


a = Analysis(
    [str(ROOT / "launcher" / "packaging" / "windows" / "launcher_entry.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "webview.platforms.edgechromium",
        "webview.platforms.mshtml",
        "webview.platforms.winforms",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="KMFX Launcher",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    icon=str(ICON_PATH),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="KMFX Launcher",
)
