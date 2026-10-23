import React, { useMemo, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { BarChart2 } from 'lucide-react';

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

    for (const [jid, current] of activeRuns.entries()) {
      intervals.push({
        jobId: jid,
        nodeId: current.nodeId,
        start: current.start,
        end: runResult.metrics?.makespan || maxScrubberTime,
        role: current.role,
        kind: current.kind,
      });
    }

    return { intervals, nodesList: cluster.nodes };
  }, [runResult, cluster, maxScrubberTime]);

  if (!runResult || !cluster) return null;

  const totalTime = Math.max(1, runResult.metrics?.makespan || maxScrubberTime);
  const rowHeight = 34;
  const chartHeight = nodesList.length * rowHeight;

  const getRoleFill = (role: string) => {
    switch (role) {
      case 'faculty':
        return 'fill-purple-500/80 stroke-purple-400/60';
      case 'phd':
        return 'fill-indigo-500/80 stroke-indigo-400/60';
      case 'exam':
        return 'fill-rose-500/80 stroke-rose-400/60';
      case 'demo':
        return 'fill-amber-500/80 stroke-amber-400/60';
      case 'ug':
      default:
        return 'fill-sky-500/80 stroke-sky-400/60';
    }
  };

  const playheadX = `${Math.min(100, Math.max(0, (scrubberTime / totalTime) * 100))}%`;

  return (
    <div className="plume-card rounded-2xl p-5 flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/[0.08] mb-4 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Gantt Execution Timeline
            </h2>
            <p className="text-xs text-slate-400">
              Interactive timeline • Click to inspect jobs • Drag scrubber to replay
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-sky-500/80" /> Undergrad
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-indigo-500/80" /> PhD
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-purple-500/80" /> Faculty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500/80" /> Exam
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[650px] relative">
          <div className="flex">
            {/* Left Node Labels */}
            <div className="w-24 shrink-0 flex flex-col border-r border-white/[0.08] pr-2">
              {nodesList.map((node) => (
                <div
                  key={node.id}
                  style={{ height: `${rowHeight}px` }}
                  className="flex items-center text-xs font-mono text-slate-400 truncate"
                >
                  <span className="truncate">{node.name}</span>
                </div>
              ))}
            </div>

            {/* SVG Tracks */}
            <div
              className="relative flex-1 cursor-crosshair ml-2"
              style={{ height: `${chartHeight}px` }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                setScrubberTime(ratio * totalTime);
              }}
            >
              <svg className="w-full h-full">
                {/* Horizontal row dividers */}
                {nodesList.map((_, idx) => (
                  <line
                    key={idx}
                    x1="0"
                    y1={idx * rowHeight}
                    x2="100%"
                    y2={idx * rowHeight}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                ))}

                {/* Job intervals */}
                {intervals.map((item, idx) => {
                  const nodeIdx = nodesList.findIndex((n) => n.id === item.nodeId);
                  if (nodeIdx < 0) return null;

                  const xPct = (item.start / totalTime) * 100;
                  const wPct = Math.max(0.5, ((item.end - item.start) / totalTime) * 100);
                  const y = nodeIdx * rowHeight + 5;
                  const h = rowHeight - 10;

                  return (
                    <rect
                      key={`${item.jobId}-${idx}`}
                      x={`${xPct}%`}
                      y={y}
                      width={`${wPct}%`}
                      height={h}
                      rx={5}
                      className={`cursor-pointer transition-opacity duration-150 ${getRoleFill(
                        item.role
                      )} hover:opacity-100 opacity-90`}
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

              {/* Playhead tracking line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-sky-400 pointer-events-none z-10 shadow-[0_0_10px_rgba(56,189,248,0.7)]"
                style={{ left: playheadX }}
              >
                <div className="w-3 h-3 -ml-1.5 -mt-1.5 bg-sky-400 rounded-full border-2 border-white shadow-md" />
              </div>
            </div>
          </div>

          {/* Time axis ticks */}
          <div className="flex ml-26 mt-3 border-t border-white/[0.08] pt-2 text-[11px] font-mono text-slate-500 justify-between">
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
        <div className="mt-3 p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-white">{hoveredJob.jobId}</span>
            <span className="text-slate-400">Role: <b className="text-sky-300">{hoveredJob.role}</b></span>
            <span className="text-slate-400">Kind: <b className="text-slate-200">{hoveredJob.kind}</b></span>
            <span className="text-slate-400">
              Run: <b>{hoveredJob.start}m</b> → <b>{hoveredJob.end}m</b> ({hoveredJob.end - hoveredJob.start}m)
            </span>
          </div>
          <span className="text-xs text-sky-400 italic">Click bar to inspect job details</span>
        </div>
      )}
    </div>
  );
};
