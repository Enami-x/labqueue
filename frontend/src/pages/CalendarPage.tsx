import React, { useState, useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import { ScheduleConfig, CalendarSlot, TriggerRule } from '../types';
import { Calendar, Plus, Trash2, Save, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

export const CalendarPage: React.FC = () => {
  const { profiles } = useLabStore();

  const [schedule, setSchedule] = useState<ScheduleConfig>({
    default_profile: 'practical_session',
    slots: [
      {
        day_of_week: 0,
        start_minute: 540,
        end_minute: 780,
        profile_name: 'practical_session',
        label: 'Monday Practical Session (09:00 - 13:00)',
      },
      {
        day_of_week: 2,
        start_minute: 840,
        end_minute: 1080,
        profile_name: 'exam_week',
        label: 'Wednesday Midterm Rush (14:00 - 18:00)',
      },
      {
        day_of_week: 4,
        start_minute: 1080,
        end_minute: 1440,
        profile_name: 'thesis_deadline',
        label: 'Friday Overnight Research (18:00 - 24:00)',
      },
    ],
    triggers: [
      {
        id: 'rule_outage',
        name: 'Node Hardware Outage Recovery',
        priority: 100,
        profile_name: 'node_failure_recovery',
        condition: { type: 'nodes_down', op: '>=', threshold: 1 },
      },
      {
        id: 'rule_rush',
        name: 'Sudden Queue Explosion / Rush',
        priority: 50,
        profile_name: 'exam_week',
        condition: { type: 'queue_length', op: '>', threshold: 20 },
      },
      {
        id: 'rule_starvation',
        name: 'Anti-Starvation Threshold Breached',
        priority: 70,
        profile_name: 'assignment_crunch',
        condition: { type: 'starvation_count', op: '>', threshold: 5 },
      },
    ],
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getSchedule().then((data) => {
      if (data && data.slots) setSchedule(data);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSchedule(schedule);
      setSaveMsg('Calendar schedule and trigger rules persisted successfully!');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: any) {
      setSaveMsg('Failed to save schedule');
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
      start_minute: 600,
      end_minute: 840,
      profile_name: profiles[0]?.name || 'practical_session',
      label: 'Scheduled Lab Block (10:00 - 14:00)',
    };
    setSchedule({ ...schedule, slots: [...schedule.slots, newSlot] });
  };

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex-1 p-6 max-w-[1400px] w-full mx-auto space-y-6 overflow-y-auto font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-cr-border">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cr-cyan" />
            Calendar Scheduling & Outage Trigger Rules
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Define recurring time-of-day policies and automated reactive condition rules
            (spec §4). Triggers take immediate precedence over calendar slots.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-cr-cyan/20 hover:bg-cr-cyan/30 text-cr-cyan border border-cr-cyan/40 rounded-xl font-bold transition cr-glow-cyan"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Schedule Rules'}</span>
        </button>
      </div>

      {saveMsg && (
        <div className="p-3 rounded-lg bg-cr-emerald/20 border border-cr-emerald/40 text-cr-emerald font-bold">
          {saveMsg}
        </div>
      )}

      {/* Default Fallback Profile */}
      <div className="p-4 bg-cr-surface border border-cr-border rounded-xl flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-white uppercase block">
            Default Fallback Profile
          </span>
          <span className="text-[11px] text-slate-400 font-sans">
            Applied when no specific calendar slot or reactive trigger matches.
          </span>
        </div>
        <select
          value={schedule.default_profile}
          onChange={(e) => setSchedule({ ...schedule, default_profile: e.target.value })}
          className="bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none"
        >
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.scheduler})
            </option>
          ))}
        </select>
      </div>

      {/* Reactive Trigger Rules (Spec §4.2) */}
      <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-cr-border pb-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-cr-amber" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Reactive Trigger Rules (Highest Priority)
            </h2>
          </div>
        </div>

        <div className="space-y-2">
          {schedule.triggers.map((trig, idx) => (
            <div
              key={trig.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-cr-card border border-cr-border gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{trig.name}</span>
                  <span className="px-1.5 py-0.2 rounded bg-cr-border text-slate-400 text-[10px]">
                    Priority {trig.priority}
                  </span>
                </div>
                <div className="text-[11px] text-cr-amber mt-1">
                  IF <b className="text-white">{trig.condition.type}</b> {trig.condition.op} {trig.condition.threshold} → SWITCH POLICY TO{' '}
                  <b className="text-cr-cyan">{trig.profile_name}</b>
                </div>
              </div>

              <select
                value={trig.profile_name}
                onChange={(e) => {
                  const next = [...schedule.triggers];
                  next[idx].profile_name = e.target.value;
                  setSchedule({ ...schedule, triggers: next });
                }}
                className="bg-cr-surface border border-cr-border rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Slots */}
      <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-cr-border pb-2.5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cr-cyan" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Weekly Planned Time Slots ({schedule.slots.length} Slots)
            </h2>
          </div>
          <button
            onClick={addSlot}
            className="flex items-center gap-1 px-2.5 py-1 bg-cr-cyan/20 text-cr-cyan border border-cr-cyan/40 rounded-lg text-xs font-bold hover:bg-cr-cyan/30 transition"
          >
            <Plus className="w-3.5 h-3.5" /> <span>Add Time Slot</span>
          </button>
        </div>

        <div className="space-y-2">
          {schedule.slots.map((slot, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 rounded-lg bg-cr-card border border-cr-border"
            >
              <div className="flex items-center gap-4">
                <span className="w-12 text-center px-2 py-1 bg-cr-surface rounded border border-cr-border font-bold text-cr-cyan">
                  {days[slot.day_of_week]}
                </span>
                <div>
                  <span className="text-white font-bold block">{slot.label}</span>
                  <span className="text-slate-400 text-[11px]">
                    Minutes: {slot.start_minute}m - {slot.end_minute}m • Policy:{' '}
                    <b className="text-cr-emerald">{slot.profile_name}</b>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={slot.profile_name}
                  onChange={(e) => {
                    const next = [...schedule.slots];
                    next[idx].profile_name = e.target.value;
                    setSchedule({ ...schedule, slots: next });
                  }}
                  className="bg-cr-surface border border-cr-border rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  {profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => removeSlot(idx)}
                  className="p-1.5 rounded-lg bg-cr-rose/20 text-cr-rose hover:bg-cr-rose/30 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
