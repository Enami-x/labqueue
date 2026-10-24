import React, { useEffect, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api, ApiError } from '../services/api';
import { CalendarSlot, FieldError, ScheduleConfig, TriggerCondition, TriggerRule } from '../types';
import { AlertTriangle, CalendarDays, Clock, Play, Plus, Save, Trash2, Zap } from 'lucide-react';
import { ProfilePicker } from '../components/ProfilePicker';
import { BusyIcon, EmptyState, Field, FieldErrors, PageHeader, SectionHeading, Skeleton } from '../components/ui';
import { toast } from '../store/useFeedback';
import { fmtSimClock } from '../lib/format';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FIELDS: { value: string; label: string }[] = [
  { value: 'queue_len', label: 'Queue length (jobs)' },
  { value: 'nodes_down', label: 'Nodes down' },
  { value: 'util', label: 'CPU utilization (0–1)' },
  { value: 'running_count', label: 'Running jobs' },
  { value: 'min_slack', label: 'Min deadline slack (min)' },
];
const OPS: TriggerCondition['op'][] = ['>=', '>', '<=', '<', '==', '!='];

const EMPTY_SCHEDULE: ScheduleConfig = { default_profile_name: 'practical_session', slots: [], rules: [] };

/** Starter schedule. Sim time starts Monday 00:00, so the first slot lands inside short runs. */
const EXAMPLE_SCHEDULE: ScheduleConfig = {
  default_profile_name: 'practical_session',
  slots: [
    { day_of_week: 0, start_minute: 60, end_minute: 180, profile_name: 'exam_week' },
    { day_of_week: 0, start_minute: 540, end_minute: 780, profile_name: 'practical_session' },
    { day_of_week: 2, start_minute: 840, end_minute: 1080, profile_name: 'exam_week' },
    { day_of_week: 4, start_minute: 1080, end_minute: 1440, profile_name: 'thesis_deadline' },
  ],
  rules: [
    { priority: 100, conditions: [{ field: 'nodes_down', op: '>=', value: 1 }], profile_name: 'node_failure', cooldown: 5 },
    { priority: 50, conditions: [{ field: 'queue_len', op: '>=', value: 10 }], profile_name: 'peak_overload', cooldown: 10 },
  ],
};

const hhmm = (m: number) => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;

/** Every 30 minutes, plus the current value if it isn't on that grid. */
const timeOptions = (current: number, from: number, to: number) => {
  const opts = new Set<number>([current]);
  for (let m = from; m <= to; m += 30) opts.add(m);
  return [...opts].sort((a, b) => a - b);
};

/** Messages whose loc starts with the given path, e.g. ['slots', 2]. */
const errorsAt = (errors: FieldError[], ...path: (string | number)[]) =>
  errors.filter((e) => path.every((p, i) => e.loc[i] === p)).map((e) => e.msg);

