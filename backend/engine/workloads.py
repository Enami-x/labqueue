"""
engine/workloads.py – Seeded workload generators and built-in scenarios.

See spec §8.
"""

from __future__ import annotations

import json
import math
import random
from typing import Any, Dict, List, Optional

from engine.model import (
    Job, JobKind, JobRuntime, Phase, PlacementKind, PooledResources, Role
)


# ---------------------------------------------------------------------------
# Scenario definitions
# ---------------------------------------------------------------------------

SCENARIOS = {
    "exam_rush": {
        "description": "Exam-week rush: mostly ug/exam short jobs, tight deadlines, two arrival bursts.",
        "duration": 480,   # 8 hours (1 sim day = 480 min)
        "role_mix": {Role.ug: 0.5, Role.exam: 0.3, Role.faculty: 0.1, Role.phd: 0.1},
        "arrival_rate": 0.5,   # avg jobs per minute
        "burst_mu": 2.5, "burst_sigma": 0.8,
        "deadline_pct": 0.7, "deadline_factor": 2.0,
        "gpu_pct": 0.05, "lic_pct": 0.1, "io_pct": 0.1,
        "arrival_bursts": [{"at": 60, "duration": 30, "rate_mult": 3},
                           {"at": 300, "duration": 30, "rate_mult": 2}],
    },
    "hackathon_night": {
        "description": "High evening arrival rate, mixed bursts.",
        "duration": 480,
        "role_mix": {Role.ug: 0.4, Role.phd: 0.3, Role.guest: 0.2, Role.faculty: 0.1},
        "arrival_rate": 0.6,
        "burst_mu": 3.0, "burst_sigma": 1.2,
        "deadline_pct": 0.2, "deadline_factor": 3.0,
        "gpu_pct": 0.2, "lic_pct": 0.15, "io_pct": 0.2,
        "arrival_bursts": [{"at": 120, "duration": 60, "rate_mult": 2}],
    },
    "research_mixed": {
        "description": "Long phd/gpu jobs plus short ug.",
        "duration": 480,
        "role_mix": {Role.phd: 0.5, Role.ug: 0.3, Role.faculty: 0.2},
        "arrival_rate": 0.3,
        "burst_mu": 4.0, "burst_sigma": 1.5,
        "deadline_pct": 0.3, "deadline_factor": 4.0,
        "gpu_pct": 0.4, "lic_pct": 0.2, "io_pct": 0.2,
        "arrival_bursts": [],
    },
    "thesis_week": {
        "description": "PhD-heavy with deadlines, 3 days.",
        "duration": 1440,  # 3 days
        "role_mix": {Role.phd: 0.7, Role.faculty: 0.2, Role.ug: 0.1},
        "arrival_rate": 0.2,
        "burst_mu": 4.5, "burst_sigma": 1.2,
        "deadline_pct": 0.6, "deadline_factor": 3.0,
        "gpu_pct": 0.5, "lic_pct": 0.3, "io_pct": 0.2,
        "arrival_bursts": [],
    },
    "node_failure_day": {
        "description": "Balanced load + two node outages.",
        "duration": 480,
        "role_mix": {Role.ug: 0.4, Role.phd: 0.3, Role.faculty: 0.2, Role.guest: 0.1},
        "arrival_rate": 0.4,
        "burst_mu": 3.0, "burst_sigma": 1.0,
        "deadline_pct": 0.3, "deadline_factor": 3.0,
        "gpu_pct": 0.2, "lic_pct": 0.1, "io_pct": 0.15,
        "arrival_bursts": [],
        "node_events": [
            {"at": 100, "type": "NODE_DOWN", "node_id": 2},
            {"at": 200, "type": "NODE_UP",   "node_id": 2},
            {"at": 300, "type": "NODE_DOWN", "node_id": 3},
            {"at": 380, "type": "NODE_UP",   "node_id": 3},
        ],
    },
    "balanced_day": {
        "description": "Balanced load across roles, one day.",
        "duration": 480,
        "role_mix": {
            Role.ug: 0.35, Role.phd: 0.25, Role.faculty: 0.15,
            Role.exam: 0.10, Role.demo: 0.05, Role.guest: 0.10,
        },
        "arrival_rate": 0.35,
        "burst_mu": 3.0, "burst_sigma": 1.0,
        "deadline_pct": 0.25, "deadline_factor": 3.0,
        "gpu_pct": 0.15, "lic_pct": 0.1, "io_pct": 0.1,
        "arrival_bursts": [],
    },
}


