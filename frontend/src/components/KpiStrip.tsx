import React from 'react';
import { useLabStore } from '../store/useLabStore';
import {
  CheckCircle2,
  Hourglass,
  Cpu,
  Scale,
  Zap,
  AlertOctagon,
  ShieldAlert,
  Flame,
} from 'lucide-react';

export const KpiStrip: React.FC = () => {
  const { runResult, replayState, mode, liveState } = useLabStore();

  if (mode === 'live' && liveState) {
    const total = liveState.counts.total;
    const completed = liveState.counts.completed;
    const running = liveState.counts.running;
    const ready = liveState.counts.ready;
    const suspended = liveState.counts.suspended;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 p-4 bg-cr-bg">
        <div className="flex flex-col p-3 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-cr-emerald" /> COMPLETED
          </span>
          <span className="text-xl font-bold font-mono text-white mt-1">
            {completed} <span className="text-xs text-slate-400 font-normal">/ {total}</span>
          </span>
        </div>

        <div className="flex flex-col p-3 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cr-cyan" /> RUNNING OS JOBS
          </span>
          <span className="text-xl font-bold font-mono text-cr-cyan mt-1">{running}</span>
        </div>

        <div className="flex flex-col p-3 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Hourglass className="w-3.5 h-3.5 text-cr-amber" /> READY QUEUE
          </span>
          <span className="text-xl font-bold font-mono text-cr-amber mt-1">{ready}</span>
        </div>

        <div className="flex flex-col p-3 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-cr-purple" /> SUSPENDED (RR)
          </span>
          <span className="text-xl font-bold font-mono text-cr-purple mt-1">{suspended}</span>
        </div>

        <div className="flex flex-col p-3 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-blue-400" /> ACTIVE NODES
          </span>
          <span className="text-xl font-bold font-mono text-white mt-1">
            {liveState.nodes.filter((n) => n.is_up).length}{' '}
            <span className="text-xs text-slate-400 font-normal">/ {liveState.nodes.length}</span>
          </span>
        </div>

        <div className="flex flex-col p-3 rounded-xl bg-cr-surface border border-cr-border">
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-cr-emerald" /> BANKER STATE
          </span>
          <span className="text-sm font-bold font-mono text-cr-emerald mt-2 uppercase">
            {liveState.banker_safe_sequence ? 'SAFE SEQ OK' : 'NO ACTIVE CONT'}
          </span>
        </div>
      </div>
    );
  }

  const metrics = runResult?.metrics;
  if (!metrics) {
    return null;
  }

  // Jain's fairness index color
  const jain = metrics.jains_fairness || 0;
  const jainColor =
    jain >= 0.85 ? 'text-cr-emerald' : jain >= 0.65 ? 'text-cr-amber' : 'text-cr-rose';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 p-3.5 bg-cr-bg border-b border-cr-border">
      {/* Completed / Total */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <CheckCircle2 className="w-3 h-3 text-cr-emerald" /> Jobs Done
        </span>
        <div className="text-lg font-bold font-mono text-white mt-0.5">
          {metrics.jobs_completed}{' '}
          <span className="text-xs text-slate-400 font-normal">/ {metrics.total_jobs}</span>
        </div>
      </div>

      {/* Avg Wait */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <Hourglass className="w-3 h-3 text-cr-cyan" /> Avg Wait
        </span>
        <div className="text-lg font-bold font-mono text-cr-cyan mt-0.5">
          {metrics.avg_wait.toFixed(1)} <span className="text-xs text-slate-400">m</span>
        </div>
      </div>

      {/* P99 Wait */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <Hourglass className="w-3 h-3 text-cr-amber" /> P99 Wait
        </span>
        <div className="text-lg font-bold font-mono text-cr-amber mt-0.5">
          {(metrics.p99_wait ?? metrics.p95_wait ?? 0).toFixed(1)} <span className="text-xs text-slate-400">m</span>
        </div>
      </div>

      {/* Jain's Fairness */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <Scale className="w-3 h-3 text-slate-300" /> Jain Index
        </span>
        <div className={`text-lg font-bold font-mono mt-0.5 ${jainColor}`}>
          {jain.toFixed(3)}
        </div>
      </div>

      {/* CPU Util */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <Cpu className="w-3 h-3 text-blue-400" /> CPU Util
        </span>
        <div className="text-lg font-bold font-mono text-blue-300 mt-0.5">
          {(metrics.cpu_util_avg * 100).toFixed(1)}%
        </div>
      </div>

      {/* Makespan */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <Zap className="w-3 h-3 text-indigo-400" /> Makespan
        </span>
        <div className="text-lg font-bold font-mono text-white mt-0.5">
          {metrics.makespan.toFixed(0)} <span className="text-xs text-slate-400">m</span>
        </div>
      </div>

      {/* Deadlocks */}
      <div
        className={`flex flex-col p-2.5 rounded-xl border transition ${
          metrics.deadlocks_detected > 0
            ? 'bg-cr-rose/20 border-cr-rose/50 cr-glow-rose'
            : 'bg-cr-surface/80 border-cr-border'
        }`}
      >
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <AlertOctagon className="w-3 h-3 text-cr-rose" /> Deadlocks
        </span>
        <div
          className={`text-lg font-bold font-mono mt-0.5 ${
            metrics.deadlocks_detected > 0 ? 'text-cr-rose' : 'text-slate-300'
          }`}
        >
          {metrics.deadlocks_detected}
        </div>
      </div>

      {/* Banker Denials */}
      <div className="flex flex-col p-2.5 rounded-xl bg-cr-surface/80 border border-cr-border">
        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 uppercase">
          <ShieldAlert className="w-3 h-3 text-cr-amber" /> Denials
        </span>
        <div className="text-lg font-bold font-mono text-slate-200 mt-0.5">
          {metrics.banker_denials}
        </div>
      </div>
    </div>
  );
};
