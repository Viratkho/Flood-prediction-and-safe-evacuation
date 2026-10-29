import os
import json
import time
import hmac
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from backend.database import get_db
from backend.models import person_row_to_dict

router = APIRouter(prefix="/api/auth/qr", tags=["Authentication QR"])

# In-memory sliding window rate-limiter
_rate_limits: Dict[str, list] = {}

def check_rate_limit(key: str, max_calls: int = 30, window_seconds: int = 60) -> bool:
    now = time.time()
    history = _rate_limits.setdefault(key, [])
    # purge entries older than window
    history[:] = [t for t in history if now - t < window_seconds]
    if len(history) >= max_calls:
        return False
    history.append(now)
    return True

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def parse_user_agent(request: Request) -> Dict[str, str]:
    ua = request.headers.get("user-agent", "Unknown Device")
    platform = "Desktop"
    if "Mobile" in ua or "Android" in ua or "iPhone" in ua:
        platform = "Mobile Device"
    elif "Tablet" in ua or "iPad" in ua:
        platform = "Tablet"

    browser = "Web Browser"
    if "Edg" in ua:
        browser = "Microsoft Edge"
    elif "Chrome" in ua:
        browser = "Google Chrome"
    elif "Firefox" in ua:
        browser = "Mozilla Firefox"
    elif "Safari" in ua:
        browser = "Apple Safari"

    return {
        "userAgent": ua[:120],
        "platform": platform,
        "browser": browser,
        "ip": get_client_ip(request),
        "requestedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    }


@router.post("/create")
async def create_pairing_session(request: Request):
    """
    Device B initiates a pairing session.
    Generates a cryptographically secure token and session ID with 120s expiration.
    Returns session ID, raw token for Device B to keep, and QR data payload.
    """
    ip = get_client_ip(request)
    if not check_rate_limit(f"create:{ip}", max_calls=25, window_seconds=60):
        return JSONResponse(
            status_code=429,
            content={"error": "Too many QR creation requests. Please wait a moment."},
        )

    try:
        body = await request.json()
    except Exception:
        body = {}

    target_info = body.get("deviceInfo") or body.get("targetDeviceInfo") or parse_user_agent(request)
    if "ip" not in target_info:
        target_info["ip"] = ip

    session_id = f"PAIR-{secrets.token_hex(6).upper()}"
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    now_utc = datetime.now(timezone.utc)
    created_at = now_utc.isoformat()
    expires_at = (now_utc + timedelta(seconds=120)).isoformat()

    qr_payload = json.dumps({
        "type": "FLOODGUARD_QR_LOGIN",
        "sessionId": session_id,
        "token": raw_token,
        "v": 1,
    })

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO device_pairing_sessions (
                session_id, token_hash, status, created_at, expires_at,
                user_id, source_device_info, target_device_info,
                scanned_at, approved_at, completed_at
            ) VALUES (?, ?, 'PENDING', ?, ?, NULL, NULL, ?, NULL, NULL, NULL)
            """,
            (session_id, token_hash, created_at, expires_at, json.dumps(target_info)),
        )

    return {
        "success": True,
        "sessionId": session_id,
        "token": raw_token,
        "qrData": qr_payload,
        "expiresIn": 120,
        "expiresAt": expires_at,
    }


@router.get("/status/{session_id}")
def get_pairing_status(session_id: str):
    """
    Device B periodically polls this endpoint to detect scan, approval, or completion.
    Automatically flags expired sessions.
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM device_pairing_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        if not row:
            return JSONResponse(status_code=404, content={"error": "Pairing session not found"})

        status = row["status"]
        expires_at_dt = datetime.fromisoformat(row["expires_at"])
        if datetime.now(timezone.utc) > expires_at_dt and status in ("PENDING", "SCANNED"):
            status = "EXPIRED"
            conn.execute(
                "UPDATE device_pairing_sessions SET status = 'EXPIRED' WHERE session_id = ?",
                (session_id,),
            )

        return {
            "sessionId": session_id,
            "status": status,
            "createdAt": row["created_at"],
            "expiresAt": row["expires_at"],
            "scannedAt": row["scanned_at"],
            "approvedAt": row["approved_at"],
            "completedAt": row["completed_at"],
        }


@router.post("/scan")
async def scan_pairing_qr(request: Request):
    """
    Device A (authenticated user) scans the QR code on Device B.
    Validates token and associates Device A's authenticated personId.
    Transitions status to SCANNED and returns target device details for user confirmation.
    """
    ip = get_client_ip(request)
    if not check_rate_limit(f"scan:{ip}", max_calls=35, window_seconds=60):
        return JSONResponse(
            status_code=429,
            content={"error": "Too many scan attempts. Please wait a moment."},
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Malformed JSON payload"})

    session_id = (body.get("sessionId") or "").strip()
    token = (body.get("token") or "").strip()
    person_id = (body.get("personId") or "").strip()

    if not session_id or not token or not person_id:
        return JSONResponse(
            status_code=400,
            content={"error": "Missing sessionId, token, or personId"},
        )

    source_info = body.get("sourceDeviceInfo") or parse_user_agent(request)
    if "ip" not in source_info:
        source_info["ip"] = ip

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now_utc = datetime.now(timezone.utc)

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM device_pairing_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        if not row:
            return JSONResponse(status_code=404, content={"error": "Pairing session not found"})

        # Constant-time comparison of token hashes
        if not hmac.compare_digest(row["token_hash"], token_hash):
            return JSONResponse(status_code=401, content={"error": "Invalid pairing token"})

        expires_at_dt = datetime.fromisoformat(row["expires_at"])
        if now_utc > expires_at_dt:
            conn.execute(
                "UPDATE device_pairing_sessions SET status = 'EXPIRED' WHERE session_id = ?",
                (session_id,),
            )
            return JSONResponse(status_code=400, content={"error": "Pairing session has expired"})

        if row["status"] != "PENDING":
            return JSONResponse(
                status_code=400,
                content={"error": f"Pairing session is already {row['status'].lower()}"},
            )

        # Verify person exists in database
        person_row = conn.execute(
            "SELECT * FROM people WHERE person_id = ?",
            (person_id,),
        ).fetchone()

        if not person_row:
            return JSONResponse(
                status_code=404,
                content={"error": f"Authenticated user '{person_id}' not found in registry"},
            )

        scanned_at = now_utc.isoformat()
        conn.execute(
            """
            UPDATE device_pairing_sessions
            SET status = 'SCANNED',
                user_id = ?,
                source_device_info = ?,
                scanned_at = ?
            WHERE session_id = ?
            """,
            (person_id, json.dumps(source_info), scanned_at, session_id),
        )

        target_info = {}
        if row["target_device_info"]:
            try:
                target_info = json.loads(row["target_device_info"])
            except Exception:
                target_info = {"raw": row["target_device_info"]}

        return {
            "success": True,
            "status": "SCANNED",
            "targetDeviceInfo": target_info,
            "message": "QR code scanned. Please approve login on your device.",
        }


@router.post("/approve")
async def approve_pairing(request: Request):
    """
    Device A approves the pairing after reviewing the target device details.
    Transitions status to APPROVED.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Malformed JSON payload"})

    session_id = (body.get("sessionId") or "").strip()
    token = (body.get("token") or "").strip()
    person_id = (body.get("personId") or "").strip()

    if not session_id or not token or not person_id:
        return JSONResponse(
            status_code=400,
            content={"error": "Missing sessionId, token, or personId"},
        )

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now_utc = datetime.now(timezone.utc)

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM device_pairing_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        if not row:
            return JSONResponse(status_code=404, content={"error": "Pairing session not found"})

        if not hmac.compare_digest(row["token_hash"], token_hash):
            return JSONResponse(status_code=401, content={"error": "Invalid pairing token"})

        expires_at_dt = datetime.fromisoformat(row["expires_at"])
        if now_utc > expires_at_dt:
            conn.execute(
                "UPDATE device_pairing_sessions SET status = 'EXPIRED' WHERE session_id = ?",
                (session_id,),
            )
            return JSONResponse(status_code=400, content={"error": "Pairing session has expired"})

        if row["status"] != "SCANNED":
            return JSONResponse(
                status_code=400,
                content={"error": f"Cannot approve session in state '{row['status']}'"},
            )

        if row["user_id"] != person_id:
            return JSONResponse(
                status_code=403,
                content={"error": "Account mismatch: Session belongs to a different user"},
            )

        approved_at = now_utc.isoformat()
        conn.execute(
            """
            UPDATE device_pairing_sessions
            SET status = 'APPROVED',
                approved_at = ?
            WHERE session_id = ?
            """,
            (approved_at, session_id),
        )

        return {
            "success": True,
            "status": "APPROVED",
            "message": "Cross-device pairing authorized successfully.",
        }


@router.post("/reject")
async def reject_pairing(request: Request):
    """
    Device A rejects the pairing request.
    Transitions status to REJECTED.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Malformed JSON payload"})

    session_id = (body.get("sessionId") or "").strip()
    token = (body.get("token") or "").strip()

    if not session_id or not token:
        return JSONResponse(status_code=400, content={"error": "Missing sessionId or token"})

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM device_pairing_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        if not row:
            return JSONResponse(status_code=404, content={"error": "Pairing session not found"})

        if not hmac.compare_digest(row["token_hash"], token_hash):
            return JSONResponse(status_code=401, content={"error": "Invalid pairing token"})

        conn.execute(
            "UPDATE device_pairing_sessions SET status = 'REJECTED' WHERE session_id = ?",
            (session_id,),
        )

        return {
            "success": True,
            "status": "REJECTED",
            "message": "Pairing request rejected.",
        }


@router.post("/complete")
async def complete_pairing(request: Request):
    """
    Device B calls this endpoint after detecting APPROVED status.
    Device B provides the secret token.
    Atomically marks session as COMPLETED (single-use guarantee).
    Returns the authenticated user's account information for Device B to establish its session.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Malformed JSON payload"})

    session_id = (body.get("sessionId") or "").strip()
    token = (body.get("token") or "").strip()

    if not session_id or not token:
        return JSONResponse(status_code=400, content={"error": "Missing sessionId or token"})

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now_utc = datetime.now(timezone.utc)

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM device_pairing_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        if not row:
            return JSONResponse(status_code=404, content={"error": "Pairing session not found"})

        if not hmac.compare_digest(row["token_hash"], token_hash):
            return JSONResponse(status_code=401, content={"error": "Invalid pairing token"})

        expires_at_dt = datetime.fromisoformat(row["expires_at"])
        if now_utc > expires_at_dt:
            conn.execute(
                "UPDATE device_pairing_sessions SET status = 'EXPIRED' WHERE session_id = ?",
                (session_id,),
            )
            return JSONResponse(status_code=400, content={"error": "Pairing session has expired"})

        if row["status"] != "APPROVED":
            return JSONResponse(
                status_code=400,
                content={"error": f"Pairing session is not approved (current status: {row['status']})"},
            )

        completed_at = now_utc.isoformat()
        cursor = conn.execute(
            """
            UPDATE device_pairing_sessions
            SET status = 'COMPLETED',
                completed_at = ?
            WHERE session_id = ? AND status = 'APPROVED'
            """,
            (completed_at, session_id),
        )

        if cursor.rowcount == 0:
            return JSONResponse(
                status_code=400,
                content={"error": "Pairing session already completed or state modified concurrently"},
            )

        user_id = row["user_id"]
        person_row = conn.execute(
            "SELECT * FROM people WHERE person_id = ?",
            (user_id,),
        ).fetchone()

        if not person_row:
            return JSONResponse(
                status_code=404,
                content={"error": "Authorized user record not found"},
            )

        person_dict = person_row_to_dict(person_row)
        person_dict["isUserRegistered"] = True

        return {
            "success": True,
            "status": "COMPLETED",
            "person": person_dict,
            "message": f"Successfully authenticated as {person_dict.get('name')}.",
        }


@router.post("/cancel")
async def cancel_pairing(request: Request):
    """
    Cancels an active pairing session.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = (body.get("sessionId") or "").strip()
    if not session_id:
        return JSONResponse(status_code=400, content={"error": "Missing sessionId"})

    with get_db() as conn:
        conn.execute(
            "UPDATE device_pairing_sessions SET status = 'CANCELLED' WHERE session_id = ?",
            (session_id,),
        )

    return {
        "success": True,
        "status": "CANCELLED",
        "message": "Pairing session cancelled.",
    }
