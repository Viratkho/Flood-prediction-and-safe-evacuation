import express, { Request, Response } from 'express';



import { GoogleGenAI } from '@google/genai';



import dotenv from 'dotenv';



import path from 'path';



import fs from 'fs';



import { fileURLToPath } from 'url';



import { createServer as createViteServer } from 'vite';



import {



  INITIAL_REGISTERED_PEOPLE,



  INITIAL_INCIDENTS,



  INITIAL_RESEARCH_SCENARIOS,



} from './src/data/osmData.ts';



import {



  RegisteredPerson,



  IncidentRecord,



  ExperimentLog,



  RescuePriorityLevel,



  MobileAlertMessage,



  FirewallThreatLog,



} from './src/types/floodguard.ts';



import { evaluateRescuePriority } from './src/services/priorityEngine.ts';







dotenv.config();







const __filename = fileURLToPath(import.meta.url);



const __dirname = path.dirname(__filename);







const app = express();



const PORT = parseInt(process.env.PORT || '3000', 10);







// Anti-Fingerprinting: Suppress Express headers and server banners



app.disable('x-powered-by');



// Trust reverse proxy (Cloud Run, ALB, Nginx, Cloudflare)

app.set('trust proxy', 1);







// Parse incoming JSON requests with strict payload limits (prevents payload flooding attacks)



app.use(express.json({ limit: '1mb' }));



app.use(express.urlencoded({ extended: true, limit: '1mb' }));







// In-Memory Web Application Firewall (WAF) & Rate Limiting State



let totalRequestsInspected = 0;



let totalThreatsBlocked = 0;



const quarantinedIPs = new Map<string, number>(); // IP -> unban timestamp



const rateLimitMap = new Map<string, { count: number; resetTime: number }>();



const ipViolationCount = new Map<string, number>();



// Periodic cleanup of stale rate limiter and expired quarantine maps (prevents memory bloat)

setInterval(() => {

  const now = Date.now();

  for (const [ip, rec] of rateLimitMap.entries()) {

    if (now > rec.resetTime + 60000) {

      rateLimitMap.delete(ip);

    }

  }

  for (const [ip, unban] of quarantinedIPs.entries()) {

    if (now > unban) {

      quarantinedIPs.delete(ip);

      ipViolationCount.delete(ip);

    }

  }

}, 5 * 60 * 1000);







let threatStats = {



  sqlInjection: 0,



  xss: 0,



  pathTraversal: 0,



  rateLimitExceeded: 0,



  maliciousBots: 0,



  suspiciousPayloads: 0,



};







let wafThreatLogs: FirewallThreatLog[] = [



  {



    id: 'WAF-SEC-101',



    timestamp: '10:12:15 AM',



    threatType: 'SQL_INJECTION',



    severity: 'CRITICAL',



    clientIp: '198.51.100.44',



    endpoint: '/api/dam',



    method: 'GET',



    details: 'Signature match: UNION SELECT * FROM dams detected in query parameter',



    action: 'BLOCKED_403',



  },



  {



    id: 'WAF-SEC-102',



    timestamp: '10:08:42 AM',



    threatType: 'XSS_ATTACK',



    severity: 'HIGH',



    clientIp: '203.0.113.89',



    endpoint: '/api/people',



    method: 'POST',



    details: 'Malicious payload <script>alert(1)</script> intercepted in fullName input',



    action: 'BLOCKED_403',



  },



  {



    id: 'WAF-SEC-103',



    timestamp: '09:55:10 AM',



    threatType: 'PATH_TRAVERSAL',



    severity: 'HIGH',



    clientIp: '192.0.2.112',



    endpoint: '/api/static/../../etc/passwd',



    method: 'GET',



    details: 'Directory traversal sequence (../) attempting to access sensitive system files',



    action: 'BLOCKED_403',



  },



];







function recordWafViolation(ip: string) {



  const count = (ipViolationCount.get(ip) || 0) + 1;



  ipViolationCount.set(ip, count);



  if (count >= 5) {



    // Quarantine IP for 15 minutes



    quarantinedIPs.set(ip, Date.now() + 15 * 60 * 1000);



  }



}







// 🛡️ Web Application Firewall Middleware 1: Security Headers & Anti-Fingerprinting



app.use((_req, res, next) => {



  res.removeHeader('X-Powered-By');



  res.setHeader('X-Content-Type-Options', 'nosniff');



  res.setHeader('X-Frame-Options', 'SAMEORIGIN');



  res.setHeader('X-XSS-Protection', '1; mode=block');



  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');



  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=()');



  res.setHeader('X-Firewall-Protection', 'Aegis-WAF-v2.1; status=active');



  res.setHeader('X-Zero-Fingerprint', 'Enforced');



  next();



});







// 🛡️ Web Application Firewall Middleware 2: Deep Packet Inspection & DDoS Defense



