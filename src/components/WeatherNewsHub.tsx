import React, { useState, useEffect, useRef } from 'react';
import {
  LocationWeatherData,
  CitySearchResult,
  WeatherNewsArticle,
  WeatherNewsCategory,
  WeatherNewsRegion,
} from '../types/floodguard';
import {
  Sun,
  SunDim,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  CloudSnow,
  Wind,
  Droplets,
  Thermometer,
  Compass,
  Search,
  MapPin,
  LocateFixed,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Info,
  ShieldCheck,
  Globe,
  Newspaper,
  Filter,
  ChevronRight,
  Eye,
  Activity,
} from 'lucide-react';

interface WeatherNewsHubProps {
  userLocation?: [number, number];
}

const DEFAULT_LOCATION = {
  lat: 13.1143,
  lon: 80.1015,
  city: 'Avadi Basin, Chennai',
  region: 'Tamil Nadu',
  country: 'India',
};

const PRESET_QUICK_CITIES = [
  { name: 'Chennai', region: 'Tamil Nadu', lat: 13.0827, lon: 80.2707, country: 'India' },
  { name: 'Avadi Basin', region: 'Tamil Nadu', lat: 13.1143, lon: 80.1015, country: 'India' },
  { name: 'Coimbatore', region: 'Tamil Nadu', lat: 11.0168, lon: 76.9558, country: 'India' },
  { name: 'Madurai', region: 'Tamil Nadu', lat: 9.9252, lon: 78.1198, country: 'India' },
  { name: 'Bengaluru', region: 'Karnataka', lat: 12.9716, lon: 77.5946, country: 'India' },
  { name: 'Mumbai', region: 'Maharashtra', lat: 19.0760, lon: 72.8777, country: 'India' },
  { name: 'Kolkata', region: 'West Bengal', lat: 22.5726, lon: 88.3639, country: 'India' },
  { name: 'Delhi NCR', region: 'Delhi', lat: 28.6139, lon: 77.2090, country: 'India' },
];

