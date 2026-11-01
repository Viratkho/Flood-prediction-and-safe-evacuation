"""
FloodGuard 2.1 — Pydantic Schemas for Request & Response Contracts
Free, Open-Source, and Fully Validated.
"""

from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, EmailStr


# ==========================================================
# 1. Existing System Schemas (Preserved for 100% Backwards Compatibility)
# ==========================================================

class PersonCreateRequest(BaseModel):
    name: Optional[str] = None
    fullName: Optional[str] = None
    contactNumber: Optional[str] = None
    emergencyContactName: Optional[str] = ""
    emergencyContactPhone: Optional[str] = ""
    age: Optional[Union[int, str]] = None
    gender: Optional[str] = "Unspecified"
    addressLandmark: Optional[str] = ""
    locationName: Optional[str] = ""
    country: Optional[str] = "India"
    administrativeRegion: Optional[str] = ""
    countryCode: Optional[str] = ""
    lat: Optional[Union[float, int, str]] = 13.1120
    lng: Optional[Union[float, int, str]] = 80.1030
    currentWaterDepthCm: Optional[Union[float, int]] = 15
    medicalConditions: Optional[List[str]] = Field(default_factory=list)
    medicalNotes: Optional[str] = ""
    dependentsCount: Optional[Union[int, str]] = 0
    dependentsDetails: Optional[str] = ""
    assistanceType: Optional[str] = "SHELTER_ROUTING"
    initialHeartRate: Optional[Union[int, float]] = 78
    initialSpo2: Optional[Union[int, float]] = 98
    sosActive: Optional[bool] = False

    class Config:
        extra = "allow"


class IncidentAcknowledgeRequest(BaseModel):
    operator: Optional[str] = "Duty Commander (HQ Desk 1)"
    operatorName: Optional[str] = None
    note: Optional[str] = "Incident acknowledged via Command Dashboard"

    class Config:
        extra = "allow"


class IncidentAssignRequest(BaseModel):
    responderId: Optional[str] = None
    responderName: Optional[str] = "Tactical Rescue Unit"
    operator: Optional[str] = "Duty Commander"

    class Config:
        extra = "allow"


class IncidentStatusRequest(BaseModel):
    status: str
    operator: Optional[str] = "Duty Commander"
    note: Optional[str] = None

    class Config:
        extra = "allow"


class IncidentResolveRequest(BaseModel):
    notes: Optional[str] = "Citizens evacuated to high ground"
    operator: Optional[str] = "Duty Commander"
    operatorName: Optional[str] = None

    class Config:
        extra = "allow"


class SurgeRequest(BaseModel):
    surgeCm: Optional[float] = 25.0


class MobileAlertRequest(BaseModel):
    mobileNumber: Optional[Union[str, int]] = None
    recipientName: Optional[str] = "Citizen / Evacuee"
    alertType: Optional[str] = "EVACUATE_NOW"
    headline: Optional[str] = "🚨 FLOOD EMERGENCY BROADCAST"
    message: Optional[str] = None
    personId: Optional[str] = None

    class Config:
        extra = "allow"


class AiAdviseRequest(BaseModel):
    prompt: str
    userLocation: Optional[List[float]] = None
    blockedRoads: Optional[List[str]] = Field(default_factory=list)
    currentDamLevel: Optional[float] = None
    nearestShelter: Optional[str] = None
    personProfile: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"


class RunScenarioRequest(BaseModel):
    scenarioId: str

    class Config:
        extra = "allow"


# ==========================================================
# 2. User Schemas (Section 4.A & Section 7)
# ==========================================================

class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    phone_number: Optional[str] = Field(None, max_length=50)
    role: Optional[str] = Field("user", max_length=30)

    class Config:
        extra = "allow"


class UserLoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    class Config:
        extra = "allow"


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    phone_number: Optional[str] = None
    role: str
    created_at: str
    updated_at: str
    is_active: bool

    class Config:
        extra = "allow"


class UserLoginResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserResponse

    class Config:
        extra = "allow"


# ==========================================================
# 3. Location Schemas (Section 4.B & Section 7)
# ==========================================================

class LocationCreate(BaseModel):
    location_name: str = Field(..., min_length=2, max_length=200)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    district: Optional[str] = None
    state: Optional[str] = None
    elevation_m: Optional[float] = None
    user_id: Optional[int] = None

    class Config:
        extra = "allow"


class LocationResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    location_name: str
    latitude: float
    longitude: float
    district: Optional[str] = None
    state: Optional[str] = None
    elevation_m: Optional[float] = None
    created_at: str

    class Config:
        extra = "allow"


# ==========================================================
# 4. Flood Prediction Schemas (Section 4.C & Section 7)
# ==========================================================

class PredictionCreate(BaseModel):
    location_name: str = Field(..., min_length=2, max_length=200)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    rainfall: float = Field(..., ge=0.0, le=1000.0)
    water_level: float = Field(..., ge=0.0, le=100.0)
    river_level: Optional[float] = Field(None, ge=0.0, le=100.0)
    soil_moisture: Optional[float] = Field(None, ge=0.0, le=100.0)
    temperature: Optional[float] = Field(None, ge=-50.0, le=60.0)
    humidity: Optional[float] = Field(None, ge=0.0, le=100.0)
    location_id: Optional[int] = None
    user_id: Optional[int] = None

    class Config:
        extra = "allow"


class PredictionResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    location_id: Optional[int] = None
    latitude: float
    longitude: float
    location_name: str
    rainfall: float
    water_level: float
    river_level: Optional[float] = None
    soil_moisture: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    prediction_result: str
    risk_level: str
    prediction_confidence: float
    flood_eta_minutes: Optional[int] = None
    severity_score: float
    recommendation: Optional[str] = None
    model_version: str
    prediction_timestamp: str
    created_at: str

    class Config:
        extra = "allow"


# ==========================================================
# 5. Flood Alert Schemas (Section 4.D & Section 7)
# ==========================================================

class FloodAlertCreate(BaseModel):
    location_id: Optional[int] = None
    prediction_id: Optional[int] = None
    alert_type: str = Field(..., min_length=2, max_length=50)
    severity: str = Field(..., min_length=2, max_length=30)
    alert_message: str = Field(..., min_length=2, max_length=2000)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    is_active: Optional[bool] = True

    class Config:
        extra = "allow"


class FloodAlertResponse(BaseModel):
    id: int
    location_id: Optional[int] = None
    prediction_id: Optional[int] = None
    alert_type: str
    severity: str
    alert_message: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: str
    is_active: bool

    class Config:
        extra = "allow"


# ==========================================================
# 6. Prediction History Schemas (Section 4.E)
# ==========================================================

class PredictionHistoryResponse(BaseModel):
    id: int
    prediction_id: int
    user_id: Optional[int] = None
    input_snapshot: str
    output_snapshot: str
    timestamp: str

    class Config:
        extra = "allow"


# ==========================================================
# 7. System Configuration & Backup Schemas (Section 4.F & Section 11)
# ==========================================================

class SystemConfigCreate(BaseModel):
    config_key: str = Field(..., min_length=2, max_length=100)
    config_value: str
    description: Optional[str] = None

    class Config:
        extra = "allow"


class SystemConfigResponse(BaseModel):
    id: int
    config_key: str
    config_value: str
    description: Optional[str] = None
    updated_at: str

    class Config:
        extra = "allow"


class BackupResponse(BaseModel):
    status: str
    backup_file: str
    backup_path: str
    timestamp: str
    file_size_bytes: int

    class Config:
        extra = "allow"
