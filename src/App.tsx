import React, { useState, useEffect } from 'react';
import { RescueCommandCenter } from './components/RescueCommandCenter';
import { EvacuationApp } from './components/EvacuationApp';
import { OfflineMapManager } from './components/OfflineMapManager';
import { AegisAiAssistant } from './components/AegisAiAssistant';
import { PersonMonitoringPanel } from './components/PersonMonitoringPanel';
import { IncidentWorkspace } from './components/IncidentWorkspace';
import { ResearchSimulationMode } from './components/ResearchSimulationMode';
import { PersonIntakeForm } from './components/PersonIntakeForm';
import { WeatherNewsHub } from './components/WeatherNewsHub';
import { SmartwatchGlanceHub } from './components/SmartwatchGlanceHub';
import { MobileAlertModal } from './components/MobileAlertModal';
import { FirewallSecurityModal } from './components/FirewallSecurityModal';
import { SystemTestRunnerModal } from './components/SystemTestRunnerModal';
import { DeviceAQrScannerModal } from './components/DeviceAQrScannerModal';
import { DeviceBQrLoginModal } from './components/DeviceBQrLoginModal';
import { WelcomePage } from './components/WelcomePage';
import { AdminLoginModal } from './components/AdminLoginModal';
import {
  BASIN_CENTER,
  INITIAL_ROAD_NODES,
  INITIAL_ROAD_SEGMENTS,
  INITIAL_ROAD_SENSORS,
  INITIAL_RELIEF_CENTRES,
  INITIAL_WEARABLES,
  INITIAL_LORA_GATEWAYS,
  INITIAL_REGISTERED_PEOPLE,
  INITIAL_INCIDENTS,
  INITIAL_RESEARCH_SCENARIOS,
} from './data/osmData';
import {
  DamTelemetry,
  RoadSegment,
  RoadSensor,
  ReliefCentre,
  RegisteredPerson,
  IncidentRecord,
  ExperimentLog,
  HealthThresholds,
  IncidentStatus,
  MobileAlertMessage,
  SharedLocationState,
} from './types/floodguard';
import { DEFAULT_HEALTH_THRESHOLDS, evaluateRescuePriority } from './services/priorityEngine';
import { voiceNav } from './services/voiceNav';
import {
  Activity,
  Camera,
  QrCode,
  AlertCircle,
  AlertTriangle,
  Bot,
  CloudSun,
  Compass,
  Download,
  FileText,
  Flame,
  FlaskConical,
  HardDrive,
  HeartPulse,
  LifeBuoy,
  Lock,
  MapPin,
  Navigation,
  Plus,
  Radio,
  Shield,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
  WifiOff,
  Menu,
  Watch,
  Layers,
  X,
} from 'lucide-react';

