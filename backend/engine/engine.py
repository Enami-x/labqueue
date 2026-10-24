"""
engine/engine.py – Deterministic discrete-event simulation engine.

Implements spec §6 (engine semantics).

run(cluster, workload, profile, seed) -> RunResult
"""

from __future__ import annotations

import copy
import hashlib
import heapq
import json
import math
import random
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from engine.banker import BankerState
from engine.clock import SimClock, SimExecutor
from engine.events import (
    EventCounter, EventOrder, EventType, SimEvent, WaitReason
)
from engine.metrics import compute_metrics
from engine.model import (
    BankerMode, Cluster, Job, JobRuntime, JobState,
    PlacementKind, PooledResources, SchedulerKind
)
from engine.placement import fragmentation, place
from engine.profiles import Profile, BASE_PROFILE_MAP, all_profiles
from engine.schedule import Schedule
from engine.scheduler import SchedulerState, priority_score


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class Engine:
    """Discrete-event engine for LabQueue."""

    SNAPSHOT_INTERVAL = 200

    def run(
        self,
        cluster: Cluster,
        workload: List[Job],
        profile: Profile | Schedule,
        seed: int = 0,
        record_events: bool = True,
        node_events: Optional[List[Dict[str, Any]]] = None,
        resolve_profile: Optional[Callable[[str], Optional[Profile]]] = None,
    ) -> "RunResult":
        """resolve_profile: optional lookup used by a Schedule to find profiles
        that aren't built in (e.g. custom profiles stored in the DB)."""
        from engine.model import RunResult

        rng = random.Random(seed)
        clock = SimClock()
        executor = SimExecutor()
        counter = EventCounter()

        # ------------------------------------------------------------------
        # Schedule / profile resolution
        # ------------------------------------------------------------------
        schedule: Optional[Schedule] = profile if isinstance(profile, Schedule) else None
        last_trigger_time: Dict[str, int] = {}

        def _resolve_profile(name: str) -> Profile:
            if resolve_profile is not None:
                found = resolve_profile(name)
                if found is not None:
                    return found
            if name in BASE_PROFILE_MAP:
                return BASE_PROFILE_MAP[name]
            for p in all_profiles():
                if p.name == name:
                    return p
            return BASE_PROFILE_MAP.get("practical_session", list(BASE_PROFILE_MAP.values())[0])

        if schedule is not None:
            init_p_name, _ = schedule.active_profile_name(0, {}, last_trigger_time, 0)
            curr_profile: Profile = _resolve_profile(init_p_name)
        else:
            curr_profile = profile

        # For backward compatibility within closures, use 'profile' as the reference
        profile = curr_profile

        # ------------------------------------------------------------------
        # Simulation state
        # ------------------------------------------------------------------
        jobs: Dict[str, Job] = {}
        for j_orig in workload:
            j = copy.deepcopy(j_orig)
            j.state = JobState.queued
            j.runtime = JobRuntime(remaining=j.burst)
            jobs[j.id] = j

        node_up: Dict[int, bool]  = {n.id: n.up for n in cluster.nodes}
        free_cpu: Dict[int, int]  = {n.id: n.cpu for n in cluster.nodes}
        free_mem: Dict[int, int]  = {n.id: n.mem for n in cluster.nodes}
        user_running: Dict[str, int] = defaultdict(int)
        node_jobs: Dict[int, List[str]] = defaultdict(list)
        blocked_jobs: Set[str]   = set()
        eligible_set: Set[str]   = set()

        banker = BankerState(cluster.pooled)
        sched  = SchedulerState(profile)

        event_log: List[Dict[str, Any]] = []
        events_since_snapshot = 0

        preemptions      = 0
        restarts         = 0
        deadlocks_det    = 0
        banker_denials   = 0
        cpu_time_used    = 0

        ts_queue_len: List[int]   = []
        ts_util:      List[float] = []
        ts_frag:      List[float] = []
        ts_t:         List[int]   = []
        last_ts_sample = -1

        finish_events: Dict[str, int]  = {}
        quantum_expiry: Dict[str, int] = {}
        fired_phases: Dict[str, Set[int]] = defaultdict(set)
        pending_phase_req: Dict[str, int] = {}

        pq: List[SimEvent] = []

        # ------------------------------------------------------------------
        # Helpers: emit / push
        # ------------------------------------------------------------------

        def emit(t: int, etype: EventType, payload: Dict[str, Any]) -> None:
            nonlocal events_since_snapshot
            seq = counter.next()
            entry = {"seq": seq, "t": t, "type": etype.value}
            entry.update(payload)
            if record_events:
                event_log.append(entry)
                events_since_snapshot += 1
                if events_since_snapshot >= Engine.SNAPSHOT_INTERVAL:
                    _emit_snapshot(t)
                    events_since_snapshot = 0

        def _emit_snapshot(t: int) -> None:
            snap = {
                "t": t, "type": EventType.STATE_SNAPSHOT.value,
                "seq": counter.next(),
                "jobs": {
                    jid: {
                        "state": j.state.value,
                        "remaining": j.runtime.remaining if j.runtime else j.burst,
                        "node_id": j.runtime.node_id if j.runtime else None,
                        "restarts": j.runtime.restarts if j.runtime else 0,
                    }
                    for jid, j in jobs.items()
                },
                "free_cpu": dict(free_cpu),
                "free_mem": dict(free_mem),
                "banker_available": banker.available.model_dump(),
            }
            event_log.append(snap)

        def push(t: int, order: EventOrder, kind: EventType, payload: Dict[str, Any]) -> None:
            ev = SimEvent(t=t, order=order.value, seq=counter.next(),
                          kind=kind.value, payload=payload)
            heapq.heappush(pq, ev)

        def schedule_finish(at: int, job_id: str) -> None:
            finish_events[job_id] = at
            push(at, EventOrder.JOB_FINISH, EventType.JOB_FINISHED, {"job_id": job_id})

        # ------------------------------------------------------------------
        # Reservation helpers
        # ------------------------------------------------------------------

        def _reserved_node_ids() -> Set[int]:
            if not profile.reserved_role or profile.reserved_pct <= 0:
                return set()
            n_reserved = math.ceil(profile.reserved_pct * len(cluster.nodes))
            return {n.id for n in sorted(cluster.nodes, key=lambda n: n.id)[:n_reserved]}

        def _quota_ok(job: Job) -> bool:
            if profile.quota_per_user is None:
                return True
            return user_running[job.user_id] < profile.quota_per_user

        def _find_node(job: Job) -> Optional[int]:
            res_ids = _reserved_node_ids()
            if res_ids and job.role != profile.reserved_role:
                waiting_reserved = any(
                    j.role == profile.reserved_role
                    for j in jobs.values()
                    if j.state in (JobState.queued, JobState.preempted)
                )
                allowed_nodes = (
                    [n for n in cluster.nodes if n.id not in res_ids]
                    if waiting_reserved else list(cluster.nodes)
                )
            else:
                allowed_nodes = list(cluster.nodes)
            return place(job, allowed_nodes, free_cpu, free_mem, profile.placement)

        def _get_phase0(job: Job) -> Optional[PooledResources]:
            for i, phase in enumerate(job.phases):
                if phase.at == 0 and i not in fired_phases[job.id]:
                    return phase.request
            return None

        # ------------------------------------------------------------------
        # Job lifecycle: start, preempt, kill
        # ------------------------------------------------------------------

        def _start_job(job: Job, node_id: int, now: int, is_resume: bool = False) -> None:
            job.state = JobState.running
            eligible_set.discard(job.id)
            if job.runtime is None:
                job.runtime = JobRuntime(remaining=job.burst)
            rt = job.runtime
            rt.node_id = node_id
            rt.cpu_alloc = job.cpu
            rt.mem_alloc = job.mem
            if rt.first_start is None:
                rt.first_start = now

            free_cpu[node_id] -= job.cpu
            free_mem[node_id] -= job.mem
            user_running[job.user_id] += 1
            node_jobs[node_id].append(job.id)

            executor.start(job.id, rt.remaining, now, schedule_finish)

            if profile.scheduler == SchedulerKind.RR:
                sched.rr_quantum_start(job.id, now)
                expiry = now + (profile.quantum or 4)
                quantum_expiry[job.id] = expiry
                push(expiry, EventOrder.QUANTUM_EXPIRY, EventType.JOB_PREEMPTED,
                     {"job_id": job.id, "_quantum_expiry": True})

            _schedule_pending_phases(job, now)

            etype = EventType.JOB_RESUMED if is_resume else EventType.JOB_STARTED
            emit(now, etype, {
                "job_id": job.id,
                "node_id": node_id,
                "remaining": rt.remaining,
                "cpu": job.cpu,
                "mem": job.mem,
                "role": job.role.value,
                "user_id": job.user_id,
            })

        def _schedule_pending_phases(job: Job, now: int) -> None:
            rt = job.runtime
            if rt is None:
                return
            elapsed = job.burst - rt.remaining
            for i, phase in enumerate(job.phases):
                if i in fired_phases[job.id]:
                    continue
                if phase.at <= elapsed:
                    push(now, EventOrder.PHASE_REQUEST, EventType.PHASE_REQUEST,
                         {"job_id": job.id, "phase_idx": i})
                else:
                    fire_at = now + (phase.at - elapsed)
                    push(fire_at, EventOrder.PHASE_REQUEST, EventType.PHASE_REQUEST,
                         {"job_id": job.id, "phase_idx": i})

        def _preempt_job(job: Job, now: int, reason: str = "preempted") -> None:
            nonlocal preemptions
            rt = job.runtime
            if rt is None:
                return
            if job.id in finish_events:
                rt.remaining = finish_events[job.id] - now
                del finish_events[job.id]

            executor.preempt(job.id)
            nid = rt.node_id
            if nid is not None:
                free_cpu[nid] += job.cpu
                free_mem[nid] += job.mem
                if job.id in node_jobs.get(nid, []):
                    node_jobs[nid].remove(job.id)
                rt.node_id = None

            user_running[job.user_id] -= 1
            rt.cpu_alloc = 0
            rt.mem_alloc = 0
            job.state = JobState.preempted
            eligible_set.add(job.id)
            quantum_expiry.pop(job.id, None)
            preemptions += 1

            if profile.scheduler == SchedulerKind.RR:
                sched.rr_enqueue(job.id, at_tail=True)

            emit(now, EventType.JOB_PREEMPTED, {
                "job_id": job.id,
                "node_id": nid,
                "reason": reason,
                "remaining": rt.remaining,
                "cpu": job.cpu,
                "mem": job.mem,
                "role": job.role.value,
            })

        def _kill_job(job: Job, now: int, reason: str) -> None:
            nonlocal restarts
            rt = job.runtime
            if rt is None:
                return
            finish_events.pop(job.id, None)
            executor.kill(job.id)

            nid = rt.node_id
            if nid is not None:
                free_cpu[nid] += job.cpu
                free_mem[nid] += job.mem
                if job.id in node_jobs.get(nid, []):
                    node_jobs[nid].remove(job.id)
                user_running[job.user_id] -= 1

            banker.deregister(job.id)
            emit(now, EventType.JOB_KILLED, {"job_id": job.id, "reason": reason})

            rt.remaining = job.burst
            rt.node_id = None
            rt.cpu_alloc = 0
            rt.mem_alloc = 0
            rt.pooled_alloc = PooledResources()
            rt.restarts += 1
            rt.first_start = None
            job.state = JobState.queued
            eligible_set.add(job.id)
            blocked_jobs.discard(job.id)
            pending_phase_req.pop(job.id, None)
            fired_phases[job.id].clear()
            banker.clear_pending(job.id)
            quantum_expiry.pop(job.id, None)
            restarts += 1

            if profile.scheduler == SchedulerKind.RR:
                sched.rr_enqueue(job.id, at_tail=True)

        # ------------------------------------------------------------------
        # Retry blocked jobs (called after resource release)
        # ------------------------------------------------------------------

        def _retry_blocked(now: int) -> None:
            for bjid in list(blocked_jobs):
                bj = jobs.get(bjid)
                if bj is None or bj.state != JobState.blocked:
                    blocked_jobs.discard(bjid)
                    continue
                pidx = pending_phase_req.get(bjid)
                if pidx is None:
                    continue
                phase = bj.phases[pidx]
                granted, reason = banker.try_grant(bj, phase.request, profile.banker)
                if granted:
                    bj.runtime.pooled_alloc = bj.runtime.pooled_alloc + phase.request
                    fired_phases[bjid].add(pidx)
                    bj.state = JobState.running
                    blocked_jobs.discard(bjid)
                    banker.clear_pending(bjid)
                    pending_phase_req.pop(bjid, None)
                    emit(now, EventType.PHASE_GRANTED,
                         {"job_id": bjid, "phase_idx": pidx,
                          "request": phase.request.model_dump()})

        # ------------------------------------------------------------------
        # Deadlock detection
        # ------------------------------------------------------------------

        def _check_deadlock(now: int) -> None:
            nonlocal deadlocks_det
            blocked = [jobs[jid] for jid in blocked_jobs if jid in jobs]
            deadlocked_ids = banker.detect_deadlock(blocked)
            if not deadlocked_ids:
                return

            deadlocks_det += 1
            edges = banker.wait_for_edges(blocked, list(jobs.values()))
            emit(now, EventType.DEADLOCK_DETECTED,
                 {"jobs": deadlocked_ids, "wait_for_edges": edges})

            dl_jobs = [jobs[jid] for jid in deadlocked_ids if jid in jobs]
            victim = min(
                dl_jobs,
                key=lambda j: (
                    priority_score(j, now, profile),
                    -(j.runtime.first_start or 0),
                ),
            )
            _kill_job(victim, now, "deadlock_victim")
            emit(now, EventType.DEADLOCK_RECOVERED, {"victim": victim.id})
            _retry_blocked(now)
            _dispatch(now)

        # ------------------------------------------------------------------
        # Time-series sampling
        # ------------------------------------------------------------------

        def _sample_ts(now: int) -> None:
            nonlocal last_ts_sample
            if now - last_ts_sample >= 5:
                last_ts_sample = now
                ts_t.append(now)
                ts_queue_len.append(len(eligible_set))
                total_cpu = sum(n.cpu for n in cluster.nodes if node_up.get(n.id, False))
                used_cpu = sum(n.cpu - free_cpu.get(n.id, n.cpu)
                               for n in cluster.nodes if node_up.get(n.id, False))
                ts_util.append(used_cpu / total_cpu if total_cpu else 0.0)
                ts_frag.append(fragmentation(cluster.nodes, free_mem))

        # ------------------------------------------------------------------
        # Preemption helpers
        # ------------------------------------------------------------------

        def _do_preempt(waiting: Job, victim: Job, now: int) -> None:
            if victim.runtime is None or victim.runtime.node_id is None:
                return
            node_id = victim.runtime.node_id
            _preempt_job(victim, now, "preempted_by_higher_priority")
            is_resume = waiting.state == JobState.preempted
            _start_job(waiting, node_id, now, is_resume=is_resume)
            if profile.scheduler == SchedulerKind.RR:
                sched.rr_dequeue(waiting.id)

        def _try_preempt(ordered: List[Job], started_jids: Set[str], now: int) -> None:
            if not profile.preemptive:
                return
            waiting = [j for j in ordered if j.id not in started_jids]
            if not waiting:
                return
            top_waiting = waiting[0]
            running = [j for j in jobs.values() if j.state == JobState.running]
            if not running:
                return

            if profile.scheduler == SchedulerKind.SJF:
                candidates = [
                    v for v in running
                    if v.runtime and v.runtime.node_id is not None
                    and top_waiting.runtime and top_waiting.runtime.remaining < v.runtime.remaining
                    and free_cpu.get(v.runtime.node_id, 0) + v.cpu >= top_waiting.cpu
                    and free_mem.get(v.runtime.node_id, 0) + v.mem >= top_waiting.mem
                    and node_up.get(v.runtime.node_id, False)
                ]
                if candidates:
                    victim = max(candidates, key=lambda j: j.runtime.remaining if j.runtime else 0)
                    _do_preempt(top_waiting, victim, now)

            elif profile.scheduler == SchedulerKind.PRIORITY:
                if profile.preempt_by and top_waiting.role not in profile.preempt_by:
                    return
                top_score = priority_score(top_waiting, now, profile)
                candidates = [
                    v for v in running
                    if v.runtime and v.runtime.node_id is not None
                    and top_score > priority_score(v, now, profile)
                    and free_cpu.get(v.runtime.node_id, 0) + v.cpu >= top_waiting.cpu
                    and free_mem.get(v.runtime.node_id, 0) + v.mem >= top_waiting.mem
                    and node_up.get(v.runtime.node_id, False)
                ]
                if candidates:
                    victim = min(candidates, key=lambda j: priority_score(j, now, profile))
                    _do_preempt(top_waiting, victim, now)

        # ------------------------------------------------------------------
        # Dispatch pass
        # ------------------------------------------------------------------

        def _build_state(t: int) -> Dict[str, Any]:
            q_jobs = [jobs[jid] for jid in eligible_set]
            slacks = [j.slack_at(t) for j in q_jobs if j.deadline is not None]
            tot_cpu = max(1, sum(n.cpu for n in cluster.nodes))
            used_cpu = sum(n.cpu - free_cpu[n.id] for n in cluster.nodes)
            role_counts: Dict[str, int] = defaultdict(int)
            for j in q_jobs:
                role_counts[j.role.value] += 1
            return {
                "queue_len": len(eligible_set),
                "nodes_down": sum(1 for up in node_up.values() if not up),
                "min_slack": min(slacks) if slacks else 9999.0,
                "util": used_cpu / tot_cpu,
                "running_count": sum(1 for j in jobs.values() if j.state == JobState.running),
                "queued_role_counts": dict(role_counts),
            }

        def _dispatch(now: int) -> None:
            nonlocal profile, sched, banker_denials
            if schedule is not None:
                st = _build_state(now)
                target_p_name, reason = schedule.active_profile_name(now, st, last_trigger_time, now)
                if target_p_name != profile.name:
                    old_name = profile.name
                    profile = _resolve_profile(target_p_name)
                    sched = SchedulerState(profile)
                    quantum_expiry.clear()
                    if profile.scheduler == SchedulerKind.RR:
                        for j in jobs.values():
                            if j.state == JobState.running:
                                sched.rr_quantum_start(j.id, now)
                                expiry = now + (profile.quantum or 4)
                                quantum_expiry[j.id] = expiry
                                push(expiry, EventOrder.QUANTUM_EXPIRY, EventType.JOB_PREEMPTED,
                                     {"job_id": j.id, "_quantum_expiry": True})
                            elif j.state in (JobState.queued, JobState.preempted):
                                sched.rr_enqueue(j.id, at_tail=True)
                    emit(now, EventType.PROFILE_SWITCHED, {
                        "from": old_name,
                        "to": target_p_name,
                        "reason": reason,
                    })

            if not eligible_set:
                return

            eligible = [jobs[jid] for jid in eligible_set]
            ordered = sched.order(eligible, now)
            started_jids: Set[str] = set()
            head_blocked = False
            queue_state_entries: List[Dict[str, Any]] = []

            for job in ordered:
                if record_events and len(queue_state_entries) >= 100:
                    break

                reason = WaitReason.READY
                can_start = True
                node_id: Optional[int] = None

                if not _quota_ok(job):
                    reason = WaitReason.QUOTA
                    can_start = False

                if can_start:
                    node_id = _find_node(job)
                    if node_id is None:
                        reason = WaitReason.NO_FIT
                        can_start = False

                # Banker's check for phase-0 request
                if can_start and node_id is not None:
                    phase0 = _get_phase0(job)
                    if phase0 is not None and not phase0.is_zero():
                        if job.id not in banker.max_claim:
                            banker.register(job)
                        granted, reason_str = banker.try_grant(job, phase0, profile.banker)
                        if not granted:
                            reason = WaitReason.BANKER_UNSAFE
                            can_start = False
                            if reason_str == "UNSAFE":
                                banker_denials += 1
                            # Undo: phase0 was not actually applied (try_grant only applies on grant)
                        else:
                            # Grant succeeded; track the allocation
                            job.runtime = job.runtime or JobRuntime(remaining=job.burst)
                            job.runtime.pooled_alloc = (
                                job.runtime.pooled_alloc + phase0
                            )
                            fired_phases[job.id].add(
                                next(i for i, p in enumerate(job.phases) if p.at == 0)
                            )

                if profile.backfill is False and not can_start and not started_jids:
                    reason = WaitReason.HEAD_OF_LINE
                    head_blocked = True

                if record_events:
                    score = (priority_score(job, now, profile)
                             if profile.scheduler == SchedulerKind.PRIORITY else None)
                    queue_state_entries.append({
                        "job_id": job.id, "reason": reason.value, "score": score,
                    })

                if head_blocked:
                    if record_events:
                        for remaining_job in ordered:
                            if not any(e["job_id"] == remaining_job.id for e in queue_state_entries):
                                queue_state_entries.append({
                                    "job_id": remaining_job.id,
                                    "reason": WaitReason.OUTRANKED.value,
                                    "score": (priority_score(remaining_job, now, profile)
                                              if profile.scheduler == SchedulerKind.PRIORITY else None),
                                })
                    break

                if can_start and node_id is not None:
                    is_resume = job.state == JobState.preempted
                    _start_job(job, node_id, now, is_resume=is_resume)
                    started_jids.add(job.id)
                    if profile.scheduler == SchedulerKind.RR:
                        sched.rr_dequeue(job.id)

            if record_events:
                emit(now, EventType.QUEUE_STATE, {
                    "entries": queue_state_entries[:100],
                    "queue_len": len(eligible),
                })

            _try_preempt(ordered, started_jids, now)

        # ------------------------------------------------------------------
        # Seed arrival, node, and schedule events
        # ------------------------------------------------------------------
        for j in jobs.values():
            push(j.arrival, EventOrder.JOB_ARRIVAL, EventType.JOB_ARRIVED,
                 {"job_id": j.id})

        if node_events:
            for ne in node_events:
                t = ne["at"]
                is_down = (ne["type"] == "NODE_DOWN")
                etype = EventType.NODE_DOWN if is_down else EventType.NODE_UP
                eorder = EventOrder.NODE_DOWN if is_down else EventOrder.NODE_UP
                push(t, eorder, etype, {"node_id": ne["node_id"]})

        if schedule is not None:
            max_duration = max([j.arrival + j.burst for j in workload] + [480]) + 120
            for t_eval in range(30, max_duration, 30):
                push(t_eval, EventOrder.PROFILE_EVAL, EventType.PROFILE_SWITCHED, {"_eval": True})

        # ------------------------------------------------------------------
        # Main event loop
        # ------------------------------------------------------------------
        while pq:
            ev = heapq.heappop(pq)
            now = ev.t
            clock.advance(now)
            _sample_ts(now)

            etype = ev.kind
            payload = ev.payload
            job_id: Optional[str] = payload.get("job_id")
            job: Optional[Job] = jobs.get(job_id) if job_id else None

            # Skip stale events for finished jobs
            if job is not None and job.state == JobState.done:
                continue

            # ----------------------------------------------------------------
            # JOB_ARRIVED
            # ----------------------------------------------------------------
            if etype == EventType.JOB_ARRIVED.value:
                if job:
                    eligible_set.add(job_id)
                    emit(now, EventType.JOB_ARRIVED, {
                        "job_id": job_id,
                        "role": job.role.value,
                        "kind": job.kind.value,
                        "user_id": job.user_id,
                        "cpu": job.cpu,
                        "mem": job.mem,
                        "burst": job.burst,
                        "pooled": job.runtime.pooled_alloc.model_dump() if (job.runtime and job.runtime.pooled_alloc) else {"gpu": 0, "lic": 0, "io": 0},
                    })
                    if profile.scheduler == SchedulerKind.RR:
                        sched.rr_enqueue(job_id, at_tail=True)
                    banker.register(job)

            # ----------------------------------------------------------------
            # JOB_FINISHED
            # ----------------------------------------------------------------
            elif etype == EventType.JOB_FINISHED.value:
                if job and job.state == JobState.running:
                    expected = finish_events.get(job_id)
                    if expected is not None and expected != now:
                        continue  # stale

                    rt = job.runtime
                    nid = rt.node_id if rt else None
                    if nid is not None and rt:
                        free_cpu[nid] += job.cpu
                        free_mem[nid] += job.mem
                        if job_id in node_jobs.get(nid, []):
                            node_jobs[nid].remove(job_id)
                    user_running[job.user_id] -= 1
                    if rt:
                        rt.finish = now
                        rt.remaining = 0
                    job.state = JobState.done
                    finish_events.pop(job_id, None)
                    banker.deregister(job_id)
                    blocked_jobs.discard(job_id)
                    eligible_set.discard(job_id)

                    emit(now, EventType.JOB_FINISHED, {
                        "job_id": job_id,
                        "node_id": nid,
                        "turnaround": now - job.arrival,
                        "wait": (rt.first_start - job.arrival) if rt and rt.first_start else 0,
                        "deadline_missed": job.missed_deadline(),
                        "cpu": job.cpu,
                        "mem": job.mem,
                        "role": job.role.value,
                    })
                    _retry_blocked(now)

            # ----------------------------------------------------------------
            # QUANTUM_EXPIRY (RR)
            # ----------------------------------------------------------------
            elif etype == EventType.JOB_PREEMPTED.value and payload.get("_quantum_expiry"):
                if job and job.state == JobState.running:
                    if quantum_expiry.get(job_id) != now:
                        continue  # stale
                    eligible_others = any(jid != job_id for jid in eligible_set)
                    if eligible_others:
                        _preempt_job(job, now, "quantum_expired")
                    else:
                        # Renew quantum
                        sched.rr_quantum_start(job_id, now)
                        expiry = now + (profile.quantum or 4)
                        quantum_expiry[job_id] = expiry
                        push(expiry, EventOrder.QUANTUM_EXPIRY, EventType.JOB_PREEMPTED,
                             {"job_id": job_id, "_quantum_expiry": True})
                        continue

            # ----------------------------------------------------------------
            # PHASE_REQUEST
            # ----------------------------------------------------------------
            elif etype == EventType.PHASE_REQUEST.value:
                phase_idx: int = payload.get("phase_idx", 0)
                if job and job.state == JobState.running:
                    if phase_idx in fired_phases.get(job_id, set()):
                        continue
                    phase = job.phases[phase_idx]
                    emit(now, EventType.PHASE_REQUEST,
                         {"job_id": job_id, "phase_idx": phase_idx,
                          "request": phase.request.model_dump()})

                    if job.id not in banker.max_claim:
                        banker.register(job)

                    granted, reason_str = banker.try_grant(job, phase.request, profile.banker)
                    fired_phases[job_id].add(phase_idx)

                    if granted:
                        job.runtime.pooled_alloc = job.runtime.pooled_alloc + phase.request
                        emit(now, EventType.PHASE_GRANTED,
                             {"job_id": job_id, "phase_idx": phase_idx,
                              "request": phase.request.model_dump()})
                    else:
                        banker.set_pending(job_id, phase.request)
                        blocked_jobs.add(job_id)
                        eligible_set.discard(job_id)
                        job.state = JobState.blocked
                        pending_phase_req[job_id] = phase_idx
                        fired_phases[job_id].discard(phase_idx)  # allow retry

                        if reason_str == "UNSAFE":
                            banker_denials += 1

                        if reason_str == "UNSAFE":
                            emit(now, EventType.REQUEST_DENIED_UNSAFE,
                                 {"job_id": job_id, "phase_idx": phase_idx,
                                  "request": phase.request.model_dump()})
                        else:
                            emit(now, EventType.PHASE_BLOCKED,
                                 {"job_id": job_id, "phase_idx": phase_idx})
                        _check_deadlock(now)

            # ----------------------------------------------------------------
            # NODE_DOWN
            # ----------------------------------------------------------------
            elif etype == EventType.NODE_DOWN.value:
                nid: int = payload["node_id"]
                node_up[nid] = False
                for vjid in list(node_jobs.get(nid, [])):
                    vj = jobs.get(vjid)
                    if vj and vj.state in (JobState.running, JobState.blocked):
                        _kill_job(vj, now, "node_down")
                free_cpu[nid] = 0
                free_mem[nid] = 0
                emit(now, EventType.NODE_DOWN, {"node_id": nid})

            # ----------------------------------------------------------------
            # NODE_UP
            # ----------------------------------------------------------------
            elif etype == EventType.NODE_UP.value:
                nid = payload["node_id"]
                node_up[nid] = True
                n = cluster.node_by_id(nid)
                if n:
                    free_cpu[nid] = n.cpu
                    free_mem[nid] = n.mem
                emit(now, EventType.NODE_UP, {"node_id": nid})
                _retry_blocked(now)

            # ----------------------------------------------------------------
            # PROFILE_EVAL (periodic check for schedule)
            # ----------------------------------------------------------------
            elif etype == EventType.PROFILE_SWITCHED.value and payload.get("_eval"):
                pass

            # One dispatch pass per timestamp after all events at `now` are processed (§6.1)
            if not pq or pq[0].t > now:
                _dispatch(now)

        # ------------------------------------------------------------------
        # Final metrics
        # ------------------------------------------------------------------
        finish_times = [
            j.runtime.finish for j in jobs.values()
            if j.runtime and j.runtime.finish is not None
        ]
        makespan = max(finish_times) if finish_times else 0
        cpu_time_used = sum(
            j.burst * j.cpu for j in jobs.values() if j.state == JobState.done
        )
        total_cpu_avail = sum(n.cpu for n in cluster.nodes) * makespan

        metrics = compute_metrics(
            jobs=list(jobs.values()),
            nodes=cluster.nodes,
            makespan=makespan,
            total_cpu_available=total_cpu_avail,
            cpu_time_used=cpu_time_used,
            preemptions=preemptions,
            restarts=restarts,
            deadlocks_detected=deadlocks_det,
            banker_denials=banker_denials,
            frag_time_series=ts_frag,
            util_time_series=ts_util,
            queue_len_time_series=ts_queue_len,
            sample_times=ts_t,
        )

        if record_events:
            log_str = json.dumps(event_log, sort_keys=True)
            log_hash = hashlib.sha256(log_str.encode()).hexdigest()
        else:
            log_hash = ""

        run_name = profile.name if schedule is None else f"scheduled_{profile.name}"
        return RunResult(
            run_id=f"run_{seed}_{run_name}",
            events=event_log if record_events else [],
            metrics=metrics,
            event_log_hash=log_hash,
        )


# ---------------------------------------------------------------------------
# Convenience
# ---------------------------------------------------------------------------

def run(
    cluster: "Cluster",
    workload: List["Job"],
    profile: Profile | Schedule,
    seed: int = 0,
    record_events: bool = True,
    node_events: Optional[List[Dict[str, Any]]] = None,
    resolve_profile: Optional[Callable[[str], Optional[Profile]]] = None,
) -> "RunResult":
    return Engine().run(cluster, workload, profile, seed=seed, record_events=record_events,
                        node_events=node_events, resolve_profile=resolve_profile)
