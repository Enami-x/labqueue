import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api, ApiError } from '../services/api';
import { BankerMode, PlacementKind, Profile, Role, SchedulerKind } from '../types';
import { Save } from 'lucide-react';
import { BusyIcon, Field, PageHeader, SectionHeading } from '../components/ui';
import { toast } from '../store/useFeedback';

const SCHEDULERS: { key: SchedulerKind; hint: string }[] = [
  { key: 'FCFS', hint: 'Arrival order, strict head-of-line' },
  { key: 'SJF', hint: 'Shortest remaining burst first' },
  { key: 'RR', hint: 'Time slices of a fixed quantum' },
  { key: 'PRIORITY', hint: 'Weighted score of role, deadline, wait, size' },
];
const ROLES: Role[] = ['faculty', 'exam', 'demo', 'phd', 'ug', 'guest'];
const WEIGHTS = [
  ['role', 'Role'],
  ['deadline', 'Deadline urgency'],
  ['wait', 'Time waited'],
  ['size', 'Smallness'],
] as const;

export const ProfileBuilderPage: React.FC = () => {
  const { runSimulation, refreshProfiles, setTab, profiles } = useLabStore();

  const [name, setName] = useState('custom_fair_sjf');
  const [family, setFamily] = useState('custom');
  const [scheduler, setScheduler] = useState<SchedulerKind>('SJF');
  const [quantum, setQuantum] = useState(4);
  const [preemptive, setPreemptive] = useState(false);
  const [preemptBy, setPreemptBy] = useState<Role[]>(['faculty', 'exam']);
  const [agingRate, setAgingRate] = useState(0.05);
  const [weights, setWeights] = useState({ role: 0.4, deadline: 0.3, wait: 0.2, size: 0.1 });
  const [placement, setPlacement] = useState<PlacementKind>('best');
  const [banker, setBanker] = useState<BankerMode>('strict');
  const [enableQuota, setEnableQuota] = useState(true);
  const [quota, setQuota] = useState(2);
  const [reservedRole, setReservedRole] = useState<Role | ''>('');
  const [reservedPct, setReservedPct] = useState(0.2);
  const [backfill, setBackfill] = useState(true);

  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '_');
  const nameErrors: string[] = [];
  if (!normalizedName) nameErrors.push('Profile name is required');
  else if (profiles.some((p) => p.name === normalizedName)) nameErrors.push(`A profile named '${normalizedName}' already exists`);

  const errors = [...nameErrors];
  if (scheduler === 'RR' && !(quantum >= 1)) errors.push('Round-Robin needs a quantum of at least 1 minute');
  if (scheduler === 'PRIORITY' && Object.values(weights).every((w) => w === 0)) errors.push('Priority weights must not all be zero');
  const canPreempt = scheduler === 'SJF' || scheduler === 'PRIORITY';

  const buildProfile = (): Profile => ({
    name: normalizedName,
    family,
    scheduler,
    quantum: scheduler === 'RR' ? quantum : null,
    preemptive: canPreempt && preemptive,
    aging_rate: agingRate,
    weights: scheduler === 'PRIORITY' ? weights : null,
    placement,
    banker,
    quota_per_user: enableQuota ? quota : null,
    reserved_role: reservedRole || null,
    reserved_pct: reservedRole ? reservedPct : 0,
    preempt_by: scheduler === 'PRIORITY' && preemptive ? preemptBy : [],
    backfill: scheduler === 'FCFS' ? false : backfill,
  });

  const handleSave = async () => {
    if (errors.length) return;
    setSaving(true);
    setServerErrors([]);
    try {
      const saved = await api.createProfile(buildProfile());
      await refreshProfiles();
      toast.success(`Saved profile ${saved.name}`, ['Running it on the active scenario…']);
      if (await runSimulation(saved.name)) setTab('overview');
    } catch (e) {
      const msgs = e instanceof ApiError && e.fieldErrors.length ? e.fieldErrors.map((f) => f.msg) : [(e as Error).message];
      setServerErrors(msgs);
      toast.error('Profile not saved', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Custom policy"
        title={
          <>
            Profile builder<span>.</span>
          </>
        }
        description="Combine a CPU scheduler, a memory placement strategy, a Banker's-algorithm mode, and fairness controls into a new profile. Saving validates it on the server, adds it to every profile picker, and runs it on the active scenario."
        actions={
          <button className="primary-button" onClick={handleSave} disabled={saving || errors.length > 0}>
            <BusyIcon busy={saving} icon={<Save />} />
            {saving ? 'Saving…' : 'Save profile and run'}
          </button>
        }
      />

      {(errors.length > 0 || serverErrors.length > 0) && (
        <div className="notice" role="alert" style={{ marginBottom: 20 }}>
          <div>
            <b>{serverErrors.length ? 'The server rejected this profile' : 'Fix before saving'}</b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {[...errors, ...serverErrors].map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid-2">
        <section className="panel" aria-labelledby="b-identity">
          <SectionHeading id="b-identity" kicker="Step 1" title="Identity" />
          <div className="panel-body form-grid">
            <Field label="Profile name" hint="Lowercase; spaces become underscores" errors={nameErrors}>
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  aria-invalid={nameErrors.length > 0}
                  className={`control mono ${nameErrors.length ? 'invalid' : ''}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Family">
              {(id) => (
                <select id={id} className="control" value={family} onChange={(e) => setFamily(e.target.value)}>
                  {['custom', 'academic', 'research', 'events', 'load', 'fairness'].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </section>

        <section className="panel" aria-labelledby="b-sched">
          <SectionHeading id="b-sched" kicker="Step 2" title="CPU scheduling" />
          <div className="panel-body stack" style={{ gap: 16 }}>
            <div className="field">
              <span className="field-label" id="sched-label">
                Algorithm
              </span>
              <div className="segmented" role="group" aria-labelledby="sched-label">
                {SCHEDULERS.map((s) => (
                  <button key={s.key} type="button" aria-pressed={scheduler === s.key} title={s.hint} onClick={() => setScheduler(s.key)}>
                    {s.key}
                  </button>
                ))}
              </div>
              <span className="field-hint">{SCHEDULERS.find((s) => s.key === scheduler)?.hint}</span>
            </div>

            {scheduler === 'RR' && (
              <Field label="Quantum (minutes)">
                {(id) => (
                  <input id={id} type="number" min={1} max={60} className="control mono" value={quantum} onChange={(e) => setQuantum(parseInt(e.target.value, 10) || 0)} />
                )}
              </Field>
            )}

            {canPreempt && (
              <label className="check">
                <input type="checkbox" checked={preemptive} onChange={(e) => setPreemptive(e.target.checked)} />
                {scheduler === 'SJF' ? 'Preemptive (SRTF): a shorter job can displace a running one' : 'Preemptive: a higher-scoring job can displace a running one'}
              </label>
            )}

            {scheduler === 'PRIORITY' && preemptive && (
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label" style={{ marginBottom: 6 }}>
                  Roles allowed to preempt (none checked = any role)
                </legend>
                <div className="flex flex-wrap gap-3">
                  {ROLES.map((r) => (
                    <label key={r} className="check">
                      <input
                        type="checkbox"
                        checked={preemptBy.includes(r)}
                        onChange={(e) => setPreemptBy((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <Field label={`Aging rate: +${agingRate.toFixed(2)} per minute waited`} hint="Raises a waiting job's priority over time to prevent starvation">
              {(id, d) => (
                <input id={id} aria-describedby={d} type="range" min={0} max={0.2} step={0.01} value={agingRate} onChange={(e) => setAgingRate(parseFloat(e.target.value))} />
              )}
            </Field>

            {scheduler !== 'FCFS' ? (
              <label className="check">
                <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} />
                Backfill: let smaller jobs start when the head of the queue doesn't fit
              </label>
            ) : (
              <p className="help">FCFS always uses strict head-of-line order (no backfill).</p>
            )}
          </div>
        </section>

        {scheduler === 'PRIORITY' && (
          <section className="panel" aria-labelledby="b-weights" style={{ gridColumn: '1 / -1' }}>
            <SectionHeading id="b-weights" kicker="Step 2b" title="Priority weights" />
            <div className="panel-body form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {WEIGHTS.map(([key, label]) => (
                <Field key={key} label={`${label}: ${weights[key].toFixed(2)}`}>
                  {(id) => (
                    <input
                      id={id}
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={weights[key]}
                      onChange={(e) => setWeights((w) => ({ ...w, [key]: parseFloat(e.target.value) }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        )}

        <section className="panel" aria-labelledby="b-mem">
          <SectionHeading id="b-mem" kicker="Step 3" title="Placement and deadlock safety" />
          <div className="panel-body form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <Field label="Memory placement">
              {(id) => (
                <select id={id} className="control" value={placement} onChange={(e) => setPlacement(e.target.value as PlacementKind)}>
                  <option value="first">First fit: lowest node id that fits</option>
                  <option value="best">Best fit: node with the least memory left over</option>
                  <option value="worst">Worst fit: node with the most memory left over</option>
                </select>
              )}
            </Field>
            <Field label="Banker's algorithm">
              {(id) => (
                <select id={id} className="control" value={banker} onChange={(e) => setBanker(e.target.value as BankerMode)}>
                  <option value="strict">Strict: every pooled request must keep the state safe</option>
                  <option value="lenient">Lenient: only GPU requests are safety-checked</option>
                  <option value="off">Off: grant if available; detect and recover deadlocks</option>
                </select>
              )}
            </Field>
          </div>
        </section>

        <section className="panel" aria-labelledby="b-fair">
          <SectionHeading id="b-fair" kicker="Step 4" title="Fairness controls" />
          <div className="panel-body stack" style={{ gap: 16 }}>
            <label className="check">
              <input type="checkbox" checked={enableQuota} onChange={(e) => setEnableQuota(e.target.checked)} />
              Limit concurrent jobs per user
            </label>
            {enableQuota && (
              <Field label="Max running jobs per user">
                {(id) => (
                  <input id={id} type="number" min={1} max={10} className="control mono" value={quota} onChange={(e) => setQuota(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                )}
              </Field>
            )}
            <div className="form-grid">
              <Field label="Reserve nodes for role" hint="Soft: others may use them when that role isn't waiting">
                {(id, d) => (
                  <select id={id} aria-describedby={d} className="control" value={reservedRole} onChange={(e) => setReservedRole(e.target.value as Role | '')}>
                    <option value="">No reservation</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Share of nodes">
                {(id) => (
                  <select id={id} className="control" disabled={!reservedRole} value={reservedPct} onChange={(e) => setReservedPct(parseFloat(e.target.value))}>
                    {[0.2, 0.3, 0.5].map((v) => (
                      <option key={v} value={v}>
                        {Math.round(v * 100)}%
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
