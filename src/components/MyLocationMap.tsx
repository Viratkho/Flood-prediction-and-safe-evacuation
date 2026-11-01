import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  RefreshCw,
  AlertTriangle,
  Clock,
  Shield,
  Layers,
  Compass,
  CheckCircle2,
  Lock,
  WifiOff,
  Crosshair,
} from 'lucide-react';
import { RegisteredPerson } from '../types/floodguard';

interface MyLocationMapProps {
  currentUser: RegisteredPerson | null;
  onUpdateLocation?: (lat: number, lng: number, placeName?: string) => void;
}

export const MyLocationMap: React.FC<MyLocationMapProps> = ({
  currentUser,
  onUpdateLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Default coordinate: Avadi Basin fallback or citizen's registered coordinates
  const initialLat = currentUser?.lat ?? 13.1143;
  const initialLng = currentUser?.lng ?? 80.1015;

  const [coords, setCoords] = useState<[number, number]>([initialLat, initialLng]);
  const [accuracy, setAccuracy] = useState<number | null>(currentUser?.gpsAccuracyM ?? 8);
  const [locationName, setLocationName] = useState<string>(
    currentUser?.locationName || currentUser?.addressLandmark || 'Avadi / Ambattur Hydrological Basin'
  );
  const [lastUpdated, setLastUpdated] = useState<string>(
    currentUser?.locationTimestamp || 'Recently synchronized'
  );
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<'IDLE' | 'LOCATING' | 'SUCCESS' | 'DENIED' | 'UNAVAILABLE'>('IDLE');
  const [mapStyle, setMapStyle] = useState<'streets' | 'topo'>('streets');
  const [isSyncingWithBackend, setIsSyncingWithBackend] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Initialize isolated Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: coords,
      zoom: 15,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Completely free OpenStreetMap tiles
    const tileUrl =
      mapStyle === 'streets'
        ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        : 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    // Create distinctive personal location icon (Pulsing Cyan/Orange Beacon)
    const personalIcon = L.divIcon({
      className: 'custom-personal-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-9 h-9 rounded-full bg-cyan-400/30 animate-ping"></div>
          <div class="absolute w-6 h-6 rounded-full bg-[#ff7700]/40 animate-pulse"></div>
          <div class="w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg flex items-center justify-center">
            <div class="w-1.5 h-1.5 rounded-full bg-slate-950"></div>
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker(coords, { icon: personalIcon }).addTo(map);
    marker.bindPopup(`
      <div class="p-2 text-slate-900 font-sans">
        <div class="font-bold text-xs flex items-center gap-1 text-[#ff7700]">
          <span>📍 My Verified Location</span>
        </div>
        <div class="text-[11px] font-semibold text-slate-800 mt-1">${currentUser?.name || 'Citizen'}</div>
        <div class="text-[10px] text-slate-600">${locationName}</div>
        <div class="text-[9px] font-mono text-slate-500 mt-1">Lat: ${coords[0].toFixed(5)}, Lng: ${coords[1].toFixed(5)}</div>
      </div>
    `);
    markerRef.current = marker;

    if (accuracy) {
      const circle = L.circle(coords, {
        radius: accuracy,
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(map);
      circleRef.current = circle;
    }

    // Auto-request live browser GPS on initial view if supported
    requestLiveLocation();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer when style changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapInstanceRef.current?.removeLayer(layer);
      }
    });

    const tileUrl =
      mapStyle === 'streets'
        ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        : 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapInstanceRef.current);
  }, [mapStyle]);

  // Request browser GPS position
  const requestLiveLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('UNAVAILABLE');
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoStatus('LOCATING');
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newAcc = Math.round(pos.coords.accuracy);
        const timestamp = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        setCoords([newLat, newLng]);
        setAccuracy(newAcc);
        setLastUpdated(timestamp);
        setGeoStatus('SUCCESS');
        setIsLocating(false);

        // Update map position
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([newLat, newLng], 16, { duration: 1.2 });
        }
        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
        }
        if (circleRef.current) {
          circleRef.current.setLatLng([newLat, newLng]);
          circleRef.current.setRadius(newAcc);
        }

        // Notify parent if handler passed
        if (onUpdateLocation) {
          onUpdateLocation(newLat, newLng, locationName);
        }

        // Sync with SQLite backend endpoint (Strictly for this citizen only)
        if (currentUser?.personId) {
          syncLocationToBackend(currentUser.personId, newLat, newLng, newAcc);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus('DENIED');
          setGeoError(
            'Location access was denied. You can enable GPS in browser permissions or rely on your registered location.'
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoStatus('UNAVAILABLE');
          setGeoError('GPS signal is currently unavailable. Showing last pinned position.');
        } else {
          setGeoStatus('UNAVAILABLE');
          setGeoError(`Location timeout (${err.message}). Showing last verified location.`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  // Sync own location to SQLite database
  const syncLocationToBackend = async (
    personId: string,
    lat: number,
    lng: number,
    accM: number
  ) => {
    try {
      setIsSyncingWithBackend(true);
      const res = await fetch('/api/citizen/my-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Citizen-Id': personId,
        },
        body: JSON.stringify({
          personId,
          lat,
          lng,
          gpsAccuracyM: accM,
          locationName,
        }),
      });

      if (res.ok) {
        setSyncMessage('Location persisted to SQLite');
        setTimeout(() => setSyncMessage(null), 3500);
      }
    } catch (e) {
      console.warn('Could not sync location to backend:', e);
    } finally {
      setIsSyncingWithBackend(false);
    }
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(coords, 16, { duration: 1 });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* Top Header & Privacy Assurance Bar */}
      <div className="p-3 sm:p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                My Location Map
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/70 text-cyan-300 border border-cyan-500/30">
                Private Citizen View
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Personalized single-user GPS verification • Isolated from rescue dispatch
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Layer Toggle */}
          <button
            onClick={() => setMapStyle((prev) => (prev === 'streets' ? 'topo' : 'streets'))}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
            title="Toggle OpenStreetMap Street / Topographic layer"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline capitalize">{mapStyle}</span>
          </button>

          {/* Recenter Button */}
          <button
            onClick={handleRecenter}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
            title="Center map on my location"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#ff7700]" />
            <span className="hidden sm:inline">Recenter</span>
          </button>

          {/* Refresh Location Button */}
          <button
            onClick={requestLiveLocation}
            disabled={isLocating}
            className="px-3 py-1.5 rounded-lg bg-[#ff7700] hover:bg-[#e66c00] text-slate-950 text-xs font-bold uppercase tracking-wider shadow flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Acquiring GPS...' : 'Refresh Location'}</span>
          </button>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            Strict Privacy Protected: Only your verified personal coordinates are displayed. Command Center multi-victim records are neither fetched nor exposed.
          </span>
        </div>
        {syncMessage && (
          <span className="text-emerald-400 flex items-center gap-1 shrink-0 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {syncMessage}
          </span>
        )}
      </div>

      {/* Geolocation Permission or Sensor Warnings */}
      {geoError && (
        <div className="px-4 py-2 bg-amber-950/70 border-b border-amber-800 text-amber-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{geoError}</span>
          </div>
          <button
            onClick={requestLiveLocation}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[10px] shrink-0 transition"
          >
            Retry GPS
          </button>
        </div>
      )}

      {/* Map & Live Floating Telemetry HUD */}
      <div className="relative flex-1 w-full h-full min-h-[350px]">
        {/* Leaflet DOM container */}
        <div ref={mapContainerRef} className="absolute inset-0 z-0 w-full h-full bg-slate-950" />

        {/* Floating Citizen Status HUD Card (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-10 max-w-sm w-full bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-xs space-y-3">
          <div className="flex items-start justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs font-mono">
                ME
              </div>
              <div>
                <div className="font-bold text-white text-xs">{currentUser?.name || 'Registered Citizen'}</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  ID: {currentUser?.personId || 'Local Citizen Session'}
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                geoStatus === 'SUCCESS'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : geoStatus === 'DENIED'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {geoStatus === 'SUCCESS' ? 'GPS LOCKED' : geoStatus === 'DENIED' ? 'PERMISSION DENIED' : 'SAVED PROFILE'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">LATITUDE</div>
              <div className="font-bold text-cyan-300">{coords[0].toFixed(5)}° N</div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">LONGITUDE</div>
              <div className="font-bold text-cyan-300">{coords[1].toFixed(5)}° E</div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">GPS ACCURACY</div>
              <div className="font-bold text-white">±{accuracy ? `${accuracy}m` : '8m (Est)'}</div>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">LAST SYNC</div>
              <div className="font-bold text-amber-300 truncate">{lastUpdated}</div>
            </div>
          </div>

          <div className="text-[11px] text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400">Location Area:</span>
            <span className="font-semibold text-white truncate max-w-[190px]">{locationName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
