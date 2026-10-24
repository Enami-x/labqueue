import React, { useMemo, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { NOISE_EVENTS } from '../engine/replayEngine';
import { Activity, ArrowRightLeft, Pause, Play, ShieldAlert, Server, CheckCircle2, XCircle, LogIn } from 'lucide-react';
import { fmtT, TimeUnit, unitOf } from '../lib/format';
import { EmptyState, Field, SectionHeading } from './ui';

const FILTERS = {
  dispatch: { label: 'Dispatch', types: ['JOB_STARTED', 'JOB_RESUMED', 'JOB_DISPATCHED'] },
  preempt: { label: 'Preempt', types: ['JOB_PREEMPTED'] },
  deadlock: {
    label: 'Deadlock / Banker',
    types: ['DEADLOCK_DETECTED', 'DEADLOCK_RECOVERED', 'REQUEST_DENIED_UNSAFE', 'BANKER_DENIED', 'PHASE_BLOCKED'],
  },
  policy: { label: 'Policy switch', types: ['PROFILE_SWITCHED'] },
} as const;
type FilterKey = keyof typeof FILTERS;

const flat = (e: any) => (e.details ? { ...e.details, ...e } : e);

function tone(type: string): { cls: string; icon: React.ReactNode } {
  switch (type) {
    case 'JOB_STARTED':
    case 'JOB_DISPATCHED':
      return { cls: 'blue', icon: <Play /> };
    case 'JOB_RESUMED':
      return { cls: 'blue', icon: <Play /> };
    case 'JOB_ARRIVED':
    case 'JOB_SUBMITTED':
      return { cls: 'violet', icon: <LogIn /> };
    case 'PHASE_GRANTED':
    case 'JOB_FINISHED':
    case 'JOB_COMPLETED':
    case 'DEADLOCK_RECOVERED':
    case 'NODE_UP':
    case 'NODE_RESTORED':
      return { cls: 'green', icon: <CheckCircle2 /> };
    case 'REQUEST_DENIED_UNSAFE':
    case 'BANKER_DENIED':
    case 'DEADLOCK_DETECTED':
    case 'PHASE_BLOCKED':
      return { cls: 'orange', icon: <ShieldAlert /> };
    case 'JOB_PREEMPTED':
      return { cls: 'orange', icon: <Pause /> };
    case 'NODE_DOWN':
    case 'NODE_FAILED':
      return { cls: 'red', icon: <Server /> };
    case 'JOB_KILLED':
    case 'JOB_FAILED':
      return { cls: 'red', icon: <XCircle /> };
    case 'PROFILE_SWITCHED':
      return { cls: 'violet', icon: <ArrowRightLeft /> };
    default:
      return { cls: 'blue', icon: <Activity /> };
  }
}

const res = (r: any) => (r ? `GPU ${r.gpu ?? 0} · lic ${r.lic ?? 0} · I/O ${r.io ?? 0}` : '');

function describe(ev: any, unit: TimeUnit, nodeNames: Record<number, string>): string {
  const jid = ev.job_id;
  const node = ev.node_name ?? (ev.node_id !== undefined && ev.node_id !== null ? nodeNames[ev.node_id] ?? `node ${ev.node_id}` : '');
  switch (ev.type) {
    case 'JOB_ARRIVED':
    case 'JOB_SUBMITTED':
      return `${jid} queued (${ev.role ?? 'job'}, ${ev.cpu ?? '?'} vCPU)`;
    case 'JOB_STARTED':
    case 'JOB_DISPATCHED':
      return `${jid} started on ${node}`;
    case 'JOB_RESUMED':
      return `${jid} resumed on ${node}`;
    case 'JOB_FINISHED':
      return `${jid} finished · turnaround ${ev.turnaround ?? '?'} ${unit}`;
    case 'JOB_COMPLETED':
      return `${jid} exited cleanly on ${node}`;
    case 'JOB_FAILED':
      return `${jid} failed${ev.reason ? `: ${ev.reason}` : ev.exit_code !== undefined ? ` (exit ${ev.exit_code})` : ''}`;
    case 'JOB_KILLED':
      return `${jid} killed: ${ev.reason ?? 'terminated'}`;
    case 'JOB_PREEMPTED':
      return `${jid} preempted: ${String(ev.reason ?? 'quantum expired').replace(/_/g, ' ')}`;
    case 'PHASE_REQUEST':
      return `${jid} requests ${res(ev.request)}`;
    case 'PHASE_GRANTED':
      return `${jid} granted ${res(ev.request)}`;
    case 'PHASE_BLOCKED':
      return `${jid} blocked: resources not available`;
    case 'REQUEST_DENIED_UNSAFE':
    case 'BANKER_DENIED':
      return `${jid} denied ${res(ev.request)}: granting would leave no safe sequence`;
    case 'DEADLOCK_DETECTED':
      return `Deadlock among ${(ev.jobs || []).join(', ') || 'blocked jobs'}`;
    case 'DEADLOCK_RECOVERED':
      return `Recovered by killing victim ${ev.victim}`;
    case 'NODE_DOWN':
    case 'NODE_FAILED':
      return `${nodeNames[ev.node_id] ?? `Node ${ev.node_id}`} went down`;
    case 'NODE_UP':
    case 'NODE_RESTORED':
      return `${nodeNames[ev.node_id] ?? `Node ${ev.node_id}`} is back up`;
    case 'PROFILE_SWITCHED':
      return ev.to
        ? `Policy ${ev.from} → ${ev.to} (${ev.reason === 'trigger' ? 'reactive rule' : ev.reason === 'calendar' ? 'calendar slot' : ev.reason})`
        : `Policy ${ev.old_profile} → ${ev.new_profile}`;
    case 'SESSION_STARTED':
      return `Session ${ev.session_id} started with ${ev.profile}`;
    case 'RUSH_INJECTED':
      return `Rush of ${ev.count} ${ev.role} jobs injected`;
    default:
      return ev.type.toLowerCase().replace(/_/g, ' ');
  }
}

export const EventFeed: React.FC = () => {
  const { replayState, liveEvents, mode, setSelectedJobId, runResult, cluster } = useLabStore();
  const nodeNames = useMemo(() => Object.fromEntries((cluster?.nodes || []).map((n) => [n.id, n.name])), [cluster]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const live = mode === 'live';
  const unit: TimeUnit = live ? 's' : unitOf(runResult);

  const events = useMemo(() => {
    const source = live ? [...liveEvents].reverse() : replayState?.recent_events || [];
    const allowed = active.size ? new Set(Array.from(active).flatMap((k) => FILTERS[k].types as readonly string[])) : null;
    const term = search.trim().toLowerCase();
    return source
      .map(flat)
      .filter((ev) => !NOISE_EVENTS.has(ev.type))
      .filter((ev) => !allowed || allowed.has(ev.type))
      .filter((ev) => !term || ev.type.toLowerCase().includes(term) || String(ev.job_id ?? '').toLowerCase().includes(term));
  }, [live, liveEvents, replayState, active, search]);

  const toggle = (k: FilterKey) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  return (
    <section className="panel event-panel" aria-labelledby="feed-heading">
      <SectionHeading
        id="feed-heading"
        kicker={live ? 'Live activity' : 'Replay activity up to the scrubber'}
        title="Event feed"
        actions={
          live ? (
            <span className="live-status">
              <span className="status-dot" />
              Streaming
            </span>
          ) : undefined
        }
      />

      <div className="feed-toolbar">
        <Field label={<span className="sr-only">Search events</span>} className="flex-1" >
          {(id) => (
            <input
              id={id}
              type="search"
              className="control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by event type or job ID"
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Event types">
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
            <button key={k} className="chip" aria-pressed={active.has(k)} onClick={() => toggle(k)}>
              {FILTERS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="events" tabIndex={0} aria-label="Events, newest first">
        {events.length > 0 ? (
          events.map((ev, idx) => {
            const t = tone(ev.type);
            return (
              <button
                className="event-row"
                key={`${ev.seq ?? idx}-${idx}`}
                onClick={() => ev.job_id && setSelectedJobId(ev.job_id)}
                disabled={!ev.job_id}
                style={{ cursor: ev.job_id ? 'pointer' : 'default' }}
              >
                <span className="event-time">{fmtT(ev.t, unit)}</span>
                <span className={`event-icon ${t.cls}`} aria-hidden="true">
                  {t.icon}
                </span>
                <span className="event-copy">
                  <b>{ev.type}</b>
                  <span>{describe(ev, unit, nodeNames)}</span>
                </span>
              </button>
            );
          })
        ) : (
          <EmptyState icon={<Activity />}>
            {search || active.size
              ? 'No events match these filters.'
              : live
                ? 'No live events yet. Submit a job from the Live Console.'
                : 'No events yet at this point in the replay. Press play or drag the scrubber.'}
          </EmptyState>
        )}
      </div>
    </section>
  );
};
