import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ShieldCheck, AlertOctagon, ArrowRight, ShieldAlert } from 'lucide-react';

export const BankerPanel: React.FC = () => {
  const { replayState, liveState, mode } = useLabStore();

  const pooled =
    mode === 'live'
      ? liveState?.pooled
      : replayState?.pooled;

  const isSafe =
    mode === 'live'
      ? liveState?.banker_safe_sequence !== null
      : replayState?.banker_safe !== false;

  const safeSeq = mode === 'live' ? liveState?.banker_safe_sequence : null;
  const deadlockedJobs = replayState?.deadlocked_jobs || [];

  return (
    <div className="plume-card rounded-2xl p-5 flex flex-col h-[420px]">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {isSafe ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4 text-rose-400" />}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Banker Safety & Deadlock Monitor
            </h2>
            <p className="text-xs text-slate-400">
              Continuous discrete state evaluation
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
            isSafe
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/25'
          }`}
        >
          {isSafe ? 'Safe State' : 'Deadlock Cycle Detected'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
        {/* Available Vector Card */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <span className="text-xs text-slate-400 block mb-2 font-medium">
            Available Resource Vector (A):
          </span>
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="text-slate-400 block text-[11px] mb-0.5">GPU</span>
              <span className="text-emerald-400 font-bold font-mono text-base">
                {pooled?.available.gpu ?? 0}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="text-slate-400 block text-[11px] mb-0.5">Licenses</span>
              <span className="text-sky-400 font-bold font-mono text-base">
                {pooled?.available.lic ?? 0}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="text-slate-400 block text-[11px] mb-0.5">I/O Slots</span>
              <span className="text-amber-400 font-bold font-mono text-base">
                {pooled?.available.io ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Safe Sequence Display */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <span className="text-xs text-slate-400 block mb-2 font-medium">
            Dijkstra-Habermann Safe Sequence:
          </span>
          {safeSeq && safeSeq.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {safeSeq.map((pid, idx) => (
                <React.Fragment key={pid}>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-medium">
                    {pid}
                  </span>
                  {idx < safeSeq.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">
              {isSafe
                ? 'System in safe equilibrium. All concurrent claims satisfiable.'
                : 'No safe sequence found. Mutual dependency detected in resource claim graph.'}
            </div>
          )}
        </div>

        {/* Deadlock Victim Alert if applicable */}
        {deadlockedJobs.length > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs">
            <div className="flex items-center gap-2 font-semibold text-rose-300 mb-1">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>Deadlock Recovery Invoked</span>
            </div>
            <p className="text-slate-300 mb-2">
              Cross-holding cycle broken by preemption/termination. Selected victims:
            </p>
            <div className="flex gap-2">
              {deadlockedJobs.map((vid) => (
                <span
                  key={vid}
                  className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-200 border border-rose-500/40 font-mono font-bold"
                >
                  {vid}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Invariant Note */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs text-slate-400">
          <p className="font-medium text-slate-300 mb-1">Safety Invariant (OS Spec §14):</p>
          <p className="text-[11px] leading-relaxed">
            Need[i, r] = Max[i, r] − Alloc[i, r]. Requests are granted only if a deterministic sequence satisfies all pending maximum claims.
          </p>
        </div>
      </div>
    </div>
  );
};
