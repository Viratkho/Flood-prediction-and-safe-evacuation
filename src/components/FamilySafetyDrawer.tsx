import React, { useState, useEffect } from 'react';
import {
  Heart,
  Users,
  UserPlus,
  ShieldAlert,
  AlertTriangle,
  Check,
  X,
  Share2,
  Lock,
  Clock,
  Compass,
  Crosshair,
  RefreshCw,
  Trash2,
  MapPin,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { FamilyMemberLocation, FamilyRequest } from '../types/family';
import { RegisteredPerson } from '../types/floodguard';

interface FamilySafetyDrawerProps {
  currentUser: RegisteredPerson | null;
  isOpen: boolean;
  onClose: () => void;
  onFocusMember?: (lat: number, lng: number) => void;
  onRefreshData?: () => void;
  familyMembers: FamilyMemberLocation[];
  onMembersChange?: () => void;
}

export const FamilySafetyDrawer: React.FC<FamilySafetyDrawerProps> = ({
  currentUser,
  isOpen,
  onClose,
  onFocusMember,
  onRefreshData,
  familyMembers,
  onMembersChange,
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'requests' | 'add'>('members');
  const [requests, setRequests] = useState<{ incoming: FamilyRequest[]; outgoing: FamilyRequest[] }>({
    incoming: [],
    outgoing: [],
  });
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);

  // Add Family Member Form State
  const [inviteId, setInviteId] = useState<string>('');
  const [inviteRelationship, setInviteRelationship] = useState<string>('Family Member');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState<boolean>(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);
  const [inviteErrorMsg, setInviteErrorMsg] = useState<string | null>(null);

  // SOS State
  const [isSendingSos, setIsSendingSos] = useState<boolean>(false);
  const [sosSuccess, setSosSuccess] = useState<boolean>(false);
  const [sosActive, setSosActive] = useState<boolean>(false);

  // Fetch pending connection requests
  const fetchRequests = async () => {
    if (!currentUser?.personId) return;
    try {
      setIsLoadingRequests(true);
      const res = await fetch('/api/family/requests', {
        headers: {
          'X-Citizen-Id': currentUser.personId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (e) {
      console.warn('Failed to fetch family requests:', e);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [isOpen, currentUser]);

  // Handle Send Connection Request
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.personId) return;
    const cleanId = inviteId.trim().toUpperCase();
    if (!cleanId) return;

    try {
      setIsSubmittingInvite(true);
      setInviteErrorMsg(null);
      setInviteSuccessMsg(null);

      const res = await fetch('/api/family/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Citizen-Id': currentUser.personId,
        },
        body: JSON.stringify({
          targetPersonId: cleanId,
          invitedId: cleanId,
          requesterId: currentUser.personId,
          relationship: inviteRelationship,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Could not send connection invitation.');
      }

      setInviteSuccessMsg(`Invitation sent to ${cleanId}! Waiting for their acceptance.`);
      setInviteId('');
      fetchRequests();
      if (onMembersChange) onMembersChange();
    } catch (err: any) {
      setInviteErrorMsg(err.message || 'Failed to send invite.');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  // Respond to incoming connection request (ACCEPT or REJECT)
  const handleRespondRequest = async (connectionId: number, action: 'ACCEPT' | 'REJECT') => {
    if (!currentUser?.personId) return;
    try {
      const res = await fetch('/api/family/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Citizen-Id': currentUser.personId,
        },
        body: JSON.stringify({
          connectionId,
          action,
        }),
      });

      if (res.ok) {
        fetchRequests();
        if (onRefreshData) onRefreshData();
        if (onMembersChange) onMembersChange();
      }
    } catch (e) {
      console.warn('Could not respond to request:', e);
    }
  };

  // Toggle location sharing permission for a specific member
  const handleTogglePermission = async (connectionId: number, currentShareState: boolean) => {
    if (!currentUser?.personId) return;
    try {
      const res = await fetch('/api/family/permission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Citizen-Id': currentUser.personId,
        },
        body: JSON.stringify({
          connectionId,
          shareLocation: !currentShareState,
        }),
      });

      if (res.ok) {
        if (onRefreshData) onRefreshData();
        if (onMembersChange) onMembersChange();
      }
    } catch (e) {
      console.warn('Could not toggle location permission:', e);
    }
  };

  // Revoke/Delete family connection
  const handleRevokeConnection = async (connectionId: number, name: string) => {
    if (!confirm(`Are you sure you want to disconnect from ${name}? Mutual location sharing will end immediately.`)) {
      return;
    }
    if (!currentUser?.personId) return;

    try {
      const res = await fetch(`/api/family/connection/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'X-Citizen-Id': currentUser.personId,
        },
      });

      if (res.ok) {
        if (onRefreshData) onRefreshData();
        if (onMembersChange) onMembersChange();
      }
    } catch (e) {
      console.warn('Could not revoke connection:', e);
    }
  };

  // Emergency Family SOS Broadcast
  const handleTriggerFamilySos = async () => {
    if (!currentUser?.personId) return;
    try {
      setIsSendingSos(true);
      const res = await fetch('/api/family/sos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Citizen-Id': currentUser.personId,
        },
        body: JSON.stringify({
          userId: currentUser.personId,
          senderName: currentUser.name || 'Citizen',
          lat: currentUser.lat || 13.1143,
          lng: currentUser.lng || 80.1015,
          accuracyM: currentUser.gpsAccuracyM || 10,
          locationName: currentUser.locationName || currentUser.addressLandmark || 'Avadi Basin',
          alertMessage: 'EMERGENCY: Immediate family assistance needed due to rising flood waters!',
        }),
      });

      if (res.ok) {
        setSosActive(true);
        setSosSuccess(true);
        setTimeout(() => setSosSuccess(false), 5000);
        if (onRefreshData) onRefreshData();
        if (onMembersChange) onMembersChange();
      }
    } catch (e) {
      console.warn('Could not trigger family SOS:', e);
    } finally {
      setIsSendingSos(false);
    }
  };

  // Cancel Emergency Family SOS
  const handleCancelFamilySos = async () => {
    if (!currentUser?.personId) return;
    try {
      setIsSendingSos(true);
      const res = await fetch('/api/family/sos/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Citizen-Id': currentUser.personId,
        },
        body: JSON.stringify({
          userId: currentUser.personId,
        }),
      });

      if (res.ok) {
        setSosActive(false);
        if (onRefreshData) onRefreshData();
        if (onMembersChange) onMembersChange();
      }
    } catch (e) {
      console.warn('Could not cancel SOS:', e);
    } finally {
      setIsSendingSos(false);
    }
  };

  if (!isOpen) return null;

  const totalIncoming = requests.incoming.length;

  return (
    <div className="absolute top-16 right-4 z-20 w-84 sm:w-96 max-h-[85vh] flex flex-col bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl shadow-2xl text-white text-xs overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header Bar */}
      <div className="p-3.5 bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-900 border-b border-emerald-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
            <Heart className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-white text-xs sm:text-sm tracking-wide">
                Family Safety Network
              </h3>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/50">
                LIVE
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Mutual location sharing & emergency beacons
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Close Family Safety Drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Emergency Family SOS Broadcast Ribbon */}
      <div className="px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-4 h-4 ${sosActive ? 'text-red-400 animate-pulse' : 'text-slate-400'}`} />
          <div>
            <div className="text-[11px] font-bold text-white">Family Emergency SOS</div>
            <div className="text-[9px] text-slate-400">Instantly alerts all connected members</div>
          </div>
        </div>

        {sosActive ? (
          <button
            onClick={handleCancelFamilySos}
            disabled={isSendingSos}
            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 transition shadow animate-pulse"
          >
            Cancel SOS
          </button>
        ) : (
          <button
            onClick={handleTriggerFamilySos}
            disabled={isSendingSos}
            className="px-2.5 py-1 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 transition shadow"
          >
            <Bell className="w-3 h-3" />
            <span>Send SOS</span>
          </button>
        )}
      </div>

      {sosSuccess && (
        <div className="px-3 py-1.5 bg-red-950 text-red-200 text-[10px] font-mono border-b border-red-800 flex items-center gap-1.5 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>SOS broadcasted to family members with your GPS coordinates!</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/40 text-xs font-medium">
        <button
          onClick={() => setActiveTab('members')}
          className={`py-2 flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'members'
              ? 'border-emerald-500 text-emerald-400 font-bold bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Members ({familyMembers.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('requests');
            fetchRequests();
          }}
          className={`py-2 flex items-center justify-center gap-1.5 border-b-2 transition relative ${
            activeTab === 'requests'
              ? 'border-emerald-500 text-emerald-400 font-bold bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Requests</span>
          {totalIncoming > 0 && (
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-bold flex items-center justify-center">
              {totalIncoming}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('add')}
          className={`py-2 flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'add'
              ? 'border-emerald-500 text-emerald-400 font-bold bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-3.5 space-y-3 overflow-y-auto max-h-[calc(85vh-135px)]">
        {/* TAB 1: CONNECTED MEMBERS */}
        {activeTab === 'members' && (
          <div className="space-y-2.5">
            {familyMembers.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <Users className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="text-slate-400 font-semibold text-xs">No family members connected yet</div>
                <p className="text-[10px] text-slate-500 max-w-[220px] mx-auto">
                  Add your family members using their unique FloodGuard ID to share locations on the map.
                </p>
                <button
                  onClick={() => setActiveTab('add')}
                  className="mt-2 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow"
                >
                  Add First Member
                </button>
              </div>
            ) : (
              familyMembers.map((member) => (
                <div
                  key={member.connectionId}
                  className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs">{member.name}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-emerald-300 border border-emerald-500/30">
                            {member.relationship}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {member.personId}
                        </div>
                      </div>
                    </div>

                    {/* Stale / Flood Risk Status Badges */}
                    <div className="flex flex-col items-end gap-1">
                      {member.sosActive && (
                        <span className="px-1.5 py-0.2 rounded bg-red-500/30 text-red-300 border border-red-500/50 text-[9px] font-bold font-mono animate-pulse">
                          🚨 SOS ACTIVE
                        </span>
                      )}
                      {member.isInHighRiskFlood && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono">
                          🌊 FLOOD RISK ({member.floodDepthM}m)
                        </span>
                      )}
                      {member.isStale ? (
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] font-mono">
                          LAST KNOWN LOCATION
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[9px] font-mono">
                          LIVE GPS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Location & Coordinates */}
                  {member.lat && member.lng ? (
                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 text-[10px] font-mono flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate-300">
                        <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[170px]">{member.locationName || 'Avadi Basin'}</span>
                      </div>
                      <span className="text-slate-500">
                        {member.lat.toFixed(4)}°, {member.lng.toFixed(4)}°
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800 text-[10px] text-slate-500 font-mono">
                      Location sharing paused by member
                    </div>
                  )}

                  {/* Action Buttons: Focus on Map, Toggle Share, Revoke */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px] font-mono">
                    <div className="flex items-center gap-2">
                      {member.lat && member.lng && onFocusMember && (
                        <button
                          onClick={() => onFocusMember(member.lat!, member.lng!)}
                          className="px-2 py-0.8 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 flex items-center gap-1 transition"
                          title="Center and zoom map on this member"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>Focus Map</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleTogglePermission(member.connectionId, member.shareLocation)}
                        className={`px-2 py-0.8 rounded border flex items-center gap-1 transition ${
                          member.shareLocation
                            ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                            : 'bg-amber-950/60 text-amber-300 border-amber-600/40'
                        }`}
                        title={member.shareLocation ? 'Pause sharing your location with this member' : 'Resume sharing your location'}
                      >
                        <Share2 className="w-3 h-3" />
                        <span>{member.shareLocation ? 'Sharing: ON' : 'Sharing: OFF'}</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleRevokeConnection(member.connectionId, member.name)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Disconnect family member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: PENDING REQUESTS */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {/* Incoming Requests */}
            <div>
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Incoming Invitations ({requests.incoming.length})
              </div>
              {requests.incoming.length === 0 ? (
                <div className="text-slate-500 text-[11px] p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80">
                  No incoming requests.
                </div>
              ) : (
                requests.incoming.map((req) => {
                const reqId = req.id || (req as any).connection_id || (req as any).connectionId;
                const reqName = req.requesterName || (req as any).requester_name || req.requesterId || (req as any).requester_id;
                const reqPersonId = req.requesterId || (req as any).requester_id;
                const reqTime = req.createdAt || (req as any).created_at || 'Recently';
                return (
                  <div
                    key={reqId}
                    className="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{reqName}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-emerald-300">
                        {req.relationship}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      ID: {reqPersonId} • {reqTime}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleRespondRequest(reqId, 'ACCEPT')}
                        className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition shadow"
                      >
                        <Check className="w-3 h-3" />
                        <span>Accept & Share</span>
                      </button>
                      <button
                        onClick={() => handleRespondRequest(reqId, 'REJECT')}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Outgoing Requests */}
          <div className="pt-2 border-t border-slate-800">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Sent Invitations (Awaiting Acceptance) ({requests.outgoing.length})
            </div>
            {requests.outgoing.length === 0 ? (
              <div className="text-slate-500 text-[11px] p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80">
                No outgoing requests pending.
              </div>
            ) : (
              requests.outgoing.map((req) => {
                const reqId = req.id || (req as any).connection_id || (req as any).connectionId;
                const invName = req.invitedName || (req as any).invited_name || req.invitedId || (req as any).invited_id;
                const invPersonId = req.invitedId || (req as any).invited_id;
                return (
                  <div
                    key={reqId}
                    className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <div className="font-semibold text-white">{invName}</div>
                      <div className="text-[9px] font-mono text-slate-500">ID: {invPersonId} ({req.relationship})</div>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      PENDING
                    </span>
                  </div>
                );
              })
            )}
          </div>
          </div>
        )}

        {/* TAB 3: ADD FAMILY MEMBER */}
        {activeTab === 'add' && (
          <form onSubmit={handleSendInvite} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-400">
                FAMILY MEMBER'S FLOODGUARD ID:
              </label>
              <input
                type="text"
                value={inviteId}
                onChange={(e) => setInviteId(e.target.value)}
                placeholder="e.g. P-102"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[9px] text-slate-500">
                Found on their profile header or digital evacuation pass (e.g. P-101 to P-108).
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-400">
                RELATIONSHIP:
              </label>
              <select
                value={inviteRelationship}
                onChange={(e) => setInviteRelationship(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="Spouse">Spouse</option>
                <option value="Child">Child</option>
                <option value="Parent">Parent</option>
                <option value="Sibling">Sibling</option>
                <option value="Relative">Relative</option>
                <option value="Neighbor / Friend">Neighbor / Friend</option>
                <option value="Family Member">Family Member</option>
              </select>
            </div>

            {inviteSuccessMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{inviteSuccessMsg}</span>
              </div>
            )}

            {inviteErrorMsg && (
              <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center gap-1.5 animate-in fade-in">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>{inviteErrorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingInvite || !inviteId.trim()}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition disabled:opacity-50"
            >
              {isSubmittingInvite ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Verifying FloodGuard ID...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Send Connection Invitation</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
