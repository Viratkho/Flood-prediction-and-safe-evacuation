@echo off
echo ====================================================================
echo  🚨 FloodGuard 2.1 — Python FastAPI + SQLite Backend Service
echo  Port: 3000 | Database: backend\data\floodguard.db
echo  100%% Free & Open-Source — Zero Paid Subscriptions Required
echo ====================================================================

cd /d "%~dp0\.."
if not exist ".venv\Scripts\python.exe" (
    echo [.venv environment not found. Setting up virtual environment...]
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
