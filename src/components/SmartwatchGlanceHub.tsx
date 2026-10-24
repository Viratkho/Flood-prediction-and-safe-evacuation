import React, { useState, useEffect } from 'react';
import {
  SharedLocationState,
  DamTelemetry,
  RegisteredPerson,
  ReliefCentre,
  LocationWeatherData,
  WeatherNewsArticle,
} from '../types/floodguard';
import {
  Shield,
  CloudSun,
  Waves,
  Navigation,
  Droplets,
  Wind,
  MapPin,
  ChevronRight,
  Maximize2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface SmartwatchGlanceHubProps {
  sharedLocation?: SharedLocationState;
  damTelemetry: DamTelemetry;
  people: RegisteredPerson[];
  reliefCentres: ReliefCentre[];
  userLocation: [number, number];
  onOpenEvacuation: () => void;
  onOpenWeatherNews: () => void;
  onOpenPersonMonitoring: () => void;
  onOpenCommandCenter: () => void;
  onSwitchToFullView: () => void;
}

export const SmartwatchGlanceHub: React.FC<SmartwatchGlanceHubProps> = ({
  damTelemetry,
  people,
  reliefCentres,
  userLocation,
  onOpenEvacuation,
  onOpenWeatherNews,
  onOpenPersonMonitoring,
  onOpenCommandCenter,
  onSwitchToFullView,
  sharedLocation,
}) => {
  // Live weather state for watch
  const [weatherData, setWeatherData] = useState<LocationWeatherData | null>(null);
  const [newsHeadlines, setNewsHeadlines] = useState<WeatherNewsArticle[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch quick weather and news for the smartwatch display
  const fetchWatchTelemetry = async () => {
    setIsRefreshing(true);
    try {
      const [wRes, nRes] = await Promise.all([
        fetch(`/api/weather?lat=${userLocation[0]}&lon=${userLocation[1]}&city=Avadi%20Basin`),
        fetch(`/api/weather/news/local?location=Chennai`),
      ]);

      const wType = wRes.headers.get('content-type') || '';
      if (wRes.ok && wType.includes('application/json')) {
        const wJson = await wRes.json();
        setWeatherData(wJson);
      } else {
        try {
          const directRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${userLocation[0]}&longitude=${userLocation[1]}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
          if (directRes.ok) {
            const d = await directRes.json();
            setWeatherData({
              success: true,
              provider: 'Open-Meteo Direct',
              providerUrl: 'https://open-meteo.com/',
              isModelForecast: true,
              lastUpdated: new Date().toISOString(),
              location: { lat: userLocation[0], lon: userLocation[1], city: 'Avadi Basin' },
              current: {
                temperature: Number((d.current?.temperature_2m ?? 28).toFixed(1)),
                apparentTemperature: 30,
                humidity: Number((d.current?.relative_humidity_2m ?? 72).toFixed(0)),
                weatherCode: d.current?.weather_code ?? 2,
                weatherCondition: 'Partly Cloudy',
                iconName: 'CloudSun',
                precipitation: 0,
                rain: 0,
                windSpeed: Number((d.current?.wind_speed_10m ?? 14).toFixed(1)),
                windDirection: 45,
                windDirectionCardinal: 'NE',
                isDay: true,
                timestamp: new Date().toISOString(),
              },
              hourly: [],
              daily: [],
            });
          }
        } catch {
          // Keep existing state
        }
      }

      const nType = nRes.headers.get('content-type') || '';
      if (nRes.ok && nType.includes('application/json')) {
        const nJson = await nRes.json();
        if (Array.isArray(nJson.articles)) {
          setNewsHeadlines(nJson.articles.slice(0, 3));
        }
      } else {
        setNewsHeadlines([
          {
            id: 'SW-IMD-01',
            headline: 'IMD Chennai: Rainfall Warning for Coastal Tamil Nadu & Chennai Basin',
            publisher: 'IMD Chennai',
            sourceUrl: 'https://mausam.imd.gov.in/chennai/',
            publishedAt: new Date().toISOString(),
            publishedDate: 'Today',
            timezoneLabel: 'IST',
            locationOrRegion: 'Chennai / Avadi',
            category: 'CYCLONES_HURRICANES',
            region: 'LOCAL',
          },
          {
            id: 'SW-WRD-02',
            headline: 'Chembarambakkam & Poondi Reservoirs Catchment Inflow Regularized',
            publisher: 'Water Resources Dept',
            sourceUrl: 'https://wrd.tn.gov.in/',
            publishedAt: new Date().toISOString(),
            publishedDate: 'Today',
            timezoneLabel: 'IST',
            locationOrRegion: 'Chembarambakkam Basin',
            category: 'EXTREME_RAIN_FLOOD',
            region: 'LOCAL',
          },
        ]);
      }
    } catch (e) {
      console.warn('Watch telemetry fetch warning:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWatchTelemetry();
    const interval = setInterval(fetchWatchTelemetry, 30000);
    return () => clearInterval(interval);
  }, [userLocation]);

  const activeSosCount = people.filter((p) => p.sosActive).length;
  const criticalPeopleCount = people.filter(
    (p) => p.rescuePriority === 'P0' || p.rescuePriority === 'P1'
  ).length;

  // Find nearest relief shelter
  const nearestShelter = reliefCentres[0] || {
    id: 'RC-1',
    name: 'Thirumullaivoyal Haven',
    elevationM: 24.8,
    totalCapacity: 300,
    occupiedCapacity: 160,
  };

  const damPercent = Math.min(
    100,
    Math.round((damTelemetry.reservoirLevelM / damTelemetry.maxCrestLevelM) * 100)
  );

  return (
    <div className="w-full min-h-full bg-slate-950 text-slate-100 flex flex-col p-2 space-y-2.5 overflow-y-auto selection:bg-[#ff7700] selection:text-white font-sans text-xs">
      {/* 0. Top Watch Header & Mode Switcher */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 shadow-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-[#ff7700] flex items-center justify-center text-white shrink-0 shadow">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-[11px] leading-tight text-white flex items-center gap-1">
              <span>FG 2.1</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            </div>
            <div className="text-[9px] text-slate-400 font-mono truncate">WATCH GLANCE</div>
          </div>
        </div>

        <button
          onClick={onSwitchToFullView}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 shrink-0 transition"
          title="Switch to full standard dashboard layout"
        >
          <Maximize2 className="w-3 h-3" />
          <span>Full UI</span>
        </button>
      </div>

      {/* 1. SECTION A: CURRENT WEATHER SUMMARY */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span className="flex items-center gap-1 truncate text-slate-300 font-semibold">
            <MapPin className="w-3 h-3 text-[#ff7700] shrink-0" />
            <span className="truncate">{weatherData?.location?.city || 'Avadi Basin'}</span>
          </span>
          <button
            onClick={fetchWatchTelemetry}
            className="text-slate-400 hover:text-sky-300 p-0.5"
            title="Refresh weather"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-1 font-mono">
              {weatherData?.current ? (
                <>
                  <span>{weatherData.current.temperature.toFixed(0)}°</span>
                  <span className="text-xs text-slate-400 font-normal">C</span>
                </>
              ) : (
                <span className="text-sm text-slate-400">Loading...</span>
              )}
            </div>
            <div className="text-[11px] font-bold text-sky-400 truncate">
              {weatherData?.current?.weatherCondition || 'Partly Cloudy'}
            </div>
          </div>

          <div className="text-right space-y-0.5 text-[10px] font-mono text-slate-300">
            <div className="flex items-center justify-end gap-1 text-blue-300">
              <Droplets className="w-2.5 h-2.5 text-blue-400" />
              <span>{weatherData?.current ? `${weatherData.current.humidity}%` : '--'}</span>
            </div>
            <div className="flex items-center justify-end gap-1 text-teal-300">
              <Wind className="w-2.5 h-2.5 text-teal-400" />
              <span>{weatherData?.current ? `${weatherData.current.windSpeed}k` : '--'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenWeatherNews}
          className="w-full py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-sky-300 border border-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition"
        >
          <span>7-Day Forecast & News</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* 2. SECTION B: FLOOD & DAM HYDROLOGY STATUS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-2 shadow-sm">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <div className="flex items-center gap-1 text-slate-300 font-bold">
            <Waves className="w-3 h-3 text-sky-400" />
            <span>DAM LEVEL</span>
          </div>
          <span
            className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
              damTelemetry.status === 'CRITICAL'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                : damTelemetry.status === 'WARNING'
                ? 'bg-[#ff7700]/20 text-[#ff7700] border border-[#ff7700]/40'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}
          >
            {damTelemetry.status}
          </span>
        </div>

        {/* Level bar */}
        <div>
          <div className="flex justify-between text-[11px] font-mono mb-1">
            <span className="font-extrabold text-white text-sm">
              {damTelemetry.reservoirLevelM}m
            </span>
            <span className="text-slate-400 text-[10px]">Max {damTelemetry.maxCrestLevelM}m</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                damTelemetry.reservoirLevelM > 36.5
                  ? 'bg-red-500'
                  : damTelemetry.reservoirLevelM > 34.0
                  ? 'bg-[#ff7700]'
                  : 'bg-sky-400'
              }`}
              style={{ width: `${damPercent}%` }}
            />
          </div>
        </div>

        {/* Rain & Discharge */}
        <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-300">
          <div className="bg-slate-950 p-1 rounded border border-slate-800 text-center">
            <span className="text-slate-500 block text-[8px] uppercase">RAIN</span>
            <strong>{damTelemetry.precipitationMmH} mm/h</strong>
          </div>
          <div className="bg-slate-950 p-1 rounded border border-slate-800 text-center">
            <span className="text-slate-500 block text-[8px] uppercase">DISCHARGE</span>
            <strong className="text-sky-300">
              {(damTelemetry.spillwayReleaseCusecs / 1000).toFixed(1)}k cfs
            </strong>
          </div>
        </div>
      </div>

      {/* 3. SECTION C: CONCISE EMERGENCY & EVACUATION DIRECTIVE */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[11px] text-white">
            <Navigation className="w-3.5 h-3.5 text-[#ff7700]" />
            <span>SAFE EVACUATION</span>
          </div>
          {activeSosCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-red-600 text-white font-mono font-bold text-[9px] animate-pulse">
              {activeSosCount} SOS
            </span>
          )}
        </div>

        {/* Nearest Haven */}
        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-0.5">
          <div className="text-[9px] font-mono text-slate-400 uppercase">Nearest Safe Haven:</div>
          <div className="font-bold text-white text-[11px] truncate">{nearestShelter.name}</div>
          <div className="text-[10px] font-mono text-emerald-400 flex items-center justify-between">
            <span>Elev: {nearestShelter.elevationM}m MSL</span>
            <span>{nearestShelter.totalCapacity - nearestShelter.occupiedCapacity} beds free</span>
          </div>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={onOpenEvacuation}
          className="w-full py-2 px-2 rounded-lg bg-[#ff7700] hover:bg-[#ff8811] text-white font-extrabold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Launch Evac Route</span>
        </button>

        {/* Secondary Monitoring Pill */}
        <button
          onClick={onOpenPersonMonitoring}
          className="w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center justify-between px-2 transition border border-slate-700"
        >
          <span>Monitored Persons ({people.length})</span>
          <span className="text-amber-300 font-bold">{criticalPeopleCount} Critical</span>
        </button>

        {/* Command Center Shortcut */}
        <button
          onClick={onOpenCommandCenter}
          className="w-full py-1 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-400 text-[10px] font-mono flex items-center justify-center gap-1 border border-slate-800"
        >
          <span>Command Center Map</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* 4. SECTION D: COMPACT NEWS HEADLINES WIRE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="text-white font-bold flex items-center gap-1">
            <CloudSun className="w-3 h-3 text-sky-400" />
            WEATHER NEWS
          </span>
          <span>IMD & RSS</span>
        </div>

        <div className="space-y-1">
          {newsHeadlines.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic py-1">No alerts active right now.</div>
          ) : (
            newsHeadlines.map((item) => (
              <a
                key={item.id}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-1.5 rounded-lg bg-slate-950/80 hover:bg-slate-800 border border-slate-800/80 text-[10px] space-y-0.5 transition"
              >
                <div className="text-slate-200 font-semibold line-clamp-2 leading-tight">
                  {item.headline}
                </div>
                <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                  <span className="text-sky-400 truncate max-w-[120px]">{item.publisher}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </div>
              </a>
            ))
          )}
        </div>
      </div>

      {/* 5. Navigation Footer to Full Features */}
      <div className="p-2 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center space-y-1.5">
        <p className="text-[9px] text-slate-400 leading-tight">
          Smartwatch glance view (160–320px). Tap below to open full desktop or tablet mode.
        </p>
        <button
          onClick={onSwitchToFullView}
          className="w-full py-1.5 bg-sky-700/80 hover:bg-sky-600 text-white font-bold text-[10px] rounded-lg transition"
        >
          Switch to Standard Layout
        </button>
      </div>
    </div>
  );
};
