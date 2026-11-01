import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
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
  Cpu,
  Brain,
  AlertTriangle,
  UserCheck,
  Compass,
  MapPin,
  HeartPulse,
  Eye,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface WelcomePageProps {
  onGetStarted: () => void;
  onUserLogin: () => void;
  onAdminLogin: () => void;
  onOpenFloodPrediction?: () => void;
  onOpenEvacuation?: () => void;
  onOpenMyLocation?: () => void;
  registeredCount: number;
  activeSensorsCount: number;
  citizenUser?: any | null;
  adminUser?: any | null;
  isAdmin?: boolean;
  isCitizen?: boolean;
  currentUser?: any | null;
  onLogoutCitizen?: () => void;
  onLogoutAdmin?: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onGetStarted,
  onUserLogin,
  onAdminLogin,
  onOpenFloodPrediction,
  onOpenEvacuation,
  onOpenMyLocation,
  registeredCount,
  activeSensorsCount,
  citizenUser,
  adminUser,
  isAdmin,
  isCitizen,
  currentUser,
  onLogoutCitizen,
  onLogoutAdmin,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const workflowRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Scroll Progress linked exclusively to Section 5 with custom scroll container explicitly bound
  const { scrollYProgress } = useScroll({
    target: workflowRef,
    container: containerRef,
    offset: ['start 75%', 'end 25%'],
  });

  const lineProgress = useTransform(scrollYProgress, [0, 1], [0, 1]);

  // Section 2: 7 Core Objectives
  const coreObjectives = [
    {
      icon: <Activity className="w-5 h-5 text-sky-400" />,
      title: 'Early Awareness of Flood Conditions',
      desc: 'Rapid detection of water level surges before roads become impassable.',
    },
    {
      icon: <Waves className="w-5 h-5 text-cyan-400" />,
      title: 'Hydrological Monitoring',
      desc: 'Live telemetry across dam reservoirs, road sensors, and catchment basins.',
    },
    {
      icon: <Brain className="w-5 h-5 text-indigo-400" />,
      title: 'Flood-Risk Prediction',
      desc: 'Physics-based runoff calculation to predict time-to-flood and hazard depth.',
    },
    {
      icon: <Radio className="w-5 h-5 text-amber-400" />,
      title: 'Emergency Communication',
      desc: 'Decentralized off-grid messaging that survives cellular infrastructure outages.',
    },
    {
      icon: <HeartPulse className="w-5 h-5 text-emerald-400" />,
      title: 'Citizen Safety & Location Assistance',
      desc: 'Private single-user location tracking and wearable health telemetry.',
    },
    {
      icon: <Navigation className="w-5 h-5 text-[#ff7700]" />,
      title: 'Safer Evacuation Planning',
      desc: 'Google Maps-style A* routing dynamically bypassing roads submerged >50cm.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-purple-400" />,
      title: 'Emergency Coordination',
      desc: 'Clinical triage prioritization (P0 to P4) for multi-agency rescue dispatch.',
    },
  ];

  // Section 3: 6 Critical Problems & FloodGuard Solutions
  const problemSolutions = [
    {
      num: '01',
      problem: 'Rapid Flood Inundation & Insufficient Warning',
      problemDesc:
        'Storm surges and sudden dam spillway releases develop in minutes, leaving vulnerable communities with insufficient advance warning.',
      solution: 'Real-Time Hydrological Telemetry',
      solutionDesc:
        'Continuous road-surface sensors and dam telemetry calculate real-time rate of rise, alerting communities before roads submerge.',
      icon: <Activity className="w-5 h-5 text-sky-400" />,
    },
    {
      num: '02',
      problem: 'Cellular & Power Grid Blackouts',
      problemDesc:
        'Severe floods flood cell towers and electrical substations, knocking out conventional 4G/5G mobile communication networks.',
      solution: 'LoRa Off-Grid Mesh Radio',
      solutionDesc:
        'Long-range decentralized radio communication relays distress signals and telemetry with zero dependency on commercial cellular towers.',
      icon: <Radio className="w-5 h-5 text-amber-400" />,
    },
    {
      num: '03',
      problem: 'Stranded Citizens Separated from Rescue',
      problemDesc:
        'Victims trapped in rising waters or separated from rescue teams cannot easily communicate their location, medical status, or distress.',
      solution: 'GPS / SOS Wearable Telemetry',
      solutionDesc:
        'Continuous pulse oximetry (SpO2), heart rate monitoring, and automatic SOS beacons transmit precise coordinates and vitals.',
      icon: <LifeBuoy className="w-5 h-5 text-emerald-400" />,
    },
    {
      num: '04',
      problem: 'Dangerous Navigation Across Flooded Roads',
      problemDesc:
        'Standard consumer mapping apps do not track water depth and frequently guide evacuees straight into lethal, washed-out roads.',
      solution: 'A* Safety-Aware Evacuation Routing',
      solutionDesc:
        'Applies quadratic flood penalties to route citizens exclusively through high-ground paths, strictly avoiding waters over 50cm.',
      icon: <Navigation className="w-5 h-5 text-[#ff7700]" />,
    },
    {
      num: '05',
      problem: 'Responder Overload & Lack of Triage Data',
      problemDesc:
        'Emergency response agencies receive hundreds of frantic calls without objective physiological data to prioritize who needs rescue first.',
      solution: 'Automated Clinical Triage (P0 to P4)',
      solutionDesc:
        'Evaluates medical vulnerabilities, heart rate anomalies, water depth, and victim drift physics to dispatch rescue squads effectively.',
      icon: <Users className="w-5 h-5 text-purple-400" />,
    },
    {
      num: '06',
      problem: 'Lack of Accessible Local Guidance',
      problemDesc:
        'Citizens often cannot access emergency information when disconnected from the internet or navigating amidst panic and confusion.',
      solution: 'Offline-First PWA & Voice Guidance',
      solutionDesc:
        'Pre-cached OpenStreetMap vector networks, local SQLite data persistence, and free offline voice directions guide families to safety.',
      icon: <Download className="w-5 h-5 text-indigo-400" />,
    },
  ];

  // Section 4: 8 Key Capabilities (Informative, Clean, No Operational Records)
  const keyCapabilities = [
    {
      icon: <Activity className="w-6 h-6 text-sky-400" />,
      title: 'Real-Time Hydrological Monitoring',
      description:
        'Continuous road-surface flood depth sensing, dam reservoir telemetry, and surge rate-of-rise tracking across local catchment basins.',
      badge: 'Hydrological Telemetry',
    },
    {
      icon: <Brain className="w-6 h-6 text-indigo-400" />,
      title: 'Flood Prediction & Risk Assessment',
      description:
        'Mathematical runoff and infiltration modeling calculating water rise velocity, hazard boundaries, and estimated time-to-flood.',
      badge: 'Predictive Modeling',
    },
    {
      icon: <Radio className="w-6 h-6 text-amber-400" />,
      title: 'LoRa-Based Emergency Communication',
      description:
        'Long-range decentralized radio communication that operates uninterrupted during total cellular network blackout and power outages.',
      badge: 'Zero Cellular Dependency',
    },
    {
      icon: <LifeBuoy className="w-6 h-6 text-emerald-400" />,
      title: 'GPS / SOS Wearable Assistance',
      description:
        'Live pulse oximetry (SpO2), heart rate monitoring, and automatic emergency SOS beacon transmission for high-risk citizens.',
      badge: 'Vitals & Beacon Telemetry',
    },
    {
      icon: <Navigation className="w-6 h-6 text-[#ff7700]" />,
      title: 'Safety-Aware Evacuation Routing',
      description:
        'Turn-by-turn evacuation navigation driven by A* search with quadratic flood depth penalties, dynamically avoiding roads with >50cm water.',
      badge: 'Google Maps-Style HUD',
    },
    {
      icon: <MapPin className="w-6 h-6 text-cyan-400" />,
      title: 'Citizen Location Assistance',
      description:
        'Private location tracking and shelter routing allowing citizens to monitor their position and nearest safe-haven relief centres.',
      badge: 'Privacy-Isolated View',
    },
    {
      icon: <Download className="w-6 h-6 text-teal-400" />,
      title: 'Offline-First Progressive Web App',
      description:
        'Full offline operation with pre-cached OpenStreetMap vector tiles, road geometries, and local SQLite data persistence.',
      badge: '100% Free & Open Source',
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-purple-400" />,
      title: 'Emergency Coordination',
      description:
        'Dynamic triage prioritization from P0 (Immediate Danger) to P4, automated incident dispatch, and role-based tactical command.',
      badge: 'NDRF & First Responders',
    },
  ];

  // Section 5: 7 Sequential Workflow Stages
  const workflowStages = [
    {
      stage: '01',
      title: 'Flood Monitoring',
      subtitle: 'Hydrological Telemetry & Dam Sensing',
      description:
        'Road-surface depth sensors and dam telemetry continuously measure water elevation, precipitation intensity, and surge velocity across the basin.',
      icon: <Activity className="w-5 h-5 text-sky-400" />,
      tag: 'IoT Data Collection',
    },
    {
      stage: '02',
      title: 'Data Ingestion & Processing',
      subtitle: 'Secure Ingestion & Stream Processing',
      description:
        'FloodGuard receives, validates, and normalizes sensory telemetry, wearable health packets, and municipal dam releases in real time.',
      icon: <Cpu className="w-5 h-5 text-teal-400" />,
      tag: 'Real-Time Ingestion',
    },
    {
      stage: '03',
      title: 'Flood Prediction',
      subtitle: 'Hydrological Modeling & Risk Estimation',
      description:
        'The predictive model evaluates rainfall intensity, elevation contours, and soil saturation to calculate runoff depth and time-to-inundation.',
      icon: <Brain className="w-5 h-5 text-indigo-400" />,
      tag: 'Predictive Analytics',
    },
    {
      stage: '04',
      title: 'Emergency Awareness',
      subtitle: 'Early Warnings & Risk Advisories',
      description:
        'Localized flood warnings, hazard severity levels, and dam discharge bulletins are broadcast to alert communities of developing threats.',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      tag: 'Early Warning Broadcast',
    },
    {
      stage: '05',
      title: 'Citizen Assistance',
      subtitle: 'Location-Aware Safety & SOS Telemetry',
      description:
        'Registered citizens access private GPS tracking, wearable physiological vitals, emergency SOS triggers, and designated high-ground shelters.',
      icon: <UserCheck className="w-5 h-5 text-emerald-400" />,
      tag: 'Citizen Protection',
    },
    {
      stage: '06',
      title: 'Safe Evacuation Routing',
      subtitle: 'Safety-Aware A* Turn-by-Turn Navigation',
      description:
        'FloodGuard calculates the safest evacuation route using distance, terrain elevation, and water depths, strictly avoiding roads submerged >50cm.',
      icon: <Compass className="w-5 h-5 text-[#ff7700]" />,
      tag: 'A* Safe Navigation',
    },
    {
      stage: '07',
      title: 'Rescue Coordination',
      subtitle: 'Command Center & Multi-Agency Dispatch',
      description:
        'Authorized emergency personnel use the Command Center to monitor live incidents, track responder squads, and prioritize high-risk rescues.',
      icon: <ShieldCheck className="w-5 h-5 text-purple-400" />,
      tag: 'Tactical Command',
    },
  ];

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-16 py-4">
        {/* ========================================================================= */}
        {/* SECTION 1: HERO / INTRODUCTION                                            */}
        {/* ========================================================================= */}
        <div className="text-center space-y-5 max-w-3xl mx-auto pt-2">
          {/* Status Badge */}
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

          {/* Primary Branding */}
          <div className="space-y-3 py-2">
            <TextClipReveal
              text="FLOODGUARD"
              as="h1"
              className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-none uppercase select-none font-mono"
              charClassName="text-white drop-shadow-[0_4px_24px_rgba(56,189,248,0.25)]"
              charDelayMs={55}
              initialDelayMs={120}
              durationMs={600}
            />

            <TextClipReveal
              text="Smarter Detection. Safer Routes. Faster Rescue."
              as="p"
              className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent"
              charDelayMs={20}
              initialDelayMs={720}
              durationMs={480}
            />
          </div>

          {/* Concise Overview Paragraph */}
          <TextClipReveal
            text="FloodGuard 2.1 is an integrated flood emergency monitoring and evacuation platform. Engineered to protect lives during severe storm surges and infrastructural collapse, it unites real-time hydrological sensing, physics-based flood prediction, off-grid LoRa communication, and Google Maps-style safe ground routing."
            as="p"
            className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto"
            charDelayMs={4}
            initialDelayMs={900}
            durationMs={350}
          />

          {/* ======================================================================= */}
          {/* MANDATORY: EXACT 3 ENTRY BUTTONS (PRESERVED PRECISELY)                 */}
          {/* ======================================================================= */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            {/* 1. GET STARTED (REGISTER) BUTTON */}
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

            {/* 2. USER LOGIN (DASHBOARD / QR) BUTTON */}
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

            {/* 3. ADMIN LOGIN BUTTON */}
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

          {/* Verification Badges */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 text-xs text-slate-400 font-mono pt-3">
            <span>🛡️ Community Flood Defense</span>
            <span>•</span>
            <span>⚡ 100% Free & Open Source</span>
            <span>•</span>
            <span>🔒 Zero Paid APIs</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: ABOUT FLOODGUARD                                               */}
        {/* ========================================================================= */}
        <div className="space-y-6 pt-4 border-t border-slate-800/80">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#ff7700]">
              Purpose & Objectives
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              About FloodGuard
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              FloodGuard is an integrated, free, community-first emergency defense platform built to safeguard citizens and guide emergency responders throughout life-threatening flood crises.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {coreObjectives.map((obj, i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 space-y-2 transition hover:bg-slate-900/90"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    {obj.icon}
                  </div>
                  <h3 className="text-sm font-bold text-white">{obj.title}</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed pl-1">
                  {obj.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: WHY FLOODGUARD IS NEEDED (6 PROBLEMS & SOLUTIONS)              */}
        {/* ========================================================================= */}
        <div className="space-y-6 pt-4 border-t border-slate-800/80">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              The Real-World Challenge
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Why FloodGuard Is Needed
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Severe flooding causes systemic infrastructure failures. FloodGuard is engineered to address the specific failure points of conventional disaster management.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {problemSolutions.map((item, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-800 border border-slate-700">
                      {item.icon}
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      PROBLEM {item.num}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Failure Point
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-red-300/90">
                    {item.problem}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.problemDesc}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <div className="text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>FloodGuard Solution: {item.solution}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {item.solutionDesc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: KEY FLOODGUARD CAPABILITIES                                   */}
        {/* ========================================================================= */}
        <div className="space-y-6 pt-4 border-t border-slate-800/80">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400">
              Platform Features
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Key Capabilities
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Every capability is implemented with 100% free, local, and open-source technologies—guaranteeing continuous access during catastrophic events.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {keyCapabilities.map((cap, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-3 transition hover:bg-slate-900/90 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                      {cap.icon}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {cap.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white leading-snug">
                    {cap.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 5: HOW FLOODGUARD WORKS (WITH SCROLL JOURNEY LINE ANIMATION)      */}
        {/* ========================================================================= */}
        <section
          ref={workflowRef}
          className="space-y-8 pt-6 border-t border-slate-800/80 relative"
          aria-labelledby="workflow-heading"
        >
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#00c8ff]">
              FLOODGUARD SYSTEM ARCHITECTURE
            </span>
            <h2 id="workflow-heading" className="text-2xl sm:text-3xl font-extrabold text-white">
              How FloodGuard Works
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Follow the journey from flood monitoring to emergency response.
            </p>
          </div>

          {/* Connected Scroll Journey Section with Progressive SVG Line */}
          <div className="relative max-w-3xl mx-auto py-6">
            {/* SVG Progressive Journey Line: Aligned with center of step nodes */}
            <svg
              className="absolute top-6 bottom-6 left-[24px] sm:left-[28px] -translate-x-1/2 w-1 h-[calc(100%-48px)] overflow-visible pointer-events-none z-0"
              viewBox="0 0 4 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* Background Guide Line */}
              <path
                d="M 2 0 V 1000"
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Framer Motion Progressive Journey Line */}
              <motion.path
                d="M 2 0 V 1000"
                fill="none"
                stroke="#ff7700"
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                style={{
                  pathLength: shouldReduceMotion ? 1 : lineProgress,
                  filter: 'drop-shadow(0 0 6px rgba(255, 119, 0, 0.6))',
                }}
              />
            </svg>

            {/* Stages Stack */}
            <div className="space-y-8 relative z-10">
              {workflowStages.map((stage, idx) => (
                <div key={idx} className="relative flex items-start gap-4 sm:gap-6">
                  {/* Node Icon Indicator */}
                  <div className="relative z-10 w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-[#101c30] border-2 border-[#00bfff] shadow-[0_0_15px_rgba(0,191,255,0.15)] flex items-center justify-center shrink-0 text-white">
                    {stage.icon}
                  </div>

                  {/* Stage Content Card with Framer Motion reveal */}
                  <motion.div
                    className="flex-1 p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 shadow-md space-y-2 transition"
                    initial={{ opacity: 0, y: 25 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: false, amount: 0.25 }}
                    transition={{ duration: 0.45, delay: 0.05 }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-extrabold text-[#ff7700]">
                          STEP {stage.stage}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white">
                          {stage.title}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {stage.tag}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-300">
                      {stage.subtitle}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {stage.description}
                    </p>
                  </motion.div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FREE-ONLY ZERO-COST GUARANTEE & CLOSING CALL TO ACTION                   */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 text-slate-300 space-y-4">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm uppercase tracking-wider font-mono">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Strict Zero-Cost & Free-Only Guarantee</span>
          </div>

          <p className="text-xs sm:text-sm leading-relaxed text-slate-300 max-w-3xl">
            FloodGuard operates completely on free and open-source components. OpenStreetMap data, Leaflet mapping, Python FastAPI backend, SQLite local database, and free Web Speech voice guidance ensure the system functions without subscription fees, credit-card registration, or paid third-party API dependencies.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono text-slate-300">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">BACKEND</span>
              <strong className="font-bold text-white block">FastAPI (Python)</strong>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">DATABASE</span>
              <strong className="font-bold text-white block">SQLite 3 (Free)</strong>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">MAP TILES</span>
              <strong className="font-bold text-white block">OpenStreetMap</strong>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">NAVIGATION</span>
              <strong className="font-bold text-white block">A* Safe Routing</strong>
            </div>
          </div>

          {/* Re-affirming Entry Buttons at Bottom */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-start gap-3 border-t border-slate-800">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#e66c00] hover:to-amber-600 text-white font-bold text-xs uppercase tracking-wider shadow flex items-center justify-center gap-2 transition"
            >
              <span>Get Started (Register)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onUserLogin}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 font-bold text-xs uppercase tracking-wider shadow flex items-center justify-center gap-2 transition"
            >
              <QrCode className="w-3.5 h-3.5 text-sky-400" />
              <span>User Login (Dashboard / QR)</span>
            </button>

            <button
              onClick={onAdminLogin}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs uppercase tracking-wider shadow flex items-center justify-center gap-2 transition"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Login</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
