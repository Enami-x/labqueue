import React, { useEffect, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api, LiveLimits } from '../services/api';
import { Cpu, Flame, Info, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { ProfilePicker } from '../components/ProfilePicker';
import { BusyIcon, EmptyState, Field, PageHeader, SectionHeading } from '../components/ui';
import { confirmAction, toast } from '../store/useFeedback';
import { fmtDuration, profileLabel, ROLE_LABEL } from '../lib/format';

type LimitKey = keyof LiveLimits['limits'];
const FALLBACK: LiveLimits['limits'] = {
  cpu: { min: 1, max: 16 },
  mem: { min: 1, max: 64 },
  duration: { min: 0.5, max: 300 },
  gpu: { min: 0, max: 6 },
  lic: { min: 0, max: 4 },
  io: { min: 0, max: 5 },
  rush_count: { min: 1, max: 20 },
  rush_duration: { min: 0.5, max: 60 },
};
const ROLES = ['ug', 'phd', 'faculty', 'exam', 'demo', 'guest'];
const KINDS = ['training', 'preprocess', 'inference', 'assignment', 'demo'];

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  range: { min: number; max: number };
  step?: number;
  float?: boolean;
}> = ({ label, value, onChange, range, step = 1, float }) => (
  <Field label={label} hint={`${range.min}–${range.max}`}>
    {(id, d) => (
      <input
        id={id}
        aria-describedby={d}
        type="number"
        className="control mono"
        min={range.min}
        max={range.max}
        step={step}
        value={value}
        onChange={(e) => {
          const raw = float ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
          onChange(Number.isFinite(raw) ? Math.min(range.max, Math.max(range.min, raw)) : range.min);
        }}
      />
    )}
  </Field>
);

