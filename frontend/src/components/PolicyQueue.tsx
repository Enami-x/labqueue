import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { ChevronDown, Inbox } from 'lucide-react';
import { ROLE_LABEL } from '../lib/format';
import { EmptyState, SectionHeading } from './ui';

const COLLAPSED = 8;

export const PolicyQueue: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId } = useLabStore();
  const [expanded, setExpanded] = useState(false);

  const all =
    mode === 'live'
      ? (liveState?.ready_queue || []).map((q) => ({
          id: q.id,
          role: q.role,
          user: q.user_id,
          state: q.suspended ? 'SUSPENDED' : 'READY',
        }))
      : (replayState?.ready_queue || []).map((jid) => {
          const job = replayState?.jobs?.[jid] || {};
          return {
            id: jid,
            role: job.role || 'ug',
            user: job.user_id || '?',
            state: String(job.state || 'queued').toUpperCase(),
          };
        });

  const items = expanded ? all : all.slice(0, COLLAPSED);
  const policy = mode === 'live' ? liveState?.policy?.scheduler : null;

  return (
    <section className="panel queue-panel flex flex-col justify-between" aria-labelledby="queue-heading">
      <div>
        <SectionHeading
          id="queue-heading"
          kicker={policy ? `Scheduler · ${policy} order` : 'Scheduler · dispatch order'}
          title="Ready queue"
          actions={<span className="chip neutral">{all.length} waiting</span>}
        />

        <div className="queue-list" style={expanded ? { maxHeight: 520, overflowY: 'auto' } : undefined}>
          {items.length > 0 ? (
            items.map((item) => {
              const high = item.role === 'exam' || item.role === 'faculty' || item.role === 'demo';
              const waiting = item.state === 'BLOCKED' || item.state === 'PREEMPTED' || item.state === 'SUSPENDED';
              return (
                <button className="queue-item" key={item.id} onClick={() => setSelectedJobId(item.id)} aria-label={`Inspect ${item.id}`}>
                  <span className={`priority ${high ? 'high' : ''}`} aria-hidden="true" />
                  <span className="queue-job">
                    <b>{item.id}</b>
                    <small>
                      {ROLE_LABEL[item.role] ?? item.role} · user {item.user}
                    </small>
                  </span>
                  <span className={`queue-state ${waiting ? 'blocked' : ''}`}>{item.state}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
              );
            })
          ) : (
            <EmptyState icon={<Inbox />}>Queue is empty: every arrived job has been dispatched.</EmptyState>
          )}
        </div>
      </div>

      {all.length > COLLAPSED && (
        <button className="view-all" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
          {expanded ? 'Show fewer' : `Show all ${all.length} queued jobs`}
        </button>
      )}
    </section>
  );
};
