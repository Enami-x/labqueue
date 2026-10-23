import React, { useMemo } from 'react';
import { useLabStore } from '../store/useLabStore';

interface GanttInterval {
  nodeId: number;
  nodeName: string;
  jobId: string;
  role: string;
  start: number;
  end: number;
}

export const GanttChart: React.FC = () => {
  const { runResult, cluster, maxScrubberTime, setSelectedJobId } = useLabStore();

  const maxT = maxScrubberTime || 100;

  // Compute execution intervals per node
  const intervalsByNode = useMemo(() => {
    const nodes = cluster?.nodes || [];
    const map: Record<number, GanttInterval[]> = {};
    for (const n of nodes) {
      map[n.id] = [];
    }

    if (!runResult?.events) return map;

    const activeStarts: Record<string, { start: number; nodeId: number }> = {};
    const roles: Record<string, string> = {};

    for (const ev of runResult.events) {
      const anyEv = ev as any;
      const jid = anyEv.job_id || anyEv.details?.job_id;
      if (!jid) continue;

      if (anyEv.role || anyEv.details?.role) {
        roles[jid] = anyEv.role || anyEv.details?.role;
      }

      if (ev.type === 'JOB_STARTED' || ev.type === 'JOB_RESUMED') {
        const nid = anyEv.node_id ?? anyEv.details?.node_id;
        if (nid !== undefined && nid !== null) {
          activeStarts[jid] = { start: ev.t, nodeId: nid };
        }
      } else if (
        ev.type === 'JOB_FINISHED' ||
        ev.type === 'JOB_COMPLETED' ||
        ev.type === 'JOB_PREEMPTED' ||
        ev.type === 'JOB_KILLED'
      ) {
        const st = activeStarts[jid];
        if (st) {
          const node = nodes.find((n) => n.id === st.nodeId);
          if (node && map[st.nodeId]) {
            map[st.nodeId].push({
              nodeId: st.nodeId,
              nodeName: node.name,
              jobId: jid,
              role: roles[jid] || 'ug',
              start: st.start,
              end: Math.max(st.start + 1, ev.t),
            });
          }
          delete activeStarts[jid];
        }
      }
    }

    // Append any still running jobs up to maxT
    for (const [jid, st] of Object.entries(activeStarts)) {
      const node = nodes.find((n) => n.id === st.nodeId);
      if (node && map[st.nodeId]) {
        map[st.nodeId].push({
          nodeId: st.nodeId,
          nodeName: node.name,
          jobId: jid,
          role: roles[jid] || 'ug',
          start: st.start,
          end: maxT,
        });
      }
    }

    return map;
  }, [runResult, cluster, maxT]);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const timeTicks = [
    0,
    Math.round(maxT * 0.2),
    Math.round(maxT * 0.4),
    Math.round(maxT * 0.6),
    Math.round(maxT * 0.8),
    Math.round(maxT),
  ];

  const getTone = (role: string) => {
    switch (role) {
      case 'phd':
        return 'phd';
      case 'faculty':
        return 'faculty';
      case 'exam':
        return 'exam';
      case 'ug':
      default:
        return 'undergrad';
    }
  };

  const nodes = cluster?.nodes || [];

  return (
    <section className="panel gantt-panel">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Execution timeline</span>
          <h2>Gantt overview</h2>
        </div>
        <div className="legend">
          <span>
            <i className="legend-dot undergrad" />
            Undergrad
          </span>
          <span>
            <i className="legend-dot phd" />
            PhD
          </span>
          <span>
            <i className="legend-dot faculty" />
            Faculty
          </span>
          <span>
            <i className="legend-dot exam" />
            Exam
          </span>
        </div>
      </div>

      <div className="gantt">
        {/* Axis Ticks */}
        <div className="gantt-axis">
          <span />
          {timeTicks.map((t, idx) => (
            <span key={idx}>{formatTime(t)}</span>
          ))}
        </div>

        {/* Node Rows */}
        {nodes.map((node) => {
          const list = intervalsByNode[node.id] || [];
          return (
            <div className="gantt-row" key={node.id}>
              <span className="gantt-label">{node.name}</span>
              <div className="gantt-track">
                {list.map((item, idx) => {
                  const left = Math.min(100, Math.max(0, (item.start / maxT) * 100));
                  const width = Math.min(
                    100 - left,
                    Math.max(2, ((item.end - item.start) / maxT) * 100)
                  );
                  return (
                    <button
                      key={idx}
                      className={`gantt-bar ${getTone(item.role)}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      onClick={() => setSelectedJobId(item.jobId)}
                      title={`${item.jobId} (${item.role}): ${formatTime(item.start)} - ${formatTime(item.end)}`}
                    >
                      {item.jobId}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
