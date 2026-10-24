import {
  ClusterModel,
  FieldError,
  LiveStateSnapshot,
  Profile,
  RunResult,
  ScheduleConfig,
  WorkloadSummary,
} from '../types';

const API_BASE = '/api';

/**
 * Error thrown for any non-2xx response. `message` is the backend's `detail`
 * (joined when it's a list of field errors); `fieldErrors` keeps the list so
 * forms can show each error next to the input it belongs to.
 */
export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function parseDetail(detail: unknown): { message: string; fieldErrors: FieldError[] } {
  if (typeof detail === 'string') return { message: detail, fieldErrors: [] };
  if (Array.isArray(detail)) {
    const fieldErrors: FieldError[] = detail
      .filter((d) => d && typeof d === 'object' && 'msg' in d)
      .map((d: any) => ({ loc: Array.isArray(d.loc) ? d.loc : [], msg: String(d.msg) }));
    return { message: fieldErrors.map((e) => e.msg).join('; '), fieldErrors };
  }
  return { message: '', fieldErrors: [] };
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const options: RequestInit = { ...rest };
  if (json !== undefined) {
    options.body = JSON.stringify(json);
    options.headers = { 'Content-Type': 'application/json', ...(rest.headers || {}) };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new ApiError(0, 'Cannot reach the LabQueue API. Is the backend running on port 8000?');
  }

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const { message, fieldErrors } = parseDetail(body?.detail ?? body);
    throw new ApiError(res.status, message || `${res.status} ${res.statusText}`, fieldErrors);
  }
  return body as T;
}

const post = <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json });

export interface ScenarioInfo {
  name: string;
  description: string;
  duration: number;
}

export interface GeneratedWorkload extends WorkloadSummary {
  id: number;
  workload_id: number;
}

export interface LiveSubmitPayload {
  user_id: string;
  role: string;
  kind: string;
  cpu: number;
  mem: number;
  duration: number;
  script_name: string;
  gpu?: number;
  lic?: number;
  io?: number;
}

export const api = {
  // System & cluster
  getHealth: () => request<{ status: string; version: string }>('/health'),
  getCluster: () => request<ClusterModel>('/cluster'),

  // Profiles
  getProfiles(params: Record<string, string | number> = {}) {
    const query = new URLSearchParams({ limit: '1000', ...params } as Record<string, string>);
    return request<Profile[]>(`/profiles?${query}`);
  },

  createProfile: (profile: Profile) => post<Profile>('/profiles/custom', { data: profile }),

  // Workloads
  getScenarios: () => request<ScenarioInfo[]>('/scenarios'),

  generateWorkload: (scenario: string, seed = 42, n_jobs = 50) =>
    post<GeneratedWorkload>('/workloads/generate', { scenario, seed, n_jobs }),

  // Runs
  runSimulation: (payload: {
    workload_id?: number;
    scenario?: string;
    profile_name?: string;
    use_schedule?: boolean;
    seed?: number;
    n_jobs?: number;
  }) => post<RunResult>('/runs', payload),

  getRun: (runId: string) => request<RunResult>(`/runs/${encodeURIComponent(runId)}`),

  // Calendar
  getSchedule: () => request<ScheduleConfig>('/calendar'),
  saveSchedule: (schedule: ScheduleConfig) =>
    request<ScheduleConfig>('/calendar', { method: 'PUT', json: schedule }),

  // Live mode
  getLiveState: () => request<LiveStateSnapshot>('/live/state'),
  submitLiveJob: (data: LiveSubmitPayload) =>
    post<{ status: string; job_id: string }>('/live/jobs', data),
  injectLiveRush: (data: { count: number; role: string; script_name: string; duration: number }) =>
    post<{ status: string; job_ids: string[] }>('/live/rush', data),
  switchLiveProfile: (profileName: string) =>
    post<{ status: string; profile: string }>('/live/profile', { profile_name: profileName }),
  failLiveNode: (nodeId: number) => post<{ status: string }>(`/live/nodes/${nodeId}/fail`),
  restoreLiveNode: (nodeId: number) => post<{ status: string }>(`/live/nodes/${nodeId}/restore`),
  killLiveJob: (jobId: string) =>
    post<{ status: string }>(`/live/jobs/${encodeURIComponent(jobId)}/kill`),
  restartLiveSession: () => post<{ status: string; session_id: string }>('/live/session/restart'),
  saveLiveSession: () => post<{ status: string; run_id: string }>('/live/session/save'),
};
