import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { ListOrdered, Search, Clock, Cpu, Award } from 'lucide-react';

export const PolicyQueue: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId, profiles, activeProfile } = useLabStore();
  const [filterRole, setFilterRole] = useState<string>('all');

  // In sim mode, use replayState; in live mode, use liveState
  const queueItems =
    mode === 'live'
      ? liveState?.ready_queue || []
      : (replayState?.ready_queue || []).map((jid) => {
          const job = replayState?.jobs?.[jid];
          return {
            id: jid,
            role: job?.role || 'ug',
            kind: job?.kind || 'training',
            cpu: job?.cpu || 1,
            mem: job?.mem || 1,
            arrival: job?.arrival || 0,
            burst: job?.burst || 5,
            score: 0,
          };
        });

  const filtered = queueItems.filter((item: any) => {
    if (filterRole === 'all') return true;
    return item.role === filterRole;
  });

  return (
    <div className="bg-cr-surface border border-cr-border rounded-xl p-4 shadow-lg flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cr-border mb-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-cr-cyan" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Policy Dispatch Queue ({queueItems.length} Waiting)
          </h2>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            aria-label="Filter Queue by Role"
            className="bg-cr-card border border-cr-border text-slate-300 text-xs rounded-lg px-2 py-1 font-mono focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="ug">Undergrads</option>
            <option value="phd">PhD</option>
            <option value="faculty">Faculty</option>
            <option value="exam">Exam</option>
            <option value="demo">Demo</option>
          </select>
        </div>
      </div>

      {/* Queue items list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 font-mono text-xs">
            <span className="italic">Ready queue is currently empty.</span>
            <span className="text-[11px] text-slate-600 mt-1">
              All jobs are either running or completed.
            </span>
          </div>
        ) : (
          filtered.map((item: any, idx: number) => (
            <div
              key={item.id}
              onClick={() => setSelectedJobId(item.id)}
              className="flex items-center justify-between p-2.5 rounded-lg bg-cr-card border border-cr-border cr-glass-hover cursor-pointer transition"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-mono font-bold text-slate-500">
                  #{idx + 1}
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-white hover:text-cr-cyan">
                      {item.id}
                    </span>
                    <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase rounded bg-cr-border text-slate-300">
                      {item.role}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {item.kind}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-slate-500" /> {item.cpu}c / {item.mem}G
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" /> Arr: {item.arrival}m
                    </span>
                  </div>
                </div>
              </div>

              {/* Score / Rank indicator */}
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-mono">DISPATCH RANK</span>
                <span className="text-xs font-mono font-bold text-cr-cyan">
                  {idx === 0 ? 'NEXT UP' : `+${idx} in line`}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
