"""
FloodGuard 2.1 — Family Safety & Location Sharing API
Direct multi-member location sharing, mutual consent verification,
stale-location fallbacks, emergency family SOS broadcasts, and flood-risk awareness.
"""

import time
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.database import get_db

router = APIRouter(prefix="/api/family", tags=["Family Safety & Location Sharing"])


def get_request_citizen_id(request: Request) -> str:
    """Extracts citizen personId from custom header, query param, or auth cookie."""
    citizen_id = request.headers.get("X-Citizen-Id")
    if citizen_id and citizen_id.strip():
        return citizen_id.strip()

    citizen_id = request.query_params.get("citizenId")
    if citizen_id and citizen_id.strip():
        return citizen_id.strip()

    # Fallback to local default demo citizen if unauthenticated
    return "P-101"


class ConnectionRequestPayload(BaseModel):
    targetPersonId: str = Field(..., description="Unique FloodGuard Person ID of family member (e.g. P-102)")
    relationship: Optional[str] = Field("Family Member", description="Family relationship label (e.g. Spouse, Parent, Child, Sibling)")


class ConnectionResponsePayload(BaseModel):
    connectionId: int = Field(..., description="ID of the family connection record")
    action: str = Field(..., description="Action: ACCEPT or REJECT")
    shareLocation: Optional[bool] = Field(True, description="Whether to grant location-sharing permission")


class PermissionUpdatePayload(BaseModel):
    connectionId: int = Field(..., description="ID of the family connection record")
    shareLocation: bool = Field(..., description="Whether to enable location sharing with this family member")


class FamilySosPayload(BaseModel):
    alertMessage: Optional[str] = Field("🚨 EMERGENCY: I need immediate assistance! Please check my location.", description="Emergency SOS message")
    lat: Optional[float] = Field(None, description="Current GPS latitude of sender")
    lng: Optional[float] = Field(None, description="Current GPS longitude of sender")
    accuracyM: Optional[float] = Field(None, description="GPS accuracy in meters")
    locationName: Optional[str] = Field(None, description="Nearest landmark or address")


