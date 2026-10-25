"""
FloodGuard 2.1 — Pydantic Schemas for Request & Response Contracts
"""

from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

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
