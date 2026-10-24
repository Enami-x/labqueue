import { ClusterModel, Job, NodeModel, PooledResources, SimEvent } from '../types';

export interface ReplayState {
  t: number;
  nodes: {
    id: number;
    name: string;
    cpu_total: number;
    cpu_allocated: number;
    cpu_available: number;
    mem_total: number;
    mem_allocated: number;
    mem_available: number;
    up: boolean;
    running_job_ids: string[];
  }[];
  pooled: {
    total: PooledResources;
    allocated: PooledResources;
    available: PooledResources;
  };
  jobs: Record<string, any>;
  ready_queue: string[];
  running_jobs: string[];
  completed_jobs: string[];
  preempted_jobs: string[];
  deadlocked_jobs: string[];
  banker_safe: boolean;
  active_profile_name: string;
  recent_events: SimEvent[];
}

export class ReplayEngine {
  private cluster: ClusterModel;
  private events: SimEvent[];
  private maxTime: number;
  private defaultProfileName: string;

  constructor(cluster: ClusterModel, events: SimEvent[], defaultProfileName: string = 'practical_session') {
    this.cluster = cluster || { nodes: [], pooled: { gpu: 0, lic: 0, io: 0 } };
    this.events = Array.isArray(events) ? [...events].sort((a, b) => (a.seq || 0) - (b.seq || 0)) : [];
    this.maxTime = this.events.length > 0 ? this.events[this.events.length - 1].t : 100;
    this.defaultProfileName = defaultProfileName;
  }

  public getMaxTime(): number {
    return this.maxTime;
  }

