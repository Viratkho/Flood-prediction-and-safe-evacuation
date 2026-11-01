"""
Prediction History Audit Router (Section 4.E).
Retrieves immutable input/output snapshots of historical flood evaluations.
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.crud import (
    list_prediction_history,
    get_prediction_history_by_prediction_id
)

router = APIRouter(prefix="/api/history", tags=["Prediction History"])


@router.get("", response_model=List[Dict[str, Any]])
def get_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: Optional[int] = Query(None)
):
    """Lists immutable audit snapshots of prior flood predictions."""
    return list_prediction_history(skip=skip, limit=limit, user_id=user_id)


@router.get("/{prediction_id}", response_model=Dict[str, Any])
def get_prediction_history(prediction_id: int):
    """Retrieves immutable audit snapshot for a specific prediction ID."""
    hist = get_prediction_history_by_prediction_id(prediction_id)
    if not hist:
        raise HTTPException(
            status_code=404,
            detail=f"History snapshot for prediction #{prediction_id} not found."
        )
    return hist
