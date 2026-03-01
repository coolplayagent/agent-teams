@echo off
chcp 65001 >nul
echo Checking Python environment...

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Python not found!
    pause
    exit /b 1
)

echo Python found, checking uv...

uv --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] uv not found! Please install uv first:
    echo   Run: pip install uv
    echo   Or visit: https://github.com/astral-sh/uv
    pause
    exit /b 1
)

echo uv found, running uv sync...

uv sync

if %errorlevel% neq 0 (
    echo [Error] uv sync failed!
    pause
    exit /b 1
)

echo.
echo Starting web server...
echo Open http://127.0.0.1:8000 in your browser
echo.

uv run agent-teams serve

pause
