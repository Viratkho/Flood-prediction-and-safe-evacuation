import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Heart,
  Users,
} from 'lucide-react';
import { RegisteredPerson } from '../types/floodguard';
import { FamilyMemberLocation } from '../types/family';
import { FamilySafetyDrawer } from './FamilySafetyDrawer';
import { PopulationRadiusTool } from './PopulationRadiusTool';

interface MyLocationMapProps {
  currentUser: RegisteredPerson | null;
  isAdmin?: boolean;
  adminToken?: string;
  onUpdateLocation?: (lat: number, lng: number, placeName?: string) => void;
}

export const MyLocationMap: React.FC<MyLocationMapProps> = ({
  currentUser,
  isAdmin = false,
  adminToken,
  onUpdateLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const familyLayerGroupRef = useRef<L.LayerGroup | null>(null);

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

  // Module 1 & Module 2 UI States
  const [isFamilyDrawerOpen, setIsFamilyDrawerOpen] = useState<boolean>(false);
  const [isPopulationToolOpen, setIsPopulationToolOpen] = useState<boolean>(false);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberLocation[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);

  // Fetch Connected Family Members & Requests
  const fetchFamilyData = useCallback(async () => {
    if (!currentUser?.personId) return;
    try {
      const [membersRes, requestsRes] = await Promise.all([
        fetch('/api/family/members', {
          headers: { 'X-Citizen-Id': currentUser.personId },
        }),
        fetch('/api/family/requests', {
          headers: { 'X-Citizen-Id': currentUser.personId },
        }),
      ]);

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setFamilyMembers(membersData);
      }
      if (requestsRes.ok) {
        const reqData = await requestsRes.json();
        setPendingRequestsCount(reqData.incoming?.length || 0);
      }
    } catch (e) {
      console.warn('Failed to load family members for map:', e);
    }
  }, [currentUser]);

  // Initial fetch and 15s poll for family coordinates
  useEffect(() => {
    fetchFamilyData();
    const interval = setInterval(fetchFamilyData, 15000);
    return () => clearInterval(interval);
  }, [fetchFamilyData]);

  // Initialize isolated Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: coords,
      zoom: 15,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Free OpenStreetMap tiles
    const tileUrl =
      mapStyle === 'streets'
        ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        : 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    // LayerGroup for family members
    familyLayerGroupRef.current = L.layerGroup().addTo(map);

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
          <span>📍 My Verified Location (ME)</span>
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

  // Render Connected Family Members on the SAME MAP instance with Spiderfying
  useEffect(() => {
    if (!mapInstanceRef.current || !familyLayerGroupRef.current) return;
    familyLayerGroupRef.current.clearLayers();

    // Collect all coordinates to detect overlaps with "ME" or other members
    const allPoints: Array<{ id: string; lat: number; lng: number; isFamily: boolean; data?: FamilyMemberLocation }> = [
      { id: 'ME', lat: coords[0], lng: coords[1], isFamily: false },
    ];

    familyMembers.forEach((member) => {
      if (member.lat && member.lng) {
        allPoints.push({
          id: member.personId,
          lat: member.lat,
          lng: member.lng,
          isFamily: true,
          data: member,
        });
      }
    });

    // Detect clustering around identical coordinates (threshold: ~10 meters)
    const clusterBuckets: { [key: string]: typeof allPoints } = {};
    allPoints.forEach((pt) => {
      const bucketKey = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
      if (!clusterBuckets[bucketKey]) clusterBuckets[bucketKey] = [];
      clusterBuckets[bucketKey].push(pt);
    });

    // Render family member markers with angular offset if overlapping
    Object.values(clusterBuckets).forEach((group) => {
      const count = group.length;
      group.forEach((pt, index) => {
        if (!pt.isFamily || !pt.data) return;
        const member = pt.data;

        let displayLat = pt.lat;
        let displayLng = pt.lng;

        // Apply slight angular spiderfying offset if overlapping
        if (count > 1) {
          const angle = (2 * Math.PI * index) / count;
          const offsetM = 20; // 20m spiderfy offset
          const degOffsetLat = offsetM / 111320;
          const degOffsetLng = offsetM / (111320 * Math.cos((pt.lat * Math.PI) / 180));
          displayLat += degOffsetLat * Math.sin(angle);
          displayLng += degOffsetLng * Math.cos(angle);
        }

        const isSos = member.sosActive;
        const isFlooded = member.isInHighRiskFlood;
        const isStale = member.isStale;

        // Distinct Emerald / Teal Marker Icon with Initial and Status Halo
        const familyIcon = L.divIcon({
          className: 'custom-family-marker',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer">
              ${isSos ? '<div class="absolute w-10 h-10 rounded-full bg-red-500/50 animate-ping"></div>' : ''}
              ${isFlooded ? '<div class="absolute w-8 h-8 rounded-full bg-amber-500/30 animate-pulse"></div>' : ''}
              <div class="w-7 h-7 rounded-full border-2 ${
                isSos
                  ? 'bg-red-600 border-white shadow-red-500/50 animate-bounce'
                  : isFlooded
                  ? 'bg-amber-600 border-amber-300'
                  : 'bg-emerald-600 border-white shadow-emerald-500/40'
              } shadow-lg flex items-center justify-center text-white font-bold text-[11px]">
                ${member.name.charAt(0)}
              </div>
              <div class="absolute -bottom-2 px-1 py-0.2 rounded bg-slate-950/90 text-[8px] font-mono text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
                ${member.relationship}
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const famMarker = L.marker([displayLat, displayLng], { icon: familyIcon });

        famMarker.bindPopup(`
          <div class="p-2.5 text-slate-900 font-sans text-xs min-w-[210px]">
            <div class="flex items-center justify-between border-b pb-1">
              <div>
                <span class="font-bold text-emerald-800 text-sm">${member.name}</span>
                <span class="text-[9px] font-mono ml-1 px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">${member.relationship}</span>
              </div>
              <span class="font-mono text-[9px] text-slate-500">${member.personId}</span>
            </div>

            <div class="mt-1.5 space-y-1 text-[10px]">
              <div class="flex items-center justify-between">
                <span class="text-slate-500">Location Status:</span>
                <span class="font-bold font-mono ${isStale ? 'text-amber-700' : 'text-emerald-700'}">
                  ${isStale ? '⚠️ LAST KNOWN LOCATION' : '🟢 LIVE GPS'}
                </span>
              </div>

              ${isFlooded ? `
                <div class="p-1 rounded bg-amber-50 text-amber-900 font-semibold border border-amber-200">
                  🌊 In High-Risk Flood Zone (${member.floodDepthM}m water depth)
                </div>
              ` : ''}

              ${isSos ? `
                <div class="p-1 rounded bg-red-50 text-red-700 font-bold border border-red-200 animate-pulse">
                  🚨 EMERGENCY SOS ACTIVE
                </div>
              ` : ''}

              <div class="text-slate-600">
                <span class="text-slate-400">Area:</span> ${member.locationName || 'Avadi / Ambattur Basin'}
              </div>

              <div class="text-[9px] font-mono text-slate-400">
                ${displayLat.toFixed(5)}°, ${displayLng.toFixed(5)}°
              </div>

              ${member.lastUpdated ? `
                <div class="text-[9px] text-slate-400">
                  Last seen: ${member.lastUpdated}
                </div>
              ` : ''}
            </div>
          </div>
        `);

        familyLayerGroupRef.current?.addLayer(famMarker);
      });
    });
  }, [familyMembers, coords]);

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

        // Sync with SQLite backend endpoint
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

  const handleFocusMember = (lat: number, lng: number) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], 17, { duration: 1.2 });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white overflow-hidden relative">
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
                Live Spatial View
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Personalized GPS verification • Family location sharing • OpenStreetMap GIS
            </p>
          </div>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex items-center flex-wrap gap-2">
          {/* MODULE 2: FAMILY SAFETY BUTTON */}
          <button
            onClick={() => setIsFamilyDrawerOpen((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow ${
              isFamilyDrawerOpen
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300'
            }`}
            title="Open Family Safety & Location Sharing drawer"
          >
            <Heart className="w-3.5 h-3.5 text-emerald-400" />
            <span>Family Safety</span>
            {familyMembers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 text-[10px] font-mono">
                {familyMembers.length}
              </span>
            )}
            {pendingRequestsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          {/* MODULE 1: ADMINISTRATOR-ONLY POPULATION RADIUS TOOL */}
          {isAdmin && (
            <button
              onClick={() => setIsPopulationToolOpen((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow ${
                isPopulationToolOpen
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300'
              }`}
              title="Administrator Dynamic Population Mapping Tool"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Population Radius Tool</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-500/30 text-indigo-200">
                ADMIN
              </span>
            </button>
          )}

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
            Strict Privacy Protected: Only your verified personal coordinates and authorized family members are rendered on this map.
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
              <div className="text-[10px] text-slate-400">FAMILY SHARING</div>
              <div className="font-bold text-emerald-300">
                {familyMembers.length} Connected
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400">Location Area:</span>
            <span className="font-semibold text-white truncate max-w-[190px]">{locationName}</span>
          </div>
        </div>

        {/* OVERLAY 1: Family Safety Drawer */}
        <FamilySafetyDrawer
          currentUser={currentUser}
          isOpen={isFamilyDrawerOpen}
          onClose={() => setIsFamilyDrawerOpen(false)}
          onFocusMember={handleFocusMember}
          onRefreshData={fetchFamilyData}
          familyMembers={familyMembers}
          onMembersChange={fetchFamilyData}
        />

        {/* OVERLAY 2: Administrator-Only Population Radius Tool */}
        {isAdmin && isPopulationToolOpen && (
          <PopulationRadiusTool
            map={mapInstanceRef.current}
            adminToken={adminToken}
            onClose={() => setIsPopulationToolOpen(false)}
          />
        )}
      </div>
    </div>
  );
};
