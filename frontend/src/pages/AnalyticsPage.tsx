import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { BarChart3, TrendingUp, Scale, Clock, Layers } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { runResult, activeProfile, activeScenario } = useLabStore();

  const metrics = runResult?.metrics;
  const timeSeries = metrics?.time_series;

  const waitByRole = metrics?.wait_by_role || {};
  const roles = Object.keys(waitByRole);

  const maxWait = Math.max(1, ...Object.values(waitByRole).map((v) => Number(v) || 0));

  return (
    <div className="flex-1 p-6 max-w-[1400px] w-full mx-auto space-y-6 overflow-y-auto font-mono text-xs">
      {/* Header */}
      <div className="pb-4 border-b border-cr-border">
        <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cr-cyan" />
          Run Analytics & Telemetry Deep-Dive
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          Statistical performance distributions for current policy{' '}
          <b className="text-cr-cyan">{activeProfile}</b> on scenario{' '}
          <b className="text-white">{activeScenario}</b>.
        </p>
      </div>

      {/* Top 3 High-Level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-slate-400 text-xs flex items-center gap-1.5 uppercase block mb-1">
            <Scale className="w-4 h-4 text-cr-emerald" /> Jain's Fairness Index
          </span>
          <span className="text-2xl font-bold text-cr-emerald">
            {(metrics?.jains_fairness || 0).toFixed(3)}
          </span>
          <p className="text-[11px] text-slate-400 mt-1 font-sans">
            Normalized cohort balance across undergraduates, thesis researchers, and faculty.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-slate-400 text-xs flex items-center gap-1.5 uppercase block mb-1">
            <Clock className="w-4 h-4 text-cr-cyan" /> Tail Latency Ratio (P99 / Avg)
          </span>
          <span className="text-2xl font-bold text-cr-cyan">
            {metrics?.avg_wait ? (metrics.p99_wait / Math.max(0.01, metrics.avg_wait)).toFixed(1) : '1.0'}x
          </span>
          <p className="text-[11px] text-slate-400 mt-1 font-sans">
            Ratio of extreme waiting times relative to median job wait.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-slate-400 text-xs flex items-center gap-1.5 uppercase block mb-1">
            <Layers className="w-4 h-4 text-cr-amber" /> Anti-Starvation Count
          </span>
          <span className="text-2xl font-bold text-cr-amber">
            {metrics?.starved_jobs || 0}
          </span>
          <p className="text-[11px] text-slate-400 mt-1 font-sans">
            Jobs that waited longer than 3x their burst duration before dispatch.
          </p>
        </div>
      </div>

      {/* Wait Time Distribution by User Role */}
      <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-cr-border pb-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Average Wait Time by Cohort Role (Minutes)
          </h2>
          <span className="text-slate-400 text-[11px]">Lower is better</span>
        </div>

        <div className="space-y-3 pt-2">
          {roles.map((roleKey) => {
            const val = Number(waitByRole[roleKey]) || 0;
            const pct = Math.round((val / maxWait) * 100);
            return (
              <div key={roleKey} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="uppercase font-bold text-slate-300 w-24">{roleKey}</span>
                  <span className="text-cr-cyan font-bold">{val.toFixed(1)} mins</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cr-cyan to-blue-500 rounded-full transition-all duration-300"
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
        <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-cr-border pb-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Discrete Event Time Series (Queue Length & Cluster Utilization)
            </h2>
            <span className="text-slate-400 text-[11px]">
              {timeSeries.t.length} Simulation Samples
            </span>
          </div>

          <div className="h-44 flex items-end gap-1 overflow-x-auto pt-4 pb-2 border-b border-cr-border">
            {timeSeries.queue_len.map((qLen, idx) => {
              const maxQ = Math.max(1, ...timeSeries.queue_len);
              const barH = Math.round((qLen / maxQ) * 100);
              return (
                <div
                  key={idx}
                  className="flex-1 min-w-[6px] bg-cr-cyan/60 hover:bg-cr-cyan rounded-t transition"
                  style={{ height: `${Math.max(4, barH)}%` }}
                  title={`T=${timeSeries.t[idx]}m: Queue = ${qLen} jobs`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>T=0m</span>
            <span>Simulation Makespan: {metrics?.makespan.toFixed(0)}m</span>
          </div>
        </div>
      )}
    </div>
  );
};
