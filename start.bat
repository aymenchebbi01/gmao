@echo off
setlocal enabledelayedexpansion
title GMAO Enterprise Server

REM Navigate to the exact folder where this batch file is located
cd /d "%~dp0"

echo =======================================================
echo          GMAO THERMOPLASTICS - STARTUP SCRIPT
echo =======================================================
echo.

REM 1. Check if Node.js is installed
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is NOT installed on this computer!
    echo         Please download and install Node.js (LTS version) from:
    echo         https://nodejs.org/
    echo.
    echo         After installing, double-click this start.bat file again.
    echo.
    pause
    exit /b 1
)

REM 2. Check if npm is installed
npm -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm was not found in your PATH.
    echo         Please ensure Node.js is installed correctly.
    echo.
    pause
    exit /b 1
)

REM 3. Auto-setup .env configuration if missing on new server
IF NOT EXIST ".env" (
    IF EXIST ".env.example" (
        echo [INFO] Creating .env file from .env.example template...
        copy ".env.example" ".env" >nul
        echo [INFO] .env file created successfully.
    ) ELSE (
        echo [INFO] Creating default .env file...
        (
            echo PORT=5033
            echo NODE_ENV=development
            echo JWT_SECRET=gmao-pro-secret-key-2026
            echo WHATSAPP_GROUP_INVITE="Hoz4wT17uRFDljP0ivZdXn"
        ) > ".env"
    )
)

REM 4. Ensure required runtime folders exist
IF NOT EXIST "uploads" mkdir uploads
IF NOT EXIST "backups" mkdir backups
IF NOT EXIST "whatsapp_auth" mkdir whatsapp_auth

REM 5. Dependency check & automatic installation
IF NOT EXIST "node_modules" (
    echo [INFO] Fresh deployment detected.
    echo [INFO] Installing all project dependencies (this may take a minute)...
    echo -------------------------------------------------------
    call npm install
    IF %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Dependency installation failed!
        echo         Please check your internet connection and try running 'npm install' manually.
        echo.
        pause
        exit /b 1
    )
    echo -------------------------------------------------------
    echo [INFO] All dependencies installed successfully!
    echo.
) ELSE (
    REM Check if critical packages are present (e.g. tsx runner, baileys)
    IF NOT EXIST "node_modules\tsx" (
        echo [INFO] Missing required packages detected. Updating dependencies...
        call npm install
        IF %ERRORLEVEL% NEQ 0 (
            echo [ERROR] Failed to update dependencies.
            pause
            exit /b 1
        )
    )
)

REM 6. Read Port from .env or fallback to 5033
set PORT=5033
FOR /F "tokens=1,2 delims==" %%A IN (.env) DO (
    IF "%%A"=="PORT" set PORT=%%B
)
REM Strip quotes and spaces if any
set PORT=%PORT:"=%
set PORT=%PORT: =%

echo -------------------------------------------------------
echo  [INFO] Starting GMAO Server on port %PORT%...
echo  [INFO] URL: http://localhost:%PORT%
echo  [INFO] DO NOT CLOSE THIS WINDOW while using the application!
echo -------------------------------------------------------
echo.

REM 7. Launch browser after a short 3-second delay in background
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"

REM 8. Boot the server
call npm run dev

REM If the server somehow exits or crashes, keep window open to view log
echo.
echo [INFO] Server stopped.
pause