export const WeatherNewsHub: React.FC<WeatherNewsHubProps> = ({ userLocation }) => {
  // Load preferred location from localStorage if saved
  const [selectedLocation, setSelectedLocation] = useState(() => {
    try {
      const stored = localStorage.getItem('floodguard_preferred_weather_location');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Could not read preferred weather location:', e);
    }
    if (userLocation && userLocation[0] && userLocation[1]) {
      return {
        lat: userLocation[0],
        lon: userLocation[1],
        city: 'Your GPS Vicinity',
        region: 'Tamil Nadu',
        country: 'India',
      };
    }
    return DEFAULT_LOCATION;
  });

  const [activeSubTab, setActiveSubTab] = useState<'DASHBOARD' | 'WEATHER' | 'LOCAL_NEWS' | 'GLOBAL_NEWS'>('DASHBOARD');

  // Weather state
  const [weatherData, setWeatherData] = useState<LocationWeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  // News states
  const [localNews, setLocalNews] = useState<WeatherNewsArticle[]>([]);
  const [localNewsLoading, setLocalNewsLoading] = useState(false);
  const [localNewsError, setLocalNewsError] = useState<string | null>(null);
  const [localCategoryFilter, setLocalCategoryFilter] = useState<WeatherNewsCategory>('ALL');
  const [localNewsSearch, setLocalNewsSearch] = useState('');
  const [localVisibleCount, setLocalVisibleCount] = useState(6);

  const [globalNews, setGlobalNews] = useState<WeatherNewsArticle[]>([]);
  const [globalNewsLoading, setGlobalNewsLoading] = useState(false);
  const [globalNewsError, setGlobalNewsError] = useState<string | null>(null);
  const [globalRegionFilter, setGlobalRegionFilter] = useState<WeatherNewsRegion>('ALL');
  const [globalCategoryFilter, setGlobalCategoryFilter] = useState<WeatherNewsCategory>('ALL');
  const [globalNewsSearch, setGlobalNewsSearch] = useState('');
  const [globalVisibleCount, setGlobalVisibleCount] = useState(8);

  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch weather data for selected coordinates
  const fetchWeather = async (lat: number, lon: number, city: string, region: string, country: string) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetch(
        `/api/weather?lat=${lat}&lon=${lon}&city=${encodeURIComponent(city)}&region=${encodeURIComponent(region)}&country=${encodeURIComponent(country)}`
      );
      if (!res.ok) {
        throw new Error(`Open-Meteo returned status ${res.status}`);
      }
      const data: LocationWeatherData = await res.json();
      setWeatherData(data);
      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err: unknown) {
      console.error('Weather fetch error:', err);
      setWeatherError('Unable to load meteorological forecast from Open-Meteo. Please check connection.');
    } finally {
      setWeatherLoading(false);
    }
  };

  // Fetch local weather news for city / region
  const fetchLocalNews = async (city: string, region: string) => {
    setLocalNewsLoading(true);
    setLocalNewsError(null);
    try {
      const res = await fetch(
        `/api/weather/news/local?query=${encodeURIComponent(city)}&region=${encodeURIComponent(region)}`
      );
      if (!res.ok) {
        throw new Error(`Local news API returned status ${res.status}`);
      }
      const data = await res.json();
      setLocalNews(data.articles || []);
    } catch (err: unknown) {
      console.error('Local weather news fetch error:', err);
      setLocalNewsError('Unable to fetch regional meteorological RSS bulletins.');
    } finally {
      setLocalNewsLoading(false);
    }
  };

  // Fetch global weather news
  const fetchGlobalNews = async () => {
    setGlobalNewsLoading(true);
    setGlobalNewsError(null);
    try {
      const res = await fetch('/api/weather/news/global');
      if (!res.ok) {
        throw new Error(`Global news API returned status ${res.status}`);
      }
      const data = await res.json();
      setGlobalNews(data.articles || []);
    } catch (err: unknown) {
      console.error('Global weather news fetch error:', err);
      setGlobalNewsError('Unable to fetch international disaster & extreme weather RSS feeds.');
    } finally {
      setGlobalNewsLoading(false);
    }
  };

  // Load weather and news when selectedLocation changes
  useEffect(() => {
    if (selectedLocation && selectedLocation.lat && selectedLocation.lon) {
      fetchWeather(
        selectedLocation.lat,
        selectedLocation.lon,
        selectedLocation.city,
        selectedLocation.region,
        selectedLocation.country
      );
      fetchLocalNews(selectedLocation.city, selectedLocation.region);
    }
  }, [selectedLocation.lat, selectedLocation.lon]);

  // Initial load of global news
  useEffect(() => {
    fetchGlobalNews();
  }, []);

  // Handle City Geocoding Search Debounced
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowSearchDropdown(true);
        }
      } catch (err) {
        console.warn('Geocoding search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // User selects location from search dropdown
  const handleSelectCity = (cityResult: CitySearchResult) => {
    const newLoc = {
      lat: Number(cityResult.latitude.toFixed(4)),
      lon: Number(cityResult.longitude.toFixed(4)),
      city: cityResult.name,
      region: cityResult.admin1 || cityResult.country,
      country: cityResult.country,
    };
    setSelectedLocation(newLoc);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  // Save current city as preferred
  const handleSavePreferred = () => {
    try {
      localStorage.setItem('floodguard_preferred_weather_location', JSON.stringify(selectedLocation));
      setGpsStatus('Saved as your preferred default location');
      setTimeout(() => setGpsStatus(null), 3000);
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  };

  const isSavedAsDefault = (() => {
    try {
      const stored = localStorage.getItem('floodguard_preferred_weather_location');
      if (stored) {
        const parsed = JSON.parse(stored);
        return Math.abs(parsed.lat - selectedLocation.lat) < 0.01 && Math.abs(parsed.lon - selectedLocation.lon) < 0.01;
      }
    } catch {
      return false;
    }
    return false;
  })();

  // Device Geolocation Handler
  const handleUseDeviceGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('Geolocation not supported by your browser');
      setTimeout(() => setGpsStatus(null), 4000);
      return;
    }

    setGpsStatus('Requesting device location coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          city: 'Your GPS Coordinates',
          region: 'Local Device Area',
          country: 'Current Vicinity',
        };
        setSelectedLocation(newLoc);
        setGpsStatus(`GPS lock acquired: ${newLoc.lat}, ${newLoc.lon}`);
        setTimeout(() => setGpsStatus(null), 3500);
      },
      (err) => {
        console.warn('Geolocation permission denied or error:', err);
        setGpsStatus('Location permission denied or unavailable. You can search manually.');
        setTimeout(() => setGpsStatus(null), 4500);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Refresh All Data
  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    await Promise.all([
      fetchWeather(
        selectedLocation.lat,
        selectedLocation.lon,
        selectedLocation.city,
        selectedLocation.region,
        selectedLocation.country
      ),
      fetchLocalNews(selectedLocation.city, selectedLocation.region),
      fetchGlobalNews(),
    ]);
    setIsRefreshingAll(false);
  };

  // Weather icon selector
  const renderWeatherIcon = (iconName: string, className: string = 'w-6 h-6') => {
    switch (iconName) {
      case 'Sun':
        return <Sun className={`${className} text-amber-400`} />;
      case 'SunDim':
        return <SunDim className={`${className} text-amber-300`} />;
      case 'CloudSun':
        return <CloudSun className={`${className} text-amber-300`} />;
      case 'Cloud':
        return <Cloud className={`${className} text-slate-300`} />;
      case 'CloudFog':
        return <CloudFog className={`${className} text-slate-400`} />;
      case 'CloudDrizzle':
        return <CloudDrizzle className={`${className} text-sky-400`} />;
      case 'CloudRain':
        return <CloudRain className={`${className} text-blue-400`} />;
      case 'CloudSnow':
        return <CloudSnow className={`${className} text-cyan-200`} />;
      case 'CloudLightning':
        return <CloudLightning className={`${className} text-yellow-400`} />;
      default:
        return <CloudSun className={`${className} text-amber-300`} />;
    }
  };

  // Filter local news
  const filteredLocalNews = localNews.filter((article) => {
    if (localCategoryFilter !== 'ALL' && article.category !== localCategoryFilter) return false;
    if (localNewsSearch.trim()) {
      const q = localNewsSearch.toLowerCase();
      return (
        article.headline.toLowerCase().includes(q) ||
        article.publisher.toLowerCase().includes(q) ||
        (article.snippet && article.snippet.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filter global news
  const filteredGlobalNews = globalNews.filter((article) => {
    if (globalRegionFilter !== 'ALL' && article.region !== globalRegionFilter) return false;
    if (globalCategoryFilter !== 'ALL' && article.category !== globalCategoryFilter) return false;
    if (globalNewsSearch.trim()) {
      const q = globalNewsSearch.toLowerCase();
      return (
        article.headline.toLowerCase().includes(q) ||
        article.publisher.toLowerCase().includes(q) ||
        article.locationOrRegion.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Get Category Badge Style
  const getCategoryBadge = (cat: WeatherNewsCategory) => {
    switch (cat) {
      case 'CYCLONES_HURRICANES':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'EXTREME_RAIN_FLOOD':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'HEATWAVE_DROUGHT':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'SEVERE_STORMS':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto selection:bg-[#ff7700] selection:text-white">
      {/* Top Header & Navigation Banner */}
      <div className="p-4 sm:p-6 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Main Title & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
                <CloudSun className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Weather & Meteorological News Hub
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold font-mono">
                    100% Free • Open-Meteo & RSS
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live atmospheric observations, 7-day model forecasts, regional meteorological bulletins & global severe weather wire.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshAll}
                disabled={isRefreshingAll}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-2 transition disabled:opacity-50"
                title="Refresh weather forecasts and public RSS news feeds"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshingAll ? 'animate-spin' : ''}`} />
                <span>{isRefreshingAll ? 'Refreshing...' : 'Refresh All'}</span>
              </button>

              {lastRefreshedAt && (
                <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
                  Updated: {lastRefreshedAt}
                </div>
              )}
            </div>
          </div>

          {/* Strict Informational Decoupling Notice */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex items-center justify-between gap-3 text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong className="text-slate-200">Informational Module:</strong> Atmospheric weather and public news feeds are provided for situational context. This data is strictly decoupled from FloodGuard's A* rescue routing, dam discharge calculations, and clinical triage engines.
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 shrink-0 hidden md:block">
              ISO 9241-11 Compliant
            </div>
          </div>

          {/* Sub-Section View Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveSubTab('DASHBOARD')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeSubTab === 'DASHBOARD'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-[#ff7700]" />
                <span>All-in-One Dashboard</span>
              </button>

              <button
                onClick={() => setActiveSubTab('WEATHER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeSubTab === 'WEATHER'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CloudSun className="w-3.5 h-3.5 text-sky-400" />
                <span>Weather in Your Location</span>
              </button>

              <button
                onClick={() => setActiveSubTab('LOCAL_NEWS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeSubTab === 'LOCAL_NEWS'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5 text-amber-400" />
                <span>Weather News Near You ({localNews.length})</span>
              </button>

              <button
                onClick={() => setActiveSubTab('GLOBAL_NEWS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeSubTab === 'GLOBAL_NEWS'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>Global Weather News ({globalNews.length})</span>
              </button>
            </div>

            {/* Location Selector Bar */}
            <div className="relative flex items-center gap-2 flex-1 max-w-md ml-auto" ref={searchBoxRef}>
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSearchDropdown(true);
                  }}
                  placeholder="Search city (e.g. Chennai, Avadi, Delhi, Tokyo)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                {isSearching && (
                  <div className="absolute right-3 top-2.5">
                    <div className="w-3.5 h-3.5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {/* Geolocation Button */}
              <button
                onClick={handleUseDeviceGps}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 transition"
                title="Use Current Device Location (Browser GPS)"
              >
                <LocateFixed className="w-4 h-4" />
              </button>

              {/* Save Default Button */}
              <button
                onClick={handleSavePreferred}
                className={`p-2 rounded-xl border transition ${
                  isSavedAsDefault
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
                }`}
                title={isSavedAsDefault ? 'Current city is saved as your default' : 'Save current city as preferred default'}
              >
                {isSavedAsDefault ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>

              {/* Autocomplete Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-800/60 max-h-60 overflow-y-auto">
                  {searchResults.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => handleSelectCity(city)}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800 flex items-center justify-between text-xs transition"
                    >
                      <div>
                        <div className="font-bold text-slate-100">{city.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {city.admin1 ? `${city.admin1}, ` : ''}{city.country}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {city.latitude.toFixed(2)}, {city.longitude.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* GPS Status Message Toast */}
          {gpsStatus && (
            <div className="p-2 bg-sky-950/80 border border-sky-500/40 rounded-lg text-xs text-sky-300 flex items-center gap-2">
              <LocateFixed className="w-3.5 h-3.5 shrink-0" />
              <span>{gpsStatus}</span>
            </div>
          )}

          {/* Quick Preset City Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-mono text-slate-500 shrink-0 mr-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#ff7700]" />
              Quick Cities:
            </span>
            {PRESET_QUICK_CITIES.map((c) => {
              const isSelected =
                Math.abs(selectedLocation.lat - c.lat) < 0.05 && Math.abs(selectedLocation.lon - c.lon) < 0.05;
              return (
                <button
                  key={c.name}
                  onClick={() =>
                    setSelectedLocation({
                      lat: c.lat,
                      lon: c.lon,
                      city: c.name,
                      region: c.region,
                      country: c.country,
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition shrink-0 ${
                    isSelected
                      ? 'bg-[#ff7700] text-white border-white shadow'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-8">
        {/* ========================================================================= */}
        {/* SECTION A — WEATHER IN YOUR LOCATION */}
        {/* ========================================================================= */}
        {(activeSubTab === 'DASHBOARD' || activeSubTab === 'WEATHER') && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <CloudSun className="w-5 h-5 text-sky-400" />
                  <span>Weather in Your Location</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({selectedLocation.city}, {selectedLocation.region})
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time numerical atmosphere telemetry, humidity, wind vector, and next 7-day model projections.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">
                  Coordinates: {selectedLocation.lat.toFixed(4)}°N, {selectedLocation.lon.toFixed(4)}°E
                </span>
                {isSavedAsDefault && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                    ★ Preferred Home City
                  </span>
                )}
              </div>
            </div>

            {weatherLoading && !weatherData ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs text-slate-400 font-mono">Fetching Open-Meteo atmospheric forecast...</p>
              </div>
            ) : weatherError ? (
              <div className="p-6 bg-red-950/30 border border-red-800 rounded-2xl flex items-center gap-3 text-red-200 text-xs">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <div className="font-bold">Meteorological Service Notice</div>
                  <div>{weatherError}</div>
                </div>
              </div>
            ) : weatherData ? (
              <div className="space-y-4">
                {/* Current Weather Hero Card */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Big Temperature & Condition Display */}
                  <div className="lg:col-span-1 p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex flex-col justify-between shadow-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                          Current Observation
                        </div>
                        <h3 className="text-lg font-black text-white mt-0.5">
                          {selectedLocation.city}
                        </h3>
                        <div className="text-xs text-slate-400">
                          {selectedLocation.region}, {selectedLocation.country}
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                        {renderWeatherIcon(weatherData.current.iconName, 'w-10 h-10')}
                      </div>
                    </div>

                    <div className="my-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-white tracking-tight">
                          {weatherData.current.temperature.toFixed(1)}°
                        </span>
                        <span className="text-xl font-bold text-slate-400">C</span>
                      </div>
                      <div className="text-sm font-bold text-sky-400 mt-1">
                        {weatherData.current.weatherCondition}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Feels like {weatherData.current.apparentTemperature.toFixed(1)}°C
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500 border-t border-slate-800/80 pt-2 flex items-center justify-between">
                      <span>Model Time: {weatherData.current.timestamp.slice(11, 16)}</span>
                      <span>{weatherData.current.isDay ? '☀️ Daytime' : '🌙 Nighttime'}</span>
                    </div>
                  </div>

                  {/* Detailed Meteorological Metrics Grid */}
                  <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                        Atmospheric Key Indicators
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Open-Meteo High-Resolution Model
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      {/* Humidity */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                          <Droplets className="w-3.5 h-3.5 text-blue-400" />
                          <span>HUMIDITY</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {weatherData.current.humidity}%
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {weatherData.current.humidity > 80 ? 'High moisture' : 'Moderate moisture'}
                        </div>
                      </div>

                      {/* Wind Speed & Direction */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                          <Wind className="w-3.5 h-3.5 text-teal-400" />
                          <span>WIND VECTOR</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {weatherData.current.windSpeed} <span className="text-xs font-normal text-slate-400">km/h</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          Dir: {weatherData.current.windDirectionCardinal} ({weatherData.current.windDirection}°)
                        </div>
                      </div>

                      {/* Precipitation */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                          <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                          <span>PRECIPITATION</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {weatherData.current.precipitation} <span className="text-xs font-normal text-slate-400">mm</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Rain: {weatherData.current.rain} mm/h
                        </div>
                      </div>

                      {/* Thermal Index */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                          <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                          <span>THERMAL INDEX</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {weatherData.current.apparentTemperature.toFixed(1)}°C
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Delta: {(weatherData.current.apparentTemperature - weatherData.current.temperature).toFixed(1)}°C
                        </div>
                      </div>
                    </div>

                    {/* Attribution & Integrity Footer */}
                    <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                      <span>Data Source: <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Open-Meteo.com</a> (CC BY 4.0)</span>
                      <span>Numerical Weather Prediction Model • Not a direct physical station reading</span>
                    </div>
                  </div>
                </div>

                {/* 24-Hour Hourly Forecast Horizontal Scroller */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      24-Hour Timeline Forecast
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Hourly temperature, conditions & rain chance
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                    {weatherData.hourly.map((hour, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 min-w-[76px] shrink-0 space-y-1.5 text-xs text-center"
                      >
                        <span className="text-[10px] font-mono text-slate-400 font-semibold">
                          {hour.hourLabel}
                        </span>
                        <div className="my-1">
                          {renderWeatherIcon(hour.iconName, 'w-6 h-6')}
                        </div>
                        <span className="font-bold text-white font-mono">
                          {hour.temperature}°C
                        </span>
                        <div className="text-[10px] text-sky-400 flex items-center gap-0.5 font-mono">
                          <Droplets className="w-2.5 h-2.5" />
                          <span>{hour.precipitationProbability}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7-Day Extended Forecast Grid */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      7-Day Meteorological Outlook
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Min/Max Daily Boundaries & Precipitation
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {weatherData.daily.map((day, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col justify-between space-y-2 text-center"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-200">
                            {day.dayLabel}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {day.date.slice(5)}
                          </div>
                        </div>

                        <div className="flex justify-center my-1">
                          {renderWeatherIcon(day.iconName, 'w-7 h-7')}
                        </div>

                        <div className="text-[11px] font-semibold text-slate-300 leading-tight truncate" title={day.weatherCondition}>
                          {day.weatherCondition}
                        </div>

                        <div className="space-y-1 pt-1 border-t border-slate-800/80 font-mono text-xs">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-rose-400 font-bold">{day.tempMax}°</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-sky-400">{day.tempMin}°</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Rain:</span>
                            <span className="text-sky-300">{day.precipitationSum}mm</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Chance:</span>
                            <span className="text-emerald-400">{day.precipitationProbabilityMax}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* ========================================================================= */}
        {/* SECTION B — WEATHER NEWS NEAR YOU */}
        {/* ========================================================================= */}
        {(activeSubTab === 'DASHBOARD' || activeSubTab === 'LOCAL_NEWS') && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-amber-400" />
                  <span>Weather News Near You</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({selectedLocation.city} / {selectedLocation.region})
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Official meteorological department bulletins (IMD), monsoon forecasts, rainfall alerts & regional reports.
                </p>
              </div>

              {/* Local News Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={localNewsSearch}
                  onChange={(e) => setLocalNewsSearch(e.target.value)}
                  placeholder="Filter local articles..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Category Filter Pills for Local News */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-mono text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-amber-400" />
                TOPIC:
              </span>
              {[
                { id: 'ALL', label: 'All Updates' },
                { id: 'CYCLONES_HURRICANES', label: 'Cyclones & Depressions' },
                { id: 'EXTREME_RAIN_FLOOD', label: 'Rainfall & Monsoon' },
                { id: 'SEVERE_STORMS', label: 'Thunderstorms & Hail' },
                { id: 'HEATWAVE_DROUGHT', label: 'Heatwave & Temperature' },
                { id: 'METEOROLOGY_GENERAL', label: 'IMD Bulletins' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setLocalCategoryFilter(cat.id as WeatherNewsCategory)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                    localCategoryFilter === cat.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Local News Article Cards */}
            {localNewsLoading && localNews.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-slate-400 font-mono">Retrieving regional meteorological RSS bulletins...</p>
              </div>
            ) : localNewsError && localNews.length === 0 ? (
              <div className="p-4 bg-amber-950/30 border border-amber-800/80 rounded-xl text-xs text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{localNewsError}</span>
              </div>
            ) : filteredLocalNews.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
                No local weather news matched your filter criteria for {selectedLocation.city}.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLocalNews.slice(0, localVisibleCount).map((article) => (
                  <div
                    key={article.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col justify-between shadow-lg transition space-y-3"
                  >
                    <div className="space-y-2">
                      {/* Badges: Publisher & Category */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                            {article.publisher}
                          </span>

                          {article.isOfficialBulletin && (
                            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              Official IMD
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getCategoryBadge(
                            article.category
                          )}`}
                        >
                          {article.category.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Headline */}
                      <h3 className="font-bold text-sm text-slate-100 leading-snug hover:text-amber-400 transition">
                        {article.headline}
                      </h3>

                      {/* Snippet */}
                      {article.snippet && (
                        <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                          {article.snippet}
                        </p>
                      )}
                    </div>

                    {/* Footer: Date, Time & Source Link */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{article.publishedDate}</span>
                        {article.publishedTime && (
                          <span className="text-slate-500">
                            • {article.publishedTime} {article.timezoneLabel}
                          </span>
                        )}
                      </div>

                      <a
                        href={article.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-sans text-xs font-semibold transition"
                      >
                        <span>Read Original</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load More Button for Local News */}
            {filteredLocalNews.length > localVisibleCount && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setLocalVisibleCount((prev) => prev + 6)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-400 border border-slate-800 hover:border-amber-500/40 transition"
                >
                  Load More Local Articles ({filteredLocalNews.length - localVisibleCount} remaining)
                </button>
              </div>
            )}
          </section>
        )}

        {/* ========================================================================= */}
        {/* SECTION C — GLOBAL WEATHER NEWS */}
        {/* ========================================================================= */}
        {(activeSubTab === 'DASHBOARD' || activeSubTab === 'GLOBAL_NEWS') && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-400" />
                  <span>Global Weather News</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Tropical cyclones, hurricanes, severe meteorological developments & extreme weather bulletins worldwide.
                </p>
              </div>

              {/* Global News Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={globalNewsSearch}
                  onChange={(e) => setGlobalNewsSearch(e.target.value)}
                  placeholder="Filter global articles..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Region & Category Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Region Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-mono text-slate-500 mr-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-blue-400" />
                  REGION:
                </span>
                {[
                  { id: 'ALL', label: 'All Regions' },
                  { id: 'ASIA_PACIFIC', label: 'Asia-Pacific' },
                  { id: 'AMERICAS', label: 'Americas' },
                  { id: 'EUROPE', label: 'Europe' },
                  { id: 'AFRICA_MIDDLE_EAST', label: 'Africa & M.E.' },
                  { id: 'GLOBAL', label: 'International' },
                ].map((reg) => (
                  <button
                    key={reg.id}
                    onClick={() => setGlobalRegionFilter(reg.id as WeatherNewsRegion)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      globalRegionFilter === reg.id
                        ? 'bg-blue-600 text-white border-blue-400 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {reg.label}
                  </button>
                ))}
              </div>

              {/* Category Dropdown/Pills */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] font-mono text-slate-500">CATEGORY:</span>
                <select
                  value={globalCategoryFilter}
                  onChange={(e) => setGlobalCategoryFilter(e.target.value as WeatherNewsCategory)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-sans"
                >
                  <option value="ALL">All Severe Weather</option>
                  <option value="CYCLONES_HURRICANES">Cyclones & Hurricanes</option>
                  <option value="EXTREME_RAIN_FLOOD">Floods & Extreme Rain</option>
                  <option value="HEATWAVE_DROUGHT">Heatwave & Drought</option>
                  <option value="SEVERE_STORMS">Severe Storms</option>
                  <option value="METEOROLOGY_GENERAL">General Meteorology</option>
                </select>
              </div>
            </div>

            {/* Global News Cards Grid */}
            {globalNewsLoading && globalNews.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-slate-400 font-mono">Aggregating international meteorological feeds (GDACS, BBC, Global Wire)...</p>
              </div>
            ) : globalNewsError && globalNews.length === 0 ? (
              <div className="p-4 bg-blue-950/30 border border-blue-800/80 rounded-xl text-xs text-blue-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0" />
                <span>{globalNewsError}</span>
              </div>
            ) : filteredGlobalNews.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
                No international weather news matched your filter selections.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredGlobalNews.slice(0, globalVisibleCount).map((article) => (
                  <div
                    key={article.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col justify-between shadow-lg transition space-y-3"
                  >
                    <div className="space-y-2">
                      {/* Region & Publisher Header */}
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold uppercase text-slate-400 truncate max-w-[120px]">
                          {article.publisher}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          {article.locationOrRegion}
                        </span>
                      </div>

                      {/* Headline */}
                      <h3 className="font-bold text-sm text-slate-100 leading-snug hover:text-blue-400 transition">
                        {article.headline}
                      </h3>

                      {/* Snippet */}
                      {article.snippet && (
                        <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                          {article.snippet}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span>{article.publishedDate}</span>
                        {article.publishedTime && <span>{article.publishedTime} UTC</span>}
                      </div>

                      <a
                        href={article.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-1.5 px-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 flex items-center justify-center gap-1.5 text-xs font-semibold transition"
                      >
                        <span>Read Source Report</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load More Button for Global News */}
            {filteredGlobalNews.length > globalVisibleCount && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setGlobalVisibleCount((prev) => prev + 8)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-blue-400 border border-slate-800 hover:border-blue-500/40 transition"
                >
                  Load More International Reports ({filteredGlobalNews.length - globalVisibleCount} remaining)
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
