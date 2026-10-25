from typing import Dict, Any
from fastapi import APIRouter
from backend.services.dam_simulation import dam_service
from backend.services.ai_service import get_ai_advice

router = APIRouter()

@router.post("/api/ai/advise")
async def advise(payload: Dict[str, Any] = None):
    payload = payload or {}
    prompt = payload.get("prompt", "")
    user_location = payload.get("userLocation")
    blocked_roads = payload.get("blockedRoads")
    current_dam_level = payload.get("currentDamLevel")
    nearest_shelter = payload.get("nearestShelter")
    person_profile = payload.get("personProfile")

    dam_state = dam_service.get_state()

    reply = await get_ai_advice(
        prompt=prompt,
        dam=dam_state,
        user_location=user_location,
        blocked_roads=blocked_roads,
        current_dam_level=current_dam_level,
        nearest_shelter=nearest_shelter,
        person_profile=person_profile,
    )

    return {"reply": reply}
