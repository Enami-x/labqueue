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
  Sparkles,
  ChevronDown,
  Zap,
} from 'lucide-react';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
  { key: 'compare', label: 'Multi-Compare', icon: <Layers className="w-3.5 h-3.5" /> },
  { key: 'profiles', label: 'Catalog', icon: <Sliders className="w-3.5 h-3.5" /> },
  { key: 'builder', label: 'Builder', icon: <Zap className="w-3.5 h-3.5" /> },
  { key: 'calendar', label: 'Calendar & Rules', icon: <Calendar className="w-3.5 h-3.5" /> },
  { key: 'scenarios', label: 'Scenario Lab', icon: <Database className="w-3.5 h-3.5" /> },
  { key: 'live', label: 'Live Console', icon: <Terminal className="w-3.5 h-3.5" /> },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
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
    <header className="sticky top-0 z-40 px-4 pt-3 pb-2">
      <div className="plume-nav rounded-2xl px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 text-white shadow-lg shadow-indigo-500/25">
            <Server className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-sm tracking-tight text-white">
              LabQueue
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-white/[0.08] text-slate-300 border border-white/[0.06]">
              v1.0
            </span>
          </div>
        </div>

        {/* Navigation Tabs - Plumeform pill style */}
        <nav className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] p-1 rounded-xl overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-white/[0.12] text-white shadow-sm border border-white/[0.1]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-2">
          {/* Mode switch */}
          <div className="flex items-center p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs">
            <button
              onClick={() => setMode('simulation')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                mode === 'simulation'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sim Replay
            </button>
            <button
              onClick={() => setMode('live')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                mode === 'live'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3 h-3" />
              Live OS
            </button>
          </div>

          {/* Scenario quick selector (in Sim mode) */}
          {mode === 'simulation' && (
            <div className="hidden lg:flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] transition rounded-xl px-2.5 py-1 text-xs">
              <Sparkles className="w-3 h-3 text-sky-400" />
              <select
                value={activeScenario}
                onChange={(e) => runSimulation(activeProfile, e.target.value)}
                disabled={loading}
                aria-label="Active Workload Scenario"
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs font-medium pr-1"
              >
                {scenarios.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-200">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live WS Status badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-medium ${
              liveConnected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {liveConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  liveConnected ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              ></span>
            </span>
            <span className="hidden sm:inline">
              {liveConnected ? 'System Live' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
