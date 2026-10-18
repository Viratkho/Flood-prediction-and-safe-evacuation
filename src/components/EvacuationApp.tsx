import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  RoadNode,
  RoadSegment,
  ReliefCentre,
  EvacuationRoute,
  FloodStatus,
} from '../types/floodguard';
import { computeSafestRoute, haversineDistanceM } from '../services/routingEngine';
import { voiceNav } from '../services/voiceNav';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  MapPin,
  Navigation,
  Play,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  Footprints,
} from 'lucide-react';

interface EvacuationAppProps {
  nodes: RoadNode[];
  segments: RoadSegment[];
  reliefCentres: ReliefCentre[];
  userLocation: [number, number];
  isSimulatedGps: boolean;
  onUpdateLocation: (coord: [number, number], isSimulated: boolean) => void;
  onOpenAiAssistant: () => void;
  onOpenOfflineManager: () => void;
  isOfflineMode: boolean;
}

export const EvacuationApp: React.FC<EvacuationAppProps> = ({
  nodes,
  segments,
  reliefCentres,
  userLocation,
  isSimulatedGps,
  onUpdateLocation,
  onOpenAiAssistant,
  onOpenOfflineManager,
  isOfflineMode,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const routePolylineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const shelterMarkersRef = useRef<L.LayerGroup | null>(null);

  const [selectedShelterId, setSelectedShelterId] = useState<string>(reliefCentres[0]?.id || 'RC-1');
  const [activeRoute, setActiveRoute] = useState<EvacuationRoute | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isPickingOriginOnMap, setIsPickingOriginOnMap] = useState(false);
  const [isWalkingSimulation, setIsWalkingSimulation] = useState(false);
  const walkIntervalRef = useRef<number | null>(null);

  // Track previous blocked segments to detect dynamic reroute events
  const prevBlockedSegmentsRef = useRef<string[]>([]);

  const selectedShelter = reliefCentres.find((s) => s.id === selectedShelterId) || reliefCentres[0];

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: userLocation,
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OpenStreetMap standard tiles
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      className: 'high-contrast-tiles',
    }).addTo(map);

    shelterMarkersRef.current = L.layerGroup().addTo(map);

    // User Location Marker
    const userIcon = L.divIcon({
      className: 'user-gps-pulse-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-xl animate-pulse"></div>
          <div class="absolute w-8 h-8 rounded-full border border-blue-400 opacity-60"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    userMarkerRef.current = L.marker(userLocation, { icon: userIcon }).addTo(map);

    accuracyCircleRef.current = L.circle(userLocation, {
      radius: isSimulatedGps ? 15 : 25,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.12,
      weight: 1,
    }).addTo(map);

    // Map Click Listener for "Pick From Map"
    map.on('click', (e: L.LeafletMouseEvent) => {
      onUpdateLocation([e.latlng.lat, e.latlng.lng], true);
      setIsPickingOriginOnMap(false);
    });

    mapInstanceRef.current = map;

    return () => {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update User Marker position
  useEffect(() => {
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userLocation);
    }
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng(userLocation);
    }
  }, [userLocation]);

  // Render Shelter Destination Markers
  useEffect(() => {
    if (!shelterMarkersRef.current) return;
    shelterMarkersRef.current.clearLayers();

    reliefCentres.forEach((shelter) => {
      const isSelected = shelter.id === selectedShelterId;
      const iconHtml = `
        <div class="flex flex-col items-center cursor-pointer">
          <div class="px-2 py-0.5 rounded text-[10px] font-bold border shadow ${
            isSelected
              ? 'bg-[#ff7700] text-white border-white scale-110'
              : 'bg-slate-900 text-slate-200 border-slate-700'
          }">
            🛡️ ${shelter.name.split(' ')[0]}
          </div>
          <div class="w-2.5 h-2.5 rotate-45 -mt-1.5 ${
            isSelected ? 'bg-[#ff7700]' : 'bg-slate-900'
          }"></div>
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: 'shelter-dest-icon',
        iconSize: [70, 26],
        iconAnchor: [35, 26],
      });

      const m = L.marker([shelter.lat, shelter.lng], { icon });
      m.on('click', () => {
        setSelectedShelterId(shelter.id);
      });
      shelterMarkersRef.current?.addLayer(m);
    });
  }, [reliefCentres, selectedShelterId]);

  // Compute or Recalculate Safe Route
  const calculateRoute = (triggerVoice = false) => {
    if (!selectedShelter) return;

    const route = computeSafestRoute(userLocation, selectedShelter, nodes, segments);
    setActiveRoute(route);

    // Render on Map
    if (mapInstanceRef.current) {
      if (routePolylineRef.current) {
        mapInstanceRef.current.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }

      routePolylineRef.current = L.polyline(route.pathCoordinates, {
        color: route.hasCriticalSegments ? '#ef4444' : '#0284c7',
        weight: 6,
        opacity: 0.95,
      }).addTo(mapInstanceRef.current);

      // Fit bounds to show both user and route
      mapInstanceRef.current.fitBounds(routePolylineRef.current.getBounds(), {
        padding: [40, 40],
      });
    }

    if (triggerVoice && voiceEnabled) {
      if (route.hasCriticalSegments) {
        voiceNav.speak('High flood hazard detected on all paths. Proceed with extreme caution toward elevated high ground.', true);
      } else {
        voiceNav.speak(`Route calculated. Proceed toward the estimated lower-risk route to ${selectedShelter.name}. Estimated travel time is ${route.estimatedMinutes} minutes.`);
      }
    }
  };

  // Trigger route computation when shelter changes or segments update
  useEffect(() => {
    calculateRoute(false);
  }, [selectedShelterId, userLocation]);

  // Dynamic Rerouting Engine: detects when road segments change status in simulation
  useEffect(() => {
    const currentCritical = segments.filter((s) => s.waterLevelCm >= 45).map((s) => s.id);
    const hasNewCritical = currentCritical.some((id) => !prevBlockedSegmentsRef.current.includes(id));

    if (hasNewCritical && activeRoute) {
      // Check if newly flooded road intersects with the active route
      const affected = activeRoute.steps.some((step) => currentCritical.includes(step.segmentId));
      if (affected) {
        if (voiceEnabled) {
          voiceNav.speak('Warning! Flood risk has increased on the current route. Route changed because the road segment ahead is critical.', true);
        }
        calculateRoute(false);
      }
    }

    prevBlockedSegmentsRef.current = currentCritical;
  }, [segments]);

  // Simulated GPS Movement / Test Walk
  const toggleWalkingSimulation = () => {
    if (isWalkingSimulation) {
      if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
      setIsWalkingSimulation(false);
      return;
    }

    if (!activeRoute || activeRoute.pathCoordinates.length < 2) {
      calculateRoute(true);
    }

    setIsWalkingSimulation(true);
    let stepIndex = 0;
    const coords = activeRoute?.pathCoordinates || [userLocation, [selectedShelter.lat, selectedShelter.lng]];

    walkIntervalRef.current = window.setInterval(() => {
      stepIndex++;
      if (stepIndex >= coords.length) {
        if (walkIntervalRef.current) clearInterval(walkIntervalRef.current);
        setIsWalkingSimulation(false);
        if (voiceEnabled) voiceNav.speak(`You have safely arrived at the evacuation shelter: ${selectedShelter.name}`);
        return;
      }

      const nextCoord = coords[stepIndex];
      onUpdateLocation(nextCoord, true);

      if (stepIndex === 1 && voiceEnabled) {
        voiceNav.speak('Proceeding along the estimated lower-risk route. Sensors active.');
      }
    }, 1800);
  };

  // Toggle voice navigation
  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    voiceNav.setEnabled(next);
  };

  return (
    <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden bg-slate-950 text-slate-100">
      {/* Left Navigation Control & Turn-by-Turn Panel */}
      <div className="w-full md:w-96 lg:w-[410px] bg-slate-900 border-r border-slate-800 flex flex-col z-20 shadow-2xl overflow-y-auto">
        {/* Header Bar */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ff7700] flex items-center justify-center text-white shadow-md">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white uppercase tracking-wide">Evacuation Routing</h2>
              <p className="text-[11px] text-slate-400">Flood-Aware Live GPS Guidance</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleVoice}
              className={`p-2 rounded-lg border text-xs transition ${
                voiceEnabled
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
              title={voiceEnabled ? 'Voice Guidance Active' : 'Voice Guidance Muted'}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onOpenOfflineManager}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition ${
                isOfflineMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Manage Offline Map Package"
            >
              <span>💾</span>
              <span className="hidden sm:inline">Offline Pack</span>
            </button>
          </div>
        </div>

        {/* Offline Indicator Alert if Active */}
        {isOfflineMode && (
          <div className="bg-amber-950/80 border-b border-amber-800/80 px-4 py-2 flex items-center gap-2 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span><strong>Offline Mode Active:</strong> Using locally cached map tiles & offline A* road graph.</span>
          </div>
        )}

        {/* Route Origin & Destination Selector Box */}
        <div className="p-4 space-y-3 bg-slate-950/60 border-b border-slate-800/80">
          {/* Origin (From) */}
          <div>
            <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 mb-1">
              <span>ORIGIN (FROM)</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                isSimulatedGps ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              }`}>
                {isSimulatedGps ? 'SIMULATED GPS' : 'REAL GPS'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 truncate flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#38bdf8] flex-shrink-0" />
                <span>{userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}</span>
              </div>

              <button
                onClick={() => {
                  if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => onUpdateLocation([pos.coords.latitude, pos.coords.longitude], false),
                      () => onUpdateLocation([13.1090, 80.1010], true),
                      { enableHighAccuracy: true }
                    );
                  }
                }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
                title="Snap to Current Device GPS"
              >
                <Crosshair className="w-4 h-4 text-sky-400" />
              </button>

              <button
                onClick={() => setIsPickingOriginOnMap(p => !p)}
                className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition ${
                  isPickingOriginOnMap
                    ? 'bg-[#ff7700] text-white border-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
                title="Tap anywhere on map to set start location"
              >
                Pick Map
              </button>
            </div>
            {isPickingOriginOnMap && (
              <p className="text-[11px] text-[#ff7700] mt-1 font-mono">
                👉 Click anywhere on the map to set your origin location.
              </p>
            )}
          </div>

          {/* Destination (To) */}
          <div>
            <div className="text-[11px] font-mono text-slate-400 mb-1">DESTINATION (SAFE HAVEN SHELTER)</div>
            <select
              value={selectedShelterId}
              onChange={(e) => setSelectedShelterId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff7700]"
            >
              {reliefCentres.map((rc) => (
                <option key={rc.id} value={rc.id}>
                  🛡️ {rc.name} ({rc.totalCapacity - rc.occupiedCapacity} beds left | {rc.elevationM}m MSL)
                </option>
              ))}
            </select>
          </div>

          {/* Primary Action Controls */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => calculateRoute(true)}
              className="flex-1 py-2.5 px-3 rounded-lg bg-[#ff7700] hover:bg-[#e66c00] text-white font-bold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            >
              <Navigation className="w-4 h-4" />
              Recalculate Safest Route
            </button>

            <button
              onClick={toggleWalkingSimulation}
              className={`px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                isWalkingSimulation
                  ? 'bg-red-950 border-red-800 text-red-300 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Test walk along evacuation path"
            >
              <Footprints className="w-4 h-4 text-emerald-400" />
              <span>{isWalkingSimulation ? 'Stop Walk' : 'Test Walk'}</span>
            </button>
          </div>
        </div>

        {/* Route Summary Metric Cards */}
        {activeRoute && (
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${activeRoute.hasCriticalSegments ? 'text-red-400 animate-pulse' : 'text-sky-400'}`}>
                {activeRoute.routeTitle}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Freshness: {activeRoute.dataFreshness || 'Live Telemetry'}
              </span>
            </div>

            {/* Critical No-Safe-Route Warning Banner (Rule 6) */}
            {activeRoute.warningNotice && (
              <div className="bg-red-950/90 border-2 border-red-600 rounded-xl p-3 text-xs text-red-200 space-y-1.5 animate-pulse">
                <div className="font-extrabold flex items-center gap-1.5 text-red-400 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  NO VERIFIED SAFE ROUTE ESTABLISHED
                </div>
                <p className="text-[11px] leading-relaxed text-red-100">
                  {activeRoute.warningNotice}
                </p>
                <div className="text-[10px] text-red-300 font-mono">
                  Never assume a path is safe because a route line is displayed. Do not walk or drive through moving floodwaters.
                </div>
              </div>
            )}

            {/* Risk-Aware Engine Metadata Capsule */}
            <div className="flex items-center justify-between text-[10px] font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <Shield className="w-3 h-3" />
                Risk-Aware A* Engine Active
              </span>
              <span>Calculated: {activeRoute.calculatedAt || 'Just now'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono">ESTIMATED TRANSIT</span>
                <div className="text-lg font-mono font-extrabold text-white">
                  ~{activeRoute.estimatedMinutes} <span className="text-xs font-normal text-slate-400">mins</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono">TOTAL DISTANCE</span>
                <div className="text-lg font-mono font-extrabold text-[#38bdf8]">
                  {(activeRoute.totalDistanceM / 1000).toFixed(1)} <span className="text-xs font-normal text-slate-400">km</span>
                </div>
              </div>
            </div>

            {/* Blocked roads avoided */}
            {activeRoute.blockedSegmentsAvoided.length > 0 && (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-2.5 text-xs text-red-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-red-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Impassable Roads Detoured:
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  {activeRoute.blockedSegmentsAvoided.join(', ')}
                </div>
              </div>
            )}

            {/* Selected Haven Profile Card */}
            <div className="bg-slate-950/70 rounded-lg p-2.5 border border-slate-800 text-xs space-y-1">
              <div className="font-bold text-white flex items-center justify-between">
                <span>{selectedShelter.name}</span>
                <span className="text-emerald-400 font-mono font-bold">{selectedShelter.elevationM}m MSL</span>
              </div>
              <div className="text-[11px] text-slate-400">{selectedShelter.address}</div>
              <div className="flex justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-800/80">
                <span>Beds Available: <strong>{selectedShelter.totalCapacity - selectedShelter.occupiedCapacity}</strong></span>
                <span>Medical: <strong>{selectedShelter.medicalFacility ? 'Available' : 'Standby'}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Turn-by-Turn Navigation Step List */}
        <div className="flex-1 p-4 space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Turn-by-Turn Waypoints</span>
            <span className="text-sky-400">{activeRoute?.steps.length || 0} Steps</span>
          </div>

          {activeRoute?.steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-slate-950/60 hover:bg-slate-950/90 p-2.5 rounded-lg border border-slate-800/80 text-xs space-y-1 transition"
            >
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-mono text-[10px] text-sky-400 flex-shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white leading-snug">{step.instruction}</div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>{step.distanceM}m</span>
                    <span>•</span>
                    <span className={step.waterLevelCm > 25 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                      Depth: {step.waterLevelCm}cm
                    </span>
                    <span>•</span>
                    <span className={`font-semibold ${
                      step.riskStatus === 'SAFE' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {step.riskStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Aegis AI Emergency Callout Banner */}
        <div className="p-3 bg-gradient-to-r from-sky-950/60 to-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <div className="text-xs">
              <div className="font-bold text-white">Need Live Evacuation Advice?</div>
              <div className="text-[10px] text-sky-300">Aegis AI Assistant is online & analyzing sensor telemetry</div>
            </div>
          </div>
          <button
            onClick={onOpenAiAssistant}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow transition flex-shrink-0"
          >
            Ask AI
          </button>
        </div>
      </div>

      {/* Main Map Viewport */}
      <div className="flex-1 relative w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Quick Stats on Map */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView(userLocation, 15);
              }
            }}
            className="p-2.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-white shadow-xl hover:bg-slate-800 transition"
            title="Center on My GPS"
          >
            <Crosshair className="w-5 h-5 text-sky-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
