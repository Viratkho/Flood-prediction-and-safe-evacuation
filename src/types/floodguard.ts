export type FloodStatus = 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';

export type DamStatus = 'NORMAL' | 'STORM BUILDUP' | 'RISING' | 'WARNING' | 'CRITICAL' | 'RECEDING';

export type RescuePriorityLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export type DriftStatus = 'STATIONARY' | 'DRIFTING' | 'UNKNOWN';

export type HealthValidity = 'VALID' | 'DEGRADED' | 'STALE' | 'UNKNOWN';

export type CommStatus = 'ONLINE' | 'STALE' | 'OFFLINE' | 'UNREACHABLE';

export type IncidentStatus = 'NEW' | 'ACKNOWLEDGED' | 'RESPONDER_EN_ROUTE' | 'ON_SCENE' | 'RESOLVED';

export interface HealthThresholds {
  spo2Critical: number; // e.g. < 90%
  spo2Warning: number;  // e.g. < 94%
  hrHighCritical: number; // e.g. > 135 bpm
  hrHighWarning: number;  // e.g. > 115 bpm
  hrLowCritical: number;  // e.g. < 45 bpm
  hrLowWarning: number;   // e.g. < 55 bpm
}

export interface PriorityFactorBreakdown {
  sosActive: boolean;
  sosReason?: string;
  healthSeverity: 'CRITICAL' | 'WARNING' | 'NORMAL' | 'STALE' | 'UNKNOWN';
  healthReason: string;
  floodExposure: 'CRITICAL' | 'WARNING' | 'CAUTION' | 'SAFE';
  floodReason: string;
  driftEvidence: 'CONFIRMED' | 'SUSPECTED' | 'NONE';
  driftReason: string;
  dataQuality: 'FRESH' | 'STALE_GPS' | 'STALE_HEALTH' | 'OFFLINE';
  gpsAccuracyM?: number;
  isImmediateDangerOverride: boolean;
  overrideReason?: string;
}

export interface VitalReading {
  timestamp: string;
  value: number;
}

export interface RegisteredPerson {
  personId: string;
  wearableId: string;
  name: string;
  age?: number;
  gender?: string;
  contactNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  addressLandmark?: string;
  locationName?: string;
  country?: string;
  administrativeRegion?: string;
  countryCode?: string;
  dependentsCount?: number;
  dependentsDetails?: string;
  medicalConditions?: string[];
  assistanceType?: 'RESCUE_BOAT' | 'MEDICAL_EVAC' | 'SHELTER_ROUTING' | 'SUPPLIES' | 'GENERAL_ADVICE';
  isUserRegistered?: boolean;
  medicalNotes?: string;
  role: 'CITIZEN' | 'FIRST_RESPONDER';
  
  // GPS & Location Telemetry
  lat: number;
  lng: number;
  locationTimestamp: string;
  gpsAccuracyM: number; // e.g. 5m, 45m (poor accuracy flagged)
  elevationM: number;
  
  // Vitals & Health Telemetry
  heartRateBpm: number | null; // null = missing (shown as Unknown)
  spo2Percent: number | null;  // null = missing (shown as Unknown)
  healthTimestamp: string | null;
  healthDataValidity: HealthValidity;
  heartRateHistory: VitalReading[];
  spo2History: VitalReading[];
  
  // Flood & Drift Telemetry
  floodDepthCm: number;
  floodRiskLevel: FloodStatus;
  driftStatus: DriftStatus;
  driftConfidence: number; // 0 - 100%
  driftVelocityMs: number; // speed along current
  
  // Prioritisation
  sosActive: boolean;
  rescuePriority: RescuePriorityLevel;
  priorityReason: string;
  priorityFactors: PriorityFactorBreakdown;
  priorityUpdatedAt: string;
  priorityHistory: Array<{ timestamp: string; from: RescuePriorityLevel; to: RescuePriorityLevel; reason: string }>;
  
  // Connectivity & Incident
  commStatus: CommStatus;
  lastCommunicationTime: string;
  batteryPercent: number;
  incidentId?: string;
  assignedResponderId?: string;
  assignedResponderName?: string;
  isSimulated?: boolean;
}

export interface IncidentAuditEntry {
  timestamp: string;
  operator: string;
  action: string;
  note?: string;
}

