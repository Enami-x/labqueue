"""
tests/test_live_runner.py – Regression tests for the live runner (real OS processes).
"""

from __future__ import annotations

import asyncio
import logging
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from engine.model import Cluster, JobKind, Node, PooledResources, Role
from engine.profiles import BASE_PROFILE_MAP, Profile
from live import live_runner as lr
from live.live_runner import LiveConflict, LiveNotFound, LiveRunner

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


def _profile(**kw) -> Profile:
    base = {"name": "t", "family": "test", "scheduler": "FCFS", "placement": "first",
            "banker": "strict", "backfill": False}
    base.update(kw)
    return Profile(**base)


def _one_node(cpu: int = 1, gpu: int = 2) -> Cluster:
    return Cluster(nodes=[Node(id=0, name="solo", cpu=cpu, mem=16)],
                   pooled=PooledResources(gpu=gpu, lic=2, io=2))


async def _wait_until(pred, timeout: float = 15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if pred():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("condition not reached in time")


def _types(runner: LiveRunner, *types: str):
    return [e for e in runner.events if e["type"] in types]


# ---------------------------------------------------------------------------
# 2.1 RR + pooled resources must not wedge the scheduler
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRoundRobinWithPooledResources:
    async def test_gpu_job_resumes_and_both_complete(self, caplog):
        caplog.set_level(logging.ERROR, logger="labqueue.live")
        rr = _profile(name="rr_q1", scheduler="RR", quantum=1, backfill=True)
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=rr, tick_interval=0.05)
        await runner.start()
        try:
            gpu_job = await runner.submit_job(user_id="a", duration=2.5, script_name="sleep_io.py",
                                              pooled_request=PooledResources(gpu=1))
            other = await runner.submit_job(user_id="b", duration=1.0, script_name="sleep_io.py")
            await _wait_until(lambda: len(runner.completed_jobs) == 2, timeout=20)
        finally:
            await runner.stop()

        assert set(runner.completed_jobs) == {gpu_job.id, other.id}
        assert _types(runner, "JOB_PREEMPTED"), "the GPU job should have been preempted at least once"
        assert _types(runner, "JOB_RESUMED"), "and resumed without a second Banker grant"
        assert runner.banker.available == runner.cluster.pooled
        assert not [r for r in caplog.records if "Error in LiveRunner tick" in r.getMessage()]

    async def test_resume_does_not_regrant(self):
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=_profile(scheduler="RR", quantum=1, backfill=True))
        job = await runner.submit_job(duration=5, script_name="sleep_io.py", pooled_request=PooledResources(gpu=1))
        try:
            assert runner._try_start(job, 0)[0]
            assert runner._suspend(job.id, "test")
            # Before the fix, try_grant() was called again for the full claim and raised.
            ok, _ = runner._try_start(job, 1)
            assert ok
            assert runner.banker.allocation[job.id].gpu == 1
            assert runner.banker.available.gpu == 1
        finally:
            runner.executor.cleanup_all()

    async def test_bad_job_does_not_stall_dispatch(self, monkeypatch, caplog):
        caplog.set_level(logging.ERROR, logger="labqueue.live")
        runner = LiveRunner(cluster=_one_node(cpu=4), profile=_profile(scheduler="SJF", backfill=True))
        bad = await runner.submit_job(user_id="bad", duration=1, script_name="sleep_io.py")
        good = await runner.submit_job(user_id="good", duration=1, script_name="sleep_io.py")
        real = runner._try_start

        def flaky(job, now):
            if job.id == bad.id:
                raise RuntimeError("boom")
            return real(job, now)

        monkeypatch.setattr(runner, "_try_start", flaky)
        try:
            runner._dispatch_pass(0)
            assert good.id in runner.running_jobs
            assert runner.job_outcome[bad.id] == "failed"
            assert bad.id not in runner.ready_queue
        finally:
            runner.executor.cleanup_all()


