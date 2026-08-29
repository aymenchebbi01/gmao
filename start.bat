@echo off
title GMAO Enterprise Server

REM Navigate to project root directory
cd /d "%~dp0"

echo =======================================================
echo          GMAO THERMOPLASTICS - STARTUP SCRIPT
echo =======================================================
echo.

REM 1. Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is NOT installed or not in PATH!
    echo.
    echo Please install Node.js [LTS version] from: https://nodejs.org/
    echo.
    echo After installing, restart your computer and double-click start.bat again.
    echo.
    pause
    exit /b 1
)

REM 2. Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm was not found in your PATH.
    echo Please ensure Node.js is installed correctly.
    echo.
    pause
    exit /b 1
)

REM 3. Create .env if missing
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example template...
        copy /y ".env.example" ".env" >nul
        echo [INFO] .env file created.
    ) else (
        echo [INFO] Creating default .env configuration...
        echo PORT=5033> .env
        echo NODE_ENV=development>> .env
        echo JWT_SECRET=gmao-pro-secret-key-2026>> .env
        echo WHATSAPP_GROUP_INVITE="Hoz4wT17uRFDljP0ivZdXn">> .env
    )
)

REM 4. Create essential storage directories
if not exist "uploads" mkdir "uploads"
if not exist "backups" mkdir "backups"
if not exist "whatsapp_auth" mkdir "whatsapp_auth"

REM 5. Install dependencies if node_modules is missing or incomplete
if not exist "node_modules" (
    echo [INFO] Fresh deployment detected.
    echo [INFO] Installing dependencies [this may take 1-2 minutes]...
    echo -------------------------------------------------------
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Failed to install dependencies!
        echo Please check your internet connection and run npm install in this folder.
        echo.
        pause
        exit /b 1
    )
    echo -------------------------------------------------------
    echo [INFO] Dependencies installed successfully!
    echo.
) else (
    if not exist "node_modules\tsx" (
        echo [INFO] Missing required packages detected. Updating...
        call npm install
        if %ERRORLEVEL% NEQ 0 (
            echo [ERROR] Failed to update dependencies.
            pause
            exit /b 1
        )
    )
)

set PORT=5033

echo -------------------------------------------------------
echo  [INFO] Starting GMAO Server on port %PORT%...
echo  [INFO] URL: http://localhost:%PORT%
echo  [INFO] Keep this window OPEN while using the application.
echo -------------------------------------------------------
echo.

REM 6. Open the browser
start "" "http://localhost:%PORT%"

REM 7. Start the dev server
call npm run dev

echo.
echo [INFO] Server stopped.
pause