export interface IncidentRecord {
  id: string;
  personId: string;
  personName: string;
  wearableId: string;
  priority: RescuePriorityLevel;
  priorityReason: string;
  isImmediateDanger: boolean;
  status: IncidentStatus;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  assignedResponderId?: string;
  assignedResponderName?: string;
  assignedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  lat: number;
  lng: number;
  gpsAccuracyM: number;
  floodDepthCm: number;
  floodRiskLevel: FloodStatus;
  heartRateBpm: number | null;
  spo2Percent: number | null;
  driftStatus: DriftStatus;
  driftConfidence: number;
  auditTrail: IncidentAuditEntry[];
  isSynthetic?: boolean;
}

export interface ResearchScenario {
  id: string;
  name: string;
  description: string;
  peopleCount: number;
  hazardLevel: 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
  simulatedConditions: {
    damLevelM: number;
    precipitationMmH: number;
    sosCount: number;
    hypoxiaCount: number;
    driftCount: number;
    staleGpsCount: number;
    offlineCount: number;
  };
}

export interface ExperimentLog {
  timestamp: string;
  scenarioId: string;
  scenarioName: string;
  personId: string;
  personName: string;
  inputCondition: string;
  previousPriority: RescuePriorityLevel;
  newPriority: RescuePriorityLevel;
  reason: string;
  outcome: string;
}

export interface RoadSensor {
  id: string;
  roadSegmentId: string;
  name: string;
  lat: number;
  lng: number;
  waterLevelCm: number;
  rateOfRise: number; // cm/min
  status: FloodStatus;
  lastReported: string;
  batteryPercent: number;
  signalStrengthDbm: number;
  elevationM: number;
}

export interface RoadNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevationM: number;
}

export interface RoadSegment {
  id: string;
  name: string;
  sourceNodeId: string;
  targetNodeId: string;
  coordinates: [number, number][]; // [lat, lng] array
  distanceM: number;
  baseElevationM: number;
  sensorId?: string;
  status: FloodStatus;
  waterLevelCm: number;
  isBridge?: boolean;
}

export interface ReliefCentre {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevationM: number;
  totalCapacity: number;
  occupiedCapacity: number;
  medicalFacility: boolean;
  foodWaterStock: 'High' | 'Medium' | 'Critical';
  status: 'ACTIVE' | 'FULL' | 'STANDBY';
  contactPhone: string;
  address: string;
}

export interface WearableDevice {
  id: string;
  holderName: string;
  role: 'CITIZEN' | 'RESPONDER';
  lat: number;
  lng: number;
  heartRate: number;
  sosActive: boolean;
  battery: number;
  lastPing: string;
}

