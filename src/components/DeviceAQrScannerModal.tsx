import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  Scan,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  Laptop,
  Smartphone,
  RefreshCw,
  XCircle,
  ShieldAlert,
  ArrowRight,
  Clipboard,
} from 'lucide-react';
import { RegisteredPerson } from '../types/floodguard';

interface DeviceAQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: RegisteredPerson;
}

export const DeviceAQrScannerModal: React.FC<DeviceAQrScannerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [cameraState, setCameraState] = useState<'IDLE' | 'STARTING' | 'SCANNING' | 'SCANNED' | 'CONFIRMING' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [targetDeviceInfo, setTargetDeviceInfo] = useState<any>(null);
  const [scannedSession, setScannedSession] = useState<{ sessionId: string; token: string } | null>(null);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    stopCamera();
    setErrorMessage(null);
    setCameraState('STARTING');

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraState('SCANNING');
        scanLoop();
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraState('ERROR');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera access was denied. You can paste the pairing code below instead.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera device found on this system. You can paste the pairing code below instead.');
      } else {
        setErrorMessage(err.message || 'Unable to open camera video stream.');
      }
      setShowManualInput(true);
    }
  };

  const scanLoop = () => {
    if (!videoRef.current || !canvasRef.current || cameraState === 'CONFIRMING' || cameraState === 'APPROVED') {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        handleQrDetected(code.data);
        return;
      }
    }

    animFrameRef.current = requestAnimationFrame(scanLoop);
  };

  const parseQrText = (text: string): { sessionId: string; token: string } | null => {
    try {
      // 1. Check for JSON format
      if (text.trim().startsWith('{')) {
        const parsed = JSON.parse(text);
        if (parsed.sessionId && parsed.token) {
          return { sessionId: parsed.sessionId, token: parsed.token };
        }
      }
      // 2. Check for URL format: floodguard:pair?sid=...&tok=...
      if (text.includes('sid=') && text.includes('tok=')) {
        const urlParams = new URLSearchParams(text.split('?')[1] || text);
        const sid = urlParams.get('sid') || urlParams.get('sessionId');
        const tok = urlParams.get('tok') || urlParams.get('token');
        if (sid && tok) return { sessionId: sid, token: tok };
      }
    } catch {}
    return null;
  };

  const handleQrDetected = async (rawText: string) => {
    stopCamera();
    setCameraState('SCANNED');

    const parsed = parseQrText(rawText);
    if (!parsed) {
      setErrorMessage('Unrecognized QR code format. Please ensure you are scanning a valid FloodGuard login QR code.');
      setCameraState('ERROR');
      return;
    }

    setScannedSession(parsed);
    await submitScan(parsed.sessionId, parsed.token);
  };

  const submitScan = async (sessionId: string, token: string) => {
    setCameraState('STARTING');
    setErrorMessage(null);

    try {
      const sourceInfo = {
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
          ? 'Mobile Device'
          : 'Desktop Computer',
        authorizedBy: currentUser.name,
      };

      const res = await fetch('/api/auth/qr/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token,
          personId: currentUser.personId,
          sourceDeviceInfo: sourceInfo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setTargetDeviceInfo(data.targetDeviceInfo || {});
      setCameraState('CONFIRMING');
    } catch (err: any) {
      console.error('Scan submission error:', err);
      setErrorMessage(err.message || 'Failed to submit pairing token.');
      setCameraState('ERROR');
    }
  };

  const handleApprove = async () => {
    if (!scannedSession) return;
    setCameraState('APPROVING');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/qr/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: scannedSession.sessionId,
          token: scannedSession.token,
          personId: currentUser.personId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve pairing');
      }

      setCameraState('APPROVED');
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error approving pairing request.');
      setCameraState('CONFIRMING');
    }
  };

  const handleReject = async () => {
    if (!scannedSession) return;
    try {
      await fetch('/api/auth/qr/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: scannedSession.sessionId,
          token: scannedSession.token,
          personId: currentUser.personId,
          reason: 'User declined on Device A',
        }),
      });
    } catch {}

    setCameraState('REJECTED');
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) return;
    const parsed = parseQrText(manualCodeInput.trim());
    if (parsed) {
      setScannedSession(parsed);
      submitScan(parsed.sessionId, parsed.token);
    } else {
      setErrorMessage('Invalid pairing data string. Paste the exact JSON or session code from Device B.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCameraState('IDLE');
      setErrorMessage(null);
      setTargetDeviceInfo(null);
      setScannedSession(null);
      setShowManualInput(false);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Scan QR to Log In on Another Device
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  Device A
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Authorizing as: <strong className="text-sky-300">{currentUser.name}</strong> ({currentUser.personId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 flex flex-col items-center space-y-4">
          {/* View: Live Scanning */}
          {(cameraState === 'SCANNING' || cameraState === 'STARTING') && (
            <div className="w-full flex flex-col items-center space-y-3">
              <p className="text-xs text-slate-300 text-center">
                Point your camera at the QR code displayed on Device B.
              </p>

              {/* Viewport with targeting reticle */}
              <div className="relative w-72 h-72 rounded-2xl overflow-hidden bg-black border-2 border-sky-500/50 shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Laser animation */}
                {cameraState === 'SCANNING' && (
                  <div className="absolute inset-x-0 h-0.5 bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse"
                       style={{
                         animation: 'scanLaser 2s ease-in-out infinite alternate',
                       }}
                  />
                )}

                {/* Target Corners */}
                <div className="absolute inset-4 pointer-events-none border border-sky-400/30 rounded-xl flex flex-col justify-between p-2">
                  <div className="flex justify-between">
                    <div className="w-5 h-5 border-t-2 border-l-2 border-sky-400" />
                    <div className="w-5 h-5 border-t-2 border-r-2 border-sky-400" />
                  </div>
                  <div className="flex justify-between">
                    <div className="w-5 h-5 border-b-2 border-l-2 border-sky-400" />
                    <div className="w-5 h-5 border-b-2 border-r-2 border-sky-400" />
                  </div>
                </div>

                {cameraState === 'STARTING' && (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white space-y-2">
                    <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                    <span className="text-xs">Starting camera...</span>
                  </div>
                )}
              </div>

              {/* Toggle manual code input */}
              <button
                onClick={() => setShowManualInput(!showManualInput)}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>{showManualInput ? 'Hide Manual Code' : 'Can’t scan? Enter code manually'}</span>
              </button>
            </div>
          )}

          {/* View: Confirmation Card */}
          {cameraState === 'CONFIRMING' && (
            <div className="w-full space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/40 text-left space-y-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wide">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Target Device Authorization Request</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-sky-400" /> Device Platform:
                    </span>
                    <strong className="text-white">{targetDeviceInfo?.platform || 'Web Client'}</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-sky-400" /> Browser:
                    </span>
                    <span className="font-mono text-slate-200">{targetDeviceInfo?.browser || 'Browser'}</span>
                  </div>
                  {targetDeviceInfo?.ip && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Client IP:</span>
                      <span className="font-mono text-slate-400 text-[11px]">{targetDeviceInfo.ip}</span>
                    </div>
                  )}
                  {targetDeviceInfo?.requestedAt && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Requested:</span>
                      <span className="text-slate-400 text-[11px]">{targetDeviceInfo.requestedAt}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/50 text-xs text-sky-200 space-y-1">
                  <div className="font-semibold text-white flex items-center gap-1">
                    <span>Account to Authorize:</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Name: <strong className="text-white">{currentUser.name}</strong> • Priority: <span className="text-amber-300 font-bold">{currentUser.rescuePriority}</span> • Wearable: {currentUser.wearableId}
                  </div>
                  <p className="text-[10px] text-sky-400/80 pt-1">
                    This will grant Device B full access to this FloodGuard account and active rescue routes.
                  </p>
                </div>

                {errorMessage && (
                  <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={handleReject}
                  className="py-2.5 px-4 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span>Reject Login</span>
                </button>

                <button
                  onClick={handleApprove}
                  className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95"
                >
                  <ShieldCheck className="w-4 h-4 text-white" />
                  <span>Approve & Authorize</span>
                </button>
              </div>
            </div>
          )}

          {/* View: Approving state */}
          {cameraState === 'APPROVING' && (
            <div className="py-10 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
              <div className="text-sm font-bold text-white">Authorizing Device B...</div>
              <p className="text-xs text-slate-400">Sending cryptographic approval to SQLite database</p>
            </div>
          )}

          {/* View: Approved state */}
          {cameraState === 'APPROVED' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg">
                <CheckCircle className="w-10 h-10" />
              </div>
              <div className="text-base font-bold text-emerald-300">Device Authorized Successfully!</div>
              <p className="text-xs text-slate-300 max-w-xs">
                Device B has been authorized and is now automatically logging into your account.
              </p>
            </div>
          )}

          {/* View: Rejected state */}
          {cameraState === 'REJECTED' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center shadow-lg">
                <XCircle className="w-10 h-10" />
              </div>
              <div className="text-base font-bold text-red-400">Login Request Declined</div>
              <p className="text-xs text-slate-300">Device B pairing session has been rejected.</p>
            </div>
          )}

          {/* View: Error message & Scan Again */}
          {cameraState === 'ERROR' && (
            <div className="w-full p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-left space-y-3">
              <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span>Pairing Error</span>
              </div>
              <p className="text-xs text-slate-300">{errorMessage || 'An error occurred during scanning.'}</p>
              <button
                onClick={startCamera}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera Scan</span>
              </button>
            </div>
          )}

          {/* Fallback Manual Code Input */}
          {showManualInput && cameraState !== 'CONFIRMING' && cameraState !== 'APPROVED' && (
            <form onSubmit={handleManualCodeSubmit} className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                <Clipboard className="w-3.5 h-3.5 text-sky-400" />
                <span>Paste Pairing Data from Device B:</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCodeInput}
                  onChange={(e) => setManualCodeInput(e.target.value)}
                  placeholder='{"type":"FLOODGUARD_QR_LOGIN", ...}'
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!manualCodeInput.trim()}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 transition"
                >
                  <span>Submit</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted SQLite Handshake</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
