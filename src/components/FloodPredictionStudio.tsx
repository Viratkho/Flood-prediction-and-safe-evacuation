import React, { useState, useEffect } from 'react';
import {
  Waves,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Database,
  MapPin,
  Clock,
  Shield,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  ArrowRight,
  User,
  Lock,
  Layers,
  Activity,
  Droplets,
  Thermometer,
  CloudRain
} from 'lucide-react';

interface PredictionRecord {
  id: number;
  userId?: number | null;
  locationId?: number | null;
  latitude: number;
  longitude: number;
  locationName: string;
  rainfall: number;
  waterLevel: number;
  riverLevel?: number | null;
  soilMoisture?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  predictionResult: string;
  riskLevel: 'NORMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  predictionConfidence: number;
  floodEtaMinutes?: number | null;
  severityScore: number;
  recommendation?: string;
  modelVersion: string;
  predictionTimestamp: string;
  createdAt: string;
}

interface LocationRecord {
  id: number;
  locationName: string;
  latitude: number;
  longitude: number;
  district?: string;
  state?: string;
  elevationM?: number;
}

interface FloodAlertRecord {
  id: number;
  location_id?: number | null;
  prediction_id?: number | null;
  alert_type: string;
  severity: string;
  alert_message: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  is_active: boolean;
}

interface SystemStatus {
  database: string;
  database_file: string;
  size_bytes: number;
  wal_mode: boolean;
  foreign_keys: string;
  metrics: {
    total_users: number;
    total_locations: number;
    total_predictions: number;
    total_alerts: number;
    active_alerts: number;
  };
}

interface FloodPredictionStudioProps {
  isAdmin?: boolean;
}

