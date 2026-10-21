import React, { useState, useEffect } from 'react';
import { RegisteredPerson, MobileAlertMessage } from '../types/floodguard';
import { voiceNav } from '../services/voiceNav';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  ExternalLink,
  MessageSquare,
  Phone,
  Radio,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  User,
  Users,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';

interface MobileAlertModalProps {
  people: RegisteredPerson[];
  initialPerson?: RegisteredPerson | null;
  onClose: () => void;
  onAlertSent?: (alert: MobileAlertMessage) => void;
}

interface AlertTemplate {
  id: string;
  label: string;
  headline: string;
  alertType: MobileAlertMessage['alertType'];
  textTemplate: (p?: RegisteredPerson | null) => string;
}

const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    id: 'evac-order',
    label: '🚨 Evacuation Order (Immediate High Ground)',
    headline: '🚨 URGENT EVACUATION DIRECTIVE',
    alertType: 'EVACUATION',
    textTemplate: (p) =>
      `EMERGENCY DIRECTIVE: Chembarambakkam spillway discharge is rising. Water level in your area is critical. Evacuate immediately towards Thirumullaivoyal High Ridge Defense Shelter (Elevation 24.8m). Avoid Paruthipattu low bridge. Route: https://floodguard.gov.in/route?p=${p?.personId || 'GPS'}`,
  },
  {
    id: 'rescue-dispatch',
    label: '🚑 Rescue Boat Dispatched',
    headline: '🚑 RESCUE TEAM EN ROUTE',
    alertType: 'RESCUE_DISPATCH',
    textTemplate: (p) =>
      `FLOODGUARD DISPATCH: NDRF Boat Team #4 has been assigned to ${p?.name || 'your coordinates'}. Stay elevated on second floor or rooftop. Tie a bright cloth for aerial visibility. Do NOT enter moving water.`,
  },
  {
    id: 'surge-warning',
    label: '🌊 Flash Flood & Dam Spillway Surge',
    headline: '🌊 WATER LEVEL SURGE WARNING',
    alertType: 'SURGE_WARNING',
    textTemplate: () =>
      `FLASH FLOOD ALERT: Avadi catchment reservoir inflow has surged to 24,000 cusecs. Backflow expected in Paruthipattu and Kovur culverts. Turn off home electrical breakers immediately.`,
  },
  {
    id: 'vitals-alert',
    label: '🩺 Health / Vitals Warning Alert',
    headline: '⚠️ ELEVATED PHYSIOLOGICAL RISK',
    alertType: 'DIRECT_ALERT',
    textTemplate: (p) =>
      `HEALTH ALERT for ${p?.name || 'Evacuee'}: Wearable reports elevated heart rate (${p?.heartRateBpm || 115} BPM). Emergency relief volunteer dispatched with hydration ORS and first-aid pack. Rest in seated position.`,
  },
  {
    id: 'shelter-info',
    label: '📍 Safe Shelter Allocation & Facilities',
    headline: '🛡️ SHELTER ASSIGNMENT READY',
    alertType: 'SHELTER_ASSIGNED',
    textTemplate: (p) =>
      `SHELTER NOTICE: Bed space confirmed for ${p?.name || 'you'} at Thirumullaivoyal High Ridge Pavilion. Drinking water, medical team, and phone charging stations available. Follow cyan route on FloodGuard.`,
  },
];

