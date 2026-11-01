"""
FloodGuard 2.1 — Admin Authentication & RBAC Test Suite
Validates:
1. Admin user seeding in SQLite with salted PBKDF2-HMAC-SHA256 (no plaintext).
2. Admin login for username 'zoro' with password 'roronovazoro22#'.
3. Rejection of invalid passwords and unauthorized access.
4. Session token creation, storage in SQLite, and expiration.
5. Role-Based Access Control (RBAC): citizen accounts blocked from Command Center (HTTP 403).
6. Administrator access granted to Command Center administrative endpoints.
7. Admin session logout and revocation.
"""

import sys
import os
import sqlite3

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from starlette.testclient import TestClient
from backend.main import app
from backend.database import get_db, init_db

client = TestClient(app)

results = []

def record(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    results.append({"name": name, "status": status, "detail": detail})
    print(f"[{status}] {name} - {detail}")

print("=== STARTING FLOODGUARD ADMIN AUTH & RBAC TEST SUITE ===")

# Test 1: SQLite schema and seeded credentials verification
init_db()
with get_db() as conn:
    row = conn.execute("SELECT username, password_hash, salt, role FROM admin_users WHERE username = 'zoro'").fetchone()
    has_admin = row is not None
    is_not_plaintext = row and row["password_hash"] != "roronovazoro22#" and len(row["password_hash"]) == 64
    has_salt = row and len(row["salt"]) == 32
    record(
        "TC-RBAC-001: SQLite Masked PBKDF2 Hash Storage",
        has_admin and is_not_plaintext and has_salt,
        f"zoro stored with 64-char PBKDF2 hash, salt len {len(row['salt'] if row else '')}, role {row['role'] if row else ''}"
    )

# Test 2: Admin Login with incorrect password
resp_bad = client.post("/api/auth/admin/login", json={"username": "zoro", "password": "wrongpassword123"})
record(
    "TC-RBAC-002: Bad Password Rejection",
    resp_bad.status_code == 401,
    f"HTTP {resp_bad.status_code}: {resp_bad.json().get('error')}"
)

# Test 3: Admin Login with non-existent username
resp_nouser = client.post("/api/auth/admin/login", json={"username": "fake_admin", "password": "roronovazoro22#"})
record(
    "TC-RBAC-003: Non-Existent User Rejection",
    resp_nouser.status_code == 401,
    f"HTTP {resp_nouser.status_code}: {resp_nouser.json().get('error')}"
)

# Test 4: Successful Admin Login with 'zoro' and 'roronovazoro22#'
resp_login = client.post("/api/auth/admin/login", json={"username": "zoro", "password": "roronovazoro22#"})
data_login = resp_login.json()
login_ok = resp_login.status_code == 200 and data_login.get("success") and "token" in data_login
admin_token = data_login.get("token")
record(
    "TC-RBAC-004: Valid Admin Authentication (zoro)",
    login_ok,
    f"Token issued: {admin_token[:12]}..., role: {data_login.get('role')}"
)

# Test 5: SQLite session persistence verification
with get_db() as conn:
    sess_row = conn.execute("SELECT session_token, username, role, expires_at FROM admin_sessions WHERE session_token = ?", (admin_token,)).fetchone()
    sess_persisted = sess_row is not None and sess_row["username"] == "zoro" and sess_row["role"] == "ADMIN"
    record(
        "TC-RBAC-005: SQLite Session Persistence",
        sess_persisted,
        f"Session token {admin_token[:12]}... recorded in SQLite admin_sessions table"
    )

# Test 6: Verify Active Session via API
resp_verify = client.get("/api/auth/admin/verify", headers={"Authorization": f"Bearer {admin_token}"})
verify_ok = resp_verify.status_code == 200 and resp_verify.json().get("authenticated") is True
record(
    "TC-RBAC-006: Admin Session Verification (Bearer)",
    verify_ok,
    f"HTTP {resp_verify.status_code}: Authenticated as {resp_verify.json().get('username')}"
)

# Test 7: Verify with invalid/forged token
resp_forged = client.get("/api/auth/admin/verify", headers={"Authorization": "Bearer ADM-forged-token-9999"})
record(
    "TC-RBAC-007: Forged Admin Token Rejection",
    resp_forged.status_code == 401,
    f"HTTP {resp_forged.status_code}: {resp_forged.json().get('error')}"
)

# Test 8: RBAC: Citizen role attempting to assign incident
resp_cit_assign = client.post(
    "/api/incidents/INC-2026-003/assign",
    headers={"X-User-Role": "CITIZEN"},
    json={"responderName": "Rogue Squad"}
)
record(
    "TC-RBAC-008: Citizen Blocked from Assigning Incidents",
    resp_cit_assign.status_code == 403,
    f"HTTP {resp_cit_assign.status_code}: {resp_cit_assign.json().get('detail')}"
)

# Test 9: RBAC: Citizen role attempting to resolve incident
resp_cit_resolve = client.post(
    "/api/incidents/INC-2026-003/resolve",
    headers={"X-User-Role": "CITIZEN"},
    json={"notes": "Citizen trying to self-resolve"}
)
record(
    "TC-RBAC-009: Citizen Blocked from Resolving Incidents",
    resp_cit_resolve.status_code == 403,
    f"HTTP {resp_cit_resolve.status_code}: {resp_cit_resolve.json().get('detail')}"
)

# Test 10: RBAC: Citizen role attempting to trigger dam flood simulation
resp_cit_surge = client.post(
    "/api/simulation/dam/surge",
    headers={"X-User-Role": "CITIZEN"},
    json={"surgeCm": 50}
)
record(
    "TC-RBAC-010: Citizen Blocked from Dam Control Controls",
    resp_cit_surge.status_code == 403,
    f"HTTP {resp_cit_surge.status_code}: {resp_cit_surge.json().get('detail')}"
)

# Test 11: RBAC: Citizen role attempting to run research simulations
resp_cit_research = client.post(
    "/api/research/run-scenario",
    headers={"X-User-Role": "CITIZEN"},
    json={"scenarioId": "SCENARIO-A"}
)
record(
    "TC-RBAC-011: Citizen Blocked from Research Simulation Mode",
    resp_cit_research.status_code == 403,
    f"HTTP {resp_cit_research.status_code}: {resp_cit_research.json().get('detail')}"
)

# Test 12: Admin role authorized to perform Command Center actions
resp_adm_assign = client.post(
    "/api/incidents/INC-2026-003/assign",
    headers={"Authorization": f"Bearer {admin_token}"},
    json={"responderName": "NDRF Boat Squad Alpha", "operator": "Duty Commander (zoro)"}
)
record(
    "TC-RBAC-012: Admin Granted Access to Assign Incidents",
    resp_adm_assign.status_code == 200 and resp_adm_assign.json().get("success") is True,
    f"HTTP {resp_adm_assign.status_code}: Successfully assigned responder"
)

# Test 13: Admin role authorized to resolve incident
resp_adm_resolve = client.post(
    "/api/incidents/INC-2026-003/resolve",
    headers={"Authorization": f"Bearer {admin_token}"},
    json={"notes": "Resolved by Admin zoro via Command Center", "operator": "Duty Commander (zoro)"}
)
record(
    "TC-RBAC-013: Admin Granted Access to Resolve Incidents",
    resp_adm_resolve.status_code == 200 and resp_adm_resolve.json().get("success") is True,
    f"HTTP {resp_adm_resolve.status_code}: Incident resolved"
)

# Test 14: Admin Logout terminates session
resp_logout = client.post(
    "/api/auth/admin/logout",
    headers={"Authorization": f"Bearer {admin_token}"}
)
record(
    "TC-RBAC-014: Admin Logout Session Termination",
    resp_logout.status_code == 200,
    f"HTTP {resp_logout.status_code}: {resp_logout.json().get('message')}"
)

# Test 15: Post-logout verification fails
resp_post_logout = client.get("/api/auth/admin/verify", headers={"Authorization": f"Bearer {admin_token}"})
record(
    "TC-RBAC-015: Post-Logout Session Invalidated",
    resp_post_logout.status_code == 401,
    f"HTTP {resp_post_logout.status_code}: Session token cleanly revoked from SQLite"
)

print("\n=== TEST SUMMARY ===")
passed_count = sum(1 for r in results if r["status"] == "PASS")
total_count = len(results)
print(f"Total Tests: {total_count} | Passed: {passed_count} | Failed: {total_count - passed_count}")

if passed_count == total_count:
    print("ALL ADMIN AUTH & RBAC TESTS PASSED WITH 100% SUCCESS RATE!")
    sys.exit(0)
else:
    print("SOME TESTS FAILED.")
    sys.exit(1)
