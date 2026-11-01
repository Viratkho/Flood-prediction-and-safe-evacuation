import os
import sys
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, JSONResponse

from backend.database import init_db
from backend.services.dam_simulation import dam_service
from backend.middleware.waf import WAFMiddleware

# Import sub-routers
from backend.api.health import router as health_router
from backend.api.dam import router as dam_router
from backend.api.people import router as people_router
from backend.api.incidents import router as incidents_router
from backend.routers.flood_alerts import router as alerts_router
from backend.api.security import router as security_router
from backend.api.research import router as research_router
from backend.api.weather import router as weather_router
from backend.api.ai import router as ai_router
from backend.api.auth_qr import router as auth_qr_router
from backend.api.auth_admin import router as auth_admin_router
from backend.api.prediction import router as prediction_router

# Database-backed routers (Users, Predictions, Locations, History, System Admin)
from backend.routers.users import router as users_router
from backend.routers.predictions import router as predictions_router
from backend.routers.locations import router as locations_router
from backend.routers.history import router as history_router
from backend.routers.system import router as system_router

async def simulation_ticker():
    while True:
        try:
            dam_service.tick()
        except Exception:
            pass
        await asyncio.sleep(2.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database
    init_db()
    # Start background dam simulation ticker (every 2s)
    sim_task = asyncio.create_task(simulation_ticker())
    yield
    # Cleanup on shutdown
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="FloodGuard 2.1 Backend",
    description="Tactical Flood Prediction & Safe Evacuation API (FastAPI + SQLite + SQLAlchemy)",
    version="2.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

# 1. WAF Middleware (DPI, Bot defense, Rate limiting, Security headers)
app.add_middleware(WAFMiddleware)

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Mount API routers
app.include_router(health_router)
app.include_router(dam_router)
app.include_router(people_router)
app.include_router(incidents_router)
app.include_router(alerts_router)
app.include_router(security_router)
app.include_router(research_router)
app.include_router(weather_router)
app.include_router(ai_router)
app.include_router(auth_qr_router)
app.include_router(auth_admin_router)
app.include_router(prediction_router)

# Database Operations Routers
app.include_router(users_router)
app.include_router(predictions_router)
app.include_router(locations_router)
app.include_router(history_router)
app.include_router(system_router)

@app.get("/api")
def api_root_endpoint():
    return {
        "status": "ONLINE",
        "system": "FloodGuard 2.1 Hydrological Command Engine",
        "technology": "Python FastAPI + SQLite",
        "rbac": "Active (PBKDF2-HMAC-SHA256)",
        "qrAuth": "Active (Device A/B Handshake)",
    }

# 4. Static frontend asset delivery & SPA fallback
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
INDEX_HTML = DIST_DIR / "index.html"

if DIST_DIR.exists() and (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # API route protection: never return HTML for API calls
    if full_path == "api" or full_path == "api/":
        return api_root_endpoint()
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"error": f"API route '/{full_path}' not found."})

    # If file exists in dist, serve it
    if full_path:
        candidate = DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
    if INDEX_HTML.exists():
        return FileResponse(INDEX_HTML)
    return JSONResponse(status_code=404, content={"error": "Frontend build not found"})

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
