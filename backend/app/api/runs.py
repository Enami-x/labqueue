"""
app/api/runs.py – Run and batch endpoints.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.calendar import load_saved_schedule
from app.api.profiles import resolve_profile
from app.db import BatchRecord, RunRecord, WorkloadRecord, get_session
from engine.engine import run as engine_run
from engine.model import DEFAULT_CLUSTER, Cluster
from engine.profiles import all_profiles
from engine.schedule import Schedule
from engine.workloads import SCENARIOS, generate_workload, workload_from_dict

router = APIRouter(prefix="/api", tags=["runs"])
logger = logging.getLogger("labqueue.runs")

# Profile name recorded for runs driven by the saved calendar schedule.
SCHEDULE_RUN_NAME = "calendar_schedule"


def _load_workload(session: Session, workload_id: int):
    rec = session.get(WorkloadRecord, workload_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Workload not found")
    return json.loads(rec.data)


def _workload_summary(wl_data: dict) -> dict:
    """The declared jobs (incl. phases / max_claim) and node events of a workload."""
    return {
        "scenario": wl_data.get("scenario"),
        "seed": wl_data.get("seed"),
        "jobs": wl_data.get("jobs", []),
        "node_events": wl_data.get("node_events", []),
    }


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    workload_id: Optional[int] = None
    scenario: Optional[str] = None
    profile_names: Optional[List[str]] = None
    profile_name: Optional[str] = None
    seed: int = 0
    cluster: Optional[Dict[str, Any]] = None  # if None, use default
    n_jobs: Optional[int] = None
    # Drive the run with the saved calendar schedule (slots + reactive rules)
    # instead of a single fixed profile.
    use_schedule: bool = False


@router.post("/runs")
def create_runs(req: RunRequest, session: Session = Depends(get_session)):
    is_single_profile = bool(req.use_schedule or (req.profile_name and not req.profile_names))

    if req.workload_id is not None:
        wl_data = _load_workload(session, req.workload_id)
        effective_wid = req.workload_id
    elif req.scenario:
        if req.scenario not in SCENARIOS:
            raise HTTPException(
                status_code=404,
                detail=f"Scenario '{req.scenario}' not found. Available: {', '.join(SCENARIOS)}",
            )
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
    node_events = wl_data.get("node_events") or None

    cluster = DEFAULT_CLUSTER
    if req.cluster:
        cluster = Cluster.model_validate(req.cluster)

    # (label, Profile | Schedule) pairs to run
    targets: List[tuple] = []
    if req.use_schedule:
        schedule = load_saved_schedule(session)
        if schedule is None:
            raise HTTPException(status_code=404, detail="No calendar schedule has been saved yet")
        targets.append((SCHEDULE_RUN_NAME, schedule))
    else:
        names = [req.profile_name] if req.profile_name else (req.profile_names or [])
        for pname in names or ["practical_session"]:
            profile = resolve_profile(pname, session)
            if profile is None:
                raise HTTPException(status_code=404, detail=f"Profile '{pname}' not found")
            targets.append((pname, profile))

    results = []
    for label, policy in targets:
        try:
            result = engine_run(
                cluster, jobs, policy, seed=req.seed, node_events=node_events,
                resolve_profile=lambda n: resolve_profile(n, session),
            )
        except Exception as e:
            # Known engine defect on some profile/workload combinations (see README,
            # "Known issues"); report it instead of an opaque 500.
            logger.exception("Simulation engine failed for %s", label)
            raise HTTPException(
                status_code=500,
                detail=f"The simulation engine failed running '{label}' on this workload ({e}). "
                       "Try another profile or seed.",
            )
        run_rec = RunRecord(
            run_id=result.run_id,
            workload_id=effective_wid,
            profile_name=label,
            seed=req.seed,
            metrics=json.dumps(result.metrics),
            event_log_hash=result.event_log_hash,
            events=json.dumps(result.events),
        )
        session.add(run_rec)
        session.commit()
        session.refresh(run_rec)
        out = {
            "id": run_rec.id,
            "run_id": result.run_id,
            "profile_name": label,
            "seed": req.seed,
            "metrics": result.metrics,
            "event_log_hash": result.event_log_hash,
            "events": result.events,
            "workload": _workload_summary(wl_data),
        }
        if isinstance(policy, Schedule):
            out["initial_profile"] = policy.active_profile_name(0, {}, {}, 0)[0]
        results.append(out)

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
    wl_rec = session.get(WorkloadRecord, rec.workload_id) if rec.workload_id else None
    return {
        "workload": _workload_summary(json.loads(wl_rec.data)) if wl_rec else None,
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
    try:
        _run_batch_inner(batch_id, workload_ids, profile_filter, seed)
    except Exception as e:  # e.g. a bad filter value: don't leave the batch "pending"
        from app.db import engine as db_engine
        with Session(db_engine) as session:
            br = session.get(BatchRecord, batch_id)
            if br:
                br.status = "error"
                br.error = f"{type(e).__name__}: {e}"
                session.commit()


def _run_batch_inner(batch_id: int, workload_ids: List[int], profile_filter: dict, seed: int):
    from app.db import engine as db_engine
    from engine.model import BankerMode, PlacementKind, SchedulerKind
    from engine.profiles import filter_profiles

    profiles = all_profiles()
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
        jobs = workload_from_dict(wl_data)
        node_events = wl_data.get("node_events") or None
        for profile in profiles:
            try:
                result = engine_run(DEFAULT_CLUSTER, jobs, profile, seed=seed,
                                    record_events=False, node_events=node_events)
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
        "error": rec.error or None,
        "progress": rec.progress,
        "total": rec.total,
        "matrix": json.loads(rec.matrix),
    }
