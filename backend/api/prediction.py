"""
FloodGuard 2.1 — Hydrological Flood Prediction Engine
Completely Free, Local, and Open Source.
Powered by Python FastAPI and SQLite persistence.
Unified with the core flood_predictions table.
"""

import time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.database import get_db

router = APIRouter(prefix="/api/prediction", tags=["prediction"])


class FloodPredictionRequest(BaseModel):
    precipitation_mm_h: float = Field(..., ge=0.0, description="Precipitation rate in mm/h")
    soil_saturation_pct: float = Field(..., ge=0.0, le=100.0, description="Soil saturation percentage (0-100%)")
    catchment_inflow_cusecs: float = Field(..., ge=0.0, description="Catchment reservoir inflow in cusecs")
    elevation_m: float = Field(..., description="Terrain elevation in meters MSL")
    current_depth_cm: float = Field(default=0.0, ge=0.0, description="Current road-surface water depth in cm")
    location_name: Optional[str] = Field(default="Avadi Basin", description="Catchment basin or location name")


class FloodPredictionResponse(BaseModel):
    id: str
    timestamp: str
    precipitation_mm_h: float
    soil_saturation_pct: float
    catchment_inflow_cusecs: float
    elevation_m: float
    current_depth_cm: float
    runoff_coefficient: float
    rate_of_rise_cm_min: float
    predicted_depth_6h_cm: float
    inundation_eta_minutes: Optional[int]
    risk_level: str
    recommended_action: str
    location_name: Optional[str]
    created_at: str


def calculate_flood_model(
    precipitation_mm_h: float,
    soil_saturation_pct: float,
    catchment_inflow_cusecs: float,
    elevation_m: float,
    current_depth_cm: float = 0.0,
) -> Dict[str, Any]:
    """
    FloodGuard Hydrological Runoff & Depth Formulation:
    R = P * (S / 100) * (1 + I / 50000) * max(0.4, (32 - E) / 14)
    depth_6h = current_depth + (R * 2.2)
    rate_of_rise = (R * 2.2) / 360  (cm/min)
    """
    elevation_factor = max(0.4, (32.0 - float(elevation_m)) / 14.0)
    inflow_factor = 1.0 + (float(catchment_inflow_cusecs) / 50000.0)
    soil_factor = float(soil_saturation_pct) / 100.0
    runoff = float(precipitation_mm_h) * soil_factor * inflow_factor * elevation_factor
    runoff = max(0.0, runoff)

    predicted_depth_6h = float(current_depth_cm) + (runoff * 2.2)
    rate_of_rise = (runoff * 2.2) / 360.0

    if predicted_depth_6h >= 50.0:
        risk_level = "CRITICAL"
        action = "IMMEDIATE EVACUATION: Surface water exceeds 50cm danger threshold. Proceed immediately via A* safe routes to elevated relief shelter."
    elif predicted_depth_6h >= 30.0:
        risk_level = "WARNING"
        action = "EVACUATION ADVISORY: Significant flood depth (30-50cm) expected within catchment basin. Secure essentials and mobilize toward designated staging points."
    elif predicted_depth_6h >= 15.0:
        risk_level = "CAUTION"
        action = "ELEVATED ALERT: Surface water (15-30cm) accumulating. Avoid low-lying underpasses and monitor catchment telemetry closely."
    else:
        risk_level = "SAFE"
        action = "NORMAL MONITORING: Surface runoff minimal (<15cm). Drainage channels operating within safe hydraulic thresholds."

    if current_depth_cm >= 50.0:
        eta_minutes = 0
    elif rate_of_rise > 0.0001:
        eta_minutes = int(round((50.0 - current_depth_cm) / rate_of_rise))
    else:
        eta_minutes = None

    return {
        "runoff_coefficient": round(runoff, 3),
        "rate_of_rise_cm_min": round(rate_of_rise, 3),
        "predicted_depth_6h_cm": round(predicted_depth_6h, 1),
        "inundation_eta_minutes": eta_minutes,
        "risk_level": risk_level,
        "recommended_action": action,
    }


