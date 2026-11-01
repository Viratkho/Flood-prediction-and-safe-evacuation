import time
import json
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request
from backend.api.auth_admin import check_admin_rbac
from fastapi.responses import JSONResponse
from backend.database import get_db
from backend.models import incident_row_to_dict

router = APIRouter()

PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4}

@router.get("/api/incidents")
def get_incidents():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM incidents").fetchall()
        incidents = [incident_row_to_dict(r) for r in rows]

    # Sort by Immediate Danger (P0) first, then priority rank (P0-P4), then rowid/createdAt
    sorted_incidents = sorted(
        incidents,
        key=lambda x: (
            0 if x.get("isImmediateDanger") else 1,
            PRIORITY_ORDER.get(x.get("priority", "P3"), 99),
        ),
    )

    active_count = len([i for i in sorted_incidents if i.get("status") != "RESOLVED"])
    return {
        "total": len(sorted_incidents),
        "activeCount": active_count,
        "incidents": sorted_incidents,
    }

@router.post("/api/incidents/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: str, payload: Dict[str, Any] = None):
    payload = payload or {}
    operator = payload.get("operator") or payload.get("operatorName") or "Duty Commander (HQ Desk 1)"
    note = payload.get("note") or "Incident acknowledged via Command Dashboard"
    now_str = time.strftime("%I:%M %p")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if not row:
            return JSONResponse(status_code=404, content={"error": "Incident not found"})

        incident = incident_row_to_dict(row)
        incident["status"] = "ACKNOWLEDGED"
        incident["acknowledgedAt"] = now_str
        incident["acknowledgedBy"] = operator
        incident["auditTrail"].append({
            "timestamp": now_str,
            "operator": operator,
            "action": "ACKNOWLEDGED",
            "note": note,
        })

        conn.execute(
            """
            UPDATE incidents
            SET status = ?,
                acknowledged_at = ?,
                acknowledged_by = ?,
                audit_trail = ?
            WHERE id = ?
            """,
            (
                incident["status"],
                incident["acknowledgedAt"],
                incident["acknowledgedBy"],
                json.dumps(incident["auditTrail"]),
                incident_id,
            ),
        )

    return {"success": True, "incident": incident}

@router.post("/api/incidents/{incident_id}/assign")
def assign_incident(incident_id: str, request: Request, payload: Dict[str, Any] = None):
    check_admin_rbac(request)
    payload = payload or {}
    responder_id = payload.get("responderId")
    responder_name = payload.get("responderName") or "Tactical Rescue Unit"
    operator = payload.get("operator") or payload.get("operatorName") or "Duty Commander"
    now_str = time.strftime("%I:%M %p")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if not row:
            return JSONResponse(status_code=404, content={"error": "Incident not found"})

        incident = incident_row_to_dict(row)
        incident["assignedResponderId"] = responder_id
        incident["assignedResponderName"] = responder_name
        incident["assignedAt"] = now_str
        incident["status"] = "RESPONDER_EN_ROUTE"
        incident["auditTrail"].append({
            "timestamp": now_str,
            "operator": operator,
            "action": "RESPONDER_ASSIGNED",
            "note": f"Dispatched {responder_name} to coordinates ({incident.get('lat', 0):.4f}, {incident.get('lng', 0):.4f})",
        })

        conn.execute(
            """
            UPDATE incidents
            SET assigned_responder_id = ?,
                assigned_responder_name = ?,
                assigned_at = ?,
                status = ?,
                audit_trail = ?
            WHERE id = ?
            """,
            (
                incident["assignedResponderId"],
                incident["assignedResponderName"],
                incident["assignedAt"],
                incident["status"],
                json.dumps(incident["auditTrail"]),
                incident_id,
            ),
        )

        # Update person if exists
        person_id = incident.get("personId")
        if person_id:
            conn.execute(
                """
                UPDATE people
                SET assigned_responder_id = ?,
                    assigned_responder_name = ?
                WHERE person_id = ?
                """,
                (responder_id, responder_name, person_id),
            )

    return {"success": True, "incident": incident}

@router.post("/api/incidents/{incident_id}/status")
def update_incident_status(incident_id: str, payload: Dict[str, Any] = None):
    payload = payload or {}
    new_status = payload.get("status")
    operator = payload.get("operator") or payload.get("operatorName") or "Duty Commander"
    note = payload.get("note") or f"Incident status updated to {new_status}"
    now_str = time.strftime("%I:%M %p")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if not row:
            return JSONResponse(status_code=404, content={"error": "Incident not found"})

        incident = incident_row_to_dict(row)
        incident["status"] = new_status
        incident["auditTrail"].append({
            "timestamp": now_str,
            "operator": operator,
            "action": f"STATUS_UPDATED_{new_status}",
            "note": note,
        })

        conn.execute(
            """
            UPDATE incidents
            SET status = ?,
                audit_trail = ?
            WHERE id = ?
            """,
            (incident["status"], json.dumps(incident["auditTrail"]), incident_id),
        )

    return {"success": True, "incident": incident}

@router.post("/api/incidents/{incident_id}/resolve")
def resolve_incident(incident_id: str, request: Request, payload: Dict[str, Any] = None):
    check_admin_rbac(request)
    payload = payload or {}
    notes = payload.get("notes") or "Extracted safely to relief shelter"
    operator = payload.get("operator") or payload.get("operatorName") or "Duty Commander"
    now_str = time.strftime("%I:%M %p")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if not row:
            return JSONResponse(status_code=404, content={"error": "Incident not found"})

        incident = incident_row_to_dict(row)
        incident["status"] = "RESOLVED"
        incident["resolvedAt"] = now_str
        incident["resolvedBy"] = operator
        incident["resolutionNotes"] = notes
        incident["auditTrail"].append({
            "timestamp": now_str,
            "operator": operator,
            "action": "RESOLVED",
            "note": notes,
        })

        conn.execute(
            """
            UPDATE incidents
            SET status = ?,
                resolved_at = ?,
                resolved_by = ?,
                resolution_notes = ?,
                audit_trail = ?
            WHERE id = ?
            """,
            (
                incident["status"],
                incident["resolvedAt"],
                incident["resolvedBy"],
                incident["resolutionNotes"],
                json.dumps(incident["auditTrail"]),
                incident_id,
            ),
        )

    return {"success": True, "incident": incident}
