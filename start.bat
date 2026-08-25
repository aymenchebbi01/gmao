@echo off
title GMAO Server

REM Navigate to the exact folder where this batch file is located
cd /d "%~dp0"

REM Configure the port number here
set PORT=5033

echo =======================================================
echo          GMAO - STARTUP SCRIPT
echo =======================================================
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is NOT installed on this computer!
    echo         Please download and install it from https://nodejs.org/en
    echo         Then double-click this file again.
    echo.
    pause
    exit /b
)

REM First time setup checking
IF NOT EXIST "node_modules\" (
    echo [INFO] First time setup detected. Installing required files...
    call npm install
    echo.
)


echo -------------------------------------------------------
echo  [INFO] Starting the Local Enterprise Server...
echo  [INFO] DO NOT CLOSE THIS WINDOW while using the application!
echo -------------------------------------------------------
echo.

REM Automatically open the default web browser to the app
start "" "http://localhost:%PORT%"

REM Boot the server
call npm run dev

REM If the server somehow crashes, keep the window open to read the error
pause