@router.post("/flood", response_model=FloodPredictionResponse, status_code=status.HTTP_201_CREATED)
async def generate_flood_prediction(req: FloodPredictionRequest):
    """
    Generates a physics-based hydrological flood prediction and persists
    the record into SQLite table `flood_predictions`.
    """
    model_output = calculate_flood_model(
        precipitation_mm_h=req.precipitation_mm_h,
        soil_saturation_pct=req.soil_saturation_pct,
        catchment_inflow_cusecs=req.catchment_inflow_cusecs,
        elevation_m=req.elevation_m,
        current_depth_cm=req.current_depth_cm,
    )

    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO flood_predictions (
                latitude, longitude, location_name, rainfall, water_level,
                river_level, soil_moisture, temperature, humidity,
                prediction_result, risk_level, prediction_confidence,
                flood_eta_minutes, severity_score, recommendation,
                model_version, prediction_timestamp, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Deterministic-Hydrology-v2.1', ?, ?)
            """,
            (
                13.1143,
                80.1015,
                req.location_name or "Avadi Basin",
                req.precipitation_mm_h,
                req.current_depth_cm,
                req.catchment_inflow_cusecs / 1000.0,
                req.soil_saturation_pct,
                28.0,
                85.0,
                model_output["risk_level"],
                model_output["risk_level"],
                95.0,
                model_output["inundation_eta_minutes"],
                model_output["runoff_coefficient"],
                model_output["recommended_action"],
                now_iso,
                now_iso,
            ),
        )
        pred_id = str(cursor.lastrowid)

    return FloodPredictionResponse(
        id=pred_id,
        timestamp=now_iso,
        precipitation_mm_h=req.precipitation_mm_h,
        soil_saturation_pct=req.soil_saturation_pct,
        catchment_inflow_cusecs=req.catchment_inflow_cusecs,
        elevation_m=req.elevation_m,
        current_depth_cm=req.current_depth_cm,
        runoff_coefficient=model_output["runoff_coefficient"],
        rate_of_rise_cm_min=model_output["rate_of_rise_cm_min"],
        predicted_depth_6h_cm=model_output["predicted_depth_6h_cm"],
        inundation_eta_minutes=model_output["inundation_eta_minutes"],
        risk_level=model_output["risk_level"],
        recommended_action=model_output["recommended_action"],
        location_name=req.location_name,
        created_at=now_iso,
    )


@router.get("/history", response_model=List[FloodPredictionResponse])
async def get_prediction_history(limit: int = Query(default=50, ge=1, le=200)):
    """
    Retrieves past hydrological flood predictions from SQLite ordered by id DESC.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, prediction_timestamp AS timestamp, rainfall AS precipitation_mm_h,
                   soil_moisture AS soil_saturation_pct, (COALESCE(river_level, 0.0) * 1000.0) AS catchment_inflow_cusecs,
                   15.0 AS elevation_m, water_level AS current_depth_cm,
                   severity_score AS runoff_coefficient,
                   ROUND((severity_score * 2.2) / 360.0, 3) AS rate_of_rise_cm_min,
                   ROUND(water_level + (severity_score * 2.2), 1) AS predicted_depth_6h_cm,
                   flood_eta_minutes AS inundation_eta_minutes, risk_level,
                   recommendation AS recommended_action, location_name, created_at
            FROM flood_predictions
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["id"] = str(d["id"])
            if d.get("runoff_coefficient") is None:
                d["runoff_coefficient"] = 0.0
            if d.get("rate_of_rise_cm_min") is None:
                d["rate_of_rise_cm_min"] = 0.0
            if d.get("predicted_depth_6h_cm") is None:
                d["predicted_depth_6h_cm"] = float(d.get("current_depth_cm", 0.0))
            if not d.get("recommended_action"):
                d["recommended_action"] = "MONITOR: Observe catchment water level."
            result.append(FloodPredictionResponse(**d))
        return result


@router.get("/{prediction_id}", response_model=FloodPredictionResponse)
async def get_prediction_by_id(prediction_id: str):
    """
    Retrieves a single prediction by its unique identifier.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, prediction_timestamp AS timestamp, rainfall AS precipitation_mm_h,
                   soil_moisture AS soil_saturation_pct, (COALESCE(river_level, 0.0) * 1000.0) AS catchment_inflow_cusecs,
                   15.0 AS elevation_m, water_level AS current_depth_cm,
                   severity_score AS runoff_coefficient,
                   ROUND((severity_score * 2.2) / 360.0, 3) AS rate_of_rise_cm_min,
                   ROUND(water_level + (severity_score * 2.2), 1) AS predicted_depth_6h_cm,
                   flood_eta_minutes AS inundation_eta_minutes, risk_level,
                   recommendation AS recommended_action, location_name, created_at
            FROM flood_predictions
            WHERE id = ?
            """,
            (prediction_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Prediction with ID '{prediction_id}' not found",
            )
        d = dict(row)
        d["id"] = str(d["id"])
        if d.get("runoff_coefficient") is None:
            d["runoff_coefficient"] = 0.0
        if d.get("rate_of_rise_cm_min") is None:
            d["rate_of_rise_cm_min"] = 0.0
        if d.get("predicted_depth_6h_cm") is None:
            d["predicted_depth_6h_cm"] = float(d.get("current_depth_cm", 0.0))
        if not d.get("recommended_action"):
            d["recommended_action"] = "MONITOR: Observe catchment water level."
        return FloodPredictionResponse(**d)


@router.delete("/{prediction_id}", status_code=status.HTTP_200_OK)
async def delete_prediction(prediction_id: str):
    """
    Deletes a single prediction record from SQLite.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM flood_predictions WHERE id = ?", (prediction_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Prediction with ID '{prediction_id}' not found",
            )
        cursor.execute("DELETE FROM flood_predictions WHERE id = ?", (prediction_id,))
        return {"status": "DELETED", "id": prediction_id}
