"""
backend/live/live_runner.py – Real-time scheduling engine and process manager.

Executes real OS child processes, applies scheduling policies, enforces Banker's
safety and quotas, handles preemption and node failures, and emits live event streams.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import time
import uuid
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set

from engine.banker import BankerState
from engine.model import (
    DEFAULT_CLUSTER, BankerMode, Cluster, Job, JobKind, JobRuntime,
    JobState, Node, Phase, PooledResources, Role, SchedulerKind
)
from engine.placement import place
from engine.profiles import BASE_PROFILES, Profile
from engine.scheduler import priority_score
from live.process_executor import ProcessExecutor

logger = logging.getLogger("labqueue.live")


class LiveRunner:
    """
    Coordinates live process execution and dynamic scheduling.
    Runs an asynchronous event loop that polls processes, enforces scheduling
    policies, handles node outages, and streams events via WebSockets.
    """

    def __init__(
        self,
        cluster: Optional[Cluster] = None,
        profile: Optional[Profile] = None,
        tick_interval: float = 0.1,  # 100ms tick
    ):
        self.cluster = cluster or DEFAULT_CLUSTER
        self.profile = profile or BASE_PROFILES[0]  # default to FCFS
        self.tick_interval = tick_interval
        self.executor = ProcessExecutor()

        self.banker = BankerState(self.cluster.pooled)
        self.session_id: str = f"live_{uuid.uuid4().hex[:8]}"
        self.start_wall_time: float = time.time()
        self.seq_counter: int = 0

        # Mutable node state
        self.node_up: Dict[int, bool] = {n.id: n.up for n in self.cluster.nodes}
        self.free_cpu: Dict[int, int] = {n.id: n.cpu for n in self.cluster.nodes}
        self.free_mem: Dict[int, int] = {n.id: n.mem for n in self.cluster.nodes}

        self.jobs: Dict[str, Job] = {}
        self.ready_queue: List[str] = []
        self.running_jobs: Dict[str, int] = {}  # job_id -> node_id int
        self.suspended_jobs: Dict[str, int] = {}  # job_id -> node_id int
        self.completed_jobs: List[str] = []
        self.failed_jobs: List[str] = []

        # Tracking execution time for RR quantum
        self.job_time_in_quantum: Dict[str, float] = {}
        self.job_total_runtime: Dict[str, float] = {}
        self.job_script_info: Dict[str, Dict[str, Any]] = {}

        # User concurrency tracking for quotas
        self.user_running: Dict[str, int] = defaultdict(int)

        # Events log
        self.events: List[Dict[str, Any]] = []
        self.subscribers: Set[asyncio.Queue] = set()

        self._loop_task: Optional[asyncio.Task] = None
        self._running: bool = False
        self._lock: Optional[asyncio.Lock] = None
        self._last_snapshot_time: float = 0.0

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def current_time(self) -> float:
        """Seconds elapsed since session start."""
        return round(time.time() - self.start_wall_time, 2)

    def _next_seq(self) -> int:
        s = self.seq_counter
        self.seq_counter += 1
        return s

    def _emit(self, event_type: str, details: Optional[Dict[str, Any]] = None, job_id: Optional[str] = None):
        evt = {
            "seq": self._next_seq(),
            "t": self.current_time,
            "type": event_type,
            "job_id": job_id,
            "details": details or {},
        }
        self.events.append(evt)
        # Notify subscribers
        for q in list(self.subscribers):
            try:
                q.put_nowait(evt)
            except asyncio.QueueFull:
                pass

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subscribers.discard(q)

    async def start(self):
        """Start the runner background loop."""
        if self._running:
            return
        self._running = True
        self.start_wall_time = time.time()
        self._emit("SESSION_STARTED", {
            "session_id": self.session_id,
            "profile": self.profile.name,
            "nodes": len(self.cluster.nodes),
            "pooled": self.cluster.pooled.model_dump(),
        })
        self._loop_task = asyncio.create_task(self._run_loop())

    async def stop(self):
        """Stop runner and clean up processes."""
        self._running = False
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        self.executor.cleanup_all()
        self._emit("SESSION_STOPPED", {"session_id": self.session_id})

    async def submit_job(
        self,
        user_id: str = "u0",
        role: Role = Role.ug,
        kind: JobKind = JobKind.training,
        cpu: int = 1,
        mem: int = 2,
        duration: float = 5.0,
        script_name: str = "cpu_burn.py",
        pooled_request: Optional[PooledResources] = None,
        job_id: Optional[str] = None,
    ) -> Job:
        """Submit a job into the live queue."""
        burst_val = max(1, int(round(duration)))
        async with self._get_lock():
            jid = job_id or f"job_{uuid.uuid4().hex[:6]}"
            req = pooled_request or PooledResources()

            job = Job(
                id=jid,
                user_id=user_id,
                role=role,
                kind=kind,
                arrival=int(self.current_time),
                burst=burst_val,
                cpu=cpu,
                mem=mem,
                max_claim=req,
                phases=[Phase(at=0, request=req)] if not req.is_zero() else [],
            )
            job.state = JobState.queued
            job.runtime = JobRuntime(remaining=burst_val)

            self.jobs[jid] = job
            self.ready_queue.append(jid)
            self.job_time_in_quantum[jid] = 0.0
            self.job_total_runtime[jid] = 0.0
            self.job_script_info[jid] = {
                "script_name": script_name,
                "duration": duration,
            }

            self._emit("JOB_SUBMITTED", {
                "user_id": user_id,
                "role": role.value,
                "kind": kind.value,
                "cpu": cpu,
                "mem": mem,
                "duration": duration,
                "script": script_name,
                "pooled": req.model_dump(),
            }, job_id=jid)

            return job

    async def inject_rush(
        self,
        count: int = 5,
        role: Role = Role.ug,
        script_name: str = "matrix_mult.py",
        duration: float = 4.0,
    ) -> List[str]:
        """Inject a batch of rush jobs concurrently."""
        ids = []
        for i in range(count):
            uid = f"rush_user_{i % 3}"
            job = await self.submit_job(
                user_id=uid,
                role=role,
                kind=JobKind.assignment,
                cpu=1,
                mem=2,
                duration=duration,
                script_name=script_name,
                job_id=f"rush_{uuid.uuid4().hex[:4]}",
            )
            ids.append(job.id)
        self._emit("RUSH_INJECTED", {"count": count, "role": role.value})
        return ids

    async def set_profile(self, profile: Profile):
        """Dynamically switch the active scheduling policy."""
        async with self._get_lock():
            old = self.profile.name
            self.profile = profile
            # Reset RR quanta for currently running jobs
            for jid in self.running_jobs:
                self.job_time_in_quantum[jid] = 0.0
            self._emit("PROFILE_SWITCHED", {
                "old_profile": old,
                "new_profile": profile.name,
                "family": profile.family,
                "scheduler": profile.scheduler.value,
            })

    async def fail_node(self, node_id: int):
        """Simulate a hardware failure on a node."""
        async with self._get_lock():
            self.node_up[node_id] = False

            # Evict any jobs currently running on this node
            evicted = [jid for jid, nid in self.running_jobs.items() if nid == node_id]
            for jid in evicted:
                self.executor.kill(jid)
                job = self.jobs[jid]
                job.state = JobState.done  # mark done/failed
                self.running_jobs.pop(jid, None)
                self.failed_jobs.append(jid)

                # Release resources
                node = self.cluster.node_by_id(node_id)
                if node:
                    self.free_cpu[node_id] = min(node.cpu, self.free_cpu[node_id] + job.cpu)
                    self.free_mem[node_id] = min(node.mem, self.free_mem[node_id] + job.mem)

                self.user_running[job.user_id] = max(0, self.user_running.get(job.user_id, 1) - 1)
                self.banker.deregister(jid)

                self._emit("JOB_FAILED", {"reason": f"Node {node_id} failure", "node_id": node_id}, job_id=jid)

            self._emit("NODE_FAILED", {"node_id": node_id})

    async def restore_node(self, node_id: int):
        """Restore a failed node back to healthy state."""
        async with self._get_lock():
            node = self.cluster.node_by_id(node_id)
            if not node:
                return
            self.node_up[node_id] = True
            self.free_cpu[node_id] = node.cpu
            self.free_mem[node_id] = node.mem
            self._emit("NODE_RESTORED", {"node_id": node_id})

    async def kill_job(self, job_id: str, reason: str = "Admin kill"):
        """Terminate a specific job immediately."""
        async with self._get_lock():
            if job_id in self.ready_queue:
                self.ready_queue.remove(job_id)
            self.executor.kill(job_id)
            nid = self.running_jobs.pop(job_id, None)
            self.suspended_jobs.pop(job_id, None)

            job = self.jobs.get(job_id)
            if job:
                job.state = JobState.done
                self.failed_jobs.append(job_id)
                if nid is not None:
                    node = self.cluster.node_by_id(nid)
                    if node:
                        self.free_cpu[nid] = min(node.cpu, self.free_cpu[nid] + job.cpu)
                        self.free_mem[nid] = min(node.mem, self.free_mem[nid] + job.mem)
                self.user_running[job.user_id] = max(0, self.user_running.get(job.user_id, 1) - 1)
                self.banker.deregister(job_id)

            self._emit("JOB_KILLED", {"reason": reason}, job_id=job_id)

    async def _run_loop(self):
        """Continuous background tick loop."""
        while self._running:
            try:
                await self._tick()
            except Exception as e:
                logger.exception("Error in LiveRunner tick: %s", e)
            await asyncio.sleep(self.tick_interval)

    async def _tick(self):
        """Execute one simulation step across wall-clock time."""
        async with self._get_lock():
            now = self.current_time

            # 1. Check for finished running jobs
            finished_ids = []
            for jid, nid in list(self.running_jobs.items()):
                rc = self.executor.poll(jid)
                if rc is not None:
                    finished_ids.append((jid, nid, rc))

            for jid, nid, rc in finished_ids:
                job = self.jobs[jid]
                node = self.cluster.node_by_id(nid)
                if node:
                    self.free_cpu[nid] = min(node.cpu, self.free_cpu[nid] + job.cpu)
                    self.free_mem[nid] = min(node.mem, self.free_mem[nid] + job.mem)

                self.user_running[job.user_id] = max(0, self.user_running.get(job.user_id, 1) - 1)
                self.banker.deregister(jid)
                self.running_jobs.pop(jid, None)

                if rc == 0:
                    job.state = JobState.done
                    self.completed_jobs.append(jid)
                    if job.runtime:
                        job.runtime.remaining = 0
                    self._emit("JOB_COMPLETED", {"exit_code": 0, "node_id": nid}, job_id=jid)
                else:
                    job.state = JobState.done
                    self.failed_jobs.append(jid)
                    self._emit("JOB_FAILED", {"exit_code": rc, "node_id": nid}, job_id=jid)

            # 2. Check RR Preemption
            if self.profile.scheduler == SchedulerKind.RR and self.profile.quantum:
                quantum = float(self.profile.quantum)
                preempt_ids = []
                for jid in list(self.running_jobs.keys()):
                    self.job_time_in_quantum[jid] += self.tick_interval
                    if self.job_time_in_quantum[jid] >= quantum:
                        preempt_ids.append(jid)

                for jid in preempt_ids:
                    # Preempt and suspend
                    success = self.executor.suspend(jid)
                    if success:
                        nid = self.running_jobs.pop(jid)
                        job = self.jobs[jid]
                        job.state = JobState.preempted
                        node = self.cluster.node_by_id(nid)
                        if node:
                            self.free_cpu[nid] = min(node.cpu, self.free_cpu[nid] + job.cpu)
                            self.free_mem[nid] = min(node.mem, self.free_mem[nid] + job.mem)

                        self.user_running[job.user_id] = max(0, self.user_running.get(job.user_id, 1) - 1)
                        self.suspended_jobs[jid] = nid
                        self.ready_queue.append(jid)
                        self.job_time_in_quantum[jid] = 0.0
                        self._emit("JOB_PREEMPTED", {"node_id": nid, "reason": "quantum_expired"}, job_id=jid)

            # 3. Dispatch pass: sort ready queue
            if self.ready_queue:
                ready_job_objs = [self.jobs[jid] for jid in self.ready_queue if jid in self.jobs]

                # Policy sorting
                if self.profile.scheduler == SchedulerKind.SJF:
                    ready_job_objs.sort(key=lambda j: (j.burst, j.arrival, j.id))
                elif self.profile.scheduler == SchedulerKind.PRIORITY:
                    ready_job_objs.sort(key=lambda j: (-priority_score(j, int(now), self.profile), j.arrival, j.id))
                else:
                    # FCFS / RR
                    ready_job_objs.sort(key=lambda j: (j.arrival, j.id))

                # Virtual nodes with current up status
                active_nodes = [
                    Node(id=n.id, name=n.name, cpu=n.cpu, mem=n.mem, up=self.node_up[n.id])
                    for n in self.cluster.nodes
                ]

                dispatched = []
                for job in ready_job_objs:
                    # Check per-user quota
                    if self.profile.quota_per_user is not None:
                        curr = self.user_running[job.user_id]
                        if curr >= self.profile.quota_per_user:
                            continue

                    # Soft reservation check:
                    if self.profile.reserved_role and self.profile.reserved_pct > 0 and job.role != self.profile.reserved_role:
                        n_res = int(math.ceil(self.profile.reserved_pct * len(self.cluster.nodes)))
                        reserved_ids = {n.id for n in sorted(self.cluster.nodes, key=lambda n: n.id)[:n_res]}
                        waiting_reserved = any(self.jobs[j].role == self.profile.reserved_role for j in self.ready_queue if j in self.jobs)
                        if waiting_reserved and all(n.id in reserved_ids for n in active_nodes if n.up and self.free_cpu[n.id] >= job.cpu and self.free_mem[n.id] >= job.mem):
                            continue

                    # Try node placement
                    target_node_id = place(
                        job=job,
                        nodes=active_nodes,
                        free_cpu=self.free_cpu,
                        free_mem=self.free_mem,
                        strategy=self.profile.placement,
                    )
                    if target_node_id is None:
                        continue

                    # Check Banker safety for pooled request
                    req = job.max_claim or PooledResources()
                    if not req.is_zero():
                        granted, reason = self.banker.try_grant(job, req, self.profile.banker)
                        if not granted:
                            continue

                    # Dispatch job!
                    self.free_cpu[target_node_id] -= job.cpu
                    self.free_mem[target_node_id] -= job.mem
                    self.user_running[job.user_id] += 1

                    if job.id in self.suspended_jobs:
                        # Resume previously preempted process
                        self.executor.resume(job.id)
                        self.suspended_jobs.pop(job.id, None)
                        job.state = JobState.running
                        self.running_jobs[job.id] = target_node_id
                        self.job_time_in_quantum[job.id] = 0.0
                        dispatched.append(job.id)
                        self._emit("JOB_RESUMED", {"node_id": target_node_id}, job_id=job.id)
                    else:
                        # Spawn new process
                        sinfo = self.job_script_info.get(job.id, {})
                        sname = sinfo.get("script_name", "cpu_burn.py")
                        dur = sinfo.get("duration", 5.0)

                        try:
                            self.executor.spawn(job.id, script_name=sname, duration=dur)
                            job.state = JobState.running
                            if job.runtime:
                                job.runtime.node_id = target_node_id
                                job.runtime.first_start = int(now)
                            self.running_jobs[job.id] = target_node_id
                            self.job_time_in_quantum[job.id] = 0.0
                            dispatched.append(job.id)
                            node_obj = self.cluster.node_by_id(target_node_id)
                            self._emit("JOB_DISPATCHED", {
                                "node_id": target_node_id,
                                "node_name": node_obj.name if node_obj else f"n{target_node_id}",
                                "cpu": job.cpu,
                                "mem": job.mem,
                            }, job_id=job.id)
                        except Exception as e:
                            logger.error("Failed to spawn process for job %s: %s", job.id, e)
                            self.free_cpu[target_node_id] += job.cpu
                            self.free_mem[target_node_id] += job.mem
                            self.user_running[job.user_id] -= 1
                            self.banker.deregister(job.id)
                            job.state = JobState.done
                            self.failed_jobs.append(job.id)
                            dispatched.append(job.id)

                for jid in dispatched:
                    if jid in self.ready_queue:
                        self.ready_queue.remove(jid)

            # 4. Periodic snapshot emission (every 1.0s)
            if now - self._last_snapshot_time >= 1.0:
                self._last_snapshot_time = now
                self._emit("STATE_SNAPSHOT", self._build_state_snapshot())

    def _build_state_snapshot(self) -> Dict[str, Any]:
        """Build full snapshot dict for UI visualization."""
        node_stats = []
        for n in self.cluster.nodes:
            is_up = self.node_up.get(n.id, True)
            avail_c = self.free_cpu.get(n.id, n.cpu)
            avail_m = self.free_mem.get(n.id, n.mem)
            node_stats.append({
                "id": n.id,
                "name": n.name,
                "is_up": is_up,
                "cpu_total": n.cpu,
                "cpu_allocated": n.cpu - avail_c,
                "cpu_available": avail_c,
                "mem_total": n.mem,
                "mem_allocated": n.mem - avail_m,
                "mem_available": avail_m,
            })

        # Process metrics for running jobs
        process_metrics = {}
        for jid in self.running_jobs:
            process_metrics[jid] = self.executor.get_metrics(jid)

        return {
            "session_id": self.session_id,
            "profile": self.profile.name,
            "elapsed_seconds": self.current_time,
            "nodes": node_stats,
            "pooled": {
                "total": self.banker.total.model_dump(),
                "available": self.banker.available.model_dump(),
            },
            "banker_safe_sequence": self.banker.safety_sequence(),
            "counts": {
                "ready": len(self.ready_queue),
                "running": len(self.running_jobs),
                "suspended": len(self.suspended_jobs),
                "completed": len(self.completed_jobs),
                "failed": len(self.failed_jobs),
                "total": len(self.jobs),
            },
            "ready_queue": [
                {
                    "id": jid,
                    "role": self.jobs[jid].role.value,
                    "kind": self.jobs[jid].kind.value,
                    "cpu": self.jobs[jid].cpu,
                    "mem": self.jobs[jid].mem,
                    "arrival": self.jobs[jid].arrival,
                    "score": priority_score(self.jobs[jid], int(self.current_time), self.profile),
                }
                for jid in self.ready_queue if jid in self.jobs
            ],
            "running_jobs": [
                {
                    "id": jid,
                    "node_id": nid,
                    "role": self.jobs[jid].role.value,
                    "kind": self.jobs[jid].kind.value,
                    "metrics": process_metrics.get(jid, {}),
                }
                for jid, nid in self.running_jobs.items() if jid in self.jobs
            ],
        }

    def get_full_state(self) -> Dict[str, Any]:
        """Return synchronous full state copy."""
        return self._build_state_snapshot()

    def export_session(self) -> Dict[str, Any]:
        """Export session events and summary for DB persistence or replay."""
        return {
            "session_id": self.session_id,
            "profile_name": self.profile.name,
            "duration": self.current_time,
            "total_jobs": len(self.jobs),
            "completed_jobs": len(self.completed_jobs),
            "failed_jobs": len(self.failed_jobs),
            "events_count": len(self.events),
            "events": self.events,
        }
