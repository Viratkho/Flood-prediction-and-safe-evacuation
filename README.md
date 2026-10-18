# 🌊 FloodGuard 2.1 — Health-Aware Flood Emergency & Evacuation Command

FloodGuard 2.1 is a full-stack, health-aware flood emergency response platform integrated with **Real OpenStreetMap tiles**, **continuous high-accuracy browser GPS**, **real-time Dam & Hydrological simulation**, **downloadable offline map packages**, **flood-aware A* evacuation routing**, and the **Aegis AI Emergency Dispatch Assistant**.

---

## 🚀 Quick Start in VS Code

### 1. Open Terminal in VS Code
Open VS Code (`Ctrl + ~` or `Cmd + ~` to open the integrated terminal) and navigate to the project directory:

```bash
# If cloned via GitHub:
git clone https://github.com/Viratkho/product-development.git
cd product-development
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optional: Add your `GEMINI_API_KEY` in `.env` if you wish to query the server-side Gemini 3.8 Flash model for custom AI evacuation responses; fallback emergency rules are active by default).*

### 4. Run Development Server
```bash
npm run dev
```

Open your browser to:
👉 **`http://localhost:3000`**

---

## 🎛️ Navigation & Views

1. **🛡️ Command Center**:
   - OpenStreetMap with tactical night grid and standard OSM tiles.
   - 15 IoT Road Sensors with depth, rate of rise, and battery telemetry.
   - Dam Hydrological State Machine with **live 60-point SVG sparkline trend chart**.
   - Scenario controls (`START STORM`, `+25cm SURGE`, `+50cm SURGE`, `START FULL FLOOD EVENT`, `RESET`).
   - Compact **Health-Aware Emergency Overview** ribbon (Active SOS, P0–P4 counts, drift alerts).

2. **👥 Person Monitoring Panel**:
   - Registered citizens with live physiological telemetry ($\text{SpO}_2$, Heart Rate).
   - $\text{SpO}_2$ and HR SVG trend waveforms with clinical threshold reference markers.
   - Location accuracy ($\pm\text{meters}$) and water drift detection ($\text{m/s}$ velocity, confidence %).
   - Contributing prioritization factor breakdown.

3. **🚨 Incident Workspace**:
   - Prioritized incident queue (sorted with P0 Immediate Danger first).
   - Operator actions: **Acknowledge Alert**, **Assign Tactical Unit**, **Update Status**, and **Resolve Incident**.
   - Immutable audit trail logging operator timestamps and actions.

4. **🚶 Evacuation App**:
   - From $\to$ To flood-safe evacuation navigation.
   - Continuous browser GPS tracking with real vs. simulated GPS detection and `[ Test Walk ]` mode.
   - Flood-aware A* routing with dynamic automatic rerouting if roads flood mid-transit.
   - Speech synthesis voice guidance and alert chimes.

5. **🔬 Research & Simulation Sandbox**:
   - Four controlled evaluation benchmarks isolated from operational emergency data.
   - Real-time priority shift tracking and auditable experiment logs.
   - **One-click CSV & JSON dataset export**.

6. **💾 Offline Map Package Downloader**:
   - Download and cache tiles across zoom levels 13–15 into IndexedDB and CacheStorage for a selectable radius ($2\text{ km}$, $5\text{ km}$, or $10\text{ km}$).
   - Includes a **"Simulate Offline Mode"** switch to test offline map rendering and local routing without an internet connection.

7. **🤖 Aegis AI Assistant**:
   - Real-time emergency dispatch assistant powered by Gemini 3.8 Flash on Express backend with hands-free Text-to-Speech (TTS) readout.