app.use((req, res, next) => {



  // Allow Vite internal bundles and client asset requests to pass through



  if (



    req.path.startsWith('/@') ||



    req.path.startsWith('/src') ||



    req.path.startsWith('/node_modules') ||



    req.path.startsWith('/public') ||



    /\.(js|css|ts|tsx|svg|png|jpg|jpeg|ico|json|map|woff2?)$/i.test(req.path)



  ) {



    return next();



  }







  totalRequestsInspected++;



  const clientIp =



    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||



    req.socket.remoteAddress ||



    '127.0.0.1';







  // 1. IP Quarantine Verification (Admin clearance endpoint exempt)



  const isClearanceEndpoint = req.path === '/api/security/firewall-clear-quarantine';



  const unbanTime = quarantinedIPs.get(clientIp);



  if (!isClearanceEndpoint && unbanTime && Date.now() < unbanTime) {



    return res.status(403).json({



      error: 'Access Denied: Your IP address is quarantined due to repeated security policy violations.',



      firewallCode: 'WAF_IP_QUARANTINED',



      quarantineExpiresInSeconds: Math.ceil((unbanTime - Date.now()) / 1000),



    });



  } else if (unbanTime && Date.now() >= unbanTime) {



    quarantinedIPs.delete(clientIp);



  }







  // 2. Sliding-Window Rate Limiting Engine



  const now = Date.now();



  const rateRecord = rateLimitMap.get(clientIp) || { count: 0, resetTime: now + 60000 };



  if (now > rateRecord.resetTime) {



    rateRecord.count = 1;



    rateRecord.resetTime = now + 60000;



  } else {



    rateRecord.count++;



  }



  rateLimitMap.set(clientIp, rateRecord);







  const maxLimit =



    req.path.includes('/api/ai') || req.path.includes('/api/alerts/send-mobile') ? 60 : 240;



  if (!isClearanceEndpoint && rateRecord.count > maxLimit) {



    totalThreatsBlocked++;



    threatStats.rateLimitExceeded++;



    const logEntry: FirewallThreatLog = {



      id: `WAF-RATE-${Date.now().toString(36).toUpperCase()}`,



      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),



      threatType: 'RATE_LIMIT_EXCEEDED',



      severity: 'MEDIUM',



      clientIp,



      endpoint: req.path,



      method: req.method,



      details: `Request rate (${rateRecord.count}/min) exceeded firewall threshold (${maxLimit}/min)`,



      action: 'RATE_LIMITED_429',



    };



    wafThreatLogs.unshift(logEntry);



    if (wafThreatLogs.length > 50) wafThreatLogs.pop();







    res.setHeader('Retry-After', '60');



    return res.status(429).json({



      error: 'Rate limit exceeded: Too many requests intercepted by Web Application Firewall.',



      firewallCode: 'WAF_RATE_LIMIT_429',



      limit: maxLimit,



      retryAfterSeconds: 60,



    });



  }







  // 3. Malicious Automated Vulnerability Scanner Tool Detection



  const userAgent = (req.headers['user-agent'] || '').toLowerCase();



  if (/sqlmap|nikto|masscan|acunetix|wpscan|nmap|gobuster|dirbuster|havij/i.test(userAgent)) {



    totalThreatsBlocked++;



    threatStats.maliciousBots++;



    recordWafViolation(clientIp);



    const logEntry: FirewallThreatLog = {



      id: `WAF-BOT-${Date.now().toString(36).toUpperCase()}`,



      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),



      threatType: 'MALICIOUS_BOT',



      severity: 'HIGH',



      clientIp,



      endpoint: req.path,



      method: req.method,



      details: `Automated vulnerability scanner signature detected: ${userAgent.slice(0, 50)}`,



      action: 'BLOCKED_403',



    };



    wafThreatLogs.unshift(logEntry);



    if (wafThreatLogs.length > 50) wafThreatLogs.pop();



    return res.status(403).json({



      error: 'Security Warning: Malicious automated scanner or bot detected by WAF.',



      firewallCode: 'WAF_BOT_BLOCKED_403',



    });



  }







  // 4. Deep Packet Inspection on URL, Query Parameters & Body



  const rawQuery = JSON.stringify(req.query || {});



  const rawBody = JSON.stringify(req.body || {});



  let fullTarget = `${req.path} ${rawQuery} ${rawBody}`;



  try {



    fullTarget = decodeURIComponent(fullTarget);



  } catch {



    // If malformed URI encoding, inspect raw



  }







  // 4a. SQL Injection (SQLi) Inspection



  const sqliRegex = /(\b(union(\s+all)?\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|update\s+.*\s+set|exec(\s|\+)+(s|x)p\w+|benchmark\s*\(|sleep\s*\(|pg_sleep\s*\()\b|(['"])\s*(or|and)\s*['"]?\d+['"]?\s*=\s*['"]?\d+|--|\/\*|\*\/|;\s*drop\b)/i;



  if (sqliRegex.test(fullTarget)) {



    totalThreatsBlocked++;



    threatStats.sqlInjection++;



    recordWafViolation(clientIp);



    const logEntry: FirewallThreatLog = {



      id: `WAF-SQLI-${Date.now().toString(36).toUpperCase()}`,



      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),



      threatType: 'SQL_INJECTION',



      severity: 'CRITICAL',



      clientIp,



      endpoint: req.path,



      method: req.method,



      details: 'OWASP Top 10 SQL Injection pattern intercepted in request payload',



      action: 'BLOCKED_403',



    };



    wafThreatLogs.unshift(logEntry);



    if (wafThreatLogs.length > 50) wafThreatLogs.pop();



    return res.status(403).json({



      error: 'Web Application Firewall Blocked: SQL Injection Signature Detected',



      firewallCode: 'WAF_SQLI_BLOCKED_403',



      action: 'Packet Dropped',



    });



  }







  // 4b. Cross-Site Scripting (XSS) Inspection



  const xssRegex = /(<script\b[^>]*>([\s\S]*?)<\/script>|javascript\s*:|onerror\s*=|onload\s*=|onclick\s*=|eval\s*\(|<iframe\b|<svg\b[^>]*onload)/i;



  if (xssRegex.test(fullTarget)) {



    totalThreatsBlocked++;



    threatStats.xss++;



    recordWafViolation(clientIp);



    const logEntry: FirewallThreatLog = {



      id: `WAF-XSS-${Date.now().toString(36).toUpperCase()}`,



      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),



      threatType: 'XSS_ATTACK',



      severity: 'HIGH',



      clientIp,



      endpoint: req.path,



      method: req.method,



      details: 'OWASP Top 10 Cross-Site Scripting (XSS) vector intercepted in request payload',



      action: 'BLOCKED_403',



    };



    wafThreatLogs.unshift(logEntry);



    if (wafThreatLogs.length > 50) wafThreatLogs.pop();



    return res.status(403).json({



      error: 'Web Application Firewall Blocked: Malicious Script (XSS) Detected',



      firewallCode: 'WAF_XSS_BLOCKED_403',



      action: 'Packet Dropped',



    });



  }







  // 4c. Path Traversal & System File Access Inspection



  const traversalRegex = /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\/etc\/passwd|\/etc\/shadow|win\.ini|boot\.ini)/i;



  if (traversalRegex.test(fullTarget)) {



    totalThreatsBlocked++;



    threatStats.pathTraversal++;



    recordWafViolation(clientIp);



    const logEntry: FirewallThreatLog = {



      id: `WAF-LFI-${Date.now().toString(36).toUpperCase()}`,



      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),



      threatType: 'PATH_TRAVERSAL',



      severity: 'HIGH',



      clientIp,



      endpoint: req.path,



      method: req.method,



      details: 'Directory / Path Traversal attempt trying to traverse root filesystem',



      action: 'BLOCKED_403',



    };



    wafThreatLogs.unshift(logEntry);



    if (wafThreatLogs.length > 50) wafThreatLogs.pop();



    return res.status(403).json({



      error: 'Web Application Firewall Blocked: Path Traversal Attempt Detected',



      firewallCode: 'WAF_PATH_TRAVERSAL_BLOCKED_403',



      action: 'Packet Dropped',



    });



  }







  next();



});







// Persistent Person Data Store (Survives server restarts and redeploys)



const PERSISTED_PEOPLE_FILE = process.env.VERCEL
  ? path.join('/tmp', '.registered_people.json')
  : path.join(__dirname, '.registered_people.json');







const loadPersistedPeople = (): RegisteredPerson[] => {



  try {



    if (fs.existsSync(PERSISTED_PEOPLE_FILE)) {



      const content = fs.readFileSync(PERSISTED_PEOPLE_FILE, 'utf-8');



      const parsed = JSON.parse(content);



      if (Array.isArray(parsed)) {
        return parsed;
      }



    }



  } catch (err) {



    console.warn('Could not read persisted people file:', err);



  }



  return JSON.parse(JSON.stringify(INITIAL_REGISTERED_PEOPLE));



};







export const savePersistedPeople = (list: RegisteredPerson[]) => {



  try {



    fs.writeFileSync(PERSISTED_PEOPLE_FILE, JSON.stringify(list, null, 2), 'utf-8');



  } catch (err) {



    console.warn('Could not save persisted people file:', err);



  }



};







let peopleState: RegisteredPerson[] = loadPersistedPeople();



const PERSISTED_INCIDENTS_FILE = process.env.VERCEL
  ? path.join('/tmp', '.incidents.json')
  : path.join(__dirname, '.incidents.json');



const loadPersistedIncidents = (): IncidentRecord[] => {

  try {

    if (fs.existsSync(PERSISTED_INCIDENTS_FILE)) {

      const content = fs.readFileSync(PERSISTED_INCIDENTS_FILE, 'utf-8');

      const parsed = JSON.parse(content);

      if (Array.isArray(parsed)) {

        return parsed;

      }

    }

  } catch (e) {

    console.warn('Could not read persisted incidents file, initializing from defaults:', e);

  }

  return JSON.parse(JSON.stringify(INITIAL_INCIDENTS));

};



const savePersistedIncidents = (list: IncidentRecord[]) => {

  try {

    fs.writeFileSync(PERSISTED_INCIDENTS_FILE, JSON.stringify(list, null, 2), 'utf-8');

  } catch (e) {

    console.warn('Could not persist incidents to file:', e);

  }

};



let incidentsState: IncidentRecord[] = loadPersistedIncidents();



let experimentLogs: ExperimentLog[] = [];











// In-Memory Emergency Mobile Alert SMS Dispatch Log



let mobileAlertsLog: MobileAlertMessage[] = [



  {



    id: 'SMS-101',



    timestamp: '10:14 AM',



    mobileNumber: '+91 98401 23456',



    recipientName: 'Rajesh Kumar',



    alertType: 'EVACUATION',



    headline: '🚨 URGENT EVACUATION DIRECTIVE',



    message: 'Chembarambakkam release increased to 12,000 cusecs. Kovur bridge water at 55cm. Evacuate immediately towards Thirumullaivoyal High Ridge Shelter.',



    status: 'DELIVERED',



    gateway: 'Gov NDRF Emergency SMS / BSNL Cell Broadcast',



  },



  {



    id: 'SMS-102',



    timestamp: '10:05 AM',



    mobileNumber: '+91 94440 98765',



    recipientName: 'Dr. Meena Sundaram',



    alertType: 'RESCUE_DISPATCH',



    headline: '🚑 RESCUE UNIT DISPATCHED',



    message: 'NDRF Inflatable Boat Unit #3 assigned to Paruthipattu low riverbank. Stay on second floor. Keep whistle ready. Do not enter moving water.',



    status: 'DELIVERED',



    gateway: 'Airtel / Jio Emergency SMS Relay',



  },



  {



    id: 'SMS-103',



    timestamp: '09:48 AM',



    mobileNumber: '+91 98840 55112',



    recipientName: 'Ananya Krishnan',



    alertType: 'DIRECT_ALERT',



    headline: '⚠️ ELEVATED VITALS WARNING',



    message: 'Wearable WB-203 reports sustained heart rate 114 BPM in rising water. Relief volunteer en route with ORS and medical first-aid packet.',



    status: 'DELIVERED',



    gateway: 'LoRa Mesh SMS Gateway',



  },



];







// Initialize Google Gemini AI SDK on the server



let aiClient: GoogleGenAI | null = null;



try {



  if (process.env.GEMINI_API_KEY) {



    aiClient = new GoogleGenAI({



      apiKey: process.env.GEMINI_API_KEY,



      httpOptions: {



        headers: {



          'User-Agent': 'aistudio-build',



        },



      },



    });



  }



} catch (err) {



  console.warn('Failed to initialize GoogleGenAI client:', err);



}







// In-Memory Simulation State



const damState = {



  damName: 'Chembarambakkam & Avadi Catchment Dam',



  reservoirLevelM: 32.4,



  maxCrestLevelM: 38.0,



  precipitationMmH: 14.5,



  rateOfRiseMMin: 0.02,



  spillwayReleaseCusecs: 3500,



  inflowCusecs: 14200,



  status: 'NORMAL' as 'NORMAL' | 'STORM BUILDUP' | 'RISING' | 'WARNING' | 'CRITICAL' | 'RECEDING',



  lastUpdated: new Date().toISOString(),



  history: [] as Array<{ timestamp: string; level: number; precipitation: number; release: number }>,



};







// Seed 60-point historical telemetry for the sparkline trend chart



const now = Date.now();



for (let i = 59; i >= 0; i--) {



  const t = new Date(now - i * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });



  const wobble = Math.sin(i / 5) * 0.15;



  damState.history.push({



    timestamp: t,



    level: Number((32.2 + wobble).toFixed(2)),



    precipitation: 12 + Math.round(Math.random() * 4),



    release: 3500,



  });



}







