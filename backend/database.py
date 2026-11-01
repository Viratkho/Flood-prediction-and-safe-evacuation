"""
FloodGuard 2.1 — SQLite Database Persistence Layer
Completely Free, Local, and Open Source.
Integrated with Python sqlite3 and SQLAlchemy ORM.
"""

import os
import sqlite3
import json
import time
import math
from contextlib import contextmanager
from typing import Generator, Optional, List, Dict, Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Resolve default persistent database path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.environ.get(
    "FLOODGUARD_DB_PATH",
    os.environ.get("DATABASE_PATH", os.path.join(BASE_DIR, "database", "floodguard.db"))
)
DATABASE_PATH = os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
SEED_DATA_PATH = os.path.join(REPO_ROOT, "seed_data.json")

# SQLAlchemy Declarative Base
Base = declarative_base()

def get_db_path() -> str:
    # On Vercel serverless functions, the file system is read-only except /tmp
    if os.environ.get('VERCEL'):
        vercel_tmp_db = '/tmp/floodguard.db'
        if not os.path.exists(vercel_tmp_db):
            bundled_db = os.path.join(BASE_DIR, 'database', 'floodguard.db')
            if os.path.exists(bundled_db):
                try:
                    import shutil
                    shutil.copyfile(bundled_db, vercel_tmp_db)
                except Exception as e:
                    print('Notice: could not copy bundled db to /tmp:', e)
        return vercel_tmp_db

    path = os.environ.get("FLOODGUARD_DB_PATH", os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH))
    parent = os.path.dirname(os.path.abspath(path))
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)
    return path


