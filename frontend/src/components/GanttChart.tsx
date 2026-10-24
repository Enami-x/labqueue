import React, { useMemo } from 'react';
import { useLabStore } from '../store/useLabStore';
import { SimEvent } from '../types';
import { fmtT, ROLE_LABEL, ROLE_TONE, TimeUnit, unitOf } from '../lib/format';
import { SectionHeading } from './ui';

interface GanttInterval {
  nodeId: number;
  jobId: string;
  role: string;
  start: number;
  end: number;
  open: boolean;
}

const STARTS = new Set(['JOB_STARTED', 'JOB_RESUMED', 'JOB_DISPATCHED']);
const ENDS = new Set(['JOB_FINISHED', 'JOB_COMPLETED', 'JOB_PREEMPTED', 'JOB_KILLED', 'JOB_FAILED']);
const LIVE_WINDOW_S = 120;

/** Live events nest their payload under `details`; flatten so both shapes read alike. */
const flat = (e: SimEvent): any => (e.details ? { ...e.details, ...e } : e);

function buildIntervals(events: SimEvent[], until: number, roleHint: Record<string, string> = {}) {
  const open: Record<string, { start: number; nodeId: number }> = {};
  const roles: Record<string, string> = { ...roleHint };
  const out: GanttInterval[] = [];
  for (const raw of events) {
    const ev = flat(raw);
    const jid = ev.job_id;
    if (!jid) continue;
    if (ev.role) roles[jid] = ev.role;
    if (STARTS.has(ev.type) && ev.node_id !== undefined && ev.node_id !== null) {
      open[jid] = { start: ev.t, nodeId: ev.node_id };
    } else if (ENDS.has(ev.type) && open[jid]) {
      const st = open[jid];
      out.push({ nodeId: st.nodeId, jobId: jid, role: roles[jid] || 'ug', start: st.start, end: Math.max(st.start, ev.t), open: false });
      delete open[jid];
    }
  }
  for (const [jid, st] of Object.entries(open)) {
    out.push({ nodeId: st.nodeId, jobId: jid, role: roles[jid] || 'ug', start: st.start, end: until, open: true });
  }
  return out;
}

const LEGEND: [string, string][] = [
  ['undergrad', 'Undergrad / guest'],
  ['phd', 'PhD'],
  ['faculty', 'Faculty'],
  ['exam', 'Exam / demo'],
];

export const GanttChart: React.FC = () => {
  const { runResult, cluster, maxScrubberTime, setSelectedJobId, mode, liveEvents, liveState } = useLabStore();
  const live = mode === 'live';
  const unit: TimeUnit = live ? 's' : unitOf(runResult);

  const { t0, t1, intervals } = useMemo(() => {
    if (live) {
      const now = liveState?.elapsed_seconds ?? 0;
      const from = Math.max(0, now - LIVE_WINDOW_S);
      const hint: Record<string, string> = {};
      for (const j of liveState?.running_jobs || []) hint[j.id] = j.role;
      const ivs = buildIntervals(liveEvents, now, hint).filter((iv) => iv.end >= from);
      return { t0: from, t1: Math.max(from + 10, now), intervals: ivs };
    }
    const maxT = maxScrubberTime || 100;
    return { t0: 0, t1: maxT, intervals: buildIntervals(runResult?.events || [], maxT) };
  }, [live, liveEvents, liveState?.elapsed_seconds, runResult, maxScrubberTime]);

  const span = Math.max(1, t1 - t0);
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => t0 + f * span);
  const nodes = cluster?.nodes || [];

  return (
    <section className="panel gantt-panel" aria-labelledby="gantt-heading">
      <SectionHeading
        id="gantt-heading"
        kicker={live ? `Execution timeline · last ${LIVE_WINDOW_S}s` : 'Execution timeline'}
        title="Gantt overview"
        actions={
          <div className="legend" aria-label="Legend">
            {LEGEND.map(([tone, label]) => (
              <span key={tone}>
                <i className={`legend-dot ${tone}`} />
                {label}
              </span>
            ))}
          </div>
        }
      />

      <div className="gantt" role="img" aria-label={`Gantt chart of ${intervals.length} execution slices across ${nodes.length} nodes`}>
        <div className="gantt-axis" aria-hidden="true">
          <span />
          {ticks.map((t, idx) => (
            <span key={idx}>{fmtT(t, unit)}</span>
          ))}
        </div>

        {nodes.map((node) => (
          <div className="gantt-row" key={node.id}>
            <span className="gantt-label">{node.name}</span>
            <div className="gantt-track">
              {intervals
                .filter((iv) => iv.nodeId === node.id)
                .map((item, idx) => {
                  const left = Math.min(100, Math.max(0, ((item.start - t0) / span) * 100));
                  const width = Math.min(100 - left, Math.max(1.2, ((item.end - Math.max(item.start, t0)) / span) * 100));
                  return (
                    <button
                      key={idx}
                      className={`gantt-bar ${ROLE_TONE[item.role] ?? 'undergrad'}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      onClick={() => setSelectedJobId(item.jobId)}
                      title={`${item.jobId} (${ROLE_LABEL[item.role] ?? item.role}): ${fmtT(item.start, unit)} – ${item.open ? 'running' : fmtT(item.end, unit)}`}
                      aria-label={`${item.jobId}, ${ROLE_LABEL[item.role] ?? item.role}, on ${node.name} from ${fmtT(item.start, unit)}`}
                    >
                      {item.jobId}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        {live && intervals.length === 0 && (
          <p className="help" style={{ padding: '8px 0 0 74px' }}>
            No processes in the last {LIVE_WINDOW_S} seconds. Submit a job from the Live Console.
          </p>
        )}
      </div>
    </section>
  );
};