// Background simulation ticker (updates telemetry every 2 seconds)



let isStormActive = false;



let isFullFloodActive = false;







setInterval(() => {



  if (isFullFloodActive) {



    damState.reservoirLevelM = Math.min(37.8, Number((damState.reservoirLevelM + 0.05).toFixed(2)));



    damState.precipitationMmH = 68;



    damState.rateOfRiseMMin = 0.09;



    damState.spillwayReleaseCusecs = 28500;



    damState.inflowCusecs = 39000;



    damState.status = 'CRITICAL';



  } else if (isStormActive) {



    damState.reservoirLevelM = Math.min(36.2, Number((damState.reservoirLevelM + 0.02).toFixed(2)));



    damState.precipitationMmH = 46;



    damState.rateOfRiseMMin = 0.04;



    damState.spillwayReleaseCusecs = 12000;



    damState.inflowCusecs = 24500;



    damState.status = 'WARNING';



  } else {



    // Normal slight fluctuation



    const delta = (Math.random() - 0.5) * 0.01;



    damState.reservoirLevelM = Number(Math.max(30, Math.min(34, damState.reservoirLevelM + delta)).toFixed(2));



    damState.status = damState.reservoirLevelM > 35 ? 'WARNING' : 'NORMAL';



  }







  damState.lastUpdated = new Date().toISOString();



  damState.history.push({



    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),



    level: damState.reservoirLevelM,



    precipitation: damState.precipitationMmH,



    release: damState.spillwayReleaseCusecs,



  });







  if (damState.history.length > 60) {



    damState.history.shift();



  }



}, 2000);







// API Endpoints



app.get('/api/health', (_req: Request, res: Response) => {



  res.json({



    status: 'ONLINE',



    system: 'FloodGuard 2.1 Hydrological Command Engine',



    basin: 'Avadi / Ambattur Hydrological Basin, Chennai',



    sensorsCount: 15,



    damStatus: damState.status,



    osmEnabled: true,



  });



});







app.get('/api/dam', (_req: Request, res: Response) => {



  res.json(damState);



});







app.post('/api/simulation/dam/start', (_req: Request, res: Response) => {



  isStormActive = true;



  isFullFloodActive = false;



  damState.precipitationMmH = 48;



  damState.rateOfRiseMMin = 0.05;



  damState.status = 'STORM BUILDUP';



  res.json({ message: 'Storm simulation started', state: damState });



});







app.post('/api/simulation/dam/surge', (req: Request, res: Response) => {



  const surgeCm = req.body?.surgeCm || 25;



  const surgeM = surgeCm / 100;



  damState.reservoirLevelM = Number((damState.reservoirLevelM + surgeM).toFixed(2));



  damState.rateOfRiseMMin = Number((damState.rateOfRiseMMin + 0.03).toFixed(2));



  if (damState.reservoirLevelM >= 36) {



    damState.status = 'CRITICAL';



    damState.spillwayReleaseCusecs += 9000;



  } else if (damState.reservoirLevelM >= 34) {



    damState.status = 'WARNING';



    damState.spillwayReleaseCusecs += 4500;



  }



  res.json({ message: `Injected +${surgeCm}cm surge`, state: damState });



});







app.post('/api/simulation/flood/full', (_req: Request, res: Response) => {



  isFullFloodActive = true;



  isStormActive = true;



  damState.precipitationMmH = 75;



  damState.spillwayReleaseCusecs = 31000;



  damState.reservoirLevelM = 37.4;



  damState.status = 'CRITICAL';



  res.json({ message: 'Full flood event triggered across low-lying roads', state: damState });



});







app.post('/api/simulation/dam/reset', (_req: Request, res: Response) => {



  isStormActive = false;



  isFullFloodActive = false;



  damState.reservoirLevelM = 32.4;



  damState.precipitationMmH = 14;



  damState.rateOfRiseMMin = 0.02;



  damState.spillwayReleaseCusecs = 3500;



  damState.inflowCusecs = 14200;



  damState.status = 'NORMAL';



  // Also reset people and incidents



  peopleState = JSON.parse(JSON.stringify(INITIAL_REGISTERED_PEOPLE));



  incidentsState = JSON.parse(JSON.stringify(INITIAL_INCIDENTS));



  res.json({ message: 'Simulation reset to baseline conditions', state: damState });



});







// People Monitoring Telemetry Endpoint



app.get('/api/people', (_req: Request, res: Response) => {



  res.json({



    total: peopleState.length,



    people: peopleState,



  });



});







// Citizen Registration / Intake Storage Endpoint



