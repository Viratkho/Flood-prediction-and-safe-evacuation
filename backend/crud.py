"""
FloodGuard 2.1 — SQLite Database Access Layer (CRUD)
Free, Local, and Open Source.
Handles transactional operations for Users, Locations, Flood Predictions,
Flood Alerts, Prediction History, and System Configuration.
"""

import os
import time
import json
import secrets
import hashlib
import hmac
import sqlite3
from typing import List, Optional, Dict, Any, Tuple

from backend.database import get_db, get_db_path
from backend.models import (
    user_row_to_dict,
    location_row_to_dict,
    prediction_row_to_dict,
    flood_alert_row_to_dict,
    history_row_to_dict,
    system_config_row_to_dict
)
from backend.schemas import (
    UserRegisterRequest,
    LocationCreate,
    PredictionCreate,
    FloodAlertCreate
)


# ==========================================================
# 1. Password & Token Utilities (Zero External Paid Dependencies)
# ==========================================================

def hash_password(password: str, salt: str) -> str:
    """Computes PBKDF2-HMAC-SHA256 with 100,000 iterations using Python standard library."""
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()


def verify_password(plain_password: str, salt: str, password_hash: str) -> bool:
    """Constant-time verification of password against stored hash."""
    computed = hash_password(plain_password, salt)
    return hmac.compare_digest(computed, password_hash)


# ==========================================================
# 2. User CRUD Operations (Section 4.A & Section 7)
# ==========================================================

def create_user(user_in: UserRegisterRequest) -> Dict[str, Any]:
    """Registers a new user in SQLite with salted password hashing."""
    salt = secrets.token_hex(16)
    pwd_hash = hash_password(user_in.password, salt)
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (user_in.email.strip().lower(),))
        if cursor.fetchone():
            raise ValueError(f"User with email '{user_in.email}' already exists.")

        cursor.execute(
            """
            INSERT INTO users (full_name, email, phone_number, password_hash, salt, role, created_at, updated_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                user_in.full_name.strip(),
                user_in.email.strip().lower(),
                user_in.phone_number.strip() if user_in.phone_number else None,
                pwd_hash,
                salt,
                user_in.role.strip() if user_in.role else "user",
                now_ts,
                now_ts
            )
        )
        user_id = cursor.lastrowid
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return user_row_to_dict(cursor.fetchone())


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieves user by email address."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
        row = cursor.fetchone()
        return user_row_to_dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves user by primary key ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return user_row_to_dict(row) if row else None


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    """Validates user credentials against stored PBKDF2 hash."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
        row = cursor.fetchone()
        if not row:
            return None
        if not verify_password(password, row["salt"], row["password_hash"]):
            return None
        return user_row_to_dict(row)


def create_user_session(user_id: int, email: str, role: str) -> str:
    """Creates a persistent, revocable session token in SQLite (valid 7 days)."""
    token = f"FGS-{secrets.token_hex(24)}"
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    expires_ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + 7 * 86400))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO user_sessions (session_token, user_id, email, role, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (token, user_id, email, role, now_ts, expires_ts)
        )
        return token


def get_session_user(token: str) -> Optional[Dict[str, Any]]:
    """Validates session token and returns active user."""
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT u.* FROM users u
            JOIN user_sessions s ON u.id = s.user_id
            WHERE s.session_token = ? AND s.expires_at > ? AND u.is_active = 1
            """,
            (token, now_ts)
        )
        row = cursor.fetchone()
        return user_row_to_dict(row) if row else None


def revoke_user_session(token: str) -> bool:
    """Revokes active user session token."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE session_token = ?", (token,))
        return cursor.rowcount > 0


# ==========================================================
# 3. Location CRUD Operations (Section 4.B & Section 7)
# ==========================================================

def create_location(loc_in: LocationCreate) -> Dict[str, Any]:
    """Creates a monitored location record in SQLite."""
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO locations (user_id, location_name, latitude, longitude, district, state, elevation_m, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                loc_in.user_id,
                loc_in.location_name.strip(),
                loc_in.latitude,
                loc_in.longitude,
                loc_in.district.strip() if loc_in.district else None,
                loc_in.state.strip() if loc_in.state else None,
                loc_in.elevation_m,
                now_ts
            )
        )
        loc_id = cursor.lastrowid
        cursor.execute("SELECT * FROM locations WHERE id = ?", (loc_id,))
        return location_row_to_dict(cursor.fetchone())


