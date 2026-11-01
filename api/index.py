import os
import sys
import time
import shutil
from pathlib import Path

# Add project root to sys.path so 'backend.*' imports resolve cleanly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Ensure Vercel serverless environment points to writable /tmp for SQLite persistence
if os.environ.get("VERCEL"):
    os.environ.setdefault("FLOODGUARD_DB_PATH", "/tmp/floodguard.db")
    os.environ.setdefault("DATABASE_PATH", "/tmp/floodguard.db")

    tmp_db = Path("/tmp/floodguard.db")
    bundled_db = ROOT_DIR / "backend" / "database" / "floodguard.db"
    if not tmp_db.exists() and bundled_db.exists():
        try:
            shutil.copyfile(bundled_db, tmp_db)
        except Exception as e:
            print("Notice: could not copy bundled seed db to /tmp:", e)

from backend.main import app
from backend.database import init_db

# Initialize database schema & default admin on serverless cold-start
try:
    init_db()
except Exception as e:
    print("Notice: cold-start database initialization error:", e)

API_PREFIXES = (
    "/auth", "/health", "/dam", "/people", "/incidents", "/alerts",
    "/security", "/research", "/weather", "/ai", "/prediction",
    "/users", "/locations", "/history", "/system", "/simulation"
)

@app.middleware("http")
async def vercel_api_prefix_normalizer(request, call_next):
    # Ensure path starts with /api if routed without prefix by serverless rewrite
    path = request.scope.get("path", "")
    if path and path.startswith(API_PREFIXES):
        request.scope["path"] = "/api" + path
        if "raw_path" in request.scope:
            request.scope["raw_path"] = b"/api" + request.scope["raw_path"]
    return await call_next(request)

# Export handler for Vercel ASGI runner
handler = app
