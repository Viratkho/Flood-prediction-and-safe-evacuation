"""
Monitored Locations API Router (Section 4.B & Section 7).
Stores and validates monitored catchment sectors in persistent SQLite.
"""

from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status

from backend.schemas import LocationCreate, LocationResponse
from backend.crud import (
    create_location as crud_create_location,
    get_location_by_id,
    list_locations as crud_list_locations,
    delete_location as crud_delete_location
)

router = APIRouter(prefix="/api/locations", tags=["Monitored Locations"])


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def create_location(loc_in: LocationCreate):
    """
    Registers a new geographical location in SQLite with coordinate validation.
    Latitude: [-90.0, 90.0], Longitude: [-180.0, 180.0].
    """
    try:
        return crud_create_location(loc_in)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create location: {str(e)}"
        )


@router.get("", response_model=List[Dict[str, Any]])
def list_locations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200)
):
    """Lists monitored catchment locations."""
    return crud_list_locations(skip=skip, limit=limit)


@router.get("/{location_id}", response_model=Dict[str, Any])
def get_location(location_id: int):
    """Retrieves specific location by ID."""
    loc = get_location_by_id(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location #{location_id} not found.")
    return loc


@router.delete("/{location_id}")
def delete_location(location_id: int):
    """Deletes location by ID."""
    deleted = crud_delete_location(location_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Location #{location_id} not found.")
    return {"status": "DELETED", "id": location_id}
