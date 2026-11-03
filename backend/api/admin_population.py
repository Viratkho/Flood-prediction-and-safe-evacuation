"""
FloodGuard 2.1 — Administrator-Only Dynamic Population Mapping & Geospatial Analysis
Strict Role-Based Access Control (RBAC), Deduplicated SQLite Queries, and Tactical Prioritization.
"""

import math
import json
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.database import get_db
from backend.api.auth_admin import check_admin_rbac

router = APIRouter(prefix="/api/admin/population", tags=["Admin Population Analysis"])


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates geodesic surface distance between two coordinates in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return R * c


DISABILITY_TAGS = {
    "MOBILITY", "RESPIRATORY", "CARDIAC", "ELDERLY", "BLIND", "DEAF",
    "PREGNANT", "WHEELCHAIR", "DISABLED", "DIABETIC", "INFANT", "BEDRIDDEN"
}


class PopulationAnalysisRequest(BaseModel):
    centerLat: float = Field(..., ge=-90.0, le=90.0, description="Center latitude of population radius")
    centerLng: float = Field(..., ge=-180.0, le=180.0, description="Center longitude of population radius")
    radiusM: float = Field(..., ge=20.0, le=50000.0, description="Geographical radius in meters")


@router.post("/analysis")
def analyze_population_in_radius(req: PopulationAnalysisRequest, request: Request):
    """
    Administrator-exclusive geospatial population analysis.
    Filters all registered individuals within radiusM of centerLat/centerLng,
    deduplicates by personId, computes disability breakdown, SOS counts,
    flood severity, and tactical rescue priority.
    """
    # Strict RBAC enforcement - only authenticated administrators may execute population radius queries
    check_admin_rbac(request, strict=True)

    c_lat = req.centerLat
    c_lng = req.centerLng
    r_meters = req.radiusM

    area_sq_km = math.pi * ((r_meters / 1000.0) ** 2)

    with get_db() as conn:
        rows = conn.execute("SELECT * FROM people").fetchall()

    seen_ids = set()
    matching_people = []

    with_disability_cnt = 0
    without_disability_cnt = 0
    unknown_disability_cnt = 0
    active_sos_cnt = 0
    high_risk_flood_cnt = 0
    stale_location_cnt = 0

    now_ts = time.time()

    for r in rows:
        p_id = r["person_id"]
        if not p_id or p_id in seen_ids:
            continue

        p_lat = r["lat"]
        p_lng = r["lng"]

        if p_lat is None or p_lng is None:
            continue

        dist_m = haversine_distance_m(c_lat, c_lng, p_lat, p_lng)
        if dist_m > r_meters:
            continue

        seen_ids.add(p_id)

        # Parse medical / disability conditions
        med_conds_raw = r["medical_conditions"]
        conditions: List[str] = []
        if med_conds_raw:
            try:
                parsed = json.loads(med_conds_raw)
                if isinstance(parsed, list):
                    conditions = [str(c).upper() for c in parsed]
                elif isinstance(parsed, str):
                    conditions = [parsed.upper()]
            except Exception:
                conditions = [str(med_conds_raw).upper()]

        assist_type = str(r["assistance_type"] or "").upper()
        medical_notes = str(r["medical_notes"] or "").upper()

        has_disability = False
        if any(tag in conditions for tag in DISABILITY_TAGS) or any(tag in assist_type for tag in DISABILITY_TAGS):
            has_disability = True
        elif any(tag in medical_notes for tag in ["ASTHMA", "HEART", "WHEELCHAIR", "ELDER", "WALKER"]):
            has_disability = True

        disability_status = "UNKNOWN"
        if has_disability:
            disability_status = "DECLARED_DISABILITY"
            with_disability_cnt += 1
        elif len(conditions) > 0 and not has_disability and "NONE" in conditions:
            disability_status = "NO_DISABILITY"
            without_disability_cnt += 1
        elif r["age"] is not None and len(conditions) == 0:
            disability_status = "NO_DISABILITY"
            without_disability_cnt += 1
        else:
            disability_status = "UNKNOWN_OR_UNVERIFIED"
            unknown_disability_cnt += 1

        is_sos = bool(r["sos_active"])
        if is_sos:
            active_sos_cnt += 1

        risk_lvl = str(r["flood_risk_level"] or "SAFE").upper()
        depth_cm = float(r["flood_depth_cm"] or 0.0)
        is_high_risk = risk_lvl in ("CRITICAL", "HIGH", "WARNING") or depth_cm >= 25.0
        if is_high_risk:
            high_risk_flood_cnt += 1

        # Check location staleness
        comm_status = str(r["comm_status"] or "ONLINE").upper()
        loc_ts_str = r["location_timestamp"] or ""
        is_stale = False
        if comm_status in ("UNREACHABLE", "OFFLINE"):
            is_stale = True
        elif not loc_ts_str or "stale" in loc_ts_str.lower():
            is_stale = True

        if is_stale:
            stale_location_cnt += 1

        matching_people.append({
            "personId": p_id,
            "name": r["name"],
            "lat": p_lat,
            "lng": p_lng,
            "distanceM": round(dist_m, 1),
            "locationName": r["location_name"] or r["address_landmark"] or "Avadi Basin",
            "locationTimestamp": r["location_timestamp"] or "Recently synchronized",
            "gpsAccuracyM": r["gps_accuracy_m"] or 8.0,
            "elevationM": r["elevation_m"] or 22.5,
            "disabilityStatus": disability_status,
            "medicalConditions": conditions,
            "medicalNotes": r["medical_notes"] or "None reported",
            "assistanceType": r["assistance_type"] or "NONE",
            "sosActive": is_sos,
            "floodRiskLevel": risk_lvl,
            "floodDepthCm": depth_cm,
            "rescuePriority": r["rescue_priority"] or "P3",
            "commStatus": comm_status,
            "heartRateBpm": r["heart_rate_bpm"],
            "spo2Percent": r["spo2_percent"],
            "dependentsCount": r["dependents_count"] or 0,
        })

    # Sort matching people by distance ascending
    matching_people.sort(key=lambda x: x["distanceM"])

    total_people = len(matching_people)
    pop_density = round(total_people / max(0.01, area_sq_km), 1)

    # Compute Tactical Rescue Prioritization for this geographical circle
    # Priority does NOT solely rely on disability or location: multi-factor formula
    priority_level = "P3 - ROUTINE SURVEILLANCE"
    priority_badge = "P3"
    priority_reason = "Normal baseline surveillance: No critical water depth or active distress beacons in sector."

    if active_sos_cnt > 0:
        priority_level = "P0 - CRITICAL EMERGENCY INTERVENTION"
        priority_badge = "P0"
        priority_reason = f"Active emergency SOS beacons detected ({active_sos_cnt} urgent calls for life-safety extraction)."
    elif high_risk_flood_cnt >= 2 and with_disability_cnt >= 1:
        priority_level = "P0 - CRITICAL EMERGENCY INTERVENTION"
        priority_badge = "P0"
        priority_reason = f"Dangerous combination: {high_risk_flood_cnt} persons in rising water with {with_disability_cnt} assisted-mobility individuals."
    elif high_risk_flood_cnt >= 1 or with_disability_cnt >= 2:
        priority_level = "P1 - HIGH RESCUE PRIORITY"
        priority_badge = "P1"
        priority_reason = f"Elevated hazard: {high_risk_flood_cnt} individuals in flood warning zone with {with_disability_cnt} vulnerable residents."
    elif total_people >= 5 or stale_location_cnt >= 2:
        priority_level = "P2 - MODERATE MONITORING"
        priority_badge = "P2"
        priority_reason = f"Moderate population cluster ({total_people} residents, {stale_location_cnt} stale telemetry links)."

    return {
        "success": True,
        "query": {
            "centerLat": c_lat,
            "centerLng": c_lng,
            "radiusM": r_meters,
            "radiusKm": round(r_meters / 1000.0, 2),
            "coverageAreaSqKm": round(area_sq_km, 3),
        },
        "summary": {
            "totalRegisteredIndividuals": total_people,
            "withDeclaredDisabilities": with_disability_cnt,
            "withoutDeclaredDisabilities": without_disability_cnt,
            "unknownOrUnverifiedDisability": unknown_disability_cnt,
            "activeSosRequests": active_sos_cnt,
            "inHighRiskFloodZones": high_risk_flood_cnt,
            "staleOrUnavailableLocation": stale_location_cnt,
            "populationDensityPerSqKm": pop_density,
            "rescuePriorityLevel": priority_level,
            "rescuePriorityBadge": priority_badge,
            "rescuePriorityReason": priority_reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        "individuals": matching_people,
    }
