"""
FloodGuard 2.1 — SQLite Entity Models and Query Helpers
"""

import json
from typing import Dict, Any, List, Optional
import sqlite3

def person_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "personId": d.get("person_id"),
        "wearableId": d.get("wearable_id"),
        "name": d.get("name"),
        "age": d.get("age"),
        "gender": d.get("gender"),
        "contactNumber": d.get("contact_number"),
        "emergencyContactName": d.get("emergency_contact_name"),
        "emergencyContactPhone": d.get("emergency_contact_phone"),
        "addressLandmark": d.get("address_landmark"),
        "locationName": d.get("location_name") or d.get("address_landmark") or "",
        "country": d.get("country") or "India",
        "administrativeRegion": d.get("administrative_region") or "",
        "countryCode": d.get("country_code") or "",
        "lat": d.get("lat"),
        "lng": d.get("lng"),
        "locationTimestamp": d.get("location_timestamp"),
        "gpsAccuracyM": d.get("gps_accuracy_m"),
        "elevationM": d.get("elevation_m"),
        "heartRateBpm": d.get("heart_rate_bpm"),
        "spo2Percent": d.get("spo2_percent"),
        "healthTimestamp": d.get("health_timestamp"),
        "healthDataValidity": d.get("health_data_validity"),
        "heartRateHistory": json.loads(d.get("heart_rate_history") or "[]"),
        "spo2History": json.loads(d.get("spo2_history") or "[]"),
        "floodDepthCm": d.get("flood_depth_cm"),
        "floodRiskLevel": d.get("flood_risk_level"),
        "driftStatus": d.get("drift_status"),
        "driftConfidence": d.get("drift_confidence"),
        "driftVelocityMs": d.get("drift_velocity_ms"),
        "sosActive": bool(d.get("sos_active")),
        "rescuePriority": d.get("rescue_priority"),
        "priorityReason": d.get("priority_reason"),
        "priorityFactors": json.loads(d.get("priority_factors") or "{}"),
        "priorityUpdatedAt": d.get("priority_updated_at"),
        "priorityHistory": json.loads(d.get("priority_history") or "[]"),
        "commStatus": d.get("comm_status"),
        "lastCommunicationTime": d.get("last_communication_time"),
        "batteryPercent": d.get("battery_percent"),
        "isUserRegistered": bool(d.get("is_user_registered")),
        "medicalConditions": json.loads(d.get("medical_conditions") or "[]"),
        "medicalNotes": d.get("medical_notes") or "",
        "assistanceType": d.get("assistance_type") or "SHELTER_ROUTING",
        "dependentsCount": d.get("dependents_count") or 0,
        "dependentsDetails": d.get("dependents_details") or "",
        "role": d.get("role") or "CITIZEN",
        "assignedResponderId": d.get("assigned_responder_id"),
        "assignedResponderName": d.get("assigned_responder_name"),
        "createdAt": d.get("created_at") or "",
    }


def incident_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "personId": d.get("person_id"),
        "personName": d.get("person_name"),
        "personAge": d.get("person_age"),
        "personGender": d.get("person_gender"),
        "wearableId": d.get("wearable_id"),
        "priority": d.get("priority"),
        "status": d.get("status"),
        "hazardType": d.get("hazard_type"),
        "hazardDescription": d.get("hazard_description"),
        "lat": d.get("lat"),
        "lng": d.get("lng"),
        "locationName": d.get("location_name"),
        "waterLevelCm": d.get("water_level_cm"),
        "isImmediateDanger": bool(d.get("is_immediate_danger")),
        "assignedResponderId": d.get("assigned_responder_id"),
        "assignedResponderName": d.get("assigned_responder_name"),
        "assignedAt": d.get("assigned_at"),
        "acknowledgedAt": d.get("acknowledged_at"),
        "acknowledgedBy": d.get("acknowledged_by"),
        "resolvedAt": d.get("resolved_at"),
        "resolvedBy": d.get("resolved_by"),
        "resolutionNotes": d.get("resolution_notes"),
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
        "auditTrail": json.loads(d.get("audit_trail") or "[]"),
    }


def dam_state_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "damName": d.get("dam_name"),
        "reservoirLevelM": d.get("reservoir_level_m"),
        "maxCrestLevelM": d.get("max_crest_level_m"),
        "precipitationMmH": d.get("precipitation_mm_h"),
        "rateOfRiseMMin": d.get("rate_of_rise_m_min"),
        "spillwayReleaseCusecs": d.get("spillway_release_cusecs"),
        "inflowCusecs": d.get("inflow_cusecs"),
        "status": d.get("status"),
        "lastUpdated": d.get("last_updated"),
        "history": json.loads(d.get("history") or "[]"),
        "isStormActive": bool(d.get("is_storm_active")),
        "isFullFloodActive": bool(d.get("is_full_flood_active")),
    }


def alert_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "timestamp": d.get("timestamp"),
        "mobileNumber": d.get("mobile_number"),
        "recipientName": d.get("recipient_name"),
        "alertType": d.get("alert_type"),
        "headline": d.get("headline"),
        "message": d.get("message"),
        "status": d.get("status"),
        "gateway": d.get("gateway"),
        "personId": d.get("person_id"),
        "freeApiUsed": d.get("free_api_used"),
        "nativeSmsUrl": d.get("native_sms_url"),
    }


def threat_log_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "timestamp": d.get("timestamp"),
        "threatType": d.get("threat_type"),
        "severity": d.get("severity"),
        "clientIp": d.get("client_ip"),
        "endpoint": d.get("endpoint"),
        "method": d.get("method"),
        "details": d.get("details"),
        "action": d.get("action"),
    }
