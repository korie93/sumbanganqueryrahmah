@echo off
chcp 65001 >nul
echo =========================================
echo   SQR - SUMBANGAN QUERY RAHMAH
echo   Windows Installation v3
echo =========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js version:
node --version
echo.
echo Step 1: Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Dependencies failed!
    pause
    exit /b 1
)
echo Dependencies installed!
echo.
echo Step 2: Building application...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo Build complete!
echo.
echo =========================================
echo   INSTALLATION COMPLETE!
echo =========================================
echo Login: superuser / 0441024k
echo Run START.bat to start the server
pause
