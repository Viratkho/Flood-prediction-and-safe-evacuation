import React, { useState } from 'react';
import {
  RegisteredPerson,
  RescuePriorityLevel,
  HealthThresholds,
  ReliefCentre,
} from '../types/floodguard';
import { DEFAULT_HEALTH_THRESHOLDS } from '../services/priorityEngine';
import {
  AlertCircle,
  AlertTriangle,
  Battery,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Filter,
  Heart,
  HeartPulse,
  Info,
  MapPin,
  Navigation,
  Plus,
  Radio,
  Search,
  Shield,
  Sliders,
  Smartphone,
  User,
  Users,
  Waves,
  Wifi,
  WifiOff,
  X,
  Bot,
} from 'lucide-react';

interface PersonMonitoringPanelProps {
  people: RegisteredPerson[];
  reliefCentres: ReliefCentre[];
  onSelectPersonOnMap?: (person: RegisteredPerson) => void;
  onAssignResponder?: (personId: string, responderId: string) => void;
  onOpenSmsModal?: (person: RegisteredPerson) => void;
  onOpenIntakeModal?: () => void;
  onAdviseWithAi?: (person: RegisteredPerson) => void;
  thresholds?: HealthThresholds;
  onUpdateThresholds?: (t: HealthThresholds) => void;
}

