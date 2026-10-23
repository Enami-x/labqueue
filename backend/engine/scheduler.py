"""
engine/scheduler.py – Scheduling algorithms and priority scoring.

Implements §6.2 (Dispatch pass), §6.3 (Priority score).
"""

from __future__ import annotations

import math
from collections import deque
from typing import Deque, Dict, List, Optional, Tuple

from engine.model import Job, JobState, Role, ROLE_PRIORITY, SchedulerKind
from engine.profiles import Profile


# ---------------------------------------------------------------------------
# Priority score (§6.3)
# ---------------------------------------------------------------------------

def priority_score(
    job: Job,
    now: int,
    profile: Profile,
) -> float:
    """
    score = w.role * role_norm
          + w.deadline * urgency
          + w.wait * wait_norm
          + w.size * smallness
          + aging_rate * wait_time
    """
    w = profile.weights
    if w is None:
        return 0.0

    rt = job.runtime
    wait_time = max(0, now - job.arrival) if rt is None or rt.first_start is None \
        else max(0, now - job.arrival)  # total elapsed since arrival

    # role_norm
    role_norm = ROLE_PRIORITY.get(job.role, 0.0)

    # urgency: clamp(1 - slack/60, 0, 1), slack = deadline - now - remaining (0 if no deadline)
    if job.deadline is not None and rt is not None:
        slack = job.deadline - now - rt.remaining
        urgency = max(0.0, min(1.0, 1.0 - slack / 60.0))
    else:
        urgency = 0.0

    # wait_norm
    wait_norm = min(wait_time / 60.0, 1.0)

    # smallness = 1 - min(burst/480, 1)
    smallness = 1.0 - min(job.burst / 480.0, 1.0)

    score = (
        w.role     * role_norm
        + w.deadline * urgency
        + w.wait     * wait_norm
        + w.size     * smallness
        + profile.aging_rate * wait_time
    )
    return score


def priority_score_breakdown(job: Job, now: int, profile: Profile) -> Dict[str, float]:
    """Return the individual components of the priority score."""
    w = profile.weights
    if w is None:
        return {}

    rt = job.runtime
    wait_time = max(0, now - job.arrival)

    role_norm = ROLE_PRIORITY.get(job.role, 0.0)

    if job.deadline is not None and rt is not None:
        slack = job.deadline - now - rt.remaining
        urgency = max(0.0, min(1.0, 1.0 - slack / 60.0))
    else:
        urgency = 0.0

    wait_norm = min(wait_time / 60.0, 1.0)
    smallness = 1.0 - min(job.burst / 480.0, 1.0)

    return {
        "role_component":     w.role * role_norm,
        "deadline_component": w.deadline * urgency,
        "wait_component":     w.wait * wait_norm,
        "size_component":     w.size * smallness,
        "aging_component":    profile.aging_rate * wait_time,
        "total":              priority_score(job, now, profile),
        "role_norm":          role_norm,
        "urgency":            urgency,
        "wait_norm":          wait_norm,
        "smallness":          smallness,
        "wait_time":          wait_time,
    }


# ---------------------------------------------------------------------------
# Scheduler state
# ---------------------------------------------------------------------------

class SchedulerState:
    """
    Maintains the ordering of the ready queue and RR quantum tracking.
    The engine owns one SchedulerState and calls it at each dispatch point.
    """

    def __init__(self, profile: Profile) -> None:
        self.profile = profile
        # RR queue (job ids in FIFO order)
        self._rr_queue: Deque[str] = deque()
        # quantum start times: job_id -> sim_time
        self._quantum_start: Dict[str, int] = {}

    def switch_profile(self, new_profile: Profile, now: int) -> None:
        """Apply a profile switch: reset RR quantum timers."""
        self.profile = new_profile
        self._quantum_start.clear()

    # ------------------------------------------------------------------
    # Ordering
    # ------------------------------------------------------------------

    def order(self, jobs: List[Job], now: int) -> List[Job]:
        """Return jobs in dispatch order for the current profile."""
        p = self.profile
        if p.scheduler == SchedulerKind.FCFS:
            return sorted(jobs, key=lambda j: (j.arrival, j.id))

        elif p.scheduler == SchedulerKind.SJF:
            # SRTF if preemptive
            return sorted(jobs, key=lambda j: (
                j.runtime.remaining if j.runtime else j.burst,
                j.arrival,
                j.id,
            ))

        elif p.scheduler == SchedulerKind.RR:
            job_map = {j.id: j for j in jobs}
            ordered = [job_map[jid] for jid in self._rr_queue if jid in job_map]
            if len(ordered) < len(jobs):
                in_rr = set(self._rr_queue)
                unseen = [j for j in jobs if j.id not in in_rr]
                unseen.sort(key=lambda j: (j.arrival, j.id))
                ordered.extend(unseen)
            return ordered

        elif p.scheduler == SchedulerKind.PRIORITY:
            return sorted(jobs, key=lambda j: (-priority_score(j, now, p), j.arrival, j.id))

        raise ValueError(f"Unknown scheduler: {p.scheduler}")

    # ------------------------------------------------------------------
    # RR queue management
    # ------------------------------------------------------------------

    def rr_enqueue(self, job_id: str, at_tail: bool = True) -> None:
        if job_id in self._rr_queue:
            return
        if at_tail:
            self._rr_queue.append(job_id)
        else:
            self._rr_queue.appendleft(job_id)

    def rr_dequeue(self, job_id: str) -> None:
        try:
            self._rr_queue.remove(job_id)
        except ValueError:
            pass

    def rr_quantum_start(self, job_id: str, now: int) -> None:
        self._quantum_start[job_id] = now

    def rr_quantum_remaining(self, job_id: str, now: int) -> int:
        start = self._quantum_start.get(job_id, now)
        elapsed = now - start
        quantum = self.profile.quantum or 4
        return max(0, quantum - elapsed)

    def rr_quantum_expired(self, job_id: str, now: int) -> bool:
        return self.rr_quantum_remaining(job_id, now) <= 0

    def rr_next_expiry(self, job_id: str, now: int) -> int:
        start = self._quantum_start.get(job_id, now)
        quantum = self.profile.quantum or 4
        return start + quantum
