import React from 'react';
import { useLabStore, TabKey } from '../store/useLabStore';
import {
  Activity,
  Layers,
  Sliders,
  Calendar,
  Database,
  Terminal,
  BarChart3,
  Server,
  Radio,
  Flame,
  Zap,
} from 'lucide-react';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
  { key: 'compare', label: 'Multi-Compare', icon: <Layers className="w-4 h-4" /> },
  { key: 'profiles', label: 'Catalog (~600)', icon: <Sliders className="w-4 h-4" /> },
  { key: 'builder', label: 'Builder', icon: <Zap className="w-4 h-4" /> },
  { key: 'calendar', label: 'Calendar & Rules', icon: <Calendar className="w-4 h-4" /> },
  { key: 'scenarios', label: 'Scenario Lab', icon: <Database className="w-4 h-4" /> },
  { key: 'live', label: 'Live Console', icon: <Terminal className="w-4 h-4" /> },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
];

export const Navbar: React.FC = () => {
  const {
    currentTab,
    setTab,
    mode,
    setMode,
    activeProfile,
    activeScenario,
    scenarios,
    runSimulation,
    liveConnected,
    loading,
  } = useLabStore();

  return (
    <header className="sticky top-0 z-40 bg-cr-bg/95 backdrop-blur-md border-b border-cr-border px-4 py-2.5">
      <div className="flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-cr-surface border border-cr-cyan/40 cr-glow-cyan text-cr-cyan">
            <Server className="w-5 h-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cr-cyan opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cr-cyan"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-base uppercase bg-gradient-to-r from-cr-cyan via-blue-400 to-cr-emerald bg-clip-text text-transparent font-mono">
                LabQueue
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-cr-border text-slate-300 font-mono">
                OS-CBP v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-none">
              Policy-Based Job & Resource Dispatcher
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1 px-2 rounded-xl bg-cr-surface/80 border border-cr-border/80">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-cr-cyan/20 text-cr-cyan border border-cr-cyan/40 shadow-sm cr-glow-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-2.5">
          {/* Mode switch */}
          <div className="flex items-center p-0.5 rounded-lg bg-cr-surface border border-cr-border text-xs font-mono">
            <button
              onClick={() => setMode('simulation')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                mode === 'simulation'
                  ? 'bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sim Replay
            </button>
            <button
              onClick={() => setMode('live')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                mode === 'live'
                  ? 'bg-cr-emerald/20 text-cr-emerald font-semibold border border-cr-emerald/40 cr-glow-emerald'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3 h-3 animate-beacon" />
              Live OS
            </button>
          </div>

          {/* Scenario quick selector (in Sim mode) */}
          {mode === 'simulation' && (
            <div className="flex items-center gap-1.5 bg-cr-surface border border-cr-border rounded-lg px-2.5 py-1 text-xs">
              <Flame className="w-3.5 h-3.5 text-cr-amber" />
              <select
                value={activeScenario}
                onChange={(e) => runSimulation(activeProfile, e.target.value)}
                disabled={loading}
                aria-label="Active Workload Scenario"
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-mono text-[11px]"
              >
                {scenarios.map((s) => (
                  <option key={s} value={s} className="bg-cr-surface text-slate-200">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live WS Status beacon */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono ${
              liveConnected
                ? 'bg-cr-emerald/10 border-cr-emerald/30 text-cr-emerald'
                : 'bg-cr-rose/10 border-cr-rose/30 text-cr-rose'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                liveConnected ? 'bg-cr-emerald animate-ping' : 'bg-cr-rose'
              }`}
            />
            <span>{liveConnected ? 'LIVE FEED' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
