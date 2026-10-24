import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { fmtDuration, fmtPct, fmtSimClock, unitOf } from '../lib/format';

interface MetricProps {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'positive' | 'warning';
}

const Metric: React.FC<MetricProps> = ({ label, value, detail, tone = 'default' }) => (
  <div className="metric-card">
    <div className="metric-label">{label}</div>
    <div className={`metric-value ${tone}`}>{value}</div>
    <div className="metric-detail">{detail}</div>
  </div>
);

const LiveKpis: React.FC = () => {
  const liveState = useLabStore((s) => s.liveState);
  if (!liveState) {
    return (
      <section className="metrics-grid" aria-label="Live metrics">
        <Metric label="Live runner" value="—" detail="waiting for the first snapshot" />
      </section>
    );
  }
  const c = liveState.counts;
  const up = liveState.nodes.filter((n) => n.is_up).length;
  const safe = liveState.banker.safe;
  return (
    <section className="metrics-grid" aria-label="Live metrics">
      <Metric label="Running" value={String(c.running)} detail="OS processes on nodes" tone="positive" />
      <Metric label="Ready" value={String(c.ready)} detail="waiting to dispatch" />
      <Metric label="Suspended" value={String(c.suspended)} detail="preempted (SIGSTOP)" tone={c.suspended ? 'warning' : 'default'} />
      <Metric label="Completed" value={String(c.completed)} detail={`of ${c.total} submitted`} />
      <Metric label="Failed / killed" value={String(c.failed)} detail="non-zero exit or killed" tone={c.failed ? 'warning' : 'default'} />
      <Metric label="Nodes up" value={`${up} / ${liveState.nodes.length}`} detail="cluster health" tone={up < liveState.nodes.length ? 'warning' : 'default'} />
      <Metric label="Banker state" value={safe ? 'Safe' : 'Unsafe'} detail={`${liveState.banker.mode} mode`} tone={safe ? 'positive' : 'warning'} />
      <Metric label="Session time" value={fmtDuration(liveState.elapsed_seconds, 's', 0)} detail={liveState.profile} />
    </section>
  );
};

const SimKpis: React.FC = () => {
  const { runResult, replayState } = useLabStore();
  const m = runResult?.metrics;
  const unit = unitOf(runResult);
  if (!m) {
    return (
      <section className="metrics-grid" aria-label="Run metrics" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="metric-card" key={i}>
            <div className="skeleton" style={{ height: 12, width: '60%' }} />
            <div className="skeleton" style={{ height: 22, width: '50%' }} />
            <div className="skeleton" style={{ height: 10, width: '70%' }} />
          </div>
        ))}
      </section>
    );
  }
  const completed = replayState?.completed_jobs?.length ?? m.jobs_completed;
  return (
    <section className="metrics-grid" aria-label="Run metrics">
      <Metric label="Jobs completed" value={String(completed)} detail={`of ${m.total_jobs} total`} />
      <Metric label="Average wait" value={fmtDuration(m.avg_wait, unit)} detail="arrival → first start" tone="positive" />
      <Metric label="P99 wait" value={fmtDuration(m.p99_wait, unit)} detail="99th percentile" />
      <Metric label="Fairness index" value={m.jains_fairness.toFixed(2)} detail="Jain's index (1 = fair)" tone="positive" />
      <Metric label="CPU utilization" value={fmtPct(m.cpu_util_avg, 1)} detail="over the makespan" />
      <Metric
        label="Makespan"
        value={fmtDuration(m.makespan, unit, 0)}
        detail={unit === 'min' ? `ends ${fmtSimClock(m.makespan)}` : 'session length'}
      />
      <Metric label="Deadlocks" value={String(m.deadlocks_detected)} detail="detected and recovered" tone={m.deadlocks_detected ? 'warning' : 'default'} />
      <Metric label="Banker denials" value={String(m.banker_denials)} detail="unsafe requests refused" tone={m.banker_denials ? 'warning' : 'default'} />
    </section>
  );
};

export const KpiStrip: React.FC = () => {
  const mode = useLabStore((s) => s.mode);
  return mode === 'live' ? <LiveKpis /> : <SimKpis />;
};
