import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  RoadSensor,
  RoadSegment,
  ReliefCentre,
  WearableDevice,
  LoraGateway,
  DamTelemetry,
  RegisteredPerson,
} from '../types/floodguard';
import { HealthAwareOverview } from './HealthAwareOverview';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  BatteryCharging,
  CloudRain,
  Compass,
  Crosshair,
  Heart,
  HeartPulse,
  Layers,
  MapPin,
  Radio,
  RefreshCw,
  Shield,
  Waves,
  Zap,
} from 'lucide-react';

interface RescueCommandCenterProps {
  sensors: RoadSensor[];
  segments: RoadSegment[];
  reliefCentres: ReliefCentre[];
  wearables: WearableDevice[];
  gateways: LoraGateway[];
  damTelemetry: DamTelemetry;
  routeCoordinates?: [number, number][];
  onTriggerScenario: (action: string) => void;
  onSelectSensor?: (sensor: RoadSensor) => void;
  isOfflineMode: boolean;
  people?: RegisteredPerson[];
  selectedFocusLocation?: [number, number] | null;
  onNavigateToPersonMonitoring?: () => void;
}

export const RescueCommandCenter: React.FC<RescueCommandCenterProps> = ({
  sensors,
  segments,
  reliefCentres,
  wearables,
  gateways,
  damTelemetry,
  routeCoordinates,
  onTriggerScenario,
  isOfflineMode,
  people = [],
  selectedFocusLocation,
  onNavigateToPersonMonitoring,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups
  const sensorLayerRef = useRef<L.LayerGroup | null>(null);
  const roadLayerRef = useRef<L.LayerGroup | null>(null);
  const shelterLayerRef = useRef<L.LayerGroup | null>(null);
  const wearableLayerRef = useRef<L.LayerGroup | null>(null);
  const gatewayLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  const [visibleLayers, setVisibleLayers] = useState({
    sensors: true,
    roads: true,
    shelters: true,
    wearables: true,
    gateways: true,
    route: true,
  });

  const [selectedSensor, setSelectedSensor] = useState<RoadSensor | null>(null);
  const [selectedPersonForInspection, setSelectedPersonForInspection] = useState<RegisteredPerson | null>(null);
  const [activeTileTheme, setActiveTileTheme] = useState<'tactical-dark' | 'osm-standard'>('tactical-dark');

  // Focus on map coordinate if triggered from another panel
  useEffect(() => {
    if (selectedFocusLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView(selectedFocusLocation, 15, { animate: true });
    }
  }, [selectedFocusLocation]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [13.1143, 80.1015],
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OpenStreetMap standard tiles
    const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: activeTileTheme === 'tactical-dark' ? 'dark-tiles' : '',
    }).addTo(map);

    // Initialize Layer Groups
    sensorLayerRef.current = L.layerGroup().addTo(map);
    roadLayerRef.current = L.layerGroup().addTo(map);
    shelterLayerRef.current = L.layerGroup().addTo(map);
    wearableLayerRef.current = L.layerGroup().addTo(map);
    gatewayLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update tile theme class
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const tileContainer = mapContainerRef.current.querySelector('.leaflet-tile-pane');
    if (tileContainer) {
      if (activeTileTheme === 'tactical-dark') {
        tileContainer.classList.add('dark-tiles');
      } else {
        tileContainer.classList.remove('dark-tiles');
      }
    }
  }, [activeTileTheme]);

  // Render Road Segments
  useEffect(() => {
    if (!roadLayerRef.current || !mapInstanceRef.current) return;
    roadLayerRef.current.clearLayers();

    if (!visibleLayers.roads) return;

    segments.forEach((seg) => {
      const color =
        seg.waterLevelCm >= 50
          ? '#ef4444' // Red Critical
          : seg.waterLevelCm >= 30
          ? '#f97316' // Orange Warning
          : seg.waterLevelCm >= 15
          ? '#eab308' // Yellow Caution
          : '#10b981'; // Green Safe

      const polyline = L.polyline(seg.coordinates, {
        color,
        weight: seg.waterLevelCm >= 50 ? 6 : 4,
        opacity: 0.9,
        dashArray: seg.waterLevelCm >= 50 ? '8, 8' : undefined,
      });

      polyline.bindTooltip(
        `<div class="p-1 font-mono text-xs">
          <strong>${seg.name}</strong><br/>
          Depth: <span class="${seg.waterLevelCm >= 50 ? 'text-red-400 font-bold' : ''}">${seg.waterLevelCm} cm</span><br/>
          Elevation: ${seg.baseElevationM}m
        </div>`,
        { sticky: true }
      );

      roadLayerRef.current?.addLayer(polyline);
    });
  }, [segments, visibleLayers.roads]);

  // Render Sensors
  useEffect(() => {
    if (!sensorLayerRef.current || !mapInstanceRef.current) return;
    sensorLayerRef.current.clearLayers();

    if (!visibleLayers.sensors) return;

    sensors.forEach((sensor) => {
      const isCritical = sensor.status === 'CRITICAL';
      const isWarning = sensor.status === 'WARNING';
      const bgColor = isCritical ? '#ef4444' : isWarning ? '#ff7700' : sensor.status === 'CAUTION' ? '#eab308' : '#38bdf8';

      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group">
          <div class="w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-lg text-white font-bold text-[10px] ${
            isCritical ? 'bg-red-600 animate-emergency-pulse' : isWarning ? 'bg-[#ff7700]' : 'bg-slate-900'
          }" style="background-color: ${bgColor};">
            ${sensor.waterLevelCm}
          </div>
          <div class="absolute -bottom-1 w-2 h-2 rounded-full bg-white"></div>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-sensor-icon',
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([sensor.lat, sensor.lng], { icon: markerIcon });
      marker.on('click', () => {
        setSelectedSensor(sensor);
      });

      marker.bindPopup(`
        <div class="text-slate-900 p-1 min-w-[200px]">
          <div class="text-xs font-bold uppercase tracking-wider text-slate-500">${sensor.id}</div>
          <div class="font-bold text-sm text-slate-900">${sensor.name}</div>
          <div class="mt-2 text-xs space-y-1">
            <div class="flex justify-between"><span>Water Depth:</span> <strong class="text-blue-700">${sensor.waterLevelCm} cm</strong></div>
            <div class="flex justify-between"><span>Rate of Rise:</span> <strong>${sensor.rateOfRise} cm/min</strong></div>
            <div class="flex justify-between"><span>Elevation:</span> <strong>${sensor.elevationM} m</strong></div>
            <div class="flex justify-between"><span>Battery:</span> <strong>${sensor.batteryPercent}%</strong></div>
            <div class="flex justify-between"><span>LoRa Signal:</span> <strong>${sensor.signalStrengthDbm} dBm</strong></div>
          </div>
        </div>
      `);

      sensorLayerRef.current?.addLayer(marker);
    });
  }, [sensors, visibleLayers.sensors]);

  // Render Relief Shelters
  useEffect(() => {
    if (!shelterLayerRef.current || !mapInstanceRef.current) return;
    shelterLayerRef.current.clearLayers();

    if (!visibleLayers.shelters) return;

    reliefCentres.forEach((shelter) => {
      const percentOccupied = Math.round((shelter.occupiedCapacity / shelter.totalCapacity) * 100);
      const isFull = percentOccupied >= 95;

      const iconHtml = `
        <div class="flex flex-col items-center group">
          <div class="px-2 py-0.5 rounded bg-blue-600 border border-white text-white font-bold text-[10px] shadow-lg flex items-center gap-1">
            <span>🛡️</span>
            <span>${shelter.totalCapacity - shelter.occupiedCapacity} left</span>
          </div>
          <div class="w-3 h-3 bg-blue-600 rotate-45 -mt-1.5 border-r border-b border-white"></div>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-shelter-icon',
        html: iconHtml,
        iconSize: [60, 26],
        iconAnchor: [30, 26],
      });

      const marker = L.marker([shelter.lat, shelter.lng], { icon: markerIcon });
      marker.bindPopup(`
        <div class="text-slate-900 p-1 min-w-[220px]">
          <div class="text-xs font-bold text-blue-700 uppercase">SAFE HAVEN SHELTER</div>
          <div class="font-bold text-sm text-slate-900">${shelter.name}</div>
          <div class="text-xs text-slate-600 mt-0.5">${shelter.address}</div>
          <div class="mt-2 text-xs space-y-1">
            <div class="flex justify-between"><span>Elevation:</span> <strong class="text-emerald-700">${shelter.elevationM}m Safe Ground</strong></div>
            <div class="flex justify-between"><span>Capacity:</span> <strong>${shelter.occupiedCapacity} / ${shelter.totalCapacity} (${percentOccupied}%)</strong></div>
            <div class="flex justify-between"><span>Medical Unit:</span> <strong>${shelter.medicalFacility ? '✅ On Site' : '❌ Standby'}</strong></div>
            <div class="flex justify-between"><span>Stock:</span> <strong>${shelter.foodWaterStock}</strong></div>
            <div class="flex justify-between"><span>Emergency Hotline:</span> <strong>${shelter.contactPhone}</strong></div>
          </div>
        </div>
      `);

      shelterLayerRef.current?.addLayer(marker);
    });
  }, [reliefCentres, visibleLayers.shelters]);

  // Render Registered People & Responders with Priority Badges
  useEffect(() => {
    if (!wearableLayerRef.current || !mapInstanceRef.current) return;
    wearableLayerRef.current.clearLayers();

    if (!visibleLayers.wearables) return;

    // Render Registered People
    people.forEach((person) => {
      const isSos = person.sosActive;
      const isP0 = person.rescuePriority === 'P0';
      const isP1 = person.rescuePriority === 'P1';
      const isP2 = person.rescuePriority === 'P2';
      const isDrifting = person.driftStatus === 'DRIFTING';

      const badgeColor = isSos || isP0
        ? '#ef4444' // Red
        : isP1
        ? '#ff7700' // Orange
        : isP2
        ? '#f59e0b' // Amber
        : person.rescuePriority === 'P3'
        ? '#38bdf8' // Blue
        : '#10b981'; // Green

      const iconHtml = `
        <div class="relative flex flex-col items-center cursor-pointer group">
          <div class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white shadow-lg border border-white flex items-center gap-1 ${
            isSos || isP0 ? 'animate-emergency-pulse' : ''
          }" style="background-color: ${badgeColor};">
            ${isSos ? '🆘' : isDrifting ? '🌊' : ''}
            <span>${person.rescuePriority}</span>
          </div>
          <div class="w-2 h-2 rotate-45 -mt-1 border-r border-b border-white" style="background-color: ${badgeColor};"></div>
          ${isDrifting ? '<div class="text-[9px] font-bold text-cyan-300 font-mono drop-shadow">DRIFTING</div>' : ''}
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-person-priority-icon',
        html: iconHtml,
        iconSize: [48, 28],
        iconAnchor: [24, 28],
      });

      const marker = L.marker([person.lat, person.lng], { icon: markerIcon });
      marker.on('click', () => {
        setSelectedPersonForInspection(person);
      });

      marker.bindPopup(`
        <div class="text-slate-900 p-1 min-w-[210px] text-xs">
          <div class="flex justify-between items-center mb-1">
            <span class="font-bold text-[10px] uppercase text-slate-500">${person.personId} • ${person.wearableId}</span>
            <span class="font-bold px-1.5 py-0.2 rounded text-white text-[10px]" style="background-color: ${badgeColor}">
              ${person.rescuePriority}
            </span>
          </div>
          <div class="font-bold text-sm text-slate-900">${person.name}</div>
          <div class="text-[11px] text-slate-600 mb-2">${person.priorityReason}</div>
          <div class="space-y-0.5 border-t pt-1 font-mono text-[11px]">
            <div class="flex justify-between"><span>Heart Rate:</span> <strong>${person.heartRateBpm !== null ? `${person.heartRateBpm} BPM` : 'Unknown'}</strong></div>
            <div class="flex justify-between"><span>Blood Oxygen:</span> <strong class="${person.spo2Percent !== null && person.spo2Percent < 90 ? 'text-red-600' : ''}">${person.spo2Percent !== null ? `${person.spo2Percent}%` : 'Unknown'}</strong></div>
            <div class="flex justify-between"><span>Flood Depth:</span> <strong class="text-blue-700">${person.floodDepthCm} cm</strong></div>
            <div class="flex justify-between"><span>Mobile SMS:</span> <strong class="text-emerald-700">${person.contactNumber || 'Available'}</strong></div>
            <div class="flex justify-between"><span>Drift Status:</span> <strong class="${isDrifting ? 'text-cyan-700 font-bold' : ''}">${person.driftStatus}</strong></div>
            <div class="flex justify-between"><span>GPS Accuracy:</span> <span>±${person.gpsAccuracyM}m</span></div>
          </div>
        </div>
      `);

      wearableLayerRef.current?.addLayer(marker);
    });

    // Render Field Responders (Boats & Tactical Units)
    wearables.filter(w => w.role === 'RESPONDER').forEach((resp) => {
      const iconHtml = `
        <div class="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 border-2 border-white shadow-lg text-white text-xs">
          🚤
        </div>
      `;
      const markerIcon = L.divIcon({
        className: 'custom-responder-icon',
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([resp.lat, resp.lng], { icon: markerIcon });
      marker.bindPopup(`
        <div class="text-slate-900 p-1 text-xs">
          <div class="text-[10px] font-bold uppercase text-emerald-700">TACTICAL RESCUE UNIT</div>
          <div class="font-bold text-sm">${resp.holderName}</div>
          <div class="mt-1 text-slate-600">ID: ${resp.id} • Active on Water</div>
        </div>
      `);
      wearableLayerRef.current?.addLayer(marker);
    });
  }, [people, wearables, visibleLayers.wearables]);

  // Render LoRa Gateways
  useEffect(() => {
    if (!gatewayLayerRef.current || !mapInstanceRef.current) return;
    gatewayLayerRef.current.clearLayers();

    if (!visibleLayers.gateways) return;

    gateways.forEach((gw) => {
      const iconHtml = `
        <div class="flex items-center justify-center w-5 h-5 bg-purple-700 border border-white rounded-sm text-[10px] text-white shadow">
          📡
        </div>
      `;
      const markerIcon = L.divIcon({
        className: 'custom-gateway-icon',
        html: iconHtml,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([gw.lat, gw.lng], { icon: markerIcon });
      marker.bindPopup(`
        <div class="text-slate-900 p-1 text-xs">
          <strong>${gw.name}</strong><br/>
          ID: ${gw.id}<br/>
          Status: <span class="text-emerald-600 font-bold">${gw.status}</span><br/>
          Connected IoT Nodes: ${gw.connectedNodes}
        </div>
      `);
      gatewayLayerRef.current?.addLayer(marker);
    });
  }, [gateways, visibleLayers.gateways]);

  // Render Active Safe Route
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (routeLayerRef.current) {
      mapInstanceRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (visibleLayers.route && routeCoordinates && routeCoordinates.length > 1) {
      routeLayerRef.current = L.polyline(routeCoordinates, {
        color: '#38bdf8',
        weight: 6,
        opacity: 0.95,
      }).addTo(mapInstanceRef.current);
    }
  }, [routeCoordinates, visibleLayers.route]);

  // Sparkline generator for Dam historical levels (60 points)
  const history = damTelemetry.history || [];
  const minLevel = 30.0;
  const maxLevel = 38.5;
  const svgWidth = 260;
  const svgHeight = 44;

  const sparklinePoints = history
    .map((pt, idx) => {
      const x = (idx / Math.max(1, history.length - 1)) * svgWidth;
      const normalizedY = (pt.level - minLevel) / (maxLevel - minLevel);
      const y = svgHeight - normalizedY * (svgHeight - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950">
      {/* Top Telemetry Header Bar */}
      <div className="z-10 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                damTelemetry.status === 'CRITICAL' ? 'bg-red-400' : 'bg-[#ff7700]'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                damTelemetry.status === 'CRITICAL' ? 'bg-red-500' : 'bg-[#ff7700]'
              }`}></span>
            </span>
            <h1 className="font-bold text-sm tracking-wide uppercase flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#ff7700]" />
              FloodGuard 2.1 <span className="text-slate-400 font-normal">| Command Center</span>
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs font-mono bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-slate-400">BASIN:</span>
            <span className="text-sky-400 font-semibold">Avadi / Ambattur, Chennai</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">SENSORS:</span>
            <span className="text-emerald-400">{sensors.length} ACTIVE</span>
          </div>
        </div>

        {/* Quick Map & Layer Controls */}
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setActiveTileTheme(t => t === 'tactical-dark' ? 'osm-standard' : 'tactical-dark')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition font-mono flex items-center gap-1"
          >
            <Compass className="w-3.5 h-3.5 text-[#38bdf8]" />
            {activeTileTheme === 'tactical-dark' ? 'Night Grid' : 'OSM Day'}
          </button>

          <div className="flex items-center bg-slate-800/80 p-0.5 rounded border border-slate-700">
            <button
              onClick={() => setVisibleLayers(l => ({ ...l, sensors: !l.sensors }))}
              className={`px-2 py-0.5 rounded transition ${visibleLayers.sensors ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
              title="Toggle IoT Road Sensors"
            >
              Sensors
            </button>
            <button
              onClick={() => setVisibleLayers(l => ({ ...l, roads: !l.roads }))}
              className={`px-2 py-0.5 rounded transition ${visibleLayers.roads ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
              title="Toggle Road Network Segments"
            >
              Roads
            </button>
            <button
              onClick={() => setVisibleLayers(l => ({ ...l, shelters: !l.shelters }))}
              className={`px-2 py-0.5 rounded transition ${visibleLayers.shelters ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
              title="Toggle Safe Havens"
            >
              Shelters
            </button>
            <button
              onClick={() => setVisibleLayers(l => ({ ...l, wearables: !l.wearables }))}
              className={`px-2 py-0.5 rounded transition ${visibleLayers.wearables ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'}`}
              title="Toggle Wearables & NDRF Teams"
            >
              Teams
            </button>
          </div>
        </div>
      </div>

      {/* Compact Health-Aware Emergency Overview (Command Center Metric Ribbon) */}
      <HealthAwareOverview people={people} />

      {/* Main Interactive Map Viewport */}
      <div className="relative flex-1 w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Dam Hydrological Simulation Card */}
        <div className="absolute top-4 left-4 z-20 w-84 md:w-96 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Waves className="w-5 h-5 text-[#38bdf8]" />
              <div>
                <div className="font-bold text-xs uppercase tracking-wider text-slate-300">Hydrological Telemetry</div>
                <div className="text-sm font-semibold text-white truncate max-w-[210px]">{damTelemetry.damName}</div>
              </div>
            </div>

            <div className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-wide border ${
              damTelemetry.status === 'CRITICAL'
                ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                : damTelemetry.status === 'WARNING'
                ? 'bg-[#ff7700]/20 text-[#ff7700] border-[#ff7700]/40'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
            }`}>
              {damTelemetry.status}
            </div>
          </div>

          <div className="p-4 space-y-3.5">
            {/* Reservoir Gauge & Crest Bar */}
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs text-slate-400">Reservoir Water Level:</span>
                <span className="text-lg font-mono font-extrabold text-white">
                  {damTelemetry.reservoirLevelM} <span className="text-xs font-normal text-slate-400">/ {damTelemetry.maxCrestLevelM}m</span>
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 ${
                    damTelemetry.reservoirLevelM > 36.5
                      ? 'bg-red-500'
                      : damTelemetry.reservoirLevelM > 34.0
                      ? 'bg-[#ff7700]'
                      : 'bg-sky-400'
                  }`}
                  style={{
                    width: `${Math.min(100, (damTelemetry.reservoirLevelM / damTelemetry.maxCrestLevelM) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-center text-slate-400 mb-0.5">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="text-[10px] text-slate-400 uppercase">Precipitation</div>
                <div className="font-mono text-xs font-bold text-slate-100">{damTelemetry.precipitationMmH} <span className="text-[9px] font-normal">mm/h</span></div>
              </div>

              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-center text-slate-400 mb-0.5">
                  <Activity className="w-3.5 h-3.5 text-[#ff7700]" />
                </div>
                <div className="text-[10px] text-slate-400 uppercase">Rate of Rise</div>
                <div className="font-mono text-xs font-bold text-slate-100">+{damTelemetry.rateOfRiseMMin} <span className="text-[9px] font-normal">m/min</span></div>
              </div>

              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-center text-slate-400 mb-0.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-[10px] text-slate-400 uppercase">Spillway Flow</div>
                <div className="font-mono text-xs font-bold text-slate-100">{(damTelemetry.spillwayReleaseCusecs / 1000).toFixed(1)}k <span className="text-[9px] font-normal">cfs</span></div>
              </div>
            </div>

            {/* Real-Time 60-Point SVG Sparkline Trend Chart */}
            <div className="bg-slate-950/90 p-2.5 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1 font-mono">
                <span>RESERVOIR TREND (60s BUFFER)</span>
                <span className="text-sky-400 font-semibold">{damTelemetry.reservoirLevelM} m</span>
              </div>
              <div className="w-full h-11 flex items-center justify-center overflow-hidden">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="sparklineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {sparklinePoints && (
                    <>
                      <polygon
                        points={`0,${svgHeight} ${sparklinePoints} ${svgWidth},${svgHeight}`}
                        fill="url(#sparklineGrad)"
                      />
                      <polyline
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        points={sparklinePoints}
                        strokeLinecap="round"
                      />
                    </>
                  )}
                </svg>
              </div>
            </div>

            {/* Active Scenario Controls */}
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Active Scenario Controls</span>
                <span className="text-[#ff7700]">Simulation Engine</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  onClick={() => onTriggerScenario('START_STORM')}
                  className="px-2.5 py-1.5 rounded bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-200 transition font-semibold flex items-center justify-center gap-1"
                >
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  START STORM
                </button>

                <button
                  onClick={() => onTriggerScenario('SURGE_25')}
                  className="px-2.5 py-1.5 rounded bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-200 transition font-semibold"
                >
                  +25 cm SURGE
                </button>

                <button
                  onClick={() => onTriggerScenario('SURGE_50')}
                  className="px-2.5 py-1.5 rounded bg-orange-950 hover:bg-orange-900 border border-orange-800 text-orange-200 transition font-semibold"
                >
                  +50 cm SURGE
                </button>

                <button
                  onClick={() => onTriggerScenario('FULL_FLOOD')}
                  className="px-2.5 py-1.5 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 transition font-semibold flex items-center justify-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  FULL FLOOD EVENT
                </button>

                <button
                  onClick={() => onTriggerScenario('STOP')}
                  className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
                >
                  STOP
                </button>

                <button
                  onClick={() => onTriggerScenario('RESET')}
                  className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  RESET
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Sensor Floating Inspector */}
        {selectedSensor && (
          <div className="absolute bottom-6 left-4 z-20 w-80 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-800 shadow-2xl p-4 text-white">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">{selectedSensor.id}</span>
                <h3 className="font-bold text-sm text-white">{selectedSensor.name}</h3>
              </div>
              <button
                onClick={() => setSelectedSensor(null)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400">WATER DEPTH</span>
                <div className="font-mono text-base font-bold text-sky-400">{selectedSensor.waterLevelCm} cm</div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400">SURGE VELOCITY</span>
                <div className="font-mono text-base font-bold text-[#ff7700]">+{selectedSensor.rateOfRise} cm/min</div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400">ELEVATION</span>
                <div className="font-mono text-xs font-semibold">{selectedSensor.elevationM} m MSL</div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400">BATTERY</span>
                <div className="font-mono text-xs font-semibold text-emerald-400">{selectedSensor.batteryPercent}%</div>
              </div>
            </div>

            <div className="mt-2.5 text-[11px] text-slate-400 flex items-center justify-between font-mono">
              <span>LoRa RSSI: {selectedSensor.signalStrengthDbm} dBm</span>
              <span>Updated: {selectedSensor.lastReported}</span>
            </div>
          </div>
        )}

        {/* Selected Person Floating Inspection Card */}
        {selectedPersonForInspection && (
          <div className="absolute bottom-6 right-4 lg:right-96 z-20 w-84 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-800 shadow-2xl p-4 text-white space-y-2.5">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                    {selectedPersonForInspection.personId} • {selectedPersonForInspection.wearableId}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${
                      selectedPersonForInspection.rescuePriority === 'P0'
                        ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                        : selectedPersonForInspection.rescuePriority === 'P1'
                        ? 'bg-[#ff7700]/20 text-[#ff7700] border-[#ff7700]/50'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {selectedPersonForInspection.rescuePriority}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-white mt-0.5">{selectedPersonForInspection.name}</h3>
              </div>
              <button
                onClick={() => setSelectedPersonForInspection(null)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-snug">
              {selectedPersonForInspection.priorityReason}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">HEART RATE</span>
                <span className="font-bold text-white">
                  {selectedPersonForInspection.heartRateBpm !== null
                    ? `${selectedPersonForInspection.heartRateBpm} BPM`
                    : 'Unknown'}
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">BLOOD OXYGEN (SpO₂)</span>
                <span
                  className={`font-bold ${
                    selectedPersonForInspection.spo2Percent !== null &&
                    selectedPersonForInspection.spo2Percent < 90
                      ? 'text-red-400 font-extrabold'
                      : 'text-sky-400'
                  }`}
                >
                  {selectedPersonForInspection.spo2Percent !== null
                    ? `${selectedPersonForInspection.spo2Percent}%`
                    : 'Unknown'}
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">FLOOD DEPTH</span>
                <span className="font-bold text-sky-400">{selectedPersonForInspection.floodDepthCm} cm</span>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">DRIFT STATUS</span>
                <span
                  className={
                    selectedPersonForInspection.driftStatus === 'DRIFTING'
                      ? 'text-cyan-400 font-bold'
                      : 'text-slate-300'
                  }
                >
                  {selectedPersonForInspection.driftStatus}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
              <span>Accuracy: ±{selectedPersonForInspection.gpsAccuracyM}m</span>
              <span>Updated: {selectedPersonForInspection.locationTimestamp}</span>
            </div>

            {onNavigateToPersonMonitoring && (
              <button
                onClick={onNavigateToPersonMonitoring}
                className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider"
              >
                Open in Person Monitoring Panel →
              </button>
            )}
          </div>
        )}

        {/* Legend Overlay on Map */}
        <div className="hidden lg:block absolute bottom-6 right-4 z-10 bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-mono shadow-lg">
          <div className="font-bold text-white mb-1">ROAD RISK STATUS</div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Safe (&lt;15cm)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span> Caution (15-30cm)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ff7700]"></span> Warning (30-50cm)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Critical (&ge;50cm Impassable)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
