import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { Shield, Sparkles, Key, HardDrive } from 'lucide-react';

export const PooledGauges: React.FC = () => {
  const { replayState, liveState, mode, runResult } = useLabStore();

  const pooled =
    mode === 'live'
      ? liveState?.pooled
        ? {
            total: liveState.pooled.total,
            available: liveState.pooled.available,
            allocated: {
              gpu: Math.max(0, liveState.pooled.total.gpu - liveState.pooled.available.gpu),
              lic: Math.max(0, liveState.pooled.total.lic - liveState.pooled.available.lic),
              io: Math.max(0, liveState.pooled.total.io - liveState.pooled.available.io),
            },
          }
        : null
      : replayState?.pooled;

  if (!pooled) return null;

  const items = [
    {
      key: 'gpu',
      label: 'GPU Accelerators',
      icon: <Sparkles className="w-4 h-4 text-cr-emerald" />,
      total: pooled.total.gpu,
      allocated: pooled.allocated.gpu,
      available: pooled.available.gpu,
      color: 'bg-cr-emerald',
      textColor: 'text-cr-emerald',
      borderColor: 'border-cr-emerald/40',
    },
    {
      key: 'lic',
      label: 'Software Licenses',
      icon: <Key className="w-4 h-4 text-cr-cyan" />,
      total: pooled.total.lic,
      allocated: pooled.allocated.lic,
      available: pooled.available.lic,
      color: 'bg-cr-cyan',
      textColor: 'text-cr-cyan',
      borderColor: 'border-cr-cyan/40',
    },
    {
      key: 'io',
      label: 'Shared I/O Slots',
      icon: <HardDrive className="w-4 h-4 text-cr-amber" />,
      total: pooled.total.io,
      allocated: pooled.allocated.io,
      available: pooled.available.io,
      color: 'bg-cr-amber',
      textColor: 'text-cr-amber',
      borderColor: 'border-cr-amber/40',
    },
  ];

  return (
    <div className="bg-cr-surface border border-cr-border rounded-xl p-4 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-cr-border mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cr-emerald" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Scarce Pooled Resources (Banker Monitored)
          </h2>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          State:{' '}
          <span
            className={`font-semibold ${
              replayState?.banker_safe !== false ? 'text-cr-emerald' : 'text-cr-rose font-bold'
            }`}
          >
            {replayState?.banker_safe !== false ? 'SAFE STATE' : 'UNSAFE / DEADLOCK'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((item) => {
          const pct = Math.round((item.allocated / Math.max(1, item.total)) * 100);
          return (
            <div
              key={item.key}
              className="flex flex-col p-3 rounded-xl bg-cr-card border border-cr-border cr-glass-hover"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
                  {item.icon} {item.label}
                </span>
                <span className={`text-xs font-mono font-bold ${item.textColor}`}>
                  {pct}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full transition-all duration-300 ${item.color}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>

              {/* Details breakdown */}
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Avail: <b className="text-white">{item.available}</b></span>
                <span>In-Use: <b className="text-slate-200">{item.allocated}</b></span>
                <span>Pool: <b className="text-slate-400">{item.total}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
