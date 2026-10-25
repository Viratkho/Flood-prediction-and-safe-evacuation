"""
FloodGuard 2.1 — Clinical Rescue Priority Engine (Python Port)
Faithfully implements the physiological vitals and hazard evaluation rules.
"""

from typing import Dict, Any, Tuple

DEFAULT_THRESHOLDS = {
    "spo2Critical": 90,
    "spo2Warning": 94,
    "hrHighCritical": 135,
    "hrHighWarning": 115,
    "hrLowCritical": 45,
    "hrLowWarning": 55,
}

def evaluate_rescue_priority(person: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates physiological vitals, flood exposure depth, water drift vectors,
    data freshness, and mandatory explicit SOS immediate-danger overrides.
    Returns: { "priority": str, "reason": str, "factors": dict, "isImmediateDanger": bool }
    """
    is_sos = bool(person.get("sosActive"))
    hr = person.get("heartRateBpm")
    spo2 = person.get("spo2Percent")
    flood_depth = float(person.get("floodDepthCm") or 15)
    drift = person.get("driftStatus") or "STATIONARY"
    drift_conf = float(person.get("driftConfidence") or 0)
    drift_vel = float(person.get("driftVelocityMs") or 0)
    comm_status = person.get("commStatus") or "ONLINE"
    validity = person.get("healthDataValidity") or "VALID"
    gps_acc = float(person.get("gpsAccuracyM") or 8)

    is_offline = comm_status in ("OFFLINE", "UNREACHABLE")
    is_stale = comm_status == "STALE" or validity == "STALE"
    has_gps_uncertainty = gps_acc > 25

    # 1. Health Factor Severity
    health_severity = "UNKNOWN"
    health_reason = "No physiological telemetry received (Unknown)"

    if validity == "UNKNOWN" or hr is None or spo2 is None:
        health_severity = "UNKNOWN"
        health_reason = "Vitals unavailable / sensor offline (Do NOT assume safe)"
    elif is_stale:
        health_severity = "STALE"
        health_reason = f"Stale vitals (Last valid: HR {hr} BPM, SpO₂ {spo2}%)"
    else:
        is_crit_spo2 = spo2 < DEFAULT_THRESHOLDS["spo2Critical"]
        is_warn_spo2 = DEFAULT_THRESHOLDS["spo2Critical"] <= spo2 < DEFAULT_THRESHOLDS["spo2Warning"]
        is_crit_hr = hr > DEFAULT_THRESHOLDS["hrHighCritical"] or hr < DEFAULT_THRESHOLDS["hrLowCritical"]
        is_warn_hr = (
            (DEFAULT_THRESHOLDS["hrHighWarning"] <= hr <= DEFAULT_THRESHOLDS["hrHighCritical"]) or
            (DEFAULT_THRESHOLDS["hrLowCritical"] <= hr <= DEFAULT_THRESHOLDS["hrLowWarning"])
        )

        if is_crit_spo2 or is_crit_hr:
            health_severity = "CRITICAL"
            issues = []
            if is_crit_spo2:
                issues.append(f"Severe Hypoxia (SpO₂ {spo2}% < {DEFAULT_THRESHOLDS['spo2Critical']}%)")
            if hr > DEFAULT_THRESHOLDS["hrHighCritical"]:
                issues.append(f"Severe Tachycardia ({hr} BPM)")
            if hr < DEFAULT_THRESHOLDS["hrLowCritical"]:
                issues.append(f"Severe Bradycardia ({hr} BPM)")
            health_reason = ", ".join(issues)
        elif is_warn_spo2 or is_warn_hr:
            health_severity = "WARNING"
            issues = []
            if is_warn_spo2:
                issues.append(f"Mild Hypoxia (SpO₂ {spo2}%)")
            if is_warn_hr:
                issues.append(f"Elevated Heart Rate ({hr} BPM)")
            health_reason = ", ".join(issues)
        else:
            health_severity = "NORMAL"
            health_reason = f"Vitals Stable: HR {hr} BPM, SpO₂ {spo2}%"

    # 2. Flood Exposure
    flood_exposure = "SAFE"
    flood_reason = "Dry Ground / Safe Elevation"
    if flood_depth >= 50:
        flood_exposure = "CRITICAL"
        flood_reason = f"Impassable Water Depth ({flood_depth:.0f}cm)"
    elif flood_depth >= 30:
        flood_exposure = "WARNING"
        flood_reason = f"High Flood Exposure ({flood_depth:.0f}cm)"
    elif flood_depth >= 15:
        flood_exposure = "CAUTION"
        flood_reason = f"Moderate Flood Exposure ({flood_depth:.0f}cm)"
    elif flood_depth > 0:
        flood_reason = f"Shallow Street Runoff ({flood_depth:.0f}cm)"

    # 3. Drift Evidence
    drift_evidence = "NONE"
    drift_reason = "Stationary position confirmed"
    if drift == "DRIFTING":
        if drift_conf >= 70:
            drift_evidence = "CONFIRMED"
            drift_reason = f"Confirmed active water drift ({drift_vel:.1f} m/s, {drift_conf:.0f}% confidence)"
        else:
            drift_evidence = "SUSPECTED"
            drift_reason = f"Suspected water drift ({drift_vel:.1f} m/s, {drift_conf:.0f}% confidence)"
    elif drift == "UNKNOWN":
        drift_reason = "Drift status unverified due to telemetry gaps"

    # 4. Data Quality
    data_quality = "FRESH"
    if is_offline:
        data_quality = "OFFLINE"
    elif has_gps_uncertainty:
        data_quality = "STALE_GPS"
    elif is_stale:
        data_quality = "STALE_HEALTH"

    # Base factors dict
    factors = {
        "sosActive": is_sos,
        "healthSeverity": health_severity,
        "healthReason": health_reason,
        "floodExposure": flood_exposure,
        "floodReason": flood_reason,
        "driftEvidence": drift_evidence,
        "driftReason": drift_reason,
        "dataQuality": data_quality,
        "gpsAccuracyM": gps_acc,
        "isImmediateDangerOverride": False,
    }

    # Mandatory Emergency Rule A: Explicit SOS has unconditional P0 priority override
    if is_sos:
        override_reason = f"MANDATORY OVERRIDE: Active SOS Beacon Transmitted by Wearable ({person.get('wearableId', 'WB-SOS')})"
        factors["sosReason"] = "Explicit SOS triggered by citizen or guardian"
        factors["isImmediateDangerOverride"] = True
        factors["overrideReason"] = override_reason
        return {
            "priority": "P0",
            "reason": override_reason,
            "factors": factors,
            "isImmediateDanger": True,
        }

    # Mandatory Emergency Rule B: Active drift in deep water is immediate danger (P0)
    if drift_evidence == "CONFIRMED" and flood_exposure in ("CRITICAL", "WARNING"):
        override_reason = f"IMMEDIATE DANGER: Person drifting in deep floodwater ({drift_vel:.1f} m/s, depth {flood_depth:.0f}cm)"
        factors["isImmediateDangerOverride"] = True
        factors["overrideReason"] = override_reason
        return {
            "priority": "P0",
            "reason": override_reason,
            "factors": factors,
            "isImmediateDanger": True,
        }

    # Mandatory Emergency Rule C: Severe Critical Hypoxia / Health Collapse in Flood Exposure (P0)
    if health_severity == "CRITICAL" and flood_exposure in ("CRITICAL", "WARNING"):
        override_reason = f"IMMEDIATE DANGER: Severe physiological collapse ({health_reason}) in hazardous flood zone ({flood_depth:.0f}cm)"
        factors["isImmediateDangerOverride"] = True
        factors["overrideReason"] = override_reason
        return {
            "priority": "P0",
            "reason": override_reason,
            "factors": factors,
            "isImmediateDanger": True,
        }

    # P1: Critical Level
    if (
        health_severity == "CRITICAL" or
        flood_exposure == "CRITICAL" or
        drift_evidence == "CONFIRMED" or
        (drift_evidence == "SUSPECTED" and flood_exposure == "WARNING")
    ):
        reasons = []
        if health_severity == "CRITICAL":
            reasons.append(health_reason)
        if flood_exposure == "CRITICAL":
            reasons.append(f"Impassable flood depth ({flood_depth:.0f}cm)")
        if drift_evidence != "NONE":
            reasons.append(drift_reason)

        return {
            "priority": "P1",
            "reason": f"Critical Rescue Priority: {' | '.join(reasons)}",
            "factors": factors,
            "isImmediateDanger": False,
        }

    # P2: High Priority
    if (
        health_severity == "WARNING" or
        flood_exposure == "WARNING" or
        drift_evidence == "SUSPECTED" or
        (is_offline and flood_exposure == "CAUTION")
    ):
        reasons = []
        if health_severity == "WARNING":
            reasons.append(health_reason)
        if flood_exposure == "WARNING":
            reasons.append(flood_reason)
        if is_offline:
            reasons.append("Unreachable device in flood zone")

        return {
            "priority": "P2",
            "reason": f"High Rescue Priority: {' | '.join(reasons)}",
            "factors": factors,
            "isImmediateDanger": False,
        }

    # P3: Moderate / Caution
    if flood_exposure == "CAUTION" or health_severity == "STALE" or has_gps_uncertainty:
        reasons = []
        if flood_exposure == "CAUTION":
            reasons.append(flood_reason)
        if health_severity == "STALE":
            reasons.append("Stale telemetry requires verification")
        if has_gps_uncertainty:
            reasons.append(f"Low GPS confidence (±{gps_acc:.0f}m)")

        return {
            "priority": "P3",
            "reason": f"Moderate Priority: {' | '.join(reasons)}",
            "factors": factors,
            "isImmediateDanger": False,
        }

    # P4: Low / Routine
    return {
        "priority": "P4",
        "reason": "Normal monitoring: Safe ground and baseline physiological vitals",
        "factors": factors,
        "isImmediateDanger": False,
    }