# ---------------------------------------------------------------------------
# 2.2 FIFO ordering
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestOrdering:
    async def _submit_many(self, runner, n=8, **kw):
        return [await runner.submit_job(user_id=f"u{i}", duration=2, script_name="sleep_io.py", **kw)
                for i in range(n)]

    async def test_fcfs_is_submission_order(self):
        runner = LiveRunner(profile=_profile())
        jobs = await self._submit_many(runner)
        assert len({j.arrival for j in jobs}) == 1, "all submitted within the same second"
        assert [j.id for j in runner._ordered_ready(0)] == [j.id for j in jobs]

    async def test_ties_break_by_submission_for_sjf_and_priority(self):
        sjf = LiveRunner(profile=_profile(scheduler="SJF", backfill=True))
        jobs = await self._submit_many(sjf)
        assert [j.id for j in sjf._ordered_ready(0)] == [j.id for j in jobs]

        prio = LiveRunner(profile=BASE_PROFILE_MAP["exam_week"])
        jobs = await self._submit_many(prio)
        assert [j.id for j in prio._ordered_ready(0)] == [j.id for j in jobs]

    async def test_fcfs_dispatches_in_submission_order(self):
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=_profile(), tick_interval=0.05)
        await runner.start()
        try:
            jobs = await self._submit_many(runner, n=4)
            await _wait_until(lambda: len(_types(runner, "JOB_DISPATCHED")) == 4, timeout=30)
        finally:
            await runner.stop()
        assert [e["job_id"] for e in _types(runner, "JOB_DISPATCHED")] == [j.id for j in jobs]

    async def test_rr_requeues_preempted_job_at_tail(self):
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=_profile(scheduler="RR", quantum=1, backfill=True))
        a, b, c = await self._submit_many(runner, n=3)
        try:
            runner._dispatch_pass(0)
            assert a.id in runner.running_jobs
            runner._suspend(a.id, "quantum_expired")
            assert [j.id for j in runner._ordered_ready(0)] == [b.id, c.id, a.id]
        finally:
            runner.executor.cleanup_all()


