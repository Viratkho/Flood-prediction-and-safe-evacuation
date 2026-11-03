import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  Users,
  AlertTriangle,
  ShieldAlert,
  Compass,
  Sliders,
  Plus,
  Minus,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Activity,
  Clock,
  Eye,
  Crosshair,
} from 'lucide-react';
import { PopulationAnalysisResult } from '../types/family';

interface PopulationRadiusToolProps {
  map: L.Map | null;
  adminToken?: string;
  onClose?: () => void;
}

export const PopulationRadiusTool: React.FC<PopulationRadiusToolProps> = ({
  map,
  adminToken,
  onClose,
}) => {
  // Center coordinates (default: Avadi Basin Center)
  const [center, setCenter] = useState<[number, number]>([13.1143, 80.1015]);
  const [radiusM, setRadiusM] = useState<number>(2500);
  const [analysis, setAnalysis] = useState<PopulationAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showIndividuals, setShowIndividuals] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);

  // References to Leaflet layers
  const circleLayerRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const markersLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced API analysis fetch
  const fetchAnalysis = useCallback(
    async (lat: number, lng: number, rM: number) => {
      try {
        setIsLoading(true);
        setError(null);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-User-Role': 'ADMIN',
        };
        if (adminToken) {
          headers['Authorization'] = `Bearer ${adminToken}`;
        }

        const res = await fetch('/api/admin/population/analysis', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            centerLat: lat,
            centerLng: lng,
            radiusM: rM,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned HTTP ${res.status}`);
        }

        const data: PopulationAnalysisResult = await res.json();
        setAnalysis(data);
      } catch (err: any) {
        console.error('Population analysis error:', err);
        setError(err.message || 'Failed to analyze geographical radius.');
      } finally {
        setIsLoading(false);
      }
    },
    [adminToken]
  );

  // Initialize and update Map Circle & Center Marker
  useEffect(() => {
    if (!map) return;

    // Create LayerGroup for population individual markers
    if (!markersLayerGroupRef.current) {
      markersLayerGroupRef.current = L.layerGroup().addTo(map);
    }

    // Custom Draggable Center Icon
    const centerIcon = L.divIcon({
      className: 'custom-pop-center-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 rounded-full bg-indigo-500/30 animate-ping"></div>
          <div class="w-6 h-6 rounded-full bg-indigo-600 border-2 border-white shadow-xl flex items-center justify-center cursor-move text-white font-bold text-[10px]">
            📍
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    if (!centerMarkerRef.current) {
      const marker = L.marker(center, {
        icon: centerIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', (e) => {
        const newLatLng = e.target.getLatLng();
        setCenter([newLatLng.lat, newLatLng.lng]);
      });

      marker.bindPopup(`
        <div class="p-2 text-slate-900 font-sans text-xs">
          <div class="font-bold text-indigo-700 flex items-center gap-1">
            <span>👥 Analysis Center</span>
          </div>
          <div class="text-[10px] text-slate-600 mt-1">Drag this pin anywhere across the basin to analyze local density.</div>
        </div>
      `);

      centerMarkerRef.current = marker;
    } else {
      centerMarkerRef.current.setLatLng(center);
    }

    // Coverage Area Circle
    if (!circleLayerRef.current) {
      const circle = L.circle(center, {
        radius: radiusM,
        color: '#6366f1',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#818cf8',
        fillOpacity: showHeatmap ? 0.18 : 0.05,
      }).addTo(map);

      circleLayerRef.current = circle;
    } else {
      circleLayerRef.current.setLatLng(center);
      circleLayerRef.current.setRadius(radiusM);
      circleLayerRef.current.setStyle({
        fillOpacity: showHeatmap ? 0.18 : 0.05,
      });
    }

    // Map click handler to relocate analysis center
    const onMapClick = (e: L.LeafletMouseEvent) => {
      setCenter([e.latlng.lat, e.latlng.lng]);
    };
    map.on('click', onMapClick);

    // Initial query
    fetchAnalysis(center[0], center[1], radiusM);

    return () => {
      map.off('click', onMapClick);
    };
  }, [map, center, radiusM, showHeatmap, fetchAnalysis]);

  // Update Individuals Markers inside the Circle with Spiderfying
  useEffect(() => {
    if (!map || !markersLayerGroupRef.current) return;
    markersLayerGroupRef.current.clearLayers();

    if (!analysis || !analysis.individuals) return;

    // Detect overlapping coordinates and apply angular spiderfy offset
    const coordBuckets: { [key: string]: typeof analysis.individuals } = {};
    analysis.individuals.forEach((person) => {
      const key = `${person.lat.toFixed(4)},${person.lng.toFixed(4)}`;
      if (!coordBuckets[key]) coordBuckets[key] = [];
      coordBuckets[key].push(person);
    });

    Object.values(coordBuckets).forEach((group) => {
      const count = group.length;
      group.forEach((person, index) => {
        let displayLat = person.lat;
        let displayLng = person.lng;

        // Apply slight angular offset if clustered
        if (count > 1) {
          const angle = (2 * Math.PI * index) / count;
          const offsetM = 15; // 15 meters spiderfy radius
          const degOffsetLat = offsetM / 111320;
          const degOffsetLng = offsetM / (111320 * Math.cos((person.lat * Math.PI) / 180));
          displayLat += degOffsetLat * Math.sin(angle);
          displayLng += degOffsetLng * Math.cos(angle);
        }

        const isSos = person.sosActive;
        const isVulnerable = person.hasDisability;
        const isFlooded = person.isInHighRiskFlood;

        const iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer">
            ${isSos ? '<div class="absolute w-7 h-7 rounded-full bg-red-500/40 animate-ping"></div>' : ''}
            <div class="w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[9px] font-bold text-white ${
              isSos
                ? 'bg-red-600'
                : isVulnerable
                ? 'bg-purple-600'
                : isFlooded
                ? 'bg-amber-600'
                : 'bg-indigo-600'
            }">
              ${person.name.charAt(0)}
            </div>
          </div>
        `;

        const personIcon = L.divIcon({
          className: 'custom-pop-person-marker',
          html: iconHtml,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = L.marker([displayLat, displayLng], { icon: personIcon });

        marker.bindPopup(`
          <div class="p-2.5 text-slate-900 font-sans text-xs min-w-[200px]">
            <div class="flex items-center justify-between border-b pb-1">
              <span class="font-bold text-slate-800">${person.name}</span>
              <span class="font-mono text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600">${person.personId}</span>
            </div>
            <div class="text-[10px] text-slate-600 mt-1">Distance: <span class="font-bold text-slate-800">${person.distanceM}m</span> from center</div>
            ${person.disabilityType ? `<div class="text-[10px] text-purple-700 font-medium">♿ Needs: ${person.disabilityType}</div>` : ''}
            ${person.isInHighRiskFlood ? `<div class="text-[10px] text-red-600 font-semibold">🌊 Flood Exposure: ${person.floodDepthM}m</div>` : ''}
            ${person.sosActive ? `<div class="text-[10px] font-bold text-red-600 animate-pulse">🚨 ACTIVE SOS DISTRESS</div>` : ''}
            ${person.contactNumber ? `<div class="text-[9px] font-mono text-slate-500 mt-1">📞 ${person.contactNumber}</div>` : ''}
          </div>
        `);

        markersLayerGroupRef.current?.addLayer(marker);
      });
    });
  }, [analysis, map]);

  // Clean up layers when component unmounts
  useEffect(() => {
    return () => {
      if (circleLayerRef.current && map) {
        map.removeLayer(circleLayerRef.current);
      }
      if (centerMarkerRef.current && map) {
        map.removeLayer(centerMarkerRef.current);
      }
      if (markersLayerGroupRef.current && map) {
        map.removeLayer(markersLayerGroupRef.current);
      }
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
      }
    };
  }, [map]);

  // Continuous press-and-hold radius increase/decrease
  const startRadiusHold = (step: number) => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    holdTimerRef.current = setInterval(() => {
      setRadiusM((prev) => {
        const next = Math.min(15000, Math.max(100, prev + step));
        return next;
      });
    }, 60);
  };

  const stopRadiusHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleResetRadius = () => {
    setRadiusM(2500);
    setCenter([13.1143, 80.1015]);
    if (map) {
      map.flyTo([13.1143, 80.1015], 14, { duration: 1 });
    }
  };

  const radiusKm = (radiusM / 1000).toFixed(2);

  return (
    <div className="absolute top-16 right-4 z-20 w-80 sm:w-96 max-h-[85vh] flex flex-col bg-slate-900/95 backdrop-blur-md border border-indigo-500/40 rounded-2xl shadow-2xl text-white text-xs overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header Bar */}
      <div className="p-3 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 border-b border-indigo-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-white text-xs sm:text-sm tracking-wide">
                Population Radius Tool
              </h3>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/50">
                ADMIN
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Avadi Basin dynamic density & vulnerability audit
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close Population Tool"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-3 overflow-y-auto max-h-[calc(85vh-56px)]">
        {/* Dynamic Radius Controls */}
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              SEARCH RADIUS:
            </span>
            <span className="font-bold text-indigo-300">
              {radiusM.toLocaleString()} m ({radiusKm} km)
            </span>
          </div>

          {/* Precision Slider (100m to 15,000m) */}
          <input
            type="range"
            min={100}
            max={15000}
            step={50}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />

          {/* Press-and-Hold & Quick Preset Controls */}
          <div className="flex items-center justify-between gap-1.5 pt-1">
            <div className="flex items-center gap-1">
              <button
                onMouseDown={() => startRadiusHold(-100)}
                onMouseUp={stopRadiusHold}
                onMouseLeave={stopRadiusHold}
                onTouchStart={() => startRadiusHold(-100)}
                onTouchEnd={stopRadiusHold}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1 select-none"
                title="Press & hold to decrease radius"
              >
                <Minus className="w-3 h-3" />
                <span>100m</span>
              </button>
              <button
                onMouseDown={() => startRadiusHold(100)}
                onMouseUp={stopRadiusHold}
                onMouseLeave={stopRadiusHold}
                onTouchStart={() => startRadiusHold(100)}
                onTouchEnd={stopRadiusHold}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1 select-none"
                title="Press & hold to increase radius"
              >
                <Plus className="w-3 h-3" />
                <span>100m</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {[1000, 2500, 5000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setRadiusM(preset)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition ${
                    radiusM === preset
                      ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {preset >= 1000 ? `${preset / 1000}k` : `${preset}m`}
                </button>
              ))}

              <button
                onClick={handleResetRadius}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
                title="Reset to default center and radius"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Center Coordinate Info & Relocate Prompt */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-indigo-400" />
            <span>CENTER: {center[0].toFixed(4)}°, {center[1].toFixed(4)}°</span>
          </div>
          <span className="text-slate-500">Click map / Drag pin</span>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-indigo-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Scanning registered population in basin...</span>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && !isLoading && (
          <div className="space-y-2.5">
            {/* Tactical Rescue Priority Banner */}
            <div
              className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                analysis.rescuePriority.level === 'P0'
                  ? 'bg-red-950/70 border-red-600/60 text-red-100'
                  : analysis.rescuePriority.level === 'P1'
                  ? 'bg-amber-950/70 border-amber-600/60 text-amber-100'
                  : analysis.rescuePriority.level === 'P2'
                  ? 'bg-yellow-950/60 border-yellow-600/60 text-yellow-100'
                  : 'bg-emerald-950/60 border-emerald-600/60 text-emerald-100'
              }`}
            >
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider font-mono">
                    {analysis.rescuePriority.label}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 border border-white/20">
                    PRIORITY {analysis.rescuePriority.level}
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                  {analysis.rescuePriority.description}
                </p>
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">TOTAL POPULATION</div>
                <div className="text-lg font-bold text-white flex items-baseline gap-1 mt-0.5">
                  <span>{analysis.totalIndividuals}</span>
                  <span className="text-[10px] font-normal text-slate-400">citizens</span>
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Density: {analysis.densityPerSqKm.toFixed(1)} / km²
                </div>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-purple-400">WITH DISABILITIES</div>
                <div className="text-lg font-bold text-purple-300 mt-0.5">
                  {analysis.breakdown.withDeclaredDisabilities}
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Without: {analysis.breakdown.withoutDeclaredDisabilities}
                </div>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-red-400">ACTIVE SOS DISTRESS</div>
                <div className={`text-lg font-bold mt-0.5 ${analysis.breakdown.activeSosCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
                  {analysis.breakdown.activeSosCount}
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Immediate Rescue
                </div>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-amber-400">IN HIGH-RISK FLOOD</div>
                <div className="text-lg font-bold text-amber-300 mt-0.5">
                  {analysis.breakdown.highRiskFloodCount}
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Water &gt; 0.50m
                </div>
              </div>
            </div>

            {/* Sub-summary row */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <span>Stale GPS (&gt;5m): <strong className="text-slate-300">{analysis.breakdown.staleLocationCount}</strong></span>
              <span>Area: <strong className="text-slate-300">{analysis.areaSqKm.toFixed(2)} km²</strong></span>
            </div>

            {/* Individual Records Inspector Accordion */}
            <div className="pt-1">
              <button
                onClick={() => setShowIndividuals((prev) => !prev)}
                className="w-full py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center justify-between transition"
              >
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Inspect Individuals ({analysis.individuals.length})</span>
                </div>
                {showIndividuals ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {showIndividuals && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {analysis.individuals.length === 0 ? (
                    <div className="text-center py-3 text-slate-500 text-[11px]">
                      No registered individuals in this radius.
                    </div>
                  ) : (
                    analysis.individuals.map((person) => (
                      <div
                        key={person.personId}
                        onClick={() => {
                          if (map) {
                            map.flyTo([person.lat, person.lng], 17, { duration: 0.8 });
                          }
                        }}
                        className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{person.name}</span>
                          <span className="font-mono text-[9px] text-indigo-400">{person.distanceM}m</span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
                          <span>{person.addressLandmark || person.personId}</span>
                          {person.sosActive && (
                            <span className="text-red-400 font-bold">SOS ACTIVE</span>
                          )}
                          {person.hasDisability && (
                            <span className="text-purple-400">♿ {person.disabilityType || 'Needs Help'}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
