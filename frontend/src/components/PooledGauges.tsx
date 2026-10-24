import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { SectionHeading } from './ui';

export const PooledGauges: React.FC = () => {
  const { cluster, replayState, liveState, mode } = useLabStore();

  const total = (mode === 'live' ? liveState?.pooled.total : cluster?.pooled) || { gpu: 0, lic: 0, io: 0 };
  const alloc =
    mode === 'live' && liveState
      ? {
          gpu: liveState.pooled.total.gpu - liveState.pooled.available.gpu,
          lic: liveState.pooled.total.lic - liveState.pooled.available.lic,
          io: liveState.pooled.total.io - liveState.pooled.available.io,
        }
      : replayState?.pooled?.allocated || { gpu: 0, lic: 0, io: 0 };

  const pct = (a: number, t: number) => (t > 0 ? Math.min(100, Math.round((a / t) * 100)) : 0);

  const gauges = [
    { key: 'gpu', label: 'GPU accelerators', a: alloc.gpu, t: total.gpu, color: 'mint' },
    { key: 'lic', label: 'Software licenses', a: alloc.lic, t: total.lic, color: 'lavender' },
    { key: 'io', label: 'Shared I/O slots', a: alloc.io, t: total.io, color: 'orange' },
  ];

  return (
    <section className="panel gauges-panel" aria-labelledby="gauges-heading">
      <SectionHeading id="gauges-heading" kicker="Shared resources" title="Pooled gauges" />
      <div className="gauge-list" style={{ paddingBottom: 22 }}>
        {gauges.map((g) => (
          <div className="gauge" key={g.key}>
            <div className="gauge-head">
              <span>{g.label}</span>
              <b>
                {g.a} / {g.t}
              </b>
            </div>
            <div
              className="gauge-bar"
              role="progressbar"
              aria-label={`${g.label} allocated`}
              aria-valuenow={g.a}
              aria-valuemin={0}
              aria-valuemax={g.t}
            >
              <div className={`gauge-fill ${g.color}`} style={{ width: `${pct(g.a, g.t)}%` }} />
            </div>
            <span className="gauge-caption">
              {pct(g.a, g.t)}% allocated · {g.t - g.a} free
            </span>
          </div>
        ))}
        <p className="help">
          GPUs, licenses and I/O slots are pooled across the cluster (not tied to a node) and are granted through the
          Banker's algorithm.
        </p>
      </div>
    </section>
  );
};
