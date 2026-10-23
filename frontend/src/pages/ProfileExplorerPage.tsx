import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Profile } from '../types';
import { Sliders, Search, Play, Check, ShieldAlert, Cpu } from 'lucide-react';

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
    <div className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6 overflow-y-auto font-mono">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-cr-border">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cr-cyan" />
            Scheduling Profiles Catalog ({profiles.length} Profiles)
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Explore 18 base human-curated policies and ~600 combinatorial parameter variants across
            schedulers, placement strategies, and Banker's safety modes.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-cr-surface p-4 rounded-xl border border-cr-border text-xs">
        {/* Search */}
        <div>
          <label className="text-slate-400 block mb-1">Search Profile Name</label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. practical, exam, sjf..."
              className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-cr-cyan"
            />
            <Search className="w-3.5 h-3.5 absolute right-3 top-2 text-slate-500" />
          </div>
        </div>

        {/* Family */}
        <div>
          <label className="text-slate-400 block mb-1">Family</label>
          <select
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 capitalize focus:outline-none"
          >
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Scheduler */}
        <div>
          <label className="text-slate-400 block mb-1">Scheduler Algorithm</label>
          <select
            value={selectedScheduler}
            onChange={(e) => setSelectedScheduler(e.target.value)}
            className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none"
          >
            {schedulers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Banker */}
        <div>
          <label className="text-slate-400 block mb-1">Banker Safety Mode</label>
          <select
            value={selectedBanker}
            onChange={(e) => setSelectedBanker(e.target.value)}
            className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 capitalize focus:outline-none"
          >
            {bankers.map((b) => (
              <option key={b} value={b}>
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
              className={`p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 ${
                isActive
                  ? 'bg-cr-card/90 border-cr-cyan/60 cr-glow-cyan'
                  : 'bg-cr-card/60 border-cr-border hover:border-slate-500'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-cr-border">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-sm truncate">{p.name}</span>
                  </div>
                  <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold rounded bg-cr-surface text-cr-cyan border border-cr-border">
                    {p.scheduler}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 mb-3">
                  <div>
                    Family: <b className="text-white capitalize">{p.family}</b>
                  </div>
                  <div>
                    Fit: <b className="text-white capitalize">{p.placement}</b>
                  </div>
                  <div>
                    Banker: <b className="text-white capitalize">{p.banker}</b>
                  </div>
                  <div>
                    Backfill: <b className="text-white">{p.backfill ? 'Yes' : 'No'}</b>
                  </div>
                  {p.quantum && (
                    <div>
                      Quantum: <b className="text-cr-amber">{p.quantum}m</b>
                    </div>
                  )}
                  {p.aging_rate > 0 && (
                    <div>
                      Aging: <b className="text-cr-emerald">+{p.aging_rate}/m</b>
                    </div>
                  )}
                  {p.quota_per_user && (
                    <div>
                      Quota: <b className="text-white">{p.quota_per_user} max/u</b>
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
                className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-cr-cyan/20 text-cr-cyan border border-cr-cyan/40 cursor-default'
                    : 'bg-cr-surface hover:bg-slate-700 text-slate-200 border border-cr-border'
                }`}
              >
                {isActive ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isActive ? 'ACTIVE POLICY' : 'ACTIVATE & SIMULATE'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length > 60 && (
        <div className="text-center text-xs text-slate-500 font-mono py-2">
          Showing 60 of {filtered.length} matching profiles. Use filters above to narrow results.
        </div>
      )}
    </div>
  );
};
