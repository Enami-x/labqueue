import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { Settings2, PowerOff, RotateCcw } from 'lucide-react';
import { api } from '../services/api';

function Progress({ value, color = 'mint' }: { value: number; color?: string }) {
  return (
    <div className="progress-track">
      <div className={`progress-fill ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export const NodeGrid: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId, setTab } = useLabStore();

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

  const onlineCount = nodes.filter((n: any) => (mode === 'live' ? n.is_up : n.up)).length;

  return (
    <section className="panel nodes-panel">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Cluster topology</span>
          <h2>Node matrix</h2>
        </div>
        <div className="heading-actions">
          <span className="live-status">
            <span className="status-dot" />
            {onlineCount} online
          </span>
          <button className="ghost-button" onClick={() => setTab('profiles')}>
            <Settings2 /> Manage
          </button>
        </div>
      </div>

      <div className="nodes-grid">
        {nodes.map((node: any) => {
          const isUp = mode === 'live' ? node.is_up : node.up;
          const isLarge = (node.cpu_total ?? node.cpu ?? 0) >= 16;
          const cpuTotal = node.cpu_total ?? node.cpu ?? 1;
          const cpuAllocated = node.cpu_allocated ?? 0;
          const memTotal = node.mem_total ?? node.mem ?? 1;
          const memAllocated = node.mem_allocated ?? 0;

          const cpuPct = Math.round((cpuAllocated / Math.max(1, cpuTotal)) * 100);
          const memPct = Math.round((memAllocated / Math.max(1, memTotal)) * 100);
          const kindLabel = isLarge ? 'GPU · 32 vCPU' : `${cpuTotal} vCPU · ${memTotal} GB`;

          const runningJobs = node.running_job_ids || [];

          return (
            <article className="node-card" key={node.id}>
              <div className="node-top">
                <div>
                  <h3>{node.name}</h3>
                  <span>{kindLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`node-status ${isUp ? '' : 'outage'}`}>
                    <span />
                    {isUp ? 'Online' : 'Outage'}
                  </span>
                  {mode === 'live' && (
                    <button
                      onClick={() => handleFailToggle(node.id, isUp)}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-xs transition"
                      title={isUp ? 'Simulate Outage' : 'Restore Node'}
                    >
                      {isUp ? <PowerOff className="w-2.5 h-2.5 text-rose-400" /> : <RotateCcw className="w-2.5 h-2.5 text-emerald-400" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="resource">
                <div>
                  <span>CPU ({cpuAllocated}/{cpuTotal})</span>
                  <b>{cpuPct}%</b>
                </div>
                <Progress value={isUp ? cpuPct : 0} color={!isUp ? 'orange' : cpuPct > 85 ? 'orange' : 'mint'} />
              </div>

              <div className="resource">
                <div>
                  <span>RAM ({memAllocated}/{memTotal} GB)</span>
                  <b>{memPct}%</b>
                </div>
                <Progress value={isUp ? memPct : 0} color={!isUp ? 'orange' : 'lavender'} />
              </div>

              <div className="job-tags">
                {runningJobs.length > 0 ? (
                  runningJobs.map((jid: string) => (
                    <button key={jid} onClick={() => setSelectedJobId(jid)}>
                      {jid}
                    </button>
                  ))
                ) : (
                  <span className="text-[10px] text-[#69837b] italic py-0.5">Idle</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