# ---------------------------------------------------------------------------
# 2.3 killing jobs
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestKill:
    async def test_kill_twice_and_unknown(self):
        runner = LiveRunner(cluster=_one_node(cpu=2), profile=_profile(scheduler="SJF", backfill=True))
        job = await runner.submit_job(duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            assert await runner.kill_job(job.id) == "running"
            with pytest.raises(LiveConflict):
                await runner.kill_job(job.id)
            with pytest.raises(LiveNotFound):
                await runner.kill_job("nope")
            assert runner.failed_jobs == [job.id]
            assert runner.free_cpu[0] == 2
        finally:
            runner.executor.cleanup_all()

    async def test_killing_queued_job_keeps_users_running_count(self):
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=_profile(scheduler="SJF", backfill=True))
        running = await runner.submit_job(user_id="alice", duration=5, script_name="sleep_io.py")
        queued = await runner.submit_job(user_id="alice", duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            assert running.id in runner.running_jobs and queued.id in runner.ready_queue
            assert await runner.kill_job(queued.id) == "queued"
            assert runner.user_running["alice"] == 1
            assert runner.free_cpu[0] == 0
        finally:
            runner.executor.cleanup_all()

    async def test_killing_suspended_job_releases_pooled_only(self):
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=_profile(scheduler="RR", quantum=1, backfill=True))
        job = await runner.submit_job(user_id="bob", duration=5, script_name="sleep_io.py",
                                      pooled_request=PooledResources(gpu=1))
        other = await runner.submit_job(user_id="carol", duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            runner._suspend(job.id, "quantum_expired")
            runner._dispatch_pass(0)
            assert other.id in runner.running_jobs
            assert await runner.kill_job(job.id) == "suspended"
            assert runner.banker.available.gpu == 2
            assert runner.user_running["carol"] == 1 and runner.user_running["bob"] == 0
            assert runner.free_cpu[0] == 0
        finally:
            runner.executor.cleanup_all()


# ---------------------------------------------------------------------------
# 2.4 node fail / restore
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestNodes:
    async def test_restore_healthy_node_is_conflict(self):
        runner = LiveRunner(profile=_profile(scheduler="SJF", backfill=True))
        await runner.submit_job(cpu=4, duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            nid = next(iter(runner.running_jobs.values()))
            free_before = runner.free_cpu[nid]
            with pytest.raises(LiveConflict):
                await runner.restore_node(nid)
            assert runner.free_cpu[nid] == free_before
        finally:
            runner.executor.cleanup_all()

    async def test_unknown_node_is_not_found(self):
        runner = LiveRunner()
        with pytest.raises(LiveNotFound):
            await runner.fail_node(99)
        with pytest.raises(LiveNotFound):
            await runner.restore_node(99)
        assert 99 not in runner.node_up

    async def test_fail_then_restore(self):
        runner = LiveRunner(cluster=_one_node(cpu=2), profile=_profile(scheduler="SJF", backfill=True))
        job = await runner.submit_job(duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            await runner.fail_node(0)
            with pytest.raises(LiveConflict):
                await runner.fail_node(0)
            assert runner.job_outcome[job.id] == "failed"
            await runner.restore_node(0)
            assert runner.free_cpu[0] == 2 and runner.node_up[0]
        finally:
            runner.executor.cleanup_all()


# ---------------------------------------------------------------------------
# 2.5 reset in place; 2.6 bounded event log
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestSession:
    async def test_reset_keeps_subscribers_and_sends_init_state(self):
        runner = LiveRunner(tick_interval=0.05)
        await runner.start()
        q = runner.subscribe()
        try:
            await runner.submit_job(duration=5, script_name="sleep_io.py")
            old_session = runner.session_id
            new_session = await runner.reset()
            assert new_session != old_session and runner.jobs == {}
            msgs = []
            while not q.empty():
                msgs.append(q.get_nowait())
            init = [m for m in msgs if m.get("type") == "INIT_STATE"]
            assert init and init[-1]["data"]["session_id"] == new_session
            # The same queue keeps receiving events from the reset session
            await runner.submit_job(duration=1, script_name="sleep_io.py")
            evt = await asyncio.wait_for(q.get(), timeout=2)
            assert evt.get("type") in ("JOB_SUBMITTED", "STATE_SNAPSHOT")
        finally:
            runner.unsubscribe(q)
            await runner.stop()

    async def test_snapshots_are_not_persisted(self):
        runner = LiveRunner(tick_interval=0.05)
        q = runner.subscribe()
        await runner.start()
        try:
            await asyncio.sleep(2.3)
        finally:
            await runner.stop()
        assert not _types(runner, "STATE_SNAPSHOT")
        streamed = []
        while not q.empty():
            streamed.append(q.get_nowait()["type"])
        assert streamed.count("STATE_SNAPSHOT") >= 2

    async def test_event_log_is_capped(self, monkeypatch):
        runner = LiveRunner()
        for _ in range(lr.MAX_EVENTS + 50):
            runner._emit("TEST")
        assert len(runner.events) == lr.MAX_EVENTS


# ---------------------------------------------------------------------------
# 2.7 priority preemption
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestPriorityPreemption:
    async def test_faculty_preempts_ug(self):
        prio = _profile(scheduler="PRIORITY", preemptive=True, preempt_by=["faculty"], backfill=True,
                        weights={"role": 1.0, "deadline": 0.0, "wait": 0.0, "size": 0.0})
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=prio)
        ug = await runner.submit_job(user_id="s", role=Role.ug, duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            assert ug.id in runner.running_jobs
            fac = await runner.submit_job(user_id="f", role=Role.faculty, duration=5, script_name="sleep_io.py")
            runner._dispatch_pass(1)
            assert fac.id in runner.running_jobs
            assert ug.id in runner.suspended_jobs
            assert _types(runner, "JOB_PREEMPTED")[0]["details"]["reason"] == "preempted_by_higher_priority"
        finally:
            runner.executor.cleanup_all()

    async def test_preempt_by_is_honoured(self):
        prio = _profile(scheduler="PRIORITY", preemptive=True, preempt_by=["exam"], backfill=True,
                        weights={"role": 1.0, "deadline": 0.0, "wait": 0.0, "size": 0.0})
        runner = LiveRunner(cluster=_one_node(cpu=1), profile=prio)
        ug = await runner.submit_job(role=Role.ug, duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            await runner.submit_job(role=Role.faculty, duration=5, script_name="sleep_io.py")
            runner._dispatch_pass(1)
            assert ug.id in runner.running_jobs, "faculty is not in preempt_by"
        finally:
            runner.executor.cleanup_all()

    async def test_head_of_line_blocking_without_backfill(self):
        runner = LiveRunner(cluster=_one_node(cpu=2), profile=_profile(backfill=False))
        big = await runner.submit_job(cpu=2, duration=5, script_name="sleep_io.py")
        await runner.submit_job(cpu=2, duration=5, script_name="sleep_io.py")
        small = await runner.submit_job(cpu=1, duration=5, script_name="sleep_io.py")
        try:
            runner._dispatch_pass(0)
            assert list(runner.running_jobs) == [big.id]
            runner._dispatch_pass(0)
            assert small.id in runner.ready_queue, "FCFS without backfill must not skip the head"
        finally:
            runner.executor.cleanup_all()


# ---------------------------------------------------------------------------
# API: status codes, limits, replayable save (2.3, 2.4, 2.8, 2.9)
# ---------------------------------------------------------------------------

class TestLiveAPIValidation:
    @pytest.fixture(scope="class")
    def client(self):
        with TestClient(app) as c:
            c.post("/api/live/session/restart")
            yield c

    def test_kill_status_codes(self, client):
        assert client.post("/api/live/jobs/does_not_exist/kill").status_code == 404
        jid = client.post("/api/live/jobs", json={"duration": 30, "script_name": "sleep_io.py"}).json()["job_id"]
        assert client.post(f"/api/live/jobs/{jid}/kill").status_code == 200
        assert client.post(f"/api/live/jobs/{jid}/kill").status_code == 409

    def test_node_status_codes(self, client):
        assert client.post("/api/live/nodes/99/fail").status_code == 404
        assert client.post("/api/live/nodes/99/restore").status_code == 404
        assert client.post("/api/live/nodes/3/restore").status_code == 409
        assert client.post("/api/live/nodes/3/fail").status_code == 200
        assert client.post("/api/live/nodes/3/fail").status_code == 409
        assert client.post("/api/live/nodes/3/restore").status_code == 200
        assert len(client.get("/api/live/state").json()["nodes"]) == 6

    def test_submission_limits(self, client):
        limits = client.get("/api/live/limits").json()["limits"]
        assert limits["gpu"]["max"] == 6 and limits["cpu"]["max"] == 16 and limits["duration"]["max"] == 300
        for bad in ({"gpu": 7}, {"lic": 5}, {"io": 6}, {"cpu": 17}, {"mem": 65}, {"duration": 301},
                    {"cpu": 16, "mem": 64, "gpu": -1}):
            assert client.post("/api/live/jobs", json=bad).status_code == 422, bad
        assert client.post("/api/live/rush", json={"count": 21}).status_code == 422
        assert client.post("/api/live/rush", json={"duration": 1000}).status_code == 422

    def test_custom_profile_can_drive_live_mode(self, client):
        client.post("/api/profiles/custom", json={"data": {
            "name": "live_custom_rr", "family": "custom", "scheduler": "RR", "quantum": 2,
            "placement": "best", "banker": "strict"}})
        res = client.post("/api/live/profile", json={"profile_name": "live_custom_rr"})
        assert res.status_code == 200
        assert client.get("/api/live/state").json()["policy"]["quantum"] == 2

    def test_saved_session_is_replayable(self, client):
        client.post("/api/live/session/restart")
        client.post("/api/live/jobs", json={"duration": 0.5, "script_name": "sleep_io.py", "gpu": 1})
        deadline = time.time() + 15
        while time.time() < deadline and client.get("/api/live/state").json()["counts"]["completed"] < 1:
            time.sleep(0.2)
        saved = client.post("/api/live/session/save").json()
        run = client.get(f"/api/runs/{saved['id']}").json()
        types = [e["type"] for e in run["events"]]
        assert {"JOB_ARRIVED", "JOB_STARTED", "PHASE_GRANTED", "JOB_FINISHED"} <= set(types)
        assert all("details" not in e for e in run["events"]), "payloads are flattened like sim events"
        assert run["metrics"]["time_unit"] == "s"
        assert run["metrics"]["jobs_completed"] == 1


# ---------------------------------------------------------------------------
# 2.10 profile listing pages over custom profiles; batch errors are reported
# ---------------------------------------------------------------------------

class TestBackendCleanup:
    @pytest.fixture(scope="class")
    def client(self):
        with TestClient(app) as c:
            yield c

    def test_profile_paging_and_search_cover_custom(self, client):
        client.post("/api/profiles/custom", json={"data": {
            "name": "zz_paging_custom", "family": "custom", "scheduler": "SJF",
            "placement": "best", "banker": "strict"}})
        everything = client.get("/api/profiles").json()
        page = client.get(f"/api/profiles?offset={len(everything) - 1}&limit=5").json()
        assert len(page) == 1
        assert [p["name"] for p in client.get("/api/profiles?q=zz_paging").json()] == ["zz_paging_custom"]
        assert client.get("/api/profiles?q=zz_paging&scheduler=RR").json() == []

    def test_batch_with_bad_filter_reports_error(self, client):
        wid = client.post("/api/workloads/generate", json={"scenario": "exam_rush", "n_jobs": 5}).json()["id"]
        bid = client.post("/api/batch", json={"workload_ids": [wid],
                                              "profile_filter": {"scheduler": "NOT_A_SCHEDULER"}}).json()["batch_id"]
        batch = client.get(f"/api/batch/{bid}").json()
        assert batch["status"] == "error"
        assert "NOT_A_SCHEDULER" in batch["error"]
