import React, { useState } from 'react';
import { ResearchScenario, ExperimentLog, RegisteredPerson } from '../types/floodguard';
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface ResearchSimulationModeProps {
  scenarios: ResearchScenario[];
  experimentLogs: ExperimentLog[];
  onRunScenario: (scenarioId: string) => Promise<void>;
  onExportLogs: (format: 'json' | 'csv') => void;
  people: RegisteredPerson[];
}

export const ResearchSimulationMode: React.FC<ResearchSimulationModeProps> = ({
  scenarios,
  experimentLogs,
  onRunScenario,
  onExportLogs,
  people,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0]?.id || '');
  const [isRunning, setIsRunning] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];

  const handleExecute = async () => {
    if (!selectedScenario) return;
    setIsRunning(true);
    setExecutionMessage(null);
    try {
      await onRunScenario(selectedScenario.id);
      setExecutionMessage(`Scenario "${selectedScenario.name}" executed successfully. Recorded physiological & priority shift logs.`);
    } catch {
      setExecutionMessage('Scenario execution failed or network interrupted.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto bg-slate-950 text-slate-100 p-5 space-y-5">
      {/* Prominent Synthetic Research Banner (Rule 10 & 13) */}
      <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-600/60 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <FlaskConical className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-amber-300 uppercase tracking-wider font-mono">
                Controlled Research & Evaluation Mode Active
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-200 border border-amber-500/40">
                SYNTHETIC SANDBOX
              </span>
            </div>
            <p className="text-xs text-amber-200/80 mt-0.5">
              Simulated telemetry and test victims are strictly isolated. Synthetic records cannot be mistaken for operational live emergencies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onExportLogs('csv')}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => onExportLogs('json')}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <FileDown className="w-4 h-4 text-sky-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Scenario Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {scenarios.map((sc) => {
          const isSelected = sc.id === selectedScenarioId;
          return (
            <div
              key={sc.id}
              onClick={() => setSelectedScenarioId(sc.id)}
              className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-2 text-xs ${
                isSelected
                  ? 'bg-slate-800/90 border-[#ff7700] ring-1 ring-[#ff7700] shadow-xl'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono text-slate-400">{sc.id}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                      sc.hazardLevel === 'CATASTROPHIC'
                        ? 'bg-red-500/20 text-red-400'
                        : sc.hazardLevel === 'SEVERE'
                        ? 'bg-[#ff7700]/20 text-[#ff7700]'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {sc.hazardLevel}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-white">{sc.name}</h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">{sc.description}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>{sc.peopleCount} Test Subjects</span>
                <span className="text-sky-400 font-semibold">{isSelected ? 'Selected' : 'Select'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Scenario Runner Card */}
      {selectedScenario && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-mono text-[#ff7700] font-bold uppercase tracking-wider">
                Active Benchmark Configuration
              </span>
              <h2 className="text-lg font-bold text-white">{selectedScenario.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{selectedScenario.description}</p>
            </div>

            <button
              onClick={handleExecute}
              disabled={isRunning}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition active:scale-95 ${
                isRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-[#ff7700] hover:bg-[#e66c00] text-white'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Running Scenario Telemetry...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Execute Scenario Telemetry
                </>
              )}
            </button>
          </div>

          {/* Environmental Parameter Preview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs font-mono">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Dam Level</span>
              <strong className="text-sky-400">{selectedScenario.simulatedConditions.damLevelM} m</strong>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Rainfall</span>
              <strong className="text-white">{selectedScenario.simulatedConditions.precipitationMmH} mm/h</strong>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">SOS Triggers</span>
              <strong className="text-red-400">{selectedScenario.simulatedConditions.sosCount} Beacons</strong>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Hypoxic Vitals</span>
              <strong className="text-[#ff7700]">{selectedScenario.simulatedConditions.hypoxiaCount} Cases</strong>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Drifting Cases</span>
              <strong className="text-cyan-400">{selectedScenario.simulatedConditions.driftCount} Victims</strong>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Stale Fixes</span>
              <strong className="text-amber-400">{selectedScenario.simulatedConditions.staleGpsCount} Telemetry</strong>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Offline Devices</span>
              <strong className="text-slate-400">{selectedScenario.simulatedConditions.offlineCount} Packets</strong>
            </div>
          </div>

          {executionMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{executionMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Experiment Results & Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
              Experiment Execution Logs ({experimentLogs.length})
            </h3>
            <p className="text-xs text-slate-400">
              Auditable priority transitions and hypothesis validation
            </p>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Auto-recorded from scenario simulation engine
          </span>
        </div>

        {experimentLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            No simulation runs recorded yet. Click "Execute Scenario Telemetry" above to trigger a controlled evaluation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Scenario</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Simulated Condition</th>
                  <th className="py-2.5 px-3 text-center">Shift</th>
                  <th className="py-2.5 px-3">Reasoning & Rule Validation</th>
                  <th className="py-2.5 px-3">System Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {experimentLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50 transition">
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                    <td className="py-2.5 px-3 text-sky-400 font-semibold whitespace-nowrap">
                      {log.scenarioId}
                    </td>
                    <td className="py-2.5 px-3 text-white font-bold whitespace-nowrap">
                      {log.personName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{log.inputCondition}</td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 mr-1">
                        {log.previousPriority}
                      </span>
                      →
                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold ml-1">
                        {log.newPriority}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-amber-300">{log.reason}</td>
                    <td className="py-2.5 px-3 text-emerald-400">{log.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
