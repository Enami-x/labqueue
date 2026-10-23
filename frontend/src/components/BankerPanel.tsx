import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ShieldCheck, AlertOctagon, CheckCircle2, ArrowRight } from 'lucide-react';

export const BankerPanel: React.FC = () => {
  const { replayState, liveState, mode, runResult } = useLabStore();

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
    <div className="bg-cr-surface border border-cr-border rounded-xl p-4 shadow-lg flex flex-col h-[400px]">
      <div className="flex items-center justify-between pb-3 border-b border-cr-border mb-3">
        <div className="flex items-center gap-2">
          {isSafe ? (
            <ShieldCheck className="w-4 h-4 text-cr-emerald" />
          ) : (
            <AlertOctagon className="w-4 h-4 text-cr-rose animate-bounce" />
          )}
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Banker Safety Matrix & Deadlock Monitor
          </h2>
        </div>

        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
            isSafe
              ? 'bg-cr-emerald/20 text-cr-emerald border border-cr-emerald/40'
              : 'bg-cr-rose/20 text-cr-rose border border-cr-rose/40 cr-glow-rose'
          }`}
        >
          {isSafe ? 'SAFE STATE' : 'DEADLOCK DETECTED'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 font-mono">
        {/* Available Vector Card */}
        <div className="p-3 rounded-lg bg-cr-card border border-cr-border">
          <span className="text-[11px] text-slate-400 block mb-1">
            CURRENT AVAILABLE VECTOR (A):
          </span>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-cr-surface border border-cr-border">
              <span className="text-slate-400 block text-[10px]">GPU</span>
              <span className="text-cr-emerald font-bold text-sm">
                {pooled?.available.gpu ?? 0}
              </span>
            </div>
            <div className="p-2 rounded bg-cr-surface border border-cr-border">
              <span className="text-slate-400 block text-[10px]">LIC</span>
              <span className="text-cr-cyan font-bold text-sm">
                {pooled?.available.lic ?? 0}
              </span>
            </div>
            <div className="p-2 rounded bg-cr-surface border border-cr-border">
              <span className="text-slate-400 block text-[10px]">I/O</span>
              <span className="text-cr-amber font-bold text-sm">
                {pooled?.available.io ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Safe Sequence Display */}
        <div className="p-3 rounded-lg bg-cr-card border border-cr-border">
          <span className="text-[11px] text-slate-400 block mb-1.5">
            DIJKSTRA-HABERMANN SAFE SEQUENCE:
          </span>
          {safeSeq && safeSeq.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {safeSeq.map((pid, idx) => (
                <React.Fragment key={pid}>
                  <span className="px-2 py-0.5 rounded bg-cr-surface text-cr-emerald border border-cr-emerald/40 font-bold">
                    {pid}
                  </span>
                  {idx < safeSeq.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">
              {isSafe
                ? 'System in safe equilibrium. No pending unsafe contention.'
                : 'No complete safe sequence could be found! Cycle in resource graph.'}
            </div>
          )}
        </div>

        {/* Deadlock Victim / Recovery Alert */}
        {deadlockedJobs.length > 0 && (
          <div className="p-3 rounded-lg bg-cr-rose/15 border border-cr-rose/40 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-cr-rose mb-1">
              <AlertOctagon className="w-4 h-4" />
              <span>DEADLOCK CYCLE IDENTIFIED</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Cross-holding cycle detected on pooled resources. Victims selected for termination:
            </p>
            <div className="flex gap-2 mt-2">
              {deadlockedJobs.map((vid) => (
                <span
                  key={vid}
                  className="px-2 py-0.5 rounded bg-cr-rose/30 text-white border border-cr-rose/60 font-bold"
                >
                  {vid}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Textbook safety rule explanation */}
        <div className="p-2.5 rounded bg-cr-surface/60 border border-cr-border text-[11px] text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">Safety Invariant (spec §14):</p>
          <p>
            Need[i, r] = Max[i, r] - Alloc[i, r]. If Request[i] ≤ Available and a complete safe
            sequence exists such that Work = Work + Alloc[i], grant is executed.
          </p>
        </div>
      </div>
    </div>
  );
};
