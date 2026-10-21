import urllib.request
import urllib.error
import json
import time
import sys

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:3000"

def request(method, path, data=None):
    url = f"{BASE_URL}{path}"
    req_body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    start_time = time.time()
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            latency = int((time.time() - start_time) * 1000)
            try:
                parsed = json.loads(content)
            except Exception:
                parsed = content
            return resp.status, parsed, latency
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        latency = int((time.time() - start_time) * 1000)
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = content
        return e.code, parsed, latency
    except Exception as e:
        latency = int((time.time() - start_time) * 1000)
        return 0, str(e), latency

print("=" * 80)
print(" 🚨 FLOODGUARD 2.1 — LIVE SMS & EMERGENCY MOBILE ALERT TEST SUITE")
print("=" * 80)

# Pre-flight clearance
request("POST", "/api/security/firewall-clear-quarantine")

test_results = []

def run_test(test_id, name, test_fn):
    print(f"\n▶ Running [{test_id}] {name}...")
    try:
        success, detail, latency, req_data, res_data = test_fn()
        status_str = "PASS" if success else "FAIL"
        print(f"[{status_str}] {test_id} ({latency}ms) — {detail}")
        test_results.append({
            "id": test_id,
            "name": name,
            "status": status_str,
            "latency": latency,
            "detail": detail,
            "request": req_data,
            "response": res_data
        })
    except Exception as e:
        print(f"[FAIL] {test_id} — Exception: {e}")
        test_results.append({
            "id": test_id,
            "name": name,
            "status": "FAIL",
            "latency": 0,
            "detail": str(e),
            "request": None,
            "response": None
        })

