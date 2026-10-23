import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Radio, Filter } from 'lucide-react';

export const EventFeed: React.FC = () => {
  const { replayState, runResult } = useLabStore();
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
      return 'bg-cr-rose/20 text-cr-rose border-cr-rose/50 cr-glow-rose font-bold';
    }
    if (type.includes('PREEMPT')) {
      return 'bg-cr-amber/20 text-cr-amber border-cr-amber/50 font-bold';
    }
    if (type.includes('COMPLETED') || type.includes('FINISHED')) {
      return 'bg-cr-emerald/20 text-cr-emerald border-cr-emerald/40';
    }
    if (type.includes('DISPATCH') || type.includes('STARTED')) {
      return 'bg-cr-cyan/20 text-cr-cyan border-cr-cyan/40';
    }
    if (type.includes('SWITCH')) {
      return 'bg-purple-600/20 text-purple-300 border-purple-500/40';
    }
    return 'bg-cr-surface text-slate-400 border-cr-border';
  };

  return (
    <div className="bg-cr-surface border border-cr-border rounded-xl p-4 shadow-lg flex flex-col h-[320px]">
      <div className="flex items-center justify-between pb-3 border-b border-cr-border mb-2.5">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cr-cyan animate-beacon" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Event Log Stream
          </h2>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 text-[11px] font-mono">
          {['all', 'dispatch', 'preempt', 'deadlock'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-2 py-0.5 rounded capitalize transition ${
                filterType === f
                  ? 'bg-cr-cyan/20 text-cr-cyan border border-cr-cyan/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs italic">
            No events match filter.
          </div>
        ) : (
          filtered.map((e, idx) => (
            <div
              key={`${e.seq || idx}-${e.t}`}
              className="flex items-center justify-between p-2 rounded bg-cr-card/70 border border-cr-border/60 hover:bg-cr-card transition"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] text-slate-400 w-12 font-bold">
                  T={e.t.toFixed(1)}m
                </span>
                <span
                  className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded border ${getEventBadge(
                    e.type
                  )}`}
                >
                  {e.type}
                </span>
                {e.job_id && (
                  <span className="text-slate-200 font-bold">{e.job_id}</span>
                )}
              </div>

              <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
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
