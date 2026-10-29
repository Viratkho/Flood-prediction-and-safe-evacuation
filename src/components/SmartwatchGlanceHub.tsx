import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import {
  SharedLocationState,
  DamTelemetry,
  RegisteredPerson,
  ReliefCentre,
  RoadNode,
  RoadSegment,
} from '../types/floodguard';
import { INITIAL_ROAD_NODES, INITIAL_ROAD_SEGMENTS } from '../data/osmData';
import { computeSafestRoute } from '../services/routingEngine';
import {
  Shield,
  MapPin,
  Bot,
  Download,
  CloudSun,
  Waves,
  AlertTriangle,
  Maximize2,
  Camera,
} from 'lucide-react';

export interface SmartwatchGlanceHubProps {
  damTelemetry: DamTelemetry;
  people: RegisteredPerson[];
  reliefCentres: ReliefCentre[];
  nodes?: RoadNode[];
  segments?: RoadSegment[];
  userLocation: [number, number];
  sharedLocation?: SharedLocationState;
  registeredPerson?: RegisteredPerson | null;
  onNavigateToAssistantAi: () => void;
  onNavigateToOfflineMap: () => void;
  onNavigateToWeather: () => void;
  onNavigateToWaterStagnation: () => void;
  onNavigateToSos: () => void;
  onSwitchToFullView: () => void;
  onScanQr?: () => void;
  // Optional legacy props for backwards compatibility
  onOpenEvacuation?: () => void;
  onOpenWeatherNews?: () => void;
  onOpenPersonMonitoring?: () => void;
  onOpenCommandCenter?: () => void;
}

