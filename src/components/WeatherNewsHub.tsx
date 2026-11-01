import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import {
  LocationWeatherData,
  HourlyForecastItem,
  DailyForecastItem,
  CitySearchResult,
  WeatherNewsArticle,
  WeatherNewsCategory,
  WeatherNewsRegion,
  SharedLocationState,
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
  Activity,
  ShieldAlert,
  CheckCircle2,
  Bell,
  Waves,
} from 'lucide-react';

interface WeatherNewsHubProps {
  userLocation?: [number, number];
  sharedLocation?: SharedLocationState;
  onUpdateSharedLocation?: (loc: SharedLocationState) => void;
  isAdmin?: boolean;
}

// Built-in Error Boundary to prevent page from ever opening blank
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}
class WeatherErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WeatherNewsHub ErrorBoundary caught an exception:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-slate-100 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Weather & News Recovery Console</h2>
          <p className="text-xs text-slate-400 max-w-md">
            A temporary component rendering error was intercepted. Click below to reset to the default Avadi Basin weather configuration.
          </p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem('floodguard_preferred_weather_location');
              } catch {}
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="px-4 py-2 rounded-xl bg-[#ff7700] hover:bg-[#ff8811] text-white text-xs font-bold transition shadow"
          >
            Reset Weather & News Hub
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_LOCATION = {
  lat: 13.1143,
  lon: 80.1015,
  city: 'Avadi Basin, Chennai',
  region: 'Tamil Nadu',
  country: 'India',
};

function normalizeLocation(raw: any, fallbackUserLocation?: [number, number]): {
  lat: number;
  lon: number;
  city: string;
  region: string;
  country: string;
} {
  if (!raw) {
    if (fallbackUserLocation && fallbackUserLocation[0] && fallbackUserLocation[1]) {
      return {
        lat: fallbackUserLocation[0],
        lon: fallbackUserLocation[1],
        city: 'Your GPS Vicinity',
        region: 'Tamil Nadu',
        country: 'India',
      };
    }
    return DEFAULT_LOCATION;
  }

  const lat = Number(raw.lat ?? raw.latitude);
  const lon = Number(raw.lon ?? raw.longitude ?? raw.lng);
  const city = String(raw.city ?? raw.placeName ?? raw.name ?? DEFAULT_LOCATION.city);
  const region = String(raw.region ?? raw.administrativeRegion ?? raw.admin1 ?? DEFAULT_LOCATION.region);
  const country = String(raw.country ?? DEFAULT_LOCATION.country);

  return {
    lat: isNaN(lat) ? DEFAULT_LOCATION.lat : lat,
    lon: isNaN(lon) ? DEFAULT_LOCATION.lon : lon,
    city,
    region,
    country,
  };
}

function getClientWmoInfo(code: number): { condition: string; icon: string } {
  switch (code) {
    case 0: return { condition: 'Clear Sky', icon: 'Sun' };
    case 1: return { condition: 'Mainly Clear', icon: 'SunDim' };
    case 2: return { condition: 'Partly Cloudy', icon: 'CloudSun' };
    case 3: return { condition: 'Overcast', icon: 'Cloud' };
    case 45: case 48: return { condition: 'Fog & Mist', icon: 'CloudFog' };
    case 51: return { condition: 'Light Drizzle', icon: 'CloudDrizzle' };
    case 53: return { condition: 'Moderate Drizzle', icon: 'CloudDrizzle' };
    case 55: return { condition: 'Dense Drizzle', icon: 'CloudDrizzle' };
    case 56: case 57: return { condition: 'Freezing Drizzle', icon: 'CloudSnow' };
    case 61: return { condition: 'Slight Rain', icon: 'CloudRain' };
    case 63: return { condition: 'Moderate Rain', icon: 'CloudRain' };
    case 65: return { condition: 'Heavy Rain', icon: 'CloudRain' };
    case 66: case 67: return { condition: 'Freezing Rain', icon: 'CloudSnow' };
    case 71: return { condition: 'Slight Snowfall', icon: 'CloudSnow' };
    case 73: return { condition: 'Moderate Snowfall', icon: 'CloudSnow' };
    case 75: return { condition: 'Heavy Snowfall', icon: 'CloudSnow' };
    case 77: return { condition: 'Snow Grains', icon: 'CloudSnow' };
    case 80: return { condition: 'Slight Rain Showers', icon: 'CloudRain' };
    case 81: return { condition: 'Moderate Rain Showers', icon: 'CloudRain' };
    case 82: return { condition: 'Violent Rain Showers', icon: 'CloudRain' };
    case 85: case 86: return { condition: 'Snow Showers', icon: 'CloudSnow' };
    case 95: return { condition: 'Thunderstorm', icon: 'CloudLightning' };
    case 96: case 99: return { condition: 'Thunderstorm with Hail', icon: 'CloudLightning' };
    default: return { condition: 'Fair Weather', icon: 'CloudSun' };
  }
}