@router.get("/members")
def get_connected_family_members(request: Request):
    """
    Returns accepted family members for the requesting citizen.
    Includes live / last known coordinates ONLY when explicit location-sharing permission is active.
    """
    citizen_id = get_request_citizen_id(request)

    with get_db() as conn:
        # Check that requesting citizen exists
        caller = conn.execute("SELECT person_id, name FROM people WHERE person_id = ?", (citizen_id,)).fetchone()
        if not caller:
            return JSONResponse(status_code=404, content={"error": f"Citizen '{citizen_id}' not found in registry."})

        # Fetch accepted connections where citizen is either requester or invited
        query = """
            SELECT fc.id as connection_id,
                   fc.requester_id,
                   fc.invited_id,
                   fc.relationship,
                   fc.status,
                   fc.created_at,
                   fc.accepted_at,
                   p.person_id,
                   p.name,
                   p.contact_number,
                   p.lat,
                   p.lng,
                   p.location_name,
                   p.address_landmark,
                   p.location_timestamp,
                   p.gps_accuracy_m,
                   p.elevation_m,
                   p.flood_depth_cm,
                   p.flood_risk_level,
                   p.sos_active,
                   p.comm_status,
                   p.battery_percent,
                   flp.share_location as their_share_permission,
                   my_perm.share_location as my_share_permission
            FROM family_connections fc
            JOIN people p ON (p.person_id = CASE WHEN fc.requester_id = ? THEN fc.invited_id ELSE fc.requester_id END)
            LEFT JOIN family_location_permissions flp ON (flp.connection_id = fc.id AND flp.user_id = p.person_id)
            LEFT JOIN family_location_permissions my_perm ON (my_perm.connection_id = fc.id AND my_perm.user_id = ?)
            WHERE (fc.requester_id = ? OR fc.invited_id = ?) AND fc.status = 'ACCEPTED'
        """
        rows = conn.execute(query, (citizen_id, citizen_id, citizen_id, citizen_id)).fetchall()

        # Check for any active family SOS alerts
        active_sos_rows = conn.execute(
            """
            SELECT * FROM family_sos_alerts
            WHERE status = 'ACTIVE'
            ORDER BY id DESC
            """
        ).fetchall()
        sos_map = {r["user_id"]: dict(r) for r in active_sos_rows}

    members = []
    for r in rows:
        member_id = r["person_id"]
        their_permission = bool(r["their_share_permission"] if r["their_share_permission"] is not None else 1)
        my_permission = bool(r["my_share_permission"] if r["my_share_permission"] is not None else 1)

        # Check staleness of location
        loc_ts = r["location_timestamp"] or "Unknown"
        comm_status = str(r["comm_status"] or "ONLINE").upper()
        is_stale = False
        if comm_status in ("UNREACHABLE", "OFFLINE") or "stale" in loc_ts.lower():
            is_stale = True

        sos_info = sos_map.get(member_id)
        is_sos_active = bool(r["sos_active"] or (sos_info is not None))

        risk_lvl = str(r["flood_risk_level"] or "SAFE").upper()
        depth_cm = float(r["flood_depth_cm"] or 0.0)
        is_in_flood_zone = risk_lvl in ("CRITICAL", "HIGH", "WARNING") or depth_cm >= 25.0

        member_dict = {
            "connectionId": r["connection_id"],
            "personId": member_id,
            "name": r["name"],
            "relationship": r["relationship"] or "Family Member",
            "contactNumber": r["contact_number"],
            "locationSharingStatus": "ACTIVE" if their_permission else "PAUSED",
            "isLocationPermitted": their_permission,
            "myLocationSharedWithThem": my_permission,
            "connectedSince": r["accepted_at"] or r["created_at"],
            "lat": r["lat"] if their_permission else None,
            "lng": r["lng"] if their_permission else None,
            "locationName": (r["location_name"] or r["address_landmark"] or "Avadi Basin") if their_permission else "Location Hidden by User",
            "lastUpdated": loc_ts if their_permission else "Permission paused",
            "locationLabel": "LAST KNOWN LOCATION" if (is_stale and their_permission) else "LIVE VERIFIED" if their_permission else "LOCATION PAUSED",
            "isStale": is_stale,
            "gpsAccuracyM": r["gps_accuracy_m"] if their_permission else None,
            "elevationM": r["elevation_m"] if their_permission else None,
            "commStatus": comm_status,
            "batteryPercent": r["battery_percent"] or 90,
            "floodRiskLevel": risk_lvl,
            "floodDepthCm": depth_cm,
            "isInHighRiskFloodZone": is_in_flood_zone,
            "floodRiskAdvisory": (
                f"HIGH FLOOD RISK: Member is within an active flood sector ({depth_cm}cm water level)."
                if is_in_flood_zone
                else "SAFE: Member is currently on higher terrain outside active flood hazard zones."
            ),
            "sosActive": is_sos_active,
            "sosDetails": {
                "message": sos_info["alert_message"],
                "timestamp": sos_info["timestamp"],
            } if sos_info else None,
        }
        members.append(member_dict)

    return {
        "success": True,
        "citizenId": citizen_id,
        "totalConnected": len(members),
        "activeCount": sum(1 for m in members if m["isLocationPermitted"]),
        "sosCount": sum(1 for m in members if m["sosActive"]),
        "floodRiskCount": sum(1 for m in members if m["isInHighRiskFloodZone"]),
        "members": members,
    }


@router.get("/requests")
def get_family_connection_requests(request: Request):
    """
    Returns pending incoming and outgoing connection requests for the citizen.
    """
    citizen_id = get_request_citizen_id(request)

    with get_db() as conn:
        # 1. Incoming requests: where invited_id == citizen_id AND status == 'PENDING'
        incoming_rows = conn.execute(
            """
            SELECT fc.id as connection_id,
                   fc.requester_id,
                   fc.relationship,
                   fc.created_at,
                   p.name as requester_name,
                   p.contact_number as requester_phone,
                   p.location_name
            FROM family_connections fc
            JOIN people p ON p.person_id = fc.requester_id
            WHERE fc.invited_id = ? AND fc.status = 'PENDING'
            ORDER BY fc.id DESC
            """,
            (citizen_id,),
        ).fetchall()

        # 2. Outgoing requests: where requester_id == citizen_id AND status == 'PENDING'
        outgoing_rows = conn.execute(
            """
            SELECT fc.id as connection_id,
                   fc.invited_id,
                   fc.relationship,
                   fc.created_at,
                   p.name as invited_name,
                   p.contact_number as invited_phone
            FROM family_connections fc
            JOIN people p ON p.person_id = fc.invited_id
            WHERE fc.requester_id = ? AND fc.status = 'PENDING'
            ORDER BY fc.id DESC
            """,
            (citizen_id,),
        ).fetchall()

    return {
        "success": True,
        "citizenId": citizen_id,
        "incoming": [dict(r) for r in incoming_rows],
        "outgoing": [dict(r) for r in outgoing_rows],
    }