  public getStateAt(targetTime: number): ReplayState {
    const t = Math.max(0, Math.min(targetTime, this.maxTime));

    // Initialize base cluster state
    const nodeStateMap = new Map<number, any>();
    for (const n of this.cluster.nodes) {
      nodeStateMap.set(n.id, {
        id: n.id,
        name: n.name,
        cpu_total: n.cpu,
        cpu_allocated: 0,
        cpu_available: n.cpu,
        mem_total: n.mem,
        mem_allocated: 0,
        mem_available: n.mem,
        up: true,
        running_job_ids: [],
      });
    }

    const totalPooled: PooledResources = { ...this.cluster.pooled };
    const allocPooled: PooledResources = { gpu: 0, lic: 0, io: 0 };

    const jobsMap: Record<string, any> = {};
    const readyQueue: string[] = [];
    const runningJobs: string[] = [];
    const completedJobs: string[] = [];
    const preemptedJobs: string[] = [];
    const deadlockedJobs: string[] = [];

    let activeProfileName = this.defaultProfileName;
    let bankerSafe = true;

    // Filter events up to targetTime
    const pastEvents = this.events.filter((e) => e.t <= t);

    for (const evt of pastEvents) {
      const jid = (evt as any).job_id || evt.details?.job_id || (evt as any).job?.id;

      switch (evt.type) {
        case 'JOB_SUBMITTED':
        case 'JOB_ARRIVAL':
        case 'JOB_ARRIVED': {
          const details = evt.details || {};
          const anyEvt = evt as any;
          const jRole = anyEvt.role ?? details.role ?? 'ug';
          const jKind = anyEvt.kind ?? details.kind ?? 'assignment';
          const jCpu = anyEvt.cpu ?? details.cpu ?? 1;
          const jMem = anyEvt.mem ?? details.mem ?? 2;
          const jBurst = anyEvt.burst ?? anyEvt.duration ?? details.burst ?? details.duration ?? 5;
          const jUser = anyEvt.user_id ?? details.user_id ?? 'u0';
          const jPooled = anyEvt.pooled ?? details.pooled ?? { gpu: 0, lic: 0, io: 0 };

          jobsMap[jid] = {
            id: jid,
            user_id: jUser,
            role: jRole,
            kind: jKind,
            cpu: jCpu,
            mem: jMem,
            burst: jBurst,
            arrival: evt.t,
            state: 'queued',
            node_id: null,
            pooled: jPooled,
          };
          if (!readyQueue.includes(jid)) {
            readyQueue.push(jid);
          }
          break;
        }

        case 'JOB_DISPATCHED':
        case 'JOB_STARTED':
        case 'JOB_RESUMED': {
          const anyEvt = evt as any;
          const nid = anyEvt.node_id ?? evt.details?.node_id;
          const node = nodeStateMap.get(nid);
          const job = jobsMap[jid];

          const cpuAlloc = anyEvt.cpu ?? evt.details?.cpu ?? job?.cpu ?? 2;
          const memAlloc = anyEvt.mem ?? evt.details?.mem ?? job?.mem ?? 4;

          if (node) {
            node.cpu_allocated = Math.min(node.cpu_total, node.cpu_allocated + cpuAlloc);
            node.cpu_available = Math.max(0, node.cpu_total - node.cpu_allocated);
            node.mem_allocated = Math.min(node.mem_total, node.mem_allocated + memAlloc);
            node.mem_available = Math.max(0, node.mem_total - node.mem_allocated);
            if (!node.running_job_ids.includes(jid)) {
              node.running_job_ids.push(jid);
            }
          }

          if (job) {
            job.state = 'running';
            job.node_id = nid;
          }

          const qIdx = readyQueue.indexOf(jid);
          if (qIdx >= 0) readyQueue.splice(qIdx, 1);
          const pIdx = preemptedJobs.indexOf(jid);
          if (pIdx >= 0) preemptedJobs.splice(pIdx, 1);

          if (!runningJobs.includes(jid)) runningJobs.push(jid);
          break;
        }

        case 'JOB_PREEMPTED': {
          const anyEvt = evt as any;
          const nid = anyEvt.node_id ?? evt.details?.node_id ?? jobsMap[jid]?.node_id;
          const node = nodeStateMap.get(nid);
          const job = jobsMap[jid];

          const cpuFree = anyEvt.cpu ?? evt.details?.cpu ?? job?.cpu ?? 2;
          const memFree = anyEvt.mem ?? evt.details?.mem ?? job?.mem ?? 4;

          if (node) {
            node.cpu_allocated = Math.max(0, node.cpu_allocated - cpuFree);
            node.cpu_available = Math.min(node.cpu_total, node.cpu_total - node.cpu_allocated);
            node.mem_allocated = Math.max(0, node.mem_allocated - memFree);
            node.mem_available = Math.min(node.mem_total, node.mem_total - node.mem_allocated);
            node.running_job_ids = node.running_job_ids.filter((id: string) => id !== jid);
          }

          if (job) {
            job.state = 'preempted';
            job.node_id = null;
          }

          const rIdx = runningJobs.indexOf(jid);
          if (rIdx >= 0) runningJobs.splice(rIdx, 1);
          if (!preemptedJobs.includes(jid)) preemptedJobs.push(jid);
          if (!readyQueue.includes(jid)) readyQueue.push(jid);
          break;
        }

        case 'JOB_COMPLETED':
        case 'JOB_FINISHED': {
          const anyEvt = evt as any;
          const nid = anyEvt.node_id ?? evt.details?.node_id ?? jobsMap[jid]?.node_id;
          const node = nodeStateMap.get(nid);
          const job = jobsMap[jid];

          const cpuFree = anyEvt.cpu ?? evt.details?.cpu ?? job?.cpu ?? 2;
          const memFree = anyEvt.mem ?? evt.details?.mem ?? job?.mem ?? 4;

          if (node) {
            node.cpu_allocated = Math.max(0, node.cpu_allocated - cpuFree);
            node.cpu_available = Math.min(node.cpu_total, node.cpu_total - node.cpu_allocated);
            node.mem_allocated = Math.max(0, node.mem_allocated - memFree);
            node.mem_available = Math.min(node.mem_total, node.mem_total - node.mem_allocated);
            node.running_job_ids = node.running_job_ids.filter((id: string) => id !== jid);
          }

          if (job) {
            job.state = 'done';
            job.node_id = null;
          }

          const rIdx = runningJobs.indexOf(jid);
          if (rIdx >= 0) runningJobs.splice(rIdx, 1);
          const qIdx = readyQueue.indexOf(jid);
          if (qIdx >= 0) readyQueue.splice(qIdx, 1);

          if (!completedJobs.includes(jid)) completedJobs.push(jid);
          break;
        }

        case 'JOB_FAILED':
        case 'JOB_KILLED': {
          const anyEvt = evt as any;
          const nid = anyEvt.node_id ?? evt.details?.node_id ?? jobsMap[jid]?.node_id;
          const node = nodeStateMap.get(nid);
          const job = jobsMap[jid];

          const cpuFree = anyEvt.cpu ?? evt.details?.cpu ?? job?.cpu ?? 2;
          const memFree = anyEvt.mem ?? evt.details?.mem ?? job?.mem ?? 4;

          if (node) {
            node.cpu_allocated = Math.max(0, node.cpu_allocated - cpuFree);
            node.cpu_available = Math.min(node.cpu_total, node.cpu_total - node.cpu_allocated);
            node.mem_allocated = Math.max(0, node.mem_allocated - memFree);
            node.mem_available = Math.min(node.mem_total, node.mem_total - node.mem_allocated);
            node.running_job_ids = node.running_job_ids.filter((id: string) => id !== jid);
          }

          if (job) {
            job.state = 'done';
            job.node_id = null;
          }

          const rIdx = runningJobs.indexOf(jid);
          if (rIdx >= 0) runningJobs.splice(rIdx, 1);
          const qIdx = readyQueue.indexOf(jid);
          if (qIdx >= 0) readyQueue.splice(qIdx, 1);
          break;
        }

        case 'PHASE_GRANTED': {
          const anyEvt = evt as any;
          const req = anyEvt.request ?? evt.details?.request ?? {};
          allocPooled.gpu += req.gpu || 0;
          allocPooled.lic += req.lic || 0;
          allocPooled.io += req.io || 0;
          break;
        }

        case 'PHASE_RELEASED': {
          const anyEvt = evt as any;
          const rel = anyEvt.released ?? evt.details?.released ?? {};
          allocPooled.gpu = Math.max(0, allocPooled.gpu - (rel.gpu || 0));
          allocPooled.lic = Math.max(0, allocPooled.lic - (rel.lic || 0));
          allocPooled.io = Math.max(0, allocPooled.io - (rel.io || 0));
          break;
        }

        case 'NODE_FAILED': {
          const nid = evt.details?.node_id ?? evt.node_id;
          const node = nodeStateMap.get(nid);
          if (node) {
            node.up = false;
            node.cpu_allocated = 0;
            node.cpu_available = 0;
            node.mem_allocated = 0;
            node.mem_available = 0;
            node.running_job_ids = [];
          }
          break;
        }

        case 'NODE_RESTORED': {
          const nid = evt.details?.node_id ?? evt.node_id;
          const node = nodeStateMap.get(nid);
          if (node) {
            node.up = true;
            node.cpu_allocated = 0;
            node.cpu_available = node.cpu_total;
            node.mem_allocated = 0;
            node.mem_available = node.mem_total;
            node.running_job_ids = [];
          }
          break;
        }

        case 'PROFILE_SWITCHED': {
          // Sim events carry {from, to, reason}; live events carry details.new_profile.
          activeProfileName = evt.to || evt.details?.new_profile || activeProfileName;
          break;
        }

        case 'DEADLOCK_DETECTED': {
          bankerSafe = false;
          const victim = evt.details?.victim;
          if (victim && !deadlockedJobs.includes(victim)) {
            deadlockedJobs.push(victim);
          }
          break;
        }

        case 'DEADLOCK_RECOVERED': {
          bankerSafe = true;
          break;
        }

        case 'BANKER_DENIED': {
          bankerSafe = false;
          break;
        }
      }
    }

    const availPooled: PooledResources = {
      gpu: Math.max(0, totalPooled.gpu - allocPooled.gpu),
      lic: Math.max(0, totalPooled.lic - allocPooled.lic),
      io: Math.max(0, totalPooled.io - allocPooled.io),
    };

    return {
      t,
      nodes: Array.from(nodeStateMap.values()),
      pooled: {
        total: totalPooled,
        allocated: allocPooled,
        available: availPooled,
      },
      jobs: jobsMap,
      ready_queue: readyQueue,
      running_jobs: runningJobs,
      completed_jobs: completedJobs,
      preempted_jobs: preemptedJobs,
      deadlocked_jobs: deadlockedJobs,
      banker_safe: bankerSafe,
      active_profile_name: activeProfileName,
      recent_events: pastEvents.slice(-25).reverse(),
    };
  }
}
