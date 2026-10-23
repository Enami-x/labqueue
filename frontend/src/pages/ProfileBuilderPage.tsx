import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import { Profile, SchedulerKind, PlacementKind, BankerMode, Role } from '../types';
import { Zap, Play, CheckCircle2, AlertTriangle, Save } from 'lucide-react';

export const ProfileBuilderPage: React.FC = () => {
  const { runSimulation, setTab } = useLabStore();

  const [name, setName] = useState('custom_fair_sjf');
  const [family, setFamily] = useState('custom');
  const [scheduler, setScheduler] = useState<SchedulerKind>('SJF');
  const [quantum, setQuantum] = useState<number>(4);
  const [preemptive, setPreemptive] = useState(false);
  const [agingRate, setAgingRate] = useState<number>(0.05);

  const [wRole, setWRole] = useState<number>(0.4);
  const [wDeadline, setWDeadline] = useState<number>(0.3);
  const [wWait, setWWait] = useState<number>(0.2);
  const [wSize, setWSize] = useState<number>(0.1);

  const [placement, setPlacement] = useState<PlacementKind>('best');
  const [banker, setBanker] = useState<BankerMode>('strict');
  const [quota, setQuota] = useState<number>(2);
  const [enableQuota, setEnableQuota] = useState(true);

  const [reservedRole, setReservedRole] = useState<Role | ''>('');
  const [reservedPct, setReservedPct] = useState<number>(0.2);
  const [backfill, setBackfill] = useState(true);

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Client-side validation
  const errors: string[] = [];
  if (!name.trim()) errors.push('Profile name is required');
  if (scheduler === 'RR' && (!quantum || quantum <= 0)) errors.push('RR requires quantum > 0');
  if (scheduler === 'FCFS' && backfill) errors.push('FCFS must have backfill disabled');
  if (reservedRole === '' && reservedPct > 0) {
    // Ok if no reserved role selected
  }

  const handleSaveAndTest = async () => {
    if (errors.length > 0) return;
    setSaving(true);
    setStatusMsg(null);

    const profileData: Profile = {
      name: name.trim().toLowerCase().replace(/\s+/g, '_'),
      family,
      scheduler,
      quantum: scheduler === 'RR' ? quantum : null,
      preemptive,
      aging_rate: agingRate,
      weights:
        scheduler === 'PRIORITY'
          ? { role: wRole, deadline: wDeadline, wait: wWait, size: wSize }
          : null,
      placement,
      banker,
      quota_per_user: enableQuota ? quota : null,
      reserved_role: reservedRole ? (reservedRole as Role) : null,
      reserved_pct: reservedRole ? reservedPct : 0.0,
      preempt_by: preemptive ? ['faculty', 'exam'] : null,
      backfill: scheduler === 'FCFS' ? false : backfill,
    };

    try {
      await api.createProfile(profileData);
      setStatusMsg({ type: 'ok', text: `Profile '${profileData.name}' saved and verified successfully!` });
      await runSimulation(profileData.name);
      setTimeout(() => {
        setTab('overview');
      }, 800);
    } catch (e: any) {
      setStatusMsg({ type: 'err', text: e.message || 'Failed to save custom profile' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 p-6 max-w-[1200px] w-full mx-auto space-y-6 overflow-y-auto font-mono text-xs">
      {/* Header */}
      <div className="pb-4 border-b border-cr-border">
        <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-cr-cyan" />
          Interactive Custom Policy Builder
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          Synthesize new scheduling policies with customized aging rates, priority weight vectors,
          and multi-resource safety invariants.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold ${
            statusMsg.type === 'ok'
              ? 'bg-cr-emerald/20 text-cr-emerald border-cr-emerald/40 cr-glow-emerald'
              : 'bg-cr-rose/20 text-cr-rose border-cr-rose/40'
          }`}
        >
          {statusMsg.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Basic Identity */}
        <div className="bg-cr-surface p-4 rounded-xl border border-cr-border space-y-3">
          <h2 className="text-sm font-bold text-white uppercase border-b border-cr-border pb-2">
            1. Policy Identity
          </h2>

          <div>
            <label className="text-slate-400 block mb-1">Profile Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-cr-cyan"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Policy Family / Category</label>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none"
            >
              <option value="custom">custom</option>
              <option value="academic">academic</option>
              <option value="research">research</option>
              <option value="deadlines">deadlines</option>
              <option value="fairness">fairness</option>
            </select>
          </div>
        </div>

        {/* Algorithm Selection */}
        <div className="bg-cr-surface p-4 rounded-xl border border-cr-border space-y-3">
          <h2 className="text-sm font-bold text-white uppercase border-b border-cr-border pb-2">
            2. Core Scheduling Algorithm
          </h2>

          <div>
            <label className="text-slate-400 block mb-1">Algorithm Strategy</label>
            <div className="grid grid-cols-2 gap-2">
              {(['FCFS', 'SJF', 'RR', 'PRIORITY'] as SchedulerKind[]).map((sk) => (
                <button
                  key={sk}
                  type="button"
                  onClick={() => {
                    setScheduler(sk);
                    if (sk === 'FCFS') setBackfill(false);
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition ${
                    scheduler === sk
                      ? 'bg-cr-cyan/20 text-cr-cyan border-cr-cyan/60 cr-glow-cyan'
                      : 'bg-cr-card text-slate-400 border-cr-border hover:text-white'
                  }`}
                >
                  {sk}
                </button>
              ))}
            </div>
          </div>

          {scheduler === 'RR' && (
            <div>
              <label className="text-slate-400 block mb-1">Round-Robin Quantum (minutes)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={quantum}
                onChange={(e) => setQuantum(parseInt(e.target.value) || 4)}
                className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-cr-cyan"
              />
            </div>
          )}

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Aging Rate (Anti-Starvation Bonus)</span>
              <span className="text-cr-emerald font-bold">+{agingRate}/m</span>
            </div>
            <input
              type="range"
              min={0.0}
              max={0.2}
              step={0.01}
              value={agingRate}
              onChange={(e) => setAgingRate(parseFloat(e.target.value))}
              aria-label="Aging Rate Slider"
              className="w-full accent-cr-emerald"
            />
          </div>
        </div>

        {/* Priority Scoring Knobs (if Priority) */}
        {scheduler === 'PRIORITY' && (
          <div className="md:col-span-2 bg-cr-surface p-4 rounded-xl border border-cr-border space-y-3">
            <h2 className="text-sm font-bold text-white uppercase border-b border-cr-border pb-2">
              3. Priority Multi-Objective Weights
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 block mb-1">Role Weight: {wRole.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={wRole}
                  onChange={(e) => setWRole(parseFloat(e.target.value))}
                  aria-label="Role Weight Slider"
                  className="w-full accent-cr-cyan"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Deadline Urgency: {wDeadline.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={wDeadline}
                  onChange={(e) => setWDeadline(parseFloat(e.target.value))}
                  aria-label="Deadline Weight Slider"
                  className="w-full accent-cr-amber"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Wait Time: {wWait.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={wWait}
                  onChange={(e) => setWWait(parseFloat(e.target.value))}
                  aria-label="Wait Time Slider"
                  className="w-full accent-cr-emerald"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Size/Smallness: {wSize.toFixed(2)}</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={wSize}
                  onChange={(e) => setWSize(parseFloat(e.target.value))}
                  aria-label="Size Weight Slider"
                  className="w-full accent-purple-400"
                />
              </div>
            </div>
          </div>
        )}

        {/* Resource Allocation & Safety */}
        <div className="bg-cr-surface p-4 rounded-xl border border-cr-border space-y-3">
          <h2 className="text-sm font-bold text-white uppercase border-b border-cr-border pb-2">
            4. Placement & Banker Safety
          </h2>

          <div>
            <label className="text-slate-400 block mb-1">Memory Placement Strategy</label>
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value as PlacementKind)}
              className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 capitalize focus:outline-none"
            >
              <option value="best">Best Fit (Minimizes Leftover)</option>
              <option value="first">First Fit (Lowest Node ID)</option>
              <option value="worst">Worst Fit (Spreads Load)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Banker Deadlock Safety Mode</label>
            <select
              value={banker}
              onChange={(e) => setBanker(e.target.value as BankerMode)}
              className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 capitalize focus:outline-none"
            >
              <option value="strict">Strict (Textbook Banker's Avoidance)</option>
              <option value="lenient">Lenient (Safety Check on GPUs only)</option>
              <option value="off">Off (Allows Deadlock & Uses Recovery)</option>
            </select>
          </div>
        </div>

        {/* Quotas & Reservations */}
        <div className="bg-cr-surface p-4 rounded-xl border border-cr-border space-y-3">
          <h2 className="text-sm font-bold text-white uppercase border-b border-cr-border pb-2">
            5. Fairness Quotas & Reservations
          </h2>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-400">Concurrent Jobs Per User Quota</label>
              <input
                type="checkbox"
                checked={enableQuota}
                onChange={(e) => setEnableQuota(e.target.checked)}
                className="accent-cr-cyan"
              />
            </div>
            {enableQuota && (
              <input
                type="number"
                min={1}
                max={10}
                value={quota}
                onChange={(e) => setQuota(parseInt(e.target.value) || 2)}
                className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-cr-cyan"
              />
            )}
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Role Reservation (Soft)</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={reservedRole}
                onChange={(e) => setReservedRole(e.target.value as Role)}
                className="bg-cr-card border border-cr-border rounded-lg px-2 py-1.5 text-slate-200 capitalize focus:outline-none"
              >
                <option value="">None</option>
                <option value="exam">Exam</option>
                <option value="demo">Demo</option>
                <option value="faculty">Faculty</option>
                <option value="phd">PhD</option>
              </select>

              <select
                value={reservedPct}
                onChange={(e) => setReservedPct(parseFloat(e.target.value))}
                disabled={!reservedRole}
                className="bg-cr-card border border-cr-border rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none disabled:opacity-40"
              >
                <option value={0.2}>20% Nodes</option>
                <option value={0.3}>30% Nodes</option>
                <option value={0.5}>50% Nodes</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="p-3 bg-cr-rose/15 border border-cr-rose/40 rounded-xl space-y-1 text-cr-rose font-bold">
          {errors.map((err, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span>✕</span> <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-2">
        <button
          onClick={handleSaveAndTest}
          disabled={saving || errors.length > 0}
          className="flex items-center justify-center gap-2 w-full py-3 bg-cr-cyan/20 hover:bg-cr-cyan/30 text-cr-cyan border border-cr-cyan/50 rounded-xl font-bold uppercase tracking-wider text-sm cr-glow-cyan transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Validating & Persisting...' : 'Save Profile & Simulate in Control Room'}</span>
        </button>
      </div>
    </div>
  );
};
