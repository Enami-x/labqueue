import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { ListOrdered, Clock, Cpu } from 'lucide-react';

export const PolicyQueue: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId } = useLabStore();
  const [filterRole, setFilterRole] = useState<string>('all');

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
    <div className="plume-card rounded-2xl p-5 flex flex-col h-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Policy Dispatch Queue
            </h2>
            <p className="text-xs text-slate-400">
              {queueItems.length} jobs waiting for dispatch
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            aria-label="Filter Queue by Role"
            className="bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none transition"
          >
            <option value="all" className="bg-slate-900">All Roles</option>
            <option value="ug" className="bg-slate-900">Undergraduates</option>
            <option value="phd" className="bg-slate-900">PhD Researchers</option>
            <option value="faculty" className="bg-slate-900">Faculty</option>
            <option value="exam" className="bg-slate-900">Exam</option>
            <option value="demo" className="bg-slate-900">Demo</option>
          </select>
        </div>
      </div>

      {/* Queue items list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs">
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
              className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] cursor-pointer transition"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-mono font-medium text-slate-500">
                  #{idx + 1}
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-white hover:text-sky-400 transition">
                      {item.id}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded-full bg-white/[0.06] text-slate-300 border border-white/[0.06]">
                      {item.role}
                    </span>
                    <span className="text-xs text-slate-400">
                      {item.kind}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-slate-500" /> {item.cpu}c / {item.mem}GB
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" /> Arr: {item.arrival}m
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 block">Burst</span>
                <span className="text-xs font-mono font-bold text-sky-400">
                  ~{item.burst}m
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
