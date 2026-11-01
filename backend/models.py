"""
FloodGuard 2.1 — SQLite Entity Models and Query Helpers
Free, Local, and Open Source.
Defines SQLAlchemy ORM Models and SQLite Row serialization utilities.
"""

import json
from typing import Dict, Any, List, Optional
import sqlite3

from sqlalchemy import Column, Integer, Float, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from backend.database import Base


# ==========================================================
# 1. SQLAlchemy ORM Models (Sections 4.A - 4.F)
# ==========================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone_number = Column(String(50), nullable=True)
    password_hash = Column(String(128), nullable=False)
    salt = Column(String(64), nullable=False)
    role = Column(String(30), nullable=False, default="user")
    created_at = Column(String(30), nullable=False)
    updated_at = Column(String(30), nullable=False)
    is_active = Column(Integer, nullable=False, default=1)

    predictions = relationship("FloodPrediction", back_populates="user")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "phone_number": self.phone_number,
            "role": self.role,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_active": bool(self.is_active)
        }


class UserSession(Base):
    __tablename__ = "user_sessions"

    session_token = Column(String(80), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False, default="user")
    created_at = Column(String(30), nullable=False)
    expires_at = Column(String(30), nullable=False)


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    location_name = Column(String(200), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    district = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    elevation_m = Column(Float, nullable=True)
    created_at = Column(String(30), nullable=False)

    predictions = relationship("FloodPrediction", back_populates="location")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "location_name": self.location_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "district": self.district,
            "state": self.state,
            "elevation_m": self.elevation_m,
            "created_at": self.created_at
        }


class FloodPrediction(Base):
    __tablename__ = "flood_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_name = Column(String(200), nullable=False)
    rainfall = Column(Float, nullable=False)
    water_level = Column(Float, nullable=False)
    river_level = Column(Float, nullable=True)
    soil_moisture = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    prediction_result = Column(String(100), nullable=False)
    risk_level = Column(String(50), nullable=False, index=True)
    prediction_confidence = Column(Float, nullable=False)
    flood_eta_minutes = Column(Integer, nullable=True)
    severity_score = Column(Float, nullable=False)
    recommendation = Column(Text, nullable=True)
    model_version = Column(String(50), nullable=False, default="Deterministic-Hydrology-v2.1")
    prediction_timestamp = Column(String(30), nullable=False)
    created_at = Column(String(30), nullable=False, index=True)

    user = relationship("User", back_populates="predictions")
    location = relationship("Location", back_populates="predictions")
    alerts = relationship("FloodAlert", back_populates="prediction", cascade="all, delete-orphan")
    history_entries = relationship("PredictionHistory", back_populates="prediction", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "location_id": self.location_id,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "location_name": self.location_name,
            "rainfall": self.rainfall,
            "water_level": self.water_level,
            "river_level": self.river_level,
            "soil_moisture": self.soil_moisture,
            "temperature": self.temperature,
            "humidity": self.humidity,
            "prediction_result": self.prediction_result,
            "risk_level": self.risk_level,
            "prediction_confidence": self.prediction_confidence,
            "flood_eta_minutes": self.flood_eta_minutes,
            "severity_score": self.severity_score,
            "recommendation": self.recommendation,
            "model_version": self.model_version,
            "prediction_timestamp": self.prediction_timestamp,
            "created_at": self.created_at
        }


class FloodAlert(Base):
    __tablename__ = "flood_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    prediction_id = Column(Integer, ForeignKey("flood_predictions.id", ondelete="CASCADE"), nullable=True)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(30), nullable=False)
    alert_message = Column(Text, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(String(30), nullable=False, index=True)
    is_active = Column(Integer, nullable=False, default=1, index=True)

    prediction = relationship("FloodPrediction", back_populates="alerts")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "location_id": self.location_id,
            "prediction_id": self.prediction_id,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "alert_message": self.alert_message,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "created_at": self.created_at,
            "is_active": bool(self.is_active)
        }


class PredictionHistory(Base):
    __tablename__ = "prediction_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    prediction_id = Column(Integer, ForeignKey("flood_predictions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    input_snapshot = Column(Text, nullable=False)
    output_snapshot = Column(Text, nullable=False)
    timestamp = Column(String(30), nullable=False)

    prediction = relationship("FloodPrediction", back_populates="history_entries")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "prediction_id": self.prediction_id,
            "user_id": self.user_id,
            "input_snapshot": self.input_snapshot,
            "output_snapshot": self.output_snapshot,
            "timestamp": self.timestamp
        }


class SystemConfiguration(Base):
    __tablename__ = "system_configurations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(100), unique=True, nullable=False)
    config_value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(String(30), nullable=False)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "config_key": self.config_key,
            "config_value": self.config_value,
            "description": self.description,
            "updated_at": self.updated_at
        }


# ==========================================================
# 2. SQLite Row to Dict Conversion Functions
# ==========================================================

def user_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "full_name": d.get("full_name"),
        "email": d.get("email"),
        "phone_number": d.get("phone_number"),
        "role": d.get("role"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
        "is_active": bool(d.get("is_active", 1))
    }


def flood_alert_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "location_id": d.get("location_id"),
        "prediction_id": d.get("prediction_id"),
        "alert_type": d.get("alert_type"),
        "severity": d.get("severity"),
        "alert_message": d.get("alert_message"),
        "latitude": d.get("latitude"),
        "longitude": d.get("longitude"),
        "created_at": d.get("created_at"),
        "is_active": bool(d.get("is_active", 1))
    }


def prediction_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id"),
        "locationId": d.get("location_id"),
        "latitude": d.get("latitude"),
        "longitude": d.get("longitude"),
        "locationName": d.get("location_name"),
        "rainfall": d.get("rainfall"),
        "waterLevel": d.get("water_level"),
        "riverLevel": d.get("river_level"),
        "soilMoisture": d.get("soil_moisture"),
        "temperature": d.get("temperature"),
        "humidity": d.get("humidity"),
        "predictionResult": d.get("prediction_result"),
        "riskLevel": d.get("risk_level"),
        "predictionConfidence": d.get("prediction_confidence"),
        "floodEtaMinutes": d.get("flood_eta_minutes"),
        "severityScore": d.get("severity_score"),
        "recommendation": d.get("recommendation"),
        "modelVersion": d.get("model_version"),
        "predictionTimestamp": d.get("prediction_timestamp"),
        "createdAt": d.get("created_at")
    }


def location_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id"),
        "locationName": d.get("location_name"),
        "latitude": d.get("latitude"),
        "longitude": d.get("longitude"),
        "district": d.get("district"),
        "state": d.get("state"),
        "elevationM": d.get("elevation_m"),
        "createdAt": d.get("created_at")
    }


def history_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "predictionId": d.get("prediction_id"),
        "userId": d.get("user_id"),
        "inputSnapshot": d.get("input_snapshot"),
        "outputSnapshot": d.get("output_snapshot"),
        "timestamp": d.get("timestamp")
    }


def system_config_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "configKey": d.get("config_key"),
        "configValue": d.get("config_value"),
        "description": d.get("description"),
        "updatedAt": d.get("updated_at")
    }


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
