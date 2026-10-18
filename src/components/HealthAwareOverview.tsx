import React from 'react';
import { RegisteredPerson, HealthThresholds } from '../types/floodguard';
import { DEFAULT_HEALTH_THRESHOLDS } from '../services/priorityEngine';
import {
  AlertCircle,
  AlertTriangle,
  Flame,
  HeartPulse,
  Radio,
  Users,
  Waves,
  WifiOff,
} from 'lucide-react';

interface HealthAwareOverviewProps {
  people: RegisteredPerson[];
  thresholds?: HealthThresholds;
  onSelectFilter?: (filterType: string) => void;
  activeFilter?: string;
}

export const HealthAwareOverview: React.FC<HealthAwareOverviewProps> = ({
  people,
  thresholds = DEFAULT_HEALTH_THRESHOLDS,
  onSelectFilter,
  activeFilter,
}) => {
  // If no people data available
  if (!people || people.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 font-mono">
        Health-Aware Emergency Overview: Unavailable (No registered citizen data)
      </div>
    );
  }

  // 1. Total registered people
  const totalRegistered = people.length;

  // 2. Active SOS incidents (unconditional immediate danger)
  const activeSosCount = people.filter((p) => p.sosActive).length;

  // 3. Critical rescue cases (P0 and P1)
  const criticalCasesCount = people.filter(
    (p) => p.rescuePriority === 'P0' || p.rescuePriority === 'P1'
  ).length;

  // 4. High-priority rescue cases (P2)
  const highPriorityCount = people.filter((p) => p.rescuePriority === 'P2').length;

  // 5. Active drift alerts
  const activeDriftCount = people.filter((p) => p.driftStatus === 'DRIFTING').length;

  // 6. People with elevated health-risk indicators
  const elevatedHealthCount = people.filter((p) => {
    if (p.spo2Percent === null || p.heartRateBpm === null) return false;
    const abnormalSpo2 = p.spo2Percent < thresholds.spo2Warning;
    const abnormalHr =
      p.heartRateBpm > thresholds.hrHighWarning || p.heartRateBpm < thresholds.hrLowWarning;
    return abnormalSpo2 || abnormalHr;
  }).length;

  // 7. Wearables with stale or unavailable data
  const staleDataCount = people.filter(
    (p) =>
      p.commStatus === 'STALE' ||
      p.healthDataValidity === 'STALE' ||
      p.healthDataValidity === 'UNKNOWN' ||
      p.heartRateBpm === null ||
      p.spo2Percent === null
  ).length;

  // 8. Devices currently offline or unreachable
  const offlineCount = people.filter(
    (p) => p.commStatus === 'OFFLINE' || p.commStatus === 'UNREACHABLE'
  ).length;

  const items = [
    {
      id: 'ALL',
      label: 'Registered Citizens',
      count: totalRegistered,
      icon: Users,
      color: 'text-slate-100',
      border: 'border-slate-800',
      badgeBg: 'bg-slate-800 text-slate-200',
    },
    {
      id: 'SOS',
      label: 'Active SOS Alerts',
      count: activeSosCount,
      icon: AlertCircle,
      color: 'text-red-400',
      border: activeSosCount > 0 ? 'border-red-500/50 bg-red-950/30' : 'border-slate-800',
      badgeBg: 'bg-red-500/20 text-red-400 font-bold',
      pulse: activeSosCount > 0,
    },
    {
      id: 'CRITICAL',
      label: 'P0/P1 Critical Cases',
      count: criticalCasesCount,
      icon: Flame,
      color: 'text-[#ff7700]',
      border: criticalCasesCount > 0 ? 'border-[#ff7700]/50 bg-orange-950/20' : 'border-slate-800',
      badgeBg: 'bg-[#ff7700]/20 text-[#ff7700] font-bold',
    },
    {
      id: 'HIGH',
      label: 'P2 High Priority',
      count: highPriorityCount,
      icon: AlertTriangle,
      color: 'text-amber-400',
      border: 'border-slate-800',
      badgeBg: 'bg-amber-500/20 text-amber-300',
    },
    {
      id: 'DRIFT',
      label: 'Active Drift Alerts',
      count: activeDriftCount,
      icon: Waves,
      color: 'text-cyan-400',
      border: activeDriftCount > 0 ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-slate-800',
      badgeBg: 'bg-cyan-500/20 text-cyan-300 font-bold',
      pulse: activeDriftCount > 0,
    },
    {
      id: 'HEALTH_RISK',
      label: 'Elevated Vitals Risk',
      count: elevatedHealthCount,
      icon: HeartPulse,
      color: 'text-rose-400',
      border: 'border-slate-800',
      badgeBg: 'bg-rose-500/20 text-rose-300',
    },
    {
      id: 'STALE',
      label: 'Stale / Missing Data',
      count: staleDataCount,
      icon: Radio,
      color: 'text-slate-400',
      border: 'border-slate-800',
      badgeBg: 'bg-slate-800 text-slate-300',
    },
    {
      id: 'OFFLINE',
      label: 'Devices Offline',
      count: offlineCount,
      icon: WifiOff,
      color: 'text-slate-500',
      border: 'border-slate-800',
      badgeBg: 'bg-slate-800 text-slate-400',
    },
  ];

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ff7700] animate-pulse"></span>
          <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-slate-300">
            Health-Aware Emergency Overview
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          Evaluated against live physiological thresholds • Do not count as safe without telemetry
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isSelected = activeFilter === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectFilter && onSelectFilter(item.id)}
              className={`p-2 rounded-lg border text-left transition relative flex flex-col justify-between ${
                item.border
              } ${isSelected ? 'ring-2 ring-[#ff7700] bg-slate-800' : 'bg-slate-950/70 hover:bg-slate-800/80'}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <Icon className={`w-3.5 h-3.5 ${item.color} ${item.pulse ? 'animate-pulse' : ''}`} />
                <span className={`px-1.5 py-0.2 rounded text-[11px] font-mono ${item.badgeBg}`}>
                  {item.count}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-tight truncate font-sans">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