def get_db_connection() -> sqlite3.Connection:
    """
    Creates and returns a raw SQLite connection with foreign keys enabled,
    WAL journaling, and Row factory configured.
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path, timeout=20.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
    except Exception:
        pass
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


# SQLAlchemy Engine and Session Factory Configuration
_engine: Optional[Engine] = None
_SessionFactory = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        db_path = get_db_path()
        _engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False, "timeout": 20.0},
            echo=False
        )
    return _engine


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enforces SQLite foreign keys and WAL mode for every SQLAlchemy connection."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON;")
    except Exception:
        pass
    try:
        cursor.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    cursor.close()


def get_session_factory():
    global _SessionFactory
    if _SessionFactory is None:
        engine = get_engine()
        _SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return _SessionFactory


def get_db_session() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields an isolated SQLAlchemy database session
    with automatic rollback on error and proper closing.
    """
    SessionFactory = get_session_factory()
    session: Session = SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


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

    # 3. Seed Default Admin Users (zoro / roronovazoro22# & admin / Admin@FloodGuard2024)
    admins_to_seed = [
        ("zoro", "roronovazoro22#"),
        ("admin", "Admin@FloodGuard2024"),
    ]
    for adm_user, adm_pass in admins_to_seed:
        cursor.execute("SELECT id FROM admin_users WHERE username = ?;", (adm_user,))
        if not cursor.fetchone():
            import secrets
            import hashlib
            admin_salt = secrets.token_hex(16)
            admin_pwd_hash = hashlib.pbkdf2_hmac(
                "sha256", adm_pass.encode("utf-8"), admin_salt.encode("utf-8"), 100000
            ).hex()
            cursor.execute(
                """
                INSERT INTO admin_users (username, password_hash, salt, role, created_at)
                VALUES (?, ?, ?, 'ADMIN', ?)
                """,
                (adm_user, admin_pwd_hash, admin_salt, time.strftime("%Y-%m-%d %H:%M:%S")),
            )

    # 4. Seed Default Monitored Locations if empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM locations;")
    if cursor.fetchone()["cnt"] == 0:
        default_locs = [
            ("Avadi Bus Terminus Junction", 13.1182, 80.1008, "Tiruvallur", "Tamil Nadu", 24.2),
            ("CTH Road & Gandhi Nagar Cross", 13.1158, 80.1042, "Tiruvallur", "Tamil Nadu", 22.8),
            ("Poonamallee High Rd & Avadi Link", 13.1095, 80.1015, "Tiruvallur", "Tamil Nadu", 20.4),
            ("Sekkadu Canal Bridge Junction", 13.1042, 80.0982, "Tiruvallur", "Tamil Nadu", 14.1),
            ("Paruthipattu Sluice Crossing", 13.1020, 80.1075, "Tiruvallur", "Tamil Nadu", 15.5),
            ("Mittanamalli High Ridge Haven", 13.1320, 80.1030, "Tiruvallur", "Tamil Nadu", 31.0)
        ]
        now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
        for loc_name, lat, lng, dist, st, elev in default_locs:
            cursor.execute(
                """
                INSERT INTO locations (location_name, latitude, longitude, district, state, elevation_m, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (loc_name, lat, lng, dist, st, elev, now_ts)
            )

    # 5. Seed System Configurations
    default_configs = [
        ("PREDICTION_MODEL", "Deterministic-Hydrology-v2.1", "Active flood prediction model identifier"),
        ("HIGH_RISK_SURGE_THRESHOLD_CM", "35.0", "Water depth threshold (cm) triggering high surge warning"),
        ("CRITICAL_FLOOD_THRESHOLD_CM", "50.0", "Water depth threshold (cm) rendering roads completely impassable"),
        ("DEFAULT_INUNDATION_LOOKAHEAD_MIN", "60", "Default hydrological forward projection window (minutes)"),
        ("DATABASE_ENGINE", "SQLite 3 (WAL Mode + Foreign Keys + SQLAlchemy)", "Primary persistent storage engine")
    ]
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    for key, val, desc in default_configs:
        cursor.execute(
            """
            INSERT OR IGNORE INTO system_configurations (config_key, config_value, description, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (key, val, desc, now_ts)
        )

    # 6. Seed Dam State
    cursor.execute("SELECT COUNT(*) AS cnt FROM dam_state;")
    dam_count = cursor.fetchone()["cnt"]

    if dam_count == 0 or force:
        now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
        initial_history = [
            {"time": "09:00", "level": 18.2, "inflow": 4200, "outflow": 3800, "status": "OPTIMAL"},
            {"time": "09:30", "level": 18.4, "inflow": 4500, "outflow": 4000, "status": "OPTIMAL"},
            {"time": "10:00", "level": 18.7, "inflow": 4900, "outflow": 4200, "status": "OPTIMAL"},
            {"time": "10:30", "level": 19.1, "inflow": 5600, "outflow": 4500, "status": "ELEVATED"},
            {"time": "11:00", "level": 19.6, "inflow": 6400, "outflow": 5000, "status": "ELEVATED"},
            {"time": "11:30", "level": 20.2, "inflow": 7800, "outflow": 6200, "status": "WARNING"},
            {"time": "12:00", "level": 20.8, "inflow": 9200, "outflow": 8000, "status": "WARNING"},
            {"time": "12:30", "level": 21.4, "inflow": 11000, "outflow": 10500, "status": "CRITICAL"},
        ]
        cursor.execute(
            """
            INSERT OR REPLACE INTO dam_state (
                id, dam_name, reservoir_level_m, max_crest_level_m, precipitation_mm_h,
                rate_of_rise_m_min, spillway_release_cusecs, inflow_cusecs, status,
                last_updated, history, is_storm_active, is_full_flood_active
            ) VALUES (1, 'Poondi Reservoir (Sathyamurthy Sagar)', 20.4, 24.0, 18.5, 0.04, 4500, 5200, 'ELEVATED', ?, ?, 0, 0)
            """,
            (now_ts, json.dumps(initial_history)),
        )

    # 7. Seed Default Registered User for testing/demo if empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM users;")
    if cursor.fetchone()["cnt"] == 0:
        import secrets
        import hashlib
        salt = secrets.token_hex(16)
        pwd_hash = hashlib.pbkdf2_hmac("sha256", "FloodGuard@2026".encode("utf-8"), salt.encode("utf-8"), 100000).hex()
        now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            """
            INSERT INTO users (full_name, email, phone_number, password_hash, salt, role, created_at, updated_at, is_active)
            VALUES (?, ?, ?, ?, ?, 'administrator', ?, ?, 1)
            """,
            ("FloodGuard Chief Hydrologist", "admin@floodguard.local", "+919840100000", pwd_hash, salt, now_ts, now_ts)
        )



