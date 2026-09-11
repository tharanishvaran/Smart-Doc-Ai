@echo off
title SmartDoc AI 2.0 Launcher
color 0B

echo ======================================================================
echo                SMARTDOC AI 2.0 - FULL STACK LAUNCHER
echo ======================================================================
echo.

:: Detect Python command
set PYTHON_CMD=
where py >nul 2>nul
if %errorlevel% equ 0 (
    set PYTHON_CMD=py
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set PYTHON_CMD=python
    )
)

if "%PYTHON_CMD%"=="" (
    color 0C
    echo [ERROR] Python is not found in PATH! Please install Python 3.10+.
    pause
    exit /b 1
)

:: Detect npm command
where npm >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js / npm is not found in PATH! Please install Node.js.
    pause
    exit /b 1
)

echo [OK] Python detected: %PYTHON_CMD%
echo [OK] Node.js / npm detected.
echo.
echo [1/2] Starting Flask Backend Server (Port 5000)...
start "SmartDoc AI - Backend (:5000)" cmd /k "title SmartDoc AI - Backend && cd /d "%~dp0backend" && %PYTHON_CMD% run.py"

echo [2/2] Starting Vite Frontend Server (Port 3000)...
start "SmartDoc AI - Frontend (:3000)" cmd /k "title SmartDoc AI - Frontend && cd /d "%~dp0frontend" && npm run dev"

echo.
echo ======================================================================
echo   Backend is running at:  http://127.0.0.1:5000
echo   Frontend is running at: http://localhost:3000
echo ======================================================================
echo.
echo Waiting for servers to initialize...
timeout /t 5 /nobreak >nul

echo Opening browser at http://localhost:3000 ...
start http://localhost:3000

echo.
echo Both servers are running in separate terminal windows.
echo You can close this launcher window at any time.
echo.
pause
