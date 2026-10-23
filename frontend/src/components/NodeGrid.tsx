import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import { Server, AlertTriangle, ShieldCheck, PowerOff, RotateCcw } from 'lucide-react';

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

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'faculty':
        return 'bg-purple-600/40 text-purple-300 border-purple-500/50';
      case 'phd':
        return 'bg-indigo-600/40 text-indigo-300 border-indigo-500/50';
      case 'exam':
        return 'bg-cr-rose/40 text-cr-rose border-cr-rose/50';
      case 'demo':
        return 'bg-cr-amber/40 text-cr-amber border-cr-amber/50';
      case 'ug':
      default:
        return 'bg-cr-cyan/30 text-cr-cyan border-cr-cyan/40';
    }
  };

  return (
    <div className="flex flex-col bg-cr-surface border border-cr-border rounded-xl p-4 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-cr-border mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-cr-cyan" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Compute Nodes Matrix ({nodes.length} Nodes)
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cr-emerald" /> Healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cr-rose" /> Outage
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {nodes.map((node: any) => {
          const isUp = mode === 'live' ? node.is_up : node.up;
          const isLarge = node.cpu_total >= 16;
          const cpuPct = Math.round(
            (node.cpu_allocated / Math.max(1, node.cpu_total)) * 100
          );
          const memPct = Math.round(
            (node.mem_allocated / Math.max(1, node.mem_total)) * 100
          );

          return (
            <div
              key={node.id}
              className={`flex flex-col p-3 rounded-xl border transition-all duration-200 ${
                !isUp
                  ? 'bg-cr-rose/10 border-cr-rose/40 opacity-75'
                  : isLarge
                  ? 'bg-cr-card/90 border-cr-borderLight cr-glass-hover'
                  : 'bg-cr-card border-cr-border cr-glass-hover'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-cr-border/60">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isUp ? 'bg-cr-emerald cr-glow-emerald' : 'bg-cr-rose animate-ping'
                    }`}
                  />
                  <span className="font-mono font-bold text-xs text-white">
                    {node.name}
                  </span>
                  {isLarge && (
                    <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase rounded bg-purple-900/60 text-purple-300 border border-purple-700/50">
                      LARGE
                    </span>
                  )}
                </div>

                {/* Live fail/restore trigger button */}
                {mode === 'live' && (
                  <button
                    onClick={() => handleFailToggle(node.id, isUp)}
                    title={isUp ? 'Simulate Node Outage' : 'Restore Node'}
                    className={`p-1 rounded text-[10px] font-mono transition ${
                      isUp
                        ? 'bg-cr-rose/20 text-cr-rose hover:bg-cr-rose/30'
                        : 'bg-cr-emerald/20 text-cr-emerald hover:bg-cr-emerald/30'
                    }`}
                  >
                    {isUp ? <PowerOff className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Resource Bars */}
              <div className="space-y-2 text-[11px] font-mono">
                {/* CPU Bar */}
                <div>
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>CPU: {node.cpu_allocated} / {node.cpu_total} cores</span>
                    <span className={cpuPct > 90 ? 'text-cr-rose font-bold' : 'text-slate-300'}>
                      {cpuPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        !isUp
                          ? 'bg-slate-700'
                          : cpuPct > 90
                          ? 'bg-cr-rose'
                          : cpuPct > 60
                          ? 'bg-cr-amber'
                          : 'bg-cr-cyan'
                      }`}
                      style={{ width: `${Math.min(100, isUp ? cpuPct : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Memory Bar */}
                <div>
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>RAM: {node.mem_allocated} / {node.mem_total} GB</span>
                    <span className={memPct > 90 ? 'text-cr-rose font-bold' : 'text-slate-300'}>
                      {memPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        !isUp
                          ? 'bg-slate-700'
                          : memPct > 90
                          ? 'bg-cr-rose'
                          : 'bg-blue-400'
                      }`}
                      style={{ width: `${Math.min(100, isUp ? memPct : 0)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Running Jobs Chips */}
              <div className="mt-3 pt-2 border-t border-cr-border/40">
                <span className="text-[10px] text-slate-500 font-mono block mb-1">
                  Active Dispatches:
                </span>
                <div className="flex flex-wrap gap-1 min-h-[22px]">
                  {node.running_job_ids && node.running_job_ids.length > 0 ? (
                    node.running_job_ids.map((jid: string) => {
                      const job = replayState?.jobs?.[jid];
                      return (
                        <button
                          key={jid}
                          onClick={() => setSelectedJobId(jid)}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition hover:scale-105 ${getRoleColor(
                            job?.role
                          )}`}
                          title={`Click to inspect ${jid}`}
                        >
                          {jid}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-slate-600 font-mono italic">
                      {isUp ? 'Idle' : 'Offline'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
