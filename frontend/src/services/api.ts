import {
  ClusterModel,
  LiveStateSnapshot,
  Profile,
  RunResult,
  ScheduleConfig,
} from '../types';

const API_BASE = '/api';

export const api = {
  // System & Cluster
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  async getCluster(): Promise<ClusterModel> {
    const res = await fetch(`${API_BASE}/cluster`);
    return res.json();
  },

  // Profiles
  async getProfiles(params?: {
    family?: string;
    scheduler?: string;
    placement?: string;
    banker?: string;
  }): Promise<Profile[]> {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`${API_BASE}/profiles?${query}`);
    return res.json();
  },

  async createProfile(profile: Profile): Promise<Profile> {
    const res = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create profile');
    }
    return res.json();
  },

  // Workloads
  async getScenarios(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/workloads/scenarios`);
    return res.json();
  },

  async generateWorkload(scenario: string, seed: number = 42, n_jobs: number = 50) {
    const res = await fetch(`${API_BASE}/workloads/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, seed, n_jobs }),
    });
    return res.json();
  },

  // Runs & Simulation
  async runSimulation(payload: {
    workload_id?: number;
    scenario?: string;
    profile_name: string;
    seed?: number;
    n_jobs?: number;
  }): Promise<RunResult> {
    const res = await fetch(`${API_BASE}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Simulation run failed');
    }
    return res.json();
  },

  async getRun(runId: string): Promise<RunResult> {
    const res = await fetch(`${API_BASE}/runs/${runId}`);
    return res.json();
  },

  async getEvents(runId: string, fromSeq: number = 0, limit: number = 2000) {
    const res = await fetch(`${API_BASE}/runs/${runId}/events?from_seq=${fromSeq}&limit=${limit}`);
    return res.json();
  },

  // Batch comparison
  async runBatch(payload: {
    scenarios: string[];
    profile_names?: string[];
    filter_criteria?: any;
    seed?: number;
  }) {
    const res = await fetch(`${API_BASE}/batch/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // Calendar & Triggers
  async getSchedule(): Promise<ScheduleConfig> {
    const res = await fetch(`${API_BASE}/calendar`);
    return res.json();
  },

  async saveSchedule(schedule: ScheduleConfig) {
    const res = await fetch(`${API_BASE}/calendar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    });
    return res.json();
  },

  // Live Mode API
  async getLiveState(): Promise<LiveStateSnapshot> {
    const res = await fetch(`${API_BASE}/live/state`);
    return res.json();
  },

  async submitLiveJob(data: {
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
  }) {
    const res = await fetch(`${API_BASE}/live/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async injectLiveRush(data: {
    count: number;
    role: string;
    script_name: string;
    duration: number;
  }) {
    const res = await fetch(`${API_BASE}/live/rush`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async switchLiveProfile(profileName: string) {
    const res = await fetch(`${API_BASE}/live/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_name: profileName }),
    });
    return res.json();
  },

  async failLiveNode(nodeId: number) {
    const res = await fetch(`${API_BASE}/live/nodes/${nodeId}/fail`, { method: 'POST' });
    return res.json();
  },

  async restoreLiveNode(nodeId: number) {
    const res = await fetch(`${API_BASE}/live/nodes/${nodeId}/restore`, { method: 'POST' });
    return res.json();
  },

  async killLiveJob(jobId: string) {
    const res = await fetch(`${API_BASE}/live/jobs/${jobId}/kill`, { method: 'POST' });
    return res.json();
  },

  async restartLiveSession() {
    const res = await fetch(`${API_BASE}/live/session/restart`, { method: 'POST' });
    return res.json();
  },

  async saveLiveSession() {
    const res = await fetch(`${API_BASE}/live/session/save`, { method: 'POST' });
    return res.json();
  },
};
