import {
  RegisteredPerson,
  RescuePriorityLevel,
  PriorityFactorBreakdown,
  HealthThresholds,
  FloodStatus,
} from '../types/floodguard';

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  spo2Critical: 90,   // Clinically defined hypoxemic respiratory distress
  spo2Warning: 94,    // Clinically defined mild-to-moderate hypoxia
  hrHighCritical: 135, // Severe tachycardia
  hrHighWarning: 115,  // Mild-to-moderate tachycardia / exertion stress
  hrLowCritical: 45,   // Severe symptomatic bradycardia
  hrLowWarning: 55,    // Bradycardia
};

/**
 * Health-Aware Rescue Prioritisation Engine
 * Evaluates physiological vitals, flood exposure depth, water drift vectors,
 * data freshness, and mandatory explicit SOS immediate-danger overrides.
 */
export function evaluateRescuePriority(
  person: RegisteredPerson,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): {
  priority: RescuePriorityLevel;
  reason: string;
  factors: PriorityFactorBreakdown;
  isImmediateDanger: boolean;
} {
  const isSos = Boolean(person.sosActive);
  const hr = person.heartRateBpm;
  const spo2 = person.spo2Percent;
  const floodDepth = person.floodDepthCm;
  const drift = person.driftStatus;
  const driftConf = person.driftConfidence;
  const isOffline = person.commStatus === 'OFFLINE' || person.commStatus === 'UNREACHABLE';
  const isStale = person.commStatus === 'STALE' || person.healthDataValidity === 'STALE';
  const hasGpsUncertainty = person.gpsAccuracyM > 25;

  // 1. Evaluate Health Factor Severity
  let healthSeverity: 'CRITICAL' | 'WARNING' | 'NORMAL' | 'STALE' | 'UNKNOWN' = 'UNKNOWN';
  let healthReason = 'No physiological telemetry received (Unknown)';

  if (person.healthDataValidity === 'UNKNOWN' || hr === null || spo2 === null) {
    healthSeverity = 'UNKNOWN';
    healthReason = 'Vitals unavailable / sensor offline (Do NOT assume safe)';
  } else if (isStale) {
    healthSeverity = 'STALE';
    healthReason = `Stale vitals (Last valid: HR ${hr} BPM, SpO₂ ${spo2}%)`;
  } else {
    // Both HR and SpO2 available
    const isCriticalSpo2 = spo2 < thresholds.spo2Critical;
    const isWarningSpo2 = spo2 >= thresholds.spo2Critical && spo2 < thresholds.spo2Warning;
    const isCriticalHr = hr > thresholds.hrHighCritical || hr < thresholds.hrLowCritical;
    const isWarningHr =
      (hr >= thresholds.hrHighWarning && hr <= thresholds.hrHighCritical) ||
      (hr <= thresholds.hrLowWarning && hr >= thresholds.hrLowCritical);

    if (isCriticalSpo2 || isCriticalHr) {
      healthSeverity = 'CRITICAL';
      const issues: string[] = [];
      if (isCriticalSpo2) issues.push(`Severe Hypoxia (SpO₂ ${spo2}% < ${thresholds.spo2Critical}%)`);
      if (hr > thresholds.hrHighCritical) issues.push(`Severe Tachycardia (${hr} BPM)`);
      if (hr < thresholds.hrLowCritical) issues.push(`Severe Bradycardia (${hr} BPM)`);
      healthReason = issues.join(', ');
    } else if (isWarningSpo2 || isWarningHr) {
      healthSeverity = 'WARNING';
      const issues: string[] = [];
      if (isWarningSpo2) issues.push(`Mild Hypoxia (SpO₂ ${spo2}%)`);
      if (isWarningHr) issues.push(`Elevated Heart Rate (${hr} BPM)`);
      healthReason = issues.join(', ');
    } else {
      healthSeverity = 'NORMAL';
      healthReason = `Vitals Stable: HR ${hr} BPM, SpO₂ ${spo2}%`;
    }
  }

  // 2. Evaluate Flood Exposure
  let floodExposure: 'CRITICAL' | 'WARNING' | 'CAUTION' | 'SAFE' = 'SAFE';
  let floodReason = 'Dry Ground / Safe Elevation';
  if (floodDepth >= 50) {
    floodExposure = 'CRITICAL';
    floodReason = `Impassable Water Depth (${floodDepth}cm)`;
  } else if (floodDepth >= 30) {
    floodExposure = 'WARNING';
    floodReason = `High Flood Exposure (${floodDepth}cm)`;
  } else if (floodDepth >= 15) {
    floodExposure = 'CAUTION';
    floodReason = `Moderate Flood Exposure (${floodDepth}cm)`;
  } else if (floodDepth > 0) {
    floodReason = `Shallow Street Runoff (${floodDepth}cm)`;
  }

  // 3. Evaluate Drift Evidence
  let driftEvidence: 'CONFIRMED' | 'SUSPECTED' | 'NONE' = 'NONE';
  let driftReason = 'Stationary position confirmed';
  if (drift === 'DRIFTING') {
    if (driftConf >= 70) {
      driftEvidence = 'CONFIRMED';
      driftReason = `Confirmed active water drift (${person.driftVelocityMs.toFixed(1)} m/s, ${driftConf}% confidence)`;
    } else {
      driftEvidence = 'SUSPECTED';
      driftReason = `Suspected water drift (${person.driftVelocityMs.toFixed(1)} m/s, ${driftConf}% confidence)`;
    }
  } else if (drift === 'UNKNOWN') {
    driftReason = 'Drift status unverified due to telemetry gaps';
  }

  // 4. Evaluate Data Quality
  let dataQuality: 'FRESH' | 'STALE_GPS' | 'STALE_HEALTH' | 'OFFLINE' = 'FRESH';
  if (isOffline) {
    dataQuality = 'OFFLINE';
  } else if (hasGpsUncertainty) {
    dataQuality = 'STALE_GPS';
  } else if (isStale) {
    dataQuality = 'STALE_HEALTH';
  }

  // Mandatory Emergency Rule A: Explicit SOS has unconditional P0 priority override
  if (isSos) {
    const overrideReason = `MANDATORY OVERRIDE: Active SOS Beacon Transmitted by Wearable (${person.wearableId})`;
    const factors: PriorityFactorBreakdown = {
      sosActive: true,
      sosReason: 'Explicit SOS triggered by citizen or guardian',
      healthSeverity,
      healthReason,
      floodExposure,
      floodReason,
      driftEvidence,
      driftReason,
      dataQuality,
      gpsAccuracyM: person.gpsAccuracyM,
      isImmediateDangerOverride: true,
      overrideReason,
    };
    return {
      priority: 'P0',
      reason: overrideReason,
      factors,
      isImmediateDanger: true,
    };
  }

  // Mandatory Emergency Rule B: Active drift in deep water is immediate danger (P0)
  if (driftEvidence === 'CONFIRMED' && (floodExposure === 'CRITICAL' || floodExposure === 'WARNING')) {
    const overrideReason = `IMMEDIATE DANGER: Person drifting in deep floodwater (${person.driftVelocityMs.toFixed(1)} m/s, depth ${floodDepth}cm)`;
    const factors: PriorityFactorBreakdown = {
      sosActive: false,
      healthSeverity,
      healthReason,
      floodExposure,
      floodReason,
      driftEvidence,
      driftReason,
      dataQuality,
      gpsAccuracyM: person.gpsAccuracyM,
      isImmediateDangerOverride: true,
      overrideReason,
    };
    return {
      priority: 'P0',
      reason: overrideReason,
      factors,
      isImmediateDanger: true,
    };
  }

  // Mandatory Emergency Rule C: Severe Critical Hypoxia / Health Collapse in Flood Exposure (P0)
  if (healthSeverity === 'CRITICAL' && (floodExposure === 'CRITICAL' || floodExposure === 'WARNING')) {
    const overrideReason = `IMMEDIATE DANGER: Severe physiological collapse (${healthReason}) in hazardous flood zone (${floodDepth}cm)`;
    const factors: PriorityFactorBreakdown = {
      sosActive: false,
      healthSeverity,
      healthReason,
      floodExposure,
      floodReason,
      driftEvidence,
      driftReason,
      dataQuality,
      gpsAccuracyM: person.gpsAccuracyM,
      isImmediateDangerOverride: true,
      overrideReason,
    };
    return {
      priority: 'P0',
      reason: overrideReason,
      factors,
      isImmediateDanger: true,
    };
  }

  // P1: Critical Level
  if (
    healthSeverity === 'CRITICAL' ||
    floodExposure === 'CRITICAL' ||
    driftEvidence === 'CONFIRMED' ||
    (driftEvidence === 'SUSPECTED' && floodExposure === 'WARNING')
  ) {
    const reasons: string[] = [];
    if (healthSeverity === 'CRITICAL') reasons.push(healthReason);
    if (floodExposure === 'CRITICAL') reasons.push(`Impassable flood depth (${floodDepth}cm)`);
    if (driftEvidence !== 'NONE') reasons.push(driftReason);

    return {
      priority: 'P1',
      reason: `Critical Rescue Priority: ${reasons.join(' | ')}`,
      factors: {
        sosActive: false,
        healthSeverity,
        healthReason,
        floodExposure,
        floodReason,
        driftEvidence,
        driftReason,
        dataQuality,
        gpsAccuracyM: person.gpsAccuracyM,
        isImmediateDangerOverride: false,
      },
      isImmediateDanger: false,
    };
  }

  // P2: High Priority
  if (
    healthSeverity === 'WARNING' ||
    floodExposure === 'WARNING' ||
    driftEvidence === 'SUSPECTED' ||
    (isOffline && floodExposure === 'CAUTION') // Missing data in rising water does not lower priority!
  ) {
    const reasons: string[] = [];
    if (healthSeverity === 'WARNING') reasons.push(healthReason);
    if (floodExposure === 'WARNING') reasons.push(floodReason);
    if (isOffline) reasons.push('Unreachable device in flood zone');

    return {
      priority: 'P2',
      reason: `High Rescue Priority: ${reasons.join(' | ')}`,
      factors: {
        sosActive: false,
        healthSeverity,
        healthReason,
        floodExposure,
        floodReason,
        driftEvidence,
        driftReason,
        dataQuality,
        gpsAccuracyM: person.gpsAccuracyM,
        isImmediateDangerOverride: false,
      },
      isImmediateDanger: false,
    };
  }

  // P3: Moderate Priority
  if (floodExposure === 'CAUTION' || healthSeverity === 'STALE' || isOffline) {
    return {
      priority: 'P3',
      reason: `Moderate Rescue Priority: ${floodReason} • Monitoring required`,
      factors: {
        sosActive: false,
        healthSeverity,
        healthReason,
        floodExposure,
        floodReason,
        driftEvidence,
        driftReason,
        dataQuality,
        gpsAccuracyM: person.gpsAccuracyM,
        isImmediateDangerOverride: false,
      },
      isImmediateDanger: false,
    };
  }

  // P4: Routine
  return {
    priority: 'P4',
    reason: `Routine Monitoring: Stable vitals at safe location (${person.elevationM}m MSL)`,
    factors: {
      sosActive: false,
      healthSeverity,
      healthReason,
      floodExposure,
      floodReason,
      driftEvidence,
      driftReason,
      dataQuality,
      gpsAccuracyM: person.gpsAccuracyM,
      isImmediateDangerOverride: false,
    },
    isImmediateDanger: false,
  };
}