export const SmartwatchGlanceHub: React.FC<SmartwatchGlanceHubProps> = ({
  reliefCentres,
  nodes,
  segments,
  userLocation,
  sharedLocation,
  registeredPerson,
  onNavigateToAssistantAi,
  onNavigateToOfflineMap,
  onNavigateToWeather,
  onNavigateToWaterStagnation,
  onNavigateToSos,
  onSwitchToFullView,
  onScanQr,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // Derive origin coordinates: Prioritize explicitly registered person, then sharedLocation, then userLocation
  const originLat = registeredPerson?.lat ?? sharedLocation?.latitude ?? userLocation[0] ?? 13.1143;
  const originLng = registeredPerson?.lng ?? sharedLocation?.longitude ?? userLocation[1] ?? 80.1015;
  const originName = registeredPerson?.name
    ? `${registeredPerson.name}'s Location`
    : (sharedLocation?.placeName || 'Registered Location');

  // Nearest safe haven shelter
  const safeShelter = reliefCentres[0] || {
    id: 'RC-1',
    name: 'Thirumullaivoyal Haven',
    lat: 13.1250,
    lng: 80.1150,
    elevationM: 24.8,
    totalCapacity: 300,
    occupiedCapacity: 160,
  };

  const roadNodes = nodes || INITIAL_ROAD_NODES;
  const roadSegments = segments || INITIAL_ROAD_SEGMENTS;

  // Compute verified safest evacuation route using existing A* algorithm
  const evacRoute = useMemo(() => {
    try {
      return computeSafestRoute(
        [originLat, originLng],
        safeShelter,
        roadNodes,
        roadSegments
      );
    } catch (e) {
      console.warn('Evacuation route calculation fallback:', e);
      return null;
    }
  }, [originLat, originLng, safeShelter, roadSegments, roadNodes]);

  // Initialize and update Leaflet evacuation map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [originLat, originLng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      routeLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    if (!map || !routeLayerRef.current) return;

    // Clear previous markers & route lines
    routeLayerRef.current.clearLayers();

    // 1. Origin / Registered Person Pin
    const originIcon = L.divIcon({
      className: 'watch-origin-pin',
      html: `
        <div class="flex flex-col items-center">
          <div class="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold border border-white shadow whitespace-nowrap">
            📍 You
          </div>
          <div class="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-md animate-pulse"></div>
        </div>
      `,
      iconSize: [40, 36],
      iconAnchor: [20, 36],
    });

    const userMarker = L.marker([originLat, originLng], { icon: originIcon })
      .bindPopup(`<b>${originName}</b><br/>Lat: ${originLat.toFixed(4)}, Lng: ${originLng.toFixed(4)}`);
    routeLayerRef.current.addLayer(userMarker);

    // 2. Safe Haven Destination Shelter Pin
    const shelterIcon = L.divIcon({
      className: 'watch-shelter-pin',
      html: `
        <div class="flex flex-col items-center">
          <div class="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold border border-white shadow whitespace-nowrap">
            🏥 Haven (${safeShelter.elevationM}m)
          </div>
          <div class="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-md"></div>
        </div>
      `,
      iconSize: [60, 36],
      iconAnchor: [30, 36],
    });

    const shelterMarker = L.marker([safeShelter.lat, safeShelter.lng], { icon: shelterIcon })
      .bindPopup(`<b>${safeShelter.name}</b><br/>Elevation: ${safeShelter.elevationM}m MSL`);
    routeLayerRef.current.addLayer(shelterMarker);

    // 3. Render evacuation path polyline
    if (evacRoute && evacRoute.pathCoordinates && evacRoute.pathCoordinates.length > 0) {
      const poly = L.polyline(evacRoute.pathCoordinates, {
        color: evacRoute.hasCriticalSegments ? '#ef4444' : '#10b981',
        weight: 4,
        opacity: 0.9,
      });
      routeLayerRef.current.addLayer(poly);

      map.fitBounds(
        L.latLngBounds([
          [originLat, originLng],
          [safeShelter.lat, safeShelter.lng],
        ]),
        { padding: [24, 24], maxZoom: 15 }
      );
    } else {
      map.setView([originLat, originLng], 14);
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [originLat, originLng, safeShelter.lat, safeShelter.lng, originName, safeShelter.name, safeShelter.elevationM, evacRoute]);

  // Cleanup map instance on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        routeLayerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full h-full min-h-full bg-slate-950 text-slate-100 flex flex-col p-2.5 overflow-y-auto selection:bg-[#ff7700] selection:text-white font-sans text-xs">
      {/* 1. Compact FloodGuard Title & Essential Status */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 mb-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-[#ff7700] flex items-center justify-center text-white shrink-0 shadow">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-xs text-white leading-tight flex items-center gap-1 truncate">
              <span>FLOODGUARD</span>
              <span className="text-[#ff7700]">WATCH</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onScanQr && (
            <button
              onClick={onScanQr}
              className="px-2 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-600/50 text-[10px] font-bold flex items-center gap-1 shrink-0 transition cursor-pointer"
              title="Scan QR to Log In on Another Device"
            >
              <Camera className="w-3 h-3 text-sky-400" />
              <span>Scan QR</span>
            </button>
          )}

          <button
            onClick={onSwitchToFullView}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 shrink-0 transition"
          title="Switch to full dashboard layout"
        >
          <Maximize2 className="w-3 h-3" />
          <span>Full UI</span>
        </button>
        </div>
      </div>

      {/* 2. Evacuation Map (Occupies Main Visual Area) */}
      <div className="w-full h-[180px] xs:h-[220px] sm:h-[260px] rounded-xl overflow-hidden border border-slate-800 relative shrink-0 shadow-md">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* 3. Selected or Registered Location Pill */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 my-2 text-[11px] font-mono shrink-0">
        <div className="flex items-center gap-1.5 truncate text-slate-200">
          <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate font-semibold">{originName}</span>
        </div>
        <span className="text-[10px] text-cyan-400 shrink-0 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
          {originLat.toFixed(2)}°, {originLng.toFixed(2)}°
        </span>
      </div>

      {/* 4. Compact Navigation Buttons Below the Map */}
      <div className="grid grid-cols-2 gap-1.5 pt-0.5 pb-2">
        {/* Button 1: Assistant AI */}
        <button
          onClick={onNavigateToAssistantAi}
          className="min-h-[44px] py-2 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-750 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm text-center"
        >
          <Bot className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="truncate">Assistant AI</span>
        </button>

        {/* Button 2: Offline Map Download */}
        <button
          onClick={onNavigateToOfflineMap}
          className="min-h-[44px] py-2 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-750 border border-slate-800 hover:border-teal-500/50 text-teal-300 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm text-center"
        >
          <Download className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="truncate">Offline Map</span>
        </button>

        {/* Button 3: Precipitation and Weather */}
        <button
          onClick={onNavigateToWeather}
          className="min-h-[44px] py-2 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-750 border border-slate-800 hover:border-sky-500/50 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm text-center"
        >
          <CloudSun className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="truncate">Weather & Precipitation</span>
        </button>

        {/* Button 4: Water Stagnation Report */}
        <button
          onClick={onNavigateToWaterStagnation}
          className="min-h-[44px] py-2 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-750 border border-slate-800 hover:border-amber-500/50 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm text-center"
        >
          <Waves className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate">Water Stagnation</span>
        </button>

        {/* Button 5: SOS Signal (Visually prominent, spans full row) */}
        <button
          onClick={onNavigateToSos}
          className="col-span-2 min-h-[46px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 active:scale-[0.99] text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-950/60 border border-red-500/60 transition"
        >
          <AlertTriangle className="w-4 h-4 text-white animate-pulse shrink-0" />
          <span>SOS</span>
        </button>
      </div>
    </div>
  );
};
