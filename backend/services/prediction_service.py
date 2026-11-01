"""
Deterministic Hydrological Flood Prediction Engine.
Calculates hydrodynamic surge propagation, effective water head, rate of water rise,
inundation ETA, risk level, confidence scores, and safety recommendations.
"""

import math
from typing import Dict, Any, Optional

MODEL_VERSION = "Deterministic-Hydrology-v2.1"

# Basin reference elevations in Avadi/Chennai catchment
DEFAULT_ELEVATION_M = 22.5
DEFAULT_FLOOD_THRESHOLD_M = 21.8

def calculate_flood_prediction(
    rainfall: float,
    water_level: float,
    river_level: Optional[float] = None,
    soil_moisture: Optional[float] = None,
    temperature: Optional[float] = None,
    humidity: Optional[float] = None,
    elevation_m: Optional[float] = None
) -> Dict[str, Any]:
    """
    Executes the deterministic flood prediction model.
    Returns:
        - prediction_result: Descriptive result title
        - risk_level: NORMAL, LOW, MODERATE, HIGH, CRITICAL
        - prediction_confidence: Percentage score (0 - 100%)
        - flood_eta_minutes: Estimated minutes until inundation (or None if safe)
        - severity_score: Normalized severity metric (0.00 - 1.00)
        - recommendation: Actionable safety guidance
        - effective_water_level: Calculated water height
        - rate_of_rise_m_hr: Rising velocity in meters per hour
    """
    elevation = elevation_m if elevation_m is not None else DEFAULT_ELEVATION_M
    effective_river = river_level if river_level is not None else (water_level * 0.88)
    
    # Soil moisture saturation adjustment (saturated soil cannot absorb additional runoff)
    soil_sat_factor = 1.0
    if soil_moisture is not None and soil_moisture > 65.0:
        soil_sat_factor = 1.0 + ((soil_moisture - 65.0) / 100.0) * 0.45

    # 1. Effective Water Head:
    # H_eff = riverWaterLevel + (damWaterLevel / 20.0) * 0.8 + (rainfall / 35.0) * 0.6 * soil_sat_factor
    dam_surge_contrib = (water_level / 20.0) * 0.8
    rain_runoff_contrib = (rainfall / 35.0) * 0.6 * soil_sat_factor
    effective_water_level = round(effective_river + dam_surge_contrib + rain_runoff_contrib, 2)

    # 2. Rate of Water Rise (m/hr):
    # R_rise = 0.05 + (water_level / 25.0) * 0.75 + (rainfall / 40.0) * 0.55 * soil_sat_factor
    base_rise = 0.05
    surge_rise = (water_level / 25.0) * 0.75
    rain_rise = (rainfall / 40.0) * 0.55 * soil_sat_factor
    rate_of_rise_m_hr = round(max(0.04, base_rise + surge_rise + rain_rise), 3)

    # 3. Water Head Remaining (Elevation Clearance):
    water_clearance = round(elevation - effective_water_level, 2)

    # 4. Status, ETA, Severity & Confidence Evaluation
    if water_clearance <= -0.20 or effective_water_level >= (DEFAULT_FLOOD_THRESHOLD_M + 0.8):
        # Currently submerged / critical
        risk_level = "CRITICAL"
        prediction_result = "CRITICAL FLOOD / SUBMERGED"
        flood_eta_minutes = 0
        severity_score = 1.00
        confidence = 98.4
        recommendation = (
            "CRITICAL EMERGENCY: Roadway and sector are submerged. Water depth exceeds safe vehicular "
            "and pedestrian thresholds. Immediately ascend to higher terrain or trigger SOS beacon. "
            "Do not attempt to ford moving water."
        )
    elif water_clearance <= 0.40 or (rainfall >= 50.0 and water_level >= 22.0) or rate_of_rise_m_hr >= 0.75:
        # High Risk - Imminent flooding
        risk_level = "HIGH"
        prediction_result = "HIGH FLOOD RISK"
        raw_eta = int((max(0.05, water_clearance) / rate_of_rise_m_hr) * 60)
        flood_eta_minutes = max(5, min(35, raw_eta))
        severity_score = 0.85
        confidence = 93.8
        recommendation = (
            f"HIGH FLOOD RISK: Inundation projected within {flood_eta_minutes} minutes. "
            "Deploy emergency flood barriers, alert vulnerable residents, and evacuate via "
            "the estimated lower-risk route toward designated municipal relief shelters."
        )
    elif water_clearance <= 1.20 or rainfall >= 22.0 or water_level >= 20.0:
        # Moderate Risk
        risk_level = "MODERATE"
        prediction_result = "MODERATE FLOOD RISK"
        raw_eta = int((water_clearance / rate_of_rise_m_hr) * 60)
        flood_eta_minutes = max(35, min(120, raw_eta))
        severity_score = 0.52
        confidence = 88.5
        recommendation = (
            f"MODERATE FLOOD RISK: Rising tributary levels detected (ETA ~{flood_eta_minutes} mins). "
            "Monitor live sensor telemetry, prepare emergency evacuation bags, and avoid low-lying culverts."
        )
    elif water_clearance <= 2.20 or rainfall >= 8.0:
        # Low Risk
        risk_level = "LOW"
        prediction_result = "LOW FLOOD RISK"
        flood_eta_minutes = None
        severity_score = 0.22
        confidence = 89.0
        recommendation = (
            "LOW RISK: Light catchment precipitation. Drainage systems operating within capacity. "
            "Standard seasonal monitoring recommended."
        )
    else:
        # Normal / Safe
        risk_level = "NORMAL"
        prediction_result = "SAFE / NORMAL"
        flood_eta_minutes = None
        severity_score = 0.05
        confidence = 96.0
        recommendation = (
            "SAFE: All hydrological indicators are within normal parameters. No flood danger detected."
        )

    # Environmental refinement if temperature and humidity are supplied
    if humidity is not None and humidity > 90 and temperature is not None and temperature > 28:
        confidence = min(99.5, round(confidence + 1.2, 1))

    return {
        "prediction_result": prediction_result,
        "risk_level": risk_level,
        "prediction_confidence": round(confidence, 1),
        "flood_eta_minutes": flood_eta_minutes,
        "severity_score": round(severity_score, 2),
        "recommendation": recommendation,
        "effective_water_level": effective_water_level,
        "rate_of_rise_m_hr": rate_of_rise_m_hr,
        "model_version": MODEL_VERSION
    }