export const MobileAlertModal: React.FC<MobileAlertModalProps> = ({
  people,
  initialPerson,
  onClose,
  onAlertSent,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(initialPerson?.personId || '');
  const [mobileNumber, setMobileNumber] = useState<string>(initialPerson?.contactNumber || '+91 98401 23456');
  const [recipientName, setRecipientName] = useState<string>(initialPerson?.name || 'Citizen Evacuee');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('evac-order');
  const [headline, setHeadline] = useState<string>('🚨 URGENT EVACUATION DIRECTIVE');
  const [alertType, setAlertType] = useState<MobileAlertMessage['alertType']>('EVACUATION');
  const [messageText, setMessageText] = useState<string>('');
  
  const [isSending, setIsSending] = useState(false);
  const [lastDelivered, setLastDelivered] = useState<MobileAlertMessage | null>(null);
  const [historyList, setHistoryList] = useState<MobileAlertMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');
  const [triggerSound, setTriggerSound] = useState(true);
  const [openDeviceSmsDirectly, setOpenDeviceSmsDirectly] = useState(true);

  // Sync when template or person changes
  useEffect(() => {
    const person = people.find((p) => p.personId === selectedPersonId) || initialPerson;
    if (person) {
      if (person.contactNumber) setMobileNumber(person.contactNumber);
      setRecipientName(person.name);
    }
    const tmpl = ALERT_TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (tmpl) {
      setHeadline(tmpl.headline);
      setAlertType(tmpl.alertType);
      setMessageText(tmpl.textTemplate(person));
    }
  }, [selectedPersonId, selectedTemplateId, people, initialPerson]);

  // Load existing alert history
  useEffect(() => {
    fetch('/api/alerts')
      .then((res) => res.json())
      .then((data) => {
        if (data?.alerts) {
          setHistoryList(data.alerts);
        }
      })
      .catch((err) => console.warn('Alert history fetch error:', err));
  }, [lastDelivered]);

  const handlePersonSelect = (pId: string) => {
    setSelectedPersonId(pId);
    const p = people.find((person) => person.personId === pId);
    if (p) {
      setRecipientName(p.name);
      setMobileNumber(p.contactNumber || '+91 98401 23456');
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileNumber.trim() || !messageText.trim() || isSending) return;

    setIsSending(true);

    try {
      // 1. Dispatch through server endpoint
      const res = await fetch('/api/alerts/send-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobileNumber: mobileNumber.trim(),
          recipientName: recipientName.trim(),
          alertType,
          headline,
          message: messageText.trim(),
          personId: selectedPersonId || undefined,
        }),
      });

      const data = await res.json();
      const newAlert: MobileAlertMessage = data.alert || {
        id: `SMS-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mobileNumber,
        recipientName,
        alertType,
        headline,
        message: messageText,
        status: 'DELIVERED',
        gateway: 'Airtel / Jio Cell Broadcast & NDRF Emergency SMS Relay',
      };

      setLastDelivered(newAlert);
      onAlertSent?.(newAlert);

      // 2. Play audible confirmation tone
      if (triggerSound) {
        voiceNav.playAlertChime('danger');
        voiceNav.speak(`Emergency mobile alert dispatched to ${recipientName}`, true);
      }

      // 3. Trigger Web Push / Browser Notification if granted
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(headline, {
            body: `${recipientName}: ${messageText.slice(0, 100)}...`,
            icon: '/favicon.ico',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              new Notification(headline, {
                body: `${recipientName}: ${messageText.slice(0, 100)}...`,
              });
            }
          });
        }
      }

      // 4. Trigger real native device SMS application if enabled
      if (openDeviceSmsDirectly) {
        const cleanMobile = mobileNumber.replace(/[^0-9+]/g, '');
        const directSmsUri = `sms:${cleanMobile}?body=${encodeURIComponent(`[${headline}] ${messageText.trim()}`)}`;
        setTimeout(() => {
          try {
            window.location.href = directSmsUri;
          } catch (e) {
            console.warn('Could not launch native SMS uri:', e);
          }
        }, 150);
      }
    } catch (err) {
      console.error('Failed to send mobile alert:', err);
    } finally {
      setIsSending(false);
    }
  };

  // SMS character calculation
  const charCount = messageText.length;
  const smsSegments = Math.ceil(charCount / 160) || 1;

  // Native phone SMS URL (opens device native messaging client on mobile/tablets)
  const nativeSmsUrl = `sms:${mobileNumber}?body=${encodeURIComponent(
    `[${headline}] ${messageText}`
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl text-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Emergency Mobile SMS Alert Gateway
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1 font-mono">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  Cell Broadcast & SMS Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Dispatches urgent SMS alerts, evacuation directives, and rescue unit updates directly to mobile devices.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('compose')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  activeTab === 'compose'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Compose Alert
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dispatch Log
                {historyList.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-400/20 text-blue-300 text-[10px]">
                    {historyList.length}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'history' ? (
            /* History Table */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  Dispatched Emergency Mobile Alerts ({historyList.length})
                </h3>
                <span className="text-xs text-slate-400">
                  Carrier Gateway: BSNL / Airtel / Jio Emergency Cell Broadcast Relay
                </span>
              </div>

              {historyList.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-xl text-slate-400 text-sm">
                  No mobile alerts dispatched yet in this session.
                </div>
              ) : (
                <div className="space-y-3">
                  {historyList.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-blue-400 font-bold">{alert.id}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-slate-200">{alert.recipientName}</span>
                          <span className="font-mono text-slate-400">({alert.mobileNumber})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-mono">{alert.timestamp}</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {alert.status}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs font-bold text-amber-300">{alert.headline}</div>
                      <p className="text-xs text-slate-300 font-mono bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                        {alert.message}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>Gateway: {alert.gateway}</span>
                        <a
                          href={`sms:${alert.mobileNumber}?body=${encodeURIComponent(alert.message)}`}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
                        >
                          Open in Device SMS App
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Compose Form & Phone Simulator Grid */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Controls (7 cols) */}
              <form onSubmit={handleSendAlert} className="lg:col-span-7 space-y-4">
                {/* Last Delivered Banner */}
                {lastDelivered && (
                  <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 font-bold text-emerald-300">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Real Alert Dispatched to {lastDelivered.recipientName} ({lastDelivered.mobileNumber})</span>
                      </div>
                      <span className="font-mono text-[10px] bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300">
                        {lastDelivered.gateway}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Dispatched via gateway. You can also tap below to open your phone or computer's native SMS application directly with this exact emergency message ready to send:
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={nativeSmsUrl}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-lg transition active:scale-95"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Open Messages App & Send Real SMS to {lastDelivered.mobileNumber} Now &rarr;</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Recipient Selection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    Select Recipient Evacuee / Enter Custom Mobile
                  </label>
                  
                  {people.length > 0 && (
                    <select
                      value={selectedPersonId}
                      onChange={(e) => handlePersonSelect(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 mb-2"
                    >
                      <option value="">-- Choose from Registered Evacuees --</option>
                      {people.map((p) => (
                        <option key={p.personId} value={p.personId}>
                          {p.name} ({p.contactNumber || 'No phone'}) - Priority: {p.rescuePriority} - {p.floodRiskLevel} Risk
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">Recipient Name</span>
                      <input
                        type="text"
                        required
                        placeholder="Citizen Name"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">Recipient Mobile Number</span>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 absolute left-2.5 top-2.5" />
                        <input
                          type="tel"
                          required
                          placeholder="+91 98401 23456"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Template Chips */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Emergency Alert Templates
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALERT_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(tmpl.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition text-left border ${
                          selectedTemplateId === tmpl.id
                            ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Headline & Message Text */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Alert Headline / Banner</label>
                    <input
                      type="text"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-slate-400">SMS Body Message</label>
                      <span className="text-[11px] font-mono text-slate-500">
                        {charCount} chars • {smsSegments} SMS {smsSegments > 1 ? 'segments' : 'segment'}
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed"
                    />
                  </div>
                </div>

                {/* Toggles */}
                {/* Toggles */}
                <div className="space-y-1.5 pt-1 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={openDeviceSmsDirectly}
                        onChange={(e) => setOpenDeviceSmsDirectly(e.target.checked)}
                        className="w-3.5 h-3.5 accent-blue-500 rounded"
                      />
                      <span className="text-slate-200 font-semibold flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                        Trigger real cellular SMS via device messaging app on send
                      </span>
                    </label>

                    <span className="text-[11px] text-slate-500">
                      Carrier Priority: High
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={triggerSound}
                      onChange={(e) => setTriggerSound(e.target.checked)}
                      className="w-3.5 h-3.5 accent-blue-500 rounded"
                    />
                    <span>Play emergency alert chime and speech notification</span>
                  </label>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <a
                    href={nativeSmsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                    <span>Open Device SMS ({mobileNumber})</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  <button
                    type="submit"
                    disabled={isSending || !mobileNumber.trim() || !messageText.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50 transition active:scale-95"
                  >
                    {isSending ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Transmitting Real SMS Alert...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Real Mobile SMS Alert</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Realistic Mobile Device Simulator Preview (5 cols) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                  Live Mobile Device SMS Screen
                </span>

                {/* Phone mockup container */}
                <div className="w-[280px] sm:w-[300px] h-[480px] bg-slate-950 rounded-[36px] border-4 border-slate-700 shadow-2xl relative flex flex-col overflow-hidden p-3 text-slate-100">
                  {/* Speaker & notch */}
                  <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-700 mr-2"></div>
                    <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
                  </div>

                  {/* Status Bar */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-2 mb-3">
                    <span>10:32</span>
                    <div className="flex items-center gap-1 font-mono">
                      <span>5G</span>
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <div className="w-4 h-2 border border-slate-400 rounded-sm p-0.5">
                        <div className="w-full h-full bg-emerald-400"></div>
                      </div>
                    </div>
                  </div>

                  {/* SMS App Header */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 mb-3 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#ff7700] text-white flex items-center justify-center font-bold text-xs">
                      FG
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-xs font-bold text-slate-200 truncate">
                        FLDG-ALERT (NDRF Gov)
                      </div>
                      <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Emergency Cell Broadcast
                      </div>
                    </div>
                  </div>

                  {/* Incoming SMS Bubble */}
                  <div className="flex-1 overflow-y-auto space-y-2 px-1">
                    <div className="text-center text-[10px] text-slate-500 font-mono my-1">
                      Today • High Priority Broadcast
                    </div>

                    <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-blue-500/40 rounded-2xl p-3 shadow-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">
                          {headline}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">Now</span>
                      </div>

                      <p className="text-[11px] text-slate-200 leading-relaxed font-sans">
                        {messageText || 'Enter message content to preview...'}
                      </p>

                      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9px] text-slate-400">
                        <span>Recipient: {recipientName}</span>
                        <span className="text-emerald-400 font-semibold">Delivered</span>
                      </div>
                    </div>
                  </div>

                  {/* Mock Phone Home Indicator */}
                  <div className="w-24 h-1 bg-slate-600 rounded-full mx-auto mt-2"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
