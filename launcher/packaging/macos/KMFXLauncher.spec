# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


block_cipher = None
ROOT = Path(SPECPATH).resolve().parents[2]
ICON_PATH = ROOT / "launcher" / "packaging" / "macos" / "KMFXLauncher.icns"


datas = [
    (str(ROOT / "launcher" / "ui"), "launcher/ui"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-icon-1024.png"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "kmfx-edge-icon-512.svg"), "assets/logos"),
    (str(ROOT / "assets" / "logos" / "mt5-logo.png"), "assets/logos"),
    (str(ROOT / "KMFXConnector.mq5"), "."),
]

connector_ex5 = ROOT / "KMFXConnector.ex5"
if connector_ex5.exists():
    datas.append((str(connector_ex5), "."))


a = Analysis(
    [str(ROOT / "launcher" / "packaging" / "macos" / "launcher_entry.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "webview.platforms.cocoa",
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
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
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

app = BUNDLE(
    coll,
    name="KMFX Launcher.app",
    icon=str(ICON_PATH),
    bundle_identifier="com.kmfxedge.launcher",
    info_plist={
        "CFBundleName": "KMFX Launcher",
        "CFBundleDisplayName": "KMFX Launcher",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundleVersion": "1.0.0",
        "LSApplicationCategoryType": "public.app-category.finance",
        "NSHighResolutionCapable": True,
    },
)
