@echo off
chcp 65001 > nul
title GARUDA - Gridlock Guardian Startup Tool
echo ==========================================================
echo           GARUDA - Gridlock Guardian
echo ==========================================================
echo.

:: Check for .venv directory
if exist .venv\Scripts\activate.bat (
    echo [INFO] Virtual environment venv found. Activating...
    set PYTHON_CMD=.venv\Scripts\python.exe
) else (
    echo [WARNING] Local virtual environment venv not found.
    echo [INFO] Falling back to global system python...
    set PYTHON_CMD=python
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
