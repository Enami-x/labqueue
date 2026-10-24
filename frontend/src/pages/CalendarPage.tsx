import React, { useState, useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api, ApiError } from '../services/api';
import { CalendarSlot, FieldError, ScheduleConfig, TriggerCondition, TriggerRule } from '../types';
import { Calendar, Plus, Trash2, Save, Clock, AlertTriangle, ShieldCheck, Play } from 'lucide-react';

/** Every 30 minutes, plus the current value if it isn't on that grid. */
const timeOptions = (current: number, from: number, to: number) => {
  const opts = new Set<number>([current]);
  for (let m = from; m <= to; m += 30) opts.add(m);
  return [...opts].sort((a, b) => a - b);
};

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

/** Messages whose loc starts with the given path, e.g. ['slots', 2]. */
const errorsAt = (errors: FieldError[], ...path: (string | number)[]) =>
  errors.filter((e) => path.every((p, i) => e.loc[i] === p)).map((e) => e.msg);

const FieldErrors: React.FC<{ messages: string[] }> = ({ messages }) =>
  messages.length ? (
    <ul className="mt-2 space-y-0.5 text-[11px] text-[#ffb682]" role="alert">
      {messages.map((m) => (
        <li key={m} className="flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" /> {m}
        </li>
      ))}
    </ul>
  ) : null;