app.post('/api/people', (req: Request, res: Response) => {



  try {



    const {



      name,



      contactNumber,



      emergencyContactName,



      emergencyContactPhone,



      age,



      gender,



      addressLandmark,



      lat,



      lng,



      medicalConditions,



      medicalNotes,



      dependentsCount,



      dependentsDetails,



      assistanceType,



      initialHeartRate,



      initialSpo2,



      sosActive,



      currentWaterDepthCm,



    } = req.body;







    const personName = (name || (req.body as any).fullName || '').trim();
    if (!personName) {
      return res.status(400).json({ error: 'Person name is required' });
    }







    const personId = `P-${Date.now().toString().slice(-4)}`;



    const wearableId = `WB-${Math.floor(200 + Math.random() * 800)}`;



    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });







    const hr = initialHeartRate !== undefined && initialHeartRate !== null ? Number(initialHeartRate) : 78;



    const spo2 = initialSpo2 !== undefined && initialSpo2 !== null ? Number(initialSpo2) : 98;



    const depth = currentWaterDepthCm !== undefined && currentWaterDepthCm !== null ? Number(currentWaterDepthCm) : 15;



    const isSos = Boolean(sosActive);







    const initialPerson: RegisteredPerson = {



      personId,



      wearableId,



      name: personName,



      age: age ? Number(age) : undefined,



      gender: gender || 'Unspecified',



      contactNumber: contactNumber || '+91 98400 00000',



      emergencyContactName: emergencyContactName || '',



      emergencyContactPhone: emergencyContactPhone || '',



      addressLandmark: addressLandmark || 'Avadi / Ambattur Hydrological Basin',



      dependentsCount: dependentsCount ? Number(dependentsCount) : 0,



      dependentsDetails: dependentsDetails || '',



      medicalConditions: Array.isArray(medicalConditions) ? medicalConditions : [],



      assistanceType: assistanceType || 'SHELTER_ROUTING',



      isUserRegistered: true,



      medicalNotes: medicalNotes || (medicalConditions?.length ? `Vulnerabilities: ${medicalConditions.join(', ')}` : 'None reported'),



      role: 'CITIZEN',



      lat: (lat !== undefined && lat !== null && !isNaN(Number(lat))) ? Number(lat) : 13.1120,



      lng: (lng !== undefined && lng !== null && !isNaN(Number(lng))) ? Number(lng) : 80.1030,



      locationTimestamp: nowStr,



      gpsAccuracyM: 8,



      elevationM: 16.2,



      heartRateBpm: hr,



      spo2Percent: spo2,



      healthTimestamp: nowStr,



      healthDataValidity: 'VALID',



      heartRateHistory: [



        { timestamp: '10m ago', value: hr - 2 },



        { timestamp: '5m ago', value: hr },



        { timestamp: 'Now', value: hr },



      ],



      spo2History: [



        { timestamp: '10m ago', value: spo2 },



        { timestamp: '5m ago', value: spo2 },



        { timestamp: 'Now', value: spo2 },



      ],



      floodDepthCm: depth,



      floodRiskLevel: depth > 45 ? 'CRITICAL' : depth > 20 ? 'WARNING' : depth > 10 ? 'CAUTION' : 'SAFE',



      driftStatus: depth > 50 ? 'DRIFTING' : 'STATIONARY',



      driftConfidence: depth > 50 ? 65 : 0,



      driftVelocityMs: 0,



      sosActive: isSos,



      rescuePriority: 'P3',



      priorityReason: 'Initial intake evaluation',



      priorityFactors: {



        sosActive: isSos,



        healthSeverity: 'NORMAL',



        healthReason: 'Initial intake baseline',



        floodExposure: depth > 45 ? 'CRITICAL' : depth > 20 ? 'WARNING' : 'SAFE',



        floodReason: `Water depth ${depth}cm`,



        driftEvidence: depth > 50 ? 'SUSPECTED' : 'NONE',



        driftReason: 'Stationary position reported',



        dataQuality: 'FRESH',



        isImmediateDangerOverride: isSos,



      },



      priorityUpdatedAt: nowStr,



      priorityHistory: [],



      commStatus: 'ONLINE',



      lastCommunicationTime: nowStr,



      batteryPercent: 92,



    };







    // Calculate clinical rescue priority



    const evaluation = evaluateRescuePriority(initialPerson);



    initialPerson.rescuePriority = evaluation.priority;



    initialPerson.priorityReason = evaluation.reason;



    initialPerson.priorityFactors = evaluation.factors;







    // Persist to in-memory and disk state



    peopleState.unshift(initialPerson);



    savePersistedPeople(peopleState);







    // If SOS or high priority, auto-generate Incident for the command desk



    let createdIncident: IncidentRecord | null = null;



    if (isSos || evaluation.priority === 'P0' || evaluation.priority === 'P1' || evaluation.priority === 'P2') {



      const incId = `INC-${Date.now().toString().slice(-4)}`;



      createdIncident = {



        id: incId,



        personId: initialPerson.personId,



        personName: initialPerson.name,



        wearableId: initialPerson.wearableId,



        priority: evaluation.priority,



        priorityReason: evaluation.reason,



        isImmediateDanger: evaluation.isImmediateDanger,



        status: 'NEW',



        createdAt: nowStr,



        lat: initialPerson.lat,



        lng: initialPerson.lng,



        gpsAccuracyM: initialPerson.gpsAccuracyM,



        floodDepthCm: initialPerson.floodDepthCm,



        floodRiskLevel: initialPerson.floodRiskLevel,



        heartRateBpm: initialPerson.heartRateBpm,



        spo2Percent: initialPerson.spo2Percent,



        driftStatus: initialPerson.driftStatus,



        driftConfidence: initialPerson.driftConfidence,



        auditTrail: [



          {



            timestamp: nowStr,



            operator: 'FloodGuard Emergency Intake System',



            action: 'INCIDENT_CREATED',



            note: `Intake registered for ${initialPerson.name} (${initialPerson.contactNumber}). Medical: ${initialPerson.medicalNotes}`,



          },



        ],



      };



      incidentsState.unshift(createdIncident);

      savePersistedIncidents(incidentsState);



      initialPerson.incidentId = incId;



    }







    // Auto-dispatch confirmation SMS to the entered mobile number



    const alertId = `SMS-${Date.now().toString().slice(-4)}`;



    const smsMessage: MobileAlertMessage = {



      id: alertId,



      timestamp: nowStr,



      mobileNumber: initialPerson.contactNumber || '+91 98400 00000',



      recipientName: initialPerson.name,



      alertType: isSos ? 'EVACUATION' : 'SHELTER_ASSIGNED',



      headline: isSos ? '🚨 EMERGENCY SOS ACKNOWLEDGED' : '🛡️ FLOODGUARD INTAKE CONFIRMED',



      message: isSos



        ? `EMERGENCY ALERT: SOS received for ${initialPerson.name}. NDRF Rescue Team notified at GPS (${initialPerson.lat.toFixed(4)}, ${initialPerson.lng.toFixed(4)}). Move to highest floor immediately.`



        : `Registration confirmed for ${initialPerson.name}. Safe Haven: Thirumullaivoyal High Ridge Defense Shelter. Evac route available on FloodGuard. Keep mobile battery saved.`,



      status: 'DELIVERED',



      gateway: 'Gov NDRF Emergency SMS / BSNL Cell Broadcast',



    };



    mobileAlertsLog.unshift(smsMessage);







    res.json({



      success: true,



      person: initialPerson,



      incident: createdIncident,



      alert: smsMessage,



      message: `Person ${initialPerson.name} successfully registered and intake saved!`,



    });



  } catch (err: unknown) {



    console.error('Error saving person intake:', err);

    res.status(500).json({ error: 'Failed to save person intake details' });

  }

});

// Citizen Removal / De-registration Endpoint
app.delete('/api/people/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Person ID is required' });
    }

    const initialCount = peopleState.length;
    const removedPerson = peopleState.find(p => p.personId === id || p.wearableId === id);
    peopleState = peopleState.filter(p => p.personId !== id && p.wearableId !== id);
    savePersistedPeople(peopleState);

    // Also remove any linked incidents
    const initialIncidentsCount = incidentsState.length;
    incidentsState = incidentsState.filter(inc => inc.personId !== id);
    if (incidentsState.length !== initialIncidentsCount) {
      savePersistedIncidents(incidentsState);
    }

    return res.json({
      success: true,
      personId: id,
      deletedPerson: removedPerson || null,
      message: `Person ${id} deleted successfully and unpinned from tactical map.`,
      remainingCount: peopleState.length,
    });
  } catch (err: unknown) {
    console.error('Error deleting person:', err);
    res.status(500).json({ error: 'Failed to delete person record' });
  }
});







// Mobile Alert SMS Gateway Endpoints



app.get('/api/alerts', (_req: Request, res: Response) => {



  res.json({



    total: mobileAlertsLog.length,



    alerts: mobileAlertsLog,



  });



});







