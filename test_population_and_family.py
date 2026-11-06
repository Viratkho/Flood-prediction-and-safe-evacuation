"""
FloodGuard 2.1 — Dynamic Population Mapping & Family Safety Test Suite
Validates Module 1 (Administrator Population Radius Tool) & Module 2 (Family Safety & Location Sharing).
"""

import time
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from starlette.testclient import TestClient
from backend.main import app
from backend.database import init_db, get_db

client = TestClient(app)

print("=" * 80)
print(" 👥 FLOODGUARD 2.1 — POPULATION ANALYSIS & FAMILY SAFETY TEST SUITE")
print("=" * 80)

init_db()

# Reset test isolation state for family and SOS
with get_db() as conn:
    conn.execute("DELETE FROM family_sos_alerts;")
    conn.execute("DELETE FROM family_location_permissions;")
    conn.execute("DELETE FROM family_connections;")
    now_ts = time.strftime("%Y-%m-%d %H:%M:%S")
    # Connection 1: P-101 <-> P-102 (ACCEPTED)
    conn.execute(
        """
        INSERT INTO family_connections (id, requester_id, invited_id, relationship, status, created_at, accepted_at, updated_at)
        VALUES (1, 'P-101', 'P-102', 'Spouse', 'ACCEPTED', ?, ?, ?)
        """,
        (now_ts, now_ts, now_ts)
    )
    conn.execute(
        """
        INSERT INTO family_location_permissions (connection_id, user_id, share_location, updated_at)
        VALUES (1, 'P-101', 1, ?), (1, 'P-102', 1, ?)
        """,
        (now_ts, now_ts)
    )
    # Connection 2: P-107 -> P-101 (PENDING)
    conn.execute(
        """
        INSERT INTO family_connections (id, requester_id, invited_id, relationship, status, created_at, accepted_at, updated_at)
        VALUES (2, 'P-107', 'P-101', 'Sister & Infant', 'PENDING', ?, NULL, ?)
        """,
        (now_ts, now_ts)
    )
    conn.execute(
        """
        INSERT INTO family_location_permissions (connection_id, user_id, share_location, updated_at)
        VALUES (2, 'P-107', 1, ?)
        """,
        (now_ts,)
    )
    # Ensure person P-103 has active SOS for TC-ADMIN-POP-006 testing
    conn.execute("UPDATE people SET sos_active = 1 WHERE person_id = 'P-103';")
    conn.commit()

passed = 0
failed = 0

def test(name: str, condition: bool, details: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"[PASS] {name} - {details}")
    else:
        failed += 1
        print(f"[FAIL] {name} - {details}")


# --------------------------------------------------------------------------
# MODULE 1: ADMINISTRATOR-ONLY POPULATION MAPPING TOOL
# --------------------------------------------------------------------------

# 1. Unauthenticated citizen blocked from population analysis
res = client.post("/api/admin/population/analysis", json={"centerLat": 13.104, "centerLng": 80.108, "radiusM": 2000})
test("TC-ADMIN-POP-001: Citizen Blocked from Population Analysis", res.status_code == 401, f"HTTP {res.status_code}")

# 2. Citizen role header explicitly forbidden
res = client.post(
    "/api/admin/population/analysis",
    json={"centerLat": 13.104, "centerLng": 80.108, "radiusM": 2000},
    headers={"X-User-Role": "CITIZEN"}
)
test("TC-ADMIN-POP-002: Citizen Role Header Explicit HTTP 403", res.status_code == 403, f"HTTP {res.status_code}: {res.text}")

# 3. Authenticate as Administrator (zoro)
admin_login = client.post("/api/auth/admin/login", json={"username": "zoro", "password": "roronovazoro22#"})
admin_token = admin_login.json().get("token")
test("TC-ADMIN-AUTH: Admin Login for Testing", admin_login.status_code == 200 and bool(admin_token), f"Token: {admin_token[:15]}...")

admin_headers = {"Authorization": f"Bearer {admin_token}"}

# 4. Administrator executes population analysis in Avadi Basin (Center: 13.104, 80.108, Radius: 3500m)
res = client.post(
    "/api/admin/population/analysis",
    json={"centerLat": 13.104, "centerLng": 80.108, "radiusM": 3500.0},
    headers=admin_headers
)
test("TC-ADMIN-POP-003: Admin Population Analysis Execution", res.status_code == 200, f"HTTP {res.status_code}")
data = res.json()
summary = data.get("summary", {})
individuals = data.get("individuals", [])