@router.post("/request")
def send_family_connection_request(payload: ConnectionRequestPayload, request: Request):
    """
    Sends an invitation to connect with a family member using their unique FloodGuard Person ID.
    Prevents duplicate requests and self-connection.
    """
    citizen_id = get_request_citizen_id(request)
    target_id = payload.targetPersonId.strip().upper()
    relationship = payload.relationship.strip() if payload.relationship else "Family Member"

    if not target_id:
        raise HTTPException(status_code=400, detail="Target FloodGuard ID is required.")

    if target_id == citizen_id.upper():
        raise HTTPException(status_code=400, detail="Cannot establish family connection with yourself.")

    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        # Check target existence
        target = conn.execute("SELECT person_id, name FROM people WHERE UPPER(person_id) = ?", (target_id,)).fetchone()
        if not target:
            raise HTTPException(
                status_code=404,
                detail=f"FloodGuard ID '{target_id}' does not exist. Please verify the ID with your family member."
            )
        exact_target_id = target["person_id"]

        # Check existing connection in either direction
        existing = conn.execute(
            """
            SELECT id, requester_id, invited_id, status FROM family_connections
            WHERE (requester_id = ? AND invited_id = ?) OR (requester_id = ? AND invited_id = ?)
            """,
            (citizen_id, exact_target_id, exact_target_id, citizen_id),
        ).fetchone()

        if existing:
            st = existing["status"]
            if st == "ACCEPTED":
                raise HTTPException(status_code=400, detail=f"You are already connected with {target['name']} ({exact_target_id}).")
            elif st == "PENDING":
                raise HTTPException(status_code=400, detail=f"A connection request is already pending with {target['name']}.")
            else:
                # Re-activate previously rejected connection
                conn.execute(
                    """
                    UPDATE family_connections
                    SET requester_id = ?, invited_id = ?, relationship = ?, status = 'PENDING', updated_at = ?
                    WHERE id = ?
                    """,
                    (citizen_id, exact_target_id, relationship, now_iso, existing["id"]),
                )
                conn.execute(
                    """
                    INSERT OR REPLACE INTO family_location_permissions (connection_id, user_id, share_location, updated_at)
                    VALUES (?, ?, 1, ?)
                    """,
                    (existing["id"], citizen_id, now_iso),
                )
                return {
                    "success": True,
                    "connectionId": existing["id"],
                    "message": f"Connection request re-sent to {target['name']} ({exact_target_id}).",
                }

        # Insert new pending connection
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO family_connections (requester_id, invited_id, relationship, status, created_at, accepted_at, updated_at)
            VALUES (?, ?, ?, 'PENDING', ?, NULL, ?)
            """,
            (citizen_id, exact_target_id, relationship, now_iso, now_iso),
        )
        new_conn_id = cursor.lastrowid

        # Requester grants initial location permission by default
        cursor.execute(
            """
            INSERT INTO family_location_permissions (connection_id, user_id, share_location, updated_at)
            VALUES (?, ?, 1, ?)
            """,
            (new_conn_id, citizen_id, now_iso),
        )

    return {
        "success": True,
        "connectionId": new_conn_id,
        "targetName": target["name"],
        "targetId": exact_target_id,
        "message": f"Connection invitation sent to {target['name']} ({exact_target_id}). Location sharing will activate once accepted.",
    }


@router.post("/respond")
def respond_to_connection_request(payload: ConnectionResponsePayload, request: Request):
    """
    Accepts or rejects an incoming family connection request.
    Only the invited user can respond.
    """
    citizen_id = get_request_citizen_id(request)
    conn_id = payload.connectionId
    action = payload.action.upper()
    share_loc = 1 if payload.shareLocation else 0

    if action not in ("ACCEPT", "REJECT"):
        raise HTTPException(status_code=400, detail="Action must be ACCEPT or REJECT.")

    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        record = conn.execute(
            "SELECT * FROM family_connections WHERE id = ?",
            (conn_id,),
        ).fetchone()

        if not record:
            raise HTTPException(status_code=404, detail="Connection request not found.")

        if record["invited_id"] != citizen_id:
            raise HTTPException(status_code=403, detail="Unauthorized: Only the invited family member can respond to this request.")

        if action == "ACCEPT":
            conn.execute(
                """
                UPDATE family_connections
                SET status = 'ACCEPTED', accepted_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now_iso, now_iso, conn_id),
            )
            # Store responder's location permission
            conn.execute(
                """
                INSERT OR REPLACE INTO family_location_permissions (connection_id, user_id, share_location, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (conn_id, citizen_id, share_loc, now_iso),
            )
            msg = "Family connection accepted. Mutual location sharing is now active on the map."
        else:
            conn.execute(
                """
                UPDATE family_connections
                SET status = 'REJECTED', updated_at = ?
                WHERE id = ?
                """,
                (now_iso, conn_id),
            )
            msg = "Connection request declined."

    return {"success": True, "action": action, "connectionId": conn_id, "message": msg}


@router.post("/permission")
def update_location_permission(payload: PermissionUpdatePayload, request: Request):
    """
    Enables or disables location-sharing with a specific family member connection.
    """
    citizen_id = get_request_citizen_id(request)
    conn_id = payload.connectionId
    share_val = 1 if payload.shareLocation else 0
    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        record = conn.execute(
            "SELECT * FROM family_connections WHERE id = ? AND (requester_id = ? OR invited_id = ?)",
            (conn_id, citizen_id, citizen_id),
        ).fetchone()

        if not record:
            raise HTTPException(status_code=404, detail="Active family connection not found.")

        conn.execute(
            """
            INSERT OR REPLACE INTO family_location_permissions (connection_id, user_id, share_location, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (conn_id, citizen_id, share_val, now_iso),
        )

    status_str = "ACTIVE" if share_val else "PAUSED"
    return {
        "success": True,
        "connectionId": conn_id,
        "locationSharingStatus": status_str,
        "message": f"Location sharing with this family member is now {status_str}.",
    }


@router.delete("/connection/{connection_id}")
def revoke_family_connection(connection_id: int, request: Request):
    """
    Removes a family connection and revokes all location-sharing permissions.
    """
    citizen_id = get_request_citizen_id(request)

    with get_db() as conn:
        record = conn.execute(
            "SELECT * FROM family_connections WHERE id = ? AND (requester_id = ? OR invited_id = ?)",
            (connection_id, citizen_id, citizen_id),
        ).fetchone()

        if not record:
            raise HTTPException(status_code=404, detail="Connection record not found.")

        conn.execute("DELETE FROM family_location_permissions WHERE connection_id = ?", (connection_id,))
        conn.execute("DELETE FROM family_connections WHERE id = ?", (connection_id,))

    return {"success": True, "connectionId": connection_id, "message": "Family connection successfully removed."}


@router.post("/sos")
def broadcast_family_sos(payload: FamilySosPayload, request: Request):
    """
    Broadcasts an urgent Family Emergency SOS alert to all connected family members.
    Highlights sender on family map and stores emergency timestamp & coordinates.
    """
    citizen_id = get_request_citizen_id(request)
    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        caller = conn.execute("SELECT person_id, name, lat, lng, location_name FROM people WHERE person_id = ?", (citizen_id,)).fetchone()
        if not caller:
            raise HTTPException(status_code=404, detail=f"Citizen '{citizen_id}' not found.")

        caller_name = caller["name"]
        lat = payload.lat if payload.lat is not None else caller["lat"]
        lng = payload.lng if payload.lng is not None else caller["lng"]
        loc_name = payload.locationName or caller["location_name"] or "Avadi Basin"

        # Update caller's coordinates and sos_active in people table
        conn.execute(
            """
            UPDATE people
            SET sos_active = 1,
                lat = ?,
                lng = ?,
                location_timestamp = ?
            WHERE person_id = ?
            """,
            (lat, lng, now_iso, citizen_id),
        )

        # Insert active family SOS record
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO family_sos_alerts (user_id, sender_name, lat, lng, accuracy_m, location_name, alert_message, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            """,
            (citizen_id, caller_name, lat, lng, payload.accuracyM or 8.0, loc_name, payload.alertMessage, now_iso),
        )
        sos_id = cursor.lastrowid

        # Find all connected family members who will receive this broadcast
        connected_rows = conn.execute(
            """
            SELECT CASE WHEN requester_id = ? THEN invited_id ELSE requester_id END as family_member_id
            FROM family_connections
            WHERE (requester_id = ? OR invited_id = ?) AND status = 'ACCEPTED'
            """,
            (citizen_id, citizen_id, citizen_id),
        ).fetchall()
        connected_ids = [r["family_member_id"] for r in connected_rows]

    return {
        "success": True,
        "sosId": sos_id,
        "senderId": citizen_id,
        "senderName": caller_name,
        "lat": lat,
        "lng": lng,
        "locationName": loc_name,
        "alertMessage": payload.alertMessage,
        "timestamp": now_iso,
        "notifiedFamilyCount": len(connected_ids),
        "notifiedFamilyIds": connected_ids,
        "message": f"EMERGENCY SOS broadcasted to {len(connected_ids)} connected family members.",
    }


@router.post("/sos/cancel")
def cancel_family_sos(request: Request):
    """
    Cancels active SOS status for the requesting citizen.
    """
    citizen_id = get_request_citizen_id(request)

    with get_db() as conn:
        conn.execute("UPDATE people SET sos_active = 0 WHERE person_id = ?", (citizen_id,))
        conn.execute("UPDATE family_sos_alerts SET status = 'RESOLVED' WHERE user_id = ? AND status = 'ACTIVE'", (citizen_id,))

    return {"success": True, "message": "Emergency SOS alert cancelled. Status reset to normal."}
