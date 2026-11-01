from fastapi import APIRouter, Body, Request
from backend.api.auth_admin import check_admin_rbac
from typing import Optional
from backend.services.dam_simulation import dam_service
from backend.database import get_db, seed_initial_data

router = APIRouter()

@router.get("/api/dam")
def get_dam():
    return dam_service.get_state()

@router.post("/api/simulation/dam/start")
def start_dam_simulation(request: Request):
    check_admin_rbac(request)
    state = dam_service.start_storm()
    return {"message": "Storm simulation started", "state": state}

@router.post("/api/simulation/dam/surge")
def surge_dam(request: Request, payload: dict = Body(default={})):
    check_admin_rbac(request)
    surge_cm = payload.get("surgeCm", 25)
    state = dam_service.surge(surge_cm=float(surge_cm))
    return {"message": f"Injected +{surge_cm}cm surge", "state": state}

@router.post("/api/simulation/flood/full")
def full_flood_simulation(request: Request):
    check_admin_rbac(request)
    state = dam_service.trigger_full_flood()
    return {"message": "Full flood event triggered across low-lying roads", "state": state}

@router.post("/api/simulation/dam/reset")
def reset_dam_simulation(request: Request):
    check_admin_rbac(request)
    state = dam_service.reset()
    # Also reset people and incidents
    try:
        with get_db() as conn:
            # Re-seed baseline data
            seed_initial_data(conn)
    except Exception:
        pass
    return {"message": "Simulation reset to baseline conditions", "state": state}