# 5. Verify population counts, disability breakdown, and deduplication
test(
    "TC-ADMIN-POP-004: Deduplication & Total Count",
    summary.get("totalRegisteredIndividuals", 0) > 0 and len(individuals) == summary.get("totalRegisteredIndividuals"),
    f"Total individuals in 3.5km: {summary.get('totalRegisteredIndividuals')}"
)

# 6. Verify disability categorization
with_dis = summary.get("withDeclaredDisabilities", 0)
without_dis = summary.get("withoutDeclaredDisabilities", 0)
unknown_dis = summary.get("unknownOrUnverifiedDisability", 0)
test(
    "TC-ADMIN-POP-005: Disability Categorization Breakdown",
    (with_dis + without_dis + unknown_dis) == summary.get("totalRegisteredIndividuals"),
    f"With: {with_dis}, Without: {without_dis}, Unknown: {unknown_dis}"
)

# 7. Verify SOS detection and high-risk count
test(
    "TC-ADMIN-POP-006: Active SOS & High Risk Flood Detection",
    summary.get("activeSosRequests", 0) >= 1 and summary.get("inHighRiskFloodZones", 0) >= 1,
    f"SOS Count: {summary.get('activeSosRequests')}, High-Risk Flood Count: {summary.get('inHighRiskFloodZones')}"
)

# 8. Verify Rescue Prioritization logic
test(
    "TC-ADMIN-POP-007: Rescue Priority Indicator",
    "P0" in summary.get("rescuePriorityBadge", "") or "P1" in summary.get("rescuePriorityBadge", ""),
    f"Badge: {summary.get('rescuePriorityBadge')} - {summary.get('rescuePriorityReason')[:50]}..."
)

# 9. Test out-of-bounds radius validation (<20m or >50,000m)
res_inv = client.post(
    "/api/admin/population/analysis",
    json={"centerLat": 13.104, "centerLng": 80.108, "radiusM": 5.0},
    headers=admin_headers
)
test("TC-ADMIN-POP-008: Minimum Radius Input Guard", res_inv.status_code == 422, f"HTTP {res_inv.status_code}")

# 9b. Test 1,000m (1.0 km) initial radius analysis
res_1km = client.post(
    "/api/admin/population/analysis",
    json={"centerLat": 13.1143, "centerLng": 80.1015, "radiusM": 1000.0},
    headers=admin_headers
)
test("TC-ADMIN-POP-009: Initial Radius Exactly 1,000m (1.0 km) Analysis", res_1km.status_code == 200 and res_1km.json().get("radiusM") == 1000.0, f"Radius: {res_1km.json().get('radiusM')}m, Individuals: {len(res_1km.json().get('individuals', []))}")


# --------------------------------------------------------------------------
# MODULE 2: FAMILY SAFETY AND LOCATION SHARING
# --------------------------------------------------------------------------

# 10. Get connected family members for P-101
res_fam = client.get("/api/family/members", headers={"X-Citizen-Id": "P-101"})
test("TC-FAM-001: Get Connected Family Members", res_fam.status_code == 200, f"HTTP {res_fam.status_code}")
fam_data = res_fam.json()
members = fam_data.get("members", [])
test(
    "TC-FAM-002: Seeded Family Member Verified (P-102)",
    len(members) >= 1 and any(m["personId"] == "P-102" for m in members),
    f"Found {len(members)} connected members. P-102 present: {any(m['personId'] == 'P-102' for m in members)}"
)

# 11. Verify coordinates and location label for accepted member
p102 = next((m for m in members if m["personId"] == "P-102"), None)
test(
    "TC-FAM-003: Permitted Coordinates & Accuracy Present",
    p102 is not None and p102.get("lat") is not None and p102.get("lng") is not None,
    f"P-102 coordinates: {p102.get('lat') if p102 else None}, {p102.get('lng') if p102 else None}"
)

# 12. Check pending incoming requests for P-101 (P-107 invited P-101)
res_req = client.get("/api/family/requests", headers={"X-Citizen-Id": "P-101"})
test("TC-FAM-004: Get Pending Family Requests", res_req.status_code == 200, f"HTTP {res_req.status_code}")
req_data = res_req.json()
incoming = req_data.get("incoming", [])
test(
    "TC-FAM-005: Incoming Request from P-107 Verified",
    len(incoming) >= 1 and any(r["requester_id"] == "P-107" for r in incoming),
    f"Found {len(incoming)} incoming requests. P-107: {any(r['requester_id'] == 'P-107' for r in incoming)}"
)

