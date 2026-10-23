"""
tests/test_stage1.py – Stage 1: FCFS, placement, determinism.
"""

import copy
import hashlib
import json
import pytest

from engine.model import (
    Cluster, Job, JobKind, JobState, Node, PooledResources, Role
)
from engine.engine import run
from engine.profiles import BASE_PROFILE_MAP


def make_job(id, arrival, burst, cpu=1, mem=1, role=Role.ug, user_id="u0"):
    return Job(
        id=id, user_id=user_id, role=role, kind=JobKind.assignment,
        arrival=arrival, burst=burst, cpu=cpu, mem=mem,
    )


@pytest.fixture
def single_cpu_cluster():
    """1 node, 1 CPU, unlimited mem – textbook single-CPU model."""
    return Cluster(
        nodes=[Node(id=0, name="n0", cpu=1, mem=999)],
        pooled=PooledResources(),
    )


class TestFCFS:
    """Spec test: P1=24, P2=3, P3=3, all arriving at 0 -> avg wait 17."""

    def test_avg_wait(self, single_cpu_cluster):
        jobs = [
            make_job("P1", 0, 24),
            make_job("P2", 0, 3),
            make_job("P3", 0, 3),
        ]
        profile = BASE_PROFILE_MAP["long_run_training"]  # FCFS, no quota
        result = run(single_cpu_cluster, jobs, profile, seed=0)

        # Compute per-job waits
        done = {e["job_id"]: e for e in result.events if e["type"] == "JOB_FINISHED"}
        started = {}
        for e in result.events:
            if e["type"] == "JOB_STARTED" and e["job_id"] not in started:
                started[e["job_id"]] = e["t"]

        waits = [started[jid] - 0 for jid in ("P1", "P2", "P3")]
        # P1 starts at 0 (wait=0), P2 at 24 (wait=24), P3 at 27 (wait=27)
        assert waits[0] == 0
        assert waits[1] == 24
        assert waits[2] == 27
        avg_wait = sum(waits) / 3
        assert abs(avg_wait - 17.0) < 0.01

    def test_determinism(self, single_cpu_cluster):
        jobs = [make_job(f"j{i}", i * 5, 10 + i) for i in range(10)]
        profile = BASE_PROFILE_MAP["long_run_training"]
        r1 = run(single_cpu_cluster, jobs, profile, seed=42)
        r2 = run(single_cpu_cluster, jobs, profile, seed=42)
        assert r1.event_log_hash == r2.event_log_hash

    def test_different_seeds_differ(self, single_cpu_cluster):
        """With non-trivial workloads different seeds should not matter for FCFS
        (it is deterministic on arrivals), so same hash expected."""
        jobs = [make_job(f"j{i}", i * 5, 10 + i) for i in range(5)]
        profile = BASE_PROFILE_MAP["long_run_training"]
        r1 = run(single_cpu_cluster, jobs, profile, seed=1)
        r2 = run(single_cpu_cluster, jobs, profile, seed=2)
        # FCFS on deterministic workload → same schedule regardless of seed
        assert r1.event_log_hash == r2.event_log_hash


class TestPlacement:
    def test_first_fit(self):
        cluster = Cluster(
            nodes=[
                Node(id=0, name="n0", cpu=4, mem=8),
                Node(id=1, name="n1", cpu=4, mem=8),
            ],
            pooled=PooledResources(),
        )
        from engine.placement import place, PlacementKind
        from engine.model import PlacementKind as PK
        node = place(
            make_job("j0", 0, 5, cpu=2, mem=2),
            cluster.nodes,
            {0: 4, 1: 4},
            {0: 8, 1: 8},
            PK.first,
        )
        assert node == 0   # lowest id

    def test_best_fit(self):
        from engine.placement import place
        from engine.model import PlacementKind as PK
        cluster = Cluster(
            nodes=[
                Node(id=0, name="n0", cpu=8, mem=32),
                Node(id=1, name="n1", cpu=8, mem=8),
            ],
            pooled=PooledResources(),
        )
        # Job needs mem=6; n1 has 8 (leftover 2), n0 has 32 (leftover 26)
        # best fit → n1
        node = place(
            make_job("j0", 0, 5, cpu=1, mem=6),
            cluster.nodes,
            {0: 8, 1: 8},
            {0: 32, 1: 8},
            PK.best,
        )
        assert node == 1

    def test_worst_fit(self):
        from engine.placement import place
        from engine.model import PlacementKind as PK
        cluster = Cluster(
            nodes=[
                Node(id=0, name="n0", cpu=8, mem=32),
                Node(id=1, name="n1", cpu=8, mem=8),
            ],
            pooled=PooledResources(),
        )
        # worst fit → n0 (most leftover after placement)
        node = place(
            make_job("j0", 0, 5, cpu=1, mem=6),
            cluster.nodes,
            {0: 8, 1: 8},
            {0: 32, 1: 8},
            PK.worst,
        )
        assert node == 0

    def test_no_fit_returns_none(self):
        from engine.placement import place
        from engine.model import PlacementKind as PK
        cluster = Cluster(
            nodes=[Node(id=0, name="n0", cpu=1, mem=1)],
            pooled=PooledResources(),
        )
        node = place(
            make_job("j0", 0, 5, cpu=4, mem=4),
            cluster.nodes,
            {0: 1},
            {0: 1},
            PK.first,
        )
        assert node is None


class TestMetrics:
    def test_makespan_and_throughput(self, single_cpu_cluster):
        jobs = [make_job(f"j{i}", 0, 5) for i in range(3)]
        profile = BASE_PROFILE_MAP["long_run_training"]
        result = run(single_cpu_cluster, jobs, profile, seed=0)
        m = result.metrics
        assert m["makespan"] == 15
        assert m["jobs_completed"] == 3
        # throughput in jobs/hour
        assert abs(m["throughput"] - (3 / 15 * 60)) < 0.01
