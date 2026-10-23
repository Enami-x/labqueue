"""
tests/test_stage9.py – Tests for Stage 9: Live Process Execution, Preemption, LiveRunner & API.
"""

import asyncio
import time
import pytest
from fastapi.testclient import TestClient

from engine.model import Role, JobKind, PooledResources
from engine.profiles import BASE_PROFILES
from live.process_executor import ProcessExecutor
from live.live_runner import LiveRunner
from app.main import app


class TestProcessExecutor:
    def test_spawn_suspend_resume_kill(self):
        executor = ProcessExecutor()
        job_id = "test_proc_1"

        # 1. Spawn a cpu_burn job for 10 seconds
        info = executor.spawn(job_id, script_name="cpu_burn.py", duration=10.0)
        assert info.pid > 0
        time.sleep(0.1)

        # 2. Poll should be None (still running)
        rc = executor.poll(job_id)
        assert rc is None

        # 3. Get metrics
        m = executor.get_metrics(job_id)
        assert m["status"] == "running"

        # 4. Suspend process
        ok_suspend = executor.suspend(job_id)
        assert ok_suspend is True
        assert executor.get_metrics(job_id)["status"] == "suspended"

        # 5. Resume process
        ok_resume = executor.resume(job_id)
        assert ok_resume is True
        assert executor.get_metrics(job_id)["status"] == "running"

        # 6. Kill process
        ok_kill = executor.kill(job_id)
        assert ok_kill is True
        assert executor.poll(job_id) is not None

        executor.cleanup_all()


@pytest.mark.asyncio
class TestLiveRunner:
    async def test_live_runner_lifecycle_and_dispatch(self):
        runner = LiveRunner(tick_interval=0.05)
        await runner.start()

        # Submit a short job (0.5s)
        job = await runner.submit_job(
            user_id="alice",
            role=Role.phd,
            kind=JobKind.inference,
            cpu=1,
            mem=2,
            duration=0.5,
            script_name="cpu_burn.py",
        )
        assert job.id in runner.jobs

        # Wait for dispatch and completion (up to 2 seconds)
        for _ in range(30):
            await asyncio.sleep(0.1)
            if job.id in runner.completed_jobs:
                break

        assert job.id in runner.completed_jobs, "Expected job to complete"

        # Check events
        types = [e["type"] for e in runner.events]
        assert "SESSION_STARTED" in types
        assert "JOB_SUBMITTED" in types
        assert "JOB_DISPATCHED" in types
        assert "JOB_COMPLETED" in types

        # Check node failure & restore
        await runner.fail_node(0)
        assert runner.node_up[0] is False
        assert any(e["type"] == "NODE_FAILED" for e in runner.events)

        await runner.restore_node(0)
        assert runner.node_up[0] is True
        assert any(e["type"] == "NODE_RESTORED" for e in runner.events)

        # Switch profile
        sjf_profile = next(p for p in BASE_PROFILES if p.scheduler.value == "SJF")
        await runner.set_profile(sjf_profile)
        assert runner.profile.name == sjf_profile.name

        # State snapshot
        state = runner.get_full_state()
        assert state["counts"]["completed"] >= 1
        assert len(state["nodes"]) == len(runner.cluster.nodes)

        await runner.stop()


class TestLiveAPI:
    def test_live_endpoints(self):
        client = TestClient(app)

        # 1. Get live state
        res = client.get("/api/live/state")
        assert res.status_code == 200
        data = res.json()
        assert "session_id" in data
        assert "nodes" in data
        assert "counts" in data

        # 2. Submit live job
        res = client.post("/api/live/jobs", json={
            "user_id": "bob",
            "role": "ug",
            "kind": "assignment",
            "cpu": 1,
            "mem": 1,
            "duration": 1.0,
            "script_name": "prime_sieve.py",
        })
        assert res.status_code == 200
        jid = res.json()["job_id"]
        assert jid is not None

        # 3. Inject rush
        res = client.post("/api/live/rush", json={
            "count": 3,
            "role": "ug",
            "script_name": "sleep_io.py",
            "duration": 1.0,
        })
        assert res.status_code == 200
        assert len(res.json()["job_ids"]) == 3

        # 4. Profile switch
        res = client.post("/api/live/profile", json={"profile_name": "assignment_crunch"})
        assert res.status_code == 200

        # 5. Fail and restore node
        res = client.post("/api/live/nodes/0/fail")
        assert res.status_code == 200
        res = client.post("/api/live/nodes/0/restore")
        assert res.status_code == 200

        # 6. Kill job
        res = client.post(f"/api/live/jobs/{jid}/kill")
        assert res.status_code == 200

        # 7. Save session
        res = client.post("/api/live/session/save")
        assert res.status_code == 200
        assert "run_id" in res.json()
