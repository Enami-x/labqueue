import { ClusterModel, Job, PooledResources, SimEvent } from '../types';
import { BankerRow, safetySequence } from '../lib/banker';

/** Bookkeeping rows that carry no story for the event feed. */
export const NOISE_EVENTS = new Set(['QUEUE_STATE', 'STATE_SNAPSHOT']);
const FEED_DEPTH = 200;
const ZERO: PooledResources = { gpu: 0, lic: 0, io: 0 };

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
  /** Jobs currently holding or claiming pooled resources, with Banker vectors. */
  banker_rows: BankerRow[];
  /** A safe completion order for banker_rows, or null when the state is unsafe. */
  safe_sequence: string[] | null;
  /** Unsafe-request denials so far (most recent first). */
  denials: SimEvent[];
  active_profile_name: string;
  recent_events: SimEvent[];
}

export class ReplayEngine {
  private cluster: ClusterModel;
  private events: SimEvent[];
  private maxTime: number;
  private defaultProfileName: string;
  private maxClaim: Record<string, PooledResources>;

  constructor(
    cluster: ClusterModel,
    events: SimEvent[],
    defaultProfileName: string = 'practical_session',
    jobs: Job[] = [],
  ) {
    this.maxClaim = {};
    for (const j of jobs) if (j.max_claim) this.maxClaim[j.id] = j.max_claim;
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
    const allocByJob: Record<string, PooledResources> = {};
    const denials: SimEvent[] = [];
    const release = (jid: string) => {
      const a = allocByJob[jid];
      if (!a) return;
      allocPooled.gpu = Math.max(0, allocPooled.gpu - a.gpu);
      allocPooled.lic = Math.max(0, allocPooled.lic - a.lic);
      allocPooled.io = Math.max(0, allocPooled.io - a.io);
      delete allocByJob[jid];
    };

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
          release(jid);
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
          release(jid);
          // The simulator re-queues killed jobs (deadlock victims, node failures).
          if (evt.type === 'JOB_KILLED' && this.maxClaim[jid] !== undefined && job) {
            job.state = 'queued';
            if (!readyQueue.includes(jid)) readyQueue.push(jid);
          }
          break;
        }

        case 'PHASE_GRANTED': {
          const anyEvt = evt as any;
          const req = anyEvt.request ?? evt.details?.request ?? {};
          allocPooled.gpu += req.gpu || 0;
          allocPooled.lic += req.lic || 0;
          allocPooled.io += req.io || 0;
          const prev = allocByJob[jid] || ZERO;
          allocByJob[jid] = { gpu: prev.gpu + (req.gpu || 0), lic: prev.lic + (req.lic || 0), io: prev.io + (req.io || 0) };
          break;
        }

        case 'REQUEST_DENIED_UNSAFE':
        case 'BANKER_DENIED': {
          denials.push(evt);
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

        case 'NODE_DOWN':
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

        case 'NODE_UP':
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
          for (const d of (evt as any).jobs || []) if (!deadlockedJobs.includes(d)) deadlockedJobs.push(d);
          break;
        }

        case 'DEADLOCK_RECOVERED': {
          deadlockedJobs.length = 0;
          break;
        }
      }
    }

    const availPooled: PooledResources = {
      gpu: Math.max(0, totalPooled.gpu - allocPooled.gpu),
      lic: Math.max(0, totalPooled.lic - allocPooled.lic),
      io: Math.max(0, totalPooled.io - allocPooled.io),
    };

    // Banker view: started jobs that hold pooled resources or still claim some.
    const bankerRows: BankerRow[] = [];
    for (const [jid, job] of Object.entries(jobsMap)) {
      if (job.state === 'done') continue;
      if (job.state === 'queued' && !allocByJob[jid]) continue;
      const max = this.maxClaim[jid] || job.pooled || ZERO;
      const alloc = allocByJob[jid] || ZERO;
      if (max.gpu + max.lic + max.io === 0 && alloc.gpu + alloc.lic + alloc.io === 0) continue;
      bankerRows.push({
        id: jid,
        state: job.state,
        allocation: alloc,
        need: {
          gpu: Math.max(0, max.gpu - alloc.gpu),
          lic: Math.max(0, max.lic - alloc.lic),
          io: Math.max(0, max.io - alloc.io),
        },
      });
    }
    const safeSeq = safetySequence(availPooledFrom(totalPooled, allocPooled), bankerRows);

    return {
      t,
      banker_rows: bankerRows,
      safe_sequence: safeSeq,
      denials: denials.slice(-20).reverse(),
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
      banker_safe: safeSeq !== null,
      active_profile_name: activeProfileName,
      recent_events: pastEvents.filter((e) => !NOISE_EVENTS.has(e.type)).slice(-FEED_DEPTH).reverse(),
    };
  }
}

function availPooledFrom(total: PooledResources, alloc: PooledResources): PooledResources {
  return {
    gpu: Math.max(0, total.gpu - alloc.gpu),
    lic: Math.max(0, total.lic - alloc.lic),
    io: Math.max(0, total.io - alloc.io),
  };
}
