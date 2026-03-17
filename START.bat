@echo off
chcp 65001 >nul
cls
echo =========================================
echo   SQR - SUMBANGAN QUERY RAHMAH
echo   Server on Port 5000
echo =========================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP:~1%
echo Local:  http://localhost:5000
echo LAN:    http://%IP%:5000
echo.
echo Login with the credentials configured in your .env file
echo Press Ctrl+C to stop
echo =========================================
node dist-local/server/index-local.js
pause
