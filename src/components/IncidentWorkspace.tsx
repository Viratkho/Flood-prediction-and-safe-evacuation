import React, { useState } from 'react';
import {
  IncidentRecord,
  RescuePriorityLevel,
  IncidentStatus,
  ReliefCentre,
} from '../types/floodguard';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crosshair,
  FileCheck,
  FileText,
  Filter,
  History,
  MapPin,
  MessageSquare,
  Navigation,
  Send,
  Shield,
  UserCheck,
  Users,
  Waves,
} from 'lucide-react';

interface IncidentWorkspaceProps {
  incidents: IncidentRecord[];
  onAcknowledge: (incidentId: string, note?: string) => Promise<void>;
  onAssignResponder: (incidentId: string, responderId: string, responderName: string) => Promise<void>;
  onUpdateStatus: (incidentId: string, status: IncidentStatus, note?: string) => Promise<void>;
  onResolve: (incidentId: string, notes: string) => Promise<void>;
  onSelectOnMap?: (lat: number, lng: number) => void;
}

export const IncidentWorkspace: React.FC<IncidentWorkspaceProps> = ({
  incidents,
  onAcknowledge,
  onAssignResponder,
  onUpdateStatus,
  onResolve,
  onSelectOnMap,
}) => {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(incidents[0]?.id || '');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedResponder, setSelectedResponder] = useState('WR-RESPONDER-01');
  const [resolutionNote, setResolutionNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const respondersList = [
    { id: 'WR-RESPONDER-01', name: 'NDRF Rescue Boat Team 3 (Captain Rajesh)' },
    { id: 'WR-RESPONDER-02', name: 'Fire & Rescue Tactical Unit Alpha (Inspector Mohan)' },
    { id: 'WR-RESPONDER-03', name: 'Coast Guard Shallow Hovercraft Unit (Avadi)' },
    { id: 'WR-RESPONDER-04', name: 'Civil Defense Rapid Evacuation Ambulance' },
  ];

  // Filtered incidents
  const filtered = incidents.filter((inc) => {
    if (statusFilter === 'ACTIVE' && inc.status === 'RESOLVED') return false;
    if (statusFilter !== 'ACTIVE' && statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && inc.priority !== priorityFilter) return false;
    return true;
  });

  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId) || filtered[0];

  const handleAcknowledge = async () => {
    if (!selectedIncident) return;
    try {
      setActionError(null);
      await onAcknowledge(selectedIncident.id, 'Acknowledged by Command Center Operator');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to acknowledge incident');
    }
  };

  const handleAssign = async () => {
    if (!selectedIncident) return;
    const resp = respondersList.find((r) => r.id === selectedResponder);
    if (!resp) return;
    try {
      setActionError(null);
      await onAssignResponder(selectedIncident.id, resp.id, resp.name);
      setIsAssigning(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign responder');
    }
  };

  const handleResolve = async () => {
    if (!selectedIncident || !resolutionNote.trim()) return;
    try {
      setActionError(null);
      await onResolve(selectedIncident.id, resolutionNote);
      setIsResolving(false);
      setResolutionNote('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to resolve incident');
    }
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row overflow-hidden bg-slate-950 text-slate-100">
      {/* Incident List Column */}
      <div className="w-full md:w-96 lg:w-[440px] bg-slate-900 border-r border-slate-800 flex flex-col z-10 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-white uppercase tracking-wider">
                  Incident Management
                </h2>
                <p className="text-[11px] text-slate-400">Operator Dispatch & Triage Workspace</p>
              </div>
            </div>

            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {filtered.length} INCIDENTS
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            {['ACTIVE', 'NEW', 'ACKNOWLEDGED', 'RESOLVED', 'ALL'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded text-[11px] border transition ${
                  statusFilter === st
                    ? 'bg-slate-700 text-white border-white font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {st}
              </button>
            ))}

            <div className="h-3 w-px bg-slate-800 mx-1" />

            {['ALL', 'P0', 'P1', 'P2'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                  priorityFilter === p
                    ? 'bg-slate-700 text-white border-white font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Incident List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              No matching incidents found.
            </div>
          ) : (
            filtered.map((inc) => {
              const isSelected = selectedIncident?.id === inc.id;
              const isP0 = inc.priority === 'P0';

              return (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncidentId(inc.id)}
                  className={`p-3 rounded-xl border transition cursor-pointer space-y-1.5 text-xs ${
                    isSelected
                      ? 'bg-slate-800/90 border-[#ff7700] ring-1 ring-[#ff7700] shadow'
                      : isP0
                      ? 'bg-red-950/20 hover:bg-red-950/40 border-red-900/60'
                      : 'bg-slate-950/60 hover:bg-slate-950/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-400 font-bold">
                        {inc.id}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${
                          inc.priority === 'P0'
                            ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                            : inc.priority === 'P1'
                            ? 'bg-[#ff7700]/20 text-[#ff7700] border-[#ff7700]/50'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {inc.priority}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.2 rounded text-[10px] font-mono uppercase font-semibold ${
                        inc.status === 'NEW'
                          ? 'bg-red-500/20 text-red-400 animate-pulse'
                          : inc.status === 'RESPONDER_EN_ROUTE'
                          ? 'bg-sky-500/20 text-sky-400'
                          : inc.status === 'RESOLVED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {inc.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="font-bold text-sm text-white">{inc.personName}</div>

                  <p className="text-[11px] text-slate-400 leading-snug truncate">
                    {inc.priorityReason}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/80">
                    <span>Flood: {inc.floodDepthCm}cm</span>
                    <span>Created: {inc.createdAt}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Incident Detail Column */}
      {selectedIncident ? (
        <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-4">
          {/* Action Error Banner */}
          {actionError && (
            <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs text-red-200 flex items-center justify-between">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-white">✕</button>
            </div>
          )}

          {/* Incident Header Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {selectedIncident.id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                      selectedIncident.priority === 'P0'
                        ? 'bg-red-500/20 text-red-400 border-red-500/50'
                        : selectedIncident.priority === 'P1'
                        ? 'bg-[#ff7700]/20 text-[#ff7700] border-[#ff7700]/50'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    PRIORITY {selectedIncident.priority}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-xs font-mono">
                    STATUS: {selectedIncident.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <h1 className="text-xl font-extrabold text-white">{selectedIncident.personName}</h1>
                <p className="text-xs text-slate-300 font-medium">
                  {selectedIncident.priorityReason}
                </p>
              </div>

              {/* Focus on Map Button */}
              <button
                onClick={() => onSelectOnMap && onSelectOnMap(selectedIncident.lat, selectedIncident.lng)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <Crosshair className="w-4 h-4" />
                Focus on Map
              </button>
            </div>

            {/* Operator Workflow Controls */}
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
              {selectedIncident.status === 'NEW' && (
                <button
                  onClick={handleAcknowledge}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow"
                >
                  <UserCheck className="w-4 h-4" />
                  Acknowledge Alert
                </button>
              )}

              {selectedIncident.status !== 'RESOLVED' && (
                <button
                  onClick={() => setIsAssigning(true)}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow"
                >
                  <Navigation className="w-4 h-4" />
                  {selectedIncident.assignedResponderName ? 'Reassign Responder' : 'Assign Responder Unit'}
                </button>
              )}

              {selectedIncident.status !== 'RESOLVED' && (
                <button
                  onClick={() => setIsResolving(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Resolved
                </button>
              )}
            </div>

            {/* Responder Assignment Form */}
            {isAssigning && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <span className="font-bold text-white block">Dispatch Tactical Responder:</span>
                <select
                  value={selectedResponder}
                  onChange={(e) => setSelectedResponder(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                >
                  {respondersList.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsAssigning(false)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssign}
                    className="px-3.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold"
                  >
                    Confirm Dispatch
                  </button>
                </div>
              </div>
            )}

            {/* Resolution Notes Form */}
            {isResolving && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <span className="font-bold text-white block">Incident Resolution Summary:</span>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Record outcome (e.g. Extracted by NDRF Boat 3, transported to Thirumullaivoyal Shelter Alpha, vitals stabilized)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsResolving(false)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResolve}
                    className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    Confirm Resolution
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Telemetry & Factors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            {/* Health Telemetry */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="font-bold text-xs uppercase text-slate-400 tracking-wider block">
                Vitals Telemetry
              </span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Heart Rate:</span>
                  <span className="text-white font-bold">
                    {selectedIncident.heartRateBpm !== null ? `${selectedIncident.heartRateBpm} BPM` : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Blood Oxygen:</span>
                  <span
                    className={`font-bold ${
                      selectedIncident.spo2Percent !== null && selectedIncident.spo2Percent < 90
                        ? 'text-red-400'
                        : 'text-white'
                    }`}
                  >
                    {selectedIncident.spo2Percent !== null ? `${selectedIncident.spo2Percent}%` : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            {/* Environmental Factors */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="font-bold text-xs uppercase text-slate-400 tracking-wider block">
                Environmental Risk
              </span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Water Depth:</span>
                  <span className="text-sky-400 font-bold">{selectedIncident.floodDepthCm} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Drift Status:</span>
                  <span className={selectedIncident.driftStatus === 'DRIFTING' ? 'text-cyan-400 font-bold' : 'text-slate-300'}>
                    {selectedIncident.driftStatus} ({selectedIncident.driftConfidence}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Responder & Location */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="font-bold text-xs uppercase text-slate-400 tracking-wider block">
                Tactical Units
              </span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Assigned To:</span>
                  <span className="text-white font-bold truncate max-w-[130px]">
                    {selectedIncident.assignedResponderName || 'Unassigned'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">GPS Accuracy:</span>
                  <span className={selectedIncident.gpsAccuracyM > 25 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                    ±{selectedIncident.gpsAccuracyM} meters
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Trail & Action History */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <History className="w-4 h-4 text-sky-400" />
                Immutable Incident Audit Trail
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Timestamped Operator Actions
              </span>
            </div>

            <div className="space-y-2">
              {selectedIncident.auditTrail.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs flex items-start gap-3"
                >
                  <span className="font-mono text-[10px] text-slate-500 mt-0.5">
                    {entry.timestamp}
                  </span>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{entry.action}</span>
                      <span className="text-[10px] text-slate-400 font-mono">by {entry.operator}</span>
                    </div>
                    {entry.note && (
                      <p className="text-[11px] text-slate-400 font-sans">{entry.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
          Select an incident from the list to view tactical dispatch details.
        </div>
      )}
    </div>
  );
};
