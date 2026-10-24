import React, { useEffect, useMemo, useRef } from 'react';
import { useLabStore } from '../store/useLabStore';
import { X } from 'lucide-react';
import { PooledResources } from '../types';
import { fmtDuration, fmtT, ROLE_LABEL, TimeUnit, unitOf } from '../lib/format';

const flat = (e: any) => (e.details ? { ...e.details, ...e } : e);
const res = (r?: PooledResources | null) => (r ? `${r.gpu} GPU · ${r.lic} lic · ${r.io} I/O` : '—');

export const JobDrawer: React.FC = () => {
  const { selectedJobId, setSelectedJobId, replayState, runResult, cluster, scrubberTime, mode, liveState, liveEvents } =
    useLabStore();
  const closeRef = useRef<HTMLButtonElement>(null);
  const live = mode === 'live';
  const unit: TimeUnit = live ? 's' : unitOf(runResult);

  useEffect(() => {
    if (!selectedJobId) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedJobId(null);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [selectedJobId]);

  const history = useMemo(() => {
    if (!selectedJobId) return [];
    const source = live ? liveEvents : (runResult?.events || []).filter((e) => e.t <= scrubberTime);
    return source.map(flat).filter((e) => e.job_id === selectedJobId).slice(-20).reverse();
  }, [selectedJobId, live, liveEvents, runResult, scrubberTime]);

  if (!selectedJobId) return null;

  // Assemble what we know about the job from the active source.
  let info: Record<string, any> = { id: selectedJobId };
  if (live) {
    const running = liveState?.running_jobs.find((j) => j.id === selectedJobId);
    const queued = liveState?.ready_queue.find((j) => j.id === selectedJobId);
    const submitted = liveEvents.map(flat).find((e) => e.job_id === selectedJobId && e.type === 'JOB_SUBMITTED');
    info = {
      ...info,
      ...(submitted || {}),
      ...(queued || {}),
      ...(running || {}),
      state: running ? 'running' : queued ? (queued.suspended ? 'suspended' : 'queued') : history[0]?.type?.replace('JOB_', '').toLowerCase() || 'unknown',
      max_claim: running?.pooled ?? queued?.pooled ?? submitted?.pooled,
    };
  } else {
    const replayJob = replayState?.jobs?.[selectedJobId] || {};
    const declared = runResult?.workload?.jobs?.find((j) => j.id === selectedJobId);
    info = { ...info, ...(declared || {}), ...replayJob, max_claim: declared?.max_claim ?? replayJob.pooled };
  }

  const nodeName =
    info.node_id !== null && info.node_id !== undefined
      ? cluster?.nodes.find((n) => n.id === info.node_id)?.name || `node ${info.node_id}`
      : null;
  const phases: { at: number; request: PooledResources }[] = info.phases || [];

  return (
    <div className="drawer-backdrop" onClick={() => setSelectedJobId(null)}>
      <aside
        className="job-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <span className="section-kicker">Job inspector</span>
            <h2 id="drawer-title">{info.id}</h2>
          </div>
          <button ref={closeRef} className="icon-button" onClick={() => setSelectedJobId(null)} aria-label="Close job inspector">
            <X />
          </button>
        </div>

        <div className="drawer-status">
          <span className="status-dot" />
          <span>
            Status: <b>{info.state ?? 'unknown'}</b>
            {info.state === 'running' && nodeName ? (
              <>
                {' '}
                on <b>{nodeName}</b>
              </>
            ) : null}
          </span>
          {!live && info.arrival !== undefined && <span className="drawer-time">arrived {fmtT(info.arrival, unit)}</span>}
        </div>

        <div className="drawer-block">
          <span className="section-kicker">Owner</span>
          <div className="owner">
            <div className="owner-avatar" aria-hidden="true">
              {String(info.role ?? '?').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <b>{ROLE_LABEL[info.role] ?? info.role ?? 'Unknown role'}</b>
              <span>
                user {info.user_id ?? '?'}
                {info.kind ? ` · ${info.kind}` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="drawer-block">
          <span className="section-kicker">Resource claims</span>
          <div className="claim">
            <span>CPU</span>
            <b>{info.cpu ?? '—'} vCPU</b>
          </div>
          <div className="claim">
            <span>Memory</span>
            <b>{info.mem ?? '—'} GB</b>
          </div>
          <div className="claim">
            <span>Pooled max claim</span>
            <b>{res(info.max_claim)}</b>
          </div>
          <div className="claim">
            <span>{live ? 'Duration' : 'Burst'}</span>
            <b>{fmtDuration(info.burst ?? info.duration, unit)}</b>
          </div>
          {info.deadline !== undefined && info.deadline !== null && (
            <div className="claim">
              <span>Deadline</span>
              <b>{fmtT(info.deadline, unit)}</b>
            </div>
          )}
          {live && info.remaining !== undefined && (
            <div className="claim">
              <span>Remaining</span>
              <b>{fmtDuration(info.remaining, 's')}</b>
            </div>
          )}
        </div>

        {phases.length > 0 && (
          <div className="drawer-block">
            <span className="section-kicker">Pooled-resource phases</span>
            {phases.map((ph, idx) => (
              <div key={idx} className="phase done">
                <span>{idx + 1}</span>
                <div>
                  <b>{res(ph.request)}</b>
                  <small style={{ display: 'block' }}>requested {fmtDuration(ph.at, unit)} into the run</small>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="drawer-block">
          <span className="section-kicker">History {live ? '' : 'up to the scrubber'}</span>
          {history.length === 0 ? (
            <p className="help" style={{ marginTop: 10 }}>
              No events for this job yet.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
              {history.map((e, i) => (
                <li key={i} className="claim">
                  <span className="mono">{fmtT(e.t, unit)}</span>
                  <b>{e.type}</b>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button className="drawer-action" onClick={() => setSelectedJobId(null)}>
          <span aria-hidden="true">→</span>
          Close inspector
        </button>
      </aside>
    </div>
  );
};
