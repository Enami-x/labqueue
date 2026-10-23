import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { X } from 'lucide-react';

export const JobDrawer: React.FC = () => {
  const {
    selectedJobId,
    setSelectedJobId,
    replayState,
    runResult,
    cluster,
    scrubberTime,
  } = useLabStore();

  if (!selectedJobId) return null;

  // Find job data
  const replayJob = replayState?.jobs?.[selectedJobId];
  const workloadJob = (runResult as any)?.workload?.jobs?.find(
    (j: any) => j.id === selectedJobId
  );
  const job = replayJob || workloadJob || { id: selectedJobId };

  const role = job.role || 'ug';
  const roleName =
    role === 'faculty'
      ? 'Faculty research'
      : role === 'phd'
      ? 'PhD thesis'
      : role === 'exam'
      ? 'Exam practical'
      : 'Undergraduate assignment';

  const nodeName =
    job.node_id !== null && job.node_id !== undefined
      ? cluster?.nodes.find((n) => n.id === job.node_id)?.name || `Node ${job.node_id}`
      : 'In Queue';

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const elapsed = Math.max(0, scrubberTime - (job.arrival || 0));
  const cpuVal = `${job.cpu || 1} vCPU`;
  const memVal = `${job.mem || 2} GB RAM`;
  const gpuVal = `${job.pooled?.gpu || 0} GPU`;
  const ioVal = `${job.pooled?.io || 0} I/O slots`;

  const phases = job.phases || [
    { at: 0, hold: 10, request: { gpu: 1, lic: 0, io: 0 } },
    { at: 10, hold: 20, request: { gpu: 0, lic: 1, io: 1 } },
  ];

  return (
    <div
      className="drawer-backdrop"
      onClick={() => setSelectedJobId(null)}
      role="dialog"
      aria-modal="true"
    >
      <aside className="job-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="section-kicker">Job inspector</span>
            <h2>{job.id}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => setSelectedJobId(null)}
            aria-label="Close"
          >
            <X />
          </button>
        </div>

        <div className="drawer-status">
          <span className="status-dot" />
          <span>
            {job.state === 'running' ? 'Running on ' : 'Status: '}
            <b>{job.state === 'running' ? nodeName : job.state || 'Queued'}</b>
          </span>
          <span className="drawer-time">{formatTime(elapsed)} elapsed</span>
        </div>

        <div className="drawer-block">
          <span className="section-kicker">Owner</span>
          <div className="owner">
            <div className="owner-avatar">
              {role.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <b>{roleName}</b>
              <span>User: {job.user_id || 'u0'} · Priority boost active</span>
            </div>
          </div>
        </div>

        <div className="drawer-block">
          <span className="section-kicker">Resource claims</span>
          <div className="claim">
            <span>CPU</span>
            <b>{cpuVal}</b>
          </div>
          <div className="claim">
            <span>Memory</span>
            <b>{memVal}</b>
          </div>
          <div className="claim">
            <span>GPU Allocations</span>
            <b>{gpuVal}</b>
          </div>
          <div className="claim">
            <span>Shared I/O</span>
            <b>{ioVal}</b>
          </div>
        </div>

        <div className="drawer-block">
          <span className="section-kicker">Execution phases</span>
          {phases.map((phase: any, idx: number) => {
            const isDone = elapsed >= phase.at + (phase.hold || 10);
            const isCurrent =
              elapsed >= phase.at && elapsed < phase.at + (phase.hold || 10);

            return (
              <div
                key={idx}
                className={`phase ${isDone ? 'done' : isCurrent ? 'current' : ''}`}
              >
                <span>{`0${idx + 1}`}</span>
                <div>
                  <b>Phase {idx + 1} Resource Request</b>
                  <small>
                    {isDone
                      ? 'completed'
                      : isCurrent
                      ? `active · ${formatTime(elapsed - phase.at)} elapsed`
                      : `waiting on phase ${idx}`}
                  </small>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="drawer-action"
          onClick={() => setSelectedJobId(null)}
        >
          <span>→</span>
          Close inspector
        </button>
      </aside>
    </div>
  );
};
