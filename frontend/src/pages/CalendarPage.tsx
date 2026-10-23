import React, { useState, useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import { Calendar, Plus, Trash2, Save, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface TriggerCondition {
  field: string;
  op: string;
  value: number;
}

interface TriggerRule {
  priority: number;
  conditions: TriggerCondition[];
  profile_name: string;
  cooldown?: number;
}

interface CalendarSlot {
  day_of_week: number;
  start_minute: number;
  end_minute: number;
  profile_name: string;
}

interface ScheduleState {
  default_profile_name: string;
  slots: CalendarSlot[];
  rules: TriggerRule[];
}

export const CalendarPage: React.FC = () => {
  const { profiles } = useLabStore();

  const [schedule, setSchedule] = useState<ScheduleState>({
    default_profile_name: 'practical_session',
    slots: [
      {
        day_of_week: 0,
        start_minute: 540,
        end_minute: 780,
        profile_name: 'practical_session',
      },
      {
        day_of_week: 2,
        start_minute: 840,
        end_minute: 1080,
        profile_name: 'exam_week',
      },
      {
        day_of_week: 4,
        start_minute: 1080,
        end_minute: 1440,
        profile_name: 'thesis_deadline',
      },
    ],
    rules: [
      {
        priority: 100,
        conditions: [{ field: 'nodes_down', op: '>=', value: 1 }],
        profile_name: 'node_failure_recovery',
        cooldown: 5,
      },
      {
        priority: 50,
        conditions: [{ field: 'queue_len', op: '>=', value: 15 }],
        profile_name: 'exam_week',
        cooldown: 10,
      },
    ],
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.getSchedule()
      .then((data: any) => {
        if (data) {
          setSchedule({
            default_profile_name:
              data.default_profile_name || data.default_profile || 'practical_session',
            slots: Array.isArray(data.slots) ? data.slots : [],
            rules: Array.isArray(data.rules)
              ? data.rules
              : Array.isArray(data.triggers)
              ? data.triggers.map((t: any) => ({
                  priority: t.priority || 50,
                  conditions: t.conditions || [
                    {
                      field: t.condition?.type || 'queue_len',
                      op: t.condition?.op || '>=',
                      value: t.condition?.threshold || 15,
                    },
                  ],
                  profile_name: t.profile_name || 'exam_week',
                  cooldown: 5,
                }))
              : [],
          });
        }
      })
      .catch((err) => {
        console.warn('Could not load calendar schedule:', err);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        default_profile_name: schedule.default_profile_name,
        slots: schedule.slots.map((s) => ({
          day_of_week: Number(s.day_of_week),
          start_minute: Number(s.start_minute),
          end_minute: Number(s.end_minute),
          profile_name: s.profile_name,
        })),
        rules: schedule.rules.map((r) => ({
          priority: Number(r.priority),
          conditions: (r.conditions || [{ field: 'queue_len', op: '>=', value: 15 }]).map((c) => ({
            field: c.field,
            op: c.op,
            value: Number(c.value),
          })),
          profile_name: r.profile_name,
          cooldown: Number(r.cooldown || 5),
        })),
      };

      await api.saveSchedule(payload as any);
      setSaveMsg({ type: 'success', text: 'Calendar schedule and reactive rules saved successfully!' });
      setTimeout(() => setSaveMsg(null), 3500);
    } catch (e: any) {
      setSaveMsg({ type: 'error', text: e.message || 'Failed to save schedule' });
      setTimeout(() => setSaveMsg(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = (idx: number) => {
    const next = [...schedule.slots];
    next.splice(idx, 1);
    setSchedule({ ...schedule, slots: next });
  };

  const addSlot = () => {
    const newSlot: CalendarSlot = {
      day_of_week: 1,
      start_minute: 540,
      end_minute: 780,
      profile_name: profiles[0]?.name || 'practical_session',
    };
    setSchedule({ ...schedule, slots: [...schedule.slots, newSlot] });
  };

  const removeRule = (idx: number) => {
    const next = [...schedule.rules];
    next.splice(idx, 1);
    setSchedule({ ...schedule, rules: next });
  };

  const addRule = () => {
    const newRule: TriggerRule = {
      priority: 60,
      conditions: [{ field: 'queue_len', op: '>=', value: 20 }],
      profile_name: profiles[0]?.name || 'exam_week',
      cooldown: 5,
    };
    setSchedule({ ...schedule, rules: [...schedule.rules, newRule] });
  };

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
            Reactive rules (e.g., queue surges, node outages) immediately take precedence over calendar slots.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="play-button px-5 py-2.5 h-auto text-xs font-bold flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Rules'}</span>
        </button>
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

      {/* Default Fallback Policy */}
      <div className="panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-white uppercase tracking-wider block">
            Default Fallback Policy
          </span>
          <span className="text-[11px] text-[#99aaa5]">
            Applied when no specific calendar slot or reactive trigger condition matches.
          </span>
        </div>

        <select
          value={schedule.default_profile_name}
          onChange={(e) => setSchedule({ ...schedule, default_profile_name: e.target.value })}
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
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Condition Field */}
                    <select
                      value={cond.field}
                      onChange={(e) => {
                        const next = [...schedule.rules];
                        next[idx].conditions[0].field = e.target.value;
                        setSchedule({ ...schedule, rules: next });
                      }}
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
                      onChange={(e) => {
                        const next = [...schedule.rules];
                        next[idx].conditions[0].op = e.target.value;
                        setSchedule({ ...schedule, rules: next });
                      }}
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
                      onChange={(e) => {
                        const next = [...schedule.rules];
                        next[idx].conditions[0].value = parseFloat(e.target.value) || 0;
                        setSchedule({ ...schedule, rules: next });
                      }}
                      className="w-16 bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                    />

                    {/* Target Profile */}
                    <select
                      value={rule.profile_name}
                      onChange={(e) => {
                        const next = [...schedule.rules];
                        next[idx].profile_name = e.target.value;
                        setSchedule({ ...schedule, rules: next });
                      }}
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
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Day Selector */}
                  <select
                    value={slot.day_of_week}
                    onChange={(e) => {
                      const next = [...schedule.slots];
                      next[idx].day_of_week = parseInt(e.target.value, 10);
                      setSchedule({ ...schedule, slots: next });
                    }}
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
                    onChange={(e) => {
                      const next = [...schedule.slots];
                      next[idx].start_minute = parseInt(e.target.value, 10);
                      setSchedule({ ...schedule, slots: next });
                    }}
                    className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                  >
                    {[0, 180, 360, 480, 540, 600, 720, 840, 960, 1080, 1200, 1320].map((m) => (
                      <option key={m} value={m} className="bg-[#031f1b]">
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>

                  <span className="text-xs text-[#6e8c82]">to</span>

                  {/* End Minute */}
                  <select
                    value={slot.end_minute}
                    onChange={(e) => {
                      const next = [...schedule.slots];
                      next[idx].end_minute = parseInt(e.target.value, 10);
                      setSchedule({ ...schedule, slots: next });
                    }}
                    className="bg-black/40 border border-[rgba(220,237,227,0.15)] rounded-lg px-2 py-1.5 text-xs text-[#f5f4ed]"
                  >
                    {[180, 360, 540, 720, 780, 840, 960, 1080, 1200, 1320, 1440].map((m) => (
                      <option key={m} value={m} className="bg-[#031f1b]">
                        {formatMinutes(m)}
                      </option>
                    ))}
                  </select>

                  {/* Policy Profile */}
                  <select
                    value={slot.profile_name}
                    onChange={(e) => {
                      const next = [...schedule.slots];
                      next[idx].profile_name = e.target.value;
                      setSchedule({ ...schedule, slots: next });
                    }}
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
