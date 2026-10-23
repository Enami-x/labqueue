import React, { useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Layers, ArrowUpDown, TrendingUp, TrendingDown, Play, Check } from 'lucide-react';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-cr-border">
        <div>
          <h1 className="text-xl font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cr-cyan" />
            Multi-Policy Synchronized Comparison
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Compare 2 to 4 scheduling algorithms side-by-side against the same exact workload scenario (
            <b className="text-cr-cyan">{activeScenario}</b>).
          </p>
        </div>

        <button
          onClick={runCompareBatch}
          disabled={loading || compareProfileNames.length < 2}
          className="flex items-center gap-2 px-4 py-2 bg-cr-cyan/20 hover:bg-cr-cyan/30 text-cr-cyan border border-cr-cyan/40 rounded-xl font-mono text-xs font-bold transition cr-glow-cyan disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{loading ? 'Simulating Policies...' : 'Run Comparative Analysis'}</span>
        </button>
      </div>

      {/* Profile Selector Chips */}
      <div className="bg-cr-surface border border-cr-border rounded-xl p-4">
        <span className="text-xs font-mono text-slate-400 uppercase font-bold block mb-2.5">
          Select Profiles to Compare (Select 2 to 4):
        </span>
        <div className="flex flex-wrap gap-2">
          {profiles.slice(0, 18).map((p) => {
            const isSelected = compareProfileNames.includes(p.name);
            return (
              <button
                key={p.name}
                onClick={() => toggleCompareProfile(p.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition border ${
                  isSelected
                    ? 'bg-cr-cyan/20 text-cr-cyan border-cr-cyan/50 font-bold cr-glow-cyan'
                    : 'bg-cr-card text-slate-400 border-cr-border hover:text-slate-200'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5" />}
                <span>{p.name}</span>
                <span className="text-[10px] text-slate-500 uppercase">({p.scheduler})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparative Metrics Table */}
      <div className="bg-cr-surface border border-cr-border rounded-xl p-4 overflow-x-auto shadow-lg">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-cr-border">
          <ArrowUpDown className="w-4 h-4 text-cr-cyan" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Metric Deltas & Performance Trade-offs
          </h2>
        </div>

        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-cr-border text-slate-400 uppercase text-[10px]">
              <th className="py-2.5 px-3">Profile</th>
              <th className="py-2.5 px-3">Scheduler</th>
              <th className="py-2.5 px-3">Makespan</th>
              <th className="py-2.5 px-3">Avg Wait</th>
              <th className="py-2.5 px-3">P99 Wait</th>
              <th className="py-2.5 px-3">Jain's Fairness</th>
              <th className="py-2.5 px-3">CPU Util</th>
              <th className="py-2.5 px-3">Deadlocks</th>
              <th className="py-2.5 px-3">Starvation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cr-border/60">
            {runsList.map((run, idx) => {
              const m = run.metrics;
              const isBase = idx === 0;

              const makespanDelta = baseline ? m.makespan - baseline.makespan : 0;
              const waitDelta = baseline ? m.avg_wait - baseline.avg_wait : 0;
              const jainDelta = baseline ? m.jains_fairness - baseline.jains_fairness : 0;

              return (
                <tr key={run.run_id} className="hover:bg-cr-card/50 transition">
                  <td className="py-3 px-3">
                    <span className="font-bold text-white text-xs">{run.profile_name}</span>
                    {isBase && (
                      <span className="ml-2 px-1.5 py-0.2 text-[9px] rounded bg-cr-border text-slate-400">
                        BASELINE
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-cr-cyan font-bold">
                    {run.events[0]?.details?.scheduler || 'DYNAMIC'}
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-white font-bold">{m.makespan.toFixed(0)}m</span>
                    {!isBase && (
                      <span
                        className={`ml-2 text-[10px] ${
                          makespanDelta <= 0 ? 'text-cr-emerald font-bold' : 'text-cr-rose'
                        }`}
                      >
                        {makespanDelta <= 0 ? '' : '+'}
                        {makespanDelta.toFixed(0)}m
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-cr-cyan font-bold">{m.avg_wait.toFixed(1)}m</span>
                    {!isBase && (
                      <span
                        className={`ml-2 text-[10px] ${
                          waitDelta <= 0 ? 'text-cr-emerald font-bold' : 'text-cr-rose'
                        }`}
                      >
                        {waitDelta <= 0 ? '' : '+'}
                        {waitDelta.toFixed(1)}m
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-cr-amber font-bold">
                    {(m.p99_wait ?? m.p95_wait ?? 0).toFixed(1)}m
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`font-bold ${
                        m.jains_fairness >= 0.85
                          ? 'text-cr-emerald'
                          : m.jains_fairness >= 0.65
                          ? 'text-cr-amber'
                          : 'text-cr-rose'
                      }`}
                    >
                      {m.jains_fairness.toFixed(3)}
                    </span>
                    {!isBase && (
                      <span
                        className={`ml-2 text-[10px] ${
                          jainDelta >= 0 ? 'text-cr-emerald' : 'text-cr-rose'
                        }`}
                      >
                        {jainDelta >= 0 ? '+' : ''}
                        {jainDelta.toFixed(3)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-blue-300">
                    {(m.cpu_util_avg * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={
                        m.deadlocks_detected > 0 ? 'text-cr-rose font-bold' : 'text-slate-400'
                      }
                    >
                      {m.deadlocks_detected}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={m.starved_jobs > 0 ? 'text-cr-amber font-bold' : 'text-slate-400'}
                    >
                      {m.starved_jobs}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fairness vs Throughput Trade-off Callout */}
      <div className="p-4 rounded-xl bg-cr-surface border border-cr-border text-xs font-mono space-y-2">
        <h3 className="font-bold text-slate-200 uppercase tracking-wide">
          Key OS Policy Insights Observed:
        </h3>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>
            <b className="text-cr-cyan">SJF / SRTF:</b> Dramatically minimizes average wait time and
            maximizes makespan efficiency, but can starve longer research training jobs if aging rate = 0.
          </li>
          <li>
            <b className="text-cr-emerald">FCFS with Quota:</b> Provides optimal Jain's fairness index across user cohorts, but experiences head-of-line blocking during bursts.
          </li>
          <li>
            <b className="text-cr-rose">Banker Mode Off:</b> In scenarios with cross-resource demands, produces deadlocks requiring victim kill and restarts.
          </li>
        </ul>
      </div>
    </div>
  );
};
