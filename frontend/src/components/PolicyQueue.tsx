import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ListFilter, ChevronDown } from 'lucide-react';

export const PolicyQueue: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId } = useLabStore();

  const queueItems =
    mode === 'live'
      ? (liveState?.ready_queue || []).slice(0, 8).map((q) => ({
          id: q.id,
          role: q.role || 'ug',
          user_id: 'live',
          state: 'READY',
          isHigh: q.role === 'exam' || q.role === 'faculty',
        }))
      : (replayState?.ready_queue || []).slice(0, 8).map((jid) => {
          const job = replayState?.jobs?.[jid] || {};
          const role = job.role || 'ug';
          return {
            id: jid,
            role,
            user_id: job.user_id || 'u0',
            state: job.state ? job.state.toUpperCase() : 'READY',
            isHigh: role === 'exam' || role === 'faculty',
          };
        });

  const totalQueuedCount =
    mode === 'live'
      ? liveState?.ready_queue?.length || 0
      : replayState?.ready_queue?.length || 0;

  return (
    <section className="panel queue-panel flex flex-col justify-between">
      <div>
        <div className="section-heading">
          <div>
            <span className="section-kicker">Scheduler</span>
            <h2>Ready queue</h2>
          </div>
          <button className="icon-button" aria-label="Filter">
            <ListFilter />
          </button>
        </div>

        <div className="queue-list">
          {queueItems.length > 0 ? (
            queueItems.map((item) => (
              <button
                className="queue-item"
                key={item.id}
                onClick={() => setSelectedJobId(item.id)}
              >
                <span className={`priority ${item.isHigh ? 'high' : ''}`} />
                <span className="queue-job">
                  <b>{item.id}</b>
                  <small>
                    {item.role} · user {item.user_id}
                  </small>
                </span>
                <span
                  className={`queue-state ${
                    item.state === 'BLOCKED' || item.state === 'PREEMPTED'
                      ? 'blocked'
                      : ''
                  }`}
                >
                  {item.state}
                </span>
                <ChevronDown />
              </button>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-[#6e8c82] italic">
              Ready queue is clear — all jobs dispatched
            </div>
          )}
        </div>
      </div>

      <button
        className="view-all"
        onClick={() => {
          if (queueItems[0]) setSelectedJobId(queueItems[0].id);
        }}
      >
        <span>→</span>
        View all queued jobs ({totalQueuedCount})
      </button>
    </section>
  );
};
