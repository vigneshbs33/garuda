@echo off
chcp 65001 > nul
title GARUDA - Gridlock Guardian Startup Tool
echo ==========================================================
echo           GARUDA - Gridlock Guardian
echo ==========================================================
echo.

:: 1. Python Environment Setup
if not exist .venv\Scripts\activate.bat (
    echo [INFO] Virtual environment not found. Creating one now...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment. Make sure Python is installed.
        pause
        exit /b 1
    )
    echo [INFO] Installing Python dependencies...
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\python.exe -m pip install -r requirements.txt
) else (
    echo [INFO] Virtual environment found.
)
set PYTHON_CMD=.venv\Scripts\python.exe

echo.
:: 2. Node Modules Setup
if not exist node_modules\ (
    echo [INFO] Node modules not found. Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install npm dependencies. Make sure Node.js is installed.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Node modules found.
)

echo.
echo [1/2] Launching FastAPI Backend on port 8000...
start "GARUDA Backend" cmd /k "title GARUDA Backend && %PYTHON_CMD% -m uvicorn backend.main:app --reload --port 8000"

echo [2/2] Launching Next.js Frontend Dashboard...
start "GARUDA Frontend" cmd /k "title GARUDA Frontend && npm run dev"

echo.
echo ==========================================================
echo [SUCCESS] Both applications have been started in new windows!
echo.
echo - Backend API   : http://localhost:8000
echo - Swagger Docs  : http://localhost:8000/docs
echo - Frontend Panel: http://localhost:3000 (or http://localhost:3001 if port 3000 is occupied)
echo.
echo Press any key to close this launcher console...
echo ==========================================================
pause > nul
