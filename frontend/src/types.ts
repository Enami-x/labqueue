/**
 * Types for LabQueue Scheduling System
 */

export type Role = 'ug' | 'phd' | 'faculty' | 'exam' | 'demo' | 'guest';

export type JobKind = 'training' | 'preprocess' | 'inference' | 'assignment' | 'demo';

export type JobState = 'queued' | 'running' | 'blocked' | 'preempted' | 'done';

export type SchedulerKind = 'FCFS' | 'SJF' | 'RR' | 'PRIORITY';

export type PlacementKind = 'first' | 'best' | 'worst';

export type BankerMode = 'off' | 'lenient' | 'strict';

export interface PooledResources {
  gpu: number;
  lic: number;
  io: number;
}

export interface Phase {
  at: number;
  request: PooledResources;
}

export interface JobRuntime {
  remaining: number;
  node_id: number | null;
  cpu_alloc: number;
  mem_alloc: number;
  pooled_alloc: PooledResources;
  restarts: number;
  first_start: number | null;
  finish: number | null;
  preempted_total: number;
}

export interface Job {
  id: string;
  user_id: string;
  role: Role;
  kind: JobKind;
  arrival: number;
  burst: number;
  deadline?: number | null;
  cpu: number;
  mem: number;
  phases: Phase[];
  max_claim: PooledResources;
  state?: JobState;
  runtime?: JobRuntime;
}

export interface NodeModel {
  id: number;
  name: string;
  cpu: number;
  mem: number;
  up: boolean;
  is_large?: boolean;
  allocated_cpu?: number;
  allocated_mem?: number;
}

export interface ClusterModel {
  nodes: NodeModel[];
  pooled: PooledResources;
}

export interface PriorityWeights {
  role: number;
  deadline: number;
  wait: number;
  size: number;
}

export interface Profile {
  id?: number | null;
  name: string;
  family: string;
  scheduler: SchedulerKind;
  quantum?: number | null;
  preemptive: boolean;
  aging_rate: number;
  weights?: PriorityWeights | null;
  placement: PlacementKind;
  banker: BankerMode;
  quota_per_user?: number | null;
  reserved_role?: Role | null;
  reserved_pct: number;
  preempt_by?: Role[] | null;
  backfill: boolean;
  is_custom?: boolean;
}

export interface SimEvent {
  seq: number;
  t: number;
  type: string;
  job_id?: string | null;
  details?: Record<string, any>;
  [key: string]: any;
}

export interface RoleMetrics {
  count: number;
  avg_wait: number;
  p95_wait: number;
  max_wait: number;
  avg_turnaround: number;
  avg_response: number;
  deadline_misses: number;
}

/** Metrics from engine/metrics.py. All times are simulated minutes. */
export interface RunMetrics {
  avg_wait: number;
  p95_wait: number;
  p99_wait: number;
  max_wait: number;
  avg_turnaround: number;
  avg_response: number;
  makespan: number;
  throughput: number;
  utilization: number;
  cpu_util_avg: number;
  avg_fragmentation: number;
  deadline_misses: number;
  deadline_miss_rate: number;
  starvation_count: number;
  starved_jobs: number;
  fairness_index: number;
  jains_fairness: number;
  preemptions: number;
  restarts: number;
  deadlocks_detected: number;
  banker_denials: number;
  jobs_completed: number;
  total_jobs: number;
  by_role: Record<string, RoleMetrics>;
  /** 's' for replays of saved live sessions; simulated runs are in minutes. */
  time_unit?: 'min' | 's';
  time_series?: {
    t: number[];
    queue_len: number[];
    utilization: number[];
    fragmentation: number[];
  };
}

export interface WorkloadSummary {
  scenario?: string | null;
  seed?: number | null;
  jobs: Job[];
  node_events: { at: number; node_id: number; type: string }[];
}

export interface RunResult {
  id?: number;
  run_id: string;
  profile_name: string;
  seed: number;
  metrics: RunMetrics;
  events: SimEvent[];
  event_log_hash?: string;
  workload?: WorkloadSummary | null;
  /** Set for calendar-driven runs: the profile active at T=0. */
  initial_profile?: string;
}

export interface LiveJobBrief {
  id: string;
  user_id: string;
  role: Role;
  kind: JobKind;
  cpu: number;
  mem: number;
  pooled: PooledResources;
  seq: number;
}

export interface LiveBankerRow {
  id: string;
  state: string;
  allocation: PooledResources;
  need: PooledResources;
  max_claim: PooledResources;
}

/** STATE_SNAPSHOT / INIT_STATE payload from live/live_runner.py. Times are seconds. */
export interface LiveStateSnapshot {
  session_id: string;
  profile: string;
  policy: {
    scheduler: SchedulerKind;
    quantum: number | null;
    preemptive: boolean;
    preempt_by: Role[];
    placement: PlacementKind;
    banker: BankerMode;
    backfill: boolean;
    quota_per_user: number | null;
  };
  elapsed_seconds: number;
  nodes: {
    id: number;
    name: string;
    is_up: boolean;
    cpu_total: number;
    cpu_allocated: number;
    cpu_available: number;
    mem_total: number;
    mem_allocated: number;
    mem_available: number;
    running_job_ids: string[];
  }[];
  pooled: {
    total: PooledResources;
    available: PooledResources;
  };
  banker_safe_sequence?: string[] | null;
  banker: {
    mode: BankerMode;
    safe: boolean;
    jobs: LiveBankerRow[];
  };
  counts: {
    ready: number;
    running: number;
    suspended: number;
    completed: number;
    failed: number;
    total: number;
  };
  ready_queue: (LiveJobBrief & { arrival: number; suspended: boolean; score: number })[];
  running_jobs: (LiveJobBrief & {
    node_id: number;
    script: string | null;
    remaining: number;
    metrics: {
      status: string;
      cpu_percent: number;
      memory_rss_mb: number;
    };
  })[];
}

// ---------------------------------------------------------------------------
// Calendar schedule (mirrors engine/schedule.py)
// ---------------------------------------------------------------------------

export interface CalendarSlot {
  day_of_week: number; // 0=Mon, 6=Sun
  start_minute: number;
  end_minute: number;
  profile_name: string;
}

export type ConditionField = 'queue_len' | 'nodes_down' | 'min_slack' | 'util' | 'running_count';

export type ConditionOp = '<' | '>' | '<=' | '>=' | '==' | '!=';

export interface TriggerCondition {
  field: ConditionField | string;
  op: ConditionOp;
  value: number;
}

export interface TriggerRule {
  priority: number;
  conditions: TriggerCondition[];
  profile_name: string;
  cooldown: number;
}

export interface ScheduleConfig {
  default_profile_name: string;
  slots: CalendarSlot[];
  rules: TriggerRule[];
}

/** One entry of a FastAPI-style 422 body: {"detail": [{loc, msg}]}. */
export interface FieldError {
  loc: (string | number)[];
  msg: string;
}
