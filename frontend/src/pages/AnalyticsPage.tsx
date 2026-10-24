import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { BarChart3, Scale, Clock, Layers } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { runResult, activeProfile, activeScenario } = useLabStore();

  const metrics = runResult?.metrics;
  const timeSeries = metrics?.time_series;

  // Roles that had no completed jobs in this run carry no signal, so hide them.
  const roleRows = Object.entries(metrics?.by_role || {})
    .filter(([, r]) => r.count > 0)
    .sort((a, b) => b[1].avg_wait - a[1].avg_wait);
  const maxWait = Math.max(1, ...roleRows.map(([, r]) => r.avg_wait));

  return (
    <div className="flex-1 p-6 max-w-[1400px] w-full mx-auto space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <BarChart3 className="w-4 h-4" />
          <span>Telemetry Analytics</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Run Analytics & Distribution Breakdown
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Empirical scheduling performance for policy{' '}
          <span className="text-sky-400 font-medium">{activeProfile}</span> evaluated against scenario{' '}
          <span className="text-white font-medium">{activeScenario}</span>.
        </p>
      </div>

      {/* Top 3 High-Level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="plume-card p-5 rounded-2xl space-y-2">
          <span className="text-slate-400 text-xs flex items-center gap-2 font-medium">
            <Scale className="w-4 h-4 text-emerald-400" /> Jain's Fairness Index
          </span>
          <div className="text-3xl font-bold font-mono text-emerald-400">
            {((metrics?.jains_fairness ?? (metrics as any)?.fairness_index ?? 0)).toFixed(3)}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Normalized cohort balance across undergraduates, thesis researchers, and faculty.
          </p>
        </div>

        <div className="plume-card p-5 rounded-2xl space-y-2">
          <span className="text-slate-400 text-xs flex items-center gap-2 font-medium">
            <Clock className="w-4 h-4 text-sky-400" /> Tail Latency Ratio (P99 / Avg)
          </span>
          <div className="text-3xl font-bold font-mono text-sky-400">
            {metrics?.avg_wait
              ? ((metrics.p99_wait ?? metrics.p95_wait ?? metrics.avg_wait) / Math.max(0.01, metrics.avg_wait)).toFixed(1)
              : '1.0'}x
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            P99 wait divided by the mean wait across completed jobs.
          </p>
        </div>

        <div className="plume-card p-5 rounded-2xl space-y-2">
          <span className="text-slate-400 text-xs flex items-center gap-2 font-medium">
            <Layers className="w-4 h-4 text-amber-400" /> Starvation Instances
          </span>
          <div className="text-3xl font-bold font-mono text-amber-400">
            {metrics?.starved_jobs ?? (metrics as any)?.starvation_count ?? 0}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Jobs that waited longer than 120 time units before initial dispatch.
          </p>
        </div>
      </div>

      {/* Wait Time by Role Bar Breakdown */}
      <div className="plume-card rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white tracking-tight">
          Average Waiting Time by Academic User Role
        </h2>

        <div className="space-y-3.5">
          {roleRows.map(([roleKey, r]) => {
            const val = r.avg_wait;
            const pct = Math.round((val / maxWait) * 100);
            return (
              <div key={roleKey} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="uppercase font-semibold text-slate-300 w-40 tracking-wide">
                    {roleKey} <span className="normal-case font-normal text-slate-400">· {r.count} jobs</span>
                  </span>
                  <span className="text-sky-400 font-mono font-bold">{val.toFixed(1)} mins</span>
                </div>
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time Series: Queue Length & CPU Utilization Over Simulation */}
      {timeSeries && timeSeries.t && timeSeries.t.length > 0 && (
        <div className="plume-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Discrete Event Time Series (Queue Length)
              </h2>
              <p className="text-xs text-slate-400">Sampled progression over simulation makespan</p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {timeSeries.t.length} samples
            </span>
          </div>

          <div className="h-44 flex items-end gap-1 overflow-x-auto pt-4 pb-2 border-b border-white/[0.06]">
            {timeSeries.queue_len.map((qLen, idx) => {
              const maxQ = Math.max(1, ...timeSeries.queue_len);
              const barH = Math.round((qLen / maxQ) * 100);
              return (
                <div
                  key={idx}
                  className="flex-1 min-w-[6px] bg-gradient-to-t from-indigo-600 to-sky-400 rounded-t transition-opacity hover:opacity-100 opacity-80"
                  style={{ height: `${Math.max(4, barH)}%` }}
                  title={`T=${timeSeries.t[idx]}m: Queue = ${qLen} jobs`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-slate-500 font-mono">
            <span>T = 0m</span>
            <span>Makespan: {(metrics?.makespan ?? 0).toFixed(0)}m</span>
          </div>
        </div>
      )}
    </div>
  );
};
