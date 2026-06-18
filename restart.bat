@echo off
echo ========================================
echo SIGERFI Dashboard - Restart completo
echo ========================================

:: 1. Matar procesos viejos (solo los nuestros)
echo [1/3] Deteniendo procesos anteriores...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%a /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8010 " ^| findstr LISTENING') do taskkill /PID %%a /F 2>nul
timeout /t 2 /nobreak >nul

:: 2. Iniciar backend
echo [2/3] Iniciando backend (puerto 8010)...
cd /d C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\backend
start /B "" py -3.12 -m uvicorn main:app --host 0.0.0.0 --port 8010 > backend.log 2>&1
timeout /t 3 /nobreak >nul

:: 3. Iniciar frontend
echo [3/3] Iniciando frontend (puerto 3000)...
cd /d C:\Users\Usuario\.openclaw\workspace\odk-dashboard-v2\frontend
start /B "" npx next dev -p 3000 > frontend.log 2>&1
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   Listo!
echo ========================================
echo   Backend:  http://localhost:8010
echo   Frontend: http://localhost:3000
echo.
echo   Logs: backend.log, frontend.log
echo ========================================