type TabView =
  | 'welcome'
  | 'command-center'
  | 'evacuation-app'
  | 'weather-news'
  | 'person-monitoring'
  | 'person-intake'
  | 'incident-workspace'
  | 'research-simulation';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabView>('welcome');
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<{ username: string; role: string; token: string } | null>(() => {
    try {
      const saved = localStorage.getItem('floodguard_admin_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.token && parsed.username) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved admin session:', e);
    }
    return null;
  });

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/auth/admin/logout', {
        method: 'POST',
        headers: adminUser?.token ? { Authorization: `Bearer ${adminUser.token}` } : {},
      });
    } catch {}
    try {
      localStorage.removeItem('floodguard_admin_session');
    } catch {}
    setAdminUser(null);
    if (activeTab === 'command-center') {
      setActiveTab('welcome');
    }
    voiceNav.speak('Administrator session ended.');
  };

  const handleOpenCommandCenter = () => {
    if (!adminUser) {
      setIsAdminModalOpen(true);
    } else {
      setActiveTab('command-center');
    }
  };
  const [isOfflineManagerOpen, setIsOfflineManagerOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
  const [isMobileAlertModalOpen, setIsMobileAlertModalOpen] = useState(false);
  const [isFirewallModalOpen, setIsFirewallModalOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [isDeviceAQrModalOpen, setIsDeviceAQrModalOpen] = useState(false);
  const [isDeviceBQrModalOpen, setIsDeviceBQrModalOpen] = useState(false);
  const [selectedAlertPerson, setSelectedAlertPerson] = useState<RegisteredPerson | null>(null);
  const [activeAdvisePerson, setActiveAdvisePerson] = useState<RegisteredPerson | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isWatchGlanceMode, setIsWatchGlanceMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash === '#watch';
    }
    return false;
  });

  // Responsive viewport and URL hash popstate listener
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
    };
    const handlePopState = (e: PopStateEvent) => {
      if (window.location.hash === '#watch' || e.state?.isWatchGlanceMode) {
        setIsWatchGlanceMode(true);
      } else {
        setIsWatchGlanceMode(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Basin and Sensor State
  const [sensors, setSensors] = useState<RoadSensor[]>(INITIAL_ROAD_SENSORS);
  const [segments, setSegments] = useState<RoadSegment[]>(INITIAL_ROAD_SEGMENTS);
  const [reliefCentres] = useState<ReliefCentre[]>(INITIAL_RELIEF_CENTRES);

  // Health-Aware People & Incidents State (Persists across reloads)
  const [people, setPeople] = useState<RegisteredPerson[]>(() => {
    try {
      const deletedStored = localStorage.getItem('floodguard_deleted_people');
      const deletedIds = new Set<string>(deletedStored ? JSON.parse(deletedStored) : []);
      const stored = localStorage.getItem('floodguard_user_people');
      if (stored) {
        const localList: RegisteredPerson[] = JSON.parse(stored);
        if (Array.isArray(localList) && localList.length > 0) {
          const map = new Map(localList.map((p) => [p.personId, p]));
          const combined = localList.filter((p) => !deletedIds.has(p.personId));
          for (const initP of INITIAL_REGISTERED_PEOPLE) {
            if (!map.has(initP.personId) && !deletedIds.has(initP.personId)) {
              combined.push(initP);
            }
          }
          return combined;
        }
      }
      return INITIAL_REGISTERED_PEOPLE.filter((p) => !deletedIds.has(p.personId));
    } catch (e) {
      console.warn('LocalStorage people initialization error:', e);
    }
    return INITIAL_REGISTERED_PEOPLE;
  });
  const [incidents, setIncidents] = useState<IncidentRecord[]>(INITIAL_INCIDENTS);
  const [experimentLogs, setExperimentLogs] = useState<ExperimentLog[]>([]);
  const [thresholds, setThresholds] = useState<HealthThresholds>(DEFAULT_HEALTH_THRESHOLDS);
  const [selectedFocusLocation, setSelectedFocusLocation] = useState<[number, number] | null>(null);
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);

  // Single Source of Truth: Shared Location State across all FloodGuard modules
  const [sharedLocation, setSharedLocation] = useState<SharedLocationState>(() => {
    try {
      const stored = localStorage.getItem('floodguard_shared_location');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.latitude && parsed.longitude && parsed.placeName) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved shared location:', e);
    }
    return {
      placeName: 'Avadi Basin, Chennai',
      administrativeRegion: 'Tamil Nadu',
      country: 'India',
      countryCode: 'IN',
      latitude: 13.1143,
      longitude: 80.1015,
      timezone: 'Asia/Kolkata',
      locationSource: 'PRESET',
    };
  });

  const handleUpdateSharedLocation = (newLoc: SharedLocationState) => {
    if (
      isNaN(newLoc.latitude) ||
      isNaN(newLoc.longitude) ||
      newLoc.latitude < -90 ||
      newLoc.latitude > 90 ||
      newLoc.longitude < -180 ||
      newLoc.longitude > 180
    ) {
      console.error('Invalid coordinates supplied to shared location:', newLoc);
      return;
    }

    setSharedLocation(newLoc);
    setUserLocation([newLoc.latitude, newLoc.longitude]);
    try {
      localStorage.setItem('floodguard_shared_location', JSON.stringify(newLoc));
      localStorage.setItem(
        'floodguard_preferred_weather_location',
        JSON.stringify({
          lat: newLoc.latitude,
          lon: newLoc.longitude,
          city: newLoc.placeName,
          region: newLoc.administrativeRegion || '',
          country: newLoc.country,
          countryCode: newLoc.countryCode,
          timezone: newLoc.timezone,
        })
      );
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  };

  // User GPS Tracking
  const [userLocation, setUserLocation] = useState<[number, number]>([13.1090, 80.1010]);
  const [isSimulatedGps, setIsSimulatedGps] = useState(false);

  // Dam & Hydrology Telemetry State
  const [damTelemetry, setDamTelemetry] = useState<DamTelemetry>({
    damName: 'Chembarambakkam & Avadi Catchment Dam',
    reservoirLevelM: 32.4,
    maxCrestLevelM: 38.0,
    precipitationMmH: 14.5,
    rateOfRiseMMin: 0.02,
    spillwayReleaseCusecs: 3500,
    inflowCusecs: 14200,
    status: 'NORMAL',
    lastUpdated: new Date().toISOString(),
    history: [],
  });

  // Track initial real browser geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!isSimulatedGps) {
            setUserLocation([position.coords.latitude, position.coords.longitude]);
          }
        },
        (err) => {
          console.warn('Geolocation unavailable or denied, using basin default:', err);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isSimulatedGps]);

  // Periodic Telemetry Sync with Backend (or fallback local simulation if offline)
  useEffect(() => {
    const fetchTelemetry = async () => {
      if (isOfflineMode) return;
      try {
        const [damRes, peopleRes, incidentsRes] = await Promise.all([
          fetch('/api/dam'),
          fetch('/api/people'),
          fetch('/api/incidents'),
        ]);

        if (damRes.ok) {
          const data: DamTelemetry = await damRes.json();
          setDamTelemetry(data);
        }

        if (peopleRes.ok) {
          const data = await peopleRes.json();
          if (data.people && data.people.length > 0) {
            try {
              const stored = localStorage.getItem('floodguard_user_people');
              const localList: RegisteredPerson[] = stored ? JSON.parse(stored) : [];
              const deletedStored = localStorage.getItem('floodguard_deleted_people');
              const deletedIds = new Set<string>(deletedStored ? JSON.parse(deletedStored) : []);

              const validBackendPeople = data.people.filter((p: RegisteredPerson) => !deletedIds.has(p.personId));
              const backendMap = new Map(validBackendPeople.map((p: RegisteredPerson) => [p.personId, p]));

              const merged = [...validBackendPeople];
              for (const lp of localList) {
                if (!deletedIds.has(lp.personId) && !backendMap.has(lp.personId)) {
                  merged.unshift(lp);
                }
              }
              setPeople(merged);
            } catch {
              setPeople(data.people);
            }
          }
        }

        if (incidentsRes.ok) {
          const data = await incidentsRes.json();
          if (data.incidents) {
            setIncidents(data.incidents);
          }
        }
      } catch {
        // Run internal fallback simulation ticker
        setDamTelemetry((prev) => {
          const delta = (Math.random() - 0.49) * 0.02;
          const nextLevel = Number((prev.reservoirLevelM + delta).toFixed(2));
          const nextHistory = [
            ...prev.history,
            {
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              level: nextLevel,
              precipitation: prev.precipitationMmH,
              release: prev.spillwayReleaseCusecs,
            },
          ].slice(-60);

          return {
            ...prev,
            reservoirLevelM: nextLevel,
            history: nextHistory,
          };
        });
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [isOfflineMode]);

  // Trigger Simulation Scenarios
  const handleTriggerScenario = async (action: string) => {
    if (action === 'START_STORM') {
      try {
        await fetch('/api/simulation/dam/start', { method: 'POST' });
      } catch {}

      setDamTelemetry((prev) => ({
        ...prev,
        status: 'STORM BUILDUP',
        precipitationMmH: 48,
        rateOfRiseMMin: 0.04,
      }));

      // Slightly increase water on low-lying segments
      setSegments((prev) =>
        prev.map((seg) => {
          if (seg.baseElevationM < 10) {
            const nextWater = seg.waterLevelCm + 12;
            return {
              ...seg,
              waterLevelCm: nextWater,
              status: nextWater >= 50 ? 'CRITICAL' : nextWater >= 30 ? 'WARNING' : 'CAUTION',
            };
          }
          return seg;
        })
      );
      voiceNav.speak('Simulation scenario: Catchment storm started. Precipitation increased to 48 millimeters per hour.');
    } else if (action === 'SURGE_25' || action === 'SURGE_50') {
      const surgeCm = action === 'SURGE_25' ? 25 : 50;
      try {
        await fetch('/api/simulation/dam/surge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ surgeCm }),
        });
      } catch {}

      setDamTelemetry((prev) => ({
        ...prev,
        reservoirLevelM: Number((prev.reservoirLevelM + surgeCm / 100).toFixed(2)),
        status: prev.reservoirLevelM + surgeCm / 100 > 36 ? 'CRITICAL' : 'WARNING',
        spillwayReleaseCusecs: prev.spillwayReleaseCusecs + surgeCm * 200,
      }));

      setSegments((prev) =>
        prev.map((seg) => {
          if (seg.baseElevationM < 12) {
            const nextWater = seg.waterLevelCm + Math.round(surgeCm * 0.7);
            return {
              ...seg,
              waterLevelCm: nextWater,
              status: nextWater >= 50 ? 'CRITICAL' : nextWater >= 30 ? 'WARNING' : 'CAUTION',
            };
          }
          return seg;
        })
      );
      voiceNav.speak(`Injected plus ${surgeCm} centimeter flood surge across hydrological catchment basin.`, true);
    } else if (action === 'FULL_FLOOD') {
      try {
        await fetch('/api/simulation/flood/full', { method: 'POST' });
      } catch {}

      setDamTelemetry((prev) => ({
        ...prev,
        reservoirLevelM: 37.5,
        precipitationMmH: 75,
        rateOfRiseMMin: 0.09,
        spillwayReleaseCusecs: 31000,
        status: 'CRITICAL',
      }));

      // Make R101-S3, R103-S1, R106-S1 critical (inundated)
      setSegments((prev) =>
        prev.map((seg) => {
          if (seg.id === 'R101-S3' || seg.id === 'R103-S1' || seg.id === 'R106-S1') {
            return {
              ...seg,
              waterLevelCm: 65,
              status: 'CRITICAL',
            };
          }
          return seg;
        })
      );

      // Update sensors
      setSensors((prev) =>
        prev.map((s) => {
          if (s.id === 'SN-101' || s.id === 'SN-102' || s.id === 'SN-103') {
            return {
              ...s,
              waterLevelCm: 65,
              status: 'CRITICAL',
              rateOfRise: 4.8,
            };
          }
          return s;
        })
      );

      voiceNav.speak('Emergency Alert: Cascading inundation triggered. Low-lying roads at Paruthipattu and Kamarajar bridge are impassable. Rerouting all evacuees to high elevation ridge.', true);
    } else if (action === 'RESET') {
      try {
        await fetch('/api/simulation/dam/reset', { method: 'POST' });
      } catch {}

      setSegments(INITIAL_ROAD_SEGMENTS);
      setSensors(INITIAL_ROAD_SENSORS);
      setPeople(INITIAL_REGISTERED_PEOPLE);
      setIncidents(INITIAL_INCIDENTS);
      setDamTelemetry({
        damName: 'Chembarambakkam & Avadi Catchment Dam',
        reservoirLevelM: 32.4,
        maxCrestLevelM: 38.0,
        precipitationMmH: 14.5,
        rateOfRiseMMin: 0.02,
        spillwayReleaseCusecs: 3500,
        inflowCusecs: 14200,
        status: 'NORMAL',
        lastUpdated: new Date().toISOString(),
        history: [],
      });
      voiceNav.speak('Hydrological simulation reset to baseline conditions.');
    }
  };

  // Incident Actions Handlers
  const handleAcknowledgeIncident = async (incidentId: string, note?: string) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'Duty Commander (HQ Desk 1)', note }),
      });
      if (res.ok) {
        const data = await res.json();
        setIncidents((prev) => prev.map((inc) => (inc.id === incidentId ? data.incident : inc)));
      }
    } catch {
      // Fallback local update
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                status: 'ACKNOWLEDGED',
                acknowledgedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                acknowledgedBy: 'Duty Commander',
                auditTrail: [
                  ...inc.auditTrail,
                  {
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    operator: 'Duty Commander',
                    action: 'ACKNOWLEDGED',
                    note: note || 'Acknowledged via local offline dashboard',
                  },
                ],
              }
            : inc
        )
      );
    }
  };

  const handleAssignResponder = async (incidentId: string, responderId: string, responderName: string) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responderId, responderName, operator: 'Duty Commander' }),
      });
      if (res.ok) {
        const data = await res.json();
        setIncidents((prev) => prev.map((inc) => (inc.id === incidentId ? data.incident : inc)));
      }
    } catch {
      // Fallback local update
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                assignedResponderId: responderId,
                assignedResponderName: responderName,
                assignedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'RESPONDER_EN_ROUTE',
                auditTrail: [
                  ...inc.auditTrail,
                  {
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    operator: 'Duty Commander',
                    action: 'RESPONDER_ASSIGNED',
                    note: `Dispatched ${responderName}`,
                  },
                ],
              }
            : inc
        )
      );
    }
  };

  const handleUpdateIncidentStatus = async (incidentId: string, status: IncidentStatus, note?: string) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, operator: 'Duty Commander', note }),
      });
      if (res.ok) {
        const data = await res.json();
        setIncidents((prev) => prev.map((inc) => (inc.id === incidentId ? data.incident : inc)));
      }
    } catch {
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                status,
                auditTrail: [
                  ...inc.auditTrail,
                  {
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    operator: 'Duty Commander',
                    action: `STATUS_UPDATED_${status}`,
                    note: note || `Updated to ${status}`,
                  },
                ],
              }
            : inc
        )
      );
    }
  };

  const handleResolveIncident = async (incidentId: string, notes: string) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, operator: 'Duty Commander' }),
      });
      if (res.ok) {
        const data = await res.json();
        setIncidents((prev) => prev.map((inc) => (inc.id === incidentId ? data.incident : inc)));
      }
    } catch {
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                status: 'RESOLVED',
                resolvedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                resolvedBy: 'Duty Commander',
                resolutionNotes: notes,
                auditTrail: [
                  ...inc.auditTrail,
                  {
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    operator: 'Duty Commander',
                    action: 'RESOLVED',
                    note: notes,
                  },
                ],
              }
            : inc
        )
      );
    }
  };

  // Research Mode Scenario Execution
  const handleRunResearchScenario = async (scenarioId: string) => {
    try {
      const res = await fetch('/api/research/run-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.logs) {
          setExperimentLogs(data.logs);
        }
      }
    } catch {
      // Local fallback execution
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setExperimentLogs((prev) => [
        {
          timestamp,
          scenarioId,
          scenarioName: 'Scenario Alpha (Local Sandbox)',
          personId: 'P-103',
          personName: 'S. Karthik',
          inputCondition: 'Drift velocity surge: 2.4 m/s in 78cm water',
          previousPriority: 'P2',
          newPriority: 'P0',
          reason: 'P0 Immediate Danger: High-velocity drift along Kovur tributary',
          outcome: 'Surfaced as Top P0 Emergency Beacon on Command Dashboard',
        },
        ...prev,
      ]);
    }
  };

  const handleExportResearchLogs = (format: 'json' | 'csv') => {
    if (format === 'csv') {
      window.open('/api/research/export?format=csv', '_blank');
    } else {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(experimentLogs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `floodguard_research_experiment_logs_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };

  const handlePersonRegistered = (newPerson: RegisteredPerson, autoShowOnMap: boolean = true) => {
    setPeople((prev) => {
      const updated = [newPerson, ...prev.filter((p) => p.personId !== newPerson.personId)];
      try {
        localStorage.setItem('floodguard_user_people', JSON.stringify(updated));
        // Remove from deleted list if present
        const deletedRaw = localStorage.getItem('floodguard_deleted_people');
        if (deletedRaw) {
          const deletedList: string[] = JSON.parse(deletedRaw);
          const filtered = deletedList.filter((id) => id !== newPerson.personId);
          localStorage.setItem('floodguard_deleted_people', JSON.stringify(filtered));
        }
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }
      return updated;
    });
    setSelectedAlertPerson(newPerson);
    setActiveAdvisePerson(newPerson);
    setSelectedFocusLocation([newPerson.lat, newPerson.lng]);
    setFocusedPersonId(newPerson.personId);

    // Navigate directly to Watch mode upon successful registration
    setIsWatchGlanceMode(true);
    setIsIntakeModalOpen(false);
    try {
      window.history.pushState({ isWatchGlanceMode: true }, '', '#watch');
    } catch {
      // ignore
    }

    voiceNav.speak(
      `Emergency registration recorded for ${newPerson.name}. Plotting GPS location on live tactical map. Priority evaluated as ${newPerson.rescuePriority}.`,
      false
    );
  };

  const handleRemovePerson = async (personId: string) => {
    // 1. Remove from local state and update localStorage
    setPeople((prev) => {
      const updated = prev.filter((p) => p.personId !== personId);
      try {
        localStorage.setItem('floodguard_user_people', JSON.stringify(updated));
        const deletedRaw = localStorage.getItem('floodguard_deleted_people');
        const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
        if (!deletedList.includes(personId)) {
          deletedList.push(personId);
          localStorage.setItem('floodguard_deleted_people', JSON.stringify(deletedList));
        }
      } catch (err) {
        console.warn('LocalStorage remove error:', err);
      }
      return updated;
    });

    // 2. Clear focus if this person was focused
    if (focusedPersonId === personId) {
      setFocusedPersonId(null);
    }
    if (selectedAlertPerson?.personId === personId) {
      setSelectedAlertPerson(null);
    }
    if (activeAdvisePerson?.personId === personId) {
      setActiveAdvisePerson(null);
    }

    // 3. Remove associated incidents
    setIncidents((prev) => prev.filter((inc) => inc.personId !== personId));

    // 4. Send DELETE request to backend
    try {
      await fetch(`/api/people/${personId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Backend DELETE person request failed (remains deleted locally):', err);
    }

    voiceNav.speak('Person record removed permanently from rescue monitoring.', false);
  };

  const handleOpenSmsModal = (person?: RegisteredPerson | null) => {
    if (person) {
      setSelectedAlertPerson(person);
    }
    setIsMobileAlertModalOpen(true);
  };

  const handleAdviseWithAi = (person: RegisteredPerson) => {
    setActiveAdvisePerson(person);
    setIsAiAssistantOpen(true);
  };

  const blockedRoadNames = segments
    .filter((s) => s.status === 'CRITICAL' || s.waterLevelCm >= 50)
    .map((s) => s.name);

  const activeSosCount = people.filter((p) => p.sosActive).length;
  const criticalCount = people.filter((p) => p.rescuePriority === 'P0' || p.rescuePriority === 'P1').length;

  return (
    <div className="flex flex-col w-full min-h-screen h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-950 font-sans selection:bg-[#ff7700] selection:text-white relative">
      {/* Universal Top Master Navigation & Telemetry Banner */}
      <header className={`z-30 bg-slate-950 border-b border-slate-800 px-3 sm:px-4 py-2 text-white shrink-0 ${isWatchGlanceMode ? 'hidden' : ''}`}>
        {/* Mobile Top Bar (Screens < 768px) */}
        <div className="flex md:hidden items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#ff7700] flex items-center justify-center text-white shadow shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-xs tracking-wide text-white">
                FLOODGUARD <span className="text-[#ff7700]">2.1</span>
              </span>
            </div>

            {/* Mobile Active SOS Badge */}
            {activeSosCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-red-600 text-white font-mono font-bold text-[10px] animate-pulse shrink-0">
                {activeSosCount} SOS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Mobile Scan QR Trigger */}
            <button
              onClick={() => setIsDeviceAQrModalOpen(true)}
              className="px-2 py-1 rounded-lg bg-sky-950/80 border border-sky-600/50 text-sky-300 text-[11px] font-mono flex items-center gap-1"
              title="Scan QR to Log In on Another Device"
            >
              <Camera className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden xs:inline">Scan QR</span>
            </button>

            {/* Quick Watch View Toggle Button */}
            <button
              onClick={() => setIsWatchGlanceMode(!isWatchGlanceMode)}
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-sky-400 text-[11px] font-mono flex items-center gap-1"
              title="Toggle Smartwatch Ultra-Compact View"
            >
              <Watch className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Watch</span>
            </button>

            {/* Quick Live Testing Trigger */}
            <button
              onClick={() => setIsTestRunnerOpen(true)}
              className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
              title="Live Testing Console"
            >
              <Activity className="w-3.5 h-3.5 animate-pulse" />
            </button>

            {/* Mobile Hamburger Drawer Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
              title="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Desktop & Tablet Navigation (Screens >= 768px) */}
        <div className="hidden md:flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#ff7700] flex items-center justify-center text-white shadow-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-wide text-white flex items-center gap-1.5">
                FLOODGUARD <span className="text-[#ff7700]">2.1</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                Health-Aware Flood Rescue & Evacuation Command
              </div>
            </div>
          </div>

          {/* Active Global Shared Location Pill */}
          <button
            onClick={() => setActiveTab('weather-news')}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition"
            title="Active Global Shared Location (Click to view Weather & News)"
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-slate-200">{sharedLocation.placeName}</span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({sharedLocation.latitude.toFixed(2)}°, {sharedLocation.longitude.toFixed(2)}°)
            </span>
          </button>

          {/* Dam Live Alert Capsule */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                damTelemetry.status === 'CRITICAL'
                  ? 'bg-red-500 animate-ping'
                  : damTelemetry.status === 'WARNING'
                  ? 'bg-[#ff7700]'
                  : 'bg-emerald-500'
              }`}
            ></span>
            <span className="text-slate-400">DAM:</span>
            <strong className="text-white">{damTelemetry.reservoirLevelM}m</strong>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">DISCHARGE:</span>
            <strong className="text-sky-400">{(damTelemetry.spillwayReleaseCusecs / 1000).toFixed(1)}k cfs</strong>
          </div>

          {/* Emergency SOS & Critical Badges */}
          {activeSosCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/50 text-xs font-mono font-bold animate-pulse">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{activeSosCount} SOS ACTIVE</span>
            </div>
          )}

          {criticalCount > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ff7700]/20 text-[#ff7700] border border-[#ff7700]/50 text-xs font-mono font-bold">
              <Flame className="w-3.5 h-3.5" />
              <span>{criticalCount} CRITICAL (P0/P1)</span>
            </div>
          )}
        </div>

        {/* Primary View Switcher Navigation Tabs */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-inner overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab('welcome')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'welcome'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LifeBuoy className="w-4 h-4 text-emerald-400" />
            <span>Welcome</span>
          </button>

          <button
            onClick={handleOpenCommandCenter}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'command-center'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4 text-[#ff7700]" />
            <span>Command Center</span>
            {!adminUser && <Lock className="w-3 h-3 text-amber-400 ml-0.5" />}
          </button>

          <button
            onClick={() => setActiveTab('person-monitoring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'person-monitoring'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-sky-400" />
            <span>Person Monitoring ({people.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('person-intake')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'person-intake'
                ? 'bg-gradient-to-r from-[#ff7700] to-amber-500 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4 text-[#ff7700]" />
            <span>Register Intake</span>
          </button>

          <button
            onClick={() => setActiveTab('incident-workspace')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'incident-workspace'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Incidents ({incidents.filter((i) => i.status !== 'RESOLVED').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('evacuation-app')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'evacuation-app'
                ? 'bg-[#ff7700] text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span>Evacuation App</span>
          </button>

          <button
            onClick={() => setActiveTab('weather-news')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'weather-news'
                ? 'bg-sky-700/80 text-white shadow-lg border border-sky-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CloudSun className="w-4 h-4 text-sky-400" />
            <span>Weather & News</span>
          </button>

          <button
            onClick={() => setActiveTab('research-simulation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'research-simulation'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FlaskConical className="w-4 h-4 text-amber-400" />
            <span>Research Mode</span>
          </button>
        </div>

        {/* Global Action Modals: Security Badge, Mobile Alert, Offline Pack & AI Assistant */}
        <div className="flex items-center gap-2">
          {/* Admin Authentication Status Badge */}
          {adminUser ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/70 border border-amber-500/40 text-[11px] font-mono text-amber-300 shadow-sm">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold">ADMIN: {adminUser.username}</span>
              <button
                onClick={handleAdminLogout}
                className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] transition"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdminModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-amber-300 hover:text-amber-200 transition"
              title="Log in as Administrator (zoro / roronovazoro22#)"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>ADMIN LOGIN</span>
            </button>
          )}

          {/* Device A: Scan QR to Log In on Another Device Trigger */}
          <button
            onClick={() => setIsDeviceAQrModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950/70 border border-sky-500/40 text-[11px] font-mono text-sky-300 hover:bg-sky-900/60 hover:border-sky-400 transition cursor-pointer shadow-sm group active:scale-95"
            title="Scan QR displayed on Device B to log in automatically without typing password"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="font-bold hidden xl:inline">LINK DEVICE:</span>
            <span>SCAN QR</span>
          </button>

          {/* Device B: Log In with QR Code Trigger */}
          <button
            onClick={() => setIsDeviceBQrModalOpen(true)}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white transition cursor-pointer shadow-sm"
            title="Show pairing QR to log in from your authenticated device"
          >
            <QrCode className="w-3.5 h-3.5 text-sky-400" />
            <span>QR LOGIN</span>
          </button>
          {/* WAF Firewall Defense Status Trigger */}
          <button
            onClick={() => setIsFirewallModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 hover:bg-emerald-900/60 hover:border-emerald-400 transition cursor-pointer shadow-sm group active:scale-95"
            title="Layer 7 Web Application Firewall (WAF) Active — Click to open Firewall Center & Live Threat Inspection"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="font-bold hidden sm:inline">FIREWALL:</span>
            <span className="text-emerald-200">ACTIVE & DEFENDING</span>
            <span className="hidden xl:inline text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
              ZERO-FINGERPRINT
            </span>
          </button>

          {/* Live System Automated Testing Trigger */}
          <button
            onClick={() => setIsTestRunnerOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-500/25 transition active:scale-95 animate-pulse"
            title="Open Live Automated System Testing Console & Real-Time Diagnostics"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Testing</span>
            <span className="hidden lg:inline text-[9px] px-1.5 py-0.2 rounded bg-indigo-400/30 font-mono font-bold">
              27 TESTS
            </span>
          </button>

          {/* Emergency Mobile SMS Alert Gateway Trigger */}
          <button
            onClick={() => handleOpenSmsModal(people[0])}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition active:scale-95"
            title="Send Emergency SMS Alert to Mobile"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Alert</span>
          </button>

          {/* Offline Mode Indicator Badge */}
          {isOfflineMode && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold animate-pulse">
              <WifiOff className="w-3.5 h-3.5" />
              OFFLINE MODE
            </span>
          )}

          <button
            onClick={() => setIsOfflineManagerOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shadow transition"
            title="Download & Manage Offline Map Packages"
          >
            <Download className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span className="hidden md:inline">Offline Map Pack</span>
          </button>

          {/* Smartwatch / Ultra-Small Display Mode Switcher */}
          <button
            onClick={() => setIsWatchGlanceMode(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 text-xs font-semibold flex items-center gap-1.5 shadow transition"
            title="Preview Smartwatch / Wearable Ultra-Compact View (160–320px)"
          >
            <Watch className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xl:inline">Watch View</span>
          </button>

          <button
            onClick={() => setIsAiAssistantOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#ff8811] hover:to-amber-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#ff7700]/20 transition active:scale-95"
            title="Open Interactive Aegis AI Assistant"
          >
            <Bot className="w-4 h-4 text-white" />
            <span>Aegis AI</span>
          </button>
        </div>
        </div>
      </header>

      {/* Mobile Drawer Menu Overlay (When Hamburger Opened on < 768px) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[52px] bottom-[56px] z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 p-4 overflow-y-auto space-y-4 animate-in slide-in-from-top-2">
          {/* Section: Primary Views */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
              Primary Dashboards & Views
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  setActiveTab('welcome');
                  setIsMobileMenuOpen(false);
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'welcome'
                    ? 'bg-emerald-600 text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <LifeBuoy className="w-4 h-4 text-emerald-400" />
                <span>Welcome Page</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenCommandCenter();
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'command-center'
                    ? 'bg-slate-800 text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <Compass className="w-4 h-4 text-[#ff7700]" />
                <span>Command Center</span>
                {!adminUser && <Lock className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
              </button>

              <button
                onClick={() => {
                  setActiveTab('evacuation-app');
                  setIsMobileMenuOpen(false);
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'evacuation-app'
                    ? 'bg-[#ff7700] text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <Navigation className="w-4 h-4" />
                <span>Evacuation App</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('weather-news');
                  setIsMobileMenuOpen(false);
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'weather-news'
                    ? 'bg-sky-700 text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <CloudSun className="w-4 h-4 text-sky-400" />
                <span>Weather & News</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('person-monitoring');
                  setIsMobileMenuOpen(false);
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'person-monitoring'
                    ? 'bg-slate-800 text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <Users className="w-4 h-4 text-sky-400" />
                <span>Monitoring ({people.length})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('person-intake');
                  setIsMobileMenuOpen(false);
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'person-intake'
                    ? 'bg-[#ff7700] text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <Plus className="w-4 h-4 text-[#ff7700]" />
                <span>Register Intake</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('incident-workspace');
                  setIsMobileMenuOpen(false);
                }}
                className={`p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'incident-workspace'
                    ? 'bg-slate-800 text-white border-white'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Incidents</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('research-simulation');
                  setIsMobileMenuOpen(false);
                }}
                className={`col-span-2 p-2.5 rounded-xl border text-left font-bold flex items-center gap-2 ${
                  activeTab === 'research-simulation'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <FlaskConical className="w-4 h-4 text-amber-400" />
                <span>Research Mode & Simulation Scenarios</span>
              </button>
            </div>
          </div>

          {/* Section: Tactical Actions & Modals */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
              Emergency Services & Modals
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  setIsDeviceAQrModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-sky-950/70 border border-sky-500/40 text-sky-300 font-bold flex items-center gap-2"
              >
                <Camera className="w-4 h-4 text-sky-400" />
                <span>Scan QR (Device A)</span>
              </button>

              <button
                onClick={() => {
                  setIsDeviceBQrModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-bold flex items-center gap-2"
              >
                <QrCode className="w-4 h-4 text-sky-400" />
                <span>QR Login (Device B)</span>
              </button>

              <button
                onClick={() => {
                  handleOpenSmsModal(people[0]);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2 shadow"
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobile SMS Alert</span>
              </button>

              <button
                onClick={() => {
                  setIsAiAssistantOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-gradient-to-r from-[#ff7700] to-amber-500 text-white font-bold flex items-center gap-2 shadow"
              >
                <Bot className="w-4 h-4" />
                <span>Aegis AI Advisor</span>
              </button>

              <button
                onClick={() => {
                  setIsTestRunnerOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-bold flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                <span>Live Testing (27)</span>
              </button>

              <button
                onClick={() => {
                  setIsFirewallModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Firewall WAF</span>
              </button>

              <button
                onClick={() => {
                  setIsOfflineManagerOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="col-span-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-bold flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-sky-400" />
                  <span>Offline Map Packages</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {isOfflineMode ? 'OFFLINE' : 'ONLINE'}
                </span>
              </button>
            </div>
          </div>

          {/* Smartwatch Switcher in Drawer */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                setIsWatchGlanceMode(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Watch className="w-4 h-4 text-sky-400" />
              <span>Switch to Smartwatch Glance Mode (160–320px)</span>
            </button>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {/* Dedicated Smartwatch Glance Mode (160–320px ultra-compact) */}
        {isWatchGlanceMode ? (
          <SmartwatchGlanceHub
            damTelemetry={damTelemetry}
            people={people}
            reliefCentres={reliefCentres}
            nodes={INITIAL_ROAD_NODES}
            segments={segments}
            userLocation={userLocation}
            sharedLocation={sharedLocation}
            registeredPerson={selectedAlertPerson || people.find((p) => p.isUserRegistered) || null}
            onNavigateToAssistantAi={() => {
              setIsWatchGlanceMode(false);
              setIsAiAssistantOpen(true);
            }}
            onNavigateToOfflineMap={() => {
              setIsWatchGlanceMode(false);
              setIsOfflineManagerOpen(true);
            }}
            onNavigateToWeather={() => {
              setIsWatchGlanceMode(false);
              setActiveTab('weather-news');
            }}
            onNavigateToWaterStagnation={() => {
              setIsWatchGlanceMode(false);
              setActiveTab('command-center');
            }}
            onNavigateToSos={() => {
              setIsWatchGlanceMode(false);
              setActiveTab('incident-workspace');
            }}
            onSwitchToFullView={() => setIsWatchGlanceMode(false)}
            onScanQr={() => setIsDeviceAQrModalOpen(true)}
          />
        ) : (
          <>
        {activeTab === 'welcome' && (
          <WelcomePage
            onGetStarted={() => setActiveTab('person-intake')}
            onUserLogin={() => {
              const registered = people.find((p) => p.isUserRegistered);
              if (registered) {
                setSelectedAlertPerson(registered);
                setIsWatchGlanceMode(true);
              } else {
                setIsDeviceBQrModalOpen(true);
              }
            }}
            onAdminLogin={() => setIsAdminModalOpen(true)}
            registeredCount={people.length}
            activeSensorsCount={sensors.length}
          />
        )}

        {activeTab === 'command-center' && (
          <RescueCommandCenter
            sensors={sensors}
            segments={segments}
            reliefCentres={reliefCentres}
            wearables={INITIAL_WEARABLES}
            gateways={INITIAL_LORA_GATEWAYS}
            damTelemetry={damTelemetry}
            onTriggerScenario={handleTriggerScenario}
            isOfflineMode={isOfflineMode}
            people={people}
            selectedFocusLocation={selectedFocusLocation}
            focusedPersonId={focusedPersonId}
            onNavigateToPersonMonitoring={() => setActiveTab('person-monitoring')}
            onOpenSmsModal={handleOpenSmsModal}
            sharedLocation={sharedLocation}
          />
        )}

        {activeTab === 'person-monitoring' && (
          <PersonMonitoringPanel
            people={people}
            reliefCentres={reliefCentres}
            thresholds={thresholds}
            onUpdateThresholds={(t) => setThresholds(t)}
            onOpenSmsModal={handleOpenSmsModal}
            onOpenIntakeModal={() => setIsIntakeModalOpen(true)}
            onAdviseWithAi={handleAdviseWithAi}
            onRemovePerson={handleRemovePerson}
            onSelectPersonOnMap={(p) => {
              setSelectedFocusLocation([p.lat, p.lng]);
              setFocusedPersonId(p.personId);
              setActiveTab('command-center');
            }}
          />
        )}

        {activeTab === 'person-intake' && (
          <div className="w-full h-full p-4 sm:p-6 overflow-y-auto">
            <PersonIntakeForm
              currentGps={userLocation}
              sharedLocation={sharedLocation}
              onUpdateSharedLocation={handleUpdateSharedLocation}
              onPersonRegistered={(person, showOnMap = true) => {
                handlePersonRegistered(person, showOnMap);
              }}
              onOpenSmsModal={handleOpenSmsModal}
              onNavigateToPersonMonitoring={() => setActiveTab('person-monitoring')}
            />
          </div>
        )}

        {activeTab === 'incident-workspace' && (
          <IncidentWorkspace
            incidents={incidents}
            onAcknowledge={handleAcknowledgeIncident}
            onAssignResponder={handleAssignResponder}
            onUpdateStatus={handleUpdateIncidentStatus}
            onResolve={handleResolveIncident}
            onSelectOnMap={(lat, lng) => {
              setSelectedFocusLocation([lat, lng]);
              setActiveTab('command-center');
            }}
          />
        )}

        {activeTab === 'evacuation-app' && (
          <EvacuationApp
            nodes={INITIAL_ROAD_NODES}
            segments={segments}
            reliefCentres={reliefCentres}
            userLocation={userLocation}
            isSimulatedGps={isSimulatedGps}
            onUpdateLocation={(loc, sim) => {
              setUserLocation(loc);
              setIsSimulatedGps(sim);
            }}
            onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
            onOpenOfflineManager={() => setIsOfflineManagerOpen(true)}
            isOfflineMode={isOfflineMode}
            sharedLocation={sharedLocation}
          />
        )}

        {activeTab === 'weather-news' && (
          <WeatherNewsHub
            userLocation={userLocation}
            sharedLocation={sharedLocation}
            onUpdateSharedLocation={handleUpdateSharedLocation}
          />
        )}

        {activeTab === 'research-simulation' && (
          <ResearchSimulationMode
            scenarios={INITIAL_RESEARCH_SCENARIOS}
            experimentLogs={experimentLogs}
            people={people}
            onRunScenario={handleRunResearchScenario}
            onExportLogs={handleExportResearchLogs}
          />
        )}
          </>
        )}
      </main>

      {/* Fixed Bottom Navigation Dock for Thumb Usability (Mobile Phones < 768px, hidden in Watch Mode) */}
      {!isWatchGlanceMode && (
        <nav className="md:hidden z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around text-slate-400 shrink-0 safe-area-inset-bottom">
          <button
            onClick={() => {
              setActiveTab('command-center');
              setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition ${
              activeTab === 'command-center' ? 'text-[#ff7700] font-bold' : 'hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span className="text-[10px]">Command</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('evacuation-app');
              setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition ${
              activeTab === 'evacuation-app' ? 'text-[#ff7700] font-bold' : 'hover:text-slate-200'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span className="text-[10px]">Evac</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('weather-news');
              setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition ${
              activeTab === 'weather-news' ? 'text-sky-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            <CloudSun className="w-4 h-4" />
            <span className="text-[10px]">Weather</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('person-monitoring');
              setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition relative ${
              activeTab === 'person-monitoring' ? 'text-sky-400 font-bold' : 'hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-[10px]">People</span>
            {criticalCount > 0 && (
              <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-[#ff7700]"></span>
            )}
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition ${
              isMobileMenuOpen ? 'text-[#ff7700] font-bold' : 'hover:text-slate-200'
            }`}
          >
            <Menu className="w-4 h-4" />
            <span className="text-[10px]">Menu</span>
          </button>
        </nav>
      )}

      {/* Citizen Registration Intake Modal */}
      {isIntakeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-4xl my-auto">
            <PersonIntakeForm
              currentGps={userLocation}
              sharedLocation={sharedLocation}
              onUpdateSharedLocation={handleUpdateSharedLocation}
              onPersonRegistered={(person, showOnMap = true) => {
                handlePersonRegistered(person, showOnMap);
                if (showOnMap) {
                  setIsIntakeModalOpen(false);
                }
              }}
              onClose={() => setIsIntakeModalOpen(false)}
              onOpenSmsModal={handleOpenSmsModal}
              onNavigateToPersonMonitoring={() => {
                setIsIntakeModalOpen(false);
                setActiveTab('person-monitoring');
              }}
            />
          </div>
        </div>
      )}

      {/* Emergency Mobile SMS Alert Gateway Modal */}
      {isMobileAlertModalOpen && (
        <MobileAlertModal
          people={people}
          initialPerson={selectedAlertPerson}
          onClose={() => setIsMobileAlertModalOpen(false)}
        />
      )}

      {/* Offline Map Manager Modal */}
      {isOfflineManagerOpen && (
        <OfflineMapManager
          userLocation={userLocation}
          nodes={INITIAL_ROAD_NODES}
          segments={segments}
          reliefCentres={reliefCentres}
          sensors={sensors}
          isOfflineMode={isOfflineMode}
          onToggleOfflineMode={(enabled) => setIsOfflineMode(enabled)}
          onClose={() => setIsOfflineManagerOpen(false)}
        />
      )}

      {/* Interactive Aegis AI Assistant Panel */}
      {isAiAssistantOpen && (
        <AegisAiAssistant
          damTelemetry={damTelemetry}
          userLocation={userLocation}
          blockedRoads={blockedRoadNames}
          reliefCentres={reliefCentres}
          people={people}
          activePerson={activeAdvisePerson}
          onSelectShelter={(shelterId) => {
            setActiveTab('evacuation-app');
            setIsAiAssistantOpen(false);
          }}
          onOpenSmsModal={(person) => {
            handleOpenSmsModal(person);
          }}
          onClose={() => setIsAiAssistantOpen(false)}
        />
      )}

      {/* Cyber Defense & WAF Firewall Center Modal */}
      <FirewallSecurityModal
        isOpen={isFirewallModalOpen}
        onClose={() => setIsFirewallModalOpen(false)}
      />

      {/* Live System Automated Testing Console & Live Diagnostics Modal */}
      <SystemTestRunnerModal
        isOpen={isTestRunnerOpen}
        onClose={() => setIsTestRunnerOpen(false)}
        onTriggerHydrologySync={async () => {
          try {
            const damRes = await fetch('/api/dam');
            if (damRes.ok) {
              const d = await damRes.json();
              setDamTelemetry(d);
            }
          } catch {}
        }}
      />
      {/* Device A QR Scanner Modal */}
      {isDeviceAQrModalOpen && (
        <DeviceAQrScannerModal
          isOpen={isDeviceAQrModalOpen}
          onClose={() => setIsDeviceAQrModalOpen(false)}
          currentUser={selectedAlertPerson || people.find((p) => p.isUserRegistered) || people[0]}
        />
      )}

      {/* Device B QR Login Modal */}
      {isDeviceBQrModalOpen && (
        <DeviceBQrLoginModal
          isOpen={isDeviceBQrModalOpen}
          onClose={() => setIsDeviceBQrModalOpen(false)}
          onLoginSuccess={(person) => {
            setIsDeviceBQrModalOpen(false);
            handlePersonRegistered(person, true);
          }}
        />
      )}

      {/* Administrator Authentication Modal (RBAC Gate) */}
      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onLoginSuccess={(info) => {
          setAdminUser(info);
          setActiveTab('command-center');
          voiceNav.speak('Administrator verified. Command Center unlocked.');
        }}
      />
    </div>
  );
}