export const PersonMonitoringPanel: React.FC<PersonMonitoringPanelProps> = ({
  people,
  reliefCentres,
  onSelectPersonOnMap,
  onAssignResponder,
  onOpenSmsModal,
  onOpenIntakeModal,
  onAdviseWithAi,
  thresholds = DEFAULT_HEALTH_THRESHOLDS,
  onUpdateThresholds,
}) => {
  const [selectedPerson, setSelectedPerson] = useState<RegisteredPerson | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [driftFilter, setDriftFilter] = useState<string>('ALL');
  const [isConfiguringThresholds, setIsConfiguringThresholds] = useState(false);
  const [tempThresholds, setTempThresholds] = useState<HealthThresholds>(thresholds);

  // Filtered People List
  const filteredPeople = people.filter((p) => {
    // Search query
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.personId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.wearableId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.medicalNotes && p.medicalNotes.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    // Priority filter
    if (priorityFilter !== 'ALL' && p.rescuePriority !== priorityFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'SOS' && !p.sosActive) return false;
    if (statusFilter === 'OFFLINE' && p.commStatus !== 'OFFLINE' && p.commStatus !== 'UNREACHABLE') return false;
    if (statusFilter === 'STALE' && p.healthDataValidity !== 'STALE' && p.healthDataValidity !== 'UNKNOWN') return false;
    if (statusFilter === 'UNKNOWN' && (p.heartRateBpm !== null && p.spo2Percent !== null)) return false;

    // Drift filter
    if (driftFilter === 'DRIFTING' && p.driftStatus !== 'DRIFTING') return false;
    if (driftFilter === 'STATIONARY' && p.driftStatus !== 'STATIONARY') return false;

    return true;
  });

  // Priority color and badge styling
  const getPriorityBadge = (p: RescuePriorityLevel, isImmediateOverride: boolean) => {
    if (isImmediateOverride || p === 'P0') {
      return 'bg-red-500/20 text-red-400 border-red-500/50 font-extrabold animate-pulse';
    }
    if (p === 'P1') {
      return 'bg-[#ff7700]/20 text-[#ff7700] border-[#ff7700]/50 font-bold';
    }
    if (p === 'P2') {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
    }
    if (p === 'P3') {
      return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  };

  // Helper to render health status label adhering strictly to requirements:
  // "Only show Normal when valid, sufficiently fresh measurements and rules support it. Missing = Unknown."
  const getHealthStatusLabel = (person: RegisteredPerson) => {
    if (person.heartRateBpm === null || person.spo2Percent === null) {
      return { text: 'Unknown Vitals', color: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
    if (person.commStatus === 'OFFLINE' || person.commStatus === 'UNREACHABLE') {
      return { text: 'Offline', color: 'bg-slate-800 text-slate-500 border-slate-700' };
    }
    if (person.healthDataValidity === 'STALE') {
      return { text: 'Stale Data', color: 'bg-amber-950/60 text-amber-400 border-amber-800/80' };
    }
    if (person.healthDataValidity === 'DEGRADED') {
      return { text: 'Degraded Sensor', color: 'bg-amber-950/60 text-amber-300 border-amber-800/80' };
    }
    if (person.spo2Percent < thresholds.spo2Critical || person.heartRateBpm > thresholds.hrHighCritical) {
      return { text: 'Critical Vitals', color: 'bg-red-950/80 text-red-400 border-red-800 font-bold' };
    }
    if (person.spo2Percent < thresholds.spo2Warning || person.heartRateBpm > thresholds.hrHighWarning) {
      return { text: 'Warning Vitals', color: 'bg-orange-950/60 text-[#ff7700] border-orange-800' };
    }
    return { text: 'Normal', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' };
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row overflow-hidden bg-slate-950 text-slate-100">
      {/* Left List Column */}
      <div className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
        {/* Search & Filter Header Bar */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-white uppercase tracking-wider">
                  Person & Victim Monitoring
                </h2>
                <p className="text-[11px] text-slate-400">
                  Real-time physiological vitals, location accuracy & rescue prioritization
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenIntakeModal && (
                <button
                  onClick={onOpenIntakeModal}
                  className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#ff8811] hover:to-amber-400 text-xs font-bold text-white flex items-center gap-1.5 shadow transition"
                  title="Open Citizen Intake Form"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Intake</span>
                </button>
              )}

              {onOpenSmsModal && (
                <button
                  onClick={() => onOpenSmsModal(people[0])}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 shadow transition"
                  title="Dispatch Emergency Mobile SMS Alert"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Emergency SMS</span>
                </button>
              )}

              <button
                onClick={() => setIsConfiguringThresholds((c) => !c)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
                title="Configure Clinical Thresholds"
              >
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Clinical Thresholds</span>
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by person name, ID (e.g. P-101), wearable, or medical condition..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#ff7700]" />
              PRIORITY:
            </span>
            {['ALL', 'P0', 'P1', 'P2', 'P3', 'P4'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setPriorityFilter(lvl)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] border transition ${
                  priorityFilter === lvl
                    ? 'bg-slate-700 text-white border-white font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {lvl}
              </button>
            ))}

            <div className="h-3 w-px bg-slate-800 mx-1 hidden sm:block" />

            <span className="text-[11px] font-mono text-slate-400 mr-1">STATUS:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'SOS', label: 'SOS Alert' },
              { id: 'UNKNOWN', label: 'Missing Vitals' },
              { id: 'STALE', label: 'Stale' },
              { id: 'OFFLINE', label: 'Offline' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-2 py-0.5 rounded text-[11px] border transition ${
                  statusFilter === st.id
                    ? 'bg-slate-700 text-white border-white font-semibold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {st.label}
              </button>
            ))}

            <div className="h-3 w-px bg-slate-800 mx-1 hidden sm:block" />

            <span className="text-[11px] font-mono text-slate-400 mr-1">DRIFT:</span>
            {['ALL', 'DRIFTING', 'STATIONARY'].map((d) => (
              <button
                key={d}
                onClick={() => setDriftFilter(d)}
                className={`px-2 py-0.5 rounded text-[11px] border transition ${
                  driftFilter === d
                    ? 'bg-slate-700 text-white border-white font-semibold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Clinical Threshold Config Modal/Drawer */}
        {isConfiguringThresholds && (
          <div className="bg-slate-900 border-b border-slate-800 p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 font-mono">
                <Sliders className="w-4 h-4 text-sky-400" />
                Configurable Clinical Warning Thresholds
              </span>
              <button
                onClick={() => setIsConfiguringThresholds(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Clinically justified physiological boundaries used by the prioritization engine.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div>
                <label className="text-[10px] text-slate-400">SpO₂ Critical (&lt; %)</label>
                <input
                  type="number"
                  value={tempThresholds.spo2Critical}
                  onChange={(e) =>
                    setTempThresholds({ ...tempThresholds, spo2Critical: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">SpO₂ Warning (&lt; %)</label>
                <input
                  type="number"
                  value={tempThresholds.spo2Warning}
                  onChange={(e) =>
                    setTempThresholds({ ...tempThresholds, spo2Warning: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">HR High Critical (&gt; BPM)</label>
                <input
                  type="number"
                  value={tempThresholds.hrHighCritical}
                  onChange={(e) =>
                    setTempThresholds({ ...tempThresholds, hrHighCritical: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">HR High Warning (&gt; BPM)</label>
                <input
                  type="number"
                  value={tempThresholds.hrHighWarning}
                  onChange={(e) =>
                    setTempThresholds({ ...tempThresholds, hrHighWarning: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setTempThresholds(DEFAULT_HEALTH_THRESHOLDS);
                  onUpdateThresholds && onUpdateThresholds(DEFAULT_HEALTH_THRESHOLDS);
                }}
                className="px-3 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Reset Defaults
              </button>
              <button
                onClick={() => {
                  onUpdateThresholds && onUpdateThresholds(tempThresholds);
                  setIsConfiguringThresholds(false);
                }}
                className="px-3 py-1 rounded bg-[#ff7700] hover:bg-[#e66c00] text-white font-bold"
              >
                Apply Thresholds
              </button>
            </div>
          </div>
        )}

        {/* Person List Cards */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredPeople.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              No registered persons match the current search or filter criteria.
            </div>
          ) : (
            filteredPeople.map((person) => {
              const isSelected = selectedPerson?.personId === person.personId;
              const isP0 = person.rescuePriority === 'P0';
              const healthStatus = getHealthStatusLabel(person);
              const hasPoorGps = person.gpsAccuracyM > 25;

              return (
                <div
                  key={person.personId}
                  onClick={() => setSelectedPerson(person)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                    isSelected
                      ? 'bg-slate-800/90 border-[#ff7700] shadow-lg ring-1 ring-[#ff7700]'
                      : isP0
                      ? 'bg-red-950/20 hover:bg-red-950/40 border-red-900/60'
                      : 'bg-slate-900/70 hover:bg-slate-900 border-slate-800/90'
                  }`}
                >
                  {/* Left Column: ID, Name, Badges */}
                  <div className="space-y-1.5 flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        {person.personId} • {person.wearableId}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] font-mono ${getPriorityBadge(
                          person.rescuePriority,
                          person.priorityFactors.isImmediateDangerOverride
                        )}`}
                      >
                        {person.rescuePriority}{' '}
                        {person.priorityFactors.isImmediateDangerOverride ? '• OVERRIDE' : ''}
                      </span>

                      {person.sosActive && (
                        <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[10px] animate-pulse flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          SOS ACTIVE
                        </span>
                      )}

                      {person.driftStatus === 'DRIFTING' && (
                        <span className="px-2 py-0.5 rounded bg-cyan-600 text-white font-bold text-[10px] flex items-center gap-1">
                          <Waves className="w-3 h-3 animate-pulse" />
                          DRIFTING ({person.driftVelocityMs} m/s)
                        </span>
                      )}

                      <span
                        className={`px-1.5 py-0.2 rounded border text-[10px] font-mono ${healthStatus.color}`}
                      >
                        {healthStatus.text}
                      </span>

                      {person.isUserRegistered && (
                        <span className="px-1.5 py-0.2 rounded border border-amber-500/40 bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1 font-mono">
                          <MapPin className="w-3 h-3 text-[#ff7700]" />
                          PINNED CITIZEN
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-white">{person.name}</h3>
                      {person.age && (
                        <span className="text-[11px] text-slate-400">({person.age}y, {person.gender})</span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-snug truncate max-w-md">
                      {person.priorityReason}
                    </p>
                  </div>

                  {/* Middle Column: Physiological Readings */}
                  <div className="flex items-center gap-4 text-xs font-mono bg-slate-950/80 p-2 rounded-lg border border-slate-800 flex-shrink-0">
                    <div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Heart className="w-3 h-3 text-rose-400" />
                        HEART RATE
                      </div>
                      <div className="font-bold text-slate-100">
                        {person.heartRateBpm !== null ? (
                          <span>
                            {person.heartRateBpm} <span className="text-[10px] font-normal text-slate-400">BPM</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 font-sans">Unknown</span>
                        )}
                      </div>
                    </div>

                    <div className="w-px h-6 bg-slate-800" />

                    <div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <HeartPulse className="w-3 h-3 text-sky-400" />
                        SpO₂
                      </div>
                      <div
                        className={`font-bold ${
                          person.spo2Percent !== null && person.spo2Percent < thresholds.spo2Critical
                            ? 'text-red-400 font-extrabold'
                            : person.spo2Percent !== null && person.spo2Percent < thresholds.spo2Warning
                            ? 'text-[#ff7700]'
                            : 'text-slate-100'
                        }`}
                      >
                        {person.spo2Percent !== null ? (
                          `${person.spo2Percent}%`
                        ) : (
                          <span className="text-slate-500 font-sans">Unknown</span>
                        )}
                      </div>
                    </div>

                    <div className="w-px h-6 bg-slate-800" />

                    <div>
                      <div className="text-[10px] text-slate-400">FLOOD DEPTH</div>
                      <div
                        className={`font-bold ${
                          person.floodDepthCm >= 50
                            ? 'text-red-400'
                            : person.floodDepthCm >= 30
                            ? 'text-[#ff7700]'
                            : 'text-slate-100'
                        }`}
                      >
                        {person.floodDepthCm} cm
                      </div>
                    </div>
                  </div>

                  {/* Right Column: GPS, Comm & View Map */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <div className="text-right text-[10px] text-slate-400 font-mono hidden xl:block">
                      <div className="flex items-center justify-end gap-1">
                        <MapPin className="w-3 h-3 text-[#38bdf8]" />
                        <span>±{person.gpsAccuracyM}m accuracy</span>
                      </div>
                      <div className="text-slate-500">Comm: {person.lastCommunicationTime}</div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPersonOnMap && onSelectPersonOnMap(person);
                      }}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 transition"
                      title="Focus on Map"
                    >
                      <Crosshair className="w-4 h-4" />
                    </button>

                    {onOpenSmsModal && person.contactNumber && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSmsModal(person);
                        }}
                        className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 transition"
                        title={`Send Real Emergency SMS to ${person.contactNumber}`}
                      >
                        <Smartphone className="w-4 h-4" />
                      </button>
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Person Detail Panel / History / Vitals Charts */}
      {selectedPerson && (
        <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto shadow-2xl p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">
                {selectedPerson.personId} • {selectedPerson.wearableId}
              </span>
              <h2 className="font-bold text-base text-white">{selectedPerson.name}</h2>
              <div className="text-xs text-slate-400 mt-0.5">
                {selectedPerson.medicalNotes || 'No special medical conditions noted'}
              </div>
            </div>
            <button
              onClick={() => setSelectedPerson(null)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Rescue Priority Breakdown Card */}
          <div
            className={`p-3.5 rounded-xl border ${
              selectedPerson.rescuePriority === 'P0'
                ? 'bg-red-950/40 border-red-800 text-red-200'
                : selectedPerson.rescuePriority === 'P1'
                ? 'bg-orange-950/40 border-orange-800 text-orange-200'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
                Rescue Prioritization Decision
              </span>
              <span
                className={`px-2 py-0.5 rounded font-mono font-bold text-xs border ${getPriorityBadge(
                  selectedPerson.rescuePriority,
                  selectedPerson.priorityFactors.isImmediateDangerOverride
                )}`}
              >
                {selectedPerson.rescuePriority}{' '}
                {selectedPerson.priorityFactors.isImmediateDangerOverride ? '• OVERRIDE' : ''}
              </span>
            </div>

            <p className="text-xs font-semibold leading-relaxed mb-3">
              {selectedPerson.priorityReason}
            </p>

            {/* Contributing Factor Breakdown */}
            <div className="space-y-1.5 text-[11px] font-mono border-t border-slate-800/80 pt-2 text-slate-300">
              <div className="flex justify-between">
                <span>SOS Trigger:</span>
                <strong className={selectedPerson.sosActive ? 'text-red-400' : 'text-slate-400'}>
                  {selectedPerson.sosActive ? 'ACTIVE PANIC BEACON' : 'Normal'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Health Factor:</span>
                <strong className={selectedPerson.priorityFactors.healthSeverity === 'CRITICAL' ? 'text-red-400' : ''}>
                  {selectedPerson.priorityFactors.healthReason}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Flood Exposure:</span>
                <strong>{selectedPerson.priorityFactors.floodReason}</strong>
              </div>
              <div className="flex justify-between">
                <span>Drift Evidence:</span>
                <strong className={selectedPerson.driftStatus === 'DRIFTING' ? 'text-cyan-400' : ''}>
                  {selectedPerson.priorityFactors.driftReason}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Data Quality:</span>
                <span>
                  {selectedPerson.priorityFactors.dataQuality} (GPS ±{selectedPerson.gpsAccuracyM}m)
                </span>
              </div>
            </div>
          </div>

          {/* Vitals & Trend Charts Panel */}
          <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs font-mono text-slate-300 uppercase flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-rose-400" />
                Vitals Telemetry Trends
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Timestamp: {selectedPerson.healthTimestamp || 'N/A'}
              </span>
            </div>

            {/* Heart Rate Chart */}
            <div>
              <div className="flex justify-between items-baseline mb-1 text-xs">
                <span className="text-slate-400">Heart Rate (HR):</span>
                <span className="font-mono font-bold text-white">
                  {selectedPerson.heartRateBpm !== null ? (
                    `${selectedPerson.heartRateBpm} BPM`
                  ) : (
                    <span className="text-slate-500">Unknown / Missing</span>
                  )}
                </span>
              </div>

              {selectedPerson.heartRateHistory.length > 1 ? (
                <div className="w-full h-14 bg-slate-900 rounded p-1 border border-slate-800 flex items-end">
                  <svg viewBox="0 0 200 40" className="w-full h-full overflow-visible">
                    <polyline
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2"
                      points={selectedPerson.heartRateHistory
                        .map((pt, i) => {
                          const x = (i / (selectedPerson.heartRateHistory.length - 1)) * 200;
                          const y = 40 - Math.min(38, Math.max(2, (pt.value - 50) * 0.4));
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                  </svg>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic py-2">
                  No historical HR waveform points recorded.
                </div>
              )}
            </div>

            {/* SpO2 Chart */}
            <div>
              <div className="flex justify-between items-baseline mb-1 text-xs">
                <span className="text-slate-400">Blood Oxygen (SpO₂):</span>
                <span
                  className={`font-mono font-bold ${
                    selectedPerson.spo2Percent !== null && selectedPerson.spo2Percent < thresholds.spo2Critical
                      ? 'text-red-400'
                      : 'text-sky-400'
                  }`}
                >
                  {selectedPerson.spo2Percent !== null ? (
                    `${selectedPerson.spo2Percent}%`
                  ) : (
                    <span className="text-slate-500">Unknown / Submerged Sensor</span>
                  )}
                </span>
              </div>

              {selectedPerson.spo2History.length > 1 ? (
                <div className="w-full h-14 bg-slate-900 rounded p-1 border border-slate-800 flex items-end">
                  <svg viewBox="0 0 200 40" className="w-full h-full overflow-visible">
                    {/* Critical threshold line at 90% */}
                    <line x1="0" y1="24" x2="200" y2="24" stroke="#ef4444" strokeDasharray="3,3" strokeWidth="1" />
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      points={selectedPerson.spo2History
                        .map((pt, i) => {
                          const x = (i / (selectedPerson.spo2History.length - 1)) * 200;
                          const y = 40 - Math.min(38, Math.max(2, (pt.value - 80) * 2));
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                  </svg>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic py-2">
                  No historical SpO₂ waveform points recorded.
                </div>
              )}
            </div>
          </div>

          {/* GPS & Environmental Metrics */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2">
            <span className="font-bold text-xs font-mono text-slate-300 uppercase flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#38bdf8]" />
              Geographic & Environmental Telemetry
            </span>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block">COORDINATES</span>
                <span className="text-slate-200">
                  {selectedPerson.lat.toFixed(4)}, {selectedPerson.lng.toFixed(4)}
                </span>
              </div>
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block">GPS ACCURACY</span>
                <span
                  className={selectedPerson.gpsAccuracyM > 25 ? 'text-amber-400 font-bold' : 'text-slate-200'}
                >
                  ±{selectedPerson.gpsAccuracyM} meters
                </span>
              </div>
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block">ELEVATION</span>
                <span className="text-slate-200">{selectedPerson.elevationM} m MSL</span>
              </div>
              <div className="bg-slate-900 p-2 rounded border border-slate-800">
                <span className="text-slate-500 block">BATTERY</span>
                <span className="text-emerald-400">{selectedPerson.batteryPercent}%</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => onSelectPersonOnMap && onSelectPersonOnMap(selectedPerson)}
              className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition"
            >
              <Navigation className="w-4 h-4" />
              Focus Victim on Tactical Map
            </button>

            {onOpenSmsModal && (
              <button
                onClick={() => onOpenSmsModal(selectedPerson)}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition"
              >
                <Smartphone className="w-4 h-4" />
                Dispatch Emergency SMS Alert to {selectedPerson.contactNumber || 'Mobile'}
              </button>
            )}

            {onAdviseWithAi && (
              <button
                onClick={() => onAdviseWithAi(selectedPerson)}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#ff8811] hover:to-amber-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition"
              >
                <Bot className="w-4 h-4" />
                Get Personalized Aegis AI Guidance
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
