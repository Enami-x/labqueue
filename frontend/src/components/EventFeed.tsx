import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Radio } from 'lucide-react';

export const EventFeed: React.FC = () => {
  const { replayState } = useLabStore();
  const [filterType, setFilterType] = useState<string>('all');

  const events = replayState?.recent_events || [];

  const filtered = events.filter((e) => {
    if (filterType === 'all') return true;
    if (filterType === 'deadlock') return e.type.includes('DEADLOCK') || e.type.includes('BANKER');
    if (filterType === 'preempt') return e.type.includes('PREEMPT');
    if (filterType === 'dispatch') return e.type.includes('DISPATCH') || e.type.includes('STARTED');
    return true;
  });

  const getEventBadge = (type: string) => {
    if (type.includes('DEADLOCK')) {
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30 font-semibold';
    }
    if (type.includes('PREEMPT')) {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold';
    }
    if (type.includes('COMPLETED') || type.includes('FINISHED')) {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    }
    if (type.includes('DISPATCH') || type.includes('STARTED')) {
      return 'bg-sky-500/15 text-sky-300 border-sky-500/25';
    }
    if (type.includes('SWITCH')) {
      return 'bg-purple-500/15 text-purple-300 border-purple-500/25';
    }
    return 'bg-white/[0.04] text-slate-400 border-white/[0.06]';
  };

  return (
    <div className="plume-card rounded-2xl p-5 flex flex-col h-[340px]">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Discrete Event Log Stream
            </h2>
            <p className="text-xs text-slate-400">
              Deterministic state transition audit
            </p>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 text-xs">
          {['all', 'dispatch', 'preempt', 'deadlock'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-2.5 py-1 rounded-lg capitalize transition ${
                filterType === f
                  ? 'bg-white/[0.12] text-white border border-white/[0.1] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 text-xs pr-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs italic">
            No events match current filter.
          </div>
        ) : (
          filtered.map((e, idx) => (
            <div
              key={`${e.seq || idx}-${e.t}`}
              className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition"
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 w-14">
                  T={e.t.toFixed(1)}m
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${getEventBadge(
                    e.type
                  )}`}
                >
                  {e.type}
                </span>
                {e.job_id && (
                  <span className="text-white font-mono font-semibold">{e.job_id}</span>
                )}
              </div>

              <div className="text-xs text-slate-400 truncate max-w-[240px]">
                {e.details?.node_name && `Node: ${e.details.node_name}`}
                {e.details?.new_profile && `→ ${e.details.new_profile}`}
                {e.details?.victim && `Victim: ${e.details.victim}`}
                {e.details?.reason && `${e.details.reason}`}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
