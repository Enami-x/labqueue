import React, { useMemo, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { BarChart2, Info } from 'lucide-react';

interface GanttInterval {
  jobId: string;
  nodeId: number;
  start: number;
  end: number;
  role: string;
  kind: string;
}

export const GanttChart: React.FC = () => {
  const { runResult, cluster, scrubberTime, maxScrubberTime, setSelectedJobId, setScrubberTime } =
    useLabStore();

  const [hoveredJob, setHoveredJob] = useState<GanttInterval | null>(null);

  // Parse events into node intervals
  const { intervals, nodesList } = useMemo(() => {
    if (!runResult || !cluster) {
      return { intervals: [], nodesList: [] };
    }

    const intervals: GanttInterval[] = [];
    const activeRuns = new Map<string, { start: number; nodeId: number; role: string; kind: string }>();

    for (const evt of runResult.events) {
      const jid = evt.job_id || evt.details?.job_id;
      if (!jid) continue;

      if (evt.type === 'JOB_DISPATCHED' || evt.type === 'JOB_STARTED') {
        const nid = evt.details?.node_id ?? evt.node_id ?? 0;
        const role = evt.details?.role || 'ug';
        const kind = evt.details?.kind || 'training';
        activeRuns.set(jid, { start: evt.t, nodeId: nid, role, kind });
      } else if (
        evt.type === 'JOB_COMPLETED' ||
        evt.type === 'JOB_FINISHED' ||
        evt.type === 'JOB_PREEMPTED' ||
        evt.type === 'JOB_FAILED' ||
        evt.type === 'JOB_KILLED'
      ) {
        const current = activeRuns.get(jid);
        if (current) {
          intervals.push({
            jobId: jid,
            nodeId: current.nodeId,
            start: current.start,
            end: evt.t,
            role: current.role,
            kind: current.kind,
          });
          activeRuns.delete(jid);
        }
      }
    }

    // Close any still running at end of sim
    for (const [jid, current] of activeRuns.entries()) {
      intervals.push({
        jobId: jid,
        nodeId: current.nodeId,
        start: current.start,
        end: runResult.metrics.makespan || maxScrubberTime,
        role: current.role,
        kind: current.kind,
      });
    }

    return { intervals, nodesList: cluster.nodes };
  }, [runResult, cluster, maxScrubberTime]);

  if (!runResult || !cluster) return null;

  const totalTime = Math.max(1, runResult.metrics.makespan || maxScrubberTime);
  const rowHeight = 32;
  const chartHeight = nodesList.length * rowHeight;

  const getRoleFill = (role: string) => {
    switch (role) {
      case 'faculty':
        return 'fill-purple-500/80 stroke-purple-400';
      case 'phd':
        return 'fill-indigo-500/80 stroke-indigo-400';
      case 'exam':
        return 'fill-cr-rose/80 stroke-cr-rose';
      case 'demo':
        return 'fill-cr-amber/80 stroke-cr-amber';
      case 'ug':
      default:
        return 'fill-cr-cyan/80 stroke-cr-cyan';
    }
  };

  const playheadX = `${(scrubberTime / totalTime) * 100}%`;

  return (
    <div className="bg-cr-surface border border-cr-border rounded-xl p-4 shadow-lg flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-cr-border mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-cr-cyan" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Cluster Gantt Timeline & Allocation Tracks
          </h2>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Click bar to inspect job • Click timeline to seek
        </div>
      </div>

      <div className="relative overflow-x-auto select-none">
        <div className="min-w-[650px] flex flex-col">
          {/* Main SVG Gantt area */}
          <div className="flex">
            {/* Y-axis Labels */}
            <div className="w-24 shrink-0 flex flex-col border-r border-cr-border pr-2 font-mono text-[11px] text-slate-400">
              {nodesList.map((node) => (
                <div
                  key={node.id}
                  style={{ height: `${rowHeight}px` }}
                  className="flex items-center justify-end font-semibold truncate"
                >
                  {node.name}
                </div>
              ))}
            </div>

            {/* SVG Tracks */}
            <div
              className="relative flex-1 cursor-crosshair"
              style={{ height: `${chartHeight}px` }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                setScrubberTime(ratio * totalTime);
              }}
            >
              <svg className="w-full h-full">
                {/* Horizontal grid rows */}
                {nodesList.map((_, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    y1={idx * rowHeight}
                    x2="100%"
                    y2={idx * rowHeight}
                    stroke="#1f2b45"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                ))}

                {/* Job intervals */}
                {intervals.map((item, idx) => {
                  const nodeIdx = nodesList.findIndex((n) => n.id === item.nodeId);
                  if (nodeIdx < 0) return null;

                  const xPct = (item.start / totalTime) * 100;
                  const wPct = Math.max(0.4, ((item.end - item.start) / totalTime) * 100);
                  const y = nodeIdx * rowHeight + 5;
                  const h = rowHeight - 10;

                  return (
                    <rect
                      key={`${item.jobId}-${idx}`}
                      x={`${xPct}%`}
                      y={y}
                      width={`${wPct}%`}
                      height={h}
                      rx={3}
                      className={`cursor-pointer transition-opacity duration-150 ${getRoleFill(
                        item.role
                      )} hover:opacity-100 opacity-85`}
                      strokeWidth="1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedJobId(item.jobId);
                      }}
                      onMouseEnter={() => setHoveredJob(item)}
                      onMouseLeave={() => setHoveredJob(null)}
                    />
                  );
                })}
              </svg>

              {/* Red playhead tracking line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cr-rose shadow-glow-rose pointer-events-none z-10"
                style={{ left: playheadX }}
              >
                <div className="w-2.5 h-2.5 -ml-1 bg-cr-rose rounded-full cr-glow-rose" />
              </div>
            </div>
          </div>

          {/* Time axis ticks */}
          <div className="flex ml-24 mt-2 border-t border-cr-border pt-1 font-mono text-[10px] text-slate-500 justify-between">
            <span>T=0m</span>
            <span>T={(totalTime * 0.25).toFixed(0)}m</span>
            <span>T={(totalTime * 0.5).toFixed(0)}m</span>
            <span>T={(totalTime * 0.75).toFixed(0)}m</span>
            <span>T={totalTime.toFixed(0)}m (Makespan)</span>
          </div>
        </div>
      </div>

      {/* Tooltip on hover */}
      {hoveredJob && (
        <div className="mt-2.5 p-2 bg-cr-card border border-cr-border rounded-lg text-xs font-mono flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white">{hoveredJob.jobId}</span>
            <span className="text-slate-400">Role: <b className="text-cr-cyan">{hoveredJob.role}</b></span>
            <span className="text-slate-400">Kind: <b className="text-slate-200">{hoveredJob.kind}</b></span>
            <span className="text-slate-400">
              Run: <b>{hoveredJob.start}m</b> → <b>{hoveredJob.end}m</b> ({hoveredJob.end - hoveredJob.start}m)
            </span>
          </div>
          <span className="text-[11px] text-cr-cyan italic">Click bar to open detailed job inspect drawer</span>
        </div>
      )}
    </div>
  );
};
