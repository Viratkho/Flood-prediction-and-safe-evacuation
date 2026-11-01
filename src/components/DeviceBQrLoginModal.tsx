import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Smartphone,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  X,
  Loader2,
  Clock,
  Laptop,
  Copy,
  Check,
} from 'lucide-react';
import { RegisteredPerson } from '../types/floodguard';

interface DeviceBQrLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (person: RegisteredPerson) => void;
}

export const DeviceBQrLoginModal: React.FC<DeviceBQrLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'SCANNED' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED' | 'ERROR'>('IDLE');
  const [timeLeft, setTimeLeft] = useState<number>(120);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionRef = useRef<{ id: string; tok: string } | null>(null);

  // Initialize or recreate pairing session
  const initializeSession = async () => {
    setIsInitializing(true);
    setErrorMessage(null);
    setStatus('IDLE');
    setTimeLeft(120);

    // Clear any existing intervals
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    try {
      const deviceInfo = {
        browser: navigator.userAgent.includes('Edg')
          ? 'Microsoft Edge'
          : navigator.userAgent.includes('Chrome')
          ? 'Google Chrome'
          : navigator.userAgent.includes('Firefox')
          ? 'Mozilla Firefox'
          : navigator.userAgent.includes('Safari')
          ? 'Apple Safari'
          : 'Web Browser',
        platform: /Mobi|Android/i.test(navigator.userAgent)
          ? 'Mobile Browser'
          : /Tablet|iPad/i.test(navigator.userAgent)
          ? 'Tablet Device'
          : 'Desktop Computer',
        requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      const res = await fetch('/api/auth/qr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeviceInfo: deviceInfo }),
      });

      let data: any = {};
      try {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text?.slice(0, 140) };
        }
      } catch {
        data = {};
      }

      if (!res.ok) {
        const msg = data.error && !data.error.includes('<')
          ? data.error
          : (res.status >= 500
              ? `Backend service error (HTTP ${res.status}). Verify FastAPI service is online.`
              : `HTTP ${res.status}: Failed to initialize QR pairing.`);
        throw new Error(msg);
      }
      const sId = data.sessionId;
      const sTok = data.token;
      const qrData = data.qrData;

      setSessionId(sId);
      setToken(sTok);
      currentSessionRef.current = { id: sId, tok: sTok };

      // Render high-contrast QR code canvas as Data URL
      const url = await QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: {
          dark: '#020617', // slate-950
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });

      setQrDataUrl(url);
      setStatus('PENDING');
      setTimeLeft(data.expiresIn || 120);

      // Start 120s countdown timer
      countdownTimerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current!);
            clearInterval(pollTimerRef.current!);
            setStatus('EXPIRED');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start polling status every 2 seconds
      pollTimerRef.current = setInterval(() => {
        pollStatus(sId, sTok);
      }, 2000);

    } catch (err: any) {
      console.error('QR creation error:', err);
      setErrorMessage(err.message || 'Failed to initialize QR login session.');
      setStatus('ERROR');
    } finally {
      setIsInitializing(false);
    }
  };

  const pollStatus = async (sId: string, sTok: string) => {
    try {
      const res = await fetch(`/api/auth/qr/status/${sId}`);
      if (!res.ok) return;

      const data = await res.json();
      const newStatus = data.status;

      if (newStatus === 'SCANNED') {
        setStatus('SCANNED');
      } else if (newStatus === 'APPROVED') {
        setStatus('APPROVED');
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        // Automatically finalize login
        completeLogin(sId, sTok);
      } else if (newStatus === 'REJECTED') {
        setStatus('REJECTED');
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      } else if (newStatus === 'EXPIRED') {
        setStatus('EXPIRED');
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      }
    } catch (err) {
      console.warn('Status poll warning:', err);
    }
  };

  const completeLogin = async (sId: string, sTok: string) => {
    try {
      const res = await fetch('/api/auth/qr/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sId, token: sTok }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to complete pairing');
      }

      const data = await res.json();
      if (data.person) {
        setStatus('COMPLETED');
        setTimeout(() => {
          onLoginSuccess(data.person);
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      console.error('Complete login error:', err);
      setErrorMessage(err.message || 'Failed to complete authentication.');
      setStatus('ERROR');
    }
  };

  const handleCancel = async () => {
    if (sessionId) {
      try {
        await fetch('/api/auth/qr/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch {}
    }
    onClose();
  };

  const handleCopyCode = () => {
    if (!sessionId || !token) return;
    const manualCode = JSON.stringify({ type: 'FLOODGUARD_QR_LOGIN', sessionId, token, v: 1 });
    navigator.clipboard.writeText(manualCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  useEffect(() => {
    if (isOpen) {
      initializeSession();
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff7700] to-amber-500 flex items-center justify-center text-white shadow">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Log In with QR Code
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">
                  Device B
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Instantly authenticate this device without typing password
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {/* Instructions */}
          <div className="text-xs text-slate-300 max-w-xs">
            Open <strong className="text-white">FloodGuard</strong> on your already logged-in phone or computer (Device A), click{' '}
            <span className="text-[#ff7700] font-semibold">“Scan QR to Log In on Another Device”</span>, and scan this code.
          </div>

          {/* QR Display Card */}
          <div className="relative p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center min-w-[240px] min-h-[240px]">
            {isInitializing ? (
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <Loader2 className="w-8 h-8 animate-spin text-[#ff7700]" />
                <span className="text-xs font-medium">Generating Secure QR...</span>
              </div>
            ) : qrDataUrl && status !== 'EXPIRED' && status !== 'REJECTED' && status !== 'ERROR' ? (
              <div className="relative">
                <img
                  src={qrDataUrl}
                  alt="FloodGuard Pairing QR"
                  className="w-56 h-56 rounded-lg object-contain"
                />
                {/* Overlays for SCANNED or APPROVED */}
                {status === 'SCANNED' && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs rounded-lg flex flex-col items-center justify-center p-3 text-white space-y-2 animate-in fade-in">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">Device Detected!</span>
                    <span className="text-[11px] text-slate-300 text-center">
                      Confirming on your logged-in device...
                    </span>
                  </div>
                )}
                {status === 'APPROVED' && (
                  <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-xs rounded-lg flex flex-col items-center justify-center p-3 text-white space-y-2 animate-in fade-in">
                    <CheckCircle className="w-10 h-10 text-emerald-400 animate-bounce" />
                    <span className="text-xs font-bold text-emerald-300">Login Approved!</span>
                    <span className="text-[11px] text-slate-200">
                      Syncing account identity...
                    </span>
                  </div>
                )}
                {status === 'COMPLETED' && (
                  <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-xs rounded-lg flex flex-col items-center justify-center p-3 text-white space-y-2 animate-in fade-in">
                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-300">Authenticated!</span>
                    <span className="text-[11px] text-slate-200">Redirecting to dashboard...</span>
                  </div>
                )}
              </div>
            ) : status === 'EXPIRED' ? (
              <div className="flex flex-col items-center gap-3 p-4 text-slate-800">
                <Clock className="w-10 h-10 text-amber-500" />
                <div className="text-sm font-bold">QR Code Expired</div>
                <div className="text-xs text-slate-600 text-center">
                  This single-use pairing session timed out after 120 seconds.
                </div>
                <button
                  onClick={initializeSession}
                  className="mt-2 px-4 py-2 rounded-xl bg-[#ff7700] hover:bg-[#ff8811] text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Generate New QR</span>
                </button>
              </div>
            ) : status === 'REJECTED' ? (
              <div className="flex flex-col items-center gap-3 p-4 text-slate-800">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <div className="text-sm font-bold text-red-600">Pairing Rejected</div>
                <div className="text-xs text-slate-600 text-center">
                  The request was declined on your authenticated device.
                </div>
                <button
                  onClick={initializeSession}
                  className="mt-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 text-center p-4">
                <AlertCircle className="w-9 h-9 text-red-500 animate-pulse" />
                <div className="text-xs font-bold text-red-600">
                  {errorMessage?.includes('HTTP 500') || errorMessage?.includes('Backend service') ? 'Authentication Service Unavailable' : 'Initialization Error'}
                </div>
                <span className="text-[11px] text-slate-500 max-w-[210px] leading-relaxed">
                  {errorMessage || 'Failed to establish pairing handshake.'}
                </span>
                <button
                  onClick={initializeSession}
                  className="mt-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}
          </div>

          {/* Status & Countdown Bar */}
          {status !== 'EXPIRED' && status !== 'REJECTED' && status !== 'ERROR' && (
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    status === 'PENDING'
                      ? 'bg-sky-400 animate-ping'
                      : status === 'SCANNED'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400'
                  }`} />
                  {status === 'PENDING'
                    ? 'Waiting for scan...'
                    : status === 'SCANNED'
                    ? 'Awaiting Device A approval...'
                    : 'Logging in...'}
                </span>
                <span className="text-slate-300 font-bold">
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 via-[#ff7700] to-amber-400 transition-all duration-1000"
                  style={{ width: `${(timeLeft / 120) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Session Identification & Copy Code */}
          {sessionId && (
            <div className="w-full p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-[11px] truncate">
                Session: <span className="text-slate-200 font-semibold">{sessionId}</span>
              </span>
              <button
                onClick={handleCopyCode}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono flex items-center gap-1 transition"
                title="Copy pairing data to clipboard"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          {/* Security Note */}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>End-to-End Cryptographic Handshake • Single-Use Token • Zero Plaintext</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between">
          <button
            onClick={initializeSession}
            disabled={isInitializing}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isInitializing ? 'animate-spin' : ''}`} />
            <span>Refresh QR</span>
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