def get_location_by_id(location_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves single location by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM locations WHERE id = ?", (location_id,))
        row = cursor.fetchone()
        return location_row_to_dict(row) if row else None


def list_locations(skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
    """Lists monitored locations."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM locations ORDER BY id ASC LIMIT ? OFFSET ?", (limit, skip))
        rows = cursor.fetchall()
        return [location_row_to_dict(r) for r in rows]


def delete_location(location_id: int) -> bool:
    """Deletes location by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM locations WHERE id = ?", (location_id,))
        return cursor.rowcount > 0


# ==========================================================
# 4. Flood Prediction CRUD Operations (Section 4.C & Section 6)
# ==========================================================

def create_flood_prediction(
    pred_in: PredictionCreate,
    model_output: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Persists real prediction parameters and outputs to SQLite in an ACID transaction.
    Records history snapshot and automatically creates flood alerts for HIGH or CRITICAL risk.
    """
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO flood_predictions (
                user_id, location_id, latitude, longitude, location_name,
                rainfall, water_level, river_level, soil_moisture, temperature, humidity,
                prediction_result, risk_level, prediction_confidence, flood_eta_minutes,
                severity_score, recommendation, model_version, prediction_timestamp, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pred_in.user_id,
                pred_in.location_id,
                pred_in.latitude,
                pred_in.longitude,
                pred_in.location_name.strip(),
                pred_in.rainfall,
                pred_in.water_level,
                pred_in.river_level,
                pred_in.soil_moisture,
                pred_in.temperature,
                pred_in.humidity,
                model_output["prediction_result"],
                model_output["risk_level"],
                model_output["prediction_confidence"],
                model_output.get("flood_eta_minutes"),
                model_output["severity_score"],
                model_output.get("recommendation"),
                model_output.get("model_version", "Deterministic-Hydrology-v2.1"),
                now_ts,
                now_ts
            )
        )
        prediction_id = cursor.lastrowid

        # Record immutable prediction history snapshot
        input_snap = json.dumps(pred_in.dict())
        output_snap = json.dumps(model_output)
        cursor.execute(
            """
            INSERT INTO prediction_history (prediction_id, user_id, input_snapshot, output_snapshot, timestamp)
            VALUES (?, ?, ?, ?, ?)
            """,
            (prediction_id, pred_in.user_id, input_snap, output_snap, now_ts)
        )

        # Auto-create Flood Alert in flood_alerts table if risk is elevated
        if model_output["risk_level"] in ["HIGH", "CRITICAL"]:
            alert_type = "CRITICAL_SURGE" if model_output["risk_level"] == "CRITICAL" else "FLOOD_WARNING"
            severity = "CRITICAL" if model_output["risk_level"] == "CRITICAL" else "HIGH"
            msg = (
                f"🚨 {model_output['risk_level']} FLOOD DETECTED at {pred_in.location_name}. "
                f"{model_output.get('recommendation', '')}"
            )
            cursor.execute(
                """
                INSERT INTO flood_alerts (
                    location_id, prediction_id, alert_type, severity, alert_message,
                    latitude, longitude, created_at, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    pred_in.location_id,
                    prediction_id,
                    alert_type,
                    severity,
                    msg,
                    pred_in.latitude,
                    pred_in.longitude,
                    now_ts
                )
            )

        cursor.execute("SELECT * FROM flood_predictions WHERE id = ?", (prediction_id,))
        return prediction_row_to_dict(cursor.fetchone())


def get_prediction_by_id(prediction_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves single flood prediction by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM flood_predictions WHERE id = ?", (prediction_id,))
        row = cursor.fetchone()
        return prediction_row_to_dict(row) if row else None


def get_latest_prediction() -> Optional[Dict[str, Any]]:
    """Retrieves latest flood prediction."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM flood_predictions ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        return prediction_row_to_dict(row) if row else None


def list_predictions(
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Lists predictions with optional user filter."""
    with get_db() as conn:
        cursor = conn.cursor()
        if user_id is not None:
            cursor.execute(
                "SELECT * FROM flood_predictions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                (user_id, limit, skip)
            )
        else:
            cursor.execute(
                "SELECT * FROM flood_predictions ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, skip)
            )
        rows = cursor.fetchall()
        return [prediction_row_to_dict(r) for r in rows]


def delete_prediction(prediction_id: int) -> bool:
    """Deletes prediction and cascades to history/alerts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM flood_predictions WHERE id = ?", (prediction_id,))
        return cursor.rowcount > 0


# ==========================================================
# 5. Flood Alerts CRUD Operations (Section 4.D & Section 7)
# ==========================================================

def create_flood_alert(alert_in: FloodAlertCreate) -> Dict[str, Any]:
    """Creates a new flood alert record in SQLite."""
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO flood_alerts (
                location_id, prediction_id, alert_type, severity, alert_message,
                latitude, longitude, created_at, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                alert_in.location_id,
                alert_in.prediction_id,
                alert_in.alert_type.strip(),
                alert_in.severity.strip(),
                alert_in.alert_message.strip(),
                alert_in.latitude,
                alert_in.longitude,
                now_ts,
                1 if alert_in.is_active is not False else 0
            )
        )
        alert_id = cursor.lastrowid
        cursor.execute("SELECT * FROM flood_alerts WHERE id = ?", (alert_id,))
        return flood_alert_row_to_dict(cursor.fetchone())


def get_flood_alert_by_id(alert_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves single alert by ID."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM flood_alerts WHERE id = ?", (alert_id,))
        row = cursor.fetchone()
        return flood_alert_row_to_dict(row) if row else None


def list_flood_alerts(skip: int = 0, limit: int = 50) -> List[Dict[str, Any]]:
    """Lists all flood alerts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM flood_alerts ORDER BY id DESC LIMIT ? OFFSET ?", (limit, skip))
        rows = cursor.fetchall()
        return [flood_alert_row_to_dict(r) for r in rows]


def list_active_flood_alerts() -> List[Dict[str, Any]]:
    """Lists currently active flood alerts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM flood_alerts WHERE is_active = 1 ORDER BY id DESC")
        rows = cursor.fetchall()
        return [flood_alert_row_to_dict(r) for r in rows]


# ==========================================================
# 6. Prediction History CRUD Operations (Section 4.E)
# ==========================================================

def list_prediction_history(skip: int = 0, limit: int = 50, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Lists immutable prediction history snapshots."""
    with get_db() as conn:
        cursor = conn.cursor()
        if user_id is not None:
            cursor.execute(
                "SELECT * FROM prediction_history WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                (user_id, limit, skip)
            )
        else:
            cursor.execute(
                "SELECT * FROM prediction_history ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, skip)
            )
        rows = cursor.fetchall()
        return [history_row_to_dict(r) for r in rows]


def get_prediction_history_by_prediction_id(prediction_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves history snapshot for a specific prediction."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM prediction_history WHERE prediction_id = ?", (prediction_id,))
        row = cursor.fetchone()
        return history_row_to_dict(row) if row else None


# ==========================================================
# 7. System Diagnostics & Atomic Online Backup (Section 11)
# ==========================================================

def get_system_status() -> Dict[str, Any]:
    """Returns database size, table counts, and storage status."""
    db_path = get_db_path()
    size_bytes = os.path.getsize(db_path) if os.path.exists(db_path) else 0

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS cnt FROM users;")
        total_users = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM locations;")
        total_locations = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM flood_predictions;")
        total_predictions = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM flood_alerts;")
        total_alerts = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM flood_alerts WHERE is_active = 1;")
        active_alerts = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM people;")
        total_citizens = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) AS cnt FROM incidents;")
        total_incidents = cursor.fetchone()["cnt"]

    return {
        "database": "SQLite",
        "database_file": db_path,
        "size_bytes": size_bytes,
        "wal_mode": True,
        "foreign_keys": "ENABLED",
        "orm": "SQLAlchemy 2.x + sqlite3",
        "metrics": {
            "total_users": total_users,
            "total_locations": total_locations,
            "total_predictions": total_predictions,
            "total_alerts": total_alerts,
            "active_alerts": active_alerts,
            "total_citizens": total_citizens,
            "total_incidents": total_incidents
        },
        "status": "OPERATIONAL",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }


def perform_safe_sqlite_backup() -> Dict[str, Any]:
    """
    Performs an atomic online backup using Python native sqlite3.Connection.backup().
    Completely ACID-safe without file locking conflicts.
    """
    db_path = get_db_path()
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found at {db_path}")

    backup_dir = os.path.join(os.path.dirname(db_path), "backups")
    os.makedirs(backup_dir, exist_ok=True)

    timestamp_str = time.strftime("%Y%m%d_%H%M%S")
    backup_filename = f"floodguard_backup_{timestamp_str}.db"
    backup_dest_path = os.path.join(backup_dir, backup_filename)

    src_conn = sqlite3.connect(db_path)
    dest_conn = sqlite3.connect(backup_dest_path)
    try:
        src_conn.backup(dest_conn)
    finally:
        dest_conn.close()
        src_conn.close()

    size_bytes = os.path.getsize(backup_dest_path)
    return {
        "status": "SUCCESS",
        "backup_file": backup_filename,
        "backup_path": backup_dest_path,
        "timestamp": timestamp_str,
        "file_size_bytes": size_bytes
    }
