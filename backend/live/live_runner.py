"""
backend/live/live_runner.py – Real-time scheduling engine and process manager.

Executes real OS child processes, applies scheduling policies, enforces Banker's
safety and quotas, handles preemption and node failures, and emits live event streams.

Time scale: one simulated minute in a profile (RR quantum, aging) is one wall-clock
second here.

What live mode applies from a profile: FCFS / SJF / RR / PRIORITY ordering, the RR
quantum, priority and SJF (SRTF) preemption when `preemptive` is set (honouring
`preempt_by`), head-of-line blocking when `backfill` is off, per-user quotas, soft
role reservations, placement strategy, and the Banker mode. Calendar slots and
reactive rules are simulation-only.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
import uuid
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional, Set, Tuple

from engine.banker import BankerState
from engine.model import (
    DEFAULT_CLUSTER, Cluster, Job, JobKind, JobRuntime,
    JobState, Node, Phase, PooledResources, Role, SchedulerKind
)
from engine.placement import place
from engine.profiles import BASE_PROFILES, Profile
from engine.scheduler import priority_score
from live.process_executor import ProcessExecutor

logger = logging.getLogger("labqueue.live")

# Keep at most this many events in memory (and in a saved session).
MAX_EVENTS = 5000


class LiveRunnerError(Exception):
    """Base error for invalid live-mode operations; carries an HTTP status."""
    status_code = 400


class LiveNotFound(LiveRunnerError):
    status_code = 404


class LiveConflict(LiveRunnerError):
    status_code = 409


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
        self.default_profile = profile or BASE_PROFILES[0]  # practical_session (RR, q=4)
        self.tick_interval = tick_interval
        self.executor = ProcessExecutor()
        self.subscribers: Set[asyncio.Queue] = set()

        self._loop_task: Optional[asyncio.Task] = None
        self._running: bool = False
        self._lock: Optional[asyncio.Lock] = None
        self._init_state(self.default_profile)

    def _init_state(self, profile: Profile) -> None:
        """(Re)initialise all per-session state. Subscribers are kept."""
        self.profile = profile
        self.banker = BankerState(self.cluster.pooled)
        self.session_id: str = f"live_{uuid.uuid4().hex[:8]}"
        self.start_wall_time: float = time.time()
        self.seq_counter: int = 0
        self.submit_counter: int = 0

        # Mutable node state
        self.node_up: Dict[int, bool] = {n.id: n.up for n in self.cluster.nodes}
        self.free_cpu: Dict[int, int] = {n.id: n.cpu for n in self.cluster.nodes}
        self.free_mem: Dict[int, int] = {n.id: n.mem for n in self.cluster.nodes}

        self.jobs: Dict[str, Job] = {}
        self.job_seq: Dict[str, int] = {}             # submission order (FIFO tie-breaker)
        self.ready_queue: List[str] = []              # enqueue order; preempted jobs go to the tail
        self.running_jobs: Dict[str, int] = {}        # job_id -> node_id
        self.suspended_jobs: Dict[str, int] = {}      # job_id -> node it was suspended on
        self.completed_jobs: List[str] = []
        self.failed_jobs: List[str] = []              # failed or killed
        self.job_outcome: Dict[str, str] = {}         # completed | failed | killed

        # Wall-clock bookkeeping (seconds since session start unless noted)
        self.submit_time: Dict[str, float] = {}
        self.first_start: Dict[str, float] = {}
        self.finish_time: Dict[str, float] = {}
        self.slice_started_at: Dict[str, float] = {}  # time.time() when the current run slice began
        self.job_total_runtime: Dict[str, float] = {}
        self.job_script_info: Dict[str, Dict[str, Any]] = {}

        # User concurrency tracking for quotas (running jobs only)
        self.user_running: Dict[str, int] = defaultdict(int)

        # Last Banker refusal per job, so a waiting job emits one event, not one per tick
        self._last_denial: Dict[str, str] = {}

        self.events: Deque[Dict[str, Any]] = deque(maxlen=MAX_EVENTS)
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

    # ------------------------------------------------------------------
    # Event stream
    # ------------------------------------------------------------------

    def _broadcast(self, msg: Dict[str, Any]) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

    def _emit(self, event_type: str, details: Optional[Dict[str, Any]] = None, job_id: Optional[str] = None):
        """Record an event in the session log and stream it to subscribers."""
        evt = {
            "seq": self._next_seq(),
            "t": self.current_time,
            "type": event_type,
            "job_id": job_id,
            "details": details or {},
        }
        self.events.append(evt)
        self._broadcast(evt)

    def _broadcast_snapshot(self) -> None:
        """Snapshots are streamed only; they are never stored in the event log."""
        self._broadcast({
            "seq": None,
            "t": self.current_time,
            "type": "STATE_SNAPSHOT",
            "job_id": None,
            "details": self._build_state_snapshot(),
        })

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subscribers.discard(q)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        """Start the runner background loop."""
        if self._running:
            return
        self._running = True
        self.start_wall_time = time.time()
        self._emit_session_started()
        self._loop_task = asyncio.create_task(self._run_loop())

    def _emit_session_started(self):
        self._emit("SESSION_STARTED", {
            "session_id": self.session_id,
            "profile": self.profile.name,
            "nodes": len(self.cluster.nodes),
            "pooled": self.cluster.pooled.model_dump(),
        })

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

    async def reset(self) -> str:
        """Kill every job and start a fresh session in place.

        The runner object (and therefore every WebSocket subscription) survives;
        subscribers receive a new INIT_STATE immediately.
        """
        async with self._get_lock():
            self.executor.cleanup_all()
            self._init_state(self.default_profile)
            self._emit_session_started()
            self._broadcast({"type": "INIT_STATE", "data": self._build_state_snapshot()})
            return self.session_id

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

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
            now = self.current_time

            job = Job(
                id=jid,
                user_id=user_id,
                role=role,
                kind=kind,
                arrival=int(now),
                burst=burst_val,
                cpu=cpu,
                mem=mem,
                max_claim=req,
                phases=[Phase(at=0, request=req)] if not req.is_zero() else [],
            )
            job.state = JobState.queued
            job.runtime = JobRuntime(remaining=burst_val)

            self.jobs[jid] = job
            self.job_seq[jid] = self.submit_counter
            self.submit_counter += 1
            self.ready_queue.append(jid)
            self.submit_time[jid] = now
            self.job_total_runtime[jid] = 0.0
            self.job_script_info[jid] = {"script_name": script_name, "duration": duration}

            self._emit("JOB_SUBMITTED", {
                "user_id": user_id,
                "role": role.value,
                "kind": kind.value,
                "cpu": cpu,
                "mem": mem,
                "duration": duration,
                "script": script_name,
                "pooled": req.model_dump(),
                "seq": self.job_seq[jid],
            }, job_id=jid)

            return job

    async def inject_rush(
        self,
        count: int = 5,
        role: Role = Role.ug,
        script_name: str = "matrix_mult.py",
        duration: float = 4.0,
    ) -> List[str]:
        """Inject a batch of rush jobs."""
        ids = []
        for i in range(count):
            job = await self.submit_job(
                user_id=f"rush_user_{i % 3}",
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
            # Restart RR quanta for currently running jobs
            wall = time.time()
            for jid in self.running_jobs:
                self.slice_started_at[jid] = self._close_slice(jid, wall)
            self._emit("PROFILE_SWITCHED", {
                "old_profile": old,
                "new_profile": profile.name,
                "family": profile.family,
                "scheduler": profile.scheduler.value,
            })

    async def fail_node(self, node_id: int):
        """Simulate a hardware failure on a node; jobs running on it fail."""
        async with self._get_lock():
            self._require_node(node_id)
            if not self.node_up[node_id]:
                raise LiveConflict(f"Node {node_id} is already down")
            self.node_up[node_id] = False

            evicted = [jid for jid, nid in self.running_jobs.items() if nid == node_id]
            for jid in evicted:
                self.executor.kill(jid)
                self._finish_job(jid, "failed", "JOB_FAILED",
                                 {"reason": f"Node {node_id} failure", "node_id": node_id})

            self._emit("NODE_FAILED", {"node_id": node_id, "evicted": evicted})

    async def restore_node(self, node_id: int):
        """Bring a failed node back. Only valid for nodes that are down."""
        async with self._get_lock():
            node = self._require_node(node_id)
            if self.node_up[node_id]:
                raise LiveConflict(f"Node {node_id} is already up")
            # A down node has no running jobs (they were evicted), so it is empty.
            self.node_up[node_id] = True
            self.free_cpu[node_id] = node.cpu
            self.free_mem[node_id] = node.mem
            self._emit("NODE_RESTORED", {"node_id": node_id})

    async def kill_job(self, job_id: str, reason: str = "Admin kill") -> str:
        """Terminate a job. Returns the state it was in (running/suspended/queued)."""
        async with self._get_lock():
            job = self.jobs.get(job_id)
            if job is None:
                raise LiveNotFound(f"Job '{job_id}' not found")
            if job.state == JobState.done:
                raise LiveConflict(f"Job '{job_id}' already finished ({self.job_outcome.get(job_id, 'done')})")
            previous = self._job_status(job_id)
            self.executor.kill(job_id)
            self._finish_job(job_id, "killed", "JOB_KILLED", {"reason": reason, "previous_state": previous})
            return previous

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _require_node(self, node_id: int) -> Node:
        node = self.cluster.node_by_id(node_id)
        if node is None:
            raise LiveNotFound(f"Node {node_id} not found")
        return node

    def _job_status(self, jid: str) -> str:
        if jid in self.running_jobs:
            return "running"
        if jid in self.suspended_jobs:
            return "suspended"
        job = self.jobs.get(jid)
        if job is not None and job.state == JobState.done:
            return self.job_outcome.get(jid, "done")
        return "queued"

    def _close_slice(self, jid: str, wall: float) -> float:
        """Add the current run slice to the job's runtime; return `wall` as the new slice start."""
        started = self.slice_started_at.get(jid)
        if started is not None:
            self.job_total_runtime[jid] = self.job_total_runtime.get(jid, 0.0) + (wall - started)
        return wall

    def _remaining(self, jid: str) -> float:
        total = self.job_total_runtime.get(jid, 0.0)
        if jid in self.running_jobs and jid in self.slice_started_at:
            total += time.time() - self.slice_started_at[jid]
        duration = self.job_script_info.get(jid, {}).get("duration", self.jobs[jid].burst)
        return max(0.0, duration - total)

    def _release_node(self, jid: str) -> Optional[int]:
        """Free the CPU/memory a running job holds; returns the node id."""
        nid = self.running_jobs.pop(jid, None)
        if nid is None:
            return None
        job = self.jobs[jid]
        node = self.cluster.node_by_id(nid)
        if node:
            self.free_cpu[nid] = min(node.cpu, self.free_cpu[nid] + job.cpu)
            self.free_mem[nid] = min(node.mem, self.free_mem[nid] + job.mem)
        self.user_running[job.user_id] = max(0, self.user_running[job.user_id] - 1)
        self._close_slice(jid, time.time())
        self.slice_started_at.pop(jid, None)
        return nid

    def _finish_job(self, jid: str, outcome: str, event_type: str, details: Dict[str, Any]) -> None:
        """Move a job to a terminal state, releasing everything it holds exactly once."""
        job = self.jobs[jid]
        if job.state == JobState.done:
            return
        was_running = jid in self.running_jobs
        nid = self._release_node(jid) if was_running else self.suspended_jobs.get(jid)
        self.suspended_jobs.pop(jid, None)
        if jid in self.ready_queue:
            self.ready_queue.remove(jid)
        self.banker.deregister(jid)
        self._last_denial.pop(jid, None)

        job.state = JobState.done
        self.job_outcome[jid] = outcome
        self.finish_time[jid] = self.current_time
        if outcome == "completed":
            self.completed_jobs.append(jid)
            if job.runtime:
                job.runtime.remaining = 0
        else:
            self.failed_jobs.append(jid)

        payload = {"node_id": nid, "cpu": job.cpu, "mem": job.mem, "role": job.role.value}
        payload.update(details)
        self._emit(event_type, payload, job_id=jid)

    def _suspend(self, jid: str, reason: str) -> bool:
        """Preempt a running job with SIGSTOP. It keeps its pooled (Banker) allocation."""
        if not self.executor.suspend(jid):
            return False  # process already exited; it is reaped on the next tick
        job = self.jobs[jid]
        nid = self._release_node(jid)
        job.state = JobState.preempted
        self.suspended_jobs[jid] = nid
        self.ready_queue.append(jid)
        self._emit("JOB_PREEMPTED", {
            "node_id": nid, "reason": reason, "cpu": job.cpu, "mem": job.mem,
            "remaining": round(self._remaining(jid), 1),
        }, job_id=jid)
        return True

    def _abort_job(self, jid: str, error: Exception) -> None:
        """Fail a job the scheduler could not handle, so it can't stall the loop."""
        logger.exception("Scheduler error for job %s: %s", jid, error)
        try:
            self.executor.kill(jid)
            self._finish_job(jid, "failed", "JOB_FAILED", {"reason": f"scheduler error: {error}"})
        except Exception:
            logger.exception("Could not clean up job %s after scheduler error", jid)
            if jid in self.ready_queue:
                self.ready_queue.remove(jid)

    def _allowed_nodes(self, job: Job) -> List[Node]:
        """Up nodes this job may use, honouring a soft role reservation (as the engine does)."""
        nodes = [
            Node(id=n.id, name=n.name, cpu=n.cpu, mem=n.mem, up=self.node_up[n.id])
            for n in self.cluster.nodes
        ]
        p = self.profile
        if p.reserved_role and p.reserved_pct > 0 and job.role != p.reserved_role:
            n_res = int(math.ceil(p.reserved_pct * len(self.cluster.nodes)))
            reserved_ids = {n.id for n in sorted(self.cluster.nodes, key=lambda n: n.id)[:n_res]}
            waiting_reserved = any(
                self.jobs[j].role == p.reserved_role for j in self.ready_queue if j in self.jobs
            )
            if waiting_reserved:
                nodes = [n for n in nodes if n.id not in reserved_ids]
        return nodes

    def _ordered_ready(self, now: float) -> List[Job]:
        """Ready jobs in dispatch order. Submission order breaks every tie."""
        ready = [self.jobs[jid] for jid in self.ready_queue if jid in self.jobs]
        sched = self.profile.scheduler
        seq = self.job_seq
        if sched == SchedulerKind.RR:
            return ready  # queue order: preempted jobs were re-appended at the tail
        if sched == SchedulerKind.SJF:
            return sorted(ready, key=lambda j: (self._remaining(j.id), seq[j.id]))
        if sched == SchedulerKind.PRIORITY:
            return sorted(ready, key=lambda j: (-priority_score(j, int(now), self.profile), seq[j.id]))
        return sorted(ready, key=lambda j: seq[j.id])  # FCFS

    def _note_denial(self, job: Job, reason: str, request: PooledResources) -> None:
        if self._last_denial.get(job.id) == reason:
            return
        self._last_denial[job.id] = reason
        if reason == "UNSAFE":
            self._emit("BANKER_DENIED", {
                "reason": reason,
                "request": request.model_dump(),
                "available": self.banker.available.model_dump(),
            }, job_id=job.id)

    def _start_on(self, job: Job, node_id: int, now: float) -> Tuple[bool, str]:
        """Start (or resume) a job on a node. Returns (started, wait_reason)."""
        resuming = job.id in self.suspended_jobs

        # A suspended job still holds its pooled allocation, so only new jobs go
        # through the Banker, and only for the part of their claim they don't hold.
        if not resuming:
            if job.id not in self.banker.max_claim:
                self.banker.register(job)
            need = self.banker.need(job.id)
            if not need.is_zero():
                granted, why = self.banker.try_grant(job, need, self.profile.banker)
                if not granted:
                    self._note_denial(job, why, need)
                    return False, why
        self._last_denial.pop(job.id, None)

        self.free_cpu[node_id] -= job.cpu
        self.free_mem[node_id] -= job.mem
        self.user_running[job.user_id] += 1
        node_obj = self.cluster.node_by_id(node_id)
        node_name = node_obj.name if node_obj else f"n{node_id}"

        if resuming:
            self.executor.resume(job.id)
            self.suspended_jobs.pop(job.id, None)
            event, details = "JOB_RESUMED", {"node_id": node_id, "node_name": node_name,
                                              "cpu": job.cpu, "mem": job.mem}
        else:
            sinfo = self.job_script_info.get(job.id, {})
            try:
                self.executor.spawn(job.id, script_name=sinfo.get("script_name", "cpu_burn.py"),
                                    duration=sinfo.get("duration", 5.0))
            except Exception as e:
                logger.error("Failed to spawn process for job %s: %s", job.id, e)
                self.free_cpu[node_id] += job.cpu
                self.free_mem[node_id] += job.mem
                self.user_running[job.user_id] -= 1
                self._finish_job(job.id, "failed", "JOB_FAILED", {"reason": f"spawn failed: {e}"})
                return False, "SPAWN_FAILED"
            if job.runtime:
                job.runtime.node_id = node_id
                job.runtime.first_start = int(now)
            self.first_start.setdefault(job.id, now)
            event, details = "JOB_DISPATCHED", {"node_id": node_id, "node_name": node_name,
                                                 "cpu": job.cpu, "mem": job.mem,
                                                 "pooled": job.max_claim.model_dump()}

        job.state = JobState.running
        self.running_jobs[job.id] = node_id
        self.slice_started_at[job.id] = time.time()
        if job.id in self.ready_queue:
            self.ready_queue.remove(job.id)
        self._emit(event, details, job_id=job.id)
        return True, ""

    def _try_start(self, job: Job, now: float) -> Tuple[bool, str]:
        quota = self.profile.quota_per_user
        if quota is not None and self.user_running[job.user_id] >= quota:
            return False, "QUOTA"
        node_id = place(job=job, nodes=self._allowed_nodes(job), free_cpu=self.free_cpu,
                        free_mem=self.free_mem, strategy=self.profile.placement)
        if node_id is None:
            return False, "NO_FIT"
        return self._start_on(job, node_id, now)

    def _try_preempt(self, waiting: List[Job], now: float) -> None:
        """Mirror of the engine's _try_preempt: the top waiting job may displace
        one running job (SRTF for SJF, lower score for PRIORITY)."""
        p = self.profile
        if not p.preemptive or not waiting or not self.running_jobs:
            return
        top = waiting[0]

        def fits_after(victim_id: str) -> bool:
            nid = self.running_jobs[victim_id]
            v = self.jobs[victim_id]
            return (self.node_up.get(nid, False)
                    and self.free_cpu[nid] + v.cpu >= top.cpu
                    and self.free_mem[nid] + v.mem >= top.mem)

        running = list(self.running_jobs)
        if p.scheduler == SchedulerKind.SJF:
            top_rem = self._remaining(top.id)
            candidates = [v for v in running if top_rem < self._remaining(v) and fits_after(v)]
            if not candidates:
                return
            victim = max(candidates, key=self._remaining)
        elif p.scheduler == SchedulerKind.PRIORITY:
            if p.preempt_by and top.role not in p.preempt_by:
                return
            score = lambda jid: priority_score(self.jobs[jid], int(now), p)
            top_score = score(top.id)
            candidates = [v for v in running if top_score > score(v) and fits_after(v)]
            if not candidates:
                return
            victim = min(candidates, key=score)
        else:
            return

        node_id = self.running_jobs[victim]
        reason = "preempted_by_shorter_job" if p.scheduler == SchedulerKind.SJF else "preempted_by_higher_priority"
        if self._suspend(victim, reason):
            self._start_on(top, node_id, now)

    # ------------------------------------------------------------------
    # Tick loop
    # ------------------------------------------------------------------

    async def _run_loop(self):
        """Continuous background tick loop."""
        while self._running:
            try:
                await self._tick()
            except Exception as e:
                logger.exception("Error in LiveRunner tick: %s", e)
            await asyncio.sleep(self.tick_interval)

    async def _tick(self):
        """Execute one scheduling step across wall-clock time."""
        async with self._get_lock():
            now = self.current_time
            self._reap_finished()
            self._rr_preempt()
            self._dispatch_pass(now)

            if now - self._last_snapshot_time >= 1.0:
                self._last_snapshot_time = now
                self._broadcast_snapshot()

    def _reap_finished(self) -> None:
        for jid in list(self.running_jobs) + list(self.suspended_jobs):
            rc = self.executor.poll(jid)
            if rc is None:
                continue
            if rc == 0:
                self._finish_job(jid, "completed", "JOB_COMPLETED", {"exit_code": 0})
            else:
                self._finish_job(jid, "failed", "JOB_FAILED", {"exit_code": rc})

    def _rr_preempt(self) -> None:
        if self.profile.scheduler != SchedulerKind.RR or not self.profile.quantum:
            return
        quantum = float(self.profile.quantum)
        wall = time.time()
        for jid in list(self.running_jobs):
            if wall - self.slice_started_at.get(jid, wall) < quantum:
                continue
            if self.ready_queue:
                self._suspend(jid, "quantum_expired")
            else:
                # Nobody is waiting: renew the quantum instead of churning (as the engine does).
                self.slice_started_at[jid] = self._close_slice(jid, wall)

    def _dispatch_pass(self, now: float) -> None:
        if not self.ready_queue:
            return
        ordered = self._ordered_ready(now)
        started: Set[str] = set()
        for job in ordered:
            if job.id not in self.ready_queue:
                continue
            try:
                ok, _reason = self._try_start(job, now)
            except Exception as e:  # one bad job must not stall the scheduler
                self._abort_job(job.id, e)
                continue
            if ok:
                started.add(job.id)
            elif not self.profile.backfill and not started:
                break  # strict head-of-line blocking (engine semantics)

        waiting = [j for j in ordered if j.id in self.ready_queue]
        try:
            self._try_preempt(waiting, now)
        except Exception:
            logger.exception("Preemption pass failed")

    # ------------------------------------------------------------------
    # Snapshots and export
    # ------------------------------------------------------------------

    def _job_brief(self, jid: str) -> Dict[str, Any]:
        j = self.jobs[jid]
        return {
            "id": jid,
            "user_id": j.user_id,
            "role": j.role.value,
            "kind": j.kind.value,
            "cpu": j.cpu,
            "mem": j.mem,
            "pooled": j.max_claim.model_dump(),
            "seq": self.job_seq.get(jid),
        }

    def _build_state_snapshot(self) -> Dict[str, Any]:
        """Build full snapshot dict for UI visualization."""
        now = self.current_time
        node_jobs: Dict[int, List[str]] = defaultdict(list)
        for jid, nid in self.running_jobs.items():
            node_jobs[nid].append(jid)

        node_stats = []
        for n in self.cluster.nodes:
            avail_c = self.free_cpu.get(n.id, n.cpu)
            avail_m = self.free_mem.get(n.id, n.mem)
            node_stats.append({
                "id": n.id,
                "name": n.name,
                "is_up": self.node_up.get(n.id, True),
                "cpu_total": n.cpu,
                "cpu_allocated": n.cpu - avail_c,
                "cpu_available": avail_c,
                "mem_total": n.mem,
                "mem_allocated": n.mem - avail_m,
                "mem_available": avail_m,
                "running_job_ids": node_jobs.get(n.id, []),
            })

        safe_sequence = self.banker.safety_sequence()
        banker_jobs = []
        for jid, alloc in self.banker.allocation.items():
            if jid not in self.jobs:
                continue
            banker_jobs.append({
                "id": jid,
                "state": self._job_status(jid),
                "allocation": alloc.model_dump(),
                "need": self.banker.need(jid).model_dump(),
                "max_claim": self.banker.max_claim.get(jid, PooledResources()).model_dump(),
            })

        p = self.profile
        return {
            "session_id": self.session_id,
            "profile": p.name,
            "policy": {
                "scheduler": p.scheduler.value,
                "quantum": p.quantum,
                "preemptive": p.preemptive,
                "preempt_by": [r.value for r in p.preempt_by],
                "placement": p.placement.value,
                "banker": p.banker.value,
                "backfill": p.backfill,
                "quota_per_user": p.quota_per_user,
            },
            "elapsed_seconds": now,
            "nodes": node_stats,
            "pooled": {
                "total": self.banker.total.model_dump(),
                "available": self.banker.available.model_dump(),
            },
            "banker_safe_sequence": safe_sequence,
            "banker": {
                "mode": p.banker.value,
                "safe": safe_sequence is not None,
                "jobs": banker_jobs,
            },
            "counts": {
                "ready": sum(1 for j in self.ready_queue if j not in self.suspended_jobs),
                "running": len(self.running_jobs),
                "suspended": len(self.suspended_jobs),
                "completed": len(self.completed_jobs),
                "failed": len(self.failed_jobs),
                "total": len(self.jobs),
            },
            "ready_queue": [
                {
                    **self._job_brief(jid),
                    "arrival": self.jobs[jid].arrival,
                    "suspended": jid in self.suspended_jobs,
                    "score": priority_score(self.jobs[jid], int(now), p),
                }
                for jid in self.ready_queue if jid in self.jobs
            ],
            "running_jobs": [
                {
                    **self._job_brief(jid),
                    "node_id": nid,
                    "script": self.job_script_info.get(jid, {}).get("script_name"),
                    "remaining": round(self._remaining(jid), 1),
                    "metrics": self.executor.get_metrics(jid),
                }
                for jid, nid in self.running_jobs.items() if jid in self.jobs
            ],
        }

    def get_full_state(self) -> Dict[str, Any]:
        """Return synchronous full state copy."""
        return self._build_state_snapshot()

    def export_session(self) -> Dict[str, Any]:
        """Export session events and summary (events are capped at MAX_EVENTS)."""
        return {
            "session_id": self.session_id,
            "profile_name": self.profile.name,
            "duration": self.current_time,
            "total_jobs": len(self.jobs),
            "completed_jobs": len(self.completed_jobs),
            "failed_jobs": len(self.failed_jobs),
            "events_count": len(self.events),
            "events": list(self.events),
        }

    def export_replay(self) -> Dict[str, Any]:
        """The session as a sim-style run that the replay UI can load.

        Live event names/payloads are mapped onto the simulator's vocabulary and
        flattened. Times stay in seconds; metrics carry ``time_unit: "s"``.
        """
        from engine.metrics import compute_metrics

        events: List[Dict[str, Any]] = []
        for e in self.events:
            d = dict(e.get("details") or {})
            jid = e.get("job_id")
            base = {"t": e["t"], "job_id": jid}
            etype = e["type"]
            if etype == "JOB_SUBMITTED":
                events.append({**base, "type": "JOB_ARRIVED", "role": d.get("role"), "kind": d.get("kind"),
                               "user_id": d.get("user_id"), "cpu": d.get("cpu"), "mem": d.get("mem"),
                               "burst": d.get("duration"), "pooled": d.get("pooled")})
            elif etype in ("JOB_DISPATCHED", "JOB_RESUMED"):
                events.append({**base, "type": "JOB_STARTED" if etype == "JOB_DISPATCHED" else "JOB_RESUMED",
                               "node_id": d.get("node_id"), "cpu": d.get("cpu"), "mem": d.get("mem")})
                pooled = d.get("pooled") or {}
                if etype == "JOB_DISPATCHED" and any(pooled.values()):
                    events.append({**base, "type": "PHASE_GRANTED", "request": pooled})
            elif etype == "JOB_PREEMPTED":
                events.append({**base, "type": etype, "node_id": d.get("node_id"), "reason": d.get("reason"),
                               "cpu": d.get("cpu"), "mem": d.get("mem")})
            elif etype == "JOB_COMPLETED":
                events.append({**base, "type": "JOB_FINISHED", "node_id": d.get("node_id"),
                               "cpu": d.get("cpu"), "mem": d.get("mem"), "role": d.get("role")})
            elif etype in ("JOB_FAILED", "JOB_KILLED"):
                events.append({**base, "type": etype, "node_id": d.get("node_id"), "reason": d.get("reason"),
                               "cpu": d.get("cpu"), "mem": d.get("mem")})
            elif etype == "NODE_FAILED":
                events.append({**base, "type": "NODE_DOWN", "node_id": d.get("node_id")})
            elif etype == "NODE_RESTORED":
                events.append({**base, "type": "NODE_UP", "node_id": d.get("node_id")})
            elif etype == "PROFILE_SWITCHED":
                events.append({**base, "type": etype, "from": d.get("old_profile"),
                               "to": d.get("new_profile"), "reason": "manual"})
            elif etype == "BANKER_DENIED":
                events.append({**base, "type": "REQUEST_DENIED_UNSAFE", "request": d.get("request")})
        for i, e in enumerate(events):
            e["seq"] = i

        # Metrics: completed jobs count as done; times are whole seconds.
        jobs = []
        for jid, job in self.jobs.items():
            j = job.model_copy(deep=True)
            done = self.job_outcome.get(jid) == "completed"
            j.state = JobState.done if done else JobState.queued
            j.runtime = JobRuntime(
                remaining=0 if done else j.burst,
                first_start=int(self.first_start[jid]) if jid in self.first_start else None,
                finish=int(math.ceil(self.finish_time[jid])) if done else None,
            )
            jobs.append(j)
        makespan = max([j.runtime.finish for j in jobs if j.runtime.finish is not None] or [0])
        metrics = compute_metrics(
            jobs=jobs, nodes=self.cluster.nodes, makespan=makespan,
            total_cpu_available=sum(n.cpu for n in self.cluster.nodes) * makespan,
            cpu_time_used=sum(j.burst * j.cpu for j in jobs if j.state == JobState.done),
            preemptions=sum(1 for e in self.events if e["type"] == "JOB_PREEMPTED"),
            restarts=0, deadlocks_detected=0,
            banker_denials=sum(1 for e in self.events if e["type"] == "BANKER_DENIED"),
            frag_time_series=[], util_time_series=[], queue_len_time_series=[],
        )
        metrics["time_unit"] = "s"
        metrics["failed_jobs"] = len(self.failed_jobs)

        return {
            "session_id": self.session_id,
            "profile_name": self.profile.name,
            "events": events,
            "metrics": metrics,
            "jobs": [
                {**self._job_brief(jid), "arrival": j.arrival, "burst": j.burst,
                 "max_claim": j.max_claim.model_dump(), "phases": [ph.model_dump() for ph in j.phases]}
                for jid, j in self.jobs.items()
            ],
        }
