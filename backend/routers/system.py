"""
System Diagnostics, SQLite Administration & Atomic Backup Router (Section 4.F & Section 11).
Uses native sqlite3.Connection.backup() for ACID consistency without external tools.
"""

import time
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status

from backend.database import get_db
from backend.models import system_config_row_to_dict
from backend.schemas import SystemConfigCreate, BackupResponse
from backend.crud import get_system_status, perform_safe_sqlite_backup

router = APIRouter(prefix="/api/system", tags=["System & Database Admin"])


@router.post("/backup", response_model=Dict[str, Any])
def trigger_backup():
    """Triggers an atomic, online SQLite backup via native Python sqlite3 API."""
    try:
        return perform_safe_sqlite_backup()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backup operation failed: {str(e)}"
        )


@router.get("/status")
def status_endpoint():
    """Returns database size, table counts, and storage status."""
    return get_system_status()


@router.get("/configs", response_model=List[Dict[str, Any]])
def list_configs():
    """Lists application runtime configurations from SQLite."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM system_configurations ORDER BY config_key ASC")
        rows = cursor.fetchall()
        return [system_config_row_to_dict(r) for r in rows]


@router.post("/configs", response_model=Dict[str, Any])
def set_config(cfg: SystemConfigCreate):
    """Updates or sets application runtime configuration."""
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO system_configurations (config_key, config_value, description, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (cfg.config_key.strip(), cfg.config_value.strip(), cfg.description, now_ts)
        )
        cursor.execute("SELECT * FROM system_configurations WHERE config_key = ?", (cfg.config_key.strip(),))
        return system_config_row_to_dict(cursor.fetchone())
