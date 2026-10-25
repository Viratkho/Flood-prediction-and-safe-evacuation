import time
from typing import Dict, Any
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from backend.database import get_db
from backend.models import alert_row_to_dict
from backend.services.mobile_service import send_mobile_alert

router = APIRouter()

@router.get("/api/alerts")
def get_alerts():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM mobile_alerts ORDER BY rowid DESC").fetchall()
        alerts_list = [alert_row_to_dict(r) for r in rows]
    return {"alerts": alerts_list}

@router.post("/api/alerts/send-mobile")
async def send_mobile(payload: Dict[str, Any]):
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