def init_db():
    """
    Initializes the SQLite schema with foreign keys, WAL journaling, and indexes.
    Idempotent: will never drop or overwrite existing persistent tables.
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Registered Users Table (Compliant with Section 4.A)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone_number TEXT,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            );
            """
        )

        # 2. User Active Sessions Table (Revocable auth sessions)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                session_token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )

        # 3. Monitored Locations Table (Compliant with Section 4.B)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                location_name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                district TEXT,
                state TEXT,
                elevation_m REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            """
        )

        # 4. Flood Predictions Primary Table (Compliant with Section 4.C)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS flood_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                location_id INTEGER,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                location_name TEXT NOT NULL,
                rainfall REAL NOT NULL,
                water_level REAL NOT NULL,
                river_level REAL,
                soil_moisture REAL,
                temperature REAL,
                humidity REAL,
                prediction_result TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                prediction_confidence REAL NOT NULL,
                flood_eta_minutes INTEGER,
                severity_score REAL NOT NULL,
                recommendation TEXT,
                model_version TEXT NOT NULL DEFAULT 'Deterministic-Hydrology-v2.1',
                prediction_timestamp TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
            );
            """
        )

        # 5. Flood Alerts Table (Compliant with Section 4.D)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS flood_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location_id INTEGER,
                prediction_id INTEGER,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                alert_message TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                created_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
                FOREIGN KEY (prediction_id) REFERENCES flood_predictions(id) ON DELETE CASCADE
            );
            """
        )

        # 6. Prediction History Table (Compliant with Section 4.E)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS prediction_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prediction_id INTEGER NOT NULL,
                user_id INTEGER,
                input_snapshot TEXT NOT NULL,
                output_snapshot TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (prediction_id) REFERENCES flood_predictions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            """
        )

        # 7. System Configurations Table (Compliant with Section 4.F)
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS system_configurations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_key TEXT UNIQUE NOT NULL,
                config_value TEXT NOT NULL,
                description TEXT,
                updated_at TEXT NOT NULL
            );
            """
        )

        # 8. Citizens Registry (People) Table
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
                lat REAL NOT NULL,
                lng REAL NOT NULL,
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

        # 9. Incidents Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                person_id TEXT,
                person_name TEXT,
                person_age INTEGER,
                person_gender TEXT,
                wearable_id TEXT,
                priority TEXT,
                status TEXT,
                hazard_type TEXT,
                hazard_description TEXT,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
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

        # 10. Mobile Alerts Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS mobile_alerts (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                mobile_number TEXT NOT NULL,
                recipient_name TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                headline TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL,
                gateway TEXT NOT NULL,
                person_id TEXT,
                free_api_used TEXT,
                native_sms_url TEXT,
                FOREIGN KEY (person_id) REFERENCES people(person_id) ON DELETE SET NULL
            );
            """
        )

        # 11. Dam State Table
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS dam_state (
                id INTEGER PRIMARY KEY,
                dam_name TEXT NOT NULL,
                reservoir_level_m REAL NOT NULL,
                max_crest_level_m REAL NOT NULL,
                precipitation_mm_h REAL NOT NULL,
                rate_of_rise_m_min REAL NOT NULL,
                spillway_release_cusecs REAL NOT NULL,
                inflow_cusecs REAL NOT NULL,
                status TEXT NOT NULL,
                last_updated TEXT NOT NULL,
                history TEXT NOT NULL,
                is_storm_active INTEGER DEFAULT 0,
                is_full_flood_active INTEGER DEFAULT 0
            );
            """
        )

        # 12. Firewall Threat Logs Table
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

        # 13. Quarantined IPs Table
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

        # 14. Device Pairing Sessions Table
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

        # 15. Admin Users & Sessions Tables
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'ADMIN',
                created_at TEXT NOT NULL
            );
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_sessions (
                session_token TEXT PRIMARY KEY,
                admin_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'ADMIN',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
            );
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_cache (
                cache_key TEXT PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS news_cache (
                category TEXT PRIMARY KEY,
                articles_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            """
        )

        # Indexes for fast lookup & data integrity
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_risk ON flood_predictions(risk_level);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_created ON flood_predictions(created_at);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_user ON flood_predictions(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(location_name);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_flood_alerts_active ON flood_alerts(is_active);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_flood_alerts_created ON flood_alerts(created_at);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_username ON admin_users(username);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_people_priority ON people(rescue_priority);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_username ON admin_users(username);")

        seed_initial_data(conn, force=False)


def get_cached_weather(cache_key: str) -> Optional[Dict[str, Any]]:
    import time
    import json
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT data_json, expires_at, updated_at FROM weather_cache WHERE cache_key = ?",
                (cache_key,),
            ).fetchone()
            if row:
                data = json.loads(row["data_json"])
                data["isCached"] = True
                data["cachedAt"] = row["updated_at"]
                data["isExpired"] = time.time() > row["expires_at"]
                return data
    except Exception as e:
        print("Notice: Error reading weather cache from SQLite:", e)
    return None

def set_cached_weather(cache_key: str, data: Dict[str, Any], ttl_sec: int = 600):
    import time
    import json
    try:
        now = time.time()
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S")
        with get_db() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO weather_cache (cache_key, data_json, updated_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (cache_key, json.dumps(data), updated_at, now + ttl_sec),
            )
    except Exception as e:
        print("Notice: Error saving weather cache to SQLite:", e)

def get_cached_news(category: str) -> Optional[Dict[str, Any]]:
    import time
    import json
    try:
        with get_db() as conn:
            row = conn.execute(
                "SELECT articles_json, expires_at, updated_at FROM news_cache WHERE category = ?",
                (category.lower(),),
            ).fetchone()
            if row:
                articles = json.loads(row["articles_json"])
                return {
                    "articles": articles,
                    "isCached": True,
                    "cachedAt": row["updated_at"],
                    "isExpired": time.time() > row["expires_at"]
                }
    except Exception as e:
        print("Notice: Error reading news cache from SQLite:", e)
    return None

def set_cached_news(category: str, articles: List[Dict[str, Any]], ttl_sec: int = 900):
    import time
    import json
    try:
        now = time.time()
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S")
        with get_db() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO news_cache (category, articles_json, updated_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (category.lower(), json.dumps(articles), updated_at, now + ttl_sec),
            )
    except Exception as e:
        print("Notice: Error saving news cache to SQLite:", e)