export const LiveConsolePage: React.FC = () => {
  const { liveState, liveLink, openSavedRun, setSelectedJobId } = useLabStore();
  const [limits, setLimits] = useState<LiveLimits | null>(null);
  const lim = (k: LimitKey) => limits?.limits[k] ?? FALLBACK[k];

  useEffect(() => {
    api.getLiveLimits().then(setLimits).catch((e) => toast.error('Could not load submission limits', e));
  }, []);

  // Job submission
  const [userId, setUserId] = useState('student_alice');
  const [role, setRole] = useState('ug');
  const [kind, setKind] = useState('training');
  const [scriptName, setScriptName] = useState('cpu_burn.py');
  const [duration, setDuration] = useState(4);
  const [cpu, setCpu] = useState(1);
  const [mem, setMem] = useState(2);
  const [gpu, setGpu] = useState(0);
  const [lic, setLic] = useState(0);
  const [io, setIo] = useState(0);

  // Admin controls
  const [targetProfile, setTargetProfile] = useState('practical_session');
  const [rushCount, setRushCount] = useState(5);
  const [rushRole, setRushRole] = useState('ug');
  const [rushDuration, setRushDuration] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (liveState?.profile) setTargetProfile((cur) => (cur === 'practical_session' ? liveState.profile : cur));
  }, [liveState?.profile]);

  const run = async (key: string, fn: () => Promise<void>, failTitle: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(failTitle, e);
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      'submit',
      async () => {
        const res = await api.submitLiveJob({ user_id: userId, role, kind, cpu, mem, duration, script_name: scriptName, gpu, lic, io });
        toast.success(`Submitted ${res.job_id}`);
      },
      'Job not submitted',
    );
  };

  const rush = () =>
    run(
      'rush',
      async () => {
        const res = await api.injectLiveRush({ count: rushCount, role: rushRole, script_name: 'matrix_mult.py', duration: rushDuration });
        toast.success(`Injected ${res.job_ids.length} jobs`);
      },
      'Rush not injected',
    );

  const applyPolicy = () =>
    run(
      'policy',
      async () => {
        await api.switchLiveProfile(targetProfile);
        toast.success(`Live scheduler now uses ${profileLabel(targetProfile)}`);
      },
      'Policy not switched',
    );

  const reset = async () => {
    const ok = await confirmAction({
      title: 'Reset the live session?',
      body: `This kills every running and suspended process (${liveState?.counts.running ?? 0} running, ${
        liveState?.counts.suspended ?? 0
      } suspended), clears all queues and starts a new session with the default policy.`,
      confirmLabel: 'Reset session',
      danger: true,
    });
    if (!ok) return;
    run(
      'reset',
      async () => {
        const res = await api.restartLiveSession();
        toast.success(`New session ${res.session_id}`);
      },
      'Session not reset',
    );
  };

  const save = () =>
    run(
      'save',
      async () => {
        const res = await api.saveLiveSession();
        toast.success(`Saved as run ${res.run_id}`, ['Opening the replay on Overview…']);
        await openSavedRun(res.id);
      },
      'Session not saved',
    );

  const kill = async (jid: string, state: string) => {
    const ok = await confirmAction({
      title: `Kill ${jid}?`,
      body: `The ${state} job is terminated and counted as failed. Its CPU, memory and pooled resources are released.`,
      confirmLabel: 'Kill job',
      danger: true,
    });
    if (!ok) return;
    run(
      `kill-${jid}`,
      async () => {
        await api.killLiveJob(jid);
        toast.success(`Killed ${jid}`);
      },
      `Could not kill ${jid}`,
    );
  };

  const running = liveState?.running_jobs || [];
  const waiting = liveState?.ready_queue || [];
  const nodeName = (id: number) => liveState?.nodes.find((n) => n.id === id)?.name ?? `node ${id}`;
  const policy = liveState?.policy;

  return (
    <div>
      <PageHeader
        kicker={`Real OS processes · ${liveLink === 'open' ? 'connected' : liveLink}`}
        title={
          <>
            Live console<span>.</span>
          </>
        }
        description="Submit real Python child processes to the cluster scheduler. Preempted jobs are paused with psutil (SIGSTOP / SIGCONT on Linux and macOS, thread suspend on Windows) and resumed later. One profile minute is one second here."
        actions={
          <>
            <button className="ghost-button" style={{ padding: '9px 14px' }} onClick={save} disabled={busy !== null}>
              <BusyIcon busy={busy === 'save'} icon={<Save />} /> Save &amp; replay session
            </button>
            <button className="danger-button" style={{ padding: '9px 14px' }} onClick={reset} disabled={busy !== null}>
              <BusyIcon busy={busy === 'reset'} icon={<RotateCcw />} /> Reset Session
            </button>
          </>
        }
      />

      {liveState && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 20 }} aria-label="Session status">
          <span className="chip neutral mono">{liveState.session_id}</span>
          <span className="chip">policy {liveState.profile}</span>
          {policy && (
            <span className="chip neutral">
              {policy.scheduler}
              {policy.quantum ? ` · q=${policy.quantum}s` : ''}
              {policy.preemptive ? ' · preemptive' : ''} · Banker {policy.banker}
            </span>
          )}
          <span className="chip neutral">
            {liveState.counts.running} running · {liveState.counts.ready} ready · {liveState.counts.suspended} suspended
          </span>
        </div>
      )}

      <div className="stack">
        <div className="grid-2">
          <section className="panel" aria-labelledby="lc-submit">
            <SectionHeading id="lc-submit" kicker="Student" title="Submit a job" />
            <form className="panel-body stack" style={{ gap: 14 }} onSubmit={submit}>
              <div className="form-grid">
                <Field label="User ID">
                  {(id) => <input id={id} className="control mono" value={userId} maxLength={64} required onChange={(e) => setUserId(e.target.value)} />}
                </Field>
                <Field label="Role">
                  {(id) => (
                    <select id={id} className="control" value={role} onChange={(e) => setRole(e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Kind">
                  {(id) => (
                    <select id={id} className="control" value={kind} onChange={(e) => setKind(e.target.value)}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              <Field label="Program">
                {(id) => (
                  <select id={id} className="control" value={scriptName} onChange={(e) => setScriptName(e.target.value)}>
                    {(limits?.scripts ?? [{ name: 'cpu_burn.py', label: 'CPU burn' }]).map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}: {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="form-grid">
                <NumberField label="Duration (s)" value={duration} onChange={setDuration} range={lim('duration')} step={0.5} float />
                <NumberField label="vCPU" value={cpu} onChange={setCpu} range={lim('cpu')} />
                <NumberField label="Memory (GB)" value={mem} onChange={setMem} range={lim('mem')} />
              </div>
              <div className="form-grid">
                <NumberField label="GPU claim" value={gpu} onChange={setGpu} range={lim('gpu')} />
                <NumberField label="License claim" value={lic} onChange={setLic} range={lim('lic')} />
                <NumberField label="I/O slot claim" value={io} onChange={setIo} range={lim('io')} />
              </div>
              <p className="help">Pooled claims are granted through the Banker's algorithm when the job starts and held until it ends.</p>
              <button type="submit" className="primary-button" disabled={busy !== null}>
                <BusyIcon busy={busy === 'submit'} icon={<Send />} /> Submit job
              </button>
            </form>
          </section>

          <section className="panel" aria-labelledby="lc-admin">
            <SectionHeading id="lc-admin" kicker="Lab admin" title="Policy and load" />
            <div className="panel-body stack" style={{ gap: 18 }}>
              <div className="subpanel stack" style={{ gap: 10 }}>
                <Field label="Scheduling policy">{(id) => <ProfilePicker id={id} value={targetProfile} onChange={setTargetProfile} />}</Field>
                <button className="primary-button" onClick={applyPolicy} disabled={busy !== null} style={{ alignSelf: 'flex-start' }}>
                  <BusyIcon busy={busy === 'policy'} icon={<RotateCcw />} /> Apply to live scheduler
                </button>
              </div>

              <div className="subpanel stack" style={{ gap: 10 }}>
                <div className="form-grid">
                  <NumberField label="Rush size (jobs)" value={rushCount} onChange={setRushCount} range={lim('rush_count')} />
                  <Field label="Rush role">
                    {(id) => (
                      <select id={id} className="control" value={rushRole} onChange={(e) => setRushRole(e.target.value)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <NumberField label="Each runs (s)" value={rushDuration} onChange={setRushDuration} range={lim('rush_duration')} step={0.5} float />
                </div>
                <button className="ghost-button" style={{ padding: '9px 14px', alignSelf: 'flex-start' }} onClick={rush} disabled={busy !== null}>
                  <BusyIcon busy={busy === 'rush'} icon={<Flame />} /> Inject deadline rush
                </button>
              </div>

              <div className="notice info">
                <Info />
                <span>
                  Live mode applies the profile's FCFS / SJF / RR / Priority ordering, the RR quantum, priority and SRTF preemption
                  (for preemptive profiles, honouring preempt_by), head-of-line blocking when backfill is off, per-user quotas,
                  role reservations, placement and the Banker mode. Calendar slots and reactive rules apply to simulation runs only.
                </span>
              </div>
            </div>
          </section>
        </div>

        <section className="panel" aria-labelledby="lc-procs">
          <SectionHeading id="lc-procs" kicker="psutil" title={`Processes · ${running.length} running, ${waiting.length} waiting`} />
          <div className="panel-body">
            {!liveState ? (
              <div className="skeleton" style={{ height: 120 }} />
            ) : running.length + waiting.length === 0 ? (
              <EmptyState icon={<Cpu />}>No processes yet. Submit a job or inject a rush.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="sr-only">Running and waiting live jobs</caption>
                  <thead>
                    <tr>
                      <th scope="col">Job</th>
                      <th scope="col">State</th>
                      <th scope="col">Node</th>
                      <th scope="col">Role</th>
                      <th scope="col">Program</th>
                      <th scope="col" className="num">CPU %</th>
                      <th scope="col" className="num">RSS</th>
                      <th scope="col" className="num">Left</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {running.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <button className="mono underline" onClick={() => setSelectedJobId(j.id)}>
                            {j.id}
                          </button>
                        </td>
                        <td>
                          <span className="chip">running</span>
                        </td>
                        <td className="mono">{nodeName(j.node_id)}</td>
                        <td>{ROLE_LABEL[j.role] ?? j.role}</td>
                        <td className="mono">{j.script}</td>
                        <td className="num">{(j.metrics?.cpu_percent ?? 0).toFixed(1)}</td>
                        <td className="num">{(j.metrics?.memory_rss_mb ?? 0).toFixed(1)} MB</td>
                        <td className="num">{fmtDuration(j.remaining, 's')}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="danger-button icon-only" aria-label={`Kill ${j.id}`} onClick={() => kill(j.id, 'running')} disabled={busy === `kill-${j.id}`}>
                            <BusyIcon busy={busy === `kill-${j.id}`} icon={<Trash2 />} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {waiting.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <button className="mono underline" onClick={() => setSelectedJobId(j.id)}>
                            {j.id}
                          </button>
                        </td>
                        <td>
                          <span className={`chip ${j.suspended ? 'warn' : 'neutral'}`}>{j.suspended ? 'suspended' : 'queued'}</span>
                        </td>
                        <td>—</td>
                        <td>{ROLE_LABEL[j.role] ?? j.role}</td>
                        <td>—</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="danger-button icon-only"
                            aria-label={`Kill ${j.id}`}
                            onClick={() => kill(j.id, j.suspended ? 'suspended' : 'queued')}
                            disabled={busy === `kill-${j.id}`}
                          >
                            <BusyIcon busy={busy === `kill-${j.id}`} icon={<Trash2 />} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
