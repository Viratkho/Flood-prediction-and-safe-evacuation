import React from 'react';
import { TextClipReveal } from './common/TextClipReveal';
import {
  Shield,
  Activity,
  Radio,
  Download,
  Navigation,
  LifeBuoy,
  Users,
  ArrowRight,
  Lock,
  QrCode,
  CheckCircle2,
Waves,
} from 'lucide-react';

interface WelcomePageProps {
  onGetStarted: () => void;
  onUserLogin: () => void;
  onAdminLogin: () => void;
  onOpenFloodPrediction?: () => void;
  registeredCount: number;
  activeSensorsCount: number;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onGetStarted,
  onUserLogin,
  onAdminLogin,
  onOpenFloodPrediction,
  registeredCount,
  activeSensorsCount,
}) => {
  const capabilities = [
    {
      icon: <Activity className="w-6 h-6 text-sky-400" />,
      title: 'Real-Time Hydrological Monitoring',
      description:
        'Continuous road-surface flood depth sensing, dam reservoir telemetry, and surge rate-of-rise tracking across local catchment basins.',
      badge: `${activeSensorsCount} IoT Sensors Active`,
    },
    {
      icon: <LifeBuoy className="w-6 h-6 text-emerald-400" />,
      title: 'Wearable Band Vitals Telemetry',
      description:
        'Live pulse oximetry (SpO2), heart rate monitoring, and automatic emergency SOS beacon transmission for high-risk citizens.',
      badge: 'Continuous Telemetry',
    },
    {
      icon: <Radio className="w-6 h-6 text-amber-400" />,
      title: 'LoRa Off-Grid Mesh Communication',
      description:
        'Long-range decentralized radio communication that operates uninterrupted during total cellular network blackout and power outages.',
      badge: 'Zero Cellular Dependency',
    },
    {
      icon: <Download className="w-6 h-6 text-indigo-400" />,
      title: 'Offline-First Progressive Web App',
      description:
        'Full offline operation with pre-cached OpenStreetMap vector tiles, road geometries, and local SQLite data persistence.',
      badge: '100% Free & Open Source',
    },
    {
      icon: <Navigation className="w-6 h-6 text-[#ff7700]" />,
      title: 'Google Maps-Style Safe Routing',
      description:
        'Turn-by-turn evacuation navigation driven by A* search with quadratic flood depth penalties, dynamically avoiding roads with >50cm water.',
      badge: 'Live Turn-by-Turn HUD',
    },
    {
      icon: <Users className="w-6 h-6 text-cyan-400" />,
      title: 'Victim Drift & Stagnation Analytics',
      description:
        'Hydraulic vector calculation to detect drifting victims in moving waters and identify post-flood stagnant biological hazard zones.',
      badge: 'Physics-Based Modeling',
    },
    {
      icon: <Shield className="w-6 h-6 text-purple-400" />,
      title: 'Multi-Agency Incident Coordination',
      description:
        'Dynamic triage prioritization from P0 (Immediate Danger) to P4, automated incident dispatch, and role-based tactical command.',
      badge: 'NDRF & First Responders',
    },
  ];

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-10 py-4">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/40 text-sky-300 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
            <TextClipReveal
              text="FloodGuard 2.1 • Complete Free Local Tactical Evacuation System"
              as="span"
              initialDelayMs={60}
              charDelayMs={12}
              durationMs={380}
            />
          </div>

          <div className="space-y-3 py-2">
            {/* Primary Project Brand Heading with Strongest Letter-by-Letter Slide-Down Animation */}
            <TextClipReveal
              text="FLOODGUARD"
              as="h1"
              className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-none uppercase select-none font-mono"
              charClassName="text-white drop-shadow-[0_4px_24px_rgba(56,189,248,0.25)]"
              charDelayMs={55}
              initialDelayMs={120}
              durationMs={600}
            />

            {/* Supporting Tagline with Subtle Staggered Slide-Down Reveal */}
            <TextClipReveal
              text="Smarter Detection. Safer Routes. Faster Rescue."
              as="p"
              className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent"
              charDelayMs={20}
              initialDelayMs={720}
              durationMs={480}
            />
          </div>

          <TextClipReveal
            text="Predict Floods. Protect Lives. Community-first emergency defense platform combining IoT hydrological sensing, wearable physiological telemetry, LoRa off-grid mesh, and Google Maps-style safe ground navigation."
            as="p"
            className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto"
            charDelayMs={5}
            initialDelayMs={900}
            durationMs={350}
          />

          {/* 3 Entry Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            {/* 1. Get Started Button */}
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#e66c00] hover:to-amber-600 text-white font-bold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition transform hover:-translate-y-0.5 active:scale-95"
            >
              <TextClipReveal
                text="Get Started (Register)"
                as="span"
                initialDelayMs={1050}
                charDelayMs={14}
                durationMs={400}
              />
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            {/* 2. User Login Button */}
            <button
              onClick={onUserLogin}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 font-bold text-sm uppercase tracking-wider shadow flex items-center justify-center gap-2 transition hover:border-sky-500/50"
            >
              <QrCode className="w-4 h-4 text-sky-400 shrink-0" />
              <TextClipReveal
                text="User Login (Dashboard / QR)"
                as="span"
                initialDelayMs={1120}
                charDelayMs={14}
                durationMs={400}
              />
            </button>

            {/* 4. Hydro Prediction & SQLite Hub Button */}
            {onOpenFloodPrediction && (
              <button
                onClick={onOpenFloodPrediction}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold text-sm uppercase tracking-wider shadow flex items-center justify-center gap-2 transition hover:border-sky-400"
              >
                <Waves className="w-4 h-4 text-sky-400" />
                <span>Prediction & SQLite Hub</span>
              </button>
            )}

            {/* 3. Admin Login Button */}
            <button
              onClick={onAdminLogin}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm uppercase tracking-wider shadow flex items-center justify-center gap-2 transition hover:border-amber-400"
            >
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <TextClipReveal
                text="Admin Login"
                as="span"
                initialDelayMs={1200}
                charDelayMs={16}
                durationMs={400}
              />
            </button>
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-slate-400 font-mono pt-2">
            <TextClipReveal
              text={`🛡️ ${registeredCount} Registered Citizens`}
              as="span"
              initialDelayMs={1300}
              charDelayMs={12}
              durationMs={380}
            />
            <span>•</span>
            <TextClipReveal
              text="⚡ 100% Free & Open Source"
              as="span"
              initialDelayMs={1400}
              charDelayMs={12}
              durationMs={380}
            />
            <span>•</span>
            <TextClipReveal
              text="🔒 Zero Paid APIs"
              as="span"
              initialDelayMs={1500}
              charDelayMs={12}
              durationMs={380}
            />
          </div>
        </div>

        {/* Core Capabilities Grid */}
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <TextClipReveal
              text="Comprehensive Tactical Capabilities"
              as="h2"
              className="text-xl sm:text-2xl font-bold text-white"
              animateOnView={true}
              initialDelayMs={80}
              charDelayMs={15}
              durationMs={450}
            />
            <TextClipReveal
              text="Engineered to operate reliably under extreme storm surges and total infrastructure collapse."
              as="p"
              className="text-xs sm:text-sm text-slate-400"
              animateOnView={true}
              initialDelayMs={250}
              charDelayMs={8}
              durationMs={380}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {capabilities.map((cap, idx) => (
              <div
                key={idx}
                className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-3 transition hover:shadow-xl hover:bg-slate-900/90"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    {cap.icon}
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    <TextClipReveal
                      text={cap.badge}
                      as="span"
                      animateOnView={true}
                      initialDelayMs={idx * 60 + 50}
                      charDelayMs={10}
                      durationMs={360}
                    />
                  </span>
                </div>
                <TextClipReveal
                  text={cap.title}
                  as="h3"
                  className="text-base font-bold text-white"
                  animateOnView={true}
                  initialDelayMs={idx * 60 + 100}
                  charDelayMs={14}
                  durationMs={400}
                />
                <TextClipReveal
                  text={cap.description}
                  as="p"
                  className="text-xs text-slate-300 leading-relaxed"
                  animateOnView={true}
                  initialDelayMs={idx * 60 + 160}
                  charDelayMs={6}
                  durationMs={350}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Free-Only Architecture Guarantee Callout */}
        <div className="bg-gradient-to-br from-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-6 text-slate-300 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider font-mono">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <TextClipReveal
              text="Strict Zero-Cost & Free-Only Guarantee"
              as="span"
              animateOnView={true}
              initialDelayMs={100}
              charDelayMs={15}
              durationMs={450}
            />
          </div>
          <TextClipReveal
            text="FloodGuard operates completely on free and open-source components. OpenStreetMap data, Leaflet mapping, Python FastAPI backend, SQLite local database, and free Web Speech voice guidance ensure the system functions without subscription fees, credit-card registration, or paid third-party API dependencies."
            as="p"
            className="text-xs sm:text-sm leading-relaxed text-slate-300"
            animateOnView={true}
            initialDelayMs={250}
            charDelayMs={5}
            durationMs={350}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono text-slate-300">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <TextClipReveal
                text="BACKEND"
                as="span"
                className="text-slate-400 block text-[10px]"
                animateOnView={true}
                initialDelayMs={350}
                charDelayMs={15}
              />
              <TextClipReveal
                text="FastAPI (Python)"
                as="span"
                className="font-bold text-white block"
                animateOnView={true}
                initialDelayMs={420}
                charDelayMs={12}
              />
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <TextClipReveal
                text="DATABASE"
                as="span"
                className="text-slate-400 block text-[10px]"
                animateOnView={true}
                initialDelayMs={400}
                charDelayMs={15}
              />
              <TextClipReveal
                text="SQLite 3 (Free)"
                as="span"
                className="font-bold text-white block"
                animateOnView={true}
                initialDelayMs={470}
                charDelayMs={12}
              />
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <TextClipReveal
                text="MAP TILES"
                as="span"
                className="text-slate-400 block text-[10px]"
                animateOnView={true}
                initialDelayMs={450}
                charDelayMs={15}
              />
              <TextClipReveal
                text="OpenStreetMap"
                as="span"
                className="font-bold text-white block"
                animateOnView={true}
                initialDelayMs={520}
                charDelayMs={12}
              />
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <TextClipReveal
                text="NAVIGATION"
                as="span"
                className="text-slate-400 block text-[10px]"
                animateOnView={true}
                initialDelayMs={500}
                charDelayMs={15}
              />
              <TextClipReveal
                text="A* Safe Routing"
                as="span"
                className="font-bold text-white block"
                animateOnView={true}
                initialDelayMs={570}
                charDelayMs={12}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};