export const CalendarPage: React.FC = () => {
  const { runScheduledSimulation, setTab, loading, runResult, activeScenario } = useLabStore();

  const [schedule, setSchedule] = useState<ScheduleConfig>(EMPTY_SCHEDULE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSchedule()
      .then(setSchedule)
      .catch((err) => toast.error('Could not load the saved calendar', err))
      .finally(() => setLoaded(true));
  }, []);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const saved = await api.saveSchedule(schedule);
      setSchedule(saved);
      setFieldErrors([]);
      setSummary(null);
      toast.success('Calendar saved', [`${saved.slots.length} slot(s), ${saved.rules.length} rule(s)`]);
      return true;
    } catch (e) {
      const errs = e instanceof ApiError ? e.fieldErrors : [];
      setFieldErrors(errs);
      setSummary(
        errs.length
          ? `Not saved: fix the ${errs.length === 1 ? 'problem' : `${errs.length} problems`} highlighted below.`
          : `Not saved: ${(e as Error).message}`,
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runWithSchedule = async () => {
    if (!(await save())) return;
    setRunning(true);
    const ok = await runScheduledSimulation();
    setRunning(false);
    if (ok) setTab('overview');
  };

  const edit = (fn: (s: ScheduleConfig) => ScheduleConfig) => setSchedule(fn);
  const updateSlot = (idx: number, patch: Partial<CalendarSlot>) =>
    edit((s) => ({ ...s, slots: s.slots.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot)) }));
  const updateRule = (idx: number, patch: Partial<TriggerRule>) =>
    edit((s) => ({ ...s, rules: s.rules.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)) }));
  const updateCondition = (idx: number, patch: Partial<TriggerCondition>) =>
    edit((s) => ({
      ...s,
      rules: s.rules.map((rule, i) =>
        i === idx ? { ...rule, conditions: [{ ...rule.conditions[0], ...patch }, ...rule.conditions.slice(1)] } : rule,
      ),
    }));
  const removeSlot = (idx: number) => {
    edit((s) => ({ ...s, slots: s.slots.filter((_, i) => i !== idx) }));
    setFieldErrors([]);
  };
  const removeRule = (idx: number) => {
    edit((s) => ({ ...s, rules: s.rules.filter((_, i) => i !== idx) }));
    setFieldErrors([]);
  };

  const makespan = runResult?.metrics?.time_unit !== 's' ? runResult?.metrics?.makespan : undefined;

  return (
    <div>
      <PageHeader
        kicker="Automatic policy switching"
        title={
          <>
            Calendar and triggers<span>.</span>
          </>
        }
        description={
          <>
            Weekly slots pick a policy by time of day; reactive rules switch policy when the cluster's state matches and take
            precedence over slots. Otherwise the default applies. Simulated time starts Monday 00:00
            {makespan ? `, and the current ${activeScenario} run lasts ${makespan} min (until ${fmtSimClock(makespan)})` : ''}.
          </>
        }
        actions={
          <>
            <button className="ghost-button" style={{ padding: '9px 14px' }} onClick={save} disabled={saving || running}>
              <BusyIcon busy={saving && !running} icon={<Save />} /> Save Rules
            </button>
            <button className="primary-button" onClick={runWithSchedule} disabled={saving || running || loading}>
              <BusyIcon busy={running} icon={<Play />} /> Run with this schedule
            </button>
          </>
        }
      />

      <div className="stack">
        {summary && (
          <div className="notice" role="alert">
            <AlertTriangle />
            <span>{summary}</span>
          </div>
        )}

        {!loaded ? (
          <>
            <Skeleton height={90} />
            <Skeleton height={220} />
          </>
        ) : (
          <>
            {schedule.slots.length === 0 && schedule.rules.length === 0 && (
              <div className="panel" style={{ padding: 18 }}>
                <EmptyState
                  icon={<CalendarDays />}
                  action={
                    <button className="ghost-button" style={{ padding: '8px 14px' }} onClick={() => setSchedule(EXAMPLE_SCHEDULE)}>
                      <Plus /> Load example schedule
                    </button>
                  }
                >
                  No slots or rules yet. Start from an example, or add your own below.
                </EmptyState>
              </div>
            )}

            <section className="panel" aria-labelledby="cal-default">
              <SectionHeading id="cal-default" kicker="Fallback" title="Default policy" />
              <div className="panel-body" style={{ maxWidth: 520 }}>
                <Field label="Used when no slot or rule matches" errors={errorsAt(fieldErrors, 'default_profile_name')}>
                  {(id, d) => (
                    <ProfilePicker
                      id={id}
                      describedBy={d}
                      allowFreeText
                      invalid={errorsAt(fieldErrors, 'default_profile_name').length > 0}
                      value={schedule.default_profile_name}
                      onChange={(v) => edit((s) => ({ ...s, default_profile_name: v }))}
                    />
                  )}
                </Field>
              </div>
            </section>

            <section className="panel" aria-labelledby="cal-rules">
              <SectionHeading
                id="cal-rules"
                kicker="Checked first, highest priority wins"
                title={`Reactive rules · ${schedule.rules.length}`}
                actions={
                  <button
                    className="ghost-button"
                    style={{ padding: '7px 12px' }}
                    onClick={() =>
                      edit((s) => ({
                        ...s,
                        rules: [...s.rules, { priority: 60, conditions: [{ field: 'queue_len', op: '>=', value: 10 }], profile_name: 'peak_overload', cooldown: 5 }],
                      }))
                    }
                  >
                    <Plus /> Add rule
                  </button>
                }
              />
              <div className="panel-body stack" style={{ gap: 12 }}>
                {schedule.rules.length === 0 && <EmptyState icon={<Zap />}>No reactive rules.</EmptyState>}
                {schedule.rules.map((rule, idx) => {
                  const cond = rule.conditions[0] ?? { field: 'queue_len', op: '>=', value: 10 };
                  const errs = errorsAt(fieldErrors, 'rules', idx);
                  const profileErrs = errorsAt(fieldErrors, 'rules', idx, 'profile_name');
                  return (
                    <div key={idx} className={`subpanel ${errs.length ? 'banker-unsafe' : ''}`} aria-label={`Rule ${idx + 1}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 12 }}>
                        <span className="text-[13px]">
                          <b>Rule {idx + 1}:</b> if <span className="mono">{cond.field} {cond.op} {cond.value}</span> → switch to{' '}
                          <span className="mono">{rule.profile_name}</span>
                        </span>
                        <button className="danger-button icon-only" aria-label={`Delete rule ${idx + 1}`} onClick={() => removeRule(idx)}>
                          <Trash2 />
                        </button>
                      </div>
                      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                        <Field label="When">
                          {(id) => (
                            <select id={id} className="control" value={cond.field} onChange={(e) => updateCondition(idx, { field: e.target.value })}>
                              {FIELDS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="Is">
                          {(id) => (
                            <select id={id} className="control mono" value={cond.op} onChange={(e) => updateCondition(idx, { op: e.target.value as TriggerCondition['op'] })}>
                              {OPS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="Value">
                          {(id) => (
                            <input id={id} type="number" step="any" className="control mono" value={cond.value} onChange={(e) => updateCondition(idx, { value: parseFloat(e.target.value) || 0 })} />
                          )}
                        </Field>
                        <Field label="Switch to" errors={profileErrs}>
                          {(id, d) => (
                            <ProfilePicker
                              id={id}
                              describedBy={d}
                              allowFreeText
                              invalid={profileErrs.length > 0}
                              value={rule.profile_name}
                              onChange={(v) => updateRule(idx, { profile_name: v })}
                            />
                          )}
                        </Field>
                        <Field label="Priority">
                          {(id) => <input id={id} type="number" className="control mono" value={rule.priority} onChange={(e) => updateRule(idx, { priority: parseInt(e.target.value, 10) || 0 })} />}
                        </Field>
                        <Field label="Cooldown (min)">
                          {(id) => (
                            <input id={id} type="number" min={0} className="control mono" value={rule.cooldown} onChange={(e) => updateRule(idx, { cooldown: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                          )}
                        </Field>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <FieldErrors messages={errs.filter((m) => !profileErrs.includes(m))} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel" aria-labelledby="cal-slots">
              <SectionHeading
                id="cal-slots"
                kicker="Repeats weekly"
                title={`Calendar slots · ${schedule.slots.length}`}
                actions={
                  <button
                    className="ghost-button"
                    style={{ padding: '7px 12px' }}
                    onClick={() => edit((s) => ({ ...s, slots: [...s.slots, { day_of_week: 0, start_minute: 540, end_minute: 780, profile_name: 'practical_session' }] }))}
                  >
                    <Plus /> Add slot
                  </button>
                }
              />
              <div className="panel-body stack" style={{ gap: 12 }}>
                {schedule.slots.length === 0 && <EmptyState icon={<Clock />}>No calendar slots.</EmptyState>}
                {schedule.slots.map((slot, idx) => {
                  const errs = errorsAt(fieldErrors, 'slots', idx);
                  const endErrs = errorsAt(fieldErrors, 'slots', idx, 'end_minute');
                  const profileErrs = errorsAt(fieldErrors, 'slots', idx, 'profile_name');
                  const label = `Slot ${idx + 1}: ${DAYS[slot.day_of_week]} ${hhmm(slot.start_minute)}–${hhmm(slot.end_minute)}`;
                  return (
                    <div key={idx} className={`subpanel ${errs.length ? 'banker-unsafe' : ''}`} aria-label={label}>
                      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 12 }}>
                        <span className="text-[13px]">
                          <b>{label}</b> → <span className="mono">{slot.profile_name}</span>
                        </span>
                        <button className="danger-button icon-only" aria-label={`Delete slot ${idx + 1}`} onClick={() => removeSlot(idx)}>
                          <Trash2 />
                        </button>
                      </div>
                      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                        <Field label="Day">
                          {(id) => (
                            <select id={id} className="control" value={slot.day_of_week} onChange={(e) => updateSlot(idx, { day_of_week: parseInt(e.target.value, 10) })}>
                              {DAYS.map((d, i) => (
                                <option key={d} value={i}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="From">
                          {(id) => (
                            <select id={id} className="control mono" value={slot.start_minute} onChange={(e) => updateSlot(idx, { start_minute: parseInt(e.target.value, 10) })}>
                              {timeOptions(slot.start_minute, 0, 1410).map((m) => (
                                <option key={m} value={m}>
                                  {hhmm(m)}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="To" errors={endErrs}>
                          {(id, d) => (
                            <select
                              id={id}
                              aria-describedby={d}
                              className={`control mono ${endErrs.length ? 'invalid' : ''}`}
                              value={slot.end_minute}
                              onChange={(e) => updateSlot(idx, { end_minute: parseInt(e.target.value, 10) })}
                            >
                              {timeOptions(slot.end_minute, 30, 1440).map((m) => (
                                <option key={m} value={m}>
                                  {hhmm(m)}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="Policy" errors={profileErrs}>
                          {(id, d) => (
                            <ProfilePicker
                              id={id}
                              describedBy={d}
                              allowFreeText
                              invalid={profileErrs.length > 0}
                              value={slot.profile_name}
                              onChange={(v) => updateSlot(idx, { profile_name: v })}
                            />
                          )}
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
