import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

export const PooledGauges: React.FC = () => {
  const { cluster, replayState, liveState, mode } = useLabStore();

  const totalPooled = cluster?.pooled || { gpu: 6, lic: 4, io: 5 };
  const allocPooled =
    mode === 'live' && liveState?.pooled
      ? {
          gpu: Math.max(0, liveState.pooled.total.gpu - liveState.pooled.available.gpu),
          lic: Math.max(0, liveState.pooled.total.lic - liveState.pooled.available.lic),
          io: Math.max(0, liveState.pooled.total.io - liveState.pooled.available.io),
        }
      : replayState?.pooled?.allocated || { gpu: 0, lic: 0, io: 0 };

  const bankerSafe =
    mode === 'live'
      ? liveState?.banker_safe_sequence !== null
      : replayState?.banker_safe ?? true;

  const getPercent = (alloc: number, total: number) => {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.round((alloc / total) * 100));
  };

  const gpuPct = getPercent(allocPooled.gpu, totalPooled.gpu);
  const licPct = getPercent(allocPooled.lic, totalPooled.lic);
  const ioPct = getPercent(allocPooled.io, totalPooled.io);

  const gauges = [
    {
      label: 'GPU accelerators',
      value: gpuPct,
      amount: `${allocPooled.gpu.toString().padStart(2, '0')} / ${totalPooled.gpu.toString().padStart(2, '0')}`,
      color: 'mint',
    },
    {
      label: 'Software licenses',
      value: licPct,
      amount: `${allocPooled.lic.toString().padStart(2, '0')} / ${totalPooled.lic.toString().padStart(2, '0')}`,
      color: 'lavender',
    },
    {
      label: 'Shared I/O slots',
      value: ioPct,
      amount: `${allocPooled.io.toString().padStart(2, '0')} / ${totalPooled.io.toString().padStart(2, '0')}`,
      color: 'orange',
    },
  ];

  return (
    <section className="panel gauges-panel flex flex-col justify-between">
      <div>
        <div className="section-heading">
          <div>
            <span className="section-kicker">Shared resources</span>
            <h2>Pooled gauges</h2>
          </div>
          {bankerSafe ? (
            <ShieldCheck className="safe-icon" />
          ) : (
            <ShieldAlert className="safe-icon text-[#ffb682]" />
          )}
        </div>

        <div className="gauge-list">
          {gauges.map((g) => (
            <div className="gauge" key={g.label}>
              <div className="gauge-head">
                <span>{g.label}</span>
                <b>{g.amount}</b>
              </div>
              <div className="gauge-bar">
                <div
                  className={`gauge-fill ${g.color}`}
                  style={{ width: `${g.value}%` }}
                />
              </div>
              <span className="gauge-caption">{g.value}% allocated</span>
            </div>
          ))}
        </div>
      </div>

      <div className="safety-card">
        <div className="safety-icon">
          {bankerSafe ? <ShieldCheck /> : <ShieldAlert className="text-[#ffb682]" />}
        </div>
        <div>
          <b>Banker safety check</b>
          <span>
            {bankerSafe
              ? 'System is in a safe state'
              : 'Resource contention: unsafe claim sequence'}
          </span>
        </div>
        <span
          className={`safe-badge ${
            bankerSafe ? '' : 'border-[#ffb682] text-[#ffb682]'
          }`}
        >
          {bankerSafe ? 'SAFE' : 'HAZARD'}
        </span>
      </div>
    </section>
  );
};
