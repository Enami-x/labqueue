import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Activity, Search } from 'lucide-react';

export const EventFeed: React.FC = () => {
  const { replayState, liveState, mode, setSelectedJobId } = useLabStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const rawEvents = replayState?.recent_events || [];

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTone = (type: string) => {
    switch (type) {
      case 'JOB_STARTED':
      case 'JOB_RESUMED':
        return 'blue';
      case 'JOB_ARRIVED':
      case 'JOB_SUBMITTED':
        return 'violet';
      case 'PHASE_GRANTED':
      case 'JOB_FINISHED':
      case 'JOB_COMPLETED':
        return 'green';
      case 'BANKER_DENIED':
      case 'DEADLOCK_DETECTED':
        return 'orange';
      case 'NODE_FAILED':
      case 'JOB_PREEMPTED':
      case 'JOB_KILLED':
        return 'red';
      default:
        return 'blue';
    }
  };

  const formatDetail = (ev: any) => {
    const jid = ev.job_id || ev.details?.job_id;
    switch (ev.type) {
      case 'JOB_ARRIVED':
        return `${jid} entered ready queue (${ev.role || 'assignment'})`;
      case 'JOB_STARTED':
      case 'JOB_RESUMED':
        return `${jid} dispatched to node ${ev.node_id ?? ev.details?.node_id ?? 0}`;
      case 'JOB_FINISHED':
        return `${jid} completed · turnaround ${ev.turnaround ?? 0}s`;
      case 'JOB_PREEMPTED':
        return `${jid} preempted: ${ev.reason || 'quantum expired'}`;
      case 'PHASE_GRANTED':
        return `${jid} acquired pooled resources`;
      case 'PHASE_RELEASED':
        return `${jid} released pooled resources`;
      case 'DEADLOCK_DETECTED':
        return `Victim ${ev.victim || ev.details?.victim || jid} flagged for recovery`;
      case 'NODE_FAILED':
        return `Node ${ev.node_id ?? ev.details?.node_id} experienced hardware outage`;
      default:
        return JSON.stringify(ev.details || {});
    }
  };

  const filteredEvents = rawEvents.filter((ev: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const type = (ev.type || '').toLowerCase();
    const jid = (ev.job_id || ev.details?.job_id || '').toLowerCase();
    return type.includes(term) || jid.includes(term);
  });

  return (
    <section className="panel event-panel">
      <div className="section-heading">
        <div>
          <span className="section-kicker">System activity</span>
          <h2>Event feed</h2>
        </div>
        <div className="feed-actions">
          <span className="live-status">
            <span className="status-dot" />
            Streaming
          </span>
          <button
            className="ghost-button"
            onClick={() => setShowSearch(!showSearch)}
          >
            <Search /> Search
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="px-5 pb-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter events by type or job ID..."
            className="w-full px-3 py-1.5 rounded-lg bg-black/20 border border-[rgba(220,237,227,0.12)] text-xs text-[#f5f4ed] focus:outline-none focus:border-[#b6f3cf]"
          />
        </div>
      )}

      <div className="events">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((ev: any, idx: number) => {
            const timeStr = formatTime(ev.t ?? 0);
            const tone = getTone(ev.type);
            const detailStr = formatDetail(ev);
            const jid = ev.job_id || ev.details?.job_id;

            return (
              <div
                className="event-row cursor-pointer hover:bg-white/[0.02] transition"
                key={idx}
                onClick={() => {
                  if (jid) setSelectedJobId(jid);
                }}
              >
                <span className="event-time">{timeStr}</span>
                <span className={`event-icon ${tone}`}>
                  <Activity />
                </span>
                <span className="event-copy">
                  <b>{ev.type}</b>
                  <span>{detailStr}</span>
                </span>
                <span className="event-arrow">↗</span>
              </div>
            );
          })
        ) : (
          <div className="py-8 text-center text-xs text-[#6e8c82] italic">
            No events recorded yet for this window
          </div>
        )}
      </div>
    </section>
  );
};
