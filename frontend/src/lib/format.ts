/**
 * Formatting helpers. Simulated runs measure time in minutes; replays of saved
 * live sessions (and live mode itself) measure it in seconds.
 */
import { Profile, RunResult } from '../types';

export type TimeUnit = 'min' | 's';

export const unitOf = (run: RunResult | null | undefined): TimeUnit =>
  run?.metrics?.time_unit === 's' ? 's' : 'min';

const short = (unit: TimeUnit) => (unit === 's' ? 's' : 'm');

/** A duration, e.g. "0.4 min" or "118 min" or "3.2 s". */
export function fmtDuration(v: number | null | undefined, unit: TimeUnit = 'min', digits?: number): string {
  const n = Number(v ?? 0);
  const d = digits ?? (Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 1);
  return `${n.toFixed(d)} ${unit}`;
}

/** A point on the timeline: "T+12m" / "T+7s". */
export function fmtT(t: number | null | undefined, unit: TimeUnit = 'min'): string {
  const n = Number(t ?? 0);
  const v = unit === 's' && !Number.isInteger(n) ? n.toFixed(1) : Math.round(n).toString();
  return `T+${v}${short(unit)}`;
}

/** Sim time as a weekday clock (sim starts Monday 00:00), e.g. "Mon 01:58". */
export function fmtSimClock(minutes: number): string {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const m = Math.max(0, Math.floor(minutes));
  const day = days[Math.floor(m / 1440) % 7];
  const hh = Math.floor((m % 1440) / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${day} ${hh}:${mm}`;
}

export const fmtPct = (ratio: number | null | undefined, digits = 0) =>
  `${(Number(ratio ?? 0) * 100).toFixed(digits)}%`;

export const isVariant = (name: string) => name.includes('[');

const PLACEMENT: Record<string, string> = { first: 'first-fit', best: 'best-fit', worst: 'worst-fit' };

/**
 * Readable variant names:
 *   "practical_session[first|off|q2]"  -> "practical_session · first-fit · Banker off · q=2"
 *   "exam_week[best|strict|age0.05]"   -> "exam_week · best-fit · Banker strict · aging 0.05"
 */
export function profileLabel(name: string): string {
  const m = name.match(/^(.*)\[(\w+)\|(\w+)\|(q|age)([\d.]+)\]$/);
  if (!m) return name;
  const [, base, placement, banker, knob, val] = m;
  const knobText = knob === 'q' ? `q=${val}` : `aging ${val}`;
  return `${base} · ${PLACEMENT[placement] ?? placement} · Banker ${banker} · ${knobText}`;
}

/** Profile grouping used by every picker: base first, then custom, then variants. */
export function groupProfiles(profiles: Profile[]) {
  return {
    base: profiles.filter((p) => !p.is_custom && !isVariant(p.name)),
    custom: profiles.filter((p) => p.is_custom),
    variants: profiles.filter((p) => !p.is_custom && isVariant(p.name)),
  };
}

export const ROLE_LABEL: Record<string, string> = {
  ug: 'Undergrad',
  phd: 'PhD',
  faculty: 'Faculty',
  exam: 'Exam',
  demo: 'Demo',
  guest: 'Guest',
};

/** Gantt / legend tone per role. Session roles share a hue, as do the two low-priority roles. */
export const ROLE_TONE: Record<string, string> = {
  ug: 'undergrad',
  guest: 'undergrad',
  phd: 'phd',
  faculty: 'faculty',
  exam: 'exam',
  demo: 'exam',
};

export const nodeLabel = (cpu: number, mem: number) => `${cpu} vCPU · ${mem} GB`;
