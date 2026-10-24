import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { PowerOff, RotateCcw } from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../store/useFeedback';
import { nodeLabel } from '../lib/format';
import { BusyIcon, SectionHeading } from './ui';

function Progress({ value, color = 'mint', label }: { value: number; color?: string; label: string }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

interface NodeView {
  id: number;
  name: string;
  up: boolean;
  cpuTotal: number;
  cpuAllocated: number;
  memTotal: number;
  memAllocated: number;
  jobs: string[];
}

export const NodeGrid: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId } = useLabStore();
  const [busyNode, setBusyNode] = useState<number | null>(null);

  const nodes: NodeView[] =
    mode === 'live'
      ? (liveState?.nodes || []).map((n) => ({
          id: n.id,
          name: n.name,
          up: n.is_up,
          cpuTotal: n.cpu_total,
          cpuAllocated: n.cpu_allocated,
          memTotal: n.mem_total,
          memAllocated: n.mem_allocated,
          jobs: n.running_job_ids || [],
        }))
      : (replayState?.nodes || []).map((n) => ({
          id: n.id,
          name: n.name,
          up: n.up,
          cpuTotal: n.cpu_total,
          cpuAllocated: n.cpu_allocated,
          memTotal: n.mem_total,
          memAllocated: n.mem_allocated,
          jobs: n.running_job_ids || [],
        }));

  const toggleNode = async (node: NodeView) => {
    setBusyNode(node.id);
    try {
      if (node.up) {
        await api.failLiveNode(node.id);
        toast.info(`${node.name} marked down`, node.jobs.length ? [`${node.jobs.length} running job(s) failed`] : undefined);
      } else {
        await api.restoreLiveNode(node.id);
        toast.success(`${node.name} restored`);
      }
    } catch (e) {
      toast.error(`Could not ${node.up ? 'fail' : 'restore'} ${node.name}`, e);
    } finally {
      setBusyNode(null);
    }
  };

  const onlineCount = nodes.filter((n) => n.up).length;

  return (
    <section className="panel nodes-panel" aria-labelledby="nodes-heading">
      <SectionHeading
        id="nodes-heading"
        kicker="Cluster topology"
        title="Node matrix"
        actions={
          <span className="live-status">
            <span className="status-dot" />
            {onlineCount} of {nodes.length} online
          </span>
        }
      />

      <div className="nodes-grid">
        {nodes.length === 0 &&
          Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}
        {nodes.map((node) => {
          const cpuPct = Math.round((node.cpuAllocated / Math.max(1, node.cpuTotal)) * 100);
          const memPct = Math.round((node.memAllocated / Math.max(1, node.memTotal)) * 100);
          return (
            <article className="node-card" key={node.id} aria-label={`${node.name}, ${node.up ? 'online' : 'down'}`}>
              <div className="node-top">
                <div>
                  <h3>{node.name}</h3>
                  <span>{nodeLabel(node.cpuTotal, node.memTotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`node-status ${node.up ? '' : 'outage'}`}>
                    <span />
                    {node.up ? 'Online' : 'Outage'}
                  </span>
                  {mode === 'live' && (
                    <button
                      onClick={() => toggleNode(node)}
                      disabled={busyNode === node.id}
                      className="icon-button"
                      style={{ width: 28, height: 28 }}
                      aria-label={node.up ? `Fail ${node.name} (kills its running jobs)` : `Restore ${node.name}`}
                      title={node.up ? 'Simulate outage' : 'Restore node'}
                    >
                      <BusyIcon busy={busyNode === node.id} icon={node.up ? <PowerOff /> : <RotateCcw />} />
                    </button>
                  )}
                </div>
              </div>

              <div className="resource">
                <div>
                  <span>
                    CPU {node.cpuAllocated}/{node.cpuTotal}
                  </span>
                  <b>{cpuPct}%</b>
                </div>
                <Progress label={`${node.name} CPU allocated`} value={node.up ? cpuPct : 0} color={!node.up || cpuPct > 85 ? 'orange' : 'mint'} />
              </div>

              <div className="resource">
                <div>
                  <span>
                    RAM {node.memAllocated}/{node.memTotal} GB
                  </span>
                  <b>{memPct}%</b>
                </div>
                <Progress label={`${node.name} memory allocated`} value={node.up ? memPct : 0} color={!node.up ? 'orange' : 'lavender'} />
              </div>

              <div className="job-tags">
                {node.jobs.length > 0 ? (
                  node.jobs.map((jid) => (
                    <button key={jid} onClick={() => setSelectedJobId(jid)} aria-label={`Inspect job ${jid}`}>
                      {jid}
                    </button>
                  ))
                ) : (
                  <span className="text-[11px] py-0.5" style={{ color: 'var(--faint)' }}>
                    {node.up ? 'Idle' : 'Down'}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