# ---------------------------------------------------------------------------
# Workload generator
# ---------------------------------------------------------------------------

# Role -> typical (cpu_min, cpu_max, mem_min, mem_max)
_ROLE_RESOURCES = {
    Role.faculty: (2, 8,  4,  32),
    Role.phd:     (2, 8,  4,  32),
    Role.exam:    (1, 4,  2,  16),
    Role.demo:    (1, 4,  2,  16),
    Role.ug:      (1, 4,  1,   8),
    Role.guest:   (1, 2,  1,   4),
}

# JobKind -> typical roles
_KIND_FOR_ROLE = {
    Role.phd:     [JobKind.training, JobKind.preprocess],
    Role.faculty: [JobKind.demo, JobKind.inference],
    Role.exam:    [JobKind.assignment],
    Role.demo:    [JobKind.demo],
    Role.ug:      [JobKind.assignment, JobKind.preprocess],
    Role.guest:   [JobKind.inference, JobKind.assignment],
}


def generate_workload(
    scenario_name: str,
    n_jobs: Optional[int] = None,
    seed: int = 42,
    extra_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a workload for the given scenario.
    Returns a dict with 'jobs' (list of Job dicts), 'scenario', 'seed', 'node_events'.
    """
    if scenario_name not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario_name}")

    cfg = {**SCENARIOS[scenario_name]}
    if extra_params:
        cfg.update(extra_params)

    rng = random.Random(seed)
    duration: int = cfg["duration"]
    arrival_rate: float = cfg["arrival_rate"]
    role_mix: Dict[Role, float] = cfg["role_mix"]
    burst_mu: float = cfg["burst_mu"]
    burst_sigma: float = cfg["burst_sigma"]
    deadline_pct: float = cfg["deadline_pct"]
    deadline_factor: float = cfg["deadline_factor"]
    gpu_pct: float = cfg["gpu_pct"]
    lic_pct: float = cfg["lic_pct"]
    io_pct: float = cfg["io_pct"]
    arrival_bursts = cfg.get("arrival_bursts", [])

    # Generate arrival times using Poisson process
    arrivals: List[int] = []
    t = 0.0
    if n_jobs is not None:
        while len(arrivals) < n_jobs:
            inter = rng.expovariate(arrival_rate)
            t += inter
            arrivals.append(int(t))
    else:
        while t < duration:
            inter = rng.expovariate(arrival_rate)
            t += inter
            if t < duration:
                arrivals.append(int(t))

        # Apply burst multipliers
        burst_arrivals: List[int] = []
        for burst_cfg in arrival_bursts:
            b_start = burst_cfg["at"]
            b_end = b_start + burst_cfg["duration"]
            mult = burst_cfg["rate_mult"]
            extra = int((b_end - b_start) * arrival_rate * (mult - 1))
            for _ in range(extra):
                burst_arrivals.append(rng.randint(b_start, b_end - 1))
        arrivals = sorted(arrivals + burst_arrivals)

    arrivals = arrivals[:n_jobs] if n_jobs is not None else arrivals

    # Build roles list
    roles = list(role_mix.keys())
    role_weights = [role_mix[r] for r in roles]

    jobs = []
    for i, arrival in enumerate(arrivals):
        role: Role = rng.choices(roles, weights=role_weights, k=1)[0]
        kinds = _KIND_FOR_ROLE.get(role, [JobKind.assignment])
        kind: JobKind = rng.choice(kinds)

        # Burst: lognormal
        raw_burst = rng.lognormvariate(burst_mu, burst_sigma)
        burst = max(1, min(int(raw_burst), 480))

        # Resources
        cpu_min, cpu_max, mem_min, mem_max = _ROLE_RESOURCES.get(role, (1, 4, 1, 8))
        cpu = rng.randint(cpu_min, cpu_max)
        mem = rng.randint(mem_min, mem_max)

        # Deadline
        deadline = None
        if rng.random() < deadline_pct:
            deadline = arrival + int(burst * deadline_factor * rng.uniform(0.8, 1.5))

        # Phases (pooled resources)
        phases = []
        max_gpu = max_lic = max_io = 0
        if rng.random() < gpu_pct:
            n_phases = rng.randint(1, 2)
            for ph_i in range(n_phases):
                at = rng.randint(0, burst - 1) if burst > 1 else 0
                g = rng.randint(1, 2)
                l = rng.randint(0, 1) if rng.random() < lic_pct else 0
                io = rng.randint(0, 1) if rng.random() < io_pct else 0
                phases.append({"at": at, "request": {"gpu": g, "lic": l, "io": io}})
                max_gpu += g; max_lic += l; max_io += io
        elif rng.random() < lic_pct:
            at = rng.randint(0, burst - 1) if burst > 1 else 0
            l = rng.randint(1, 2)
            phases.append({"at": at, "request": {"gpu": 0, "lic": l, "io": 0}})
            max_lic += l
        elif rng.random() < io_pct:
            at = rng.randint(0, burst - 1) if burst > 1 else 0
            phases.append({"at": at, "request": {"gpu": 0, "lic": 0, "io": rng.randint(1, 2)}})

        phases.sort(key=lambda p: p["at"])

        job_dict = {
            "id": f"j{i:04d}",
            "user_id": f"u{rng.randint(0, 20):03d}",
            "role": role.value,
            "kind": kind.value,
            "arrival": arrival,
            "burst": burst,
            "deadline": deadline,
            "cpu": cpu,
            "mem": mem,
            "phases": phases,
            "max_claim": {"gpu": max_gpu, "lic": max_lic, "io": max_io},
        }
        jobs.append(job_dict)

    return {
        "scenario": scenario_name,
        "seed": seed,
        "jobs": jobs,
        "node_events": cfg.get("node_events", []),
        "duration": duration,
    }


def workload_from_dict(data: Dict[str, Any]) -> List[Job]:
    """Deserialise a workload dict into a list of Job objects."""
    result = []
    for jd in data["jobs"]:
        phases = [
            Phase(at=p["at"], request=PooledResources(**p["request"]))
            for p in jd.get("phases", [])
        ]
        mc = jd.get("max_claim", {"gpu": 0, "lic": 0, "io": 0})
        j = Job(
            id=jd["id"],
            user_id=jd["user_id"],
            role=Role(jd["role"]),
            kind=JobKind(jd["kind"]),
            arrival=jd["arrival"],
            burst=jd["burst"],
            deadline=jd.get("deadline"),
            cpu=jd["cpu"],
            mem=jd["mem"],
            phases=phases,
            max_claim=PooledResources(**mc),
        )
        result.append(j)
    return result


def workload_to_dict(jobs: List[Job]) -> List[Dict]:
    """Serialise a list of Jobs to dicts."""
    result = []
    for j in jobs:
        result.append({
            "id": j.id,
            "user_id": j.user_id,
            "role": j.role.value,
            "kind": j.kind.value,
            "arrival": j.arrival,
            "burst": j.burst,
            "deadline": j.deadline,
            "cpu": j.cpu,
            "mem": j.mem,
            "phases": [
                {"at": p.at, "request": p.request.model_dump()}
                for p in j.phases
            ],
            "max_claim": j.max_claim.model_dump(),
        })
    return result
