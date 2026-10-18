import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
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
} from './src/types/floodguard.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// In-Memory Person, Incident & Research Experiment State
let peopleState: RegisteredPerson[] = JSON.parse(JSON.stringify(INITIAL_REGISTERED_PEOPLE));
let incidentsState: IncidentRecord[] = JSON.parse(JSON.stringify(INITIAL_INCIDENTS));
let experimentLogs: ExperimentLog[] = [];

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

// Aegis AI Emergency Dispatcher endpoint
app.post('/api/ai/advise', async (req: Request, res: Response) => {
  const { prompt, userLocation, blockedRoads, currentDamLevel, nearestShelter } = req.body;

  const systemContext = `You are Aegis AI, the high-precision emergency response dispatcher and evacuation advisor for FloodGuard 2.1 in Chennai's Avadi & Ambattur basin.
CURRENT SITUATION TELEMETRY:
- Dam Reservoir Level: ${currentDamLevel || damState.reservoirLevelM}m (Max Crest: 38.0m)
- Dam Status: ${damState.status}
- Dam Spillway Discharge: ${damState.spillwayReleaseCusecs} cusecs
- Precipitation Rate: ${damState.precipitationMmH} mm/h
- User GPS Location: ${userLocation ? `Lat ${userLocation[0].toFixed(4)}, Lng ${userLocation[1].toFixed(4)}` : 'Avadi Central Basin'}
- Critical Flooded Road Segments: ${blockedRoads?.length ? blockedRoads.join(', ') : 'Paruthipattu Low Riverbank (R101-S3), Kovur Culvert (R106-S1)'}
- Recommended Safe Haven: ${nearestShelter || 'Thirumullaivoyal High Ridge Defense Pavilion (Elevation 24.8m)'}

GUIDELINES:
1. Provide concise, clear, and reassuring life-saving instructions (max 3 short paragraphs or bullet points).
2. Never claim any route is "100% guaranteed safe" — always refer to "Estimated lower-risk route" and warn evacuees never to drive or walk through moving floodwater.
3. If the user asks for the fastest route, emphasize heading to elevated ground (e.g. Thirumullaivoyal or Avadi High Ridge) and avoiding low culverts like Paruthipattu and Kovur.
4. If water is rising rapidly, advise immediate evacuation to higher floors or high ground.
5. Provide a clear, actionable 3-point checklist at the end.`;

  try {
    if (aiClient) {
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemContext}\n\nUSER INQUIRY: ${prompt}`,
              },
            ],
          },
        ],
      });

      const replyText = response.text || 'Immediate Action: Proceed towards the nearest elevated shelter via the estimated lower-risk route. Avoid low-lying riverbank culverts.';
      return res.json({ reply: replyText });
    }
  } catch (error: unknown) {
    console.error('Gemini API Error:', error);
  }

  // Graceful rule-based emergency fallback if AI key is unavailable or fails
  const fallbackReply = generateRuleBasedEmergencyAdvice(prompt, damState);
  res.json({ reply: fallbackReply });
});

function generateRuleBasedEmergencyAdvice(query: string, dam: typeof damState): string {
  const q = (query || '').toLowerCase();

  if (q.includes('fastest') || q.includes('route') || q.includes('where to go')) {
    return `🚨 **Fastest Evacuation Route Advice**:
Based on live IoT telemetry, the safest path is via the **Thirumullaivoyal Outer Crest Express (Elevation: 22m)** directly into the **Thirumullaivoyal Defense Pavilion Safe Haven**.

⚠️ **Road Closures Avoided**:
• Paruthipattu Low Riverbank Corridor (R101-S3) is flooded (>45cm).
• Kamarajar Cooum Low Causeway (R103-S1) has active spillway surge.

✅ **Action Plan**:
1. Follow the cyan line on the Evacuation App immediately.
2. Keep your mobile device elevated and in waterproof casing.
3. Do not attempt to cross submerged bridge crossings.`;
  }

  if (q.includes('car') || q.includes('vehicle') || q.includes('stalling')) {
    return `⚠️ **CRITICAL VEHICLE SAFETY PROTOCOL**:
If water reaches your vehicle wheels (over 15-20cm) or the engine stalls:
1. **Abandon the vehicle immediately** — 30cm of moving water can float a vehicle, and 60cm can sweep away heavy SUVs.
2. Unbuckle seatbelts and open doors or lower windows before power fails.
3. Move on foot to high ground or the nearest concrete multi-story structure.
4. Trigger your SOS beacon on the Evacuation App for NDRF rescue positioning.`;
  }

  if (q.includes('dam') || q.includes('spillway') || q.includes('chembarambakkam')) {
    return `🌊 **Dam & Hydrological Status**:
• Current Reservoir Level: **${dam.reservoirLevelM}m** (Full Crest: 38.0m)
• Status: **${dam.status}**
• Spillway Discharge: **${dam.spillwayReleaseCusecs.toLocaleString()} cusecs**
• Precipitation: **${dam.precipitationMmH} mm/h**

Because discharge is flowing into the lower Cooum river channel, all riverbank crossings in Paruthipattu and Kovur are at high hazard risk. All evacuees must stay north of the elevated rail ridge.`;
  }

  return `🛡️ **FloodGuard Emergency Dispatch Guidance**:
Active Reservoir Level is at **${dam.reservoirLevelM}m** with **${dam.precipitationMmH} mm/h** rainfall in the catchment basin.

• **Safest Haven**: Thirumullaivoyal High Ridge Defense Pavilion (1,200 capacity, medical unit active).
• **Avoid**: Low culverts in Paruthipattu and Kovur.
• **Offline Readiness**: Ensure you tap "Download Map Package" so full turn-by-turn routing functions if cell towers degrade.`;
}

// Start Server with Vite Middleware in Development
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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

startServer();