export const CalendarPage: React.FC = () => {
  const { profiles, runScheduledSimulation, setTab, loading, runResult, activeScenario } = useLabStore();

  const [schedule, setSchedule] = useState<ScheduleConfig>(EMPTY_SCHEDULE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  useEffect(() => {
    api
      .getSchedule()
      .then((data) => setSchedule(data))
      .catch((err) => setSaveMsg({ type: 'error', text: `Could not load the saved calendar: ${err.message}` }))
      .finally(() => setLoaded(true));
  }, []);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await api.saveSchedule(schedule);
      setSchedule(saved);
      setFieldErrors([]);
      setSaveMsg({ type: 'success', text: 'Calendar slots and trigger rules saved.' });
      return true;
    } catch (e: any) {
      const errs = e instanceof ApiError ? e.fieldErrors : [];
      setFieldErrors(errs);
      setSaveMsg({
        type: 'error',
        text: errs.length
          ? `Not saved: fix the ${errs.length === 1 ? 'problem' : `${errs.length} problems`} highlighted below.`
          : e.message || 'Failed to save schedule',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRunWithSchedule = async () => {
    if (!(await save())) return;
    if (await runScheduledSimulation()) setTab('overview');
  };

  const updateSlot = (idx: number, patch: Partial<CalendarSlot>) =>
    setSchedule((s) => ({ ...s, slots: s.slots.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot)) }));

  const updateRule = (idx: number, patch: Partial<TriggerRule>) =>
    setSchedule((s) => ({ ...s, rules: s.rules.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)) }));

  const updateCondition = (idx: number, patch: Partial<TriggerCondition>) =>
    setSchedule((s) => ({
      ...s,
      rules: s.rules.map((rule, i) =>
        i === idx ? { ...rule, conditions: [{ ...rule.conditions[0], ...patch }, ...rule.conditions.slice(1)] } : rule,
      ),
    }));

  const removeSlot = (idx: number) => {
    setSchedule((s) => ({ ...s, slots: s.slots.filter((_, i) => i !== idx) }));
    setFieldErrors([]);
  };

  const addSlot = () =>
    setSchedule((s) => ({
      ...s,
      slots: [...s.slots, { day_of_week: 1, start_minute: 540, end_minute: 780, profile_name: 'practical_session' }],
    }));

  const removeRule = (idx: number) => {
    setSchedule((s) => ({ ...s, rules: s.rules.filter((_, i) => i !== idx) }));
    setFieldErrors([]);
  };

  const addRule = () =>
    setSchedule((s) => ({
      ...s,
      rules: [
        ...s.rules,
        { priority: 60, conditions: [{ field: 'queue_len', op: '>=', value: 20 }], profile_name: 'peak_overload', cooldown: 5 },
      ],
    }));

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const formatMinutes = (m: number) => {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="panel p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="section-kicker">Automated Policy Switching</span>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2 mt-1">
            <Calendar className="w-5 h-5 text-[#b6f3cf]" />
            Calendar & Trigger Rules
          </h1>
          <p className="text-xs text-[#99aaa5] mt-1 max-w-2xl">
            Configure weekly time-of-day policies and reactive cluster triggers.
            When a run uses this schedule, matching reactive rules (queue surges, node outages) take
            precedence over calendar slots; otherwise the default policy applies. Sim time starts Monday 00:00
            {runResult?.metrics?.makespan
              ? `, and the current ${activeScenario} run lasts ${runResult.metrics.makespan} min (until Mon ${formatMinutes(runResult.metrics.makespan % 1440)}).`
              : '.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="ghost-button px-4 py-2.5 text-xs font-bold flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Rules'}</span>
          </button>
          <button
            onClick={handleRunWithSchedule}
            disabled={saving || loading}
            className="primary-button"
          >
            <Play className="w-4 h-4" />
            <span>Run with this schedule</span>
          </button>
        </div>
      </div>

      {/* Save Message Banner */}
      {saveMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            saveMsg.type === 'success'
              ? 'bg-[#b6f3cf]/15 border-[#b6f3cf]/30 text-[#b6f3cf]'
              : 'bg-[#ffb682]/15 border-[#ffb682]/30 text-[#ffb682]'
          }`}
        >
          {saveMsg.type === 'success' ? (
            <ShieldCheck className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span>{saveMsg.text}</span>
        </div>
      )}

      {loaded && schedule.slots.length === 0 && schedule.rules.length === 0 && (
        <div className="panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs text-[#aec0ba]">
            No slots or rules yet. Start from an example schedule, or add your own below.
          </span>
          <button className="ghost-button px-3 py-2 text-xs" onClick={() => setSchedule(EXAMPLE_SCHEDULE)}>
            <Plus /> Load example schedule
          </button>
        </div>
      )}

      {/* Default Fallback Policy */}
      <div className="panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-white uppercase tracking-wider block">
            Default Fallback Policy
          </span>
          <span className="text-[11px] text-[#99aaa5]">
            Applied when no specific calendar slot or reactive trigger condition matches.
          </span>
          <FieldErrors messages={errorsAt(fieldErrors, 'default_profile_name')} />
        </div>

        <select
          value={schedule.default_profile_name}
          onChange={(e) => setSchedule((sch) => ({ ...sch, default_profile_name: e.target.value }))}
          className="bg-black/30 border border-[rgba(220,237,227,0.18)] rounded-lg px-3 py-2 text-xs text-[#f5f4ed] focus:outline-none focus:border-[#b6f3cf]"
        >
          {profiles.map((p) => (
            <option key={p.name} value={p.name} className="bg-[#031f1b]">
              {p.name} ({p.scheduler})
            </option>
          ))}
        </select>
      </div>

      {/* Reactive Trigger Rules Panel */}
      <div className="panel p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[rgba(220,237,227,0.1)] pb-3">
          <div>
            <span className="section-kicker">Priority Evaluator</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#ffb682]" />
              Reactive Trigger Rules ({schedule.rules.length})
            </h2>
          </div>
          <button
            onClick={addRule}
            className="ghost-button flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#b6f3cf]" />
            <span>Add Trigger Rule</span>
          </button>
        </div>

        <div className="space-y-3">
          {schedule.rules.length > 0 ? (
            schedule.rules.map((rule, idx) => {
              const cond = rule.conditions?.[0] || { field: 'queue_len', op: '>=', value: 15 };

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-black/20 border border-[rgba(220,237,227,0.1)] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#ffb682]/15 text-[#ffb682] border border-[#ffb682]/25 text-[10px] font-bold">
                        Priority {rule.priority}
                      </span>
                      <span className="text-xs text-[#99aaa5]">Cooldown: {rule.cooldown || 5} min</span>
                    </div>

                    <div className="text-xs text-[#f5f4ed] font-mono mt-2">
                      IF <b className="text-[#b6f3cf]">{cond.field}</b> {cond.op} <b className="text-white">{cond.value}</b> → SWITCH POLICY TO{' '}
                      <b className="text-[#ffb682]">{rule.profile_name}</b>
                    </div>
                    <FieldErrors messages={errorsAt(fieldErrors, 'rules', idx)} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Condition Field */}
                    <select
                      value={cond.field}
                      onChange={(e) => updateCondition(idx, { field: e.target.value })}
                      className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2.5 py-1.5 text-xs text-[#f5f4ed]"
                    >
                      <option value="queue_len" className="bg-[#031f1b]">Queue Length</option>
                      <option value="nodes_down" className="bg-[#031f1b]">Nodes Down</option>
                      <option value="util" className="bg-[#031f1b]">CPU Utilization</option>
                      <option value="running_count" className="bg-[#031f1b]">Running Jobs</option>
                    </select>

                    {/* Operator */}
                    <select
                      value={cond.op}
                      onChange={(e) => updateCondition(idx, { op: e.target.value as TriggerCondition['op'] })}
                      className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                    >
                      <option value=">=">&gt;=</option>
                      <option value=">">&gt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="<">&lt;</option>
                      <option value="==">==</option>
                    </select>

                    {/* Threshold Value */}
                    <input
                      type="number"
                      value={cond.value}
                      onChange={(e) => updateCondition(idx, { value: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                    />

                    {/* Target Profile */}
                    <select
                      value={rule.profile_name}
                      onChange={(e) => updateRule(idx, { profile_name: e.target.value })}
                      className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2.5 py-1.5 text-xs text-[#b6f3cf] font-semibold"
                    >
                      {profiles.map((p) => (
                        <option key={p.name} value={p.name} className="bg-[#031f1b] text-white">
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => removeRule(idx)}
                      className="p-1.5 rounded-lg bg-[#ffb682]/15 text-[#ffb682] hover:bg-[#ffb682]/25 transition cursor-pointer"
                      title="Remove Rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-xs text-[#6e8c82] italic">
              No reactive trigger rules configured. Click Add Trigger Rule above.
            </div>
          )}
        </div>
      </div>

      {/* Weekly Calendar Slots Panel */}
      <div className="panel p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[rgba(220,237,227,0.1)] pb-3">
          <div>
            <span className="section-kicker">Recurring Schedule</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#b6f3cf]" />
              Weekly Calendar Slots ({schedule.slots.length})
            </h2>
          </div>
          <button
            onClick={addSlot}
            className="ghost-button flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#b6f3cf]" />
            <span>Add Time Slot</span>
          </button>
        </div>

        <div className="space-y-3">
          {schedule.slots.length > 0 ? (
            schedule.slots.map((slot, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-black/20 border border-[rgba(220,237,227,0.1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <span className="w-24 text-center px-2 py-1 rounded bg-[#b6f3cf]/10 border border-[#b6f3cf]/25 text-xs font-bold text-[#b6f3cf]">
                    {days[slot.day_of_week] || 'Monday'}
                  </span>
                  <div>
                    <span className="text-xs text-white font-mono font-semibold block">
                      {formatMinutes(slot.start_minute)} – {formatMinutes(slot.end_minute)}
                    </span>
                    <span className="text-[11px] text-[#99aaa5]">
                      Active Policy: <b className="text-[#b6f3cf]">{slot.profile_name}</b>
                    </span>
                    <FieldErrors messages={errorsAt(fieldErrors, 'slots', idx)} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Day Selector */}
                  <select
                    value={slot.day_of_week}
                    onChange={(e) => updateSlot(idx, { day_of_week: parseInt(e.target.value, 10) })}
                    className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2.5 py-1.5 text-xs text-[#f5f4ed]"
                  >
                    {days.map((dayName, dIdx) => (
                      <option key={dIdx} value={dIdx} className="bg-[#031f1b]">
                        {dayName}
                      </option>
                    ))}
                  </select>

                  {/* Start Minute */}
                  <select
                    value={slot.start_minute}
                    onChange={(e) => updateSlot(idx, { start_minute: parseInt(e.target.value, 10) })}
                    className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                  >
                    {timeOptions(slot.start_minute, 0, 1410).map((m) => (
                      <option key={m} value={m} className="bg-[#031f1b]">
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>

                  <span className="text-xs text-[#6e8c82]">to</span>

                  {/* End Minute */}
                  <select
                    value={slot.end_minute}
                    onChange={(e) => updateSlot(idx, { end_minute: parseInt(e.target.value, 10) })}
                    className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                  >
                    {timeOptions(slot.end_minute, 30, 1440).map((m) => (
                      <option key={m} value={m} className="bg-[#031f1b]">
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>

                  {/* Policy Profile */}
                  <select
                    value={slot.profile_name}
                    onChange={(e) => updateSlot(idx, { profile_name: e.target.value })}
                    className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2.5 py-1.5 text-xs text-[#b6f3cf] font-semibold"
                  >
                    {profiles.map((p) => (
                      <option key={p.name} value={p.name} className="bg-[#031f1b] text-white">
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => removeSlot(idx)}
                    className="p-1.5 rounded-lg bg-[#ffb682]/15 text-[#ffb682] hover:bg-[#ffb682]/25 transition cursor-pointer"
                    title="Remove Slot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-xs text-[#6e8c82] italic">
              No calendar slots configured. Click Add Time Slot above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