export const FloodPredictionStudio: React.FC<FloodPredictionStudioProps> = ({
  isAdmin = false,
}) => {
  // Form State
  const [locationName, setLocationName] = useState('Avadi Bus Terminus Junction');
  const [latitude, setLatitude] = useState<number>(13.1182);
  const [longitude, setLongitude] = useState<number>(80.1008);
  const [rainfall, setRainfall] = useState<number>(38.5);
  const [waterLevel, setWaterLevel] = useState<number>(20.8);
  const [riverLevel, setRiverLevel] = useState<number>(18.5);
  const [soilMoisture, setSoilMoisture] = useState<number>(72.0);
  const [temperature, setTemperature] = useState<number>(28.5);
  const [humidity, setHumidity] = useState<number>(88.0);
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>(1);

  // Data State
  const [latestPrediction, setLatestPrediction] = useState<PredictionRecord | null>(null);
  const [history, setHistory] = useState<PredictionRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<FloodAlertRecord[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'predict' | 'history' | 'locations' | 'alerts' | 'database'>('predict');

  // New location modal state
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocLat, setNewLocLat] = useState<number>(13.11);
  const [newLocLng, setNewLocLng] = useState<number>(80.10);
  const [newLocDistrict, setNewLocDistrict] = useState('Tiruvallur');
  const [newLocState, setNewLocState] = useState('Tamil Nadu');
  const [newLocElevation, setNewLocElevation] = useState<number>(20.0);

  // Fetch initial data
  useEffect(() => {
    refreshAllData();
  }, []);

  const refreshAllData = async () => {
    fetchLocations();
    fetchHistory();
    fetchLatestPrediction();
    fetchActiveAlerts();
    fetchSystemStatus();
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
      }
    } catch {
      // offline fallback
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/locations');
      if (res.ok) {
        const data = await res.json();
        setLocations(data);
        if (data.length > 0 && !selectedLocationId) {
          setSelectedLocationId(data[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/predictions?limit=30');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchLatestPrediction = async () => {
    try {
      const res = await fetch('/api/predictions/latest');
      if (res.ok) {
        const data = await res.json();
        setLatestPrediction(data);
      }
    } catch {
      // no prediction yet
    }
  };

  const fetchActiveAlerts = async () => {
    try {
      const res = await fetch('/api/alerts/active');
      if (res.ok) {
        const data = await res.json();
        setActiveAlerts(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  };

  const handleLocationSelect = (locId: number) => {
    setSelectedLocationId(locId);
    const loc = locations.find((l) => l.id === locId);
    if (loc) {
      setLocationName(loc.locationName);
      setLatitude(loc.latitude);
      setLongitude(loc.longitude);
    }
  };

  const handleAddLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_name: newLocName.trim(),
          latitude: Number(newLocLat),
          longitude: Number(newLocLng),
          district: newLocDistrict.trim(),
          state: newLocState.trim(),
          elevation_m: Number(newLocElevation)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create location');
      }

      setFeedbackMsg({ type: 'success', text: `Location "${newLocName}" added to SQLite successfully!` });
      setShowAddLocation(false);
      setNewLocName('');
      fetchLocations();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error creating location' });
    }
  };

  const handlePredictionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const payload = {
        location_name: locationName.trim(),
        location_id: selectedLocationId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        rainfall: Number(rainfall),
        water_level: Number(waterLevel),
        river_level: Number(riverLevel),
        soil_moisture: Number(soilMoisture),
        temperature: Number(temperature),
        humidity: Number(humidity)
      };

      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Prediction processing error');
      }

      const savedRecord = await res.json();
      setLatestPrediction(savedRecord);
      setFeedbackMsg({
        type: 'success',
        text: `Prediction committed to SQLite (ID #${savedRecord.id}): Result is ${savedRecord.riskLevel} (${savedRecord.predictionConfidence}% confidence).`
      });

      // Refresh records & system status
      fetchHistory();
      fetchActiveAlerts();
      fetchSystemStatus();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Unable to complete prediction. Please verify inputs.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePrediction = async (id: number) => {
    if (!window.confirm(`Are you sure you want to delete prediction #${id} from SQLite?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/predictions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedbackMsg({ type: 'info', text: `Prediction #${id} removed from SQLite database.` });
        if (latestPrediction?.id === id) {
          setLatestPrediction(null);
        }
        fetchHistory();
        fetchSystemStatus();
      } else {
        throw new Error('Failed to delete prediction record');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await fetch('/api/system/backup', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFeedbackMsg({
          type: 'success',
          text: `Atomic SQLite backup created: ${data.backup_file} (${(data.file_size_bytes / 1024).toFixed(1)} KB)`
        });
        fetchSystemStatus();
      } else {
        throw new Error('Backup creation failed');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    } finally {
      setIsBackingUp(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'MODERATE':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'LOW':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/50';
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Top Banner / System Metadata */}
      <div className="max-w-7xl mx-auto mb-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-xl shadow-lg shadow-sky-500/20">
              <Waves className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  FloodGuard Hydro-Prediction & SQLite Hub
                </h1>
                <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  SQLITE 3 PERSISTENT
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                Direct integration between Python FastAPI backend, SQLAlchemy ORM, and local SQLite database.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <button
                onClick={handleBackup}
                disabled={isBackingUp}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 shadow"
                title="Performs atomic online backup via native SQLite backup API"
              >
                <Download className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-bounce' : ''}`} />
                <span>{isBackingUp ? 'Backing Up...' : 'SQLite Backup'}</span>
              </button>
            )}
            <button
              onClick={refreshAllData}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition active:scale-95 shadow"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Database Metrics Bar */}
        {systemStatus && (
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Database Engine</span>
              <span className="font-mono font-bold text-sky-400">{systemStatus.database} (WAL Mode)</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Database Size</span>
              <span className="font-mono font-bold text-slate-200">
                {(systemStatus.size_bytes / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Total Predictions</span>
              <span className="font-mono font-bold text-indigo-400">
                {systemStatus.metrics.total_predictions}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Monitored Locations</span>
              <span className="font-mono font-bold text-teal-400">
                {systemStatus.metrics.total_locations}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Active Alerts</span>
              <span className="font-mono font-bold text-amber-400">
                {systemStatus.metrics.active_alerts}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Zero-Cost License</span>
              <span className="font-mono font-bold text-emerald-400">100% Free / Local</span>
            </div>
          </div>
        )}
      </div>

      {/* Feedback Alert Toast */}
      {feedbackMsg && (
        <div
          className={`max-w-7xl mx-auto mb-6 p-4 rounded-xl border flex items-center justify-between transition-all ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : feedbackMsg.type === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : feedbackMsg.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            ) : (
              <Database className="w-5 h-5 text-sky-400 flex-shrink-0" />
            )}
            <p className="text-sm">{feedbackMsg.text}</p>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs opacity-75 hover:opacity-100 uppercase tracking-wider font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mb-6 flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('predict')}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition ${
            activeTab === 'predict'
              ? 'bg-[#ff7700] text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Waves className="w-4 h-4" />
          <span>New Prediction</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition ${
            activeTab === 'history'
              ? 'bg-[#ff7700] text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Prediction History ({history.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('locations')}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition ${
            activeTab === 'locations'
              ? 'bg-[#ff7700] text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Catchment Locations ({locations.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition ${
            activeTab === 'alerts'
              ? 'bg-[#ff7700] text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Active Alerts ({activeAlerts.length})</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* ==========================================================
            TAB 1: PREDICTION INPUT & REAL-TIME EVALUATION
           ========================================================== */}
        {activeTab === 'predict' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Columns: Prediction Inputs */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CloudRain className="w-5 h-5 text-sky-400" />
                  <h2 className="text-base font-bold text-white uppercase tracking-wider">
                    Catchment Hydrological Inputs
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-400">Pydantic Validated</span>
              </div>

              <form onSubmit={handlePredictionSubmit} className="space-y-4">
                {/* Location Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Select Monitored Catchment Sector
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedLocationId || ''}
                      onChange={(e) => handleLocationSelect(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.locationName} ({loc.district || 'Avadi'}, {loc.state || 'Tamil Nadu'})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowAddLocation(true)}
                      className="px-3 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl flex items-center gap-1 text-xs font-bold"
                      title="Add new monitored location"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">Add</span>
                    </button>
                  </div>
                </div>

                {/* Custom Name Override & Coordinates */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Location Label</label>
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Latitude (°N)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="-90"
                      max="90"
                      value={latitude}
                      onChange={(e) => setLatitude(parseFloat(e.target.value))}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Longitude (°E)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="-180"
                      max="180"
                      value={longitude}
                      onChange={(e) => setLongitude(parseFloat(e.target.value))}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                </div>

                {/* Primary Hydrological Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-sky-400">Catchment Rainfall</label>
                      <span className="text-xs font-mono font-bold text-white">{rainfall} mm</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="150"
                      step="0.5"
                      value={rainfall}
                      onChange={(e) => setRainfall(parseFloat(e.target.value))}
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                      <span>0 mm (Dry)</span>
                      <span>50 mm (Heavy)</span>
                      <span>150 mm (Extreme)</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-amber-400">Dam / Reservoir Water Level</label>
                      <span className="text-xs font-mono font-bold text-white">{waterLevel} m</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="26"
                      step="0.1"
                      value={waterLevel}
                      onChange={(e) => setWaterLevel(parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                      <span>10.0 m (Low)</span>
                      <span>20.4 m (Normal)</span>
                      <span>24.0 m (Crest)</span>
                    </div>
                  </div>
                </div>

                {/* Secondary Hydrological & Weather Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Tributary River (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={riverLevel}
                      onChange={(e) => setRiverLevel(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Soil Moisture (%)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={soilMoisture}
                      onChange={(e) => setSoilMoisture(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Temperature (°C)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="-10"
                      max="55"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Humidity (%)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={humidity}
                      onChange={(e) => setHumidity(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#e66c00] hover:to-amber-600 text-white font-bold text-sm uppercase tracking-wider shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition transform active:scale-98"
                  >
                    <Activity className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                    <span>
                      {isSubmitting
                        ? 'Executing Hydrological Model & Committing to SQLite...'
                        : 'Run Model & Commit Prediction to SQLite'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right 5 Columns: Active/Latest Prediction Result Card */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Shield className="w-4 h-4 text-sky-400" />
                      Evaluated Risk Output
                    </span>
                    {latestPrediction && (
                      <span className="text-xs font-mono text-slate-500">
                        Record #{latestPrediction.id}
                      </span>
                    )}
                  </div>

                  {latestPrediction ? (
                    <div className="space-y-4">
                      {/* Risk Badge */}
                      <div
                        className={`p-4 rounded-xl border text-center transition-all ${getRiskColor(
                          latestPrediction.riskLevel
                        )}`}
                      >
                        <span className="text-xs font-bold uppercase tracking-widest block opacity-75">
                          Calculated Flood Risk
                        </span>
                        <span className="text-2xl sm:text-3xl font-black tracking-tight block my-1">
                          {latestPrediction.predictionResult}
                        </span>
                        <div className="flex items-center justify-center gap-4 text-xs font-mono mt-2">
                          <span>Confidence: {latestPrediction.predictionConfidence}%</span>
                          <span>•</span>
                          <span>
                            Inundation ETA:{' '}
                            {latestPrediction.floodEtaMinutes !== null && latestPrediction.floodEtaMinutes !== undefined
                              ? latestPrediction.floodEtaMinutes === 0
                                ? 'IMMINENT / SUBMERGED'
                                : `${latestPrediction.floodEtaMinutes} mins`
                              : 'None (Safe)'}
                          </span>
                        </div>
                      </div>

                      {/* Severity Metric */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-slate-400">Severity Metric</span>
                          <span className="font-mono text-white">
                            {(latestPrediction.severityScore * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              latestPrediction.severityScore > 0.7
                                ? 'bg-red-500'
                                : latestPrediction.severityScore > 0.4
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, latestPrediction.severityScore * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Actionable Safety Recommendation */}
                      <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                        <span className="text-xs font-bold text-sky-400 uppercase tracking-wider block mb-1">
                          Tactical Recommendation:
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {latestPrediction.recommendation || 'Hydrological parameters stable.'}
                        </p>
                      </div>

                      {/* Location & Metadata Snapshot */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-500 block">Sector</span>
                          <span className="text-slate-200 truncate block">{latestPrediction.locationName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Timestamp</span>
                          <span className="text-slate-200">{latestPrediction.predictionTimestamp}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <Waves className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No prediction evaluated yet.</p>
                      <p className="text-xs text-slate-600 mt-1">
                        Submit catchment inputs on the left to execute the hydrological model and persist results to SQLite.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Engine: Deterministic Hydrology v2.1</span>
                  <span>ACID Transactional Persistence</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================
            TAB 2: PREDICTION HISTORY (SQLITE)
           ========================================================== */}
        {activeTab === 'history' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white uppercase tracking-wider">
                  Persistent Prediction History (SQLite)
                </h2>
              </div>
              <button
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 text-slate-300"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                <span>Reload</span>
              </button>
            </div>

            {history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 uppercase tracking-wider">
                      <th className="py-3 px-3">ID</th>
                      <th className="py-3 px-3">Location</th>
                      <th className="py-3 px-3">Rainfall</th>
                      <th className="py-3 px-3">Water Level</th>
                      <th className="py-3 px-3">Risk Level</th>
                      <th className="py-3 px-3">Confidence</th>
                      <th className="py-3 px-3">Timestamp</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {history.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3 font-bold text-sky-400">#{record.id}</td>
                        <td className="py-3 px-3 font-sans font-medium text-slate-200">
                          {record.locationName}
                        </td>
                        <td className="py-3 px-3 text-slate-300">{record.rainfall} mm</td>
                        <td className="py-3 px-3 text-slate-300">{record.waterLevel} m</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getRiskColor(
                              record.riskLevel
                            )}`}
                          >
                            {record.riskLevel}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">{record.predictionConfidence}%</td>
                        <td className="py-3 px-3 text-slate-400">{record.predictionTimestamp}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeletePrediction(record.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition"
                            title="Delete record from SQLite"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No historical prediction records found in SQLite.</p>
              </div>
            )}
          </div>
        )}

        {/* ==========================================================
            TAB 3: MONITORED CATCHMENT LOCATIONS
           ========================================================== */}
        {activeTab === 'locations' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-teal-400" />
                <h2 className="text-base font-bold text-white uppercase tracking-wider">
                  Catchment Geographical Sectors (SQLite)
                </h2>
              </div>
              <button
                onClick={() => setShowAddLocation(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Register Location</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  onClick={() => {
                    handleLocationSelect(loc.id);
                    setActiveTab('predict');
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition transform hover:-translate-y-0.5 ${
                    selectedLocationId === loc.id
                      ? 'bg-slate-800/80 border-sky-500 shadow-lg shadow-sky-500/10'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold font-mono text-sky-400">LOC-0{loc.id}</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded">
                      {loc.elevationM ? `${loc.elevationM}m Elev` : 'Sea Level'}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-white mt-1 mb-2">{loc.locationName}</h3>
                  <div className="text-xs text-slate-400 font-mono space-y-0.5">
                    <p>Lat: {loc.latitude}°N</p>
                    <p>Lng: {loc.longitude}°E</p>
                    <p>
                      {loc.district}, {loc.state}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-sky-400 font-semibold">
                    <span>Use for Prediction</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==========================================================
            TAB 4: ACTIVE FLOOD ALERTS
           ========================================================== */}
        {activeTab === 'alerts' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white uppercase tracking-wider">
                  Active Emergency Flood Alerts (SQLite)
                </h2>
              </div>
              <button
                onClick={fetchActiveAlerts}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 text-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Alerts</span>
              </button>
            </div>

            {activeAlerts.length > 0 ? (
              <div className="space-y-3">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-xl border bg-slate-950 border-red-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 flex-shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-red-300">{alert.alert_type}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/30 text-red-200">
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{alert.alert_message}</p>
                        <span className="text-[11px] font-mono text-slate-500 mt-1 block">
                          Broadcast Timestamp: {alert.created_at}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500/50" />
                <p className="text-sm font-semibold text-slate-300">No Active Flood Alerts</p>
                <p className="text-xs text-slate-500 mt-1">
                  All catchment sectors currently operating within safe hydrological thresholds.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Monitored Location Modal */}
      {showAddLocation && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-3">Register Catchment Sector</h3>
            <form onSubmit={handleAddLocationSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Sector Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sekkadu Sluice Junction"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Latitude (°N)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="-90"
                    max="90"
                    required
                    value={newLocLat}
                    onChange={(e) => setNewLocLat(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Longitude (°E)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="-180"
                    max="180"
                    required
                    value={newLocLng}
                    onChange={(e) => setNewLocLng(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">District</label>
                  <input
                    type="text"
                    value={newLocDistrict}
                    onChange={(e) => setNewLocDistrict(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Elevation (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newLocElevation}
                    onChange={(e) => setNewLocElevation(parseFloat(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddLocation(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-bold hover:bg-sky-600 shadow"
                >
                  Save to SQLite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
