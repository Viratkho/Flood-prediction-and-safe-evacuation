# FloodGuard 2.1 — Python FastAPI + SQLite Backend

## 1. Overview
The FloodGuard 2.1 backend is powered by **Python FastAPI** and **SQLite**. The system runs **100% locally and completely free of charge**, with zero paid subscriptions, zero credit card requirements, and zero commercial API keys.

In addition to tactical flood prediction and safe evacuation routing, FloodGuard 2.1 features **secure QR-based cross-device authentication**, allowing a newly opened device (Device B) to log in instantly by scanning a temporary pairing QR code with an authenticated device (Device A).

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
│   ├── ai.py                          # Aegis AI emergency advisor proxy & fallback
│   └── auth_qr.py                     # QR cross-device authentication endpoints
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
| `device_pairing_sessions` | `session_id` (TEXT) | QR pairing tokens (SHA-256), device metadata, approval/completion timestamps |

**Key SQLite Configuration:**
- Foreign Keys enforced (`PRAGMA foreign_keys = ON;`)
- Write-Ahead Logging mode (`PRAGMA journal_mode = WAL;`) for high concurrency and zero locks
- Automatic idempotent initialization and baseline data seeding on first startup

---

## 4. Secure QR-Based Cross-Device Authentication Workflow

### Workflow Overview:
1. **Device B (New / Unauthenticated Device)**:
   - User clicks **"Log In with QR Code"** on the Register Intake Form or top navigation.
   - Device B calls `POST /api/auth/qr/create`.
   - FastAPI generates a cryptographically secure token (`secrets.token_urlsafe(32)`) and calculates its SHA-256 hash.
   - The session is stored in SQLite with a **120-second expiration window**.
   - Device B displays the generated high-contrast QR code and begins polling `GET /api/auth/qr/status/{session_id}` every 2 seconds.

2. **Device A (Already Authenticated Device)**:
   - User clicks **"Scan QR to Log In on Another Device"** from the top header or Smartwatch view.
   - The device opens a camera video stream with live targeting reticle (powered by `jsqr`).
   - Device A scans the QR code on Device B and submits `POST /api/auth/qr/scan` with the scanned token and Device A's authenticated `personId`.
   - FastAPI verifies the token against the SQLite hash in constant time (`hmac.compare_digest`), checks expiration, associates the session with Device A's user, and returns Device B's device info (platform, browser, IP).
   - Device A displays a confirmation prompt showing Device B's platform, browser, IP, and the account details to be authorized.
   - User clicks **"Approve & Authorize"**, triggering `POST /api/auth/qr/approve`.

3. **Automatic Login on Device B**:
   - Device B's poll detects the `APPROVED` state.
   - Device B calls `POST /api/auth/qr/complete` with the secret token.
   - FastAPI atomically transitions the session to `COMPLETED` (guaranteeing single-use / preventing replay attacks) and returns the authenticated user's profile (`person`).
   - Device B saves the user session to `localStorage`, speaks a confirmation announcement, and redirects immediately to the live Evacuation / Watch dashboard.

### Security Controls:
- **Zero Plaintext Tokens**: Tokens are hashed with SHA-256 before storage in SQLite.
- **Constant-Time Verification**: Uses `hmac.compare_digest` to prevent timing attacks.
- **Strict Single-Use**: Sessions can only be completed once. Replay attempts are rejected with HTTP 400.
- **Strict Identity Derivation**: Device B cannot choose or forge user identity; user ID is strictly bound to Device A's authenticated session.
- **Short-Lived Expiration**: Sessions automatically expire after 120 seconds.
- **Rate Limiting**: Sliding-window rate limiters prevent brute-force attacks and session flooding.

---

## 5. Zero-Cost Free Integrations

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

## 6. Running the Application

### Option A: Running the Backend
```cmd
# 1. Activate virtual environment
.\.venv\Scripts\activate.bat

# 2. Run Uvicorn server on port 3000
python -m uvicorn backend.main:app --host 0.0.0.0 --port 3000
```

### Option B: Building and Running the Frontend
```cmd
# Install dependencies
npm install

# Build production assets
npm run build:client

# Type check
npm run lint
```

---

## 7. Running Verification Suites

All test suites verify functionality and persistent SQLite operations:

```cmd
# Run QR Cross-Device Authentication Test Suite (15 Tests)
python test_qr_auth.py

# Run Comprehensive End-to-End Suite (35 Tests)
python -u test_suite.py

# Run Live SMS & Mobile Gateway Suite (8 Tests)
python -u test_sms_suite.py
```

### Verified Results:
- `test_qr_auth.py`: **15/15 Passed (100% Success Rate)**
- `test_suite.py`: **35/35 Passed (100% Success Rate)**
- `test_sms_suite.py`: **8/8 Passed (100% Success Rate)**
- `npm run lint` (`tsc --noEmit`): **Passed with 0 errors**
- `npm run build:client` (`vite build`): **Passed with 0 errors**