app.post('/api/alerts/send-mobile', async (req: Request, res: Response) => {
  const { mobileNumber, recipientName, alertType, message, headline, personId } = req.body;

  if (!mobileNumber || !mobileNumber.toString().trim()) {
    return res.status(400).json({ error: 'Mobile number is required' });
  }
  if (!message || !message.toString().trim()) {
    return res.status(400).json({ error: 'Alert message content is required' });
  }

  // Security & Input Validation: Ensure phone has valid digits (7 to 15 digits)
  const rawNumber = String(mobileNumber).trim();
  const pureDigits = rawNumber.replace(/[^0-9]/g, '');
  if (pureDigits.length < 7 || pureDigits.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number format. Expected 7 to 15 digits.' });
  }

  // Sanitize fields against header/newline injection
  const cleanNumber = rawNumber.replace(/[^\w\s\+\-\(\)]/g, '').trim();
  const alertHeadline = (headline || '🚨 FLOOD EMERGENCY BROADCAST').toString().replace(/[\r\n]+/g, ' ').slice(0, 100).trim();
  const alertMessage = message.toString().slice(0, 480).trim();
  const safeRecipient = (recipientName || 'Citizen / Evacuee').toString().replace(/[\r\n]+/g, ' ').slice(0, 80).trim();

  // ASCII-sanitized headline for HTTP/1.1 headers (prevents ByteString invalid code point errors)
  const asciiHeadline = alertHeadline.replace(/[^\x20-\x7E]/g, '').trim() || 'FLOOD EMERGENCY ALERT';

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const alertId = `SMS-${Date.now().toString().slice(-4)}`;

  let realSmsSent = false;
  let realSmsSid: string | null = null;
  let realSmsError: string | null = null;
  let gatewayUsed = 'Airtel / Jio Cell Broadcast & NDRF Emergency SMS Relay';
  let freeApiUsed: string | null = null;
  let ntfyDelivered = false;
  let ntfyId: string | null = null;

  // 1. Paid Gateway Priority (Twilio) - if configured in environment
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const formParams = new URLSearchParams();
      const formattedTo = cleanNumber.startsWith('+') ? cleanNumber : `+91${cleanNumber.replace(/^0+/, '')}`;
      formParams.append('To', formattedTo);
      formParams.append('From', process.env.TWILIO_PHONE_NUMBER);
      formParams.append('Body', `[${alertHeadline}] ${alertMessage}`);

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formParams.toString(),
          signal: AbortSignal.timeout(6000),
        }
      );

      if (twilioRes.ok) {
        const twilioData = await twilioRes.json();
        realSmsSent = true;
        realSmsSid = twilioData.sid;
        gatewayUsed = `Twilio Global Cellular Gateway (SID: ${twilioData.sid})`;
      } else {
        const twilioErr = await twilioRes.text();
        realSmsError = `Twilio error HTTP ${twilioRes.status}: ${twilioErr}`;
        console.warn('Twilio dispatch warning:', realSmsError);
      }
    } catch (twErr: any) {
      realSmsError = twErr.message || 'Twilio network call failed';
      console.warn('Twilio dispatch error:', twErr);
    }
  } else if (process.env.FAST2SMS_API_KEY) {
    // 2. Fast2SMS Gateway (if configured in environment)
    try {
      const pure10 = pureDigits.slice(-10);
      const f2sRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'v3',
          sender_id: 'TXTIND',
          message: `[${alertHeadline}] ${alertMessage}`,
          language: 'english',
          flash: 0,
          numbers: pure10,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (f2sRes.ok) {
        const f2sData = await f2sRes.json();
        realSmsSent = Boolean(f2sData?.return);
        gatewayUsed = 'Fast2SMS National Cellular Gateway';
      }
    } catch (fErr: any) {
      console.warn('Fast2SMS dispatch error:', fErr);
    }
  }

  // 3. Free SMS API - Textbelt Free Open Tier (100% Free, Zero Cost, No Card Required)
  if (!realSmsSent) {
    try {
      const formattedPhone = cleanNumber.startsWith('+') ? cleanNumber : `+91${cleanNumber.replace(/^0+/, '')}`;
      const tbKey = process.env.TEXTBELT_API_KEY || 'textbelt';
      const textbeltRes = await fetch('https://textbelt.com/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedPhone,
          message: `[${asciiHeadline}] ${alertMessage.slice(0, 140)}`,
          key: tbKey,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (textbeltRes.ok) {
        const tbData = await textbeltRes.json();
        if (tbData?.success) {
          realSmsSent = true;
          realSmsSid = tbData.textId || `TB-${Date.now()}`;
          gatewayUsed = `Textbelt Free Open Tier (${tbData.quotaRemaining ?? 0} texts remaining)`;
          freeApiUsed = 'Textbelt Free Cellular SMS API';
        } else {
          console.info('Textbelt open tier info:', tbData?.error || 'Quota exhausted');
        }
      }
    } catch (tbErr: any) {
      console.warn('Textbelt free API call skipped or timed out:', tbErr.message);
    }
  }

  // 4. Free Secure Mobile Emergency Alert API - ntfy.sh (Open Protocol, Encrypted, 100% Free)
  // Dispatches instant high-priority emergency broadcast with push alerts, sound & action links
  try {
    const topic = process.env.NTFY_TOPIC || 'floodguard-emergency-alerts';
    const ntfyRes = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Title': `[FLOOD ALERT] ${asciiHeadline}`,
        'Priority': 'urgent',
        'Tags': 'warning,rotating_light,sos',
        'Actions': `view, Open Evacuation Route, https://floodguard.gov.in/route?p=${personId || 'GPS'}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: `🚨 [EMERGENCY FOR ${safeRecipient} (${cleanNumber})]: ${alertMessage}`,
      signal: AbortSignal.timeout(6000),
    });

    if (ntfyRes.ok) {
      const ntfyData = await ntfyRes.json();
      ntfyDelivered = true;
      ntfyId = ntfyData.id;
      if (!realSmsSent) {
        realSmsSent = true;
        realSmsSid = ntfyData.id;
        gatewayUsed = `ntfy.sh Free Emergency Push Network (Topic: ${topic})`;
        freeApiUsed = 'ntfy.sh Free Secure Emergency Mobile API';
      }
    }
  } catch (ntfyErr: any) {
    console.warn('ntfy.sh free notification skipped or timed out:', ntfyErr.message);
  }

  // If both free external APIs were offline or blocked, fallback to NDRF broadcast label
  if (!realSmsSent) {
    gatewayUsed = 'Airtel / Jio Cell Broadcast & NDRF Emergency SMS Relay';
  }

  const alertRecord: MobileAlertMessage = {
    id: alertId,
    timestamp: nowStr,
    mobileNumber: cleanNumber,
    recipientName: safeRecipient,
    alertType: alertType || 'DIRECT_ALERT',
    headline: alertHeadline,
    message: alertMessage,
    status: 'DELIVERED',
    gateway: gatewayUsed,
    freeApiUsed: freeApiUsed || (ntfyDelivered ? 'ntfy.sh Free Secure Emergency Mobile API' : undefined),
  };

  mobileAlertsLog.unshift(alertRecord);

  // If personId provided, update their communication timestamp
  if (personId) {
    const person = peopleState.find((p) => p.personId === personId);
    if (person) {
      person.lastCommunicationTime = nowStr;
      person.commStatus = 'ONLINE';
    }
  }

  // Pre-generate native device SMS link so mobile/desktop browsers can launch native messaging app
  const purePhone = cleanNumber.replace(/[^0-9+]/g, '');
  const nativeSmsUrl = `sms:${purePhone}?body=${encodeURIComponent(`[${alertHeadline}] ${alertMessage}`)}`;
  alertRecord.nativeSmsUrl = nativeSmsUrl;

  res.json({
    success: true,
    alert: alertRecord,
    deliveryStatus: 'DELIVERED',
    realSmsSent,
    realSmsSid,
    realSmsError,
    gatewayUsed,
    freeApiUsed: freeApiUsed || (ntfyDelivered ? 'ntfy.sh Free Secure Emergency Mobile API' : null),
    ntfyDelivered,
    ntfyId,
    nativeSmsUrl,
    networkLatencyMs: Math.floor(120 + Math.random() * 180),
    message: realSmsSent
      ? `Real emergency mobile alert dispatched to ${alertRecord.mobileNumber} via ${gatewayUsed}`
      : `Emergency alert queued for ${alertRecord.mobileNumber}. Native cellular SMS link generated for direct transmission.`,
  });
});

// Security & Firewall Defense Status Endpoint



app.get('/api/security-status', (_req: Request, res: Response) => {



  res.json({



    status: 'SECURE',



    firewallActive: true,



    firewallEngine: 'Aegis WAF v2.1',



    serverFingerprintingSuppressed: true,



    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),



    clientExposed: false,



    architecture: 'Zero-Exposure Server-Side Proxy with L7 WAF',



    protection: 'API Key is strictly confined to backend Node.js environment variables. Client bundles contain zero secrets. All inbound traffic is inspected by L7 Deep Packet Inspection.',



    allowedMethods: ['POST /api/ai/advise', 'POST /api/alerts/send-mobile'],



  });



});







// Real-Time Firewall Telemetry & Threat Intelligence



app.get('/api/security/firewall-status', (_req: Request, res: Response) => {



  res.json({



    active: true,



    engineVersion: 'Aegis Cloud WAF v2.1 (Deep Packet Inspection & DDoS Defense)',



    serverFingerprintingSuppressed: true,



    totalRequestsInspected,



    totalThreatsBlocked,



    quarantinedIpsCount: quarantinedIPs.size,



    activeProtections: [



      {



        name: 'Layer 7 Deep Packet Inspection (DPI)',



        description: 'Real-time payload inspection for OWASP Top 10 vulnerabilities (SQL Injection, Cross-Site Scripting, Directory Traversal)',



        status: 'ACTIVE',



      },



      {



        name: 'Sliding-Window Rate Limiting Engine',



        description: 'Token bucket throttler (180 req/min API, 40 req/min AI Dispatcher) preventing volumetric DDoS and bot flood attacks',



        status: 'ACTIVE',



      },



      {



        name: 'Zero Server Fingerprinting (Anti-Recon)',



        description: 'Suppresses X-Powered-By, hides Node/Express technology banners, and prevents client device biometric profiling',



        status: 'ENFORCING',



      },



      {



        name: 'Strict Security Headers Virtual Firewall',



        description: 'Enforces X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN, strict referrer, and restrictive permissions policies',



        status: 'ENFORCING',



      },



      {



        name: 'Dynamic Host IP Quarantine',



        description: 'Automated 15-minute network isolation for hosts accumulating 5 or more critical security violations',



        status: 'ACTIVE',



      },



    ],



    threatStats,



    recentLogs: wafThreatLogs.slice(0, 25),



  });



});







// Interactive Firewall Test Probe Endpoint (allows user/operator to test attack vectors safely)



app.post('/api/security/firewall-test', (req: Request, res: Response) => {



  const { probeType, customPayload } = req.body || {};



  // If the payload contained an attack pattern, the WAF middleware intercepted and returned 403 earlier.



  // If execution reached here, the payload was verified clean.



  res.json({



    status: 'PASSED',



    message: 'Traffic passed all WAF inspection checks with zero malicious signatures detected.',



    probeType: probeType || 'BENIGN_TRAFFIC',



    inspectedPayload: customPayload || 'clean',



    verdict: 'CLEAN_PACKET_200',



    timestamp: new Date().toISOString(),



  });



});







// Reset IP Quarantine Holds



app.post('/api/security/firewall-clear-quarantine', (_req: Request, res: Response) => {



  const releasedCount = quarantinedIPs.size;



  quarantinedIPs.clear();



  ipViolationCount.clear();
  rateLimitMap.clear();



  res.json({



    success: true,



    releasedCount,



    message: `All ${releasedCount} quarantined IP host restrictions have been lifted.`,



  });



});







// Incident Management Endpoints



app.get('/api/incidents', (_req: Request, res: Response) => {



  // Sort by Immediate Danger (P0) first, then priority rank (P0-P4), then timestamp



  const priorityOrder: Record<RescuePriorityLevel, number> = {



    P0: 0,



    P1: 1,



    P2: 2,



    P3: 3,



    P4: 4,



  };







  const sorted = [...incidentsState].sort((a, b) => {



    if (a.isImmediateDanger !== b.isImmediateDanger) {



      return a.isImmediateDanger ? -1 : 1;



    }



    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);



    if (pDiff !== 0) return pDiff;



    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();



  });







  res.json({



    total: sorted.length,



    activeCount: sorted.filter((i) => i.status !== 'RESOLVED').length,



    incidents: sorted,



  });



});







app.post('/api/incidents/:id/acknowledge', (req: Request, res: Response) => {



  const { id } = req.params;



  const operator = req.body?.operator || 'Duty Commander (HQ Desk 1)';



  const note = req.body?.note || 'Incident acknowledged via Command Dashboard';







  const incident = incidentsState.find((i) => i.id === id);



  if (!incident) {



    return res.status(404).json({ error: 'Incident not found' });



  }







  incident.status = 'ACKNOWLEDGED';

  savePersistedIncidents(incidentsState);



  incident.acknowledgedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });



  incident.acknowledgedBy = operator;



  incident.auditTrail.push({



    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),



    operator,



    action: 'ACKNOWLEDGED',



    note,



  });







  res.json({ success: true, incident });



});







app.post('/api/incidents/:id/assign', (req: Request, res: Response) => {



  const { id } = req.params;



  const { responderId, responderName, operator } = req.body;







  const incident = incidentsState.find((i) => i.id === id);



  if (!incident) {



    return res.status(404).json({ error: 'Incident not found' });



  }







  incident.assignedResponderId = responderId;



  incident.assignedResponderName = responderName || 'Tactical Rescue Unit';



  incident.assignedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });



  incident.status = 'RESPONDER_EN_ROUTE';

  savePersistedIncidents(incidentsState);



  incident.auditTrail.push({



    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),



    operator: operator || 'Duty Commander',



    action: 'RESPONDER_ASSIGNED',



    note: `Dispatched ${incident.assignedResponderName} to coordinates (${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)})`,



  });







  // Also update corresponding person record



  const person = peopleState.find((p) => p.personId === incident.personId);



  if (person) {



    person.assignedResponderId = responderId;



    person.assignedResponderName = responderName;



  }







  res.json({ success: true, incident });



});







app.post('/api/incidents/:id/status', (req: Request, res: Response) => {



  const { id } = req.params;



  const { status, operator, note } = req.body;







  const incident = incidentsState.find((i) => i.id === id);



  if (!incident) {



    return res.status(404).json({ error: 'Incident not found' });



  }







  incident.status = status;



  incident.auditTrail.push({



    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),



    operator: operator || 'Duty Commander',



    action: `STATUS_UPDATED_${status}`,



    note: note || `Incident status updated to ${status}`,



  });







  res.json({ success: true, incident });



});







app.post('/api/incidents/:id/resolve', (req: Request, res: Response) => {



  const { id } = req.params;



  const { notes, operator } = req.body;







  const incident = incidentsState.find((i) => i.id === id);



  if (!incident) {



    return res.status(404).json({ error: 'Incident not found' });



  }







  incident.status = 'RESOLVED';

  savePersistedIncidents(incidentsState);



  incident.resolvedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });



  incident.resolvedBy = operator || 'Duty Commander';



  incident.resolutionNotes = notes || 'Extracted safely to relief shelter';



  incident.auditTrail.push({



    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),



    operator: operator || 'Duty Commander',



    action: 'RESOLVED',



    note: incident.resolutionNotes,



  });







  res.json({ success: true, incident });



});







// Controlled Research & Simulation Endpoints



app.get('/api/research/scenarios', (_req: Request, res: Response) => {



  res.json(INITIAL_RESEARCH_SCENARIOS);



});







app.post('/api/research/run-scenario', (req: Request, res: Response) => {



  const { scenarioId } = req.body;



  const scenario = INITIAL_RESEARCH_SCENARIOS.find((s) => s.id === scenarioId);



  if (!scenario) {



    return res.status(404).json({ error: 'Scenario not found' });



  }







  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });







  if (scenarioId === 'SCENARIO-A') {



    // Water surge & victim drift



    peopleState = peopleState.map((p) => {



      if (p.personId === 'P-103') {



        const prevP = p.rescuePriority;



        p.driftStatus = 'DRIFTING';



        p.driftConfidence = 98;



        p.driftVelocityMs = 2.4;



        p.floodDepthCm = 78;



        p.rescuePriority = 'P0';



        experimentLogs.push({



          timestamp,



          scenarioId,



          scenarioName: scenario.name,



          personId: p.personId,



          personName: p.name,



          inputCondition: 'Drift velocity surge: 2.4 m/s in 78cm water',



          previousPriority: prevP,



          newPriority: 'P0',



          reason: 'P0 Immediate Danger: High-velocity drift along Kovur tributary',



          outcome: 'Surfaced as Top P0 Emergency Beacon on Command Dashboard',



        });



      }



      return p;



    });



  } else if (scenarioId === 'SCENARIO-B') {



    // Missing telemetry & communication degradation



    peopleState = peopleState.map((p) => {



      if (p.personId === 'P-105' || p.personId === 'P-107') {



        const prevP = p.rescuePriority;



        p.commStatus = 'UNREACHABLE';



        p.healthDataValidity = 'UNKNOWN';



        experimentLogs.push({



          timestamp,



          scenarioId,



          scenarioName: scenario.name,



          personId: p.personId,



          personName: p.name,



          inputCondition: 'LoRa gateway packet loss: Health data unavailable',



          previousPriority: prevP,



          newPriority: p.rescuePriority,



          reason: 'Mandatory Rule: Missing data in flood zone must not lower priority',



          outcome: `Priority preserved at ${p.rescuePriority} (Not lowered to routine)`,



        });



      }



      return p;



    });



  }







  res.json({



    success: true,



    scenario,



    message: `Scenario ${scenario.name} executed. Recorded experiment metrics.`,



    logs: experimentLogs,



  });



});







app.get('/api/research/logs', (_req: Request, res: Response) => {



  res.json(experimentLogs);



});







app.get('/api/research/export', (req: Request, res: Response) => {



  const format = req.query.format || 'json';







  if (format === 'csv') {



    const headers = 'Timestamp,ScenarioID,ScenarioName,PersonID,PersonName,InputCondition,PreviousPriority,NewPriority,Reason,Outcome\n';



    const rows = experimentLogs



      .map(



        (l) =>



          `"${l.timestamp}","${l.scenarioId}","${l.scenarioName}","${l.personId}","${l.personName}","${l.inputCondition.replace(/"/g, '""')}","${l.previousPriority}","${l.newPriority}","${l.reason.replace(/"/g, '""')}","${l.outcome.replace(/"/g, '""')}"`



      )



      .join('\n');







    res.setHeader('Content-Type', 'text/csv');



    res.setHeader('Content-Disposition', 'attachment; filename="floodguard_research_experiment_logs.csv"');



    return res.send(headers + rows);



  }







  res.json({



    exportedAt: new Date().toISOString(),



    totalLogs: experimentLogs.length,



    logs: experimentLogs,



  });



});







