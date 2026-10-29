"""
FloodGuard 2.1 — QR-Based Cross-Device Authentication Automated Test Suite
Verifies FastAPI endpoints, SQLite persistence, and security controls.
"""

import os
import sys
import json
import time
import tempfile
from datetime import datetime, timezone, timedelta

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Set up temporary isolated SQLite database for clean test execution
temp_dir = tempfile.mkdtemp()
temp_db_path = os.path.join(temp_dir, "test_floodguard_qr.db")
os.environ["DATABASE_PATH"] = temp_db_path

from starlette.testclient import TestClient
from backend.main import app
from backend.database import init_db, get_db

client = TestClient(app)

results = []

def record_test(name: str, status: str, details: str = ""):
    results.append({"name": name, "status": status, "details": details})
    print(f"[{status}] {name} - {details}")

def run_tests():
    print("=== STARTING FLOODGUARD QR-BASED CROSS-DEVICE AUTH TEST SUITE ===")
    
    # 0. Initialize DB and Seed a registered test person
    init_db()
    test_person_id = "P-9999"
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO people (
                person_id, wearable_id, name, age, gender, contact_number,
                emergency_contact_name, emergency_contact_phone, address_landmark,
                location_name, country, administrative_region, country_code,
                lat, lng, location_timestamp, gps_accuracy_m, elevation_m,
                heart_rate_bpm, spo2_percent, health_timestamp, health_data_validity,
                flood_depth_cm, flood_risk_level, drift_status, drift_confidence,
                drift_velocity_ms, sos_active, rescue_priority, priority_reason,
                comm_status, last_communication_time, battery_percent, is_user_registered,
                role, created_at
            ) VALUES (
                ?, 'WB-999', 'Commander Sarah V.', 34, 'Female', '+91 98401 99999',
                'Emergency HQ', '+91 98400 00000', 'Thirumullaivoyal High Ridge',
                'Thirumullaivoyal High Ridge Safe Haven', 'India', 'Tamil Nadu', 'IN',
                13.1250, 80.1150, '12:00 PM', 5.0, 24.8,
                72, 99, '12:00 PM', 'VALID',
                5, 'SAFE', 'STATIONARY', 0,
                0.0, 0, 'P3', 'Secure High Ground Base',
                'ONLINE', '12:00 PM', 98, 1,
                'CITIZEN', '2026-10-29T12:00:00Z'
            )
            """,
            (test_person_id,),
        )

    # TC-QR-001: Device B creates QR pairing session
    create_payload = {
        "deviceInfo": {
            "browser": "Chrome Mobile",
            "platform": "Android 14",
            "ip": "192.168.1.105"
        }
    }
    res = client.post("/api/auth/qr/create", json=create_payload)
    if res.status_code == 200:
        data = res.json()
        session_id = data.get("sessionId")
        token = data.get("token")
        qr_data = data.get("qrData")
        expires_in = data.get("expiresIn")
        if session_id and token and qr_data and expires_in == 120:
            record_test("TC-QR-001: Device B QR Creation", "PASS", f"Session: {session_id}, Token generated, Exp: {expires_in}s")
        else:
            record_test("TC-QR-001: Device B QR Creation", "FAIL", f"Missing fields: {data}")
            return
    else:
        record_test("TC-QR-001: Device B QR Creation", "FAIL", f"HTTP {res.status_code}")
        return

    # TC-QR-002: Device B polls status for PENDING session
    res = client.get(f"/api/auth/qr/status/{session_id}")
    if res.status_code == 200 and res.json().get("status") == "PENDING":
        record_test("TC-QR-002: Status Polling (PENDING)", "PASS", "Session status is PENDING")
    else:
        record_test("TC-QR-002: Status Polling (PENDING)", "FAIL", f"Expected PENDING, got {res.text}")

    # TC-QR-003: Device A scans with invalid token (must fail with 401)
    bad_scan = {
        "sessionId": session_id,
        "token": "tampered_token_xyz_12345",
        "personId": test_person_id
    }
    res = client.post("/api/auth/qr/scan", json=bad_scan)
    if res.status_code == 401:
        record_test("TC-QR-003: Security - Invalid Token Rejection", "PASS", "Rejected tampered token with HTTP 401")
    else:
        record_test("TC-QR-003: Security - Invalid Token Rejection", "FAIL", f"Expected 401, got {res.status_code}")

    # TC-QR-004: Device A scans with non-existent person ID (must fail with 404)
    fake_user_scan = {
        "sessionId": session_id,
        "token": token,
        "personId": "P-NON-EXISTENT"
    }
    res = client.post("/api/auth/qr/scan", json=fake_user_scan)
    if res.status_code == 404:
        record_test("TC-QR-004: Security - Non-Existent User Rejection", "PASS", "Rejected non-existent user with HTTP 404")
    else:
        record_test("TC-QR-004: Security - Non-Existent User Rejection", "FAIL", f"Expected 404, got {res.status_code}")

    # TC-QR-005: Device A scans with valid credentials
    valid_scan = {
        "sessionId": session_id,
        "token": token,
        "personId": test_person_id,
        "sourceDeviceInfo": {
            "browser": "Safari iOS",
            "platform": "iPhone 15 Pro",
            "ip": "192.168.1.50"
        }
    }
    res = client.post("/api/auth/qr/scan", json=valid_scan)
    if res.status_code == 200 and res.json().get("status") == "SCANNED":
        target_info = res.json().get("targetDeviceInfo", {})
        if target_info.get("platform") == "Android 14":
            record_test("TC-QR-005: Device A Scans QR Code", "PASS", f"Status updated to SCANNED, target device verified: {target_info.get('platform')}")
        else:
            record_test("TC-QR-005: Device A Scans QR Code", "FAIL", f"Target device info mismatch: {target_info}")
    else:
        record_test("TC-QR-005: Device A Scans QR Code", "FAIL", f"HTTP {res.status_code}: {res.text}")

    # TC-QR-006: Device B premature complete before approval (must fail with 400)
    premature_complete = {
        "sessionId": session_id,
        "token": token
    }
    res = client.post("/api/auth/qr/complete", json=premature_complete)
    if res.status_code == 400 and "not approved" in res.json().get("error", "").lower():
        record_test("TC-QR-006: Security - Premature Complete Prevention", "PASS", "Device B cannot complete unapproved session (HTTP 400)")
    else:
        record_test("TC-QR-006: Security - Premature Complete Prevention", "FAIL", f"Expected 400, got {res.status_code}: {res.text}")

    # TC-QR-007: Device A approval with mismatched user ID (must fail with 403)
    mismatch_approve = {
        "sessionId": session_id,
        "token": token,
        "personId": "P-101" # different user
    }
    res = client.post("/api/auth/qr/approve", json=mismatch_approve)
    if res.status_code == 403:
        record_test("TC-QR-007: Security - Account Mismatch Protection", "PASS", "Device A cannot approve session for different user account (HTTP 403)")
    else:
        record_test("TC-QR-007: Security - Account Mismatch Protection", "FAIL", f"Expected 403, got {res.status_code}")

    # TC-QR-008: Device A approves session
    valid_approve = {
        "sessionId": session_id,
        "token": token,
        "personId": test_person_id
    }
    res = client.post("/api/auth/qr/approve", json=valid_approve)
    if res.status_code == 200 and res.json().get("status") == "APPROVED":
        record_test("TC-QR-008: Device A Approves Pairing", "PASS", "Session status transitioned to APPROVED")
    else:
        record_test("TC-QR-008: Device A Approves Pairing", "FAIL", f"HTTP {res.status_code}: {res.text}")

    # TC-QR-009: Device B detects APPROVED status via polling
    res = client.get(f"/api/auth/qr/status/{session_id}")
    if res.status_code == 200 and res.json().get("status") == "APPROVED":
        record_test("TC-QR-009: Status Polling (APPROVED)", "PASS", "Device B polls and receives APPROVED status")
    else:
        record_test("TC-QR-009: Status Polling (APPROVED)", "FAIL", f"Expected APPROVED, got {res.text}")

    # TC-QR-010: Device B completes authentication
    valid_complete = {
        "sessionId": session_id,
        "token": token
    }
    res = client.post("/api/auth/qr/complete", json=valid_complete)
    if res.status_code == 200:
        data = res.json()
        person = data.get("person", {})
        if person.get("personId") == test_person_id and person.get("name") == "Commander Sarah V.":
            record_test("TC-QR-010: Device B Automatic Login Completion", "PASS", f"Logged in as {person.get('name')} ({person.get('personId')})")
        else:
            record_test("TC-QR-010: Device B Automatic Login Completion", "FAIL", f"Returned incorrect person: {person}")
    else:
        record_test("TC-QR-010: Device B Automatic Login Completion", "FAIL", f"HTTP {res.status_code}: {res.text}")

    # TC-QR-011: Single-Use Token Enforcement (Replay Attack Prevention)
    res = client.post("/api/auth/qr/complete", json=valid_complete)
    if res.status_code == 400 and "not approved" in res.json().get("error", "").lower():
        record_test("TC-QR-011: Security - Single-Use Token Enforcement", "PASS", "Replay attempt rejected: session already COMPLETED")
    else:
        record_test("TC-QR-011: Security - Single-Use Token Enforcement", "FAIL", f"Expected 400, got {res.status_code}: {res.text}")

    # TC-QR-012: Rejection Flow
    res_rej_init = client.post("/api/auth/qr/create", json={"deviceInfo": {"browser": "Firefox"}})
    rej_sid = res_rej_init.json()["sessionId"]
    rej_tok = res_rej_init.json()["token"]
    # Scan it
    client.post("/api/auth/qr/scan", json={"sessionId": rej_sid, "token": rej_tok, "personId": test_person_id})
    # Reject it
    res_rej = client.post("/api/auth/qr/reject", json={"sessionId": rej_sid, "token": rej_tok, "personId": test_person_id})
    if res_rej.status_code == 200 and res_rej.json().get("status") == "REJECTED":
        # Check complete fails
        res_comp_rej = client.post("/api/auth/qr/complete", json={"sessionId": rej_sid, "token": rej_tok})
        if res_comp_rej.status_code == 400:
            record_test("TC-QR-012: Rejection Workflow", "PASS", "Rejected session successfully stopped and cannot be completed")
        else:
            record_test("TC-QR-012: Rejection Workflow", "FAIL", f"Rejected session completed unexpectedly: {res_comp_rej.text}")
    else:
        record_test("TC-QR-012: Rejection Workflow", "FAIL", f"Reject failed: {res_rej.text}")

    # TC-QR-013: Cancellation Flow
    res_can_init = client.post("/api/auth/qr/create", json={})
    can_sid = res_can_init.json()["sessionId"]
    res_can = client.post("/api/auth/qr/cancel", json={"sessionId": can_sid})
    if res_can.status_code == 200 and res_can.json().get("status") == "CANCELLED":
        res_poll = client.get(f"/api/auth/qr/status/{can_sid}")
        if res_poll.json().get("status") == "CANCELLED":
            record_test("TC-QR-013: Cancellation Workflow", "PASS", "Pairing session cancelled and status verified")
        else:
            record_test("TC-QR-013: Cancellation Workflow", "FAIL", f"Expected CANCELLED, got {res_poll.text}")
    else:
        record_test("TC-QR-013: Cancellation Workflow", "FAIL", f"Cancel failed: {res_can.text}")

    # TC-QR-014: Expiration Enforcement (simulate past expiration in SQLite)
    res_exp_init = client.post("/api/auth/qr/create", json={})
    exp_sid = res_exp_init.json()["sessionId"]
    exp_tok = res_exp_init.json()["token"]
    past_ts = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    with get_db() as conn:
        conn.execute("UPDATE device_pairing_sessions SET expires_at = ? WHERE session_id = ?", (past_ts, exp_sid))
    
    # Try scanning expired session
    res_scan_exp = client.post("/api/auth/qr/scan", json={"sessionId": exp_sid, "token": exp_tok, "personId": test_person_id})
    if res_scan_exp.status_code == 400 and "expired" in res_scan_exp.json().get("error", "").lower():
        record_test("TC-QR-014: Security - Session Expiration Enforcement", "PASS", "Expired session rejected during scan with HTTP 400")
    else:
        record_test("TC-QR-014: Security - Session Expiration Enforcement", "FAIL", f"Expected 400 expired error, got {res_scan_exp.text}")

    # TC-QR-015: Direct SQLite Schema & Persistence Verification
    with get_db() as conn:
        row = conn.execute("SELECT * FROM device_pairing_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if row and row["status"] == "COMPLETED" and row["user_id"] == test_person_id and row["token_hash"]:
            record_test("TC-QR-015: SQLite Persistence Verification", "PASS", f"Session {session_id} securely persisted in SQLite with SHA-256 hash")
        else:
            record_test("TC-QR-015: SQLite Persistence Verification", "FAIL", f"Database record verification failed: {dict(row) if row else 'None'}")

    # Summary
    print("\n=== TEST SUMMARY ===")
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    print(f"Total Tests: {total} | Passed: {passed} | Failed: {failed}")
    if failed > 0:
        sys.exit(1)
    else:
        print("ALL QR AUTHENTICATION TESTS PASSED WITH 100% SUCCESS RATE!\n")

if __name__ == "__main__":
    run_tests()
