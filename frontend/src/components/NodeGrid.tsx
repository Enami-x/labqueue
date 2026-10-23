import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import { Server, PowerOff, RotateCcw } from 'lucide-react';

export const NodeGrid: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId } = useLabStore();

  const nodes =
    mode === 'live'
      ? liveState?.nodes || []
      : replayState?.nodes || [];

  const handleFailToggle = async (nodeId: number, isUp: boolean) => {
    try {
      if (isUp) {
        await api.failLiveNode(nodeId);
      } else {
        await api.restoreLiveNode(nodeId);
      }
    } catch (e) {
      // Handled
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'faculty':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/25';
      case 'phd':
        return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25';
      case 'exam':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/25';
      case 'demo':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/25';
      case 'ug':
      default:
        return 'bg-sky-500/15 text-sky-300 border-sky-500/25';
    }
  };

  return (
    <div className="plume-card rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Cluster Compute Nodes
            </h2>
            <p className="text-xs text-slate-400">
              {nodes.length} nodes registered • Heterogeneous core & memory topologies
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" /> Outage
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {nodes.map((node: any) => {
          const isUp = mode === 'live' ? node.is_up : node.up;
          const isLarge = (node.cpu_total ?? node.cpu ?? 0) >= 16;
          const cpuTotal = node.cpu_total ?? node.cpu ?? 1;
          const cpuAllocated = node.cpu_allocated ?? 0;
          const memTotal = node.mem_total ?? node.mem ?? 1;
          const memAllocated = node.mem_allocated ?? 0;

          const cpuPct = Math.round((cpuAllocated / Math.max(1, cpuTotal)) * 100);
          const memPct = Math.round((memAllocated / Math.max(1, memTotal)) * 100);

          return (
            <div
              key={node.id}
              className={`flex flex-col p-3.5 rounded-2xl border transition-all duration-200 ${
                !isUp
                  ? 'bg-rose-500/[0.04] border-rose-500/25 opacity-75'
                  : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/[0.15]'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isUp ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-400 animate-pulse'
                    }`}
                  />
                  <span className="font-mono font-semibold text-xs text-white">
                    {node.name}
                  </span>
                  {isLarge && (
                    <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
                      Large
                    </span>
                  )}
                </div>

                {/* Live fail/restore trigger button */}
                {mode === 'live' && (
                  <button
                    onClick={() => handleFailToggle(node.id, isUp)}
                    title={isUp ? 'Simulate Node Outage' : 'Restore Node'}
                    className={`p-1.5 rounded-lg text-xs transition ${
                      isUp
                        ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                        : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    {isUp ? <PowerOff className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Resource Bars */}
              <div className="space-y-2 text-xs">
                {/* CPU Bar */}
                <div>
                  <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                    <span>CPU: {cpuAllocated}/{cpuTotal}</span>
                    <span className={cpuPct > 90 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                      {cpuPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        !isUp
                          ? 'bg-rose-500'
                          : cpuPct > 90
                          ? 'bg-rose-500'
                          : cpuPct > 65
                          ? 'bg-amber-400'
                          : 'bg-sky-400'
                      }`}
                      style={{ width: `${Math.min(100, isUp ? cpuPct : 0)}%` }}
                    />
                  </div>
                </div>

                {/* RAM Bar */}
                <div>
                  <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                    <span>RAM: {memAllocated}/{memTotal} GB</span>
                    <span className={memPct > 90 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                      {memPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        !isUp
                          ? 'bg-rose-500'
                          : memPct > 90
                          ? 'bg-rose-500'
                          : 'bg-indigo-400'
                      }`}
                      style={{ width: `${Math.min(100, isUp ? memPct : 0)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Running Jobs Pills */}
              <div className="mt-3 pt-2 border-t border-white/[0.06] flex flex-wrap gap-1 items-center min-h-[26px]">
                {node.running_job_ids && node.running_job_ids.length > 0 ? (
                  node.running_job_ids.map((jid: string) => {
                    const job = replayState?.jobs?.[jid];
                    return (
                      <button
                        key={jid}
                        onClick={() => setSelectedJobId(jid)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition ${getRoleBadge(
                          job?.role
                        )} hover:scale-105`}
                      >
                        {jid}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-[10px] text-slate-500 italic">Idle</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
