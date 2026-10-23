import React, { useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Layers, ArrowUpDown, Play, Check, TrendingUp, Sparkles } from 'lucide-react';

export const ComparePage: React.FC = () => {
  const {
    profiles,
    compareProfileNames,
    toggleCompareProfile,
    compareRuns,
    runCompareBatch,
    loading,
    activeScenario,
  } = useLabStore();

  useEffect(() => {
    if (Object.keys(compareRuns).length === 0) {
      runCompareBatch();
    }
  }, []);

  const runsList = compareProfileNames
    .map((name) => compareRuns[name])
    .filter(Boolean);

  const baseline = runsList[0]?.metrics;

  return (
    <div className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Layers className="w-4 h-4" />
            <span>Side-by-Side Policy Evaluation</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Multi-Policy Comparison Matrix
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Evaluating 2 to 4 scheduling algorithms deterministically against workload scenario:{' '}
            <span className="text-sky-400 font-medium">{activeScenario}</span>.
          </p>
        </div>

        <button
          onClick={runCompareBatch}
          disabled={loading || compareProfileNames.length < 2}
          className="plume-btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{loading ? 'Simulating Policies...' : 'Run Comparative Analysis'}</span>
        </button>
      </div>

      {/* Profile Selector Chips */}
      <div className="plume-card rounded-2xl p-5">
        <span className="text-xs font-semibold text-slate-300 block mb-3">
          Select Policies to Compare (2 to 4 active):
        </span>
        <div className="flex flex-wrap gap-2">
          {profiles.slice(0, 18).map((p) => {
            const isSelected = compareProfileNames.includes(p.name);
            return (
              <button
                key={p.name}
                onClick={() => toggleCompareProfile(p.name)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-400/40'
                    : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5" />}
                <span>{p.name}</span>
                <span className="text-[10px] text-slate-400 uppercase font-mono">({p.scheduler})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparative Metrics Table */}
      <div className="plume-card rounded-2xl p-5 overflow-x-auto">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/[0.08]">
          <ArrowUpDown className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Performance Deltas & Trade-off Matrix
          </h2>
        </div>

        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] text-slate-400 uppercase text-[11px] font-medium">
              <th className="py-3 px-3.5">Policy Profile</th>
              <th className="py-3 px-3.5">Scheduler</th>
              <th className="py-3 px-3.5">Makespan</th>
              <th className="py-3 px-3.5">Avg Wait</th>
              <th className="py-3 px-3.5">P99 Wait</th>
              <th className="py-3 px-3.5">Jain's Fairness</th>
              <th className="py-3 px-3.5">CPU Util</th>
              <th className="py-3 px-3.5">Deadlocks</th>
              <th className="py-3 px-3.5">Starvation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {runsList.map((run, idx) => {
              const m = run?.metrics || ({} as any);
              const isBase = idx === 0;

              const makespan = m.makespan ?? 0;
              const avgWait = m.avg_wait ?? 0;
              const p99 = m.p99_wait ?? m.p95_wait ?? 0;
              const jain = m.jains_fairness ?? (m as any).fairness_index ?? 0;
              const cpuUtil = m.cpu_util_avg ?? (m as any).utilization ?? 0;
              const deadlocks = m.deadlocks_detected ?? 0;
              const starved = m.starved_jobs ?? (m as any).starvation_count ?? 0;

              const baseMakespan = baseline?.makespan ?? 0;
              const baseWait = baseline?.avg_wait ?? 0;
              const baseJain = baseline?.jains_fairness ?? (baseline as any)?.fairness_index ?? 0;

              const makespanDelta = baseline ? makespan - baseMakespan : 0;
              const waitDelta = baseline ? avgWait - baseWait : 0;
              const jainDelta = baseline ? jain - baseJain : 0;

              return (
                <tr key={run.run_id} className="hover:bg-white/[0.02] transition">
                  <td className="py-3.5 px-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{run.profile_name}</span>
                      {isBase && (
                        <span className="px-2 py-0.5 text-[10px] font-medium uppercase rounded-full bg-white/[0.08] text-slate-300">
                          Baseline
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-3.5 text-sky-400 font-mono font-medium">
                    {run.events?.[0]?.details?.scheduler || 'Dynamic'}
                  </td>
                  <td className="py-3.5 px-3.5 font-mono">
                    <span className="text-white font-bold">{makespan.toFixed(0)}m</span>
                    {!isBase && (
                      <span
                        className={`ml-2 text-[11px] font-medium ${
                          makespanDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {makespanDelta <= 0 ? '' : '+'}
                        {makespanDelta.toFixed(0)}m
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3.5 font-mono">
                    <span className="text-sky-400 font-bold">{avgWait.toFixed(1)}m</span>
                    {!isBase && (
                      <span
                        className={`ml-2 text-[11px] font-medium ${
                          waitDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {waitDelta <= 0 ? '' : '+'}
                        {waitDelta.toFixed(1)}m
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3.5 text-amber-400 font-mono font-bold">
                    {p99.toFixed(1)}m
                  </td>
                  <td className="py-3.5 px-3.5 font-mono">
                    <span
                      className={`font-bold ${
                        jain >= 0.85
                          ? 'text-emerald-400'
                          : jain >= 0.65
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {jain.toFixed(3)}
                    </span>
                    {!isBase && (
                      <span
                        className={`ml-2 text-[11px] font-medium ${
                          jainDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {jainDelta >= 0 ? '+' : ''}
                        {jainDelta.toFixed(3)}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3.5 text-indigo-300 font-mono">
                    {(cpuUtil * 100).toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-3.5 font-mono">
                    <span
                      className={
                        deadlocks > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'
                      }
                    >
                      {deadlocks}
                    </span>
                  </td>
                  <td className="py-3.5 px-3.5 font-mono">
                    <span
                      className={starved > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}
                    >
                      {starved}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Editorial Key Insights Callout */}
      <div className="plume-card rounded-2xl p-5 space-y-2.5">
        <div className="flex items-center gap-2 text-indigo-400">
          <Sparkles className="w-4 h-4" />
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Key OS Policy Insights Observed
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <span className="font-semibold text-sky-400 block mb-1">SJF / SRTF Efficiency</span>
            <p className="text-slate-400 leading-relaxed">
              Dramatically minimizes average wait time and maximizes cluster throughput, but can starve longer research training jobs if aging rate is 0.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <span className="font-semibold text-emerald-400 block mb-1">FCFS with User Quotas</span>
            <p className="text-slate-400 leading-relaxed">
              Maximizes cohort fairness (Jain's index &gt; 0.95), preventing aggressive users from hoarding pooled GPUs.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <span className="font-semibold text-rose-400 block mb-1">Banker Algorithm Off</span>
            <p className="text-slate-400 leading-relaxed">
              Allows circular waiting on cross-resource demands (GPU vs Lic), triggering deadlock cycles and requiring victim job termination.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
