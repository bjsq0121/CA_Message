@echo off
echo === CA Messenger Desktop Build ===

echo [1/3] Building Vue UI...
cd /d "%~dp0..\ui"
call npx vite build --outDir "%~dp0web"

echo [2/3] Installing Electron dependencies...
cd /d "%~dp0"
call npm install

echo [3/3] Packaging Electron app...
call npm run build:win

echo.
echo === Build complete ===
dir dist\*.exe 2>nul
pause
