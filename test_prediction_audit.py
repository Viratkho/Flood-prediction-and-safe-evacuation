"""
FloodGuard 2.1 — Hydrological Flood Prediction Test Suite & Audit
Validates physics-based calculations, input boundaries, SQLite persistence,
history retrieval, and edge case resilience.
"""

import sys
import time
from starlette.testclient import TestClient

from backend.main import app
from backend.database import get_db, init_db
from backend.api.prediction import calculate_flood_model

client = TestClient(app)

PASSED = 0
FAILED = 0


def log_test(test_id: str, desc: str, success: bool, extra: str = ""):
    global PASSED, FAILED
    if success:
        PASSED += 1
        print(f"[PASS] {test_id}: {desc}{' - ' + extra if extra else ''}")
    else:
        FAILED += 1
        print(f"[FAIL] {test_id}: {desc}{' - ' + extra if extra else ''}")


def run_tests():
    global PASSED, FAILED
    print("=== STARTING FLOODGUARD HYDROLOGICAL PREDICTION TEST SUITE ===")
    init_db()

    # -------------------------------------------------------------
    # 1. Physics Model Unit Calculations
    # -------------------------------------------------------------
    try:
        out = calculate_flood_model(
            precipitation_mm_h=0.0,
            soil_saturation_pct=80.0,
            catchment_inflow_cusecs=15000.0,
            elevation_m=16.0,
            current_depth_cm=5.0,
        )
        assert out["runoff_coefficient"] == 0.0
        assert out["rate_of_rise_cm_min"] == 0.0
        assert out["predicted_depth_6h_cm"] == 5.0
        assert out["risk_level"] == "SAFE"
        assert out["inundation_eta_minutes"] is None
        log_test(
            "TC-PRED-001",
            "Zero Precipitation Invariance",
            True,
            f"Runoff: {out['runoff_coefficient']}, Depth: {out['predicted_depth_6h_cm']}cm, Risk: {out['risk_level']}",
        )
    except Exception as e:
        log_test("TC-PRED-001", "Zero Precipitation Invariance", False, str(e))

    try:
        out = calculate_flood_model(
            precipitation_mm_h=15.0,
            soil_saturation_pct=50.0,
            catchment_inflow_cusecs=5000.0,
            elevation_m=20.0,
            current_depth_cm=8.0,
        )
        assert out["runoff_coefficient"] > 0
        assert out["predicted_depth_6h_cm"] >= 15.0
        assert out["risk_level"] in ("CAUTION", "WARNING")
        log_test(
            "TC-PRED-002",
            "Moderate Inundation Baseline",
            True,
            f"Predicted 6h: {out['predicted_depth_6h_cm']}cm, Risk: {out['risk_level']}",
        )
    except Exception as e:
        log_test("TC-PRED-002", "Moderate Inundation Baseline", False, str(e))

    try:
        out = calculate_flood_model(
            precipitation_mm_h=80.0,
            soil_saturation_pct=95.0,
            catchment_inflow_cusecs=40000.0,
            elevation_m=10.0,
            current_depth_cm=15.0,
        )
        assert out["predicted_depth_6h_cm"] >= 50.0
        assert out["risk_level"] == "CRITICAL"
        assert "IMMEDIATE EVACUATION" in out["recommended_action"]
        assert out["inundation_eta_minutes"] is not None and out["inundation_eta_minutes"] >= 0
        log_test(
            "TC-PRED-003",
            "Critical Surge Threshold & Action Advisory",
            True,
            f"Predicted 6h: {out['predicted_depth_6h_cm']}cm, ETA: {out['inundation_eta_minutes']} min, Action: {out['recommended_action'][:40]}...",
        )
    except Exception as e:
        log_test("TC-PRED-003", "Critical Surge Threshold & Action Advisory", False, str(e))

    try:
        lowland = calculate_flood_model(
            precipitation_mm_h=50.0,
            soil_saturation_pct=80.0,
            catchment_inflow_cusecs=10000.0,
            elevation_m=10.0,
        )
        highland = calculate_flood_model(
            precipitation_mm_h=50.0,
            soil_saturation_pct=80.0,
            catchment_inflow_cusecs=10000.0,
            elevation_m=30.0,
        )
        assert lowland["runoff_coefficient"] > highland["runoff_coefficient"]
        assert lowland["predicted_depth_6h_cm"] > highland["predicted_depth_6h_cm"]
        log_test(
            "TC-PRED-004",
            "Elevation Attenuation Physics",
            True,
            f"Lowland (10m): {lowland['runoff_coefficient']} runoff vs Highland (30m): {highland['runoff_coefficient']} runoff",
        )
    except Exception as e:
        log_test("TC-PRED-004", "Elevation Attenuation Physics", False, str(e))

    try:
        out = calculate_flood_model(
            precipitation_mm_h=40.0,
            soil_saturation_pct=80.0,
            catchment_inflow_cusecs=10000.0,
            elevation_m=14.0,
            current_depth_cm=55.0,
        )
        assert out["inundation_eta_minutes"] == 0
        log_test(
            "TC-PRED-005",
            "Immediate Hazard Boundary (ETA=0)",
            True,
            "Current depth > 50cm yields immediate ETA 0 min",
        )
    except Exception as e:
        log_test("TC-PRED-005", "Immediate Hazard Boundary (ETA=0)", False, str(e))

    # -------------------------------------------------------------
    # 2. API Endpoints & SQLite Persistence
    # -------------------------------------------------------------
    test_id_created = None
    try:
        payload = {
            "precipitation_mm_h": 42.0,
            "soil_saturation_pct": 82.5,
            "catchment_inflow_cusecs": 12500.0,
            "elevation_m": 15.0,
            "current_depth_cm": 10.0,
            "location_name": "Avadi Test Sector B",
        }
        res = client.post("/api/prediction/flood", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert len(str(data["id"])) > 0
        test_id_created = str(data["id"])
        assert data["precipitation_mm_h"] == 42.0
        assert data["runoff_coefficient"] > 0
        assert data["predicted_depth_6h_cm"] > 10.0
        test_id_created = data["id"]
        log_test(
            "TC-PRED-006",
            "POST /api/prediction/flood Success",
            True,
            f"Created ID: {test_id_created}, 6h depth: {data['predicted_depth_6h_cm']}cm, Risk: {data['risk_level']}",
        )
    except Exception as e:
        log_test("TC-PRED-006", "POST /api/prediction/flood Success", False, str(e))

    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM flood_predictions WHERE id = ?", (test_id_created,))
            row = cursor.fetchone()
            assert row is not None
            assert row["location_name"] == "Avadi Test Sector B"
            assert row["rainfall"] == 42.0
            log_test(
                "TC-PRED-007",
                "SQLite Persistence Verification",
                True,
                f"Record {test_id_created} verified in SQLite flood_predictions table",
            )
    except Exception as e:
        log_test("TC-PRED-007", "SQLite Persistence Verification", False, str(e))

    try:
        payload = {
            "precipitation_mm_h": -5.0,
            "soil_saturation_pct": 50.0,
            "catchment_inflow_cusecs": 5000.0,
            "elevation_m": 15.0,
        }
        res = client.post("/api/prediction/flood", json=payload)
        assert res.status_code == 422
        log_test(
            "TC-PRED-008",
            "Input Boundary: Negative Precipitation Rejection",
            True,
            f"HTTP {res.status_code} Unprocessable Entity",
        )
    except Exception as e:
        log_test("TC-PRED-008", "Input Boundary: Negative Precipitation Rejection", False, str(e))

    try:
        payload = {
            "precipitation_mm_h": 20.0,
            "soil_saturation_pct": 115.0,
            "catchment_inflow_cusecs": 5000.0,
            "elevation_m": 15.0,
        }
        res = client.post("/api/prediction/flood", json=payload)
        assert res.status_code == 422
        log_test(
            "TC-PRED-009",
            "Input Boundary: Saturation >100% Rejection",
            True,
            f"HTTP {res.status_code} Unprocessable Entity",
        )
    except Exception as e:
        log_test("TC-PRED-009", "Input Boundary: Saturation >100% Rejection", False, str(e))

    try:
        res = client.get("/api/prediction/history?limit=10")
        assert res.status_code == 200
        items = res.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        first = items[0]
        for key in ["id", "timestamp", "precipitation_mm_h", "runoff_coefficient", "risk_level"]:
            assert key in first
        log_test(
            "TC-PRED-010",
            "GET /api/prediction/history Retrieval",
            True,
            f"Retrieved {len(items)} prediction history records from SQLite",
        )
    except Exception as e:
        log_test("TC-PRED-010", "GET /api/prediction/history Retrieval", False, str(e))

    try:
        res = client.get(f"/api/prediction/{test_id_created}")
        assert res.status_code == 200
        retrieved = res.json()
        assert retrieved["id"] == test_id_created
        assert retrieved["location_name"] == "Avadi Test Sector B"
        log_test(
            "TC-PRED-011",
            "GET /api/prediction/{id} Retrieval",
            True,
            f"Successfully retrieved prediction {test_id_created}",
        )
    except Exception as e:
        log_test("TC-PRED-011", "GET /api/prediction/{id} Retrieval", False, str(e))

    try:
        res = client.get("/api/prediction/9999999")
        assert res.status_code == 404
        log_test(
            "TC-PRED-012",
            "Non-Existent Prediction 404 Handling",
            True,
            f"HTTP {res.status_code}: {res.json().get('detail')}",
        )
    except Exception as e:
        log_test("TC-PRED-012", "Non-Existent Prediction 404 Handling", False, str(e))

    try:
        del_res = client.delete(f"/api/prediction/{test_id_created}")
        assert del_res.status_code == 200
        get_res = client.get(f"/api/prediction/{test_id_created}")
        assert get_res.status_code == 404
        log_test(
            "TC-PRED-013",
            "DELETE /api/prediction/{id} & Clean Eviction",
            True,
            f"Successfully deleted {test_id_created} and verified subsequent 404",
        )
    except Exception as e:
        log_test("TC-PRED-013", "DELETE /api/prediction/{id} & Clean Eviction", False, str(e))

    try:
        # Create records to test limit constraint
        client.post("/api/prediction/flood", json={"precipitation_mm_h": 20.0, "soil_saturation_pct": 50.0, "catchment_inflow_cusecs": 1000.0, "elevation_m": 15.0})
        client.post("/api/prediction/flood", json={"precipitation_mm_h": 25.0, "soil_saturation_pct": 55.0, "catchment_inflow_cusecs": 1500.0, "elevation_m": 16.0})
        # Test query parameter limit constraint
        res = client.get("/api/prediction/history?limit=1")
        assert res.status_code == 200
        assert len(res.json()) == 1
        log_test(
            "TC-PRED-014",
            "History Pagination & Limit Enforcement",
            True,
            "limit=1 correctly returned exactly 1 item",
        )
    except Exception as e:
        log_test("TC-PRED-014", "History Pagination & Limit Enforcement", False, str(e))

    try:
        # Test default values when current_depth_cm and location_name omitted
        minimal_payload = {
            "precipitation_mm_h": 25.0,
            "soil_saturation_pct": 60.0,
            "catchment_inflow_cusecs": 5000.0,
            "elevation_m": 16.0,
        }
        res = client.post("/api/prediction/flood", json=minimal_payload)
        assert res.status_code == 201
        data = res.json()
        assert data["current_depth_cm"] == 0.0
        assert data["location_name"] == "Avadi Basin"
        client.delete(f"/api/prediction/{data['id']}")
        log_test(
            "TC-PRED-015",
            "Default Values & Schema Resilience",
            True,
            f"current_depth_cm defaulted to {data['current_depth_cm']}, location defaulted to '{data['location_name']}'",
        )
    except Exception as e:
        log_test("TC-PRED-015", "Default Values & Schema Resilience", False, str(e))

    print("\n=== TEST SUMMARY ===")
    print(f"Total Tests: {PASSED + FAILED} | Passed: {PASSED} | Failed: {FAILED}")
    if FAILED == 0:
        print("ALL HYDROLOGICAL PREDICTION TESTS PASSED WITH 100% SUCCESS RATE!\n")
    else:
        print(f"WARNING: {FAILED} TESTS FAILED.\n")
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
