"""
tests/test_stage5.py – Stage 5 tests: Workloads, Perf Benchmark, REST API, DB Persistence, Batch.

Spec §8, §10, §13 Stage 5.
"""

from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from engine.model import DEFAULT_CLUSTER
from engine.profiles import BASE_PROFILE_MAP
from engine.workloads import SCENARIOS, generate_workload, workload_from_dict
from engine.engine import run


class TestStage5WorkloadsAndPerf:
    def test_all_scenarios_generate_valid_workload(self):
        for sname in SCENARIOS:
            wl = generate_workload(sname, seed=42)
            assert "jobs" in wl
            assert len(wl["jobs"]) > 0
            jobs = workload_from_dict(wl)
            assert len(jobs) == len(wl["jobs"])
            assert all(j.burst > 0 for j in jobs)

    def test_1000_job_perf_target(self):
        """Spec §6.10: 1000-job scenario runs in < 0.5 s."""
        wl = generate_workload("exam_rush", n_jobs=1000, seed=123)
        jobs = workload_from_dict(wl)
        assert len(jobs) == 1000

        profile = BASE_PROFILE_MAP["practical_session"]
        t0 = time.perf_counter()
        result = run(DEFAULT_CLUSTER, jobs, profile, seed=123, record_events=False)
        duration = time.perf_counter() - t0

        print(f"1000 jobs completed in {duration:.4f} s")
        assert duration < 0.5, f"Expected < 0.5s, got {duration:.4f}s"
        assert result.metrics["jobs_completed"] >= 900


class TestStage5API:
    @pytest.fixture(scope="class")
    def client(self):
        with TestClient(app) as c:
            yield c

    def test_health(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_cluster(self, client):
        res = client.get("/api/cluster")
        assert res.status_code == 200
        data = res.json()
        assert len(data["nodes"]) == 6
        assert data["pooled"]["gpu"] == 6

    def test_profiles_api(self, client):
        # List
        res = client.get("/api/profiles?limit=20")
        assert res.status_code == 200
        profiles = res.json()
        assert len(profiles) > 0

        # Get single
        pname = profiles[0]["name"]
        res_one = client.get(f"/api/profiles/{pname}")
        assert res_one.status_code == 200
        assert res_one.json()["name"] == pname

        # Validate valid
        val_res = client.post("/api/profiles/validate", json={"data": {
            "name": "custom_test",
            "family": "academic",
            "scheduler": "RR",
            "quantum": 4,
            "placement": "first",
            "banker": "lenient",
        }})
        assert val_res.status_code == 200
        assert val_res.json()["valid"] is True

        # Custom create
        create_res = client.post("/api/profiles/custom", json={"data": {
            "name": "my_custom_profile",
            "family": "custom",
            "scheduler": "FCFS",
            "placement": "best",
            "banker": "strict",
        }})
        assert create_res.status_code == 200
        assert create_res.json()["is_custom"] is True

        # Export
        exp_res = client.get("/api/profiles/export/my_custom_profile")
        assert exp_res.status_code == 200
        assert exp_res.json()["name"] == "my_custom_profile"

    def test_workloads_api(self, client):
        # Scenarios list
        s_res = client.get("/api/scenarios")
        assert s_res.status_code == 200
        scenarios = s_res.json()
        assert any(s["name"] == "exam_rush" for s in scenarios)

        # Generate workload
        gen_res = client.post("/api/workloads/generate", json={
            "scenario": "exam_rush",
            "seed": 99,
            "n_jobs": 20,
        })
        assert gen_res.status_code == 200
        data = gen_res.json()
        assert "id" in data
        assert data["scenario"] == "exam_rush"
        assert len(data["jobs"]) == 20

    def test_runs_and_events_api(self, client):
        # Generate workload first
        gen_res = client.post("/api/workloads/generate", json={
            "scenario": "balanced_day",
            "seed": 42,
            "n_jobs": 15,
        })
        wl_id = gen_res.json()["id"]

        # Run with 2 profiles
        run_res = client.post("/api/runs", json={
            "workload_id": wl_id,
            "profile_names": ["practical_session", "exam_week"],
            "seed": 42,
        })
        assert run_res.status_code == 200
        runs = run_res.json()
        assert len(runs) == 2
        run_id = runs[0]["id"]

        # Get run details
        detail_res = client.get(f"/api/runs/{run_id}")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert "metrics" in detail
        assert "avg_wait" in detail["metrics"]

        # Get run events
        events_res = client.get(f"/api/runs/{run_id}/events?limit=50")
        assert events_res.status_code == 200
        ev_data = events_res.json()
        assert len(ev_data["events"]) > 0

    def test_calendar_api(self, client):
        # Get calendar
        get_res = client.get("/api/calendar")
        assert get_res.status_code == 200
        cal = get_res.json()
        assert "slots" in cal
        assert "rules" in cal

        # Update calendar
        put_res = client.put("/api/calendar", json={
            "slots": [
                {"day_of_week": 0, "start_minute": 540, "end_minute": 720, "profile_name": "practical_session"}
            ],
            "rules": [
                {
                    "priority": 5,
                    "profile_name": "peak_overload",
                    "cooldown": 10,
                    "conditions": [{"field": "queue_len", "op": ">=", "value": 15.0}]
                }
            ],
            "default_profile_name": "practical_session"
        })
        assert put_res.status_code == 200
        updated = put_res.json()
        assert len(updated["slots"]) == 1
        assert len(updated["rules"]) == 1