export interface LoraGateway {
  id: string;
  name: string;
  lat: number;
  lng: number;
  connectedNodes: number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface DamTelemetry {
  damName: string;
  reservoirLevelM: number;
  maxCrestLevelM: number;
  precipitationMmH: number;
  rateOfRiseMMin: number;
  spillwayReleaseCusecs: number;
  inflowCusecs: number;
  status: DamStatus;
  lastUpdated: string;
  history: Array<{
    timestamp: string;
    level: number;
    precipitation: number;
    release: number;
  }>;
}

export interface RouteStep {
  instruction: string;
  roadName: string;
  distanceM: number;
  segmentId: string;
  waterLevelCm: number;
  riskStatus: FloodStatus;
}

export interface EvacuationRoute {
  totalDistanceM: number;
  estimatedMinutes: number;
  averageRiskScore: number;
  routeTitle: string; // "Estimated lower-risk route"
  pathCoordinates: [number, number][];
  steps: RouteStep[];
  blockedSegmentsAvoided: string[];
  destinationShelter: ReliefCentre;
  hasCriticalSegments: boolean;
  calculatedAt?: string;
  dataFreshness?: string;
  isRiskEngineOutput?: boolean;
  warningNotice?: string;
}

export interface OfflineMapPackage {
  id: string;
  name: string;
  center: [number, number];
  radiusKm: number;
  downloadedAt: string;
  tileCount: number;
  sizeBytes: number;
  zoomLevels: number[];
  nodes: RoadNode[];
  segments: RoadSegment[];
  reliefCentres: ReliefCentre[];
  sensors: RoadSensor[];
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  safetyAlert?: {
    type: 'warning' | 'danger' | 'info' | 'success';
    headline: string;
  };
  recommendedShelterId?: string;
  suggestedActions?: string[];
  smsDelivered?: boolean;
}

export interface CitizenRegistrationInput {
  name: string;
  mobileNumber: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dependentsCount: number;
  dependentsDetails?: string;
  medicalConditions: string[];
  lat: number;
  lng: number;
  addressLandmark: string;
  locationName?: string;
  country?: string;
  administrativeRegion?: string;
  countryCode?: string;
  currentWaterDepthCm: number;
  assistanceType: 'RESCUE_BOAT' | 'MEDICAL_EVAC' | 'SHELTER_ROUTING' | 'SUPPLIES' | 'GENERAL_ADVICE';
  additionalNotes?: string;
}

export interface MobileAlertMessage {
  id: string;
  timestamp: string;
  mobileNumber: string;
  recipientName: string;
  alertType: 'EVACUATION' | 'SURGE_WARNING' | 'RESCUE_DISPATCH' | 'SOS_ACK' | 'SHELTER_ASSIGNED' | 'DIRECT_ALERT';
  headline: string;
  message: string;
  status: 'DELIVERED' | 'SENT' | 'FAILED';
  gateway: string;
  freeApiUsed?: string;
  nativeSmsUrl?: string;
}

export interface FirewallThreatLog {
  id: string;
  timestamp: string;
  threatType: 'SQL_INJECTION' | 'XSS_ATTACK' | 'PATH_TRAVERSAL' | 'RATE_LIMIT_EXCEEDED' | 'MALICIOUS_BOT' | 'SUSPICIOUS_PAYLOAD';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  clientIp: string;
  endpoint: string;
  method: string;
  details: string;
  action: 'BLOCKED_403' | 'RATE_LIMITED_429' | 'QUARANTINED';
}

export interface FirewallSecurityStatus {
  active: boolean;
  engineVersion: string;
  serverFingerprintingSuppressed: boolean;
  totalRequestsInspected: number;
  totalThreatsBlocked: number;
  quarantinedIpsCount: number;
  activeProtections: {
    name: string;
    description: string;
    status: 'ACTIVE' | 'ENFORCING';
  }[];
  threatStats: {
    sqlInjection: number;
    xss: number;
    pathTraversal: number;
    rateLimitExceeded: number;
    maliciousBots: number;
    suspiciousPayloads: number;
  };
  recentLogs: FirewallThreatLog[];
}

// ==========================================
// Weather and Weather News Integration Types
// (Informational only — Decoupled from core flood risk engine)
// ==========================================

export interface CurrentWeatherReport {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  weatherCode: number;
  weatherCondition: string;
  iconName: string;
  precipitation: number;
  rain: number;
  windSpeed: number;
  windDirection: number;
  windDirectionCardinal: string;
  isDay: boolean;
  timestamp: string;
}

export interface HourlyForecastItem {
  time: string;
  hourLabel: string;
  temperature: number;
  humidity: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  weatherCondition: string;
  iconName: string;
  windSpeed: number;
}

export interface DailyForecastItem {
  date: string;
  dayLabel: string;
  weatherCode: number;
  weatherCondition: string;
  iconName: string;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
}

export interface LocationWeatherData {
  success: boolean;
  provider: string;
  providerUrl: string;
  isModelForecast: boolean;
  lastUpdated: string;
  isCached?: boolean;
  location: {
    lat: number;
    lon: number;
    city: string;
    region?: string;
    country?: string;
  };
  current: CurrentWeatherReport;
  hourly: HourlyForecastItem[];
  daily: DailyForecastItem[];
}

export interface CitySearchResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  countryCode?: string;
  admin1?: string; // State / Province / District
  timezone?: string;
}

export type WeatherNewsCategory =
  | 'ALL'
  | 'CYCLONES_HURRICANES'
  | 'EXTREME_RAIN_FLOOD'
  | 'HEATWAVE_DROUGHT'
  | 'SEVERE_STORMS'
  | 'METEOROLOGY_GENERAL';

export type WeatherNewsRegion =
  | 'ALL'
  | 'LOCAL'
  | 'ASIA_PACIFIC'
  | 'AMERICAS'
  | 'EUROPE'
  | 'AFRICA_MIDDLE_EAST'
  | 'GLOBAL';

export interface WeatherNewsArticle {
  id: string;
  headline: string;
  publisher: string;
  publishedAt: string; // ISO 8601 string
  publishedDate: string; // e.g. "23 Oct 2026"
  publishedTime?: string; // e.g. "08:27"
  timezoneLabel: string; // e.g. "IST" or "UTC"
  sourceUrl: string;
  locationOrRegion: string; // e.g. "Chennai / Tamil Nadu" or "India" or "Global"
  category: WeatherNewsCategory;
  region: WeatherNewsRegion;
  snippet?: string;
  isOfficialBulletin?: boolean;
}

export interface SharedLocationState {
  placeName: string;
  administrativeRegion?: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  locationSource: 'GPS' | 'SEARCH' | 'PRESET' | 'REGISTRATION';
}
