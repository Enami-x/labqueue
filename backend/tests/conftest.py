"""
tests/conftest.py – Shared fixtures for pytest.
"""

import pytest
from engine.model import Cluster, Node, PooledResources

@pytest.fixture
def single_node_cluster():
    """1 node, 1 CPU, 999 GB mem (so placement never blocks in textbook tests)."""
    return Cluster(
        nodes=[Node(id=0, name="n0", cpu=1, mem=999)],
        pooled=PooledResources(gpu=0, lic=0, io=0),
    )

@pytest.fixture
def default_cluster():
    from engine.model import DEFAULT_CLUSTER
    return DEFAULT_CLUSTER