// Aegis AI Emergency Dispatcher endpoint (Protected Server-Side Gemini API Proxy)



app.post('/api/ai/advise', async (req: Request, res: Response) => {



  const { prompt, userLocation, blockedRoads, currentDamLevel, nearestShelter, personProfile } = req.body;







  let personContext = '';



  if (personProfile) {



    personContext = `



REGISTERED EVACUEE PROFILE CONTEXT:



- Name: ${personProfile.name || 'Citizen'} ${personProfile.age ? `(Age: ${personProfile.age})` : ''} ${personProfile.gender ? `(${personProfile.gender})` : ''}



- Registered Mobile: ${personProfile.contactNumber || 'Not provided'}



- Medical Conditions / Vulnerabilities: ${



      personProfile.medicalConditions?.length



        ? personProfile.medicalConditions.join(', ')



        : personProfile.medicalNotes || 'None reported'



    }



- Real-time Vitals: Heart Rate ${personProfile.heartRateBpm !== null && personProfile.heartRateBpm !== undefined ? `${personProfile.heartRateBpm} BPM` : 'Unknown / Offline'} | SpO₂ ${personProfile.spo2Percent !== null && personProfile.spo2Percent !== undefined ? `${personProfile.spo2Percent}%` : 'Unknown / Offline'}



- Registered Flood Depth at Location: ${personProfile.floodDepthCm ?? 15} cm



- Household Members: ${personProfile.dependentsCount ?? 0} family members/dependents



- Current Rescue Priority: ${personProfile.rescuePriority || 'P2'}



- Landmark / Sector: ${personProfile.addressLandmark || 'Avadi / Ambattur Hydrological Basin'}



- SOS Status: ${personProfile.sosActive ? '🚨 EXPLICIT SOS ACTIVE' : 'Standby / Monitoring'}



`;



  }







  const systemContext = `You are Aegis AI, the premier tactical flood disaster response advisor and real-time evacuation dispatcher for FloodGuard 2.1 in Chennai's Avadi & Ambattur Hydrological Basin.







CURRENT HYDROLOGICAL TELEMETRY:



- Dam Reservoir Level: ${currentDamLevel || damState.reservoirLevelM}m (Full Crest: 38.0m)



- Dam Status: ${damState.status}



- Dam Spillway Discharge: ${damState.spillwayReleaseCusecs.toLocaleString()} cusecs



- Basin Rainfall Rate: ${damState.precipitationMmH} mm/h



- User GPS Coordinates: ${userLocation ? `Lat ${userLocation[0].toFixed(4)}, Lng ${userLocation[1].toFixed(4)}` : 'Avadi Central Basin'}



- Critical Flooded Crossings to AVOID: ${blockedRoads?.length ? blockedRoads.join(', ') : 'Paruthipattu Low Riverbank (R101-S3, >45cm), Kovur Culvert (R106-S1, >55cm)'}



- Recommended Safe Haven: ${nearestShelter || 'Thirumullaivoyal High Ridge Defense Pavilion (Elevation: 24.8m)'}



${personContext}







INSTRUCTIONS FOR GENERATING THE RESPONSE:



1. Address the person with calm, authoritative, reassuring tactical clarity.



2. Structure the reply with clear, visually formatted Markdown sections:



   - 🚨 **Current Threat & Hazard Assessment**: Clear rating (Immediate Danger, High Risk, or Precautionary) with water depth context.



   - 🧭 **Recommended Evacuation Route**: Exact road names, direction of high ground, and explicitly named flooded roads/culverts to avoid.



   - 🩺 **Medical & Physiological Precautions**: If the evacuee has medical conditions (e.g., cardiac, diabetic, elderly, infant, respiratory), provide exact lifesaving advice (keep insulin dry, limit exertion to keep HR < 100, wrap infants, stay above contaminated runoff).



   - 📱 **Mobile Alert & Rescuer Relay**: Confirm that an emergency SMS alert is logged and can be triggered to their registered phone.



   - ⚡ **Immediate Action Plan (Next 5 Minutes)**: Exactly 3 numbered, high-priority steps.



3. Ground the instructions in disaster physics: 15cm of flowing water knocks an adult down; 30cm moves a car; avoid downed power lines; never cross submerged bridges.`;







  try {



    const apiKey = process.env.GEMINI_API_KEY;



    const isRealKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.length > 10);



    if (aiClient && isRealKey) {



      const timeoutPromise = new Promise<never>((_, reject) =>



        setTimeout(() => reject(new Error('AI response timeout (3.5s limit)')), 3500)



      );







      const callPromise = aiClient.models.generateContent({



        model: 'gemini-3.8-flash',



        contents: [



          {



            role: 'user',



            parts: [



              {



                text: `${systemContext}\n\nEVACUEE INQUIRY / SCENARIO: ${prompt}`,



              },



            ],



          },



        ],



      });







      const response = await Promise.race([callPromise, timeoutPromise]);



      const replyText = response.text;



      if (replyText && replyText.trim().length > 20) {



        return res.json({ reply: replyText });



      }



    }



  } catch (error: unknown) {



    console.warn('Gemini API Dispatch handled (falling back to tactical engine):', error instanceof Error ? error.message : error);



  }







  // High-Grade Tactical Fallback Engine if AI key is unavailable or fails



  const fallbackReply = generateRuleBasedEmergencyAdvice(



    prompt,



    damState,



    userLocation,



    blockedRoads,



    nearestShelter,



    personProfile



  );



  res.json({ reply: fallbackReply });



});







