import React from 'react';
import { useLabStore } from '../store/useLabStore';

interface MetricProps {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'positive' | 'warning';
}

const Metric: React.FC<MetricProps> = ({ label, value, detail, tone = 'default' }) => {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone}`}>{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
};

export const KpiStrip: React.FC = () => {
  const { runResult, liveState, replayState, mode } = useLabStore();

  const metrics = runResult?.metrics || {
    jobs_completed: 0,
    avg_wait: 0,
    p99_wait: 0,
    jain_fairness: 1,
    avg_cpu_util: 0,
    makespan: 0,
    deadlocks_detected: 0,
    banker_denials: 0,
    total_jobs: 50,
  };

  const totalJobs = (runResult as any)?.workload?.jobs?.length || metrics.total_jobs || 50;
  const completedJobsCount =
    mode === 'live'
      ? liveState?.counts?.completed ?? metrics.jobs_completed ?? 0
      : replayState?.completed_jobs?.length ?? metrics.jobs_completed ?? 0;

  const formatMakespan = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const anyMetrics = metrics as any;
  const p99 = metrics.p99_wait ?? anyMetrics.p95_wait ?? 0;
  const jain = anyMetrics.jains_fairness ?? anyMetrics.jain_fairness ?? anyMetrics.jain_index ?? 0.95;
  const rawCpu = anyMetrics.cpu_util_avg ?? anyMetrics.avg_cpu_util ?? 0;
  const cpuUtilPct =
    rawCpu > 1
      ? rawCpu.toFixed(1)
      : (rawCpu * 100).toFixed(1);

  const deadlockCount = metrics.deadlocks_detected || 0;
  const denialsCount = metrics.banker_denials || 0;

  return (
    <section className="metrics-grid">
      <Metric
        label="Jobs completed"
        value={String(completedJobsCount)}
        detail={`of ${totalJobs} total`}
      />
      <Metric
        label="Average wait"
        value={`${Number(metrics.avg_wait || 0).toFixed(1)}s`}
        detail="scheduler metric"
        tone="positive"
      />
      <Metric
        label="P99 wait"
        value={`${Number(p99).toFixed(1)}s`}
        detail="latency ceiling"
      />
      <Metric
        label="Fairness index"
        value={Number(jain).toFixed(2)}
        detail="Jain's index"
        tone="positive"
      />
      <Metric
        label="CPU utilization"
        value={`${cpuUtilPct}%`}
        detail="across compute nodes"
      />
      <Metric
        label="Makespan"
        value={formatMakespan(metrics.makespan || 0)}
        detail="total duration"
      />
      <Metric
        label="Deadlocks"
        value={String(deadlockCount).padStart(2, '0')}
        detail="avoided by Banker"
        tone={deadlockCount > 0 ? 'warning' : 'default'}
      />
      <Metric
        label="Denials"
        value={String(denialsCount).padStart(2, '0')}
        detail="unsafe requests"
        tone={denialsCount > 0 ? 'warning' : 'default'}
      />
    </section>
  );
};
