import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Sliders, Search, Play, Check } from 'lucide-react';

export const ProfileExplorerPage: React.FC = () => {
  const { profiles, activeProfile, runSimulation, setTab } = useLabStore();

  const [search, setSearch] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [selectedScheduler, setSelectedScheduler] = useState('all');
  const [selectedBanker, setSelectedBanker] = useState('all');

  const families = ['all', 'academic', 'research', 'deadlines', 'demo', 'mixed'];
  const schedulers = ['all', 'FCFS', 'SJF', 'RR', 'PRIORITY'];
  const bankers = ['all', 'off', 'lenient', 'strict'];

  const filtered = profiles.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedFamily !== 'all' && p.family !== selectedFamily) return false;
    if (selectedScheduler !== 'all' && p.scheduler !== selectedScheduler) return false;
    if (selectedBanker !== 'all' && p.banker !== selectedBanker) return false;
    return true;
  });

  const handleActivate = (profileName: string) => {
    runSimulation(profileName);
    setTab('overview');
  };

  return (
    <div className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sliders className="w-4 h-4" />
            <span>Policy Catalog & Variants</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Scheduling Profiles Catalog ({profiles.length})
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Explore 18 base human-curated policies and ~600 combinatorial parameter variants across
            schedulers, placement strategies, and Banker's safety modes.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 plume-card p-4 rounded-2xl text-xs">
        {/* Search */}
        <div>
          <label className="text-slate-400 block mb-1.5 font-medium">Search Profile</label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. practical, exam, sjf..."
              className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-xs transition"
            />
            <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-500" />
          </div>
        </div>

        {/* Family */}
        <div>
          <label className="text-slate-400 block mb-1.5 font-medium">Policy Family</label>
          <select
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] rounded-xl px-3 py-2 text-slate-200 capitalize focus:outline-none text-xs transition"
          >
            {families.map((f) => (
              <option key={f} value={f} className="bg-slate-900">
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Scheduler */}
        <div>
          <label className="text-slate-400 block mb-1.5 font-medium">Algorithm</label>
          <select
            value={selectedScheduler}
            onChange={(e) => setSelectedScheduler(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] rounded-xl px-3 py-2 text-slate-200 focus:outline-none text-xs transition"
          >
            {schedulers.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Banker */}
        <div>
          <label className="text-slate-400 block mb-1.5 font-medium">Banker's Safety</label>
          <select
            value={selectedBanker}
            onChange={(e) => setSelectedBanker(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] rounded-xl px-3 py-2 text-slate-200 capitalize focus:outline-none text-xs transition"
          >
            {bankers.map((b) => (
              <option key={b} value={b} className="bg-slate-900">
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Profile Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.slice(0, 60).map((p) => {
          const isActive = p.name === activeProfile;
          return (
            <div
              key={p.name}
              className={`p-4 rounded-2xl border flex flex-col justify-between transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600/[0.08] border-indigo-400/40 shadow-lg shadow-indigo-500/10'
                  : 'plume-card'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.06]">
                  <span className="font-semibold text-white text-sm truncate">{p.name}</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-medium uppercase rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                    {p.scheduler}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-4">
                  <div>
                    Family: <b className="text-white capitalize">{p.family}</b>
                  </div>
                  <div>
                    Placement: <b className="text-white capitalize">{p.placement}</b>
                  </div>
                  <div>
                    Banker: <b className="text-white capitalize">{p.banker}</b>
                  </div>
                  <div>
                    Backfill: <b className="text-white">{p.backfill ? 'Enabled' : 'Disabled'}</b>
                  </div>
                  {p.quantum && (
                    <div>
                      Quantum: <b className="text-amber-400 font-mono">{p.quantum}m</b>
                    </div>
                  )}
                  {p.aging_rate > 0 && (
                    <div>
                      Aging: <b className="text-emerald-400 font-mono">+{p.aging_rate}/m</b>
                    </div>
                  )}
                  {p.quota_per_user && (
                    <div>
                      Quota: <b className="text-white font-mono">{p.quota_per_user} max/u</b>
                    </div>
                  )}
                  {p.reserved_role && (
                    <div>
                      Reserved: <b className="text-purple-300">{p.reserved_role} ({Math.round(p.reserved_pct * 100)}%)</b>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleActivate(p.name)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                    : 'plume-btn-secondary'
                }`}
              >
                {isActive ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isActive ? 'Currently Active' : 'Activate & Replay'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length > 60 && (
        <div className="text-center text-xs text-slate-500 py-3">
          Showing 60 of {filtered.length} matching profiles.
        </div>
      )}
    </div>
  );
};
