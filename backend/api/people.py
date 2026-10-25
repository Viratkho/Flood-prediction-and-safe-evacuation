import time
import json
import random
from typing import Dict, Any, Optional
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from backend.database import get_db
from backend.models import person_row_to_dict, incident_row_to_dict
from backend.services.priority_engine import evaluate_rescue_priority

router = APIRouter()

@router.get("/api/people")
def get_people():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM people ORDER BY rowid DESC").fetchall()
        people_list = [person_row_to_dict(r) for r in rows]
    return {
        "total": len(people_list),
        "people": people_list,
    }

@router.post("/api/people")
def register_person(payload: Dict[str, Any]):
    name = (payload.get("name") or payload.get("fullName") or "").strip()
    if not name:
        return JSONResponse(
            status_code=400,
            content={"error": "Person name is required"},
        )

    now_ts = int(time.time() * 1000)
    person_id = f"P-{str(now_ts)[-4:]}"
    wearable_id = f"WB-{random.randint(200, 999)}"
    now_str = time.strftime("%I:%M %p")

    contact_number = payload.get("contactNumber") or "+91 98400 00000"
    emergency_contact_name = payload.get("emergencyContactName") or ""
    emergency_contact_phone = payload.get("emergencyContactPhone") or ""
    address_landmark = payload.get("addressLandmark") or "Avadi / Ambattur Hydrological Basin"
    location_name = payload.get("locationName") or address_landmark or ""
    country = payload.get("country") or "India"
    administrative_region = payload.get("administrativeRegion") or ""
    country_code = payload.get("countryCode") or ""

    age = int(payload["age"]) if payload.get("age") is not None else None
    gender = payload.get("gender") or "Unspecified"
    dependents_count = int(payload.get("dependentsCount") or 0)
    dependents_details = payload.get("dependentsDetails") or ""

    medical_conditions = payload.get("medicalConditions") or []
    if not isinstance(medical_conditions, list):
        medical_conditions = [str(medical_conditions)]

    medical_notes = payload.get("medicalNotes") or (
        f"Vulnerabilities: {', '.join(medical_conditions)}" if medical_conditions else "None reported"
    )

    assistance_type = payload.get("assistanceType") or "SHELTER_ROUTING"

    lat = float(payload.get("lat") if payload.get("lat") is not None else 13.1120)
    lng = float(payload.get("lng") if payload.get("lng") is not None else 80.1030)
    hr = int(payload.get("initialHeartRate") or payload.get("heartRateBpm") or 78)
    spo2 = int(payload.get("initialSpo2") or payload.get("spo2Percent") or 98)
    depth = int(payload.get("currentWaterDepthCm") or payload.get("floodDepthCm") or 15)
    is_sos = bool(payload.get("sosActive"))

    risk_level = "CRITICAL" if depth > 45 else ("WARNING" if depth > 20 else ("CAUTION" if depth > 10 else "SAFE"))
    drift_status = "DRIFTING" if depth > 50 else "STATIONARY"
    drift_confidence = 65 if depth > 50 else 0

    person_data = {
        "personId": person_id,
        "wearableId": wearable_id,
        "name": name,
        "age": age,
        "gender": gender,
        "contactNumber": contact_number,
        "emergencyContactName": emergency_contact_name,
        "emergencyContactPhone": emergency_contact_phone,
        "addressLandmark": address_landmark,
        "locationName": location_name,
        "country": country,
        "administrativeRegion": administrative_region,
        "countryCode": country_code,
        "dependentsCount": dependents_count,
        "dependentsDetails": dependents_details,
        "medicalConditions": medical_conditions,
        "assistanceType": assistance_type,
        "isUserRegistered": True,
        "medicalNotes": medical_notes,
        "role": "CITIZEN",
        "lat": lat,
        "lng": lng,
        "locationTimestamp": now_str,
        "gpsAccuracyM": 8.0,
        "elevationM": 16.2,
        "heartRateBpm": hr,
        "spo2Percent": spo2,
        "healthTimestamp": now_str,
        "healthDataValidity": "VALID",
        "heartRateHistory": [
            {"timestamp": "10m ago", "value": hr - 2},
            {"timestamp": "5m ago", "value": hr},
            {"timestamp": "Now", "value": hr},
        ],
        "spo2History": [
            {"timestamp": "10m ago", "value": spo2},
            {"timestamp": "5m ago", "value": spo2},
            {"timestamp": "Now", "value": spo2},
        ],
        "floodDepthCm": depth,
        "floodRiskLevel": risk_level,
        "driftStatus": drift_status,
        "driftConfidence": drift_confidence,
        "driftVelocityMs": 0.0,
        "sosActive": is_sos,
        "rescuePriority": "P3",
        "priorityReason": "Initial intake evaluation",
        "priorityFactors": {
            "sosActive": is_sos,
            "healthSeverity": "NORMAL",
            "healthReason": "Initial intake baseline",
            "floodExposure": risk_level,
            "floodReason": f"Water depth {depth}cm",
            "driftEvidence": "SUSPECTED" if depth > 50 else "NONE",
            "driftReason": "Stationary position reported",
            "dataQuality": "FRESH",
            "isImmediateDangerOverride": is_sos,
        },
        "priorityUpdatedAt": now_str,
        "priorityHistory": [],
        "commStatus": "ONLINE",
        "lastCommunicationTime": now_str,
        "batteryPercent": 92,
        "createdAt": now_str,
    }

    # Evaluate Clinical Priority
    eval_res = evaluate_rescue_priority(person_data)
    person_data["rescuePriority"] = eval_res["priority"]
    person_data["priorityReason"] = eval_res["reason"]
    person_data["priorityFactors"] = eval_res["factors"]

    created_incident = None
    if is_sos or eval_res["priority"] in ("P0", "P1", "P2"):
        inc_id = f"INC-{str(now_ts)[-4:]}"
        created_incident = {
            "id": inc_id,
            "personId": person_id,
            "personName": name,
            "personAge": age,
            "personGender": gender,
            "wearableId": wearable_id,
            "priority": eval_res["priority"],
            "priorityReason": eval_res["reason"],
            "isImmediateDanger": eval_res["isImmediateDanger"],
            "status": "NEW",
            "createdAt": now_str,
            "lat": lat,
            "lng": lng,
            "locationName": location_name,
            "waterLevelCm": depth,
            "auditTrail": [
                {
                    "timestamp": now_str,
                    "operator": "FloodGuard Emergency Intake System",
                    "action": "INCIDENT_CREATED",
                    "note": f"Intake registered for {name} ({contact_number}). Medical: {medical_notes}",
                }
            ],
        }

    # Create confirmation SMS alert
    alert_id = f"SMS-{str(now_ts)[-4:]}"
    sms_message = {
        "id": alert_id,
        "timestamp": now_str,
        "mobileNumber": contact_number,
        "recipientName": name,
        "alertType": "EVACUATION" if is_sos else "SHELTER_ASSIGNED",
        "headline": "🚨 EMERGENCY SOS ACKNOWLEDGED" if is_sos else "🛡️ FLOODGUARD INTAKE CONFIRMED",
        "message": (
            f"EMERGENCY ALERT: SOS received for {name}. NDRF Rescue Team notified at GPS ({lat:.4f}, {lng:.4f}). Move to highest floor immediately."
            if is_sos
            else f"Registration confirmed for {name}. Safe Haven: Thirumullaivoyal High Ridge Defense Shelter. Evac route available on FloodGuard. Keep mobile battery saved."
        ),
        "status": "DELIVERED",
        "gateway": "Gov NDRF Emergency SMS / BSNL Cell Broadcast",
        "personId": person_id,
    }

    # Save to SQLite using exact schema columns
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO people (
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
                person_data["personId"],
                person_data["wearableId"],
                person_data["name"],
                person_data["age"],
                person_data["gender"],
                person_data["contactNumber"],
                person_data["emergencyContactName"],
                person_data["emergencyContactPhone"],
                person_data["addressLandmark"],
                person_data["locationName"],
                person_data["country"],
                person_data["administrativeRegion"],
                person_data["countryCode"],
                person_data["lat"],
                person_data["lng"],
                person_data["locationTimestamp"],
                person_data["gpsAccuracyM"],
                person_data["elevationM"],
                person_data["heartRateBpm"],
                person_data["spo2Percent"],
                person_data["healthTimestamp"],
                person_data["healthDataValidity"],
                json.dumps(person_data["heartRateHistory"]),
                json.dumps(person_data["spo2History"]),
                person_data["floodDepthCm"],
                person_data["floodRiskLevel"],
                person_data["driftStatus"],
                person_data["driftConfidence"],
                person_data["driftVelocityMs"],
                1 if person_data["sosActive"] else 0,
                person_data["rescuePriority"],
                person_data["priorityReason"],
                json.dumps(person_data["priorityFactors"]),
                person_data["priorityUpdatedAt"],
                json.dumps(person_data["priorityHistory"]),
                person_data["commStatus"],
                person_data["lastCommunicationTime"],
                person_data["batteryPercent"],
                1 if person_data["isUserRegistered"] else 0,
                json.dumps(person_data["medicalConditions"]),
                person_data["medicalNotes"],
                person_data["assistanceType"],
                person_data["dependentsCount"],
                person_data["dependentsDetails"],
                person_data["role"],
                None,
                None,
                person_data["createdAt"],
            ),
        )

        if created_incident:
            conn.execute(
                """
                INSERT INTO incidents (
                    id, person_id, person_name, person_age, person_gender, wearable_id,
                    priority, status, hazard_type, hazard_description, lat, lng,
                    location_name, water_level_cm, is_immediate_danger, assigned_responder_id,
                    assigned_responder_name, assigned_at, acknowledged_at, acknowledged_by,
                    resolved_at, resolved_by, resolution_notes, created_at, updated_at, audit_trail
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    created_incident["id"],
                    created_incident["personId"],
                    created_incident["personName"],
                    created_incident["personAge"],
                    created_incident["personGender"],
                    created_incident["wearableId"],
                    created_incident["priority"],
                    created_incident["status"],
                    None,
                    None,
                    created_incident["lat"],
                    created_incident["lng"],
                    created_incident["locationName"],
                    created_incident["waterLevelCm"],
                    1 if created_incident["isImmediateDanger"] else 0,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    created_incident["createdAt"],
                    None,
                    json.dumps(created_incident["auditTrail"]),
                ),
            )

        conn.execute(
            """
            INSERT INTO mobile_alerts (
                id, timestamp, mobile_number, recipient_name, alert_type, headline, message, status, gateway, free_api_used, native_sms_url, person_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sms_message["id"],
                sms_message["timestamp"],
                sms_message["mobileNumber"],
                sms_message["recipientName"],
                sms_message["alertType"],
                sms_message["headline"],
                sms_message["message"],
                sms_message["status"],
                sms_message["gateway"],
                None,
                None,
                person_id,
            ),
        )

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "person": person_data,
            "incident": created_incident,
            "alert": sms_message,
            "message": f"Person {person_data['name']} successfully registered and intake saved!",
        },
    )

@router.delete("/api/people/{person_id}")
def delete_person(person_id: str):
    if not person_id:
        return JSONResponse(status_code=400, content={"error": "Person ID is required"})

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM people WHERE person_id = ? OR wearable_id = ?",
            (person_id, person_id),
        ).fetchone()
        deleted_person = person_row_to_dict(row) if row else None

        conn.execute(
            "DELETE FROM people WHERE person_id = ? OR wearable_id = ?",
            (person_id, person_id),
        )
        conn.execute(
            "DELETE FROM incidents WHERE person_id = ? OR wearable_id = ?",
            (person_id, person_id),
        )

        remaining_count = conn.execute("SELECT COUNT(*) as c FROM people").fetchone()["c"]

    return {
        "success": True,
        "personId": person_id,
        "deletedPerson": deleted_person,
        "message": f"Person {person_id} deleted successfully and unpinned from tactical map.",
        "remainingCount": remaining_count,
    }
