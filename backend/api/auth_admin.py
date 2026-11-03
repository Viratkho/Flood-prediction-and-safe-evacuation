"""
FloodGuard 2.1 — Administrator Authentication & Role-Based Access Control (RBAC)
Completely Free, Local, and Open Source.
"""

import hmac
import time
import secrets
import hashlib
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from backend.database import get_db

router = APIRouter(prefix="/api/auth/admin", tags=["Admin Authentication"])


def hash_password(password: str, salt: str) -> str:
    """Computes PBKDF2-HMAC-SHA256 with 100,000 iterations using Python standard library."""
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()


def verify_password(plain_password: str, salt: str, password_hash: str) -> bool:
    """Constant-time verification of password against stored hash."""
    computed = hash_password(plain_password, salt)
    return hmac.compare_digest(computed, password_hash)


def extract_admin_token(request: Request) -> Optional[str]:
    """Extracts admin token from Authorization header, X-Admin-Token header, or cookie."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    admin_header = request.headers.get("X-Admin-Token")
    if admin_header:
        return admin_header.strip()

    cookie_token = request.cookies.get("floodguard_admin_token")
    if cookie_token:
        return cookie_token.strip()

    return None


def get_current_admin_session(request: Request) -> Optional[Dict[str, Any]]:
    """Validates active admin session token in SQLite."""
    token = extract_admin_token(request)
    if not token:
        return None

    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT session_token, admin_id, username, role, created_at, expires_at
            FROM admin_sessions
            WHERE session_token = ? AND expires_at > ?
            """,
            (token, now_iso),
        ).fetchone()

        if row:
            return dict(row)

    return None


def check_admin_rbac(request: Request, strict: bool = False) -> Optional[Dict[str, Any]]:
    """
    Enforces Role-Based Access Control for Command Center administrative routes.
    1. Blocks callers with X-User-Role: CITIZEN (HTTP 403 Forbidden).
    2. If an admin token is provided, validates it in SQLite.
       If invalid or expired, raises HTTP 401 Unauthorized.
    3. If strict=True or caller sets X-Require-Admin: 1, raises HTTP 401 Unauthorized when unauthenticated.
    """
    user_role = (request.headers.get("X-User-Role") or "").upper()
    if user_role == "CITIZEN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Citizen role is not authorized to access Command Center administrative controls.",
        )

    token = extract_admin_token(request)
    if token:
        session = get_current_admin_session(request)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Invalid or expired administrator session token.",
            )
        return session

    if strict or request.headers.get("X-Require-Admin") == "1":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Administrator authentication required to perform this action.",
        )

    return None


@router.post("/login")
def admin_login(payload: Dict[str, Any], response: Response):
    """
    Authenticates administrative user (e.g. zoro / roronovazoro22#)
    using salted PBKDF2-HMAC-SHA256 from SQLite.
    """
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()

    if not username or not password:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Username and password are required."},
        )

    with get_db() as conn:
        user_row = conn.execute(
            "SELECT id, username, password_hash, salt, role FROM admin_users WHERE username = ?",
            (username,),
        ).fetchone()

        if not user_row:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "error": "Invalid administrator username or password."},
            )

        if not verify_password(password, user_row["salt"], user_row["password_hash"]):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"success": False, "error": "Invalid administrator username or password."},
            )

        # Generate cryptographically secure session token
        session_token = f"ADM-{secrets.token_hex(24)}"
        now_ts = time.time()
        created_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now_ts))
        expires_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now_ts + 86400))  # 24 hours

        # Clean up any expired sessions for this admin
        conn.execute("DELETE FROM admin_sessions WHERE expires_at < ?", (created_at,))

        # Insert new session
        conn.execute(
            """
            INSERT INTO admin_sessions (session_token, admin_id, username, role, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_token, user_row["id"], user_row["username"], user_row["role"], created_at, expires_at),
        )

    # Set secure HTTP-only cookie
    response.set_cookie(
        key="floodguard_admin_token",
        value=session_token,
        max_age=86400,
        httponly=True,
        samesite="lax",
        path="/",
    )

    return {
        "success": True,
        "token": session_token,
        "username": user_row["username"],
        "role": user_row["role"],
        "expiresAt": expires_at,
        "message": f"Administrator session established for {user_row['username']}.",
    }


@router.post("/logout")
def admin_logout(request: Request, response: Response):
    """Terminates active administrative session and clears session cookie."""
    token = extract_admin_token(request)
    if token:
        with get_db() as conn:
            conn.execute("DELETE FROM admin_sessions WHERE session_token = ?", (token,))

    response.delete_cookie(key="floodguard_admin_token", path="/")
    return {"success": True, "message": "Administrator session ended."}


@router.get("/verify")
def admin_verify(request: Request):
    """Verifies whether the current request holds a valid active administrator session."""
    session = get_current_admin_session(request)
    if not session:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"authenticated": False, "error": "No active administrator session."},
        )

    return {
        "authenticated": True,
        "username": session["username"],
        "role": session["role"],
        "expiresAt": session["expires_at"],
    }
