"""
tests/conftest.py – Shared fixtures for pytest.
"""

import os
import tempfile
from pathlib import Path

# Point the app at a throwaway SQLite file *before* app.db is imported, so tests
# never touch (or depend on) the developer's labqueue.db.
_TEST_DB = Path(tempfile.mkdtemp(prefix="labqueue_test_")) / "test.db"
os.environ["LABQUEUE_DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"

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


@pytest.fixture(scope="session", autouse=True)
def _init_test_db():
    """Create tables up front: some tests use TestClient(app) without running startup."""
    from app.db import init_db
    init_db()
