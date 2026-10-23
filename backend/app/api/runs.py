"""
app/api/runs.py – Run and batch endpoints.
"""

from __future__ import annotations

import json
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import BatchRecord, RunRecord, WorkloadRecord, get_session
from engine.engine import run as engine_run
from engine.model import DEFAULT_CLUSTER, Cluster
from engine.profiles import Profile, all_profiles, BASE_PROFILE_MAP
from engine.workloads import workload_from_dict

router = APIRouter(prefix="/api", tags=["runs"])


def _load_workload(session: Session, workload_id: int):
    rec = session.get(WorkloadRecord, workload_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Workload not found")
    return json.loads(rec.data)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

from engine.workloads import SCENARIOS, generate_workload, workload_from_dict


class RunRequest(BaseModel):
    workload_id: Optional[int] = None
    scenario: Optional[str] = None
    profile_names: Optional[List[str]] = None
    profile_name: Optional[str] = None
    seed: int = 0
    cluster: Optional[Dict[str, Any]] = None  # if None, use default
    n_jobs: Optional[int] = None


@router.post("/runs")
def create_runs(req: RunRequest, session: Session = Depends(get_session)):
    is_single_profile = bool(req.profile_name and not req.profile_names)
    target_profile_names = [req.profile_name] if req.profile_name else (req.profile_names or [])

    if not target_profile_names:
        target_profile_names = ["practical_session"]

    if req.workload_id is not None:
        wl_data = _load_workload(session, req.workload_id)
        effective_wid = req.workload_id
    elif req.scenario:
        wl_data = generate_workload(req.scenario, n_jobs=req.n_jobs or 50, seed=req.seed)
        rec = WorkloadRecord(scenario=req.scenario, seed=req.seed, data=json.dumps(wl_data))
        session.add(rec)
        session.commit()
        session.refresh(rec)
        effective_wid = rec.id
    else:
        # Default scenario
        wl_data = generate_workload("exam_rush", n_jobs=req.n_jobs or 50, seed=req.seed)
        effective_wid = 0

    jobs = workload_from_dict(wl_data)

    cluster = DEFAULT_CLUSTER
    if req.cluster:
        cluster = Cluster.model_validate(req.cluster)

    results = []
    for pname in target_profile_names:
        # Find profile
        profile = None
        for p in all_profiles():
            if p.name == pname:
                profile = p
                break
        if profile is None:
            from app.db import ProfileRecord
            rec = session.exec(select(ProfileRecord).where(ProfileRecord.name == pname)).first()
            if rec:
                profile = Profile.from_json(rec.data)
        if profile is None:
            raise HTTPException(status_code=404, detail=f"Profile '{pname}' not found")

        result = engine_run(cluster, jobs, profile, seed=req.seed)
        run_rec = RunRecord(
            run_id=result.run_id,
            workload_id=effective_wid,
            profile_name=pname,
            seed=req.seed,
            metrics=json.dumps(result.metrics),
            event_log_hash=result.event_log_hash,
            events=json.dumps(result.events),
        )
        session.add(run_rec)
        session.commit()
        session.refresh(run_rec)
        results.append({
            "id": run_rec.id,
            "run_id": result.run_id,
            "profile_name": pname,
            "seed": req.seed,
            "metrics": result.metrics,
            "event_log_hash": result.event_log_hash,
            "events": result.events,
        })

    if is_single_profile and results:
        return results[0]
    return results


def _find_run_record(session: Session, run_id: str) -> Optional[RunRecord]:
    if run_id.isdigit():
        rec = session.get(RunRecord, int(run_id))
        if rec:
            return rec
    return session.exec(select(RunRecord).where(RunRecord.run_id == run_id)).first()


@router.get("/runs/{run_id}")
def get_run(run_id: str, session: Session = Depends(get_session)):
    rec = _find_run_record(session, run_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": rec.id,
        "run_id": rec.run_id,
        "profile_name": rec.profile_name,
        "seed": rec.seed,
        "workload_id": rec.workload_id,
        "metrics": json.loads(rec.metrics),
        "event_log_hash": rec.event_log_hash,
        "events": json.loads(rec.events) if rec.events else [],
    }


@router.get("/runs/{run_id}/events")
def get_run_events(
    run_id: str,
    from_seq: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=5000),
    session: Session = Depends(get_session),
):
    rec = _find_run_record(session, run_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Run not found")
    events = json.loads(rec.events) if rec.events else []
    sliced = [e for e in events if e.get("seq", 0) >= from_seq][:limit]
    return {"events": sliced, "total": len(events)}


# ---------------------------------------------------------------------------
# Batch
# ---------------------------------------------------------------------------

def _run_one(wl_data: dict, profile_json: str, seed: int) -> dict:
    """Worker function for ProcessPoolExecutor."""
    jobs = workload_from_dict(wl_data)
    profile = Profile.from_json(profile_json)
    result = engine_run(DEFAULT_CLUSTER, jobs, profile, seed=seed, record_events=False)
    return {"profile": profile.name, "metrics": result.metrics}


class BatchRequest(BaseModel):
    workload_ids: List[int]
    profile_filter: Dict[str, Any] = {}
    seed: int = 0


@router.post("/batch")
def create_batch(
    req: BatchRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    batch_rec = BatchRecord(
        status="pending",
        scenario_ids=json.dumps(req.workload_ids),
        profile_filter=json.dumps(req.profile_filter),
        total=0,
    )
    session.add(batch_rec)
    session.commit()
    session.refresh(batch_rec)
    batch_id = batch_rec.id

    background_tasks.add_task(_run_batch, batch_id, req.workload_ids, req.profile_filter, req.seed)
    return {"batch_id": batch_id, "status": "pending"}


def _run_batch(batch_id: int, workload_ids: List[int], profile_filter: dict, seed: int):
    from sqlmodel import Session
    from app.db import engine as db_engine

    profiles = all_profiles()
    # Apply filter
    from engine.model import SchedulerKind, PlacementKind, BankerMode
    from engine.profiles import filter_profiles
    fam = profile_filter.get("family")
    sch = SchedulerKind(profile_filter["scheduler"]) if "scheduler" in profile_filter else None
    pla = PlacementKind(profile_filter["placement"]) if "placement" in profile_filter else None
    ban = BankerMode(profile_filter["banker"]) if "banker" in profile_filter else None
    profiles = filter_profiles(profiles, family=fam, scheduler=sch, placement=pla, banker=ban)

    with Session(db_engine) as session:
        workloads = []
        for wid in workload_ids:
            rec = session.get(WorkloadRecord, wid)
            if rec:
                workloads.append((wid, json.loads(rec.data)))

        total = len(profiles) * len(workloads)
        batch_rec = session.get(BatchRecord, batch_id)
        batch_rec.status = "running"
        batch_rec.total = total
        session.commit()

    matrix: Dict[str, Dict[str, Any]] = {}
    done = 0

    for wid, wl_data in workloads:
        wl_key = str(wid)
        matrix[wl_key] = {}
        for profile in profiles:
            try:
                jobs = workload_from_dict(wl_data)
                result = engine_run(DEFAULT_CLUSTER, jobs, profile, seed=seed, record_events=False)
                matrix[wl_key][profile.name] = result.metrics
            except Exception as e:
                matrix[wl_key][profile.name] = {"error": str(e)}
            done += 1

        with Session(db_engine) as session:
            br = session.get(BatchRecord, batch_id)
            if br:
                br.progress = done
                br.matrix = json.dumps(matrix)
                session.commit()

    with Session(db_engine) as session:
        br = session.get(BatchRecord, batch_id)
        if br:
            br.status = "done"
            br.matrix = json.dumps(matrix)
            session.commit()


@router.get("/batch/{batch_id}")
def get_batch(batch_id: int, session: Session = Depends(get_session)):
    rec = session.get(BatchRecord, batch_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {
        "id": rec.id,
        "status": rec.status,
        "progress": rec.progress,
        "total": rec.total,
        "matrix": json.loads(rec.matrix),
    }
