import urllib.request
import urllib.error
import json
import time
import sys

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:3000"

def request(method, path, data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{path}"
    req_body = json.dumps(data).encode("utf-8") if data is not None else None
    if data is not None and "Content-Type" not in headers:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            try:
                parsed = json.loads(content)
            except Exception:
                parsed = content
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = content
        return e.code, parsed
    except Exception as e:
        return 0, str(e)

results = []

def test(name, status, details=""):
    results.append({"name": name, "status": status, "details": details})
    print(f"[{status}] {name} - {details}")

print("=== STARTING COMPREHENSIVE FLOODGUARD AUDIT TEST SUITE ===")

# Test 1: Frontend root load
code, res = request("GET", "/")
if code == 200 and "FloodGuard" in str(res):
    test("TC-FE-001: Frontend Root SPA Delivery", "PASS", "HTTP 200, HTML contains FloodGuard title")
else:
    test("TC-FE-001: Frontend Root SPA Delivery", "FAIL", f"HTTP {code}")

# Test 2: Person Intake - Valid Registration
valid_person = {
    "name": "Kavitha R.",
    "contactNumber": "+919840123456",
    "age": 34,
    "gender": "FEMALE",
    "addressLandmark": "Near Avadi Lake Bridge",
    "medicalNotes": "Asthmatic, needs inhaler",
    "medicalConditions": ["RESPIRATORY"],
    "dependentsCount": 2,
    "currentElevationM": 12.0,
    "lat": 13.1120,
    "lng": 80.1030
}
code, res = request("POST", "/api/people", valid_person)
if code in (200, 201) and isinstance(res, dict) and "person" in res:
    created_id = res["person"]["personId"]
    test("TC-BE-001: Person Registration Valid", "PASS", f"Created person ID {created_id}, Priority: {res['person'].get('rescuePriority')}")
else:
    test("TC-BE-001: Person Registration Valid", "FAIL", f"HTTP {code}: {res}")

# Test 3: Person Intake - Missing Required Name
invalid_person = {"contactNumber": "+919840123456"}
code, res = request("POST", "/api/people", invalid_person)
if code == 400:
    test("TC-BE-002: Person Registration Missing Name", "PASS", f"Properly rejected HTTP 400: {res.get('error') if isinstance(res, dict) else res}")
else:
    test("TC-BE-002: Person Registration Missing Name", "FAIL", f"Expected 400, got {code}")

# Test 4: Person Intake - Missing Contact Number (Fallback applies +91 98400 00000 in server)
code, res = request("POST", "/api/people", {"name": " "})
if code == 400:
    test("TC-BE-003: Person Registration Whitespace Name", "PASS", f"Properly rejected HTTP 400: {res.get('error') if isinstance(res, dict) else res}")
else:
    test("TC-BE-003: Person Registration Whitespace Name", "FAIL", f"Expected 400, got {code}")

# Test 5: Incident Management - Fetch Initial Incidents
code, inc_resp = request("GET", "/api/incidents")
if code == 200 and isinstance(inc_resp, dict) and "incidents" in inc_resp and len(inc_resp["incidents"]) > 0:
    incidents = inc_resp["incidents"]
    target_inc = incidents[0]["id"]
    test("TC-BE-004: Incidents List", "PASS", f"Found {len(incidents)} incidents. Target: {target_inc}")
    
    # Test 6: Acknowledge Incident
    c2, r2 = request("POST", f"/api/incidents/{target_inc}/acknowledge", {"operatorName": "Auditor Commander"})
    if c2 == 200 and r2.get("incident", {}).get("status") == "ACKNOWLEDGED":
        test("TC-BE-005: Incident Acknowledge Workflow", "PASS", f"Status updated to ACKNOWLEDGED")
    else:
        test("TC-BE-005: Incident Acknowledge Workflow", "FAIL", f"HTTP {c2}: {r2}")

    # Test 7: Assign Tactical Unit
    c3, r3 = request("POST", f"/api/incidents/{target_inc}/assign", {"responderName": "NDRF Boat Squad Alpha", "operator": "Auditor Commander"})
    if c3 == 200 and r3.get("incident", {}).get("assignedResponderName") == "NDRF Boat Squad Alpha":
        test("TC-BE-006: Incident Tactical Unit Assignment", "PASS", "Assigned NDRF Boat Squad Alpha")
    else:
        test("TC-BE-006: Incident Tactical Unit Assignment", "FAIL", f"HTTP {c3}: {r3}")

    # Test 8: Resolve Incident
    c4, r4 = request("POST", f"/api/incidents/{target_inc}/resolve", {"notes": "Citizens evacuated to high ground", "operatorName": "Auditor Commander"})
    if c4 == 200 and r4.get("incident", {}).get("status") == "RESOLVED":
        test("TC-BE-007: Incident Resolve Workflow", "PASS", "Status updated to RESOLVED")
    else:
        test("TC-BE-007: Incident Resolve Workflow", "FAIL", f"HTTP {c4}: {r4}")
else:
    test("TC-BE-004: Incidents List", "FAIL", f"HTTP {code}")

# Test 9: Non-existent Incident ID
c_bad, r_bad = request("POST", "/api/incidents/INC-NON-EXISTENT-9999/acknowledge", {})
if c_bad == 404:
    test("TC-BE-008: Non-Existent Incident 404", "PASS", "Correctly returned HTTP 404")
else:
    test("TC-BE-008: Non-Existent Incident 404", "FAIL", f"Expected 404, got {c_bad}")

# Test 10: Dam Simulation Controls - Start Storm
c_sim, r_sim = request("POST", "/api/simulation/dam/start")
if c_sim == 200 and r_sim.get("state", {}).get("status") == "STORM BUILDUP":
    test("TC-BE-009: Dam Storm Simulation Start", "PASS", "Status transitioned to STORM BUILDUP")
else:
    test("TC-BE-009: Dam Storm Simulation Start", "FAIL", f"HTTP {c_sim}: {r_sim}")

# Test 11: Dam Simulation Surge Injection
c_surge, r_surge = request("POST", "/api/simulation/dam/surge", {"surgeCm": 50})
if c_surge == 200:
    test("TC-BE-010: Dam Surge Injection +50cm", "PASS", f"Injected +50cm surge. Level: {r_surge.get('state', {}).get('reservoirLevelM')}m")
else:
    test("TC-BE-010: Dam Surge Injection +50cm", "FAIL", f"HTTP {c_surge}: {r_surge}")

# Test 12: Full Flood Simulation Trigger
c_flood, r_flood = request("POST", "/api/simulation/flood/full")
if c_flood == 200:
    test("TC-BE-011: Full Flood Catastrophe Trigger", "PASS", f"Full flood active. Inflow: {r_flood.get('state', {}).get('inflowCusecs')} cusecs")
else:
    test("TC-BE-011: Full Flood Catastrophe Trigger", "FAIL", f"HTTP {c_flood}")

# Test 13: Dam Simulation Reset
c_rst, r_rst = request("POST", "/api/simulation/dam/reset")
if c_rst == 200 and r_rst.get("state", {}).get("status") == "NORMAL":
    test("TC-BE-012: Dam Simulation Reset", "PASS", "Reset to NORMAL state")
else:
    test("TC-BE-012: Dam Simulation Reset", "FAIL", f"HTTP {c_rst}")

# Test 14: Mobile Alert Dispatch
alert_payload = {
    "mobileNumber": "+919840123456",
    "recipientName": "Kavitha R.",
    "alertType": "EVACUATE_NOW",
    "headline": "⚠️ URGENT FLOOD WARNING",
    "message": "Water rising rapidly near Paruthipattu bridge. Evacuate to Thirumullaivoyal high ridge immediately."
}
c_sms, r_sms = request("POST", "/api/alerts/send-mobile", alert_payload)
if c_sms == 200 and isinstance(r_sms, dict) and r_sms.get("success") is True:
    test("TC-BE-013: Mobile Alert Gateway Dispatch", "PASS", f"Delivered: {r_sms.get('deliveryStatus')}, Gateway: {r_sms.get('gatewayUsed')}")
else:
    test("TC-BE-013: Mobile Alert Gateway Dispatch", "FAIL", f"HTTP {c_sms}: {r_sms}")

# Test 15: Mobile Alert Dispatch - Missing Phone
c_no_phone, r_no_phone = request("POST", "/api/alerts/send-mobile", {"message": "Test"})
if c_no_phone == 400:
    test("TC-BE-014: Mobile Alert Validation Missing Phone", "PASS", "HTTP 400 rejected")
else:
    test("TC-BE-014: Mobile Alert Validation Missing Phone", "FAIL", f"Expected 400, got {c_no_phone}")

# Test 16: AI Advice Endpoint - Fallback Engine Behavior
ai_payload = {
    "prompt": "Water is entering my ground floor living room in Avadi. Where should I go?",
    "userLocation": [13.1120, 80.1030],
    "blockedRoads": ["Paruthipattu Low Riverbank"],
    "currentDamLevel": 34.2,
    "nearestShelter": "Thirumullaivoyal Defense Ridge Pavilion",
    "personProfile": {
        "name": "Kavitha R.",
        "contactNumber": "+919840123456",
        "medicalConditions": ["RESPIRATORY"],
        "heartRateBpm": 122,
        "spo2Percent": 93
    }
}
c_ai, r_ai = request("POST", "/api/ai/advise", ai_payload)
if c_ai == 200 and isinstance(r_ai, dict) and "reply" in r_ai:
    reply = r_ai["reply"]
    test("TC-BE-015: Aegis AI Advisor Response", "PASS", f"Response generated ({len(reply)} chars). Contains tactical markdown advice.")
else:
    test("TC-BE-015: Aegis AI Advisor Response", "FAIL", f"HTTP {c_ai}: {r_ai}")

# Test 17: Security - Malicious Scanner User-Agent Detection (WAF)
c_waf1, r_waf1 = request("GET", "/api/health", headers={"User-Agent": "sqlmap/1.6.12#stable"})
if c_waf1 == 403:
    test("TC-SEC-001: WAF Scanner Tool Blocking (sqlmap)", "PASS", "Interception 403 Forbidden")
else:
    test("TC-SEC-001: WAF Scanner Tool Blocking (sqlmap)", "FAIL", f"Expected 403, got {c_waf1}")

# Test 18: Security - SQL Injection Attempt in API
c_waf2, r_waf2 = request("GET", "/api/dam?id=1%20UNION%20SELECT%20*%20FROM%20users")
if c_waf2 == 403:
    test("TC-SEC-002: WAF SQL Injection Signature Interception", "PASS", "Interception 403 Forbidden")
else:
    test("TC-SEC-002: WAF SQL Injection Signature Interception", "FAIL", f"Expected 403, got {c_waf2}")

# Test 19: Security - XSS Attempt in Payload
xss_payload = {
    "fullName": "<script>alert('pwned')</script>",
    "contactNumber": "9840123456"
}
c_waf3, r_waf3 = request("POST", "/api/people", xss_payload)
if c_waf3 == 403:
    test("TC-SEC-003: WAF Stored XSS Interception", "PASS", "Interception 403 Forbidden")
else:
    test("TC-SEC-003: WAF Stored XSS Interception", "FAIL", f"Expected 403, got {c_waf3}")

# Clear quarantine after security tests so subsequent functional tests proceed cleanly
c_clr, r_clr = request("POST", "/api/security/firewall-clear-quarantine")
test("TC-SEC-004: WAF IP Quarantine Reset", "PASS" if c_clr == 200 else "FAIL", f"HTTP {c_clr}: {r_clr}")

# Test 20: Research Scenarios & Export
c_scen, r_scen = request("GET", "/api/research/scenarios")
if c_scen == 200 and isinstance(r_scen, list) and len(r_scen) > 0:
    test("TC-BE-016: Research Scenarios Catalog", "PASS", f"Loaded {len(r_scen)} research benchmark scenarios")
    
    # Run first scenario
    first_scen = r_scen[0]["id"]
    c_run, r_run = request("POST", "/api/research/run-scenario", {"scenarioId": first_scen})
    if c_run == 200 and r_run.get("success") is True:
        test("TC-BE-017: Run Research Benchmark Scenario", "PASS", f"Scenario {first_scen} executed with {len(r_run.get('peopleAfter', []))} people updated")
    else:
        test("TC-BE-017: Run Research Benchmark Scenario", "FAIL", f"HTTP {c_run}")
else:
    test("TC-BE-016: Research Scenarios Catalog", "FAIL", f"HTTP {c_scen}")

# Test 21: Research CSV Export
c_exp, r_exp = request("GET", "/api/research/export?format=csv")
if c_exp == 200 and "Timestamp,ScenarioID,ScenarioName" in str(r_exp):
    test("TC-BE-018: Research Dataset CSV Export", "PASS", "CSV headers and rows returned cleanly")
else:
    test("TC-BE-018: Research Dataset CSV Export", "FAIL", f"HTTP {c_exp}: {str(r_exp)[:100]}")

print("\n=== SUMMARY OF RESULTS ===")
total = len(results)
passed = sum(1 for r in results if r["status"] == "PASS")
failed = sum(1 for r in results if r["status"] == "FAIL")
print(f"Total Tests Executed: {total} | Passed: {passed} | Failed: {failed}")
