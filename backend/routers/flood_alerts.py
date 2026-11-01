"""
Flood Alerts API Router (Section 4.D & Section 7).
Stores and manages emergency flood alerts and integrates with mobile gateway.
"""

import time
from typing import List, Dict, Any, Optional, Union
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse

from backend.database import get_db
from backend.models import alert_row_to_dict, flood_alert_row_to_dict
from backend.schemas import FloodAlertCreate, FloodAlertResponse
from backend.services.mobile_service import send_mobile_alert
from backend.crud import (
    create_flood_alert as crud_create_flood_alert,
    get_flood_alert_by_id,
    list_flood_alerts as crud_list_flood_alerts,
    list_active_flood_alerts as crud_list_active_flood_alerts
)

router = APIRouter(tags=["Flood Alerts"])


@router.post("/api/alerts", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def create_alert(alert_in: FloodAlertCreate):
    """Creates a new persistent flood alert in SQLite."""
    try:
        return crud_create_flood_alert(alert_in)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create flood alert: {str(e)}"
        )


@router.get("/api/alerts")
def get_alerts(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    """
    Returns alerts from SQLite.
    Includes both mobile broadcast records ('alerts') for telemetry backwards-compatibility
    and structured hydrological flood alerts ('flood_alerts').
    """
    with get_db() as conn:
        mobile_rows = conn.execute("SELECT * FROM mobile_alerts ORDER BY rowid DESC").fetchall()
        mobile_list = [alert_row_to_dict(r) for r in mobile_rows]

    flood_list = crud_list_flood_alerts(skip=skip, limit=limit)
    return {
        "alerts": mobile_list,
        "flood_alerts": flood_list,
        "total": len(mobile_list) + len(flood_list)
    }


@router.get("/api/alerts/active", response_model=List[Dict[str, Any]])
def get_active_alerts():
    """Retrieves all currently active flood alerts (is_active = 1)."""
    return crud_list_active_flood_alerts()


@router.get("/api/alerts/{alert_id}", response_model=Dict[str, Any])
def get_alert_by_id(alert_id: int):
    """Retrieves single flood alert by primary key ID."""
    alert = get_flood_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Flood Alert #{alert_id} not found.")
    return alert


@router.post("/api/alerts/send-mobile")
async def send_mobile(payload: Dict[str, Any]):
    """
    Emergency mobile alert dispatcher using free ntfy.sh and RFC 5724 native SMS URI.
    Maintained for full system compatibility.
    """
    try:
        mobile_number = payload.get("mobileNumber")
        recipient_name = payload.get("recipientName")
        alert_type = payload.get("alertType")
        message = payload.get("message")
        headline = payload.get("headline")
        person_id = payload.get("personId")

        result = await send_mobile_alert(
            mobile_number=mobile_number,
            recipient_name=recipient_name,
            alert_type=alert_type,
            message=message,
            headline=headline,
            person_id=person_id,
        )

        alert_record = result["alert"]

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO mobile_alerts (
                    id, timestamp, mobile_number, recipient_name, alert_type,
                    headline, message, status, gateway, free_api_used, native_sms_url, person_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert_record["id"],
                    alert_record["timestamp"],
                    alert_record["mobileNumber"],
                    alert_record["recipientName"],
                    alert_record["alertType"],
                    alert_record["headline"],
                    alert_record["message"],
                    alert_record["status"],
                    alert_record["gateway"],
                    alert_record.get("freeApiUsed"),
                    alert_record.get("nativeSmsUrl"),
                    person_id,
                ),
            )

            if person_id:
                now_str = time.strftime("%I:%M %p")
                conn.execute(
                    """
                    UPDATE people
                    SET last_communication_time = ?,
                        comm_status = 'ONLINE'
                    WHERE person_id = ?
                    """,
                    (now_str, person_id),
                )

        return result
    except ValueError as ve:
        return JSONResponse(status_code=400, content={"error": str(ve)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