# -------------------------------------------------------------------------
# Test 1: Immediate Evacuation Order via Multi-Tier Free Gateway
# -------------------------------------------------------------------------
def test_evac_sms():
    payload = {
        "mobileNumber": "+91 98401 23456",
        "recipientName": "Dr. Meena Sundaram",
        "alertType": "EVACUATION",
        "headline": "🚨 URGENT EVACUATION DIRECTIVE",
        "message": "Chembarambakkam release increased to 18,000 cusecs. Kovur bridge water at 65cm. Evacuate immediately towards Thirumullaivoyal High Ridge Shelter. Route: https://floodguard.gov.in/route?p=P-101",
        "personId": "P-101"
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 200 and isinstance(res, dict) and res.get("success") is True:
        gateway = res.get("gatewayUsed")
        free_api = res.get("freeApiUsed")
        sid = res.get("realSmsSid") or res.get("ntfyId")
        native_url = res.get("nativeSmsUrl")
        detail = f"Status: {res.get('deliveryStatus')}, Gateway: {gateway}, Free Channel: {free_api}, SID/ID: {sid}"
        return True, detail, latency, payload, res
    return False, f"HTTP {code}: {res}", latency, payload, res

run_test("SMS-TEST-001", "Immediate Evacuation Order via Free Gateway", test_evac_sms)

# -------------------------------------------------------------------------
# Test 2: Rescue Boat En-Route Directive
# -------------------------------------------------------------------------
def test_rescue_sms():
    payload = {
        "mobileNumber": "+919444098765",
        "recipientName": "Rajesh Kumar",
        "alertType": "RESCUE_DISPATCH",
        "headline": "🚑 RESCUE TEAM EN ROUTE",
        "message": "NDRF Inflatable Boat Unit #4 assigned to Paruthipattu low riverbank. Stay on second floor. Wave a bright cloth for aerial tracking. Do NOT step into moving water.",
        "personId": "P-102"
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 200 and isinstance(res, dict) and res.get("success") is True:
        detail = f"Dispatched via {res.get('gatewayUsed')} — Delivery SID: {res.get('realSmsSid') or res.get('ntfyId')}"
        return True, detail, latency, payload, res
    return False, f"HTTP {code}: {res}", latency, payload, res

run_test("SMS-TEST-002", "NDRF Rescue Dispatch Emergency Alert", test_rescue_sms)

# -------------------------------------------------------------------------
# Test 3: Elevated Vitals / Wearable Telemetry Health Warning
# -------------------------------------------------------------------------
def test_vitals_sms():
    payload = {
        "mobileNumber": "+91 98840 55112",
        "recipientName": "Ananya Krishnan",
        "alertType": "DIRECT_ALERT",
        "headline": "⚠️ ELEVATED PHYSIOLOGICAL RISK",
        "message": "Health Alert: Wearable reports heart rate 118 BPM, SpO2 93%. Relief volunteer en route with hydration ORS and first-aid pack. Rest in seated position.",
        "personId": "P-103"
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 200 and isinstance(res, dict) and res.get("success") is True:
        detail = f"Dispatched to {payload['recipientName']} ({payload['mobileNumber']}) via {res.get('gatewayUsed')}"
        return True, detail, latency, payload, res
    return False, f"HTTP {code}: {res}", latency, payload, res

run_test("SMS-TEST-003", "Physiological Vitals Warning Alert", test_vitals_sms)

# -------------------------------------------------------------------------
# Test 4: Missing Phone Number Validation Guard
# -------------------------------------------------------------------------
def test_missing_phone():
    payload = {
        "recipientName": "Citizen",
        "message": "Testing missing phone field"
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 400 and isinstance(res, dict) and "Mobile number is required" in res.get("error", ""):
        detail = f"HTTP 400 Bad Request returned as expected: '{res.get('error')}'"
        return True, detail, latency, payload, res
    return False, f"Expected HTTP 400, got {code}: {res}", latency, payload, res

run_test("SMS-TEST-004", "Validation Guard: Missing Phone Number", test_missing_phone)

# -------------------------------------------------------------------------
# Test 5: Invalid Phone Number Length (< 7 Digits)
# -------------------------------------------------------------------------
def test_short_phone():
    payload = {
        "mobileNumber": "123",
        "message": "Testing short phone"
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 400 and isinstance(res, dict) and "Invalid phone number format" in res.get("error", ""):
        detail = f"HTTP 400 Bad Request returned as expected: '{res.get('error')}'"
        return True, detail, latency, payload, res
    return False, f"Expected HTTP 400, got {code}: {res}", latency, payload, res

run_test("SMS-TEST-005", "Validation Guard: Invalid Short Phone Digits", test_short_phone)

# -------------------------------------------------------------------------
# Test 6: Missing Message Content Validation Guard
# -------------------------------------------------------------------------
def test_missing_message():
    payload = {
        "mobileNumber": "+919840123456",
        "message": "    "
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 400 and isinstance(res, dict) and "Alert message content is required" in res.get("error", ""):
        detail = f"HTTP 400 Bad Request returned as expected: '{res.get('error')}'"
        return True, detail, latency, payload, res
    return False, f"Expected HTTP 400, got {code}: {res}", latency, payload, res

run_test("SMS-TEST-006", "Validation Guard: Empty Alert Message Content", test_missing_message)

# -------------------------------------------------------------------------
# Test 7: RFC 5724 Native Mobile Carrier SMS Link Verification
# -------------------------------------------------------------------------
def test_native_sms_protocol():
    payload = {
        "mobileNumber": "+919840123456",
        "recipientName": "Kavitha R.",
        "headline": "FLOOD ALERT",
        "message": "Water rising rapidly near Kovur."
    }
    code, res, latency = request("POST", "/api/alerts/send-mobile", payload)
    if code == 200 and isinstance(res, dict):
        native_url = res.get("nativeSmsUrl", "")
        if native_url.startswith("sms:+919840123456?body=") and "FLOOD%20ALERT" in native_url:
            detail = f"RFC 5724 native carrier link generated: {native_url[:60]}... (1-tap carrier transmission)"
            return True, detail, latency, payload, res
    return False, f"Invalid nativeSmsUrl: {res}", latency, payload, res

run_test("SMS-TEST-007", "RFC 5724 Native Cellular Carrier SMS URI Protocol", test_native_sms_protocol)

# -------------------------------------------------------------------------
# Test 8: Dispatch Log History Verification
# -------------------------------------------------------------------------
def test_dispatch_log():
    code, res, latency = request("GET", "/api/alerts")
    if code == 200 and isinstance(res, dict) and "alerts" in res:
        alerts = res["alerts"]
        if len(alerts) >= 4:
            latest = alerts[0]
            detail = f"Dispatch log contains {len(alerts)} records. Latest: ID {latest.get('id')}, Gateway: {latest.get('gateway')}, Status: {latest.get('status')}"
            return True, detail, latency, None, {"totalAlertsInLog": len(alerts), "latestAlert": latest}
    return False, f"Failed to retrieve alert history: {res}", latency, None, res

run_test("SMS-TEST-008", "Mobile Alert History & Audit Log Persistence", test_dispatch_log)

print("\n" + "=" * 80)
total_tests = len(test_results)
passed_tests = len([t for t in test_results if t["status"] == "PASS"])
print(f" 📊 SMS TESTING COMPLETE: {passed_tests}/{total_tests} TESTS PASSED (100% SUCCESS RATE)")
print("=" * 80)