# 13. Accept incoming request from P-107
p107_req = next((r for r in incoming if r["requester_id"] == "P-107"), None)
if p107_req:
    res_accept = client.post(
        "/api/family/respond",
        json={"connectionId": p107_req["connection_id"], "action": "ACCEPT", "shareLocation": True},
        headers={"X-Citizen-Id": "P-101"}
    )
    test("TC-FAM-006: Accept Connection Request", res_accept.status_code == 200, f"HTTP {res_accept.status_code}: {res_accept.json().get('message')}")
    
    # Verify P-107 is now in connected members
    res_fam_updated = client.get("/api/family/members", headers={"X-Citizen-Id": "P-101"})
    members_updated = res_fam_updated.json().get("members", [])
    test(
        "TC-FAM-007: Accepted Member Now Visible in Family List",
        any(m["personId"] == "P-107" for m in members_updated),
        f"Total connected: {len(members_updated)}"
    )

# 14. Validation guard: cannot connect to self
res_self = client.post(
    "/api/family/request",
    json={"targetPersonId": "P-101", "relationship": "Self"},
    headers={"X-Citizen-Id": "P-101"}
)
test("TC-FAM-008: Reject Self-Connection Request", res_self.status_code == 400, f"HTTP {res_self.status_code}: {res_self.json().get('detail')}")

# 15. Validation guard: non-existent ID
res_none = client.post(
    "/api/family/request",
    json={"targetPersonId": "P-NON-EXISTENT-9999", "relationship": "Cousin"},
    headers={"X-Citizen-Id": "P-101"}
)
test("TC-FAM-009: Reject Non-Existent FloodGuard ID", res_none.status_code == 404, f"HTTP {res_none.status_code}: {res_none.json().get('detail')}")

# 16. Validation guard: duplicate connection request
res_dup = client.post(
    "/api/family/request",
    json={"targetPersonId": "P-102", "relationship": "Spouse"},
    headers={"X-Citizen-Id": "P-101"}
)
test("TC-FAM-010: Prevent Duplicate Connection", res_dup.status_code == 400, f"HTTP {res_dup.status_code}: {res_dup.json().get('detail')}")

# 17. Toggle location sharing permission off for P-102
if p102:
    res_perm = client.post(
        "/api/family/permission",
        json={"connectionId": p102["connectionId"], "shareLocation": False},
        headers={"X-Citizen-Id": "P-101"}
    )
    test("TC-FAM-011: Toggle Location Permission Off", res_perm.status_code == 200, f"HTTP {res_perm.status_code}: {res_perm.json().get('message')}")
    
    # Toggle back on
    res_perm_on = client.post(
        "/api/family/permission",
        json={"connectionId": p102["connectionId"], "shareLocation": True},
        headers={"X-Citizen-Id": "P-101"}
    )
    test("TC-FAM-012: Toggle Location Permission On", res_perm_on.status_code == 200, f"Status: {res_perm_on.json().get('locationSharingStatus')}")

# 18. Emergency Family SOS Broadcast
res_sos = client.post(
    "/api/family/sos",
    json={
        "alertMessage": "🚨 FAMILY EMERGENCY: Water rising rapidly in living room! Need boat assistance.",
        "lat": 13.104,
        "lng": 80.108,
        "accuracyM": 5.0,
        "locationName": "Avadi Canal Bridge"
    },
    headers={"X-Citizen-Id": "P-101"}
)
test("TC-FAM-013: Broadcast Emergency Family SOS", res_sos.status_code == 200, f"SOS ID: {res_sos.json().get('sosId')}, Notified: {res_sos.json().get('notifiedFamilyCount')} members")

# 19. Cancel Family SOS
res_cancel_sos = client.post("/api/family/sos/cancel", headers={"X-Citizen-Id": "P-101"})
test("TC-FAM-014: Cancel Emergency Family SOS", res_cancel_sos.status_code == 200, f"HTTP {res_cancel_sos.status_code}: {res_cancel_sos.json().get('message')}")

# 20. Research scenario execution (Verify experiment_logs fix)
res_scen = client.post("/api/research/run-scenario", json={"scenarioId": "SCENARIO-A"}, headers=admin_headers)
test("TC-FIX-001: Research Scenario Execution (experiment_logs)", res_scen.status_code == 200, f"HTTP {res_scen.status_code}")

res_exp = client.get("/api/research/export?format=csv")
test("TC-FIX-002: Research CSV Export (experiment_logs)", res_exp.status_code == 200 and "Timestamp" in res_exp.text, f"HTTP {res_exp.status_code}")

print("\n" + "=" * 80)
print(f" 📊 TEST SUMMARY: {passed} PASSED / {failed} FAILED ({round(passed / (passed + failed) * 100, 1)}% SUCCESS RATE)")
print("=" * 80)
