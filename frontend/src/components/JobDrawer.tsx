import React from 'react';
import { useLabStore } from '../store/useLabStore';
import {
  X,
  Clock,
  Cpu,
  Sparkles,
  Key,
  HardDrive,
  HelpCircle,
} from 'lucide-react';

export const JobDrawer: React.FC = () => {
  const { selectedJobId, setSelectedJobId, replayState, runResult } = useLabStore();

  if (!selectedJobId) return null;

  const job = replayState?.jobs?.[selectedJobId];
  const events = runResult?.events.filter((e) => e.job_id === selectedJobId) || [];

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-950/85 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl z-50 flex flex-col p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div>
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Job Telemetry Inspector
          </span>
          <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
            <span>{selectedJobId}</span>
            {job?.role && (
              <span className="px-2 py-0.5 text-[10px] uppercase font-semibold rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                {job.role}
              </span>
            )}
          </h3>
        </div>
        <button
          onClick={() => setSelectedJobId(null)}
          aria-label="Close Inspector"
          className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="mt-5 space-y-4 text-xs">
        {/* Core Specs */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
          <span className="text-xs font-semibold text-slate-300 block">
            Specification & Resource Demands
          </span>
          <div className="grid grid-cols-2 gap-2.5 text-slate-300">
            <div>
              User: <b className="text-white font-mono">{job?.user_id || 'u0'}</b>
            </div>
            <div>
              Kind: <b className="text-white capitalize">{job?.kind || 'training'}</b>
            </div>
            <div>
              Arrival: <b className="text-white font-mono">{job?.arrival || 0}m</b>
            </div>
            <div>
              Duration: <b className="text-white font-mono">{job?.burst || 5}m</b>
            </div>
            <div>
              CPU: <b className="text-sky-400 font-mono">{job?.cpu || 1} Cores</b>
            </div>
            <div>
              Memory: <b className="text-sky-400 font-mono">{job?.mem || 2} GB</b>
            </div>
          </div>
        </div>

        {/* Why is my job waiting? */}
        <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-500/20 space-y-2">
          <span className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" /> Why is my job waiting?
          </span>
          <div className="space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-sky-400 font-bold">•</span>
              <span>
                <b>Policy Ranking:</b> Under the active policy, jobs with higher priority score or earlier arrival take precedence.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sky-400 font-bold">•</span>
              <span>
                <b>Memory Placement:</b> Requires a contiguous node with at least {job?.mem || 2}GB free RAM.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sky-400 font-bold">•</span>
              <span>
                <b>Banker Safety:</b> Pooled GPU/license requests are deferred unless all maximum claims remain safely satisfiable.
              </span>
            </div>
          </div>
        </div>

        {/* Phase Demands */}
        {job?.phases && job.phases.length > 0 && (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
            <span className="text-xs font-semibold text-slate-300 block">
              Execution Phases (Multi-Resource Contention)
            </span>
            <div className="space-y-2">
              {job.phases.map((ph: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs font-mono"
                >
                  <span className="text-slate-400">At T={ph.at}m:</span>
                  <div className="flex gap-2">
                    {ph.request.gpu > 0 && (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> {ph.request.gpu} GPU
                      </span>
                    )}
                    {ph.request.lic > 0 && (
                      <span className="text-sky-400 font-bold flex items-center gap-1">
                        <Key className="w-3 h-3" /> {ph.request.lic} LIC
                      </span>
                    )}
                    {ph.request.io > 0 && (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <HardDrive className="w-3 h-3" /> {ph.request.io} I/O
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job Event History */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
          <span className="text-xs font-semibold text-slate-300 block">
            Lifecycle Events
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No events logged yet.</span>
            ) : (
              events.map((e, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs border-b border-white/[0.04] pb-1.5 font-mono"
                >
                  <span className="text-sky-400 font-bold">T={e.t}m</span>
                  <span className="text-slate-300 text-[11px]">{e.type}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
