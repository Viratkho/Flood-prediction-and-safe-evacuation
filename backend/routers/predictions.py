"""
Flood Prediction API Router (Section 4.C, Section 6 & Section 7).
Directly connects the deterministic hydrological model with persistent SQLite storage.
Records inputs, real model outputs, and automatically generates alerts for high-risk evaluations.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status

from backend.database import get_db
from backend.schemas import PredictionCreate, PredictionResponse
from backend.services.prediction_service import calculate_flood_prediction
from backend.crud import (
    create_flood_prediction,
    get_prediction_by_id,
    get_latest_prediction as crud_get_latest_prediction,
    list_predictions as crud_list_predictions,
    delete_prediction as crud_delete_prediction
)

router = APIRouter(prefix="/api/predictions", tags=["Flood Predictions"])


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def submit_prediction(pred_in: PredictionCreate):
    """
    Executes the deterministic flood prediction engine and commits results to SQLite.
    Automatically generates emergency alerts if risk evaluates to HIGH or CRITICAL.
    """
    elevation_m = None
    if pred_in.location_id:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT elevation_m FROM locations WHERE id = ?", (pred_in.location_id,))
            row = cursor.fetchone()
            if row and row["elevation_m"] is not None:
                elevation_m = row["elevation_m"]

    # 1. Execute deterministic hydrological model (Preserving existing logic)
    model_output = calculate_flood_prediction(
        rainfall=pred_in.rainfall,
        water_level=pred_in.water_level,
        river_level=pred_in.river_level,
        soil_moisture=pred_in.soil_moisture,
        temperature=pred_in.temperature,
        humidity=pred_in.humidity,
        elevation_m=elevation_m
    )

    # 2. Persist record & history snapshot to SQLite in an ACID transaction
    try:
        saved_record = create_flood_prediction(pred_in, model_output)
        return saved_record
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist prediction record: {str(e)}"
        )


@router.get("", response_model=List[Dict[str, Any]])
def list_predictions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: Optional[int] = Query(None)
):
    """Lists historical flood predictions from SQLite."""
    return crud_list_predictions(skip=skip, limit=limit, user_id=user_id)


@router.get("/latest", response_model=Dict[str, Any])
def get_latest_prediction():
    """Retrieves the latest flood prediction record from SQLite."""
    row = crud_get_latest_prediction()
    if not row:
        raise HTTPException(status_code=404, detail="No prediction records found in database.")
    return row


@router.get("/{prediction_id}", response_model=Dict[str, Any])
def get_prediction(prediction_id: int):
    """Retrieves single flood prediction by primary key ID."""
    row = get_prediction_by_id(prediction_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Prediction #{prediction_id} not found.")
    return row


@router.delete("/{prediction_id}")
def delete_prediction(prediction_id: int):
    """Deletes a prediction record and its audit history from SQLite."""
    deleted = crud_delete_prediction(prediction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Prediction #{prediction_id} not found.")
    return {"status": "DELETED", "id": prediction_id}
