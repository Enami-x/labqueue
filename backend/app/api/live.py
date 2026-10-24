"""
backend/app/api/live.py – REST endpoints for live lab control and monitoring.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session

from app.api.profiles import resolve_profile
from app.db import RunRecord, get_session
from engine.model import DEFAULT_CLUSTER, JobKind, PooledResources, Role
from live.live_runner import LiveRunner, LiveRunnerError

router = APIRouter(prefix="/api/live", tags=["live"])

# Global LiveRunner instance for the server. It is reset in place, never replaced,
# so WebSocket subscribers always stay attached to the runner that is scheduling.
_live_runner: Optional[LiveRunner] = None


def get_live_runner() -> LiveRunner:
    global _live_runner
    if _live_runner is None:
        _live_runner = LiveRunner()
    return _live_runner


# ---------------------------------------------------------------------------
# Request limits (the frontend reads these from GET /api/live/limits)
# ---------------------------------------------------------------------------

_POOL = DEFAULT_CLUSTER.pooled
LIMITS = {
    "cpu": {"min": 1, "max": max(n.cpu for n in DEFAULT_CLUSTER.nodes)},
    "mem": {"min": 1, "max": max(n.mem for n in DEFAULT_CLUSTER.nodes)},
    "duration": {"min": 0.5, "max": 300.0},
    "gpu": {"min": 0, "max": _POOL.gpu},
    "lic": {"min": 0, "max": _POOL.lic},
    "io": {"min": 0, "max": _POOL.io},
    "rush_count": {"min": 1, "max": 20},
    "rush_duration": {"min": 0.5, "max": 60.0},
}

SCRIPTS = [
    {"name": "cpu_burn.py", "label": "CPU burn (pure arithmetic loop)"},
    {"name": "matrix_mult.py", "label": "Matrix multiplication"},
    {"name": "prime_sieve.py", "label": "Prime sieve (Eratosthenes)"},
    {"name": "hash_files.py", "label": "SHA-256 hashing (CPU + I/O)"},
    {"name": "monte_carlo_pi.py", "label": "Monte Carlo π estimate"},
    {"name": "sleep_io.py", "label": "Sleep / simulated I/O wait"},
]


def _lim(key: str, **extra):
    return Field(ge=LIMITS[key]["min"], le=LIMITS[key]["max"], **extra)


class JobSubmitRequest(BaseModel):
    user_id: str = Field(default="student1", min_length=1, max_length=64)
    role: Role = Role.ug
    kind: JobKind = JobKind.training
    cpu: int = _lim("cpu", default=1)
    mem: int = _lim("mem", default=2)
    duration: float = _lim("duration", default=5.0)
    script_name: str = "cpu_burn.py"
    # Capped at the pool totals: a claim larger than the pool could never be granted.
    gpu: int = _lim("gpu", default=0)
    lic: int = _lim("lic", default=0)
    io: int = _lim("io", default=0)

    @model_validator(mode="after")
    def _fits_some_node(self) -> "JobSubmitRequest":
        if not any(n.cpu >= self.cpu and n.mem >= self.mem for n in DEFAULT_CLUSTER.nodes):
            raise ValueError(f"No node has {self.cpu} vCPU and {self.mem} GB free at once")
        return self


class RushRequest(BaseModel):
    count: int = _lim("rush_count", default=5)
    role: Role = Role.ug
    script_name: str = "matrix_mult.py"
    duration: float = _lim("rush_duration", default=4.0)


class ProfileSwitchRequest(BaseModel):
    profile_name: str


def _http(e: LiveRunnerError) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail=str(e))


@router.get("/limits")
async def get_limits():
    """Bounds for live job submissions, plus the sample scripts that can run."""
    return {"limits": LIMITS, "scripts": SCRIPTS}


@router.get("/state")
async def get_state(runner: LiveRunner = Depends(get_live_runner)):
    """Fetch current real-time snapshot of the cluster, queues, and resources."""
    return runner.get_full_state()


@router.post("/jobs")
async def submit_job(req: JobSubmitRequest, runner: LiveRunner = Depends(get_live_runner)):
    """Submit a live job for real OS execution."""
    job = await runner.submit_job(
        user_id=req.user_id,
        role=req.role,
        kind=req.kind,
        cpu=req.cpu,
        mem=req.mem,
        duration=req.duration,
        script_name=req.script_name,
        pooled_request=PooledResources(gpu=req.gpu, lic=req.lic, io=req.io),
    )
    return {"status": "submitted", "job_id": job.id}


@router.post("/rush")
async def inject_rush(req: RushRequest, runner: LiveRunner = Depends(get_live_runner)):
    """Inject a burst of jobs representing an exam or deadline rush."""
    ids = await runner.inject_rush(
        count=req.count,
        role=req.role,
        script_name=req.script_name,
        duration=req.duration,
    )
    return {"status": "rush_injected", "job_ids": ids}


@router.post("/profile")
async def switch_profile(
    req: ProfileSwitchRequest,
    runner: LiveRunner = Depends(get_live_runner),
    session: Session = Depends(get_session),
):
    """Switch the live scheduler's active profile (built-in or custom)."""
    matched = resolve_profile(req.profile_name, session)
    if not matched:
        raise HTTPException(status_code=404, detail=f"Profile '{req.profile_name}' not found")
    await runner.set_profile(matched)
    return {"status": "profile_switched", "profile": matched.name}


@router.post("/nodes/{node_id}/fail")
async def fail_node(node_id: int, runner: LiveRunner = Depends(get_live_runner)):
    """Simulate hardware failure on a node (404 unknown node, 409 already down)."""
    try:
        await runner.fail_node(node_id)
    except LiveRunnerError as e:
        raise _http(e)
    return {"status": "node_failed", "node_id": node_id}


@router.post("/nodes/{node_id}/restore")
async def restore_node(node_id: int, runner: LiveRunner = Depends(get_live_runner)):
    """Restore a failed node (404 unknown node, 409 node is not down)."""
    try:
        await runner.restore_node(node_id)
    except LiveRunnerError as e:
        raise _http(e)
    return {"status": "node_restored", "node_id": node_id}


@router.post("/jobs/{job_id}/kill")
async def kill_job(job_id: str, runner: LiveRunner = Depends(get_live_runner)):
    """Kill a running, suspended or queued job (404 unknown, 409 already finished)."""
    try:
        previous = await runner.kill_job(job_id, reason="User requested termination")
    except LiveRunnerError as e:
        raise _http(e)
    return {"status": "job_killed", "job_id": job_id, "previous_state": previous}


@router.post("/session/restart")
async def restart_session(runner: LiveRunner = Depends(get_live_runner)):
    """Kill all jobs and start a clean session. Open WebSockets keep streaming."""
    session_id = await runner.reset()
    return {"status": "session_restarted", "session_id": session_id}


@router.post("/session/save")
async def save_session(runner: LiveRunner = Depends(get_live_runner), session: Session = Depends(get_session)):
    """Persist the live session as a replayable run (GET /api/runs/{id})."""
    data = runner.export_replay()
    rec = RunRecord(
        run_id=data["session_id"],
        workload_id=0,
        profile_name=f"live:{data['profile_name']}",
        seed=0,
        metrics=json.dumps(data["metrics"]),
        events=json.dumps(data["events"]),
    )
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return {"status": "saved", "run_id": rec.run_id, "id": rec.id}
