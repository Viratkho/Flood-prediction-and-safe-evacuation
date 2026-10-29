"""
FloodGuard 2.1 — SQLite Database Persistence Layer
Completely Free, Local, and Open Source.
"""

import os
import sqlite3
import json
import time
import math
from contextlib import contextmanager
from typing import Generator, Optional, List, Dict, Any

# Resolve default persistent database path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "data", "floodguard.db")
DATABASE_PATH = os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
SEED_DATA_PATH = os.path.join(REPO_ROOT, "seed_data.json")


def get_db_path() -> str:
    path = os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)
    parent = os.path.dirname(os.path.abspath(path))
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)
    return path


def get_db_connection() -> sqlite3.Connection:
    """
    Creates and returns a raw SQLite connection with foreign keys enabled
    and Row factory configured.
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Safe context manager for transaction management and auto-closing.
    """
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def seed_initial_data(conn: sqlite3.Connection, force: bool = False):
    cursor = conn.cursor()

    if force:
        cursor.execute("DELETE FROM people;")
        cursor.execute("DELETE FROM incidents;")

    # 1. Seed People
    cursor.execute("SELECT COUNT(*) AS cnt FROM people;")
    people_count = cursor.fetchone()["cnt"]

    if people_count == 0 or force:
        persisted_people_json = os.path.join(REPO_ROOT, ".registered_people.json")
        seed_people = []
        if os.path.exists(persisted_people_json):
            try:
                with open(persisted_people_json, "r", encoding="utf-8") as f:
                    seed_people = json.load(f)
            except Exception:
                pass

        if not seed_people and os.path.exists(SEED_DATA_PATH):
            try:
                with open(SEED_DATA_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    seed_people = data.get("people", [])
            except Exception:
                pass

        for p in seed_people:
            cursor.execute(
                """
                INSERT OR REPLACE INTO people (
                    person_id, wearable_id, name, age, gender, contact_number,
                    emergency_contact_name, emergency_contact_phone, address_landmark,
                    location_name, country, administrative_region, country_code,
                    lat, lng, location_timestamp, gps_accuracy_m, elevation_m,
                    heart_rate_bpm, spo2_percent, health_timestamp, health_data_validity,
                    heart_rate_history, spo2_history, flood_depth_cm, flood_risk_level,
                    drift_status, drift_confidence, drift_velocity_ms, sos_active,
                    rescue_priority, priority_reason, priority_factors, priority_updated_at,
                    priority_history, comm_status, last_communication_time, battery_percent,
                    is_user_registered, medical_conditions, medical_notes, assistance_type,
                    dependents_count, dependents_details, role, assigned_responder_id,
                    assigned_responder_name, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    p.get("personId"),
                    p.get("wearableId"),
                    p.get("name", "Citizen"),
                    p.get("age"),
                    p.get("gender"),
                    p.get("contactNumber"),
                    p.get("emergencyContactName"),
                    p.get("emergencyContactPhone"),
                    p.get("addressLandmark"),
                    p.get("locationName", p.get("addressLandmark", "")),
                    p.get("country", "India"),
                    p.get("administrativeRegion", ""),
                    p.get("countryCode", ""),
                    p.get("lat", 13.1120),
                    p.get("lng", 80.1030),
                    p.get("locationTimestamp"),
                    p.get("gpsAccuracyM", 8),
                    p.get("elevationM", 16.2),
                    p.get("heartRateBpm", 78),
                    p.get("spo2Percent", 98),
                    p.get("healthTimestamp"),
                    p.get("healthDataValidity", "VALID"),
                    json.dumps(p.get("heartRateHistory", [])),
                    json.dumps(p.get("spo2History", [])),
                    p.get("floodDepthCm", 15),
                    p.get("floodRiskLevel", "SAFE"),
                    p.get("driftStatus", "STATIONARY"),
                    p.get("driftConfidence", 0),
                    p.get("driftVelocityMs", 0),
                    1 if p.get("sosActive") else 0,
                    p.get("rescuePriority", "P3"),
                    p.get("priorityReason", "Initial intake evaluation"),
                    json.dumps(p.get("priorityFactors", {})),
                    p.get("priorityUpdatedAt"),
                    json.dumps(p.get("priorityHistory", [])),
                    p.get("commStatus", "ONLINE"),
                    p.get("lastCommunicationTime"),
                    p.get("batteryPercent", 90),
                    1 if p.get("isUserRegistered") else 0,
                    json.dumps(p.get("medicalConditions", [])),
                    p.get("medicalNotes", ""),
                    p.get("assistanceType", "SHELTER_ROUTING"),
                    p.get("dependentsCount", 0),
                    p.get("dependentsDetails", ""),
                    p.get("role", "CITIZEN"),
                    p.get("assignedResponderId"),
                    p.get("assignedResponderName"),
                    p.get("createdAt", "Initial"),
                ),
            )

    # 2. Seed Incidents
    cursor.execute("SELECT COUNT(*) AS cnt FROM incidents;")
    incidents_count = cursor.fetchone()["cnt"]

    if incidents_count == 0 or force:
        persisted_incidents_json = os.path.join(REPO_ROOT, ".incidents.json")
        seed_incidents = []
        if os.path.exists(persisted_incidents_json):
            try:
                with open(persisted_incidents_json, "r", encoding="utf-8") as f:
                    seed_incidents = json.load(f)
            except Exception:
                pass

        if not seed_incidents and os.path.exists(SEED_DATA_PATH):
            try:
                with open(SEED_DATA_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    seed_incidents = data.get("incidents", [])
            except Exception:
                pass

        for inc in seed_incidents:
            cursor.execute(
                """
                INSERT OR REPLACE INTO incidents (
                    id, person_id, person_name, person_age, person_gender, wearable_id,
                    priority, status, hazard_type, hazard_description, lat, lng,
                    location_name, water_level_cm, is_immediate_danger, assigned_responder_id,
                    assigned_responder_name, assigned_at, acknowledged_at, acknowledged_by,
                    resolved_at, resolved_by, resolution_notes, created_at, updated_at, audit_trail
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    inc.get("id"),
                    inc.get("personId"),
                    inc.get("personName"),
                    inc.get("personAge"),
                    inc.get("personGender"),
                    inc.get("wearableId"),
                    inc.get("priority", "P2"),
                    inc.get("status", "REPORTED"),
                    inc.get("hazardType"),
                    inc.get("hazardDescription"),
                    inc.get("lat"),
                    inc.get("lng"),
                    inc.get("locationName"),
                    inc.get("waterLevelCm"),
                    1 if inc.get("isImmediateDanger") else 0,
                    inc.get("assignedResponderId"),
                    inc.get("assignedResponderName"),
                    inc.get("assignedAt"),
                    inc.get("acknowledgedAt"),
                    inc.get("acknowledgedBy"),
                    inc.get("resolvedAt"),
                    inc.get("resolvedBy"),
                    inc.get("resolutionNotes"),
                    inc.get("createdAt"),
                    inc.get("updatedAt"),
                    json.dumps(inc.get("auditTrail", [])),
                ),
            )

    # 3. Seed Dam State
    cursor.execute("SELECT COUNT(*) AS cnt FROM dam_state;")
    dam_count = cursor.fetchone()["cnt"]

    if dam_count == 0:
        history = []
        now_ts = time.time()
        for i in range(59, -1, -1):
            t_str = time.strftime("%I:%M:%S %p", time.localtime(now_ts - i))
            wobble = math.sin(i / 5.0) * 0.15
            history.append({
                "timestamp": t_str,
                "level": round(32.2 + wobble, 2),
                "precipitation": 12 + (i % 5),
                "release": 3500,
            })

        cursor.execute(
            """
            INSERT OR REPLACE INTO dam_state (
                id, dam_name, reservoir_level_m, max_crest_level_m, precipitation_mm_h,
                rate_of_rise_m_min, spillway_release_cusecs, inflow_cusecs, status,
                last_updated, history, is_storm_active, is_full_flood_active
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            """,
            (
                "Chembarambakkam & Avadi Catchment Dam",
                32.4,
                38.0,
                14.5,
                0.02,
                3500.0,
                14200.0,
                "NORMAL",
                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                json.dumps(history),
            ),
        )


def init_db():
    """
    Initializes tables idempotently. Never deletes existing data on startup.
    Migrates existing data from local JSON or seed files if database is empty.
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. People Registry Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS people (
                person_id TEXT PRIMARY KEY,
                wearable_id TEXT,
                name TEXT NOT NULL,
                age INTEGER,
                gender TEXT,
                contact_number TEXT,
                emergency_contact_name TEXT,
                emergency_contact_phone TEXT,
                address_landmark TEXT,
                location_name TEXT,
                country TEXT,
                administrative_region TEXT,
                country_code TEXT,
                lat REAL,
                lng REAL,
                location_timestamp TEXT,
                gps_accuracy_m REAL,
                elevation_m REAL,
                heart_rate_bpm REAL,
                spo2_percent REAL,
                health_timestamp TEXT,
                health_data_validity TEXT,
                heart_rate_history TEXT,
                spo2_history TEXT,
                flood_depth_cm REAL,
                flood_risk_level TEXT,
                drift_status TEXT,
                drift_confidence REAL,
                drift_velocity_ms REAL,
                sos_active INTEGER DEFAULT 0,
                rescue_priority TEXT,
                priority_reason TEXT,
                priority_factors TEXT,
                priority_updated_at TEXT,
                priority_history TEXT,
                comm_status TEXT,
                last_communication_time TEXT,
                battery_percent REAL,
                is_user_registered INTEGER DEFAULT 0,
                medical_conditions TEXT,
                medical_notes TEXT,
                assistance_type TEXT,
                dependents_count INTEGER DEFAULT 0,
                dependents_details TEXT,
                role TEXT,
                assigned_responder_id TEXT,
                assigned_responder_name TEXT,
                created_at TEXT
            );
            """
        )

        # 2. Incidents Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                person_id TEXT,
                person_name TEXT,
                person_age INTEGER,
                person_gender TEXT,
                wearable_id TEXT,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                hazard_type TEXT,
                hazard_description TEXT,
                lat REAL,
                lng REAL,
                location_name TEXT,
                water_level_cm REAL,
                is_immediate_danger INTEGER DEFAULT 0,
                assigned_responder_id TEXT,
                assigned_responder_name TEXT,
                assigned_at TEXT,
                acknowledged_at TEXT,
                acknowledged_by TEXT,
                resolved_at TEXT,
                resolved_by TEXT,
                resolution_notes TEXT,
                created_at TEXT,
                updated_at TEXT,
                audit_trail TEXT,
                FOREIGN KEY (person_id) REFERENCES people(person_id) ON DELETE SET NULL
            );
            """
        )

        # 3. Mobile Alerts Log Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS mobile_alerts (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                mobile_number TEXT,
                recipient_name TEXT,
                alert_type TEXT,
                headline TEXT,
                message TEXT,
                status TEXT,
                gateway TEXT,
                free_api_used TEXT,
                native_sms_url TEXT,
                person_id TEXT,
                FOREIGN KEY (person_id) REFERENCES people(person_id) ON DELETE SET NULL
            );
            """
        )

        # 4. Research Experiment Logs Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS experiment_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                scenario_id TEXT,
                scenario_name TEXT,
                person_id TEXT,
                person_name TEXT,
                input_condition TEXT,
                previous_priority TEXT,
                new_priority TEXT,
                reason TEXT,
                outcome TEXT
            );
            """
        )

        # 5. Dam Telemetry & Simulation State Table (Single row, id=1)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS dam_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                dam_name TEXT,
                reservoir_level_m REAL,
                max_crest_level_m REAL,
                precipitation_mm_h REAL,
                rate_of_rise_m_min REAL,
                spillway_release_cusecs REAL,
                inflow_cusecs REAL,
                status TEXT,
                last_updated TEXT,
                history TEXT,
                is_storm_active INTEGER DEFAULT 0,
                is_full_flood_active INTEGER DEFAULT 0
            );
            """
        )

        # 6. WAF Threat Logs Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS firewall_threat_logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                threat_type TEXT,
                severity TEXT,
                client_ip TEXT,
                endpoint TEXT,
                method TEXT,
                details TEXT,
                action TEXT
            );
            """
        )

        # 7. Quarantined IPs Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS quarantined_ips (
                ip TEXT PRIMARY KEY,
                unban_timestamp REAL,
                violation_count INTEGER DEFAULT 1,
                created_at TEXT
            );
            """
        )

        # 8. QR-Based Device Pairing Sessions Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS device_pairing_sessions (
                session_id TEXT PRIMARY KEY,
                token_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                user_id TEXT,
                source_device_info TEXT,
                target_device_info TEXT,
                scanned_at TEXT,
                approved_at TEXT,
                completed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES people(person_id) ON DELETE SET NULL
            );
            """
        )

        # Indexes for fast lookup
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_people_priority ON people(rescue_priority);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pairing_status ON device_pairing_sessions(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pairing_expires ON device_pairing_sessions(expires_at);")

        seed_initial_data(conn, force=False)
