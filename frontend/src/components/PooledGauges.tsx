import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { Shield, Sparkles, Key, HardDrive } from 'lucide-react';

export const PooledGauges: React.FC = () => {
  const { replayState, liveState, mode } = useLabStore();

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

  const isSafe =
    mode === 'live'
      ? liveState?.banker_safe_sequence !== null
      : replayState?.banker_safe !== false;

  const items = [
    {
      key: 'gpu',
      label: 'GPU Accelerators',
      icon: <Sparkles className="w-3.5 h-3.5 text-emerald-400" />,
      total: pooled.total.gpu,
      allocated: pooled.allocated.gpu,
      available: pooled.available.gpu,
      barGradient: 'bg-gradient-to-r from-emerald-500 to-teal-400',
      textColor: 'text-emerald-400',
    },
    {
      key: 'lic',
      label: 'Software Licenses',
      icon: <Key className="w-3.5 h-3.5 text-sky-400" />,
      total: pooled.total.lic,
      allocated: pooled.allocated.lic,
      available: pooled.available.lic,
      barGradient: 'bg-gradient-to-r from-sky-500 to-indigo-500',
      textColor: 'text-sky-400',
    },
    {
      key: 'io',
      label: 'Shared I/O Slots',
      icon: <HardDrive className="w-3.5 h-3.5 text-amber-400" />,
      total: pooled.total.io,
      allocated: pooled.allocated.io,
      available: pooled.available.io,
      barGradient: 'bg-gradient-to-r from-amber-500 to-orange-400',
      textColor: 'text-amber-400',
    },
  ];

  return (
    <div className="plume-card rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Pooled Multi-Resources
            </h2>
            <p className="text-xs text-slate-400">
              Cross-node contention monitored by Banker's Algorithm
            </p>
          </div>
        </div>
        <div
          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
            isSafe
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
          }`}
        >
          {isSafe ? 'Safe State' : 'Deadlock Unsafe'}
        </div>
      </div>

      <div className="space-y-3.5 flex-1 flex flex-col justify-around">
        {items.map((item) => {
          const pct = Math.round((item.allocated / Math.max(1, item.total)) * 100);
          return (
            <div
              key={item.key}
              className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  {item.icon} {item.label}
                </span>
                <span className={`text-xs font-mono font-bold ${item.textColor}`}>
                  {pct}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${item.barGradient}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>

              {/* Details breakdown */}
              <div className="flex justify-between text-xs text-slate-400">
                <span>Avail: <b className="text-white font-mono">{item.available}</b></span>
                <span>In-Use: <b className="text-slate-200 font-mono">{item.allocated}</b></span>
                <span>Pool: <b className="text-slate-400 font-mono">{item.total}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
