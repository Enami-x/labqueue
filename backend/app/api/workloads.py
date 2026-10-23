"""
app/api/workloads.py – Scenario and workload endpoints.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import WorkloadRecord, get_session
from engine.workloads import SCENARIOS, generate_workload, workload_to_dict, workload_from_dict

router = APIRouter(tags=["workloads"])


@router.get("/api/scenarios")
def list_scenarios():
    return [
        {"name": name, "description": cfg["description"], "duration": cfg["duration"]}
        for name, cfg in SCENARIOS.items()
    ]


@router.get("/api/workloads/scenarios")
def list_workload_scenarios():
    return list(SCENARIOS.keys())


class GenerateRequest(BaseModel):
    scenario: str
    n_jobs: Optional[int] = None
    seed: int = 42
    params: Dict[str, Any] = {}


@router.post("/api/workloads/generate")
def generate(req: GenerateRequest, session: Session = Depends(get_session)):
    if req.scenario not in SCENARIOS:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario}' not found")
    wl = generate_workload(req.scenario, n_jobs=req.n_jobs, seed=req.seed,
                           extra_params=req.params or None)
    rec = WorkloadRecord(
        scenario=req.scenario, seed=req.seed, data=json.dumps(wl)
    )
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return {"id": rec.id, "workload_id": rec.id, **wl}


@router.post("/api/workloads/import")
async def import_workload(file: UploadFile, session: Session = Depends(get_session)):
    content = await file.read()
    try:
        wl = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    rec = WorkloadRecord(
        scenario=wl.get("scenario", "imported"),
        seed=wl.get("seed", 0),
        data=json.dumps(wl),
    )
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return {"workload_id": rec.id, **wl}


@router.get("/api/workloads/{wid}")
def get_workload(wid: int, session: Session = Depends(get_session)):
    rec = session.get(WorkloadRecord, wid)
    if not rec:
        raise HTTPException(status_code=404, detail="Workload not found")
    return json.loads(rec.data)
