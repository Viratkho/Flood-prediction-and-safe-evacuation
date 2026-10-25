from fastapi import APIRouter
from backend.database import get_db
from backend.models import dam_state_row_to_dict

router = APIRouter()

@router.get("/api/health")
def get_health():
    with get_db() as conn:
        row = conn.execute("SELECT * FROM dam_state WHERE id = 1").fetchone()
        dam_status = row["status"] if row else "NORMAL"
    return {
        "status": "ONLINE",
        "system": "FloodGuard 2.1 Hydrological Command Engine",
        "basin": "Avadi / Ambattur Hydrological Basin, Chennai",
        "sensorsCount": 15,
        "damStatus": dam_status,
        "osmEnabled": True,
    }
