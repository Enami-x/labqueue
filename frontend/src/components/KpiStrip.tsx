import React from 'react';
import { useLabStore } from '../store/useLabStore';
import {
  CheckCircle2,
  Clock,
  Cpu,
  Scale,
  Zap,
  AlertOctagon,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Activity,
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
      <div className="px-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="plume-card p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Completed
            </span>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {completed} <span className="text-xs text-slate-400 font-normal">/ {total}</span>
            </div>
          </div>

          <div className="plume-card p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-400" /> Running Jobs
            </span>
            <div className="text-xl font-bold font-mono text-sky-400 mt-1">{running}</div>
          </div>

          <div className="plume-card p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> Ready Queue
            </span>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">{ready}</div>
          </div>

          <div className="plume-card p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-purple-400" /> Preempted
            </span>
            <div className="text-xl font-bold font-mono text-purple-300 mt-1">{suspended}</div>
          </div>

          <div className="plume-card p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" /> Active Nodes
            </span>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {liveState.nodes.filter((n) => n.is_up).length}{' '}
              <span className="text-xs text-slate-400 font-normal">/ {liveState.nodes.length}</span>
            </div>
          </div>

          <div className="plume-card p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Banker Status
            </span>
            <div className="text-xs font-semibold uppercase font-mono text-emerald-400 mt-2">
              {liveState.banker_safe_sequence ? 'Safe State' : 'Unsafe'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const metrics = runResult?.metrics;
  if (!metrics) {
    return null;
  }

  const jain = metrics.jains_fairness ?? (metrics as any).fairness_index ?? 0;
  const jainColor =
    jain >= 0.85 ? 'text-emerald-400' : jain >= 0.65 ? 'text-amber-400' : 'text-rose-400';

  const avgWait = metrics.avg_wait ?? 0;
  const p99Wait = metrics.p99_wait ?? metrics.p95_wait ?? 0;
  const cpuUtil = (metrics.cpu_util_avg ?? (metrics as any).utilization ?? 0) * 100;
  const makespan = metrics.makespan ?? 0;
  const deadlocks = metrics.deadlocks_detected ?? 0;
  const denials = metrics.banker_denials ?? 0;
  const completed = metrics.jobs_completed ?? 0;
  const total = metrics.total_jobs ?? completed;

  return (
    <div className="px-4 mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {/* Completed / Total */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Jobs Done
          </span>
          <div className="text-lg font-bold font-mono text-white mt-1">
            {completed} <span className="text-xs text-slate-400 font-normal">/ {total}</span>
          </div>
        </div>

        {/* Avg Wait */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-400" /> Avg Wait
          </span>
          <div className="text-lg font-bold font-mono text-sky-400 mt-1">
            {avgWait.toFixed(1)} <span className="text-xs text-slate-400 font-normal">m</span>
          </div>
        </div>

        {/* P99 Wait */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> P99 Wait
          </span>
          <div className="text-lg font-bold font-mono text-amber-400 mt-1">
            {p99Wait.toFixed(1)} <span className="text-xs text-slate-400 font-normal">m</span>
          </div>
        </div>

        {/* Jain's Fairness */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-indigo-400" /> Jain Index
          </span>
          <div className={`text-lg font-bold font-mono mt-1 ${jainColor}`}>
            {jain.toFixed(3)}
          </div>
        </div>

        {/* CPU Util */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" /> CPU Util
          </span>
          <div className="text-lg font-bold font-mono text-indigo-300 mt-1">
            {cpuUtil.toFixed(1)}%
          </div>
        </div>

        {/* Makespan */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-sky-400" /> Makespan
          </span>
          <div className="text-lg font-bold font-mono text-white mt-1">
            {makespan.toFixed(0)} <span className="text-xs text-slate-400 font-normal">m</span>
          </div>
        </div>

        {/* Deadlocks */}
        <div
          className={`p-3 rounded-2xl flex flex-col justify-between border transition ${
            deadlocks > 0
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'plume-card'
          }`}
        >
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <AlertOctagon
              className={`w-3.5 h-3.5 ${deadlocks > 0 ? 'text-rose-400' : 'text-slate-400'}`}
            />{' '}
            Deadlocks
          </span>
          <div
            className={`text-lg font-bold font-mono mt-1 ${
              deadlocks > 0 ? 'text-rose-400 font-extrabold' : 'text-slate-300'
            }`}
          >
            {deadlocks}
          </div>
        </div>

        {/* Banker Denials */}
        <div className="plume-card p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Denials
          </span>
          <div className="text-lg font-bold font-mono text-slate-200 mt-1">
            {denials}
          </div>
        </div>
      </div>
    </div>
  );
};