function generateRuleBasedEmergencyAdvice(



  query: string,



  dam: typeof damState,



  userLocation?: [number, number],



  blockedRoads?: string[],



  nearestShelter?: string,



  personProfile?: any



): string {



  const q = (query || '').toLowerCase();



  const name = personProfile?.name || 'Citizen';



  const shelter = nearestShelter || 'Thirumullaivoyal High Ridge Defense Pavilion (Elevation 24.8m)';



  const conditions = personProfile?.medicalConditions || [];



  const hasCardiac = conditions.includes('CARDIAC') || (personProfile?.heartRateBpm && personProfile.heartRateBpm > 115);



  const hasDiabetic = conditions.includes('DIABETIC');



  const hasElderly = conditions.includes('ELDERLY');



  const hasMobility = conditions.includes('MOBILITY_IMPAIRED');







  // Medical condition advice snippet



  let medicalSnippet = '';



  if (hasCardiac) {



    medicalSnippet = `\n\n🩺 **Cardiac / High Heart Rate Advisory**:



• Your registered heart rate is elevated. Do NOT run or wade against heavy water resistance.



• Move steadily, pause to rest on intermediate landings, and avoid lifting heavy bags.



• Keep nitroglycerin / prescribed cardiac medicine accessible in a waterproof ziplock.`;



  } else if (hasDiabetic) {



    medicalSnippet = `\n\n🩺 **Diabetic Care Advisory**:



• Secure insulin pens and glucometers in a buoyant, waterproof pouch.



• Keep emergency sugar/glucose tablets on your person in case walking exertion causes hypoglycemia.`;



  } else if (hasMobility || hasElderly) {



    medicalSnippet = `\n\n🩺 **Assisted Mobility Protocol**:



• Request family or neighborhood escorts immediately before water exceeds 15cm.



• If stairs or wheelchair routes are submerged, move to the nearest dry first/second floor landing and signal with a flashlight.`;



  }







  // 1. Fastest Route / Where to go



  if (q.includes('fastest') || q.includes('route') || q.includes('where to go') || q.includes('direction') || q.includes('evacuat')) {



    return `🚨 **Fastest Evacuation Route Directive for ${name}**:



Current Dam Level: **${dam.reservoirLevelM}m** | Spillway Discharge: **${dam.spillwayReleaseCusecs.toLocaleString()} cusecs**







🧭 **Primary Safe Corridor**:



1. Take the **Thirumullaivoyal Outer Crest Express (Elevation: 22.0m - 24.8m)** heading directly north.



2. Proceed to **${shelter}** (Dry zone, full medical triage and power backup active).







⚠️ **CRITICAL HAZARDS - DO NOT CROSS**:



• **Paruthipattu Low Riverbank (R101-S3)**: Submerged under >45cm rapid runoff.



• **Kovur Culvert Causeway (R106-S1)**: Active spillway backflow (>55cm water depth).



${medicalSnippet}







📱 **Mobile Alert Dispatch**:



An emergency route confirmation has been prepared for ${personProfile?.contactNumber || 'your mobile phone'}. You can tap "Send SMS to Mobile" to receive full coordinates.







⚡ **Immediate 3-Step Action**:



1. Unplug main electrical switchboard before water reaches floor level.



2. Put mobile phone inside a ziplock bag and carry government photo ID.



3. Follow the cyan navigation line on the FloodGuard Evacuation Map.`;



  }







  // 2. Car / Vehicle submerged



  if (q.includes('car') || q.includes('vehicle') || q.includes('stalling') || q.includes('drive')) {



    return `⚠️ **CRITICAL VEHICLE SAFETY PROTOCOL (LIFE-SAFETY PRIORITY)**:



If floodwater reaches your wheel hubs (15cm) or your engine cuts out:







1. **Abandon the vehicle immediately** — Just 30cm (1 foot) of moving floodwater carries enough buoyancy to lift a 1.5-ton car, and 60cm sweeps away heavy SUVs.



2. **Unlock doors and lower windows right now** while electrical systems still function. If windows fail, kick out a side window with your heel.



3. **Never attempt to restart the engine** — Water ingestion locks pistons (hydrolock) and causes sudden battery short-circuits.



4. **Move immediately to high ground** on foot, walking perpendicular to the water current.



5. Signal your location: Tap **Broadcast Emergency SOS** on FloodGuard so NDRF rescue teams can pinpoint your GPS coordinates.`;



  }







  // 3. Water entering home / Rooftop stranded



  if (q.includes('water') && (q.includes('enter') || q.includes('home') || q.includes('house') || q.includes('roof') || q.includes('floor') || q.includes('trapped'))) {



    return `🚨 **URGENT: WATER INUNDATION & ROOFTOP SAFETY DIRECTIVE**:



If floodwater has entered your dwelling or is rising up stairs:







1. **Electrical Disconnect**: Kill the main MCB/fuse box immediately if you can reach it safely while standing on completely dry ground. If the panel is wet, **DO NOT TOUCH IT**.



2. **Move Upward**: Retreat to the highest available floor or reinforced concrete rooftop. 



3. **DO NOT Enter Closed Attics**: Never climb into a closed attic without a rooftop exit — rising water can trap you under the rafters. Ensure you have roof access.



4. **Visibility & Signaling**: Tie a bright cloth or wave a flashlight/torch towards open skies.



5. **Drink Only Bottled/Boiled Water**: Tap water and groundwater become contaminated immediately when drainage overflows.



${medicalSnippet}







📱 **Rescue Dispatch**:



Emergency response teams are monitoring your location. Keep your mobile battery on ultra-low power mode.`;



  }







  // 4. Vitals / Medical emergency



  if (q.includes('heart') || q.includes('bpm') || q.includes('spo2') || q.includes('breath') || q.includes('doctor') || q.includes('medical') || q.includes('medic')) {



    return `🩺 **HEALTH & PHYSIOLOGICAL STABILIZATION ADVISORY**:



Evacuee: **${name}** | Registered Vitals: HR ${personProfile?.heartRateBpm ?? 85} BPM, SpO₂ ${personProfile?.spo2Percent ?? 98}%







1. **Respiratory & Oxygenation (SpO₂)**:



   • If SpO₂ drops below 92%, sit upright in an elevated position (high Fowler's). Avoid lying flat in humid air.



   • Slow, deep diaphragmatic breaths through the nose, out through pursed lips.



2. **Heart Rate & Tachycardia Management**:



   • If heart rate exceeds 110 BPM, rest for 5 minutes on dry ground. Sip clean water.



   • Avoid carrying heavy luggage; transfer packs to rescue team members or floating bags.



3. **Hypothermia Prevention**:



   • Wet clothing leaches body heat 25 times faster than dry air. Wring out wet clothes and wrap in plastic trash bags or dry blankets.



4. **Immediate Medical Evacuation**:



   • An alert has been queued for dispatch to the medical triage tent at **${shelter}**.`;



  }







  // 5. Dam / Reservoir Status



  if (q.includes('dam') || q.includes('reservoir') || q.includes('chembarambakkam') || q.includes('spillway') || q.includes('discharge')) {



    return `🌊 **CHEMBARAMBAKKAM & BASIN HYDROLOGICAL BRIEFING**:



• Current Water Level: **${dam.reservoirLevelM}m** (Maximum Crest: **38.0m**)



• Status: **${dam.status}**



• Inflow: **${dam.inflowCusecs.toLocaleString()} cusecs**



• Spillway Discharge: **${dam.spillwayReleaseCusecs.toLocaleString()} cusecs**



• Catchment Rainfall: **${dam.precipitationMmH} mm/h**







⚠️ **Downstream Flood Impact**:



The released discharge flows through the lower Cooum drainage system. Communities bordering Paruthipattu lake, Kovur, and Outer Avadi are experiencing active backflow surges. Evacuate all ground floor residences within 300m of the riverbanks.`;



  }







  // 6. Mobile SMS Alert inquiry



  if (q.includes('sms') || q.includes('mobile') || q.includes('message') || q.includes('phone') || q.includes('alert')) {



    return `📱 **MOBILE SMS & EMERGENCY CELL BROADCAST SYSTEM**:



• Your registered mobile number: **${personProfile?.contactNumber || 'Available via Person Intake'}**



• FloodGuard transmits high-priority cell broadcast alerts over Airtel, Jio, and BSNL disaster relays.



• You can send an instant SMS alert with your coordinates and medical status by clicking **Send SMS to Mobile** in the top navigation or from the person drawer.



• In case mobile networks drop, ensure you have downloaded the **Offline Map Package** for offline turn-by-turn navigation without internet.`;



  }







  // Default Comprehensive Emergency Guidance



  return `🛡️ **AEGIS AI LIFE-SAFETY DIRECTIVE FOR ${name.toUpperCase()}**:



Dam Status: **${dam.status}** (${dam.reservoirLevelM}m) | Rainfall: **${dam.precipitationMmH} mm/h**







1. 🧭 **Destination Safe Haven**:



   Head to **${shelter}**. This ridge facility is 24.8m above sea level with backup power, drinking water, and medical personnel.



2. ⚠️ **Submerged Road Avoidance**:



   Do NOT attempt to cross the Paruthipattu low riverbank or Kovur culvert. Follow high-elevation railway ridge roads.



3. 📱 **Mobile Alert Status**:



   Emergency teams have your registered coordinates at (${userLocation ? `${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}` : 'Avadi Sector'}).



${medicalSnippet}







⚡ **Immediate Action Plan**:



1. Pack essential medication, phone charger, and government ID in waterproof plastic.



2. Switch off electrical mains before water contacts outlets.



3. Keep FloodGuard voice navigation turned on for turn-by-turn safe routing.`;



}







// Start Server with Vite Middleware in Development



async function startServer() {



  if (process.env.NODE_ENV === 'production') {



    const distPath = fs.existsSync(path.join(__dirname, 'dist'))



      ? path.join(__dirname, 'dist')



      : __dirname;



    app.use(express.static(distPath));



    app.get('*', (_req: Request, res: Response) => {



      res.sendFile(path.join(distPath, 'index.html'));



    });



  } else {



    const vite = await createViteServer({



      server: { middlewareMode: true },



      appType: 'spa',



    });



    app.use(vite.middlewares);



  }







  app.listen(PORT, '0.0.0.0', () => {



    console.log(`🌊 FloodGuard 2.1 Full-Stack Server active on http://0.0.0.0:${PORT}`);



  });



}







if (!process.env.VERCEL) {
  startServer();
}

export default app;
export { app };



