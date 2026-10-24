"""
tests/test_api_validation.py – Regression tests for API validation and the
calendar-driven run path (custom profile names, calendar validation, unknown
scenarios, use_schedule).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from engine.engine import run
from engine.model import DEFAULT_CLUSTER
from engine.schedule import Schedule
from engine.workloads import generate_workload, workload_from_dict


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _custom(name: str, **overrides) -> dict:
    data = {"name": name, "family": "custom", "scheduler": "SJF", "placement": "best", "banker": "strict"}
    data.update(overrides)
    return {"data": data}


def _msgs(res) -> str:
    return " | ".join(item["msg"] for item in res.json()["detail"])


# ---------------------------------------------------------------------------
# 1.2 custom profile names must be unique
# ---------------------------------------------------------------------------

class TestCustomProfileNames:
    def test_cannot_shadow_builtin_profile(self, client):
        res = client.post("/api/profiles/custom", json=_custom("practical_session"))
        assert res.status_code == 409
        assert "already exists" in res.json()["detail"]

    def test_cannot_shadow_builtin_variant(self, client):
        variant = next(p["name"] for p in client.get("/api/profiles?limit=1000").json() if "[" in p["name"])
        res = client.post("/api/profiles/custom", json=_custom(variant))
        assert res.status_code == 409

    def test_cannot_reuse_custom_name(self, client):
        assert client.post("/api/profiles/custom", json=_custom("dup_check_profile")).status_code == 200
        res = client.post("/api/profiles/custom", json=_custom("dup_check_profile"))
        assert res.status_code == 409

    def test_invalid_profile_returns_readable_422(self, client):
        res = client.post("/api/profiles/custom", json=_custom("bad_rr", scheduler="RR"))
        assert res.status_code == 422
        assert "RR scheduler requires quantum" in _msgs(res)

    def test_saved_custom_profile_is_listed_and_runnable(self, client):
        assert client.post("/api/profiles/custom", json=_custom("runnable_custom")).status_code == 200
        names = [p["name"] for p in client.get("/api/profiles?q=runnable_custom").json()]
        assert names == ["runnable_custom"]
        res = client.post("/api/runs", json={"scenario": "exam_rush", "profile_name": "runnable_custom",
                                             "seed": 1, "n_jobs": 10})
        assert res.status_code == 200
        assert res.json()["metrics"]["total_jobs"] == 10


# ---------------------------------------------------------------------------
# 1.3 calendar validation
# ---------------------------------------------------------------------------

VALID_SCHEDULE = {
    "default_profile_name": "practical_session",
    "slots": [{"day_of_week": 0, "start_minute": 540, "end_minute": 780, "profile_name": "exam_week"}],
    "rules": [{"priority": 10, "cooldown": 5, "profile_name": "node_failure",
               "conditions": [{"field": "nodes_down", "op": ">=", "value": 1}]}],
}


class TestCalendarValidation:
    def test_valid_schedule_round_trips(self, client):
        assert client.put("/api/calendar", json=VALID_SCHEDULE).status_code == 200
        saved = client.get("/api/calendar").json()
        assert saved["slots"][0]["profile_name"] == "exam_week"
        assert saved["rules"][0]["profile_name"] == "node_failure"

    def test_slot_start_after_end_rejected(self, client):
        bad = {**VALID_SCHEDULE, "slots": [{"day_of_week": 2, "start_minute": 900,
                                            "end_minute": 600, "profile_name": "exam_week"}]}
        res = client.put("/api/calendar", json=bad)
        assert res.status_code == 422
        item = res.json()["detail"][0]
        assert item["loc"] == ["slots", 0, "end_minute"]
        assert "15:00 must be before end 10:00" in item["msg"]

    def test_unknown_profiles_rejected(self, client):
        bad = {
            "default_profile_name": "nope_default",
            "slots": [{"day_of_week": 0, "start_minute": 0, "end_minute": 60, "profile_name": "nope_slot"}],
            "rules": [{"priority": 1, "profile_name": "node_failure_recovery",
                       "conditions": [{"field": "nodes_down", "op": ">=", "value": 1}]}],
        }
        res = client.put("/api/calendar", json=bad)
        assert res.status_code == 422
        locs = [tuple(i["loc"]) for i in res.json()["detail"]]
        assert ("default_profile_name",) in locs
        assert ("slots", 0, "profile_name") in locs
        assert ("rules", 0, "profile_name") in locs
        assert "node_failure_recovery" in _msgs(res)

    def test_unknown_condition_field_rejected(self, client):
        bad = {**VALID_SCHEDULE, "rules": [{"priority": 1, "profile_name": "exam_week",
                                            "conditions": [{"field": "gpu_util", "op": ">=", "value": 1}]}]}
        res = client.put("/api/calendar", json=bad)
        assert res.status_code == 422
        assert "gpu_util" in _msgs(res)

    def test_custom_profile_allowed_in_calendar(self, client):
        assert client.post("/api/profiles/custom", json=_custom("calendar_custom")).status_code == 200
        ok = {**VALID_SCHEDULE, "default_profile_name": "calendar_custom"}
        assert client.put("/api/calendar", json=ok).status_code == 200

    def test_rejected_save_keeps_previous_schedule(self, client):
        assert client.put("/api/calendar", json=VALID_SCHEDULE).status_code == 200
        client.put("/api/calendar", json={**VALID_SCHEDULE, "default_profile_name": "missing"})
        assert client.get("/api/calendar").json()["default_profile_name"] == "practical_session"


# ---------------------------------------------------------------------------
# 1.8 unknown scenario; 1.5 use_schedule
# ---------------------------------------------------------------------------

class TestRuns:
    def test_unknown_scenario_is_404(self, client):
        res = client.post("/api/runs", json={"scenario": "bogus", "profile_name": "practical_session"})
        assert res.status_code == 404
        assert "bogus" in res.json()["detail"]

    def test_unknown_profile_is_404(self, client):
        res = client.post("/api/runs", json={"scenario": "exam_rush", "profile_name": "no_such_profile"})
        assert res.status_code == 404

    def test_run_includes_workload_jobs(self, client):
        res = client.post("/api/runs", json={"scenario": "exam_rush", "profile_name": "practical_session",
                                             "seed": 3, "n_jobs": 12})
        body = res.json()
        assert len(body["workload"]["jobs"]) == 12
        assert "max_claim" in body["workload"]["jobs"][0]

    def test_use_schedule_produces_profile_switches(self, client):
        schedule = {
            "default_profile_name": "practical_session",
            "slots": [{"day_of_week": 0, "start_minute": 60, "end_minute": 1440, "profile_name": "exam_week"}],
            "rules": [{"priority": 10, "cooldown": 30, "profile_name": "peak_overload",
                       "conditions": [{"field": "queue_len", "op": ">=", "value": 8}]}],
        }
        assert client.put("/api/calendar", json=schedule).status_code == 200
        res = client.post("/api/runs", json={"scenario": "exam_rush", "use_schedule": True,
                                             "seed": 42, "n_jobs": 50})
        assert res.status_code == 200
        body = res.json()
        assert body["profile_name"] == "calendar_schedule"
        assert body["initial_profile"] == "practical_session"
        switches = [e for e in body["events"] if e["type"] == "PROFILE_SWITCHED"]
        assert switches, "expected the saved schedule to switch profiles"
        assert {"from", "to", "reason"} <= set(switches[0])
        assert {s["to"] for s in switches} & {"exam_week", "peak_overload"}

    def test_use_schedule_is_deterministic(self, client):
        payload = {"scenario": "exam_rush", "use_schedule": True, "seed": 7, "n_jobs": 30}
        a = client.post("/api/runs", json=payload).json()
        b = client.post("/api/runs", json=payload).json()
        assert a["event_log_hash"] == b["event_log_hash"]


class TestScheduleEngine:
    def test_schedule_with_deadline_jobs_runs(self):
        """_build_state used to call a non-existent Job.slack(), crashing every
        scheduled run whose workload had deadlines."""
        jobs = workload_from_dict(generate_workload("exam_rush", n_jobs=40, seed=42))
        assert any(j.deadline is not None for j in jobs)
        schedule = Schedule(rules=[{"priority": 1, "profile_name": "exam_week",
                                    "conditions": [{"field": "min_slack", "op": "<", "value": 30}]}])
        result = run(DEFAULT_CLUSTER, jobs, schedule, seed=42)
        assert result.metrics["total_jobs"] == 40