function getClientWindCardinal(deg: number): string {
  if (isNaN(deg)) return 'VAR';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

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

export const WeatherNewsHub: React.FC<WeatherNewsHubProps> = ({
  userLocation,
  sharedLocation,
  onUpdateSharedLocation,
  isAdmin = false,
}) => {
  return (
    <WeatherErrorBoundary>
      <WeatherNewsHubContent
        userLocation={userLocation}
        sharedLocation={sharedLocation}
        onUpdateSharedLocation={onUpdateSharedLocation}
        isAdmin={isAdmin}
      />
    </WeatherErrorBoundary>
  );
};

const WeatherNewsHubContent: React.FC<WeatherNewsHubProps> = ({
  userLocation,
  sharedLocation,
  onUpdateSharedLocation,
}) => {
  // 1. Location state: robustly normalized
  const [selectedLocation, setSelectedLocation] = useState(() => {
    try {
      const stored = localStorage.getItem('floodguard_preferred_weather_location');
      if (stored) {
        return normalizeLocation(JSON.parse(stored), userLocation);
      }
    } catch {}
    if (sharedLocation) {
      return normalizeLocation(sharedLocation, userLocation);
    }
    return normalizeLocation(null, userLocation);
  });

  const locLat = selectedLocation.lat;
  const locLon = selectedLocation.lon;
  const locCity = selectedLocation.city;
  const locRegion = selectedLocation.region;
  const locCountry = selectedLocation.country;

  // 2. Weather state
  const [weatherData, setWeatherData] = useState<LocationWeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherCachedAt, setWeatherCachedAt] = useState<string | null>(null);

  // 3. News states
  const [newsCategory, setNewsCategory] = useState<'all' | 'chennai' | 'tamilnadu' | 'flood_alerts' | 'disaster_mgmt'>('all');
  const [newsArticles, setNewsArticles] = useState<WeatherNewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState<boolean>(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsCachedAt, setNewsCachedAt] = useState<string | null>(null);
  const [newsSearch, setNewsSearch] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(9);

  // 4. Search and UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'WEATHER' | 'NEWS'>('ALL');
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const weatherReqIdRef = useRef(0);
  const newsReqIdRef = useRef(0);

  // Synchronize with external SharedLocationState when parent updates it
  useEffect(() => {
    if (sharedLocation && sharedLocation.latitude && sharedLocation.longitude) {
      setSelectedLocation((prev) => {
        if (
          Math.abs(prev.lat - sharedLocation.latitude) < 0.0001 &&
          Math.abs(prev.lon - sharedLocation.longitude) < 0.0001 &&
          prev.city === sharedLocation.placeName
        ) {
          return prev;
        }
        return normalizeLocation(sharedLocation);
      });
    }
  }, [sharedLocation]);

  // Click outside to dismiss search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Weather with SQLite Backend & Direct Open-Meteo Fallback
  const fetchWeather = async (lat: number, lon: number, city: string, region: string, country: string) => {
    const reqId = ++weatherReqIdRef.current;
    setWeatherLoading(true);
    setWeatherError(null);

    // 1. Try Backend Proxy with SQLite Caching (/api/weather)
    try {
      const q = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        city: city || 'Local Basin',
        region: region || '',
        country: country || 'India',
      });
      const res = await fetch(`/api/weather?${q.toString()}`);
      if (res.ok) {
        const data: LocationWeatherData = await res.json();
        if (reqId === weatherReqIdRef.current && data && data.current) {
          setWeatherData(data);
          setWeatherError(null);
          setWeatherCachedAt(data.isCached ? (data.lastUpdated || 'Cached') : null);
          setWeatherLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Backend /api/weather unavailable, attempting direct Open-Meteo fetch:', e);
    }

    // 2. Direct Open-Meteo Fallback (Free, Non-Commercial Public API)
    try {
      const directUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;
      const res = await fetch(directUrl);
      if (res.ok) {
        const raw: any = await res.json();
        const curr = raw.current || {};
        const code = curr.weather_code ?? 0;
        const wInfo = getClientWmoInfo(code);
        const windDir = curr.wind_direction_10m ?? 0;

        // Hourly (24 hours)
        const hourlyTimes: string[] = raw.hourly?.time || [];
        const currentIsoTime = curr.time || '';
        let startIdx = hourlyTimes.findIndex((t: string) => t >= currentIsoTime);
        if (startIdx < 0) startIdx = 0;

        const hourlyList: HourlyForecastItem[] = [];
        for (let i = startIdx; i < Math.min(startIdx + 24, hourlyTimes.length); i++) {
          const hCode = raw.hourly?.weather_code?.[i] ?? 0;
          const hInfo = getClientWmoInfo(hCode);
          const rawT = hourlyTimes[i];
          hourlyList.push({
            time: rawT,
            hourLabel: rawT.slice(11, 16),
            temperature: Number((raw.hourly?.temperature_2m?.[i] ?? 0).toFixed(1)),
            humidity: Number((raw.hourly?.relative_humidity_2m?.[i] ?? 0).toFixed(0)),
            precipitationProbability: Number((raw.hourly?.precipitation_probability?.[i] ?? 0).toFixed(0)),
            precipitation: Number((raw.hourly?.precipitation?.[i] ?? 0).toFixed(1)),
            weatherCode: hCode,
            weatherCondition: hInfo.condition,
            iconName: hInfo.icon,
            windSpeed: Number((raw.hourly?.wind_speed_10m?.[i] ?? 0).toFixed(1)),
          });
        }

        // Daily (7 days)
        const dailyTimes: string[] = raw.daily?.time || [];
        const dailyList: DailyForecastItem[] = [];
        for (let i = 0; i < dailyTimes.length; i++) {
          const dCode = raw.daily?.weather_code?.[i] ?? 0;
          const dInfo = getClientWmoInfo(dCode);
          const dDate = dailyTimes[i];
          const dt = new Date(dDate);
          const dayLabel = i === 0 ? 'Today' : isNaN(dt.getTime()) ? dDate : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

          dailyList.push({
            date: dDate,
            dayLabel,
            weatherCode: dCode,
            weatherCondition: dInfo.condition,
            iconName: dInfo.icon,
            tempMax: Number((raw.daily?.temperature_2m_max?.[i] ?? 0).toFixed(1)),
            tempMin: Number((raw.daily?.temperature_2m_min?.[i] ?? 0).toFixed(1)),
            precipitationSum: Number((raw.daily?.precipitation_sum?.[i] ?? 0).toFixed(1)),
            precipitationProbabilityMax: Number((raw.daily?.precipitation_probability_max?.[i] ?? 0).toFixed(0)),
            windSpeedMax: Number((raw.daily?.wind_speed_10m_max?.[i] ?? 0).toFixed(1)),
          });
        }

        const parsed: LocationWeatherData = {
          success: true,
          provider: 'Open-Meteo Direct API',
          providerUrl: 'https://open-meteo.com/',
          isModelForecast: true,
          lastUpdated: new Date().toISOString(),
          location: { lat, lon, city, region, country },
          current: {
            temperature: Number((curr.temperature_2m ?? 0).toFixed(1)),
            apparentTemperature: Number((curr.apparent_temperature ?? curr.temperature_2m ?? 0).toFixed(1)),
            humidity: Number((curr.relative_humidity_2m ?? 0).toFixed(0)),
            weatherCode: code,
            weatherCondition: wInfo.condition,
            iconName: wInfo.icon,
            precipitation: Number((curr.precipitation ?? 0).toFixed(1)),
            rain: Number((curr.rain ?? 0).toFixed(1)),
            windSpeed: Number((curr.wind_speed_10m ?? 0).toFixed(1)),
            windDirection: windDir,
            windDirectionCardinal: getClientWindCardinal(windDir),
            isDay: Boolean(curr.is_day),
            timestamp: curr.time || new Date().toISOString(),
          },
          hourly: hourlyList,
          daily: dailyList,
        };

        if (reqId === weatherReqIdRef.current) {
          setWeatherData(parsed);
          setWeatherError(null);
          setWeatherCachedAt(null);
          setWeatherLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Direct Open-Meteo fetch error:', e);
    }

    if (reqId === weatherReqIdRef.current) {
      setWeatherData(null);
      setWeatherError('Weather data is temporarily unavailable. Check your connection or retry.');
      setWeatherLoading(false);
    }
  };

  // Fetch News from Free Backend RSS Feeds
  const fetchNews = async (cat: string = newsCategory) => {
    const reqId = ++newsReqIdRef.current;
    setNewsLoading(true);
    setNewsError(null);

    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(cat)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        if (reqId === newsReqIdRef.current) {
          if (Array.isArray(data.articles) && data.articles.length > 0) {
            setNewsArticles(data.articles);
            setNewsError(null);
            setNewsCachedAt(data.isCached ? (data.lastUpdated || 'Cached') : null);
            setNewsLoading(false);
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Fetch /api/news warning:', e);
    }

    // Try fallback to /api/weather/news/local if /api/news returned empty
    try {
      const res = await fetch(`/api/weather/news/local?query=${encodeURIComponent(locCity)}`);
      if (res.ok) {
        const data = await res.json();
        if (reqId === newsReqIdRef.current && Array.isArray(data.articles) && data.articles.length > 0) {
          setNewsArticles(data.articles);
          setNewsError(null);
          setNewsCachedAt(data.isCached ? (data.lastUpdated || 'Cached') : null);
          setNewsLoading(false);
          return;
        }
      }
    } catch {}

    if (reqId === newsReqIdRef.current) {
      setNewsArticles([]);
      setNewsError('Currently, no news articles are available. Please try again later.');
      setNewsLoading(false);
    }
  };

  // Load weather and news when location changes
  useEffect(() => {
    fetchWeather(locLat, locLon, locCity, locRegion, locCountry);
    fetchNews(newsCategory);
  }, [locLat, locLon, locCity]);

  // Debounced geocoding search
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

  const handleSelectCity = (c: CitySearchResult) => {
    const newLoc = {
      lat: Number(c.latitude.toFixed(4)),
      lon: Number(c.longitude.toFixed(4)),
      city: c.name,
      region: c.admin1 || c.country,
      country: c.country,
    };
    setSelectedLocation(newLoc);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);

    if (onUpdateSharedLocation) {
      onUpdateSharedLocation({
        placeName: c.name,
        administrativeRegion: c.admin1 || '',
        country: c.country,
        countryCode: c.countryCode || '',
        latitude: newLoc.lat,
        longitude: newLoc.lon,
        timezone: c.timezone || '',
        locationSource: 'SEARCH',
      });
    }
  };

  const handleSaveDefault = () => {
    try {
      localStorage.setItem('floodguard_preferred_weather_location', JSON.stringify(selectedLocation));
      setGpsStatus(`Saved ${locCity} as your default location`);
      setTimeout(() => setGpsStatus(null), 3000);
    } catch {}
  };

  const isSavedAsDefault = (() => {
    try {
      const stored = localStorage.getItem('floodguard_preferred_weather_location');
      if (stored) {
        const parsed = normalizeLocation(JSON.parse(stored));
        return Math.abs(parsed.lat - locLat) < 0.01 && Math.abs(parsed.lon - locLon) < 0.01;
      }
    } catch {}
    return false;
  })();

  const handleUseDeviceGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('Geolocation not supported by browser');
      setTimeout(() => setGpsStatus(null), 3500);
      return;
    }
    setGpsStatus('Requesting device coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          city: 'Your GPS Location',
          region: 'Local Device Area',
          country: 'Current Vicinity',
        };
        setSelectedLocation(newLoc);
        setGpsStatus(`GPS acquired: ${newLoc.lat}°N, ${newLoc.lon}°E`);
        setTimeout(() => setGpsStatus(null), 3500);
      },
      () => {
        setGpsStatus('Location permission denied or unavailable.');
        setTimeout(() => setGpsStatus(null), 3500);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    await Promise.all([
      fetchWeather(locLat, locLon, locCity, locRegion, locCountry),
      fetchNews(newsCategory),
    ]);
    setIsRefreshingAll(false);
  };

  // Weather icon renderer
  const renderWeatherIcon = (iconName: string, className: string = 'w-6 h-6') => {
    switch (iconName) {
      case 'Sun': return <Sun className={`${className} text-amber-400`} />;
      case 'SunDim': return <SunDim className={`${className} text-amber-300`} />;
      case 'CloudSun': return <CloudSun className={`${className} text-amber-300`} />;
      case 'Cloud': return <Cloud className={`${className} text-slate-300`} />;
      case 'CloudFog': return <CloudFog className={`${className} text-slate-400`} />;
      case 'CloudDrizzle': return <CloudDrizzle className={`${className} text-sky-400`} />;
      case 'CloudRain': return <CloudRain className={`${className} text-blue-400`} />;
      case 'CloudSnow': return <CloudSnow className={`${className} text-cyan-200`} />;
      case 'CloudLightning': return <CloudLightning className={`${className} text-yellow-400`} />;
      default: return <CloudSun className={`${className} text-amber-300`} />;
    }
  };

  // Filter news articles by search keyword
  const filteredArticles = newsArticles.filter((a) => {
    if (!newsSearch.trim()) return true;
    const q = newsSearch.toLowerCase();
    return (
      a.headline.toLowerCase().includes(q) ||
      a.publisher.toLowerCase().includes(q) ||
      (a.snippet && a.snippet.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto selection:bg-[#ff7700] selection:text-white">
      {/* ========================================================================= */}
      {/* SECTION 1: WEATHER OVERVIEW & LOCATION SEARCH BAR                         */}
      {/* ========================================================================= */}
      <header className="p-4 sm:p-6 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                <CloudSun className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-xl md:text-2xl font-black text-white tracking-tight">
                    Weather & Meteorological News Hub
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold font-mono">
                    100% Free • Open-Meteo & RSS
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live atmospheric telemetry, 7-day model projections, Chennai & Tamil Nadu flood bulletins, and disaster wire.
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
            </div>
          </div>

          {/* Section Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'ALL'
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-[#ff7700]" />
                <span>Complete Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('WEATHER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'WEATHER'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CloudSun className="w-3.5 h-3.5 text-sky-400" />
                <span>Atmospheric Weather</span>
              </button>

              <button
                onClick={() => setActiveTab('NEWS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'NEWS'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5 text-amber-400" />
                <span>Flood & Disaster News</span>
              </button>
            </div>

            {/* Geocoding Search & Location Tool */}
            <div className="relative flex items-center gap-2 flex-1 max-w-md ml-auto" ref={searchBoxRef}>
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search city, town or basin..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                />
                {isSearching && (
                  <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin absolute right-3 top-2.5"></div>
                )}
              </div>

              <button
                onClick={handleUseDeviceGps}
                className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-400 transition"
                title="Use current device GPS coordinates"
              >
                <LocateFixed className="w-4 h-4" />
              </button>

              <button
                onClick={handleSaveDefault}
                className={`p-2 rounded-xl border transition ${
                  isSavedAsDefault
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
                title={isSavedAsDefault ? 'Current location is saved as your default' : 'Save current location as default'}
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

          {/* GPS Status Toast */}
          {gpsStatus && (
            <div className="p-2 bg-sky-950/80 border border-sky-500/40 rounded-lg text-xs text-sky-300 flex items-center gap-2">
              <LocateFixed className="w-3.5 h-3.5 shrink-0" />
              <span>{gpsStatus}</span>
            </div>
          )}

          {/* Preset Quick Cities */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-mono text-slate-500 shrink-0 mr-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#ff7700]" />
              Quick Cities:
            </span>
            {PRESET_QUICK_CITIES.map((c) => {
              const isSelected = Math.abs(locLat - c.lat) < 0.05 && Math.abs(locLon - c.lon) < 0.05;
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
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-8">
        {/* ========================================================================= */}
        {/* SECTION 2: CURRENT CONDITIONS (METEOROLOGICAL OBSERVATION)                */}
        {/* ========================================================================= */}
        {(activeTab === 'ALL' || activeTab === 'WEATHER') && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <CloudSun className="w-5 h-5 text-sky-400" />
                  <span>Current Weather Conditions</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({locCity}, {locRegion})
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time atmospheric observations, temperature, moisture, wind velocity, and precipitation indicators.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">
                  {locLat.toFixed(4)}°N, {locLon.toFixed(4)}°E
                </span>
                {weatherCachedAt && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">
                    Cached: {weatherCachedAt.slice(11, 16) || weatherCachedAt}
                  </span>
                )}
                {isSavedAsDefault && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                    ★ Preferred
                  </span>
                )}
              </div>
            </div>

            {/* Weather State Handling */}
            {weatherLoading ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs text-slate-400 font-mono">Fetching Open-Meteo atmospheric forecast...</p>
              </div>
            ) : weatherError ? (
              <div className="p-6 bg-red-950/30 border border-red-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-red-200">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-red-300">Weather Service Notice</div>
                    <div>{weatherError}</div>
                  </div>
                </div>
                <button
                  onClick={() => fetchWeather(locLat, locLon, locCity, locRegion, locCountry)}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Weather</span>
                </button>
              </div>
            ) : weatherData ? (
              <div className="space-y-4">
                {/* Weather Hero Card */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left: Big Temperature & Condition */}
                  <div className="lg:col-span-1 p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex flex-col justify-between shadow-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                          Current Observation
                        </div>
                        <h3 className="text-lg font-black text-white mt-0.5">
                          {locCity}
                        </h3>
                        <div className="text-xs text-slate-400">
                          {locRegion}, {locCountry}
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

                  {/* Right: Key Indicators */}
                  <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                        Atmospheric Key Indicators
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Open-Meteo High-Resolution Model
                      </span>
                    </div>

                    {/* Runoff Hazard Notice */}
                    {(weatherData.current.rain > 10 || weatherData.current.precipitation > 15) && (
                      <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-300 block">Heavy Atmospheric Precipitation Warning</span>
                          Precipitation model registers elevated rainfall rates ({Math.max(weatherData.current.rain, weatherData.current.precipitation)} mm/h).
                        </div>
                      </div>
                    )}

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
                          {weatherData.current.humidity > 80 ? 'High moisture' : 'Moderate'}
                        </div>
                      </div>

                      {/* Wind */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                          <Wind className="w-3.5 h-3.5 text-teal-400" />
                          <span>WIND SPEED</span>
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
                          <span>FEELS LIKE</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {weatherData.current.apparentTemperature.toFixed(1)}°C
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          Actual: {weatherData.current.temperature.toFixed(1)}°C
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                      <span>Source: Open-Meteo Free API (CC BY 4.0)</span>
                      <span>Numerical Model • Free & Localized</span>
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* SECTION 3: HOURLY FORECAST (24-HOUR TIMELINE)                             */}
                {/* ========================================================================= */}
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

                {/* ========================================================================= */}
                {/* SECTION 4: SEVEN-DAY METEOROLOGICAL FORECAST                             */}
                {/* ========================================================================= */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      7-Day Extended Meteorological Outlook
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Min/Max Daily Boundaries & Precipitation Sum
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
        {/* SECTIONS 5, 6, & 7: FLOOD, CHENNAI/TN, & DISASTER MANAGEMENT NEWS        */}
        {/* ========================================================================= */}
        {(activeTab === 'ALL' || activeTab === 'NEWS') && (
          <section className="space-y-5 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-amber-400" />
                  <span>Flood, Monsoon & Emergency News Wire</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Live public RSS feeds covering Chennai floods, Tamil Nadu monsoon updates, and National Disaster Management.
                </p>
              </div>

              {/* Keyword Filter */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={newsSearch}
                  onChange={(e) => setNewsSearch(e.target.value)}
                  placeholder="Filter news articles..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            {/* News Categories Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-mono text-slate-500 mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-amber-400" />
                  CATEGORY:
                </span>
                {[
                  { id: 'all', label: 'All Flood & Weather News' },
                  { id: 'chennai', label: 'Chennai Floods & Basin' },
                  { id: 'tamilnadu', label: 'Tamil Nadu Rainfall' },
                  { id: 'flood_alerts', label: 'India Flood Warnings' },
                  { id: 'disaster_mgmt', label: 'Disaster Management' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setNewsCategory(cat.id as any);
                      fetchNews(cat.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      newsCategory === cat.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {newsCachedAt && (
                <span className="text-[10px] font-mono text-slate-500">
                  RSS Cached: {newsCachedAt.slice(11, 16) || newsCachedAt}
                </span>
              )}
            </div>

            {/* News State Handling */}
            {newsLoading ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs text-slate-400 font-mono">Retrieving live public RSS meteorological news...</p>
              </div>
            ) : newsError && newsArticles.length === 0 ? (
              <div className="p-6 bg-amber-950/20 border border-amber-800/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-amber-200">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-amber-300">News Service Status</div>
                    <div>{newsError}</div>
                  </div>
                </div>
                <button
                  onClick={() => fetchNews(newsCategory)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry News</span>
                </button>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="p-10 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-3">
                <Newspaper className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-200 font-bold text-sm">
                  Currently, no news articles are available. Please try again later.
                </p>
                <button
                  onClick={() => {
                    setNewsSearch('');
                    setNewsCategory('all');
                    fetchNews('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold transition"
                >
                  Reset News Filters
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredArticles.slice(0, visibleCount).map((art) => (
                    <article
                      key={art.id}
                      className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col justify-between shadow-lg transition space-y-3 group hover:bg-slate-900/90"
                    >
                      <div className="space-y-2">
                        {/* Publisher & Category Badge */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                            {art.publisher}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {art.category.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Headline */}
                        <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-400 transition leading-snug">
                          {art.headline}
                        </h3>

                        {/* Summary */}
                        {art.snippet && (
                          <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                            {art.snippet}
                          </p>
                        )}
                      </div>

                      {/* Footer: Date & Link */}
                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{art.publishedDate}</span>
                        </div>

                        <a
                          href={art.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-sans text-xs font-semibold transition"
                        >
                          <span>Read Source</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </article>
                  ))}
                </div>

                {filteredArticles.length > visibleCount && (
                  <div className="text-center pt-2">
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 9)}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-400 border border-slate-800 hover:border-amber-500/40 transition"
                    >
                      Load More Articles ({filteredArticles.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
