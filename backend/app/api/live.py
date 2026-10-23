"""
backend/app/api/live.py – REST endpoints for live lab control and monitoring.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from engine.model import JobKind, PooledResources, Role
from engine.profiles import BASE_PROFILES, all_profiles, Profile
from live.live_runner import LiveRunner
from app.db import RunRecord, get_session
from sqlmodel import Session

router = APIRouter(prefix="/api/live", tags=["live"])

# Global LiveRunner instance for the server
_live_runner: Optional[LiveRunner] = None


def get_live_runner() -> LiveRunner:
    global _live_runner
    if _live_runner is None:
        _live_runner = LiveRunner()
    return _live_runner


class JobSubmitRequest(BaseModel):
    user_id: str = "student1"
    role: Role = Role.ug
    kind: JobKind = JobKind.training
    cpu: int = Field(default=1, ge=1, le=16)
    mem: int = Field(default=2, ge=1, le=64)
    duration: float = Field(default=5.0, ge=0.5, le=300.0)
    script_name: str = "cpu_burn.py"
    gpu: int = 0
    lic: int = 0
    io: int = 0


class RushRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=20)
    role: Role = Role.ug
    script_name: str = "matrix_mult.py"
    duration: float = 4.0


class ProfileSwitchRequest(BaseModel):
    profile_name: str


@router.get("/state")
async def get_state(runner: LiveRunner = Depends(get_live_runner)):
    """Fetch current real-time snapshot of the cluster, queues, and resources."""
    return runner.get_full_state()


@router.post("/jobs")
async def submit_job(req: JobSubmitRequest, runner: LiveRunner = Depends(get_live_runner)):
    """Submit a live job for real OS execution."""
    pooled = PooledResources(gpu=req.gpu, lic=req.lic, io=req.io)
    job = await runner.submit_job(
        user_id=req.user_id,
        role=req.role,
        kind=req.kind,
        cpu=req.cpu,
        mem=req.mem,
        duration=req.duration,
        script_name=req.script_name,
        pooled_request=pooled,
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
async def switch_profile(req: ProfileSwitchRequest, runner: LiveRunner = Depends(get_live_runner)):
    """Switch the live scheduler's active profile dynamically."""
    matched = next((p for p in all_profiles() if p.name == req.profile_name), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"Profile '{req.profile_name}' not found")
    await runner.set_profile(matched)
    return {"status": "profile_switched", "profile": matched.name}


@router.post("/nodes/{node_id}/fail")
async def fail_node(node_id: int, runner: LiveRunner = Depends(get_live_runner)):
    """Simulate hardware failure on node."""
    await runner.fail_node(node_id)
    return {"status": "node_failed", "node_id": node_id}


@router.post("/nodes/{node_id}/restore")
async def restore_node(node_id: int, runner: LiveRunner = Depends(get_live_runner)):
    """Restore node after failure."""
    await runner.restore_node(node_id)
    return {"status": "node_restored", "node_id": node_id}


@router.post("/jobs/{job_id}/kill")
async def kill_job(job_id: str, runner: LiveRunner = Depends(get_live_runner)):
    """Kill an active or queued job."""
    await runner.kill_job(job_id, reason="User requested termination")
    return {"status": "job_killed", "job_id": job_id}


@router.post("/session/restart")
async def restart_session(runner: LiveRunner = Depends(get_live_runner)):
    """Reset the live environment with a clean cluster and empty queues."""
    global _live_runner
    if _live_runner:
        await _live_runner.stop()
    _live_runner = LiveRunner()
    await _live_runner.start()
    return {"status": "session_restarted", "session_id": _live_runner.session_id}


@router.post("/session/save")
async def save_session(runner: LiveRunner = Depends(get_live_runner), session: Session = Depends(get_session)):
    """Persist the live session as a RunRecord for playback in the simulator."""
    data = runner.export_session()
    rec = RunRecord(
        run_id=data["session_id"],
        workload_id=0,
        profile_name=data["profile_name"],
        seed=0,
        metrics=json.dumps({
            "total_jobs": data["total_jobs"],
            "completed_jobs": data["completed_jobs"],
            "failed_jobs": data["failed_jobs"],
            "duration": data["duration"],
        }),
        events=json.dumps(data["events"]),
    )
    session.add(rec)
    session.commit()
    return {"status": "saved", "run_id": rec.run_id}
