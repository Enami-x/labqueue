"""
engine/metrics.py – Metrics computation from a completed run.

See spec §6.10.
"""

from __future__ import annotations

import math
import statistics
from typing import Dict, List, Optional, Tuple

from engine.model import Job, Node, Role


# ---------------------------------------------------------------------------
# Per-job helpers
# ---------------------------------------------------------------------------

def _wait_times(jobs: List[Job]) -> List[int]:
    return [j.wait_time for j in jobs if j.state.value == "done"]


def _turnarounds(jobs: List[Job]) -> List[int]:
    return [j.turnaround for j in jobs if j.turnaround is not None]


def _response_times(jobs: List[Job]) -> List[int]:
    return [j.response_time for j in jobs if j.response_time is not None]


def _p95(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(math.ceil(0.95 * len(s))) - 1
    return s[max(0, idx)]


def _p99(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(math.ceil(0.99 * len(s))) - 1
    return s[max(0, idx)]


# ---------------------------------------------------------------------------
# Jain's fairness index
# ---------------------------------------------------------------------------

def jains_index(values: List[float]) -> float:
    """Jain's fairness index over a list of floats."""
    if not values:
        return 1.0
    n = len(values)
    s = sum(values)
    sq = sum(v * v for v in values)
    return (s * s) / (n * sq) if sq > 0 else 1.0


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------

def compute_metrics(
    jobs: List[Job],
    nodes: List[Node],
    makespan: int,
    total_cpu_available: int,          # sum of (node.cpu * makespan) for up-time
    cpu_time_used: int,                # total job-cpu-time consumed
    preemptions: int,
    restarts: int,
    deadlocks_detected: int,
    banker_denials: int,
    frag_time_series: List[float],     # fragmentation sampled every 5 units
    util_time_series: List[float],     # utilisation sampled every 5 units
    queue_len_time_series: List[int],
    sample_times: Optional[List[int]] = None,  # sim minute of each sample above
) -> Dict:
    """Compute all metrics for a completed run."""

    done_jobs = [j for j in jobs if j.state.value == "done"]

    # ---- waiting time ---------------------------------------------------
    waits = _wait_times(done_jobs)
    avg_wait = statistics.mean(waits) if waits else 0.0
    p95_wait = _p95(waits)
    p99_wait = _p99(waits)
    max_wait = max(waits) if waits else 0

    # ---- turnaround -----------------------------------------------------
    turns = _turnarounds(done_jobs)
    avg_turnaround = statistics.mean(turns) if turns else 0.0

    # ---- response time --------------------------------------------------
    resp = _response_times(done_jobs)
    avg_response = statistics.mean(resp) if resp else 0.0

    # ---- by role --------------------------------------------------------
    by_role: Dict[str, dict] = {}
    for role in Role:
        role_jobs = [j for j in done_jobs if j.role == role]
        r_waits = _wait_times(role_jobs)
        r_turns = _turnarounds(role_jobs)
        r_resp  = _response_times(role_jobs)
        by_role[role.value] = {
            "count": len(role_jobs),
            "avg_wait":       statistics.mean(r_waits) if r_waits else 0.0,
            "p95_wait":       _p95(r_waits),
            "max_wait":       max(r_waits) if r_waits else 0,
            "avg_turnaround": statistics.mean(r_turns) if r_turns else 0.0,
            "avg_response":   statistics.mean(r_resp)  if r_resp  else 0.0,
            "deadline_misses": sum(1 for j in role_jobs if j.missed_deadline()),
        }

    # ---- makespan, throughput -------------------------------------------
    throughput = (len(done_jobs) / makespan * 60) if makespan > 0 else 0.0

    # ---- utilisation ----------------------------------------------------
    utilization = cpu_time_used / total_cpu_available if total_cpu_available > 0 else 0.0

    # ---- fragmentation (time-averaged) ----------------------------------
    avg_fragmentation = statistics.mean(frag_time_series) if frag_time_series else 0.0

    # ---- deadline misses ------------------------------------------------
    deadline_misses = sum(1 for j in done_jobs if j.missed_deadline())
    total_with_deadline = sum(1 for j in done_jobs if j.deadline is not None)
    deadline_miss_rate = (deadline_misses / total_with_deadline) if total_with_deadline else 0.0

    # ---- starvation: jobs waiting > 120 units ---------------------------
    starvation_count = sum(1 for j in done_jobs if j.wait_time > 120)

    # ---- fairness: Jain's index over per-user average slowdown ----------
    user_slowdowns: Dict[str, List[float]] = {}
    for j in done_jobs:
        sd = j.slowdown
        if sd is not None:
            user_slowdowns.setdefault(j.user_id, []).append(sd)
    user_avg_sd = [statistics.mean(v) for v in user_slowdowns.values()]
    fairness_index = jains_index(user_avg_sd)

    return {
        "avg_wait":           avg_wait,
        "p95_wait":           p95_wait,
        "p99_wait":           p99_wait,
        "max_wait":           max_wait,
        "avg_turnaround":     avg_turnaround,
        "avg_response":       avg_response,
        "makespan":           makespan,
        "throughput":         throughput,
        "utilization":        utilization,
        "cpu_util_avg":       utilization,
        "avg_fragmentation":  avg_fragmentation,
        "deadline_misses":    deadline_misses,
        "deadline_miss_rate": deadline_miss_rate,
        "starvation_count":   starvation_count,
        "starved_jobs":       starvation_count,
        "fairness_index":     fairness_index,
        "jains_fairness":     fairness_index,
        "preemptions":        preemptions,
        "restarts":           restarts,
        "deadlocks_detected": deadlocks_detected,
        "banker_denials":     banker_denials,
        "jobs_completed":     len(done_jobs),
        "total_jobs":         len(jobs),
        "by_role":            by_role,
        "time_series": {
            "t":            list(sample_times or []),
            "queue_len":    queue_len_time_series,
            "utilization":  util_time_series,
            "fragmentation": frag_time_series,
        },
    }
