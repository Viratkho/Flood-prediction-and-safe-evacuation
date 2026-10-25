# FloodGuard 2.1 — Python FastAPI + SQLite Backend

## 1. Overview
The FloodGuard 2.1 backend has been migrated to **Python FastAPI** and **SQLite**. The system runs **100% locally and completely free of charge**, with zero paid subscriptions, zero credit card requirements, and zero commercial API keys.

---

## 2. Architecture & File Structure

```
backend/
├── api/                               # Modular FastAPI Routers
│   ├── __init__.py
│   ├── health.py                      # GET /api/health
│   ├── dam.py                         # GET /api/dam & Simulation Controls
│   ├── people.py                      # GET, POST, DELETE /api/people
│   ├── incidents.py                   # GET, POST (acknowledge, assign, status, resolve)
│   ├── alerts.py                      # GET /api/alerts, POST /api/alerts/send-mobile
│   ├── security.py                    # WAF status, threat intelligence, clear quarantine
│   ├── research.py                    # Scenarios catalog, execution, CSV export
│   ├── weather.py                     # Open-Meteo proxy & Google News RSS feeds
│   └── ai.py                          # Aegis AI emergency advisor proxy & fallback
├── data/
│   └── floodguard.db                  # Persistent SQLite Database (WAL mode enabled)
├── middleware/
│   ├── __init__.py
│   └── waf.py                         # L7 WAF, DPI, Anti-bot, Rate limiting, Security headers
├── services/
│   ├── __init__.py
│   ├── priority_engine.py             # Deterministic clinical rescue priority (P0-P4)
│   ├── weather_service.py             # Open-Meteo & RSS parsing with in-memory TTL caching
│   ├── mobile_service.py              # Free emergency SMS / ntfy.sh & RFC 5724 protocol
│   ├── dam_simulation.py              # Hydrological simulation engine (2s background ticker)
│   └── ai_service.py                  # Gemini AI API proxy + tactical deterministic engine
├── database.py                        # SQLite schema definitions, connection pool, and migrations
├── models.py                          # Row-to-Dict mappers (TypeScript-compatible schema)
├── schemas.py                         # Pydantic request & validation models
├── main.py                            # FastAPI entry point, CORS, WAF, static file serving
├── requirements.txt                   # Free, open-source Python dependencies
├── .env.example                       # Safe environment variable template
└── run_backend.bat                    # One-click Windows startup script
```

---

## 3. Persistent SQLite Database Schema

The database resides at `backend/data/floodguard.db` (configurable via `DATABASE_PATH`):

| Table Name | Primary Key | Description |
| :--- | :--- | :--- |
| `people` | `person_id` (TEXT) | Citizen registry, clinical vitals, location, SOS status, priority |
| `incidents` | `id` (TEXT) | Emergency incident logs, audit trails, tactical responder assignments |
| `mobile_alerts` | `id` (TEXT) | Dispatched emergency broadcasts, gateway metadata, RFC 5724 links |
| `dam_state` | `id = 1` (INTEGER) | Chembarambakkam reservoir telemetry & 60-point rolling history |
| `experiment_logs`| `id` (AUTOINCREMENT)| Benchmark scenario execution metrics and clinical audit records |
| `firewall_threat_logs`| `id` (TEXT) | WAF interception events (SQLi, XSS, Scanner bots, Rate limits) |
| `quarantined_ips` | `ip` (TEXT) | Dynamic 15-minute network isolation for repeat policy violators |

**Key SQLite Configuration:**
- Foreign Keys enforced (`PRAGMA foreign_keys = ON;`)
- Write-Ahead Logging mode (`PRAGMA journal_mode = WAL;`) for high concurrency and zero locks
- Automatic idempotent initialization and baseline data seeding on first startup

---

## 4. Zero-Cost Free Integrations

1. **Weather & Geocoding**:
   - Provider: **Open-Meteo** (Free open-source license, CC BY 4.0)
   - Worldwide 7-day forecast, 24-hour hourly projections, and global city search with zero API keys.
2. **Emergency Mobile Dispatch**:
   - Primary: **ntfy.sh Free Emergency Push Network** (Open HTTP publish/subscribe, 100% free)
   - Cellular Fallback: **RFC 5724 Native Mobile Carrier SMS URI Protocol** (`sms:{number}?body={encoded}`)
   - Optional: Twilio / Fast2SMS if commercial API credentials are provided in `.env`.
3. **Tactical AI Dispatcher**:
   - Primary: Google Gemini API (if `GEMINI_API_KEY` is provided)
   - Fallback: **Built-in Deterministic Clinical Triage Engine** providing instant tactical evacuation directives without internet or API keys.

---

## 5. Running the Backend on Windows

### Option A: Using the One-Click Script
Double-click `backend\run_backend.bat` or run in terminal:
```cmd
backend\run_backend.bat
```

### Option B: Manual Terminal Execution
```cmd
# 1. Activate virtual environment
.\.venv\Scripts\activate.bat

# 2. Run Uvicorn server on port 3000
python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
```

---

## 6. Running Verification Suites

All test suites connect to `http://localhost:3000`:

```cmd
# Run Comprehensive 35-Test End-to-End Suite
python -u test_suite.py

# Run Live SMS & Mobile Gateway 8-Test Suite
python -u test_sms_suite.py
```

### Results:
- `test_suite.py`: **35/35 Passed (100% Success Rate)**
- `test_sms_suite.py`: **8/8 Passed (100% Success Rate)**
