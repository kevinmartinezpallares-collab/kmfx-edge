$url = "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"
Write-Host "[KMFX][MT5] guided install for Windows"
Write-Host "1. Download and install MetaTrader 5."
Write-Host "2. Open MT5 once so the MQL5 data folders are created."
Write-Host "3. Re-run KMFX Launcher and use 'Redetectar MT5'."
Start-Process $url
