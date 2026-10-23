import React from 'react';
import { useLabStore } from '../store/useLabStore';
import {
  X,
  Clock,
  Cpu,
  Layers,
  Sparkles,
  Key,
  HardDrive,
  AlertCircle,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

export const JobDrawer: React.FC = () => {
  const { selectedJobId, setSelectedJobId, replayState, runResult } = useLabStore();

  if (!selectedJobId) return null;

  const job = replayState?.jobs?.[selectedJobId];
  const events = runResult?.events.filter((e) => e.job_id === selectedJobId) || [];

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-cr-surface border-l border-cr-border shadow-2xl z-50 flex flex-col p-5 overflow-y-auto animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-cr-border">
        <div>
          <span className="text-[10px] font-mono text-slate-500 uppercase">
            Job Telemetry Inspector
          </span>
          <h3 className="text-base font-extrabold font-mono text-white flex items-center gap-2">
            <span>{selectedJobId}</span>
            {job?.role && (
              <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold rounded bg-cr-card text-cr-cyan border border-cr-border">
                {job.role}
              </span>
            )}
          </h3>
        </div>
        <button
          onClick={() => setSelectedJobId(null)}
          aria-label="Close Inspector"
          className="p-1 rounded-lg bg-cr-card hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="mt-4 space-y-4 font-mono text-xs">
        {/* Core Specs */}
        <div className="p-3 rounded-lg bg-cr-card border border-cr-border space-y-2">
          <span className="text-[11px] text-slate-400 font-bold block mb-1">
            SPECIFICATION & DEMANDS
          </span>
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div>
              User: <b className="text-white">{job?.user_id || 'u0'}</b>
            </div>
            <div>
              Kind: <b className="text-white">{job?.kind || 'training'}</b>
            </div>
            <div>
              Arrival: <b className="text-white">{job?.arrival || 0}m</b>
            </div>
            <div>
              Duration: <b className="text-white">{job?.burst || 5}m</b>
            </div>
            <div>
              Footprint: <b className="text-cr-cyan">{job?.cpu || 1} CPU</b>
            </div>
            <div>
              Memory: <b className="text-cr-cyan">{job?.mem || 2} GB</b>
            </div>
          </div>
        </div>

        {/* Why is my job waiting? Reason code analysis */}
        <div className="p-3 rounded-lg bg-cr-card border border-cr-border space-y-2">
          <span className="text-[11px] text-cr-amber font-bold flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" /> WHY IS MY JOB WAITING?
          </span>
          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex items-start gap-1.5">
              <span className="text-cr-cyan font-bold">•</span>
              <span>
                <b>Policy Ranking:</b> Under the active policy, jobs with higher priority score or
                earlier arrival take precedence.
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-cr-cyan font-bold">•</span>
              <span>
                <b>Memory Placement:</b> Requires a contiguous node with at least {job?.mem || 2}GB
                free RAM under the current placement strategy.
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-cr-cyan font-bold">•</span>
              <span>
                <b>Banker Safety:</b> In Strict mode, pooled GPU/license requests are deferred
                unless all max claims remain schedulable.
              </span>
            </div>
          </div>
        </div>

        {/* Phase Demands */}
        {job?.phases && job.phases.length > 0 && (
          <div className="p-3 rounded-lg bg-cr-card border border-cr-border space-y-2">
            <span className="text-[11px] text-slate-400 font-bold block">
              EXECUTION PHASES (POOLED REQUESTS)
            </span>
            <div className="space-y-1.5">
              {job.phases.map((ph: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-1.5 rounded bg-cr-surface border border-cr-border text-[11px]"
                >
                  <span className="text-slate-400">At t={ph.at}m:</span>
                  <div className="flex gap-2">
                    {ph.request.gpu > 0 && (
                      <span className="text-cr-emerald font-bold">{ph.request.gpu} GPU</span>
                    )}
                    {ph.request.lic > 0 && (
                      <span className="text-cr-cyan font-bold">{ph.request.lic} LIC</span>
                    )}
                    {ph.request.io > 0 && (
                      <span className="text-cr-amber font-bold">{ph.request.io} I/O</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job Event History */}
        <div className="p-3 rounded-lg bg-cr-card border border-cr-border space-y-2">
          <span className="text-[11px] text-slate-400 font-bold block mb-1">
            LIFECYCLE EVENTS
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {events.length === 0 ? (
              <span className="text-[11px] text-slate-500 italic">No events logged yet.</span>
            ) : (
              events.map((e, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[11px] border-b border-cr-border/40 pb-1"
                >
                  <span className="text-cr-cyan font-bold">T={e.t}m</span>
                  <span className="text-slate-300">{e.type}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
