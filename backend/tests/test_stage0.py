"""
tests/test_stage0.py – Stage 0: model validation tests.
"""

import pytest
from engine.model import (
    Cluster, Job, JobKind, JobState, Node, Phase, PooledResources, Role,
    DEFAULT_CLUSTER,
)


class TestPooledResources:
    def test_add(self):
        a = PooledResources(gpu=2, lic=1, io=0)
        b = PooledResources(gpu=1, lic=2, io=3)
        c = a + b
        assert c.gpu == 3
        assert c.lic == 3
        assert c.io == 3

    def test_sub(self):
        a = PooledResources(gpu=3, lic=2, io=1)
        b = PooledResources(gpu=1, lic=1, io=1)
        c = a - b
        assert c.gpu == 2
        assert c.lic == 1
        assert c.io == 0

    def test_le(self):
        a = PooledResources(gpu=1, lic=0, io=0)
        b = PooledResources(gpu=2, lic=0, io=0)
        assert a <= b
        assert not b <= a

    def test_is_zero(self):
        assert PooledResources().is_zero()
        assert not PooledResources(gpu=1).is_zero()


class TestNode:
    def test_is_large(self):
        assert Node(id=0, name="big", cpu=16, mem=64).is_large
        assert not Node(id=1, name="small", cpu=8, mem=32).is_large


class TestCluster:
    def test_default_cluster_valid(self):
        c = DEFAULT_CLUSTER
        assert len(c.nodes) == 6
        assert c.pooled.gpu == 6
        assert c.pooled.lic == 4
        assert c.pooled.io == 5

    def test_node_by_id(self):
        c = DEFAULT_CLUSTER
        n = c.node_by_id(0)
        assert n is not None
        assert n.name == "large-0"
        assert c.node_by_id(99) is None

    def test_empty_cluster_raises(self):
        with pytest.raises(Exception):
            Cluster(nodes=[], pooled=PooledResources())


class TestJob:
    def _make_job(self, **kwargs) -> Job:
        defaults = dict(
            id="j0", user_id="u0", role=Role.ug, kind=JobKind.assignment,
            arrival=0, burst=10, cpu=1, mem=1,
        )
        defaults.update(kwargs)
        return Job(**defaults)

    def test_basic_job(self):
        j = self._make_job()
        assert j.state == JobState.queued
        assert j.runtime is not None
        assert j.runtime.remaining == 10

    def test_max_claim_computed_from_phases(self):
        phases = [
            Phase(at=0, request=PooledResources(gpu=2, lic=1, io=0)),
            Phase(at=5, request=PooledResources(gpu=1, lic=0, io=1)),
        ]
        j = self._make_job(phases=phases)
        assert j.max_claim.gpu == 3
        assert j.max_claim.lic == 1
        assert j.max_claim.io == 1

    def test_deadline_miss(self):
        j = self._make_job(deadline=15, burst=5)
        j.runtime.finish = 20
        assert j.missed_deadline()

    def test_no_deadline_no_miss(self):
        j = self._make_job(deadline=None, burst=5)
        j.runtime.finish = 100
        assert not j.missed_deadline()

    def test_hash_and_eq(self):
        j1 = self._make_job(id="j1")
        j2 = self._make_job(id="j1")
        assert j1 == j2
        assert hash(j1) == hash(j2)
        s = {j1, j2}
        assert len(s) == 1


class TestModelRoundTrip:
    def test_cluster_json(self):
        import json
        c = DEFAULT_CLUSTER
        j = c.model_dump_json()
        c2 = Cluster.model_validate_json(j)
        assert c2.pooled.gpu == c.pooled.gpu
        assert len(c2.nodes) == len(c.nodes)
