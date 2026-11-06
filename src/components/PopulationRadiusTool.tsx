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
  Radio,
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
  // Initial radius MUST be exactly 1,000 metres (1.0 km)
  const [radiusM, setRadiusM] = useState<number>(1000);
  const [analysis, setAnalysis] = useState<PopulationAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showIndividuals, setShowIndividuals] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);

  // 5-Second Interval Expansion Hold State
  const [isHoldingExpand, setIsHoldingExpand] = useState<boolean>(false);
  const [holdProgress, setHoldProgress] = useState<number>(0); // 0.0 to 1.0 (towards next 5s)
  const [holdSeconds, setHoldSeconds] = useState<string>('0.0'); // 0.0 to 5.0
  const [earnedStepsInSession, setEarnedStepsInSession] = useState<number>(0);

  // References to keep callbacks and RAF loop current without recreation
  const centerRef = useRef<[number, number]>(center);
  const radiusMRef = useRef<number>(radiusM);
  const analysisRef = useRef<PopulationAnalysisResult | null>(null);
  const circleLayerRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const markersLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Radar Canvas References
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarStaticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarRafIdRef = useRef<number | null>(null);

  // Hold Timer Reference
  const holdStartTimeRef = useRef<number>(0);
  const holdRafIdRef = useRef<number | null>(null);
  const completedStepsRef = useRef<number>(0);

  // Keep refs synchronized
  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    radiusMRef.current = radiusM;
  }, [radiusM]);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

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

  // -------------------------------------------------------------
  // RADAR CANVAS ATTACHED OVERLAY (FROM radar.html)
  // -------------------------------------------------------------
  const repositionRadar = useCallback(() => {
    if (!map || !radarCanvasRef.current) return;
    const canvas = radarCanvasRef.current;
    const curCenter = centerRef.current;
    const curRadiusM = radiusMRef.current;

    const centerPt = map.latLngToLayerPoint(curCenter);
    // 1 deg latitude ≈ 111,320m
    const northPt = map.latLngToLayerPoint([curCenter[0] + curRadiusM / 111320, curCenter[1]]);
    const radiusPx = Math.max(15, Math.abs(centerPt.y - northPt.y));

    // In radar.html: R = S/2 - 34*u where u = S/700 => R = S * (0.5 - 34/700) = S * 0.45142857
    // So S_css = radiusPx / 0.45142857
    const S_css = Math.round(radiusPx / 0.45142857);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const S = Math.round(S_css * dpr);

    canvas.style.position = 'absolute';
    canvas.style.width = `${S_css}px`;
    canvas.style.height = `${S_css}px`;
    canvas.style.left = `${Math.round(centerPt.x - S_css / 2)}px`;
    canvas.style.top = `${Math.round(centerPt.y - S_css / 2)}px`;

    // Only rebuild static buffer if dimensions changed
    if (canvas.width !== S || canvas.height !== S) {
      canvas.width = S;
      canvas.height = S;

      let stat = radarStaticCanvasRef.current;
      if (!stat) {
        stat = document.createElement('canvas');
        radarStaticCanvasRef.current = stat;
      }
      stat.width = S;
      stat.height = S;

      const g = stat.getContext('2d');
      if (g) {
        const cx = S / 2;
        const cy = S / 2;
        const u = S / 700;
        const R = S / 2 - 34 * u;
        const TAU = Math.PI * 2;
        const CYAN = '34,230,255';
        const GREEN = '57,255,136';

        g.clearRect(0, 0, S, S);

        // Face (subtle tactical dark tint for overlay mode)
        const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        bg.addColorStop(0, '#07202b');
        bg.addColorStop(0.7, '#041019');
        bg.addColorStop(1, '#020a12');
        g.globalAlpha = 0.12;
        g.fillStyle = bg;
        g.beginPath();
        g.arc(cx, cy, R, 0, TAU);
        g.fill();
        g.globalAlpha = 1;

        // Grid lines
        g.lineWidth = Math.max(1, u);
        g.strokeStyle = 'rgba(' + CYAN + ',.08)';
        for (let k = -5; k <= 5; k++) {
          if (!k) continue;
          const o = (R * k) / 5;
          const h = Math.sqrt(Math.max(0, R * R - o * o));
          g.beginPath();
          g.moveTo(cx + o, cy - h);
          g.lineTo(cx + o, cy + h);
          g.moveTo(cx - h, cy + o);
          g.lineTo(cx + h, cy + o);
          g.stroke();
        }

        // 10 concentric rings
        for (let i = 1; i <= 10; i++) {
          g.beginPath();
          g.arc(cx, cy, (R * i) / 10, 0, TAU);
          g.strokeStyle = i % 2 ? 'rgba(' + CYAN + ',.12)' : 'rgba(' + CYAN + ',.34)';
          g.setLineDash(i % 2 ? [3 * u, 5 * u] : []);
          g.stroke();
        }
        g.setLineDash([]);

        // Crosshairs + diagonals
        g.strokeStyle = 'rgba(' + CYAN + ',.38)';
        g.beginPath();
        g.moveTo(cx - R, cy);
        g.lineTo(cx + R, cy);
        g.moveTo(cx, cy - R);
        g.lineTo(cx, cy + R);
        g.stroke();

        g.strokeStyle = 'rgba(' + CYAN + ',.14)';
        for (let d = 1; d < 8; d += 2) {
          const a = (d * Math.PI) / 4;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
          g.stroke();
        }

        // Range labels
        g.fillStyle = 'rgba(' + CYAN + ',.6)';
        g.font = Math.round(10 * u + 2) + 'px "Share Tech Mono",ui-monospace,monospace';
        g.textAlign = 'left';
        g.textBaseline = 'bottom';
        for (let i = 2; i <= 10; i += 2) {
          const distKm = ((curRadiusM / 1000) * (i / 10)).toFixed(1);
          g.fillText(distKm + 'k', cx + 4 * u, cy - (R * i) / 10 - 2 * u);
        }

        // Outer Bezel
        g.strokeStyle = 'rgba(' + CYAN + ',.9)';
        g.lineWidth = 2 * u;
        g.shadowColor = 'rgba(' + CYAN + ',.8)';
        g.shadowBlur = 10 * u;
        g.beginPath();
        g.arc(cx, cy, R, 0, TAU);
        g.stroke();
        g.shadowBlur = 0;

        g.lineWidth = Math.max(1, u);
        g.strokeStyle = 'rgba(' + CYAN + ',.4)';
        g.beginPath();
        g.arc(cx, cy, R + 18 * u, 0, TAU);
        g.stroke();

        // Ticks
        for (let deg = 0; deg < 360; deg += 2) {
          const a = (deg * Math.PI) / 180 - Math.PI / 2;
          const len = deg % 10 === 0 ? 14 * u : deg % 5 === 0 ? 9 * u : 5 * u;
          g.strokeStyle = 'rgba(' + CYAN + ',' + (deg % 10 === 0 ? 0.85 : 0.45) + ')';
          g.beginPath();
          g.moveTo(cx + (R + 1) * Math.cos(a), cy + (R + 1) * Math.sin(a));
          g.lineTo(cx + (R + 1 + len) * Math.cos(a), cy + (R + 1 + len) * Math.sin(a));
          g.stroke();
        }

        // Bearing labels
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let deg = 0; deg < 360; deg += 30) {
          const a = (deg * Math.PI) / 180 - Math.PI / 2;
          const rr = R + 28 * u;
          const t = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[deg] || '' + deg;
          g.fillStyle = t.length === 1 && isNaN(+t) ? 'rgb(' + GREEN + ')' : 'rgba(' + CYAN + ',.8)';
          g.font = (t.length === 1 ? 13 * u + 2 : 9.5 * u + 2) + 'px "Share Tech Mono",ui-monospace,monospace';
          g.fillText(t, cx + rr * Math.cos(a), cy + rr * Math.sin(a));
        }

        // Center hub
        g.fillStyle = 'rgba(' + GREEN + ',.9)';
        g.beginPath();
        g.arc(cx, cy, 2.5 * u, 0, TAU);
        g.fill();
      }
    }
  }, [map]);

  // Setup Radar Canvas Element in Leaflet's overlayPane
  useEffect(() => {
    if (!map) return;
    const overlayPane = map.getPanes().overlayPane;
    if (!overlayPane) return;

    let canvas = radarCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'floodguard-radar-canvas-overlay';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '350';
      overlayPane.appendChild(canvas);
      radarCanvasRef.current = canvas;
    }

    repositionRadar();

    const onMapChange = () => {
      repositionRadar();
    };

    map.on('move zoom viewreset resize', onMapChange);

    return () => {
      map.off('move zoom viewreset resize', onMapChange);
      if (radarCanvasRef.current && overlayPane.contains(radarCanvasRef.current)) {
        overlayPane.removeChild(radarCanvasRef.current);
        radarCanvasRef.current = null;
      }
      if (radarRafIdRef.current) {
        cancelAnimationFrame(radarRafIdRef.current);
        radarRafIdRef.current = null;
      }
    };
  }, [map, repositionRadar]);

  // Continuous Radar Animation Loop (RequestAnimationFrame)
  useEffect(() => {
    if (!map) return;

    const TAU = Math.PI * 2;
    const PERIOD = 6.0; // 6 seconds per complete sweep turn
    const TRAIL = 1.15; // Conic trail radians
    const GREEN = '57,255,136';
    const CYAN = '34,230,255';

    let last = performance.now();
    const t0 = last;

    function mod(a: number) {
      return ((a % TAU) + TAU) % TAU;
    }

    const frame = (now: number) => {
      const cv = radarCanvasRef.current;
      const stat = radarStaticCanvasRef.current;
      if (!cv || !stat) {
        radarRafIdRef.current = requestAnimationFrame(frame);
        return;
      }

      const ctx = cv.getContext('2d');
      if (!ctx) {
        radarRafIdRef.current = requestAnimationFrame(frame);
        return;
      }

      const S = cv.width;
      if (S <= 0) {
        radarRafIdRef.current = requestAnimationFrame(frame);
        return;
      }

      const cx = S / 2;
      const cy = S / 2;
      const u = S / 700;
      const R = S / 2 - 34 * u;

      const time = (now - t0) / 1000;
      const s = mod((time / PERIOD) * TAU); // sweep angle (0 at North, clockwise)

      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(stat, 0, 0);

      // Sweep Trail (Conic wedge)
      const ca = s - Math.PI / 2 - TRAIL;
      const f = TRAIL / TAU;
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(ca, cx, cy);
        g.addColorStop(0, 'rgba(' + GREEN + ',0)');
        g.addColorStop(f * 0.45, 'rgba(' + GREEN + ',.05)');
        g.addColorStop(f * 0.8, 'rgba(' + GREEN + ',.17)');
        g.addColorStop(f, 'rgba(' + GREEN + ',.40)');
        g.addColorStop(Math.min(f + 0.0008, 1), 'rgba(' + GREEN + ',0)');
        g.addColorStop(1, 'rgba(' + GREEN + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R - 1, 0, TAU);
        ctx.fill();
      }

      // Sweep Line
      const sx = cx + R * Math.sin(s);
      const sy = cy - R * Math.cos(s);
      const lg = ctx.createLinearGradient(cx, cy, sx, sy);
      lg.addColorStop(0, 'rgba(' + GREEN + ',.25)');
      lg.addColorStop(1, 'rgba(' + GREEN + ',1)');
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = lg;
      ctx.lineWidth = 2 * u + 0.5;
      ctx.shadowColor = 'rgba(' + GREEN + ',.9)';
      ctx.shadowBlur = 14 * u;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.restore();

      // REAL DATABASE CONTACTS FROM analysis.individuals
      const individuals = analysisRef.current?.individuals || [];
      const curCenter = centerRef.current;
      const curRadiusM = radiusMRef.current;
      const fontPx = Math.max(9, (9.5 * u + 2) | 0);

      individuals.forEach((person) => {
        // Compute geographic bearing and relative range from center
        const dLat = person.lat - curCenter[0];
        const dLng = (person.lng - curCenter[1]) * Math.cos((curCenter[0] * Math.PI) / 180);
        let b = Math.atan2(dLng, dLat); // 0 at North, PI/2 at East
        if (b < 0) b += TAU;

        const r = Math.min(0.96, Math.max(0.05, person.distanceM / curRadiusM));
        const k = mod(s - b) / TAU; // 0 = just swept, 1 = about to be swept
        let br = Math.pow(Math.max(0, 1 - k / 0.9), 1.5);
        if (br <= 0.02) return;

        // Tactical Color Coding
        let col = person.sosActive
          ? '255,59,48' // Red SOS
          : person.hasDisability
          ? '192,132,252' // Purple disability
          : person.isInHighRiskFlood
          ? '251,191,36' // Amber flood
          : CYAN; // Tactical cyan

        if (person.sosActive) {
          // Urgent SOS blink
          br *= 0.6 + 0.4 * Math.sin(time * 9);
        }

        const x = cx + R * r * Math.sin(b);
        const y = cy - R * r * Math.cos(b);

        // Detection Pulse Rings when swept
        const ts = k * PERIOD;
        if (ts < 1.6) {
          const p = ts / 1.6;
          ctx.strokeStyle = 'rgba(' + col + ',' + (0.75 * (1 - p)).toFixed(3) + ')';
          ctx.lineWidth = 1.5 * u;
          ctx.beginPath();
          ctx.arc(x, y, (5 + p * 26) * u, 0, TAU);
          ctx.stroke();
        }

        // Blip Glow
        ctx.save();
        ctx.shadowColor = 'rgba(' + col + ',.95)';
        ctx.shadowBlur = 12 * u * br;
        ctx.fillStyle = 'rgba(' + col + ',' + Math.min(1, br + 0.1).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, (2.4 + (k < 0.03 ? 1.5 : 0)) * u + 0.6, 0, TAU);
        ctx.fill();
        ctx.restore();

        // Corner Reticle & Identification Label
        if (br > 0.18) {
          const q = 7 * u;
          const bd = Math.round((b * 180) / Math.PI);
          const rg = (person.distanceM / 1000).toFixed(2);

          ctx.strokeStyle = 'rgba(' + col + ',' + (br * 0.9).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, u);
          ctx.beginPath();
          ctx.moveTo(x - q, y - q + 3 * u);
          ctx.lineTo(x - q, y - q);
          ctx.lineTo(x - q + 3 * u, y - q);

          ctx.moveTo(x + q - 3 * u, y - q);
          ctx.lineTo(x + q, y - q);
          ctx.lineTo(x + q, y - q + 3 * u);

          ctx.moveTo(x + q, y + q - 3 * u);
          ctx.lineTo(x + q, y + q);
          ctx.lineTo(x + q - 3 * u, y + q);

          ctx.moveTo(x - q + 3 * u, y + q);
          ctx.lineTo(x - q, y + q);
          ctx.lineTo(x - q, y + q - 3 * u);
          ctx.stroke();

          ctx.fillStyle = 'rgba(' + col + ',' + (br * 0.95).toFixed(3) + ')';
          ctx.font = fontPx + 'px "Share Tech Mono",ui-monospace,monospace';
          ctx.textAlign = x > cx ? 'right' : 'left';
          ctx.textBaseline = 'bottom';
          const tx = x + (x > cx ? -q - 3 * u : q + 3 * u);
          const contactLabel = `${person.name.split(' ')[0]} ${person.sosActive ? '🚨SOS' : ''}`;
          ctx.fillText(contactLabel, tx, y - q + 2 * u);
          ctx.textBaseline = 'top';
          ctx.fillText(('000' + bd).slice(-3) + '° ' + rg + 'km', tx, y + q - 2 * u);
        }
      });

      radarRafIdRef.current = requestAnimationFrame(frame);
    };

    radarRafIdRef.current = requestAnimationFrame(frame);

    return () => {
      if (radarRafIdRef.current) {
        cancelAnimationFrame(radarRafIdRef.current);
        radarRafIdRef.current = null;
      }
    };
  }, [map]);

  // -------------------------------------------------------------
  // INITIALIZE & UPDATE MAP CIRCLE + DRAGGABLE CENTER & CIRCLE
  // -------------------------------------------------------------
  useEffect(() => {
    if (!map) return;

    if (!markersLayerGroupRef.current) {
      markersLayerGroupRef.current = L.layerGroup().addTo(map);
    }

    // Custom Draggable Center Icon
    const centerIcon = L.divIcon({
      className: 'custom-pop-center-marker',
      html: `
        <div class="relative flex items-center justify-center cursor-move">
          <div class="absolute w-8 h-8 rounded-full bg-cyan-400/40 animate-ping"></div>
          <div class="w-6 h-6 rounded-full bg-cyan-600 border-2 border-white shadow-xl flex items-center justify-center text-white font-bold text-[10px]">
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

      marker.on('drag', (e) => {
        const newLatLng = e.target.getLatLng();
        const newCoords: [number, number] = [newLatLng.lat, newLatLng.lng];
        centerRef.current = newCoords;
        setCenter(newCoords);
        if (circleLayerRef.current) {
          circleLayerRef.current.setLatLng(newCoords);
        }
        repositionRadar();
      });

      marker.on('dragend', (e) => {
        const newLatLng = e.target.getLatLng();
        const newCoords: [number, number] = [newLatLng.lat, newLatLng.lng];
        setCenter(newCoords);
        fetchAnalysis(newCoords[0], newCoords[1], radiusMRef.current);
      });

      marker.bindPopup(`
        <div class="p-2 text-slate-900 font-sans text-xs">
          <div class="font-bold text-cyan-700 flex items-center gap-1">
            <span>👥 Population Tool Center</span>
          </div>
          <div class="text-[10px] text-slate-600 mt-1">
            Freely drag this pin or the circle anywhere across the map to analyze local population density.
          </div>
        </div>
      `);

      centerMarkerRef.current = marker;
    } else {
      centerMarkerRef.current.setLatLng(center);
    }

    // Geodesic Coverage Area Circle (Draggable directly)
    if (!circleLayerRef.current) {
      const circle = L.circle(center, {
        radius: radiusM,
        color: '#22e6ff',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#07202b',
        fillOpacity: showHeatmap ? 0.15 : 0.04,
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(map);

      // Direct Circle Surface Draggability
      let isDraggingCircle = false;
      let dragStartLatLng: L.LatLng | null = null;
      let dragStartCenter: [number, number] = center;

      const onCircleDragStart = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        isDraggingCircle = true;
        dragStartLatLng = e.latlng;
        dragStartCenter = [centerRef.current[0], centerRef.current[1]];
        map.dragging.disable();
        if (map.getContainer()) {
          map.getContainer().style.cursor = 'grabbing';
        }
      };

      const onMapDragMove = (e: L.LeafletMouseEvent) => {
        if (!isDraggingCircle || !dragStartLatLng) return;
        const dLat = e.latlng.lat - dragStartLatLng.lat;
        const dLng = e.latlng.lng - dragStartLatLng.lng;
        const newCoords: [number, number] = [dragStartCenter[0] + dLat, dragStartCenter[1] + dLng];

        centerRef.current = newCoords;
        setCenter(newCoords);
        if (circleLayerRef.current) circleLayerRef.current.setLatLng(newCoords);
        if (centerMarkerRef.current) centerMarkerRef.current.setLatLng(newCoords);
        repositionRadar();
      };

      const onMapDragEnd = () => {
        if (!isDraggingCircle) return;
        isDraggingCircle = false;
        dragStartLatLng = null;
        map.dragging.enable();
        if (map.getContainer()) {
          map.getContainer().style.cursor = '';
        }
        const finalCoords = centerRef.current;
        fetchAnalysis(finalCoords[0], finalCoords[1], radiusMRef.current);
      };

      circle.on('mousedown touchstart', onCircleDragStart);
      map.on('mousemove touchmove', onMapDragMove);
      map.on('mouseup touchend', onMapDragEnd);

      circleLayerRef.current = circle;
    } else {
      circleLayerRef.current.setLatLng(center);
      circleLayerRef.current.setRadius(radiusM);
      circleLayerRef.current.setStyle({
        fillOpacity: showHeatmap ? 0.15 : 0.04,
      });
    }

    repositionRadar();

    // Map click handler to relocate analysis center to clicked point
    const onMapClick = (e: L.LeafletMouseEvent) => {
      setCenter([e.latlng.lat, e.latlng.lng]);
      fetchAnalysis(e.latlng.lat, e.latlng.lng, radiusMRef.current);
    };
    map.on('click', onMapClick);

    // Initial query on mount
    fetchAnalysis(center[0], center[1], radiusM);

    return () => {
      map.off('click', onMapClick);
    };
  }, [map, center, radiusM, showHeatmap, fetchAnalysis, repositionRadar]);

  // Update Individual Markers inside Circle
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

        if (count > 1) {
          const angle = (2 * Math.PI * index) / count;
          const offsetM = 15;
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
                : 'bg-cyan-600'
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

  // Cleanup on unmount
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
      if (holdRafIdRef.current) {
        cancelAnimationFrame(holdRafIdRef.current);
      }
    };
  }, [map]);

  // -------------------------------------------------------------
  // CONTINUOUS RADIUS EXPANSION (STRICT 5-SECOND INTERVAL RULE)
  // -------------------------------------------------------------
  // Initial: 1,000m
  // After 5s: 1,100m
  // After 10s: 1,200m
  // After 15s: 1,300m
  // Radius increases by exactly 100m for each completed 5-second interval.
  // Releasing before 5s discards partial unearned time immediately.
  const handleStartHoldExpand = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isHoldingExpand) return;

    setIsHoldingExpand(true);
    setHoldProgress(0);
    setHoldSeconds('0.0');
    setEarnedStepsInSession(0);
    completedStepsRef.current = 0;
    holdStartTimeRef.current = performance.now();

    const tickHold = () => {
      const now = performance.now();
      const totalElapsedMs = now - holdStartTimeRef.current;
      const totalElapsedSec = totalElapsedMs / 1000;

      // Completed 5-second steps
      const earnedSteps = Math.floor(totalElapsedSec / 5.0);
      const currentIntervalSec = totalElapsedSec % 5.0;

      setHoldProgress(currentIntervalSec / 5.0);
      setHoldSeconds(currentIntervalSec.toFixed(1));

      if (earnedSteps > completedStepsRef.current) {
        const stepsToAdd = earnedSteps - completedStepsRef.current;
        completedStepsRef.current = earnedSteps;
        setEarnedStepsInSession(earnedSteps);

        setRadiusM((prev) => {
          const next = Math.min(25000, prev + stepsToAdd * 100);
          radiusMRef.current = next;
          return next;
        });
      }

      holdRafIdRef.current = requestAnimationFrame(tickHold);
    };

    holdRafIdRef.current = requestAnimationFrame(tickHold);
  };

  const handleStopHoldExpand = () => {
    if (!isHoldingExpand) return;

    if (holdRafIdRef.current) {
      cancelAnimationFrame(holdRafIdRef.current);
      holdRafIdRef.current = null;
    }

    setIsHoldingExpand(false);
    setHoldProgress(0);
    setHoldSeconds('0.0');

    // Refresh population metrics for final radius
    fetchAnalysis(centerRef.current[0], centerRef.current[1], radiusMRef.current);
  };

  // Step decrease (minimum 1,000m)
  const handleStepDecrease = () => {
    setRadiusM((prev) => {
      const next = Math.max(1000, prev - 100);
      radiusMRef.current = next;
      fetchAnalysis(centerRef.current[0], centerRef.current[1], next);
      return next;
    });
  };

  // Reset to default exactly 1,000 m (1.0 km) and Avadi Basin center
  const handleResetRadius = () => {
    const defaultCenter: [number, number] = [13.1143, 80.1015];
    setRadiusM(1000);
    radiusMRef.current = 1000;
    setCenter(defaultCenter);
    centerRef.current = defaultCenter;
    if (map) {
      map.flyTo(defaultCenter, 14, { duration: 1 });
    }
    fetchAnalysis(defaultCenter[0], defaultCenter[1], 1000);
  };

  const radiusKm = (radiusM / 1000).toFixed(1);

  return (
    <div className="absolute top-16 right-4 z-20 w-80 sm:w-96 max-h-[85vh] flex flex-col bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-2xl shadow-2xl text-white text-xs overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header Bar */}
      <div className="p-3 bg-gradient-to-r from-slate-950 via-cyan-950 to-slate-900 border-b border-cyan-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-white text-xs sm:text-sm tracking-wide">
                Population Radius Tool
              </h3>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/30 text-cyan-300 border border-cyan-500/50">
                ADMIN
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Surveillance radar & dynamic density audit
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
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              SEARCH RADIUS:
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-base text-cyan-300">
                {radiusM.toLocaleString()} m
              </span>
              <span className="text-slate-400 text-xs">({radiusKm} km)</span>
            </div>
          </div>

          {/* 5-SECOND INTERVAL EXPANSION HOLD CONTROL */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onMouseDown={handleStartHoldExpand}
                onMouseUp={handleStopHoldExpand}
                onMouseLeave={handleStopHoldExpand}
                onTouchStart={handleStartHoldExpand}
                onTouchEnd={handleStopHoldExpand}
                onTouchCancel={handleStopHoldExpand}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition select-none touch-none shadow-lg ${
                  isHoldingExpand
                    ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/50 ring-2 ring-cyan-300 scale-[0.98]'
                    : 'bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-200'
                }`}
                title="Hold for 5 seconds to expand radius by +100m"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>
                  {isHoldingExpand
                    ? `HOLDING... ${holdSeconds}s / 5.0s`
                    : 'HOLD TO EXPAND (+100m / 5s)'}
                </span>
              </button>

              <button
                onClick={handleStepDecrease}
                disabled={radiusM <= 1000}
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 font-bold text-xs transition"
                title="Decrease radius by 100m"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleResetRadius}
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
                title="Reset to initial 1.0 km radius and basin center"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Visual Progress Bar for Active 5-Second Interval */}
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-75 ease-out shadow-[0_0_8px_rgba(34,230,255,0.8)]"
                style={{ width: `${Math.round(holdProgress * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 px-0.5">
              <span>5s Interval Rule: +100m each full 5s</span>
              {earnedStepsInSession > 0 ? (
                <span className="text-emerald-400 font-bold">
                  +{earnedStepsInSession * 100}m earned
                </span>
              ) : (
                <span>Release resets partial timer</span>
              )}
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-500 font-mono">PRESETS:</span>
            <div className="flex items-center gap-1.5">
              {[1000, 2000, 3000, 5000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setRadiusM(preset);
                    radiusMRef.current = preset;
                    fetchAnalysis(centerRef.current[0], centerRef.current[1], preset);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                    radiusM === preset
                      ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {preset >= 1000 ? `${preset / 1000} km` : `${preset} m`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center Coordinate Info & Relocate Prompt */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span>
              CENTER: {center[0].toFixed(4)}°, {center[1].toFixed(4)}°
            </span>
          </div>
          <span className="text-cyan-400 font-medium">Drag circle / Click map</span>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-cyan-300">
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
                <div
                  className={`text-lg font-bold mt-0.5 ${
                    analysis.breakdown.activeSosCount > 0
                      ? 'text-red-400 animate-pulse'
                      : 'text-slate-400'
                  }`}
                >
                  {analysis.breakdown.activeSosCount}
                </div>
                <div className="text-[9px] text-slate-500 mt-1">Immediate Rescue</div>
              </div>

              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-amber-400">IN HIGH-RISK FLOOD</div>
                <div className="text-lg font-bold text-amber-300 mt-0.5">
                  {analysis.breakdown.highRiskFloodCount}
                </div>
                <div className="text-[9px] text-slate-500 mt-1">Water &gt; 0.50m</div>
              </div>
            </div>

            {/* Sub-summary row */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <span>
                Stale GPS (&gt;5m):{' '}
                <strong className="text-slate-300">
                  {analysis.breakdown.staleLocationCount}
                </strong>
              </span>
              <span>
                Area:{' '}
                <strong className="text-slate-300">
                  {analysis.areaSqKm.toFixed(2)} km²
                </strong>
              </span>
            </div>

            {/* Individual Records Inspector Accordion */}
            <div className="pt-1">
              <button
                onClick={() => setShowIndividuals((prev) => !prev)}
                className="w-full py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center justify-between transition"
              >
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
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
                        className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{person.name}</span>
                          <span className="font-mono text-[9px] text-cyan-400">
                            {person.distanceM}m
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
                          <span>{person.addressLandmark || person.personId}</span>
                          {person.sosActive && (
                            <span className="text-red-400 font-bold">🚨 SOS ACTIVE</span>
                          )}
                          {person.hasDisability && (
                            <span className="text-purple-400">
                              ♿ {person.disabilityType || 'Needs Help'}
                            </span>
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
